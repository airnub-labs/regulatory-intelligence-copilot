import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockBranchFromMessage = vi.fn();
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
    branchFromMessage: mockBranchFromMessage,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
}));

describe('branch route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockBranchFromMessage.mockReset();
    mockGetConversation.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/conversations/[id]/branch', () => {
    it('creates a branch successfully', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
      });

      mockBranchFromMessage.mockResolvedValue({
        path: {
          id: 'path-2',
          conversationId: 'conv-1',
          parentPathId: 'path-1',
          branchPointMessageId: 'msg-5',
          name: 'Alternative scenario',
          isPrimary: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        conversationId: 'conv-1',
        branchPointMessage: {
          id: 'msg-5',
          role: 'user',
          content: 'What about the German tax implications?',
          isBranchPoint: true,
          branchedToPaths: ['path-2'],
        },
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/branch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceMessageId: 'msg-5',
            name: 'Alternative scenario',
            description: 'Exploring German tax rules',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        path: {
          id: 'path-2',
          conversationId: 'conv-1',
          name: 'Alternative scenario',
        },
        conversationId: 'conv-1',
        branchPointMessage: {
          id: 'msg-5',
          role: 'user',
          content: 'What about the German tax implications?',
          isBranchPoint: true,
          branchedToPaths: ['path-2'],
        },
      });

      expect(mockBranchFromMessage).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        sourceMessageId: 'msg-5',
        userId: 'user-123',
        name: 'Alternative scenario',
        description: 'Exploring German tax rules',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          sourceMessageId: 'msg-5',
          pathId: 'path-2',
          name: 'Alternative scenario',
        }),
        'Branch created successfully'
      );
    });

    it('truncates long branch point message content', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      const longContent = 'A'.repeat(300);

      mockBranchFromMessage.mockResolvedValue({
        path: {
          id: 'path-2',
          conversationId: 'conv-1',
        },
        conversationId: 'conv-1',
        branchPointMessage: {
          id: 'msg-5',
          role: 'user',
          content: longContent,
          isBranchPoint: true,
          branchedToPaths: ['path-2'],
        },
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/branch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceMessageId: 'msg-5',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      const data = await response.json();
      expect(data.branchPointMessage.content).toBe('A'.repeat(200) + '...');
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/branch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceMessageId: 'msg-5',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });

      expect(mockBranchFromMessage).not.toHaveBeenCalled();
    });

    it('returns 400 if request body is invalid JSON', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/branch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{bad json',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid request body' });

      expect(mockBranchFromMessage).not.toHaveBeenCalled();
    });

    it('returns 400 if sourceMessageId is missing', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/branch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Branch name',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'sourceMessageId is required' });

      expect(mockBranchFromMessage).not.toHaveBeenCalled();
    });

    it('returns 400 if branchFromMessage fails', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockBranchFromMessage.mockRejectedValue(new Error('Message not found'));

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/branch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceMessageId: 'msg-5',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Message not found' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          sourceMessageId: 'msg-5',
        }),
        'Failed to create branch'
      );
    });
  });
});
