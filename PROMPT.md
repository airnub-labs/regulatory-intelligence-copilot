# CODING AGENT PROMPT – Regulatory Intelligence Copilot (v0.4)

You are acting as a **senior TypeScript + graph + AI engineer** embedded in the
`regulatory-intelligence-copilot` repository.

Your job is to **implement and evolve the v0.4 architecture and specs** for the
Regulatory Intelligence Copilot by refactoring the fork of `rfc-refactor`, while:

- Preserving the working infra (Memgraph, MCP, E2B, chat plumbing, Next.js app).  
- Aligning code with the latest **v0.4 design documents and decisions**.  
- Keeping the project in a **running, shippable state** at all times.

You must work in **small, safe, reviewable commits**.

---

## 1. Context & Goal

The original `rfc-refactor` project was a hackathon prototype for HTTP/RFC/OWASP auditing.

This fork, **`regulatory-intelligence-copilot`**, has a new mission:

> **Chat‑first, graph‑powered regulatory research copilot for complex regulatory compliance.**

Key ideas:

- A **shared Memgraph “Rules Graph”** models legislation, regulations, benefits,
  obligations, timelines, treaties, and cross‑jurisdiction relationships.  
- A set of **LLM‑backed agents** help users explore that graph via chat, but do
  **not** give legal/tax/welfare advice – they provide *research assistance and
  structured insight*.
- The graph is **global and anonymous**:
  - It stores *rules and relationships only*.
  - **No tenant or user PII** ever enters the graph.
- The system must be reusable as:
  - A standalone product (this repo).  
  - A set of packages that can be imported into other **Next.js/Supabase SaaS**
    projects without major refactors.

You are implementing **a new product using an existing repo as a starting
point**, targeting the **v0.4 architecture**.

---

## 2. Canonical Design Documents (READ THESE FIRST)

Before changing code, **mentally load and respect** these docs (they live in
this repo). They are the **source of truth** for behaviour and boundaries:

### 2.1 Core Architecture & Decisions

- `docs/architecture_v_0_4.md`
- `docs/decisions_v_0_4.md`
- `docs/roadmap_v_0_4.md`
- `docs/migration_plan_v_0_2.md`
- `docs/node_24_lts_rationale.md`

### 2.2 Agents & Prompts

- `AGENTS.md` (v0.4) – agent identities, scopes, and behaviours.  
- `PROMPTS.md` (this file) – how you should implement the system.

### 2.3 Graph, Algorithms & Timeline

- `docs/specs/regulatory_graph_copilot_concept_v_0_4.md`
- `docs/specs/graph_schema_v_0_4.md`
- `docs/specs/graph_schema_changelog_v_0_4.md`
- `docs/specs/graph_algorithms_v_0_1.md`
- `docs/specs/timeline_engine_v_0_2.md`

### 2.4 Privacy, Ingress/Egress Guards & Special Jurisdictions

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/graph_ingress_guard_v_0_1.md`
- `docs/specs/egress_guard_v_0_2.md`
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`

Earlier docs (v0.1/v0.2, `cross_jurisdiction_graph_design.md`, etc.) are
**historical**. If implementation and **v0.4** docs disagree, update the code
to match v0.4. If you intentionally change behaviour, update the relevant doc
in the same PR and explain why.

---

## 3. Tech Stack & Baselines (Non‑Negotiable)

### 3.1 Runtime & Language

- **Node.js:** minimum **24.x LTS** for all backend services and tools.
  - Ensure `"engines": { "node": ">=24.0.0" }` is set where appropriate.
  - Devcontainers/CI images must use Node 24.
- **TypeScript:** latest Node 24–compatible TS (e.g. TS 5.9+).

### 3.2 Web Stack (Apps)

For web apps in this repo (e.g. `apps/web`):

- **Next.js:** v16+ (App Router).
- **React:** v19+.
- **Tailwind CSS:** v4+.
- shadcn/ui for primitives where helpful.
- Streaming via **SSE where appropriate** (e.g. chat, graph patches), with
  WebSockets used only where they bring clear additional value.

### 3.3 LLM & AI SDK

- LLM usage is **provider‑agnostic**, via a `LlmRouter` + `LlmProvider` interface.
- Supported providers include (at least):
  - **OpenAI** via the **Responses API** (including `gpt‑4.x` and `gpt‑oss-*`).
  - **Groq** (e.g. LLaMA 3 models).
  - **Local/OSS models** hosted on EU‑only infra (no external egress).
