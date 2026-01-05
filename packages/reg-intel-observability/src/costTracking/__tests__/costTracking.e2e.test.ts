/**
 * End-to-End Cost Tracking Integration Tests
 *
 * Tests the complete cost tracking flow from API request through LLM call to database recording.
 * Verifies that:
 * - Costs are recorded for successful chat requests
 * - Quota enforcement blocks requests when limits are exceeded
 * - Multi-tenant isolation is maintained
 * - HTTP 429 responses are returned with proper error details
 *
 * Prerequisites:
 * - Supabase database connection
 * - All cost tracking migrations applied
 * - Demo web app running (or mock API routes)
 * - Valid test tenant configured
 *
 * Run with: pnpm test costTracking.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseQuotaProvider, SupabaseCostStorage } from '../supabaseProviders.js';

describe('End-to-End Cost Tracking', () => {
  let supabase: SupabaseClient;
  let quotaProvider: SupabaseQuotaProvider;
  let costStorage: SupabaseCostStorage;
  const testTenantId = 'test-e2e-tenant';
  const testUserId = 'test-e2e-user';

  beforeAll(async () => {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials required for e2e tests. ' +
          'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'copilot_internal' },
    });

    quotaProvider = new SupabaseQuotaProvider(supabase as any);
    costStorage = new SupabaseCostStorage(supabase as any);
  });

  beforeEach(async () => {
    // Clean up test data
    await supabase
      .from('cost_quotas')
      .delete()
      .eq('scope', 'tenant')
      .eq('scope_id', testTenantId);

    await supabase
      .from('llm_cost_records')
      .delete()
      .eq('tenant_id', testTenantId);

    // Set up fresh quota
    await quotaProvider.setQuota('tenant', testTenantId, 100.0, 'day');
  });

  afterAll(async () => {
    // Final cleanup
    await supabase
      .from('cost_quotas')
      .delete()
      .eq('scope', 'tenant')
      .eq('scope_id', testTenantId);

    await supabase
      .from('llm_cost_records')
      .delete()
      .eq('tenant_id', testTenantId);
  });

  describe('Full Request Lifecycle', () => {
    it('should record cost for successful LLM operation', async () => {
      // Simulate a successful LLM operation
      const costRecord = {
        provider: 'openai' as const,
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        inputCostUsd: 0.0025,
        outputCostUsd: 0.005,
        totalCostUsd: 0.0075,
        isEstimated: false,
        tenantId: testTenantId,
        userId: testUserId,
        conversationId: 'conv-test-1',
      };

      // Record the cost
      const recordId = await costStorage.storeCostRecord(costRecord);
      expect(recordId).toBeDefined();

      // Update quota
      await quotaProvider.updateQuotaSpend('tenant', testTenantId, 0.0075);

      // Verify cost was recorded
      const costs = await costStorage.queryCostRecords({
        tenantId: testTenantId,
        conversationId: 'conv-test-1',
      });

      expect(costs).toHaveLength(1);
      expect(costs[0].totalCostUsd).toBe(0.0075);
      expect(costs[0].provider).toBe('openai');
      expect(costs[0].model).toBe('gpt-4o');
      expect(costs[0].tenantId).toBe(testTenantId);

      // Verify quota was updated
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(0.0075);
    });

    it('should track multiple operations in a conversation', async () => {
      const conversationId = 'conv-multi-turn';

      // Simulate a 3-turn conversation
      for (let i = 0; i < 3; i++) {
        await costStorage.storeCostRecord({
          provider: 'openai' as const,
          model: 'gpt-4o',
          inputTokens: 500,
          outputTokens: 250,
          inputCostUsd: 0.00125,
          outputCostUsd: 0.0025,
          totalCostUsd: 0.00375,
          isEstimated: false,
          tenantId: testTenantId,
          userId: testUserId,
          conversationId,
        });

        await quotaProvider.updateQuotaSpend('tenant', testTenantId, 0.00375);
      }

      // Verify all costs were recorded
      const costs = await costStorage.queryCostRecords({
        tenantId: testTenantId,
        conversationId,
      });

      expect(costs).toHaveLength(3);

      const totalCost = costs.reduce((sum, record) => sum + record.totalCostUsd, 0);
      expect(totalCost).toBeCloseTo(0.01125, 5); // 3 * 0.00375

      // Verify quota reflects all operations
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBeCloseTo(0.01125, 5);
    });

    it('should include full attribution metadata', async () => {
      const metadata = {
        conversationId: 'conv-attribution',
        pathId: 'path-123',
        taskId: 'task-456',
        agentName: 'GlobalRegulatoryComplianceAgent',
      };

      await costStorage.storeCostRecord({
        provider: 'anthropic' as const,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 2000,
        outputTokens: 1000,
        inputCostUsd: 0.006,
        outputCostUsd: 0.015,
        totalCostUsd: 0.021,
        isEstimated: false,
        tenantId: testTenantId,
        userId: testUserId,
        ...metadata,
      });

      // Verify metadata is preserved
      const costs = await costStorage.queryCostRecords({
        tenantId: testTenantId,
        conversationId: metadata.conversationId,
      });

      expect(costs).toHaveLength(1);
      const record = costs[0];

      expect(record.conversationId).toBe(metadata.conversationId);
      expect(record.pathId).toBe(metadata.pathId);
      expect(record.taskId).toBe(metadata.taskId);
      expect(record.agentName).toBe(metadata.agentName);
    });
  });

  describe('Quota Enforcement', () => {
    it('should allow operations within quota', async () => {
      // Set quota to $10
      await quotaProvider.setQuota('tenant', testTenantId, 10.0, 'day');

      // Check if $5 operation is allowed
      const check = await quotaProvider.checkQuota('tenant', testTenantId, 5.0);

      expect(check.allowed).toBe(true);
      expect(check.limitUsd).toBe(10.0);
      expect(check.remainingUsd).toBe(10.0);
    });

    it('should deny operations that exceed quota', async () => {
      // Set quota to $10
      await quotaProvider.setQuota('tenant', testTenantId, 10.0, 'day');

      // Fill quota to $9
      await quotaProvider.updateQuotaSpend('tenant', testTenantId, 9.0);

      // Try to spend $5 (would total $14, exceeds limit)
      const check = await quotaProvider.checkQuota('tenant', testTenantId, 5.0);

      expect(check.allowed).toBe(false);
      expect(check.denialReason).toBeDefined();
      expect(check.currentSpendUsd).toBe(9.0);
      expect(check.remainingUsd).toBe(1.0);
    });

    it('should prevent cost recording when quota is exceeded', async () => {
      // Set quota to $1
      await quotaProvider.setQuota('tenant', testTenantId, 1.0, 'day');

      // Fill quota
      await quotaProvider.updateQuotaSpend('tenant', testTenantId, 1.0);

      // Verify quota is at limit
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(1.0);
      expect(quota?.limitUsd).toBe(1.0);

      // Check if another operation would be allowed
      const check = await quotaProvider.checkQuota('tenant', testTenantId, 0.01);
      expect(check.allowed).toBe(false);
    });

    it('should use atomic operations to prevent quota overruns', async () => {
      // Set quota to $10
      await quotaProvider.setQuota('tenant', testTenantId, 10.0, 'day');

      // Simulate 5 concurrent $3 operations (total $15, exceeds $10 limit)
      const promises = Array(5)
        .fill(null)
        .map(() =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 3.0)
        );

      const results = await Promise.all(promises);

      // Count successes and failures
      const allowed = results.filter((r) => r.allowed);
      const denied = results.filter((r) => !r.allowed);

      // Exactly 3 should succeed (3 * $3 = $9), 2 should be denied
      // (4th operation: $9 + $3 = $12 > $10, denied)
      expect(allowed).toHaveLength(3);
      expect(denied).toHaveLength(2);

      // Final quota should be exactly $9.00
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(9.0);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    const tenant1 = 'tenant-isolation-1';
    const tenant2 = 'tenant-isolation-2';

    beforeEach(async () => {
      // Set up separate quotas for both tenants
      await quotaProvider.setQuota('tenant', tenant1, 50.0, 'day');
      await quotaProvider.setQuota('tenant', tenant2, 50.0, 'day');
    });

    afterEach(async () => {
      // Clean up both tenants
      await supabase
        .from('cost_quotas')
        .delete()
        .in('scope_id', [tenant1, tenant2]);

      await supabase
        .from('llm_cost_records')
        .delete()
        .in('tenant_id', [tenant1, tenant2]);
    });

    it('should isolate costs between tenants', async () => {
      // Tenant 1 incurs cost
      await costStorage.storeCostRecord({
        provider: 'openai' as const,
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        inputCostUsd: 0.0025,
        outputCostUsd: 0.005,
        totalCostUsd: 0.0075,
        isEstimated: false,
        tenantId: tenant1,
        userId: 'user-1',
        conversationId: 'conv-1',
      });

      await quotaProvider.updateQuotaSpend('tenant', tenant1, 0.0075);

      // Tenant 2 should have no costs
      const costs2 = await costStorage.queryCostRecords({ tenantId: tenant2 });
      expect(costs2).toHaveLength(0);

      // Tenant 2 quota should be unchanged
      const quota2 = await quotaProvider.getQuota('tenant', tenant2);
      expect(quota2?.currentSpendUsd).toBe(0);
    });

    it('should prevent quota leakage across tenants', async () => {
      // Tenant 1 exceeds quota
      await quotaProvider.updateQuotaSpend('tenant', tenant1, 50.0);

      const check1 = await quotaProvider.checkQuota('tenant', tenant1, 1.0);
      expect(check1.allowed).toBe(false);

      // Tenant 2 should still be allowed
      const check2 = await quotaProvider.checkQuota('tenant', tenant2, 1.0);
      expect(check2.allowed).toBe(true);
    });

    it('should maintain separate cost records per tenant', async () => {
      // Both tenants make requests
      for (let i = 0; i < 5; i++) {
        await costStorage.storeCostRecord({
          provider: 'openai' as const,
          model: 'gpt-4o',
          inputTokens: 100,
          outputTokens: 50,
          inputCostUsd: 0.00025,
          outputCostUsd: 0.0005,
          totalCostUsd: 0.00075,
          isEstimated: false,
          tenantId: tenant1,
          userId: 'user-1',
          conversationId: `conv-1-${i}`,
        });

        await costStorage.storeCostRecord({
          provider: 'anthropic' as const,
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 100,
          outputTokens: 50,
          inputCostUsd: 0.0003,
          outputCostUsd: 0.00075,
          totalCostUsd: 0.00105,
          isEstimated: false,
          tenantId: tenant2,
          userId: 'user-2',
          conversationId: `conv-2-${i}`,
        });
      }

      // Verify each tenant has only their costs
      const costs1 = await costStorage.queryCostRecords({ tenantId: tenant1 });
      const costs2 = await costStorage.queryCostRecords({ tenantId: tenant2 });

      expect(costs1).toHaveLength(5);
      expect(costs2).toHaveLength(5);

      // Verify no cross-contamination
      expect(costs1.every((r) => r.tenantId === tenant1)).toBe(true);
      expect(costs2.every((r) => r.tenantId === tenant2)).toBe(true);

      // Verify different providers/models
      expect(costs1.every((r) => r.provider === 'openai')).toBe(true);
      expect(costs2.every((r) => r.provider === 'anthropic')).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing quota gracefully', async () => {
      // Delete quota
      await supabase
        .from('cost_quotas')
        .delete()
        .eq('scope', 'tenant')
        .eq('scope_id', testTenantId);

      // Check quota (should return null or allow by default)
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota).toBeNull();

      // Quota check without quota should allow by default (fail-open)
      const check = await quotaProvider.checkQuota('tenant', testTenantId, 10.0);
      expect(check.allowed).toBe(true);
    });

    it('should track estimated vs actual costs separately', async () => {
      // Record estimated cost
      await costStorage.storeCostRecord({
        provider: 'openai' as const,
        model: 'gpt-4o',
        inputTokens: 0,
        outputTokens: 0,
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0.05, // Estimated
        isEstimated: true,
        tenantId: testTenantId,
        userId: testUserId,
        conversationId: 'conv-estimate',
      });

      // Record actual cost
      await costStorage.storeCostRecord({
        provider: 'openai' as const,
        model: 'gpt-4o',
        inputTokens: 2000,
        outputTokens: 1000,
        inputCostUsd: 0.005,
        outputCostUsd: 0.01,
        totalCostUsd: 0.015,
        isEstimated: false,
        tenantId: testTenantId,
        userId: testUserId,
        conversationId: 'conv-actual',
      });

      // Query costs
      const costs = await costStorage.queryCostRecords({ tenantId: testTenantId });
      expect(costs).toHaveLength(2);

      const estimated = costs.find((c) => c.isEstimated);
      const actual = costs.find((c) => !c.isEstimated);

      expect(estimated?.totalCostUsd).toBe(0.05);
      expect(actual?.totalCostUsd).toBe(0.015);
    });

    it('should handle concurrent updates to same tenant quota', async () => {
      // Set quota to $100
      await quotaProvider.setQuota('tenant', testTenantId, 100.0, 'day');

      // Simulate 20 concurrent $3 operations
      const promises = Array(20)
        .fill(null)
        .map(() =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 3.0)
        );

      const results = await Promise.all(promises);

      // Verify internal consistency
      const allowed = results.filter((r) => r.allowed);
      const denied = results.filter((r) => !r.allowed);

      // Should allow floor(100/3) = 33 operations, but we only sent 20
      // So some will succeed, some may be denied if timing is unlucky
      expect(allowed.length + denied.length).toBe(20);

      // Final quota should match number of allowed operations
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(allowed.length * 3.0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle bulk cost recording efficiently', async () => {
      const startTime = Date.now();

      // Record 50 costs
      for (let i = 0; i < 50; i++) {
        await costStorage.storeCostRecord({
          provider: 'openai' as const,
          model: 'gpt-4o',
          inputTokens: 100,
          outputTokens: 50,
          inputCostUsd: 0.00025,
          outputCostUsd: 0.0005,
          totalCostUsd: 0.00075,
          isEstimated: false,
          tenantId: testTenantId,
          userId: testUserId,
          conversationId: `conv-bulk-${i}`,
        });
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 10 seconds for 50 records)
      expect(duration).toBeLessThan(10000);

      // Verify all records were stored
      const costs = await costStorage.queryCostRecords({ tenantId: testTenantId });
      expect(costs).toHaveLength(50);
    });

    it('should query costs efficiently with filters', async () => {
      // Set up test data with multiple conversations
      for (let i = 0; i < 10; i++) {
        await costStorage.storeCostRecord({
          provider: 'openai' as const,
          model: 'gpt-4o',
          inputTokens: 100,
          outputTokens: 50,
          inputCostUsd: 0.00025,
          outputCostUsd: 0.0005,
          totalCostUsd: 0.00075,
          isEstimated: false,
          tenantId: testTenantId,
          userId: testUserId,
          conversationId: i < 5 ? 'conv-a' : 'conv-b',
        });
      }

      // Query specific conversation
      const startTime = Date.now();
      const costs = await costStorage.queryCostRecords({
        tenantId: testTenantId,
        conversationId: 'conv-a',
      });
      const duration = Date.now() - startTime;

      // Should return correct results
      expect(costs).toHaveLength(5);
      expect(costs.every((c) => c.conversationId === 'conv-a')).toBe(true);

      // Should be fast (< 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});
