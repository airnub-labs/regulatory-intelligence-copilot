import pino, { DestinationStream, LoggerOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import { requestContext } from './requestContext.js';

export type LoggerBindings = {
  component?: string;
  destination?: DestinationStream;
} & Record<string, unknown>;

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
