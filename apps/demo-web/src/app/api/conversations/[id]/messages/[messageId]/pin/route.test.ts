import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPinMessage = vi.fn();
const mockUnpinMessage = vi.fn();
const mockGetConversation = vi.fn();
const mockBroadcast = vi.fn();

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
    pinMessage: mockPinMessage,
    unpinMessage: mockUnpinMessage,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
  conversationEventHub: {
    broadcast: mockBroadcast,
  },
}));

describe('message pin route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPinMessage.mockReset();
    mockUnpinMessage.mockReset();
    mockGetConversation.mockReset();
    mockBroadcast.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/conversations/[id]/messages/[messageId]/pin', () => {
    it('pins a message successfully', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
      });

      mockPinMessage.mockResolvedValue(undefined);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/messages/msg-1/pin', {
          method: 'POST',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        success: true,
        messageId: 'msg-1',
        isPinned: true,
        pinnedBy: 'user-123',
      });
      expect(data.pinnedAt).toBeDefined();

      expect(mockPinMessage).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        userId: 'user-123',
      });

      expect(mockBroadcast).toHaveBeenCalledWith(
        'tenant-1',
        'conv-1',
        'message:pinned',
        expect.objectContaining({
          messageId: 'msg-1',
          pinnedBy: 'user-123',
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          messageId: 'msg-1',
          userId: 'user-123',
        }),
        'Message pinned successfully'
      );
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/messages/msg-1/pin', {
          method: 'POST',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });

      expect(mockPinMessage).not.toHaveBeenCalled();
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('returns 400 if pinMessage fails', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockPinMessage.mockRejectedValue(new Error('Message not found'));

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/messages/msg-1/pin', {
          method: 'POST',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Message not found' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          messageId: 'msg-1',
        }),
        'Failed to pin message'
      );
    });
  });

  describe('DELETE /api/conversations/[id]/messages/[messageId]/pin', () => {
    it('unpins a message successfully', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
      });

      mockUnpinMessage.mockResolvedValue(undefined);

      const { DELETE } = await import('./route');

      const response = await DELETE(
        new Request('http://localhost/api/conversations/conv-1/messages/msg-1/pin', {
          method: 'DELETE',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        messageId: 'msg-1',
        isPinned: false,
      });

      expect(mockUnpinMessage).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
      });

      expect(mockBroadcast).toHaveBeenCalledWith('tenant-1', 'conv-1', 'message:unpinned', {
        messageId: 'msg-1',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          messageId: 'msg-1',
        }),
        'Message unpinned successfully'
      );
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { DELETE } = await import('./route');

      const response = await DELETE(
        new Request('http://localhost/api/conversations/conv-1/messages/msg-1/pin', {
          method: 'DELETE',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });

      expect(mockUnpinMessage).not.toHaveBeenCalled();
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('returns 400 if unpinMessage fails', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockUnpinMessage.mockRejectedValue(new Error('Message not found'));

      const { DELETE } = await import('./route');

      const response = await DELETE(
        new Request('http://localhost/api/conversations/conv-1/messages/msg-1/pin', {
          method: 'DELETE',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Message not found' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          messageId: 'msg-1',
        }),
        'Failed to unpin message'
      );
    });
  });
});
