# Outstanding Work & Implementation Plan

> **Last Updated**: 2025-12-27
> **Status**: Comprehensive codebase review and gap analysis
> **Previous Update**: 2025-12-27

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
| v0.6 | Conversation Persistence | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.6 | Distributed SSE Fan-out | ✅ Complete | N/A | ✅ Wired |
| v0.6 | OpenFGA/ReBAC Authorization | ✅ Complete | N/A | ✅ Wired |
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

### 2.2 HIGH: Redis/Distributed SSE Fan-out ✅ COMPLETED

**Priority**: HIGH (Production Blocker)
**Effort**: 1-2 weeks
**Reference**: `docs/development/V0_6_IMPLEMENTATION_STATUS.md`
**Completed**: 2025-12-27

**Description**: SSE implementation now supports distributed Redis-backed event broadcasting for horizontal scaling.

**Current State**:
- ✅ Single-instance EventHub works (`packages/reg-intel-conversations/src/eventHub.ts`)
- ✅ Redis/list-based event distribution (`packages/reg-intel-conversations/src/redisEventHub.ts`)
- ✅ Rate limiting is Redis-backed (`apps/demo-web/src/lib/rateLimiter.ts`)
- ✅ Automatic fallback to in-memory when Redis not configured
- ✅ Health checks for Redis connectivity
- ✅ Feature flags via environment variables

**Completed Tasks**:

- [x] **Task R.1**: Add Redis pub/sub for SSE events ✅
  - Implemented `RedisConversationEventHub` class
  - Implemented `RedisConversationListEventHub` class
  - Uses Redis lists with LPOP polling (compatible with Upstash HTTP API)
  - Broadcasts to local subscribers immediately for low latency
  - Publishes to Redis for cross-instance distribution

- [x] **Task R.2**: Implement distributed rate limiting ✅
  - Redis-backed rate limiter already implemented
  - Feature flag to switch between in-memory and Redis
  - Uses Upstash Ratelimit with sliding window algorithm

- [x] **Task R.3**: Add health checks for Redis connectivity ✅
  - `healthCheck()` method on both event hub classes
  - Automatic health check on startup with logging

- [x] **Task R.4**: Update deployment documentation ✅
  - Environment variables documented in `docker/REDIS.md`
  - Configuration wired in `apps/demo-web/src/lib/server/conversations.ts`

**Environment Variables**:
```bash
# Use Redis for distributed SSE (recommended for production with multiple instances)
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# Or use standard Redis
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=your_password

# If not set, falls back to in-memory (single instance only)
```

**Files Changed**:
- `packages/reg-intel-conversations/src/redisEventHub.ts` - New Redis-backed event hubs
- `packages/reg-intel-conversations/src/redisEventHub.test.ts` - Unit tests
- `packages/reg-intel-conversations/src/index.ts` - Export new classes
- `packages/reg-intel-conversations/package.json` - Add @upstash/redis dependency
- `apps/demo-web/src/lib/server/conversations.ts` - Wire up Redis event hubs with fallback

---

### 2.3 HIGH: Test Coverage for reg-intel-prompts ✅ COMPLETED

**Priority**: HIGH (Quality Gap)
**Effort**: 4-6 hours
**Reference**: `packages/reg-intel-prompts/`
**Completed**: 2025-12-27

**Description**: Comprehensive test coverage for the `reg-intel-prompts` package covering all prompt composition logic.

**Current State**:
- ✅ `promptAspects.test.ts` (42 tests) - All aspects tested
- ✅ `applyAspects.test.ts` (15 tests) - Pipeline and patterns tested
- ✅ `constants.test.ts` (10 tests) - Constants validated
- ✅ 67 total tests, all passing

**Completed Tasks**:

- [x] **Task T.1**: Create `promptAspects.test.ts` ✅
  - ✅ Jurisdiction aspect injection (single, multiple, profile fallback)
  - ✅ Agent context aspect (agentId, agentDescription)
  - ✅ Profile context aspect (all persona types)
  - ✅ Disclaimer aspect (with duplication prevention)
  - ✅ Additional context aspect (multiple strings)
  - ✅ Conversation context aspect (summary, nodes, both)
  - ✅ Aspect composition order verification
  - ✅ Builder creation and customization
  - ✅ defaultPromptBuilder and buildPromptWithAspects

