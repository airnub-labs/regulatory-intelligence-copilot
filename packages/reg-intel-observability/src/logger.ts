import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import pino, { DestinationStream, LoggerOptions, multistream } from 'pino';
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

/**
 * Check if logs should be forwarded to OTEL collector
 * This is controlled by OTEL_LOGS_TO_COLLECTOR environment variable
 * Defaults to true when OTEL_LOGS_ENABLED is true
 */
const shouldForwardToOtel = (): boolean => {
  const explicitSetting = process.env.OTEL_LOGS_TO_COLLECTOR;
  if (explicitSetting !== undefined) {
    return explicitSetting === 'true';
  }
  // Default to true when OTEL logs are enabled
  return process.env.OTEL_LOGS_ENABLED === 'true';
};

// Cache the OTEL transport to avoid creating multiple instances
let otelTransportCache: DestinationStream | null = null;

/**
 * Creates a destination stream that writes to both stdout and OTEL collector
 * This enables centralized log collection in multi-instance deployments
 */
const createDualDestination = (): DestinationStream => {
  const streams: Array<{ stream: DestinationStream; level?: string }> = [];

  // Always write to stdout (async for performance)
  streams.push({
    stream: pino.destination({ sync: false }),
  });

  // Optionally forward to OTEL collector
  if (shouldForwardToOtel()) {
    const provider = getLoggerProvider();
    if (provider) {
      if (!otelTransportCache) {
        otelTransportCache = createPinoOtelTransport(provider);
      }
      streams.push({
        stream: otelTransportCache,
      });
    }
  }

  // If only one stream, return it directly for efficiency
  if (streams.length === 1) {
    return streams[0].stream;
  }

  // Use multistream for dual destinations
  return multistream(streams);
};

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
  } catch {
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

  // Determine the appropriate destination:
  // 1. If a custom destination is provided, use it (for testing/special cases)
  // 2. Otherwise, create a dual destination (stdout + OTEL when enabled)
  //
  // The dual destination enables centralized log collection in multi-instance
  // cloud deployments while maintaining local stdout logging for debugging.
  const logDestination = destination ?? createDualDestination();
  const logger = pino(options, logDestination);

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

/**
 * Resets the OTEL transport cache.
 * This should be called during shutdown to allow re-initialization.
 */
export const resetOtelTransportCache = (): void => {
  otelTransportCache = null;
};
