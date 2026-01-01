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
| **Compaction Architecture** | 8 strategies + Token counting | 2 strategies + Token counting + APIs + UI | ~70% | 6 strategies |
| **Cost Tracking** | Full architecture with touchpoints | Service + Storage + Tests | ~70% | Touchpoint tracking, Alerting, Aggregation APIs |

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

**Status**: ⚠️ **PARTIAL** (2/4 strategies implemented)

**Implemented**:
- ✅ `SemanticCompactor` - LLM-powered importance scoring
- ✅ `NoneCompactor` - Passthrough (inferred from implementation)

**Missing from Plan** (§ 4 of COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md):

#### 1.2.1 SlidingWindowCompactor
```typescript
// packages/reg-intel-conversations/src/compaction/strategies/SlidingWindowCompactor.ts

/**
 * Keep last N messages, optionally summarize old messages
 *
 * Features:
 * - Configurable window size (default: 50)
 * - Optional summarization of old messages
 * - Pinned message preservation
 * - Token budget enforcement
 */
```
- [ ] Implement sliding window logic
- [ ] Add summarization for old messages
- [ ] Tests for window size handling
- [ ] Tests for pinned message preservation

**Effort**: ~3-4 hours

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

**Status**: ⚠️ **PARTIAL** (1/4 strategies implemented)

**Implemented**:
- ✅ `ModerateMergeCompactor` - Redundancy detection + summarization

**Missing from Plan** (§ 5 of COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md):

#### 1.3.1 MergeNoneCompactor
```typescript
// packages/reg-intel-conversations/src/compaction/strategies/MergeNoneCompactor.ts

/**
 * No compaction - full copy (current behavior)
 * Use when: All context needed, no compression desired
 */
```
- [ ] Implement passthrough compactor
- [ ] Return all messages unchanged
- [ ] Basic tests

**Effort**: ~1 hour

#### 1.3.2 MinimalMergeCompactor
```typescript
// packages/reg-intel-conversations/src/compaction/strategies/MinimalMergeCompactor.ts

/**
 * Deduplication only
 *
 * Features:
 * - Remove duplicate messages
 * - Preserve pinned duplicates
 * - Maintain chronological order
 */
```
- [ ] Implement deduplication logic
- [ ] Message content hashing
- [ ] Preserve pinned duplicates
- [ ] Tests for deduplication

**Effort**: ~2-3 hours

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

**Status**: ⚠️ **PARTIAL** (only some strategies in factory)

**Current** (from `compactionFactory.ts`):
- ✅ `getPathCompactor()` exists
- ✅ `getMergeCompactor()` exists
- ⚠️ Missing strategy implementations

**Missing**:
- [ ] Add SlidingWindowCompactor to `getPathCompactor()`
- [ ] Add HybridCompactor to `getPathCompactor()`
- [ ] Add MergeNoneCompactor to `getMergeCompactor()`
- [ ] Add MinimalMergeCompactor to `getMergeCompactor()`
- [ ] Add AggressiveMergeCompactor to `getMergeCompactor()`
- [ ] Type-safe strategy validation
- [ ] Error handling for unknown strategies

**Effort**: ~1 hour

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

**Status**: ❌ **NOT IMPLEMENTED**

**Planned** (from `LLM_COST_TRACKING_ARCHITECTURE.md` § 5):

```typescript
// packages/reg-intel-observability/src/costTracking/pricing.ts

export interface ModelPricing {
  provider: string
  model: string
  inputPricePer1MTokens: number
  outputPricePer1MTokens: number
  effectiveDate: Date
  deprecated?: boolean
}

export function getModelPricing(provider: string, model: string): ModelPricing | null

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number; totalCost: number }
```

**Missing**:
- [ ] Model pricing data structure
- [ ] Pricing database (in-memory or persistent)
- [ ] Pricing lookup function
- [ ] Cost calculation utility
- [ ] Pricing update mechanism
- [ ] Historical pricing support

**Current Workaround**: Manual cost calculation in test files

**Effort**: ~4-6 hours

---

### 2.3 Cost Aggregation APIs

**Status**: ❌ **NOT IMPLEMENTED**

**Planned** (from `LLM_COST_TRACKING_ARCHITECTURE.md` § 7):

```typescript
// apps/demo-web/src/app/api/costs/aggregate/route.ts

GET /api/costs/aggregate?
  scope=tenant|user|platform&
  tenantId=abc&
  userId=xyz&
  startDate=2025-01-01&
  endDate=2025-01-31&
  groupBy=day|provider|model|touchpoint

Response:
{
  aggregates: [
    {
      date: '2025-01-15',
      provider: 'openai',
      model: 'gpt-4',
      touchpoint: 'main-chat',
      totalCostUsd: 12.45,
      inputTokens: 125000,
      outputTokens: 87000,
      requestCount: 450
    }
  ],
  summary: {
    totalCostUsd: 1234.56,
    totalRequests: 5670,
    averageCostPerRequest: 0.22
  }
}
```

