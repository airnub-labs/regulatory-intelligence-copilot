import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockSupabaseRpc = vi.fn();
const mockSessionUpdate = vi.fn();
const mockReload = vi.fn();

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

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mockSupabaseRpc,
  }),
}));

// Mock window.location.reload
Object.defineProperty(window, 'location', {
  writable: true,
  value: { reload: mockReload },
});

describe('useSessionSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should not check sync when session is missing', async () => {
    vi.mocked(require('next-auth/react').useSession).mockReturnValue({
      data: null,
      update: mockSessionUpdate,
    });

    const { useSessionSync } = await import('./useSessionSync');
    const { result } = renderHook(() => useSessionSync());

    // Fast-forward time
    vi.advanceTimersByTime(30000);

    expect(mockSupabaseRpc).not.toHaveBeenCalled();
  });

  it('should check sync when session exists', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: 'tenant-456', // Same as JWT
      error: null,
    });

    const { useSessionSync } = await import('./useSessionSync');
    const { result } = renderHook(() => useSessionSync());

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_current_tenant_id', {
        p_user_id: 'user-123',
      });
    });

    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it('should auto-heal when mismatch detected', async () => {
    // First call returns different tenant ID (mismatch)
    mockSupabaseRpc.mockResolvedValueOnce({
      data: 'tenant-789', // Different from JWT (tenant-456)
      error: null,
    });

    // Second call (verification) returns same tenant ID (healing worked)
    mockSupabaseRpc.mockResolvedValueOnce({
      data: 'tenant-789',
      error: null,
    });

    mockSessionUpdate.mockResolvedValue(undefined);

    const { useSessionSync } = await import('./useSessionSync');
    const { result } = renderHook(() => useSessionSync());

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_current_tenant_id', {
        p_user_id: 'user-123',
      });
    });

    await waitFor(() => {
      expect(mockSessionUpdate).toHaveBeenCalled();
    });

    // Fast-forward to verification check
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(2);
    });

    expect(mockReload).not.toHaveBeenCalled();
  });

  it('should force reload when healing fails', async () => {
    // First call returns mismatch
    mockSupabaseRpc.mockResolvedValueOnce({
      data: 'tenant-789',
      error: null,
    });

    // Second call (verification) still returns mismatch
    mockSupabaseRpc.mockResolvedValueOnce({
      data: 'tenant-789',
      error: null,
    });

    mockSessionUpdate.mockResolvedValue(undefined);

    const { useSessionSync } = await import('./useSessionSync');
    const { result } = renderHook(() => useSessionSync());

    await waitFor(() => {
      expect(mockSessionUpdate).toHaveBeenCalled();
    });

    // Fast-forward to verification check
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it('should force reload when session update fails', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: 'tenant-789',
      error: null,
    });

    mockSessionUpdate.mockRejectedValue(new Error('Update failed'));

    const { useSessionSync } = await import('./useSessionSync');
    const { result } = renderHook(() => useSessionSync());

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it('should rate limit checks to 30 seconds', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: 'tenant-456',
      error: null,
    });

    const { useSessionSync } = await import('./useSessionSync');
    const { result } = renderHook(() => useSessionSync());

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);
    });

    // Fast-forward less than 30 seconds
    vi.advanceTimersByTime(10000);

    // Should not check again
    expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);

    // Fast-forward to 30 seconds
    vi.advanceTimersByTime(20000);

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(2);
    });
  });

  it('should prevent concurrent healing attempts', async () => {
    // Simulate mismatch
    mockSupabaseRpc.mockResolvedValue({
      data: 'tenant-789',
      error: null,
    });

    mockSessionUpdate.mockImplementation(() =>
      new Promise(resolve => setTimeout(resolve, 5000))
    );

    const { useSessionSync } = await import('./useSessionSync');
    const { result } = renderHook(() => useSessionSync());

    await waitFor(() => {
      expect(mockSessionUpdate).toHaveBeenCalledTimes(1);
    });

    // Fast-forward to next check interval while healing is in progress
    vi.advanceTimersByTime(30000);

    // Should not start another healing attempt
    expect(mockSessionUpdate).toHaveBeenCalledTimes(1);
  });
});
