# E2B Sandbox Lifecycle - Scale & Multi-Instance Audit

**Date:** 2026-01-04
**Scope:** Production readiness for multi-instance cloud deployment
**Focus:** Resource tracking, cost management, observability, quota enforcement

---

## 🔍 Executive Summary

This audit identifies **7 critical gaps** in the E2B sandbox lifecycle that will cause issues at scale in multi-instance cloud deployments. All gaps relate to **resource tracking, cost management, and observability**.

**Status:**
- ✅ Basic lifecycle implemented (create, reconnect, terminate, cleanup)
- ✅ Multi-instance race conditions fixed (previous work)
- ❌ **NO resource tracking or cost calculation**
- ❌ **NO observability beyond basic logs**
- ❌ **NO quota enforcement**
- ❌ **NO billing/chargeback capability**

---

## 🚨 Critical Gaps Identified

### Gap #1: No E2B Resource Usage Tracking ❌

**Problem:**
- `resourceUsage` field exists in schema but is NEVER populated
- No tracking of sandbox CPU, memory, disk, or execution time
- No way to calculate costs or enforce quotas

**Evidence:**
```typescript
// packages/reg-intel-conversations/src/executionContextStores.ts:69
resourceUsage?: Record<string, unknown>;  // ❌ Always null/undefined

// packages/reg-intel-conversations/src/executionContextManager.ts
// Nowhere in the code is resourceUsage ever updated!
```

**Impact:**
- Cannot bill tenants for E2B usage
- Cannot detect abusive usage patterns
- Cannot enforce resource quotas
- No visibility into actual sandbox resource consumption

---

### Gap #2: No E2B Cost Calculation ❌

**Problem:**
- No pricing data for E2B sandboxes
- No cost calculation based on execution time or resources
- No cost records in database
- Cannot track actual E2B spending

**Evidence:**
```typescript
// LLM has cost tracking:
recordLlmCost({
  provider, model, inputTokens, outputTokens, costUsd, ...
});

// E2B has NOTHING equivalent!
```

**Comparison:**
| Feature | LLM Cost Tracking | E2B Cost Tracking |
|---------|-------------------|-------------------|
| Pricing table | ✅ `model_pricing` | ❌ None |
| Cost records | ✅ `llm_cost_records` | ❌ None |
| Cost calculation | ✅ Per token | ❌ None |
| Metrics | ✅ `regintel.llm.cost.total` | ❌ None |
| Quotas | ✅ `cost_quotas` table | ❌ None (shared with LLM) |

**Impact:**
- E2B costs are invisible to the business
- Cannot bill tenants accurately
- No P&L visibility for E2B vs LLM costs
- Quota system only tracks LLM, not E2B

---

### Gap #3: No Comprehensive Observability ❌

**Problem:**
- Only basic DEBUG logs, no structured metrics
- No OpenTelemetry spans for key operations
- No business metrics for E2B operations
- No monitoring/alerting capability

**Evidence:**
```typescript
// Current logging (from executionContextManager.ts):
this.logger.info('Creating new sandbox', {...});  // ❌ Just logs

// Should have:
recordE2BOperation({  // ❌ DOESN'T EXIST
  operation: 'create',
  sandboxId,
  tenantId,
  durationMs,
  success,
  cost,
});
```

**Missing Metrics:**
- ❌ E2B sandbox creation duration
- ❌ E2B sandbox count (active per tenant)
- ❌ E2B execution duration
- ❌ E2B costs per tenant/user/conversation
- ❌ E2B quota utilization
- ❌ E2B error rates
- ❌ Orphaned sandbox detection rate

**Impact:**
- Cannot monitor E2B health in production
- No alerting on cost spikes or errors
- No visibility into which tenants are heavy E2B users
- Cannot debug production issues effectively

---

### Gap #4: No Quota Enforcement for E2B ❌

**Problem:**
- `cost_quotas` table exists but only used for LLM
- No quota checking before creating E2B sandboxes
- Tenants can create unlimited sandboxes
- No protection against runaway costs

**Evidence:**
```typescript
// LLM quota enforcement exists (in businessMetrics.ts)
await checkQuota(tenantId, estimatedCost);

// E2B context creation has NO quota check:
async getOrCreateContext(input: GetOrCreateContextInput) {
  // ❌ NO quota check before creating expensive sandbox!
  const sandbox = await this.config.e2bClient.create({...});
}
```

**Impact:**
- Tenants can accidentally or maliciously create thousands of sandboxes
- No cost protection for the platform
- Cannot offer tiered pricing (free tier, pro tier, etc.)
- Runaway code execution loops can bankrupt the platform

