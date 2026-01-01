# Outstanding Implementation Tasks - Cost Tracking & Compaction

> **Status**: 📊 Gap Analysis Complete (Updated)
> **Date**: 2026-01-01
> **Last Updated**: 2026-01-01
> **Based On**: Implementation plan comparison vs actual implementation

---

## Executive Summary

This document identifies **outstanding tasks** for the LLM Cost Tracking & Observability Architecture and Conversation Compaction Architecture by comparing the original implementation plans against what was actually implemented.

### High-Level Status

| Area | Planned | Implemented | Completion | Outstanding Tasks |
|------|---------|-------------|------------|-------------------|
| **Compaction Architecture** | 8 strategies + Token counting | 4 strategies + Token counting + APIs + UI | ~80% | 4 strategies (Hybrid, Aggressive, utilities) |
| **Cost Tracking** | Full architecture with touchpoints | Service + Supabase Storage + Touchpoints + APIs + Dashboard + Alerting (stubs) | ~98% | Implement real notification integrations |

> **Architecture Decision (2026-01-01)**: Supabase is required for cost tracking in both local development and production. There is no in-memory fallback for runtime. Run `supabase start` for local development.

> **Update (2026-01-01)**: Cost dashboard implemented at `/analytics/costs`. Notification service stubs added for Slack, Email, and PagerDuty - configure via environment variables.

---

## Table of Contents

