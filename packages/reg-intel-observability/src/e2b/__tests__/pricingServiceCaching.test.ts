/**
 * E2B Pricing Service Caching Tests
 *
 * Comprehensive tests for Redis/Upstash caching in E2B pricing service:
 * - Service with Redis cache
 * - Service without cache (pass-through mode)
 * - Fallback pricing when database unavailable
 * - Cache hit/miss scenarios
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseE2BPricingService } from '../pricingService.js';

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

describe('SupabaseE2BPricingService caching', () => {
  describe('with Redis cache', () => {
    it('should return database value and cache it on first request', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.getPricing('standard', 'us-east-1');

      expect(result).not.toBeNull();
      expect(result?.tier).toBe('standard');
      expect(result?.region).toBe('us-east-1');
      expect(result?.pricePerSecond).toBe(0.0001);
      expect(cache.get).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
      expect(cache._storage.size).toBe(1);
    });

    it('should return cached value on second request without database query', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      // First request - database query
      const result1 = await service.getPricing('standard', 'us-east-1');
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Second request - cache hit
      const result2 = await service.getPricing('standard', 'us-east-1');
      expect(result2).toEqual(result1);
      expect(cache.set).toHaveBeenCalledTimes(1); // Still only one set
      expect(cache.get).toHaveBeenCalledTimes(2); // Two get calls
    });

    it('should cache null results with shorter TTL', async () => {
      const client = createMockSupabaseClient({ returnData: [] }); // No data found
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.getPricing('unknown-tier', 'us-east-1');

      expect(result).toBeNull();
      expect(cache.set).toHaveBeenCalled();
      // Check that shorter TTL was used (300 seconds)
      const setCall = cache.set.mock.calls[0];
      expect(setCall[2]).toBe(300); // Third argument is TTL
    });

    it('should throw error when database returns error', async () => {
      const client = createMockSupabaseClient({ shouldError: true });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await expect(service.getPricing('standard', 'us-east-1')).rejects.toThrow();
    });

    it('should calculate cost using cached pricing', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: 0.05,
          price_per_gb_memory_hour: 0.01,
          price_per_gb_disk_io: 0.001,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const costCalc = await service.calculateCost({
        tier: 'standard',
        region: 'us-east-1',
        resourceUsage: {
          executionTimeSeconds: 300, // 5 minutes
          cpuCoreSeconds: 600,
          memoryGbSeconds: 1800,
          diskIoGb: 5,
        },
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
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });

      // No cache provided
      const service = new SupabaseE2BPricingService(client);

      const result = await service.getPricing('standard', 'us-east-1');

      expect(result).not.toBeNull();
      expect(result?.tier).toBe('standard');
    });

    it('should query database on every request without cache', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });

      const service = new SupabaseE2BPricingService(client);

      // Multiple requests should all hit the database
      await service.getPricing('standard', 'us-east-1');
      await service.getPricing('standard', 'us-east-1');
      await service.getPricing('standard', 'us-east-1');

      // Check that database was queried multiple times
      expect(client.from).toHaveBeenCalledTimes(3);
    });
  });

  describe('fallback pricing', () => {
    it('should use fallback pricing when database has no data', async () => {
      const client = createMockSupabaseClient({ returnData: [] });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const costCalc = await service.calculateCost({
        tier: 'standard',
        region: 'us-east-1',
        resourceUsage: {
          executionTimeSeconds: 300,
        },
      });

      expect(costCalc.isEstimated).toBe(true);
      expect(costCalc.totalCostUsd).toBeGreaterThan(0);
      // Standard fallback is 0.0001 per second
      expect(costCalc.totalCostUsd).toBe(300 * 0.0001);
    });

    it('should use fallback for unknown tier', async () => {
      const client = createMockSupabaseClient({ returnData: [] });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const costCalc = await service.calculateCost({
        tier: 'unknown-tier',
        region: 'us-east-1',
        resourceUsage: {
          executionTimeSeconds: 300,
        },
      });

      expect(costCalc.isEstimated).toBe(true);
      expect(costCalc.totalCostUsd).toBeGreaterThan(0);
    });
  });

  describe('cache key generation', () => {
    it('should generate unique cache keys for different tiers', async () => {
      const dbPricingStandard = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const dbPricingGpu = [
        {
          tier: 'gpu',
          region: 'us-east-1',
          price_per_second: 0.001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
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
                  data: callCount === 1 ? dbPricingStandard : dbPricingGpu,
                  error: null,
                });
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      } as any;

      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await service.getPricing('standard', 'us-east-1');
      await service.getPricing('gpu', 'us-east-1');

      // Should have 2 different cache entries
      expect(cache._storage.size).toBe(2);
    });

    it('should generate different cache keys for different regions', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
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

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await service.getPricing('standard', 'us-east-1');
      await service.getPricing('standard', 'eu-west-1');

      // Should have 2 different cache entries
      expect(cache._storage.size).toBe(2);
    });

    it('should generate different cache keys for different dates', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
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

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      await service.getPricing('standard', 'us-east-1');
      await service.getPricing('standard', 'us-east-1', new Date('2024-01-01'));

      // Should have 2 different cache entries (current date vs specific date)
      expect(cache._storage.size).toBe(2);
    });
  });

  describe('cost calculation', () => {
    it('should calculate execution cost correctly', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: null,
          price_per_gb_memory_hour: null,
          price_per_gb_disk_io: null,
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.calculateCost({
        tier: 'standard',
        region: 'us-east-1',
        resourceUsage: {
          executionTimeSeconds: 300, // 5 minutes
        },
      });

      // Cost should be: 300 seconds * $0.0001/sec = $0.03
      expect(result.executionCostUsd).toBeCloseTo(0.03, 5);
      expect(result.resourceCostUsd).toBe(0);
      expect(result.totalCostUsd).toBeCloseTo(0.03, 5);
      expect(result.isEstimated).toBe(false);
    });

    it('should calculate resource costs when available', async () => {
      const dbPricing = [
        {
          tier: 'standard',
          region: 'us-east-1',
          price_per_second: 0.0001,
          price_per_cpu_core_hour: 0.05, // $0.05 per core-hour
          price_per_gb_memory_hour: 0.01, // $0.01 per GB-hour
          price_per_gb_disk_io: 0.001, // $0.001 per GB
          effective_date: new Date().toISOString(),
          expires_at: null,
          notes: null,
        },
      ];

      const client = createMockSupabaseClient({ returnData: dbPricing });
      const cache = createMockCache<any>();

      const service = new SupabaseE2BPricingService(client, {
        cache: cache as any,
        cacheTtlSeconds: 3600,
      });

      const result = await service.calculateCost({
        tier: 'standard',
        region: 'us-east-1',
        resourceUsage: {
          executionTimeSeconds: 3600, // 1 hour
          cpuCoreSeconds: 3600, // 1 core-hour
          memoryGbSeconds: 3600, // 1 GB-hour
          diskIoGb: 10, // 10 GB disk I/O
        },
      });

      // Execution cost: 3600 * $0.0001 = $0.36
      expect(result.executionCostUsd).toBeCloseTo(0.36, 5);

      // Resource cost:
      // CPU: (3600 / 3600) * $0.05 = $0.05
      // Memory: (3600 / 3600) * $0.01 = $0.01
      // Disk: 10 * $0.001 = $0.01
      // Total: $0.05 + $0.01 + $0.01 = $0.07
      expect(result.resourceCostUsd).toBeCloseTo(0.07, 5);

      // Total: $0.36 + $0.07 = $0.43
      expect(result.totalCostUsd).toBeCloseTo(0.43, 5);
      expect(result.isEstimated).toBe(false);
    });
  });
});
