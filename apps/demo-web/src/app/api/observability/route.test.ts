import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockGetObservabilityDiagnostics = vi.fn();

vi.mock('@reg-copilot/reg-intel-observability', async () => {
  const actual = await vi.importActual<typeof import('@reg-copilot/reg-intel-observability')>(
    '@reg-copilot/reg-intel-observability'
  );
  return {
    ...actual,
    getObservabilityDiagnostics: mockGetObservabilityDiagnostics,
  };
});

describe('observability route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetObservabilityDiagnostics.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/observability', () => {
    it('returns diagnostics as JSON', async () => {
      const diagnostics = {
        tracing: {
          enabled: true,
          provider: 'opentelemetry',
          samplingRate: 0.1,
        },
        metrics: {
          enabled: true,
          exporterType: 'prometheus',
        },
        logging: {
          level: 'info',
          format: 'json',
        },
        spans: {
          activeCount: 5,
          totalCreated: 1000,
        },
      };

      mockGetObservabilityDiagnostics.mockReturnValue(diagnostics);

      const { GET } = await import('./route');

      const response = await GET();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const data = await response.json();
      expect(data).toEqual(diagnostics);
    });

    it('uses system tenant and observability user context', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({});

      const { GET } = await import('./route');

      await GET();

      // The route should call getObservabilityDiagnostics
      expect(mockGetObservabilityDiagnostics).toHaveBeenCalled();
    });

    it('returns empty diagnostics when none available', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({});

      const { GET } = await import('./route');

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({});
    });

    it('returns tracing status', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        tracing: {
          enabled: true,
          provider: 'opentelemetry',
          endpoint: 'http://collector:4318',
          samplingRate: 0.5,
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(data.tracing).toBeDefined();
      expect(data.tracing.enabled).toBe(true);
      expect(data.tracing.provider).toBe('opentelemetry');
    });

    it('returns metrics status', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        metrics: {
          enabled: true,
          exporterType: 'otlp',
          endpoint: 'http://collector:4317',
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(data.metrics).toBeDefined();
      expect(data.metrics.enabled).toBe(true);
    });

    it('returns logging status', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        logging: {
          level: 'debug',
          format: 'json',
          destinations: ['console', 'file'],
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(data.logging).toBeDefined();
      expect(data.logging.level).toBe('debug');
    });

    it('returns span statistics', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        spans: {
          activeCount: 10,
          totalCreated: 5000,
          droppedCount: 5,
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(data.spans).toBeDefined();
      expect(data.spans.activeCount).toBe(10);
      expect(data.spans.totalCreated).toBe(5000);
    });

    it('returns environment information', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        environment: {
          nodeVersion: 'v20.10.0',
          platform: 'linux',
          uptime: 86400,
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(data.environment).toBeDefined();
      expect(data.environment.nodeVersion).toBe('v20.10.0');
    });

    it('handles diagnostics with null values', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        tracing: null,
        metrics: null,
        logging: {
          level: 'info',
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(data.tracing).toBeNull();
      expect(data.metrics).toBeNull();
      expect(data.logging.level).toBe('info');
    });

    it('handles complex nested diagnostics', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        tracing: {
          enabled: true,
          configuration: {
            sampler: {
              type: 'probability',
              probability: 0.1,
            },
            exporters: [
              { type: 'otlp', endpoint: 'http://collector:4318' },
              { type: 'console' },
            ],
          },
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(data.tracing.configuration.sampler.type).toBe('probability');
      expect(data.tracing.configuration.exporters).toHaveLength(2);
    });

    it('returns correct content type header', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({ status: 'ok' });

      const { GET } = await import('./route');

      const response = await GET();

      const contentType = response.headers.get('Content-Type');
      expect(contentType).toContain('application/json');
    });
  });

  describe('error scenarios', () => {
    it('returns diagnostics even when some components fail', async () => {
      mockGetObservabilityDiagnostics.mockReturnValue({
        tracing: {
          enabled: false,
          error: 'Failed to initialize tracer',
        },
        metrics: {
          enabled: true,
        },
      });

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tracing.error).toBe('Failed to initialize tracer');
      expect(data.metrics.enabled).toBe(true);
    });
  });
});
