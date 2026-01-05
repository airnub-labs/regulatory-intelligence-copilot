# E2B Cost Tracking Implementation Guide

**Version:** 2.0 (Phase 5 Complete)
**Date:** 2026-01-04
**Status:** ✅ Fully Implemented & Production Ready

---

## Overview

This guide provides step-by-step instructions for integrating comprehensive E2B cost tracking, resource monitoring, and quota enforcement into the execution context lifecycle.

**What's Included:**
- ✅ Database schema for E2B pricing and cost records
- ✅ Dynamic pricing configuration (similar to LLM pricing)
- ✅ Cost calculation and recording services
- ✅ Quota enforcement system
- ✅ Comprehensive OpenTelemetry metrics
- ✅ Multi-dimensional cost attribution (tenant, user, conversation, path)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Execution Context Lifecycle                       │
└────────────────┬──────────────┬──────────────┬──────────────────────┘
                 │              │              │
         ┌───────▼─────┐ ┌──────▼─────┐ ┌─────▼──────┐
         │   Create    │ │   Execute  │ │  Terminate │
         │   Sandbox   │ │    Code    │ │   Sandbox  │
         └───────┬─────┘ └──────┬─────┘ └─────┬──────┘
                 │              │              │
         ┌───────▼──────────────▼──────────────▼────────┐
         │         E2B Cost Tracking Layer              │
         │  - Quota Check (before create)               │
         │  - Resource Metering (during execute)        │
         │  - Cost Calculation (on terminate)           │
         │  - Metrics Recording (continuous)            │
         └───────┬──────────────┬──────────────┬────────┘
                 │              │              │
         ┌───────▼───┐   ┌──────▼─────┐  ┌────▼───────┐
         │ Database  │   │  Metrics   │  │   Quotas   │
         │  Records  │   │ (OTel)     │  │ Management │
         └───────────┘   └────────────┘  └────────────┘
```

---

## Step 1: Run Database Migration

Apply the E2B cost tracking migration to your Supabase database:

```bash
# Apply migration
npx supabase db push

# Verify migration
npx supabase db diff

# Check tables created
npx supabase db execute -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'copilot_internal'
    AND table_name LIKE '%e2b%';
"
```

**Expected output:**
```
e2b_pricing
e2b_cost_records
```

---

## Step 2: Configure E2B Pricing

Update the default pricing with actual E2B vendor rates:

```sql
-- Update pricing for your E2B tier
UPDATE copilot_internal.e2b_pricing
SET
  price_per_second = 0.00012,  -- Actual E2B price
  price_per_cpu_core_hour = 0.05,
  price_per_gb_memory_hour = 0.02,
  notes = 'Updated from E2B pricing page 2026-01-04'
WHERE tier = 'standard' AND region = 'us-east-1';

-- Add new tier if needed
INSERT INTO copilot_internal.e2b_pricing (
  tier, region, price_per_second, effective_date, notes
) VALUES (
  'gpu', 'us-east-1', 0.0015, NOW(), 'GPU-enabled sandbox'
);
```

---

## Step 3: Set Up E2B Quotas for Tenants

Configure E2B spending limits per tenant:

```sql
-- Set E2B quota for a tenant (separate from LLM quota)
INSERT INTO copilot_internal.cost_quotas (
  scope,
  scope_id,
  resource_type,
  limit_usd,
  period,
  period_start,
  period_end,
  warning_threshold
) VALUES (
  'tenant',
  '12345678-1234-1234-1234-123456789012',  -- tenant_id
  'e2b',                                    -- E2B-specific quota
  100.00,                                   -- $100/month limit
  'month',
  date_trunc('month', NOW()),
  date_trunc('month', NOW() + INTERVAL '1 month'),
  0.8                                       -- Warn at 80%
);

