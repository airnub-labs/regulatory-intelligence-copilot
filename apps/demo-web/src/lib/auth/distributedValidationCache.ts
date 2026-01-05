/**
 * Distributed Validation Cache - Industry Standard Transparent Failover
 *
 * CRITICAL: This implementation follows the industry-standard transparent failover pattern.
 * Factory function NEVER returns null - always returns a cache instance.
 *
 * MULTI-INSTANCE SAFE: Uses Redis for distributed caching across multiple app instances.
 * When Redis unavailable: Uses PassThroughCache (transparent fail-through to database).
 *
 * Cache Control:
 * - ENABLE_AUTH_VALIDATION_CACHE: Individual flag for this cache (default: true)
 *
 * PRODUCTION: Set REDIS_URL/REDIS_PASSWORD environment variables for caching.
 * WITHOUT REDIS: PassThroughCache returns null on all gets (cache miss), no-ops on sets.
 *
 * Reference: CachingConversationStore (packages/reg-intel-conversations/src/conversationStores.ts:1013)
 */

import {
  createKeyValueClient,
  describeRedisBackendSelection,
  resolveRedisBackend,
  createTransparentCache,
  createRedisCacheBackend,
  type RedisKeyValueClient,
  type CacheBackend,
  type TransparentCache as BaseTransparentCache,
} from '@reg-copilot/reg-intel-cache';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('DistributedValidationCache');

/**
 * Individual flag to enable/disable auth validation caching specifically.
 * Set ENABLE_AUTH_VALIDATION_CACHE=false to disable this cache.
 * Defaults to true.
 */
const ENABLE_AUTH_VALIDATION_CACHE = process.env.ENABLE_AUTH_VALIDATION_CACHE !== 'false';

// Cache TTL: 5 minutes
const CACHE_TTL_SECONDS = 300;
const CACHE_PREFIX = 'copilot:auth:validation';

/**
 * Cache entry stored in Redis
 */
export interface CacheEntry {
  isValid: boolean;
  timestamp: number;
  tenantId?: string;
}

/**
 * Distributed cache interface for auth validation
 *
 * CRITICAL: This is ALWAYS available (never null).
 * When Redis unavailable, operations degrade gracefully (fail-through).
 */
export interface DistributedCache {
  /**
   * Get cached validation result
   * @returns null if cache miss OR if Redis unavailable (transparent)
   */
  get(userId: string): Promise<CacheEntry | null>;

  /**
   * Set validation result in cache
   * @returns void - No-op if Redis unavailable (transparent)
   */
  set(userId: string, isValid: boolean, tenantId?: string): Promise<void>;

  /**
   * Invalidate cached entry for user
   * @returns void - No-op if Redis unavailable (transparent)
   */
  invalidate(userId: string): Promise<void>;

  /**
   * Clear all tracked cache entries
   * @returns void - No-op if Redis unavailable (transparent)
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<{ size: number; maxSize: number; ttlMs: number; backend: string }>;

  /**
   * Get backend type for observability
   * @returns 'redis' | 'upstash' | 'passthrough'
   */
  getType(): 'redis' | 'upstash' | 'passthrough';
}

function buildKey(userId: string): string {
  return `${CACHE_PREFIX}:${userId}`;
}

/**
 * Adapter: Wraps TransparentCache to implement DistributedCache interface
 *
 * This provides the DistributedCache API (get, set, invalidate, clear, getStats)
 * while using TransparentCache internally for transparent failover.
 */
class DistributedValidationCache implements DistributedCache {
  private readonly touchedKeys = new Set<string>();

  constructor(
    private readonly transparentCache: BaseTransparentCache<CacheEntry>,
    private readonly ttlSeconds: number
  ) {}

  async get(userId: string): Promise<CacheEntry | null> {
    // ✅ Transparent: Returns null for BOTH cache miss AND Redis unavailable
    return this.transparentCache.get(buildKey(userId));
  }

