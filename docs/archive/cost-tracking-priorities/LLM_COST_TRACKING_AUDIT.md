# LLM Cost Tracking - Production Readiness Audit

**Date:** 2026-01-04
**Scope:** Production readiness for multi-tenant LLM cost tracking and quota enforcement
**Status:** 🟡 Foundation Exists - Critical Gaps Identified

---

## 🔍 Executive Summary

The LLM cost tracking infrastructure has a **strong foundation** with most critical components already implemented. However, there are **4 critical gaps** that prevent it from being production-ready for accurate tenant billing and quota enforcement.

**Current Status:**
- ✅ Database schema for cost records and quotas (mostly complete)
- ✅ Cost tracking service with quota enforcement logic
- ✅ Multi-dimensional attribution (tenant, user, conversation, task)
- ✅ Supabase storage and quota providers
- ✅ Business metrics and OpenTelemetry integration
- ✅ Cost aggregation views
- ❌ **NO `model_pricing` table** (CRITICAL - pricing cannot be updated!)
- ❌ **Quota enforcement not integrated** (exists but not used)
- ❌ **No pre-request quota gates** (quotas checked after spend)
- ❌ **Missing lifecycle tracing** (cannot see full LLM request flow)

---

## 📊 Foundation Analysis - What Already Exists

### ✅ Database Schema (`20260101000000_llm_cost_tracking.sql`)

**llm_cost_records table:**
```sql
✅ Comprehensive attribution (tenant_id, user_id, conversation_id, task)
✅ Token tracking (input_tokens, output_tokens, total_tokens)
✅ Cost tracking (input_cost_usd, output_cost_usd, total_cost_usd)
✅ Metadata (cached, streaming, duration_ms, success, is_estimated)
✅ Proper indexes for multi-dimensional queries
✅ RLS policies for tenant isolation
```

**cost_quotas table:**
```sql
✅ Scope-based quotas (platform, tenant, user)
✅ Period tracking (hour, day, week, month)
✅ Current spend tracking
✅ Warning thresholds
✅ increment_quota_spend() function (atomic updates)
✅ Resource type support (llm, e2b, all) - added recently!
```

**Aggregation views:**
```sql
✅ cost_summary_by_task
✅ cost_summary_by_tenant
✅ cost_summary_by_model
✅ combined_cost_summary_by_tenant (LLM + E2B)
```

### ✅ TypeScript Services

**CostTrackingService** (`packages/reg-intel-observability/src/costTracking/`):
```typescript
✅ recordCost() - store cost with attribution
✅ checkQuota() - pre-flight quota checks (NOT USED!)
✅ queryCostRecords() - historical cost queries
✅ aggregateCosts() - multi-dimensional aggregation
✅ Quota enforcement logic (EXISTS but enforceQuotas=false)
✅ Quota warning/exceeded callbacks
```

**SupabasePricingService** (`packages/reg-intel-observability/src/pricing/`):
```typescript
✅ getPricing() - lookup model pricing by date
✅ calculateCost() - calculate cost from tokens
✅ getProviderPricing() - get all pricing for provider
✅ updatePricing() - admin pricing updates
✅ Model normalization (handles version variants)
✅ Date-based pricing selection
```

**SupabaseCostStorage & SupabaseQuotaProvider**:
```typescript
✅ storeCostRecord() - persist to database
✅ queryCostRecords() - query with filters
✅ aggregateCosts() - SQL aggregation
✅ checkQuota() - quota validation
✅ incrementQuotaSpend() - atomic updates
✅ getQuotas() - retrieve quota configs
```

### ✅ Business Metrics

**OpenTelemetry Metrics** (`businessMetrics.ts`):
```typescript
✅ recordLlmTokenUsage() - token counting
✅ recordLlmRequest() - duration and success tracking
✅ recordLlmCost() - cost tracking with attribution
   - Records to OTel metrics (real-time)
   - Records to database (persistence)
   - Updates quotas (quota management)
```

---

## 🚨 Critical Gaps Identified

### Gap #1: Missing `model_pricing` Table ❌ **CRITICAL**

**Problem:**
The `SupabasePricingService` expects to read from `copilot_internal.model_pricing` table, but **this table does not exist**! There is NO migration that creates it.

