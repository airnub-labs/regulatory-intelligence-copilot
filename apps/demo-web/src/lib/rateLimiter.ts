import { createFailOpenRateLimiter, resolveRedisBackend, type RateLimiter } from '@reg-copilot/reg-intel-cache';

/**
 * Global kill switch to disable ALL Redis caching across the application.
 * Set ENABLE_REDIS_CACHING=false to disable all caching (e.g., during debugging/disaster recovery).
 * Defaults to true.
 */
const ENABLE_REDIS_CACHING = process.env.ENABLE_REDIS_CACHING !== 'false';

/**
 * Individual flag to enable/disable Redis-based rate limiting specifically.
 * Set ENABLE_RATE_LIMITER_REDIS=false to disable Redis rate limiting (falls back to in-memory).
 * Defaults to true.
 *
 * Requires ENABLE_REDIS_CACHING=true to have any effect.
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
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const backend = ENABLE_REDIS_CACHING && ENABLE_RATE_LIMITER_REDIS ? resolveRedisBackend('rateLimit') : null;
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

/**
 * Get the singleton rate limiter instance
 * Configuration is read from environment variables
 */
export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    const maxRequests =
      parseInt(process.env.CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS || '100', 10) || 100;

    const windowMs = parseInt(process.env.CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS || '60000', 10) || 60000;

    rateLimiterInstance = createRateLimiter({
      maxRequests,
      windowMs,
    });

    console.log(
      `[RateLimiter] Initialized ${rateLimiterInstance.getType()} rate limiter ` +
        `(${maxRequests} requests per ${windowMs}ms)`
    );
  }

  return rateLimiterInstance;
}
