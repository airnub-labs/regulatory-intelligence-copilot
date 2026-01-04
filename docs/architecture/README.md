# Architecture docs

This directory contains the **architecture narratives and diagrams** for the Regulatory Intelligence Copilot.

The codebase is currently aligned to **architecture_v_0_7.md** (extending v0.6 with E2B execution contexts). Earlier versions are retained in `archive/` for design history.

---

## What lives here

- `architecture_v_0_7.md`
  Canonical high-level architecture for v0.7. Extends v0.6 with:
  - E2B execution contexts as a first-class architectural concern
  - LLM-callable code execution tools (`run_code`, `run_analysis`)
  - Execution context lifecycle management keyed by `(tenantId, conversationId, pathId)`
  - EgressGuard integration for sandbox output sanitization

- `architecture_v_0_6.md`
  High-level architecture for v0.6 (superseded by v0.7). Describes:
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

## Caching & Storage with Transparent Failover

- `caching-and-storage_failover_v1.md`
  **Canonical documentation** for caching and storage layer patterns. Covers:
  - Transparent failover architecture (Redis optional, system functions without it)
  - Cache abstractions (TransparentCache, TransparentRateLimiter, PassThroughCache)
  - Factory functions that NEVER return null
  - CachingConversationStore and CachingPolicyStore patterns
  - Rate limiting with fail-open behavior
  - In-memory components policy (what's acceptable vs. prohibited)
  - Operational guidance (env vars, key naming, TTLs)
  - Code review checklist for cache implementations

Related:
- `FAULT_TOLERANT_ARCHITECTURE.md` - Core fault tolerance principles
- `../operations/TRANSPARENT_FAILOVER_RUNBOOK.md` - Operations runbook
- `../development/TRANSPARENT_FAILOVER_DEPLOYMENT_GUIDE.md` - Deployment guide

---

## Execution Contexts & E2B Integration

- `execution-contexts_e2b_v1.md`
  **Canonical documentation** for E2B execution contexts and code execution tools. Covers:
  - Execution context lifecycle (create, reuse, terminate)
  - Per-path sandbox isolation model
  - `run_code` and `run_analysis` tool interfaces
  - Database schema (`execution_contexts` table)
  - Security model (multi-tenancy, PII sanitization)
  - Operational considerations (timeouts, cleanup, observability)
  - Future work items (clearly separated from implemented features)

Related:
- `execution-context/IMPLEMENTATION_STATE.json` - Historical implementation tracking
- `../archive/execution-contexts/` - Archived original documentation

---

## Regulatory Graph

The regulatory graph is a PII-free knowledge graph stored in Memgraph. Documentation has been consolidated:

- `graph/regulatory-graph_current_v0.6.md`
  **Canonical entry point** for the current graph schema, change detection, and modeling conventions. Covers:
  - Schema overview (27 node types, 44+ relationship types)
  - Change detection and SSE streaming (GraphChangeDetector, patch format)
  - Modeling conventions for jurisdictions, benefits, reliefs, obligations
  - Special jurisdictions (NI, CTA, IM, Gibraltar, Andorra)
  - Operational considerations

- `graph/regulatory-graph_proposals_v0.7+.md`
  **Future proposals** for RegulatoryBody, AssetClass, MeansTest, TaxYear, and UK/EU extensions.

Related detailed specs:
- `graph/schema_v_0_6.md` — Complete node/edge property definitions
- `graph/change_detection_v_0_6.md` — Detailed change detection spec
- `graph/algorithms_v_0_1.md` — Optional Leiden/centrality algorithms
- `graph/special_jurisdictions_modelling_v_0_1.md` — NI/CTA modeling guidance

---

## Observability & Telemetry

- `observability-and-telemetry_v1.md`
  **Canonical documentation** for the observability and telemetry system. Covers:
  - End-to-end architecture (Client → API → OTEL Collector → Loki/Jaeger/Prometheus → Grafana)
  - Client telemetry (batching, rate limiting, OTEL integration)
  - Server-side instrumentation (Pino logging, OTEL traces, metrics)
  - Local observability stack (docker-compose setup)
  - Environment configuration reference
  - Troubleshooting guide

Related:
- `client-telemetry-architecture-v1.md` - Detailed client telemetry deep-dive
- `OBSERVABILITY_LOKI_SETUP.md` - Loki/Grafana specific configuration
- `../observability/` - Additional observability documentation
- `../archive/observability-and-telemetry/` - Archived historical documentation

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
- **`../architecture/graph/regulatory-graph_current_v0.6.md` – canonical entry point for graph schema + change detection.**
- `../architecture/graph/schema_v_0_6.md` & `../architecture/graph/schema_changelog_v_0_6.md` – detailed rules graph schema.
- `../architecture/graph/algorithms_v_0_1.md` – optional graph algorithms and when to use them.
- `../architecture/conversation-context/concept_capture_v_0_1.md` – SKOS-style concept capture via tools.
- `../architecture/conversation-context/spec_v_0_1.md` – server-side ConversationContext and its aspect.
- `../architecture/execution-contexts_e2b_v1.md` – E2B execution contexts and code execution tools.
- `../architecture/engines/timeline-engine/spec_v_0_2.md` – timeline engine modelling and tool interface.
- `../architecture/engines/scenario-engine/spec_v_0_1.md` – conceptual Scenario Engine and integration.
- `../architecture/graph/change_detection_v_0_6.md` – graph change detection and patch streaming.
- `../architecture/client-telemetry-architecture-v1.md` – client telemetry batching, rate limiting, and OTEL integration architecture.
- `../architecture/observability-and-telemetry_v1.md` – observability and telemetry (client telemetry, logging, tracing, metrics).

For decisions about **why** the architecture looks this way, see:

- `../governance/decisions/decisions_v_0_6.md`

For **when** different architectural pieces are expected to land, see:

- `../governance/roadmap/roadmap_v_0_6.md`

---

## How to use these docs when making changes

When you're about to add or change something non-trivial:

1. **Skim `architecture_v_0_7.md`** to see where it belongs.
2. **Check the relevant spec** in `../architecture/` (graph schema, timeline, scenario, conversation-context, execution-contexts, guards).
3. **Confirm there isn't a conflicting decision** in `../governance/decisions/decisions_v_0_6.md`.
4. **Check the roadmap** in `../governance/roadmap/roadmap_v_0_6.md` to see if the work is planned in the current phase.

If your change meaningfully alters a flow or invariant that's described here, update:

- `architecture_v_0_7.md` (or add a new version if it's a major revision), and
- The relevant spec(s) and decision entries.

Keeping these documents in sync with the code is what makes this repo a **reusable reference architecture** instead of just another code sample.
