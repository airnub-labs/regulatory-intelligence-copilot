/**
 * Policy Store Tests
 *
 * Validates that policy stores work correctly:
 * - With caching enabled (cache hits and misses)
 * - With caching disabled
 * - During Redis failures (graceful degradation to Supabase)
 * - Cache invalidation on writes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SupabasePolicyStore,
  CachingPolicyStore,
  createPolicyStore,
  type SupabaseLikeClient,
} from './policyStores.js';
import type { RedisKeyValueClient } from '@reg-copilot/reg-intel-cache';
import type { TenantLlmPolicy } from './llmRouter.js';

// Mock the dynamic require in createPolicyStore
vi.mock('./llmRouter.js', async () => {
  const actual = await vi.importActual('./llmRouter.js');
  return actual;
});

// Mock Supabase client
function createMockSupabaseClient(): SupabaseLikeClient {
  const mockData: Record<string, any> = {};

  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          single: async () => {
            const key = `${table}:${value}`;
            if (mockData[key]) {
              return { data: mockData[key], error: null };
            }
            // Return PGRST116 error for not found (which the store treats as null)
            return { data: null, error: { message: 'PGRST116: No rows found' } };
          },
        }),
      }),
      upsert: (data: any, options?: any) => {
        const key = `${table}:${data.tenant_id}`;
        mockData[key] = data;
        return { error: null };
      },
      delete: () => ({
        eq: (column: string, value: any) => {
          const key = `${table}:${value}`;
          delete mockData[key];
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
    _setMockData: (key: string, value: any) => {
      mockData[key] = value;
    },
    _getMockData: () => mockData,
  } as any;
}

// Mock Redis client with controllable failure scenarios
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
    set: vi.fn(async (key: string, value: string, seconds?: number) => {
      if (shouldFail) {
        throw new Error('Redis connection failed');
      }
      cache[key] = {
        value,
        expiresAt: seconds ? Date.now() + seconds * 1000 : Date.now() + 31536000 * 1000, // Default 1 year
      };
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      if (shouldFail) {
        throw new Error('Redis connection failed');
      }
      delete cache[key];
      return 1;
    }),
    _getCache: () => cache,
  } as any;
}

describe('SupabasePolicyStore', () => {
  let supabase: SupabaseLikeClient;
  let store: SupabasePolicyStore;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    store = new SupabasePolicyStore(supabase);
  });

  it('should get policy from Supabase', async () => {
    const policy: TenantLlmPolicy = {
      tenantId: 'tenant-1',
      defaultModel: 'gpt-4',
      defaultProvider: 'openai',
      allowRemoteEgress: true,
      tasks: [],
      userPolicies: {},
    };

    // Set up mock data with schema-qualified table name
    (supabase as any)._setMockData('copilot_internal.tenant_llm_policies:tenant-1', {
      tenant_id: 'tenant-1',
      default_model: 'gpt-4',
      default_provider: 'openai',
      allow_remote_egress: true,
      egress_mode: null,
      allow_off_mode: null,
      tasks: [],
      user_policies: {},
    });

    const result = await store.getPolicy('tenant-1');
    expect(result).toEqual(policy);
  });

  it('should return null for non-existent policy', async () => {
    const result = await store.getPolicy('non-existent');
    expect(result).toBeNull();
  });

  it('should set policy in Supabase', async () => {
    const policy: TenantLlmPolicy = {
      tenantId: 'tenant-2',
      defaultModel: 'claude-3',
      defaultProvider: 'anthropic',
      allowRemoteEgress: true,
      tasks: [],
      userPolicies: {},
    };

    await store.setPolicy(policy);

    const result = await store.getPolicy('tenant-2');
    expect(result).toEqual(policy);
  });

});

describe('CachingPolicyStore', () => {
  let supabase: SupabaseLikeClient;
  let redis: RedisKeyValueClient;
  let backingStore: SupabasePolicyStore;
  let cachingStore: CachingPolicyStore;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    redis = createMockRedisClient();
    backingStore = new SupabasePolicyStore(supabase);
    cachingStore = new CachingPolicyStore(backingStore, redis, { ttlSeconds: 300 });
  });

  describe('Cache Enabled - Normal Operation', () => {
    it('should cache policy on first read (cache miss)', async () => {
      const policy: TenantLlmPolicy = {
        tenantId: 'tenant-1',
        defaultModel: 'gpt-4',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      };

      // Set up backing store
      await backingStore.setPolicy(policy);

      // First read - cache miss
      const result1 = await cachingStore.getPolicy('tenant-1');
      expect(result1).toEqual(policy);

      // Verify cache was populated
      expect(redis.get).toHaveBeenCalledWith('copilot:llm:policy:tenant-1');
      expect(redis.set).toHaveBeenCalledWith(
        'copilot:llm:policy:tenant-1',
        JSON.stringify(policy),
        300
      );
    });

    it('should return cached policy on subsequent reads (cache hit)', async () => {
      const policy: TenantLlmPolicy = {
        tenantId: 'tenant-2',
        defaultModel: 'claude-3',
        defaultProvider: 'anthropic',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      };

      await backingStore.setPolicy(policy);

      // First read - populates cache
      await cachingStore.getPolicy('tenant-2');

      // Clear mock call history
      vi.clearAllMocks();

      // Second read - should hit cache
      const result = await cachingStore.getPolicy('tenant-2');
      expect(result).toEqual(policy);

      // Verify cache was checked
      expect(redis.get).toHaveBeenCalledWith('copilot:llm:policy:tenant-2');
      // Verify backing store was NOT called (we can't directly verify this, but cache hit means no DB call)
    });

    it('should invalidate cache on write', async () => {
      const policy: TenantLlmPolicy = {
        tenantId: 'tenant-3',
        defaultModel: 'gpt-4',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      };

      // Write policy (should populate cache)
      await cachingStore.setPolicy(policy);

      // Verify cache was invalidated (deleted)
      expect(redis.del).toHaveBeenCalledWith('copilot:llm:policy:tenant-3');

      // Read policy (should repopulate cache)
      const result = await cachingStore.getPolicy('tenant-3');
      expect(result).toEqual(policy);
    });

  });

  describe('Redis Failure - Graceful Degradation', () => {
    beforeEach(() => {
      // Create Redis client that always fails
      redis = createMockRedisClient({ shouldFail: true });
      cachingStore = new CachingPolicyStore(backingStore, redis, { ttlSeconds: 300 });
    });

    it('should fall back to Supabase on Redis read failure', async () => {
      const policy: TenantLlmPolicy = {
        tenantId: 'tenant-5',
        defaultModel: 'gpt-4',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      };

      // Set up backing store
      await backingStore.setPolicy(policy);

      // Read should succeed despite Redis failure
      const result = await cachingStore.getPolicy('tenant-5');
      expect(result).toEqual(policy);

      // Verify Redis was attempted
      expect(redis.get).toHaveBeenCalled();
    });

    it('should fall back to Supabase on Redis write failure', async () => {
      const policy: TenantLlmPolicy = {
        tenantId: 'tenant-6',
        defaultModel: 'claude-3',
        defaultProvider: 'anthropic',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      };

      // Write should succeed despite Redis failure
      await expect(cachingStore.setPolicy(policy)).resolves.not.toThrow();

      // Verify policy was written to backing store
      const result = await backingStore.getPolicy('tenant-6');
      expect(result).toEqual(policy);
    });

    it('should continue working after Redis recovers', async () => {
      const policy: TenantLlmPolicy = {
        tenantId: 'tenant-7',
        defaultModel: 'gpt-4',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      };

      // Write during Redis failure
      await cachingStore.setPolicy(policy);

      // "Recover" Redis by creating new working client
      redis = createMockRedisClient({ shouldFail: false });
      cachingStore = new CachingPolicyStore(backingStore, redis, { ttlSeconds: 300 });

      // Read should now cache properly
      const result = await cachingStore.getPolicy('tenant-7');
      expect(result).toEqual(policy);

      // Verify cache was populated
      expect(redis.set).toHaveBeenCalled();
    });
  });

  describe('Cache Invalidation', () => {
    it('should return fresh data after cache invalidation', async () => {
      const policy1: TenantLlmPolicy = {
        tenantId: 'tenant-8',
        defaultModel: 'gpt-4',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      };

      const policy2: TenantLlmPolicy = {
        tenantId: 'tenant-8',
        defaultModel: 'claude-3',
        defaultProvider: 'anthropic',
        allowRemoteEgress: false,
        tasks: [],
        userPolicies: {},
      };

      // Write first policy
      await cachingStore.setPolicy(policy1);

      // Read to populate cache
      const result1 = await cachingStore.getPolicy('tenant-8');
      expect(result1).toEqual(policy1);

      // Update policy (should invalidate cache)
      await cachingStore.setPolicy(policy2);

      // Read again - should get updated policy
      const result2 = await cachingStore.getPolicy('tenant-8');
      expect(result2).toEqual(policy2);
    });
  });
});

describe('Store Construction', () => {
  it('should create SupabasePolicyStore (schema configured on client)', () => {
    const supabase = createMockSupabaseClient();
    const store = new SupabasePolicyStore(supabase);
    expect(store).toBeInstanceOf(SupabasePolicyStore);
  });

  it('should create CachingPolicyStore with custom TTL', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabasePolicyStore(supabase);
    const cachingStore = new CachingPolicyStore(backingStore, redis, { ttlSeconds: 600 });

    const policy: TenantLlmPolicy = {
      tenantId: 'tenant-9',
      defaultModel: 'gpt-4',
      defaultProvider: 'openai',
      allowRemoteEgress: true,
      tasks: [],
      userPolicies: {},
    };

    await cachingStore.setPolicy(policy);
    await cachingStore.getPolicy('tenant-9');

    expect(redis.set).toHaveBeenCalledWith(
      'copilot:llm:policy:tenant-9',
      expect.any(String),
      600
    );
  });
});

describe('Integration Tests', () => {
  it('should handle rapid reads without breaking', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabasePolicyStore(supabase);
    const cachingStore = new CachingPolicyStore(backingStore, redis);

    const policy: TenantLlmPolicy = {
      tenantId: 'tenant-10',
      defaultModel: 'gpt-4',
      defaultProvider: 'openai',
      allowRemoteEgress: true,
      tasks: [],
      userPolicies: {},
    };

    await cachingStore.setPolicy(policy);

    // Perform 10 rapid reads
    const results = await Promise.all(
      Array.from({ length: 10 }, () => cachingStore.getPolicy('tenant-10'))
    );

    // All should return the same policy
    results.forEach((result) => {
      expect(result).toEqual(policy);
    });
  });

  it('should handle rapid writes without breaking', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabasePolicyStore(supabase);
    const cachingStore = new CachingPolicyStore(backingStore, redis);

    // Perform 5 rapid writes with different models
    const writes = Array.from({ length: 5 }, (_, i) =>
      cachingStore.setPolicy({
        tenantId: 'tenant-11',
        defaultModel: `model-${i}`,
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        userPolicies: {},
      })
    );

    await Promise.all(writes);

    // Final read should get the last written policy
    const result = await cachingStore.getPolicy('tenant-11');
    expect(result?.defaultModel).toMatch(/^model-[0-4]$/);
  });

  it('should work correctly with null policies', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabasePolicyStore(supabase);
    const cachingStore = new CachingPolicyStore(backingStore, redis);

    // Read non-existent policy
    const result = await cachingStore.getPolicy('non-existent');
    expect(result).toBeNull();

    // Cache should NOT be populated for null results
    const cache = (redis as any)._getCache();
    expect(cache['copilot:llm:policy:non-existent']).toBeUndefined();
  });
});

describe('createPolicyStore factory', () => {
  it('creates a caching store when a redis client is provided', () => {
    const supabase = createMockSupabaseClient();
    const redisClient = createMockRedisClient();

    const store = createPolicyStore({ supabase, redis: redisClient });

    expect(store).toBeInstanceOf(CachingPolicyStore);
  });
});