- [x] **Task T.2**: Create `applyAspects.test.ts` ✅
  - ✅ Aspect pipeline execution (single, multiple)
  - ✅ Request/response modification
  - ✅ Error handling and propagation
  - ✅ Error transformation in aspects
  - ✅ Async aspect support
  - ✅ Common patterns: logging, caching, validation, sanitization
  - ✅ Aspect composition with spies

- [x] **Task T.3**: Create `constants.test.ts` ✅
  - ✅ NON_ADVICE_DISCLAIMER validation
  - ✅ UNCERTAINTY_DESCRIPTIONS structure
  - ✅ Content verification for all levels
  - ✅ Formatting checks

**Test Coverage Details**:
```typescript
// 67 total tests across 3 test files
- promptAspects.test.ts: 42 tests
- applyAspects.test.ts: 15 tests
- constants.test.ts: 10 tests
```

**Files Changed**:
- `packages/reg-intel-prompts/src/promptAspects.test.ts` - 42 comprehensive tests
- `packages/reg-intel-prompts/src/applyAspects.test.ts` - 15 pipeline tests
- `packages/reg-intel-prompts/src/constants.test.ts` - 10 constant tests

---

## 3. Outstanding Work - MEDIUM Priority

### 3.1 MEDIUM: OpenFGA/ReBAC Authorization Integration ✅ COMPLETED

**Priority**: MEDIUM (Security Feature)
**Effort**: 1-2 weeks
**Reference**: `packages/reg-intel-conversations/src/authorizationService.ts`
**Completed**: 2025-12-27

**Description**: Unified authorization service with optional OpenFGA support and automatic fallback to Supabase RLS.

**Current State**:
- ✅ Types defined (`AuthorizationModel`, `AuthorizationSpec`)
- ✅ `SupabaseRLSAuthorizationService` - RLS-based authorization (default)
- ✅ `OpenFGAAuthorizationService` - OpenFGA Check API integration
- ✅ `HybridAuthorizationService` - Automatic fallback pattern
- ✅ Per-conversation authorization model configuration
- ✅ Fail-closed security (deny on error)
- ✅ Comprehensive test coverage (27 tests)

**Completed Tasks**:

- [x] **Task A.1**: Implement OpenFGA client wrapper ✅
  - Direct integration with OpenFGA Check API
  - Support for `can_view` and `can_edit` relations
  - Health check endpoint for connectivity monitoring
  - Configurable store ID and authorization model ID

- [x] **Task A.2**: Add authorization service abstraction ✅
  - `AuthorizationService` interface with `canRead` and `canWrite` methods
  - Three implementations: SupabaseRLS, OpenFGA, Hybrid
  - Factory function `createAuthorizationService()` for easy instantiation
  - Support for system roles (assistant, system) always allowed

- [x] **Task A.3**: Wire authorization into server configuration ✅
  - Environment variable configuration (OPENFGA_API_URL, OPENFGA_STORE_ID, OPENFGA_AUTHORIZATION_MODEL_ID)
  - Automatic initialization with logging
  - Exported `openfgaConfig` for use in API routes
  - Documentation in `.env.local.example`

- [x] **Task A.4**: Add tests for authorization flows ✅
  - 27 comprehensive unit tests covering all three services
  - Tests for public, tenant, and private conversations
  - Tests for RLS policies (owner, audience, tenant access)
  - Tests for OpenFGA Check API integration
  - Tests for hybrid fallback behavior
  - Tests for error handling and fail-closed security

**Authorization Models**:

1. **Supabase RLS** (default):
   - Uses `shareAudience` (public, tenant, private)
   - Uses `tenantAccess` (read, edit) for tenant-shared conversations
   - Owner-based access for private conversations

2. **OpenFGA** (optional):
   - Fine-grained relationship-based access control (ReBAC)
   - Checks `user:userId` → `can_view` → `conversation:conversationId`
   - Checks `user:userId` → `can_edit` → `conversation:conversationId`

3. **Hybrid** (production):
   - Uses OpenFGA if configured and conversation has `authorizationModel: 'openfga'`
   - Falls back to RLS on OpenFGA errors (using `fallbackShareAudience`)
   - Graceful degradation for resilience

**Environment Variables**:
```bash
# OpenFGA Authorization (optional)
OPENFGA_API_URL=http://localhost:8080
OPENFGA_STORE_ID=your_store_id
OPENFGA_AUTHORIZATION_MODEL_ID=your_model_id

# If not set, uses Supabase RLS-based authorization
```

