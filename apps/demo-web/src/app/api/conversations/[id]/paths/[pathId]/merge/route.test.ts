import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockMergePath = vi.fn();
const mockPreviewMerge = vi.fn();
const mockGetPath = vi.fn();
const mockGetConversation = vi.fn();
const mockGenerateMergeSummary = vi.fn();
const mockGetContextByPath = vi.fn();
const mockTerminateContext = vi.fn();

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
    mergePath: mockMergePath,
    previewMerge: mockPreviewMerge,
    getPath: mockGetPath,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
  executionContextManager: {
    getContextByPath: mockGetContextByPath,
    terminateContext: mockTerminateContext,
  },
}));

vi.mock('@/lib/server/mergeSummarizer', () => ({
  generateMergeSummary: mockGenerateMergeSummary,
}));

describe('merge route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockMergePath.mockReset();
    mockPreviewMerge.mockReset();
    mockGetPath.mockReset();
    mockGetConversation.mockReset();
    mockGenerateMergeSummary.mockReset();
    mockGetContextByPath.mockReset();
    mockTerminateContext.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/conversations/[id]/paths/[pathId]/merge', () => {
    it('merges paths successfully in full mode', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath
        .mockResolvedValueOnce({
          id: 'path-2',
          conversationId: 'conv-1',
          isPrimary: false,
        })
        .mockResolvedValueOnce({
          id: 'path-1',
          conversationId: 'conv-1',
          isPrimary: true,
        });

      mockMergePath.mockResolvedValue({
        success: true,
        summaryMessageId: null,
        mergedMessageIds: ['msg-1', 'msg-2'],
        targetPath: {
          id: 'path-1',
          conversationId: 'conv-1',
        },
        sourcePath: {
          id: 'path-2',
          conversationId: 'conv-1',
        },
      });

      mockGetContextByPath.mockResolvedValue({ id: 'ctx-1' });
      mockTerminateContext.mockResolvedValue(undefined);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'full',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        success: true,
        mergedMessageIds: ['msg-1', 'msg-2'],
      });

      expect(mockMergePath).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        sourcePathId: 'path-2',
        targetPathId: 'path-1',
        mergeMode: 'full',
        selectedMessageIds: undefined,
        summaryPrompt: undefined,
        summaryContent: undefined,
        userId: 'user-123',
        archiveSource: true,
      });

      expect(mockTerminateContext).toHaveBeenCalledWith('ctx-1');
    });

    it('generates AI summary for summary mode when not provided', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath
        .mockResolvedValueOnce({
          id: 'path-2',
          conversationId: 'conv-1',
          isPrimary: false,
        })
        .mockResolvedValueOnce({
          id: 'path-1',
          conversationId: 'conv-1',
          isPrimary: true,
        });

      mockPreviewMerge.mockResolvedValue({
        messagesToMerge: [
          { id: 'msg-1', content: 'Message 1' },
          { id: 'msg-2', content: 'Message 2' },
        ],
        sourcePath: { id: 'path-2' },
        targetPath: { id: 'path-1' },
        generatedSummary: 'Basic summary',
      });

      mockGenerateMergeSummary.mockResolvedValue({
        summary: 'AI-generated summary of the branch conversation',
        aiGenerated: true,
      });

      mockMergePath.mockResolvedValue({
        success: true,
        summaryMessageId: 'msg-summary',
        mergedMessageIds: [],
        targetPath: { id: 'path-1' },
        sourcePath: { id: 'path-2' },
      });

      mockGetContextByPath.mockResolvedValue(null);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'summary',
            summaryPrompt: 'Summarize this conversation',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);

      expect(mockPreviewMerge).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        sourcePathId: 'path-2',
        targetPathId: 'path-1',
        mergeMode: 'summary',
        selectedMessageIds: undefined,
        summaryPrompt: 'Summarize this conversation',
      });

      expect(mockGenerateMergeSummary).toHaveBeenCalledWith({
        branchMessages: expect.any(Array),
        sourcePath: { id: 'path-2' },
        targetPath: { id: 'path-1' },
        customPrompt: 'Summarize this conversation',
        tenantId: 'tenant-1',
      });

      expect(mockMergePath).toHaveBeenCalledWith(
        expect.objectContaining({
          summaryContent: 'AI-generated summary of the branch conversation',
        })
      );
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'full',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Conversation not found' });
    });

    it('returns 404 if source path not found', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValueOnce(null);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'full',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Source path not found' });
    });

    it('returns 400 if trying to merge path into itself', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath
        .mockResolvedValueOnce({
          id: 'path-1',
          conversationId: 'conv-1',
          isPrimary: false,
        })
        .mockResolvedValueOnce({
          id: 'path-1',
          conversationId: 'conv-1',
          isPrimary: false,
        });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-1/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'full',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Cannot merge path into itself' });
    });

    it('returns 400 if trying to merge primary path', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValueOnce({
        id: 'path-1',
        conversationId: 'conv-1',
        isPrimary: true,
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-1/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-2',
            mergeMode: 'full',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Cannot merge primary path' });
    });

    it('returns 400 if mergeMode is invalid', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath.mockResolvedValueOnce({
        id: 'path-2',
        conversationId: 'conv-1',
        isPrimary: false,
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'invalid-mode',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'mergeMode must be one of: summary, full, selective' });
    });

    it('returns 400 if selectedMessageIds missing for selective mode', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockGetPath
        .mockResolvedValueOnce({
          id: 'path-2',
          conversationId: 'conv-1',
          isPrimary: false,
        })
        .mockResolvedValueOnce({
          id: 'path-1',
          conversationId: 'conv-1',
          isPrimary: true,
        });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'selective',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'selectedMessageIds is required for selective merge mode' });
    });
  });
});
