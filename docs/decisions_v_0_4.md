# DECISIONS (v0.4)

> Architectural & product decisions for the **regulatory-intelligence-copilot** fork.
>
> **v0.4 extends v0.3** with: clarified engine/host separation, explicit Memgraph MCP read-only policy, stricter graph write discipline via `GraphWriteService`, egress guard + AI SDK discipline, and a formalised GraphRAG / Leiden community detection strategy on top of Memgraph Community + MAGE.
>
> Legacy decisions from the original `rfc-refactor` (HTTP/RFC/OWASP auditor) remain **superseded** unless explicitly revived here.

---

## D-001 – Pivot from HTTP/RFC Auditor → Regulatory Intelligence Copilot

**Status:** Accepted (unchanged)

See v0.2: The project is now a **chat-first, graph-powered regulatory research copilot** focused on regulatory interaction intelligence (tax, welfare, pensions, CGT, EU rules) with an Ireland-first, EU-aware scope.

---

## D-002 – Chat-First UX, Single `/api/chat` Endpoint

**Status:** Accepted (unchanged)

The product is **chat-first**. All capabilities flow through a single HTTP endpoint `POST /api/chat`. UI buttons/wizards only **prefill** chat prompts; they do not call separate business APIs.

---

## D-003 – Graph-First Reasoning with Memgraph

**Status:** Accepted (unchanged)

Memgraph is the primary source of truth for regulatory rules and relationships. The graph encodes statutes, benefits, conditions, timelines, case law, EU instruments, jurisdictions, and cross-border relationships. LLMs explain the graph; they do not own the rules.

(See `docs/specs/graph_schema_v_0_3.md` and `graph_schema_changelog_v_0_3.md`.)

---

## D-004 – E2B Sandbox & MCP: Optional Isolation for External/Untrusted Work

**Status:** Accepted (unchanged)

Core engine and `/api/chat` run as standard Node/Next.js services. E2B + MCP are used selectively for:
- Untrusted code execution
- Heavy ingestion/transform jobs
- Experiments requiring hard isolation

External legal/search APIs *may* be accessed via MCP tools, but this is not a blanket requirement for all logic.

---

## D-005 – Egress Guard & Privacy

**Status:** Accepted (unchanged, refined by D-029)

All outbound payloads leaving the app’s trust boundary (remote LLMs, search MCPs) must pass through an **egress guard** that:
- Redacts PII (names, PPSNs, IBANs, phones, emails, addresses, etc.)
- Obfuscates amounts where appropriate
- Focuses prompts on rules, relationships, and abstract scenarios

Tenants with `allowRemoteEgress = false` must be served **only** via local/OSS models.

D-029 clarifies that all outbound calls go through `EgressClient` and that AI SDK v5 is strictly an implementation detail in provider adapters.

---

## D-006 – LLM Role: Explainer, Not Authority

**Status:** Accepted (unchanged)

LLMs are used as **explainers and ranking helpers**, not as sources of law or advice. They must reflect the graph and official sources, highlight uncertainty, and answers must include non-advice disclaimers.

---

## D-007 – Domain Agents + Global Regulatory Agent

**Status:** Accepted (unchanged, clarified)

We use:
- **Domain agents** (tax, welfare, pensions, CGT, R&D, EU coordination, etc.)
- A **GlobalRegulatoryComplianceAgent** as the default entry point

Core prompts are **jurisdiction-neutral**; agents + prompt aspects inject jurisdiction/persona context. (See `AGENTS.md`.)

---

## D-008 – Timeline Engine as a First-Class Component

**Status:** Accepted (unchanged)

All time-based logic (lookbacks, lock-ins, effective dates, etc.) is centralised in a **Timeline Engine**. It consumes graph timeline nodes/edges and returns machine-friendly results plus human-readable explanations.

(See `docs/specs/timeline_engine_v_0_2.md`.)

---

## D-009 – Initial Jurisdiction & Scope (Ireland-First, EU-Aware)

**Status:** Accepted (unchanged)

Initial focus:
- Jurisdiction: **Ireland**, plus relevant EU law
- Personas: self‑employed, single‑director company, investors, small advisors
- Domains: tax, social welfare, pensions, CGT, R&D credits, EU social security coordination

The graph schema explicitly supports multiple jurisdictions (including EU, Isle of Man, Malta, etc.) so cross‑border interactions can be modelled.

