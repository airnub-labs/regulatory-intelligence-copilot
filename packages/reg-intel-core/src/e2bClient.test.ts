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

vi.mock('@e2b/code-interpreter', () => {
  class FakeSandbox {
    constructor(public sandboxId: string) {}

    static create = vi.fn(async () => new FakeSandbox('sandbox-123'));

    getMcpUrl = vi.fn(() => 'https://mcp.local');
    getMcpToken = vi.fn(async () => 'token-abc');
    files = { write: vi.fn(async () => undefined) };
    commands = { run: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })) };
    kill = vi.fn(async () => undefined);
  }

  return { Sandbox: FakeSandbox };
});

import { requestContext } from '@reg-copilot/reg-intel-observability';
import { createSandbox } from './e2bClient.js';

let provider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;
let exporter: InMemorySpanExporter;

describe('E2B sandbox client logging', () => {
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

  it('emits trace metadata when creating sandboxes', async () => {
    const tracer = trace.getTracer('e2b-log-test');

    await tracer.startActiveSpan('e2b-span', async (span) => {
      await requestContext.run({ tenantId: 'tenant-e2b', conversationId: 'conversation-e2b' }, async () => {
        await createSandbox();
      });
      span.end();
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const logEntry = capturedLogs.find(entry => entry.scope === 'E2BSandboxClient');

    expect(logEntry?.trace_id).toBeDefined();
    expect(logEntry?.span_id).toBeDefined();
    expect(logEntry?.tenantId).toBe('tenant-e2b');
    expect(logEntry?.conversationId).toBe('conversation-e2b');
  });
});
