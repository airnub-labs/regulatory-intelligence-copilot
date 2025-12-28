import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPreviewMerge = vi.fn();
const mockGetConversation = vi.fn();
const mockGenerateMergeSummary = vi.fn();

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
    previewMerge: mockPreviewMerge,
  },
  conversationStore: {
    getConversation: mockGetConversation,
  },
}));

vi.mock('@/lib/server/mergeSummarizer', () => ({
  generateMergeSummary: mockGenerateMergeSummary,
}));

describe('merge preview route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPreviewMerge.mockReset();
    mockGetConversation.mockReset();
    mockGenerateMergeSummary.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/conversations/[id]/paths/[pathId]/merge/preview', () => {
    it('generates merge preview successfully', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockPreviewMerge.mockResolvedValue({
        messagesToMerge: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'What about German tax rules?',
            createdAt: new Date('2024-01-01'),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'In Germany, the corporate tax rate is...',
            createdAt: new Date('2024-01-01'),
          },
        ],
        generatedSummary: 'Basic summary',
        targetPath: { id: 'path-1', name: 'Primary' },
        sourcePath: { id: 'path-2', name: 'Alternative' },
        estimatedMessageCount: 2,
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge/preview', {
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
        messagesToMerge: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'What about German tax rules?',
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'In Germany, the corporate tax rate is...',
          },
        ],
        generatedSummary: 'Basic summary',
        estimatedMessageCount: 2,
      });

      expect(mockPreviewMerge).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        sourcePathId: 'path-2',
        targetPathId: 'path-1',
        mergeMode: 'full',
        selectedMessageIds: undefined,
        summaryPrompt: undefined,
      });
    });

    it('generates AI summary for summary mode', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockPreviewMerge.mockResolvedValue({
        messagesToMerge: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Message 1',
            createdAt: new Date('2024-01-01'),
          },
        ],
        generatedSummary: 'Basic summary',
        targetPath: { id: 'path-1' },
        sourcePath: { id: 'path-2' },
        estimatedMessageCount: 1,
      });

      mockGenerateMergeSummary.mockResolvedValue({
        summary: 'AI-generated summary of the branch conversation',
        aiGenerated: true,
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'summary',
            summaryPrompt: 'Focus on regulatory implications',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        generatedSummary: 'AI-generated summary of the branch conversation',
        aiGenerated: true,
      });

      expect(mockGenerateMergeSummary).toHaveBeenCalledWith({
        branchMessages: expect.any(Array),
        sourcePath: { id: 'path-2' },
        targetPath: { id: 'path-1' },
        customPrompt: 'Focus on regulatory implications',
        tenantId: 'tenant-1',
      });
    });

    it('falls back to basic summary if AI summary generation fails', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      mockPreviewMerge.mockResolvedValue({
        messagesToMerge: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Message 1',
            createdAt: new Date('2024-01-01'),
          },
        ],
        generatedSummary: 'Fallback basic summary',
        targetPath: { id: 'path-1' },
        sourcePath: { id: 'path-2' },
        estimatedMessageCount: 1,
      });

      mockGenerateMergeSummary.mockRejectedValue(new Error('AI service unavailable'));

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'summary',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.generatedSummary).toBe('Fallback basic summary');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          sourcePathId: 'path-2',
        }),
        'Failed to generate AI summary'
      );
    });

    it('returns 404 if conversation not found', async () => {
      mockGetConversation.mockResolvedValue(null);

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge/preview', {
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

    it('returns 400 if request body is invalid', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{bad json',
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid request body' });
    });

    it('returns 400 if targetPathId is missing', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mergeMode: 'full',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'targetPathId is required' });
    });

    it('returns 400 if mergeMode is invalid', async () => {
      mockGetConversation.mockResolvedValue({
        id: 'conv-1',
        tenantId: 'tenant-1',
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/conversations/conv-1/paths/path-2/merge/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetPathId: 'path-1',
            mergeMode: 'invalid',
          }),
        }) as NextRequest,
        { params: Promise.resolve({ id: 'conv-1', pathId: 'path-2' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'mergeMode must be one of: summary, full, selective' });
    });
  });
});
