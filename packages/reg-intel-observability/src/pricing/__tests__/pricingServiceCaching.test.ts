/**
 * LLM Pricing Service Caching Tests
 *
 * Comprehensive tests for Redis/Upstash caching in pricing service:
 * - Service with Redis cache
 * - Service without cache (pass-through mode)
 * - Cache hit/miss scenarios
 * - Null result caching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabasePricingService } from '../pricingService.js';

// Mock Supabase client
const createMockSupabaseClient = (options?: {
  shouldError?: boolean;
  returnData?: any[];
}) => {
  const mockResponse = options?.shouldError
    ? { data: null, error: new Error('Database error') }
    : { data: options?.returnData ?? [], error: null };

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(mockResponse),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
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

describe('SupabasePricingService caching', () => {
  describe('with Redis cache', () => {
    it('should return database value and cache it on first request', async () => {
      const dbPricing = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.getPricing('anthropic', 'claude-3-sonnet-20240229');

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('anthropic');
      expect(result?.model).toBe('claude-3-sonnet-20240229');
      expect(cache.get).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
      expect(cache._storage.size).toBe(1);
    });

    it('should return cached value on second request without database query', async () => {
      const dbPricing = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      // First request - database query
      const result1 = await service.getPricing('anthropic', 'claude-3-sonnet-20240229');
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Second request - cache hit
      const result2 = await service.getPricing('anthropic', 'claude-3-sonnet-20240229');
      expect(result2).toEqual(result1);
      expect(cache.set).toHaveBeenCalledTimes(1); // Still only one set
      expect(cache.get).toHaveBeenCalledTimes(2); // Two get calls
    });

    it('should cache null results with shorter TTL', async () => {
      const client = createMockSupabaseClient({ returnData: [] }); // No data found
      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.getPricing('unknown', 'unknown-model');

      expect(result).toBeNull();
      expect(cache.set).toHaveBeenCalled();
      // Check that shorter TTL was used (300 seconds)
      const setCall = cache.set.mock.calls[0];
      expect(setCall[2]).toBe(300); // Third argument is TTL
    });

    it('should throw error when database returns error', async () => {
      const client = createMockSupabaseClient({ shouldError: true });
      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await expect(
        service.getPricing('anthropic', 'claude-3-sonnet-20240229')
      ).rejects.toThrow();
    });

    it('should calculate cost using cached pricing', async () => {
      const dbPricing = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const costCalc = await service.calculateCost({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(costCalc.totalCostUsd).toBeGreaterThan(0);
      expect(costCalc.isEstimated).toBe(false);
      expect(cache.get).toHaveBeenCalled();
    });
  });

  describe('without Redis cache (pass-through mode)', () => {
    it('should work without cache and return database value', async () => {
      const dbPricing = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });

      // No cache provided
      const service = new SupabasePricingService(client);

      const result = await service.getPricing('anthropic', 'claude-3-sonnet-20240229');

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('anthropic');
    });

    it('should query database on every request without cache', async () => {
      const dbPricing = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });

      const service = new SupabasePricingService(client);

      // Multiple requests should all hit the database
      await service.getPricing('anthropic', 'claude-3-sonnet-20240229');
      await service.getPricing('anthropic', 'claude-3-sonnet-20240229');
      await service.getPricing('anthropic', 'claude-3-sonnet-20240229');

      // Check that database was queried multiple times
      expect(client.from).toHaveBeenCalledTimes(3);
    });
  });

  describe('cache key generation', () => {
    it('should generate unique cache keys for different models', async () => {
      const dbPricing1 = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const dbPricing2 = [
        {
          provider: 'anthropic',
          model: 'claude-3-opus-20240229',
          input_price_per_million: 15.0,
          output_price_per_million: 75.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      let callCount = 0;
      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                  data: callCount === 1 ? dbPricing1 : dbPricing2,
                  error: null,
                });
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      } as any;

      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await service.getPricing('anthropic', 'claude-3-sonnet-20240229');
      await service.getPricing('anthropic', 'claude-3-opus-20240229');

      // Should have 2 different cache entries
      expect(cache._storage.size).toBe(2);
    });

    it('should generate different cache keys for different dates', async () => {
      const dbPricing = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      let callCount = 0;
      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                  data: dbPricing,
                  error: null,
                });
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      } as any;

      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await service.getPricing('anthropic', 'claude-3-sonnet-20240229');
      await service.getPricing('anthropic', 'claude-3-sonnet-20240229', new Date('2024-01-01'));

      // Should have 2 different cache entries (current date vs specific date)
      expect(cache._storage.size).toBe(2);
    });
  });

  describe('cost calculation', () => {
    it('should calculate costs correctly using pricing from database', async () => {
      const dbPricing = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          input_price_per_million: 3.0,
          output_price_per_million: 15.0,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.calculateCost({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        inputTokens: 1_000_000, // 1 million input tokens
        outputTokens: 1_000_000, // 1 million output tokens
      });

      // Cost should be: (1M / 1M) * $3 + (1M / 1M) * $15 = $3 + $15 = $18
      expect(result.inputCostUsd).toBeCloseTo(3.0, 5);
      expect(result.outputCostUsd).toBeCloseTo(15.0, 5);
      expect(result.totalCostUsd).toBeCloseTo(18.0, 5);
      expect(result.isEstimated).toBe(false);
    });

    it('should throw error when pricing not found and no fallback', async () => {
      const client = createMockSupabaseClient({ returnData: [] }); // No data
      const cache = createMockCache<any>();

      const service = new SupabasePricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await expect(
        service.calculateCost({
          provider: 'unknown',
          model: 'unknown-model',
          inputTokens: 1000,
          outputTokens: 500,
        })
      ).rejects.toThrow();
    });
  });
});
