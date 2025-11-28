# ROADMAP – Regulatory Intelligence Copilot (v0.4)

> **Project:** `regulatory-intelligence-copilot`  
> **Tagline:** *Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.*
>
> This roadmap reflects the **v0.4 architecture and decisions**: Node 24 LTS baseline, jurisdiction‑neutral prompts + prompt aspects, provider‑agnostic LLM routing (OpenAI Responses + GPT‑OSS + Groq + local/OSS models), direct Memgraph `GraphClient`, read‑only Memgraph MCP, `GraphWriteService` + Graph Ingress Guard, `EgressClient` + AI SDK v5 as an **edge implementation detail**, patch‑based graph streaming, and a reusable engine + demo app split.
>
> Normative references:
> - `docs/architecture/archive/architecture_v_0_4.md`
> - `docs/governance/decisions/archive/decisions_v_0_4.md`
> - `docs/architecture/graph/archive/graph_schema_v_0_3.md`
> - `docs/architecture/graph/archive/graph_schema_changelog_v_0_3.md`
> - `docs/architecture/engines/timeline-engine/timeline_engine_v_0_2.md`
> - `docs/architecture/data_privacy_and_architecture_boundaries_v_0_1.md`
> - `docs/architecture/guards/graph_ingress_guard_v_0_1.md`
> - `docs/architecture/guards/egress_guard_v_0_2.md`
> - `docs/architecture/graph/graph_algorithms_v_0_1.md`
> - `docs/architecture/graph/special_jurisdictions_modelling_v_0_1.md`
- `docs/architecture/graph/graph_seed_ni_uk_ie_eu.txt` (example seed)
> - `docs/architecture/runtime/node_24_lts_rationale.md`

The goal is to reach a **credible, useful v1** (Ireland/EU‑first, IE/UK/NI/IM/CTA‑aware) while keeping the codebase reusable inside other Next.js/Supabase SaaS products and leaving clear paths for:

- Multi‑jurisdiction expansion, including complex cross‑border regimes.
- Optional graph algorithms (Leiden community detection, centrality) on Memgraph Community.
- A future "Memgraph + Copilot as a service" offering.

---

## Phase 0 – Fork, Clean-Up & Baseline (v0.3 → v0.4)

**Goal:** Finalise the pivot from `rfc-refactor` to `regulatory-intelligence-copilot`, standardise on the v0.4 stack, and ensure all architecture and governance/decisions docs are aligned.

**Status:** Mostly done; this phase should be closed soon.

**Key tasks**
- [ ] Confirm fork and rename:
  - [ ] `rfc-refactor` → `regulatory-intelligence-copilot` (done at repo level, verify everywhere in docs).
- [ ] Documentation alignment:
  - [ ] Update `README.md` to reference `architecture_v_0_4.md`, `decisions_v_0_4.md`, `roadmap_v_0_4.md`.
  - [ ] Ensure old v0.1/v0.2/v0.3 docs are clearly marked as archived or superseded.
- [ ] Legacy HTTP/RFC auditor cleanup:
  - [ ] Confirm HTTP probe runners & sample REST API are archived under `legacy/` or removed.
  - [ ] Remove OWASP/RFC‑specific models, types, and UI components from the active codepath.
- [ ] Runtime/tooling baseline:
  - [ ] Ensure all Node services target **Node.js 24 LTS** (`"engines": { "node": ">=24" }`).
  - [ ] Align TypeScript to latest Node 24‑compatible TS (5.x) across the monorepo.
  - [ ] Update devcontainers/CI images to Node 24.
  - [ ] Confirm Next.js apps are on Next 16 / React 19 / Tailwind 4.

**Exit criteria**
- Repo builds and runs on **Node 24 LTS** with Next 16 / React 19 / Tailwind 4.
- v0.4 docs are the canonical reference; older docs are clearly marked.
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

## Phase 3 – Web App Integration & Streaming (Chat + Graph)

**Goal:** Deliver a coherent demo app using the engine, with chat streaming and patch‑based graph updates.

**Status:** Partially in place; needs alignment with v0.4 decisions.

**Key tasks**
- [ ] Next.js adapter:
  - [ ] Use `reg-intel-next-adapter` to wire `/api/chat` to `ComplianceEngine.handleChat(...)`.
  - [ ] Confirm API route is a thin adapter (no domain logic inside route).
- [ ] Chat streaming:
  - [ ] Use SSE (or compatible one‑way streaming) for chat responses.
  - [ ] Surface meta info (agent, jurisdictions, confidence/uncertainty, referenced nodes).
- [ ] Graph REST + streaming:
  - [ ] Implement/verify `GET /api/graph` for initial subgraph load.
  - [ ] Implement/verify WS endpoint for **graph patches** (add/update/remove nodes/edges).
  - [ ] Keep WS payloads delta‑based (no full graph snapshots over WS).
