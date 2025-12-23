# Outstanding Work & Implementation Plan

> **Last Updated**: 2025-12-23
> **Status**: Consolidated review of all architecture documents
> **Previous Update**: 2025-12-12

---

## Executive Summary

This document consolidates all outstanding work identified from reviewing the architecture documentation (v0.6, v0.7), implementation plans, and current codebase state.

### Overall Status

| Architecture Version | Feature Set | Backend | UI | Integration |
|---------------------|-------------|---------|-----|-------------|
| v0.6 | Conversation Branching & Merging | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.6 | AI Merge Summarization | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.6 | Message Pinning | ✅ Complete | ❌ Not Started | ❌ |
| v0.7 | E2B Execution Contexts | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.7 | EgressGuard (Outbound) | ✅ Complete | N/A | ✅ Wired |
| v0.7 | EgressGuard (Response/Sandbox) | ✅ Complete | N/A | ❌ NOT Wired |
| v0.7 | Observability & Cleanup | 🔄 Partial | N/A | 🔄 Partial |

---

## 1. Completed Work

### 1.1 Conversation Branching & Merging (v0.6)

**Reference**: `docs/architecture/IMPLEMENTATION-PLAN.md`, `docs/architecture/conversation-branching-and-merging.md`

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Database Schema (`conversation_paths`, path-aware messages) | ✅ Complete |
| Phase 2 | Backend Stores (`ConversationPathStore`, Supabase impl) | ✅ Complete |
| Phase 3 | API Routes (paths CRUD, branching, merging, SSE) | ✅ Complete |
| Phase 4 | Reusable UI Components (`@reg-copilot/reg-intel-ui`) | ✅ Complete |
| Phase 5 | Demo App Integration (PathToolbar, BranchDialog, MergeDialog) | ✅ Complete |

**Files Created/Modified**:
- `supabase/migrations/20241207000001_add_conversation_paths.sql`
- `packages/reg-intel-conversations/src/pathStores.ts`
- `packages/reg-intel-ui/` (full package)
- `apps/demo-web/src/components/chat/path-toolbar.tsx`
- `apps/demo-web/src/components/chat/conditional-path-provider.tsx`
- All path API routes under `apps/demo-web/src/app/api/conversations/[id]/`

### 1.2 E2B Execution Contexts (v0.7)

**Reference**: `docs/architecture/execution-context/IMPLEMENTATION_PLAN.md`, `docs/architecture/E2B_ARCHITECTURE.md`

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Foundation (ExecutionContextStore, Manager) | ✅ Complete |
| Phase 2 | Tool Integration (`run_code`, `run_analysis` tools) | ✅ Complete |
| Phase 3 | Path Integration (wiring through chat handler) | ✅ Complete |
| Phase 4 | Observability | 🔄 Partial (spans added, cleanup job pending) |

**Files Created/Modified**:
- `supabase/migrations/20251210000000_execution_contexts.sql`
- `packages/reg-intel-conversations/src/executionContextStores.ts`
- `packages/reg-intel-conversations/src/executionContextManager.ts`
- `packages/reg-intel-llm/src/tools/codeExecutionTools.ts`
- `packages/reg-intel-llm/src/tools/toolRegistry.ts`
- `apps/demo-web/src/components/chat/prompt-input.tsx` (Run Code/Run Analysis buttons)

### 1.3 AI Merge Summarization (v0.6 Phase 6) ✅

**Reference**: `docs/architecture/IMPLEMENTATION-PLAN.md` Phase 6, `docs/architecture/conversation-branching-and-merging.md` Part 9

| Component | Status |
|-----------|--------|
| `MergeSummarizer` service | ✅ Complete |
| Summarization prompts (regulatory-focused) | ✅ Complete |
| Integration with merge API endpoint | ✅ Complete |
| MergeDialog UI with summary mode | ✅ Complete |
| Custom prompt input | ✅ Complete |
| Fallback when LLM unavailable | ✅ Complete |

**Files Implemented**:
- `apps/demo-web/src/lib/server/mergeSummarizer.ts` - Full AI summarization with regulatory prompts
- `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/merge/route.ts` - Integrated summarizer
- `packages/reg-intel-ui/src/components/MergeDialog.tsx` - Complete merge UI with all modes

**Features**:
- AI-powered summary generation with temperature 0.3, max 600 tokens
- Custom user-provided summarization instructions
- Fallback summary when LLM unavailable
- Preview of merge before execution
- Support for `summary`, `full`, and `selective` merge modes
- Archive source option

