import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Stub environment variables BEFORE any imports
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');

const mockGetConversation = vi.fn();
const mockSoftDeleteMessage = vi.fn();
const mockBroadcast = vi.fn();
const mockSupabaseSingle = vi.fn();

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
    softDeleteMessage: mockSoftDeleteMessage,
  },
  conversationEventHub: {
    broadcast: mockBroadcast,
  },
}));

// Create chainable mock for Supabase
const createChainableMock = () => {
  const mockEq = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  const mockFrom = vi.fn();

  // Setup the chain
  mockEq.mockImplementation(() => ({
    eq: mockEq,
    single: mockSupabaseSingle,
  }));

  mockSelect.mockImplementation(() => ({
    eq: mockEq,
  }));

  mockUpdate.mockImplementation(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));

  mockFrom.mockImplementation(() => ({
    select: mockSelect,
    update: mockUpdate,
  }));

  return { from: mockFrom, mockEq, mockSelect, mockUpdate };
};

const supabaseMocks = createChainableMock();

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseMocks),
}));

describe('message route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetConversation.mockReset();
    mockSoftDeleteMessage.mockReset();
    mockBroadcast.mockReset();
    mockSupabaseSingle.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/[id]/messages/[messageId]', () => {
    it('returns 401 when user is not authenticated', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });
    });

    it('returns 404 when message not found', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSupabaseSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Message not found' });
    });

    it('returns message successfully', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSupabaseSingle.mockResolvedValue({
        data: {
          id: 'msg-1',
          conversation_id: 'conv-1',
          path_id: 'path-1',
          role: 'user',
          content: 'Hello, world!',
          metadata: { key: 'value' },
          sequence_in_path: 1,
          is_branch_point: false,
          branched_to_paths: [],
          message_type: 'standard',
          is_pinned: false,
          pinned_at: null,
          pinned_by: null,
          created_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        id: 'msg-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        role: 'user',
        content: 'Hello, world!',
        metadata: { key: 'value' },
        sequenceInPath: 1,
        isBranchPoint: false,
        messageType: 'standard',
        isPinned: false,
      });
    });

    it('returns pinned message with pin info', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSupabaseSingle.mockResolvedValue({
        data: {
          id: 'msg-1',
          conversation_id: 'conv-1',
          path_id: 'path-1',
          role: 'assistant',
          content: 'Important response',
          metadata: {},
          sequence_in_path: 2,
          is_branch_point: true,
          branched_to_paths: ['path-2'],
          message_type: 'standard',
          is_pinned: true,
          pinned_at: '2024-01-02T00:00:00Z',
          pinned_by: 'user-456',
          created_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.isPinned).toBe(true);
      expect(data.pinnedAt).toBe('2024-01-02T00:00:00Z');
      expect(data.pinnedBy).toBe('user-456');
      expect(data.isBranchPoint).toBe(true);
      expect(data.branchedToPaths).toEqual(['path-2']);
    });
  });

  describe('PATCH /api/conversations/[id]/messages/[messageId]', () => {
    it('returns 401 when user is not authenticated', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const { PATCH } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'PATCH',
        body: JSON.stringify({ metadata: { key: 'value' } }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(401);
    });

    it('returns 404 when conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { PATCH } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'PATCH',
        body: JSON.stringify({ metadata: { key: 'value' } }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(404);
    });

    it('returns 400 when body is invalid JSON', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });

      const { PATCH } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'PATCH',
        body: 'invalid json',
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid JSON body' });
    });

    it('returns 400 when no metadata provided', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });

      const { PATCH } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'New content' }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Only metadata updates are allowed');
    });

    it('returns 404 when message not found', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSupabaseSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const { PATCH } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'PATCH',
        body: JSON.stringify({ metadata: { key: 'value' } }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(404);
    });

    it('updates metadata successfully', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });

      // First call: fetch existing message - returns data
      mockSupabaseSingle.mockResolvedValue({
        data: { id: 'msg-1', metadata: { existingKey: 'existingValue' } },
        error: null,
      });

      const { PATCH } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'PATCH',
        body: JSON.stringify({ metadata: { newKey: 'newValue' } }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.messageId).toBe('msg-1');
      expect(data.metadata).toMatchObject({
        existingKey: 'existingValue',
        newKey: 'newValue',
      });
      expect(data.metadata.updatedBy).toBe('user-123');
      expect(data.metadata.updatedAt).toBeDefined();
    });

    it('broadcasts SSE event on metadata update', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSupabaseSingle.mockResolvedValue({
        data: { id: 'msg-1', metadata: {} },
        error: null,
      });

      const { PATCH } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'PATCH',
        body: JSON.stringify({ metadata: { annotated: true } }),
      });
      await PATCH(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(mockBroadcast).toHaveBeenCalledWith(
        'tenant-1',
        'conv-1',
        'message:updated',
        expect.objectContaining({
          messageId: 'msg-1',
          updatedBy: 'user-123',
        })
      );
    });
  });

  describe('DELETE /api/conversations/[id]/messages/[messageId]', () => {
    it('returns 401 when user is not authenticated', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const { DELETE } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(401);
    });

    it('returns 404 when conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { DELETE } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(404);
    });

    it('soft-deletes message successfully', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSoftDeleteMessage.mockResolvedValue(undefined);

      const { DELETE } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        success: true,
        messageId: 'msg-1',
        deleted: true,
      });

      expect(mockSoftDeleteMessage).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        userId: 'user-123',
      });
    });

    it('broadcasts SSE event on delete', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSoftDeleteMessage.mockResolvedValue(undefined);

      const { DELETE } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'DELETE',
      });
      await DELETE(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(mockBroadcast).toHaveBeenCalledWith(
        'tenant-1',
        'conv-1',
        'message:deleted',
        expect.objectContaining({
          messageId: 'msg-1',
          deletedBy: 'user-123',
        })
      );
    });

    it('returns 400 when delete fails', async () => {
      mockGetConversation.mockResolvedValue({ id: 'conv-1', tenantId: 'tenant-1' });
      mockSoftDeleteMessage.mockRejectedValue(new Error('Message not found'));

      const { DELETE } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Message not found' });
    });
  });

  describe('authorization', () => {
    it('verifies conversation access before message operations', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1');
      await GET(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(mockGetConversation).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        userId: 'user-123',
      });
    });
  });

  describe('tenant handling', () => {
    it('uses default tenant when user has no tenant', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-123' },
      });

      mockGetConversation.mockResolvedValue({ id: 'conv-1' });
      mockSupabaseSingle.mockResolvedValue({
        data: {
          id: 'msg-1',
          conversation_id: 'conv-1',
          path_id: 'path-1',
          role: 'user',
          content: 'Test',
          metadata: {},
          sequence_in_path: 1,
          is_branch_point: false,
          branched_to_paths: [],
          message_type: 'standard',
          is_pinned: false,
          pinned_at: null,
          pinned_by: null,
          created_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const { GET } = await import('./route');

      const request = new NextRequest('http://localhost/api/conversations/conv-1/messages/msg-1');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'conv-1', messageId: 'msg-1' }),
      });

      expect(response.status).toBe(200);
    });
  });
});
