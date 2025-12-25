import { Writable } from 'node:stream';
import {
  Context,
  ContextManager,
  ROOT_CONTEXT,
  Span,
  SpanContext,
  SpanOptions,
  SpanStatus,
  SpanStatusCode,
  Tracer,
  TracerProvider,
  context,
  trace,
} from '@opentelemetry/api';
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
      } catch {
        // ignore
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

import { requestContext } from '@reg-copilot/reg-intel-observability';
import { configureMcpGateway, mcpCall } from './mcpClient.js';

class StackContextManager implements ContextManager {
  private stack: Context[] = [ROOT_CONTEXT];

  active(): Context {
    return this.stack[this.stack.length - 1];
  }

  with<T extends (...args: unknown[]) => ReturnType<T>>(
    contextValue: Context,
    fn: T,
    thisArg?: ThisParameterType<T>,
    ...args: Parameters<T>
  ): ReturnType<T> {
    this.stack.push(contextValue);
    try {
      return fn.apply(thisArg, args);
    } finally {
      this.stack.pop();
    }
  }

  bind<T>(target: T): T {
    return target;
  }

  enable(): this {
    return this;
  }

  disable(): this {
    this.stack = [ROOT_CONTEXT];
    return this;
  }
}

class TestTracerProvider implements TracerProvider {
  constructor(private readonly finishedSpans: TestSpan[]) {}

  getTracer(): Tracer {
    return new TestTracer(this.finishedSpans);
  }
}

class TestTracer implements Tracer {
  constructor(private readonly finishedSpans: TestSpan[]) {}

  startActiveSpan<F extends (span: Span) => unknown>(name: string, options: SpanOptions = {}, fn: F): ReturnType<F> {
    const span = new TestSpan(name, this.finishedSpans, options.attributes);
    const spanContext = trace.setSpan(context.active(), span);
    return context.with(spanContext, () => fn(span)) as ReturnType<F>;
  }

  startSpan(name: string, options: SpanOptions = {}): Span {
    return new TestSpan(name, this.finishedSpans, options.attributes);
  }
}

class TestSpan implements Span {
  public attributes: Record<string, unknown> = {};
  public status: SpanStatus = { code: SpanStatusCode.UNSET };
  private ended = false;
  private readonly spanContextValue: SpanContext;

  constructor(public name: string, private readonly finished: TestSpan[], attributes?: Record<string, unknown>) {
    this.spanContextValue = {
      traceId: randomHex(32),
      spanId: randomHex(16),
      traceFlags: 1,
    };

    if (attributes) {
      this.setAttributes(attributes);
    }
  }

  spanContext(): SpanContext {
    return this.spanContextValue;
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: Record<string, unknown>): this {
    Object.entries(attributes).forEach(([key, value]) => this.setAttribute(key, value));
    return this;
  }

  addEvent(): this {
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  updateName(name: string): this {
    this.name = name;
    return this;
  }

  end(): void {
    if (!this.ended) {
      this.ended = true;
      this.finished.push(this);
    }
  }

  isRecording(): boolean {
    return !this.ended;
  }

  recordException(): this {
    this.setStatus({ code: SpanStatusCode.ERROR });
    return this;
  }
}

const hexAlphabet = '0123456789abcdef';

const randomHex = (length: number) =>
  Array.from({ length })
    .map(() => hexAlphabet[Math.floor(Math.random() * hexAlphabet.length)])
    .join('');

describe('mcpCall tracing', () => {
  const finishedSpans: TestSpan[] = [];
  const fetchSpy = vi.fn();

  beforeEach(() => {
    finishedSpans.length = 0;
    trace.setGlobalTracerProvider(new TestTracerProvider(finishedSpans));
    context.setGlobalContextManager(new StackContextManager());
    fetchSpy.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ result: { ok: true } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchSpy);
    configureMcpGateway('https://gateway.test', 'token-123', 'sandbox-42');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    capturedLogs.length = 0;
  });

  it('creates spans with MCP metadata and forwards trace context to the gateway', async () => {
    const tracer = trace.getTracer('test');
    const parentSpan = tracer.startSpan('parent-span');

    await context.with(trace.setSpan(context.active(), parentSpan), async () => {
      await mcpCall({ toolName: 'memgraph_mcp.run_query', params: { query: 'RETURN 1' } });
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers;
    expect(headers.has('traceparent')).toBe(true);

    const span = finishedSpans.find(s => s.name === 'egress.mcp.call');
    expect(span).toBeDefined();
    expect(span?.attributes['mcp.tool']).toBe('memgraph_mcp.run_query');
    expect(span?.attributes['app.sandbox.id']).toBe('sandbox-42');
    expect(span?.attributes['mcp.policy.sanitized']).toBe(true);
  });

  it('logs MCP calls with trace metadata', async () => {
    const tracer = trace.getTracer('test');
    const parentSpan = tracer.startSpan('parent-span');

    await requestContext.run({ tenantId: 'tenant-mcp', conversationId: 'conversation-mcp' }, async () => {
      await context.with(trace.setSpan(context.active(), parentSpan), async () => {
        await mcpCall({ toolName: 'memgraph_mcp.run_query', params: { query: 'RETURN 1' } });
      });
    });

    const startLog = capturedLogs.find(entry => entry.event === 'mcp.call.start');

    expect(startLog?.trace_id).toBe(parentSpan.spanContext().traceId);
    expect(startLog?.span_id).toBeDefined();
    expect(startLog?.toolName).toBe('memgraph_mcp.run_query');
    expect(startLog?.tenantId).toBe('tenant-mcp');
  });
});
