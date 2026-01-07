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
      email: 'admin@example.com',
    },
  })),
}));

vi.mock('@/lib/auth/tenantContext', () => ({
  getTenantContext: vi.fn(async () => ({
    userId: 'user-123',
    tenantId: 'tenant-456',
    role: 'admin',
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

describe('POST /api/invitations', () => {
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

  it('successfully creates workspace invitation', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: true,
        invitation_id: 'inv-123',
        token: 'abc123token',
        email: 'newuser@example.com',
        workspace_name: 'Test Workspace',
        role: 'member',
        expires_at: '2026-01-14T00:00:00Z',
        invite_url: 'http://localhost:3000/invite/abc123token',
        user_exists: false,
      },
      error: null,
    });

    const { POST } = await import('./route');

    const request = new NextRequest('http://localhost/api/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'newuser@example.com', role: 'member' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.invitation.email).toBe('newuser@example.com');
    expect(data.invitation.inviteUrl).toBeTruthy();
    expect(mockSupabaseRpc).toHaveBeenCalledWith('invite_user_to_workspace', {
      p_tenant_id: 'tenant-456',
      p_email: 'newuser@example.com',
      p_role: 'member',
      p_invited_by: 'user-123',
    });
  });

  it('rejects invitation with invalid role', async () => {
    const { POST } = await import('./route');

    const request = new NextRequest('http://localhost/api/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', role: 'superadmin' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Valid role required');
  });

  it('rejects invitation without email', async () => {
    const { POST } = await import('./route');

    const request = new NextRequest('http://localhost/api/invitations', {
      method: 'POST',
      body: JSON.stringify({ role: 'member' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email is required');
  });

  it('handles user already member error', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'User is already a member of this workspace',
      },
      error: null,
    });

    const { POST } = await import('./route');

    const request = new NextRequest('http://localhost/api/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@example.com', role: 'member' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('User is already a member of this workspace');
  });

  it('handles duplicate pending invitation', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'User already has a pending invitation to this workspace',
      },
      error: null,
    });

    const { POST } = await import('./route');

    const request = new NextRequest('http://localhost/api/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'pending@example.com', role: 'member' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('pending invitation');
  });
});

describe('GET /api/invitations', () => {
  beforeEach(() => {
    mockCreateUnrestrictedServiceClient.mockReturnValue({
      rpc: mockSupabaseRpc,
    });
  });

  it('returns pending invitations for user', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: [
        {
          invitation_id: 'inv-1',
          workspace_id: 'ws-1',
          workspace_name: 'Workspace 1',
          workspace_slug: 'workspace-1',
          role: 'member',
          invited_by_email: 'admin@example.com',
          expires_at: '2026-01-14T00:00:00Z',
          created_at: '2026-01-07T00:00:00Z',
        },
      ],
      error: null,
    });

    const { GET } = await import('./route');

    const request = new NextRequest('http://localhost/api/invitations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invitations).toHaveLength(1);
    expect(data.invitations[0].workspace_name).toBe('Workspace 1');
  });

  it('returns empty array when no invitations', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: [],
      error: null,
    });

    const { GET } = await import('./route');

    const request = new NextRequest('http://localhost/api/invitations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invitations).toEqual([]);
  });
});
