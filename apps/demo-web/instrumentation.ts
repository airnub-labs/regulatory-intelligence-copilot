export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  // Use dynamic import to avoid bundling Node.js-only code for Edge Runtime
  const { initObservability } = await import('@reg-copilot/reg-intel-observability');
  const { initializePricingService } = await import('./src/lib/pricingInit');

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
    logsExporter: {
      // Enable OTEL logs by default in production (unless explicitly disabled)
      // In development, only enable if explicitly set to 'true'
      enabled:
        process.env.OTEL_LOGS_ENABLED === 'true' ||
        (process.env.NODE_ENV === 'production' && process.env.OTEL_LOGS_ENABLED !== 'false'),
      url:
        process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      useBatchProcessor: process.env.NODE_ENV === 'production',
    },
    traceSampling: {
      parentBasedRatio: Number.isFinite(envSamplingRatio) ? envSamplingRatio : undefined,
      alwaysSampleErrors: process.env.OTEL_TRACES_ALWAYS_SAMPLE_ERRORS !== 'false',
    },
  });

  // Initialize dynamic pricing service with Supabase
  initializePricingService();
}
