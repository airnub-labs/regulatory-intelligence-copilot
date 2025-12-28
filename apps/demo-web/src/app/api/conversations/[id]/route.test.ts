import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetConversation = vi.fn();
const mockEnsurePrimaryPath = vi.fn();
const mockResolvePathMessages = vi.fn();
const mockLoadContext = vi.fn();
const mockSetArchivedState = vi.fn();
const mockUpdateSharing = vi.fn();
const mockBroadcast = vi.fn();
const mockToClientConversation = vi.fn((conv) => conv);

const mockLogger = {
  child: vi.fn(() => mockLogger),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

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
  getServerSession: vi.fn(async () => ({ user: { id: 'user-123', tenantId: 'tenant-1' } })),
}));

vi.mock('@/lib/server/conversations', () => ({
  conversationStore: {
    getConversation: mockGetConversation,
    setArchivedState: mockSetArchivedState,
    updateSharing: mockUpdateSharing,
  },
  conversationPathStore: {
    ensurePrimaryPath: mockEnsurePrimaryPath,
    resolvePathMessages: mockResolvePathMessages,
  },
  conversationContextStore: {
    load: mockLoadContext,
  },
  conversationListEventHub: {
    broadcast: mockBroadcast,
  },
}));

vi.mock('@/lib/server/conversationPresenter', () => ({
  toClientConversation: mockToClientConversation,
}));

describe('conversation detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetConversation.mockReset();
    mockEnsurePrimaryPath.mockReset();
    mockResolvePathMessages.mockReset();
    mockLoadContext.mockReset();
    mockSetArchivedState.mockReset();
    mockUpdateSharing.mockReset();
    mockBroadcast.mockReset();
    mockToClientConversation.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/[id]', () => {
    it('retrieves conversation with messages and context', async () => {
      const conversation = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        activePathId: 'path-1',
        title: 'Tax Discussion',
      };

      mockGetConversation.mockResolvedValue(conversation);
      mockResolvePathMessages.mockResolvedValue([
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: new Date('2024-01-01'),
        },
      ]);
      mockLoadContext.mockResolvedValue({
        concepts: ['tax', 'compliance'],
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversation).toEqual(conversation);
      expect(data.messages).toHaveLength(1);
      expect(data.context).toEqual({ concepts: ['tax', 'compliance'] });

      expect(mockResolvePathMessages).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-1',
      });
    });

    it('ensures primary path if activePathId is missing', async () => {
      mockGetConversation
        .mockResolvedValueOnce({
          id: 'conv-1',
          tenantId: 'tenant-1',
          activePathId: null, // No active path
        })
        .mockResolvedValueOnce({
          id: 'conv-1',
          tenantId: 'tenant-1',
          activePathId: 'path-primary',
        });

      mockEnsurePrimaryPath.mockResolvedValue({
        id: 'path-primary',
        conversationId: 'conv-1',
      });

      mockResolvePathMessages.mockResolvedValue([]);
      mockLoadContext.mockResolvedValue({});

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);

      expect(mockEnsurePrimaryPath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
      });
    });

    it('returns 500 if path initialization fails', async () => {
      mockGetConversation
        .mockResolvedValueOnce({
          id: 'conv-1',
          activePathId: null,
        })
        .mockResolvedValueOnce({
          id: 'conv-1',
          activePathId: null, // Still null after refresh
        });

      mockEnsurePrimaryPath.mockResolvedValue({});

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Failed to initialize conversation path' });
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Not found' });
    });
  });

  describe('PATCH /api/conversations/[id]', () => {
    it('updates conversation sharing settings', async () => {
      const updatedConversation = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        shareAudience: 'tenant',
        tenantAccess: 'view',
      };

      mockUpdateSharing.mockResolvedValue(undefined);
      mockGetConversation.mockResolvedValue(updatedConversation);

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            shareAudience: 'tenant',
            tenantAccess: 'view',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ status: 'ok' });

      expect(mockUpdateSharing).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        userId: 'user-123',
        shareAudience: 'tenant',
        tenantAccess: 'view',
        authorizationModel: undefined,
        title: undefined,
      });

      expect(mockBroadcast).toHaveBeenCalledWith('tenant-1', 'upsert', {
        conversation: updatedConversation,
      });
    });

    it('updates conversation archived state', async () => {
      const updatedConversation = {
        id: 'conv-1',
        archived: true,
      };

      mockSetArchivedState.mockResolvedValue(undefined);
      mockGetConversation.mockResolvedValue(updatedConversation);

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ archived: true }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);

      expect(mockSetArchivedState).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        userId: 'user-123',
        archived: true,
      });
    });

    it('updates conversation title', async () => {
      const updatedConversation = {
        id: 'conv-1',
        title: 'New Title',
      };

      mockUpdateSharing.mockResolvedValue(undefined);
      mockGetConversation.mockResolvedValue(updatedConversation);

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'New Title' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);

      expect(mockUpdateSharing).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        userId: 'user-123',
        shareAudience: undefined,
        tenantAccess: undefined,
        authorizationModel: undefined,
        title: 'New Title',
      });
    });

    it('returns 400 for invalid shareAudience', async () => {
      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ shareAudience: 'invalid' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid shareAudience' });
    });

    it('returns 400 for invalid tenantAccess', async () => {
      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantAccess: 'invalid' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid tenantAccess' });
    });

    it('returns 400 for invalid authorizationModel', async () => {
      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ authorizationModel: 'invalid' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid authorizationModel' });
    });

    it('returns 403 if update fails', async () => {
      mockUpdateSharing.mockRejectedValue(new Error('Unauthorized'));

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'New Title' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });
  });
});
