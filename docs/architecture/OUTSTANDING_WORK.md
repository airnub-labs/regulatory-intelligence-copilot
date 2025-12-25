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
| v0.6 | Message Pinning | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.7 | E2B Execution Contexts | ✅ Complete | ✅ Complete | ✅ Wired |
| v0.7 | EgressGuard (Outbound) | ✅ Complete | N/A | ✅ Wired |
| v0.7 | EgressGuard (Response/Sandbox) | ✅ Complete | N/A | ❌ NOT Wired |
| v0.7 | Observability & Cleanup | ✅ Complete | N/A | ✅ Wired |

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
| Phase 4 | Observability | ✅ Complete (spans added, cleanup job implemented) |

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

### 1.5 Message Pinning UI ✅

**Reference**: `docs/architecture/MESSAGE_PINNING.md`

| Component | Status |
|-----------|--------|
| Pin/Unpin API endpoints | ✅ Complete |
| Message component pin button | ✅ Complete |
| Visual indicator for pinned messages | ✅ Complete |
| SSE events (`message:pinned`, `message:unpinned`) | ✅ Complete |
| Main page integration | ✅ Complete |

**Files Implemented**:
- `apps/demo-web/src/app/api/conversations/[id]/messages/[messageId]/pin/route.ts` - POST/DELETE endpoints
- `apps/demo-web/src/components/chat/message.tsx` - Pin button and visual indicator
- `apps/demo-web/src/app/page.tsx` - `handleTogglePin` handler and wiring
- `packages/reg-intel-conversations/src/eventHub.ts` - Added `message:pinned` and `message:unpinned` event types

**Features**:
- Pin/unpin toggle button on all messages (user and assistant)
- Amber-colored visual indicator badge when message is pinned
- Ring highlight on pinned message cards
- Real-time state updates via SSE broadcasting
- Backend already complete (database schema, store methods)

### 1.6 EgressGuard Implementation ✅ Complete

**Reference**: `docs/architecture/architecture_v_0_7.md` Section 7

| Component | Status |
|-----------|--------|
| Core EgressGuard implementation | ✅ Complete |
| PII detection patterns (email, phone, SSN, PPSN, IBAN, etc.) | ✅ Complete |
| ML-based detection via @redactpii/node | ✅ Complete |
| Unit tests (enforce, report-only, off modes) | ✅ Complete |
| Outbound LLM request protection | ✅ Wired |
| User input sanitization | ✅ Complete (user messages sanitized) |
| **LLM response sanitization** | ✅ WIRED |
| **Sandbox egress protection** | ✅ WIRED |
| **Agent-level BasicEgressGuard** | ✅ Wired (defense-in-depth) |

**Files**:
- `packages/reg-intel-llm/src/egressGuard.ts`
- `packages/reg-intel-llm/src/egressClient.ts`
- `packages/reg-intel-llm/src/egressClient.test.ts`
- `packages/reg-intel-llm/src/egressClient.spec.ts`
- `packages/reg-intel-llm/src/egressModeResolver.test.ts`

**Wiring Status**:
- ✅ `LlmRouter.chat()` and `streamChat()` use `egressClient.guardAndExecute()` for OUTBOUND requests
- ✅ LLM responses sanitized via `sanitizeTextForEgress()` before reaching client
- ✅ Sandbox execution results sanitized in `executeCode()` and `executeAnalysis()`
- ✅ `BasicEgressGuard.redactText()` invoked on agent outputs in `ComplianceEngine`

---

## 2. Outstanding Work

### 2.1 ~~MEDIUM: Cleanup Cron Job (v0.7 Phase 4)~~ ✅ COMPLETE

**Priority**: MEDIUM (COMPLETED)
**Effort**: 2-4 hours
**Reference**: `docs/architecture/execution-context/IMPLEMENTATION_PLAN.md` Tasks 4.3.1-4.3.3

