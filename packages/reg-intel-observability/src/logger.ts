import { createHash } from 'node:crypto';
import pino, { DestinationStream, LoggerOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import { sanitizeObjectForEgress, sanitizeTextForEgress } from './payloadSanitizer.js';
import { requestContext } from './requestContext.js';
import { getLoggerProvider, createPinoOtelTransport } from './logsExporter.js';

export type LoggerBindings = {
  component?: string;
  destination?: DestinationStream;
} & Record<string, unknown>;

// Track all logger instances for graceful shutdown
const loggerInstances = new Set<pino.Logger>();

const shouldLogSafePayloads = () => process.env.LOG_SAFE_PAYLOADS === 'true';

const buildCorrelationFields = () => {
  const correlation: Record<string, unknown> = {};
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();

  if (spanContext && trace.isSpanContextValid(spanContext)) {
    correlation.trace_id = spanContext.traceId;
    correlation.span_id = spanContext.spanId;
  }

  const activeContext = requestContext.get();
  Object.entries(activeContext).forEach(([key, value]) => {
    if (value !== undefined) {
      correlation[key] = value;
    }
  });

  return correlation;
};

const serializePayload = (payload: unknown): string => {
  if (payload === undefined) return '[undefined]';
  if (payload === null) return 'null';
  if (typeof payload === 'string') return payload;

  try {
    return JSON.stringify(payload);
  } catch (error) {
    // Use console.error to avoid infinite recursion if called during logging
    console.error('Failed to serialize payload for logging:', error instanceof Error ? error.message : String(error));
    return '[unserializable-payload]';
  }
};

export const formatPayloadForLog = (
  payload: unknown
): { payloadHash: string; payloadPreview?: unknown } => {
  const serializedPayload = serializePayload(payload);
  const payloadHash = createHash('sha256').update(serializedPayload).digest('hex');

  if (!shouldLogSafePayloads()) {
    return { payloadHash };
  }

  if (payload === undefined) {
    return { payloadHash };
  }

  const payloadPreview =
    typeof payload === 'string'
      ? sanitizeTextForEgress(payload)
      : sanitizeObjectForEgress(payload);

  return { payloadHash, payloadPreview };
};

export const createLogger = (scope: string, bindings: LoggerBindings = {}) => {
  const { destination, ...staticBindings } = bindings;
  const level = process.env.LOG_LEVEL ?? 'info';
  const baseBindings = {
    scope,
    component: bindings.component ?? scope,
    ...staticBindings,
  };

  delete (baseBindings as Record<string, unknown>).destination;

  const options: LoggerOptions = {
    level,
    base: baseBindings,
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (value) => value,
    },
    mixin() {
      return buildCorrelationFields();
    },
  };

  // Check if OTEL logs are enabled and LoggerProvider is initialized
  const loggerProvider = getLoggerProvider();
  const shouldUseOtelTransport = loggerProvider !== null;

  let logger: pino.Logger;

  if (shouldUseOtelTransport) {
    // Use multistream to write to both stdout and OTEL Collector
    // This enables dual-write: logs go to stdout for local viewing AND to OTEL for centralized observability
    const stdoutStream = pino.destination({ sync: false });
    const otelStream = createPinoOtelTransport(loggerProvider);

    logger = pino(options, pino.multistream([
      { stream: destination ?? stdoutStream },
      { stream: otelStream },
    ]));
  } else {
    // Use async destination for better performance in production
    // Async logging prevents blocking the event loop on log writes
    logger = pino(options, destination ?? pino.destination({ sync: false }));
  }

  // Track logger instance for graceful shutdown
  loggerInstances.add(logger);

  return logger;
};

/**
 * Flushes all logger instances to ensure buffered logs are written.
 * This should be called during graceful shutdown to prevent log loss.
 * Returns a promise that resolves when all loggers have been flushed.
 */
export const flushLoggers = async (): Promise<void> => {
  const flushPromises = Array.from(loggerInstances).map(
    (logger) =>
      new Promise<void>((resolve, reject) => {
        logger.flush((err) => {
          if (err) {
            // Log the error but don't fail the shutdown process
            console.error('Failed to flush logger:', err);
            resolve(); // Resolve anyway to not block shutdown
          } else {
            resolve();
          }
        });
      })
  );

  await Promise.all(flushPromises);
};
