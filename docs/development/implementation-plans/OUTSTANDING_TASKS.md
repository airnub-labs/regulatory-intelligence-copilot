# Outstanding Tasks & Phase 3 Overview

> **Date:** 2025-11-26
> **Branch:** `claude/phase-3-implementation-01SkpBxYZmSPvq2wGC99kqP5`
> **Status:** Phase 1 & 2 Complete ✅ | Phase 3 Ready to Start

This document provides a high-level overview of outstanding work and Phase 3 goals.

---

## Completed Phases

### ✅ Phase 1: Core Engine, LLM Router & Prompt Aspects

**What Was Built:**
- Graph Ingress Guard with aspect pipeline
- GraphWriteService as only write gate to Memgraph
- Provider-agnostic LLM routing (OpenAI Responses API + Groq + local)
- Prompt aspects for jurisdiction-neutral prompting
- Timeline Engine v0.2
- Node.js 24 LTS + Next.js 16 + React 19 stack

**Status:** Complete and production-ready

---

### ✅ Phase 2: Package Restructuring & Privacy Boundaries

**What Was Built:**
- 4 focused packages:
  - `reg-intel-core` - Orchestration & agents
  - `reg-intel-graph` - Graph clients, write service, ingress guard
  - `reg-intel-llm` - LLM routing, providers, egress guard
  - `reg-intel-prompts` - Prompt aspects & composition
- Facade pattern in reg-intel-core for backward compatibility
- Clean dependency graph (no circular deps)
- ESLint rules to enforce architecture
- All seed scripts use GraphWriteService

**Status:** Complete and production-ready

---

## Current Phase: Phase 3

### 🚧 Phase 3: Web App Integration & Streaming

**Goal:** Connect the architected backend to the Next.js demo app with streaming.

**Status:** Ready to implement (see `docs/PHASE_3_PLAN.md`)

#### Key Objectives

1. **Wire Chat API to ComplianceEngine**
   - Replace direct LlmRouter usage with ComplianceEngine.handleChat()
   - Enable agent routing
   - Include metadata in responses

2. **Clean Up Chat Endpoint**
   - Remove graph query logic from chat
   - Single responsibility: chat only

3. **Standardize SSE Format**
   - Use standard SSE protocol (not custom AI SDK format)
   - Event types: `message`, `metadata`, `error`, `done`

4. **Verify Graph Streaming**
   - Ensure patch-based graph updates work
   - Test with GraphChangeDetector
   - Confirm delta-based patches (not full snapshots)

5. **Add Response Metadata**
   - Agent name
   - Jurisdictions considered
   - Confidence/uncertainty
   - Referenced graph nodes
   - Timeline reasoning

#### Phase 3 Tasks (Priority Order)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Wire chat to ComplianceEngine | Critical | 4-6h | Pending |
| Remove graph query from chat | High | 1h | Pending |
| Standardize SSE format | High | 2-3h | Pending |
| Add response metadata | Medium | 3-4h | Pending |
| Verify graph streaming | Medium | 2-3h | Pending |
| Create Next.js adapter package | Low (Optional) | 6-8h | Deferred |

**Estimated Timeline:** 2-3 days for core tasks

---

## Outstanding Tasks (Non-Blocking)

### From Phase 1 & 2

**None critical.** Minor items:
- [ ] Fix unused variable ESLint warnings (legacy code)
- [ ] Consider TypeScript project references for faster builds
- [ ] Add integration tests for ingress/egress guards
- [ ] Deploy to staging environment

### From Current Implementation

**Issues to Address in Phase 3:**
1. ❌ Chat API bypasses ComplianceEngine - uses LlmRouter directly
2. ❌ No agent routing - always uses generic LLM
3. ❌ No metadata in chat responses
4. ❌ Graph query logic mixed into chat endpoint
5. ⚠️ Custom SSE format instead of standard

**All of these are being fixed in Phase 3.**

---

## Future Phases (Post-Phase 3)

### Phase 3.5: Next.js Adapter Package (Optional)

**Goal:** Extract Next.js integration helpers into reusable package

**What to Build:**
- `packages/reg-intel-next-adapter`
- Chat handler factory
- Graph handler factory
- SSE streaming utilities
- Middleware (auth, rate limiting)

**Benefits:**
- Reusable across multiple Next.js apps
- Clean API route files
- Easier to test

**Status:** Optional enhancement, can defer

---

### Phase 4: Domain Content & Seeding

**Goal:** Seed IE/UK/NI/IM/EU/CTA graph with real regulatory data

**What to Build:**
- Comprehensive IE/UK/NI/IM/EU/CTA graph seed
- Special jurisdiction models (NI as Region, CTA coordination)
- Domain-specific agents:
  - IE Social Safety Net Agent
  - IE Self-Employed Tax Agent
  - IE CGT Investor Agent
  - EU Cross-Border Coordinator Agent