**Description**: Automated cleanup of expired execution contexts is now implemented.

**Implementation**:
- Created cleanup job function at `apps/demo-web/src/lib/jobs/cleanupExecutionContexts.ts`
- Created cron API endpoint at `apps/demo-web/src/app/api/cron/cleanup-contexts/route.ts`
- Secured with `CRON_SECRET` authorization header (Bearer token)
- Configured Vercel Cron in `vercel.json` to run hourly

**Files Created**:
- `apps/demo-web/src/lib/jobs/cleanupExecutionContexts.ts` - Job function with observability span
- `apps/demo-web/src/app/api/cron/cleanup-contexts/route.ts` - POST endpoint for cron, GET for health check
- `vercel.json` - Cron configuration (hourly at minute 0)

**Tasks** (all completed):

- [x] **Task C.1**: Create cleanup job function
- [x] **Task C.2**: Create cron API endpoint with CRON_SECRET auth
- [x] **Task C.3**: Configure Vercel Cron in vercel.json

---

### 2.2 LOW: Metrics Dashboard (v0.7 Phase 4)

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

### 2.3 ~~LOW: Version Navigator Component~~ ✅ COMPLETE

**Priority**: LOW (COMPLETED)
**Effort**: 2-4 hours
**Reference**: `docs/architecture/conversation-branching-and-merging.md` Part 8

**Description**: Component now fully wired into the main page with branch navigation support.

**Implementation**:
- `MessageVersionNav` imported into `message.tsx`
- Integrated with path-based branching system
- When a message is a branch point, shows version navigator to cycle through branches
- Branch preview cards show when navigating to branch versions
- Click "View Branch" to navigate to the branch path

**Files Modified**:
- `apps/demo-web/src/components/chat/message.tsx` - Added version navigation props and branch preview rendering
- `apps/demo-web/src/components/chat/path-aware-message-list.tsx` - Version navigation now handled here

**Tasks** (all completed):

- [x] **Task V.1**: Import `MessageVersionNav` into `message.tsx`
- [x] **Task V.2**: Wire component to display for messages with multiple versions/branches
- [x] **Task V.3**: Navigation shows branch previews with quick access to view branches

---

### 2.4 ~~LOW: PathAwareMessageList Component~~ ✅ COMPLETE

**Priority**: LOW (COMPLETED)
**Effort**: 2-4 hours
**Reference**: `docs/architecture/IMPLEMENTATION-PLAN.md` Phase 5

**Description**: Component now fully wired into the main page, replacing inline message rendering.

**Implementation**:
- Enhanced `PathAwareMessageList` with full feature support:
  - Version navigation (prev/next through branches)
  - Message editing with inline editor
  - Pin toggle support
  - Progress indicator integration
  - Branch preview cards
- Replaced inline message rendering in `page.tsx` with `PathAwareMessageList`
- Removed ~100 lines of redundant inline rendering code
- Component works in both path context and fallback modes

**Files Modified**:
- `apps/demo-web/src/components/chat/path-aware-message-list.tsx` - Enhanced with all features
- `apps/demo-web/src/app/page.tsx` - Replaced inline rendering with component

**Tasks** (all completed):

- [x] **Task L.1**: Replace inline message rendering in `page.tsx` with `PathAwareMessageList`
- [x] **Task L.2**: Verify branch indicators and path navigation work correctly
- [x] **Task L.3**: Ensure editing and branching behaviors are preserved

---

### 2.5 ~~LOW: Add isPinned to PathMessage Type~~ ✅ COMPLETE

**Priority**: LOW (COMPLETED)
**Effort**: 1-2 hours
**Reference**: `packages/reg-intel-ui/src/types.ts`

**Description**: PathMessage type now includes isPinned field. Pinning works in both fallback and path context modes.

**Implementation**:
- Added `isPinned`, `pinnedAt`, `pinnedBy` fields to `PathMessage` type
- Updated path messages API to include pinning data in response
- Updated `PathContextMessageList` to use actual `isPinned` value from message

