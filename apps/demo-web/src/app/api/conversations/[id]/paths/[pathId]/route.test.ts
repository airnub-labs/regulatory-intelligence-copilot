import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetPath = vi.fn();
const mockUpdatePath = vi.fn();
const mockDeletePath = vi.fn();
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
    getPath: mockGetPath,
    updatePath: mockUpdatePath,
    deletePath: mockDeletePath,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
}));

describe('path detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetPath.mockReset();
    mockUpdatePath.mockReset();
    mockDeletePath.mockReset();
    mockGetConversation.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/[id]/paths/[pathId]', () => {
    it('retrieves a specific path successfully', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
        name: 'Alternative Scenario',
        isPrimary: false,
        isActive: false,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        path: {
          id: 'path-2',
          conversationId: 'conv-1',
          name: 'Alternative Scenario',
          isPrimary: false,
          isActive: false,
        },
      });

      expect(mockGetPath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-2',
      });
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
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
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
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
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Path not found' });
    });
  });

  describe('PATCH /api/conversations/[id]/paths/[pathId]', () => {
    it('updates a path successfully', async () => {
      mockGetPath
        .mockResolvedValueOnce({
          id: 'path-2',
          conversationId: 'conv-1',
          name: 'Old Name',
        })
        .mockResolvedValueOnce({
          id: 'path-2',
          conversationId: 'conv-1',
          name: 'New Name',
          description: 'Updated description',
        });

      mockUpdatePath.mockResolvedValue(undefined);

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'New Name',
            description: 'Updated description',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.path).toMatchObject({
        id: 'path-2',
        name: 'New Name',
        description: 'Updated description',
      });

      expect(mockUpdatePath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-2',
        name: 'New Name',
        description: 'Updated description',
        isActive: undefined,
      });
    });

    it('returns 404 if path not found', async () => {
      mockGetPath.mockResolvedValue(null);

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'New Name' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Path not found' });
    });

    it('returns 400 if request body is invalid', async () => {
      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
      });

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: '{bad json',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid request body' });
    });

    it('returns 400 if update fails', async () => {
      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
      });

      mockUpdatePath.mockRejectedValue(new Error('Update failed'));

      const { PATCH } = await import('./route');

      const response = await PATCH(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'New Name' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Update failed' });
    });
  });

  describe('DELETE /api/conversations/[id]/paths/[pathId]', () => {
    it('soft deletes a path successfully', async () => {
      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
      });

      mockDeletePath.mockResolvedValue(undefined);

      const { DELETE } = await import('./route');

      const response = await DELETE(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'DELETE',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ status: 'ok' });

      expect(mockDeletePath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-2',
        hardDelete: false,
      });
    });

    it('hard deletes a path when hardDelete=true', async () => {
      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
      });

      mockDeletePath.mockResolvedValue(undefined);

      const { DELETE } = await import('./route');

      const response = await DELETE(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2?hardDelete=true', {
          method: 'DELETE',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);

      expect(mockDeletePath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        pathId: 'path-2',
        hardDelete: true,
      });
    });

    it('returns 404 if path not found', async () => {
      mockGetPath.mockResolvedValue(null);

      const { DELETE } = await import('./route');

      const response = await DELETE(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'DELETE',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Path not found' });
    });

    it('returns 400 if delete fails', async () => {
      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
      });

      mockDeletePath.mockRejectedValue(new Error('Cannot delete primary path'));

      const { DELETE } = await import('./route');

      const response = await DELETE(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2', {
          method: 'DELETE',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Cannot delete primary path' });
    });
  });
});
