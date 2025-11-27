import { randomUUID } from 'node:crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface SpanContext {
  correlationId?: string;
  tenantId?: string;
  profileType?: string;
  jurisdictions?: string[];
}

export interface SpanOptions {
  name: string;
  provider?: string;
  model?: string;
  task?: string;
  attributes?: Record<string, unknown>;
}

export interface SpanHandle {
  spanId: string;
  end(meta?: Record<string, unknown>): void;
  error(error: unknown, meta?: Record<string, unknown>): void;
}

let contextResolver: () => SpanContext = () => ({
  correlationId: undefined,
});

export function setSpanContextResolver(resolver: () => SpanContext): void {
  contextResolver = resolver;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function log(level: LogLevel, message: string, meta: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const serialized = JSON.stringify(payload);
  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

export function startSpan(options: SpanOptions): SpanHandle {
  const start = Date.now();
  const spanId = randomUUID();
  const context = contextResolver?.() ?? {};

  const base = {
    spanId,
    spanName: options.name,
    provider: options.provider,
    model: options.model,
    task: options.task,
    correlationId: context.correlationId,
    tenantId: context.tenantId,
    profileType: context.profileType,
    jurisdictions: context.jurisdictions,
    ...options.attributes,
  } satisfies Record<string, unknown>;

  log('info', 'Span started', base);

  return {
    spanId,
    end(meta?: Record<string, unknown>) {
      const durationMs = Date.now() - start;
      log('info', 'Span completed', { ...base, durationMs, ...meta });
    },
    error(error: unknown, meta?: Record<string, unknown>) {
      const durationMs = Date.now() - start;
      log('error', 'Span failed', { ...base, durationMs, error: serializeError(error), ...meta });
    },
  };
}
