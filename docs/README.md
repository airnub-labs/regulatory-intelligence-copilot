# Documentation index

This folder contains all of the **architecture, governance, and development documents** for the Regulatory Intelligence Copilot.

The codebase is currently aligned with **architecture v0.6.x**. Earlier versions are retained for design history and archaeology.

For naming and maintenance conventions, see `docs_maintenance_v_0_1.md`.

---

## Recommended reading order

If you’re new to the project and want to understand how it fits together:

1. **Concept & high-level architecture**
   - `architecture_v_0_6.md`
   - `architecture/copilot-concept/concept_v_0_6.md`
2. **Governance (decisions & roadmap)**
   - `governance/decisions/decisions_v_0_6.md`
   - `governance/roadmap/roadmap_v_0_6.md`
3. **Core schema & engines**
   - `architecture/graph/schema_v_0_6.md`
   - `architecture/graph/schema_changelog_v_0_6.md`
   - `architecture/engines/timeline-engine/spec_v_0_2.md`
   - `architecture/engines/scenario-engine/spec_v_0_1.md`
4. **Runtime glue & safety**
   - `architecture/conversation-context/concept_capture_v_0_1.md`
   - `architecture/conversation-context/spec_v_0_1.md`
   - `architecture/data_privacy_and_architecture_boundaries_v_0_1.md`
   - `architecture/guards/graph_ingress_v_0_1.md`
   - `architecture/guards/egress_v_0_2.md`
5. **Change detection & streaming**
   - `architecture/graph/change_detection_v_0_6.md`

After that, dip into the remaining specs as needed.

---

## Architecture

High-level and historical architecture docs live under `docs/architecture/`:

- `architecture/architecture_v_0_6.md`  
  Canonical high-level architecture for the current implementation.

- `architecture/architecture_diagrams_v_0_6.md`  
  Diagrams for v0.6 (chat flow, LlmRouter, graph ingress/egress, concept capture, ConversationContext, etc.).

- `architecture/archive/architecture_v_0_*.md`
  Earlier architecture versions preserved for design history (0.1 → 0.5). Use these when you need to understand why something changed.

If you only have time for two docs, read:

1. `architecture/architecture_v_0_6.md`
2. `architecture/copilot-concept/concept_v_0_6.md`

---

## Governance

Governance covers **decisions** (ADRs) and the **roadmap**.

### Decisions

- `governance/decisions/decisions_v_0_6.md` – current decisions.  
- `governance/decisions/archive/decisions_v_0_*.md` – historical snapshots.

Read these when you’re unsure **why** something is the way it is, or when you’re proposing a change that might contradict an existing decision.

### Roadmap

- `governance/roadmap/roadmap_v_0_6.md` – the latest phased roadmap.
- `governance/roadmap/archive/roadmap_v_0_*.md` – earlier roadmap versions.

Use the roadmap when deciding **what to work on next** or **how far along** a feature is expected to be.

---

## Specs

Specs capture the **shape and behaviour** of the main subsystems.

### Core concept & graph

- `architecture/copilot-concept/concept_v_0_6.md` – overall product concept and goals.
- `architecture/graph/schema_v_0_6.md` – node/edge schema for the rules graph.
- `architecture/graph/schema_changelog_v_0_6.md` – how the schema evolved to v0.6.
- `architecture/graph/algorithms_v_0_1.md` – query patterns and optional algorithms.

### Timeline & scenarios

- `architecture/engines/timeline-engine/spec_v_0_2.md` – modelling temporal rules (lookbacks, lock-ins, deadlines, effective windows) and how the engine is called as a tool.
- `architecture/engines/scenario-engine/spec_v_0_1.md` – conceptual Scenario Engine for what‑if reasoning; see also `architecture/engines/scenario-engine/archive/integration_v_0_1.md` if present.

### Conversation context & concept capture

- `architecture/conversation-context/concept_capture_v_0_1.md` – SKOS-style concept capture via tools in the main chat call (single-call design, streaming-safe).
- `architecture/conversation-context/spec_v_0_1.md` – ConversationContext shape, persistence, and the prompt aspect that injects it into the Compliance Engine.

### Safety & boundaries

- `architecture/data_privacy_and_architecture_boundaries_v_0_1.md` – what data is allowed where (Supabase vs Memgraph vs LLMs vs MCP).
- `architecture/guards/graph_ingress_v_0_1.md` – how all Memgraph writes go through ingress aspects.
- `architecture/guards/egress_v_0_2.md` – how all outbound calls (LLM, MCP, HTTP) go through egress aspects.
- `architecture/graph/special_jurisdictions_modelling_v_0_1.md` – IE/UK/NI/IM/EU/CTA/GI/AD and their special relationships.

### Other

- `governance/migrations/migration_plan_v_0_2.md` – how the project migrated from `rfc-refactor` to the regulatory copilot.
- `architecture/runtime/node_24_lts_rationale_v_0_1.md` – why Node.js 24 LTS is the minimum runtime.

---

## Change detection & graph streaming

Change detection and graph streaming have their own area:

- `architecture/graph/change_detection_v_0_6.md` – current design for patch-based graph change detection and streaming, including nodes/edges created/updated/deleted and `edges_updated` for edge property changes.
- `architecture/graph/archive/*.md` – earlier experiments and enhancement notes kept for reference.

These docs are important whenever you’re touching:

- The Memgraph → frontend graph data flow.
- Live graph visualisations.
- Any feature that depends on incremental updates rather than full reloads.

---

## Phases & reviews

- `development/implementation-plans/PHASE_*` – phase-specific plans, reviews, and checklists (e.g. v0.6 implementation plans, crits, and gap analyses).

These are useful for understanding **what was in scope** for a given phase and how well the implementation matched the intent.

---

## How to use these docs when coding

When implementing or changing something, try to:

1. Identify which **spec(s)** apply (graph schema, timeline, scenario, conversation context, safety, etc.).
2. Check the **architecture** doc to see where the change belongs (reg-intel-core vs reg-intel-graph vs reg-intel-llm vs reg-intel-prompts).
3. Check **decisions_v_0_6** to ensure you’re not contradicting an existing ADR.
4. Check the **roadmap_v_0_6** to see if the work is planned and what phase it’s in.

If you find gaps or contradictions, update the relevant spec/decision/roadmap rather than letting code drift away from the docs.

