import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClientTelemetry } from './clientTelemetry';

describe('client telemetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // @ts-expect-error - cleanup mock fetch
    delete global.fetch;
  });

  it('swallows transport failures when sending telemetry', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network blocked'));
    // @ts-expect-error - partial fetch mock for test environment
    global.fetch = fetchMock;

    const telemetry = createClientTelemetry('ClientTelemetryTest', {
      endpoint: '/api/client-telemetry',
    });

    expect(() => telemetry.info({ reason: 'test' }, 'simulate telemetry send')).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
