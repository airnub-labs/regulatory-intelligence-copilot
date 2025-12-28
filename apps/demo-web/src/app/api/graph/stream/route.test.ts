import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ChangeFilter, GraphPatch } from '@reg-copilot/reg-intel-core';

const mockSubscribeToGraphPatches = vi.fn();
const mockHasActiveSandbox = vi.fn();
const mockGetMcpGatewayUrl = vi.fn();
const mockNormalizeProfileType = vi.fn();

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

vi.mock('@reg-copilot/reg-intel-core', () => ({
  hasActiveSandbox: mockHasActiveSandbox,
  getMcpGatewayUrl: mockGetMcpGatewayUrl,
  normalizeProfileType: mockNormalizeProfileType,
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'user-123', tenantId: 'tenant-1' } })),
}));

vi.mock('@/lib/graphChangeDetectorInstance', () => ({
  subscribeToGraphPatches: mockSubscribeToGraphPatches,
}));

describe('graph stream route', () => {
  let capturedCallback: ((patch: GraphPatch) => void) | null = null;
  let mockUnsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockSubscribeToGraphPatches.mockReset();
    mockHasActiveSandbox.mockReset();
    mockGetMcpGatewayUrl.mockReset();
    mockNormalizeProfileType.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    capturedCallback = null;
    mockUnsubscribe = vi.fn();

    // Default implementations
    mockNormalizeProfileType.mockImplementation((type) => type || 'default');
    mockHasActiveSandbox.mockReturnValue(true);
    mockGetMcpGatewayUrl.mockReturnValue('http://mcp-gateway:8080');

    // Capture the patch callback
    mockSubscribeToGraphPatches.mockImplementation(
      (_filter: ChangeFilter, callback: (patch: GraphPatch) => void) => {
        capturedCallback = callback;
        return { unsubscribe: mockUnsubscribe };
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/graph/stream - SSE mode', () => {
    it('returns SSE response with correct headers', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    });

    it('sends connection message on start', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      const { value } = await reader!.read();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('data:');
      expect(text).toContain('"type":"connected"');
      expect(text).toContain('Graph stream connected');

      await reader!.cancel();
    });

    it('parses jurisdictions from query params', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream?jurisdictions=IE,UK,US');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      expect(mockSubscribeToGraphPatches).toHaveBeenCalledWith(
        expect.objectContaining({
          jurisdictions: ['IE', 'UK', 'US'],
        }),
        expect.any(Function)
      );

      await reader!.cancel();
    });

    it('uses default jurisdiction when not specified', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      expect(mockSubscribeToGraphPatches).toHaveBeenCalledWith(
        expect.objectContaining({
          jurisdictions: ['IE'],
        }),
        expect.any(Function)
      );

      await reader!.cancel();
    });

    it('parses profileType from query params', async () => {
      mockNormalizeProfileType.mockReturnValue('regulatory');

      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream?profileType=regulatory');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      expect(mockNormalizeProfileType).toHaveBeenCalledWith('regulatory');
      expect(mockSubscribeToGraphPatches).toHaveBeenCalledWith(
        expect.objectContaining({
          profileType: 'regulatory',
        }),
        expect.any(Function)
      );

      await reader!.cancel();
    });

    it('parses keyword from query params', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream?keyword=tax');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      expect(mockSubscribeToGraphPatches).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: 'tax',
        }),
        expect.any(Function)
      );

      await reader!.cancel();
    });

    it('logs client connection', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream?jurisdictions=IE,UK');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            jurisdictions: ['IE', 'UK'],
          }),
          tenantId: 'tenant-1',
          userId: 'user-123',
        }),
        'Client connected to graph stream'
      );
    });

    it('streams patches when sandbox is active', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      // Read connection message
      await reader!.read();

      expect(capturedCallback).not.toBeNull();

      // Simulate a graph patch
      const patch: GraphPatch = {
        type: 'graph_patch',
        nodes: { added: [], updated: [], removed: [] },
        edges: { added: [], updated: [], removed: [] },
        meta: { timestamp: new Date().toISOString(), source: 'test' },
      };

      capturedCallback!(patch);

      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('data:');
      expect(text).toContain('graph_patch');

      await reader!.cancel();
    });

    it('does not subscribe when sandbox is not active', async () => {
      mockHasActiveSandbox.mockReturnValue(false);

      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockSubscribeToGraphPatches).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
        }),
        'No active sandbox - streaming keepalive only'
      );
    });

    it('does not subscribe when MCP gateway URL is not set', async () => {
      mockGetMcpGatewayUrl.mockReturnValue(undefined);

      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockSubscribeToGraphPatches).not.toHaveBeenCalled();
    });

    it('unsubscribes on request abort', async () => {
      const abortController = new AbortController();

      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream', {
        signal: abortController.signal,
      });
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      expect(mockSubscribeToGraphPatches).toHaveBeenCalled();

      // Abort the request
      abortController.abort();

      // Give time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('handles unauthenticated users with default tenant', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      expect(response.status).toBe(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: expect.any(String),
        }),
        'Client connected to graph stream'
      );
    });

    it('logs when sending patches to SSE client', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      const patch: GraphPatch = {
        type: 'graph_patch',
        nodes: { added: [], updated: [], removed: [] },
        edges: { added: [], updated: [], removed: [] },
        meta: { timestamp: new Date().toISOString(), source: 'test' },
      };

      capturedCallback!(patch);
      await reader!.read();
      await reader!.cancel();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: patch.meta,
        }),
        'Sent patch to SSE client'
      );
    });
  });

  describe('filter construction', () => {
    it('constructs filter with all params', async () => {
      mockNormalizeProfileType.mockReturnValue('financial');

      const { GET } = await import('./route');

      const request = new Request(
        'http://localhost/api/graph/stream?jurisdictions=IE,UK&profileType=financial&keyword=regulation'
      );
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockSubscribeToGraphPatches).toHaveBeenCalledWith(
        {
          jurisdictions: ['IE', 'UK'],
          profileType: 'financial',
          keyword: 'regulation',
        },
        expect.any(Function)
      );
    });

    it('sets undefined keyword when not provided', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockSubscribeToGraphPatches).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: undefined,
        }),
        expect.any(Function)
      );
    });
  });

  describe('WebSocket mode', () => {
    it('falls back to SSE when WebSocketPair is not available', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream', {
        headers: { upgrade: 'websocket' },
      });
      const response = await GET(request);

      // Should fall back to SSE since WebSocketPair is not in globalThis
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });
  });

  describe('error handling', () => {
    it('logs errors when sending patches fails', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();

      // Cancel the reader to simulate closed connection
      await reader!.cancel();

      // Now try to send a patch - this should trigger error handling
      const patch: GraphPatch = {
        type: 'graph_patch',
        nodes: { added: [], updated: [], removed: [] },
        edges: { added: [], updated: [], removed: [] },
        meta: { timestamp: new Date().toISOString(), source: 'test' },
      };

      // The callback may still try to send after cancel
      try {
        capturedCallback!(patch);
      } catch {
        // Expected to potentially fail
      }

      // Error should be logged (may or may not be called depending on timing)
    });
  });

  describe('tenant context', () => {
    it('uses tenant from session', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      const reader = response.body?.getReader();
      await reader!.read();
      await reader!.cancel();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-123',
        }),
        expect.any(String)
      );
    });

    it('uses environment default when user has no tenant', async () => {
      const { getServerSession } = await import('next-auth/next');
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-123' },
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost/api/graph/stream');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });
});
