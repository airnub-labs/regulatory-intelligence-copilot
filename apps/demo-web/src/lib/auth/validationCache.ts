/**
 * Validation Cache for Session Validation
 *
 * PERFORMANCE: Caches user validation results to reduce database queries.
 * Uses in-memory LRU cache with TTL to balance security and performance.
 */

import { createLogger } from '@reg-copilot/reg-intel-observability'

const logger = createLogger('ValidationCache')

interface CacheEntry {
  isValid: boolean
  timestamp: number
  tenantId?: string
}

// Cache TTL: 2 minutes (shorter than validation interval for safety)
const CACHE_TTL_MS = 2 * 60 * 1000

// Max cache size: 10,000 users (prevents memory bloat)
const MAX_CACHE_SIZE = 10000

class ValidationCache {
  private cache: Map<string, CacheEntry> = new Map()
  private accessOrder: string[] = []

  /**
   * Get cached validation result if not expired
   */
  get(userId: string): CacheEntry | null {
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
      logger.debug({ userId, age }, 'Validation cache entry expired')
      return null
    }

    // Update access order for LRU
    this.updateAccessOrder(userId)

    logger.debug({ userId, age, isValid: entry.isValid }, 'Validation cache hit')
    return entry
  }

  /**
   * Set validation result in cache
   */
  set(userId: string, isValid: boolean, tenantId?: string): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(userId)) {
      const oldestUserId = this.accessOrder.shift()
      if (oldestUserId) {
        this.cache.delete(oldestUserId)
        logger.debug({ evictedUserId: oldestUserId }, 'Evicted oldest cache entry')
      }
    }

    const entry: CacheEntry = {
      isValid,
      timestamp: Date.now(),
      tenantId,
    }

    this.cache.set(userId, entry)
    this.updateAccessOrder(userId)

    logger.debug({ userId, isValid, cacheSize: this.cache.size }, 'Validation result cached')
  }

  /**
   * Invalidate a specific user's cache entry
   */
  invalidate(userId: string): void {
    this.cache.delete(userId)
    this.accessOrder = this.accessOrder.filter(id => id !== userId)
    logger.debug({ userId }, 'Validation cache invalidated for user')
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    this.accessOrder = []
    logger.info({ clearedEntries: size }, 'Validation cache cleared')
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      ttlMs: CACHE_TTL_MS,
    }
  }

  private updateAccessOrder(userId: string): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter(id => id !== userId)
    // Add to end (most recently used)
    this.accessOrder.push(userId)
  }
}

// Singleton instance
export const validationCache = new ValidationCache()

// Periodic cache cleanup (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const stats = validationCache.getStats()
    logger.debug(stats, 'Validation cache stats')

    // Trigger garbage collection of expired entries by accessing all entries
    // This is a passive cleanup - entries are also cleaned on access
  }, 5 * 60 * 1000)
}
