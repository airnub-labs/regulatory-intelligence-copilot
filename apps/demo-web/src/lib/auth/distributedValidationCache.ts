/**
 * Distributed Validation Cache
 *
 * MULTI-INSTANCE SAFE: Uses Redis for distributed caching across multiple app instances.
 * Falls back gracefully to in-memory cache if Redis is unavailable (single-instance mode).
 *
 * PRODUCTION: Set REDIS_URL environment variable for multi-instance deployments.
 * DEVELOPMENT: Works without Redis (in-memory cache only).
 */

import { createLogger } from '@reg-copilot/reg-intel-observability'

// Type definition for ioredis (optional dependency, dynamically imported at runtime)
interface Redis {
  get(key: string): Promise<string | null>
  setex(key: string, seconds: number, value: string): Promise<void>
  del(...keys: string[]): Promise<number>
  keys(pattern: string): Promise<string[]>
  on(event: 'connect', handler: () => void): void
  on(event: 'error', handler: (error: Error) => void): void
  on(event: 'close', handler: () => void): void
  connect(): Promise<void>
}

interface RedisConstructor {
  new (url: string, options?: { maxRetriesPerRequest?: number; enableReadyCheck?: boolean; lazyConnect?: boolean }): Redis
}

const logger = createLogger('DistributedValidationCache')

// Cache TTL: 5 minutes (as requested by user)
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_TTL_SECONDS = 300 // 5 minutes for Redis

// Max cache size for in-memory fallback: 10,000 users
const MAX_CACHE_SIZE = 10000

interface CacheEntry {
  isValid: boolean
  timestamp: number
  tenantId?: string
}

interface DistributedCache {
  get(userId: string): Promise<CacheEntry | null>
  set(userId: string, isValid: boolean, tenantId?: string): Promise<void>
  invalidate(userId: string): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<{ size: number; maxSize: number; ttlMs: number; backend: string }>
}

/**
 * Redis cache implementation (for multi-instance deployments)
 */
class RedisCache implements DistributedCache {
  private redis: Redis | null = null // Redis client (dynamically imported)
  private isConnected = false

  constructor(redisUrl: string) {
    this.initializeRedis(redisUrl)
  }

  private async initializeRedis(redisUrl: string) {
    try {
      // Dynamic import to avoid bundling Redis in environments without it
      // ioredis is an optional runtime dependency, not required at build time
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const { default: Redis } = await import('ioredis') as { default: RedisConstructor }
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      })

      await this.redis.connect()

      this.redis.on('connect', () => {
        this.isConnected = true
        logger.info('Redis cache connected successfully')
      })

      this.redis.on('error', (error: Error) => {
        logger.error({ error }, 'Redis cache error')
        this.isConnected = false
      })

