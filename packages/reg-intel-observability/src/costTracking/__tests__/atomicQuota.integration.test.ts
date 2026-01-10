/**
 * Atomic Quota Operations Integration Test
 *
 * Tests database-level atomic quota check + record operations to verify
 * that race conditions are prevented during concurrent requests.
 *
 * This test requires:
 * - Supabase database connection
 * - Migration 20260104000002_atomic_quota_operations.sql applied
 *
 * Run with: pnpm test atomicQuota.integration.test.ts
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseQuotaProvider } from '../supabaseProviders.js';

describe('Atomic Quota Operations Integration', () => {
  let supabase: SupabaseClient;
  let quotaProvider: SupabaseQuotaProvider;
  const testTenantId = 'test-atomic-integration';

  beforeAll(async () => {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials required for integration tests. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'copilot_billing' },
    });

    quotaProvider = new SupabaseQuotaProvider(supabase as any);
  });

  beforeEach(async () => {
    // Clean up test quota
    await supabase
      .from('cost_quotas')
      .delete()
      .eq('scope', 'tenant')
      .eq('scope_id', testTenantId);

    // Create fresh quota for testing
    await quotaProvider.setQuota('tenant', testTenantId, 10.0, 'day');
  });

  afterAll(async () => {
    // Final cleanup
    await supabase
      .from('cost_quotas')
      .delete()
      .eq('scope', 'tenant')
      .eq('scope_id', testTenantId);
  });

  describe('Basic Atomic Operations', () => {
    it('should allow operation within quota', async () => {
      const result = await quotaProvider.checkAndRecordQuotaAtomic(
        'tenant',
        testTenantId,
        5.0
      );

      expect(result.allowed).toBe(true);
      expect(result.currentSpendUsd).toBe(5.0);
      expect(result.limitUsd).toBe(10.0);
      expect(result.remainingUsd).toBe(5.0);
      expect(result.utilizationPercent).toBeCloseTo(50, 1);

      // Verify quota was actually updated in database
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(5.0);
    });

    it('should deny operation that would exceed quota', async () => {
      // Fill quota to $8
      await quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 8.0);

      // Try to spend $5 more (would total $13, exceeds $10 limit)
      const result = await quotaProvider.checkAndRecordQuotaAtomic(
        'tenant',
        testTenantId,
        5.0
      );

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBeDefined();
      expect(result.currentSpendUsd).toBe(8.0); // Should not have changed
      expect(result.limitUsd).toBe(10.0);

      // Verify quota was NOT updated
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(8.0);
    });

    it('should allow operation exactly at limit', async () => {
      // Fill to $7
      await quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 7.0);

      // Spend exactly $3 to hit $10 limit
      const result = await quotaProvider.checkAndRecordQuotaAtomic(
        'tenant',
        testTenantId,
        3.0
      );

      expect(result.allowed).toBe(true);
      expect(result.currentSpendUsd).toBe(10.0);
      expect(result.remainingUsd).toBe(0.0);
      expect(result.utilizationPercent).toBe(100);
    });

    it('should deny operation over limit by even $0.01', async () => {
      // Fill to exactly $10
      await quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 10.0);

      // Try to spend $0.01 more
      const result = await quotaProvider.checkAndRecordQuotaAtomic(
        'tenant',
        testTenantId,
        0.01
      );

      expect(result.allowed).toBe(false);
      expect(result.currentSpendUsd).toBe(10.0);
    });
  });

  describe('Concurrent Operations (Race Condition Prevention)', () => {
    it('should prevent quota overrun with 10 concurrent $2 operations', async () => {
      // Quota: $10, 10 concurrent $2 operations = total $20
      // Only 5 should succeed ($10), 5 should be denied

      const promises = Array(10)
        .fill(null)
        .map(() =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 2.0)
        );

      const results = await Promise.all(promises);

      // Count successes and failures
      const allowed = results.filter((r) => r.allowed);
      const denied = results.filter((r) => !r.allowed);

      // CRITICAL: Exactly 5 should succeed
      expect(allowed).toHaveLength(5);
      expect(denied).toHaveLength(5);

      // CRITICAL: Final quota should be exactly $10.00 (no overrun!)
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(10.0);
    });

    it('should prevent quota overrun with 50 concurrent $1 operations', async () => {
      // Quota: $10, 50 concurrent $1 operations = total $50
      // Only 10 should succeed ($10), 40 should be denied

      const promises = Array(50)
        .fill(null)
        .map(() =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 1.0)
        );

      const results = await Promise.all(promises);

      const allowed = results.filter((r) => r.allowed);
      const denied = results.filter((r) => !r.allowed);

      // Exactly 10 should succeed
      expect(allowed).toHaveLength(10);
      expect(denied).toHaveLength(40);

      // Final quota should be exactly $10.00
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(10.0);
    });

    it('should prevent quota overrun with 100 concurrent small operations', async () => {
      // Quota: $10, 100 concurrent $0.25 operations = total $25
      // Only 40 should succeed ($10), 60 should be denied

      const promises = Array(100)
        .fill(null)
        .map(() =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 0.25)
        );

      const results = await Promise.all(promises);

      const allowed = results.filter((r) => r.allowed);
      const denied = results.filter((r) => !r.allowed);

      expect(allowed).toHaveLength(40);
      expect(denied).toHaveLength(60);

      // Final quota should be exactly $10.00
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(10.0);
    });

    it('should handle mixed concurrent operations', async () => {
      // Mix of $1, $2, and $3 operations totaling more than quota
      const operations = [
        ...Array(5).fill(1.0),
        ...Array(3).fill(2.0),
        ...Array(2).fill(3.0),
      ];

      const promises = operations.map((cost) =>
        quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, cost)
      );

      const results = await Promise.all(promises);

      // Total of all allowed operations should not exceed $10
      const totalAllowed = results
        .filter((r) => r.allowed)
        .reduce((sum, r, i) => sum + operations[i], 0);

      expect(totalAllowed).toBeLessThanOrEqual(10.0);

      // Final quota should match total allowed
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(totalAllowed);
      expect(quota?.currentSpendUsd).toBeLessThanOrEqual(10.0);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle operations at quota boundary', async () => {
      // Pre-fill to $9.50
      await quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 9.5);

      // 3 concurrent $1 operations
      // Only 1 should succeed (would total $10.50 otherwise)
      const promises = Array(3)
        .fill(null)
        .map(() =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 1.0)
        );

      const results = await Promise.all(promises);

      const allowed = results.filter((r) => r.allowed);
      const denied = results.filter((r) => !r.allowed);

      // At most 1 should succeed
      expect(allowed.length).toBeLessThanOrEqual(1);
      expect(denied.length).toBeGreaterThanOrEqual(2);

      // Quota should not exceed $10.50
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBeLessThanOrEqual(10.5);
    });

    it('should handle very small concurrent operations', async () => {
      // 1000 concurrent $0.01 operations = total $10
      // All should succeed and total exactly $10
      const promises = Array(1000)
        .fill(null)
        .map(() =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 0.01)
        );

      const results = await Promise.all(promises);

      const allowed = results.filter((r) => r.allowed);

      // Exactly 1000 should succeed (all fit in $10 quota)
      expect(allowed).toHaveLength(1000);

      // Final quota should be exactly $10.00
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBeCloseTo(10.0, 2);
    });
  });

  describe('Multi-Tenant Isolation with Atomic Operations', () => {
    it('should maintain isolation during concurrent operations across tenants', async () => {
      const tenantA = 'test-atomic-tenant-a';
      const tenantB = 'test-atomic-tenant-b';

      // Set up quotas
      await quotaProvider.setQuota('tenant', tenantA, 10.0, 'day');
      await quotaProvider.setQuota('tenant', tenantB, 10.0, 'day');

      try {
        // 20 operations per tenant, all concurrent (total 40 operations)
        const allPromises = [
          ...Array(20)
            .fill(null)
            .map(() => quotaProvider.checkAndRecordQuotaAtomic('tenant', tenantA, 1.0)),
          ...Array(20)
            .fill(null)
            .map(() => quotaProvider.checkAndRecordQuotaAtomic('tenant', tenantB, 1.0)),
        ];

        const results = await Promise.all(allPromises);

        // Check tenant A quota (should be exactly $10)
        const quotaA = await quotaProvider.getQuota('tenant', tenantA);
        expect(quotaA?.currentSpendUsd).toBe(10.0);

        // Check tenant B quota (should be exactly $10)
        const quotaB = await quotaProvider.getQuota('tenant', tenantB);
        expect(quotaB?.currentSpendUsd).toBe(10.0);
      } finally {
        // Cleanup
        await supabase
          .from('cost_quotas')
          .delete()
          .in('scope_id', [tenantA, tenantB]);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent quota gracefully', async () => {
      const nonExistentTenant = 'non-existent-tenant-xyz';

      // Should allow operation when no quota configured
      const result = await quotaProvider.checkAndRecordQuotaAtomic(
        'tenant',
        nonExistentTenant,
        5.0
      );

      expect(result.allowed).toBe(true);
    });

    it('should handle zero cost operation', async () => {
      const result = await quotaProvider.checkAndRecordQuotaAtomic(
        'tenant',
        testTenantId,
        0.0
      );

      expect(result.allowed).toBe(true);
      expect(result.currentSpendUsd).toBe(0.0);

      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(0.0);
    });

    it('should handle negative cost (refund) correctly', async () => {
      // Pre-fill to $5
      await quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 5.0);

      // Apply refund of $2
      const result = await quotaProvider.checkAndRecordQuotaAtomic(
        'tenant',
        testTenantId,
        -2.0
      );

      expect(result.allowed).toBe(true);
      expect(result.currentSpendUsd).toBe(3.0);

      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(3.0);
    });
  });

  describe('Performance', () => {
    it('should complete 100 operations in reasonable time', async () => {
      const startTime = Date.now();

      const promises = Array(100)
        .fill(null)
        .map((_, i) =>
          quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 0.1)
        );

      await Promise.all(promises);

      const duration = Date.now() - startTime;

      // Should complete in less than 10 seconds
      expect(duration).toBeLessThan(10000);

      console.log(`100 atomic operations completed in ${duration}ms`);
    }, 15000);
  });
});