- Benefits, reliefs, timelines, mutual exclusions

**Status:** Blocked on Phase 3 completion

---

### Phase 5: On-Demand Enrichment & Change Tracking

**Goal:** Live knowledge base that grows with use

**What to Build:**
- MCP-based legal search (Revenue.ie, gov.ie, EUR-Lex)
- On-demand enrichment pipeline (via E2B sandbox)
- Change tracking (Finance Acts, eBriefs, TAC decisions)
- `:ChangeEvent` nodes with `AFFECTS`, `UPDATES` edges

**Status:** Conceptual, blocked on Phase 4

---

### Phase 6: SaaS Readiness

**Goal:** Make engine embeddable in other Next.js/Supabase apps

**What to Build:**
- Tenant-aware LLM policies (persist to Supabase)
- Clear embedding story with examples
- Logging & data residency documentation
- SOC2/GDPR compliance tooling

**Status:** Early conceptual

---

### Phase 7: Advanced Enhancements (Optional)

**Future Considerations:**
- Graph algorithms (Leiden community detection, centrality)
- Microsoft GraphRAG evaluation
- Memgraph-as-a-Service offering
- Advanced UX & localization

**Status:** Future exploration

---

## Immediate Next Steps

### For Phase 3 Implementation

1. **Start with Task 1: Wire Chat to ComplianceEngine**
   - Read ComplianceEngine interface
   - Understand handleChat signature
   - Refactor `/api/chat` route
   - Test streaming works

2. **Quick Win: Task 3: Remove Graph Query from Chat**
   - Delete graph query detection logic
   - Remove MCP calls from chat route
   - Clean up imports

3. **Standardize: Task 4: SSE Format**
   - Update streaming format
   - Use standard `event:` and `data:` fields
   - Test with EventSource API

4. **Enhance: Task 2: Add Metadata**
   - Check ComplianceEngine response format
   - Add metadata events to stream
   - Update frontend to display (optional)

5. **Verify: Task 5: Graph Streaming**
   - Test `/api/graph/stream` endpoint
   - Verify patches are received
   - Check GraphChangeDetector works

---

## Blockers & Dependencies

### Phase 3 Blockers

**None.** All prerequisites complete:
- ✅ ComplianceEngine exists and implemented
- ✅ GraphChangeDetector implemented
- ✅ LLM Router working
- ✅ All packages build successfully
- ✅ API routes exist (need refactoring)

### Post-Phase 3 Dependencies

**Phase 4 blocked by:**
- Phase 3 completion (web app integration needed for testing)

**Phase 5 blocked by:**
- Phase 4 completion (need content to enrich)

**Phase 6 blocked by:**
- None technically, but better with Phase 4 content

---

## Quality Gates

### Phase 3 Exit Criteria

**Must Have:**
- [ ] `/api/chat` uses ComplianceEngine.handleChat()
- [ ] Agent routing works
- [ ] Standard SSE format
- [ ] Graph query removed from chat
- [ ] Graph streaming verified
- [ ] Basic metadata (agent, jurisdictions)

**Should Have:**
- [ ] Full metadata (confidence, uncertainty, nodes)
- [ ] Clean error handling
- [ ] Good test coverage

**Nice to Have:**
- [ ] Next.js adapter package
- [ ] Advanced graph features

---

## Technical Debt

### High Priority (Address in Phase 3)
- Fix chat endpoint architecture (bypassing ComplianceEngine)
- Standardize SSE protocol
- Remove insecure graph query feature

### Medium Priority (Address Soon)
- Add integration tests
- Improve error handling
- Add more comprehensive logging

### Low Priority (Future)
- Unused variable warnings
- TypeScript project references
- Optional performance optimizations

---

## References

**Phase Plans:**
- `docs/PHASE_3_PLAN.md` - Detailed Phase 3 implementation plan
- `docs/PHASE_2_PLAN.md` - Phase 2 retrospective
- `docs/PHASE_1_FIXES.md` - Phase 1 critical fixes

**Architecture:**
- `docs/governance/roadmap/archive/roadmap_v_0_4.md` - Complete roadmap
- `docs/architecture_v_0_4.md` - System architecture
- `docs/decisions_v_0_4.md` - ADRs
- `docs/V0_4_IMPLEMENTATION_STATUS.md` - Current status

**Code:**
- `packages/reg-intel-core/src/orchestrator/complianceEngine.ts` - Engine
- `apps/demo-web/src/app/api/chat/route.ts` - Chat endpoint (to refactor)
- `apps/demo-web/src/app/api/graph/stream/route.ts` - Graph streaming

---

**Summary:** Phase 1 & 2 are complete and production-ready. Phase 3 is the next milestone, focusing on web app integration and streaming. All prerequisites are in place, and the implementation plan is defined.

**Next Action:** Begin Phase 3 Task 1 - Wire /api/chat to ComplianceEngine
