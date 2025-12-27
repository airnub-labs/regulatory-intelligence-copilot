# Outstanding Work & Implementation Plan

> **Last Updated**: 2025-12-27
> **Status**: Consolidated review of all architecture documents
> **Previous Update**: 2025-12-24

---

## Executive Summary

This document consolidates all outstanding work identified from reviewing the architecture documentation (v0.6, v0.7), implementation plans, and current codebase state.

### Overall Status

| Architecture Version | Feature Set | Backend | UI | Integration |
|---------------------|-------------|---------|-----|-------------|
| v0.6 | Conversation Branching & Merging | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.6 | AI Merge Summarization | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.6 | Message Pinning | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.6 | Concept Capture & Graph | ⚠️ 40% | N/A | ⚠️ Partial |
| v0.6 | Conversation Persistence | ⚠️ 75% | ⚠️ 70% | ⚠️ In-memory only |
| v0.7 | E2B Execution Contexts | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.7 | EgressGuard (All Egress Points) | ✅ Complete | N/A | ✅ Wired |
| v0.7 | Observability & Cleanup | ✅ Complete | N/A | ✅ Wired |
| v0.7 | Client Telemetry | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.7 | Logging Framework | ✅ Complete | N/A | ✅ Wired |

---

## 1. Recently Completed Work (Since 2025-12-24)

### 1.1 Client Telemetry Architecture ✅

**Reference**: `docs/architecture/client-telemetry-architecture-v1.md`

| Component | Status |
|-----------|--------|
| Client-side batching (TelemetryBatchQueue) | ✅ Complete |
| Server-side rate limiting (per IP) | ✅ Complete |
| OTEL Collector forwarding | ✅ Complete |
| Page unload handlers | ✅ Complete |
| Timestamp validation | ✅ Complete |

**PRs**: #179 (timestamp validation), #178 (logging wiring)

### 1.2 Logging Framework Wiring ✅

**Reference**: PR #178

| Component | Status |
|-----------|--------|
| Pino structured logging | ✅ Wired |
| Demo server endpoint logging | ✅ Complete |
| Core component logging | ✅ Complete |
| Trace propagation | ✅ Complete |

### 1.3 Quality & Stability Fixes ✅

**PRs**: #175, #174, #172, #171

| Fix | PR | Status |
|-----|-----|--------|
| Chat UI race condition on second message | #175 | ✅ Fixed |
| OpenTelemetry package resolution | #174 | ✅ Fixed |
| ESLint warnings & TypeScript build errors | #172 | ✅ Fixed |
| Non-existent @opentelemetry/instrumentation-next | #171 | ✅ Fixed |

---

## 2. Outstanding Work - HIGH Priority

### 2.1 HIGH: Scenario Engine Implementation

**Priority**: HIGH (Feature Gap)
**Effort**: 2-3 weeks
**Reference**: `docs/architecture/engines/scenario-engine/spec_v_0_1.md`

**Description**: The Scenario Engine is fully documented in architecture but has **zero implementation**. This is a core feature for regulatory "what-if" analysis.

**Current State**:
- ✅ Architecture spec complete (`spec_v_0_1.md`)
- ❌ No runtime code exists
- ❌ No integration hooks exercised
- ❌ No tests

**Tasks**:

- [ ] **Task S.1**: Implement `ScenarioEngine` service
  - Core evaluation logic for hypothetical scenarios
  - Rule matching against regulatory graph
  - Impact assessment calculations

- [ ] **Task S.2**: Create scenario tools for LLM agents
  - `create_scenario` tool
  - `evaluate_scenario` tool
  - `compare_scenarios` tool

- [ ] **Task S.3**: Wire into ComplianceEngine orchestration
  - Add scenario-aware agent flows
  - Connect to conversation context

- [ ] **Task S.4**: Add unit and integration tests

---

### 2.2 HIGH: Redis/Distributed SSE Fan-out

**Priority**: HIGH (Production Blocker)
**Effort**: 1-2 weeks
**Reference**: `docs/development/V0_6_IMPLEMENTATION_STATUS.md`

**Description**: Current SSE implementation uses single-instance in-memory event hub. **Will not scale horizontally** in production.

**Current State**:
- ✅ Single-instance EventHub works (`packages/reg-intel-conversations/src/eventHub.ts`)
- ❌ No Redis/pub-sub integration
- ❌ Rate limiting is in-memory only
- ❌ No distributed session handling

**Tasks**:

