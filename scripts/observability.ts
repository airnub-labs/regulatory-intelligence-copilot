import { randomUUID } from 'node:crypto';
import {
  createLogger,
  initObservability,
  requestContext,
  shutdownObservability,
  withSpan,
  type RequestContextValues,
} from '@reg-copilot/reg-intel-observability';

const parseSamplingRatio = (value?: string) => {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

let shutdownRegistered = false;

const registerShutdownHooks = () => {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  const gracefulShutdown = async (signal?: NodeJS.Signals) => {
    try {
      await shutdownObservability();
    } catch (error) {
      console.error('Failed to shutdown observability', error);
    }

    if (signal) {
      process.exitCode = process.exitCode ?? 0;
    }
  };

  process.once('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });

  process.once('beforeExit', () => {
    void gracefulShutdown();
  });
};

const redirectConsoleToLogger = (logger: ReturnType<typeof createLogger>) => {
  const serializeArgs = (args: unknown[]) =>
    args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return '[unserializable]';
        }
      })
      .join(' ');

  console.log = (...args: unknown[]) => {
    logger.info({ console: args }, serializeArgs(args));
  };

  console.info = (...args: unknown[]) => {
    logger.info({ console: args }, serializeArgs(args));
  };

  console.warn = (...args: unknown[]) => {
    logger.warn({ console: args }, serializeArgs(args));
  };

  console.error = (...args: unknown[]) => {
    logger.error({ console: args }, serializeArgs(args));
  };
};

export interface ScriptObservability {
  logger: ReturnType<typeof createLogger>;
  withSpan: typeof withSpan;
  runWithContext<T>(values: RequestContextValues, fn: () => Promise<T> | T): Promise<T> | T;
  shutdown(): Promise<void>;
}

export const bootstrapObservability = async (
  component: string,
  context?: RequestContextValues
): Promise<ScriptObservability> => {
  await initObservability({
    serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/scripts',
    serviceVersion: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    enableNextInstrumentation: false,
    traceExporter: {
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    metricsExporter: {
      url:
        process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    logsExporter: {
      enabled: process.env.OTEL_LOGS_ENABLED === 'true',
      url:
        process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ??
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      useBatchProcessor: process.env.NODE_ENV === 'production',
    },
    traceSampling: {
      parentBasedRatio: parseSamplingRatio(process.env.OTEL_TRACES_SAMPLING_RATIO),
      alwaysSampleErrors: process.env.OTEL_TRACES_ALWAYS_SAMPLE_ERRORS !== 'false',
    },
  });

  const logger = createLogger(component, { component });
  redirectConsoleToLogger(logger);
  registerShutdownHooks();

  if (context) {
    requestContext.set(context);
  }

  return {
    logger,
    withSpan,
    runWithContext: (values, fn) => requestContext.run(values, fn),
    shutdown: () => shutdownObservability(),
  };
};

export const runWithScriptObservability = async (
  component: string,
  execute: (obs: ScriptObservability) => Promise<void>,
  context?: RequestContextValues
) => {
  const baseContext: RequestContextValues = {
    requestId: randomUUID(),
    agentId: component,
    ...context,
  };

  const observability = await bootstrapObservability(component, baseContext);

  try {
    await observability.runWithContext(baseContext, () => execute(observability));
  } catch (error) {
    observability.logger.error({ error }, 'Script execution failed');
    process.exitCode = 1;
  } finally {
    await observability.shutdown();
  }
};
