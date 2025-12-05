import { initObservability } from '@reg-copilot/reg-intel-observability';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const envSamplingRatio = process.env.OTEL_TRACES_SAMPLING_RATIO
    ? Number(process.env.OTEL_TRACES_SAMPLING_RATIO)
    : undefined;

  await initObservability({
    serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/demo-web',
    serviceVersion: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    traceExporter: {
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    metricsExporter: {
      url:
        process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    traceSampling: {
      parentBasedRatio: Number.isFinite(envSamplingRatio) ? envSamplingRatio : undefined,
      alwaysSampleErrors: process.env.OTEL_TRACES_ALWAYS_SAMPLE_ERRORS !== 'false',
    },
  });
}
