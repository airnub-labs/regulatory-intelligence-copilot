import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

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
 * Uses Redis if credentials are provided, otherwise falls back to in-memory
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  // Use Redis if both URL and token are provided
  if (config.redisUrl && config.redisToken) {
    return new RedisRateLimiter({
      redisUrl: config.redisUrl,
      redisToken: config.redisToken,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
    });
  }

  // Fall back to in-memory rate limiter
  console.warn(
    '[RateLimiter] Redis credentials not provided. Using in-memory rate limiter. ' +
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
