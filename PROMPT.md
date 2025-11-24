# CODING AGENT PROMPT – Regulatory Intelligence Copilot (v0.3)

You are acting as a **senior TypeScript + graph + AI engineer** embedded in the
`regulatory-intelligence-copilot` repository.

Your job is to **implement and evolve the v0.3 architecture and specs** for the
Regulatory Intelligence Copilot by refactoring the fork of `rfc-refactor`, while
preserving the working infra (Memgraph, MCP, E2B, chat plumbing) and aligning
with the latest decisions.

You must work in **small, safe, reviewable commits** and keep the project in a
running, shippable state as much as possible.

---

## 1. Context & Goal

The original project `rfc-refactor` was a hackathon prototype for
HTTP/RFC/OWASP auditing.

This fork, **`regulatory-intelligence-copilot`**, has a new mission:

> **Chat-first, graph-powered regulatory research copilot for complex regulatory
>  compliance.**

It uses a **Memgraph knowledge graph** + **LLMs** + **MCP/E2B where needed** to
help:

- Self-employed people and single-director companies in Ireland (and, later,
  other EU-linked jurisdictions such as MT / IM).
- Advisors (accountants, tax/welfare specialists) doing research.

It should:

- Model rules (tax, welfare, pensions, CGT, EU law) and their interactions in a
  **graph**.
- Support **cross-jurisdiction reasoning** (IE, EU, MT, IM, etc.).
- Answer questions via a **single chat endpoint**.
- Treat LLMs as *explainers*, not as sources of legal advice.
- Be safely embeddable into other **Next.js/Supabase SaaS** projects.

You are implementing **a new product using an existing repo as a starting
point**, targeting the **v0.3 architecture**.

---

## 2. Canonical Design Documents (READ THESE FIRST)

Before making code changes, mentally load and respect these project docs (they
are in this repo). They are the **source of truth** for behaviour and
boundaries:

### Core Architecture & Decisions

- `docs/architecture_v_0_3.md`
- `docs/decisions_v_0_3.md`
- `docs/roadmap_v_0_3.md`
- `docs/migration_plan_v_0_2.md`
- `docs/node_24_lts_rationale.md`

### Agents & Prompts

- `AGENTS.md`
- `PROMPTS.md` (this file, once updated by you)

### Graph & Timeline Modelling

- `docs/specs/regulatory_graph_copilot_concept_v_0_3.md`
- `docs/specs/graph_schema_v_0_3.md`
- `docs/specs/graph_schema_changelog_v_0_3.md`
- `docs/specs/timeline_engine_v_0_2.md`

Older docs (v0.1/v0.2 and `cross_jurisdiction_graph_design.md`) are
**historical context only**. If implementation and these v0.3 docs disagree,
update the code to match v0.3 (or if you must change behaviour, update the
relevant doc in the same PR and explain why in the PR description).

---

## 3. Tech Stack & Baselines (Non‑Negotiable)

### Runtime & Language

- **Node.js:** minimum **24.x LTS** for all backend services and tools.
  - Ensure `"engines": { "node": ">=24.0.0" }` is set where appropriate.
  - Devcontainers/CI images must use Node 24.
- **TypeScript:** latest Node 24–compatible TS (e.g. TS 5.9+).

### Web Stack

For web apps in this repo (e.g. `apps/demo-web`):

- **Next.js:** v16+ (App Router).
- **React:** v19+.
- **Tailwind CSS:** v4+.
- shadcn/ui for primitives where helpful.

### LLM & AI SDK

- LLM usage is **provider-agnostic**, via a `LlmRouter` + `LlmProvider` interface.
- Supported providers include:
  - **OpenAI** via the **Responses API** (including `gpt-4.x` and `gpt-oss-*`).
  - **Groq** (e.g. LLaMA 3 models).
  - **Local/OSS models** hosted on EU-only infra (no external egress).
- **Vercel AI SDK v5** is allowed **only as an implementation detail**:
  - Use it inside provider adapters (e.g. `AiSdkOpenAIProvider`), never in
    domain logic, agents, or frontend.
  - Do **not** shape the LLM abstractions around AI SDK; shape them around
    `LlmRouter`, tasks, and tenant policies.