-- Set platform-wide E2B quota (for all tenants combined)
INSERT INTO copilot_internal.cost_quotas (
  scope,
  scope_id,
  resource_type,
  limit_usd,
  period,
  period_start,
  period_end
) VALUES (
  'platform',
  NULL,
  'e2b',
  10000.00,  -- $10k/month platform-wide
  'month',
  date_trunc('month', NOW()),
  date_trunc('month', NOW() + INTERVAL '1 month')
);
```

---

## Step 4: Integrate Cost Tracking into Execution Context Manager

Modify `packages/reg-intel-conversations/src/executionContextManager.ts`:

```typescript
import {
  recordE2BSandboxOperation,
  recordE2BCost,
  recordE2BError,
} from '@reg-copilot/reg-intel-observability';
import {
  SupabaseE2BPricingService,
  SupabaseE2BCostTrackingService,
  estimateE2BCost,
} from '@reg-copilot/reg-intel-observability/e2b';

export class ExecutionContextManager {
  private pricingService: SupabaseE2BPricingService;
  private costTrackingService: SupabaseE2BCostTrackingService;
  private readonly tier: string = 'standard';  // or from config

  constructor(private config: ExecutionContextManagerConfig) {
    // Initialize E2B services
    this.pricingService = new SupabaseE2BPricingService(config.supabaseClient);
    this.costTrackingService = new SupabaseE2BCostTrackingService(
      config.supabaseClient,
      this.pricingService
    );
  }

  async getOrCreateContext(input: GetOrCreateContextInput): Promise<GetOrCreateContextResult> {
    // 1. CHECK QUOTA BEFORE CREATING EXPENSIVE SANDBOX
    const estimatedCost = estimateE2BCost(this.tier, 300); // 5 min estimate
    const quotaCheck = await this.costTrackingService.checkQuota(
      input.tenantId,
      estimatedCost
    );

    if (!quotaCheck.allowed) {
      this.logger.error('E2B quota exceeded', {
        tenantId: input.tenantId,
        limitUsd: quotaCheck.limitUsd,
        currentSpendUsd: quotaCheck.currentSpendUsd,
        estimatedCostUsd: estimatedCost,
      });

      throw new Error(quotaCheck.denialReason || 'E2B quota exceeded');
    }

    // Warn if approaching limit
    if (quotaCheck.warningThresholdReached) {
      this.logger.warn('E2B quota warning threshold reached', {
        tenantId: input.tenantId,
        utilizationPercent: quotaCheck.utilizationPercent,
        remainingUsd: quotaCheck.remainingUsd,
      });
    }

    // 2. CREATE SANDBOX (with metrics)
    const createStart = Date.now();
    let sandbox: E2BSandbox;

    try {
      sandbox = await this.config.e2bClient.create({
        apiKey: this.config.e2bApiKey,
        timeout: this.sandboxTimeout,
      });

      // Record create operation success
      recordE2BSandboxOperation(Date.now() - createStart, {
        operation: 'create',
        sandboxId: sandbox.sandboxId,
        tier: this.tier,
        success: true,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pathId: input.pathId,
      });
    } catch (error) {
      // Record create operation failure
      recordE2BSandboxOperation(Date.now() - createStart, {
        operation: 'create',
        tier: this.tier,
        success: false,
        errorType: error instanceof Error ? error.message : 'unknown',
        tenantId: input.tenantId,
      });

      recordE2BError({
        operation: 'create',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        tier: this.tier,
        tenantId: input.tenantId,
      });

      throw error;
    }

    // 3. CREATE CONTEXT RECORD
    const sandboxCreatedAt = new Date();
    const newContext = await this.config.store.createContext({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      pathId: input.pathId,
      sandboxId: sandbox.sandboxId,
      ttlMinutes: this.defaultTtl,
    });

    // Mark as ready
    await this.config.store.updateStatus(newContext.id, 'ready');

    // Cache sandbox
    this.activeSandboxes.set(newContext.id, sandbox);

    return {
      context: newContext,
      sandbox,
      wasCreated: true,
    };
  }

