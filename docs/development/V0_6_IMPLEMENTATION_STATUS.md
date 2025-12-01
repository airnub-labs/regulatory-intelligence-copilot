# v0.6 Implementation Status

This tracker summarises what is implemented versus still pending for the v0.6 architecture. It is intentionally concise and replaces earlier scattered phase notes.

## Subsystem status

- **ComplianceEngine + agent orchestration** — **Done**
  - Global agent wiring, prompt aspects, egress guard hooks in place.
- **Concept capture & self-populating graph** — **In progress**
  - Capture tool wiring exists; ingestion + graph write paths need fuller coverage and tests.
- **Conversation context (active nodes + summaries)** — **In progress**
  - Context store interface implemented with an in-memory default; Supabase schema present but production persistence still to be wired.
- **Timeline engine integration** — **In progress**
  - Baseline engine present; more scenarios and coverage needed.
- **Scenario engine integration** — **Not implemented**
  - Hooks documented; runtime paths not yet exercised.
- **Conversation persistence (Supabase + dev fallback)** — **In progress**
  - Schema + seeds added (share_audience + tenant_access + authorization envelope), in-memory stores used by the Next adapter; Supabase-backed store deferred.
- **UI conversation list/resume + metadata ribbon** — **In progress**
  - UI can list/resume via in-memory store; Supabase and richer metadata rendering deferred.
- **Shared-conversation SSE fan-out** — **In progress**
  - Single-instance event hub added; multi-instance (Redis or similar) still required for production.
- **Graph view integration & context ribbon** — **In progress**
  - Basic ribbon present; deeper graph highlighting pending.
- **Docs & governance updates** — **In progress**
  - Architecture/decisions updated for persistence + SSE; further alignment needed as production wiring lands.

## Follow-on tasks

- Implement Supabase-backed `ConversationStore`/`ConversationContextStore` and swap in when env vars are present.
- Add RLS policies and auth scoping for multi-tenant Supabase usage.
- Extend `/api/conversations` endpoints to page via Supabase views.
- Harden SSE fan-out with Redis/pub-sub for horizontal scaling; add tests.
- Wire `authorization_model`/`authorization_spec` to a ReBAC service (OpenFGA or similar) alongside Supabase RLS when auth is added.
- Broaden Timeline + Scenario engine coverage and connect to persisted context.
- Expand UI to surface context summaries and referenced graph nodes visually.
