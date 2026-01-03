/**
 * Transparent Cache - Industry Standard Failover Pattern
 *
 * This module implements the industry-standard cache pattern where Redis
 * failures are completely transparent to application code.
 *
 * Key principle: Cache miss and Redis unavailable should be indistinguishable
 * to the application. Factory functions NEVER return null.
 *
 * Reference: CachingConversationStore (packages/reg-intel-conversations/src/conversationStores.ts:1013)
 */

import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('TransparentCache');

/**
 * Backend interface for cache operations
 */
export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * Transparent cache interface - ALWAYS available (never null)
 *
 * When Redis is unavailable, operations degrade gracefully:
 * - get() returns null (cache miss)
 * - set() is a no-op (silent)
 * - del() is a no-op (silent)
 */
export interface TransparentCache<T> {
  /**
   * Get value from cache
   * @returns null if cache miss OR if Redis unavailable (transparent)
   */
  get(key: string): Promise<T | null>;

  /**
   * Set value in cache
   * @param ttlSeconds Optional TTL override (uses default if not specified)
   * @returns void - No-op if Redis unavailable (transparent)
   */
  set(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete value from cache
   * @returns void - No-op if Redis unavailable (transparent)
   */
  del(key: string): Promise<void>;

  /**
   * Get backend type for observability
   * @returns 'redis' | 'upstash' | 'passthrough'
   */
  getBackendType(): 'redis' | 'upstash' | 'passthrough';
}

/**
 * PassThroughCache - Used when Redis is unavailable
 *
 * All operations are no-ops or return cache misses.
 * Application code works identically whether using PassThroughCache or RedisBackedCache.
 */
class PassThroughCache<T> implements TransparentCache<T> {
  private hasWarned = false;

  async get(key: string): Promise<T | null> {
    if (!this.hasWarned) {
      logger.warn('PassThroughCache active - all cache operations disabled (Redis unavailable)');
      this.hasWarned = true;
    }
    return null; // Always cache miss
  }

  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    // No-op - silently accept writes
  }

  async del(key: string): Promise<void> {
    // No-op - silently accept deletes
  }

  getBackendType(): 'passthrough' {
    return 'passthrough';
  }
}

/**
 * RedisBackedCache - Real cache with transparent error handling
 *
 * Wraps a Redis backend and handles all errors internally.
 * Errors are logged but never thrown - they become cache misses.
 */
class RedisBackedCache<T> implements TransparentCache<T> {
  private readonly componentLogger = logger.child({ component: 'RedisBackedCache' });

  constructor(
    private readonly backend: CacheBackend,
    private readonly backendType: 'redis' | 'upstash',
    private readonly options: {
      defaultTtlSeconds?: number;
      serialize?: (value: T) => string;
      deserialize?: (raw: string) => T;
    } = {}
  ) {}

  async get(key: string): Promise<T | null> {
    try {
      const raw = await this.backend.get(key);
      if (!raw) return null;

      const deserialize = this.options.deserialize ?? ((s: string) => JSON.parse(s) as T);
      return deserialize(raw);
    } catch (error) {
      // ✅ TRANSPARENT: Log warning but return null (cache miss)
      // Application code doesn't know if this was a cache miss or Redis error
      this.componentLogger.warn(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Cache get failed - treating as cache miss'
      );
      return null;
    }
  }

  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialize = this.options.serialize ?? ((v: T) => JSON.stringify(v));
      const raw = serialize(value);
      const ttl = ttlSeconds ?? this.options.defaultTtlSeconds ?? 300;

      await this.backend.set(key, raw, ttl);
    } catch (error) {
      // ✅ TRANSPARENT: Log warning but don't throw
      // Application code continues normally
      this.componentLogger.warn(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Cache set failed - continuing without cache'
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.backend.del(key);
    } catch (error) {
      // ✅ TRANSPARENT: Log warning but don't throw
      this.componentLogger.warn(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Cache delete failed - continuing'
      );
    }
  }

  getBackendType(): 'redis' | 'upstash' {
    return this.backendType;
  }
}

/**
 * Factory: Create transparent cache that ALWAYS works
 *
 * CRITICAL: This function NEVER returns null. It always returns a cache instance.
 *
 * When Redis is unavailable:
 * - Returns PassThroughCache (all gets return null, all sets/dels are no-ops)
 * - Application code works identically
 * - Cache miss and Redis unavailable are indistinguishable
 *
 * Pattern matches: CachingConversationStore, Redis client libraries, Memcached
 *
 * @param backend Redis backend (can be null if unavailable)
 * @param backendType Backend type for observability
 * @param options Serialization and TTL configuration
 * @returns TransparentCache instance - NEVER returns null
 */
export function createTransparentCache<T>(
  backend: CacheBackend | null,
  backendType: 'redis' | 'upstash' | null,
  options: {
    defaultTtlSeconds?: number;
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
  } = {}
): TransparentCache<T> {
  if (!backend || !backendType) {
    logger.info('No cache backend available - using PassThroughCache (all cache misses)');
    return new PassThroughCache<T>();
  }

  logger.info({ backendType }, 'Creating RedisBackedCache');
  return new RedisBackedCache<T>(backend, backendType, options);
}