**Files Changed**:
- `packages/reg-intel-conversations/src/authorizationService.ts` - New authorization services
- `packages/reg-intel-conversations/src/authorizationService.test.ts` - Comprehensive tests
- `packages/reg-intel-conversations/src/index.ts` - Export authorization services
- `apps/demo-web/src/lib/server/conversations.ts` - Wire OpenFGA configuration
- `apps/demo-web/.env.local.example` - Document OpenFGA configuration

---

### 3.2 MEDIUM: Supabase Conversation Persistence ✅ COMPLETED

**Priority**: MEDIUM (Production Readiness)
**Effort**: 1 week
**Reference**: `docs/development/V0_6_IMPLEMENTATION_STATUS.md`
**Completed**: 2025-12-27

**Description**: Production-ready conversation persistence with Supabase backend, cursor-based pagination, and multi-tenant RLS policies.

**Current State**:
- ✅ Schema exists (`supabase/migrations/`)
- ✅ `SupabaseConversationStore` fully implemented
- ✅ In-memory fallback works
- ✅ Supabase implementation complete with all CRUD operations
- ✅ Wired in production API routes
- ✅ Cursor-based pagination implemented
- ✅ RLS policies via views for multi-tenant security

**Completed Tasks**:

- [x] **Task P.1**: Complete `SupabaseConversationStore` implementation ✅
  - All methods implemented: createConversation, appendMessage, getMessages, listConversations, etc.
  - Observability integration with tracing and logging
  - Proper error handling and type safety

- [x] **Task P.2**: Wire Supabase store when env vars present ✅
  - Automatic selection based on SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
  - Graceful fallback to in-memory when not configured
  - Health check on startup

- [x] **Task P.3**: Add pagination to `/api/conversations` endpoint ✅
  - Cursor-based pagination (more efficient than offset)
  - Returns nextCursor and hasMore flags
  - Supports limit parameter (default: 50)
  - Query params: `?limit=20&cursor=<base64_cursor>&status=active`

- [x] **Task P.4**: Add RLS policies for multi-tenant usage ✅
  - RLS enabled on all copilot_internal tables
  - Tenant filtering via conversations_view and conversation_messages_view
  - current_tenant_id() function for JWT-based tenant extraction

**Pagination API**:
```typescript
// First page
GET /api/conversations?limit=20

// Next page
GET /api/conversations?limit=20&cursor=<nextCursor>

// Response
{
  "conversations": [...],
  "nextCursor": "base64_encoded_cursor",
  "hasMore": true
}
```

**Files Changed**:
- `packages/reg-intel-conversations/src/conversationStores.ts` - Added cursor pagination
- `apps/demo-web/src/app/api/conversations/route.ts` - Updated API endpoint

---

### 3.3 MEDIUM: Missing API Integration Tests

**Priority**: MEDIUM (Quality)
**Effort**: 1-2 days

**Description**: Several API endpoints lack integration tests. The demo-web app has 22 API route files but only 5 have tests.

**Missing Tests**:

| Endpoint | Test File Needed | Status |
|----------|-----------------|--------|
| `/api/conversations/[id]/messages/[messageId]/pin` | `pin/route.test.ts` | ❌ Missing |
| `/api/cron/cleanup-contexts` | `cleanupExecutionContexts.test.ts` | ❌ Missing |
| `/api/conversations/[id]/branch` | `branch/route.test.ts` | ❌ Missing |
| `/api/conversations/[id]/paths/[pathId]/merge` | `merge/route.test.ts` | ❌ Missing |
| `/api/conversations/[id]/stream` | `stream/route.test.ts` | ❌ Missing |
| Version Navigator E2E | `version-navigator.e2e.ts` | ❌ Missing |

**Current Coverage** (5 test files exist):
- `apps/demo-web/src/app/api/chat/route.test.ts` ✅
- `apps/demo-web/src/app/api/client-telemetry/route.test.ts` ✅
- `apps/demo-web/src/app/api/graph/route.logging.test.ts` ✅

**Tasks**:

- [ ] **Task IT.1**: Create message pinning API tests
- [ ] **Task IT.2**: Create cleanup job integration tests
- [ ] **Task IT.3**: Create branch/merge API tests
- [ ] **Task IT.4**: Create SSE stream tests
- [ ] **Task IT.5**: Create version navigator E2E tests

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

### 3.4 MEDIUM: Package Test Coverage Gaps

**Priority**: MEDIUM (Quality)
**Effort**: 2-3 days

**Description**: Three packages have minimal or no test coverage, creating risk for future maintenance.

#### 3.4.1 reg-intel-graph (4 tests - needs expansion)

