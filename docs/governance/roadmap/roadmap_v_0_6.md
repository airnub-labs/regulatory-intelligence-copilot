# ROADMAP – Regulatory Intelligence Copilot (v0.6)

> **Goal:** Ship a reusable, privacy‑safe regulatory research copilot with a shared rules graph (Memgraph), a thin Next.js web shell, and a Compliance Engine that can be embedded into other SaaS products. v0.6 adds **self‑populating concept capture** from main chat, plus **conversation context** so graph concepts stay in scope across turns.

This roadmap is intentionally **implementation‑oriented**. It is structured as phases; phases are not strictly sequential, but earlier ones create foundations for later work.

---

## Normative References

The roadmap must stay aligned with the following documents:

- `docs/architecture/architecture_v_0_6.md` – **current canonical architecture** (backend + UI + v0.6 concept capture & conversation context).
- `docs/architecture/versions/architecture_v_0_5.md` – UI‑layer details (chat UI, Tailwind v4, shadcn/ui, AI SDK integration).
- `docs/architecture/versions/architecture_v_0_4.md` – backend stack, Memgraph graph layer, API and engine interfaces.
- `docs/governance/decisions/decisions_v_0_6.md` – latest decisions/ADRs (Node 24, Memgraph boundaries, MCP usage, concept capture, conversation context).
- `docs/specs/graph-schema/versions/graph_schema_v_0_4.md` + `docs/specs/graph-schema/versions/graph_schema_changelog_v_0_4.md` – rules graph schema.
- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md` – hard privacy boundaries between Memgraph and Supabase/app data.
- `docs/specs/safety-guards/graph_ingress_guard_v_0_1.md` – write‑path guarantees into Memgraph.
- `docs/specs/safety-guards/egress_guard_v_0_3.md` – outbound HTTP/LLM/MCP guardrails.
- `docs/specs/timeline-engine/timeline_engine_v_0_2.md` – time‑based reasoning.
- `docs/specs/graph_algorithms_v_0_1.md` – optional graph algorithms & GraphRAG behaviour.
- `docs/specs/special_jurisdictions_modelling_v_0_1.md` – IE/UK/NI/EU/IM cross‑border design.
- `docs/specs/conversation-context/conversation_context_spec_v_0_1.md` (once added) – conversation context store & aspects.
- `docs/specs/conversation-context/concept_capture_from_main_chat_v_0_1.md` (once added) – SKOS‑style concept capture via tools.
- `docs/specs/eligibility_explorer_spec_v_0_1.md` (once added) – deterministic eligibility evaluation (Use Case 1).
- `docs/specs/scenario_engine_v_0_1.md` (once added) – Scenario Engine for what‑if simulations (Use Case 2).

Where there is ambiguity, **architecture + spec docs take precedence** over the roadmap.

---

## Phase 0 – Fork, Clean‑Up & Baseline (v0.3 → v0.4)

**Goal:** Finalise the pivot from `rfc-refactor` to `regulatory-intelligence-copilot`, standardise on the v0.4 stack, and ensure all docs/governance/decisions/architecture are aligned.

**Status:** Mostly done; this phase should be closed soon.

**Key tasks**
- [ ] Confirm fork and rename:
  - [ ] `rfc-refactor` → `regulatory-intelligence-copilot` (done at repo level, verify everywhere in docs).
- [ ] Documentation alignment:
  - [ ] Update `README.md` to reference `architecture/architecture_v_0_6.md`, `governance/decisions/decisions_v_0_6.md`, `governance/roadmap/roadmap_v_0_6.md`.
  - [ ] Ensure old v0.1/v0.2/v0.3 docs are clearly marked as archived or superseded.
- [ ] Legacy HTTP/RFC auditor cleanup:
  - [ ] Confirm HTTP probe runners & sample REST API are archived under `legacy/` or removed.
  - [ ] Remove OWASP/RFC‑specific models, types, and UI components from the active codepath.
- [ ] Runtime/tooling baseline:
  - [ ] Ensure all Node services target **Node.js 24 LTS** (`"engines": { "node": ">=24" }`).
  - [ ] Align TypeScript to latest Node 24‑compatible TS (5.x).
  - [ ] Update devcontainers/CI images to Node 24.
  - [ ] Confirm Next.js apps are on Next 16 / React 19 / Tailwind 4.

**Exit criteria**
- Repo builds and runs on **Node 24 LTS** with Next 16 / React 19 / Tailwind 4.
- v0.6 docs are clearly marked as canonical; older docs are clearly marked.
- No live code depends on the old HTTP auditor behaviour.

---

## Phase 1 – Engine Skeleton, LLM Router & Prompt Aspects (Hardening v0.4)

**Goal:** Lock in the engine/LlmRouter/prompt‑aspects abstractions so all future work builds on the right boundaries, with AI SDK v5 strictly behind `LlmProvider`.

**Status:** Implemented in PRs #2/#3; now needs hardening + polish.

**Key tasks**
- [ ] Engine packages:
  - [ ] Validate `packages/reg-intel-core`, `reg-intel-llm`, `reg-intel-prompts`, `reg-intel-next-adapter` structure.
  - [ ] Ensure `ComplianceEngine.handleChat(...)` is the canonical in‑process interface.
- [ ] LLM router & providers:
  - [ ] Confirm `LlmRouter` integrates:
    - [ ] OpenAI Responses (including GPT‑OSS models).
    - [ ] Groq.
    - [ ] Local/OSS HTTP providers.
  - [ ] Ensure all OpenAI calls use **Responses API**, not legacy chat completions.
  - [ ] Implement/verify `TenantLlmPolicy` (per‑tenant & per‑task provider/model and `allowRemoteEgress`).
  - [ ] Ensure AI SDK v5 is used as the primary implementation for all LLM providers (OpenAI, Groq, Anthropic, Google Gemini).
- [ ] Prompt aspects (jurisdiction‑neutral core):
  - [ ] Confirm `buildPromptWithAspects`/`createPromptBuilder` are used for all system prompts.
  - [ ] Verify aspects: jurisdiction, agent context, profile context, disclaimers, custom context.
  - [ ] Remove any remaining ad‑hoc prompt concatenation.
- [ ] Egress guard integration:
  - [ ] Ensure all LLM & external HTTP calls run through `EgressClient`.
  - [ ] Confirm egress aspects include PII redaction and tenant egress policy enforcement.

**Exit criteria**
- Engine is provider‑agnostic and prompt‑aspect driven.
- Changing model/provider for a tenant or specific task requires **only config changes**, not code.
- All outbound calls flow through `EgressClient` and egress aspects.

---

## Phase 2 – Graph Engine, Ingress Guard & Timeline Engine

**Goal:** Finalise graph access patterns and privacy boundaries: direct Memgraph client, read‑only MCP, `GraphWriteService` + Graph Ingress Guard, and a working Timeline Engine.

**Status:** Partially implemented; needs consolidation around v0.4 specs.

**Key tasks**
- [ ] `GraphClient` & Memgraph:
  - [ ] Confirm `GraphClient` / `createMemgraphGraphClient` is the only Memgraph access point used by core code.
  - [ ] Ensure all reads are via `GraphClient` (not raw Bolt/HTTP scattered around).
- [ ] Memgraph MCP read‑only:
  - [ ] Ensure Memgraph MCP is configured and used as **read‑only tool** only.
  - [ ] Guard against any `CREATE`/`MERGE` via MCP tooling.
- [ ] Graph Ingress Guard + `GraphWriteService`:
  - [ ] Implement/verify `GraphWriteService` as the only write gate to Memgraph.
  - [ ] Implement baseline ingress aspects: schema validation, property whitelisting, PII/tenant checks.
  - [ ] Add extension points for custom aspects (e.g. AI‑based classification) without weakening guarantees.
- [ ] Data privacy enforcement:
  - [ ] Ensure **no user/tenant PII** is ever written to Memgraph (rules graph only).
  - [ ] Wire ingress guard rules to `data_privacy_and_architecture_boundaries_v_0_1.md`.
- [ ] Timeline Engine v0.2 wiring:
  - [ ] Confirm `TimelineEngine` is used by agents for time‑based reasoning (lookbacks, lock‑ins, effective dates).

**Exit criteria**
- All writes to Memgraph pass through `GraphWriteService` + ingress aspects.
- Memgraph MCP is guaranteed read‑only.
- The global graph contains only public/regulatory knowledge; user data lives elsewhere.
- Timeline logic is centralised and used by at least one domain agent.

---

## Phase 3 – Web App Integration, Streaming & Concept Capture

**Goal:** Deliver a coherent demo app using the engine, with chat streaming, patch‑based graph updates, and v0.6 **concept capture + conversation context** wired into the main chat path.

**Status:** Partially in place; needs alignment with v0.6 decisions.

**Key tasks**

### 3.1 Next.js adapter & chat API

- [ ] Next.js adapter:
  - [ ] Use `reg-intel-next-adapter` to wire `/api/chat` to `ComplianceEngine.handleChat(...)`.
  - [ ] Confirm API route is a thin adapter (no domain logic inside route).
- [ ] Chat streaming:
  - [ ] Use SSE (or compatible one‑way streaming) for chat responses.
  - [ ] Surface meta info (agent, jurisdictions, confidence/uncertainty, referenced nodes) as a final SSE event.

### 3.2 Graph REST + streaming

- [ ] Graph REST + streaming:
  - [ ] Implement/verify `GET /api/graph` for initial subgraph load.
  - [ ] Implement/verify `WS /api/graph/stream` for patch‑based updates.
  - [ ] Ensure graph updates are **rule‑graph only** (no user scenarios, no PII).

### 3.3 v0.6 Concept capture from main chat (SKOS‑style)

- [ ] LLM streaming chunk shape:
  - [ ] Extend `LlmProvider` streaming type to support `type: 'text' | 'tool' | 'error'` chunks.
  - [ ] Ensure OpenAI Responses + AI SDK v5 emit `tool` chunks for structured outputs.
- [ ] `capture_concepts` tool (see `concept_capture_from_main_chat_v_0_1.md`):
  - [ ] Define a SKOS‑inspired JSON schema (domain, kind, jurisdiction, `prefLabel`, `altLabels[]`, `definition`, `sourceUrls[]`).
  - [ ] Register `capture_concepts` as a tool on the main chat task.
  - [ ] Update system prompts so main chat **always** calls `capture_concepts` once per turn with detected regulatory concepts.
- [ ] Concept handling pipeline:
  - [ ] Implement `handleConceptMetadataFromMainChat(argsJson)` in `reg-intel-core`.
  - [ ] For each concept, call a `CanonicalConceptResolver` that:
    - [ ] Looks up existing concept nodes in Memgraph via `GraphClient` (e.g. by `{ domain, kind, jurisdiction }`).
    - [ ] If missing, upserts a concept node + label nodes via `GraphWriteService` + Graph Ingress Guard.
  - [ ] Decide when to enqueue heavyweight ingestion jobs (MCP → web/doc scraping → rule extraction) for sparse or new concepts.
- [ ] Populate `referencedNodes`:
  - [ ] From resolved concepts, collect corresponding graph node IDs.
  - [ ] Populate `ChatResponse.referencedNodes` with these IDs.
  - [ ] Ensure they are included in the final SSE meta event so the UI can show evidence chips and sync the graph view.

### 3.4 Conversation context (v0.6)

- [ ] Conversation context store (see `conversation_context_spec_v_0_1.md`):
  - [ ] Introduce `ConversationContext` (e.g. `activeNodeIds: string[]`, later `activeScenarios`, flags).
  - [ ] Implement `ConversationContextStore` interface with a Supabase/Postgres‑backed implementation keyed by `(tenantId, conversationId)`.
- [ ] Compliance Engine integration:
  - [ ] Ensure `/api/chat` passes `tenantId` and `conversationId` into `ComplianceEngine` (internal only; UI stays dumb).
  - [ ] On each request, load the existing `ConversationContext` from the store.
  - [ ] After `capture_concepts` resolves, update `ConversationContext.activeNodeIds` with any resolved concepts.
  - [ ] Persist updated context back to the store.
- [ ] Prompt aspect wiring:
  - [ ] Add a `conversationContextAspect` (or extend `additionalContextAspect`) that:
    - [ ] Takes `activeNodeIds`.
    - [ ] Fetches short SKOS‑style summaries for those nodes via `GraphClient`.
    - [ ] Injects a compact “concepts already in scope” section into the system prompt.
- [ ] UI behaviour:
  - [ ] Keep the UI **stateless** w.r.t. conversation context; it only sends messages and renders streamed text/meta.
  - [ ] Optionally show `referencedNodes` and resolved concept labels as chips or side‑panel entries.

### 3.5 ReBAC-ready sharing (OpenFGA path)

- [ ] Finalise the `sharing_mode` + `access_model`/`access_control` envelope for conversations/messages so Supabase remains the source of truth while enabling external ReBAC engines.
- [ ] Add an OpenFGA namespace modelling tenants, users, conversations, and public-read delegation; check in docker-compose for local OpenFGA.
- [ ] Synchronise tuple writes from Supabase mutations when `access_model = 'external_rebac'` is enabled; keep RLS enforcement intact.
- [ ] Gate conversation list/detail/chat APIs with OpenFGA `ListObjects`/`Check` before Supabase queries to align server-side filtering.
- [ ] Update the chat SSE hub to carry access metadata so multi-device subscribers stay authorised during fan-out.

**Exit criteria**
- `/api/chat` uses SSE streaming with meta events (jurisdictions, uncertainty, referencedNodes).
- Main chat path uses the `capture_concepts` tool to emit SKOS‑style concepts for at least one vertical (e.g. IE tax: VAT, VRT).
- Resolved concepts are written to Memgraph via `GraphWriteService` only, never directly.
- `ChatResponse.referencedNodes` is populated and visible in the UI for grounded answers.
- Conversation context is persisted per `(tenantId, conversationId)` and automatically injected via prompt aspects; the UI does **not** need to manage this state.

---

## Phase 4 – Graph Ingestion, Change Detection & Live Graph UI

**Goal:** Support incremental ingestion of rules, automatic change detection, and a live graph UI that reflects updates while remaining PII‑free.

**Status:** Early; patterns exist but need consolidation.

**Key tasks**
- [ ] Ingestion pipelines:
  - [ ] Implement ingestion flows for at least one domain (e.g. IE Revenue tax rules):
    - [ ] MCP/E2B tools to fetch legislation, guidance, examples.
    - [ ] LLM‑assisted parsing into `:Rule`, `:Section`, `:Benefit`, `:Relief`, `:TimelineConstraint` nodes + edges.
    - [ ] All upserts through `GraphWriteService` + Graph Ingress Guard.
- [ ] Graph Change Detector:
  - [ ] Implement `GraphChangeDetector` that watches Memgraph (or ingest job logs) and emits patches.
  - [ ] Integrate with `WS /api/graph/stream` to push node/edge additions/updates/removals.
- [ ] Live graph UI:
  - [ ] Ensure the graph page:
    - [ ] Loads an initial subgraph via `GET /api/graph`.
    - [ ] Subscribes to `/api/graph/stream` and applies patches.
    - [ ] Can highlight nodes referenced in the latest chat answer (`referencedNodes`).
- [ ] Change impact queries:
  - [ ] Provide simple queries to show "what changed" for a given profile/jurisdiction.

**Exit criteria**
- The graph can be enriched by real usage and new rulings without violating privacy boundaries.
- Agents can reference recent changes where relevant in answers.
- The live graph UI reacts to both ingestion jobs and self‑populating concept capture.

---

## Phase 5 – Vertical Slice: IE Single‑Director / Self‑Employed

**Goal:** Deliver a fully working vertical slice for a specific profile (e.g. IE single‑director / self‑employed), including graph seeding, agents, and UI.

**Status:** Planned; depends on earlier phases.

**Key tasks**
- [ ] Seed graph for IE tax/social welfare:
  - [ ] Minimum viable coverage for PRSI, income tax, VAT, VRT, relevant benefits.
  - [ ] Model profile tags as per `special_jurisdictions_modelling_v_0_1.md`.
- [ ] Specialist agents:
  - [ ] `IE_SingleDirector_TaxAndWelfare_Agent` wired to the IE slice of the graph.
  - [ ] Use Timeline Engine for key lookbacks/lock‑ins.
- [ ] UX polish for the slice:
  - [ ] Predefined example questions.
  - [ ] Clear disclaimers and uncertainty indicators.
  - [ ] Ability to show which rules/benefits were referenced (chips linked to the graph view).

**Exit criteria**
- A user with the “IE single‑director / self‑employed” profile can:
  - Ask typical questions (PRSI, VAT/VRT basics, mixed self‑employment/director cases).
  - See grounded answers, with rule references and graph visualisation.
- Concept capture and conversation context work end‑to‑end for this slice.

---

## Phase 6 – SaaS Readiness & Engine Reuse in Other Apps

**Goal:** Make it easy to embed the engine into other Next.js/Supabase SaaS products with tenant‑aware LLM/egress policies.

**Status:** Early; some pieces exist, needs end‑to‑end example.

**Key tasks**
- [ ] Tenant handling:
  - [ ] Persist `TenantLlmPolicy` (e.g. Supabase or another store).
  - [ ] Pass `tenantId` consistently through `/api/chat` → Compliance Engine → LlmRouter.
  - [ ] Enforce `allowRemoteEgress` and per‑task overrides per tenant.
- [ ] Next.js integration story:
  - [ ] Finalise `reg-intel-next-adapter` API.
  - [ ] Build a minimal example of importing engine packages into another Next.js/Supabase app.
  - [ ] Document clear steps: install packages, configure providers/graph, mount `/api/reg-intel`.
- [ ] Logging & data residency:
  - [ ] Clarify what the engine logs vs what host apps are responsible for (to support GDPR/SOC2 stories).

**Exit criteria**
- A separate Next.js/Supabase project can embed the engine with minimal glue code.
- Tenant‑specific LLM policies and egress restrictions are honoured end‑to‑end.
- Conversation context and concept capture also work when the engine is embedded.

---

## Phase 7 – Advanced Enhancements (Optional / Future)

These are high‑leverage enhancements that are **not required** for v1 but may be pursued once the core is stable.

### 7.1 Graph Algorithms & GraphRAG Enhancements

- [ ] Implement optional Leiden community detection + centrality metrics on static snapshots, per `graph_algorithms_v_0_1.md`.
- [ ] Integrate community info into GraphRAG retrieval (e.g. sample representative nodes from communities for explanation).
- [ ] Add configuration flags to enable/disable algorithms with minimal impact on core flows.

### 7.2 Microsoft GraphRAG (Evaluation Only)

- [ ] Spike a GraphRAG pipeline for text‑heavy sources (guidance, case law).
- [ ] Compare with existing Memgraph‑only GraphRAG behaviour.
- [ ] Decide whether to keep as a separate experimental subsystem or integrate lightly as a supplementary retriever.

### 7.3 Memgraph‑as‑a‑Service / Shared Knowledge Graph Platform

- [ ] Explore packaging Memgraph + Graph Ingress Guard + egress/ingress aspects + engine as a managed "rules graph as a service".
- [ ] Define boundaries between the shared graph service and product‑specific frontends.

### 7.4 UX & Localisation

- [ ] Improve graph visualisation, filtering, and explanation overlays.
- [ ] Implement robust i18n and multi‑locale support for all explanations (leveraging your existing Next.js/Supabase SaaS platform patterns).

### 7.5 Eligibility Explorer (Use Case 1)

- [ ] Formalise the **Eligibility Explorer** core service (see `docs/specs/eligibility_explorer_spec_v_0_1.md` once added):
  - Deterministic, boolean eligibility for benefits/reliefs across one or more domains (e.g. SOCIAL_WELFARE, TAX, PENSIONS).
  - Public TS API surface in `reg-intel-core` (e.g. `EligibilityExplorer.evaluateEligibility(...)`).
- [ ] Wire Eligibility Explorer into IE/UK vertical slices:
  - [ ] IE welfare eligibility via a specialised `IE_Welfare_Eligibility_Agent`.
  - [ ] IE tax/pension relief via an `IE_TaxRelief_Eligibility_Agent`.
- [ ] Demo web integration:
  - [ ] Scenario/profile form to capture basic facts (age, residency, dependants, income band, employment status, etc.).
  - [ ] Eligibility results view that shows **eligible / ineligible / locked‑out** benefits and reliefs.
  - [ ] Optional chat action that calls the Eligibility Explorer and displays results inline.

### 7.6 Scenario Engine & What‑If Scenario Comparison (Use Case 2)

- [ ] Implement the **Scenario Engine** in `reg-intel-core` (see `docs/specs/scenario_engine_v_0_1.md` once added):
  - Accept one or more `Scenario` objects (with multiple `ScenarioSnapshot`s).
  - Use the shared rules graph + Timeline Engine to produce `ScenarioEvaluationResult[]` (applicable rules, eligible/locked‑out benefits per snapshot).
- [ ] Add a new Compliance Engine task type, e.g. `TaskType.WHAT_IF_SCENARIO_EVALUATION`, and a specialised `IE_WhatIfScenario_Agent` that:
  - [ ] Builds/loads scenarios from host‑app storage.
  - [ ] Calls `scenarioEngine.evaluateScenarios(...)` as a deterministic tool.
  - [ ] Uses LLMs only to **explain differences** between scenarios (not recompute the logic).
- [ ] Demo web "What‑If" UI:
  - [ ] Scenario Builder (e.g. "Stay IE sole trader", "Incorporate in 2026", "Move to NI in 2027").
  - [ ] Scenario Comparator view that visualises differences in eligibility/lock‑ins over time between scenarios.

---

## Phase 8 – Long‑Term & Ecosystem (Out of Scope for v1)

Non‑exhaustive ideas for the longer term:

- Multi‑jurisdiction expansion, including complex cross‑border regimes.
- Optional graph algorithms and GraphRAG experimentation beyond Memgraph Community.
- A future "Memgraph + Copilot as a Service" offering.
- Deeper integration with other ADF/agentic tooling across your wider ecosystem.

