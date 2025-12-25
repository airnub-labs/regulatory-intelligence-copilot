import { Writable } from 'node:stream';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

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

vi.mock('../mcpClient.js', () => ({
  callMemgraphMcp: vi.fn().mockResolvedValue([]),
}));

vi.mock('../sandboxManager.js', () => ({
  ensureMcpGatewayConfigured: vi.fn().mockResolvedValue(undefined),
}));

import { requestContext } from '@reg-copilot/reg-intel-observability';
import { createGraphClient } from './graphClient.js';

let provider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;
let exporter: InMemorySpanExporter;

describe('GraphClient logging', () => {
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

  it('adds trace metadata to graph queries', async () => {
    const client = createGraphClient();
    const tracer = trace.getTracer('graph-client-log-test');

    await tracer.startActiveSpan('graph-client-span', async (span) => {
      await requestContext.run({ tenantId: 'tenant-graph', conversationId: 'conversation-graph' }, async () => {
        await client.getRulesForProfileAndJurisdiction('profile-1', 'IE');
      });
      span.end();
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const logEntry = capturedLogs.find(entry => entry.scope === 'GraphClient');

    expect(logEntry?.trace_id).toBeDefined();
    expect(logEntry?.span_id).toBeDefined();
    expect(logEntry?.tenantId).toBe('tenant-graph');
    expect(logEntry?.conversationId).toBe('conversation-graph');
  });
});
