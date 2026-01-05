/**
 * PassThrough Redis Client - Industry Standard Transparent Failover
 *
 * CRITICAL: This implementation provides a no-op Redis client for transparent failover.
 * Used when Redis is unavailable - all operations are no-ops, get() returns null.
 *
 * Pattern: Same as PassThroughCache - transparent failover without null checks
 *
 * Usage:
 * ```typescript
 * const redisClient = options.redis ?? createPassThroughRedis();
 * // redisClient is NEVER null - always a valid RedisKeyValueClient
 *
 * const value = await redisClient.get(key);  // null (always cache miss)
 * await redisClient.set(key, value, ttl);    // no-op
 * ```
 */

import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { RedisKeyValueClient } from './types.js';

const logger = createLogger('PassThroughRedis');

/**
 * PassThrough Redis Client
 *
 * Implements RedisKeyValueClient with no-op behavior.
 * Used when Redis is unavailable for transparent failover.
 *
 * Behavior:
 * - get() returns null (simulates cache miss)
 * - set() is no-op (writes are ignored)
 * - del() is no-op (deletes are ignored)
 * - ping() returns "PASSTHROUGH" (identifies type)
 */
export class PassThroughRedis implements RedisKeyValueClient {
  private warnedOnce = false;

  async get(_key: string): Promise<null> {
    if (!this.warnedOnce) {
      logger.warn('PassThroughRedis active - all cache operations are no-ops (Redis unavailable)');
      this.warnedOnce = true;
    }
    return null; // Always cache miss
  }

  async set(_key: string, _value: string, _ttlSeconds?: number): Promise<void> {
    // No-op - write ignored
  }

  async del(_key: string): Promise<void> {
    // No-op - delete ignored
  }

  async ping(): Promise<string> {
    return 'PASSTHROUGH';
  }
}

/**
 * Create a PassThrough Redis client
 *
 * Factory function for consistency with other patterns.
 * Always returns a PassThroughRedis instance.
 *
 * @returns PassThroughRedis instance - NEVER returns null
 */
export function createPassThroughRedis(): RedisKeyValueClient {
  return new PassThroughRedis();
}