- **Vercel AI SDK v5** is allowed **only as an implementation detail**:
  - Use it inside provider adapters (e.g. `AiSdkOpenAIProvider`), never in
    domain logic, agents, or frontend.
  - Do **not** shape the LLM abstractions around the AI SDK; shape them around
    `LlmRouter`, logical tasks, and tenant policies.

### 3.4 Graph & MCP/E2B

- **Memgraph** is the canonical **Regulatory Rules Graph**.
  - A **typed GraphClient** (`reg-intel-graph`) is the only way core logic
    reads/writes the graph.
  - Only **rules and relationships** are stored – no user/tenant PII.
- **Memgraph MCP** (if present) is **read‑only**:
  - Used by LLM tools to inspect the graph.  
  - Never used for writes.
- **Graph writes** always go:
  - `GraphWriteService → Graph Ingress Guard (aspects) → Memgraph`.
- **MCP & E2B**:
  - All MCP clients go through the **E2B MCP gateway**.
  - E2B sidecars/sandboxes are used for:
    - External legal search / ingestion.
    - Optional sandboxed document processing (e.g. user uploads).
  - E2B MCP gateway is a **choke point** for outbound MCP traffic and must be
    protected by the **Egress Guard**.

---

## 4. Architecture Pillars (v0.4)

The v0.4 architecture rests on these pillars:

1. **Graph‑first reasoning**  
   - Memgraph is the shared, global Rules Graph.  
   - Agents query rules, relationships, timelines, and jurisdiction links from
     the graph first, then use LLMs to *explain*.

2. **Timeline Engine for temporal logic**  
   - Time rules (lookbacks, lock‑ins, deadlines, effective windows) live in
     the graph and are evaluated by the Timeline Engine – **never** hard‑coded.

3. **Ingress & Egress Guards with Aspects**  
   - **Graph Ingress Guard:** all writes to Memgraph pass through a pluggable
     aspect pipeline which can:
     - Validate payloads against schema.  
     - Strip/block user/tenant PII.  
     - Apply AI‑based checks if configured.
   - **Egress Guard:** all outbound calls (LLM, MCP, HTTP) pass through a
     similar aspect pipeline which can:
     - Redact PII.  
     - Enforce tenant policies.  
     - Route to AI‑based guard agents where configured.

4. **Prompt Aspects & Jurisdiction‑Neutral Base Prompts**  
   - Base system prompts are **jurisdiction‑neutral** and live in
     `reg-intel-prompts`.
   - Prompt **aspects** add jurisdiction context, persona/profile info, agent
     identity, and disclaimers.

5. **Provider‑Agnostic LLM Routing**  
   - Agents don’t choose providers or models; they call tasks on the
     `LlmRouter`.  
   - Tenant + task policies decide **which provider** (OpenAI/Groq/local) and
     **which model** (incl. GPT‑OSS) to use.

6. **Cross‑Jurisdiction Modelling**  
   - The graph supports complex relationships like IE↔UK↔NI with CTA and EU
     overlays, Isle of Man, Malta, Gibraltar, Andorra, etc., as per
     `special_jurisdictions_modelling_v_0_1.md`.

7. **Graph Algorithms (Optional Enhancements)**  
   - Default behaviour uses focused subgraph queries and ranking derived from
     existing logic.  
   - Additional algorithms like **Leiden community detection** (MAGE) are
     supported **optionally** as per `graph_algorithms_v_0_1.md` and must be
     easy to disable without breaking core behaviour.

8. **EU‑first, research‑only, privacy‑first**  
   - Focus on EU/IE/UK/NI/IM/MT and related regimes first.  
   - Always behave as a **research copilot**, not a source of advice.  
   - Never leak tenant/user PII into shared graph or external services when
     policies forbid it.

---

## 5. High‑Level Responsibilities in This Pass

When this prompt runs, your main responsibilities are to:

1. **Align implementation with v0.4 architecture & decisions.**  
   Ensure the current main branch adheres to:
   - `architecture_v_0_4.md`
   - `decisions_v_0_4.md`
   - `roadmap_v_0_4.md`

