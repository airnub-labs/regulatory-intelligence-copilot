import {
  Context,
  ContextManager,
  Link,
  ROOT_CONTEXT,
  Span,
  SpanAttributes,
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

const handlerSpy = vi.fn(async (req: Request) => new Response(req.headers.get('traceparent') ?? 'missing traceparent'));

vi.mock('@reg-copilot/reg-intel-next-adapter', () => ({
  createChatRouteHandler: () => handlerSpy,
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'user-42', tenantId: 'tenant-1' } })),
}));

vi.mock('@/lib/server/conversations', () => ({
  conversationContextStore: {},
  conversationEventHub: {},
  conversationListEventHub: {},
  conversationStore: {},
}));

describe('chat route tracing', () => {
  const finishedSpans: TestSpan[] = [];

  beforeEach(() => {
    finishedSpans.length = 0;
    trace.setGlobalTracerProvider(new TestTracerProvider(finishedSpans));
    context.setGlobalContextManager(new StackContextManager());
    vi.resetModules();
  });

  afterEach(async () => {
    handlerSpy.mockReset();
  });

  it('propagates trace context and annotates span', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hi', conversationId: 'conv-123' }),
      }),
    );

    const traceparent = await response.text();
    expect(traceparent).toMatch(/^00-/);

    const spans = finishedSpans.filter((span) => span.name === 'api.chat');
    expect(spans).toHaveLength(1);
    const [span] = spans;
    expect(span.attributes['app.tenant.id']).toBe('tenant-1');
    expect(span.attributes['app.conversation.id']).toBe('conv-123');
    expect(span.attributes['app.user.id']).toBe('user-42');
  });
});

class StackContextManager implements ContextManager {
  private stack: Context[] = [ROOT_CONTEXT];

  active(): Context {
    return this.stack[this.stack.length - 1];
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    contextValue: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    this.stack.push(contextValue);
    try {
      return fn.apply(thisArg, args);
    } finally {
      this.stack.pop();
    }
  }

  bind<T>(contextValue: Context, target: T): T {
    void contextValue; // Acknowledge unused parameter
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

  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    arg2?: SpanOptions | F,
    arg3?: Context | F,
    arg4?: F
  ): ReturnType<F> {
    // Handle the various overload signatures
    let options: SpanOptions = {};
    let fn: F;

    if (typeof arg2 === 'function') {
      fn = arg2 as F;
    } else if (typeof arg3 === 'function') {
      options = arg2 as SpanOptions;
      fn = arg3 as F;
    } else {
      options = arg2 as SpanOptions;
      fn = arg4 as F;
    }

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

  constructor(public name: string, private readonly finished: TestSpan[], attributes?: SpanAttributes) {
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

  setAttributes(attributes: SpanAttributes): this {
    Object.entries(attributes).forEach(([key, value]) => {
      this.setAttribute(key, value);
    });
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

  addLink(link: Link): this {
    void link;
    return this;
  }

  addLinks(links: Link[]): this {
    void links;
    return this;
  }
}

const hexAlphabet = '0123456789abcdef';

const randomHex = (length: number) =>
  Array.from({ length })
    .map(() => hexAlphabet[Math.floor(Math.random() * hexAlphabet.length)])
    .join('');