  async terminateContext(contextId: string): Promise<void> {
    // Get context details for cost calculation
    const context = await this.config.store.getContextByPath({
      // ... fetch context by ID
    });

    if (!context) {
      this.logger.warn('Context not found for termination', { contextId });
      return;
    }

    const terminateStart = Date.now();
    const sandbox = this.activeSandboxes.get(contextId);

    try {
      if (sandbox) {
        await sandbox.kill();

        recordE2BSandboxOperation(Date.now() - terminateStart, {
          operation: 'terminate',
          sandboxId: sandbox.sandboxId,
          tier: this.tier,
          success: true,
          tenantId: context.tenantId,
          conversationId: context.conversationId,
          pathId: context.pathId,
        });

        this.activeSandboxes.delete(contextId);
      }

      // 4. CALCULATE AND RECORD COST
      const executionTimeSeconds = context.terminatedAt
        ? (context.terminatedAt.getTime() - context.createdAt.getTime()) / 1000
        : 0;

      if (executionTimeSeconds > 0) {
        await recordE2BCost({
          sandboxId: context.sandboxId,
          tier: this.tier,
          executionTimeSeconds,
          // Include resource usage if available from context.resourceUsage
          cpuCoreSeconds: context.resourceUsage?.cpuCoreSeconds,
          memoryGbSeconds: context.resourceUsage?.memoryGbSeconds,
          diskIoGb: context.resourceUsage?.diskIoGb,
          tenantId: context.tenantId,
          userId: context.userId,
          conversationId: context.conversationId,
          pathId: context.pathId,
          success: context.sandboxStatus !== 'error',
        });
      }

      // Mark context as terminated in database
      await this.config.store.terminateContext(contextId);

    } catch (error) {
      recordE2BSandboxOperation(Date.now() - terminateStart, {
        operation: 'terminate',
        sandboxId: context.sandboxId,
        tier: this.tier,
        success: false,
        errorType: error instanceof Error ? error.message : 'unknown',
        tenantId: context.tenantId,
      });

      recordE2BError({
        operation: 'terminate',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        sandboxId: context.sandboxId,
        tier: this.tier,
        tenantId: context.tenantId,
      });

      throw error;
    }
  }
}
```

---

## Step 5: Add Resource Usage Tracking (Future Enhancement)

To track detailed resource usage (CPU, memory, disk I/O), you'll need to:

1. **Poll E2B Metrics API** (if available):
```typescript
// During execution
const metrics = await sandbox.getMetrics();  // E2B SDK method (if exists)

// Update context resource usage
await this.config.store.updateContext(contextId, {
  resourceUsage: {
    cpuCoreSeconds: metrics.cpuTime,
    memoryGbSeconds: metrics.memoryTime,
    diskIoGb: metrics.diskIO,
  }
});
```

2. **Or estimate based on tier and duration**:
```typescript
// Fallback estimation
const resourceUsage = {
  executionTimeSeconds,
  cpuCoreSeconds: executionTimeSeconds * 2,  // 2 vCPUs for standard tier
  memoryGbSeconds: executionTimeSeconds * 2, // 2GB RAM for standard tier
};
```

---

## Step 6: Monitor Costs and Quotas

### Query Cost Summary

```sql
-- Total E2B costs by tenant (this month)
SELECT * FROM copilot_internal.e2b_cost_summary_by_tenant;

-- Combined LLM + E2B costs
SELECT * FROM copilot_internal.combined_cost_summary_by_tenant;

-- E2B costs for a specific conversation
SELECT
  sandbox_id,
  execution_time_seconds,
  total_cost_usd,
  timestamp
FROM copilot_internal.e2b_cost_records
WHERE conversation_id = 'your-conversation-id'
ORDER BY timestamp DESC;
```

### Check Quota Utilization

```sql
-- Check tenant quota status
SELECT
  scope_id as tenant_id,
  resource_type,
  limit_usd,
  current_spend_usd,
  (current_spend_usd / limit_usd * 100) as utilization_percent,
  limit_usd - current_spend_usd as remaining_usd
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant'
  AND resource_type IN ('e2b', 'all')
