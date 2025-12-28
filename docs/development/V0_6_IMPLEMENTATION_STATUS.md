# v0.6 Implementation Status

> **Last Updated**: 2025-12-28
> **Status**: All v0.6 features complete except Scenario Engine

This tracker summarises what is implemented versus still pending for the v0.6 architecture. It is intentionally concise and replaces earlier scattered phase notes.

## Subsystem status

- **ComplianceEngine + agent orchestration** — **Done** ✅
  - Global agent wiring, prompt aspects, egress guard hooks in place.
- **Concept capture & self-populating graph** — **Done** ✅
  - Capture tool wiring complete; comprehensive test coverage for graph write service, ingress guard, and canonical concept handler (85 tests).
- **Conversation context (active nodes + summaries)** — **Done** ✅
  - Supabase-backed context store ships alongside the in-memory default; production wiring uses Supabase schemas/RLS when configured.
- **Timeline engine integration** — **Done** ✅
  - Baseline engine present with good test coverage; expansion to more scenarios deferred.
- **Scenario engine integration** — **Not implemented** ❌
  - Hooks documented; runtime paths not yet exercised. See `OUTSTANDING_WORK.md` for implementation plan.
- **Conversation persistence (Supabase + dev fallback)** — **Done** ✅
  - Supabase-backed store implemented in `@reg-copilot/reg-intel-conversations` with schema + seeds (share_audience + tenant_access + authorization envelope) and env-driven swap from the in-memory default.
  - Cursor-based pagination added (2025-12-27).
- **UI conversation list/resume + metadata ribbon** — **Done** ✅
  - UI can list/resume via in-memory store; Supabase wired when configured.
- **Shared-conversation SSE fan-out** — **Done** ✅
  - Distributed event hubs added (Redis pub/sub) with env-driven selection; multi-instance listeners receive conversation updates.
  - `RedisConversationEventHub` and `RedisConversationListEventHub` implemented (2025-12-27).
- **OpenFGA/ReBAC Authorization** — **Done** ✅
  - Three implementations: `SupabaseRLSAuthorizationService`, `OpenFGAAuthorizationService`, `HybridAuthorizationService`.
  - Per-conversation authorization model configuration.
  - 27 unit tests covering all authorization flows.
- **Graph view integration & context ribbon** — **Done** ✅
  - Context summaries and referenced graph nodes surfaced in chat UI (PR #208, 2025-12-28).
  - `mini-graph.tsx` component for color-coded node visualization.
  - Collapsible context summary panels in message components.
  - Test coverage: 9 tests for context summary display.
- **Docs & governance updates** — **Done** ✅
  - Architecture/decisions updated for persistence + SSE + authorization.

## Completed Work (2025-12-27)

- ✅ Redis/distributed SSE fan-out (PR #184)
- ✅ Supabase persistence with cursor pagination
- ✅ OpenFGA authorization integration (27 tests)
- ✅ Logging framework wired (PR #178)
- ✅ Client telemetry validation (PR #179)
- ✅ reg-intel-prompts test coverage (67 tests)
- ✅ reg-intel-graph test coverage (85 tests)
- ✅ Path system page integration (100% wired)
- ✅ reg-intel-next-adapter test coverage (23 tests, 100% passing)
- ✅ API integration tests (14/19 routes tested, 74% coverage - up from 16%)
- ✅ reg-intel-ui hook tests (useConversationPaths - 29 tests, 100% passing)
- ✅ reg-intel-ui testing infrastructure (Vitest + React Testing Library)

## Completed Work (2025-12-28)

- ✅ Context Summaries & Graph Nodes UI (PR #208) - mini-graph.tsx, collapsible panels
- ✅ Security & Input Validation fixes (PR #204) - all 4 SEC tasks complete
- ✅ Error Handling improvements (PR #206) - error boundaries, catch blocks fixed
- ✅ API integration tests 100% complete (20/20 routes tested)
- ✅ reg-intel-ui component tests (210+ tests across 8 components)
- ✅ reg-intel-core MEDIUM priority tests (sandboxManager, llmClient - 50 tests)
- ✅ reg-intel-conversations MEDIUM priority tests (82 tests added)
- ✅ egressGuard.ts comprehensive tests (133 tests)
- ✅ Observability stack complete (Loki/Grafana production stack, PR #210)

## Follow-on tasks

- [ ] Implement Scenario Engine (see `docs/architecture/engines/scenario-engine/spec_v_0_1.md`) - **ONLY REMAINING GAP**

## Archived Tasks (Completed)

- [x] ~~Expand UI to surface context summaries and referenced graph nodes visually~~ ✅ DONE (PR #208)
- [x] ~~Add component tests for `reg-intel-ui`~~ ✅ DONE (210+ tests, all 8 components)
- [x] ~~Add tests for remaining API routes~~ ✅ DONE (100% coverage, 20/20 routes)