---

### Gap #5: No E2B Pricing Configuration ❌

**Problem:**
- E2B pricing is hardcoded or non-existent
- Cannot update pricing without code deployment
- No pricing history for cost analysis
- Pricing changes from E2B vendor require code changes

**Evidence:**
```sql
-- LLM has dynamic pricing:
SELECT * FROM copilot_internal.model_pricing
WHERE provider = 'openai' AND model = 'gpt-4';

-- E2B has NO equivalent table!
```

**What's Missing:**
```sql
-- Should have:
CREATE TABLE copilot_internal.e2b_pricing (
  tier text,  -- e.g., 'standard', 'gpu', 'high-memory'
  price_per_second numeric,
  price_per_gb_memory numeric,
  price_per_cpu_core numeric,
  effective_date timestamptz,
  expires_at timestamptz,
  ...
);
```

**Impact:**
- Cannot adjust to E2B vendor pricing changes quickly
- No historical pricing for financial analysis
- Hardcoded pricing makes cost calculations brittle

---

### Gap #6: No Sandbox Lifecycle Metrics ❌

**Problem:**
- No metrics on sandbox reuse vs recreation
- No tracking of sandbox idle time
- No metrics on cleanup efficiency
- Cannot optimize sandbox lifecycle

**Missing Metrics:**
```typescript
// Should track:
- Sandbox cache hit rate (reconnect vs create)
- Average sandbox lifetime
- Sandbox idle time before cleanup
- Cleanup job duration and success rate
- Orphaned sandbox detection and cleanup rate
```

**Impact:**
- Cannot optimize sandbox lifecycle for cost
- No visibility into whether sandboxes are being reused effectively
- Cannot detect issues with cleanup jobs
- No data to inform TTL tuning (currently hardcoded 30 min)

---

### Gap #7: No Multi-Dimensional Cost Attribution ❌

**Problem:**
- E2B costs cannot be attributed to specific dimensions
- No tenant-level E2B billing
- No conversation-level cost tracking
- No user-level usage visibility

**Evidence:**
```typescript
// LLM has full attribution:
recordLlmCost({
  tenantId,
  userId,
  conversationId,
  task,
  organizationId,
  costUsd,
});

// E2B tracking: NONE
```

**What's Missing:**
```typescript
interface E2BCostRecord {
  // Attribution
  tenantId: string;
  userId?: string;
  conversationId?: string;
  pathId: string;

  // Resource usage
  sandboxId: string;
  executionTimeSeconds: number;
  cpuCoreSeconds?: number;
  memoryGbSeconds?: number;

  // Costs
  costUsd: number;
  tier: string;  // 'standard', 'gpu', etc.

  // Metadata
  created_at: timestamp;
}
```

**Impact:**
- Cannot bill tenants for E2B usage
- No chargeback to departments/teams
- Cannot identify high-cost users or conversations
- No data for cost optimization decisions

---

## 🏗️ Architecture Gaps

### 1. No Cost Tracking Pipeline

**Current:**
```
User Request → Create Sandbox → Execute Code → Terminate
                     ↓
                  [VOID - No tracking]
```

**Should Be:**
```
User Request → Create Sandbox → Execute Code → Terminate
                     ↓              ↓             ↓
                Track Cost    Track Usage   Record Cost
                     ↓              ↓             ↓
              E2B Cost Records Table
                     ↓
              Metrics & Quotas
```

### 2. No Quota Gate

**Current:**
```typescript
async getOrCreateContext() {
  const sandbox = await e2b.create();  // ❌ No checks!
}
```

**Should Be:**
```typescript
async getOrCreateContext() {
  // 1. Check quota before expensive operation
  await quotaService.checkAndReserve(tenantId, estimatedCost);

  try {
    const sandbox = await e2b.create();

    // 2. Track actual cost
    const cost = await calculateE2BCost(sandbox, duration);
    await quotaService.recordSpend(tenantId, cost);

  } catch (error) {
    // 3. Release reservation on failure
    await quotaService.releaseReservation(tenantId, estimatedCost);
    throw error;
  }
}
```

### 3. No Resource Metering

**Current:**
- Sandbox runs, we have no idea what it consumed
- `resourceUsage` field is always empty

**Should Be:**
```typescript
// During execution
const metrics = await sandbox.getMetrics();  // CPU, memory, etc.

// On termination
await store.updateContext(contextId, {
  resourceUsage: {
    executionTimeSeconds: duration,
    cpuCoreSeconds: metrics.cpuTime,
    memoryGbSeconds: metrics.memoryTime,
    diskIoBytes: metrics.diskIO,
  }
});

// Calculate cost
const cost = pricingService.calculateE2BCost(resourceUsage, tier);
```

