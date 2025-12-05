import { initObservability } from '@reg-copilot/reg-intel-observability';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  await initObservability({
    serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/demo-web',
    serviceVersion: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    traceExporterUrl:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    metricsExporterUrl:
      process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
}