### 1.4 Message Pinning (Backend Only)

**Reference**: `docs/architecture/MESSAGE_PINNING.md`

| Component | Status |
|-----------|--------|
| Database schema (`is_pinned`, `pinned_at`, `pinned_by`) | ✅ Complete |
| Store operations (`pinMessage`, `unpinMessage`, `getPinnedMessages`) | ✅ Complete |
| RLS policies and indexes | ✅ Complete |
| TypeScript types | ✅ Complete |

### 1.5 EgressGuard Implementation (Partial)

**Reference**: `docs/architecture/architecture_v_0_7.md` Section 7

| Component | Status |
|-----------|--------|
| Core EgressGuard implementation | ✅ Complete |
| PII detection patterns (email, phone, SSN, PPSN, IBAN, etc.) | ✅ Complete |
| ML-based detection via @redactpii/node | ✅ Complete |
| Unit tests (enforce, report-only, off modes) | ✅ Complete |
| Outbound LLM request protection | ✅ Wired |
| User input sanitization | ⚠️ Partial (only user messages) |
| **LLM response sanitization** | ❌ NOT WIRED |
| **Sandbox egress protection** | ❌ NOT WIRED |
| **Agent-level BasicEgressGuard** | ❌ Dead code (passed but never called) |

**Files**:
- `packages/reg-intel-llm/src/egressGuard.ts`
- `packages/reg-intel-llm/src/egressClient.ts`
- `packages/reg-intel-llm/src/egressClient.test.ts`
- `packages/reg-intel-llm/src/egressClient.spec.ts`
- `packages/reg-intel-llm/src/egressModeResolver.test.ts`

**Wiring Status**:
- ✅ `LlmRouter.chat()` and `streamChat()` use `egressClient.guardAndExecute()` for OUTBOUND requests
- ❌ LLM responses flow directly to client WITHOUT sanitization
- ❌ Sandbox execution results NOT sanitized before use
- ❌ `BasicEgressGuard` passed to agents but never invoked

---

## 2. Outstanding Work

### 2.1 HIGH: Message Pinning UI

**Priority**: HIGH
**Effort**: 4-6 hours
**Reference**: `docs/architecture/MESSAGE_PINNING.md`

**Description**: Backend is complete but no UI exists for pinning/unpinning messages.

**Backend (Complete)**:
- `pinMessage()` method in `SupabaseConversationPathStore`
- `unpinMessage()` method in `SupabaseConversationPathStore`
- Database schema includes `is_pinned`, `pinned_at`, `pinned_by` columns
- TypeScript types: `PinMessageInput`, `UnpinMessageInput`

**Tasks**:

- [ ] **Task P.1**: Add pin/unpin buttons to Message component
  - File: `apps/demo-web/src/components/chat/message.tsx`
  - Add `Pin` icon button (lucide-react)
  - Toggle between pinned/unpinned states
  - Visual indicator when message is pinned

- [ ] **Task P.2**: Create pinMessage/unpinMessage API endpoints
  - `POST /api/conversations/:id/messages/:messageId/pin`
  - `DELETE /api/conversations/:id/messages/:messageId/pin`

- [ ] **Task P.3**: Add SSE events for pin state changes
  - `message:pinned` event
  - `message:unpinned` event
  - Update `packages/reg-intel-conversations/src/sseTypes.ts`

- [ ] **Task P.4**: Update conversation list to show pinned message count (optional)

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 Assistant                                         [📌] [⋮] │
│  Directors in Ireland have several PRSI obligations...         │
│                                                                 │
│  [📋 Copy] [✏️ Edit] [🌿 Branch] [📌 Pin]                      │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.2 MEDIUM: Cleanup Cron Job (v0.7 Phase 4)

**Priority**: MEDIUM
**Effort**: 2-4 hours
**Reference**: `docs/architecture/execution-context/IMPLEMENTATION_PLAN.md` Tasks 4.3.1-4.3.3

**Description**: No automated cleanup of expired execution contexts exists.

**Tasks**:

- [ ] **Task C.1**: Create cleanup job function
  - File: `apps/demo-web/src/lib/jobs/cleanupExecutionContexts.ts`
  ```typescript
  export async function cleanupExecutionContexts(
    manager: ExecutionContextManager
  ): Promise<{ cleaned: number; errors: number }>
  ```

- [ ] **Task C.2**: Create cron API endpoint
  - File: `apps/demo-web/src/app/api/cron/cleanup-contexts/route.ts`
  - Secure with `CRON_SECRET` authorization header
  - Call `manager.cleanupExpired()`

