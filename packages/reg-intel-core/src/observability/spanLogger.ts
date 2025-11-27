import { randomUUID } from 'node:crypto';

import { createLogger } from '../logger.js';
import { getContext } from './requestContext.js';

const spanLogger = createLogger({ component: 'Span' });

export interface SpanOptions {
  name: string;
  provider?: string;
  model?: string;
  task?: string;
  toolName?: string;
  attributes?: Record<string, unknown>;
}

export interface SpanHandle {
  spanId: string;
  end(meta?: Record<string, unknown>): void;
  error(error: unknown, meta?: Record<string, unknown>): void;
}

/**
 * Lightweight span logger for timing and correlation-aware diagnostics.
 */
export function startSpan(options: SpanOptions): SpanHandle {
  const spanId = randomUUID();
  const start = Date.now();
  const { correlationId } = getContext();

  const baseFields = {
    spanId,
    spanName: options.name,
    correlationId,
    provider: options.provider,
    model: options.model,
    task: options.task,
    toolName: options.toolName,
    ...options.attributes,
  } satisfies Record<string, unknown>;

  const log = spanLogger.childWithContext(baseFields);
  log.info('Span started', baseFields);

  return {
    spanId,
    end(meta?: Record<string, unknown>) {
      const durationMs = Date.now() - start;
      log.info('Span completed', { durationMs, ...meta });
    },
    error(error: unknown, meta?: Record<string, unknown>) {
      const durationMs = Date.now() - start;
      log.error('Span failed', { durationMs, error, ...meta });
    },
  };
}