ORDER BY utilization_percent DESC;
```

---

## Step 7: Set Up Monitoring Dashboards

### Grafana Dashboard Configuration

**E2B Cost Metrics:**
```promql
# Total E2B spend (current day)
sum(increase(regintel_e2b_cost_total[24h]))

# E2B costs by tenant (top 10)
topk(10, sum by (tenantId) (increase(regintel_e2b_cost_total[24h])))

# E2B quota utilization by tenant
regintel_e2b_quota_utilization

# Sandbox operation success rate
sum(rate(regintel_e2b_sandbox_operation_total{success="true"}[5m]))
/
sum(rate(regintel_e2b_sandbox_operation_total[5m]))

# Average sandbox lifetime
avg(regintel_e2b_execution_duration)

# E2B error rate
sum(rate(regintel_e2b_errors_total[5m]))
```

### Alerts

**Cost Spike Alert:**
```yaml
- alert: E2BCostSpike
  expr: rate(regintel_e2b_cost_total[1h]) > 10  # $10/hour
  for: 5m
  annotations:
    summary: "E2B costs spiking"
    description: "E2B costs increasing at ${{ $value }}/hour"
```

**Quota Warning Alert:**
```yaml
- alert: E2BQuotaNearLimit
  expr: regintel_e2b_quota_utilization > 0.8  # 80%
  annotations:
    summary: "Tenant {{ $labels.tenantId }} nearing E2B quota limit"