**Current State**:
- ✅ 3 test files exist but with minimal coverage
- ⚠️ `graphIngressGuard.ts` - 0 tests (aspect pipeline, schema validation)
- ⚠️ `canonicalConceptHandler.ts` - 0 tests (concept normalization)

**Tasks**:

- [ ] **Task TG.1**: Add `graphIngressGuard.test.ts`
  - Test schema validation aspect
  - Test PII blocking aspect
  - Test property whitelist filtering
  - Test aspect composition order

- [ ] **Task TG.2**: Add `canonicalConceptHandler.test.ts`
  - Test concept normalization
  - Test ID generation
  - Test duplicate detection

- [ ] **Task TG.3**: Expand `graphWriteService.test.ts`
  - Test all concept types (BENEFIT, RELIEF, RULE, etc.)
  - Test relationship types
  - Test error handling

#### 3.4.2 reg-intel-ui (0 tests - needs coverage)

**Current State**:
- ❌ No tests for 5 React components
- ❌ No tests for `useConversationPaths` hook

**Components to Test**:
- `PathSelector.tsx` - Dropdown selection logic
- `BranchButton.tsx` - Branch creation trigger
- `BranchDialog.tsx` - Branch creation form
- `MergeDialog.tsx` - Merge workflow + AI summarization
- `VersionNavigator.tsx` - Branch tree visualization

**Tasks**:

- [ ] **Task TU.1**: Set up Vitest + React Testing Library
- [ ] **Task TU.2**: Add hook tests for `useConversationPaths`
- [ ] **Task TU.3**: Add component tests for dialogs and selectors

#### 3.4.3 reg-intel-next-adapter (0 tests - needs coverage)

**Current State**:
- ❌ No tests for `E2BSandboxClient` class
- ❌ No tests for singleton manager pattern

**Files to Test**:
- `executionContext.ts` - 262 lines, 0 tests

**Tasks**:

- [ ] **Task TN.1**: Add `executionContext.test.ts`
  - Test `E2BSandboxClient.create()` with mocked E2B
  - Test `E2BSandboxClient.reconnect()` with mocked E2B
  - Test singleton initialization/shutdown
  - Test error handling for missing config

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

- [ ] **Task CC.1**: Expand graph write service coverage (see 3.4.1)
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

### Phase A: Production Blockers (Must Fix) ✅ COMPLETED

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| ~~2.2 Redis SSE Fan-out~~ | HIGH | 1-2 weeks | ✅ COMPLETED |
| ~~2.3 Test Coverage (prompts)~~ | HIGH | 4-6h | ✅ COMPLETED |
| ~~3.2 Supabase Persistence~~ | MEDIUM | 1 week | ✅ COMPLETED |
| ~~3.1 OpenFGA Integration~~ | MEDIUM | 1-2 weeks | ✅ COMPLETED |

### Phase B: Feature Completion & Quality

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.1 Scenario Engine | HIGH | 2-3 weeks | None |
| 3.3 API Integration Tests | MEDIUM | 1-2 days | None |
| 3.4 Package Test Coverage | MEDIUM | 2-3 days | None |

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

| Package | Test Files | Total Tests | Status |
|---------|------------|-------------|--------|
| reg-intel-conversations | 5 files | ~30 tests | ✅ Good |
| reg-intel-prompts | 3 files | 67 tests | ✅ Excellent |
| reg-intel-llm | 6 files | ~25 tests | ✅ Good |
| reg-intel-core | 7 files | ~35 tests | ✅ Good |
| reg-intel-observability | 3 files | ~15 tests | ✅ Adequate |

### Packages Needing Coverage

| Package | Source Files | Test Files | Tests | Issue |
|---------|--------------|------------|-------|-------|
| reg-intel-graph | 8 files (~500 LOC) | 3 files | 4 tests | ⚠️ Minimal (needs ingress guard, concept handler tests) |
| reg-intel-ui | 7 files (~800 LOC) | 0 files | 0 tests | ⚠️ No tests (React components + hooks) |
| reg-intel-next-adapter | 2 files (~260 LOC) | 0 files | 0 tests | ⚠️ No tests (E2B adapter, singleton pattern) |

### Package Test Details

**reg-intel-graph** (3 test files, 4 tests - minimal):
- `boltGraphClient.test.ts` - 1 test (connection)
- `graphWriteService.test.ts` - 2 tests (property stripping)
- `graphChangeDetector.test.ts` - 1 test (patch detection)
- **Missing**: `graphIngressGuard.test.ts`, `canonicalConceptHandler.test.ts`

