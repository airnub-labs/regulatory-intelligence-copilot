/**
 * Quota Performance Tests
 *
 * Tests quota check performance under various load conditions to ensure
 * the system can handle production workloads without degradation.
 *
 * Test Categories:
 * - Latency tests (p50, p95, p99 measurements)
 * - Throughput tests (operations per second)
 * - Concurrent load tests (high concurrency scenarios)
 * - Sustained load tests (long-running operations)
 *
 * Prerequisites:
 * - Supabase database connection (for integration tests)
 * - All cost tracking migrations applied
 *
 * Run with: pnpm test quotaPerformance.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseQuotaProvider } from '../supabaseProviders.js';

describe('Quota Performance Tests', () => {
  let supabase: SupabaseClient;
  let quotaProvider: SupabaseQuotaProvider;
  const testTenantId = 'test-perf-tenant';

  beforeAll(async () => {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials required for performance tests. ' +
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
    await quotaProvider.setQuota('tenant', testTenantId, 1000.0, 'day');
  });

  afterAll(async () => {
    // Final cleanup
    await supabase
      .from('cost_quotas')
      .delete()
      .eq('scope', 'tenant')
      .eq('scope_id', testTenantId);
  });

  describe('Latency Tests', () => {
    it('should check quota with low latency (p95 < 100ms)', async () => {
      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await quotaProvider.checkQuota({
          scope: 'tenant',
          scopeId: testTenantId,
          estimatedCostUsd: 1.0,
        });
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      // Calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(iterations * 0.5)];
      const p95 = latencies[Math.floor(iterations * 0.95)];
      const p99 = latencies[Math.floor(iterations * 0.99)];
      const avg = latencies.reduce((sum, l) => sum + l, 0) / iterations;

      console.log(`Quota Check Latency: avg=${avg.toFixed(2)}ms, p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`);

      // Performance assertions
      expect(avg).toBeLessThan(50); // Average < 50ms
      expect(p95).toBeLessThan(100); // p95 < 100ms
      expect(p99).toBeLessThan(200); // p99 < 200ms
    });

    it('should perform atomic quota operations with acceptable latency (p95 < 150ms)', async () => {
      const iterations = 50;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 1.0);
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      // Calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(iterations * 0.5)];
      const p95 = latencies[Math.floor(iterations * 0.95)];
      const p99 = latencies[Math.floor(iterations * 0.99)];
      const avg = latencies.reduce((sum, l) => sum + l, 0) / iterations;

      console.log(`Atomic Quota Op Latency: avg=${avg.toFixed(2)}ms, p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`);

      // Performance assertions (atomic ops are slower due to locking)
      expect(avg).toBeLessThan(100); // Average < 100ms
      expect(p95).toBeLessThan(150); // p95 < 150ms
      expect(p99).toBeLessThan(250); // p99 < 250ms
    });
  });

  describe('Throughput Tests', () => {
    it('should handle 100 sequential quota checks within 10 seconds', async () => {
      const operations = 100;
      const start = performance.now();

      for (let i = 0; i < operations; i++) {
        await quotaProvider.checkQuota({
          scope: 'tenant',
          scopeId: testTenantId,
          estimatedCostUsd: 0.1,
        });
      }

      const duration = performance.now() - start;
      const throughput = (operations / duration) * 1000; // ops/second

      console.log(`Sequential Throughput: ${throughput.toFixed(2)} ops/sec (${duration.toFixed(2)}ms total)`);

      expect(duration).toBeLessThan(10000); // Complete in < 10 seconds
      expect(throughput).toBeGreaterThan(10); // > 10 ops/sec
    });

    it('should handle 50 concurrent quota checks efficiently', async () => {
      const concurrency = 50;
      const start = performance.now();

      const promises = Array(concurrency)
        .fill(null)
        .map(() =>
          quotaProvider.checkQuota({
            scope: 'tenant',
            scopeId: testTenantId,
            estimatedCostUsd: 0.1,
          })
        );

      await Promise.all(promises);

      const duration = performance.now() - start;
      const throughput = (concurrency / duration) * 1000; // ops/second

      console.log(`Concurrent Throughput: ${throughput.toFixed(2)} ops/sec (${duration.toFixed(2)}ms total, ${concurrency} concurrent)`);

      expect(duration).toBeLessThan(5000); // Complete in < 5 seconds
      expect(throughput).toBeGreaterThan(10); // > 10 ops/sec even with concurrency
    });
  });

  describe('Concurrent Load Tests', () => {
    it('should handle 100 concurrent atomic operations without significant degradation', async () => {
      const concurrency = 100;
      const start = performance.now();

      const promises = Array(concurrency)
        .fill(null)
        .map(() => quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, 0.5));

      const results = await Promise.all(promises);

      const duration = performance.now() - start;
      const successful = results.filter((r) => r.allowed).length;
      const throughput = (concurrency / duration) * 1000;

      console.log(`High Concurrency: ${concurrency} ops in ${duration.toFixed(2)}ms (${throughput.toFixed(2)} ops/sec, ${successful} allowed)`);

      // Should complete in reasonable time even under load
      expect(duration).toBeLessThan(30000); // < 30 seconds
      expect(throughput).toBeGreaterThan(3); // > 3 ops/sec

      // Should maintain data consistency
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(successful * 0.5);
    });

    it('should maintain consistent performance across multiple tenants', async () => {
      const tenantCount = 10;
      const opsPerTenant = 10;

      // Set up quotas for multiple tenants
      const tenantIds = Array.from({ length: tenantCount }, (_, i) => `perf-tenant-${i}`);
      await Promise.all(
        tenantIds.map((id) => quotaProvider.setQuota('tenant', id, 100.0, 'day'))
      );

      const start = performance.now();

      // Concurrent operations across all tenants
      const promises = tenantIds.flatMap((tenantId) =>
        Array(opsPerTenant)
          .fill(null)
          .map(() => quotaProvider.checkAndRecordQuotaAtomic('tenant', tenantId, 1.0))
      );

      await Promise.all(promises);

      const duration = performance.now() - start;
      const totalOps = tenantCount * opsPerTenant;
      const throughput = (totalOps / duration) * 1000;

      console.log(`Multi-Tenant: ${totalOps} ops across ${tenantCount} tenants in ${duration.toFixed(2)}ms (${throughput.toFixed(2)} ops/sec)`);

      expect(duration).toBeLessThan(15000); // Complete in < 15 seconds

      // Verify each tenant's quota independently
      for (const tenantId of tenantIds) {
        const quota = await quotaProvider.getQuota('tenant', tenantId);
        expect(quota?.currentSpendUsd).toBeGreaterThan(0);
        expect(quota?.currentSpendUsd).toBeLessThanOrEqual(100.0);
      }

      // Cleanup
      await Promise.all(
        tenantIds.map((id) =>
          supabase.from('cost_quotas').delete().eq('scope', 'tenant').eq('scope_id', id)
        )
      );
    });
  });

  describe('Sustained Load Tests', () => {
    it('should handle sustained load without performance degradation', async () => {
      const durationSeconds = 10;
      const targetOpsPerSecond = 5;
      const totalOps = durationSeconds * targetOpsPerSecond;

      const latencies: number[] = [];
      const start = performance.now();

      for (let i = 0; i < totalOps; i++) {
        const opStart = performance.now();

        await quotaProvider.checkQuota({
          scope: 'tenant',
          scopeId: testTenantId,
          estimatedCostUsd: 0.1,
        });

        const opLatency = performance.now() - opStart;
        latencies.push(opLatency);

        // Pace operations to maintain target rate
        const targetInterval = 1000 / targetOpsPerSecond;
        const actualInterval = performance.now() - start - i * targetInterval;
        if (actualInterval < targetInterval) {
          await new Promise((resolve) =>
            setTimeout(resolve, targetInterval - actualInterval)
          );
        }
      }

      const duration = performance.now() - start;

      // Calculate metrics for first half vs second half
      const midpoint = Math.floor(latencies.length / 2);
      const firstHalfAvg =
        latencies.slice(0, midpoint).reduce((sum, l) => sum + l, 0) / midpoint;
      const secondHalfAvg =
        latencies.slice(midpoint).reduce((sum, l) => sum + l, 0) / (latencies.length - midpoint);

      console.log(`Sustained Load: ${totalOps} ops over ${(duration / 1000).toFixed(2)}s`);
      console.log(`  First half avg: ${firstHalfAvg.toFixed(2)}ms`);
      console.log(`  Second half avg: ${secondHalfAvg.toFixed(2)}ms`);
      console.log(`  Degradation: ${((secondHalfAvg / firstHalfAvg - 1) * 100).toFixed(1)}%`);

      // Performance should not degrade significantly over time
      const degradation = secondHalfAvg / firstHalfAvg;
      expect(degradation).toBeLessThan(1.5); // < 50% degradation
    }, 15000); // Longer timeout for sustained test
  });

  describe('Stress Tests', () => {
    it('should recover gracefully from quota exhaustion under load', async () => {
      // Set a low quota to test exhaustion scenario
      await quotaProvider.setQuota('tenant', testTenantId, 10.0, 'day');

      const operations = 50;
      const costPerOp = 1.0;

      const start = performance.now();
      const promises = Array(operations)
        .fill(null)
        .map(() => quotaProvider.checkAndRecordQuotaAtomic('tenant', testTenantId, costPerOp));

      const results = await Promise.all(promises);
      const duration = performance.now() - start;

      const allowed = results.filter((r) => r.allowed).length;
      const denied = results.filter((r) => !r.allowed).length;

      console.log(`Quota Exhaustion: ${allowed} allowed, ${denied} denied in ${duration.toFixed(2)}ms`);

      // Should complete in reasonable time even with contention
      expect(duration).toBeLessThan(20000); // < 20 seconds

      // Should enforce quota correctly
      expect(allowed).toBeLessThanOrEqual(10); // Can't exceed $10 quota

      // Final quota should match allowed operations
      const quota = await quotaProvider.getQuota('tenant', testTenantId);
      expect(quota?.currentSpendUsd).toBe(allowed * costPerOp);
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect significant performance regressions', async () => {
      // Baseline measurement
      const baselineIterations = 50;
      const baselineLatencies: number[] = [];

      for (let i = 0; i < baselineIterations; i++) {
        const start = performance.now();
        await quotaProvider.checkQuota({
          scope: 'tenant',
          scopeId: testTenantId,
          estimatedCostUsd: 0.1,
        });
        baselineLatencies.push(performance.now() - start);
      }

      const baselineAvg =
        baselineLatencies.reduce((sum, l) => sum + l, 0) / baselineIterations;

      // Current measurement (simulating later test run)
      const currentIterations = 50;
      const currentLatencies: number[] = [];

      for (let i = 0; i < currentIterations; i++) {
        const start = performance.now();
        await quotaProvider.checkQuota({
          scope: 'tenant',
          scopeId: testTenantId,
          estimatedCostUsd: 0.1,
        });
        currentLatencies.push(performance.now() - start);
      }

      const currentAvg = currentLatencies.reduce((sum, l) => sum + l, 0) / currentIterations;

      const regression = (currentAvg / baselineAvg - 1) * 100;

      console.log(`Regression Test: baseline=${baselineAvg.toFixed(2)}ms, current=${currentAvg.toFixed(2)}ms, regression=${regression.toFixed(1)}%`);

      // Should not regress more than 100% (2x slower)
      expect(currentAvg).toBeLessThan(baselineAvg * 2);
    });
  });
});