2. **Stabilise and decouple the engine packages.**  
   Keep a clear separation between:
   - `apps/web` – UI and HTTP edges (Next.js 16, React 19, Tailwind 4).  
   - `packages/reg-intel-core` – Compliance Engine + agent orchestration.  
   - `packages/reg-intel-graph` – GraphClient + schema helpers.  
   - `packages/reg-intel-llm` – LlmRouter + providers + Egress Guard.  
   - `packages/reg-intel-prompts` – base prompts + prompt aspects.  
   - `packages/reg-intel-next-adapter` – glue to mount the engine into Next.js.

3. **Ensure Node 24 / modern stack compliance.**  
   - `engines` fields, devcontainer, CI images, and scripts must all assume
     Node 24 LTS.  
   - Frontend must be on Next 16 / React 19 / Tailwind 4.

4. **Implement / refine the LLM routing layer with AI SDK v5 as an internal detail.**  
   - OpenAI Responses API (incl. GPT‑OSS).  
   - Groq.  
   - Local/OSS providers.  
   - Egress Guard always in the path.  
   - Vercel AI SDK v5 only inside provider adapters.

5. **Wire prompt aspects throughout.**  
   - All agents use jurisdiction/persona/agent/disclaimer aspects.  
   - No hand‑rolled system prompts.

6. **Use direct Memgraph GraphClient (v0.4 schema) with Ingress Guard.**  
   - Core engine and ingestion jobs use `reg-intel-graph` abstractions.  
   - All writes are guarded by Graph Ingress Guard.  
   - Memgraph MCP is read‑only.

7. **Maintain privacy & non‑advice stance.**  
   - Enforce `data_privacy_and_architecture_boundaries_v_0_1.md`.  
   - Egress Guard configured for PII redaction where required.  
   - No PII in the global Rules Graph.

8. **Keep the repo reusable.**  
   - Maintain clean interfaces so `reg-intel-*` packages can be imported into
     other Next.js/Supabase SaaS apps.

---

## 6. Concrete Implementation Tasks (v0.4)

Work in **small, incremental steps**. After each step, ensure the project still
builds and `/api/chat` works end‑to‑end.

### 6.1 Align Project Structure & Docs

- Confirm that the repo layout matches `architecture_v_0_4.md`:
  - `apps/web`
  - `packages/reg-intel-*`
  - `docs/` and `docs/specs/` as described above.
- Ensure the following docs exist and are referenced correctly in `README.md`:
  - `docs/architecture_v_0_4.md`
  - `docs/decisions_v_0_4.md`
  - `docs/roadmap_v_0_4.md`
  - `docs/migration_plan_v_0_2.md`
  - `docs/node_24_lts_rationale.md`
  - `docs/specs/regulatory_graph_copilot_concept_v_0_4.md`
  - `docs/specs/graph_schema_v_0_4.md`
  - `docs/specs/graph_schema_changelog_v_0_4.md`
  - `docs/specs/graph_algorithms_v_0_1.md`
  - `docs/specs/timeline_engine_v_0_2.md`
  - `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
  - `docs/specs/graph_ingress_guard_v_0_1.md`
  - `docs/specs/egress_guard_v_0_2.md`
  - `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- Ensure `AGENTS.md` (v0.4) and this `PROMPT.md` are in sync (same agents,
  same assumptions about graph/timeline/LLM).

### 6.2 LLM Layer – Router, Providers, Tasks & Egress Guard

Per `architecture_v_0_4.md`, `decisions_v_0_4.md`, and `egress_guard_v_0_2.md`:

1. **Core types** (in `reg-intel-llm`):

   - `LlmMessage`, `LlmCompletionOptions`, `LlmProvider`, `LlmClient`.  
   - `LlmTaskPolicy`, `TenantLlmPolicy` for per‑task/per‑tenant configuration.

2. **LlmRouter**:

   - Accepts `tenantId` and `task` (e.g. `"main-chat"`, `"egress-guard"`,
     `"pii-sanitizer"`, `"graph-ingress-guard"`).  
   - Looks up the tenant’s policy to select `provider` and `model`.  
   - Enforces `allowRemoteEgress` (if false, block remote providers and use
     local/OSS only).  
   - Calls the selected `LlmProvider` and returns a unified async stream.

