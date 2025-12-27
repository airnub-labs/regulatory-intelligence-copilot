import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockCleanupExecutionContexts = vi.fn();
const mockExecutionContextManager = {};

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

vi.mock('@/lib/server/conversations', () => ({
  executionContextManager: mockExecutionContextManager,
}));

vi.mock('@/lib/jobs/cleanupExecutionContexts', () => ({
  cleanupExecutionContexts: mockCleanupExecutionContexts,
}));

describe('cleanup-contexts cron route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    mockCleanupExecutionContexts.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('POST /api/cron/cleanup-contexts', () => {
    it('returns 500 if CRON_SECRET not configured', async () => {
      delete process.env.CRON_SECRET;

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/cron/cleanup-contexts', {
          method: 'POST',
          headers: { authorization: 'Bearer test-secret' },
        }) as NextRequest
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Cron endpoint not configured' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          userId: 'cron',
        }),
        'CRON_SECRET not configured'
      );
    });

    it('returns 401 if authorization header is missing', async () => {
      process.env.CRON_SECRET = 'secret-123';

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/cron/cleanup-contexts', {
          method: 'POST',
        }) as NextRequest
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          userId: 'cron',
        }),
        'Unauthorized request'
      );
    });

    it('returns 401 if CRON_SECRET does not match', async () => {
      process.env.CRON_SECRET = 'secret-123';

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/cron/cleanup-contexts', {
          method: 'POST',
          headers: { authorization: 'Bearer wrong-secret' },
        }) as NextRequest
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          userId: 'cron',
        }),
        'Unauthorized request'
      );
    });

    it('runs cleanup successfully and returns results', async () => {
      process.env.CRON_SECRET = 'secret-123';
      mockCleanupExecutionContexts.mockResolvedValue({
        cleaned: 5,
        errors: 0,
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/cron/cleanup-contexts', {
          method: 'POST',
          headers: { authorization: 'Bearer secret-123' },
        }) as NextRequest
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        message: 'Cleanup completed successfully',
        cleaned: 5,
        errors: 0,
      });

      expect(mockCleanupExecutionContexts).toHaveBeenCalledWith(mockExecutionContextManager);
    });

    it('includes error details in response when cleanup has errors', async () => {
      process.env.CRON_SECRET = 'secret-123';
      mockCleanupExecutionContexts.mockResolvedValue({
        cleaned: 3,
        errors: 2,
        errorDetails: ['Error 1', 'Error 2'],
      });

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/cron/cleanup-contexts', {
          method: 'POST',
          headers: { authorization: 'Bearer secret-123' },
        }) as NextRequest
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        message: 'Cleanup completed successfully',
        cleaned: 3,
        errors: 2,
        errorDetails: ['Error 1', 'Error 2'],
      });
    });

    it('returns 500 if cleanup throws an error', async () => {
      process.env.CRON_SECRET = 'secret-123';
      mockCleanupExecutionContexts.mockRejectedValue(new Error('Database connection failed'));

      const { POST } = await import('./route');

      const response = await POST(
        new Request('http://localhost/api/cron/cleanup-contexts', {
          method: 'POST',
          headers: { authorization: 'Bearer secret-123' },
        }) as NextRequest
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({
        error: 'Cleanup failed',
        details: 'Database connection failed',
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          userId: 'cron',
        }),
        'Cleanup failed'
      );
    });
  });

  describe('GET /api/cron/cleanup-contexts', () => {
    it('returns endpoint information', async () => {
      const { GET } = await import('./route');

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        endpoint: '/api/cron/cleanup-contexts',
        method: 'POST',
        description: 'Cleans up expired E2B execution contexts',
        schedule: 'Every hour (0 * * * *)',
        authentication: 'Bearer token with CRON_SECRET',
        executionContextEnabled: true,
      });
    });
  });
});
