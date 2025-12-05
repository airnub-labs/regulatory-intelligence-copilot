import { SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FsInstrumentation } from '@opentelemetry/instrumentation-fs';
import { NextInstrumentation } from '@opentelemetry/instrumentation-next';
import { Instrumentation } from '@opentelemetry/instrumentation';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { requestContext } from './requestContext.js';

export interface ObservabilityOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  traceExporterUrl?: string;
  metricsExporterUrl?: string;
  enableFsInstrumentation?: boolean;
  instrumentations?: Instrumentation[];
}

const tracer = trace.getTracer('reg-intel-observability');
let sdkInstance: NodeSDK | null = null;

export const initObservability = async (options: ObservabilityOptions) => {
  if (sdkInstance) {
    return sdkInstance;
  }

  const traceExporter = new OTLPTraceExporter({ url: options.traceExporterUrl });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: options.metricsExporterUrl }),
  });

  const instrumentations: Instrumentation[] = [
    new HttpInstrumentation(),
    new UndiciInstrumentation(),
    new NextInstrumentation(),
  ];

  if (options.enableFsInstrumentation) {
    instrumentations.push(new FsInstrumentation());
  }

  if (options.instrumentations) {
    instrumentations.push(...options.instrumentations);
  }

  sdkInstance = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: options.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]:
        options.serviceVersion ?? process.env.npm_package_version ?? '0.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        options.environment ?? process.env.NODE_ENV ?? 'development',
    }),
    traceExporter,
    metricReader,
    instrumentations,
    contextManager: new AsyncLocalStorageContextManager().enable(),
  });

  await sdkInstance.start();
  return sdkInstance;
};

export const withSpan = async <T>(
  name: string,
  attributes: Record<string, unknown>,
  fn: () => Promise<T> | T
): Promise<T> => {
  return tracer.startActiveSpan(
    name,
    { attributes },
    async (span) => {
      requestContext.applyToSpan(span);

      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    }
  );
};
