import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

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
  /**
   * Redis URL (optional - if not provided, uses in-memory fallback)
   */
  redisUrl?: string;
  /**
   * Redis token/password (optional)
   */
  redisToken?: string;
}

/**
 * Rate limiter interface
 */
export interface RateLimiter {
  /**
   * Check if a request from the given identifier is allowed
   * @param identifier - Unique identifier (e.g., IP address, user ID)
   * @returns Promise<boolean> - true if allowed, false if rate limited
   */
  check(identifier: string): Promise<boolean>;
  /**
   * Get the type of rate limiter being used
   */
  getType(): 'redis' | 'memory';
}

/**
 * Redis-based distributed rate limiter
 * Uses Upstash Redis for scalable, multi-instance rate limiting
 */
class RedisRateLimiter implements RateLimiter {
  private ratelimit: Ratelimit;

  constructor(config: Required<Pick<RateLimiterConfig, 'redisUrl' | 'redisToken' | 'maxRequests' | 'windowMs'>>) {
    const redis = new Redis({
      url: config.redisUrl,
      token: config.redisToken,
    });

    // Use sliding window algorithm for smoother rate limiting
    this.ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        config.maxRequests,
        `${Math.floor(config.windowMs / 1000)} s`
      ),
      analytics: true,
      prefix: 'ratelimit:client-telemetry',
    });
  }

  async check(identifier: string): Promise<boolean> {
    try {
      const { success } = await this.ratelimit.limit(identifier);
      return success;
    } catch (error) {
      // On Redis errors, log and allow the request (fail open)
      console.error('Redis rate limiter error:', error);
      return true;
    }
  }

  getType(): 'redis' {
    return 'redis';
  }
}

/**
 * In-memory rate limiter fallback
 * For development or when Redis is not available
 * WARNING: Not suitable for production with multiple instances
 */
class MemoryRateLimiter implements RateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();
  private config: Pick<RateLimiterConfig, 'maxRequests' | 'windowMs'>;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: Pick<RateLimiterConfig, 'maxRequests' | 'windowMs'>) {
    this.config = config;

    // Clean up expired entries periodically
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.store.entries()) {
        if (value.resetAt < now) {
          this.store.delete(key);
        }
      }
    }, config.windowMs * 2);

    // Unref to prevent keeping the process alive
    this.cleanupInterval.unref();
  }

  async check(identifier: string): Promise<boolean> {
    const now = Date.now();
    const entry = this.store.get(identifier);

    if (!entry || entry.resetAt < now) {
      // First request or window expired
      this.store.set(identifier, {
        count: 1,
        resetAt: now + this.config.windowMs,
      });
      return true;
    }

    if (entry.count >= this.config.maxRequests) {
      // Rate limit exceeded
      return false;
    }

    // Increment count
    entry.count++;
    return true;
  }

  getType(): 'memory' {
    return 'memory';
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Create a rate limiter instance
 * Uses Redis if global flag AND individual flag are both enabled and credentials are provided
 * Otherwise falls back to in-memory
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  // Use Redis only if global flag AND individual flag AND credentials are all present
  if (ENABLE_REDIS_CACHING && ENABLE_RATE_LIMITER_REDIS && config.redisUrl && config.redisToken) {
    console.log(
      '[RateLimiter] Using Redis rate limiter ' +
      `(globalCaching=${ENABLE_REDIS_CACHING}, rateLimiterRedis=${ENABLE_RATE_LIMITER_REDIS})`
    );
    return new RedisRateLimiter({
      redisUrl: config.redisUrl,
      redisToken: config.redisToken,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
    });
  }

  // Fall back to in-memory rate limiter
  const reason = !ENABLE_REDIS_CACHING
    ? 'global caching disabled via ENABLE_REDIS_CACHING=false'
    : !ENABLE_RATE_LIMITER_REDIS
    ? 'rate limiter Redis disabled via ENABLE_RATE_LIMITER_REDIS=false'
    : 'Redis credentials not provided';

  console.warn(
    `[RateLimiter] Using in-memory rate limiter (reason: ${reason}). ` +
    'This is not recommended for production deployments with multiple instances.'
  );

  return new MemoryRateLimiter({
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
  });
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
    const maxRequests = parseInt(
      process.env.CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS || '100',
      10
    ) || 100;

    const windowMs = parseInt(
      process.env.CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS || '60000',
      10
    ) || 60000;

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;

    rateLimiterInstance = createRateLimiter({
      maxRequests,
      windowMs,
      redisUrl,
      redisToken,
    });

    console.log(
      `[RateLimiter] Initialized ${rateLimiterInstance.getType()} rate limiter ` +
      `(${maxRequests} requests per ${windowMs}ms)`
    );
  }

  return rateLimiterInstance;
}
