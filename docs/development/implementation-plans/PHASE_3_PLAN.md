# Phase 3: Web App Integration & Streaming

> **Goal:** Deliver a coherent demo app using the engine, with chat streaming and patch-based graph updates.
>
> **Branch:** `claude/phase-3-implementation-01SkpBxYZmSPvq2wGC99kqP5`
> **Status:** Ready to implement

This phase implements the Web App Integration & Streaming milestone from `roadmap_v_0_4.md` Phase 3.

---

## Overview

Phase 3 connects the fully-architected backend (Phase 1 & 2) to the Next.js demo web app, creating a complete vertical slice of the v0.4 architecture with:

- Chat streaming via ComplianceEngine
- Real-time graph updates via patch-based streaming
- Clean API layer with proper separation of concerns
- Full integration of ingress/egress guards

---

## Prerequisites (Completed)

- ✅ Phase 1: Core engine, LLM Router, Prompt Aspects
- ✅ Phase 2: Graph Engine, Ingress Guard, Timeline Engine, Package Restructuring
- ✅ All 4 packages build successfully (`reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`)
- ✅ ComplianceEngine exists at `packages/reg-intel-core/src/orchestrator/complianceEngine.ts`
- ✅ GraphChangeDetector implemented with SSE streaming
- ✅ Chat and graph API routes exist (need refactoring)

---

## Current State Assessment

### What Exists

**API Routes:**
- ✅ `/api/chat` - Direct LlmRouter usage (needs refactoring)
- ✅ `/api/graph` - Initial graph load endpoint
- ✅ `/api/graph/stream` - SSE streaming for graph patches

**Issues with Current Implementation:**
1. ❌ `/api/chat` bypasses ComplianceEngine - uses LlmRouter directly
2. ❌ No agent routing - always uses LlmRouter
3. ❌ No metadata in responses (agent used, jurisdictions, confidence, referenced nodes)
4. ❌ Graph query logic mixed into chat endpoint
5. ⚠️ SSE format uses custom AI SDK v1 format instead of standard SSE

### What's Working
- ✅ Graph change detection with polling
- ✅ Basic chat streaming
- ✅ Prompt aspects integration
- ✅ LLM Router provider abstraction

---

## Phase 3 Implementation Plan

### Task 1: Wire Chat API to ComplianceEngine

**Goal:** Replace direct LlmRouter usage with ComplianceEngine.handleChat()

**Current:** `apps/demo-web/src/app/api/chat/route.ts` directly uses LlmRouter
**Target:** Use ComplianceEngine as the canonical interface

**Steps:**
1. Read ComplianceEngine interface to understand handleChat signature
2. Refactor `/api/chat` route to:
   - Create ComplianceEngine instance
   - Call `engine.handleChat(request)`
   - Stream response with proper formatting
3. Remove direct LlmRouter instantiation from route
4. Ensure all configuration (API keys, model selection) flows through engine config

**Benefits:**
- ✅ Agent routing works correctly
- ✅ Timeline engine integration
- ✅ Proper graph + LLM orchestration
- ✅ Metadata in responses (agent, jurisdictions, nodes)

**Exit Criteria:**
- [ ] `/api/chat` calls ComplianceEngine.handleChat()
- [ ] Streaming works end-to-end
- [ ] Agent selection logic executes
- [ ] No direct LlmRouter usage in route

---

### Task 2: Enhance Chat Streaming with Metadata

**Goal:** Surface rich metadata in streaming responses

**Current:** Basic text streaming only
**Target:** Include agent info, jurisdictions, confidence, referenced nodes

**Metadata to Add:**
```typescript
interface ChatMetadata {
  agent: string;              // Which agent handled the request
  jurisdictions: string[];    // Jurisdictions considered
  confidence?: 'high' | 'medium' | 'low';
  uncertainty?: string[];     // Areas of uncertainty
  referencedNodes?: string[]; // Graph node IDs referenced
  timeline?: {                // Timeline reasoning applied
    lookback?: string;
    lockIn?: string;
    deadline?: string;
  };
}
```

**Steps:**
1. Check if ComplianceEngine returns metadata
2. If not, extend ComplianceEngine to include metadata in responses
3. Update streaming format to include metadata events
4. Update frontend to display metadata (optional - may defer to future)

**Exit Criteria:**
- [ ] Metadata included in streaming responses
- [ ] Agent name visible in response
- [ ] Jurisdictions listed
- [ ] Referenced nodes (if any) included

---

### Task 3: Separate Graph Query from Chat

**Goal:** Remove graph query logic from chat endpoint

**Current:** Chat endpoint has special handling for "query graph" keywords
**Target:** Dedicated graph query endpoint or remove feature

**Options:**
1. **Option A (Recommended):** Remove graph query feature from chat
   - Graph queries should go through proper GraphClient
   - Chat should be chat-only
   - Cleaner separation of concerns

2. **Option B:** Create dedicated `/api/graph/query` endpoint
   - POST with Cypher query
   - Use read-only GraphClient
   - Enforce safety checks

