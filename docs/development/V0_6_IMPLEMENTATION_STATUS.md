# v0.6 Implementation Status

> **Last Updated**: 2025-12-27

This tracker summarises what is implemented versus still pending for the v0.6 architecture. It is intentionally concise and replaces earlier scattered phase notes.

## Subsystem status

- **ComplianceEngine + agent orchestration** — **Done** ✅
  - Global agent wiring, prompt aspects, egress guard hooks in place.
- **Concept capture & self-populating graph** — **In progress** ⚠️
  - Capture tool wiring exists; ingestion + graph write paths need fuller coverage and tests.
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
- **Graph view integration & context ribbon** — **In progress** ⚠️
  - Basic ribbon present; deeper graph highlighting pending.
- **Docs & governance updates** — **Done** ✅
  - Architecture/decisions updated for persistence + SSE + authorization.

## Completed Work (2025-12-27)

- ✅ Redis/distributed SSE fan-out (PR #184)
- ✅ Supabase persistence with cursor pagination
- ✅ OpenFGA authorization integration (27 tests)
- ✅ Logging framework wired (PR #178)
- ✅ Client telemetry validation (PR #179)
- ✅ reg-intel-prompts test coverage (67 tests)

## Follow-on tasks

- [ ] Implement Scenario Engine (see `docs/architecture/engines/scenario-engine/spec_v_0_1.md`)
- [ ] Expand UI to surface context summaries and referenced graph nodes visually
- [ ] Add test coverage for `reg-intel-graph`, `reg-intel-ui`, `reg-intel-next-adapter`
- [ ] Add API integration tests for pin, branch, merge, cleanup endpoints
