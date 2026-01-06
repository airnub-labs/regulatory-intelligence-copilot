import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockSupabaseRpc = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mockSupabaseRpc,
    from: mockSupabaseFrom,
  }),
}));

vi.mock('@reg-copilot/reg-intel-observability', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Query Performance Monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getQueryPerformanceStats', () => {
    it('should fetch performance statistics', async () => {
      const mockStats = [
        {
          query_type: 'select',
          table_name: 'conversations',
          avg_execution_time_ms: 150.25,
          max_execution_time_ms: 450,
          query_count: 42,
          slowest_tenant_id: 'tenant-123',
        },
        {
          query_type: 'select',
          table_name: 'messages',
          avg_execution_time_ms: 75.50,
          max_execution_time_ms: 200,
          query_count: 100,
          slowest_tenant_id: 'tenant-456',
        },
      ];

      mockSupabaseRpc.mockResolvedValue({
        data: mockStats,
        error: null,
      });

      const { getQueryPerformanceStats } = await import('./queryPerformance');
      const stats = await getQueryPerformanceStats(24, 100);

      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_query_performance_stats', {
        p_hours_back: 24,
        p_min_execution_time_ms: 100,
      });

      expect(stats).toEqual(mockStats);
    });

    it('should return empty array on error', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const { getQueryPerformanceStats } = await import('./queryPerformance');
      const stats = await getQueryPerformanceStats(24, 100);

      expect(stats).toEqual([]);
    });
  });

  describe('getUserTenantCount', () => {
    it('should return tenant count for user', async () => {
      mockSupabaseRpc.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: 15,
          error: null,
        }),
      });

      const { getUserTenantCount } = await import('./queryPerformance');
      const count = await getUserTenantCount('user-123');

      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_user_tenant_count', {
        p_user_id: 'user-123',
      });

      expect(count).toBe(15);
    });

    it('should return 0 on error', async () => {
      mockSupabaseRpc.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'User not found' },
        }),
      });

      const { getUserTenantCount } = await import('./queryPerformance');
      const count = await getUserTenantCount('user-invalid');

      expect(count).toBe(0);
    });

    it('should identify users with many tenants', async () => {
      mockSupabaseRpc.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: 75,
          error: null,
        }),
      });

      const { getUserTenantCount } = await import('./queryPerformance');
      const count = await getUserTenantCount('user-power-user');

      expect(count).toBeGreaterThan(50);
      // This user may experience RLS performance issues
    });
  });

  describe('getRLSIndexUsage', () => {
    it('should fetch index usage statistics', async () => {
      const mockIndexStats = [
        {
          index_name: 'idx_memberships_user_tenant_status',
          table_name: 'tenant_memberships',
          index_scans: 15420,
          tuples_read: 45000,
          tuples_fetched: 44800,
          index_size_mb: 2.5,
        },
        {
          index_name: 'idx_tenants_owner_active',
          table_name: 'tenants',
          index_scans: 8750,
          tuples_read: 12000,
          tuples_fetched: 11900,
          index_size_mb: 1.2,
        },
      ];

      mockSupabaseRpc.mockResolvedValue({
        data: mockIndexStats,
        error: null,
      });

      const { getRLSIndexUsage } = await import('./queryPerformance');
      const stats = await getRLSIndexUsage();

      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_rls_index_usage');
      expect(stats).toEqual(mockIndexStats);
    });

    it('should identify unused indexes', async () => {
      const mockIndexStats = [
        {
          index_name: 'idx_unused_index',
          table_name: 'some_table',
          index_scans: 5, // Very low usage
          tuples_read: 10,
          tuples_fetched: 10,
          index_size_mb: 5.0, // Taking up space
        },
      ];

      mockSupabaseRpc.mockResolvedValue({
        data: mockIndexStats,
        error: null,
      });

      const { getRLSIndexUsage } = await import('./queryPerformance');
      const stats = await getRLSIndexUsage();

      const unusedIndexes = stats.filter((stat) => stat.index_scans < 100);
      expect(unusedIndexes).toHaveLength(1);
      // Consider removing this index
    });
  });

  describe('measureQuery', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should measure fast query without logging', async () => {
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabaseFrom.mockReturnValue({
        insert: mockInsert,
      });

      const { measureQuery } = await import('./queryPerformance');

      const mockQueryFn = async () => {
        vi.advanceTimersByTime(50); // Simulate 50ms query
        return { data: [], error: null };
      };

      await measureQuery(mockQueryFn, {
        query_type: 'select',
        table_name: 'conversations',
        tenant_id: 'tenant-123',
      });

      // Should not log queries < 100ms (default threshold)
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should measure and log slow query', async () => {
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabaseFrom.mockReturnValue({
        insert: mockInsert,
      });

      const { measureQuery } = await import('./queryPerformance');

      const mockQueryFn = async () => {
        vi.advanceTimersByTime(250); // Simulate 250ms query
        return { data: [], error: null };
      };

      await measureQuery(mockQueryFn, {
        query_type: 'select',
        table_name: 'conversations',
        tenant_id: 'tenant-123',
        user_id: 'user-456',
      });

      // Should log queries >= 100ms
      expect(mockInsert).toHaveBeenCalledWith({
        query_type: 'select',
        table_name: 'conversations',
        tenant_id: 'tenant-123',
        user_id: 'user-456',
        execution_time_ms: expect.any(Number),
        function_name: undefined,
        query_params: undefined,
      });
    });

    it('should log slow failed queries', async () => {
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabaseFrom.mockReturnValue({
        insert: mockInsert,
      });

      const { measureQuery } = await import('./queryPerformance');

      const mockQueryFn = async () => {
        vi.advanceTimersByTime(300); // Simulate 300ms query
        throw new Error('Query failed');
      };

      await expect(
        measureQuery(mockQueryFn, {
          query_type: 'select',
          table_name: 'conversations',
        })
      ).rejects.toThrow('Query failed');

      // Should still log slow failed queries
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('logSlowQuery', () => {
    it('should log query to database', async () => {
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabaseFrom.mockReturnValue({
        insert: mockInsert,
      });

      const { logSlowQuery } = await import('./queryPerformance');

      await logSlowQuery({
        query_type: 'select',
        table_name: 'conversations',
        execution_time_ms: 350,
        tenant_id: 'tenant-123',
        user_id: 'user-456',
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith('slow_query_log');
      expect(mockInsert).toHaveBeenCalledWith({
        query_type: 'select',
        table_name: 'conversations',
        execution_time_ms: 350,
        tenant_id: 'tenant-123',
        user_id: 'user-456',
        function_name: undefined,
        query_params: undefined,
      });
    });

    it('should handle logging errors gracefully', async () => {
      const mockInsert = vi.fn().mockRejectedValue(new Error('Database error'));

      mockSupabaseFrom.mockReturnValue({
        insert: mockInsert,
      });

      const { logSlowQuery } = await import('./queryPerformance');

      // Should not throw even if logging fails
      await expect(
        logSlowQuery({
          query_type: 'select',
          table_name: 'conversations',
          execution_time_ms: 350,
        })
      ).resolves.not.toThrow();
    });
  });
});

describe('RLS Performance Database Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should test get_query_performance_stats RPC', async () => {
    // This would be an integration test with actual database
    // Testing the SQL function behavior:

    const expectedStats = {
      query_type: 'select',
      table_name: 'conversations',
      avg_execution_time_ms: 125.5,
      max_execution_time_ms: 500,
      query_count: 50,
      slowest_tenant_id: 'tenant-123',
    };

    mockSupabaseRpc.mockResolvedValue({
      data: [expectedStats],
      error: null,
    });

    const { getQueryPerformanceStats } = await import('./queryPerformance');
    const stats = await getQueryPerformanceStats(24, 100);

    expect(stats[0]).toMatchObject(expectedStats);
  });

  it('should test get_user_tenant_count RPC', async () => {
    // Integration test scenario:
    // User with 3 active memberships + 1 suspended
    // Should return 3 (only active)

    mockSupabaseRpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: 3,
        error: null,
      }),
    });

    const { getUserTenantCount } = await import('./queryPerformance');
    const count = await getUserTenantCount('user-123');

    expect(count).toBe(3);
  });
});