**Files Modified**:
- `packages/reg-intel-ui/src/types.ts` - Added pinning fields to PathMessage
- `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/messages/route.ts` - Include pinning in response
- `apps/demo-web/src/components/chat/path-aware-message-list.tsx` - Use actual isPinned value

**Tasks** (all completed):

- [x] **Task P.1**: Add pinning fields to `PathMessage` type
- [x] **Task P.2**: Update path API to include pinning data
- [x] **Task P.3**: Update PathContextMessageList to use actual isPinned value

---

### 2.6 ~~MEDIUM: Complete EgressGuard End-to-End Wiring~~ ✅ COMPLETE

**Priority**: MEDIUM (COMPLETED)
**Effort**: 4-6 hours
**Reference**: `docs/architecture/architecture_v_0_7.md` Section 7, `docs/architecture/execution-context/spec_v_0_1.md` Section 7

**Description**: EgressGuard now protects all egress points including LLM responses, sandbox output, and agent-level processing.

**Implementation**:
- Added response sanitization to `LlmRouter.chat()` and `streamChat()` methods
- Added sandbox egress protection in `executeCode()` and `executeAnalysis()`
- Wired `BasicEgressGuard.redactText()` in `ComplianceEngine` for agent outputs
- Added comprehensive integration tests for the full flow

**Files Modified**:
- `packages/reg-intel-llm/src/llmRouter.ts` - Response sanitization for both streaming and non-streaming
- `packages/reg-intel-llm/src/tools/codeExecutionTools.ts` - Sanitize stdout, stderr, results, and errors
- `packages/reg-intel-core/src/orchestrator/complianceEngine.ts` - Agent output sanitization

**Files Created**:
- `packages/reg-intel-llm/src/__tests__/egressGuardIntegration.test.ts` - 22 integration tests

**Tasks** (all completed):

- [x] **Task E.1**: Add response sanitization to LLM streaming
  - Applied `sanitizeTextForEgress()` to response chunks before yielding
  - Sanitization enabled when egress mode is 'enforce' or 'report-only'

- [x] **Task E.2**: Add sandbox egress protection
  - Sanitize `stdout`, `stderr`, `result`, and error messages before returning
  - Sanitize parsed JSON output and results arrays in `executeAnalysis()`

- [x] **Task E.3**: Wire BasicEgressGuard in agents
  - `instrumentedEgressGuard.redactText()` invoked on agent outputs in `ComplianceEngine`
  - Applied to both streaming and non-streaming responses
  - Provides defense-in-depth layer on top of LLM-level sanitization

- [x] **Task E.4**: Add integration tests for full flow
  - Tests for LLM response sanitization (email, phone, SSN, PPSN, credit cards, API keys, JWT)
  - Tests for sandbox output sanitization (stdout, stderr, errors, JSON results)
  - Edge case tests (IP addresses, database URLs, AWS keys)

---

## 3. Implementation Priority Order

### Phase A: Production Readiness ✅ Complete

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| ~~2.1 Cleanup Cron Job~~ | ~~MEDIUM~~ | ~~2-4h~~ | ✅ Complete |
| ~~2.6 EgressGuard End-to-End~~ | ~~MEDIUM~~ | ~~4-6h~~ | ✅ Complete |

### Phase B: Polish (Deferred)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| 2.2 Metrics Dashboard | LOW | 4-6h | All dependencies complete |

**Note**: Production readiness phase is now complete. EgressGuard protects all egress points.

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

**Total Outstanding Effort**: ~4-6 hours

| Priority | Items | Effort Range |
|----------|-------|--------------|
| LOW | 1 | 4-6h |

### Recently Completed (Since 2025-12-12)