**Recommended:** Option A - Remove feature
**Rationale:**
- Graph queries via chat are a security risk
- Direct Cypher exposure violates architecture
- If needed later, add proper GraphClient endpoint

**Steps:**
1. Remove graph query detection logic from `/api/chat`
2. Remove `callMemgraphMcp` usage from route
3. Document removal in CHANGELOG

**Exit Criteria:**
- [ ] No graph query keywords in chat route
- [ ] No direct Cypher execution from chat
- [ ] Clean, focused chat endpoint

---

### Task 4: Standardize SSE Format

**Goal:** Use standard SSE format instead of custom AI SDK v1 format

**Current:** Custom format with `0:`, `3:` prefixes
**Target:** Standard SSE format with `event:` and `data:` fields

**Standard SSE Format:**
```
event: message
data: {"type":"text","content":"Hello"}

event: metadata
data: {"agent":"GlobalRegulatoryComplianceAgent","jurisdictions":["IE"]}

event: done
data: {}
```

**Benefits:**
- ✅ Standard format works with EventSource API
- ✅ Cleaner protocol
- ✅ Better debugging
- ✅ Framework-agnostic

**Steps:**
1. Update `/api/chat` streaming to use standard SSE format
2. Update frontend EventSource handler to parse standard format
3. Test with browser's native EventSource

**Exit Criteria:**
- [ ] Chat stream uses standard SSE format
- [ ] Event types: `message`, `metadata`, `error`, `done`
- [ ] Works with native EventSource API

---

### Task 5: Verify Graph Streaming Works

**Goal:** Ensure graph patch-based streaming is functional

**Current:** GraphChangeDetector + `/api/graph/stream` exist
**Target:** Verify end-to-end functionality

**Test Scenarios:**
1. **Initial Load:**
   - GET `/api/graph` returns initial subgraph
   - Nodes and edges properly formatted

2. **Patch Streaming:**
   - EventSource connects to `/api/graph/stream`
   - Receives patches when graph changes
   - Patches are delta-based (not full snapshots)

3. **Client Integration:**
   - Frontend applies patches incrementally
   - No full re-renders on patch
   - Graph stays consistent

**Steps:**
1. Review `/api/graph/stream` implementation
2. Test with manual graph changes (via seed scripts)
3. Verify patches are received by client
4. Check that GraphChangeDetector is working
5. Test filter parameters (jurisdictions, profileType)

**Exit Criteria:**
- [ ] GET `/api/graph` returns valid subgraph
- [ ] SSE `/api/graph/stream` emits patches
- [ ] Patches are delta-based
- [ ] Client applies patches correctly
- [ ] No performance issues with large graphs

---

### Task 6: Optional - Create reg-intel-next-adapter Package

**Goal:** Extract Next.js integration helpers into reusable package

**Current:** API routes contain Next.js-specific logic
**Target:** Clean, reusable adapter package

**What to Extract:**
```typescript
// reg-intel-next-adapter/src/

// Chat handler
export function createChatHandler(engine: ComplianceEngine):
  (req: Request) => Promise<Response>

// Graph handler
export function createGraphHandler(graphClient: GraphClient):
  (req: Request) => Promise<Response>

// Graph stream handler
export function createGraphStreamHandler(detector: GraphChangeDetector):
  (req: Request) => Promise<Response>

// SSE utilities
export function createSSEStream<T>(
  source: AsyncIterable<T>
): ReadableStream
```

**Benefits:**
- ✅ Reusable across multiple Next.js apps
- ✅ Clean API route files
- ✅ Easier to test
- ✅ Aligns with v0.4 architecture

**Priority:** Optional (can defer to Phase 3.5)
**Reason:** Current inline implementation works; extraction is refactoring

**Exit Criteria (if implemented):**
- [ ] Package `reg-intel-next-adapter` exists
- [ ] Exports chat, graph, and stream handlers
- [ ] API routes use adapter functions
- [ ] Package builds and has tests

---

## Implementation Strategy

### Step-by-Step Approach

1. **Task 1 (Critical)** - Wire Chat to ComplianceEngine
   - Most important architectural alignment
   - Enables agent routing
   - Foundation for other tasks

2. **Task 3 (Quick Win)** - Remove Graph Query from Chat
   - Simple deletion
   - Cleans up architecture
   - Low risk

3. **Task 4 (Medium)** - Standardize SSE Format
   - Improves protocol
   - Better debugging
   - One-time change

4. **Task 2 (Enhancement)** - Add Metadata to Responses
   - Nice-to-have
   - Requires ComplianceEngine changes
   - Can be iterative

5. **Task 5 (Verification)** - Test Graph Streaming
   - Ensures existing code works
   - May reveal bugs
   - Documentation update

6. **Task 6 (Optional)** - Create Next.js Adapter
   - Deferred to Phase 3.5 or later
   - Not blocking

---

## Testing Strategy

### Unit Tests