**Jurisdictions & Cross-Border Modelling:**
- [x] NI is modelled as a `Region` under `UK`, with EU-linked goods rules via `Regime` nodes, not as a separate `Jurisdiction`. See `docs/specs/special_jurisdictions_modelling_v_0_1.md`.

---

## D-010 – Data Ingestion Strategy (Static Seed + On-Demand Enrichment)

**Status:** Accepted (unchanged)

We seed the graph with a curated subset of high‑value rules, then grow it via **on‑demand enrichment** when agents encounter gaps. New authoritative sources discovered in conversations (statutes, guidance, cases) are parsed and upserted into Memgraph. User‑specific data is **never** stored in the graph.

---

## D-011 – Non-Advice Positioning & Safety Language

**Status:** Accepted (unchanged)

The product is explicitly a **regulatory research copilot**, not legal/tax/welfare advice. All surfaces (docs, UI, responses) include disclaimers and encourage consultation with qualified professionals.

---

## D-012 – Legacy Code Handling from `rfc-refactor`

**Status:** Accepted (unchanged)

We keep infra‑agnostic pieces from `rfc-refactor` (E2B integration, MCP gateway wiring, Memgraph connectivity, generic chat plumbing, redaction utilities) and archive/remove HTTP audit‑specific logic.

---

## D-013 – Tech Stack Boundaries (Pre-v0.3)

**Status:** Superseded by D-021 / D-022

Earlier we simply committed to TS + Next.js + Memgraph + MCP/E2B. v0.3+ refines these into concrete version/policy baselines; see D‑021 and D‑022.

---

## D-014 – Jurisdiction-Neutral Core Prompts & Dynamic Profile Tags

**Status:** Accepted (unchanged)