- [ ] **Task R.1**: Add Redis pub/sub for SSE events
  ```typescript
  // packages/reg-intel-conversations/src/redisEventHub.ts
  export class RedisEventHub implements EventHub {
    private redis: Redis;
    private subscriber: Redis;
    // ...
  }
  ```

- [ ] **Task R.2**: Implement distributed rate limiting
  - Redis-backed rate limiter for client telemetry
  - Feature flag to switch between in-memory and Redis

- [ ] **Task R.3**: Add health checks for Redis connectivity

- [ ] **Task R.4**: Update deployment documentation

---

### 2.3 HIGH: Test Coverage for reg-intel-prompts

**Priority**: HIGH (Quality Gap)
**Effort**: 4-6 hours
**Reference**: `packages/reg-intel-prompts/`

**Description**: The `reg-intel-prompts` package has **zero test coverage** despite being 409 lines of critical prompt composition logic.

**Untested Files**:
- `promptAspects.ts` (243 lines) - Prompt aspect middleware
- `applyAspects.ts` (106 lines) - Aspect pipeline executor
- `constants.ts` (20 lines) - Shared constants

**Tasks**:

- [ ] **Task T.1**: Create `promptAspects.test.ts`
  - Test jurisdiction aspect injection
  - Test agent context aspect
  - Test disclaimer aspect
  - Test conversation context aspect
  - Test aspect composition order

- [ ] **Task T.2**: Create `applyAspects.test.ts`
  - Test aspect pipeline execution
  - Test error handling in aspects
  - Test async aspect support

---

## 3. Outstanding Work - MEDIUM Priority

### 3.1 MEDIUM: OpenFGA/ReBAC Authorization Integration

**Priority**: MEDIUM (Security Feature)
**Effort**: 1-2 weeks
**Reference**: `packages/reg-intel-conversations/src/conversationStores.ts` (lines 23-30)

**Description**: Authorization types are defined but no actual integration with OpenFGA, SpiceDB, or Permify exists.

**Current State**:
- ✅ Types defined (`AuthorizationModel`, `AuthorizationSpec`)
- ✅ Supports 'openfga', 'spicedb', 'permify' in types
- ❌ No service integration
- ❌ No permission checking at runtime

**Tasks**:

- [ ] **Task A.1**: Implement OpenFGA client wrapper
- [ ] **Task A.2**: Add permission checks to conversation stores
- [ ] **Task A.3**: Wire authorization into API routes
- [ ] **Task A.4**: Add tests for authorization flows

---

### 3.2 MEDIUM: Supabase Conversation Persistence

**Priority**: MEDIUM (Production Readiness)
**Effort**: 1 week
**Reference**: `docs/development/V0_6_IMPLEMENTATION_STATUS.md`

**Description**: Conversation persistence currently uses in-memory stores. Supabase-backed stores need to be wired for production.

**Current State**:
- ✅ Schema exists (`supabase/migrations/`)
- ✅ `SupabaseConversationStore` interface defined
- ✅ In-memory fallback works
- ⚠️ Supabase implementation partial
- ❌ Not wired in production API routes
- ❌ Pagination not implemented

**Tasks**:

- [ ] **Task P.1**: Complete `SupabaseConversationStore` implementation
- [ ] **Task P.2**: Wire Supabase store when env vars present
- [ ] **Task P.3**: Add pagination to `/api/conversations` endpoint
- [ ] **Task P.4**: Add RLS policies for multi-tenant usage

---

### 3.3 MEDIUM: Missing API Integration Tests

**Priority**: MEDIUM (Quality)
**Effort**: 4-6 hours

**Description**: Several API endpoints lack integration tests.

**Missing Tests**:

| Endpoint | Test File Needed | Status |
|----------|-----------------|--------|
| `/api/conversations/[id]/messages/[messageId]/pin` | `pin/route.test.ts` | ❌ Missing |
| `/api/cron/cleanup-contexts` | `cleanupExecutionContexts.test.ts` | ❌ Missing |
| Version Navigator E2E | `version-navigator.e2e.ts` | ❌ Missing |

**Tasks**:

- [ ] **Task IT.1**: Create message pinning API tests
- [ ] **Task IT.2**: Create cleanup job integration tests
- [ ] **Task IT.3**: Create version navigator E2E tests

---

## 4. Outstanding Work - LOW Priority

### 4.1 LOW: Metrics Dashboard (Deferred)

**Priority**: LOW
**Effort**: 4-6 hours
**Reference**: `docs/architecture/E2B_ARCHITECTURE.md` Future Enhancements

**Description**: Add metrics collection for sandbox operations. Deferred until production usage patterns are better understood.

**Tasks**:

- [ ] **Task M.1**: Add OpenTelemetry metrics
  ```typescript
  const METRICS = {
    contextsCreated: 'execution_context.created.total',
    contextsTerminated: 'execution_context.terminated.total',
    executionsTotal: 'execution_context.executions.total',
    executionDurationMs: 'execution_context.execution.duration_ms',
    activeContextsGauge: 'execution_context.active.count',
  };
  ```

- [ ] **Task M.2**: Create `/metrics` endpoint (if not using external collector)

- [ ] **Task M.3**: Set up Grafana/DataDog dashboard (optional)

---

### 4.2 LOW: Graph View & Context Ribbon Enhancement

**Priority**: LOW
**Effort**: 1 week
**Reference**: `docs/development/V0_6_IMPLEMENTATION_STATUS.md`

**Description**: Basic ribbon present but deeper integration needed.

**Current State**:
- ✅ Basic ribbon exists (`apps/demo-web/src/components/chat/path-toolbar.tsx`)
- ✅ Graph visualization works (767 lines in `GraphVisualization.tsx`)
- ⚠️ Context node highlighting incomplete
- ⚠️ Timeline visualization missing
- ⚠️ Scenario state display missing

**Tasks**:

- [ ] **Task G.1**: Add graph context node highlighting
- [ ] **Task G.2**: Implement timeline visualization
- [ ] **Task G.3**: Add scenario state display
- [ ] **Task G.4**: Improve ribbon metadata rendering

---

### 4.3 LOW: Timeline Engine Expansion

**Priority**: LOW
**Effort**: 3-4 days
**Reference**: `docs/architecture/engines/timeline-engine/`

**Description**: Baseline engine exists but needs more scenarios and integration.

**Current State**:
- ✅ Engine implemented (`packages/reg-intel-core/src/timeline/`)
- ✅ Good test coverage (370 lines)
- ⚠️ Limited scenario variety
- ⚠️ Not deeply integrated with conversation context

**Tasks**:

- [ ] **Task TL.1**: Add more timeline scenarios
- [ ] **Task TL.2**: Connect to persisted conversation context
- [ ] **Task TL.3**: Add UI visualization component

---

### 4.4 LOW: Concept Capture Expansion

**Priority**: LOW
**Effort**: 1 week
**Reference**: `docs/architecture/conversation-context/concept_capture_v_0_1.md`

**Description**: Capture tool wiring exists but needs fuller coverage.

**Current State**:
- ✅ Capture tool wired
- ✅ Basic ingestion paths
- ⚠️ Graph write service minimal tests (2 tests only)
- ⚠️ Not all concept types covered

**Tasks**:

- [ ] **Task CC.1**: Expand graph write service coverage
- [ ] **Task CC.2**: Add tests for all concept types
- [ ] **Task CC.3**: Wire comprehensive ingestion scenarios

---

### 4.5 LOW: UI Enhancements

**Priority**: LOW
**Effort**: Various

**Missing UI Features**:
- Conversation export functionality
- Advanced search
- Batch operations
- Dark mode theme switcher (partial)

---

## 5. Completed Work Archive

### 5.1 Conversation Branching & Merging (v0.6) ✅

All phases complete - see `docs/architecture/IMPLEMENTATION-PLAN.md`

### 5.2 E2B Execution Contexts (v0.7) ✅

All phases complete - see `docs/architecture/execution-context/IMPLEMENTATION_PLAN.md`

### 5.3 AI Merge Summarization ✅

Fully implemented with regulatory-focused prompts.

### 5.4 Message Pinning ✅

Backend and UI complete with SSE real-time updates.

### 5.5 EgressGuard End-to-End ✅

All egress points protected:
- ✅ Outbound LLM requests sanitized
- ✅ LLM responses sanitized before client
- ✅ Sandbox output sanitized
- ✅ Agent outputs sanitized (defense-in-depth)

### 5.6 Cleanup Cron Job ✅

Hourly cleanup of expired execution contexts via Vercel Cron.

### 5.7 PathAwareMessageList Integration ✅

Component fully wired with version navigation, editing, and pinning.

### 5.8 Version Navigator ✅

Branch navigation with preview cards fully functional.

---

## 6. Implementation Priority Order

### Phase A: Production Blockers (Must Fix)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.2 Redis SSE Fan-out | HIGH | 1-2 weeks | None |
| 2.3 Test Coverage (prompts) | HIGH | 4-6h | None |
| 3.2 Supabase Persistence | MEDIUM | 1 week | None |

