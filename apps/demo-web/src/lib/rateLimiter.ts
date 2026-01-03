/**
 * Rate Limiter - Industry Standard Transparent Failover
 *
 * CRITICAL: This implementation follows the industry-standard transparent failover pattern.
 * getRateLimiter() NEVER returns null - always returns a rate limiter instance.
 *
 * MULTI-INSTANCE SAFE: Uses Redis/Upstash for distributed rate limiting.
 * When Redis unavailable: Uses AllowAllRateLimiter (transparent fail-open).
 *
 * Reference: TransparentRateLimiter (packages/reg-intel-cache/src/transparentRateLimiter.ts)
 */

import {
  createRateLimiter as createRateLimiterFromBackend,
  resolveRedisBackend,
  type TransparentRateLimiter,
} from '@reg-copilot/reg-intel-cache';

/**
 * Individual flag to enable/disable Redis-based rate limiting specifically.
 * Set ENABLE_RATE_LIMITER_REDIS=false to disable Redis rate limiting (uses AllowAllRateLimiter).
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
 *
 * CRITICAL: This function NEVER returns null. It always returns a rate limiter instance.
 *
 * When Redis/Upstash unavailable:
 * - Returns TransparentRateLimiter with AllowAllRateLimiter
 * - check() returns true (fail-open)
 * - Application code works identically
 *
 * @returns TransparentRateLimiter instance - NEVER returns null
 */
function createRateLimiter(config: RateLimiterConfig): TransparentRateLimiter {
  const backend = ENABLE_RATE_LIMITER_REDIS ? resolveRedisBackend('rateLimit') : null;

  // ✅ createRateLimiterFromBackend NEVER returns null
  const limiter = createRateLimiterFromBackend(backend, {
    windowMs: config.windowMs,
    limit: config.maxRequests,
    prefix: 'copilot:ratelimit',
  });

  return limiter;
}

/**
 * Singleton rate limiter instance
 *
 * CRITICAL: This is NEVER null - always contains a TransparentRateLimiter instance
 */
let rateLimiterInstance: TransparentRateLimiter | null = null;
let rateLimiterInitialized = false;

/**
 * Get the singleton rate limiter instance
 *
 * CRITICAL: This function NEVER returns null. It always returns a rate limiter instance.
 *
 * When Redis/Upstash not configured, returns AllowAllRateLimiter (fail-open).
 * Application code NEVER needs to check for null.
 *
 * @returns TransparentRateLimiter instance - NEVER returns null
 */
export function getRateLimiter(): TransparentRateLimiter {
  if (!rateLimiterInitialized) {
    const maxRequests =
      parseInt(process.env.CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS || '100', 10) || 100;

    const windowMs = parseInt(process.env.CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS || '60000', 10) || 60000;

    // ✅ createRateLimiter NEVER returns null
    rateLimiterInstance = createRateLimiter({
      maxRequests,
      windowMs,
    });

    // ✅ No null check - instance ALWAYS exists
    const backendType = rateLimiterInstance.getBackendType();
    console.log(
      `[RateLimiter] Initialized ${backendType} rate limiter ` +
        `(${maxRequests} requests per ${windowMs}ms)`
    );

    if (backendType === 'allowall') {
      console.warn(`[RateLimiter] No backend configured - using AllowAllRateLimiter (fail-open)`);
    }

    rateLimiterInitialized = true;
  }

  // ✅ TypeScript knows this is never null due to initialization above
  return rateLimiterInstance!;
}
