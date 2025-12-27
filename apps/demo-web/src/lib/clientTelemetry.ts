import { useMemo } from 'react';

type ClientTelemetryLevel = 'info' | 'warn' | 'error';

type TelemetryContext = Record<string, unknown>;

export type ClientTelemetrySink = (context: TelemetryContext, message: string) => void;

interface TelemetryOptions {
  endpoint?: string;
  defaultContext?: TelemetryContext;
  /**
   * Maximum number of events to batch before flushing (default: 20)
   */
  maxBatchSize?: number;
  /**
   * Flush interval in milliseconds (default: 2000ms = 2s)
   */
  flushIntervalMs?: number;
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
  /**
   * Manually flush the batched events (useful for testing or before page unload)
   */
  flush: () => Promise<void>;
}

/**
 * Default endpoint - can be overridden via NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT
 */
const DEFAULT_ENDPOINT = '/api/client-telemetry';

/**
 * Default batch size - can be overridden via NEXT_PUBLIC_CLIENT_TELEMETRY_BATCH_SIZE
 */
const DEFAULT_BATCH_SIZE = 20;

/**
 * Default flush interval - can be overridden via NEXT_PUBLIC_CLIENT_TELEMETRY_FLUSH_INTERVAL_MS
 */
const DEFAULT_FLUSH_INTERVAL_MS = 2000; // 2 seconds

/**
 * Get configuration from environment variables with fallbacks
 */
const getConfig = () => {
  const endpoint =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT
      ? process.env.NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT
      : DEFAULT_ENDPOINT;

  const maxBatchSize =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CLIENT_TELEMETRY_BATCH_SIZE
      ? parseInt(process.env.NEXT_PUBLIC_CLIENT_TELEMETRY_BATCH_SIZE, 10)
      : DEFAULT_BATCH_SIZE;

  const flushIntervalMs =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CLIENT_TELEMETRY_FLUSH_INTERVAL_MS
      ? parseInt(process.env.NEXT_PUBLIC_CLIENT_TELEMETRY_FLUSH_INTERVAL_MS, 10)
      : DEFAULT_FLUSH_INTERVAL_MS;

  return {
    endpoint,
    maxBatchSize: isNaN(maxBatchSize) ? DEFAULT_BATCH_SIZE : maxBatchSize,
    flushIntervalMs: isNaN(flushIntervalMs) ? DEFAULT_FLUSH_INTERVAL_MS : flushIntervalMs,
  };
};

const generateClientId = (prefix: string) => {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2);
  return `${prefix}-${randomPart}`;
};

/**
 * Telemetry event structure
 */
interface TelemetryEvent {
  level: ClientTelemetryLevel;
  scope: string;
  sessionId: string;
  message: string;
  timestamp: string;
  context?: TelemetryContext;
}

/**
 * Batching queue for telemetry events
 * Automatically flushes when:
 * - Batch size reaches maxBatchSize
 * - Flush interval timer fires
 * - Page is about to unload
 */
class TelemetryBatchQueue {
  private queue: TelemetryEvent[] = [];
  private flushTimer: NodeJS.Timeout | number | null = null;
  private isFlushing = false;
  private readonly endpoint: string;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;

  constructor(endpoint: string, maxBatchSize: number, flushIntervalMs: number) {
    this.endpoint = endpoint;
    this.maxBatchSize = maxBatchSize;
    this.flushIntervalMs = flushIntervalMs;

    // Register page unload handler to flush remaining events
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushSync();
      });

      // Also flush on visibility change (when tab is hidden)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushSync();
        }
      });
    }
  }

  /**
   * Add event to queue and potentially trigger flush
   */
  enqueue(event: TelemetryEvent): void {
    this.queue.push(event);

    // Flush immediately if batch size reached
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
      return;
    }

    // Start flush timer if not already running
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        void this.flush();
      }, this.flushIntervalMs);
    }
  }

  /**
   * Flush events asynchronously
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;

    // Clear the timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer as number);
      this.flushTimer = null;
    }

    // Take current queue and reset
    const events = [...this.queue];
    this.queue = [];

    try {
      await this.sendBatch(events);
    } catch (error) {
      // Swallow errors to avoid impacting UX
      // Events are lost, but this is acceptable for client telemetry
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Synchronous flush for page unload (uses sendBeacon)
   */
  private flushSync(): void {
    if (this.queue.length === 0) {
      return;
    }

    // Clear the timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer as number);
      this.flushTimer = null;
    }

    const events = [...this.queue];
    this.queue = [];

    // Use sendBeacon for synchronous send on page unload
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify({ events })], { type: 'application/json' });
      navigator.sendBeacon(this.endpoint, blob);
    }
  }

  /**
   * Send batch of events to server
   */
  private async sendBatch(events: TelemetryEvent[]): Promise<void> {
    const body = JSON.stringify({ events });

    // Try sendBeacon first for efficiency
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(this.endpoint, blob);
      if (sent) return;
    }

    // Fallback to fetch
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        keepalive: true,
      });
    } catch {
      // Swallow errors
    }
  }
}

/**
 * Global batching queue singleton per endpoint
 */
const batchQueues = new Map<string, TelemetryBatchQueue>();

/**
 * Get or create batch queue for endpoint
 */
const getBatchQueue = (
  endpoint: string,
  maxBatchSize: number,
  flushIntervalMs: number
): TelemetryBatchQueue => {
  const key = endpoint;
  let queue = batchQueues.get(key);

  if (!queue) {
    queue = new TelemetryBatchQueue(endpoint, maxBatchSize, flushIntervalMs);
    batchQueues.set(key, queue);
  }

  return queue;
};

/**
 * Legacy sendTelemetry function - now uses batching
 */
const sendTelemetry = (
  queue: TelemetryBatchQueue,
  level: ClientTelemetryLevel,
  scope: string,
  sessionId: string,
  message: string,
  context?: TelemetryContext
) => {
  const event: TelemetryEvent = {
    level,
    scope,
    sessionId,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  queue.enqueue(event);
};

export const createClientTelemetry = (
  scope: string,
  options: TelemetryOptions = {}
): ClientTelemetry => {
  // Get configuration from environment variables and options
  const config = getConfig();
  const endpoint = options.endpoint ?? config.endpoint;
  const maxBatchSize = options.maxBatchSize ?? config.maxBatchSize;
  const flushIntervalMs = options.flushIntervalMs ?? config.flushIntervalMs;

  const { defaultContext } = options;

  // Get or create batch queue for this endpoint
  const queue = getBatchQueue(endpoint, maxBatchSize, flushIntervalMs);

  const sessionId = generateClientId(`${scope}-session`);

  const log = (level: ClientTelemetryLevel, baseContext?: TelemetryContext) =>
    (context: TelemetryContext, message: string) => {
      sendTelemetry(queue, level, scope, sessionId, message, {
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
    flush: () => queue.flush(),
  };
};

export const useClientTelemetry = (scope: string, options?: TelemetryOptions) =>
  useMemo(() => createClientTelemetry(scope, options), [scope, options]);
