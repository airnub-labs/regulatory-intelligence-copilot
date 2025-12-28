import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockListConversations = vi.fn();
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
    listConversations: mockListConversations,
  },
}));

vi.mock('@/lib/server/conversationPresenter', () => ({
  toClientConversation: mockToClientConversation,
}));

describe('conversations route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockListConversations.mockReset();
    mockToClientConversation.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations', () => {
    it('lists active conversations by default', async () => {
      mockListConversations.mockResolvedValue({
        conversations: [
          {
            id: 'conv-1',
            tenantId: 'tenant-1',
            userId: 'user-123',
            status: 'active',
            title: 'Tax Compliance Discussion',
            createdAt: new Date('2024-01-01'),
          },
          {
            id: 'conv-2',
            tenantId: 'tenant-1',
            userId: 'user-123',
            status: 'active',
            title: 'Regulatory Review',
            createdAt: new Date('2024-01-02'),
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations', {
          method: 'GET',
        }) as NextRequest
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        conversations: [
          { id: 'conv-1', status: 'active', title: 'Tax Compliance Discussion' },
          { id: 'conv-2', status: 'active', title: 'Regulatory Review' },
        ],
        nextCursor: null,
        hasMore: false,
      });

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        limit: 50,
        userId: 'user-123',
        status: 'active',
        cursor: null,
      });
    });

    it('supports pagination with limit and cursor', async () => {
      mockListConversations.mockResolvedValue({
        conversations: [
          { id: 'conv-3', status: 'active' },
          { id: 'conv-4', status: 'active' },
        ],
        nextCursor: 'cursor-abc123',
        hasMore: true,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations?limit=2&cursor=cursor-prev', {
          method: 'GET',
        }) as NextRequest
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        conversations: [{ id: 'conv-3' }, { id: 'conv-4' }],
        nextCursor: 'cursor-abc123',
        hasMore: true,
      });

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        limit: 2,
        userId: 'user-123',
        status: 'active',
        cursor: 'cursor-prev',
      });
    });

    it('filters by archived status when specified', async () => {
      mockListConversations.mockResolvedValue({
        conversations: [{ id: 'conv-archived', status: 'archived' }],
        nextCursor: null,
        hasMore: false,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations?status=archived', {
          method: 'GET',
        }) as NextRequest
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0].id).toBe('conv-archived');

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        limit: 50,
        userId: 'user-123',
        status: 'archived',
        cursor: null,
      });
    });

    it('filters by all status when specified', async () => {
      mockListConversations.mockResolvedValue({
        conversations: [
          { id: 'conv-active', status: 'active' },
          { id: 'conv-archived', status: 'archived' },
        ],
        nextCursor: null,
        hasMore: false,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations?status=all', {
          method: 'GET',
        }) as NextRequest
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(2);

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        limit: 50,
        userId: 'user-123',
        status: 'all',
        cursor: null,
      });
    });

    it('returns empty array if no conversations exist', async () => {
      mockListConversations.mockResolvedValue({
        conversations: [],
        nextCursor: null,
        hasMore: false,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations', {
          method: 'GET',
        }) as NextRequest
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        conversations: [],
        nextCursor: null,
        hasMore: false,
      });
    });
  });
});
