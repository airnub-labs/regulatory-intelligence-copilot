# ROADMAP – Regulatory Intelligence Copilot (v0.3)

> **Project:** `regulatory-intelligence-copilot`  
> **Tagline:** Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.
>
> This roadmap reflects the **v0.3 architecture and decisions**: Node 24 LTS baseline, jurisdiction‑neutral prompts, prompt aspects, provider‑agnostic LLM routing (including OpenAI Responses + GPT‑OSS + Groq + local/OSS models), direct Memgraph GraphClient, WebSocket graph streaming, and a reusable engine + demo app split with Vercel AI SDK v5 used only as an **edge implementation detail**.
>
> See also:
> - `docs/architecture_v_0_3.md`
> - `docs/governance/decisions/versions/decisions_v_0_3.md`
> - `docs/graph/graph-schema/versions/graph_schema_v_0_3.md`
> - `docs/engines/timeline-engine/timeline_engine_v_0_2.md`
> - `docs/node_24_lts_rationale.md`

The goal is to reach a **credible, useful v1** focused on Ireland/EU first, while keeping the codebase reusable inside other Next.js/Supabase SaaS products and leaving clear paths for multi‑jurisdiction expansion and optional Microsoft GraphRAG integration.

---

## Phase 0 – Fork, Clean-Up & Baseline (Mostly Done)

**Goal:** Stand up the new repo with a clean, modern foundation that reuses working infra from `rfc-refactor` but drops HTTP/RFC auditing and standardises on the v0.3 stack.

**Tasks**
- [ ] Confirm fork: `rfc-refactor` → `regulatory-intelligence-copilot`.
- [ ] Replace legacy docs with new ones:
  - [ ] `README.md` → regulatory copilot positioning (v0.3 docs referenced).
  - [ ] `architecture_v_0_3.md`.
  - [ ] `decisions_v_0_3.md`.
  - [ ] `AGENTS.md` (current agents + orchestrator).
  - [ ] `roadmap_v_0_3.md` (this document).
- [ ] Remove or archive (e.g. `legacy/`):
  - [ ] HTTP probe runners & sample REST API.
  - [ ] OWASP/RFC-specific models, types, UI components.
  - [ ] Any code that assumes an HTTP-auditor use case.
- [ ] Keep and rewire:
  - [ ] Next.js app and `/api/chat` plumbing.
  - [ ] E2B sandbox integration (optional, not mandatory for core path).
  - [ ] MCP gateway wiring.
  - [ ] Memgraph connection/config.
  - [ ] Generic redaction utilities.
- [ ] Standardise runtime and tooling:
  - [ ] Ensure all Node services target **Node.js 24 LTS** (`"engines": { "node": ">=24" }`).
  - [ ] Align TypeScript to latest Node 24–compatible TS (5.9+).
  - [ ] Update devcontainers/CI images to Node 24.

**Exit criteria**
- New repo builds and runs cleanly on **Node 24 LTS**.
- Legacy HTTP-audit behaviour is removed or clearly isolated.
- `/api/chat` is wired to a placeholder engine (no domain logic yet).

---

## Phase 1 – Engine Skeleton, LLM Router & Prompt Aspects

**Goal:** Implement the core **engine primitives** and **LLM routing** so all future work builds on the right abstractions, using Vercel AI SDK v5 only as an internal implementation detail where helpful.

**Scope**
- Introduce engine packages.
- Implement provider‑agnostic LLM layer (including OpenAI Responses + GPT‑OSS via AI SDK v5 where appropriate, Groq, and local/OSS models).
- Implement prompt aspects as the only way to build system prompts.

**Tasks**
- [ ] Repo structure:
  - [ ] Create `packages/reg-intel-core` – Compliance Engine, agent interfaces, orchestrator.
  - [ ] Create `packages/reg-intel-llm` – `LlmClient`, `LlmRouter`, provider adapters, egress guard integration.
  - [ ] Create `packages/reg-intel-prompts` – base system prompts + prompt aspects.
  - [ ] Create `packages/reg-intel-next-adapter` – helper to mount engine in Next.js.