**Evidence:**
```typescript
// packages/reg-intel-observability/src/pricing/pricingService.ts:119
constructor(client: SupabaseClient, tableName = 'copilot_internal.model_pricing') {
  this.client = client;
  this.tableName = tableName;  // ❌ This table doesn't exist!
}

// packages/reg-intel-observability/src/pricing/pricingService.ts:128
const { data, error } = await this.client
  .from(this.tableName)  // ❌ Query will fail - table doesn't exist
  .select('*')
```

**Current State:**
- Pricing data exists in TypeScript file: `pricingData.seed.ts`
- This file is for "TEST SEEDING and MIGRATIONS ONLY" (see line 4 comment)
- **Pricing is hardcoded and cannot be updated without code deployment**

**Impact:**
- ❌ Cannot update pricing when vendors change rates (requires code deployment)
- ❌ No pricing history for cost analysis
- ❌ Cost calculations will fail if pricing service is initialized
- ❌ **Blocks production deployment of cost tracking**

**Solution Needed:**
```sql
CREATE TABLE copilot_internal.model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_price_per_million numeric(12,6) NOT NULL,
  output_price_per_million numeric(12,6) NOT NULL,
  effective_date timestamptz NOT NULL,
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, model, effective_date)
);

-- Seed with current pricing from pricingData.seed.ts
INSERT INTO copilot_internal.model_pricing ...
```

---

### Gap #2: Quota Enforcement Not Integrated ❌ **CRITICAL**

**Problem:**
Quota enforcement logic exists in `CostTrackingService`, but it's **not actually used** in the LLM request flow!

**Evidence:**
```typescript
// Cost tracking service HAS quota enforcement:
constructor(options?: CostTrackingOptions) {
  this.enforceQuotas = options?.enforceQuotas ?? false;  // ❌ Defaults to FALSE!
}

// But initialization doesn't enable it:
// apps/demo-web/src/lib/costTracking.ts (if it exists)
// OR apps/demo-web/instrumentation.ts
// likely has: enforceQuotas: false or omitted
```

**Current Behavior:**
1. LLM request is made
2. Tokens are consumed
3. Cost is calculated
4. Cost is recorded to database
5. Quota is updated
6. ❌ **No pre-request check** - money already spent!

**Should Be:**
1. LLM request is about to be made
2. **Check quota BEFORE calling LLM API**
3. If quota exceeded, reject request
4. Else, make LLM request
5. Record actual cost
6. Update quota

**Impact:**
- ❌ Tenants can exceed quotas before being blocked
- ❌ No protection against runaway costs
- ❌ Cannot offer tiered pricing with hard limits
- ❌ Quota violations discovered after the fact

---

### Gap #3: No Pre-Request Quota Gates ❌ **HIGH**

**Problem:**
Even if quota enforcement is enabled in `CostTrackingService`, there are **no quota checks in the LLM routing/calling layer**.

**Where LLM Requests Happen:**
- Conversation API routes (`/api/conversations/[id]/messages`)
- Agent execution
- Merge summarization
- Compaction operations
- PII sanitization

**Current Code:**
```typescript
// ❌ No quota check before expensive operation
const response = await llmClient.chat({
  model: 'gpt-4',
  messages: [...],
  // ... costs money immediately
});

// ✅ Cost recorded AFTER spend
await recordLlmCost({...});
```

**Should Be:**
```typescript
// ✅ Check quota BEFORE expensive operation
const estimatedCost = estimateTokens(messages) * modelPrice;
const quotaCheck = await checkLlmQuota(tenantId, estimatedCost);

if (!quotaCheck.allowed) {
  throw new QuotaExceededError('LLM quota exceeded');
}

// Safe to proceed
const response = await llmClient.chat({...});

// Record actual cost
await recordLlmCost({...});
```

**Impact:**
- ❌ Quota checks are reactive, not proactive
- ❌ Money spent before quota violations detected
- ❌ Poor user experience (failures after processing)

---

### Gap #4: Missing Lifecycle Observability ❌ **MEDIUM**

**Problem:**
While business metrics exist, there's no **end-to-end tracing** of LLM requests through the system.