**Missing API Endpoints**:
- [ ] `/api/costs/aggregate` - Multi-dimensional aggregation
- [ ] `/api/costs/by-tenant` - Per-tenant cost breakdown
- [ ] `/api/costs/by-user` - Per-user cost breakdown
- [ ] `/api/costs/by-touchpoint` - Per-touchpoint analysis
- [ ] `/api/costs/by-model` - Model comparison
- [ ] `/api/costs/trends` - Time series analysis

**Effort**: ~10-12 hours

---

### 2.4 Cost Alerting & Budgets

**Status**: ⚠️ **PARTIAL** (quota enforcement implemented, not wired to production)

**Implemented**:
- ✅ `CostTrackingService` with quota enforcement
- ✅ `onQuotaWarning` callback
- ✅ `onQuotaExceeded` callback
- ✅ Tests for quota enforcement

**Missing**:
- [ ] Production quota configuration (no defaults set)
- [ ] Quota warning email notifications
- [ ] Quota exceeded alerts to Slack/PagerDuty
- [ ] Per-tenant quota configuration UI
- [ ] Budget dashboard showing quota usage
- [ ] Anomaly detection (spending spike alerts)
- [ ] Daily/monthly cost reports

**Effort**: ~8-10 hours

---

### 2.5 Cost Storage Providers

**Status**: ⚠️ **PARTIAL** (interface defined, only in-memory implementation)

**Implemented**:
- ✅ `CostStorageProvider` interface
- ✅ In-memory storage for testing

**Missing**:
- [ ] Supabase storage provider
  ```typescript
  class SupabaseCostStorage implements CostStorageProvider {
    // Table: llm_cost_records
    // Columns: id, timestamp, provider, model, tenant_id, user_id,
    //          touchpoint, input_tokens, output_tokens, cost_usd,
    //          conversation_id, success, duration_ms
  }
  ```
- [ ] PostgreSQL schema migration
- [ ] Indexes for fast querying (tenant_id, timestamp)
- [ ] Data retention policy (90 days default)
- [ ] Cost record archival

**Effort**: ~6-8 hours

---

### 2.6 Cost Dashboards & Visualization

**Status**: ❌ **NOT IMPLEMENTED**

**Planned** (from `LLM_COST_TRACKING_ARCHITECTURE.md` § 7.3):

```typescript
// apps/demo-web/src/app/analytics/costs/page.tsx

/**
 * Platform-wide cost dashboard
 *
 * Sections:
 * 1. Total spend card (today, week, month)
 * 2. Spend by provider (OpenAI, Anthropic, Google, Groq)
 * 3. Spend by touchpoint (chart)
 * 4. Spend by tenant (top 10)
 * 5. Model efficiency comparison
 * 6. Cost trends (line chart)
 */
```

**Missing Pages**:
- [ ] `/analytics/costs` - Platform-wide dashboard
- [ ] `/analytics/costs/tenants` - Tenant comparison
- [ ] `/analytics/costs/models` - Model performance vs cost
- [ ] `/analytics/costs/touchpoints` - Touchpoint breakdown
- [ ] Recharts integration for visualizations
- [ ] Export to CSV functionality

**Effort**: ~12-15 hours

---

## 3. Priority Assessment

### 3.1 Critical (P0) - Blocking Production Use

**Compaction**:
- [x] ~~**Token Counting Infrastructure** (8-12h)~~ ✅ **COMPLETED**
  - *Status*: Fully implemented with 29 passing tests
  - *Location*: `packages/reg-intel-core/src/tokens/`

**Cost Tracking**:
- [ ] **Touchpoint Tracking** (8-12h)
  - *Why*: Cannot identify expensive parts of the system without this
  - *Enables*: Cost optimization decisions
- [ ] **Supabase Cost Storage** (6-8h)
  - *Why*: In-memory storage not suitable for production
  - *Blocks*: Historical cost queries, billing

**Total P0 Effort**: 14-20 hours (~2-3 days) ~~22-32 hours~~

---

### 3.2 High Priority (P1) - Important for Production

**Compaction**:
- [ ] **SlidingWindowCompactor** (3-4h)
  - *Why*: Simple, predictable strategy for most users
  - *Enables*: Auto-compaction without LLM overhead
- [ ] **MinimalMergeCompactor** (2-3h)
  - *Why*: Deduplication is low-risk, high-value
  - *Enables*: Better merge experience

**Cost Tracking**:
- [ ] **Model Pricing Lookup** (4-6h)
  - *Why*: Automatic cost calculation vs manual
  - *Enables*: Real-time cost estimates
- [ ] **Cost Aggregation APIs** (10-12h)
  - *Why*: Enable cost reporting and billing
  - *Enables*: Multi-tenant billing, usage reports
- [ ] **Cost Alerting** (8-10h)
  - *Why*: Prevent runaway costs
  - *Enables*: Proactive cost management

**Total P1 Effort**: 27-35 hours (~3-4 days)

---

### 3.3 Medium Priority (P2) - Nice to Have

**Compaction**:
- [ ] **HybridCompactor** (4-5h)
  - *Why*: Advanced strategy for power users
- [ ] **AggressiveMergeCompactor** (3-4h)
  - *Why*: Maximum compression for large branches
