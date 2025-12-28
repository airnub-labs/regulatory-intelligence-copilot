import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolvePathMessages = vi.fn();
const mockGetPath = vi.fn();
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

vi.mock('@/lib/server/conversations', () => ({
  conversationPathStore: {
    resolvePathMessages: mockResolvePathMessages,
    getPath: mockGetPath,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
}));

describe('path messages route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockResolvePathMessages.mockReset();
    mockGetPath.mockReset();
    mockGetConversation.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/[id]/paths/[pathId]/messages', () => {
    it('retrieves path messages successfully', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
        name: 'Alternative Scenario',
        isPrimary: false,
      });

      mockResolvePathMessages.mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          pathId: 'path-1',
          role: 'user',
          content: 'What are the tax implications?',
          metadata: {},
          sequenceInPath: 1,
          effectiveSequence: 1,
          isBranchPoint: false,
          branchedToPaths: [],
          messageType: 'text',
          createdAt: new Date('2024-01-01'),
          isPinned: false,
          pinnedAt: null,
          pinnedBy: null,
        },
        {
          id: 'msg-2',
          conversationId: 'conv-1',
          pathId: 'path-2',
          role: 'assistant',
          content: 'In this scenario...',
          metadata: {},
          sequenceInPath: 2,
          effectiveSequence: 2,
          isBranchPoint: false,
          branchedToPaths: [],
          messageType: 'text',
          createdAt: new Date('2024-01-01'),
          isPinned: true,
          pinnedAt: new Date('2024-01-02'),
          pinnedBy: 'user-123',
        },
      ]);

      const { GET } = await import('./route');

      const url = 'http://localhost/api/conversations/conv-1/paths/path-2/messages';
      const request = new Request(url, { method: 'GET' }) as NextRequest;
      request.nextUrl = new URL(url);

      const response = await GET(
        request,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.messages).toHaveLength(2);
      expect(data.messages[0]).toMatchObject({
        id: 'msg-1',
        role: 'user',
        content: 'What are the tax implications?',
        isPinned: false,
      });
      expect(data.messages[1]).toMatchObject({
        id: 'msg-2',
        role: 'assistant',
        content: 'In this scenario...',
        isPinned: true,
        pinnedBy: 'user-123',
      });
      expect(data.path).toEqual({
        id: 'path-2',
        name: 'Alternative Scenario',
        isPrimary: false,
      });

      expect(mockResolvePathMessages).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-2',
        options: {
          includeDeleted: false,
          limit: undefined,
          offset: undefined,
        },
      });
    });

    it('supports pagination with limit and offset', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
        name: 'Alternative',
        isPrimary: false,
      });

      mockResolvePathMessages.mockResolvedValue([
        {
          id: 'msg-3',
          conversationId: 'conv-1',
          pathId: 'path-2',
          role: 'user',
          content: 'Third message',
          sequenceInPath: 3,
          effectiveSequence: 3,
          createdAt: new Date('2024-01-01'),
          isBranchPoint: false,
          branchedToPaths: [],
          messageType: 'text',
          metadata: {},
        },
      ]);

      const { GET } = await import('./route');

      const url = 'http://localhost/api/conversations/conv-1/paths/path-2/messages?limit=1&offset=2';
      const request = new Request(url, { method: 'GET' }) as NextRequest;
      request.nextUrl = new URL(url);

      const response = await GET(
        request,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);

      expect(mockResolvePathMessages).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-2',
        options: {
          includeDeleted: false,
          limit: 1,
          offset: 2,
        },
      });
    });

    it('includes deleted messages when includeDeleted=true', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
        name: 'Alternative',
        isPrimary: false,
      });

      mockResolvePathMessages.mockResolvedValue([]);

      const { GET } = await import('./route');

      const url = 'http://localhost/api/conversations/conv-1/paths/path-2/messages?includeDeleted=true';
      const request = new Request(url, { method: 'GET' }) as NextRequest;
      request.nextUrl = new URL(url);

      const response = await GET(
        request,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);

      expect(mockResolvePathMessages).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-2',
        options: {
          includeDeleted: true,
          limit: undefined,
          offset: undefined,
        },
      });
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/messages', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });
    });

    it('returns 404 if path not found', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue(null);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/messages', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Path not found' });
    });

    it('returns 404 if path belongs to different conversation', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-2', // Different conversation
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/messages', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Path not found' });
    });

    it('returns 500 if resolvePathMessages fails', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
      });

      mockResolvePathMessages.mockRejectedValue(new Error('Database error'));

      const { GET } = await import('./route');

      const url = 'http://localhost/api/conversations/conv-1/paths/path-2/messages';
      const request = new Request(url, { method: 'GET' }) as NextRequest;
      request.nextUrl = new URL(url);

      const response = await GET(
        request,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Database error' });
    });
  });
});
