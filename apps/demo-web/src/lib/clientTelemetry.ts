import { useMemo } from 'react';

type ClientTelemetryLevel = 'info' | 'warn' | 'error';

type TelemetryContext = Record<string, unknown>;

export type ClientTelemetrySink = (context: TelemetryContext, message: string) => void;

interface TelemetryOptions {
  endpoint?: string;
  defaultContext?: TelemetryContext;
}

export interface ClientTelemetry {
  sessionId: string;
  newRequestId: (prefix?: string) => string;
  info: ClientTelemetrySink;
  warn: ClientTelemetrySink;
  error: ClientTelemetrySink;
  withRequest: (
    requestId?: string,
    context?: TelemetryContext
  ) => {
    requestId: string;
    info: ClientTelemetrySink;
    warn: ClientTelemetrySink;
    error: ClientTelemetrySink;
  };
}

const DEFAULT_ENDPOINT = '/api/client-telemetry';

const generateClientId = (prefix: string) => {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2);
  return `${prefix}-${randomPart}`;
};

const sendTelemetry = async (
  endpoint: string,
  level: ClientTelemetryLevel,
  scope: string,
  sessionId: string,
  message: string,
  context?: TelemetryContext
) => {
  const payload = {
    level,
    scope,
    sessionId,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const body = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([body], { type: 'application/json' });
    const sent = navigator.sendBeacon(endpoint, blob);
    if (sent) return;
  }

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      keepalive: true,
    });
  } catch (err) {
    // Swallow client logging errors to avoid impacting UX
  }
};

export const createClientTelemetry = (
  scope: string,
  { endpoint = DEFAULT_ENDPOINT, defaultContext }: TelemetryOptions = {}
): ClientTelemetry => {
  const sessionId = generateClientId(`${scope}-session`);

  const log = (level: ClientTelemetryLevel, baseContext?: TelemetryContext) =>
    (context: TelemetryContext, message: string) => {
      void sendTelemetry(endpoint, level, scope, sessionId, message, {
        context: { ...defaultContext, ...baseContext, ...context },
        requestId: (context.requestId as string | undefined) ?? (baseContext?.requestId as string | undefined),
      });
    };

  const newRequestId = (prefix = 'request') => generateClientId(prefix);

  const withRequest = (requestId?: string, context?: TelemetryContext) => {
    const combinedContext = { ...(context ?? {}), requestId: requestId ?? newRequestId() };
    return {
      requestId: combinedContext.requestId as string,
      info: log('info', combinedContext),
      warn: log('warn', combinedContext),
      error: log('error', combinedContext),
    };
  };

  return {
    sessionId,
    newRequestId,
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    withRequest,
  };
};

export const useClientTelemetry = (scope: string, options?: TelemetryOptions) =>
  useMemo(() => createClientTelemetry(scope, options), [scope, options]);