---

## 🔧 Recommended Implementation

### Phase 1: Resource Tracking & Cost Recording (High Priority)

**Goal:** Visibility into E2B usage and costs

**Tasks:**
1. Create `e2b_pricing` table (similar to `model_pricing`)
2. Create `e2b_cost_records` table (similar to `llm_cost_records`)
3. Implement resource metering in execution context lifecycle
4. Add cost calculation service
5. Record costs to database on sandbox termination

**Files to Create/Modify:**
- `supabase/migrations/20260104000001_e2b_cost_tracking.sql`
- `packages/reg-intel-observability/src/e2b/pricingService.ts`
- `packages/reg-intel-observability/src/e2b/costTracking.ts`
- Modify: `executionContextManager.ts` - add resource tracking
- Modify: `executionContextStores.ts` - populate resourceUsage

---

### Phase 2: Comprehensive Observability (High Priority)

**Goal:** Production monitoring and alerting

**Tasks:**
1. Add OpenTelemetry metrics for E2B operations
2. Add business metrics (costs, quotas, usage)
3. Add tracing spans for lifecycle operations
4. Enhance structured logging

**Metrics to Add:**
```typescript
// Duration metrics
recordE2BSandboxOperation(durationMs, {
  operation: 'create' | 'reconnect' | 'terminate' | 'cleanup',
  success: boolean,
  tenantId,
  tier,
});

// Cost metrics
recordE2BCost({
  tenantId,
  userId,
  conversationId,
  pathId,
  sandboxId,
  costUsd,
  executionTimeSeconds,
  tier,
});

// Resource metrics
recordE2BResourceUsage({
  tenantId,
  cpuCoreSeconds,
  memoryGbSeconds,
  diskIoBytes,
});

// Quota metrics
recordE2BQuotaUtilization({
  tenantId,
  limitUsd,
  currentSpendUsd,
  utilizationPercent,
});
```

---

### Phase 3: Quota Enforcement (Critical for Production)

**Goal:** Prevent runaway costs and abuse

**Tasks:**
1. Extend `cost_quotas` table to support E2B (separate from LLM)
2. Implement quota checking before sandbox creation
3. Add quota reservation/release pattern
4. Add warning thresholds and alerting
5. Add graceful quota exhaustion handling

**Implementation:**
```typescript
class E2BQuotaService {
  async checkAndReserve(tenantId: string, estimatedCostUsd: number): Promise<QuotaReservation> {
    // 1. Get tenant's E2B quota
    const quota = await this.getQuota(tenantId, 'e2b');

    // 2. Check if within limit
    if (quota.currentSpend + estimatedCostUsd > quota.limitUsd) {
      throw new QuotaExceededError(
        `E2B quota exceeded for tenant ${tenantId}. ` +
        `Limit: $${quota.limitUsd}, Current: $${quota.currentSpend}`
      );
    }

    // 3. Reserve quota atomically
    return await this.reserveQuota(tenantId, estimatedCostUsd);
  }

  async recordActualCost(reservation: QuotaReservation, actualCostUsd: number): Promise<void> {
    // Update quota with actual cost and release reservation
    await this.updateQuota(reservation.tenantId, actualCostUsd - reservation.estimatedCost);
  }
}
```

---

### Phase 4: Cost Optimization Features (Medium Priority)

**Goal:** Reduce E2B costs through intelligent lifecycle management

**Tasks:**
1. Implement sandbox pooling (pre-warmed sandboxes)
2. Add cost-aware TTL adjustment (expensive sandboxes get shorter TTL)
3. Add predictive cleanup (predict idle periods, cleanup proactively)
4. Add cost-based routing (route cheap operations to cheaper tiers)

---

## 📊 Metrics & Monitoring Requirements

### Critical Metrics (Must Have)

**Cost Metrics:**
```
regintel.e2b.cost.total{tenantId, userId, tier, operation}
regintel.e2b.cost.per_sandbox{sandboxId, tier}
regintel.e2b.cost.per_conversation{conversationId}
```

**Resource Metrics:**
```
regintel.e2b.execution.duration{tenantId, tier}
regintel.e2b.resource.cpu_seconds{tenantId}
regintel.e2b.resource.memory_gb_seconds{tenantId}
```

**Lifecycle Metrics:**
```
regintel.e2b.sandbox.create.duration{tier, success}
regintel.e2b.sandbox.create.total{tier, success}
regintel.e2b.sandbox.reconnect.total{success}
regintel.e2b.sandbox.terminate.total{reason}
regintel.e2b.sandbox.active{tenantId, tier}  // Gauge
regintel.e2b.sandbox.orphaned.total{reason}
```