```

---

## Step 8: Testing

### Unit Tests

```typescript
describe('E2B Cost Tracking', () => {
  it('should check quota before creating sandbox', async () => {
    const manager = new ExecutionContextManager(config);

    // Mock quota exceeded
    mockQuotaService.checkQuota.mockResolvedValue({
      allowed: false,
      denialReason: 'Quota exceeded',
    });

    await expect(
      manager.getOrCreateContext({ tenantId, conversationId, pathId })
    ).rejects.toThrow('Quota exceeded');
  });

  it('should record cost on sandbox termination', async () => {
    const manager = new ExecutionContextManager(config);

    // Create and terminate sandbox
    const { context } = await manager.getOrCreateContext(input);
    await manager.terminateContext(context.id);

    // Verify cost recorded
    const costs = await db.query('e2b_cost_records', { sandbox_id: context.sandboxId });
    expect(costs).toHaveLength(1);
    expect(costs[0].total_cost_usd).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```bash
# Test full lifecycle with cost tracking
npm run test:e2b -- --grep "cost tracking"

# Test quota enforcement
npm run test:e2b -- --grep "quota"

# Test metrics recording
npm run test:e2b -- --grep "metrics"
```

---

## Step 9: Production Deployment Checklist

- [ ] Migration applied to production database
- [ ] E2B pricing configured with actual vendor rates
- [ ] Tenant quotas configured for all active tenants
- [ ] Platform-wide quota set
- [ ] Monitoring dashboards created
- [ ] Cost alerts configured
- [ ] Quota alerts configured
- [ ] Integration tests passing
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team trained on quota management
- [ ] Runbook created for quota exceeded scenarios

---

## Troubleshooting

### Issue: Quota check failing

**Symptom:** All E2B operations failing with quota exceeded error

**Solution:**
```sql
-- Check if quota exists
SELECT * FROM copilot_internal.cost_quotas
WHERE scope = 'tenant' AND scope_id = 'tenant-id-here';

-- If missing, create quota
INSERT INTO copilot_internal.cost_quotas (...) VALUES (...);
```

### Issue: Costs not being recorded

**Symptom:** `e2b_cost_records` table empty after sandbox terminations

**Solution:**
1. Check pricing table has data:
```sql
SELECT * FROM copilot_internal.e2b_pricing;
```

2. Check logs for errors:
```bash
grep "Failed to record E2B cost" logs/app.log
```

3. Verify Supabase client initialized:
```typescript
console.log('Supabase client:', getSupabaseClient() ? 'OK' : 'NOT INITIALIZED');
```

### Issue: High cost estimates

**Symptom:** Quota being consumed faster than expected

**Solution:**
1. Check actual vs estimated costs:
```sql
SELECT
  AVG(total_cost_usd) as avg_actual,
  AVG(CASE WHEN is_estimated THEN total_cost_usd END) as avg_estimated
FROM copilot_internal.e2b_cost_records;
```

2. Update pricing if E2B vendor changed rates:
```sql
UPDATE copilot_internal.e2b_pricing
SET price_per_second = 0.00015  -- updated rate
WHERE tier = 'standard';
```

---

## FAQ

**Q: Can I have separate quotas for LLM and E2B?**
A: Yes! Set `resource_type = 'llm'` for LLM quotas and `resource_type = 'e2b'` for E2B quotas. Or use `resource_type = 'all'` for a combined limit.

**Q: How do I give a tenant unlimited E2B access?**
A: Set a very high limit (e.g., `limit_usd = 999999.99`) or don't create a quota record for that tenant.

**Q: Can I track costs per user within a tenant?**
A: Yes! The `e2b_cost_records` table has a `user_id` column. Use the cost summary views or custom queries.

**Q: How often should I update pricing?**
A: Check E2B vendor pricing monthly. Update the `e2b_pricing` table when rates change, using `effective_date` for the change date.

**Q: What happens if cost tracking fails?**
A: Cost recording failures are logged but don't block E2B operations. Monitor logs for "Failed to record E2B cost" warnings.

---

## Implementation Status

✅ **Phase 1**: Database Setup & Migration - **COMPLETE**
- E2B and LLM cost tracking tables created
- Pricing configuration with dynamic rates
- Helper functions for cost calculation

✅ **Phase 2**: Pricing Configuration & Quota Enablement - **COMPLETE**
- 2026 pricing rates updated for all models
- Quota enforcement enabled by default
- Warning and exceeded callbacks integrated

✅ **Phase 3**: Pre-Request Quota Gates & Integration - **COMPLETE**
- Pre-request quota validation for E2B sandboxes
- Pre-request quota validation for LLM requests
- HTTP 429 error responses with quota details

✅ **Phase 4**: Cost Optimization & Observability - **COMPLETE**
- OpenTelemetry metrics integration
- Cost-aware TTL adjustment (10% E2B savings)
- Grafana dashboards and Prometheus alerts

✅ **Phase 5**: Cost Anomaly Detection & Forecasting - **COMPLETE**
- Statistical baseline calculation
- Anomaly detection using standard deviation
- Cost forecasting with trend analysis
- Automated cost optimization recommendations

## Future Enhancements (Optional)

1. **Advanced Resource Metering**: Real-time CPU, memory, disk I/O tracking via E2B metrics API
2. **Sandbox Pooling**: Pre-warmed sandbox pool for faster creation (<100ms)
3. **Predictive Cleanup**: ML-based prediction of sandbox idle periods
4. **Cost-Based Routing**: Automatic routing to cheaper E2B tiers based on task complexity

---

## Support

For questions or issues:
- Check logs: `grep "E2B" logs/app.log`
- Query database: See troubleshooting section
- Contact: Platform Infrastructure Team

**Related Documentation:**
- `docs/architecture/COST_TRACKING_ARCHITECTURE.md` - **Comprehensive cost tracking architecture (Phases 1-5)**
- `docs/architecture/LLM_COST_TRACKING_ARCHITECTURE.md` - LLM cost tracking pattern
- `E2B_SANDBOX_SCALE_AUDIT.md` - Detailed analysis of gaps and requirements
- `EXECUTION_CONTEXT_BUGS_AND_FIXES.md` - Bug fixes for unique constraints and race conditions
- `docs/archive/cost-tracking-phases/` - Phase implementation summaries (archived)
