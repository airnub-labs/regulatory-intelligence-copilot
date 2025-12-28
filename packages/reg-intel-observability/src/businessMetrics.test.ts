import { metrics, type MeterProvider } from '@opentelemetry/api';
import { MeterProvider as SdkMeterProvider } from '@opentelemetry/sdk-metrics';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initBusinessMetrics,
  recordAgentSelection,
  recordGraphQuery,
  recordLlmTokenUsage,
  recordLlmRequest,
  recordEgressGuardScan,
  withMetricTiming,
} from './businessMetrics.js';

describe('Business Metrics', () => {
  let meterProvider: SdkMeterProvider;

  beforeEach(() => {
    // Create a test meter provider
    meterProvider = new SdkMeterProvider();
    metrics.setGlobalMeterProvider(meterProvider);

    // Initialize business metrics
    initBusinessMetrics();
  });

  afterEach(async () => {
    await meterProvider.shutdown();
    metrics.disable();
  });

  describe('initBusinessMetrics', () => {
    it('initializes all metric instruments without errors', () => {
      // Test that metrics can be initialized
      expect(() => initBusinessMetrics()).not.toThrow();
    });
  });

  describe('recordAgentSelection', () => {
    it('records agent selection with all attributes', () => {
      expect(() =>
        recordAgentSelection({
          agentType: 'domain_expert',
          agentName: 'GlobalRegulatoryComplianceAgent',
          domain: 'social_safety_net',
          jurisdiction: 'IE',
        })
      ).not.toThrow();
    });

    it('records agent selection with minimal attributes', () => {
      expect(() =>
        recordAgentSelection({
          agentType: 'general',
        })
      ).not.toThrow();
    });
  });

  describe('recordGraphQuery', () => {
    it('records successful graph query with duration', () => {
      expect(() =>
        recordGraphQuery(123.45, {
          operation: 'read',
          queryType: 'cypher',
          success: true,
          nodeCount: 5,
        })
      ).not.toThrow();
    });

    it('records failed graph query', () => {
      expect(() =>
        recordGraphQuery(50.0, {
          operation: 'write',
          success: false,
        })
      ).not.toThrow();
    });
  });

  describe('recordLlmTokenUsage', () => {
    it('records input token usage', () => {
      expect(() =>
        recordLlmTokenUsage({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          tokenType: 'input',
          tokens: 1024,
          cached: false,
        })
      ).not.toThrow();
    });

    it('records output token usage', () => {
      expect(() =>
        recordLlmTokenUsage({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          tokenType: 'output',
          tokens: 512,
        })
      ).not.toThrow();
    });

    it('records cached token usage', () => {
      expect(() =>
        recordLlmTokenUsage({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          tokenType: 'input',
          tokens: 2048,
          cached: true,
        })
      ).not.toThrow();
    });
  });

  describe('recordLlmRequest', () => {
    it('records successful LLM request', () => {
      expect(() =>
        recordLlmRequest(1500.5, {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          success: true,
          streaming: true,
        })
      ).not.toThrow();
    });

    it('records failed LLM request', () => {
      expect(() =>
        recordLlmRequest(250.0, {
          provider: 'openai',
          model: 'gpt-4',
          success: false,
          streaming: false,
        })
      ).not.toThrow();
    });
  });

  describe('recordEgressGuardScan', () => {
    it('records scan without blocking', () => {
      expect(() =>
        recordEgressGuardScan({
          scanType: 'llm_request',
          blocked: false,
          piiDetected: false,
        })
      ).not.toThrow();
    });

    it('records scan with blocking', () => {
      expect(() =>
        recordEgressGuardScan({
          scanType: 'llm_response',
          blocked: true,
          piiDetected: true,
          sensitiveDataTypes: ['email', 'phone'],
        })
      ).not.toThrow();
    });

    it('records scan with multiple sensitive data types', () => {
      expect(() =>
        recordEgressGuardScan({
          scanType: 'sandbox_output',
          blocked: true,
          piiDetected: true,
          sensitiveDataTypes: ['ssn', 'credit_card', 'passport'],
        })
      ).not.toThrow();
    });
  });

  describe('withMetricTiming', () => {
    it('times successful async operation', async () => {
      let recordedDuration = 0;
      let recordedSuccess = false;

      const result = await withMetricTiming(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success';
        },
        (duration, success) => {
          recordedDuration = duration;
          recordedSuccess = success;
        }
      );

      expect(result).toBe('success');
      expect(recordedDuration).toBeGreaterThanOrEqual(10);
      expect(recordedSuccess).toBe(true);
    });

    it('times failed async operation', async () => {
      let recordedDuration = 0;
      let recordedSuccess = true;

      await expect(
        withMetricTiming(
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            throw new Error('operation failed');
          },
          (duration, success) => {
            recordedDuration = duration;
            recordedSuccess = success;
          }
        )
      ).rejects.toThrow('operation failed');

      expect(recordedDuration).toBeGreaterThanOrEqual(10);
      expect(recordedSuccess).toBe(false);
    });
  });
});
