#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { dumpObservabilityDiagnostics } from './diagnostics.js';
import {
  createLogger,
  initObservability,
  requestContext,
  shutdownObservability,
} from './index.js';

const COMPONENT = 'reg-intel-observability-cli';

const parseSamplingRatio = (value?: string) => {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const initialiseObservability = async () => {
  await initObservability({
    serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/reg-intel-observability/cli',
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
      parentBasedRatio: parseSamplingRatio(process.env.OTEL_TRACES_SAMPLING_RATIO),
      alwaysSampleErrors: process.env.OTEL_TRACES_ALWAYS_SAMPLE_ERRORS !== 'false',
    },
  });
};

const run = async () => {
  await initialiseObservability();
  const logger = createLogger(COMPONENT, { component: COMPONENT });
  const baseContext = { requestId: randomUUID(), agentId: COMPONENT };

  return requestContext.run(baseContext, async () => {
    const command = process.argv[2];

    if (!command || command === 'diagnostics' || command === 'dump') {
      dumpObservabilityDiagnostics();
      logger.info({ command: command ?? 'diagnostics' }, 'Observability diagnostics dumped');
      return 0;
    }

    if (command === 'help' || command === '--help' || command === '-h') {
      console.log(`Usage: reg-intel-observability [diagnostics|dump]

Outputs the active OpenTelemetry configuration and exporter status.`);
      logger.info({ command }, 'Displayed observability CLI help');
      return 0;
    }

    logger.error({ command }, 'Unknown observability CLI command');
    return 1;
  });
};

const main = async () => {
  let observabilityStarted = false;

  try {
    const exitCode = await run();
    observabilityStarted = true;
    process.exitCode = exitCode;
  } catch (error) {
    console.error('Observability CLI failed to execute', error);
    process.exitCode = 1;
  } finally {
    if (observabilityStarted) {
      await shutdownObservability().catch((error) => {
        console.error('Failed to shut down observability CLI', error);
      });
    }
  }
};

void main();
