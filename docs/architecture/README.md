# Architecture docs

This directory contains the **architecture narratives and diagrams** for the Regulatory Intelligence Copilot.

The codebase is currently aligned to **architecture_v_0_6.md**. Earlier versions are retained in `archive/` for design history.

---

## What lives here

- `architecture_v_0_6.md`  
  Canonical high-level architecture for v0.6. Describes:
  - Major packages (`reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`).
  - Core flows (chat → Compliance Engine → LlmRouter/graph/timeline/MCP → streaming response).
  - Safety invariants (no PII in Memgraph, all writes via GraphWriteService + ingress guard, all egress via EgressGuard).
  - How Supabase/Postgres, Memgraph, and the LLM layer fit together.

- `architecture_diagrams_v_0_6.md`  
  Diagrams for v0.6, including (examples):
  - End-to-end chat flow (UI ↔ /api/chat ↔ Compliance Engine ↔ LlmRouter/graph/tools).
  - Concept capture & ConversationContext data flow.
  - Graph ingress/egress guard placement.
  - Timeline & scenario engine integration as tools.
  - Graph change detection and patch streaming.

- `archive/architecture_v_0_*.md`
  Historical architecture docs (0.1 → 0.5). These are preserved for:
  - Understanding how the design evolved.
  - Tracing decisions back to earlier phases.
  - Comparing earlier and current flows when debugging legacy code.

---

---

## Conversation System

- `conversation-path-system.md`
  **Canonical documentation** for the conversation path system with branching, merging, and path-aware navigation. Covers:
  - Conceptual model (paths, branching, merging, inheritance)
  - Data model (database schema, TypeScript interfaces)
  - Core operations (path resolution, branching, merging)
  - API surface (REST endpoints)
  - UI/UX behavior (components, navigation)
  - Developer guide and best practices

- `conversation-compaction-and-merge-compression_v1.md`
  **Canonical documentation** for conversation compaction and merge compression. Covers:
  - Token counting infrastructure (tiktoken)
  - Path compaction strategies (none, sliding_window, semantic, hybrid)
  - Merge compaction strategies (minimal, moderate, aggressive)
  - Pinned message preservation
  - PathCompactionService and snapshot/rollback system
  - API endpoints and UI components
  - OpenTelemetry metrics and database persistence

---

## Relationship to other docs

The architecture docs are **top-level narratives**. They describe the big picture; detailed behaviour lives in the specs under `docs/architecture/`.

When you’re working on a feature:

- Use **architecture_v_0_6.md** to answer:
  - “Which package should this live in?”
  - “Which layers are allowed to talk to which?”
  - “Where do we enforce ingress/egress rules?”

- Use the **specs** to answer:
  - “What does this node/edge look like?” (`graph/schema_v_0_6.md`)
  - “How should this tool’s parameters be shaped?” (timeline/scenario/concept-capture specs)
  - “How is conversation context stored and injected?” (`conversation-context/spec_v_0_1.md`)

Relevant specs include:

- `../architecture/copilot-concept/concept_v_0_6.md` – product concept and goals.
- `../architecture/graph/schema_v_0_6.md` & `../architecture/graph/schema_changelog_v_0_6.md` – rules graph schema.
- `../architecture/graph/algorithms_v_0_1.md` – optional graph algorithms and when to use them.
- `../architecture/conversation-context/concept_capture_v_0_1.md` – SKOS-style concept capture via tools.
- `../architecture/conversation-context/spec_v_0_1.md` – server-side ConversationContext and its aspect.
- `../architecture/engines/timeline-engine/spec_v_0_2.md` – timeline engine modelling and tool interface.
- `../architecture/engines/scenario-engine/spec_v_0_1.md` – conceptual Scenario Engine and integration.
- `../architecture/graph/change_detection_v_0_6.md` – graph change detection and patch streaming.
- `../architecture/client-telemetry-architecture-v1.md` – client telemetry batching, rate limiting, and OTEL integration architecture.

For decisions about **why** the architecture looks this way, see:

- `../governance/decisions/decisions_v_0_6.md`

For **when** different architectural pieces are expected to land, see:

- `../governance/roadmap/roadmap_v_0_6.md`

---

## How to use these docs when making changes

When you’re about to add or change something non-trivial:

1. **Skim `architecture_v_0_6.md`** to see where it belongs.
2. **Check the relevant spec** in `../architecture/` (graph schema, timeline, scenario, conversation-context, guards).
3. **Confirm there isn’t a conflicting decision** in `../governance/decisions/decisions_v_0_6.md`.
4. **Check the roadmap** in `../governance/roadmap/roadmap_v_0_6.md` to see if the work is planned in the current phase.

If your change meaningfully alters a flow or invariant that’s described here, update:

- `architecture_v_0_6.md` (or add a new version if it’s a major revision), and
- The relevant spec(s) and decision entries.

Keeping these documents in sync with the code is what makes this repo a **reusable reference architecture** instead of just another code sample.
