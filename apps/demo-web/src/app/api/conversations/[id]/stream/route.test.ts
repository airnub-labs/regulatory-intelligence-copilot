import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { ConversationEventType, SseSubscriber } from '@reg-copilot/reg-intel-conversations';

const mockGetConversation = vi.fn();
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
    getConversation: mockGetConversation,
  },
  conversationEventHub: {
    subscribe: mockSubscribe,
  },
}));

vi.mock('@/lib/server/conversationPresenter', () => ({
  toClientConversation: mockToClientConversation,
}));

describe('conversation stream route', () => {
  let capturedSubscriber: SseSubscriber<ConversationEventType> | null = null;
  let mockUnsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockGetConversation.mockReset();
    mockSubscribe.mockReset();
    mockToClientConversation.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    capturedSubscriber = null;
    mockUnsubscribe = vi.fn();

    // Default subscribe behavior: capture subscriber and return unsubscribe function
    mockSubscribe.mockImplementation(
      (_tenantId: string, _convId: string, subscriber: SseSubscriber<ConversationEventType>) => {
        capturedSubscriber = subscriber;
        return mockUnsubscribe;
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/[id]/stream', () => {
    it('returns 401 when user is not authenticated', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toBe('Unauthorized');
    });

    it('returns 404 when conversation is not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe('Conversation not found or access denied');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns SSE response with correct headers', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Test Conversation',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test Conversation',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
      expect(response.headers.get('Connection')).toBe('keep-alive');

      expect(mockGetConversation).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        userId: 'user-123',
      });
    });

    it('subscribes to conversation event hub', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Test Conversation',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test Conversation',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      expect(response.status).toBe(200);

      // Start reading to trigger stream initialization
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read the first chunk (initial metadata)
      const { value } = await reader!.read();
      expect(value).toBeDefined();

      // Verify subscribe was called with correct params
      expect(mockSubscribe).toHaveBeenCalledWith(
        'tenant-1',
        'conv-1',
        expect.objectContaining({
          send: expect.any(Function),
          onClose: expect.any(Function),
        })
      );

      // Clean up reader
      await reader!.cancel();
    });

    it('sends initial metadata event on connection', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Tax Planning Discussion',
        shareAudience: 'team',
        tenantAccess: true,
        jurisdictions: ['IE', 'UK'],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Tax Planning Discussion',
        shareAudience: 'team',
        tenantAccess: true,
        jurisdictions: ['IE', 'UK'],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: metadata');
      expect(text).toContain('conversationId');
      expect(text).toContain('conv-1');
      expect(text).toContain('Tax Planning Discussion');
      expect(text).toContain('team');

      await reader!.cancel();
    });

    it('uses default tenant ID when user has no tenant', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-123' },
      });

      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'default',
        userId: 'user-123',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      expect(response.status).toBe(200);
    });

    it('logs when SSE stream starts', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      // Trigger stream start by reading
      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-123',
          conversationId: 'conv-1',
        }),
        'Starting conversation SSE stream'
      );
    });

    it('handles archived conversations', async () => {
      const archivedAt = new Date('2024-01-15');
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Archived Conversation',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Archived Conversation',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt: archivedAt.toISOString(),
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('archivedAt');

      await reader!.cancel();
    });
  });

  describe('subscriber behavior', () => {
    it('subscriber send method enqueues SSE-formatted data', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      const reader = response.body?.getReader();
      // Read initial metadata
      await reader!.read();

      // Verify subscriber was captured
      expect(capturedSubscriber).not.toBeNull();

      // Simulate sending an event through the subscriber
      capturedSubscriber!.send('message' as ConversationEventType, {
        id: 'msg-1',
        content: 'Hello',
      });

      // Read the next chunk
      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event: message');
      expect(text).toContain('msg-1');
      expect(text).toContain('Hello');

      await reader!.cancel();
    });

    it('subscriber onClose triggers cleanup', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      const reader = response.body?.getReader();
      await reader!.read();

      expect(capturedSubscriber).not.toBeNull();

      // Trigger onClose
      capturedSubscriber!.onClose();

      // Verify unsubscribe was called
      expect(mockUnsubscribe).toHaveBeenCalled();

      await reader!.cancel();
    });
  });

  describe('SSE format', () => {
    it('formats events with correct SSE structure', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: ['IE'],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);

      // SSE format: event: <type>\ndata: <json>\n\n
      expect(text).toMatch(/^event: metadata\n/);
      expect(text).toMatch(/data: \{.*\}\n\n$/);

      await reader!.cancel();
    });

    it('handles string data in events', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-123',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      mockToClientConversation.mockReturnValue({
        id: 'conv-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: false,
        jurisdictions: [],
        archivedAt: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/stream');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1' }),
      });

      const reader = response.body?.getReader();
      await reader!.read();

      expect(capturedSubscriber).not.toBeNull();

      // Send string data instead of object
      capturedSubscriber!.send('ping' as ConversationEventType, 'pong');

      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event: ping');
      expect(text).toContain('data: pong');

      await reader!.cancel();
    });
  });
});