**Quota Metrics:**
```
regintel.e2b.quota.utilization{tenantId, period}  // 0-1
regintel.e2b.quota.exceeded.total{tenantId}
regintel.e2b.quota.limit{tenantId, period}  // Gauge
regintel.e2b.quota.current_spend{tenantId, period}  // Gauge
```

**Error Metrics:**
```
regintel.e2b.errors.total{operation, error_type}
regintel.e2b.cleanup.failed.total{reason}
```

### Monitoring Dashboards

**1. E2B Cost Dashboard**
- Total E2B spend (current day/week/month)
- Cost by tenant (top 10)
- Cost by tier (standard vs GPU vs high-memory)
- Cost trend over time
- LLM vs E2B cost breakdown

**2. E2B Resource Dashboard**
- Active sandboxes by tenant
- Average sandbox lifetime
- Sandbox creation rate
- Reconnection success rate
- Cleanup job performance

**3. E2B Quota Dashboard**
- Quota utilization by tenant
- Tenants near quota limits (>80%)
- Quota exceeded events
- Cost reservations pending

---

## 🔐 Security & Compliance Gaps

### Gap: No Audit Trail for E2B Operations

**Problem:**
- Cannot prove who executed what code in which sandbox
- No audit trail for security investigations
- No compliance evidence for data processing

**Should Have:**
```sql
CREATE TABLE copilot_internal.e2b_execution_audit (
  id uuid PRIMARY KEY,
  sandbox_id text NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid,
  conversation_id uuid,
  path_id uuid,

  -- What was executed
  operation text NOT NULL,  -- 'run_code', 'file_write', 'network_request'
  code_hash text,  -- SHA256 of code executed

  -- Results
  exit_code integer,
  stdout_hash text,  -- SHA256 of stdout
  stderr_hash text,

  -- Resource consumption
  execution_time_ms integer,
  cpu_time_ms integer,
  memory_peak_mb integer,

  -- Attribution
  timestamp timestamptz NOT NULL,
  ip_address inet,
  user_agent text,
);
```

**Impact:**
- Cannot investigate security incidents
- No compliance audit trail
- Cannot prove code execution attribution

---

## 📋 Implementation Priority

### P0 (Critical - Block Production Launch)
1. ✅ Fix UNIQUE constraint bug (Done)
2. ✅ Fix race condition in createContext (Done)
3. ✅ Fix orphaned sandbox cleanup (Done)
4. ❌ **Implement basic E2B cost tracking** (This document)
5. ❌ **Add E2B quota enforcement** (This document)

### P1 (High - Needed for Production Monitoring)
1. ❌ Add comprehensive observability metrics
2. ❌ Create monitoring dashboards
3. ❌ Set up cost alerting
4. ❌ Implement E2B pricing table

### P2 (Medium - Needed for Scale)
1. ❌ Add audit trail for E2B operations
2. ❌ Implement cost optimization features
3. ❌ Add predictive cleanup
4. ❌ Add sandbox pooling

### P3 (Low - Nice to Have)
1. ❌ Add detailed resource profiling
2. ❌ Add cost forecasting
3. ❌ Add cost anomaly detection ML

---

## 📈 Success Metrics

After implementation, we should be able to answer:

**Cost Visibility:**
- ✅ What is our total E2B spend this month?
- ✅ Which tenant is the highest E2B spender?
- ✅ What is the E2B cost per conversation?
- ✅ Are we under or over budget?

**Resource Optimization:**
- ✅ What is our sandbox reuse rate?
- ✅ How long do sandboxes sit idle before cleanup?
- ✅ Are we creating too many sandboxes?
- ✅ Which conversations have highest E2B costs?

**Quota & Protection:**
- ✅ Are any tenants near their quota limits?
- ✅ Have we blocked any quota-exceeded requests?
- ✅ Is quota enforcement working correctly?
- ✅ Are quotas set appropriately?

**Operational Health:**
- ✅ What is the E2B error rate?
- ✅ How many orphaned sandboxes exist?
- ✅ Is the cleanup job working?
- ✅ Are there any cost spikes or anomalies?

---

## Next Steps

1. Review this audit with team
2. Approve priority and scope for Phase 1
3. Implement E2B cost tracking schema (next migration)
4. Implement E2B pricing service (replicate LLM pattern)
5. Add resource metering to execution context lifecycle
6. Add comprehensive metrics and observability
7. Implement quota enforcement
8. Set up monitoring and alerting
9. Test in staging with real E2B sandboxes
10. Deploy to production with monitoring