- [ ] LLM router & providers:
  - [ ] Define `LlmClient`, `LlmMessage`, `LlmCompletionOptions` interfaces.
  - [ ] Implement `LlmRouter` with **per-tenant & per-task** selection.
  - [ ] Implement `OpenAiResponsesProvider` using **OpenAI Responses API** (including GPT‑OSS models), no legacy chat completions.
  - [ ] Implement `GroqLlmProvider`.
  - [ ] Implement `LocalHttpLlmProvider` for talking to local/OSS model servers (vLLM/Ollama/etc.).
  - [ ] Implement **AI SDK v5 adapters** (e.g. `AiSdkOpenAIProvider`, `AiSdkGroqProvider`) that wrap `streamText`/`generateText` behind the `LlmProvider` interface.
  - [ ] Define `TenantLlmPolicy` and basic config store for per-tenant/per-task policies (including `allowRemoteEgress`).
- [ ] Egress guard:
  - [ ] Implement minimal egress guard (PII + financial redaction).
  - [ ] Integrate guard into `LlmRouter` so tenant policies (`allowRemoteEgress`) are respected.
- [ ] Prompt aspects:
  - [ ] Implement `jurisdictionAspect`, `agentContextAspect`, `profileContextAspect`, `disclaimerAspect`, `additionalContextAspect`.
  - [ ] Implement `buildPromptWithAspects`, `createPromptBuilder`, `createCustomPromptBuilder`.
  - [ ] Replace any direct system prompt concatenation in `/api/chat` and agents with aspect-based builders.
