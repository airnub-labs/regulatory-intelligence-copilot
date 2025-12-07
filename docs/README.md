# Documentation index

This folder contains all of the **architecture, governance, and spec documents** for the Regulatory Intelligence Copilot.

The codebase is currently aligned with **architecture v0.6.x**. Earlier versions are retained for design history and archaeology.

---

## Recommended reading order

If you’re new to the project and want to understand how it fits together:

1. **Concept & high-level architecture**
   - `architecture_v_0_6.md`
   - `specs/regulatory_graph_copilot_concept_v_0_6.md`
2. **Governance (decisions & roadmap)**
   - `governance/decisions/decisions_v_0_6.md`
   - `governance/roadmap/roadmap_v_0_6.md`
3. **Core schema & engines**
   - `specs/graph_schema_v_0_6.md`
   - `specs/graph_schema_changelog_v_0_6.md`
   - `specs/timeline_engine_v_0_2.md`
   - `specs/scenario_engine_v_0_1.md`
4. **Runtime glue & safety**
   - `specs/conversation-context/concept_capture_from_main_chat_v_0_1.md`
   - `specs/conversation-context/conversation_context_spec_v_0_1.md`
   - `specs/data_privacy_and_architecture_boundaries_v_0_1.md`
   - `specs/graph_ingress_guard_v_0_1.md`
  - `specs/safety-guards/egress_guard_v_0_3.md`
5. **Change detection & streaming**
   - `change-detection/graph_change_detection_v_0_6.md`

After that, dip into the remaining specs as needed.

---

## Architecture

High-level and historical architecture docs live under `docs/architecture/`:

- `architecture/architecture_v_0_6.md`  
  Canonical high-level architecture for the current implementation.

- `architecture/architecture_diagrams_v_0_6.md`  
  Diagrams for v0.6 (chat flow, LlmRouter, graph ingress/egress, concept capture, ConversationContext, etc.).

- `architecture/versions/architecture_v_0_*.md`  
  Earlier architecture versions preserved for design history (0.1 → 0.5). Use these when you need to understand why something changed.

If you only have time for two docs, read:

1. `architecture/architecture_v_0_6.md`
2. `specs/regulatory_graph_copilot_concept_v_0_6.md`

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
- `specs/graph_schema_v_0_6.md` – node/edge schema for the rules graph.
- `specs/graph_schema_changelog_v_0_6.md` – how the schema evolved to v0.6.
- `specs/graph_algorithms_v_0_1.md` – query patterns and optional algorithms.

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
- `specs/special_jurisdictions_modelling_v_0_1.md` – IE/UK/NI/IM/EU/CTA/GI/AD and their special relationships.

### Other

- `migration_plan_v_0_2.md` – how the project migrated from `rfc-refactor` to the regulatory copilot.
- `node_24_lts_rationale.md` – why Node.js 24 LTS is the minimum runtime.

---

## Change detection & graph streaming

Change detection and graph streaming have their own area:

- `change-detection/graph_change_detection_v_0_6.md` – current design for patch-based graph change detection and streaming, including nodes/edges created/updated/deleted and `edges_updated` for edge property changes.
- `change-detection/archive/*.md` – earlier experiments and enhancement notes kept for reference.

These docs are important whenever you’re touching:

- The Memgraph → frontend graph data flow.
- Live graph visualisations.
- Any feature that depends on incremental updates rather than full reloads.

---

## Phases & reviews

- `phases/PHASE_*` – phase-specific plans, reviews, and checklists (e.g. v0.6 implementation plans, crits, and gap analyses).

These are useful for understanding **what was in scope** for a given phase and how well the implementation matched the intent.

---

## How to use these docs when coding

When implementing or changing something, try to:

1. Identify which **spec(s)** apply (graph schema, timeline, scenario, conversation context, safety, etc.).
2. Check the **architecture** doc to see where the change belongs (reg-intel-core vs reg-intel-graph vs reg-intel-llm vs reg-intel-prompts).
3. Check **governance/decisions/decisions_v_0_6.md** to ensure you’re not contradicting an existing ADR.
4. Check the **governance/roadmap/roadmap_v_0_6.md** to see if the work is planned and what phase it’s in.

If you find gaps or contradictions, update the relevant spec/decision/roadmap rather than letting code drift away from the docs.

