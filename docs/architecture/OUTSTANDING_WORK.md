# Outstanding Work & Implementation Plan

> **Generated**: 2025-12-12
> **Status**: Consolidated review of all architecture documents
> **Branch**: `claude/review-architecture-plans-011etpa1nB9rSDLQTiLmDXpF`

---

## Executive Summary

This document consolidates all outstanding work identified from reviewing the architecture documentation (v0.6, v0.7), implementation plans, and current codebase state.

### Overall Status

| Architecture Version | Feature Set | Backend | UI | Integration |
|---------------------|-------------|---------|-----|-------------|
| v0.6 | Conversation Branching & Merging | ✅ Complete | ✅ Mostly Complete | ✅ Wired |
| v0.6 | AI Merge Summarization | ❌ Not Started | ❌ Not Started | ❌ |
| v0.6 | Message Pinning | ✅ Complete | ❌ Not Started | ❌ |
| v0.7 | E2B Execution Contexts | ✅ Complete | ✅ Complete | ✅ Wired |
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

### 1.3 Message Pinning (Backend Only)

**Reference**: `docs/architecture/MESSAGE_PINNING.md`

| Component | Status |
|-----------|--------|
| Database schema (`is_pinned`, `pinned_at`, `pinned_by`) | ✅ Complete |
| Store operations (`pinMessage`, `unpinMessage`, `getPinnedMessages`) | ✅ Complete |
| RLS policies and indexes | ✅ Complete |
| TypeScript types | ✅ Complete |

---

## 2. Outstanding Work

### 2.1 CRITICAL: AI Merge Summarization (v0.6 Phase 6)

**Priority**: HIGH
**Effort**: 8-12 hours
**Reference**: `docs/architecture/IMPLEMENTATION-PLAN.md` Phase 6, `docs/architecture/conversation-branching-and-merging.md` Part 9

**Description**: When merging a branch back to main, the system should AI-generate a summary of the branch findings instead of copying all messages.

**Tasks**:

- [ ] **Task 6.1**: Define summarization prompts
  - Create `MERGE_SUMMARY_SYSTEM_PROMPT` following regulatory summarization guidelines
  - Support custom user-provided summarization prompts
  - File: `packages/reg-intel-core/src/orchestrator/mergeSummarizer.ts`

- [ ] **Task 6.2**: Implement `MergeSummarizer` service
  ```typescript
  interface MergeSummarizerInput {
    branchMessages: PathAwareMessage[];
    branchPointMessage: PathAwareMessage;
    mainConversationContext: PathAwareMessage[];
    customPrompt?: string;
    tenantId: string;
  }

  async function generateMergeSummary(input: MergeSummarizerInput): Promise<{
    summary: string;
    aiGenerated: boolean;
    error?: string;
  }>
  ```

- [ ] **Task 6.3**: Integrate with merge endpoint
  - Update `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/merge/route.ts`
  - Call summarizer when `mergeMode === 'summary'`
  - Create system message with summary in target path
  - Include metadata about source branch

- [ ] **Task 6.4**: Update MergeDialog UI
  - Add summary preview before merge
  - Add custom prompt input field
  - Show loading state during summarization
  - Graceful fallback when LLM unavailable

**Merge Summary Message Format**:
```typescript
{
  role: 'system',
  content: '**Branch Summary: PRSI Deep Dive** (5 messages merged)\n\n...',
  metadata: {
    type: 'merge_summary',
    sourcePathId: 'uuid',
    sourcePathName: 'PRSI Deep Dive',
    mergedMessageCount: 5,
    branchPointMessageId: 'uuid',
    summarizedAt: '2024-12-12T10:30:00Z',
  }
}
```

---

### 2.2 CRITICAL: Message Pinning UI

**Priority**: HIGH
**Effort**: 4-6 hours
**Reference**: `docs/architecture/MESSAGE_PINNING.md`

**Description**: Backend is complete but no UI exists for pinning/unpinning messages.

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

### 2.3 MEDIUM: Cleanup Cron Job (v0.7 Phase 4)

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

### 2.4 MEDIUM: Metrics Dashboard (v0.7 Phase 4)

**Priority**: MEDIUM (DEFERRED)
**Effort**: 4-6 hours
**Reference**: `docs/architecture/E2B_ARCHITECTURE.md` Future Enhancements

**Description**: Add metrics collection for sandbox operations.

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

### 2.5 LOW: Version Navigator Component

**Priority**: LOW
**Effort**: 2-4 hours
**Reference**: `docs/architecture/conversation-branching-and-merging.md` Part 8

**Description**: Component exists (`message-version-nav.tsx`) but is NOT wired into the main page.

**Tasks**:

- [ ] **Task V.1**: Review existing `message-version-nav.tsx` component
- [ ] **Task V.2**: Wire into `page.tsx` for message version navigation
- [ ] **Task V.3**: Ensure path resolution updates correctly when navigating versions

---

### 2.6 LOW: PathAwareMessageList Component

**Priority**: LOW
**Effort**: 2-4 hours
**Reference**: `docs/architecture/IMPLEMENTATION-PLAN.md` Phase 5

**Description**: Component exists (`path-aware-message-list.tsx`) but main page renders messages inline instead.

**Tasks**:

- [ ] **Task L.1**: Replace inline message rendering in `page.tsx` with `PathAwareMessageList`
- [ ] **Task L.2**: Verify branch indicators and path navigation work correctly

---

### 2.7 LOW: EgressGuard Validation for Sandbox

**Priority**: LOW
**Effort**: 2-4 hours
**Reference**: `docs/architecture/architecture_v_0_7.md` Section 7, `docs/architecture/execution-context/spec_v_0_1.md` Section 7

**Description**: Architecture specifies all sandbox egress must flow through EgressGuard. Code structure supports this but validation is incomplete.

**Tasks**:

- [ ] **Task E.1**: Add integration test for egress guard in sandbox execution
- [ ] **Task E.2**: Verify output sanitization is applied
- [ ] **Task E.3**: Verify network restrictions are enforced

---

## 3. Implementation Priority Order

### Phase A: Critical Path (Next Sprint)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.1 AI Merge Summarization | HIGH | 8-12h | None |
| 2.2 Message Pinning UI | HIGH | 4-6h | None |

### Phase B: Production Readiness

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.3 Cleanup Cron Job | MEDIUM | 2-4h | None |
| 2.4 Metrics Dashboard | MEDIUM | 4-6h | 2.3 |

### Phase C: Polish

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.5 Version Navigator | LOW | 2-4h | None |
| 2.6 PathAwareMessageList | LOW | 2-4h | None |
| 2.7 EgressGuard Validation | LOW | 2-4h | None |

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

### Missing Tests

- ❌ AI Merge Summarization integration tests
- ❌ Message pinning API tests
- ❌ Cleanup job integration tests
- ❌ EgressGuard sandbox integration tests
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

**Total Outstanding Effort**: ~26-42 hours

| Priority | Items | Effort Range |
|----------|-------|--------------|
| HIGH | 2 | 12-18h |
| MEDIUM | 2 | 6-10h |
| LOW | 3 | 6-12h |

**Recommended Next Steps**:
1. Implement AI Merge Summarization (enables full branching workflow)
2. Add Message Pinning UI (completes pinning feature)
3. Set up Cleanup Cron Job (production requirement)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-12
**Author**: Claude Code
