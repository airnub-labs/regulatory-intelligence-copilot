import { createLogger, requestContext } from '@reg-copilot/reg-intel-observability';
import { getRateLimiter } from '@/lib/rateLimiter';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';

const logger = createLogger('ClientTelemetryRoute');
const rateLimiter = getRateLimiter();

type ClientTelemetryLevel = 'info' | 'warn' | 'error';

/**
 * Single telemetry event structure
 */
type ClientTelemetryEvent = {
  level: ClientTelemetryLevel;
  message: string;
  scope: string;
  sessionId: string;
  requestId?: string;
  context?: Record<string, unknown>;
  timestamp: string;
};

/**
 * Payload can be either a single event (legacy) or a batch of events
 */
type ClientTelemetryPayload =
  | {
      // Batch format
      events: ClientTelemetryEvent[];
    }
  | {
      // Legacy single event format
      level?: ClientTelemetryLevel;
      message?: string;
      scope?: string;
      sessionId?: string;
      requestId?: string;
      context?: Record<string, unknown>;
      timestamp?: string;
    };

/**
 * OTEL collector configuration
 */
const OTEL_COLLECTOR_ENDPOINT = process.env.OTEL_COLLECTOR_ENDPOINT || null;
const OTEL_COLLECTOR_TIMEOUT_MS =
  parseInt(process.env.OTEL_COLLECTOR_TIMEOUT_MS || '5000', 10) || 5000;

/**
 * Extract client IP from request
 */
const getClientIp = (request: Request): string => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
};

/**
 * Validate telemetry event
 */
const isValidTimestamp = (timestamp: unknown): timestamp is string => {
  return typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp));
};

const isValidEvent = (event: unknown): event is ClientTelemetryEvent => {
  if (!event || typeof event !== 'object') {
    return false;
  }

  const candidate = event as Partial<ClientTelemetryEvent> & { timestamp?: unknown };

  return (
    typeof candidate.level === 'string' &&
    (candidate.level === 'info' || candidate.level === 'warn' || candidate.level === 'error') &&
    typeof candidate.message === 'string' &&
    typeof candidate.scope === 'string' &&
    typeof candidate.sessionId === 'string' &&
    isValidTimestamp(candidate.timestamp)
  );
};

const getTimestampInNanoSeconds = (timestamp: string): number => {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid timestamp provided');
  }

  return parsed * 1_000_000;
};

/**
 * Forward events to OTEL collector
 */
const forwardToOTELCollector = async (events: ClientTelemetryEvent[]): Promise<void> => {
  if (!OTEL_COLLECTOR_ENDPOINT) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OTEL_COLLECTOR_TIMEOUT_MS);

    const response = await fetch(OTEL_COLLECTOR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'demo-web-client' } },
                { key: 'telemetry.sdk.name', value: { stringValue: 'client-telemetry' } },
              ],
            },
            scopeLogs: events.map(event => ({
              scope: {
                name: event.scope,
              },
              logRecords: [
                {
                  timeUnixNano: getTimestampInNanoSeconds(event.timestamp),
                  severityText:
                    event.level === 'error' ? 'ERROR' : event.level === 'warn' ? 'WARN' : 'INFO',
                  body: { stringValue: event.message },
                  attributes: [
                    { key: 'session.id', value: { stringValue: event.sessionId } },
                    ...(event.requestId
                      ? [{ key: 'request.id', value: { stringValue: event.requestId } }]
                      : []),
                    ...(event.context
                      ? Object.entries(event.context).map(([key, value]) => ({
                          key,
                          value: { stringValue: String(value) },
                        }))
                      : []),
                  ],
                },
              ],
            })),
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(
        {
          status: response.status,
          endpoint: OTEL_COLLECTOR_ENDPOINT,
          eventCount: events.length,
        },
        'Failed to forward events to OTEL collector'
      );
    } else {
      logger.debug(
        {
          endpoint: OTEL_COLLECTOR_ENDPOINT,
          eventCount: events.length,
        },
        'Successfully forwarded events to OTEL collector'
      );
    }
  } catch (error) {
    // Don't let OTEL forwarding errors break the telemetry endpoint
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        endpoint: OTEL_COLLECTOR_ENDPOINT,
        eventCount: events.length,
      },
      'Error forwarding events to OTEL collector'
    );
  }
};