- [ ] **Task C.3**: Configure Vercel Cron
  - File: `vercel.json`
  ```json
  {
    "crons": [{
      "path": "/api/cron/cleanup-contexts",
      "schedule": "0 * * * *"
    }]
  }
  ```

---

### 2.3 LOW: Metrics Dashboard (v0.7 Phase 4)

**Priority**: LOW (DEFERRED)
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

### 2.4 LOW: Version Navigator Component

**Priority**: LOW
**Effort**: 2-4 hours
**Reference**: `docs/architecture/conversation-branching-and-merging.md` Part 8

**Description**: Component exists (`message-version-nav.tsx`) but is NOT wired into the main page.

**Existing Component**: `apps/demo-web/src/components/chat/message-version-nav.tsx` (69 lines)
- Full navigation with prev/next buttons
- Version counter display (e.g., "2 / 5")
- Timestamp with "time ago" formatting
- Original/Latest labels
- Disabled state handling

**Tasks**:

- [ ] **Task V.1**: Import `MessageVersionNav` into `page.tsx`
- [ ] **Task V.2**: Wire component to display for messages with multiple versions
- [ ] **Task V.3**: Ensure path resolution updates correctly when navigating versions

---

### 2.5 LOW: PathAwareMessageList Component

**Priority**: LOW
**Effort**: 2-4 hours
**Reference**: `docs/architecture/IMPLEMENTATION-PLAN.md` Phase 5

**Description**: Component exists (`path-aware-message-list.tsx`) but main page renders messages inline instead.

**Existing Component**: `apps/demo-web/src/components/chat/path-aware-message-list.tsx` (225 lines)
- Full PathAwareMessageList implementation
- Fallback mode when PathProvider unavailable
- Path context integration via `useConversationPaths` hook
- Branch indicators and branch count badges
- Message editing support with custom renderer
- Branch creation on hover

**Current Status**: Main page at `apps/demo-web/src/app/page.tsx` renders messages directly in JSX instead of using this component.

**Tasks**:

- [ ] **Task L.1**: Replace inline message rendering in `page.tsx` with `PathAwareMessageList`
- [ ] **Task L.2**: Verify branch indicators and path navigation work correctly
- [ ] **Task L.3**: Ensure editing and branching behaviors are preserved

---

### 2.6 MEDIUM: Complete EgressGuard End-to-End Wiring

**Priority**: MEDIUM
**Effort**: 4-6 hours
**Reference**: `docs/architecture/architecture_v_0_7.md` Section 7, `docs/architecture/execution-context/spec_v_0_1.md` Section 7

**Description**: EgressGuard protects outbound LLM requests but does NOT sanitize responses or sandbox output. Architecture specifies all egress should flow through EgressGuard.

**Current State**:
- ✅ Outbound LLM requests protected via `egressClient.guardAndExecute()` in `LlmRouter`
- ❌ LLM responses NOT sanitized before reaching client
- ❌ Sandbox execution results NOT sanitized
- ❌ `BasicEgressGuard.redact()` passed to agents but never called

**Tasks**:

- [ ] **Task E.1**: Add response sanitization to LLM streaming
  - File: `packages/reg-intel-llm/src/llmRouter.ts`
  - Apply `sanitizeTextForEgress()` to response chunks before yielding
  - Consider performance impact of per-chunk sanitization

- [ ] **Task E.2**: Add sandbox egress protection
  - File: `packages/reg-intel-llm/src/tools/codeExecutionTools.ts`
  - Sanitize `stdout`, `stderr`, and `result` before returning
  - Prevents PII leakage from code execution

- [ ] **Task E.3**: Wire BasicEgressGuard in agents
  - File: `packages/reg-intel-core/src/orchestrator/complianceEngine.ts`
  - Actually invoke `egressGuard.redact()` on agent outputs
  - Currently dead code (passed but never called)

- [ ] **Task E.4**: Add integration tests for full flow
  - Test that PII in knowledge base doesn't leak to client
  - Test that sandbox output with PII is sanitized

**Security Impact**: Without these changes, PII from the knowledge base or sandbox output could leak to clients.

---

## 3. Implementation Priority Order

### Phase A: Critical Path (Next Sprint)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.1 Message Pinning UI | HIGH | 4-6h | None |

### Phase B: Production Readiness

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.2 Cleanup Cron Job | MEDIUM | 2-4h | None |
| 2.6 EgressGuard End-to-End | MEDIUM | 4-6h | None |