**What's Missing:**
```typescript
// ❌ No span tracing through LLM request lifecycle:
// User Request → API Route → Agent Selection → LLM Router → Provider → Response

// ❌ No structured logging of:
// - Which agent/touchpoint made the request
// - Request path through the system
// - Latency breakdown
// - Cache hit/miss attribution

// ❌ No error tracking by lifecycle stage:
// - Quota exceeded (pre-request)
// - Provider timeout (during request)
// - Token limit exceeded (during request)
// - Response parsing failure (post-request)
```

**Impact:**
- ❌ Cannot debug LLM request flow in production
- ❌ Cannot optimize latency by stage
- ❌ Cannot attribute costs accurately to touchpoints
- ❌ Limited error investigation capabilities

---

## 🔧 Recommended Fixes

### Priority 0: Create `model_pricing` Table

**Migration:** `20260104000002_llm_model_pricing.sql`

```sql
CREATE TABLE copilot_internal.model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_price_per_million numeric(12,6) NOT NULL CHECK (input_price_per_million >= 0),
  output_price_per_million numeric(12,6) NOT NULL CHECK (output_price_per_million >= 0),
  effective_date timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_pricing UNIQUE (provider, model, effective_date)
);

CREATE INDEX idx_model_pricing_provider_model
  ON copilot_internal.model_pricing(provider, model, effective_date DESC);

-- Seed with current pricing
INSERT INTO copilot_internal.model_pricing (provider, model, ...) VALUES ...;
```

### Priority 1: Enable Quota Enforcement

**Initialization:**
```typescript
// apps/demo-web/src/lib/costTracking.ts
initCostTracking({
  storage: new SupabaseCostStorage(supabase),
  quotas: new SupabaseQuotaProvider(supabase),
  enforceQuotas: true,  // ✅ Enable enforcement
  onQuotaWarning: async (quota) => {
    logger.warn('Quota warning', { quota });
    // Send email/notification
  },
  onQuotaExceeded: async (quota) => {
    logger.error('Quota exceeded', { quota });
    // Send alert
  },
});
```

### Priority 2: Add Pre-Request Quota Gates

**LLM Router Middleware:**
```typescript
// packages/reg-intel-llm/src/router/quotaMiddleware.ts
export async function checkLlmQuotaBeforeRequest(
  tenantId: string,
  estimatedTokens: number,
  model: string
): Promise<void> {
  const pricing = await pricingService.getPricing('openai', model);
  const estimatedCost = (estimatedTokens / 1_000_000) *
    (pricing.inputPricePerMillion + pricing.outputPricePerMillion) / 2;

  const quotaCheck = await quotaProvider.checkQuota({
    scope: 'tenant',
    scopeId: tenantId,
    estimatedCostUsd: estimatedCost,
  });

  if (!quotaCheck.allowed) {
    throw new QuotaExceededError({
      message: 'LLM quota exceeded',
      limitUsd: quotaCheck.quota?.limitUsd,
      currentSpendUsd: quotaCheck.quota?.currentSpendUsd,
      estimatedCostUsd: estimatedCost,
    });
  }

  if (quotaCheck.quota?.warningExceeded) {
    logger.warn('Approaching LLM quota limit', {
      tenantId,
      utilizationPercent: quotaCheck.quota.currentSpendUsd / quotaCheck.quota.limitUsd * 100,
    });
  }
}
```

### Priority 3: Add Lifecycle Tracing

**OpenTelemetry Spans:**
```typescript
export async function callLlmWithTracing(request: LlmRequest) {
  return withSpan('llm.request', {
    'llm.provider': request.provider,
    'llm.model': request.model,
    'llm.tenant_id': request.tenantId,
    'llm.task': request.task,
  }, async (span) => {
    // Quota check span
    await withSpan('llm.quota_check', {}, async () => {
      await checkLlmQuotaBeforeRequest(...);
    });

    // Provider call span
    const response = await withSpan('llm.provider_call', {
      'llm.estimated_tokens': estimatedTokens,
    }, async () => {
      return await provider.chat(request);
    });

    // Cost recording span
    await withSpan('llm.cost_recording', {}, async () => {
      await recordLlmCost(...);
    });

    return response;
  });
}
```

---

## ✅ Comparison with E2B Implementation

