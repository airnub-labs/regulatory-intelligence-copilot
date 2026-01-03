/**
 * Unit tests for TransparentCache
 *
 * Tests verify industry-standard transparent failover behavior:
 * - Factory NEVER returns null
 * - Cache errors become cache misses (transparent)
 * - Application code never needs try-catch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTransparentCache, type CacheBackend } from '../transparentCache';

// Mock dependencies to avoid initialization issues in tests
vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createCounter: () => ({ add: vi.fn() }),
      createHistogram: () => ({ record: vi.fn() }),
    }),
  },
}));

vi.mock('@reg-copilot/reg-intel-observability', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

describe('TransparentCache', () => {
  describe('PassThroughCache (no backend)', () => {
    it('factory never returns null - always returns instance', () => {
      const cache = createTransparentCache<string>(null, null);
      expect(cache).not.toBeNull();
      expect(cache).toBeDefined();
    });

    it('always returns null on get (cache miss)', async () => {
      const cache = createTransparentCache<string>(null, null);
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('accepts set operations without error', async () => {
      const cache = createTransparentCache<string>(null, null);
      await expect(cache.set('key1', 'value1')).resolves.not.toThrow();
    });

    it('accepts delete operations without error', async () => {
      const cache = createTransparentCache<string>(null, null);
      await expect(cache.del('key1')).resolves.not.toThrow();
    });

    it('reports passthrough backend type', () => {
      const cache = createTransparentCache<string>(null, null);
      expect(cache.getBackendType()).toBe('passthrough');
    });

    it('does not throw on multiple operations', async () => {
      const cache = createTransparentCache<string>(null, null);

      await expect(cache.get('key1')).resolves.toBeNull();
      await expect(cache.set('key1', 'value1')).resolves.not.toThrow();
      await expect(cache.get('key1')).resolves.toBeNull();
      await expect(cache.del('key1')).resolves.not.toThrow();
    });
  });

  describe('RedisBackedCache (with backend)', () => {
    let mockBackend: CacheBackend;

    beforeEach(() => {
      mockBackend = {
        get: vi.fn<CacheBackend['get']>(),
        set: vi.fn<CacheBackend['set']>(),
        del: vi.fn<CacheBackend['del']>(),
      };
    });

    it('factory never returns null when backend provided', () => {
      const cache = createTransparentCache<string>(mockBackend, 'redis');
      expect(cache).not.toBeNull();
      expect(cache).toBeDefined();
    });

    it('returns cached value when available', async () => {
      mockBackend.get.mockResolvedValue('{"data":"value"}');

      const cache = createTransparentCache<{ data: string }>(mockBackend, 'redis');
      const result = await cache.get('key1');

      expect(result).toEqual({ data: 'value' });
      expect(mockBackend.get).toHaveBeenCalledWith('key1');
    });

    it('returns null when cache empty (cache miss)', async () => {
      mockBackend.get.mockResolvedValue(null);

      const cache = createTransparentCache<string>(mockBackend, 'redis');
      const result = await cache.get('key1');

      expect(result).toBeNull();
    });

    it('returns null on get error - transparent failover', async () => {
      mockBackend.get.mockRejectedValue(new Error('Redis connection failed'));

      const cache = createTransparentCache<string>(mockBackend, 'redis');
      const result = await cache.get('key1');

      expect(result).toBeNull(); // ✅ Error becomes cache miss
    });

    it('continues on set error - transparent failover', async () => {
      mockBackend.set.mockRejectedValue(new Error('Redis connection failed'));

      const cache = createTransparentCache<string>(mockBackend, 'redis');

      await expect(cache.set('key1', 'value1')).resolves.not.toThrow();
      // ✅ Error doesn't propagate
    });

    it('continues on delete error - transparent failover', async () => {
      mockBackend.del.mockRejectedValue(new Error('Redis connection failed'));

      const cache = createTransparentCache<string>(mockBackend, 'redis');

      await expect(cache.del('key1')).resolves.not.toThrow();
      // ✅ Error doesn't propagate
    });

    it('sets value with default TTL', async () => {
      mockBackend.set.mockResolvedValue();

      const cache = createTransparentCache<string>(mockBackend, 'redis', {
        defaultTtlSeconds: 600,
      });

      await cache.set('key1', 'value1');

      expect(mockBackend.set).toHaveBeenCalledWith('key1', '"value1"', 600);
    });

    it('sets value with override TTL', async () => {
      mockBackend.set.mockResolvedValue();

      const cache = createTransparentCache<string>(mockBackend, 'redis', {
        defaultTtlSeconds: 600,
      });

      await cache.set('key1', 'value1', 300);

      expect(mockBackend.set).toHaveBeenCalledWith('key1', '"value1"', 300);
    });

    it('uses custom serializer', async () => {
      mockBackend.set.mockResolvedValue();

      const cache = createTransparentCache<string>(mockBackend, 'redis', {
        serialize: (value: string) => `custom:${value}`,
      });

      await cache.set('key1', 'value1');

      expect(mockBackend.set).toHaveBeenCalledWith('key1', 'custom:value1', 300);
    });

    it('uses custom deserializer', async () => {
      mockBackend.get.mockResolvedValue('custom:value1');

      const cache = createTransparentCache<string>(mockBackend, 'redis', {
        deserialize: (raw: string) => raw.replace('custom:', ''),
      });

      const result = await cache.get('key1');

      expect(result).toBe('value1');
    });

    it('reports redis backend type', () => {
      const cache = createTransparentCache<string>(mockBackend, 'redis');
      expect(cache.getBackendType()).toBe('redis');
    });

    it('reports upstash backend type', () => {
      const cache = createTransparentCache<string>(mockBackend, 'upstash');
      expect(cache.getBackendType()).toBe('upstash');
    });
  });

  describe('Industry standard pattern compliance', () => {
    it('cache miss and backend unavailable are indistinguishable', async () => {
      const workingBackend: CacheBackend = {
        get: vi.fn<CacheBackend['get']>().mockResolvedValue(null),
        set: vi.fn<CacheBackend['set']>(),
        del: vi.fn<CacheBackend['del']>(),
      };

      const cache1 = createTransparentCache<string>(workingBackend, 'redis');
      const cache2 = createTransparentCache<string>(null, null);

      // Both return null on get
      expect(await cache1.get('key')).toBeNull();
      expect(await cache2.get('key')).toBeNull();

      // Both accept set without error
      await expect(cache1.set('key', 'value')).resolves.not.toThrow();
      await expect(cache2.set('key', 'value')).resolves.not.toThrow();
    });

    it('application code never needs null checks', () => {
      // ✅ CORRECT: Factory always returns instance
      const cache = createTransparentCache<string>(null, null);

      // ✅ CORRECT: Can call methods directly without null check
      expect(() => cache.get('key')).not.toThrow();
      expect(() => cache.set('key', 'value')).not.toThrow();
      expect(() => cache.del('key')).not.toThrow();
      expect(() => cache.getBackendType()).not.toThrow();
    });

    it('application code never needs try-catch', async () => {
      const failingBackend: CacheBackend = {
        get: vi.fn<CacheBackend['get']>().mockRejectedValue(new Error('Always fails')),
        set: vi.fn<CacheBackend['set']>().mockRejectedValue(new Error('Always fails')),
        del: vi.fn<CacheBackend['del']>().mockRejectedValue(new Error('Always fails')),
      };

      const cache = createTransparentCache<string>(failingBackend, 'redis');

      // ✅ CORRECT: No try-catch needed - errors handled internally
      await expect(cache.get('key')).resolves.toBeNull();
      await expect(cache.set('key', 'value')).resolves.not.toThrow();
      await expect(cache.del('key')).resolves.not.toThrow();
    });
  });
});
