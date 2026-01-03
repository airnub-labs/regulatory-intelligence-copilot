/**
 * Rate Limiter - Industry Standard Transparent Failover
 *
 * CRITICAL: This implementation follows the industry-standard transparent failover pattern.
 * Factory function NEVER returns null - always returns a rate limiter instance.
 *
 * MULTI-INSTANCE SAFE: Uses Redis/Upstash for distributed rate limiting across instances.
 * When Redis unavailable: Uses AllowAllRateLimiter (transparent fail-open).
 *
 * PRODUCTION: Set REDIS_URL/UPSTASH_URL environment variables for rate limiting.
 * WITHOUT REDIS: AllowAllRateLimiter allows all requests (fail-open).
 *
 * Reference: TransparentRateLimiter (packages/reg-intel-cache/src/transparentRateLimiter.ts)
 */

import Redis from 'ioredis';
import { createRequire } from 'module';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { ResolvedBackend } from './types.js';
import { createTransparentRateLimiter, type RateLimiterBackend, type TransparentRateLimiter } from './transparentRateLimiter.js';

const logger = createLogger('RateLimiter');
const require = createRequire(import.meta.url);

interface UpstashRateLimitInstance {
  limit(identifier: string): Promise<{ success: boolean } | { success: boolean; reset: number }>;
}

type UpstashRateLimitConstructor = {
  new (config: {
    redis: { url: string; token: string };
    limiter: unknown;
    analytics?: boolean;
    prefix?: string;
  }): UpstashRateLimitInstance;
  slidingWindow(limit: number, window: string): unknown;
};

export interface SlidingWindowLimiterOptions {
  windowMs: number;
  limit: number;
  prefix?: string;
}

let upstashRateLimitConstructor: UpstashRateLimitConstructor | null = null;

function loadUpstashRateLimitConstructor(): UpstashRateLimitConstructor {
  if (upstashRateLimitConstructor) return upstashRateLimitConstructor;

  try {
    const mod = require('@upstash/ratelimit') as { Ratelimit: UpstashRateLimitConstructor };
    upstashRateLimitConstructor = mod.Ratelimit;
    return upstashRateLimitConstructor;
  } catch (error) {
    const message =
      'Upstash rate limiter selected but @upstash/ratelimit is not installed. Add it to optionalDependencies or disable Upstash.';
    logger.error({ error }, message);
    throw new Error(message);
  }
}

/**
 * Upstash Rate Limiter Backend
 *
 * Implements RateLimiterBackend for Upstash.
 * Errors are thrown and handled by TransparentRateLimiter wrapper (fail-open).
 */
class UpstashRateLimiterBackend implements RateLimiterBackend {
  private readonly ratelimit: UpstashRateLimitInstance;

  constructor(backend: Extract<ResolvedBackend, { backend: 'upstash' }>, options: SlidingWindowLimiterOptions) {
    const Ratelimit = loadUpstashRateLimitConstructor();

    this.ratelimit = new Ratelimit({
      redis: {
        url: backend.url,
        token: backend.token,
      },
      limiter: Ratelimit.slidingWindow(options.limit, `${Math.floor(options.windowMs / 1000)} s`),
      analytics: true,
      prefix: options.prefix ?? 'copilot:ratelimit',
    });
  }

  async check(identifier: string): Promise<boolean> {
    // ✅ No try-catch - let errors propagate to TransparentRateLimiter
    const { success } = await this.ratelimit.limit(identifier);
    return success;
  }

  getType(): 'upstash' {
    return 'upstash';
  }
}

const LUA_SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local cutoff = now - window

redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, count + 1}
end
return {0, count}
`;

/**
 * Redis Sliding Window Rate Limiter Backend
 *
 * Implements RateLimiterBackend using Redis with Lua script for atomic sliding window.
 * Errors are thrown and handled by TransparentRateLimiter wrapper (fail-open).
 */
class RedisSlidingWindowRateLimiterBackend implements RateLimiterBackend {
  constructor(
    private readonly client: Redis,
    private readonly options: SlidingWindowLimiterOptions,
  ) {}

  async check(identifier: string): Promise<boolean> {
    const now = Date.now();
    const member = `${now}-${Math.random()}`;

    // ✅ No try-catch - let errors propagate to TransparentRateLimiter
    const result = (await this.client.eval(
      LUA_SLIDING_WINDOW,
      1,
      `${this.options.prefix ?? 'copilot:ratelimit'}:${identifier}`,
      now,
      this.options.windowMs,
      this.options.limit,
      member,
    )) as [number, number];

    const allowed = Array.isArray(result) ? result[0] === 1 : Boolean(result);
    return allowed;
  }

  getType(): 'redis' {
    return 'redis';
  }
}

/**
 * Create rate limiter with transparent failover
 *
 * CRITICAL: This function NEVER returns null. It always returns a rate limiter instance.
 *
 * When Redis/Upstash unavailable:
 * - Returns TransparentRateLimiter with AllowAllRateLimiter backend
 * - check() returns true (fail-open)
 * - Application code works identically
 *
 * Pattern matches: TransparentCache, Redis client libraries
 *
 * @returns TransparentRateLimiter instance - NEVER returns null
 */
export function createRateLimiter(
  backend: ResolvedBackend | null,
  options: SlidingWindowLimiterOptions,
): TransparentRateLimiter {
  let rateLimiterBackend: RateLimiterBackend | null = null;

  if (backend) {
    try {
      if (backend.backend === 'redis') {
        const redisClient = new Redis(
          backend.url,
          backend.password ? { password: backend.password } : undefined
        );
        rateLimiterBackend = new RedisSlidingWindowRateLimiterBackend(redisClient, options);
        logger.info({ backend: 'redis' }, 'Created Redis rate limiter backend');
      } else {
        rateLimiterBackend = new UpstashRateLimiterBackend(backend, options);
        logger.info({ backend: 'upstash' }, 'Created Upstash rate limiter backend');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to create rate limiter backend - falling back to AllowAllRateLimiter');
      rateLimiterBackend = null;
    }
  } else {
    logger.info('No backend configured - using AllowAllRateLimiter (fail-open)');
  }

  // ✅ Create TransparentRateLimiter (NEVER returns null)
  return createTransparentRateLimiter(rateLimiterBackend);
}

/**
 * @deprecated Use createRateLimiter instead - it now has built-in fail-open behavior via TransparentRateLimiter
 */
export function createFailOpenRateLimiter(
  backend: ResolvedBackend | null,
  options: SlidingWindowLimiterOptions,
): TransparentRateLimiter {
  logger.warn('createFailOpenRateLimiter is deprecated - use createRateLimiter instead (built-in fail-open)');
  return createRateLimiter(backend, options);
}