1. [Compaction Architecture - Outstanding Tasks](#1-compaction-architecture---outstanding-tasks)
2. [Cost Tracking - Outstanding Tasks](#2-cost-tracking---outstanding-tasks)
3. [Priority Assessment](#3-priority-assessment)
4. [Recommended Next Steps](#4-recommended-next-steps)

---

## 1. Compaction Architecture - Outstanding Tasks

### 1.1 Token Counting Infrastructure

**Status**: ✅ **FULLY IMPLEMENTED** (verified 2026-01-01)

**Implementation** (at `packages/reg-intel-core/src/tokens/`):
```typescript
├── index.ts             # Main exports & factory functions
├── types.ts             # TypeScript interfaces
├── tiktoken.ts          # TiktokenCounter class
├── estimators.ts        # Fallback estimators
├── cache.ts             # LRU token count cache
├── utils.ts             # Convenience functions
└── __tests__/
    └── tokenCounter.test.ts  # 29 passing tests
```

**What's Implemented**:
- [x] Tiktoken integration (`@dqbd/tiktoken@^1.0.15` package)
- [x] `TiktokenCounter` class with caching
- [x] Character-based fallback estimator (`estimateTokensFromCharacters`)
- [x] Word-based fallback estimator (`estimateTokensFromWords`)
- [x] Hybrid estimation (`estimateTokensHybrid`)
- [x] `estimateMessageTokens()` function
- [x] `estimateContextTokens()` function
- [x] LRU token count caching with TTL
- [x] 29 comprehensive tests (all passing)
- [x] Exported from main package index

**Key APIs**:
```typescript
// Factory functions
createTokenCounter(config: TokenCounterConfig): TokenCounter
createTokenCounterForModel(model: string): TokenCounter
quickEstimateTokens(text: string, model?: string): Promise<number>

// Convenience utilities
countTokensForMessages(messages, model?): Promise<number>
countTokensForText(text, model?): Promise<number>
clearTokenCountCache(): void
```

**Effort**: Completed (0 hours remaining)

---

### 1.2 Path Compaction Strategies

**Status**: ⚠️ **PARTIAL** (3/4 strategies implemented)

**Implemented**:
- ✅ `SemanticCompactor` - LLM-powered importance scoring
- ✅ `NoneCompactor` - Passthrough (inferred from implementation)
- ✅ `SlidingWindowCompactor` - Keep last N messages with optional summarization

#### 1.2.1 SlidingWindowCompactor ✅ IMPLEMENTED

**Location**: `packages/reg-intel-conversations/src/compaction/strategies/SlidingWindowCompactor.ts`

**Features Implemented**:
- [x] Configurable window size (default: 50)
- [x] Optional LLM-powered summarization of old messages
- [x] Pinned message preservation
- [x] System message preservation
- [x] Token counting integration
- [x] Wired up in `compactionFactory.ts`

**Effort**: 0 hours remaining (completed)

---

**Missing from Plan** (§ 4 of COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md):

#### 1.2.2 HybridCompactor
```typescript
// packages/reg-intel-conversations/src/compaction/strategies/HybridCompactor.ts

/**
 * Compose sliding window + semantic filtering
 *
 * Strategy:
 * - Keep recent N messages (sliding window)
 * - Apply semantic scoring to older messages
 * - Combine both for optimal compression
 */
```
- [ ] Implement hybrid composition logic
- [ ] Combine SlidingWindowCompactor + SemanticCompactor
- [ ] Tests for both strategies applying correctly
- [ ] Performance tests (batching LLM calls)

**Effort**: ~4-5 hours

---

### 1.3 Merge Compaction Strategies

**Status**: ⚠️ **PARTIAL** (3/4 strategies implemented)

**Implemented**:
- ✅ `ModerateMergeCompactor` - Redundancy detection + summarization
- ✅ `NoneCompactor` (via factory) - Passthrough for merge operations
- ✅ `MinimalMergeCompactor` (via ModerateMergeCompactor with `strategy: 'minimal'`)

#### 1.3.1 MergeNoneCompactor ✅ IMPLEMENTED

**Location**: Uses `NoneCompactor` via `getMergeCompactor('none')` in `compactionFactory.ts`

**Features Implemented**:
- [x] Passthrough compactor returns all messages unchanged
- [x] Wired up in factory

**Effort**: 0 hours remaining (completed)

---

#### 1.3.2 MinimalMergeCompactor ✅ IMPLEMENTED

**Location**: Via `ModerateMergeCompactor` with minimal config in `compactionFactory.ts:61-68`

**Features Implemented**:
- [x] Deduplication only (no LLM usage)
- [x] `deduplicate: true, mergeConsecutive: false, useLlm: false`
- [x] Wired up via `getMergeCompactor('minimal')`

**Effort**: 0 hours remaining (completed)

---

**Missing from Plan** (§ 5 of COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md):

#### 1.3.3 AggressiveMergeCompactor
```typescript
// packages/reg-intel-conversations/src/compaction/strategies/AggressiveMergeCompactor.ts

/**
 * Outcomes-only extraction
 *
 * Features:
 * - Extract only final decisions/conclusions
 * - Discard all discussion/questions
 * - Highest compression ratio
 * - LLM-powered outcome extraction
 */
```
- [ ] Implement outcome extraction prompt
- [ ] LLM integration for decision extraction
- [ ] Tests for extreme compression scenarios
- [ ] Verify pinned message preservation

**Effort**: ~3-4 hours

---

### 1.4 Compaction Utilities

**Status**: ❌ **NOT IMPLEMENTED**

**Missing from Plan** (§ 3.2 of COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md):

```typescript
// packages/reg-intel-conversations/src/compaction/utils.ts

export function deduplicateMessages(messages: ConversationMessage[]): {
  unique: ConversationMessage[];
  removed: ConversationMessage[];
}

export function mergeMessageLists(...lists: ConversationMessage[][]): ConversationMessage[]

export function calculateReduction(before: number, after: number): number

export function hashMessage(msg: ConversationMessage): string
```

- [ ] Deduplication utility
- [ ] Message list merging (chronological)
- [ ] Reduction percentage calculation
- [ ] Content hashing
- [ ] Tests for all utilities

**Effort**: ~2-3 hours

---

### 1.5 Factory Pattern Completion

**Status**: ✅ **MOSTLY COMPLETE** (all current strategies wired)

**Current** (from `compactionFactory.ts`):
- ✅ `getPathCompactor()` - supports `none`, `sliding_window`, `semantic`, `hybrid` (fallback)
- ✅ `getMergeCompactor()` - supports `none`, `minimal`, `moderate`, `aggressive`
- ✅ Default configurations exported
- ✅ Error handling for unknown strategies (falls back with warning)

**Implemented**:
- [x] SlidingWindowCompactor in `getPathCompactor()`
- [x] NoneCompactor in `getMergeCompactor()`
- [x] MinimalMergeCompactor in `getMergeCompactor()` (via ModerateMergeCompactor config)
- [x] AggressiveMergeCompactor in `getMergeCompactor()` (via ModerateMergeCompactor config)

**Remaining**:
- [ ] Add HybridCompactor to `getPathCompactor()` (currently falls back to semantic)

**Effort**: ~1 hour (only HybridCompactor remaining)

---

### 1.6 Integration Testing

**Status**: ❌ **NOT IMPLEMENTED**

**Missing from Plan** (§ 8.2 of COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md):

```typescript
// packages/reg-intel-conversations/src/compaction/__tests__/integration/

describe('Path Store Compaction', () => {
  it('should compact path when requested')
  it('should detect when path needs compaction')
  it('should auto-compact when threshold exceeded')
  it('should preserve pinned messages through compaction')
  it('should update message sequences after compaction')
  it('should handle compaction errors gracefully')
  it('should respect configuration settings')
})

describe('Merge with Compaction', () => {
  it('should apply compaction for full merge')
  it('should skip compaction when disabled')
  it('should use configured compression strategy')
  it('should allow strategy override')
  it('should preserve pinned messages in merge')
  it('should handle large merges efficiently')
  it('should emit SSE events for compaction progress')
})
```

- [ ] Create integration test suite
- [ ] Test path store compaction flow
- [ ] Test merge flow with compaction
- [ ] Test configuration inheritance
- [ ] Test error handling

**Effort**: ~6-8 hours

---

## 2. Cost Tracking - Outstanding Tasks

### 2.1 Touchpoint Tracking

**Status**: ❌ **NOT IMPLEMENTED**

**Planned** (from `LLM_COST_TRACKING_ARCHITECTURE.md` § 2):

8 LLM touchpoints identified:
```typescript
| Touchpoint | Task ID | Priority |
|------------|---------|----------|
| Main Chat | main-chat | P0 |
| Merge Summarizer | merge-summarizer | P1 |
| Global Regulatory Agent | agent:global-regulatory | P0 |
| Ireland Social Safety Net Agent | agent:ie-social-safety | P1 |
| Compliance Engine | compliance-engine | P0 |
| Path Compaction Semantic | compaction:semantic | P2 |
| Merge Compaction Moderate | compaction:merge-moderate | P2 |
| PII Sanitizer | pii-sanitizer | P1 |
```

**What's Missing**:
- [ ] Add `touchpoint` parameter to `RecordCostRequest`
- [ ] Instrument all 8 touchpoints with cost recording
- [ ] Add touchpoint to OpenTelemetry metrics
- [ ] Create touchpoint cost aggregation queries
- [ ] Build touchpoint cost dashboard

**Impact**:
- Cannot identify expensive request sites
- Cannot optimize specific touchpoints
- Cannot compare costs across different parts of the system

**Effort**: ~8-12 hours

---

### 2.2 Model Pricing Lookup

**Status**: ✅ **FULLY IMPLEMENTED**

**Location**: `packages/reg-intel-observability/src/pricing/`

**Implementation**:
```typescript
├── pricingService.ts    # PricingService interface & InMemoryPricingService
├── pricingData.ts       # Static pricing data for all major providers
├── types.ts             # ModelPricing, CostCalculation types
└── __tests__/
    └── pricingService.test.ts  # Comprehensive tests
```

**Features Implemented**:
- [x] `ModelPricing` interface with provider, model, input/output prices
- [x] `InMemoryPricingService` with static pricing data
- [x] `getPricing(provider, model, date?)` - lookup with date support
- [x] `calculateCost(request)` - returns input/output/total cost
- [x] `calculateLlmCost()` - convenience helper function
- [x] Historical pricing support (select by effective date)
- [x] Model name normalization (handles variations like `gpt-4-0314` → `gpt-4`)
- [x] Pricing data for OpenAI, Anthropic, Google, Groq models
- [x] Default pricing fallback for unknown models

**Key APIs**:
```typescript
// Quick cost calculation
const result = await calculateLlmCost('openai', 'gpt-4', 1000, 500);
console.log(result.totalCostUsd); // 0.045

// Full service
const service = getDefaultPricingService();
const pricing = await service.getPricing('anthropic', 'claude-3-opus');
```

**Effort**: 0 hours remaining (completed)

---

### 2.3 Cost Aggregation APIs

**Status**: ✅ **FULLY IMPLEMENTED**

**Location**: `apps/demo-web/src/app/api/costs/`

**Implemented Endpoints**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/costs/aggregate` | POST | Multi-dimensional aggregation by tenant, user, task, provider, model |
| `/api/costs/query` | POST | Query detailed cost records with filtering |
| `/api/costs/total` | POST | Get total cost for scope (platform, tenant, user, task) |
| `/api/costs/quotas` | GET/POST/DELETE | Get, set, or reset quotas |
| `/api/costs/quotas/check` | POST | Check if request would exceed quota |

**Features Implemented**:
- [x] Multi-dimensional groupBy: `tenant`, `user`, `task`, `provider`, `model`, `conversation`
- [x] Time-range filtering with `startTime` and `endTime`
- [x] Sorting options: `cost_desc`, `cost_asc`, `time_desc`, `time_asc`, `count_desc`
- [x] Pagination with `limit`
- [x] Comprehensive documentation in `README.md`

**Example Usage**:
```typescript
// Aggregate by tenant
const response = await fetch('/api/costs/aggregate', {
  method: 'POST',
  body: JSON.stringify({
    groupBy: ['tenant'],
    startTime: '2024-01-01T00:00:00Z',
    sortBy: 'cost_desc',
    limit: 10,
  }),
});
```

**Effort**: 0 hours remaining (completed)

---

### 2.4 Cost Alerting & Budgets

**Status**: ⚠️ **MOSTLY COMPLETE** (notification stubs implemented, need real integrations)

**Fully Implemented**:
- ✅ `CostTrackingService` with quota enforcement
- ✅ `onQuotaWarning` callback - wired to notification service
- ✅ `onQuotaExceeded` callback - wired to notification service
- ✅ Tests for quota enforcement
- ✅ Budget dashboard showing quota usage at `/analytics/costs`
- ✅ Notification service architecture (`notifications.ts`)

**Notification Service** (at `packages/reg-intel-observability/src/costTracking/notifications.ts`):
- ✅ `NotificationService` interface
- ✅ `DefaultNotificationService` with stub implementations
- ✅ `createCostAlert()` helper to create alert payloads
- ✅ Environment variable configuration (`initNotificationServiceFromEnv()`)
- ✅ Wired into `costTracking.ts` callbacks

**Notification Channels (Stubs - TODO: Implement real integrations)**:

| Channel | Status | Environment Variables |
|---------|--------|----------------------|
| Slack | 🔶 Stub | `COST_ALERT_SLACK_WEBHOOK_URL`, `COST_ALERT_SLACK_CHANNEL` |
| Email | 🔶 Stub | `COST_ALERT_EMAIL_SMTP_HOST`, `COST_ALERT_EMAIL_TO`, etc. |
| PagerDuty | 🔶 Stub | `COST_ALERT_PAGERDUTY_ROUTING_KEY` |

**To Enable Notifications**:
```bash
# Enable channels
COST_ALERT_CHANNELS=slack,email,pagerduty

# Slack
COST_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# Email
COST_ALERT_EMAIL_SMTP_HOST=smtp.example.com
COST_ALERT_EMAIL_TO=admin@example.com

# PagerDuty
COST_ALERT_PAGERDUTY_ROUTING_KEY=your-routing-key
```

**Remaining TODOs** (in `notifications.ts`):
- [ ] Implement real Slack webhook call (see TODO in `sendToSlack()`)
- [ ] Implement real email sending with nodemailer (see TODO in `sendEmail()`)
- [ ] Implement real PagerDuty Events API v2 call (see TODO in `sendToPagerDuty()`)
- [ ] Anomaly detection (spending spike alerts)
- [ ] Daily/monthly cost reports

**Effort**: ~4-6 hours (implement real integrations)

---

### 2.5 Cost Storage Providers

**Status**: ✅ **FULLY IMPLEMENTED**

**Implementation** (at `packages/reg-intel-observability/src/costTracking/`):
- ✅ `SupabaseCostStorage` - Production storage provider (required)
- ✅ `SupabaseQuotaProvider` - Production quota management (required)
- ✅ `InMemoryCostStorage` - For unit testing only
- ✅ `InMemoryQuotaProvider` - For unit testing only

**Architecture Decision** (2026-01-01):
- **Supabase is required in both local development and production**
- No in-memory fallback for runtime environments
- For local dev, run `supabase start` to start a local Supabase instance
- In-memory providers are retained only for unit testing purposes

**What's Implemented**:
- [x] PostgreSQL schema migration (`20260101000000_llm_cost_tracking.sql`)
- [x] Indexes for fast querying (6 indexes for common patterns)
- [x] Data retention policy (optional cleanup function included)
- [x] 13 provider tests (all passing)

**Environment Variables Required**:
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`

**Effort**: 0 hours remaining (completed)

---

### 2.6 Cost Dashboards & Visualization

**Status**: ✅ **IMPLEMENTED** (main dashboard complete)

**Location**: `apps/demo-web/src/app/analytics/costs/page.tsx`

**Dashboard Features**:
- ✅ **Summary Cards**: Today, This Week, This Month spend
- ✅ **Total Requests**: Count and average cost per request
- ✅ **Budget Status**: Quota progress bars with warning/exceeded states
- ✅ **Cost by Provider**: Table with requests, total cost, avg cost
- ✅ **Cost by Model**: Table breakdown by model
- ✅ **Cost by Touchpoint**: Table breakdown by task/touchpoint
- ✅ **Cost by Tenant**: Table breakdown by tenant
- ✅ **Time Range Selector**: 24h, 7d, 30d, All Time
- ✅ **Auto-refresh**: Manual refresh button
- ✅ **Loading/Error States**: Proper UX for async data

**Access**: Navigate to `/analytics/costs`

**Data Source**: Fetches real data from Supabase via:
- `/api/costs/total` - Summary totals
- `/api/costs/aggregate` - Dimensional breakdowns
- `/api/costs/quotas` - Quota status

**Remaining Enhancements** (P3):
- [ ] `/analytics/costs/tenants` - Dedicated tenant comparison page
- [ ] `/analytics/costs/models` - Model performance vs cost analysis
- [ ] Recharts line charts for cost trends over time
- [ ] Export to CSV functionality

**Effort**: 0 hours for core dashboard (completed), ~6-8 hours for enhancements

---

## 3. Priority Assessment

### 3.1 Critical (P0) - Blocking Production Use

**Compaction**:
- [x] ~~**Token Counting Infrastructure** (8-12h)~~ ✅ **COMPLETED**
  - *Status*: Fully implemented with 29 passing tests
  - *Location*: `packages/reg-intel-core/src/tokens/`

**Cost Tracking**:
- [x] ~~**Touchpoint Tracking** (8-12h)~~ ✅ **COMPLETED**
  - *Status*: 8 touchpoints defined in `LLM_TOUCHPOINTS` constant
  - *Location*: `packages/reg-intel-observability/src/costTracking/touchpoints.ts`
  - Instrumentation already wired into LLM router via `recordLlmCost`
- [x] ~~**Supabase Cost Storage** (6-8h)~~ ✅ **COMPLETED**
  - *Status*: `SupabaseCostStorage` and `SupabaseQuotaProvider` implemented
  - *Location*: `packages/reg-intel-observability/src/costTracking/supabaseProviders.ts`
  - *Migration*: `supabase/migrations/20260101000000_llm_cost_tracking.sql`
  - 13 tests passing, auto-initializes in production

**Total P0 Effort**: 0 hours remaining ~~14-20 hours~~

---

### 3.2 High Priority (P1) - Important for Production ✅ ALL COMPLETED

**Compaction**:
- [x] ~~**SlidingWindowCompactor** (3-4h)~~ ✅ **COMPLETED**
  - *Status*: Fully implemented at `packages/reg-intel-conversations/src/compaction/strategies/SlidingWindowCompactor.ts`
  - *Features*: Configurable window, optional summarization, pinned preservation
- [x] ~~**MinimalMergeCompactor** (2-3h)~~ ✅ **COMPLETED**
  - *Status*: Implemented via ModerateMergeCompactor with minimal config
  - *Features*: Deduplication only, no LLM usage

**Cost Tracking**:
- [x] ~~**Model Pricing Lookup** (4-6h)~~ ✅ **COMPLETED**
  - *Status*: Full pricing service at `packages/reg-intel-observability/src/pricing/`
  - *Features*: All major providers, historical pricing, `calculateLlmCost()` helper
- [x] ~~**Cost Aggregation APIs** (10-12h)~~ ✅ **COMPLETED**
  - *Status*: 5 API endpoints at `apps/demo-web/src/app/api/costs/`
  - *Features*: aggregate, query, total, quotas, quotas/check
- [x] ~~**Cost Alerting** (8-10h)~~ ✅ **COMPLETED** (with stubs)
  - *Status*: Notification service with Slack/Email/PagerDuty stubs
  - *Location*: `packages/reg-intel-observability/src/costTracking/notifications.ts`
  - *Note*: Stubs log to console; replace with real integrations

**Total P1 Effort**: 0 hours remaining (all completed)

---

### 3.3 Medium Priority (P2) - Nice to Have

**Compaction**:
- [ ] **HybridCompactor** (4-5h)
  - *Why*: Advanced strategy for power users
- [ ] **Compaction Utilities** (2-3h)
  - *Why*: Code reuse across strategies
- [ ] **Integration Tests** (6-8h)
  - *Why*: Confidence in production deployment

**Cost Tracking**:
- [x] ~~**Cost Dashboards** (12-15h)~~ ✅ **COMPLETED**
  - *Status*: Main dashboard at `/analytics/costs`
  - *Features*: Summary cards, quota status, breakdowns by provider/model/touchpoint/tenant
- [ ] **Anomaly Detection** (6-8h)
  - *Why*: Advanced cost monitoring
- [ ] **Implement Real Notification Integrations** (4-6h)
  - *Why*: Replace stubs with actual Slack/Email/PagerDuty calls

**Total P2 Effort**: ~20-28 hours (~2-3 days)

---

### 3.4 Low Priority (P3) - Future Enhancements

**Compaction**:
- [x] ~~**MergeNoneCompactor** (1h)~~ ✅ **COMPLETED**
  - *Status*: Uses NoneCompactor via factory
- [x] ~~**Factory Pattern Completion** (1h)~~ ✅ **MOSTLY COMPLETE**
  - *Status*: All current strategies wired, only HybridCompactor remaining

**Cost Tracking**:
- [x] ~~**Historical Pricing Support** (4-6h)~~ ✅ **COMPLETED**
  - *Status*: Pricing service supports date-based lookup
- [ ] **Dashboard Enhancements** (6-8h)
  - *Why*: Additional pages (tenants, models), charts, CSV export

**Total P3 Effort**: ~6-8 hours (~1 day)

---

## 4. Recommended Next Steps

### 4.1 P0 Tasks ✅ ALL COMPLETED

All P0 (Critical) tasks have been completed:
- ✅ Token Counting Infrastructure
- ✅ Touchpoint Tracking
- ✅ Supabase Cost Storage

---

### 4.2 P1 Tasks ✅ ALL COMPLETED

All P1 (High Priority) tasks have been completed:
- ✅ SlidingWindowCompactor
- ✅ MinimalMergeCompactor (via ModerateMergeCompactor config)
- ✅ Model Pricing Lookup
- ✅ Cost Aggregation APIs (5 endpoints)
- ✅ Cost Alerting (with notification stubs)
- ✅ Cost Dashboard at `/analytics/costs`

---

### 4.3 Remaining Work (P2/P3)

**Focus**: Polish and advanced features

1. **Implement Real Notification Integrations** (~4-6h)
   - Replace stubs in `notifications.ts` with actual API calls
   - Slack: Use webhook URL
   - Email: Use nodemailer
   - PagerDuty: Use Events API v2
   - **Deliverable**: Production notifications

2. **HybridCompactor** (~4-5h)
   - Combine SlidingWindow + Semantic strategies
   - Currently falls back to Semantic
   - **Deliverable**: Advanced compaction option

3. **Compaction Utilities & Integration Tests** (~8-11h)
   - Deduplication, hashing, merging utilities
   - End-to-end tests
   - **Deliverable**: Code quality & confidence

4. **Dashboard Enhancements** (~6-8h)
   - Additional pages (tenants, models)
   - Recharts visualizations
   - CSV export
   - **Deliverable**: Better UX

5. **Anomaly Detection** (~6-8h)
   - Spending spike alerts
   - Pattern detection
   - **Deliverable**: Proactive monitoring

**Estimated Remaining Effort**: ~28-38 hours (~3-4 days)

---

## 5. Summary

### 5.1 Total Outstanding Work

| Priority | Tasks | Effort | Status |
|----------|-------|--------|--------|
| **P0 (Critical)** | 0 tasks | 0 hours | ✅ Complete |
| **P1 (High)** | 0 tasks | 0 hours | ✅ Complete |
| **P2 (Medium)** | 5 tasks | 20-28 hours | In Progress |
| **P3 (Low)** | 1 task | 6-8 hours | Future |
| **TOTAL** | **6 tasks** | **26-36 hours** | **3-4 days** |

> **Note**: All P0 and P1 tasks completed on 2026-01-01:
> - Token Counting Infrastructure (Compaction)
> - Touchpoint Tracking (Cost Tracking)
> - Supabase Cost Storage (Cost Tracking)
> - SlidingWindowCompactor (Compaction)
> - MinimalMergeCompactor (Compaction)
> - Model Pricing Lookup (Cost Tracking)
> - Cost Aggregation APIs (Cost Tracking)
> - Cost Alerting with stubs (Cost Tracking)
> - Cost Dashboard (Cost Tracking)

### 5.2 Implementation Completion Status

**Current State** (as of 2026-01-01):
- Compaction: ~80% complete (4/8 strategies + token counting + factory wiring)
- Cost Tracking: ~98% complete (service + storage + APIs + dashboard + alerting stubs)

**Remaining Work**:
- Compaction: HybridCompactor, utilities, integration tests (~12-16h)
- Cost Tracking: Real notification integrations, anomaly detection, dashboard enhancements (~16-22h)

**After Remaining Work (~3-4 days)**:
- Compaction: ~95% complete (HybridCompactor + utilities + tests)
- Cost Tracking: ~100% complete (real integrations + enhancements)

---

## 6. Decision Points

### 6.1 For Product Owner

**Question 1**: Should we prioritize compaction or cost tracking first?

**Recommendation**: **Cost tracking first** (P0 tasks)
- *Reason*: More immediate business value (billing, optimization)
- *Compaction can wait*: Current system works, just inefficient

**Question 2**: Do we need all 8 compaction strategies?

**Recommendation**: **Start with 4 core strategies** (P0+P1)
- ✅ NoneCompactor (already exists)
- ✅ SemanticCompactor (already exists)
- 🆕 SlidingWindowCompactor (simple, fast)
- 🆕 MinimalMergeCompactor (deduplication)
- ⏭️ Defer HybridCompactor, AggressiveMergeCompactor until user demand

**Question 3**: What's the minimum viable product?

**MVP**: P0 + P1 tasks = 7-8 days of work
- Token counting (accurate context measurement)
- Basic compaction strategies (2 path + 2 merge)
- Production cost tracking (storage + touchpoints + alerting)
- Cost aggregation APIs (for billing)

---

## Appendix A: Task Tracking Checklist

### Compaction Tasks

#### Token Counting Infrastructure ✅ COMPLETED
- [x] Add `@dqbd/tiktoken` package dependency
- [x] Create `packages/reg-intel-core/src/tokens/` directory
- [x] Implement `TiktokenCounter` class
- [x] Implement character-based fallback estimator
- [x] Add token count caching
- [x] Write 29 token counting tests (exceeds 15+ target)
- [x] Update documentation

#### Path Compaction Strategies
- [ ] Implement `SlidingWindowCompactor`
- [ ] Implement `HybridCompactor`
- [ ] Add strategy tests (15+ tests)

#### Merge Compaction Strategies
- [ ] Implement `MergeNoneCompactor`
- [ ] Implement `MinimalMergeCompactor`
- [ ] Implement `AggressiveMergeCompactor`
- [ ] Add strategy tests (15+ tests)

#### Utilities & Integration
- [ ] Implement compaction utility functions
- [ ] Complete factory pattern
- [ ] Add integration tests (20+ tests)

---

### Cost Tracking Tasks

#### Infrastructure ✅ COMPLETED
- [x] Implement Supabase cost storage (`SupabaseCostStorage`, `SupabaseQuotaProvider`)
- [x] Create PostgreSQL schema migration (`20260101000000_llm_cost_tracking.sql`)
- [x] Add database indexes (6 indexes for common query patterns)
- [x] Implement data retention policy (optional cleanup function included)
- [x] Add 13 provider tests (all passing)

#### Instrumentation ✅ COMPLETED
- [x] Add touchpoint tracking to all 8 touchpoints (`LLM_TOUCHPOINTS` constant)
- [x] Update OpenTelemetry metrics with touchpoint (via `recordLlmCost`)
- [x] Implement model pricing lookup (existing in `pricingService`)
- [x] Add automatic cost calculation (via `calculateLlmCost`)

#### APIs
- [ ] `/api/costs/aggregate` endpoint
- [ ] `/api/costs/by-tenant` endpoint
- [ ] `/api/costs/by-user` endpoint
- [ ] `/api/costs/by-touchpoint` endpoint
- [ ] `/api/costs/by-model` endpoint
- [ ] `/api/costs/trends` endpoint

#### Alerting & Budgets
- [ ] Wire quota enforcement to production
- [ ] Implement email notifications
- [ ] Implement Slack notifications
- [ ] Build budget dashboard
- [ ] Add anomaly detection

#### Dashboards
- [ ] Platform-wide cost dashboard
- [ ] Tenant comparison view
- [ ] Model efficiency comparison
- [ ] Touchpoint breakdown
- [ ] Export to CSV functionality

---

**Document Status**: Ready for Review
**Next Action**: Approve priority ordering and begin P0 implementation
