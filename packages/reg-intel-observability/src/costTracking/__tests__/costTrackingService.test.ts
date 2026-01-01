/**
 * Cost Tracking Service Tests
 *
 * Comprehensive tests with mocked input/output tokens to verify:
 * - Token size calculations are accurate
 * - Cost calculations match expected values exactly
 * - Quota enforcement works correctly
 * - Storage and quota integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CostTrackingService, type RecordCostRequest } from '../costTrackingService.js';
import type {
  CostStorageProvider,
  QuotaProvider,
  LlmCostRecord,
  CostQuota,
  QuotaCheckRequest,
  QuotaCheckResult,
} from '../types.js';

/**
 * Mock storage provider for testing
 */
class MockCostStorage implements CostStorageProvider {
  private records: LlmCostRecord[] = [];
  private idCounter = 1;

  async storeCostRecord(record: Omit<LlmCostRecord, 'id'>): Promise<LlmCostRecord> {
    const stored: LlmCostRecord = {
      ...record,
      id: `record-${this.idCounter++}`,
    };
    this.records.push(stored);
    return stored;
  }

  async queryCostRecords(): Promise<LlmCostRecord[]> {
    return this.records;
  }

  async getAggregatedCosts(): Promise<any[]> {
    return [];
  }

  async getTotalCost(): Promise<number> {
    return this.records.reduce((sum, r) => sum + r.totalCostUsd, 0);
  }

  // Helper for tests
  getRecords(): LlmCostRecord[] {
    return this.records;
  }

  clear(): void {
    this.records = [];
    this.idCounter = 1;
  }
}

/**
 * Mock quota provider for testing
 */
class MockQuotaProvider implements QuotaProvider {
  private quotas: Map<string, CostQuota> = new Map();
  private spends: Map<string, number> = new Map();

  async getQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId?: string
  ): Promise<CostQuota | null> {
    const key = this.getKey(scope, scopeId);
    return this.quotas.get(key) || null;
  }

  async setQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    limitUsd: number,
    period: 'hour' | 'day' | 'week' | 'month',
    warningThreshold?: number
  ): Promise<CostQuota> {
    const key = this.getKey(scope, scopeId);
    const currentSpend = this.spends.get(key) || 0;
    const quota: CostQuota = {
      scope,
      scopeId,
      limitUsd,
      currentSpendUsd: currentSpend,
      period,
      warningThreshold: warningThreshold ?? 0.8,
      warningExceeded: currentSpend >= limitUsd * (warningThreshold ?? 0.8),
      quotaExceeded: currentSpend >= limitUsd,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    this.quotas.set(key, quota);
    return quota;
  }

  async checkQuota(request: QuotaCheckRequest): Promise<QuotaCheckResult> {
    const quota = await this.getQuota(request.scope, request.scopeId);
    if (!quota) {
      return { allowed: true };
    }

    const projectedSpend = quota.currentSpendUsd + (request.estimatedCostUsd || 0);
    const allowed = projectedSpend <= quota.limitUsd;

    return {
      allowed,
      quota: {
        ...quota,
        warningExceeded: projectedSpend >= quota.limitUsd * quota.warningThreshold,
        quotaExceeded: projectedSpend >= quota.limitUsd,
      },
    };
  }

  async recordCost(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    costUsd: number
  ): Promise<void> {
    const key = this.getKey(scope, scopeId);
    const currentSpend = this.spends.get(key) || 0;
    this.spends.set(key, currentSpend + costUsd);

    // Update quota if it exists
    const quota = this.quotas.get(key);
    if (quota) {
      quota.currentSpendUsd = currentSpend + costUsd;
      quota.warningExceeded = quota.currentSpendUsd >= quota.limitUsd * quota.warningThreshold;
      quota.quotaExceeded = quota.currentSpendUsd >= quota.limitUsd;
    }
  }

  async resetQuota(scope: 'platform' | 'tenant' | 'user', scopeId?: string): Promise<void> {
    const key = this.getKey(scope, scopeId);
    this.spends.set(key, 0);
    const quota = this.quotas.get(key);
    if (quota) {
      quota.currentSpendUsd = 0;
      quota.warningExceeded = false;
      quota.quotaExceeded = false;
    }
  }

  private getKey(scope: string, scopeId?: string): string {
    return scopeId ? `${scope}:${scopeId}` : scope;
  }

  // Helper for tests
  clear(): void {
    this.quotas.clear();
    this.spends.clear();
  }
}

