/**
 * Unit tests for core logger functionality
 *
 * Tests:
 * - Log level filtering
 * - Structured log output format
 * - Payload sanitization and hashing
 * - Correlation field injection (trace_id, span_id, tenantId, userId)
 * - Error serialization
 * - Logger lifecycle (creation, flushing)
 */

import { Writable } from 'node:stream';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, formatPayloadForLog, flushLoggers } from './logger.js';
import { requestContext } from './requestContext.js';
import { trace, context, ROOT_CONTEXT } from '@opentelemetry/api';

describe('Logger - Core Functionality', () => {
  let messages: Array<Record<string, unknown>> = [];
  let destination: Writable;

  beforeEach(() => {
    messages = [];
    destination = new Writable({
      write(chunk, _encoding, callback) {
        messages.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    // Clear request context
    requestContext.clear();

    // Clear any active spans
    context.setGlobalContextManager(context.setGlobalContextManager(undefined as any));
  });

  afterEach(async () => {
    await flushLoggers();
    vi.clearAllMocks();
  });

  describe('Logger Creation and Basic Logging', () => {
    it('should create logger with scope and component', () => {
      const logger = createLogger('test-scope', { destination, component: 'test-component' });
      logger.info('test message');

      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe('test message');
      expect(messages[0].scope).toBe('test-scope');
      expect(messages[0].component).toBe('test-component');
    });

    it('should use scope as component if component not provided', () => {
      const logger = createLogger('my-service', { destination });
      logger.info('test');

      expect(messages[0].scope).toBe('my-service');
      expect(messages[0].component).toBe('my-service');
    });

    it('should include timestamp in ISO format', () => {
      const logger = createLogger('test', { destination });
      logger.info('test');

      expect(messages[0].timestamp).toBeDefined();
      // Verify it's a valid ISO timestamp
      const timestamp = new Date(messages[0].timestamp as string);
      expect(timestamp.toISOString()).toBe(messages[0].timestamp);
    });

    it('should support child logger with additional bindings', () => {
      const parent = createLogger('parent', { destination });
      const child = parent.child({ requestId: 'req-123', extra: 'data' });

      child.info('child message');

      expect(messages[0].scope).toBe('parent');
      expect(messages[0].requestId).toBe('req-123');
      expect(messages[0].extra).toBe('data');
    });
  });

  describe('Log Level Filtering', () => {
    beforeEach(() => {
      // Reset LOG_LEVEL environment variable
      delete process.env.LOG_LEVEL;
    });

    it('should default to info level when LOG_LEVEL not set', () => {
      const logger = createLogger('test', { destination });

      logger.trace('trace message');
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // trace and debug should be filtered out
      expect(messages).toHaveLength(3);
      expect(messages.map(m => m.message)).toEqual([
        'info message',
        'warn message',
        'error message',
      ]);
    });

    it('should respect LOG_LEVEL=debug', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = createLogger('test', { destination });

      logger.trace('trace message');
      logger.debug('debug message');
      logger.info('info message');

      // trace filtered out, debug and info should appear
      expect(messages).toHaveLength(2);
      expect(messages.map(m => m.message)).toEqual([
        'debug message',
        'info message',
      ]);
    });

    it('should respect LOG_LEVEL=warn', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger('test', { destination });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Only warn and error should appear
      expect(messages).toHaveLength(2);
      expect(messages.map(m => m.message)).toEqual([
        'warn message',
        'error message',
      ]);
    });

    it('should respect LOG_LEVEL=error', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = createLogger('test', { destination });

      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Only error should appear
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe('error message');
    });

    it('should include level in log output', () => {
      const logger = createLogger('test', { destination });

      logger.info('info message');
      logger.error('error message');

      expect(messages[0].level).toBe('info');
      expect(messages[1].level).toBe('error');
    });
  });

  describe('Structured Logging Format', () => {
    it('should support object fields in log messages', () => {
      const logger = createLogger('test', { destination });

      logger.info({
        userId: 'user-123',
        action: 'login',
        ip: '192.168.1.100',
      }, 'User logged in');

      expect(messages[0].message).toBe('User logged in');
      expect(messages[0].userId).toBe('user-123');
      expect(messages[0].action).toBe('login');
      expect(messages[0].ip).toBe('192.168.1.100');
    });

    it('should support logging without message (object only)', () => {
      const logger = createLogger('test', { destination });

      logger.info({
        event: 'payment_processed',
        amount: 100.50,
        currency: 'EUR',
      });

      expect(messages[0].event).toBe('payment_processed');
      expect(messages[0].amount).toBe(100.50);
      expect(messages[0].currency).toBe('EUR');
    });

    it('should handle nested objects in fields', () => {
      const logger = createLogger('test', { destination });

      logger.info({
        user: {
          id: '123',
          name: 'John',
        },
        metadata: {
          source: 'web',
        },
      }, 'Complex data');

      expect(messages[0].user).toEqual({ id: '123', name: 'John' });
      expect(messages[0].metadata).toEqual({ source: 'web' });
    });

    it('should handle arrays in fields', () => {
      const logger = createLogger('test', { destination });

      logger.info({
        tags: ['urgent', 'customer-support'],
        ids: [1, 2, 3],
      }, 'Tagged message');

      expect(messages[0].tags).toEqual(['urgent', 'customer-support']);
      expect(messages[0].ids).toEqual([1, 2, 3]);
    });

    it('should handle Error objects', () => {
      const logger = createLogger('test', { destination });
      const error = new Error('Something went wrong');
      error.stack = 'Error: Something went wrong\n    at test.ts:123';

      logger.error({ err: error }, 'Error occurred');

      expect(messages[0].message).toBe('Error occurred');
      expect(messages[0].err).toBeDefined();
      expect((messages[0].err as any).message).toBe('Something went wrong');
      expect((messages[0].err as any).stack).toContain('at test.ts:123');
    });
  });

  describe('Payload Formatting and Sanitization', () => {
    it('should hash payloads and include preview when LOG_SAFE_PAYLOADS is true', () => {
      process.env.LOG_SAFE_PAYLOADS = 'true';
      const payload = { user: 'test@example.com', data: 'sample' };

      const result = formatPayloadForLog(payload);

      expect(result.payloadHash).toBeDefined();
      expect(result.payloadHash).toHaveLength(64); // SHA-256 produces 64 hex chars
      expect(result.payloadPreview).toBeDefined();
      // Email should be sanitized in preview
      expect(JSON.stringify(result.payloadPreview)).not.toContain('test@example.com');
    });

    it('should only include hash when LOG_SAFE_PAYLOADS is false', () => {
      delete process.env.LOG_SAFE_PAYLOADS;
      const payload = { sensitive: 'data' };

      const result = formatPayloadForLog(payload);

      expect(result.payloadHash).toBeDefined();
      expect(result.payloadPreview).toBeUndefined();
    });

    it('should handle undefined payload', () => {
      const result = formatPayloadForLog(undefined);

      expect(result.payloadHash).toBeDefined();
      expect(result.payloadPreview).toBeUndefined();
    });

    it('should handle null payload', () => {
      const result = formatPayloadForLog(null);

      expect(result.payloadHash).toBeDefined();
    });

    it('should handle string payloads', () => {
      process.env.LOG_SAFE_PAYLOADS = 'true';
      const result = formatPayloadForLog('test string');

      expect(result.payloadHash).toBeDefined();
      expect(result.payloadPreview).toBe('test string');
    });

    it('should sanitize PII in string payloads when LOG_SAFE_PAYLOADS is true', () => {
      process.env.LOG_SAFE_PAYLOADS = 'true';
      const result = formatPayloadForLog('Email: user@example.com');

      expect(result.payloadPreview).not.toContain('user@example.com');
    });

    it('should sanitize PII in object payloads when LOG_SAFE_PAYLOADS is true', () => {
      process.env.LOG_SAFE_PAYLOADS = 'true';
      const payload = {
        contact: 'admin@company.com',
        phone: '555-123-4567',
      };

      const result = formatPayloadForLog(payload);
      const previewStr = JSON.stringify(result.payloadPreview);

      expect(previewStr).not.toContain('admin@company.com');
      expect(previewStr).not.toContain('555-123-4567');
    });

    it('should generate consistent hash for same payload', () => {
      const payload = { data: 'test' };

      const result1 = formatPayloadForLog(payload);
      const result2 = formatPayloadForLog(payload);

      expect(result1.payloadHash).toBe(result2.payloadHash);
    });

    it('should generate different hash for different payloads', () => {
      const result1 = formatPayloadForLog({ data: 'test1' });
      const result2 = formatPayloadForLog({ data: 'test2' });

      expect(result1.payloadHash).not.toBe(result2.payloadHash);
    });

    it('should handle unserializable payloads gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular; // Create circular reference

      const result = formatPayloadForLog(circular);

      expect(result.payloadHash).toBeDefined();
      // Should handle circular reference without throwing
    });
  });

  describe('Correlation Fields Injection', () => {
    it('should inject tenantId and userId from request context', () => {
      const logger = createLogger('test', { destination });

      requestContext.run({ tenantId: 'tenant-123', userId: 'user-456' }, () => {
        logger.info('test message');
      });

      expect(messages[0].tenantId).toBe('tenant-123');
      expect(messages[0].userId).toBe('user-456');
    });

    it('should inject only tenantId if userId not set', () => {
      const logger = createLogger('test', { destination });

      requestContext.run({ tenantId: 'tenant-abc' }, () => {
        logger.info('test message');
      });

      expect(messages[0].tenantId).toBe('tenant-abc');
      expect(messages[0].userId).toBeUndefined();
    });

    it('should not include correlation fields when request context is empty', () => {
      const logger = createLogger('test', { destination });
      logger.info('test message');

      expect(messages[0].tenantId).toBeUndefined();
      expect(messages[0].userId).toBeUndefined();
      expect(messages[0].trace_id).toBeUndefined();
      expect(messages[0].span_id).toBeUndefined();
    });

    it('should preserve multiple context values', () => {
      const logger = createLogger('test', { destination });

      requestContext.run({
        tenantId: 'tenant-1',
        userId: 'user-1',
        requestId: 'req-1',
        custom: 'value',
      }, () => {
        logger.info('test');
      });

      expect(messages[0].tenantId).toBe('tenant-1');
      expect(messages[0].userId).toBe('user-1');
      expect(messages[0].requestId).toBe('req-1');
      expect(messages[0].custom).toBe('value');
    });

    it('should filter out undefined values from context', () => {
      const logger = createLogger('test', { destination });

      requestContext.run({
        tenantId: 'tenant-1',
        userId: undefined,
        defined: 'value',
      }, () => {
        logger.info('test');
      });

      expect(messages[0].tenantId).toBe('tenant-1');
      expect(messages[0].userId).toBeUndefined();
      expect(messages[0].defined).toBe('value');
    });
  });

  describe('Logger Flush and Lifecycle', () => {
    it('should flush all logger instances', async () => {
      const logger1 = createLogger('logger1', { destination });
      const logger2 = createLogger('logger2', { destination });

      logger1.info('message 1');
      logger2.info('message 2');

      await flushLoggers();

      expect(messages).toHaveLength(2);
    });

    it('should not fail when flushing with no pending logs', async () => {
      createLogger('test', { destination });
      await expect(flushLoggers()).resolves.not.toThrow();
    });

    it('should handle flush errors gracefully', async () => {
      const errorDestination = new Writable({
        write(_chunk, _encoding, callback) {
          callback(new Error('Write failed'));
        },
      });

      const logger = createLogger('test', { destination: errorDestination });
      logger.info('test');

      // Should not throw even if flush fails
      await expect(flushLoggers()).resolves.not.toThrow();
    });
  });

  describe('Static Bindings', () => {
    it('should include static bindings in all log messages', () => {
      const logger = createLogger('test', {
        destination,
        component: 'my-component',
        version: '1.0.0',
        environment: 'test',
      });

      logger.info('message 1');
      logger.info('message 2');

      expect(messages).toHaveLength(2);
      expect(messages[0].component).toBe('my-component');
      expect(messages[0].version).toBe('1.0.0');
      expect(messages[0].environment).toBe('test');
      expect(messages[1].component).toBe('my-component');
      expect(messages[1].version).toBe('1.0.0');
      expect(messages[1].environment).toBe('test');
    });

    it('should not include destination in bindings', () => {
      const logger = createLogger('test', { destination, component: 'test' });
      logger.info('test');

      expect(messages[0].destination).toBeUndefined();
    });
  });

  describe('Message Key Configuration', () => {
    it('should use "message" as the message key', () => {
      const logger = createLogger('test', { destination });
      logger.info('test message');

      expect(messages[0].message).toBe('test message');
      expect(messages[0].msg).toBeUndefined(); // Pino default is 'msg'
    });
  });
});
