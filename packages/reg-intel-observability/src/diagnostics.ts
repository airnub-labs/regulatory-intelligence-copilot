import type { ExporterEndpointOptions, TraceSamplingOptions } from './tracing.js';
import { getRuntimeObservabilityConfig } from './tracing.js';

export interface ExporterDiagnostics {
  configured: boolean;
  url?: string;
  headersConfigured: boolean;
}

export interface ObservabilityDiagnostics {
  sdkStarted: boolean;
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  sampling?: TraceSamplingOptions;
  exporters: {
    trace: ExporterDiagnostics;
    metrics: ExporterDiagnostics;
  };
  instrumentations: string[];
  startedAt?: string;
}

const buildExporterDiagnostics = (
  endpoint: ExporterEndpointOptions | undefined
): ExporterDiagnostics => {
  return {
    configured: Boolean(endpoint?.url),
    url: endpoint?.url,
    headersConfigured: Boolean(endpoint?.headers && Object.keys(endpoint.headers).length > 0),
  };
};

export const getObservabilityDiagnostics = (): ObservabilityDiagnostics => {
  const runtime = getRuntimeObservabilityConfig();

  return {
    sdkStarted: Boolean(runtime),
    serviceName: runtime?.serviceName,
    serviceVersion: runtime?.serviceVersion,
    environment: runtime?.environment,
    sampling: runtime?.sampling,
    exporters: {
      trace: buildExporterDiagnostics(runtime?.traceExporter),
      metrics: buildExporterDiagnostics(runtime?.metricsExporter),
    },
    instrumentations: runtime?.instrumentations ?? [],
    startedAt: runtime?.startedAt,
  };
};

export const formatObservabilityDiagnostics = (diagnostics: ObservabilityDiagnostics) => {
  return JSON.stringify(diagnostics, null, 2);
};

export const dumpObservabilityDiagnostics = (writer: NodeJS.WritableStream = process.stdout) => {
  const diagnostics = getObservabilityDiagnostics();
  writer.write(`${formatObservabilityDiagnostics(diagnostics)}\n`);
};