**reg-intel-ui** (0 test files):
- Components: `PathSelector`, `BranchButton`, `BranchDialog`, `MergeDialog`, `VersionNavigator`
- Hook: `useConversationPaths`
- **Recommended**: Vitest + React Testing Library for component tests

**reg-intel-next-adapter** (0 test files):
- `E2BSandboxClient` class - E2B wrapper
- Singleton manager pattern (init, get, shutdown)
- **Recommended**: Mock-based unit tests for adapter logic

### Missing Integration Tests (demo-web)

| Endpoint | Priority | Notes |
|----------|----------|-------|
| `/api/conversations/[id]/messages/[messageId]/pin` | HIGH | Core feature, no coverage |
| `/api/cron/cleanup-contexts` | HIGH | Critical for production |
| `/api/conversations/[id]/branch` | MEDIUM | Branching workflow |
| `/api/conversations/[id]/paths/[pathId]/merge` | MEDIUM | Merge workflow |
| `/api/conversations/[id]/stream` | LOW | SSE testing complex |
| Version navigator E2E | LOW | Requires Playwright/Cypress |

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

# Redis for Distributed SSE (Production Multi-Instance Deployments)
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# Or standard Redis
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=your_password

# OpenFGA Authorization (Optional - for fine-grained access control)
OPENFGA_API_URL=http://localhost:8080
OPENFGA_STORE_ID=your_store_id
OPENFGA_AUTHORIZATION_MODEL_ID=your_model_id
```

---

## 10. Summary

**Total Outstanding Effort**: ~4-5 weeks

| Priority | Items | Effort Range |
|----------|-------|--------------|
| HIGH | 1 | 2-3 weeks (Scenario Engine) |
| MEDIUM | 2 | 3-5 days (API Tests + Package Tests) |
| LOW | 5 | 3-4 weeks |

### Critical Gaps Identified

1. **Scenario Engine** - Fully documented (spec_v_0_1.md), zero implementation - **PRIMARY GAP**
2. ~~**Redis SSE**~~ - ✅ **COMPLETED** (2025-12-27)
3. ~~**reg-intel-prompts tests**~~ - ✅ **COMPLETED** (2025-12-27) - 67 comprehensive tests
4. ~~**Supabase Persistence**~~ - ✅ **COMPLETED** (2025-12-27)
5. ~~**OpenFGA integration**~~ - ✅ **COMPLETED** (2025-12-27)
6. **Package Test Coverage** - 3 packages need tests (reg-intel-graph, reg-intel-ui, reg-intel-next-adapter)
7. **API Integration Tests** - 6+ endpoints without test coverage

### Production Readiness Checklist

- [x] EgressGuard fully wired
- [x] Client telemetry with batching
- [x] Logging framework wired
- [x] Execution context cleanup job
- [x] Redis/distributed SSE ✅
- [x] Supabase persistence wired ✅
- [x] Authorization service integrated ✅
- [x] Graph services (read/write) ✅
- [x] Conversation branching & merging ✅
- [x] Message pinning ✅
- [ ] Full test coverage (currently ~170 tests across 26 files)
- [ ] Scenario Engine implementation

### Codebase Statistics

| Metric | Count |
|--------|-------|
| Total packages | 8 |
| Total test files | 31 (26 packages + 5 app) |
| Estimated total tests | ~170 |
| API route files | 22 |
| API routes with tests | 3 |
| Packages with 0 tests | 2 (reg-intel-ui, reg-intel-next-adapter) |

---

**Document Version**: 3.5
**Last Updated**: 2025-12-27
**Previous Versions**: 3.4, 3.3, 3.2, 3.1, 3.0 (2025-12-27), 2.7 (2025-12-24), earlier versions
**Author**: Claude Code

**Changelog**:
- v3.5 (2025-12-27): Comprehensive codebase review - updated test coverage details, added package statistics, identified 3 packages needing tests, expanded API integration test tracking
- v3.4 (2025-12-27): Mark reg-intel-prompts test coverage as COMPLETED ✅ (67 comprehensive tests, 100% coverage)
- v3.3 (2025-12-27): Mark OpenFGA authorization service as COMPLETED ✅ (3 implementations with comprehensive tests)
- v3.2 (2025-12-27): Mark Supabase persistence as COMPLETED ✅ (cursor pagination added)
- v3.1 (2025-12-27): Mark Redis/distributed SSE as COMPLETED ✅