      this.redis.on('close', () => {
        this.isConnected = false
        logger.warn('Redis cache connection closed')
      })
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis cache')
      this.isConnected = false
    }
  }

  async get(userId: string): Promise<CacheEntry | null> {
    if (!this.isConnected || !this.redis) return null

    try {
      const cached = await this.redis.get(`auth:validation:${userId}`)
      if (!cached) return null

      const entry = JSON.parse(cached) as CacheEntry
      return entry
    } catch (error) {
      logger.error({ error, userId }, 'Redis get failed')
      return null
    }
  }

  async set(userId: string, isValid: boolean, tenantId?: string): Promise<void> {
    if (!this.isConnected || !this.redis) return

    try {
      const entry: CacheEntry = {
        isValid,
        timestamp: Date.now(),
        tenantId,
      }

      await this.redis.setex(
        `auth:validation:${userId}`,
        CACHE_TTL_SECONDS,
        JSON.stringify(entry)
      )
    } catch (error) {
      logger.error({ error, userId }, 'Redis set failed')
    }
  }

  async invalidate(userId: string): Promise<void> {
    if (!this.isConnected || !this.redis) return

    try {
      await this.redis.del(`auth:validation:${userId}`)
      logger.info({ userId }, 'Invalidated user validation cache')
    } catch (error) {
      logger.error({ error, userId }, 'Redis invalidate failed')
    }
  }

  async clear(): Promise<void> {
    if (!this.isConnected || !this.redis) return

    try {
      // Clear all auth validation keys
      const keys = await this.redis.keys('auth:validation:*')
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
      logger.info({ clearedKeys: keys.length }, 'Cleared all validation cache entries')
    } catch (error) {
      logger.error({ error }, 'Redis clear failed')
    }
  }

  async getStats() {
    if (!this.isConnected || !this.redis) {
      return {
        size: 0,
        maxSize: 0,
        ttlMs: CACHE_TTL_MS,
        backend: 'redis-disconnected',
      }
    }

    try {
      const keys = await this.redis.keys('auth:validation:*')
      return {
        size: keys.length,
        maxSize: Infinity, // Redis has no hard limit (memory-bound)
        ttlMs: CACHE_TTL_MS,
        backend: 'redis',
      }
    } catch (error) {
      logger.error({ error }, 'Redis getStats failed')
      return {
        size: 0,
        maxSize: 0,
        ttlMs: CACHE_TTL_MS,
        backend: 'redis-error',
      }
    }
  }
}

/**
 * In-memory LRU cache implementation (fallback for single-instance)
 */
class InMemoryCache implements DistributedCache {
  private cache: Map<string, CacheEntry> = new Map()
  private accessOrder: string[] = []

  async get(userId: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(userId)

    if (!entry) {
      return null
    }

    // Check if expired
    const now = Date.now()
    const age = now - entry.timestamp

    if (age > CACHE_TTL_MS) {
      // Expired - remove from cache
      this.cache.delete(userId)
      this.accessOrder = this.accessOrder.filter(id => id !== userId)
      return null
    }

    // Update access order for LRU
    this.updateAccessOrder(userId)

    return entry
  }

  async set(userId: string, isValid: boolean, tenantId?: string): Promise<void> {
    // Evict oldest entry if cache is full
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(userId)) {
      const oldestUserId = this.accessOrder.shift()
      if (oldestUserId) {
        this.cache.delete(oldestUserId)
      }
    }

    const entry: CacheEntry = {
      isValid,
      timestamp: Date.now(),
      tenantId,
    }

    this.cache.set(userId, entry)
    this.updateAccessOrder(userId)
  }

  async invalidate(userId: string): Promise<void> {
    this.cache.delete(userId)
    this.accessOrder = this.accessOrder.filter(id => id !== userId)
    logger.info({ userId }, 'Invalidated user validation cache (in-memory)')
  }

  async clear(): Promise<void> {
    const size = this.cache.size
    this.cache.clear()
    this.accessOrder = []
    logger.info({ clearedEntries: size }, 'Cleared all validation cache entries (in-memory)')
  }

  async getStats() {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      ttlMs: CACHE_TTL_MS,
      backend: 'in-memory',
    }
  }

  private updateAccessOrder(userId: string): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter(id => id !== userId)
    // Add to end (most recently used)
    this.accessOrder.push(userId)
  }
}

/**
 * Create distributed cache instance based on environment
 */
function createDistributedCache(): DistributedCache {
  const redisUrl = process.env.REDIS_URL

  if (redisUrl) {
    logger.info('Initializing Redis distributed cache for multi-instance deployment')
    return new RedisCache(redisUrl)
  } else {
    logger.warn(
      'REDIS_URL not configured - using in-memory cache. ' +
      'This is NOT suitable for multi-instance deployments. ' +
      'Set REDIS_URL environment variable for production.'
    )
    return new InMemoryCache()
  }
}

// Singleton instance
export const distributedValidationCache = createDistributedCache()

// Periodic cache cleanup (every 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(async () => {
    const stats = await distributedValidationCache.getStats()
    logger.debug(stats, 'Distributed validation cache stats')
  }, 10 * 60 * 1000)
}
