import Redis from 'ioredis';
import { createRequire } from 'module';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { RateLimiter, ResolvedBackend } from './types.js';

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

/**
 * No-op rate limiter that always allows requests.
 * Used when Redis/Upstash is unavailable to fail-open (allow all traffic).
 *
 * This prevents memory accumulation and ensures predictable behavior during outages.
 * Production deployments should configure Redis/Upstash for actual rate limiting.
 */
class NoOpRateLimiter implements RateLimiter {
  async check(identifier: string): Promise<boolean> {
    return true; // Always allow - fail-open
  }

  getType(): 'noop' {
    return 'noop';
  }
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

class UpstashRateLimiter implements RateLimiter {
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
    try {
      const { success } = await this.ratelimit.limit(identifier);
      return success;
    } catch (error) {
      logger.error({ error }, '[rate-limit] Upstash error, failing open');
      return true;
    }
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

class RedisSlidingWindowRateLimiter implements RateLimiter {
  constructor(
    private readonly client: Redis,
    private readonly options: SlidingWindowLimiterOptions,
  ) {}

  async check(identifier: string): Promise<boolean> {
    const now = Date.now();
    const member = `${now}-${Math.random()}`;
    try {
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
    } catch (error) {
      logger.error({ error }, '[rate-limit] Redis error, failing open');
      return true;
    }
  }

  getType(): 'redis' {
    return 'redis';
  }
}

export function createRateLimiter(
  backend: ResolvedBackend | null,
  options: SlidingWindowLimiterOptions,
): RateLimiter {
  if (!backend) {
    logger.warn('[rate-limit] No backend configured, failing open (allowing all requests)');
    return new NoOpRateLimiter();
  }

  if (backend.backend === 'redis') {
    return new RedisSlidingWindowRateLimiter(new Redis(backend.url, backend.password ? { password: backend.password } : undefined), options);
  }

  return new UpstashRateLimiter(backend, options);
}

export function createFailOpenRateLimiter(
  backend: ResolvedBackend | null,
  options: SlidingWindowLimiterOptions,
): RateLimiter {
  try {
    return createRateLimiter(backend, options);
  } catch (error) {
    logger.error({ error }, '[rate-limit] Failed to create backend limiter, failing open (allowing all requests)');
    return new NoOpRateLimiter();
  }
}
