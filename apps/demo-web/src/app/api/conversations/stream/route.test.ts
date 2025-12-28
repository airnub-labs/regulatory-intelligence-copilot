import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { ConversationListEventType, SseSubscriber } from '@reg-copilot/reg-intel-conversations';

const mockListConversations = vi.fn();
const mockSubscribe = vi.fn();
const mockToClientConversation = vi.fn();

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
  conversationListEventHub: {
    subscribe: mockSubscribe,
  },
}));

vi.mock('@/lib/server/conversationPresenter', () => ({
  toClientConversation: mockToClientConversation,
}));

describe('conversations stream route', () => {
  let capturedSubscriber: SseSubscriber<ConversationListEventType> | null = null;
  let mockUnsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockListConversations.mockReset();
    mockSubscribe.mockReset();
    mockToClientConversation.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    capturedSubscriber = null;
    mockUnsubscribe = vi.fn();

    // Default subscribe behavior
    mockSubscribe.mockImplementation(
      (_tenantId: string, subscriber: SseSubscriber<ConversationListEventType>) => {
        capturedSubscriber = subscriber;
        return mockUnsubscribe;
      }
    );

    // Default toClientConversation
    mockToClientConversation.mockImplementation((conv) => ({
      id: conv.id,
      title: conv.title,
      shareAudience: conv.shareAudience ?? 'private',
      tenantAccess: conv.tenantAccess ?? false,
      jurisdictions: conv.jurisdictions ?? [],
      archivedAt: conv.archivedAt ?? null,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/stream', () => {
    it('returns 401 when user is not authenticated', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toBe('Unauthorized');
    });

    it('returns 401 when user has no ID', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce({ user: {} });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('returns SSE response with correct headers', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    it('fetches active conversations by default', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      // Trigger stream start
      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-123',
        status: 'active',
      });
    });

    it('fetches archived conversations when status=archived', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream?status=archived');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-123',
        status: 'archived',
      });
    });

    it('fetches all conversations when status=all', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream?status=all');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-123',
        status: 'all',
      });
    });

    it('ignores invalid status values and defaults to active', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream?status=invalid');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockListConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-123',
        status: 'active',
      });
    });

    it('sends snapshot event with initial conversations', async () => {
      mockListConversations.mockResolvedValue([
        {
          id: 'conv-1',
          title: 'First Conversation',
          shareAudience: 'private',
          tenantAccess: false,
          jurisdictions: ['IE'],
          archivedAt: null,
        },
        {
          id: 'conv-2',
          title: 'Second Conversation',
          shareAudience: 'team',
          tenantAccess: true,
          jurisdictions: ['UK'],
          archivedAt: null,
        },
      ]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: snapshot');
      expect(text).toContain('conv-1');
      expect(text).toContain('conv-2');
      expect(text).toContain('First Conversation');
      expect(text).toContain('Second Conversation');

      await reader!.cancel();
    });

    it('subscribes to conversation list event hub', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      expect(mockSubscribe).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          send: expect.any(Function),
          onClose: expect.any(Function),
        })
      );

      await reader!.cancel();
    });

    it('logs stream start with conversation count', async () => {
      mockListConversations.mockResolvedValue([
        { id: 'conv-1', title: 'Test' },
        { id: 'conv-2', title: 'Test 2' },
      ]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-123',
          status: 'active',
          count: 2,
        }),
        'Starting conversation stream'
      );
    });

    it('uses default tenant ID when user has no tenant', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-123' },
      });

      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('subscriber behavior', () => {
    it('subscriber send method enqueues SSE-formatted events', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      // Read initial snapshot
      await reader!.read();

      expect(capturedSubscriber).not.toBeNull();

      // Simulate sending an update event
      capturedSubscriber!.send('updated' as ConversationListEventType, {
        id: 'conv-1',
        title: 'Updated Title',
      });

      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event: updated');
      expect(text).toContain('Updated Title');

      await reader!.cancel();
    });

    it('subscriber onClose triggers cleanup and unsubscribe', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      expect(capturedSubscriber).not.toBeNull();

      // Trigger onClose
      capturedSubscriber!.onClose();

      expect(mockUnsubscribe).toHaveBeenCalled();

      await reader!.cancel();
    });

    it('handles created event for new conversations', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      capturedSubscriber!.send('created' as ConversationListEventType, {
        id: 'new-conv',
        title: 'New Conversation',
      });

      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event: created');
      expect(text).toContain('new-conv');

      await reader!.cancel();
    });

    it('handles deleted event for removed conversations', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      capturedSubscriber!.send('deleted' as ConversationListEventType, {
        id: 'deleted-conv',
      });

      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event: deleted');
      expect(text).toContain('deleted-conv');

      await reader!.cancel();
    });
  });

  describe('snapshot payload', () => {
    it('includes status in snapshot payload', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream?status=archived');
      const response = await GET(request);

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: snapshot');
      expect(text).toContain('"status":"archived"');

      await reader!.cancel();
    });

    it('transforms conversations through toClientConversation', async () => {
      const rawConversation = {
        id: 'conv-1',
        title: 'Raw Title',
        internalField: 'should-be-removed',
      };

      mockListConversations.mockResolvedValue([rawConversation]);
      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Transformed Title',
        shareAudience: 'private',
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('Transformed Title');
      expect(text).not.toContain('should-be-removed');
      // toClientConversation is called via .map() which passes index and array as extra args
      expect(mockToClientConversation).toHaveBeenCalledWith(
        rawConversation,
        expect.any(Number),
        expect.any(Array)
      );

      await reader!.cancel();
    });

    it('handles empty conversation list', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: snapshot');
      expect(text).toContain('"conversations":[]');

      await reader!.cancel();
    });
  });

  describe('SSE format', () => {
    it('formats events with correct SSE structure', async () => {
      mockListConversations.mockResolvedValue([]);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);

      // SSE format: event: <type>\ndata: <json>\n\n
      expect(text).toMatch(/^event: snapshot\n/);
      expect(text).toMatch(/data: \{.*\}\n\n$/);

      await reader!.cancel();
    });
  });
});
