import { createHash } from 'node:crypto';
import pino, { DestinationStream, LoggerOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import { sanitizeObjectForEgress, sanitizeTextForEgress } from './payloadSanitizer.js';
import { requestContext } from './requestContext.js';

export type LoggerBindings = {
  component?: string;
  destination?: DestinationStream;
} & Record<string, unknown>;

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

  return pino(options, destination ?? pino.destination({ sync: true }));
};
