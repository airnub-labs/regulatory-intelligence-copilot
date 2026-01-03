/**
 * Transparent Rate Limiter - Industry Standard Failover Pattern
 *
 * This module implements the industry-standard rate limiter pattern where Redis
 * failures are completely transparent to application code.
 *
 * Key principle: Rate limiter ALWAYS exists (never null). When Redis is unavailable,
 * fail-open (allow all requests) rather than fail-closed (block all requests).
 *
 * Pattern matches: API gateways, load balancers, CDNs (graceful degradation)
 */

import { createLogger } from '@reg-copilot/reg-intel-observability';
import { metrics } from '@opentelemetry/api';

const logger = createLogger('TransparentRateLimiter');

// Initialize metrics
const meter = metrics.getMeter('reg-intel-cache', '1.0.0');

const rateLimiterCheckCounter = meter.createCounter('ratelimiter.checks.total', {
  description: 'Total number of rate limiter checks by result',
  unit: '{checks}',
});

const rateLimiterCheckDuration = meter.createHistogram('ratelimiter.check.duration', {
  description: 'Duration of rate limiter checks in milliseconds',
  unit: 'ms',
});

const rateLimiterErrorCounter = meter.createCounter('ratelimiter.errors.total', {
  description: 'Total number of rate limiter errors',
  unit: '{errors}',
});

/**
 * Backend interface for rate limiting operations
 */
export interface RateLimiterBackend {
  /**
   * Check if request should be allowed
   * @param identifier Unique identifier (e.g., IP address, user ID)
   * @returns true if allowed, false if rate limited
   */
  check(identifier: string): Promise<boolean>;

  /**
   * Get backend type for observability
   */
  getType(): 'redis' | 'upstash';
}

/**
 * Transparent rate limiter interface - ALWAYS available (never null)
 *
 * When Redis is unavailable:
 * - check() returns true (fail-open, allow request)
 * - Application code works identically
 *
 * Fail-open is better than fail-closed because:
 * - Broken per-instance rate limiting doesn't work in multi-instance deployments
 * - Better to allow requests than block legitimate users during outage
 * - Alerts/monitoring detect when AllowAllRateLimiter is active
 */
export interface TransparentRateLimiter {
  /**
   * Check if request should be allowed
   * @param identifier Unique identifier (e.g., IP address, user ID)
   * @returns true if allowed (or if Redis unavailable - fail-open), false if rate limited
   */
  check(identifier: string): Promise<boolean>;

  /**
   * Get backend type for observability
   * @returns 'redis' | 'upstash' | 'allowall'
   */
  getBackendType(): 'redis' | 'upstash' | 'allowall';
}

/**
 * AllowAllRateLimiter - Used when Redis is unavailable
 *
 * Always allows requests (fail-open).
 * Application code works identically whether using AllowAllRateLimiter or RedisBackedRateLimiter.
 *
 * Logs warning on first check to alert monitoring systems.
 */
class AllowAllRateLimiter implements TransparentRateLimiter {
  private hasWarned = false;

  async check(identifier: string): Promise<boolean> {
    if (!this.hasWarned) {
      logger.warn(
        'AllowAllRateLimiter active - rate limiting disabled (Redis unavailable). All requests allowed (fail-open).'
      );
      this.hasWarned = true;
    }

    // Track metric for passthrough rate limiter usage
    rateLimiterCheckCounter.add(1, {
      result: 'allowed',
      backend: 'allowall',
    });

    return true; // ✅ FAIL-OPEN: Always allow request
  }

  getBackendType(): 'allowall' {
    return 'allowall';
  }
}

/**
 * RedisBackedRateLimiter - Real rate limiting with transparent error handling
 *
 * Wraps a Redis-backed rate limiter and handles all errors internally.
 * Errors are logged and fail-open (allow request) rather than throwing.
 */
class RedisBackedRateLimiter implements TransparentRateLimiter {
  private readonly componentLogger = logger.child({ component: 'RedisBackedRateLimiter' });

  constructor(private readonly backend: RateLimiterBackend) {}

  async check(identifier: string): Promise<boolean> {
    const startTime = Date.now();
    let result: 'allowed' | 'denied' | 'error' = 'allowed';
    let allowed = true;

    try {
      allowed = await this.backend.check(identifier);
      result = allowed ? 'allowed' : 'denied';
      rateLimiterCheckCounter.add(1, {
        result,
        backend: this.backend.getType(),
      });
      return allowed;
    } catch (error) {
      // ✅ TRANSPARENT: Log error but fail-open (allow request)
      // Better to allow request during outage than block legitimate users
      result = 'error';
      allowed = true;
      rateLimiterErrorCounter.add(1, {
        backend: this.backend.getType(),
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      this.componentLogger.error(
        { identifier, error: error instanceof Error ? error.message : String(error) },
        'Rate limit check failed - allowing request (fail-open)'
      );
      return true; // Fail-open
    } finally {
      const duration = Date.now() - startTime;
      rateLimiterCheckDuration.record(duration, {
        result,
        backend: this.backend.getType(),
      });
    }
  }

  getBackendType(): 'redis' | 'upstash' {
    return this.backend.getType();
  }
}

/**
 * Factory: Create transparent rate limiter that ALWAYS works
 *
 * CRITICAL: This function NEVER returns null. It always returns a rate limiter instance.
 *
 * When Redis is unavailable:
 * - Returns AllowAllRateLimiter (all checks return true - fail-open)
 * - Application code works identically
 * - Monitoring can detect when AllowAllRateLimiter is active
 *
 * Pattern matches: API gateways (fail-open on rate limiter failure)
 *
 * @param backend Redis-backed rate limiter (can be null if unavailable)
 * @returns TransparentRateLimiter instance - NEVER returns null
 */
export function createTransparentRateLimiter(
  backend: RateLimiterBackend | null
): TransparentRateLimiter {
  if (!backend) {
    logger.info('No rate limiter backend available - using AllowAllRateLimiter (fail-open)');
    return new AllowAllRateLimiter();
  }

  logger.info({ backendType: backend.getType() }, 'Creating RedisBackedRateLimiter');
  return new RedisBackedRateLimiter(backend);
}
