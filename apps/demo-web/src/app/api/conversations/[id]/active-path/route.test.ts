import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetActivePath = vi.fn();
const mockEnsurePrimaryPath = vi.fn();
const mockSetActivePath = vi.fn();
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

vi.mock('@reg-copilot/reg-intel-conversations', () => ({
  toClientPath: (path: unknown) => path,
}));

vi.mock('@/lib/server/conversations', () => ({
  conversationPathStore: {
    getActivePath: mockGetActivePath,
    ensurePrimaryPath: mockEnsurePrimaryPath,
    setActivePath: mockSetActivePath,
    getPath: mockGetPath,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
}));

describe('active-path route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetActivePath.mockReset();
    mockEnsurePrimaryPath.mockReset();
    mockSetActivePath.mockReset();
    mockGetPath.mockReset();
    mockGetConversation.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/[id]/active-path', () => {
    it('returns the active path if it exists', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetActivePath.mockResolvedValue({
        id: 'path-1',
        conversationId: 'conv-1',
        isPrimary: true,
        isActive: true,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        path: {
          id: 'path-1',
          conversationId: 'conv-1',
          isPrimary: true,
          isActive: true,
        },
      });

      expect(mockGetActivePath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
      });
    });

    it('creates primary path if no active path exists', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetActivePath.mockResolvedValue(null);
      mockEnsurePrimaryPath.mockResolvedValue({
        id: 'path-primary',
        conversationId: 'conv-1',
        isPrimary: true,
        isActive: true,
      });

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        path: {
          id: 'path-primary',
          conversationId: 'conv-1',
          isPrimary: true,
          isActive: true,
        },
      });

      expect(mockEnsurePrimaryPath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
      });
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { GET } = await import('./route');

      const response = await GET(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'GET',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });
    });
  });

  describe('PUT /api/conversations/[id]/active-path', () => {
    it('sets active path successfully', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue({
        id: 'path-2',
        conversationId: 'conv-1',
        isPrimary: false,
        isActive: false,
      });

      mockSetActivePath.mockResolvedValue(undefined);

      const { PUT } = await import('./route');

      const response = await PUT(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pathId: 'path-2' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        path: {
          id: 'path-2',
          conversationId: 'conv-1',
          isPrimary: false,
          isActive: false,
        },
      });

      expect(mockSetActivePath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-2',
      });
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { PUT } = await import('./route');

      const response = await PUT(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pathId: 'path-2' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });
    });

    it('returns 400 if pathId is missing', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      const { PUT } = await import('./route');

      const response = await PUT(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'pathId is required' });
    });

    it('returns 404 if path not found', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValue(null);

      const { PUT } = await import('./route');

      const response = await PUT(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pathId: 'path-2' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
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
        conversationId: 'conv-2',
      });

      const { PUT } = await import('./route');

      const response = await PUT(
        new Request('http://localhost/api/conversations/conv-1/active-path', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pathId: 'path-2' }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Path not found' });
    });
  });
});