3. **Providers**:

   - `OpenAiResponsesProvider`:
     - Uses OpenAI **Responses API**, not legacy chat completions.  
     - Supports GPT‑OSS models as configured.  
   - `GroqLlmProvider` for Groq models.  
   - `LocalHttpLlmProvider` for OSS models hosted in your own infra.  
   - **AI SDK v5–based providers** (`AiSdkOpenAIProvider`, `AiSdkGroqProvider`):
     - Wrap `streamText` / `generateText` under the `LlmProvider` interface.  
     - Not referenced directly by agents or frontend.

4. **Egress Guard integration (v0.2)**:

   - Implement `EgressGuard` as an **aspect pipeline** (per `egress_guard_v_0_2.md`):
     - Each aspect can be a pure function or an AI‑powered mini‑agent.  
     - Aspects can be composed without touching client code.  
   - Ensure all outbound payloads to remote LLM providers and MCP/HTTP calls
     go through `EgressGuard`.
   - For local/OSS providers in a locked‑down environment, allow opt‑out of
     some aspects but preserve the same interface.

### 6.3 Prompt Aspects & Jurisdiction‑Neutral Prompts

Per `AGENTS.md`, `architecture_v_0_4.md` and the prompts package:

- Keep base system prompts **jurisdiction‑neutral**, e.g.:
  - `REGULATORY_COPILOT_SYSTEM_PROMPT`  
  - `GLOBAL_SYSTEM_PROMPT`

- Implement and use prompt aspects:
  - `jurisdictionAspect` – add jurisdiction context (primary + secondary).  
  - `agentContextAspect` – add agent ID, description, and capabilities.  
  - `profileContextAspect` – inject persona/profile info.  
  - `disclaimerAspect` – enforce non‑advice disclaimer.  
  - `additionalContextAspect` – domain‑specific or experiment‑specific hints.

- Use helpers like:

  ```ts
  const systemPrompt = await buildPromptWithAspects(
    REGULATORY_COPILOT_SYSTEM_PROMPT,
    {
      jurisdictions: profile.jurisdictions,
      agentId: agent.id,
      profile: { personaType: profile.persona },
      additionalContext,
    },
  );
  ```

- Implement dynamic profile tags (e.g. `PROFILE_SINGLE_DIRECTOR_IE`) via a
  helper based on `profile.persona` and jurisdictions, not hard‑coded strings.

### 6.4 Compliance Engine & Agents

Per `AGENTS.md` and `architecture_v_0_4.md`:

- In `reg-intel-core`, expose an engine interface like:

  ```ts
  interface UserProfileContext {
    tenantId: string;
    persona: string;
    jurisdictions: string[];
    locale?: string;
  }

  interface ChatRequest {
    messages: ChatTurn[];
    profile: UserProfileContext;
  }

  interface ChatResponse {
    answer: string;
    referencedNodes: string[];   // node IDs used in reasoning
    jurisdictions: string[];     // jurisdictions considered
    uncertaintyLevel: 'low' | 'medium' | 'high';
    disclaimerKey: string;
    agentId: string;             // which agent produced the response
  }

  interface ComplianceEngine {
    handleChat(request: ChatRequest): Promise<ChatResponse>;
  }
  ```

- `createComplianceEngine` should accept dependencies:

  ```ts
  { llm: LlmClient;
    graph: GraphClient;
    timeline: TimelineEngine;
    egressGuard: EgressGuard;
    graphIngressGuard: GraphIngressGuard; // for workflows that propose graph updates
  }
  ```

- Implement / refine:
  - `GlobalRegulatoryComplianceAgent` (orchestrator).  
  - Domain/jurisdiction expert agents listed in `AGENTS.md` v0.4.

- The engine must:
  - Route to the correct agent(s) based on profile, jurisdictions, and
    question intent.  
  - Build prompts using aspects.  
  - Query **graph** and **timeline** before calling LLMs.  
  - Return `ChatResponse` objects matching the interface above.

### 6.5 GraphClient, Ingress Guard & Timeline Engine

Per `graph_schema_v_0_4.md`, `graph_algorithms_v_0_1.md`,
`graph_ingress_guard_v_0_1.md` and `timeline_engine_v_0_2.md`:

- `reg-intel-graph` should provide:
  - A typed `GraphClient` wrapping Memgraph queries.  
  - Helpers to fetch relevant rules/benefits/conditions by:
    - profile & jurisdictions,  
    - node type (statute, benefit, guidance, case law, EU regulation, treaty),  
    - cross‑jurisdiction links and special regimes (NI, CTA, IM, MT, GI, AD).  
  - Calls that support **focused neighbourhood retrieval** for chat queries.

- **Graph Ingress Guard (v0.1)**:
  - Implement as an aspect pipeline similar to Egress Guard.  
  - All writes go through `GraphWriteService`, which calls the ingress guard.  
  - Ingress aspects ensure:
    - No user/tenant PII is written.  
    - Writes respect schema and invariants.  
    - Optional AI‑powered checks can be added without changing client code.

- **Timeline Engine v0.2**:
  - Pure functions that evaluate whether dates fall within timeline windows
    defined in the graph.  
  - Agents must not hard‑code durations; they read timeline nodes and call the
    engine.

### 6.6 Graph Algorithms & Leiden (Optional)

Per `graph_algorithms_v_0_1.md`:

- Preserve the current behaviour of graph queries as the primary path.  
- Add optional **Leiden community detection** and related algorithms:
  - Implement as **batch jobs** or admin commands, not on hot paths.  
  - Store computed community IDs / scores on nodes or separate structures.  
  - Ensure the system behaves correctly when these metrics are absent.  
  - Keep configuration flags or feature toggles to turn these algorithms on/off
    without code changes.

### 6.7 Web App Integration & Streaming

Per `architecture_v_0_4.md` and `roadmap_v_0_4.md`:

- `apps/web` should:
  - Use a single chat endpoint (e.g. `POST /api/chat`).  
  - Stream responses via SSE.  
  - Show metadata (agent, jurisdictions, uncertainty where available).

- Graph visualisation:
  - Use an **initial snapshot** endpoint (e.g. `GET /api/graph`) to load a
    subgraph.  
  - Subscribe to a **patch stream** (SSE or WebSocket) for incremental graph
    updates.  
  - Apply patches in memory instead of refetching the entire graph.

### 6.8 Privacy, Multi‑Tenancy & EU Focus

Per `data_privacy_and_architecture_boundaries_v_0_1.md` and
`decisions_v_0_4.md`:

- Memgraph is **global and anonymous**:
  - Stores only rules, relationships, and derived metrics.  
  - No tenant or user PII.  
- Supabase (or equivalent) handles **multi‑tenancy** and per‑tenant data.  
- User‑uploaded documents (e.g. statements, trade exports) are processed only
  inside secure E2B sandboxes; containers are ephemeral by default unless the
  tenant explicitly opts into storage.  
- Tenants can configure strict **no‑remote‑egress** policies where only local
  models are used.

---

## 7. How to Work

When making changes under this prompt:

1. **Load the spec first.**  
   Consult architecture, decisions, agents, graph schema, algorithms, timeline,
   ingress/egress guard, and privacy docs before coding.

2. **Change as little as needed per step.**  
   Make small, coherent commits that keep the system building and chat working.

3. **Keep boundaries clean.**  
   - No direct OpenAI/Groq calls from agents or UI – always go through
     `LlmRouter` + Egress Guard.  
   - No direct Memgraph writes – always go through `GraphWriteService` +
     Graph Ingress Guard.  
   - Prompt aspects everywhere instead of manual string concatenation.

4. **Update docs when behaviour changes.**  
   If you must diverge from a spec for good reason, update the relevant doc in
   `docs/` and mention it clearly in your PR description.

5. **Favour extensibility and compliance.**  
   Prefer designs that:
   - Make it easy to add new agents, jurisdictions, and rule types.  
   - Preserve provider‑agnostic LLM routing.  
   - Respect privacy and non‑advice constraints.  
   - Bring you closer to SOC2/GDPR readiness over time.

Your end goal for a successful run of this prompt is to:

- Leave `main` closer to the **v0.4** design.  
- Have a working vertical slice where:
  - Chat UI → `/api/chat` → Compliance Engine → Global + domain agents →
    Memgraph + Timeline Engine → LlmRouter → Egress Guard → streamed answer.  
- Ensure switching models/providers (OpenAI/Groq/local) and tuning tenant
  egress policies can be done by configuration with **no consumer code
  rewrites**.

