import { Writable } from 'node:stream';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capturedLogs: Array<Record<string, unknown>> = [];
const capturedCallbacks: {
  queryGraphByFilter?: (filter: unknown) => Promise<unknown>;
  queryGraphByTimestamp?: (filter: unknown, since: Date) => Promise<unknown>;
} = {};

vi.mock('@reg-copilot/reg-intel-observability', async () => {
  const actual = await vi.importActual<typeof import('@reg-copilot/reg-intel-observability')>(
    '@reg-copilot/reg-intel-observability'
  );
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      try {
        capturedLogs.push(JSON.parse(chunk.toString()));
      } catch (error) {
        void error;
      }
      callback();
    },
  });

  return {
    ...actual,
    createLogger: (scope: string, bindings?: Record<string, unknown>) =>
      actual.createLogger(scope, { ...bindings, destination }),
  };
});

vi.mock('@reg-copilot/reg-intel-core', () => ({
  createGraphChangeDetector: (
    queryGraphByFilter: (filter: unknown) => Promise<unknown>,
    _config?: unknown,
    queryGraphByTimestamp?: (filter: unknown, since: Date) => Promise<unknown>
  ) => {
    capturedCallbacks.queryGraphByFilter = queryGraphByFilter;
    capturedCallbacks.queryGraphByTimestamp = queryGraphByTimestamp;
    return {
      start: vi.fn(),
      stop: vi.fn(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    };
  },
  createGraphClient: () => ({
    getRulesForProfileAndJurisdiction: vi.fn(async () => ({ nodes: [], edges: [] })),
    getCrossBorderSlice: vi.fn(async () => ({ nodes: [], edges: [] })),
    executeCypher: vi.fn(async () => []),
  }),
  normalizeProfileType: (value: unknown) => value ?? 'default-profile',
}));

import { requestContext } from '@reg-copilot/reg-intel-observability';

let provider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;
let exporter: InMemorySpanExporter;

describe('graph change detector logging', () => {
  beforeEach(() => {
    capturedLogs.length = 0;
    capturedCallbacks.queryGraphByFilter = undefined;
    capturedCallbacks.queryGraphByTimestamp = undefined;
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    contextManager = new AsyncLocalStorageContextManager().enable();
    provider.register({ contextManager });
  });

  afterEach(async () => {
    await provider.shutdown();
    contextManager.disable();
    exporter.reset();
  });

  it('binds trace metadata to detector lifecycle and queries', async () => {
    const tracer = trace.getTracer('graph-detector-log-test');

    await tracer.startActiveSpan('graph-detector-span', async (span) => {
      await requestContext.run(
        { tenantId: 'tenant-detector', conversationId: 'conversation-detector' },
        async () => {
          const { getGraphChangeDetector } = await import('./graphChangeDetectorInstance');
          const detector = getGraphChangeDetector({ pollIntervalMs: 1000 });

          await capturedCallbacks.queryGraphByFilter?.({ jurisdictions: ['IE'], profileType: 'single-director' });
          await capturedCallbacks.queryGraphByTimestamp?.(
            { jurisdictions: ['IE'], profileType: 'single-director' },
            new Date('2024-01-01T00:00:00Z')
          );

          detector.stop();
        }
      );
      span.end();
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const logEntry = capturedLogs.find((entry) => entry.scope === 'GraphChangeDetectorInstance');

    expect(logEntry?.trace_id).toBeDefined();
    expect(logEntry?.span_id).toBeDefined();
    expect(logEntry?.tenantId).toBe('tenant-detector');
    expect(logEntry?.conversationId).toBe('conversation-detector');
  });
});
