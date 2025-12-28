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
  recordBreadcrumbNavigate,
  recordBranchCreate,
  recordPathSwitch,
  recordMergeExecute,
  recordMergePreview,
  recordMessageScroll,
  recordMessageEdit,
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

  describe('UI/UX Metrics', () => {
    describe('recordBreadcrumbNavigate', () => {
      it('records breadcrumb navigation with all attributes', () => {
        expect(() =>
          recordBreadcrumbNavigate({
            fromPathId: 'path-1',
            toPathId: 'path-2',
            pathDepth: 3,
            conversationId: 'conv-123',
          })
        ).not.toThrow();
      });

      it('records breadcrumb navigation with minimal attributes', () => {
        expect(() =>
          recordBreadcrumbNavigate({
            fromPathId: 'path-1',
            toPathId: 'path-2',
            pathDepth: 2,
          })
        ).not.toThrow();
      });
    });

    describe('recordBranchCreate', () => {
      it('records branch creation via edit', () => {
        expect(() =>
          recordBranchCreate({
            method: 'edit',
            conversationId: 'conv-123',
            sourcePathId: 'path-1',
            fromMessageId: 'msg-456',
          })
        ).not.toThrow();
      });

      it('records branch creation via button', () => {
        expect(() =>
          recordBranchCreate({
            method: 'button',
            conversationId: 'conv-123',
            sourcePathId: 'path-1',
          })
        ).not.toThrow();
      });

      it('records branch creation via API', () => {
        expect(() =>
          recordBranchCreate({
            method: 'api',
          })
        ).not.toThrow();
      });
    });

    describe('recordPathSwitch', () => {
      it('records path switch via breadcrumb', () => {
        expect(() =>
          recordPathSwitch({
            fromPathId: 'path-1',
            toPathId: 'path-2',
            switchMethod: 'breadcrumb',
            conversationId: 'conv-123',
          })
        ).not.toThrow();
      });

      it('records path switch via selector', () => {
        expect(() =>
          recordPathSwitch({
            fromPathId: 'path-1',
            toPathId: 'path-3',
            switchMethod: 'selector',
          })
        ).not.toThrow();
      });
    });

    describe('recordMergeExecute', () => {
      it('records full merge', () => {
        expect(() =>
          recordMergeExecute({
            mergeMode: 'full',
            sourcePathId: 'path-2',
            targetPathId: 'path-1',
            messageCount: 5,
            conversationId: 'conv-123',
          })
        ).not.toThrow();
      });

      it('records summary merge', () => {
        expect(() =>
          recordMergeExecute({
            mergeMode: 'summary',
            sourcePathId: 'path-2',
            targetPathId: 'path-1',
          })
        ).not.toThrow();
      });

      it('records selective merge', () => {
        expect(() =>
          recordMergeExecute({
            mergeMode: 'selective',
            sourcePathId: 'path-2',
            targetPathId: 'path-1',
            messageCount: 3,
          })
        ).not.toThrow();
      });
    });

    describe('recordMergePreview', () => {
      it('records merge preview', () => {
        expect(() =>
          recordMergePreview({
            sourcePathId: 'path-2',
            targetPathId: 'path-1',
            conversationId: 'conv-123',
          })
        ).not.toThrow();
      });
    });

    describe('recordMessageScroll', () => {
      it('records scroll up', () => {
        expect(() =>
          recordMessageScroll({
            scrollDirection: 'up',
            messageCount: 10,
            conversationId: 'conv-123',
            pathId: 'path-1',
          })
        ).not.toThrow();
      });

      it('records scroll down', () => {
        expect(() =>
          recordMessageScroll({
            scrollDirection: 'down',
            messageCount: 5,
          })
        ).not.toThrow();
      });
    });

    describe('recordMessageEdit', () => {
      it('records content edit that creates branch', () => {
        expect(() =>
          recordMessageEdit({
            messageId: 'msg-123',
            editType: 'content',
            createsBranch: true,
            conversationId: 'conv-123',
            pathId: 'path-1',
          })
        ).not.toThrow();
      });

      it('records regenerate without branching', () => {
        expect(() =>
          recordMessageEdit({
            messageId: 'msg-456',
            editType: 'regenerate',
            createsBranch: false,
          })
        ).not.toThrow();
      });
    });
  });
});
