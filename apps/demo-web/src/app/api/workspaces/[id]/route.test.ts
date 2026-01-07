import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockLogger = {
  child: vi.fn(() => mockLogger),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockCreateUnrestrictedServiceClient = vi.fn();
const mockSupabaseRpc = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock('@reg-copilot/reg-intel-observability', async () => {
  const actual = await vi.importActual<typeof import('@reg-copilot/reg-intel-observability')>(
    '@reg-copilot/reg-intel-observability'
  );
  return {
    ...actual,
    createLogger: () => mockLogger,
  };
});

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(async () => ({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      currentTenantId: 'tenant-456',
    },
  })),
}));

vi.mock('@/lib/auth/tenantContext', () => ({
  getTenantContext: vi.fn(async () => ({
    userId: 'user-123',
    tenantId: 'tenant-456',
    role: 'owner',
  })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

vi.mock('@/lib/supabase/tenantScopedServiceClient', () => ({
  createUnrestrictedServiceClient: (...args: unknown[]) => mockCreateUnrestrictedServiceClient(...args),
}));

describe('DELETE /api/workspaces/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockCreateUnrestrictedServiceClient.mockClear();
    mockSupabaseRpc.mockClear();
    mockSupabaseFrom.mockClear();

    // Default mock implementation
    mockCreateUnrestrictedServiceClient.mockReturnValue({
      rpc: mockSupabaseRpc,
      from: mockSupabaseFrom,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('successfully deletes a team workspace', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: true,
        deleted_at: '2026-01-07T00:00:00Z',
        workspace_name: 'Test Workspace',
        members_affected: 3,
        grace_period_days: 30,
      },
      error: null,
    });

    const { DELETE } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.workspace_name).toBe('Test Workspace');
    expect(data.members_affected).toBe(3);
    expect(mockSupabaseRpc).toHaveBeenCalledWith('delete_workspace', {
      p_tenant_id: 'workspace-123',
      p_user_id: 'user-123',
    });
  });

  it('rejects deletion of personal workspace', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'Personal workspaces cannot be deleted',
      },
      error: null,
    });

    const { DELETE } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/personal-workspace', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: { id: 'personal-workspace' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Personal workspaces cannot be deleted');
  });

  it('rejects deletion when user is not owner', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'Only workspace owners can delete workspaces',
        user_role: 'member',
      },
      error: null,
    });

    const { DELETE } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Only workspace owners can delete workspaces');
  });

  it('rejects deletion when active execution contexts exist', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'Cannot delete workspace with active execution contexts. Please terminate all sandboxes first.',
        active_contexts: 2,
      },
      error: null,
    });

    const { DELETE } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('active execution contexts');
    expect(data.details.active_contexts).toBe(2);
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(await import('next-auth/next')).getServerSession.mockResolvedValueOnce(null);

    const { DELETE } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Unauthorized');
  });
});

describe('PATCH /api/workspaces/[id] (restore)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockCreateUnrestrictedServiceClient.mockClear();
    mockSupabaseRpc.mockClear();

    mockCreateUnrestrictedServiceClient.mockReturnValue({
      rpc: mockSupabaseRpc,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('successfully restores a deleted workspace', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: true,
        restored_at: '2026-01-07T12:00:00Z',
        workspace_name: 'Restored Workspace',
        members_restored: 3,
        was_deleted_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    const { PATCH } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'restore' }),
    });

    const response = await PATCH(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.workspace_name).toBe('Restored Workspace');
    expect(data.members_restored).toBe(3);
    expect(mockSupabaseRpc).toHaveBeenCalledWith('restore_workspace', {
      p_tenant_id: 'workspace-123',
      p_user_id: 'user-123',
    });
  });

  it('rejects restore when grace period expired', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'Grace period expired - workspace cannot be restored',
        deleted_at: '2025-12-01T00:00:00Z',
        days_since_deletion: 37,
      },
      error: null,
    });

    const { PATCH } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'restore' }),
    });

    const response = await PATCH(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Grace period expired');
  });

  it('rejects restore when user is not the one who deleted', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'Only the user who deleted the workspace can restore it',
      },
      error: null,
    });

    const { PATCH } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'restore' }),
    });

    const response = await PATCH(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Only the user who deleted');
  });

  it('rejects invalid action', async () => {
    const { PATCH } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'invalid-action' }),
    });

    const response = await PATCH(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid action');
  });
});

describe('GET /api/workspaces/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateUnrestrictedServiceClient.mockClear();
    mockSupabaseFrom.mockClear();

    mockCreateUnrestrictedServiceClient.mockReturnValue({
      from: mockSupabaseFrom,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns workspace details with deletion status', async () => {
    const mockWorkspaceSelect = vi.fn().mockReturnThis();
    const mockWorkspaceEq = vi.fn().mockReturnThis();
    const mockWorkspaceSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'workspace-123',
        name: 'Test Workspace',
        slug: 'test-workspace',
        type: 'team',
        plan: 'pro',
        deleted_at: '2026-01-01T00:00:00Z',
        deleted_by: 'user-123',
        created_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    });

    const mockMembershipSelect = vi.fn().mockReturnThis();
    const mockMembershipEq = vi.fn().mockReturnThis();
    const mockMembershipSingle = vi.fn().mockResolvedValue({
      data: {
        role: 'owner',
        status: 'active',
        joined_at: '2025-01-01T00:00:00Z',
        deleted_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: mockWorkspaceSelect,
          eq: mockWorkspaceEq,
          single: mockWorkspaceSingle,
        };
      } else if (table === 'tenant_memberships') {
        return {
          select: mockMembershipSelect,
          eq: mockMembershipEq,
          single: mockMembershipSingle,
        };
      }
    });

    mockWorkspaceSelect.mockReturnValue({
      eq: mockWorkspaceEq,
    });
    mockWorkspaceEq.mockReturnValue({
      single: mockWorkspaceSingle,
    });

    mockMembershipSelect.mockReturnValue({
      eq: mockMembershipEq,
    });
    mockMembershipEq.mockReturnValue({
      eq: mockMembershipEq,
      single: mockMembershipSingle,
    });

    const { GET } = await import('./route');

    const request = new NextRequest('http://localhost/api/workspaces/workspace-123', {
      method: 'GET',
    });

    const response = await GET(request, { params: { id: 'workspace-123' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workspace.name).toBe('Test Workspace');
    expect(data.workspace.deleted_at).toBeTruthy();
    expect(data.workspace.canRestore).toBe(true);
    expect(data.workspace.daysUntilPermanentDeletion).toBeGreaterThan(0);
  });
});
