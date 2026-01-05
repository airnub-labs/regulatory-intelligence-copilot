/**
 * Cache Backend Adapter
 *
 * Adapts RedisKeyValueClient to CacheBackend interface for use with TransparentCache.
 * Bridges the difference in method signatures between the two interfaces.
 */

import type { RedisKeyValueClient } from './types.js';
import type { CacheBackend } from './transparentCache.js';

/**
 * Adapter that wraps RedisKeyValueClient to match CacheBackend interface
 */
export class RedisCacheBackendAdapter implements CacheBackend {
  constructor(private readonly redis: RedisKeyValueClient) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // RedisKeyValueClient uses setex(key, ttl, value) while CacheBackend uses set(key, value, ttl)
    await this.redis.setex(key, ttlSeconds, value);
  }

  async del(key: string): Promise<void> {
    // RedisKeyValueClient del accepts varargs, but we only need single key
    await this.redis.del(key);
  }
}
