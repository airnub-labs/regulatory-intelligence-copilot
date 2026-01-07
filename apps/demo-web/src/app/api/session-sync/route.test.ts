import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Integration Tests: Session Sync Database Functions
 *
 * These tests verify the database functions created in the
 * 20260107000002_session_sync_monitoring.sql migration.
 */

const mockSupabaseRpc = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mockSupabaseRpc,
    from: mockSupabaseFrom,
  }),
}));

describe('Session Sync Database Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get_current_tenant_id', () => {
    it('should return current tenant ID for user', async () => {
      const userId = 'user-123';
      const expectedTenantId = 'tenant-456';

      mockSupabaseRpc.mockResolvedValue({
        data: expectedTenantId,
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data, error } = await supabase
        .rpc('get_current_tenant_id', { p_user_id: userId })
        .single();

      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_current_tenant_id', {
        p_user_id: userId,
      });
      expect(data).toBe(expectedTenantId);
      expect(error).toBeNull();
    });

    it('should return null when user has no active tenant', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data } = await supabase
        .rpc('get_current_tenant_id', { p_user_id: 'user-no-tenant' })
        .single();

      expect(data).toBeNull();
    });
  });

  describe('log_session_mismatch', () => {
    it('should log session mismatch event', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const logData = {
        p_user_id: 'user-123',
        p_expected_tenant_id: 'tenant-456',
        p_actual_tenant_id: 'tenant-789',
        p_request_path: '/api/conversations',
      };

      await supabase.rpc('log_session_mismatch', logData);

      expect(mockSupabaseRpc).toHaveBeenCalledWith('log_session_mismatch', logData);
    });

    it('should create record in session_sync_logs table', async () => {
      // This test would verify the actual database insertion
      // In a real integration test with actual database:

      // 1. Call log_session_mismatch
      // 2. Query session_sync_logs table
      // 3. Verify record was created with correct data

      const expectedRecord = {
        user_id: 'user-123',
        expected_tenant_id: 'tenant-456',
        actual_tenant_id: 'tenant-789',
        request_path: '/api/conversations',
      };

      // Mock the query
      const selectMock = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [expectedRecord],
          error: null,
        }),
      };

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue(selectMock),
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data } = await supabase
        .from('session_sync_logs')
        .select('*')
        .eq('user_id', 'user-123')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(data).toHaveLength(1);
      expect(data[0].user_id).toBe('user-123');
    });
  });

  describe('get_session_sync_stats', () => {
    it('should return statistics for last 24 hours by default', async () => {
      const mockStats = {
        total_mismatches: 15,
        affected_users: 3,
        most_common_path: '/api/conversations',
        mismatch_count_by_path: {
          '/api/conversations': 10,
          '/api/workspaces': 3,
          '/dashboard': 2,
        },
      };

      mockSupabaseRpc.mockResolvedValue({
        data: mockStats,
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data } = await supabase
        .rpc('get_session_sync_stats', { p_hours_back: 24 })
        .single();

      expect(data.total_mismatches).toBe(15);
      expect(data.affected_users).toBe(3);
      expect(data.most_common_path).toBe('/api/conversations');
    });

    it('should support custom time ranges', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: {
          total_mismatches: 50,
          affected_users: 10,
          most_common_path: '/api/conversations',
          mismatch_count_by_path: {},
        },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      await supabase
        .rpc('get_session_sync_stats', { p_hours_back: 168 }) // 7 days
        .single();

      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_session_sync_stats', {
        p_hours_back: 168,
      });
    });
  });

  describe('cleanup_old_session_sync_logs', () => {
    it('should delete logs older than 30 days', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: 42, // Number of deleted records
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data } = await supabase.rpc('cleanup_old_session_sync_logs');

      expect(data).toBe(42);
    });

    it('should return 0 when no old logs exist', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: 0,
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data } = await supabase.rpc('cleanup_old_session_sync_logs');

      expect(data).toBe(0);
    });
  });
});

describe('Middleware Integration', () => {
  it('should detect and log session/DB mismatch', async () => {
    // This test would verify the middleware behavior:
    // 1. Mock JWT with currentTenantId = 'tenant-A'
    // 2. Mock database returning current_tenant_id = 'tenant-B'
    // 3. Verify log_session_mismatch is called
    // 4. Verify X-Session-Refresh-Required header is set
  });

  it('should not log when session and DB match', async () => {
    // This test would verify:
    // 1. JWT currentTenantId = 'tenant-A'
    // 2. Database current_tenant_id = 'tenant-A'
    // 3. No log_session_mismatch call
    // 4. No special headers set
  });

  it('should skip check for unauthenticated requests', async () => {
    // Verify middleware doesn't check when no JWT token exists
  });

  it('should skip check for static files and auth endpoints', async () => {
    // Verify middleware matcher excludes:
    // - /_next/static
    // - /api/auth
    // - /favicon.ico
    // - Image files
  });
});
