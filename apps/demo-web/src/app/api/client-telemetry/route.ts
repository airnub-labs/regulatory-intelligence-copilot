import { createLogger, requestContext } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('ClientTelemetryRoute');

type ClientTelemetryLevel = 'info' | 'warn' | 'error';

type ClientTelemetryPayload = {
  level?: ClientTelemetryLevel;
  message?: string;
  scope?: string;
  sessionId?: string;
  requestId?: string;
  context?: Record<string, unknown>;
  timestamp?: string;
};

const isLevel = (value: string): value is ClientTelemetryLevel =>
  value === 'info' || value === 'warn' || value === 'error';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ClientTelemetryPayload;

    if (!payload.level || !payload.message || !isLevel(payload.level)) {
      return Response.json({ error: 'Invalid telemetry payload' }, { status: 400 });
    }

    const level = payload.level;
    const { scope = 'client', sessionId, requestId, timestamp, context } = payload;

    const boundLogger = logger.child({ scope, sessionId, requestId, timestamp });
    const logObject = { ...context };

    if (level === 'error') {
      boundLogger.error(logObject, payload.message);
    } else if (level === 'warn') {
      boundLogger.warn(logObject, payload.message);
    } else {
      boundLogger.info(logObject, payload.message);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    const errObject = error instanceof Error ? { err: error } : { err: new Error('Unknown telemetry error') };
    requestContext.getStore()
      ? logger.error({ ...errObject }, 'Failed to process client telemetry')
      : logger.error(errObject, 'Failed to process client telemetry');
    return Response.json({ error: 'Invalid telemetry payload' }, { status: 400 });
  }
}
