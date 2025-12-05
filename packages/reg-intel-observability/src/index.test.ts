import { Writable } from 'node:stream';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLogger,
  formatPayloadForLog,
  requestContext,
  withSpan,
} from './index.js';

let provider: BasicTracerProvider;
let exporter: InMemorySpanExporter;
let contextManager: AsyncLocalStorageContextManager;
let originalLogLevel: string | undefined;
let originalSafePayloads: string | undefined;

describe('observability helpers', () => {
  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    contextManager = new AsyncLocalStorageContextManager().enable();
    provider.register({ contextManager });
    originalLogLevel = process.env.LOG_LEVEL;
    originalSafePayloads = process.env.LOG_SAFE_PAYLOADS;
  });

  afterEach(async () => {
    await provider.shutdown();
    contextManager.disable();
    exporter.reset();
    process.env.LOG_LEVEL = originalLogLevel;
    process.env.LOG_SAFE_PAYLOADS = originalSafePayloads;
  });

  it('enriches logs with active span data and request context', async () => {
    const messages: Array<Record<string, unknown>> = [];

    const destination = new Writable({
      write(chunk, _encoding, callback) {
        messages.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    await trace.getTracer('test-logger').startActiveSpan('log-span', async (span) => {
      requestContext.run({ tenantId: 'tenant-123' }, () => {
        const logger = createLogger('log-scope', { component: 'unit-test', destination });
        logger.info('hello');
      });
      span.end();
    });

    expect(messages[0].trace_id).toBeDefined();
    expect(messages[0].span_id).toBeDefined();
    expect(messages[0].component).toBe('unit-test');
    expect(messages[0].tenantId).toBe('tenant-123');
    expect(messages[0].timestamp).toBeDefined();
  });

  it('respects LOG_LEVEL filtering', () => {
    const messages: Array<Record<string, unknown>> = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        messages.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    process.env.LOG_LEVEL = 'error';
    const logger = createLogger('log-scope', { destination });

    logger.info('info message should be filtered');
    logger.error('error message should be logged');

    expect(messages).toHaveLength(1);
    expect(messages[0].level).toBe('error');
  });

  it('redacts payload previews unless LOG_SAFE_PAYLOADS is enabled', () => {
    const sensitivePayload = 'password: hunter2';

    process.env.LOG_SAFE_PAYLOADS = 'false';
    const redacted = formatPayloadForLog(sensitivePayload);
    expect(redacted.payloadPreview).toBeUndefined();
    expect(redacted.payloadHash).toHaveLength(64);

    process.env.LOG_SAFE_PAYLOADS = 'true';
    const safe = formatPayloadForLog(sensitivePayload);
    expect(safe.payloadHash).toHaveLength(64);
    expect(safe.payloadPreview).toBe('password: [REDACTED]');
  });

  it('propagates errors through withSpan while marking span failure', async () => {
    await expect(
      withSpan('failing-span', {}, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('preserves request context across async boundaries by default', async () => {
    let capturedContext: Record<string, unknown> = {};
    let activeSpanTraceId: string | undefined;

    await requestContext.run({ tenantId: 'tenant-456', userId: 'user-999' }, async () => {
      await withSpan('context-span', {}, async () => {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            capturedContext = requestContext.get();
            activeSpanTraceId = trace.getActiveSpan()?.spanContext().traceId;
            resolve();
          }, 0);
        });
      });
    });

    expect(capturedContext).toMatchObject({ tenantId: 'tenant-456', userId: 'user-999' });
    expect(activeSpanTraceId).toBeDefined();
  });
});
