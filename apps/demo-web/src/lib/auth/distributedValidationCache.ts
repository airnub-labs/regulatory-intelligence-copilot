/**
 * Distributed Validation Cache
 *
 * MULTI-INSTANCE SAFE: Uses Redis for distributed caching across multiple app instances.
 * Fails through to database (Supabase) if Redis is unavailable.
 *
 * Cache Control:
 * - ENABLE_AUTH_VALIDATION_CACHE: Individual flag for this cache (default: true)
 *
 * PRODUCTION: Set REDIS_URL/REDIS_PASSWORD environment variables for caching.
 * WITHOUT REDIS: All validation requests hit Supabase (no caching, no memory accumulation).
 */

import {
  createKeyValueClient,
  describeRedisBackendSelection,
  resolveRedisBackend,
  type RedisKeyValueClient,
} from '@reg-copilot/reg-intel-cache';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('DistributedValidationCache');

/**
 * Individual flag to enable/disable auth validation caching specifically.
 * Set ENABLE_AUTH_VALIDATION_CACHE=false to disable this cache.
 * Defaults to true.
 */
const ENABLE_AUTH_VALIDATION_CACHE = process.env.ENABLE_AUTH_VALIDATION_CACHE !== 'false';

// Cache TTL: 5 minutes (as requested by user)
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_TTL_SECONDS = 300; // 5 minutes for Redis
const CACHE_PREFIX = 'auth:validation';

// Removed: in-memory fallback (now uses no-op cache when Redis unavailable)

interface CacheEntry {
  isValid: boolean;
  timestamp: number;
  tenantId?: string;
}

interface DistributedCache {
  get(userId: string): Promise<CacheEntry | null>;
  set(userId: string, isValid: boolean, tenantId?: string): Promise<void>;
  invalidate(userId: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<{ size: number; maxSize: number; ttlMs: number; backend: string }>;
}

function buildKey(userId: string): string {
  return `${CACHE_PREFIX}:${userId}`;
}

/**
 * Redis cache implementation (for multi-instance deployments)
 */
class RedisCache implements DistributedCache {
  private readonly touchedKeys = new Set<string>();

  constructor(private readonly client: RedisKeyValueClient, private readonly backendLabel: string) {}

  async get(userId: string): Promise<CacheEntry | null> {
    try {
      const cached = await this.client.get(buildKey(userId));
      if (!cached) return null;
      return JSON.parse(cached) as CacheEntry;
    } catch (error) {
      logger.error({ error, userId }, 'Redis cache get failed');
      return null;
    }
  }

  async set(userId: string, isValid: boolean, tenantId?: string): Promise<void> {
    try {
      const entry: CacheEntry = {
        isValid,
        timestamp: Date.now(),
        tenantId,
      };

      const key = buildKey(userId);
      this.touchedKeys.add(key);
      await this.client.setex(key, CACHE_TTL_SECONDS, JSON.stringify(entry));
    } catch (error) {
      logger.error({ error, userId }, 'Redis cache set failed');
    }
  }

  async invalidate(userId: string): Promise<void> {
    const key = buildKey(userId);
    try {
      await this.client.del(key);
      this.touchedKeys.delete(key);
      logger.info({ userId }, 'Invalidated user validation cache');
    } catch (error) {
      logger.error({ error, userId }, 'Redis cache invalidate failed');
    }
  }

  async clear(): Promise<void> {
    if (this.touchedKeys.size === 0) return;

    try {
      await this.client.del(...Array.from(this.touchedKeys));
      logger.info({ clearedKeys: this.touchedKeys.size }, 'Cleared tracked validation cache entries');
      this.touchedKeys.clear();
    } catch (error) {
      logger.error({ error }, 'Redis cache clear failed');
    }
  }

  async getStats() {
    return {
      size: this.touchedKeys.size,
      maxSize: Infinity, // Redis has no hard limit (memory-bound)
      ttlMs: CACHE_TTL_MS,
      backend: this.backendLabel,
    };
  }
}

/**
 * No-op cache implementation that always misses (fail-through).
 * Used when Redis is unavailable to prevent memory accumulation.
 *
 * This ensures predictable behavior during outages - validation always hits
 * the database (Supabase) which can handle the load.
 *
 * Production deployments should configure Redis for actual caching.
 */
class NoOpCache implements DistributedCache {
  async get(userId: string): Promise<CacheEntry | null> {
    return null; // Always miss - fail-through to database
  }

  async set(userId: string, isValid: boolean, tenantId?: string): Promise<void> {
    // No-op - don't store anything
  }

  async invalidate(userId: string): Promise<void> {
    // No-op - nothing to invalidate
  }

  async clear(): Promise<void> {
    // No-op - nothing to clear
  }

  async getStats() {
    return {
      size: 0,
      maxSize: 0,
      ttlMs: 0,
      backend: 'noop',
    };
  }
}

function createRedisCache(): DistributedCache | null {
  if (!ENABLE_AUTH_VALIDATION_CACHE) {
    return null;
  }

  const backend = resolveRedisBackend('cache');
  const client = backend ? createKeyValueClient(backend) : null;
  if (!backend || !client) {
    const reason = !backend ? 'Redis backend not configured' : 'Redis client unavailable';
    logger.info({ reason }, 'No caching (will query database on every request)');
    return null;
  }

  const summary = describeRedisBackendSelection(backend);
  logger.info({ backend: summary }, 'Using Redis validation cache');
  return new RedisCache(client, summary.backend);
}

/**
 * Factory to get the appropriate distributed cache implementation
 */
function createDistributedCache(): DistributedCache {
  const redisCache = createRedisCache();
  if (redisCache) return redisCache;

  const reason = !ENABLE_AUTH_VALIDATION_CACHE
    ? 'auth validation cache disabled via ENABLE_AUTH_VALIDATION_CACHE=false'
    : 'Redis credentials not configured';

  logger.warn({ reason }, 'Using no-op cache (fail-through to database)');
  return new NoOpCache();
}

// Singleton instance
const validationCache = createDistributedCache();

/**
 * Get the distributed cache instance
 */
export function getValidationCache(): DistributedCache {
  return validationCache;
}
