# v0.6 Implementation Status

This tracker summarises what is implemented versus still pending for the v0.6 architecture. It is intentionally concise and replaces earlier scattered phase notes.

## Subsystem status

- **ComplianceEngine + agent orchestration** — **Done**
  - Global agent wiring, prompt aspects, egress guard hooks in place.
- **Concept capture & self-populating graph** — **In progress**
  - Capture tool wiring exists; ingestion + graph write paths need fuller coverage and tests.
- **Conversation context (active nodes + summaries)** — **Done**
  - Supabase-backed context store ships alongside the in-memory default; production wiring uses Supabase schemas/RLS when configured.
- **Timeline engine integration** — **In progress**
  - Baseline engine present; more scenarios and coverage needed.
- **Scenario engine integration** — **Not implemented**
  - Hooks documented; runtime paths not yet exercised.
- **Conversation persistence (Supabase + dev fallback)** — **Done**
  - Supabase-backed store implemented in `@reg-copilot/reg-intel-conversations` with schema + seeds (share_audience + tenant_access + authorization envelope) and env-driven swap from the in-memory default.
- **UI conversation list/resume + metadata ribbon** — **In progress**
  - UI can list/resume via in-memory store; Supabase and richer metadata rendering deferred.
- **Shared-conversation SSE fan-out** — **Done**
  - Distributed event hubs added (Redis and Supabase Realtime) with env-driven selection; multi-instance listeners receive conversation updates.
- **Graph view integration & context ribbon** — **In progress**
  - Basic ribbon present; deeper graph highlighting pending.
- **Docs & governance updates** — **In progress**
  - Architecture/decisions updated for persistence + SSE; further alignment needed as production wiring lands.

## Follow-on tasks

- Extend `/api/conversations` endpoints to page via Supabase views.
- Wire `authorization_model`/`authorization_spec` to a ReBAC service (OpenFGA or similar) alongside Supabase RLS when auth is added.
- Broaden Timeline + Scenario engine coverage and connect to persisted context.
- Expand UI to surface context summaries and referenced graph nodes visually.