**ComplianceEngine Integration:**
```typescript
describe('ComplianceEngine Chat Integration', () => {
  it('should route to correct agent based on query', async () => {
    // Test agent selection logic
  });

  it('should include metadata in response', async () => {
    // Test metadata presence
  });

  it('should apply ingress/egress guards', async () => {
    // Test privacy boundaries
  });
});
```

**SSE Streaming:**
```typescript
describe('SSE Chat Streaming', () => {
  it('should stream messages in standard SSE format', async () => {
    // Test event format
  });

  it('should handle errors gracefully', async () => {
    // Test error handling
  });
});
```

### Integration Tests

**End-to-End Chat Flow:**
1. POST to `/api/chat` with message
2. Receive streaming response
3. Verify agent was invoked
4. Verify metadata present
5. Verify response content

**Graph Streaming Flow:**
1. Connect to `/api/graph/stream`
2. Trigger graph change (via script)
3. Receive patch event
4. Verify patch format
5. Apply patch to client state

### Manual Testing

**Chat Test Scenarios:**
- Single jurisdiction (IE only)
- Multi-jurisdiction (IE + UK)
- Different persona types
- Complex queries requiring timeline reasoning

**Graph Test Scenarios:**
- Initial load with filters
- Patch streaming after changes
- Multiple concurrent connections
- Large graph performance

---

## Success Criteria

### Must Have (Phase 3 Complete)
- [ ] `/api/chat` uses ComplianceEngine.handleChat()
- [ ] Agent routing works correctly
- [ ] Chat streaming works end-to-end
- [ ] Standard SSE format implemented
- [ ] Graph query logic removed from chat
- [ ] Graph streaming verified and working
- [ ] Metadata included in responses (basic: agent, jurisdictions)

### Should Have
- [ ] Full metadata (confidence, uncertainty, referenced nodes)
- [ ] Timeline metadata when applicable
- [ ] Clean error handling and user feedback

### Nice to Have (Can Defer)
- [ ] `reg-intel-next-adapter` package
- [ ] Advanced graph visualization
- [ ] Graph filtering UI improvements

---

## Risks & Mitigations

### Risk 1: ComplianceEngine interface doesn't support streaming
**Mitigation:** Check interface first; may need to add streaming support
**Fallback:** Wrap ComplianceEngine.handleChat() with streaming adapter

### Risk 2: Breaking changes to frontend
**Mitigation:** Make changes incrementally; test after each change
**Fallback:** Keep old implementation alongside new until verified

### Risk 3: Performance issues with streaming
**Mitigation:** Profile and benchmark; use lightweight event format
**Fallback:** Optimize ComplianceEngine or add caching

---

## Documentation Updates

**Files to Update:**
- [ ] `docs/V0_4_IMPLEMENTATION_STATUS.md` - Mark Phase 3 tasks complete
- [ ] `README.md` - Update API documentation
- [ ] `apps/demo-web/README.md` - Document new endpoints
- [ ] Create `docs/API.md` - Comprehensive API reference

**Code Documentation:**
- [ ] Add JSDoc to all API route handlers
- [ ] Document SSE event format
- [ ] Add examples of ComplianceEngine usage

---

## Timeline Estimate

**Phase 3 Core Tasks:** 1-2 days
- Task 1 (Chat to Engine): 4-6 hours
- Task 3 (Remove graph query): 1 hour
- Task 4 (SSE format): 2-3 hours
- Task 5 (Verification): 2-3 hours

**Phase 3 Enhancements:** 0.5-1 day
- Task 2 (Metadata): 3-4 hours

**Phase 3.5 Optional (Next.js Adapter):** 1-2 days
- Task 6 (Adapter package): 6-8 hours

**Total Phase 3:** 2-3 days for must-haves, +1-2 days for optional enhancements

---

## Next Steps After Phase 3

After Phase 3 is complete, the recommended path is:

**Phase 4: Content & Seeding**
- Seed IE/UK/NI/IM/EU/CTA graph
- Implement special jurisdiction models
- Add domain-specific agents (CGT, R&D, EU coordination)
- Populate comprehensive benefits, reliefs, timelines

**Or Phase 3.5: Next.js Adapter (Optional)**
- Extract adapter package for reusability
- Add advanced features (rate limiting, auth middleware)

---

## Outstanding Tasks from Phase 2

**None critical** - Phase 2 is complete.

**Minor enhancements (can defer):**
- Fix unused variable warnings in legacy code
- Consider adding TypeScript project references for faster builds

---

## References

- `docs/governance/roadmap/archive/roadmap_v_0_4.md` - Phase 3 definition
- `docs/architecture/archive/architecture_v_0_4.md` - Architecture overview
- `docs/governance/decisions/archive/decisions_v_0_4.md` - ADRs
- `packages/reg-intel-core/src/orchestrator/complianceEngine.ts` - Engine interface
- `apps/demo-web/src/app/api/` - Current API implementation

---

**Status:** Ready to implement
**Branch:** `claude/phase-3-implementation-01SkpBxYZmSPvq2wGC99kqP5`
**Next Action:** Start with Task 1 (Wire Chat to ComplianceEngine)