### Phase C: Polish (Deferred)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.3 Metrics Dashboard | LOW | 4-6h | 2.2 |
| 2.4 Version Navigator | LOW | 2-4h | None |
| 2.5 PathAwareMessageList | LOW | 2-4h | None |

**Note**: EgressGuard completion (2.6) has security implications and should be prioritized for production deployment.

---

## 4. Document Cross-References

| Document | Purpose | Location |
|----------|---------|----------|
| Architecture v0.6 | Conversation branching, concept capture | `docs/architecture/architecture_v_0_6.md` |
| Architecture v0.7 | E2B execution contexts, code tools | `docs/architecture/architecture_v_0_7.md` |
| Branching & Merging | Detailed branching UX and data model | `docs/architecture/conversation-branching-and-merging.md` |
| E2B Architecture | Sandbox lifecycle and integration | `docs/architecture/E2B_ARCHITECTURE.md` |
| Execution Context Spec | Formal spec for per-path contexts | `docs/architecture/execution-context/spec_v_0_1.md` |
| Execution Context Plan | Implementation tasks and status | `docs/architecture/execution-context/IMPLEMENTATION_PLAN.md` |
| Message Pinning | Pinning for compaction control | `docs/architecture/MESSAGE_PINNING.md` |
| Response Flow | How chat messages flow through system | `docs/architecture/conversation-response-flow.md` |
| Implementation Plan | Branching implementation tracking | `docs/architecture/IMPLEMENTATION-PLAN.md` |

---

## 5. Test Coverage Requirements

### Existing Tests (Pass)

- ✅ `ExecutionContextStore` unit tests (19 tests)
- ✅ Code execution tools unit tests (22 tests)
- ✅ Tool registry unit tests (23 tests)
- ✅ Path store unit tests
- ✅ EgressGuard unit tests (comprehensive)
- ✅ EgressClient integration tests
- ✅ EgressModeResolver tests

### Missing Tests

- ❌ Message pinning API tests
- ❌ Cleanup job integration tests
- ❌ Version navigator E2E tests

---

## 6. Environment Variables Required

```env
# Existing (Required)
E2B_API_KEY=ek_***
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=***

# New (For Cleanup Job)
CRON_SECRET=***  # For securing cron endpoint

# Optional (Observability)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

---

## 7. Summary

**Total Outstanding Effort**: ~18-30 hours

| Priority | Items | Effort Range |
|----------|-------|--------------|
| HIGH | 1 | 4-6h |
| MEDIUM | 2 | 6-10h |
| LOW | 3 | 8-14h |

### Recently Completed (Since 2025-12-12)

1. **AI Merge Summarization** - Fully implemented end-to-end:
   - AI-powered summary generation in `mergeSummarizer.ts`
   - Integration with merge API endpoint
   - MergeDialog UI with summary mode, custom prompts, and preview
   - Fallback handling when LLM unavailable
   - ✅ Verified: Complete flow from UI to LLM and back

2. **EgressGuard Core** - Implementation and tests complete, but:
   - ⚠️ Only OUTBOUND LLM requests are protected
   - ❌ LLM responses NOT sanitized before reaching client
   - ❌ Sandbox output NOT sanitized
   - ❌ Agent-level redaction is dead code

### Recommended Next Steps

1. **Add Message Pinning UI** (HIGH priority) - Backend complete, needs UI components and API endpoints
2. **Complete EgressGuard End-to-End** (MEDIUM priority) - Security gap: response/sandbox sanitization missing
3. **Set up Cleanup Cron Job** (MEDIUM priority) - Production requirement for sandbox cleanup
4. **Integrate existing components** (LOW priority) - Version Navigator and PathAwareMessageList are complete but unused

### Security Note

EgressGuard currently only protects outbound requests. For production, response sanitization is needed to prevent PII leakage from knowledge base or sandbox execution. See section 2.6 for implementation details.

### PR #159 Review

PR #159 made the following changes (verified non-breaking):
- Added execution context cleanup on merge (additive)
- Added "Run Code" / "Run Analysis" buttons to PromptInput (backwards compatible)
- Extended ComplianceEngine with ExecutionTool support (additive)
- Created OUTSTANDING_WORK.md documentation

---

**Document Version**: 2.1
**Last Updated**: 2025-12-23
**Previous Version**: 2.0 (2025-12-23), 1.0 (2025-12-12)
**Author**: Claude Code