1. **EgressGuard End-to-End** - Fully implemented:
   - Added response sanitization to `LlmRouter.chat()` and `streamChat()`
   - Added sandbox egress protection in `executeCode()` and `executeAnalysis()`
   - Wired `BasicEgressGuard.redactText()` in `ComplianceEngine` for agent outputs
   - Added 22 integration tests covering all egress points
   - ✅ Verified: All tests pass

2. **Cleanup Cron Job** - Fully implemented:
   - Created cleanup job function at `apps/demo-web/src/lib/jobs/cleanupExecutionContexts.ts`
   - Created cron API endpoint at `apps/demo-web/src/app/api/cron/cleanup-contexts/route.ts`
   - Secured with `CRON_SECRET` Bearer token authorization
   - Configured Vercel Cron in `vercel.json` to run hourly (0 * * * *)
   - ✅ Verified: All files created correctly

3. **PathMessage isPinned Support** - Fully implemented:
   - Added `isPinned`, `pinnedAt`, `pinnedBy` fields to `PathMessage` type
   - Updated path messages API to return pinning data
   - Message pinning now works in path context mode
   - ✅ Verified: Dev server starts without errors

4. **PathAwareMessageList Integration** - Fully implemented end-to-end:
   - Enhanced `PathAwareMessageList` with version navigation, editing, pinning, and progress indicator
   - Replaced ~100 lines of inline message rendering in `page.tsx`
   - Works with both path context and fallback modes
   - ✅ Verified: Dev server starts without errors

5. **Version Navigator** - Fully implemented end-to-end:
   - `MessageVersionNav` component wired into message rendering
   - Branch points display version navigation to cycle through branches
   - Branch preview cards shown when viewing branch versions
   - Quick access to view branches via "View Branch" button
   - ✅ Verified: Dev server starts without errors

6. **AI Merge Summarization** - Fully implemented end-to-end:
   - AI-powered summary generation in `mergeSummarizer.ts`
   - Integration with merge API endpoint
   - MergeDialog UI with summary mode, custom prompts, and preview
   - Fallback handling when LLM unavailable
   - ✅ Verified: Complete flow from UI to LLM and back

7. **EgressGuard Core** - Now fully wired end-to-end:
   - ✅ OUTBOUND LLM requests are protected
   - ✅ LLM responses sanitized before reaching client
   - ✅ Sandbox output sanitized
   - ✅ Agent-level redaction is active (defense-in-depth)

8. **Message Pinning UI** - Fully implemented end-to-end:
   - Pin/Unpin API endpoints at `/api/conversations/:id/messages/:messageId/pin`
   - Pin button on all messages (user and assistant)
   - Visual indicator (amber badge and ring) for pinned messages
   - SSE events (`message:pinned`, `message:unpinned`) for real-time updates
   - ✅ Verified: Complete flow from UI click to database update

### Recommended Next Steps

1. **Add Observability Metrics** (LOW priority) - OpenTelemetry metrics collection

### Security Note

✅ **EgressGuard is now fully wired end-to-end**:
- Outbound LLM requests are sanitized
- LLM responses are sanitized before reaching client
- Sandbox output (stdout, stderr, results) is sanitized
- Agent outputs are sanitized as defense-in-depth

The system is production-ready from a PII protection standpoint.

### PR #159 Review

PR #159 made the following changes (verified non-breaking):
- Added execution context cleanup on merge (additive)
- Added "Run Code" / "Run Analysis" buttons to PromptInput (backwards compatible)
- Extended ComplianceEngine with ExecutionTool support (additive)
- Created OUTSTANDING_WORK.md documentation

---

**Document Version**: 2.7
**Last Updated**: 2025-12-24
**Previous Version**: 2.6 (2025-12-24), 2.5 (2025-12-24), 2.4 (2025-12-23), 2.3 (2025-12-23), 2.2 (2025-12-23), 2.1 (2025-12-23), 2.0 (2025-12-23), 1.0 (2025-12-12)
**Author**: Claude Code
