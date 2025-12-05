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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseConversationStore } from './conversationStores.js';

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

describe('SupabaseConversationStore tracing', () => {
  const finishedSpans: TestSpan[] = [];

  beforeEach(() => {
    finishedSpans.length = 0;
    trace.setGlobalTracerProvider(new TestTracerProvider(finishedSpans));
    context.setGlobalContextManager(new StackContextManager());
  });

  it('wraps createConversation mutations with Supabase spans', async () => {
    const single = vi.fn(async () => ({ data: { id: 'conv-123' }, error: null }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const from = vi.fn(() => ({ insert }));
    const supabaseClient = { from } as unknown as Parameters<typeof SupabaseConversationStore>[0];
    const store = new SupabaseConversationStore(supabaseClient, supabaseClient);

    await store.createConversation({ tenantId: 'tenant-1' });

    const span = finishedSpans.find(s => s.name === 'db.supabase.mutation');
    expect(span).toBeDefined();
    expect(span?.attributes['db.system']).toBe('postgresql');
    expect(span?.attributes['db.sql.table']).toBe('conversations');
    expect(span?.attributes['app.tenant.id']).toBe('tenant-1');
  });
});
