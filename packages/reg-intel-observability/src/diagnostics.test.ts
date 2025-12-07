import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dumpObservabilityDiagnostics,
  formatObservabilityDiagnostics,
  getObservabilityDiagnostics,
} from './diagnostics.js';
import { initObservability, shutdownObservability } from './tracing.js';

describe('observability diagnostics', () => {
  afterEach(async () => {
    await shutdownObservability();
  });

  it('reports runtime config after init', async () => {
    await initObservability({
      serviceName: 'diagnostics-test',
      environment: 'test',
      traceExporter: { url: 'http://trace-endpoint' },
      metricsExporter: { url: 'http://metrics-endpoint' },
      traceSampling: { parentBasedRatio: 0.5, alwaysSampleErrors: true },
      instrumentations: [],
    });

    const diagnostics = getObservabilityDiagnostics();
    expect(diagnostics.sdkStarted).toBe(true);
    expect(diagnostics.serviceName).toBe('diagnostics-test');
    expect(diagnostics.exporters.trace.url).toBe('http://trace-endpoint');
    expect(diagnostics.exporters.metrics.url).toBe('http://metrics-endpoint');
    expect(diagnostics.sampling?.parentBasedRatio).toBe(0.5);
    expect(diagnostics.sampling?.alwaysSampleErrors).toBe(true);
    expect(diagnostics.instrumentations).toEqual([]);
    expect(diagnostics.startedAt).toBeDefined();
  });

  it('dumps diagnostics to a writable stream', async () => {
    const chunks: string[] = [];
    const writer = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    dumpObservabilityDiagnostics(writer);
    const output = chunks.join('');
    const parsed = JSON.parse(output);

    expect(parsed.sdkStarted).toBe(false);
    expect(formatObservabilityDiagnostics(parsed)).toContain('"sdkStarted"');
  });
});
