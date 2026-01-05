/**
 * CacheBackend Adapter Utilities
 *
 * Bridges RedisKeyValueClient and CacheBackend interfaces.
 *
 * Signature differences:
 * - RedisKeyValueClient.setex(key, ttl, value) → CacheBackend.set(key, value, ttl)
 * - RedisKeyValueClient.del(...keys) → CacheBackend.del(key)
 */

import type { RedisKeyValueClient } from './types.js';
import type { CacheBackend } from './transparentCache.js';

/**
 * Create CacheBackend adapter for RedisKeyValueClient
 *
 * This adapter bridges the signature differences between RedisKeyValueClient
 * and the standard CacheBackend interface used by TransparentCache.
 *
 * @param client Redis client to adapt
 * @returns CacheBackend implementation
 */
export function createRedisCacheBackend(client: RedisKeyValueClient): CacheBackend {
  return {
    async get(key: string): Promise<string | null> {
      return client.get(key);
    },

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
      await client.setex(key, ttlSeconds, value);
    },

    async del(key: string): Promise<void> {
      await client.del(key);
    },
  };
}
