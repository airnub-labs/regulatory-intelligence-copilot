# Documentation index

This folder contains all of the **architecture, governance, and spec documents** for the Regulatory Intelligence Copilot.

The codebase is currently aligned with **architecture v0.7.x** (extending v0.6 with E2B execution contexts). Earlier versions are retained for design history and archaeology.

---

## Recommended reading order

If you're new to the project and want to understand how it fits together:

1. **Concept & high-level architecture**
   - `architecture/architecture_v_0_7.md`
   - `architecture/copilot-concept/concept_v_0_6.md`
2. **Governance (decisions & roadmap)**
   - `governance/decisions/decisions_v_0_6.md`
   - `governance/roadmap/roadmap_v_0_6.md`
3. **Regulatory graph**
   - **`architecture/graph/regulatory-graph_current_v0.6.md`** — Canonical entry point (schema + change detection + modeling)
   - `architecture/graph/regulatory-graph_proposals_v0.7+.md` — Future proposals
4. **Engines**
   - `specs/timeline_engine_v_0_2.md`
   - `specs/scenario_engine_v_0_1.md`
5. **Runtime glue & safety**
   - `specs/conversation-context/concept_capture_from_main_chat_v_0_1.md`
   - `specs/conversation-context/conversation_context_spec_v_0_1.md`
   - `specs/data_privacy_and_architecture_boundaries_v_0_1.md`
   - `specs/graph_ingress_guard_v_0_1.md`
   - `specs/safety-guards/egress_guard_v_0_3.md`

After that, dip into the remaining specs as needed.

---

## Architecture

High-level and historical architecture docs live under `docs/architecture/`:

- `architecture/architecture_v_0_7.md`
  Canonical high-level architecture for the current implementation. Extends v0.6 with E2B execution contexts.

- `architecture/architecture_v_0_6.md`
  High-level architecture for v0.6 (superseded by v0.7).

- `architecture/architecture_diagrams_v_0_7.md`
  Diagrams for v0.7 (chat flow, LlmRouter, graph ingress/egress, concept capture, ConversationContext, execution contexts, etc.).

- `architecture/archive/architecture_v_0_*.md`
  Earlier architecture versions preserved for design history (0.1 → 0.5). Use these when you need to understand why something changed.

If you only have time for two docs, read:

1. `architecture/architecture_v_0_7.md`
2. `architecture/copilot-concept/concept_v_0_6.md`

---

## Governance

Governance covers **decisions** (ADRs) and the **roadmap**.

### Decisions

- `governance/decisions/decisions_v_0_6.md` – current decisions.  
- `governance/decisions/versions/decisions_v_0_*.md` – historical snapshots.

Read these when you’re unsure **why** something is the way it is, or when you’re proposing a change that might contradict an existing decision.

### Roadmap

- `governance/roadmap/roadmap_v_0_6.md` – the latest phased roadmap.  
- `governance/roadmap/versions/roadmap_v_0_*.md` – earlier roadmap versions.

Use the roadmap when deciding **what to work on next** or **how far along** a feature is expected to be.

---

## Specs

Specs capture the **shape and behaviour** of the main subsystems.

### Core concept & graph

- `specs/regulatory_graph_copilot_concept_v_0_6.md` – overall product concept and goals.
- **`architecture/graph/regulatory-graph_current_v0.6.md`** – canonical entry point for graph schema + change detection.
- `architecture/graph/schema_v_0_6.md` – detailed node/edge schema for the rules graph.
- `architecture/graph/schema_changelog_v_0_6.md` – how the schema evolved to v0.6.
- `architecture/graph/algorithms_v_0_1.md` – query patterns and optional algorithms.

### Timeline & scenarios

- `specs/timeline_engine_v_0_2.md` – modelling temporal rules (lookbacks, lock-ins, deadlines, effective windows) and how the engine is called as a tool.
- `specs/scenario_engine_v_0_1.md` – conceptual Scenario Engine for what‑if reasoning; see also `specs/scenario_engine_integration_v_0_1.md` if present.

### Conversation context & concept capture

- `specs/conversation-context/concept_capture_from_main_chat_v_0_1.md` – SKOS-style concept capture via tools in the main chat call (single-call design, streaming-safe).
- `specs/conversation-context/conversation_context_spec_v_0_1.md` – ConversationContext shape, persistence, and the prompt aspect that injects it into the Compliance Engine.

### Safety & boundaries

- `specs/data_privacy_and_architecture_boundaries_v_0_1.md` – what data is allowed where (Supabase vs Memgraph vs LLMs vs MCP).
- `specs/graph_ingress_guard_v_0_1.md` – how all Memgraph writes go through ingress aspects.
- `specs/safety-guards/egress_guard_v_0_3.md` – how all outbound calls (LLM, MCP, HTTP) go through egress aspects.
- `architecture/graph/special_jurisdictions_modelling_v_0_1.md` – IE/UK/NI/IM/EU/CTA/GI/AD and their special relationships.

### Other

