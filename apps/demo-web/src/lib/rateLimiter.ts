import { createFailOpenRateLimiter, resolveRedisBackend, type RateLimiter } from '@reg-copilot/reg-intel-cache';

/**
 * Individual flag to enable/disable Redis-based rate limiting specifically.
 * Set ENABLE_RATE_LIMITER_REDIS=false to disable Redis rate limiting (falls back to in-memory).
 * Defaults to true.
 */
const ENABLE_RATE_LIMITER_REDIS = process.env.ENABLE_RATE_LIMITER_REDIS !== 'false';

/**
 * Rate limiter configuration
 */
interface RateLimiterConfig {
  /**
   * Maximum number of requests per window
   */
  maxRequests: number;
  /**
   * Window duration in milliseconds
   */
  windowMs: number;
}

/**
 * Create a rate limiter instance
 * Uses shared cache package to pick Redis or Upstash backends based on environment
 * Returns null if no backend is available (rate limiting disabled - fail-open)
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter | null {
  const backend = ENABLE_RATE_LIMITER_REDIS ? resolveRedisBackend('rateLimit') : null;
  const limiter = createFailOpenRateLimiter(backend, {
    windowMs: config.windowMs,
    limit: config.maxRequests,
    prefix: 'copilot:ratelimit',
  });

  return limiter;
}

/**
 * Singleton rate limiter instance
 */
let rateLimiterInstance: RateLimiter | null = null;
let rateLimiterInitialized = false;

/**
 * Get the singleton rate limiter instance
 * Returns null if Redis/Upstash not configured (rate limiting disabled - fail-open)
 * Configuration is read from environment variables
 */
export function getRateLimiter(): RateLimiter | null {
  if (!rateLimiterInitialized) {
    const maxRequests =
      parseInt(process.env.CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS || '100', 10) || 100;

    const windowMs = parseInt(process.env.CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS || '60000', 10) || 60000;

    rateLimiterInstance = createRateLimiter({
      maxRequests,
      windowMs,
    });

    if (rateLimiterInstance) {
      console.log(
        `[RateLimiter] Initialized ${rateLimiterInstance.getType()} rate limiter ` +
          `(${maxRequests} requests per ${windowMs}ms)`
      );
    } else {
      console.warn(`[RateLimiter] No backend configured - rate limiting disabled (fail-open)`);
    }

    rateLimiterInitialized = true;
  }

  return rateLimiterInstance;
}