  async set(userId: string, isValid: boolean, tenantId?: string): Promise<void> {
    const entry: CacheEntry = {
      isValid,
      timestamp: Date.now(),
      tenantId,
    };

    const key = buildKey(userId);
    this.touchedKeys.add(key);

    // ✅ Transparent: No-op if Redis unavailable
    await this.transparentCache.set(key, entry, this.ttlSeconds);
  }

  async invalidate(userId: string): Promise<void> {
    const key = buildKey(userId);
    this.touchedKeys.delete(key);

    // ✅ Transparent: No-op if Redis unavailable
    await this.transparentCache.del(key);

    logger.info({ userId }, 'Invalidated user validation cache');
  }

  async clear(): Promise<void> {
    if (this.touchedKeys.size === 0) return;

    // ✅ Transparent: No-op if Redis unavailable
    const keysToDelete = Array.from(this.touchedKeys);
    for (const key of keysToDelete) {
      await this.transparentCache.del(key);
    }

    logger.info({ clearedKeys: this.touchedKeys.size }, 'Cleared tracked validation cache entries');
    this.touchedKeys.clear();
  }

  async getStats() {
    const backendType = this.transparentCache.getBackendType();
    return {
      size: this.touchedKeys.size,
      maxSize: Infinity, // Redis has no hard limit (memory-bound)
      ttlMs: this.ttlSeconds * 1000,
      backend: backendType,
    };
  }

  getType(): 'redis' | 'upstash' | 'passthrough' {
    return this.transparentCache.getBackendType();
  }
}

/**
 * Factory: Create distributed validation cache
 *
 * CRITICAL: This function NEVER returns null. It always returns a cache instance.
 *
 * When Redis is unavailable:
 * - Returns DistributedValidationCache with PassThroughCache
 * - get() returns null (cache miss behavior)
 * - set() / invalidate() / clear() are no-ops
 * - Application code works identically
 *
 * Pattern matches: CachingConversationStore, Redis client libraries
 *
 * @returns DistributedCache instance - NEVER returns null
 */
function createDistributedCache(): DistributedCache {
  let cacheBackend: CacheBackend | null = null;
  let backendType: 'redis' | 'upstash' | null = null;

  if (ENABLE_AUTH_VALIDATION_CACHE) {
    const backend = resolveRedisBackend('cache');
    const client = backend ? createKeyValueClient(backend) : null;

    if (backend && client) {
      cacheBackend = createRedisCacheBackend(client);
      backendType = backend.backend; // 'redis' or 'upstash' from ResolvedBackend discriminant

      const summary = describeRedisBackendSelection(backend);
      logger.info({ backend: summary }, 'Using Redis validation cache');
    } else {
      const reason = !backend ? 'Redis backend not configured' : 'Redis client unavailable';
      logger.info({ reason }, 'PassThroughCache active - no caching (fail-through to database)');
    }
  } else {
    logger.info('Auth validation cache disabled via ENABLE_AUTH_VALIDATION_CACHE=false');
  }

  // ✅ Create TransparentCache (NEVER returns null)
  const transparentCache = createTransparentCache<CacheEntry>(
    cacheBackend,
    backendType,
    {
      defaultTtlSeconds: CACHE_TTL_SECONDS,
      serialize: (entry: CacheEntry) => JSON.stringify(entry),
      deserialize: (raw: string) => JSON.parse(raw) as CacheEntry,
    }
  );

  // ✅ Wrap in DistributedCache adapter
  return new DistributedValidationCache(transparentCache, CACHE_TTL_SECONDS);
}

// Singleton instance - NEVER null
const validationCache: DistributedCache = createDistributedCache();

/**
 * Get the distributed cache instance
 *
 * CRITICAL: This function NEVER returns null. It always returns a cache instance.
 *
 * When Redis is unavailable, returns cache with PassThroughCache behavior:
 * - get() returns null (cache miss)
 * - set() / invalidate() are no-ops
 *
 * Application code NEVER needs to check for null.
 *
 * @returns DistributedCache instance - NEVER returns null
 */
export function getValidationCache(): DistributedCache {
  return validationCache;
}
