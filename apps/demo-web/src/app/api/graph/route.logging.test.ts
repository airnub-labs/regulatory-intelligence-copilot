import { Writable } from 'node:stream';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capturedLogs: Array<Record<string, unknown>> = [];

vi.mock('@reg-copilot/reg-intel-observability', async () => {
  const actual = await vi.importActual<typeof import('@reg-copilot/reg-intel-observability')>(
    '@reg-copilot/reg-intel-observability'
  );
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      try {
        capturedLogs.push(JSON.parse(chunk.toString()));
      } catch (error) {
        // Ignore non-JSON logs
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
  createGraphClient: () => ({
    getRulesForProfileAndJurisdiction: vi.fn(async () => ({ nodes: [], edges: [] })),
    getCrossBorderSlice: vi.fn(async () => ({ nodes: [], edges: [] })),
    executeCypher: vi.fn(async () => []),
  }),
  hasActiveSandbox: () => true,
  getMcpGatewayUrl: () => 'https://gateway.test',
  normalizeProfileType: (value: unknown) => value ?? 'default-profile',
}));

import { requestContext } from '@reg-copilot/reg-intel-observability';

let provider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;
let exporter: InMemorySpanExporter;

describe('graph snapshot route logging', () => {
  beforeEach(() => {
    capturedLogs.length = 0;
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

  it('emits trace metadata for graph snapshot requests', async () => {
    const tracer = trace.getTracer('graph-route-log-test');

    await tracer.startActiveSpan('graph-route-span', async (span) => {
      await requestContext.run(
        { tenantId: 'tenant-graph', conversationId: 'conversation-graph' },
        async () => {
          const { GET } = await import('./route');
          await GET(
            new Request(
              'http://localhost/api/graph?jurisdictions=IE&profileType=single-director&keyword=test'
            )
          );
        }
      );
      span.end();
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const logEntry = capturedLogs.find((entry) => entry.scope === 'GraphApiRoute');

    expect(logEntry?.trace_id).toBeDefined();
    expect(logEntry?.span_id).toBeDefined();
    expect(logEntry?.tenantId).toBe('tenant-graph');
    expect(logEntry?.conversationId).toBe('conversation-graph');
    expect(logEntry?.jurisdictions).toEqual(['IE']);
  });
});