Core system prompts are jurisdiction‑neutral. Jurisdiction and persona are injected via prompt aspects and dynamic profile tags (e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_SINGLE_DIRECTOR_MT`). Country-specific details live in jurisdiction‑specific agents and data.

---

## D-015 – Prompt Aspects as the Only Way to Build System Prompts

**Status:** Accepted (clarified)

All LLM calls must use the **prompt aspect** mechanism (e.g. `buildPromptWithAspects`, `createPromptBuilder`). The default aspect pipeline includes:
- Jurisdiction context
- Agent context
- Persona/profile context
- Safety & non‑advice disclaimers

Direct string concatenation of system prompts in agents/route handlers is prohibited.

---

## D-016 – Provider-Agnostic LLM Router with Per-Tenant & Per-Task Policies

**Status:** Accepted (unchanged)

We use a **provider‑agnostic LlmRouter** that:
- Supports multiple backends (OpenAI Responses, Groq, local/OSS HTTP endpoints, etc.)
- Resolves provider/model based on **tenant + task**, not hardcoded choices

`TenantLlmPolicy` defines for each tenant:
- Default provider/model
- Whether remote egress is allowed
- Overrides per task (e.g. `"egress-guard"`, `"pii-sanitizer"`, `"main-chat"`)

Application/agent code speaks in terms of **tasks**, not concrete models.

---

## D-017 – OpenAI Responses API, Not Legacy Chat Completions

**Status:** Accepted (unchanged)

When the OpenAI provider is selected, we must use **OpenAI’s Responses API**, not legacy `/v1/chat/completions`. Any remaining uses of chat completions must be migrated.

---

## D-018 – Direct Memgraph GraphClient for Core Queries (No Memgraph MCP in Hot Path)

**Status:** Accepted (unchanged, clarified by D-028)

Core app code uses a typed **GraphClient** that talks directly to Memgraph. Memgraph MCP is optional for LLM tool-calling experiments, not the main production path.

D-028 further constrains Memgraph MCP to **read-only usage** and formalises `GraphWriteService` as the only write gate.

---

## D-019 – WebSocket Graph Streaming with Incremental Patches

**Status:** Accepted (unchanged, clarified by D-031)

The UI loads an initial subgraph via REST, then subscribes to a WebSocket endpoint for **incremental graph patches** (add/update/remove nodes/edges). Only deltas are sent over WS; full snapshots must not be streamed repeatedly.

D-031 clarifies that SSE is used where more appropriate (e.g. chat streaming) and that graph streaming is patch-based but transport-agnostic.

---

## D-020 – Engine + Demo App Split for Reuse

**Status:** Accepted (unchanged, to be implemented as repo evolves)

The repo is structured as a reusable engine plus demo app:
- `apps/demo-web` – reference Next.js app (chat + graph UI)
- `packages/reg-intel-core` – Compliance Engine, agents, orchestrator
- `packages/reg-intel-graph` – GraphClient + Memgraph integration
- `packages/reg-intel-llm` – LlmRouter, providers, egress guard integration
- `packages/reg-intel-prompts` – prompt aspects + base prompts
- `packages/reg-intel-next-adapter` – helpers to mount the engine in any Next.js app

Other projects can import these packages to mount their own `reg-intel` endpoints.

---

## D-021 – Node 24 LTS as Minimum Runtime

**Status:** Accepted (unchanged)

### Context

Node.js 24 has just entered Active LTS and provides significant security and performance benefits over Node 20/22, including:
- Mature **permission model** (`--permission`) for locking down FS/env/network/child processes
- Newer V8 with better performance and features for heavy text/graph workloads
- Improved **AsyncLocalStorage** for per-request/per-tenant context
- Updated HTTP/fetch stack and OpenSSL for a more secure default platform

(See `docs/node_24_lts_rationale.md` for detailed rationale.)

### Decision

- **All backend services and tools must run on Node.js 24 LTS or newer.**
- The repo’s `package.json` files must declare `"engines": { "node": ">=24.0.0" }` where appropriate.
- CI, devcontainers, and local dev must all standardise on Node 24.

### Consequences

- Older Node versions (20/22) are considered best-effort only and are not officially supported.
- We can rely on Node 24 features (permission model, modern HTTP stack, ALS performance) in design and code.

---

## D-022 – Web App Stack Baselines (Next 16, React 19, Tailwind 4)

**Status:** Accepted (unchanged)

### Context

To keep the frontend aligned with modern capabilities and reduce tech drift, we define minimum framework versions for web apps in this repo.

### Decision

- **Next.js:** Minimum **v16** for all Next-based web apps.
- **React:** Minimum **v19**.
- **Tailwind CSS:** Minimum **v4.0**.
- **TypeScript:** Track the latest TypeScript 5.x that is compatible with Node 24, used across the monorepo.

### Consequences

- New apps should be scaffolded on these versions or later.
- Existing apps should be upgraded to meet these baselines as part of the roadmap.
- CI should run tests/builds against these baselines.

---

## D-023 – Vercel AI SDK v5 as Edge Implementation Detail

**Status:** Accepted (unchanged)

### Context

We want the benefits of Vercel AI SDK v5 (multi-provider support, Responses API integration, solid streaming primitives) without coupling the core engine’s design to any specific SDK.

### Decision

- The **core engine** (LlmRouter, agents, Compliance Engine) remains SDK-agnostic and is defined in terms of an internal `LlmProvider` interface.
- **Vercel AI SDK v5** is used as an implementation detail at the edges:
  - In Next.js API routes (e.g. `/api/chat`) and/or
  - Inside provider adapters in `reg-intel-llm` that implement `LlmProvider` using `streamText` / `generateText`.
- The rest of the system **must not** depend directly on AI SDK types or APIs.

### Consequences

- We can swap Vercel AI SDK out later if needed without changing the public engine surface.
- Multiple providers (OpenAI, Groq, OSS) can be wired through AI SDK or via custom HTTP clients as needed.

---

## D-024 – MCP/E2B/Memgraph Kept Outside AI SDK Tool Layer

**Status:** Accepted (unchanged)

### Context

We use E2B sandboxes, MCP servers, and Memgraph as core execution and data layers. Tool calling in AI SDK is powerful but should not own our sandbox/orchestration model.

### Decision

- E2B, MCP servers, and Memgraph are integrated via **explicit backend modules** (GraphClient, ingestion workers, sandbox orchestrators).
- If tools are exposed to LLMs, they are thin wrappers around these modules, but MCP/E2B/Memgraph do **not** live “inside” AI SDK’s tool layer by default.
- Egress control and sandbox policies remain in the E2B/MCP layer, not in AI SDK.

### Consequences

- Clear separation of concerns between "LLM reasoning" and "execution/data access".
- Easier to enforce isolation and audit egress.

---

## D-025 – Data Privacy & Graph Boundaries (Normative)

**Status:** Accepted (unchanged)

### Context

The global regulatory graph (Memgraph) is a **shared knowledge base** intended to model public regulatory data across jurisdictions. User-specific data (PII, scenarios, uploaded documents) must never contaminate this shared graph to maintain privacy, compliance, and multi-tenant trust.

### Decision

- The global regulatory graph (Memgraph) is a **public, shared knowledge base** and may only contain public regulatory data:
  - Jurisdictions, regions, agreements, regimes
  - Rules, benefits, obligations, reliefs, conditions
  - Timelines, profile tags
  - References to public documents and metadata
- **No user-specific or tenant-specific data** (including PII, scenarios, uploaded documents, or derived metrics) may ever be stored in the graph.
- User uploads are processed inside short-lived E2B sandboxes. By default, raw files and line-level contents are **not persisted**; only abstracted features may be returned to the application, and never upserted into the global graph.
- User profile and scenario data live in:
  - Per-tenant storage (with appropriate access controls)
  - In-memory session context during request handling
  - Never in the graph
- Any exceptions or refinements to these rules must be made by updating:
  - `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
  - This decisions file

### Consequences

- Clear separation between public regulatory knowledge and private user data.
- Graph can be freely queried and visualized without privacy concerns.
- Simplified compliance story for GDPR and other privacy regulations.
- Multi-tenant deployments can safely share a single graph instance.
- Uploaded documents and user scenarios require separate storage strategy.

See `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md` for full context, rationale, and detailed classification rules.

---

## D-026 – Aspect-Based Graph Ingress Guard for Memgraph (Normative)

**Status:** Accepted (unchanged, refined)

### Context

To enforce the data privacy and schema guarantees defined in D-025 and related specs, we need a structured mechanism to validate all writes to the global Memgraph instance before they are executed.

### Decision

- All writes to the global Memgraph instance must go through a dedicated
  `GraphWriteService` that applies an ordered chain of **Graph Ingress
  Aspects`.
- Baseline aspects (schema validation, property whitelisting, static PII /
  tenant checks) are non‑removable and encode the guarantees from
  `data_privacy_and_architecture_boundaries_v_0_1.md` and
  `graph_ingress_guard_v_0_1.md`.
- Custom aspects (e.g. audit tagging, source annotation, future local LLM
  classification) may be configured via a registry+config mechanism, but may
  not weaken or bypass the baseline invariants.
- No component is allowed to issue raw Cypher write statements (`CREATE`,
  `MERGE`, `SET` on new nodes/relationships) directly against Memgraph outside
  the GraphWriteService.

See `docs/specs/graph_ingress_guard_v_0_1.md` for the detailed design of the
aspect pattern and the baseline/custom aspect split.

### Consequences

- Clear enforcement boundary for graph privacy and schema compliance.
- Predictable and auditable writes to the global graph.
- Extensibility for fork-specific and future features without weakening guarantees.
- Foundation for SOC 2 / GDPR compliance work.

---

## D-027 – Engine Integration & Host Separation

**Status:** Accepted (new)

### Context

We want to be able to:
- Swap or add frontends (different Next.js apps, other frameworks) without touching core engine code.
- Expose the engine as a service (e.g. `Memgraph + Copilot as a service`) with a stable, minimal integration surface.

### Decision

- Treat `ComplianceEngine.handleChat(...)` (TypeScript interface) as the **canonical in-process interface**.
- Treat `POST /v1/chat` (HTTP) as the **canonical network interface**.
- `apps/demo-web` and `/api/chat` are **thin adapters** that:
  - Accept HTTP requests,
  - Translate to `ComplianceEngine.handleChat(...)`,
  - Stream responses back to the client.

### Consequences

- Swapping the Next.js frontend (or adding others) does not require refactoring engine or agents.
- The engine can later be hosted as an independent service and consumed by other apps using `/v1/chat`.
- Supports the future story of "Memgraph + Copilot as a service" with minimal coupling.

---

## D-028 – Graph Write Discipline & Memgraph MCP Read-Only

**Status:** Accepted (new)

### Context

We already have:
- D-018: direct `GraphClient` for core queries.
- D-025 & D-026: privacy boundaries and graph ingress guard.

We now make Memgraph MCP’s role explicit and tie it into ingress discipline.

### Decision

- **Memgraph MCP is read-only.** It may be used by agents/tools for:
  - Inspecting the shared Regulatory Rules Graph.
  - Running read-only Cypher queries.
  - Powering GraphRAG-style retrieval in tools.
- All graph writes must go through `GraphWriteService`:
  - `GraphWriteService → GraphIngressGuard (aspects) → Memgraph`.
- No direct `CREATE`/`MERGE` from:
  - MCP tools,
  - Agents,
  - UI,
  - Ad-hoc scripts that aren’t using `GraphWriteService`.

### Consequences

- The "no user PII in global graph" invariant is protected by design.
- The ingress guard aspects remain authoritative for all writes.
- Memgraph MCP can safely be exposed to LLM tool-calling for **reads** without risk of bypassing write policies.

---

## D-029 – Egress Guard + AI SDK Discipline

**Status:** Accepted (new)

### Context

We want:
- A single place to enforce egress policies and PII stripping.
- The freedom to use Vercel AI SDK v5 (or any future SDK) behind the scenes without leaking SDK details into the engine.

### Decision

- `EgressClient` is the **single choke point** for all outbound calls:
  - LLM calls (OpenAI, Groq, OSS, local models).
  - MCP HTTP calls.
  - Any other external HTTP egress.
- AI SDK v5 is an **implementation detail** inside `LlmProvider` adapters only.
  - No direct `streamText`/`generateText` in agents, route handlers, or engine modules.
- The standard call chain is:
  - Agent → LlmRouter → EgressClient (egress aspects) → Provider (AI SDK or other).

### Consequences

- The egress guard stays the "bouncer at the door" for everything leaving the system.
- We can swap SDKs or adjust provider usage without touching agent/engine code.
- Easier to enforce tenant/jurisdiction-specific egress policies.

---

## D-030 – GraphRAG & Memgraph Algorithms (Leiden as Optional Add-On)

**Status:** Accepted (new)

### Context

We want GraphRAG-style behaviour on top of Memgraph without:
- Locking into Memgraph Enterprise features.
- Breaking existing direct-path Cypher reasoning or mutual exclusion detection.

We also want to be able to experiment with Leiden community detection and centrality while keeping them optional and easily disabled.

### Decision

- The **primary reasoning mode** remains:
  - Explicit graph edges modelling rules, exclusions, timelines, and cross-border relationships.
  - Targeted Cypher traversals for queries like "mutual exclusions" and "impact of rule X".
- Graph algorithms are **optional enhancers**, configured and documented in `docs/specs/graph_algorithms_v_0_1.md`:
  - Community detection (e.g. Leiden via MAGE) on static snapshots to assign `community_id` and create `:Community` nodes.
  - Centrality metrics (PageRank/betweenness) within communities to identify anchor rules.
  - Bounded multi-hop traversals for impact analysis.
- These algorithms:
  - Must be disable-able without breaking any core functionality.
  - May be used to improve GraphRAG retrieval (e.g. sampling representative nodes from communities).
  - Are implemented on Memgraph Community + MAGE only (no Enterprise dependency for v0.4).

### Consequences

- We preserve the power of the existing direct-path queries for uncovering hidden interactions and mutual exclusions.
- Leiden/centrality can be added as "seasoning" – if they don’t add value or are too expensive, they can be turned off with minimal impact.
- GraphRAG behaviour is defined by our schema + algorithms, not tied to any particular vendor implementation.

---

## D-031 – Streaming Strategy (WS for Graph Patches, SSE for Chat)

**Status:** Accepted (new)

### Context

We currently:
- Use WebSockets for incremental graph updates.
- Use streaming for chat responses.

We want to formalise this so architecture diagrams and future work are aligned.

### Decision

- **Graph streaming:**
  - The graph UI loads an initial snapshot via REST.
  - Incremental changes (add/update/remove nodes/edges) are sent as **patches**.
  - WebSocket is the default transport, but the design is patch-based and transport-agnostic (could be migrated to SSE or other mechanisms later).
- **Chat streaming:**
  - SSE or compatible streaming (via fetch streams) is used for chat responses where a simple one-way stream is sufficient.

### Consequences

- Clear mental model: graph = patch stream; chat = token stream.
- We avoid repeatedly sending full graph snapshots.
- We keep flexibility to swap transports without changing higher-level behaviour.

---

These decisions define the **current desired state (v0.4)** of the `regulatory-intelligence-copilot` architecture. New ADRs/decisions should be appended here with incremental IDs (D-032, D-033, …) as the system evolves.