- [ ] Jurisdiction-neutral prompts & dynamic profile tags:
  - [ ] Ensure core system prompts are jurisdiction-neutral.
  - [ ] Implement dynamic `PROFILE_<persona>_<jurisdiction>` tags via helper (e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_SINGLE_DIRECTOR_MT`).

**Exit criteria**
- `/api/chat` calls the Compliance Engine which:
  - Uses `LlmRouter` (no hardcoded provider/model in app code).
  - Builds prompts via `reg-intel-prompts` aspect pipeline.
- You can switch the main model/provider via config without changing code.
- You can configure a different model/provider for at least one additional task (e.g. `"egress-guard"`).
- AI SDK v5 is only used inside `reg-intel-llm` provider adapters, not in core engine or agents.

---

## Phase 2 – Graph Engine, Direct Memgraph Client & Timeline v0.1

**Goal:** Move the graph and timeline responsibilities into clean abstractions and seed a minimal but realistic regulatory graph.

**Scope**
- Implement `GraphClient` (direct Memgraph access).
- Implement a basic `TimelineEngine`.
- Seed a small graph for a single-director Irish persona and cross‑jurisdiction hooks.

**Tasks**
- [ ] Create `packages/reg-intel-graph`:
  - [ ] Define `GraphClient` interface (e.g. `getRulesForProfileAndJurisdiction`, `getNeighbourhood`, `getMutualExclusions`, `getTimelines`, `getCrossBorderSlice`).
  - [ ] Implement `createMemgraphGraphClient` using Memgraph Bolt/HTTP.
  - [ ] Ensure no core path uses Memgraph MCP; MCP is optional for LLM tools only.
- [ ] Timeline v0.1:
  - [ ] Implement `TimelineEngine` for lookback windows and basic lock‑in periods.
  - [ ] Hook it into `reg-intel-core` so agents can query time windows in a consistent way.
- [ ] Seed a tiny but realistic initial graph for Ireland:
  - [ ] A few `:Benefit` nodes (Illness Benefit, Jobseeker’s Benefit (Self-Employed), Treatment Benefit).
  - [ ] A few `:Section`, `:Condition`, `:Timeline` nodes relevant to single-director self-employed.
  - [ ] Basic edges: `APPLIES_TO`, `REQUIRES`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`.
  - [ ] Initial `:ProfileTag` and `:Jurisdiction` nodes, e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `JURISDICTION_IE`.

**Exit criteria**
- A minimal Compliance Engine instance can:
  - Query Memgraph via `GraphClient`.
  - Use `TimelineEngine` to reason about at least one lookback window and one lock‑in.
- You can ask a small question about a single-director IE scenario and get an answer that references real nodes from Memgraph.

---

## Phase 3 – Web App Integration & WebSocket Graph Streaming

**Goal:** Wire the engine into the Next.js demo app and implement the live graph view with WebSocket-based incremental updates.

**Scope**
- Integrate `reg-intel-core`, `reg-intel-llm`, `reg-intel-graph`, `reg-intel-prompts` with `apps/demo-web`.
- Implement REST + WS graph endpoints.
- Align UI stack with Next.js 16 / React 19 / Tailwind 4.

**Tasks**
- [ ] Use `reg-intel-next-adapter` in `apps/demo-web`:
  - [ ] Create a `ComplianceEngine` instance using LlmRouter, GraphClient, TimelineEngine, EgressGuard.
  - [ ] Mount `POST /api/chat` via an adapter (thin wrapper only).
- [ ] Chat UI polish:
  - [ ] Ensure chat uses the new `/api/chat` response shape (answer, jurisdictions, referencedNodes, uncertainty, disclaimer key).
  - [ ] Display basic meta info (which agent answered, which jurisdictions were considered).
- [ ] Graph endpoints:
  - [ ] Implement `GET /api/graph` to return an initial subgraph based on profile/jurisdictions.
  - [ ] Implement `GET /api/graph/stream` (WS) to send incremental graph patches (nodes/edges added/updated/removed).
  - [ ] Backend patch generation strategy (e.g. event-based updates from ingestion jobs).
- [ ] Graph UI:
  - [ ] On load, call `GET /api/graph` to build an initial graph view.
  - [ ] Open WS connection to `/api/graph/stream` and apply patches incrementally.
  - [ ] Avoid re-rendering large graphs unnecessarily (e.g. debounce, viewport-aware updates).
- [ ] Frontend stack alignment:
  - [ ] Upgrade `apps/demo-web` to Next.js 16 / React 19 / Tailwind 4.

**Exit criteria**
- The demo app presents:
  - A working chat that uses the v0.3 engine.
  - A live graph view that:
    - Loads once via REST.
    - Responds to incoming WS patches without full reloads.
- The web app runs cleanly on Next 16 / React 19 / Tailwind 4.

---

## Phase 4 – Domain Agents & Ireland/EU Content

**Goal:** Deliver a genuinely useful Ireland-first vertical slice with multiple domain agents and non-trivial interactions, while keeping the architecture ready for other EU jurisdictions.

**Scope**
- Implement key domain agents.
- Expand the Irish/EU graph.

**Tasks**
- [ ] Implement domain agents (in `reg-intel-core`):
  - [ ] `SingleDirector_IE_SocialSafetyNet_Agent` (Ireland-only; can be opinionated and specific).
  - [ ] `IE_SelfEmployed_TaxAgent`.
  - [ ] `IE_CGT_Investor_Agent` (including buy-back / loss relief timing rules).
  - [ ] `IE_RnD_TaxCredit_Agent` (niche but high-value, using R&D relief conditions).
  - [ ] `EU_CrossBorder_Coordinator_Agent` (focus on social security coordination, EU regs, and Irish implementations).
- [ ] Implement `GlobalRegulatoryComplianceAgent`:
  - [ ] Orchestrator that routes questions between domain agents using persona, jurisdictions, and intent.
  - [ ] Merges multiple agent outputs into a single coherent answer.
- [ ] Expand graph content:
  - [ ] Add more Irish tax/welfare/pension/CGT rules (nodes & edges).
  - [ ] Add `:EURegulation` / `:EUDirective` nodes and `IMPLEMENTED_BY` / `COORDINATED_WITH` edges.
  - [ ] Ensure mutual exclusions and time-based constraints are well represented.

**Exit criteria**
- You can ask complex Ireland/EU questions like:
  - “If I sell shares at a loss and buy back within X days, how does that affect my CGT loss relief?”
  - “As a single-director company in Ireland, how might changing my salary/dividends mix affect my future welfare and pension entitlements?”
- System:
  - Routes to the correct agents.
  - Surfaces mutual exclusions and timeline constraints from the graph.
  - Provides clear non-advice, research-style explanations.

---

## Phase 5 – On-Demand Enrichment, MCP & Change Tracking

**Goal:** Make the graph a living knowledge base that grows with use and tracks updates in law/guidance/case law.

**Scope**
- Integrate external legal/search sources via MCP.
- Implement incremental ingestion and change-tracking nodes.

**Tasks**
- [ ] MCP-based search:
  - [ ] Configure `legal-search-mcp` for Revenue.ie, gov.ie, eur-lex, TAC decisions, Pensions Authority, DSP updates.
- [ ] On-demand enrichment:
  - [ ] When agents detect sparse areas, call legal search via MCP from a sandbox.
  - [ ] Parse results into candidate nodes/edges according to the graph schema.
  - [ ] Upsert into Memgraph via `GraphClient` or a dedicated ingestion pipeline.
  - [ ] Ensure the graph is incrementally updated during real conversations.
- [ ] Change-tracking:
  - [ ] Introduce `:Update` or `:ChangeEvent` nodes representing Finance Acts, new eBriefs, TAC decisions, key EU rulings.
  - [ ] Link them via `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`, etc.
  - [ ] Maintain a simple store mapping profile tags to affected rules for basic notifications.

**Exit criteria**
- When a new external ruling/guidance is ingested, the system can:
  - Attach that information to future answers where relevant.
  - Show a simple “recent changes that might affect you” view.
- The knowledge graph grows over time in response to real questions and updates.

---

## Phase 6 – SaaS Readiness, Multi-Tenant & External Platform Integration

**Goal:** Make the engine easy to embed into other Next.js/Supabase SaaS apps, with proper tenant isolation and EU-compliant data flows.

**Scope**
- Harden tenant handling, policy management, and interfaces.

**Tasks**
- [ ] Tenant-aware LLM and graph policies:
  - [ ] Implement persistence for `TenantLlmPolicy` (e.g. via Supabase or another store).
  - [ ] Wire `tenantId` throughout Compliance Engine and LlmRouter.
  - [ ] Honour `allowRemoteEgress` and per-task model/provider choices.
- [ ] ComplianceEngine adapter:
  - [ ] Finalise `reg-intel-next-adapter` so other apps can mount `/api/reg-intel` with minimal code.
  - [ ] Provide clear examples of importing engine packages into another Next.js/Supabase project.
- [ ] Data protection & logging:
  - [ ] Define what, if any, chat logs are stored and where (host app’s responsibility).
  - [ ] Ensure engine remains stateless from a GDPR perspective (rules in graph, scenarios ephemeral).

**Exit criteria**
- Another Next.js/Supabase project can:
  - Import the engine packages.
  - Configure a `ComplianceEngine` instance with its own LlmRouter/GraphClient settings.
  - Expose a working `/api/reg-intel` endpoint.
- Tenant-level policies control which LLMs and providers are used, including local-only modes.

---

## Phase 7 – Advanced Enhancements (Optional)

These are high-leverage, non-essential enhancements we can explore once v1 is stable.

### 7.1 Microsoft GraphRAG (Evaluation & Possible Hybrid Use)

**Idea**

Evaluate Microsoft GraphRAG as a complementary retrieval/orchestration layer for text-heavy sources (guidance, case law) while keeping **Memgraph as the core rules/relationships store**.

**Tasks**
- [ ] Spike a small GraphRAG pipeline over a subset of case law + guidance.
- [ ] Compare answer quality/latency vs the Memgraph-only GraphRAG pattern.
- [ ] Design a hybrid approach where:
  - Memgraph provides structured rules and relationships.
  - GraphRAG pipelines fetch and summarise long-form text linked to those nodes.

**Exit criteria**
- Clear view of whether GraphRAG materially improves explanations.
- Decision on adopting it as an optional mode or keeping it as a separate experiment.

### 7.2 Multi-Jurisdiction Expansion (Other EU Countries, Isle of Man, Malta)

**Idea**

Extend the graph and agents to support:
- Key additional EU jurisdictions.
- Cross-border flows with **Isle of Man** and **Malta**, which are often relevant for structuring and residency.

**Tasks**
- [ ] Extend graph data for:
  - Selected EU member states.
  - Isle of Man & Malta.
- [ ] Model cross-jurisdiction edges:
  - `COORDINATED_WITH` – social security coordination.
  - `TREATY_LINKED_TO` – double tax treaties, social security agreements.
  - `MIRRORS` / `DERIVED_FROM` – local implementations of EU directives.
- [ ] Add/extend agents for cross-border scenarios (e.g. IE ↔ MT, IE ↔ IM).

**Exit criteria**
- System can meaningfully discuss interactions like:
  - Working in Malta while incorporated in Ireland.
  - Moving to the Isle of Man and the impact on Irish PRSI records.

### 7.3 UX & Visualisation Enhancements

- [ ] Richer graph visualisation controls and explanations for end-users.
- [ ] Multi-language explanations (leveraging locale from `UserProfileContext`).
- [ ] "What changed for me?" dashboards combining updates, graph diffs, and narrative summaries.

---

## North Star

Across all phases, the north star remains:

> **Help people and advisors understand how complex, interacting rules affect them – without pretending to be the final authority on what they must do.**

The architecture is now shaped so that:
- Rules live in a **graph**, not in prompt strings.
- LLMs act as **explainers**, routed via a provider‑agnostic interface.
- The system can run entirely on **local/OSS models** for EU-sensitive tenants.
- The engine can be embedded into other products, instead of being a one-off app.