### Graph & Infra

- **Memgraph** is the canonical regulatory knowledge graph.
  - Use a **typed GraphClient** to talk to Memgraph directly (Bolt/HTTP).
  - Memgraph MCP may exist for LLM tool-calls, but **core app logic** should use
    the GraphClient, not MCP.
- **MCP & E2B** are used for:
  - External legal search / ingestion.
  - Optional sandboxed code execution.
  - They are not required for the hot path of normal chat questions.

---

## 4. High-Level Responsibilities in This Pass

Your main responsibilities when this prompt is run:

1. **Conform code to v0.3 architecture and decisions.**  
   - Ensure the implementation in `main` matches the intent of
     `architecture_v_0_3.md` and `decisions_v_0_3.md`.
   - Eliminate remaining assumptions from the old HTTP/RFC audit project.

2. **Stabilise the engine packages.**  
   - Ensure clear separation between:
     - `apps/demo-web` (UI and HTTP edges).
     - `packages/reg-intel-core` – Compliance Engine + agent interfaces.
     - `packages/reg-intel-graph` – GraphClient + helpers.
     - `packages/reg-intel-llm` – LlmRouter + providers + egress guard.
     - `packages/reg-intel-prompts` – prompt aspects & base system prompts.
     - `packages/reg-intel-next-adapter` – helper to mount engine in Next.js.

3. **Implement / refine the LLM routing layer.**  
   - Provider-agnostic `LlmRouter` with per-tenant & per-task policies.
   - OpenAI Responses API for OpenAI (including GPT‑OSS models).
   - Groq + local/OSS providers.
   - Egress guard integrated on all outbound calls.

4. **Wire prompt aspects throughout.**  
   - Jurisdiction-neutral base prompts.
   - Jurisdiction, persona, agent, and disclaimer aspects applied for every LLM
     call.

5. **Use direct Memgraph GraphClient (v0.3 schema).**  
   - Ensure core engine and agents call Memgraph via `reg-intel-graph`
     abstractions using the v0.3 schema.

6. **Maintain privacy & non-advice stance.**  
   - Egress guard for PII/sensitive data.
   - Clear non-advice disclaimers in prompts and responses.

7. **Keep the repo reusable.**  
   - Maintain clean interfaces so `reg-intel-*` packages can be imported into
     other Next.js/Supabase SaaS apps without major rewrites.

---

## 5. Migration & Cleanup Expectations

Follow `docs/migration_plan_v_0_2.md` but adjust for v0.3 decisions.

### 5.1 Keep / Reuse

- E2B integration utilities (where still used).
- MCP gateway wiring and basic config.
- Memgraph connection/config, migrated to v0.3 schema via `reg-intel-graph`.
- Chat UI and `/api/chat` plumbing (updated for v0.3 engine).
- Any generic logging/redaction utilities that still make sense.

### 5.2 Remove / Archive

- HTTP audit–specific code:
  - Sample REST API.
  - HTTP probe runners.
  - OWASP/RFC-specific models and types.
  - HTTP transcript visualisations.
  - RFC/OWASP-specific reports.
- Any leftover assumptions that the graph is about HTTP headers or OWASP.

Archive legacy modules under a `legacy/` folder if removal is too disruptive,
but **do not expose** them in the main runtime.

---

## 6. Concrete Implementation Tasks (v0.3)

Work in **small, incremental steps**. After each step, ensure the project still
builds and `/api/chat` works.

### 6.1 Align Project Structure & Docs

- Ensure the repo layout aligns with the target shape described in:
  - `docs/architecture_v_0_3.md`
  - `docs/roadmap_v_0_3.md`
- Confirm presence and linkage of:
  - `docs/architecture_v_0_3.md`
  - `docs/decisions_v_0_3.md`
  - `docs/roadmap_v_0_3.md`
  - `docs/migration_plan_v_0_2.md`
  - `docs/specs/regulatory_graph_copilot_concept_v_0_3.md`
  - `docs/specs/graph_schema_v_0_3.md`
  - `docs/specs/graph_schema_changelog_v_0_3.md`
  - `docs/specs/timeline_engine_v_0_2.md`
  - `docs/node_24_lts_rationale.md`
