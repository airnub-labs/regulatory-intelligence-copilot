import { Ratelimit } from '@upstash/ratelimit';
import Redis from 'ioredis';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { RateLimiter, ResolvedBackend } from './types.js';

const logger = createLogger('RateLimiter');

export interface SlidingWindowLimiterOptions {
  windowMs: number;
  limit: number;
  prefix?: string;
}

class MemoryRateLimiter implements RateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();
  private cleanup: NodeJS.Timeout;

  constructor(private readonly options: SlidingWindowLimiterOptions) {
    this.cleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.store.entries()) {
        if (value.resetAt <= now) {
          this.store.delete(key);
        }
      }
    }, options.windowMs * 2);
    this.cleanup.unref();
  }

  async check(identifier: string): Promise<boolean> {
    const now = Date.now();
    const entry = this.store.get(identifier);
    if (!entry || entry.resetAt <= now) {
      this.store.set(identifier, { count: 1, resetAt: now + this.options.windowMs });
      return true;
    }

    if (entry.count >= this.options.limit) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  getType(): 'memory' {
    return 'memory';
  }
}

class UpstashRateLimiter implements RateLimiter {
  private readonly ratelimit: Ratelimit;

  constructor(backend: Extract<ResolvedBackend, { backend: 'upstash' }>, options: SlidingWindowLimiterOptions) {
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
    logger.warn('[rate-limit] No backend configured, using memory limiter');
    return new MemoryRateLimiter(options);
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
    logger.error({ error }, '[rate-limit] Failed to create backend limiter, using memory');
    return new MemoryRateLimiter(options);
  }
}
