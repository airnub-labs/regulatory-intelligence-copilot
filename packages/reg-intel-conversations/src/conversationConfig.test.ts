/**
 * Conversation Config Store Tests
 *
 * Validates that config stores work correctly:
 * - With caching enabled (cache hits and misses)
 * - With caching disabled
 * - During Redis failures (graceful degradation to Supabase)
 * - Cache invalidation on writes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SupabaseConversationConfigStore,
  CachingConversationConfigStore,
  createConversationConfigStore,
  type ConversationConfig,
} from './conversationConfig.js';
import type { RedisKeyValueClient } from '@reg-copilot/reg-intel-cache';
import type { SupabaseLikeClient } from './conversationStores.js';

// Mock Supabase client
function createMockSupabaseClient(): SupabaseLikeClient {
  const mockData: Record<string, any> = {};

  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          maybeSingle: async () => {
            const entries = Object.values(mockData).filter(
              (item: any) => item[column] === value
            );
            return { data: entries[0] || null, error: null };
          },
        }),
        order: () => ({
          limit: () => ({
            maybeSingle: async () => {
              const entries = Object.values(mockData);
              return { data: entries[0] || null, error: null };
            },
          }),
        }),
      }),
      upsert: (data: any) => ({
        select: () => ({
          single: async () => {
            const key = `${table}:${data.tenant_id || 'global'}:${data.user_id || 'tenant'}`;
            mockData[key] = data;
            return { data, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: (column: string, value: any) => ({
          async then(resolve: any) {
            const keysToDelete = Object.keys(mockData).filter((key) =>
              mockData[key][column] === value
            );
            keysToDelete.forEach((key) => delete mockData[key]);
            return resolve({ data: null, error: null });
          },
        }),
      }),
    }),
    _setMockData: (key: string, value: any) => {
      mockData[key] = value;
    },
    _getMockData: () => mockData,
  } as any;
}

// Mock Redis client
function createMockRedisClient(options: { shouldFail?: boolean } = {}): RedisKeyValueClient {
  const cache: Record<string, { value: string; expiresAt: number }> = {};
  const { shouldFail = false } = options;

  return {
    get: vi.fn(async (key: string) => {
      if (shouldFail) {
        throw new Error('Redis connection failed');
      }
      const entry = cache[key];
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        delete cache[key];
        return null;
      }
      return entry.value;
    }),
    setex: vi.fn(async (key: string, seconds: number, value: string) => {
      if (shouldFail) {
        throw new Error('Redis connection failed');
      }
      cache[key] = {
        value,
        expiresAt: Date.now() + seconds * 1000,
      };
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      if (shouldFail) {
        throw new Error('Redis connection failed');
      }
      keys.forEach((key) => delete cache[key]);
      return keys.length;
    }),
    _getCache: () => cache,
  } as any;
}

describe('SupabaseConversationConfigStore', () => {
  let supabase: SupabaseLikeClient;
  let store: SupabaseConversationConfigStore;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    store = new SupabaseConversationConfigStore(supabase);
  });

  it('should get default global config', async () => {
    const config = await store.getConfig({ tenantId: 'tenant-1' });

    expect(config).toBeDefined();
    expect(config.configLevel).toBe('global');
    expect(config.mergeCompressionStrategy).toBe('moderate');
    expect(config.pathCompressionStrategy).toBe('sliding_window');
  });

  it('should set and get tenant config', async () => {
    await store.setTenantConfig({
      tenantId: 'tenant-2',
      config: {
        mergeCompressionStrategy: 'aggressive',
        pathMaxMessages: 200,
      },
    });

    const config = await store.getConfig({ tenantId: 'tenant-2' });
    expect(config.configLevel).toBe('tenant');
    expect(config.mergeCompressionStrategy).toBe('aggressive');
    expect(config.pathMaxMessages).toBe(200);
  });

  it('should set and get user config', async () => {
    await store.setUserConfig({
      tenantId: 'tenant-3',
      userId: 'user-1',
      config: {
        mergeCompressionStrategy: 'minimal',
        pathSlidingWindowSize: 50,
      },
    });

    const config = await store.getConfig({
      tenantId: 'tenant-3',
      userId: 'user-1',
    });
    expect(config.configLevel).toBe('user');
    expect(config.mergeCompressionStrategy).toBe('minimal');
    expect(config.pathSlidingWindowSize).toBe(50);
  });

  it('should fallback to tenant config when user config not found', async () => {
    await store.setTenantConfig({
      tenantId: 'tenant-4',
      config: {
        mergeCompressionStrategy: 'aggressive',
      },
    });

    const config = await store.getConfig({
      tenantId: 'tenant-4',
      userId: 'user-2',
    });
    expect(config.configLevel).toBe('tenant');
    expect(config.mergeCompressionStrategy).toBe('aggressive');
  });

  it('should delete tenant config', async () => {
    await store.setTenantConfig({
      tenantId: 'tenant-5',
      config: {
        mergeCompressionStrategy: 'aggressive',
      },
    });

    await store.deleteTenantConfig('tenant-5');

    const config = await store.getConfig({ tenantId: 'tenant-5' });
    expect(config.configLevel).toBe('global');
  });

  it('should delete user config', async () => {
    await store.setUserConfig({
      tenantId: 'tenant-6',
      userId: 'user-3',
      config: {
        mergeCompressionStrategy: 'minimal',
      },
    });

    await store.deleteUserConfig({
      tenantId: 'tenant-6',
      userId: 'user-3',
    });

    const config = await store.getConfig({
      tenantId: 'tenant-6',
      userId: 'user-3',
    });
    expect(config.configLevel).toBe('global');
  });
});

describe('CachingConversationConfigStore', () => {
  let supabase: SupabaseLikeClient;
  let redis: RedisKeyValueClient;
  let backingStore: SupabaseConversationConfigStore;
  let cachingStore: CachingConversationConfigStore;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    redis = createMockRedisClient();
    backingStore = new SupabaseConversationConfigStore(supabase);
    cachingStore = new CachingConversationConfigStore(backingStore, redis, { ttlSeconds: 300 });
  });

  describe('Cache Enabled - Normal Operation', () => {
    it('should cache config on first read (cache miss)', async () => {
      await backingStore.setTenantConfig({
        tenantId: 'tenant-1',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
      });

      // First read - cache miss
      const config = await cachingStore.getConfig({ tenantId: 'tenant-1' });
      expect(config.mergeCompressionStrategy).toBe('aggressive');

      // Verify cache was populated
      expect(redis.get).toHaveBeenCalledWith('copilot:conv:config:tenant-1');
      expect(redis.setex).toHaveBeenCalledWith(
        'copilot:conv:config:tenant-1',
        300,
        expect.any(String)
      );
    });

    it('should return cached config on subsequent reads (cache hit)', async () => {
      await backingStore.setTenantConfig({
        tenantId: 'tenant-2',
        config: {
          mergeCompressionStrategy: 'minimal',
        },
      });

      // First read - populates cache
      await cachingStore.getConfig({ tenantId: 'tenant-2' });

      // Clear mock history
      vi.clearAllMocks();

      // Second read - should hit cache
      const config = await cachingStore.getConfig({ tenantId: 'tenant-2' });
      expect(config.mergeCompressionStrategy).toBe('minimal');

      // Verify cache was checked
      expect(redis.get).toHaveBeenCalledWith('copilot:conv:config:tenant-2');
    });

    it('should cache user-specific config separately', async () => {
      await backingStore.setUserConfig({
        tenantId: 'tenant-3',
        userId: 'user-1',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
      });

      const config = await cachingStore.getConfig({
        tenantId: 'tenant-3',
        userId: 'user-1',
      });
      expect(config.mergeCompressionStrategy).toBe('aggressive');

      // Verify user-specific cache key
      expect(redis.setex).toHaveBeenCalledWith(
        'copilot:conv:config:tenant-3:user-1',
        300,
        expect.any(String)
      );
    });

    it('should invalidate cache on tenant config update', async () => {
      await cachingStore.setTenantConfig({
        tenantId: 'tenant-4',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
      });

      // Verify cache was invalidated
      expect(redis.del).toHaveBeenCalledWith('copilot:conv:config:tenant-4');
    });

    it('should invalidate cache on user config update', async () => {
      await cachingStore.setUserConfig({
        tenantId: 'tenant-5',
        userId: 'user-2',
        config: {
          mergeCompressionStrategy: 'minimal',
        },
      });

      // Verify user cache was invalidated
      expect(redis.del).toHaveBeenCalledWith('copilot:conv:config:tenant-5:user-2');
    });

    it('should invalidate cache on delete', async () => {
      await cachingStore.setTenantConfig({
        tenantId: 'tenant-6',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
      });

      await cachingStore.deleteTenantConfig('tenant-6');

      // Verify cache was invalidated
      expect(redis.del).toHaveBeenCalledWith('copilot:conv:config:tenant-6');
    });
  });

  describe('Redis Failure - Graceful Degradation', () => {
    beforeEach(() => {
      redis = createMockRedisClient({ shouldFail: true });
      cachingStore = new CachingConversationConfigStore(backingStore, redis, { ttlSeconds: 300 });
    });

    it('should fall back to Supabase on Redis read failure', async () => {
      await backingStore.setTenantConfig({
        tenantId: 'tenant-7',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
      });

      // Read should succeed despite Redis failure
      const config = await cachingStore.getConfig({ tenantId: 'tenant-7' });
      expect(config.mergeCompressionStrategy).toBe('aggressive');

      // Verify Redis was attempted
      expect(redis.get).toHaveBeenCalled();
    });

    it('should fall back to Supabase on Redis write failure', async () => {
      // Write should succeed despite Redis failure
      await expect(
        cachingStore.setTenantConfig({
          tenantId: 'tenant-8',
          config: {
            mergeCompressionStrategy: 'minimal',
          },
        })
      ).resolves.not.toThrow();

      // Verify config was written to backing store
      const config = await backingStore.getConfig({ tenantId: 'tenant-8' });
      expect(config.mergeCompressionStrategy).toBe('minimal');
    });

    it('should continue working after Redis recovers', async () => {
      // Write during Redis failure
      await cachingStore.setTenantConfig({
        tenantId: 'tenant-9',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
      });

      // "Recover" Redis
      redis = createMockRedisClient({ shouldFail: false });
      cachingStore = new CachingConversationConfigStore(backingStore, redis, { ttlSeconds: 300 });

      // Read should now cache properly
      const config = await cachingStore.getConfig({ tenantId: 'tenant-9' });
      expect(config.mergeCompressionStrategy).toBe('aggressive');

      // Verify cache was populated
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe('Cache Invalidation', () => {
    it('should return fresh data after cache invalidation', async () => {
      // Set initial config
      await cachingStore.setTenantConfig({
        tenantId: 'tenant-10',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
      });

      // Read to populate cache
      const config1 = await cachingStore.getConfig({ tenantId: 'tenant-10' });
      expect(config1.mergeCompressionStrategy).toBe('aggressive');

      // Update config (should invalidate cache)
      await cachingStore.setTenantConfig({
        tenantId: 'tenant-10',
        config: {
          mergeCompressionStrategy: 'minimal',
        },
      });

      // Read again - should get updated config
      const config2 = await cachingStore.getConfig({ tenantId: 'tenant-10' });
      expect(config2.mergeCompressionStrategy).toBe('minimal');
    });

    it('should handle Date serialization correctly', async () => {
      await cachingStore.setTenantConfig({
        tenantId: 'tenant-11',
        config: {
          mergeCompressionStrategy: 'aggressive',
        },
        updatedBy: 'user-1',
      });

      const config = await cachingStore.getConfig({ tenantId: 'tenant-11' });

      // Verify updatedAt is a Date object
      expect(config.updatedAt).toBeInstanceOf(Date);
    });
  });
});

describe('createConversationConfigStore Factory', () => {
  it('should create InMemoryConversationConfigStore when no Supabase', () => {
    const store = createConversationConfigStore({});
    expect(store).toBeDefined();
  });

  it('should create SupabaseConversationConfigStore when only Supabase provided', () => {
    const supabase = createMockSupabaseClient();
    const store = createConversationConfigStore({ supabase });
    expect(store).toBeInstanceOf(SupabaseConversationConfigStore);
  });

  it('should create CachingConversationConfigStore when both Supabase and Redis provided', () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const store = createConversationConfigStore({ supabase, redis });
    expect(store).toBeInstanceOf(CachingConversationConfigStore);
  });

  it('should respect custom TTL', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const store = createConversationConfigStore({
      supabase,
      redis,
      cacheTtlSeconds: 600,
    });

    await (store as any).setTenantConfig({
      tenantId: 'tenant-12',
      config: {
        mergeCompressionStrategy: 'aggressive',
      },
    });

    await store.getConfig({ tenantId: 'tenant-12' });

    // Verify custom TTL was used
    expect(redis.setex).toHaveBeenCalledWith(
      'copilot:conv:config:tenant-12',
      600,
      expect.any(String)
    );
  });
});

describe('Integration Tests', () => {
  it('should handle concurrent reads without breaking', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabaseConversationConfigStore(supabase);
    const cachingStore = new CachingConversationConfigStore(backingStore, redis);

    await cachingStore.setTenantConfig({
      tenantId: 'tenant-13',
      config: {
        mergeCompressionStrategy: 'aggressive',
      },
    });

    // Perform 10 concurrent reads
    const results = await Promise.all(
      Array.from({ length: 10 }, () => cachingStore.getConfig({ tenantId: 'tenant-13' }))
    );

    // All should return the same config
    results.forEach((config) => {
      expect(config.mergeCompressionStrategy).toBe('aggressive');
    });
  });

  it('should handle hierarchical config correctly', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabaseConversationConfigStore(supabase);
    const cachingStore = new CachingConversationConfigStore(backingStore, redis);

    // Set tenant config
    await cachingStore.setTenantConfig({
      tenantId: 'tenant-14',
      config: {
        mergeCompressionStrategy: 'aggressive',
      },
    });

    // Set user config
    await cachingStore.setUserConfig({
      tenantId: 'tenant-14',
      userId: 'user-1',
      config: {
        mergeCompressionStrategy: 'minimal',
      },
    });

    // User should get their config
    const userConfig = await cachingStore.getConfig({
      tenantId: 'tenant-14',
      userId: 'user-1',
    });
    expect(userConfig.configLevel).toBe('user');
    expect(userConfig.mergeCompressionStrategy).toBe('minimal');

    // Other users should get tenant config
    const otherUserConfig = await cachingStore.getConfig({
      tenantId: 'tenant-14',
      userId: 'user-2',
    });
    expect(otherUserConfig.configLevel).toBe('tenant');
    expect(otherUserConfig.mergeCompressionStrategy).toBe('aggressive');
  });
});
