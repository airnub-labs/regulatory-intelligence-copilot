import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FsInstrumentation } from '@opentelemetry/instrumentation-fs';
import { Instrumentation } from '@opentelemetry/instrumentation';
import { NextInstrumentation } from '@opentelemetry/instrumentation-next';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  AlwaysOnSampler,
  ParentBasedSampler,
  SamplingDecision,
  TraceIdRatioBasedSampler,
  type Sampler,
} from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { requestContext } from './requestContext.js';

// ATTR_DEPLOYMENT_ENVIRONMENT_NAME is not yet in semantic-conventions stable, use string literal
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment.name';

export interface TraceSamplingOptions {
  parentBasedRatio?: number;
  alwaysSampleErrors?: boolean;
}

export interface ExporterEndpointOptions {
  url?: string;
  headers?: Record<string, string>;
}

export interface ObservabilityOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  traceExporter?: ExporterEndpointOptions;
  metricsExporter?: ExporterEndpointOptions;
  enableFsInstrumentation?: boolean;
  enableNextInstrumentation?: boolean;
  instrumentations?: Instrumentation[];
  traceSampling?: TraceSamplingOptions;
}

const tracer = trace.getTracer('reg-intel-observability');
let sdkInstance: NodeSDK | null = null;

const clampRatio = (value: number) => Math.min(1, Math.max(0, value));
const sanitizeRatio = (value?: number): number => (Number.isFinite(value) ? value! : 1);

const buildSampler = (options?: TraceSamplingOptions): Sampler => {
  const ratio = clampRatio(sanitizeRatio(options?.parentBasedRatio));

  const baseSampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio),
    localParentNotSampled: new TraceIdRatioBasedSampler(ratio),
    remoteParentNotSampled: new TraceIdRatioBasedSampler(ratio),
    localParentSampled: new AlwaysOnSampler(),
    remoteParentSampled: new AlwaysOnSampler(),
  });

  if (!options?.alwaysSampleErrors) {
    return baseSampler;
  }

  return {
    shouldSample(context, traceId, spanName, spanKind, attributes, links) {
      const baseDecision = baseSampler.shouldSample(
        context,
        traceId,
        spanName,
        spanKind,
        attributes,
        links
      );

      if (baseDecision.decision === SamplingDecision.RECORD_AND_SAMPLED) {
        return baseDecision;
      }

      if (attributes?.['regintel.trace.error_override'] === true) {
        return {
          decision: SamplingDecision.RECORD_AND_SAMPLED,
          attributes,
        };
      }

      return baseDecision;
    },
    toString() {
      return `ErrorOverrideSampler(${baseSampler.toString()})`;
    },
  };
};

type ObservabilityRuntimeConfig = {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  traceExporter?: ExporterEndpointOptions;
  metricsExporter?: ExporterEndpointOptions;
  sampling: TraceSamplingOptions;
  instrumentations: string[];
  startedAt?: string;
};

let runtimeConfig: ObservabilityRuntimeConfig | null = null;

export const initObservability = async (options: ObservabilityOptions) => {
  if (sdkInstance) {
    return sdkInstance;
  }

  const traceExporter = new OTLPTraceExporter({
    url: options.traceExporter?.url,
    headers: options.traceExporter?.headers,
  });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: options.metricsExporter?.url,
      headers: options.metricsExporter?.headers,
    }),
  });

  const instrumentations: Instrumentation[] = [];

  if (options.enableNextInstrumentation ?? true) {
    instrumentations.push(new NextInstrumentation());
  }

  instrumentations.push(new HttpInstrumentation(), new UndiciInstrumentation());

  if (options.enableFsInstrumentation) {
    instrumentations.push(new FsInstrumentation());
  }

  if (options.instrumentations) {
    instrumentations.push(...options.instrumentations);
  }

  sdkInstance = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]:
        options.serviceVersion ?? process.env.npm_package_version ?? '0.0.0',
      [ATTR_DEPLOYMENT_ENVIRONMENT]:
        options.environment ?? process.env.NODE_ENV ?? 'development',
    }),
    traceExporter,
    metricReader,
    instrumentations,
    sampler: buildSampler(options.traceSampling),
    contextManager: new AsyncLocalStorageContextManager().enable(),
  });

  await sdkInstance.start();
  runtimeConfig = {
    serviceName: options.serviceName,
    serviceVersion:
      options.serviceVersion ?? process.env.npm_package_version ?? '0.0.0',
    environment: options.environment ?? process.env.NODE_ENV ?? 'development',
    traceExporter: options.traceExporter,
    metricsExporter: options.metricsExporter,
    sampling: {
      parentBasedRatio: clampRatio(
        sanitizeRatio(options.traceSampling?.parentBasedRatio)
      ),
      alwaysSampleErrors: options.traceSampling?.alwaysSampleErrors ?? false,
    },
    instrumentations: instrumentations.map(
      (instrumentation) => instrumentation.instrumentationName
    ),
    startedAt: new Date().toISOString(),
  };
  return sdkInstance;
};

export const shutdownObservability = async () => {
  if (!sdkInstance) return;
  await sdkInstance.shutdown();
  sdkInstance = null;
  runtimeConfig = null;
};

export const getRuntimeObservabilityConfig = (): ObservabilityRuntimeConfig | null => {
  return runtimeConfig;
};

export const withSpan = async <T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T> | T
): Promise<T> => {
  const samplingOverride = runtimeConfig?.sampling.alwaysSampleErrors;
  const spanAttributes: Attributes =
    samplingOverride === undefined
      ? attributes
      : { ...attributes, 'regintel.trace.error_override': samplingOverride };

  return tracer.startActiveSpan(
    name,
    { attributes: spanAttributes },
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