/**
 * Process a single telemetry event
 */
const processEvent = (event: ClientTelemetryEvent): void => {
  const { level, scope = 'client', sessionId, requestId, timestamp, context, message } = event;

  const boundLogger = logger.child({ scope, sessionId, requestId, timestamp });
  const logObject = { ...context };

  if (level === 'error') {
    boundLogger.error(logObject, message);
  } else if (level === 'warn') {
    boundLogger.warn(logObject, message);
  } else {
    boundLogger.info(logObject, message);
  }
};

/**
 * POST handler for client telemetry
 * Supports both single events (legacy) and batched events
 */
export async function POST(request: Request) {
  try {
    // CRITICAL: Add authentication check - telemetry endpoint should be protected
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId } = await getTenantContext(session);

    // Check rate limit using distributed rate limiter (Redis/Upstash)
    // ✅ No null check - rateLimiter ALWAYS exists (transparent failover)
    // When Redis unavailable, AllowAllRateLimiter allows all requests (fail-open)
    const clientIp = getClientIp(request);
    const isAllowed = await rateLimiter.check(clientIp);

    if (!isAllowed) {
      logger.warn(
        {
          clientIp,
          rateLimiterType: rateLimiter.getBackendType(),
        },
        'Client telemetry rate limit exceeded'
      );
      return Response.json(
        { error: 'Rate limit exceeded. Please slow down your requests.' },
        { status: 429 }
      );
    }

    const payload = (await request.json()) as ClientTelemetryPayload;

    let events: ClientTelemetryEvent[] = [];

    // Check if payload is batch format
    if ('events' in payload && Array.isArray(payload.events)) {
      // Batch format
      events = payload.events.filter(isValidEvent);

      if (events.length === 0) {
        return Response.json({ error: 'No valid events in batch' }, { status: 400 });
      }

      const droppedEvents = payload.events.length - events.length;

      if (droppedEvents > 0) {
        logger.warn(
          {
            clientIp,
            batchSize: payload.events.length,
            droppedEvents,
          },
          'Dropped invalid telemetry events from batch'
        );
      }

      logger.debug(
        {
          batchSize: payload.events.length,
          validEvents: events.length,
          clientIp,
        },
        'Processing batched telemetry events'
      );
    } else {
      // Legacy single event format
      const event = payload as Partial<ClientTelemetryEvent>;

      if (!event.level || !event.message || !isValidEvent(event)) {
        return Response.json({ error: 'Invalid telemetry payload' }, { status: 400 });
      }

      events = [event as ClientTelemetryEvent];

      logger.debug(
        {
          clientIp,
        },
        'Processing single telemetry event'
      );
    }

    // Process events locally (log to Pino)
    for (const event of events) {
      processEvent(event);
    }

    // Forward to OTEL collector (async, non-blocking)
    if (OTEL_COLLECTOR_ENDPOINT) {
      // Fire and forget with error logging
      void forwardToOTELCollector(events).catch((error) => {
        logger.warn(
          { err: error instanceof Error ? error : new Error(String(error)) },
          'Failed to forward telemetry to OTEL collector (non-critical)'
        );
      });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    const errObject =
      error instanceof Error ? { err: error } : { err: new Error('Unknown telemetry error') };
    const activeContext = requestContext.get();

    logger.error(
      { ...activeContext, ...errObject },
      'Failed to process client telemetry'
    );
    return Response.json({ error: 'Invalid telemetry payload' }, { status: 400 });
  }
}
