/**
 * Distributed Validation Cache
 *
 * MULTI-INSTANCE SAFE: Uses Redis for distributed caching across multiple app instances.
 * Falls back gracefully to in-memory cache if Redis is unavailable (single-instance mode).
 *
 * Cache Control:
 * - ENABLE_REDIS_CACHING: Global kill switch for all Redis caching (default: true)
 * - ENABLE_AUTH_VALIDATION_CACHE: Individual flag for this cache (default: true)
 * - Both flags must be true for Redis caching to be enabled
 *
 * PRODUCTION: Set REDIS_URL/REDIS_PASSWORD environment variables for multi-instance deployments.
 * DEVELOPMENT: Works without Redis (in-memory cache only).
 */

import {
  createKeyValueClient,
  resolveRedisBackend,
  summarizeBackend,
  type RedisKeyValueClient,
} from '@reg-copilot/reg-intel-cache';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('DistributedValidationCache');

/**
 * Global kill switch to disable ALL Redis caching across the application.
 * Set ENABLE_REDIS_CACHING=false to disable all caching (e.g., during debugging/disaster recovery).
 * Defaults to true.
 */
const ENABLE_REDIS_CACHING = process.env.ENABLE_REDIS_CACHING !== 'false';

/**
 * Individual flag to enable/disable auth validation caching specifically.
 * Set ENABLE_AUTH_VALIDATION_CACHE=false to disable this cache.
 * Defaults to true.
 *
 * Requires ENABLE_REDIS_CACHING=true to have any effect.
 */
const ENABLE_AUTH_VALIDATION_CACHE = process.env.ENABLE_AUTH_VALIDATION_CACHE !== 'false';

// Cache TTL: 5 minutes (as requested by user)
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_TTL_SECONDS = 300; // 5 minutes for Redis
const CACHE_PREFIX = 'auth:validation';

// Max cache size for in-memory fallback: 10,000 users
const MAX_CACHE_SIZE = 10000;

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
 * In-memory cache implementation (for development/single-instance deployments)
 */
class MemoryCache implements DistributedCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  async get(userId: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    // Expire entries after TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(userId);
      return null;
    }

    return entry;
  }

  async set(userId: string, isValid: boolean, tenantId?: string): Promise<void> {
    // Enforce max size by evicting oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(userId, {
      isValid,
      timestamp: Date.now(),
      tenantId,
    });
  }

  async invalidate(userId: string): Promise<void> {
    this.cache.delete(userId);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: CACHE_TTL_MS,
      backend: 'memory',
    };
  }
}

function createRedisCache(): DistributedCache | null {
  if (!ENABLE_REDIS_CACHING || !ENABLE_AUTH_VALIDATION_CACHE) {
    return null;
  }

  const backend = resolveRedisBackend('cache');
  const client = backend ? createKeyValueClient(backend) : null;
  if (!backend || !client) {
    const reason = !backend ? 'Redis backend not configured' : 'Redis client unavailable';
    logger.info({ reason }, 'Using in-memory validation cache');
    return null;
  }

  const summary = summarizeBackend(backend);
  logger.info({ backend: summary }, 'Using Redis validation cache');
  return new RedisCache(client, summary.backend);
}

/**
 * Factory to get the appropriate distributed cache implementation
 */
function createDistributedCache(): DistributedCache {
  const redisCache = createRedisCache();
  if (redisCache) return redisCache;

  const reason = !ENABLE_REDIS_CACHING
    ? 'global caching disabled via ENABLE_REDIS_CACHING=false'
    : !ENABLE_AUTH_VALIDATION_CACHE
    ? 'auth validation cache disabled via ENABLE_AUTH_VALIDATION_CACHE=false'
    : 'Redis credentials not configured';

  logger.warn({ reason }, 'Falling back to in-memory validation cache');
  return new MemoryCache(MAX_CACHE_SIZE);
}

// Singleton instance
const validationCache = createDistributedCache();

/**
 * Get the distributed cache instance
 */
export function getValidationCache(): DistributedCache {
  return validationCache;
}