| Feature | E2B | LLM |
|---------|-----|-----|
| **Pricing Table** | ✅ e2b_pricing | ❌ Missing! |
| **Cost Records** | ✅ e2b_cost_records | ✅ llm_cost_records |
| **Quotas** | ✅ Extended cost_quotas | ✅ cost_quotas |
| **Quota Enforcement** | ✅ Fully integrated | ❌ Not integrated |
| **Pre-Request Checks** | ✅ Before sandbox creation | ❌ Missing |
| **Business Metrics** | ✅ Comprehensive | ✅ Good, can enhance |
| **Lifecycle Tracing** | ⚠️  Basic | ⚠️  Basic |
| **Cost Calculation** | ✅ Dynamic | ✅ Dynamic (if table exists) |
| **Aggregation Views** | ✅ Complete | ✅ Complete |
| **Documentation** | ✅ Full guides | ❌ Limited |

---

## 📋 Implementation Checklist

### Phase 0: Critical Fixes (Block Production)
- [ ] Create `model_pricing` table migration
- [ ] Seed pricing data from TypeScript file
- [ ] Verify pricing service works with real table
- [ ] Test cost calculations

### Phase 1: Quota Enforcement (High Priority)
- [ ] Enable `enforceQuotas: true` in cost tracking init
- [ ] Add pre-request quota checks to LLM router
- [ ] Add quota middleware to API routes
- [ ] Test quota exceeded scenarios
- [ ] Set up quota monitoring alerts

### Phase 2: Lifecycle Observability (Medium Priority)
- [ ] Add OpenTelemetry spans to LLM request flow
- [ ] Add structured logging with request IDs
- [ ] Add error tracking by lifecycle stage
- [ ] Create monitoring dashboards

### Phase 3: Documentation (Medium Priority)
- [ ] Write LLM cost tracking architecture doc
- [ ] Write quota enforcement guide
- [ ] Write pricing update procedure
- [ ] Write troubleshooting guide

---

## 💰 Business Impact

### Before (Current State):
- ⚠️  **Partial cost visibility** - records exist but pricing may fail
- ❌ **Cannot update pricing** - hardcoded in code
- ❌ **No quota protection** - tenants can exceed limits
- ⚠️  **Reactive quota management** - violations detected after spend
- ⚠️  **Limited observability** - basic metrics only
- ❌ **No billing capability** - data incomplete

### After (Full Implementation):
- ✅ **Complete cost visibility** - all LLM costs tracked accurately
- ✅ **Dynamic pricing** - update rates without code deployment
- ✅ **Proactive quota protection** - block requests before overspend
- ✅ **Real-time monitoring** - costs and quotas visible instantly
- ✅ **Accurate tenant billing** - multi-dimensional attribution
- ✅ **Full audit trail** - compliance and investigation support
- ✅ **Data-driven optimization** - identify expensive operations
- ✅ **P&L tracking** - LLM vs E2B cost breakdown

---

## 🎯 Success Metrics

After implementation, you should be able to answer:

**Cost Visibility:**
- ✅ What is our total LLM spend this month?
- ✅ Which tenant is the highest LLM spender?
- ✅ What is the LLM cost per conversation?
- ✅ Which model is most expensive?
- ✅ Which touchpoint/task has highest costs?

**Quota Management:**
- ✅ Are any tenants near their quota limits?
- ✅ How many quota-exceeded requests were blocked?
- ✅ Is quota enforcement working correctly?
- ✅ What is the average quota utilization?

**Operational Health:**
- ✅ What is the LLM request success rate?
- ✅ What is the average LLM request latency?
- ✅ What errors are occurring in the LLM lifecycle?
- ✅ Are there any cost spikes or anomalies?

---

## 📈 Next Steps

1. **Immediate:** Create `model_pricing` table migration and seed data
2. **Week 1:** Enable quota enforcement and add pre-request checks
3. **Week 2:** Add lifecycle tracing and enhanced observability
4. **Week 3:** Set up monitoring dashboards and alerts
5. **Week 4:** Write documentation and train team

**Estimated Time:** 2-3 weeks for full implementation
**Risk:** LOW (infrastructure exists, just needs integration)
**Priority:** HIGH (required for accurate billing and cost control)