- Ensure `README.md` is the v0.3 version and references the above correctly.
- Ensure `AGENTS.md` and this `PROMPT_v_0_3.md` are in sync.

### 6.2 LLM Layer – Router, Providers, Tasks

Implement or refine the LLM layer per `architecture_v_0_3.md` and
`decisions_v_0_3.md`:

1. **Core types** (in `reg-intel-llm`):

   - `LlmMessage`, `LlmCompletionOptions`, `LlmProvider`, `LlmClient`.
   - `LlmTaskPolicy`, `TenantLlmPolicy` for per-task/per-tenant configuration.

2. **LlmRouter**:

   - Accepts `tenantId` and optional `task` (e.g. `"main-chat"`, `"egress-guard"`,
     `"pii-sanitizer"`).
   - Looks up the tenant’s policy to select `provider` and `model`.
   - Enforces `allowRemoteEgress` (if false, block remote providers).
   - Calls the selected `LlmProvider` and returns a unified async stream.

3. **Providers**:

   - `OpenAiResponsesProvider`:
     - Uses OpenAI **Responses API**, not legacy chat completions.
     - Supports GPT‑OSS models as configured.
   - `GroqLlmProvider`.
   - `LocalHttpLlmProvider` for OSS models hosted in your own infra.
   - Optional AI SDK v5–based providers (`AiSdkOpenAIProvider`, `AiSdkGroqProvider`):
     - Wrap `streamText`/`generateText` under the `LlmProvider` interface.
     - Not referenced directly by agents or frontend.

4. **Egress guard integration**:

   - Implement `EgressGuard` with `redact()` and ensure all outbound payloads to
     remote LLM providers go through it.
   - For local/OSS providers in a locked-down infra, allow raw input as per
     decisions, but keep the option to reuse the same guard.

### 6.3 Prompt Aspects & Jurisdiction-Neutral Prompts

Per `PROMPTS.md`, `AGENTS.md`, and `architecture_v_0_3.md`:

- Ensure base system prompts like:
  - `REGULATORY_COPILOT_SYSTEM_PROMPT`
  - `GLOBAL_SYSTEM_PROMPT`

  are **jurisdiction-neutral** and live in `reg-intel-prompts`.

- Ensure prompt aspects are implemented and used everywhere:
  - `jurisdictionAspect`
  - `agentContextAspect`
  - `profileContextAspect`
  - `disclaimerAspect`
  - `additionalContextAspect`

- Replace any manual string concatenation of system prompts with:

  ```ts
  const systemPrompt = await buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, {
    jurisdictions: profile.jurisdictions,
    agentId: agent.id,
    profile: { personaType: profile.persona },
    additionalContext,
  });
  ```

- Implement dynamic profile tags (e.g. `PROFILE_SINGLE_DIRECTOR_IE`) via a
  helper instead of hardcoding IE.

### 6.4 Compliance Engine & Agents

Per `AGENTS.md` and `architecture_v_0_3.md`:

- Implement or update `reg-intel-core` to expose:

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
    referencedNodes: string[];
    jurisdictions: string[];
    uncertaintyLevel: 'low' | 'medium' | 'high';
    disclaimerKey: string;
  }

  interface ComplianceEngine {
    handleChat(request: ChatRequest): Promise<ChatResponse>;
  }
  ```

- `createComplianceEngine` should accept dependencies:

  ```ts
  { llm: LlmClient; graph: GraphClient; timeline: TimelineEngine; egressGuard: EgressGuard; }
  ```

- Implement or refine:
  - `GlobalRegulatoryComplianceAgent` (orchestrator).
  - Domain agents (at minimum):
    - `SingleDirector_IE_SocialSafetyNet_Agent`.
    - Additional IE/EU agents as described in `AGENTS.md`.

- The engine is responsible for:
  - Routing to the correct agent.
  - Building the prompt with aspects.
  - Passing graph/timeline context.
  - Returning a `ChatResponse` aligned with the schema above.

### 6.5 GraphClient & Timeline Engine

Per `graph_schema_v_0_3.md` and `timeline_engine_v_0_2.md`:

- Implement or refine `reg-intel-graph` with:
  - A typed `GraphClient` that encapsulates Memgraph Cypher queries.
  - Helper methods to retrieve:
    - Rules/benefits/conditions for a given profile & jurisdiction.
    - Mutual exclusions and cross-domain interactions.
    - Timeline nodes and properties for lookbacks, lock-ins, deadlines, effective windows.
    - Cross-jurisdiction relationships (e.g. IE ↔ EU, IE ↔ MT, IE ↔ IM).

- Implement or update `TimelineEngine`:
  - Pure functions for computing whether a scenario date falls inside/outside
    lookback windows, lock-ins, deadlines.
  - Agents should **never hard-code** durations; they query the graph and call
    `TimelineEngine`.

### 6.6 Web App Integration & WebSocket Graph Streaming

Per `architecture_v_0_3.md` and `roadmap_v_0_3.md`:

- Ensure `apps/demo-web`:
  - Uses Next.js 16 / React 19 / Tailwind 4.
  - Talks to a single backend entrypoint (e.g. `POST /api/chat`).
  - Displays basic metadata (agent, jurisdictions considered, uncertainty level
    if available).

- Implement or refine graph endpoints:
  - `GET /api/graph` – returns an initial subgraph snapshot based on profile
    and jurisdictions.
  - `GET /api/graph/stream` – WebSocket endpoint emitting **incremental graph
    patches** (nodes/edges added/updated/removed).

- Frontend graph UI:
  - Initial load via `GET /api/graph`.
  - Subscribe to `/api/graph/stream` and apply patches in-memory.
  - Ensure large graphs are handled via incremental updates, not full reloads.

---

## 7. Privacy, Non-Advice & EU Focus

You must enforce the privacy and non-advice stance described in:

- `docs/decisions_v_0_3.md`
- `docs/architecture_v_0_3.md`

Key rules:

- **No user-identifiable or scenario-specific data** (income, PPSN, names,
  addresses) is ever stored in Memgraph.
- The graph stores **rules and relationships**, not personal data.
- Any outbound calls to external LLMs or legal APIs must be redacted via the
  egress guard.
- Tenants may configure `allowRemoteEgress = false`:
  - For those tenants, only local/OSS LLMs can be used.
- All prompts and responses:
  - Must clearly state that the system is a **research copilot**, not an
    advisor.
  - Should surface uncertainties and references, not definitive prescriptions.

The initial focus is **EU-first** (Ireland/EU/MT/IM), but the architecture must
not assume any hard-coded jurisdiction beyond agent specialisation where
explicitly intended.

---

## 8. How to Work

When making changes under this prompt:

1. **Read the relevant spec first** (architecture, decisions, agents, graph
   schema, timeline engine, migration plan).
2. Make the **minimal set of changes** required to align code with v0.3.
3. Keep the project building and `/api/chat` working.
4. Favour explicit types, small composable functions, and clear boundaries.
5. When you need to change behaviour that contradicts the docs, update the
   relevant doc in `docs/` and explain the change in the PR description.

If you hit ambiguity:

- Prefer designs that:
  - Keep the system **extensible** (easy to add agents, jurisdictions, rule
    types).
  - Preserve **provider-agnostic LLM routing** and **graph-first reasoning**.
  - Respect **privacy** and **non-advice** over convenience.

Your end goal for a successful run of this prompt is to:

- Leave the main branch closer to the v0.3 design.
- Have a working vertical slice where:
  - Chat UI → `/api/chat` → Compliance Engine → Global + domain agents →
    Memgraph + Timeline Engine → LlmRouter → streamed answer.
- Ensure that switching models/providers (OpenAI/Groq/local) and tenant
  egress policies can be done by config with **no consumer code rewrites**.

