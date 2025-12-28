import { SeverityNumber, type logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { Resource } from '@opentelemetry/resources';
import type { Writable } from 'node:stream';

/**
 * Maps Pino log levels to OpenTelemetry severity numbers
 * See: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/logs/data-model.md#field-severitynumber
 */
const PINO_LEVEL_TO_OTEL_SEVERITY: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

export interface LogsExporterOptions {
  url?: string;
  headers?: Record<string, string>;
  resource: Resource;
  /**
   * Use batch processor (recommended for production) or simple processor (for development/testing)
   * Batch processor buffers logs and sends them in batches for better performance
   * Simple processor sends each log immediately
   */
  useBatchProcessor?: boolean;
}

let loggerProvider: LoggerProvider | null = null;

/**
 * Gets the current LoggerProvider instance if initialized
 * Returns null if initLogsExporter has not been called yet
 */
export const getLoggerProvider = (): LoggerProvider | null => {
  return loggerProvider;
};

/**
 * Initializes the OpenTelemetry logs exporter
 * This sets up the OTLP log exporter that sends logs to the OTEL collector
 */
export const initLogsExporter = (options: LogsExporterOptions): LoggerProvider => {
  if (loggerProvider) {
    return loggerProvider;
  }

  const exporter = new OTLPLogExporter({
    url: options.url,
    headers: options.headers,
  });

  loggerProvider = new LoggerProvider({
    resource: options.resource,
  });

  // Use batch processor for better performance in production
  // Use simple processor for immediate delivery in development
  const processor = options.useBatchProcessor
    ? new BatchLogRecordProcessor(exporter, {
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 1000,
      })
    : new SimpleLogRecordProcessor(exporter);

  loggerProvider.addLogRecordProcessor(processor);

  return loggerProvider;
};

/**
 * Creates a Pino transport stream that forwards logs to OpenTelemetry
 * This allows Pino logs to be sent to the OTEL collector alongside traces and metrics
 */
export const createPinoOtelTransport = (provider: LoggerProvider): Writable => {
  const logger = provider.getLogger('pino-logger', '1.0.0');

  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      try {
        const logRecord = JSON.parse(chunk.toString());

        // Extract standard Pino fields
        const {
          level,
          time,
          msg,
          message,
          trace_id,
          span_id,
          scope,
          component,
          ...attributes
        } = logRecord;

        // Determine severity from Pino level
        const severityText = this.getLevelName(level);
        const severityNumber = PINO_LEVEL_TO_OTEL_SEVERITY[severityText] ?? SeverityNumber.UNSPECIFIED;

        // Create OTEL log record
        logger.emit({
          severityNumber,
          severityText,
          body: msg || message || '',
          timestamp: time || Date.now(),
          attributes: {
            ...attributes,
            scope,
            component,
          },
          ...(trace_id && { traceId: trace_id }),
          ...(span_id && { spanId: span_id }),
        });

        callback();
      } catch (error) {
        // Don't fail on log parsing errors
        callback();
      }
    },

    // Helper to convert Pino numeric level to level name
    getLevelName(level: number): string {
      // Pino levels: trace=10, debug=20, info=30, warn=40, error=50, fatal=60
      if (level >= 60) return 'fatal';
      if (level >= 50) return 'error';
      if (level >= 40) return 'warn';
      if (level >= 30) return 'info';
      if (level >= 20) return 'debug';
      return 'trace';
    },
  });
};

/**
 * Shuts down the logs exporter and flushes pending logs
 */
export const shutdownLogsExporter = async (): Promise<void> => {
  if (!loggerProvider) return;

  try {
    await loggerProvider.shutdown();
  } catch (error) {
    console.error('Error shutting down logs exporter:', error);
  } finally {
    loggerProvider = null;
  }
};

/**
 * Forces a flush of pending logs
 * Useful during graceful shutdown to ensure all logs are exported
 */
export const forceFlushLogs = async (): Promise<void> => {
  if (!loggerProvider) return;

  try {
    await loggerProvider.forceFlush();
  } catch (error) {
    console.error('Error flushing logs:', error);
  }
};
