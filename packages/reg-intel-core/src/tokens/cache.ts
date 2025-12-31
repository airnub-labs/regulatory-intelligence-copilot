/**
 * Token Count Cache
 *
 * LRU cache for token counts to avoid repeated tokenization
 * of the same content.
 */

import type { TokenCacheEntry } from './types.js';

/**
 * Simple LRU cache implementation for token counts
 */
export class TokenCache {
  private cache = new Map<string, TokenCacheEntry>();
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 1000, ttlMs = 3600000) {
    // Default: 1000 entries, 1 hour TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached token count
   */
  get(key: string): number | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;

    return entry.tokens;
  }

  /**
   * Set cached token count
   */
  set(key: string, tokens: number, model: string): void {
    // If at capacity, remove oldest entry (first in Map)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      tokens,
      timestamp: Date.now(),
      model,
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }

  /**
   * Prune expired entries
   */
  prune(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }
}

/**
 * Create a cache key from text content
 */
export function createCacheKey(text: string, model: string): string {
  // Simple hash: length + first 50 chars + last 50 chars + model
  // This is fast and good enough for cache key uniqueness
  const len = text.length;
  const start = text.slice(0, 50);
  const end = len > 50 ? text.slice(-50) : '';
  return `${model}:${len}:${start}:${end}`;
}
