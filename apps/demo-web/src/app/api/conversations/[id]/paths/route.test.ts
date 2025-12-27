import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockListPaths = vi.fn();
const mockGetConversation = vi.fn();

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

vi.mock('@reg-copilot/reg-intel-conversations', () => ({
  toClientPath: (path: unknown) => path,
}));

vi.mock('@/lib/server/conversations', () => ({
  conversationPathStore: {
    listPaths: mockListPaths,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
}));

describe('paths route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockListPaths.mockReset();
    mockGetConversation.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/[id]/paths', () => {
    it('lists all paths for a conversation', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockListPaths.mockResolvedValue([
        {
          id: 'path-1',
          conversationId: 'conv-1',
          isPrimary: true,
          isActive: true,
        },
        {
          id: 'path-2',
          conversationId: 'conv-1',
          isPrimary: false,
          isActive: false,
        },
      ]);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        paths: [
          {
            id: 'path-1',
            conversationId: 'conv-1',
            isPrimary: true,
            isActive: true,
          },
          {
            id: 'path-2',
            conversationId: 'conv-1',
            isPrimary: false,
            isActive: false,
          },
        ],
      });

      expect(mockListPaths).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        includeInactive: false,
      });
    });

    it('includes inactive paths when includeInactive is true', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockListPaths.mockResolvedValue([
        { id: 'path-1', isActive: true },
        { id: 'path-2', isActive: false },
        { id: 'path-3', isActive: false },
      ]);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths?includeInactive=true', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.paths).toHaveLength(3);

      expect(mockListPaths).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        includeInactive: true,
      });
    });

    it('returns empty array if no paths exist', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockListPaths.mockResolvedValue([]);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ paths: [] });
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });
    });
  });
});
