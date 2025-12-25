import { describe, expect, it, vi, beforeEach } from 'vitest';

const errorSpy = vi.fn();
const loggerMock = {
  child: vi.fn(() => loggerMock),
  info: vi.fn(),
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
});
