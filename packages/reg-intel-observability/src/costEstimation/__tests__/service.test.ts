/**
 * Cost Estimation Service Tests
 *
 * Comprehensive tests covering:
 * - Service with Redis cache
 * - Service without cache (pass-through mode)
 * - Fallback ENUM behavior when database unavailable
 * - Cache hit/miss scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseCostEstimationService } from '../service.js';
import {
  getLLMCostEstimateFallback,
  getE2BCostEstimateFallback,
} from '../fallbacks.js';

// Mock Supabase client
const createMockSupabaseClient = (options?: {
  shouldError?: boolean;
  returnData?: any;
}) => {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue(
                      options?.shouldError
                        ? { data: null, error: new Error('Database error') }
                        : { data: options?.returnData ?? null, error: null }
                    ),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  } as any;
};

// Mock transparent cache
interface MockCache<T> {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  _storage: Map<string, T>;
}

const createMockCache = <T>(): MockCache<T> => {
  const storage = new Map<string, T>();
  return {
    get: vi.fn(async (key: string) => storage.get(key) ?? null),
    set: vi.fn(async (key: string, value: T) => {
      storage.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    _storage: storage,
  };
};

describe('CostEstimationService', () => {
  describe('with Redis cache', () => {
    it('should return database value and cache it on first request', async () => {
      const dbValue = 0.05;
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: dbValue },
      });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        llmCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.getLLMCostEstimate({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'chat',
        confidenceLevel: 'conservative',
      });

      expect(result).toBe(dbValue);
      expect(cache.get).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
      expect(cache._storage.size).toBe(1);
    });

    it('should return cached value on second request without database query', async () => {
      const dbValue = 0.05;
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: dbValue },
      });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        llmCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const params = {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'chat' as const,
        confidenceLevel: 'conservative' as const,
      };

      // First request - database query
      await service.getLLMCostEstimate(params);
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Second request - cache hit
      const result = await service.getLLMCostEstimate(params);
      expect(result).toBe(dbValue);
      expect(cache.set).toHaveBeenCalledTimes(1); // Still only one set call
      expect(cache.get).toHaveBeenCalledTimes(2); // Two get calls
    });

    it('should use fallback ENUM when database returns error', async () => {
      const client = createMockSupabaseClient({ shouldError: true });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        llmCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const params = {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'chat' as const,
        confidenceLevel: 'conservative' as const,
      };

      const result = await service.getLLMCostEstimate(params);

      const expectedFallback = getLLMCostEstimateFallback(
        params.provider,
        params.model,
        params.operationType,
        params.confidenceLevel
      );

      expect(result).toBe(expectedFallback);
      expect(cache.set).toHaveBeenCalled(); // Fallback should be cached too
    });

    it('should use fallback ENUM when database returns no data', async () => {
      const client = createMockSupabaseClient({ returnData: null });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        llmCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const params = {
        provider: 'unknown-provider',
        model: 'unknown-model',
        operationType: 'chat' as const,
        confidenceLevel: 'conservative' as const,
      };

      const result = await service.getLLMCostEstimate(params);

      const expectedFallback = getLLMCostEstimateFallback(
        params.provider,
        params.model,
        params.operationType,
        params.confidenceLevel
      );

      expect(result).toBe(expectedFallback);
    });
  });

  describe('without Redis cache (pass-through mode)', () => {
    it('should work without cache and return database value', async () => {
      const dbValue = 0.05;
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: dbValue },
      });

      // No cache provided - service will use pass-through cache
      const service = new SupabaseCostEstimationService(client);

      const result = await service.getLLMCostEstimate({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'chat',
        confidenceLevel: 'conservative',
      });

      expect(result).toBe(dbValue);
    });

    it('should use fallback ENUM when database unavailable and no cache', async () => {
      const client = createMockSupabaseClient({ shouldError: true });

      // No cache provided
      const service = new SupabaseCostEstimationService(client);

      const params = {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'chat' as const,
        confidenceLevel: 'conservative' as const,
      };

      const result = await service.getLLMCostEstimate(params);

      const expectedFallback = getLLMCostEstimateFallback(
        params.provider,
        params.model,
        params.operationType,
        params.confidenceLevel
      );

      expect(result).toBe(expectedFallback);
    });

    it('should query database on every request without cache', async () => {
      const dbValue = 0.05;
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: dbValue },
      });

      const service = new SupabaseCostEstimationService(client);

      const params = {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'chat' as const,
        confidenceLevel: 'conservative' as const,
      };

      // Multiple requests should all hit the database
      await service.getLLMCostEstimate(params);
      await service.getLLMCostEstimate(params);
      await service.getLLMCostEstimate(params);

      // Check that database was queried multiple times
      expect(client.from).toHaveBeenCalledTimes(3);
    });
  });

  describe('E2B cost estimation', () => {
    it('should return database value for E2B cost estimate', async () => {
      const dbValue = 0.03;
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: dbValue },
      });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        e2bCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.getE2BCostEstimate({
        tier: 'standard',
        region: 'us-east-1',
        operationType: 'standard_session',
        confidenceLevel: 'conservative',
      });

      expect(result).toBe(dbValue);
      expect(cache.set).toHaveBeenCalled();
    });

    it('should use fallback ENUM for E2B when database unavailable', async () => {
      const client = createMockSupabaseClient({ shouldError: true });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        e2bCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const params = {
        tier: 'standard',
        region: 'us-east-1',
        operationType: 'standard_session' as const,
        confidenceLevel: 'conservative' as const,
      };

      const result = await service.getE2BCostEstimate(params);

      const expectedFallback = getE2BCostEstimateFallback(
        params.tier,
        params.region,
        params.operationType,
        params.confidenceLevel
      );

      expect(result).toBe(expectedFallback);
    });

    it('should cache E2B estimates and return cached value on subsequent requests', async () => {
      const dbValue = 0.03;
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: dbValue },
      });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        e2bCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const params = {
        tier: 'standard',
        region: 'us-east-1',
        operationType: 'standard_session' as const,
        confidenceLevel: 'conservative' as const,
      };

      // First request
      await service.getE2BCostEstimate(params);
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Second request - should use cache
      const result = await service.getE2BCostEstimate(params);
      expect(result).toBe(dbValue);
      expect(cache.set).toHaveBeenCalledTimes(1); // Still only one set
    });
  });

  describe('fallback ENUM tests', () => {
    it('should return correct fallback for known LLM models', () => {
      const anthropicSonnetChat = getLLMCostEstimateFallback(
        'anthropic',
        'claude-3-sonnet-20240229',
        'chat',
        'conservative'
      );
      expect(anthropicSonnetChat).toBeGreaterThan(0);
      expect(typeof anthropicSonnetChat).toBe('number');
    });

    it('should return default fallback for unknown LLM models', () => {
      const unknownModel = getLLMCostEstimateFallback(
        'unknown-provider',
        'unknown-model',
        'chat',
        'conservative'
      );
      expect(unknownModel).toBeGreaterThan(0);
      expect(typeof unknownModel).toBe('number');
    });

    it('should return correct fallback for known E2B tiers', () => {
      const standardTier = getE2BCostEstimateFallback(
        'standard',
        'us-east-1',
        'standard_session',
        'conservative'
      );
      expect(standardTier).toBeGreaterThan(0);
      expect(typeof standardTier).toBe('number');
    });

    it('should return default fallback for unknown E2B tiers', () => {
      const unknownTier = getE2BCostEstimateFallback(
        'unknown-tier',
        'us-east-1',
        'standard_session',
        'conservative'
      );
      expect(unknownTier).toBeGreaterThan(0);
      expect(typeof unknownTier).toBe('number');
    });

    it('should have different confidence levels for LLM', () => {
      const conservative = getLLMCostEstimateFallback(
        'anthropic',
        'claude-3-sonnet-20240229',
        'chat',
        'conservative'
      );
      const typical = getLLMCostEstimateFallback(
        'anthropic',
        'claude-3-sonnet-20240229',
        'chat',
        'typical'
      );
      const optimistic = getLLMCostEstimateFallback(
        'anthropic',
        'claude-3-sonnet-20240229',
        'chat',
        'optimistic'
      );

      expect(conservative).toBeGreaterThan(typical);
      expect(typical).toBeGreaterThan(optimistic);
    });

    it('should have different confidence levels for E2B', () => {
      const conservative = getE2BCostEstimateFallback(
        'standard',
        'us-east-1',
        'standard_session',
        'conservative'
      );
      const typical = getE2BCostEstimateFallback(
        'standard',
        'us-east-1',
        'standard_session',
        'typical'
      );
      const optimistic = getE2BCostEstimateFallback(
        'standard',
        'us-east-1',
        'standard_session',
        'optimistic'
      );

      expect(conservative).toBeGreaterThan(typical);
      expect(typical).toBeGreaterThan(optimistic);
    });
  });

  describe('cache key generation', () => {
    it('should generate unique cache keys for different LLM parameters', async () => {
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: 0.05 },
      });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        llmCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      // Request with different parameters
      await service.getLLMCostEstimate({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'chat',
        confidenceLevel: 'conservative',
      });

      await service.getLLMCostEstimate({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        operationType: 'tool_use',
        confidenceLevel: 'conservative',
      });

      // Should have 2 different cache entries
      expect(cache._storage.size).toBe(2);
    });

    it('should generate unique cache keys for different E2B parameters', async () => {
      const client = createMockSupabaseClient({
        returnData: { estimated_cost_usd: 0.03 },
      });
      const cache = createMockCache<number>();

      const service = new SupabaseCostEstimationService(client, {
        e2bCache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await service.getE2BCostEstimate({
        tier: 'standard',
        region: 'us-east-1',
        operationType: 'standard_session',
        confidenceLevel: 'conservative',
      });

      await service.getE2BCostEstimate({
        tier: 'gpu',
        region: 'us-east-1',
        operationType: 'standard_session',
        confidenceLevel: 'conservative',
      });

      // Should have 2 different cache entries
      expect(cache._storage.size).toBe(2);
    });
  });
});