### Phase B: Feature Completion

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.1 Scenario Engine | HIGH | 2-3 weeks | None |
| 3.1 OpenFGA Integration | MEDIUM | 1-2 weeks | None |
| 3.3 API Integration Tests | MEDIUM | 4-6h | None |

### Phase C: Polish (Deferred)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 4.1 Metrics Dashboard | LOW | 4-6h | Production usage data |
| 4.2 Graph/Ribbon Enhancement | LOW | 1 week | None |
| 4.3 Timeline Expansion | LOW | 3-4 days | None |
| 4.4 Concept Capture | LOW | 1 week | None |

---

## 7. Test Coverage Summary

### Packages with Good Coverage

| Package | Test Files | Status |
|---------|------------|--------|
| reg-intel-conversations | 5 tests | ✅ Good |
| reg-intel-llm | 6 tests | ✅ Good |
| reg-intel-core | 8 tests | ✅ Good |
| reg-intel-observability | 3 tests | ✅ Adequate |

### Packages Needing Coverage

| Package | Lines | Tests | Issue |
|---------|-------|-------|-------|
| reg-intel-prompts | 409 | 0 | ❌ CRITICAL: Zero tests |
| reg-intel-graph | ~200 | 2 | ⚠️ Minimal coverage |
| reg-intel-next-adapter | ~7,600 | 0 | ⚠️ No tests |

### Missing Integration Tests

- ❌ Message pinning API (`/api/.../pin/route.test.ts`)
- ❌ Cleanup job (`cleanupExecutionContexts.test.ts`)
- ❌ Version navigator E2E

---

## 8. Document Cross-References

| Document | Purpose | Location |
|----------|---------|----------|
| Architecture v0.6 | Conversation branching, concept capture | `docs/architecture/architecture_v_0_6.md` |
| Architecture v0.7 | E2B execution contexts, code tools | `docs/architecture/architecture_v_0_7.md` |
| Branching & Merging | Detailed branching UX and data model | `docs/architecture/conversation-branching-and-merging.md` |
| E2B Architecture | Sandbox lifecycle and integration | `docs/architecture/E2B_ARCHITECTURE.md` |
| Execution Context Spec | Formal spec for per-path contexts | `docs/architecture/execution-context/spec_v_0_1.md` |
| Message Pinning | Pinning for compaction control | `docs/architecture/MESSAGE_PINNING.md` |
| Client Telemetry | Batching, rate limiting, OTEL | `docs/architecture/client-telemetry-architecture-v1.md` |
| V0.6 Implementation Status | Subsystem status tracker | `docs/development/V0_6_IMPLEMENTATION_STATUS.md` |
| Scenario Engine Spec | What-if analysis engine | `docs/architecture/engines/scenario-engine/spec_v_0_1.md` |

---

## 9. Environment Variables Required

```env
# Existing (Required)
E2B_API_KEY=ek_***
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=***

# Cleanup Job
CRON_SECRET=***  # For securing cron endpoint

# Client Telemetry
NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT=/api/client-telemetry
NEXT_PUBLIC_CLIENT_TELEMETRY_BATCH_SIZE=20
NEXT_PUBLIC_CLIENT_TELEMETRY_FLUSH_INTERVAL_MS=2000
CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS=60000
CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=100

# OTEL (Optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_COLLECTOR_ENDPOINT=http://localhost:4318/v1/logs
OTEL_COLLECTOR_TIMEOUT_MS=5000

# Future (Redis)
REDIS_URL=redis://localhost:6379  # For distributed SSE
```

---

## 10. Summary

**Total Outstanding Effort**: ~6-8 weeks

| Priority | Items | Effort Range |
|----------|-------|--------------|
| HIGH | 3 | 3-4 weeks |
| MEDIUM | 3 | 2-3 weeks |
| LOW | 5 | 3-4 weeks |

### Critical Gaps Identified

1. **Scenario Engine** - Fully documented, zero implementation
2. **Redis SSE** - Production scaling blocker
3. **reg-intel-prompts tests** - Critical package with 0% coverage
4. **OpenFGA integration** - Authorization types exist, no runtime

### Production Readiness Checklist

- [x] EgressGuard fully wired
- [x] Client telemetry with batching
- [x] Logging framework wired
- [x] Execution context cleanup job
- [ ] Redis/distributed SSE (BLOCKER)
- [ ] Supabase persistence wired
- [ ] Authorization service integrated
- [ ] Full test coverage

---

**Document Version**: 3.0
**Last Updated**: 2025-12-27
**Previous Versions**: 2.7 (2025-12-24), 2.6, 2.5, 2.4, 2.3, 2.2, 2.1, 2.0, 1.0
**Author**: Claude Code
