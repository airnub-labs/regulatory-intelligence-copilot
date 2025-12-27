import { describe, expect, it, vi, beforeEach } from 'vitest';

const errorSpy = vi.fn();
const loggerMock = {
  child: vi.fn(() => loggerMock),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: errorSpy,
};

vi.mock('@reg-copilot/reg-intel-observability', async () => {
  const actual = await vi.importActual<typeof import('@reg-copilot/reg-intel-observability')>(
    '@reg-copilot/reg-intel-observability'
  );

  return {
    ...actual,
    createLogger: () => loggerMock,
  };
});

beforeEach(() => {
  errorSpy.mockReset();
  loggerMock.child.mockClear();
  loggerMock.info.mockClear();
  loggerMock.debug.mockClear();
  loggerMock.warn.mockClear();
});

describe('client telemetry route', () => {
  it('returns 400 for malformed payload without throwing', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/client-telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad json',
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid telemetry payload' });
    expect(errorSpy).toHaveBeenCalledOnce();
    const [logObject, message] = errorSpy.mock.calls[0];
    expect(message).toBe('Failed to process client telemetry');
    expect(logObject.err).toBeInstanceOf(Error);
  });

  it('returns 400 for single events with invalid timestamps', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/client-telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          level: 'info',
          message: 'hello',
          scope: 'test',
          sessionId: 'session-1',
          timestamp: 'not-a-date',
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid telemetry payload' });
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it('filters invalid timestamps from batches and returns 400 when all are invalid', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/client-telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              level: 'info',
              message: 'invalid event',
              scope: 'test',
              sessionId: 'session-1',
              timestamp: 'not-a-date',
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'No valid events in batch' });
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it('processes valid events from mixed batches and drops invalid ones', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/client-telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              level: 'info',
              message: 'valid event',
              scope: 'test',
              sessionId: 'session-1',
              timestamp: '2025-01-01T00:00:00.000Z',
            },
            {
              level: 'info',
              message: 'invalid event',
              scope: 'test',
              sessionId: 'session-2',
              timestamp: 'not-a-date',
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(204);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      {
        clientIp: 'unknown',
        batchSize: 2,
        droppedEvents: 1,
      },
      'Dropped invalid telemetry events from batch'
    );
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    const [logObject, message] = loggerMock.info.mock.calls[0];
    expect(logObject).toEqual({});
    expect(message).toBe('valid event');
  });
});