- [ ] **Compaction Utilities** (2-3h)
  - *Why*: Code reuse across strategies
- [ ] **Integration Tests** (6-8h)
  - *Why*: Confidence in production deployment

**Cost Tracking**:
- [ ] **Cost Dashboards** (12-15h)
  - *Why*: Better visibility, but APIs work without UI
- [ ] **Anomaly Detection** (6-8h)
  - *Why*: Advanced cost monitoring

**Total P2 Effort**: 33-43 hours (~4-5 days)

---

### 3.4 Low Priority (P3) - Future Enhancements

**Compaction**:
- [ ] **MergeNoneCompactor** (1h)
  - *Why*: Already default behavior, formalization only
- [ ] **Factory Pattern Completion** (1h)
  - *Why*: Works with partial implementation

**Cost Tracking**:
- [ ] **Historical Pricing Support** (4-6h)
  - *Why*: For accurate historical cost analysis

**Total P3 Effort**: 6-8 hours (~1 day)

---

## 4. Recommended Next Steps

### 4.1 Immediate (This Week)

**Focus**: Unblock production use

1. ~~**Implement Token Counting Infrastructure** (P0)~~ ✅ **COMPLETED**
   - Token counting is fully implemented at `packages/reg-intel-core/src/tokens/`
   - 29 tests passing, exported from main package
   - **Deliverable**: ✅ Accurate token counting for compaction

2. **Instrument Touchpoint Tracking** (P0)
   - Add `touchpoint` field to cost records
   - Instrument all 8 touchpoints
   - Update OpenTelemetry metrics
   - **Deliverable**: Know where LLM costs come from

3. **Implement Supabase Cost Storage** (P0)
   - Create PostgreSQL table
   - Implement `SupabaseCostStorage`
   - Add indexes and retention policy
   - **Deliverable**: Persistent cost data

**Estimated Effort**: 22-32 hours (3-4 days)

---

### 4.2 Short Term (Next 2 Weeks)

**Focus**: Production-ready features

4. **Implement SlidingWindowCompactor** (P1)
   - Simple, non-LLM strategy
   - Tests and integration
   - **Deliverable**: Auto-compaction without AI overhead

5. **Implement MinimalMergeCompactor** (P1)
   - Deduplication logic
   - Merge flow integration
   - **Deliverable**: Better merge UX

6. **Build Cost Aggregation APIs** (P1)
   - 6 API endpoints
   - Multi-dimensional queries
   - **Deliverable**: Cost reporting infrastructure

7. **Wire Up Cost Alerting** (P1)
   - Email notifications
   - Slack integration
   - Budget dashboard
   - **Deliverable**: Proactive cost management

**Estimated Effort**: 27-35 hours (3-4 days)

---

### 4.3 Medium Term (Next Month)

**Focus**: Advanced features and polish

8. **Complete Compaction Strategies** (P2)
   - HybridCompactor
   - AggressiveMergeCompactor
   - Utilities
   - **Deliverable**: Full strategy suite

9. **Build Cost Dashboards** (P2)
   - Platform dashboard
   - Tenant/model/touchpoint views
   - Visualizations
   - **Deliverable**: Cost visibility UI

10. **Add Integration Tests** (P2)
    - Path compaction tests
    - Merge compaction tests
    - Error handling tests
    - **Deliverable**: Confidence in production

**Estimated Effort**: 33-43 hours (4-5 days)

---

## 5. Summary

### 5.1 Total Outstanding Work

| Priority | Tasks | Effort | Timeline |
|----------|-------|--------|----------|
| **P0 (Critical)** | 2 tasks | 14-20 hours | 2-3 days |
| **P1 (High)** | 5 tasks | 27-35 hours | 3-4 days |
| **P2 (Medium)** | 6 tasks | 33-43 hours | 4-5 days |
| **P3 (Low)** | 3 tasks | 6-8 hours | 1 day |
| **TOTAL** | **16 tasks** | **80-106 hours** | **10-13 days** |

> **Note**: Token Counting Infrastructure (P0) was completed on 2026-01-01.

### 5.2 Implementation Completion Status

**Current State** (as of 2026-01-01):
- Compaction: ~70% complete (2/8 strategies + token counting infrastructure)
- Cost Tracking: ~70% complete (service + storage + tests, missing production features)

**After P0+P1 (5-7 days)**:
- Compaction: ~80% complete (4/8 strategies)
- Cost Tracking: ~90% complete (production-ready)

**After P0+P1+P2 (10-12 days)**:
- Compaction: ~95% complete (8/8 strategies + tests)
- Cost Tracking: ~100% complete (full dashboard + alerting)

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

#### Infrastructure
- [ ] Implement Supabase cost storage
- [ ] Create PostgreSQL schema migration
- [ ] Add database indexes
- [ ] Implement data retention policy

#### Instrumentation
- [ ] Add touchpoint tracking to all 8 touchpoints
- [ ] Update OpenTelemetry metrics with touchpoint
- [ ] Implement model pricing lookup
- [ ] Add automatic cost calculation

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