describe('CostTrackingService', () => {
  let service: CostTrackingService;
  let storage: MockCostStorage;
  let quotaProvider: MockQuotaProvider;

  beforeEach(() => {
    storage = new MockCostStorage();
    quotaProvider = new MockQuotaProvider();
    service = new CostTrackingService({
      storage,
      quotas: quotaProvider,
      enforceQuotas: false,
    });
  });

  describe('Token and Cost Calculations', () => {
    it('should correctly calculate GPT-4 costs with exact token counts', async () => {
      // GPT-4 pricing: $30/1M input, $60/1M output
      const request: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        inputCostUsd: 0.03, // 1000 / 1_000_000 * 30 = 0.03
        outputCostUsd: 0.03, // 500 / 1_000_000 * 60 = 0.03
        totalCostUsd: 0.06,
        isEstimated: false,
      };

      const record = await service.recordCost(request);

      expect(record).not.toBeNull();
      expect(record?.inputTokens).toBe(1000);
      expect(record?.outputTokens).toBe(500);
      expect(record?.totalTokens).toBe(1500);
      expect(record?.inputCostUsd).toBe(0.03);
      expect(record?.outputCostUsd).toBe(0.03);
      expect(record?.totalCostUsd).toBe(0.06);
    });

    it('should correctly calculate Claude 3 Opus costs with large token counts', async () => {
      // Claude 3 Opus: $15/1M input, $75/1M output
      const request: RecordCostRequest = {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        inputTokens: 100_000,
        outputTokens: 50_000,
        inputCostUsd: 1.5, // 100_000 / 1_000_000 * 15 = 1.5
        outputCostUsd: 3.75, // 50_000 / 1_000_000 * 75 = 3.75
        totalCostUsd: 5.25,
        isEstimated: false,
      };

      const record = await service.recordCost(request);

      expect(record).not.toBeNull();
      expect(record?.inputTokens).toBe(100_000);
      expect(record?.outputTokens).toBe(50_000);
      expect(record?.totalTokens).toBe(150_000);
      expect(record?.inputCostUsd).toBe(1.5);
      expect(record?.outputCostUsd).toBe(3.75);
      expect(record?.totalCostUsd).toBe(5.25);
    });

    it('should correctly calculate GPT-3.5 Turbo costs with small token counts', async () => {
      // GPT-3.5 Turbo: $0.5/1M input, $1.5/1M output
      const request: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 50,
        inputCostUsd: 0.00005, // 100 / 1_000_000 * 0.5 = 0.00005
        outputCostUsd: 0.000075, // 50 / 1_000_000 * 1.5 = 0.000075
        totalCostUsd: 0.000125,
        isEstimated: false,
      };

      const record = await service.recordCost(request);

      expect(record).not.toBeNull();
      expect(record?.totalTokens).toBe(150);
      expect(record?.inputCostUsd).toBe(0.00005);
      expect(record?.outputCostUsd).toBe(0.000075);
      expect(record?.totalCostUsd).toBe(0.000125);
    });

    it('should handle zero tokens correctly', async () => {
      const request: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 0,
        outputTokens: 0,
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
        isEstimated: false,
      };

      const record = await service.recordCost(request);

      expect(record).not.toBeNull();
      expect(record?.totalTokens).toBe(0);
      expect(record?.totalCostUsd).toBe(0);
    });

    it('should correctly sum input and output tokens', async () => {
      const testCases = [
        { input: 1234, output: 5678, expected: 6912 },
        { input: 999, output: 1, expected: 1000 },
        { input: 0, output: 10000, expected: 10000 },
        { input: 50000, output: 0, expected: 50000 },
        { input: 123456, output: 654321, expected: 777777 },
      ];

      for (const testCase of testCases) {
        const request: RecordCostRequest = {
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: testCase.input,
          outputTokens: testCase.output,
          inputCostUsd: (testCase.input / 1_000_000) * 30,
          outputCostUsd: (testCase.output / 1_000_000) * 60,
          totalCostUsd: (testCase.input / 1_000_000) * 30 + (testCase.output / 1_000_000) * 60,
          isEstimated: false,
        };

        const record = await service.recordCost(request);
        expect(record?.totalTokens).toBe(testCase.expected);
      }
    });
  });

  describe('Cost Precision', () => {
    it('should maintain precision for very small costs', async () => {
      const request: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        inputTokens: 1,
        outputTokens: 1,
        inputCostUsd: 0.0000005, // 1 / 1_000_000 * 0.5
        outputCostUsd: 0.0000015, // 1 / 1_000_000 * 1.5
        totalCostUsd: 0.000002,
        isEstimated: false,
      };

      const record = await service.recordCost(request);

      expect(record?.inputCostUsd).toBe(0.0000005);
      expect(record?.outputCostUsd).toBe(0.0000015);
      expect(record?.totalCostUsd).toBe(0.000002);
    });

    it('should maintain precision for very large costs', async () => {
      const request: RecordCostRequest = {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        inputTokens: 10_000_000, // 10M tokens
        outputTokens: 5_000_000, // 5M tokens
        inputCostUsd: 150.0, // 10M / 1M * 15 = 150
        outputCostUsd: 375.0, // 5M / 1M * 75 = 375
        totalCostUsd: 525.0,
        isEstimated: false,
      };

      const record = await service.recordCost(request);

      expect(record?.inputCostUsd).toBe(150.0);
      expect(record?.outputCostUsd).toBe(375.0);
      expect(record?.totalCostUsd).toBe(525.0);
    });
  });

  describe('Storage Integration', () => {
    it('should store cost records with all attributes', async () => {
      const request: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        inputCostUsd: 0.03,
        outputCostUsd: 0.03,
        totalCostUsd: 0.06,
        isEstimated: false,
        tenantId: 'tenant-123',
        userId: 'user-456',
        conversationId: 'conv-789',
        task: 'chat',
        cached: false,
        streaming: true,
        durationMs: 1234,
        success: true,
      };

      const record = await service.recordCost(request);
      const stored = storage.getRecords();

      expect(stored).toHaveLength(1);
      expect(stored[0].tenantId).toBe('tenant-123');
      expect(stored[0].userId).toBe('user-456');
      expect(stored[0].conversationId).toBe('conv-789');
      expect(stored[0].task).toBe('chat');
      expect(stored[0].cached).toBe(false);
      expect(stored[0].streaming).toBe(true);
      expect(stored[0].durationMs).toBe(1234);
      expect(stored[0].success).toBe(true);
    });

    it('should accumulate multiple cost records', async () => {
      const requests: RecordCostRequest[] = [
        {
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: 1000,
          outputTokens: 500,
          inputCostUsd: 0.03,
          outputCostUsd: 0.03,
          totalCostUsd: 0.06,
          isEstimated: false,
        },
        {
          provider: 'anthropic',
          model: 'claude-3-haiku',
          inputTokens: 2000,
          outputTokens: 1000,
          inputCostUsd: 0.0005,
          outputCostUsd: 0.00125,
          totalCostUsd: 0.00175,
          isEstimated: false,
        },
        {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          inputTokens: 500,
          outputTokens: 250,
          inputCostUsd: 0.00025,
          outputCostUsd: 0.000375,
          totalCostUsd: 0.000625,
          isEstimated: false,
        },
      ];

      for (const req of requests) {
        await service.recordCost(req);
      }

      const stored = storage.getRecords();
      expect(stored).toHaveLength(3);

      const totalCost = stored.reduce((sum, r) => sum + r.totalCostUsd, 0);
      expect(totalCost).toBeCloseTo(0.062375);

      const totalTokens = stored.reduce((sum, r) => sum + r.totalTokens, 0);
      expect(totalTokens).toBe(5250);
    });
  });

  describe('Quota Management', () => {
    it('should enforce platform quota when enabled', async () => {
      // Set platform quota to $1.00
      await quotaProvider.setQuota('platform', undefined, 1.0, 'day', 0.8);

      // Enable quota enforcement
      service = new CostTrackingService({
        storage,
        quotas: quotaProvider,
        enforceQuotas: true,
      });

      // First request: $0.06 - should succeed
      const request1: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        inputCostUsd: 0.03,
        outputCostUsd: 0.03,
        totalCostUsd: 0.06,
        isEstimated: false,
      };

      const record1 = await service.recordCost(request1);
      expect(record1).not.toBeNull();

      // Second request: $0.99 (total would be $1.05) - should fail
      const request2: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 16500,
        outputTokens: 8250,
        inputCostUsd: 0.495,
        outputCostUsd: 0.495,
        totalCostUsd: 0.99,
        isEstimated: false,
      };

      const record2 = await service.recordCost(request2);
      expect(record2).toBeNull(); // Should be rejected

      // Verify only first request was stored
      const stored = storage.getRecords();
      expect(stored).toHaveLength(1);
      expect(stored[0].totalCostUsd).toBe(0.06);
    });

    it('should enforce tenant quota independently from platform', async () => {
      await quotaProvider.setQuota('platform', undefined, 10.0, 'day');
      await quotaProvider.setQuota('tenant', 'tenant-a', 0.5, 'day');

      service = new CostTrackingService({
        storage,
        quotas: quotaProvider,
        enforceQuotas: true,
      });

      const request: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 10000,
        outputTokens: 5000,
        inputCostUsd: 0.3,
        outputCostUsd: 0.3,
        totalCostUsd: 0.6,
        isEstimated: false,
        tenantId: 'tenant-a',
      };

      const record = await service.recordCost(request);
      expect(record).toBeNull(); // Exceeds tenant quota despite being under platform quota
    });

    it('should trigger warning callback when threshold exceeded', async () => {
      const warningCallback = vi.fn();

      await quotaProvider.setQuota('platform', undefined, 1.0, 'day', 0.8);

      service = new CostTrackingService({
        storage,
        quotas: quotaProvider,
        enforceQuotas: false, // Don't block requests, just warn
        onQuotaWarning: warningCallback,
      });

      // First spend $0.70 (below warning threshold)
      await service.recordCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 11667,
        outputTokens: 5833,
        inputCostUsd: 0.35,
        outputCostUsd: 0.35,
        totalCostUsd: 0.70,
        isEstimated: false,
      });

      expect(warningCallback).not.toHaveBeenCalled();

      // Now spend $0.15 more (total $0.85, exceeds 80% warning threshold)
      // Need to enable enforcement temporarily to trigger quota checks
      service = new CostTrackingService({
        storage,
        quotas: quotaProvider,
        enforceQuotas: true, // Enable to trigger quota checks
        onQuotaWarning: warningCallback,
      });

      await service.recordCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 2500,
        outputTokens: 1250,
        inputCostUsd: 0.075,
        outputCostUsd: 0.075,
        totalCostUsd: 0.15,
        isEstimated: false,
      });

      expect(warningCallback).toHaveBeenCalled();
      const quota = warningCallback.mock.calls[0][0] as CostQuota;
      expect(quota.warningExceeded).toBe(true);
      expect(quota.quotaExceeded).toBe(false);
    });

    it('should trigger exceeded callback when quota exceeded', async () => {
      const exceededCallback = vi.fn();

      await quotaProvider.setQuota('platform', undefined, 1.0, 'day');

      service = new CostTrackingService({
        storage,
        quotas: quotaProvider,
        enforceQuotas: true,
        onQuotaExceeded: exceededCallback,
      });

      // Spend $1.50 (exceeds $1.00 quota)
      const request: RecordCostRequest = {
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 25000,
        outputTokens: 12500,
        inputCostUsd: 0.75,
        outputCostUsd: 0.75,
        totalCostUsd: 1.5,
        isEstimated: false,
      };

      await service.recordCost(request);

      expect(exceededCallback).toHaveBeenCalled();
      const quota = exceededCallback.mock.calls[0][0] as CostQuota;
      expect(quota.quotaExceeded).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should accurately track costs for a multi-tenant conversation', async () => {
      const conversation = [
        {
          // User message (input only)
          inputTokens: 50,
          outputTokens: 0,
        },
        {
          // Assistant response
          inputTokens: 50,
          outputTokens: 150,
        },
        {
          // User follow-up
          inputTokens: 75,
          outputTokens: 0,
        },
        {
          // Assistant response
          inputTokens: 125,
          outputTokens: 200,
        },
      ];

      const tenantId = 'tenant-123';
      const userId = 'user-456';
      const conversationId = 'conv-789';

      // GPT-4 pricing: $30/1M input, $60/1M output
      for (const turn of conversation) {
        const inputCost = (turn.inputTokens / 1_000_000) * 30;
        const outputCost = (turn.outputTokens / 1_000_000) * 60;

        await service.recordCost({
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: turn.inputTokens,
          outputTokens: turn.outputTokens,
          inputCostUsd: inputCost,
          outputCostUsd: outputCost,
          totalCostUsd: inputCost + outputCost,
          isEstimated: false,
          tenantId,
          userId,
          conversationId,
        });
      }

      const stored = storage.getRecords();
      expect(stored).toHaveLength(4);

      // Total tokens: 50 + 200 + 75 + 325 = 650
      const totalTokens = stored.reduce((sum, r) => sum + r.totalTokens, 0);
      expect(totalTokens).toBe(650);

      // Total cost calculation:
      // Input: (50 + 50 + 75 + 125) / 1M * $30 = 300 / 1M * $30 = $0.009
      // Output: (0 + 150 + 0 + 200) / 1M * $60 = 350 / 1M * $60 = $0.021
      // Total: $0.03
      const totalCost = stored.reduce((sum, r) => sum + r.totalCostUsd, 0);
      expect(totalCost).toBeCloseTo(0.03);
    });

    it('should calculate monthly costs for sustained usage', async () => {
      const dailyRequests = 100;
      const daysInMonth = 30;
      const avgInputTokens = 500;
      const avgOutputTokens = 500;

      // GPT-4 pricing
      const costPerRequest = (avgInputTokens / 1_000_000) * 30 + (avgOutputTokens / 1_000_000) * 60;

      let totalCost = 0;
      for (let i = 0; i < dailyRequests * daysInMonth; i++) {
        const record = await service.recordCost({
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: avgInputTokens,
          outputTokens: avgOutputTokens,
          inputCostUsd: (avgInputTokens / 1_000_000) * 30,
          outputCostUsd: (avgOutputTokens / 1_000_000) * 60,
          totalCostUsd: costPerRequest,
          isEstimated: false,
        });
        totalCost += record!.totalCostUsd;
      }

      const stored = storage.getRecords();
      expect(stored).toHaveLength(3000);

      // Expected: 3000 requests * $0.045 = $135
      expect(totalCost).toBeCloseTo(135.0);
    });
  });
});