- `migration_plan_v_0_2.md` – how the project migrated from `rfc-refactor` to the regulatory copilot.
- `node_24_lts_rationale.md` – why Node.js 24 LTS is the minimum runtime.

---

## Regulatory Graph & Change Detection

The regulatory graph documentation has been consolidated:

- **`architecture/graph/regulatory-graph_current_v0.6.md`** – **Canonical entry point** for the current graph schema, change detection, and modeling conventions.
- `architecture/graph/regulatory-graph_proposals_v0.7+.md` – Future proposals for v0.7+.

Detailed specifications:
- `architecture/graph/schema_v_0_6.md` – Complete node/edge property definitions.
- `architecture/graph/change_detection_v_0_6.md` – Detailed change detection spec.
- `architecture/graph/algorithms_v_0_1.md` – Optional Leiden/centrality algorithms.
- `architecture/graph/special_jurisdictions_modelling_v_0_1.md` – NI/CTA/IM modeling.

These docs are important whenever you're touching:

- The Memgraph → frontend graph data flow.
- Live graph visualizations.
- Any feature that depends on incremental updates rather than full reloads.

---

## Conversation Path System

The conversation path system enables branching, merging, and path-aware navigation for conversations:

- `architecture/conversation-path-system.md`
  **Canonical reference** for the conversation path system. Includes architecture, data model, API surface, UI components, and developer guide.

Historical/archived documentation is preserved under `archive/conversation-path-system/` for reference.

---

## Conversation Compaction & Merge Compression

The compaction system manages conversation context size through intelligent message compression:

- `architecture/conversation-compaction-and-merge-compression_v1.md`
  **Canonical reference** for conversation compaction and merge compression. Includes:
  - Token counting infrastructure (tiktoken)
  - 8 compaction strategies (path and merge)
  - Pinned message preservation
  - API endpoints and UI components
  - Configuration options

Historical/archived documentation is preserved under `archive/conversation-compaction/` for reference.

---

## Caching & Storage with Transparent Failover

The caching layer provides Redis-backed caching with automatic transparent failover:

- `architecture/caching-and-storage_failover_v1.md`
  **Canonical reference** for caching and storage patterns. Includes:
  - Transparent failover architecture (Redis optional, system functions without it)
  - Cache abstractions (TransparentCache, TransparentRateLimiter)
  - Correct patterns for implementing caches (factory functions NEVER return null)
  - Rate limiting with fail-open behavior
  - In-memory components policy
  - Operational guidance

Historical/archived documentation is preserved under `archive/caching-and-storage/` for reference.

---

## Execution Contexts & E2B Integration

The execution context system provides per-path isolated E2B sandboxes for code execution:

- `architecture/execution-contexts_e2b_v1.md`
  **Canonical reference** for E2B execution contexts and code execution tools. Includes:
  - Execution context lifecycle (create, reuse, terminate)
  - Per-path sandbox isolation model
  - `run_code` and `run_analysis` tool interfaces
  - Database schema (`execution_contexts` table)
  - Security model (multi-tenancy, PII sanitization)
  - Operational considerations (timeouts, cleanup, observability)
  - Future work items

Related:
- `architecture/execution-context/IMPLEMENTATION_STATE.json` – Historical implementation tracking
- `archive/execution-contexts/` – Archived original documentation

---

## Observability & Client Telemetry

Observability architecture and telemetry systems:

- `architecture/client-telemetry-architecture-v1.md` – Production-ready client telemetry system with batching, rate limiting, and OpenTelemetry Collector integration.
- `client-telemetry/README.md` – Complete user guide covering setup, configuration, deployment, and troubleshooting.
- `client-telemetry/QUICKSTART.md` – Quick start guide to get running in 5 minutes.
- `testing/client-telemetry-test-requirements.md` – Mandatory test requirements to prevent regression of scalability features.

**CRITICAL:** The client telemetry system has strict non-regression requirements documented in `AGENTS.md` (§ Client telemetry). Any changes to telemetry code must pass all tests in the test requirements document before merging.

These docs are important whenever you're:
- Adding new client-side telemetry events
- Modifying the telemetry batching or delivery system
- Configuring OpenTelemetry Collector integration
- Deploying telemetry infrastructure

---

## Phases & reviews

- `phases/PHASE_*` – phase-specific plans, reviews, and checklists (e.g. v0.6 implementation plans, crits, and gap analyses).

These are useful for understanding **what was in scope** for a given phase and how well the implementation matched the intent.

---

## How to use these docs when coding

When implementing or changing something, try to:

1. Identify which **spec(s)** apply (graph schema, timeline, scenario, conversation context, execution contexts, safety, etc.).
2. Check the **architecture** doc to see where the change belongs (reg-intel-core vs reg-intel-graph vs reg-intel-llm vs reg-intel-prompts vs reg-intel-conversations).
3. Check **governance/decisions/decisions_v_0_6.md** to ensure you're not contradicting an existing ADR.
4. Check the **governance/roadmap/roadmap_v_0_6.md** to see if the work is planned and what phase it's in.

If you find gaps or contradictions, update the relevant spec/decision/roadmap rather than letting code drift away from the docs.

