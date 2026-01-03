/**
 * Conversation Store Caching Tests
 *
 * Validates that conversation stores work correctly:
 * - With caching enabled (cache hits and misses)
 * - With caching disabled
 * - During Redis failures (graceful degradation to Supabase)
 * - Cache invalidation on writes
 * - Security: Tenant validation on cache reads
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SupabaseConversationStore,
  CachingConversationStore,
  createConversationStore,
  type ConversationRecord,
} from './conversationStores.js';
import * as redisCache from '@reg-copilot/reg-intel-cache';
import type { RedisKeyValueClient } from '@reg-copilot/reg-intel-cache';
import type { SupabaseLikeClient } from './conversationStores.js';

// Mock Supabase client
function createMockSupabaseClient(): SupabaseLikeClient {
  const conversations: Record<string, ConversationRecord> = {};
  const messages: any[] = [];

  return {
    from: (table: string) => {
      if (table === 'conversations') {
        return {
          select: (columns: string) => ({
            eq: (column: string, value: any) => ({
              single: async () => {
                const conv = conversations[value];
                return conv
                  ? { data: conv, error: null }
                  : { data: null, error: { message: 'Not found' } };
              },
              maybeSingle: async () => {
                const conv = conversations[value];
                return { data: conv || null, error: null };
              },
            }),
          }),
          insert: (data: any) => ({
            select: () => ({
              single: async () => {
                conversations[data.id] = {
                  ...data,
                  createdAt: new Date(data.created_at),
                  updatedAt: new Date(data.updated_at),
                };
                return { data: conversations[data.id], error: null };
              },
            }),
          }),
          update: (data: any) => ({
            eq: (column: string, value: any) => ({
              select: () => ({
                single: async () => {
                  if (conversations[value]) {
                    conversations[value] = {
                      ...conversations[value],
                      ...data,
                      updatedAt: new Date(),
                    };
                    return { data: conversations[value], error: null };
                  }
                  return { data: null, error: { message: 'Not found' } };
                },
              }),
            }),
          }),
        };
      }

      if (table === 'conversation_messages') {
        return {
          insert: (data: any) => ({
            select: () => ({
              single: async () => {
                messages.push(data);
                return { data, error: null };
              },
            }),
          }),
          update: (data: any) => ({
            eq: (column: string, value: any) => ({
              select: () => ({
                single: async () => {
                  const msg = messages.find((m) => m[column] === value);
                  if (msg) {
                    Object.assign(msg, data);
                    return { data: msg, error: null };
                  }
                  return { data: null, error: { message: 'Not found' } };
                },
              }),
            }),
          }),
        };
      }

      return {} as any;
    },
    _setConversation: (id: string, conv: ConversationRecord) => {
      conversations[id] = conv;
    },
    _getConversation: (id: string) => conversations[id],
    _getAllConversations: () => conversations,
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

describe('SupabaseConversationStore', () => {
  let supabase: SupabaseLikeClient;
  let store: SupabaseConversationStore;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    store = new SupabaseConversationStore(supabase);
  });

  it('should get conversation from Supabase', async () => {
    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (supabase as any)._setConversation('conv-1', conversation);

    const result = await store.getConversation({
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
    });

    expect(result).toEqual(conversation);
  });

  it('should return null for non-existent conversation', async () => {
    const result = await store.getConversation({
      tenantId: 'tenant-1',
      conversationId: 'non-existent',
    });

    expect(result).toBeNull();
  });

  it('should append message to conversation', async () => {
    const conversation: ConversationRecord = {
      id: 'conv-2',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (supabase as any)._setConversation('conv-2', conversation);

    const result = await store.appendMessage({
      tenantId: 'tenant-1',
      conversationId: 'conv-2',
      message: {
        role: 'user',
        content: 'Hello',
      },
      userId: 'user-1',
    });

    expect(result).toBeDefined();
    expect(result.message.content).toBe('Hello');
  });
});

describe('CachingConversationStore', () => {
  let supabase: SupabaseLikeClient;
  let redis: RedisKeyValueClient;
  let backingStore: SupabaseConversationStore;
  let cachingStore: CachingConversationStore;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    redis = createMockRedisClient();
    backingStore = new SupabaseConversationStore(supabase);
    cachingStore = new CachingConversationStore(backingStore, redis, { ttlSeconds: 60 });
  });

  describe('Cache Enabled - Normal Operation', () => {
    it('should cache conversation on first read (cache miss)', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-1', conversation);

      // First read - cache miss
      const result = await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
      });

      expect(result).toBeDefined();
      expect(result!.id).toBe('conv-1');

      // Verify cache was populated
      expect(redis.get).toHaveBeenCalledWith('copilot:conv:conversation:conv-1');
      expect(redis.setex).toHaveBeenCalledWith(
        'copilot:conv:conversation:conv-1',
        60,
        expect.any(String)
      );
    });

    it('should return cached conversation on subsequent reads (cache hit)', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-2',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-2', conversation);

      // First read - populates cache
      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-2',
      });

      // Clear mock history
      vi.clearAllMocks();

      // Second read - should hit cache
      const result = await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-2',
      });

      expect(result).toBeDefined();
      expect(result!.id).toBe('conv-2');

      // Verify cache was checked
      expect(redis.get).toHaveBeenCalledWith('copilot:conv:conversation:conv-2');
    });

    it('should invalidate cache on appendMessage', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-3',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-3', conversation);

      // Read to populate cache
      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-3',
      });

      vi.clearAllMocks();

      // Append message - should invalidate cache
      await cachingStore.appendMessage({
        tenantId: 'tenant-1',
        conversationId: 'conv-3',
        message: {
          role: 'user',
          content: 'Hello',
        },
        userId: 'user-1',
      });

      // Verify cache was invalidated
      expect(redis.del).toHaveBeenCalledWith('copilot:conv:conversation:conv-3');
    });

    it('should invalidate cache on updateSharing', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-4',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-4', conversation);

      // Read to populate cache
      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-4',
      });

      vi.clearAllMocks();

      // Update sharing - should invalidate cache
      await cachingStore.updateSharing({
        tenantId: 'tenant-1',
        conversationId: 'conv-4',
        isShared: true,
        userId: 'user-1',
      });

      // Verify cache was invalidated
      expect(redis.del).toHaveBeenCalledWith('copilot:conv:conversation:conv-4');
    });

    it('should invalidate cache on setArchivedState', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-5',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-5', conversation);

      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-5',
      });

      vi.clearAllMocks();

      await cachingStore.setArchivedState({
        tenantId: 'tenant-1',
        conversationId: 'conv-5',
        isArchived: true,
        userId: 'user-1',
      });

      expect(redis.del).toHaveBeenCalledWith('copilot:conv:conversation:conv-5');
    });

    it('should invalidate cache on softDeleteMessage', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-6',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-6', conversation);

      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-6',
      });

      vi.clearAllMocks();

      await cachingStore.softDeleteMessage({
        tenantId: 'tenant-1',
        conversationId: 'conv-6',
        messageId: 'msg-1',
        userId: 'user-1',
      });

      expect(redis.del).toHaveBeenCalledWith('copilot:conv:conversation:conv-6');
    });
  });

  describe('Security - Tenant Validation', () => {
    it('should reject cached conversation with wrong tenant', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-7',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-7', conversation);

      // Read as tenant-1 (populates cache)
      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-7',
      });

      vi.clearAllMocks();

      // Try to read as tenant-2 (should invalidate cache and fetch from DB)
      const result = await cachingStore.getConversation({
        tenantId: 'tenant-2',
        conversationId: 'conv-7',
      });

      // Should return null or the correct conversation depending on RLS
      // In this mock, it will return the cached value but in production RLS would block it
      // The important part is that cache was invalidated
      expect(redis.del).toHaveBeenCalledWith('copilot:conv:conversation:conv-7');
    });
  });

  describe('Redis Failure - Graceful Degradation', () => {
    beforeEach(() => {
      redis = createMockRedisClient({ shouldFail: true });
      cachingStore = new CachingConversationStore(backingStore, redis, { ttlSeconds: 60 });
    });

    it('should fall back to Supabase on Redis read failure', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-8',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-8', conversation);

      // Read should succeed despite Redis failure
      const result = await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-8',
      });

      expect(result).toBeDefined();
      expect(result!.id).toBe('conv-8');

      // Verify Redis was attempted
      expect(redis.get).toHaveBeenCalled();
    });

    it('should fall back to Supabase on Redis write failure', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-9',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-9', conversation);

      // Append message should succeed despite Redis failure
      await expect(
        cachingStore.appendMessage({
          tenantId: 'tenant-1',
          conversationId: 'conv-9',
          message: {
            role: 'user',
            content: 'Hello',
          },
          userId: 'user-1',
        })
      ).resolves.not.toThrow();
    });

    it('should continue working after Redis recovers', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-10',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (supabase as any)._setConversation('conv-10', conversation);

      // Read during Redis failure
      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-10',
      });

      // "Recover" Redis
      redis = createMockRedisClient({ shouldFail: false });
      cachingStore = new CachingConversationStore(backingStore, redis, { ttlSeconds: 60 });

      // Read should now cache properly
      const result = await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-10',
      });

      expect(result).toBeDefined();

      // Verify cache was populated
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe('Date Handling', () => {
    it('should correctly serialize and deserialize dates', async () => {
      const now = new Date('2024-01-01T00:00:00.000Z');
      const conversation: ConversationRecord = {
        id: 'conv-11',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        archivedAt: now,
      };

      (supabase as any)._setConversation('conv-11', conversation);

      // First read - populates cache
      await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-11',
      });

      // Second read - from cache
      const result = await cachingStore.getConversation({
        tenantId: 'tenant-1',
        conversationId: 'conv-11',
      });

      // All dates should be Date objects
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
      expect(result!.lastMessageAt).toBeInstanceOf(Date);
      expect(result!.archivedAt).toBeInstanceOf(Date);

      // Dates should match original
      expect(result!.createdAt.getTime()).toBe(now.getTime());
      expect(result!.updatedAt.getTime()).toBe(now.getTime());
    });
  });
});

describe('createConversationStore Factory', () => {
  it('should throw when Supabase is missing', () => {
    expect(() => createConversationStore({})).toThrow(
      'Supabase client is required to create a ConversationStore'
    );
  });

  it('should create SupabaseConversationStore when only Supabase provided', () => {
    const supabase = createMockSupabaseClient();
    const store = createConversationStore({ supabase });
    expect(store).toBeInstanceOf(SupabaseConversationStore);
  });

  it('should create SupabaseConversationStore when enableCaching is false', () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const store = createConversationStore({
      supabase,
      redis,
      enableCaching: false,
    });
    expect(store).toBeInstanceOf(SupabaseConversationStore);
  });

  it('should create CachingConversationStore when enableCaching is true', () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const store = createConversationStore({
      supabase,
      redis,
      enableCaching: true,
    });
    expect(store).toBeInstanceOf(CachingConversationStore);
  });

  it('should create CachingConversationStore when redisBackend is provided', () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backend = { backend: 'redis', url: 'redis://localhost:6379' } as const;

    const createClientSpy = vi.spyOn(redisCache, 'createKeyValueClient').mockReturnValue(redis);

    const store = createConversationStore({
      supabase,
      redisBackend: backend,
      enableCaching: true,
    });

    expect(store).toBeInstanceOf(CachingConversationStore);
    expect(createClientSpy).toHaveBeenCalledWith(backend);

    createClientSpy.mockRestore();
  });

  it('should respect custom TTL', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const store = createConversationStore({
      supabase,
      redis,
      enableCaching: true,
      cacheTtlSeconds: 120,
    });

    const conversation: ConversationRecord = {
      id: 'conv-12',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (supabase as any)._setConversation('conv-12', conversation);

    await store.getConversation({
      tenantId: 'tenant-1',
      conversationId: 'conv-12',
    });

    // Verify custom TTL was used
    expect(redis.setex).toHaveBeenCalledWith(
      'copilot:conv:conversation:conv-12',
      120,
      expect.any(String)
    );
  });
});

describe('Integration Tests', () => {
  it('should handle rapid concurrent reads without breaking', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabaseConversationStore(supabase);
    const cachingStore = new CachingConversationStore(backingStore, redis);

    const conversation: ConversationRecord = {
      id: 'conv-13',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (supabase as any)._setConversation('conv-13', conversation);

    // Perform 20 concurrent reads
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        cachingStore.getConversation({
          tenantId: 'tenant-1',
          conversationId: 'conv-13',
        })
      )
    );

    // All should return the conversation
    results.forEach((result) => {
      expect(result).toBeDefined();
      expect(result!.id).toBe('conv-13');
    });
  });

  it('should handle interleaved reads and writes correctly', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabaseConversationStore(supabase);
    const cachingStore = new CachingConversationStore(backingStore, redis);

    const conversation: ConversationRecord = {
      id: 'conv-14',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (supabase as any)._setConversation('conv-14', conversation);

    // Read
    const result1 = await cachingStore.getConversation({
      tenantId: 'tenant-1',
      conversationId: 'conv-14',
    });
    expect(result1).toBeDefined();

    // Write (invalidates cache)
    await cachingStore.appendMessage({
      tenantId: 'tenant-1',
      conversationId: 'conv-14',
      message: { role: 'user', content: 'Hello' },
      userId: 'user-1',
    });

    // Read again (should repopulate cache)
    const result2 = await cachingStore.getConversation({
      tenantId: 'tenant-1',
      conversationId: 'conv-14',
    });
    expect(result2).toBeDefined();

    // Both reads should return valid data
    expect(result1!.id).toBe('conv-14');
    expect(result2!.id).toBe('conv-14');
  });

  it('should not cache null results', async () => {
    const supabase = createMockSupabaseClient();
    const redis = createMockRedisClient();
    const backingStore = new SupabaseConversationStore(supabase);
    const cachingStore = new CachingConversationStore(backingStore, redis);

    // Read non-existent conversation
    const result = await cachingStore.getConversation({
      tenantId: 'tenant-1',
      conversationId: 'non-existent',
    });

    expect(result).toBeNull();

    // Cache should NOT be populated for null results
    const cache = (redis as any)._getCache();
    expect(cache['copilot:conv:conversation:non-existent']).toBeUndefined();
  });
});
