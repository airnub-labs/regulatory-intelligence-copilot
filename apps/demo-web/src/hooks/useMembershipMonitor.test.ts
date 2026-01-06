import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockSupabaseRpc = vi.fn();
const mockSessionUpdate = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        currentTenantId: 'tenant-456',
      },
    },
    update: mockSessionUpdate,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mockSupabaseRpc,
  }),
}));

describe('useMembershipMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should not check for events when session is missing', async () => {
    vi.mocked(require('next-auth/react').useSession).mockReturnValue({
      data: null,
      update: mockSessionUpdate,
    });

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    // Fast-forward time
    vi.advanceTimersByTime(10000);

    expect(mockSupabaseRpc).not.toHaveBeenCalled();
  });

  it('should check for pending events on mount', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: [],
      error: null,
    });

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_pending_membership_events', {
        p_user_id: 'user-123',
      });
    });
  });

  it('should show notification when events are pending', async () => {
    const mockEvents = [
      {
        event_id: 'event-1',
        tenant_id: 'tenant-789',
        tenant_name: 'Test Workspace',
        event_type: 'added',
        new_role: 'member',
        created_at: new Date().toISOString(),
      },
    ];

    mockSupabaseRpc.mockResolvedValue({
      data: mockEvents,
      error: null,
    });

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(result.current.showNotification).toBe(true);
      expect(result.current.pendingEvents).toEqual(mockEvents);
    });
  });

  it('should auto-switch workspace when removed from active workspace', async () => {
    const mockEvents = [
      {
        event_id: 'event-1',
        tenant_id: 'tenant-456', // Same as current tenant
        tenant_name: 'Current Workspace',
        event_type: 'removed',
        old_role: 'member',
        created_at: new Date().toISOString(),
      },
    ];

    const mockTenants = [
      {
        tenant_id: 'tenant-personal',
        tenant_name: 'Personal Workspace',
        tenant_type: 'personal',
        role: 'owner',
      },
    ];

    // First call returns the removal event
    mockSupabaseRpc.mockResolvedValueOnce({
      data: mockEvents,
      error: null,
    });

    // Second call returns available tenants
    mockSupabaseRpc.mockResolvedValueOnce({
      data: mockTenants,
      error: null,
    });

    // Third call switches tenant
    mockSupabaseRpc.mockResolvedValueOnce({
      data: { success: true },
      error: null,
    });

    mockSessionUpdate.mockResolvedValue(undefined);

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_user_tenants');
    });

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith('switch_tenant', {
        p_tenant_id: 'tenant-personal',
      });
    });

    await waitFor(() => {
      expect(mockSessionUpdate).toHaveBeenCalled();
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });

  it('should handle suspension event', async () => {
    const mockEvents = [
      {
        event_id: 'event-1',
        tenant_id: 'tenant-456',
        tenant_name: 'Current Workspace',
        event_type: 'suspended',
        old_status: 'active',
        new_status: 'suspended',
        created_at: new Date().toISOString(),
      },
    ];

    mockSupabaseRpc.mockResolvedValueOnce({
      data: mockEvents,
      error: null,
    });

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(result.current.pendingEvents).toHaveLength(1);
      expect(result.current.pendingEvents[0].event_type).toBe('suspended');
    });
  });

  it('should redirect to no-workspaces page when user has no workspaces left', async () => {
    const mockEvents = [
      {
        event_id: 'event-1',
        tenant_id: 'tenant-456',
        tenant_name: 'Current Workspace',
        event_type: 'removed',
        created_at: new Date().toISOString(),
      },
    ];

    mockSupabaseRpc.mockResolvedValueOnce({
      data: mockEvents,
      error: null,
    });

    mockSupabaseRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/no-workspaces');
    });
  });

  it('should dismiss notifications and mark events as processed', async () => {
    const mockEvents = [
      {
        event_id: 'event-1',
        tenant_id: 'tenant-789',
        tenant_name: 'Test Workspace',
        event_type: 'role_changed',
        old_role: 'member',
        new_role: 'admin',
        created_at: new Date().toISOString(),
      },
    ];

    mockSupabaseRpc.mockResolvedValueOnce({
      data: mockEvents,
      error: null,
    });

    mockSupabaseRpc.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(result.current.pendingEvents).toHaveLength(1);
    });

    await result.current.dismissNotification();

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith('mark_membership_events_processed', {
        p_user_id: 'user-123',
        p_event_ids: ['event-1'],
      });
    });

    expect(result.current.pendingEvents).toHaveLength(0);
    expect(result.current.showNotification).toBe(false);
  });

  it('should poll for events every 10 seconds', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: [],
      error: null,
    });

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);
    });

    // Fast-forward to 10 seconds
    vi.advanceTimersByTime(10000);

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(2);
    });

    // Fast-forward another 10 seconds
    vi.advanceTimersByTime(10000);

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(3);
    });
  });

  it('should prevent concurrent removal handling', async () => {
    const mockEvents = [
      {
        event_id: 'event-1',
        tenant_id: 'tenant-456',
        tenant_name: 'Current Workspace',
        event_type: 'removed',
        created_at: new Date().toISOString(),
      },
    ];

    // First check finds removal event
    mockSupabaseRpc.mockResolvedValueOnce({
      data: mockEvents,
      error: null,
    });

    // Slow tenant fetch
    mockSupabaseRpc.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ data: [], error: null }), 5000))
    );

    const { useMembershipMonitor } = await import('./useMembershipMonitor');
    const { result } = renderHook(() => useMembershipMonitor());

    await waitFor(() => {
      expect(result.current.isHandlingRemoval).toBe(true);
    });

    // Fast-forward to next poll interval while still handling removal
    vi.advanceTimersByTime(10000);

    // Should not start another removal handler
    expect(result.current.isHandlingRemoval).toBe(true);
  });
});
