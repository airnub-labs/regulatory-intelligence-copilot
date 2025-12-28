import { Writable } from 'node:stream';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';
import { initLogsExporter, getLoggerProvider, shutdownLogsExporter } from './logsExporter.js';

describe('Logger OTEL Transport Integration', () => {
  afterEach(async () => {
    await shutdownLogsExporter();
  });

  it('uses single stream when LoggerProvider is not initialized', () => {
    const messages: Array<Record<string, unknown>> = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        messages.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    const logger = createLogger('test-scope', { destination });
    logger.info('test message');

    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe('test message');
    expect(getLoggerProvider()).toBeNull();
  });

  it('uses multistream with OTEL transport when LoggerProvider is initialized', async () => {
    const stdoutMessages: Array<Record<string, unknown>> = [];
    const otelMessages: Array<{ body: string; severityText: string }> = [];

    // Initialize OTEL logs exporter
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: 'test-service',
    });

    initLogsExporter({
      resource,
      useBatchProcessor: false, // Use simple processor for immediate delivery in tests
    });

    // Verify LoggerProvider is initialized
    expect(getLoggerProvider()).not.toBeNull();

    // Create a custom destination stream to capture stdout logs
    const stdoutDestination = new Writable({
      write(chunk, _encoding, callback) {
        stdoutMessages.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    // Create logger - it should now use multistream with both stdout and OTEL
    const logger = createLogger('test-scope', { destination: stdoutDestination });
    logger.info('test message with otel');

    // Verify log was written to stdout stream
    expect(stdoutMessages).toHaveLength(1);
    expect(stdoutMessages[0].message).toBe('test message with otel');

    // Note: OTEL transport writes are asynchronous and go to the LoggerProvider
    // In a real scenario, these would be exported to the OTEL Collector
    // For this test, we're just verifying the multistream is created
    await shutdownLogsExporter();
  });

  it('preserves correlation fields when using OTEL transport', async () => {
    const messages: Array<Record<string, unknown>> = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        messages.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    // Initialize OTEL logs exporter
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: 'test-service',
    });

    initLogsExporter({
      resource,
      useBatchProcessor: false,
    });

    const logger = createLogger('test-scope', {
      destination,
      component: 'test-component',
    });

    logger.info('test message');

    expect(messages).toHaveLength(1);
    expect(messages[0].component).toBe('test-component');
    expect(messages[0].scope).toBe('test-scope');

    await shutdownLogsExporter();
  });
});