- [ ] Graph UI:
  - [ ] Load initial graph via REST.
  - [ ] Apply WS patches incrementally without full re-renders.
  - [ ] Handle large graphs with viewport-aware rendering / clustering in the UI.

**Exit criteria**
- Demo app provides a smooth chat UX plus a live graph view that updates via patches.
- No component sends or depends on repeated full graph snapshots during streaming.

---

## Phase 4 – Domain Content: IE/EU, Cross-Border & Special Jurisdictions

**Goal:** Ship a high‑value Ireland/EU vertical slice, including NI/UK/IM/CTA modelling, CGT timing, and self‑employed social safety net.

**Status:** Early; graph/docs for special jurisdictions are designed, now need implementation.

**Key tasks**
- [ ] Seed IE/UK/NI/IM/EU/CTA graph:
- [ ] Implement the concrete seed in `docs/architecture/graph/graph_seed_ni_uk_ie_eu.txt`.
  - [ ] Model NI as a region under UK with EU‑linked goods regimes via `Regime` nodes (per `special_jurisdictions_modelling_v_0_1.md`).
  - [ ] Model Isle of Man, Malta, Gibraltar, Andorra and their relevant treaty/coordination edges as needed.
- [ ] Domain agents:
  - [ ] `SingleDirector_IE_SocialSafetyNet_Agent` – PRSI class S/A interactions, core benefits.
  - [ ] `IE_SelfEmployed_TaxAgent` – reliefs, exclusions, interaction with pensions.
  - [ ] `IE_CGT_Investor_Agent` – wash sale‑like behaviour, loss relief timing.
  - [ ] `EU_CrossBorder_Coordinator_Agent` – social security coordination (EC 883/2004, etc.).
- [ ] Graph content expansion:
  - [ ] Add rules, benefits, obligations, conditions, timelines, and mutual exclusions.
  - [ ] Ensure important cross‑border edges are in place (e.g. IE↔UK, IE↔IM, IE↔MT, IE↔EU).

**Exit criteria**
- The system can answer non‑trivial IE/EU/UK/NI/IM questions and show which nodes/edges are involved.
- At least one special NI/CTA scenario demonstrates why the NI modelling is correct.

---

## Phase 5 – On-Demand Enrichment, MCP Sources & Change Tracking

**Goal:** Turn the rules graph into a living knowledge base that grows with use and tracks regulatory changes.

**Status:** Conceptual; requires careful implementation to respect privacy and ingress rules.

**Key tasks**
- [ ] MCP-based legal search:
  - [ ] Configure MCPs for Revenue.ie, gov.ie, eur‑lex, Tax Appeals Commission, Pensions Authority, DSP updates, etc.
  - [ ] Ensure all external calls still go through `EgressClient`.
- [ ] On-demand enrichment pipeline:
  - [ ] When an agent detects missing coverage, use MCP search (possibly from E2B sandbox) to fetch relevant documents.
  - [ ] Parse into candidate nodes/edges consistent with `docs/architecture/graph/versions/graph_schema_v_0_3`.
  - [ ] Upsert via `GraphWriteService` (never directly) so ingress guard applies.
- [ ] Change tracking:
  - [ ] Model `:ChangeEvent` / `:Update` nodes (Finance Acts, eBriefs, TAC decisions, EU cases).
  - [ ] Link them via `AFFECTS`, `UPDATES`, `CHANGES_INTERPRETATION_OF` edges.
  - [ ] Provide simple queries to show "what changed" for a given profile/jurisdiction.

**Exit criteria**
- The graph can be enriched by real usage and new rulings without violating privacy boundaries.
- Agents can reference recent changes where relevant in answers.

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

### 7.3 Memgraph-as-a-Service / Shared Knowledge Graph Platform

- [ ] Explore packaging Memgraph + Graph Ingress Guard + egress/ingress aspects + engine as a managed "rules graph as a service".
- [ ] Define boundaries between the shared graph service and product‑specific frontends.

### 7.4 UX & Localisation

- [ ] Improve graph visualisation, filtering, and explanation overlays.
- [ ] Implement robust i18n and multi‑locale support for all explanations (leveraging your existing Next.js/Supabase SaaS platform patterns).

---

## North Star

Across all phases, the north star remains:

> **Help people and advisors understand how complex, interacting rules affect them – without pretending to be the final authority on what they must do.**

The v0.4 roadmap ensures that:

- Rules live in a **graph**, not hidden in prompts.
- LLMs act as **explainers and helpers**, routed via a provider‑agnostic interface.
- The system can run entirely on **local/OSS models** for sensitive EU tenants.
- The engine can be embedded into other products, or hosted as its own shared knowledge service, without large refactors.

