# Regulatory Intelligence Copilot – Architecture (v0.4)

> **Goal:** A chat‑first, graph‑backed regulatory research copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal/tax advice or leaking sensitive data.
>
> **Scope of v0.4:** Aligns the architecture with the latest decisions on:
> - Node/TS/Next.js/React/Tailwind baselines.
> - Provider‑agnostic LLM routing (incl. OpenAI Responses + GPT‑OSS, Groq, local OSS models).
> - Aspect‑based **Egress Guard** and **Graph Ingress Guard** (with optional AI aspects).
> - Memgraph as a **single shared Rules Graph** (rules‑only, no user PII).
> - Optional, non‑breaking **graph algorithms** (Leiden, centrality, bounded traversals).
> - WebSocket graph streaming and reusable engine packages.

---

## 0. Normative References

This architecture sits on top of, and must remain consistent with, the following specs:

- `docs/specs/graph-schema/versions/docs/specs/graph-schema/versions/graph_schema_v_0_3.md`
- `docs/specs/graph_schema_changelog_v_0_3.md`
- `docs/specs/graph_algorithms_v_0_1.md`
- `docs/specs/timeline-engine/timeline_engine_v_0_2.md`
- `docs/specs/concept/versions/regulatory_graph_copilot_concept_v_0_3.md`
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/safety-guards/graph_ingress_guard_v_0_1.md`
- `docs/specs/safety-guards/egress_guard_v_0_2.md`

And the project‑level docs:

- `docs/decisions_v_0_3.md`
- `docs/roadmap_v_0_2.md`
- `docs/node_24_lts_rationale.md`

Where there is ambiguity, these specs take precedence over this document.

---

## 1. High‑Level Architecture

### 1.1 System Overview

The system consists of:

1. **Web app** (`apps/demo-web`)
   - Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui.
   - Primary UX is a chat interface plus a live regulatory graph view.

2. **Compliance Engine** (reusable packages)
   - Core logic in packages like `reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`.
   - Implements the regulatory copilot behaviour and is designed to be imported into other Next.js/Supabase SaaS apps.

3. **Shared Rules Graph (Memgraph)**
   - Memgraph Community + MAGE used as a **single global regulatory knowledge graph**.
   - Stores public rules, relationships, timelines, jurisdictions – **never tenant/user PII**.

4. **LLM + Tooling Layer**
   - `LlmRouter` with pluggable providers:
     - OpenAI Responses API (incl. GPT‑OSS models).
     - Groq (e.g. LLaMA 3 models).
     - Local/OSS models running in EU‑controlled infra.
   - All outbound calls (LLM, MCP, HTTP) go through **EgressClient** and the **Egress Guard**.

5. **Graph Ingress & Ingestion**
   - `GraphClient` + `GraphWriteService` (with **Graph Ingress Guard**) mediate all writes to Memgraph.
   - Ingestion agents use MCP/E2B/etc. but must upsert rules via this path only.

6. **Optional E2B + MCP Gateway**
   - For sandboxed execution and access to external MCP tools.
   - All egress from sandboxes is still funneled through the Egress Guard.

7. **Storage Layer (Host App)**
   - Supabase (or similar) provides multi‑tenant user/accounts/projects/storage.
   - Holds user profiles, scenarios, uploaded documents (if retained) – separate from Memgraph.


### 1.2 Privacy & Data Boundaries (Summary)

From `data_privacy_and_architecture_boundaries_v_0_1.md`:

- **Memgraph (Rules Graph)**
  - Stores only *public regulatory knowledge*:
    - Jurisdictions, regions, treaties, regimes, rules, benefits, timelines, case law, guidance, and their relationships.
  - **MUST NOT** store:
    - User PII, tenant PII, personal financial data, individual scenarios, or uploaded file contents.

- **Supabase / App DB**
  - Multi‑tenant application data: accounts, subscriptions, settings, saved scenarios.
  - Can hold references to graph nodes (by IDs) but not vice‑versa.

- **E2B Sandboxes**
  - Transient execution environments for code and document processing.
  - User documents (e.g. trade histories) are processed here and **deleted with the sandbox**, unless user explicitly opts into persistent storage.

- **Egress Guard**
  - All outbound calls (LLM, MCP, HTTP) pass through `EgressClient` → aspect pipeline.
  - Responsible for PII/sensitive‑data stripping and enforcing provider/jurisdiction policies.

- **Graph Ingress Guard**
  - All Memgraph writes pass through `GraphWriteService` → aspect pipeline.
  - Ensures only rule‑level data is upserted, never PII.

These boundaries are non‑negotiable and must be preserved in all future refactors.

---

## 2. Platform & Runtime Baselines

To keep the stack modern and consistent:

- **Node.js**: minimum **v24.x LTS**
  - Set in `"engines"` fields and CI.
  - Motivated in `docs/node_24_lts_rationale.md` (security, performance, newer language features).

- **TypeScript**: latest Node‑24 compatible (TS 5.9+).

- **Next.js**: minimum **v16**.

- **React**: minimum **v19**.

- **Tailwind CSS**: minimum **v4.0**.

All new code and future upgrades should target these versions at a minimum.

---

## 3. Frontend – `apps/demo-web`

### 3.1 Chat UI

- Single chat page (e.g. `/`) that talks to a single endpoint, `POST /api/chat`.
- Uses streaming responses (via fetch + ReadableStream or compatible SSE wrapper) to show partial model output.
- Displays:
  - User messages.
  - Assistant messages.
  - Optional metadata: jurisdictions considered, high‑level rule references, uncertainty level.

The chat UI is **intentionally thin** and does not know about:

- LLM providers
- Graph details
- E2B/MCP internals

It only cares about the shape of `/api/chat` input/output.

### 3.2 Profile & Jurisdiction Context

- Lightweight settings or profile panel:
  - Persona: `single-director`, `advisor`, `employee`, `investor`, etc.
  - Jurisdictions of interest: e.g. `['IE', 'EU', 'UK', 'NI', 'IM']`.
  - Locale: e.g. `en-IE`.
- This context is sent as a `UserProfileContext` on each `/api/chat` call.
- It must be **coarse‑grained and non‑PII**.

### 3.3 Live Graph UI

- On initial load:
  - Calls `GET /api/graph` with filters (jurisdictions, profile tag) to fetch a relevant subgraph snapshot.
- Then:
  - Connects to `ws://.../api/graph/stream` to receive **incremental updates** (patches) only.

Design constraints:

- WebSocket messages must carry only **changes** (added/removed/updated nodes/edges) and associated metadata.
- The full graph is **not** resent on each update; full reload is a rare, explicit action.
- SSE may still be used in other places (e.g. chat streaming) where one‑way streaming is sufficient.

The live graph UI is scoped to **rule graph data only**; it never renders user scenarios or private documents.

---

## 4. API Layer – `/api/chat` & `/api/graph`

### 4.1 `/api/chat`

- Next.js App Router handler.
- Responsibilities:
  - Validate request body.
  - Build `UserProfileContext` from request + auth/session.
  - Call `ComplianceEngine.handleChat(request)`.
  - Stream `ChatResponse` back to the browser.

The handler itself:

- Does not call LLMs or Memgraph directly.
- Uses DI to get a `ComplianceEngine` instance (e.g. from a shared `reg-intel-core` package).

### 4.2 `/api/graph`

Two primary endpoints:

1. `GET /api/graph`
   - Accepts filters (jurisdictions, profile tag, optional focus nodes).
   - Uses `GraphClient` to fetch a snapshot subgraph.

2. `WS /api/graph/stream`
   - Upgrades to WebSocket.
   - Pushes incremental changes (graph patches) as ingestion jobs or rule updates occur.

These endpoints are **read‑only** views into the Rules Graph.

---

## 5. Compliance Engine

The Compliance Engine is the backend orchestration layer that turns chat + profile context into answers.

### 5.1 Interfaces

Conceptual interfaces (exact types may differ):

```ts
interface UserProfileContext {
  tenantId: string;
  persona: string;              // e.g. "single-director"
  jurisdictions: string[];      // e.g. ["IE", "EU", "UK"]
  locale?: string;              // e.g. "en-IE"
}

interface ChatRequest {
  messages: ChatTurn[];
  profile: UserProfileContext;
}

interface ChatResponse {
  answer: string;
  referencedNodes: string[];    // IDs of rules/benefits/etc.
  jurisdictions: string[];      // considered jurisdictions
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;        // e.g. "non_advice_general"
}

interface ComplianceEngine {
  handleChat(request: ChatRequest): Promise<ChatResponse>;
}

function createComplianceEngine(deps: {
  llm: LlmClient;
  graph: GraphClient;
  timeline: TimelineEngine;
  egress: EgressClient;
}): ComplianceEngine;
```

### 5.2 Responsibilities

- **Intent routing**
  - Use profile + message content to decide whether to:
    - Use the global copilot agent, or
    - Call a domain/jurisdiction‑specific expert agent.

- **Agent orchestration**
  - Build an `AgentContext` with LLM, graph, timeline, profile.
  - Delegate to the selected agent’s `run()` method.

- **Use of Prompt Aspects**
  - All system prompts are built via the prompt aspect pipeline (see §7).
  - Agents must never manually concatenate prompts.

- **Safety & disclaimers**
  - All answers include a non‑advice disclaimer.
  - The engine never instructs users to take specific legal/tax steps; it provides research and explanations.

- **Isolation from infra**
  - The engine does not know *how* LLMs or Memgraph are hosted.
  - It only knows about `LlmClient` and `GraphClient` abstractions.

---

## 6. LLM Layer – Router, Providers & Egress

### 6.1 LlmClient & LlmRouter

Core types:

```ts
interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmCompletionOptions {
  model: string;           // e.g. "openai:gpt-4.1", "groq:llama3-70b", "local:llama3-8b"
  task?: string;           // e.g. "main-chat", "egress-guard", "pii-sanitizer"
  temperature?: number;
  maxTokens?: number;
}

interface LlmProvider {
  stream(
    messages: LlmMessage[],
    options: LlmCompletionOptions & { tenantId: string }
  ): AsyncIterable<{ type: 'text' | 'error'; delta?: string; error?: Error }>;
}

interface LlmClient {
  streamChat(
    messages: LlmMessage[],
    options: LlmCompletionOptions & { tenantId: string }
  ): AsyncIterable<{ type: 'text' | 'error'; delta?: string; error?: Error }>;
}
```

`LlmRouter` implements `LlmClient` and:

- Maintains a registry of `LlmProvider`s (OpenAI, Groq, local, etc.).
- Uses tenant‑level and task‑level policy to decide which provider/model to call.
- Delegates the actual outbound call to `EgressClient` so all provider usage is guarded.

### 6.2 Tenant & Task Policies

From the decisions docs, policies are per‑tenant and per‑task:

```ts
interface LlmTaskPolicy {
  task: string;          // e.g. "main-chat", "egress-guard"
  model: string;
  provider: string;      // e.g. "openai", "groq", "local"
}

interface TenantLlmPolicy {
  tenantId: string;
  defaultModel: string;
  defaultProvider: string;
  allowRemoteEgress: boolean;
  tasks: LlmTaskPolicy[];
}
```

Behaviour:

- If a `task` is provided, the router uses the matching `LlmTaskPolicy`.
- Otherwise, falls back to `defaultModel` / `defaultProvider`.
- If `allowRemoteEgress = false`, the Egress Guard blocks remote providers and enforces local/OSS models.

This allows e.g.:

- `main-chat` → Groq / OpenAI mid‑size model.
- `egress-guard` → small local model.
- `pii-sanitizer` → tiny specialised local model.

### 6.3 Vercel AI SDK v5 as Primary Provider Implementation

**ALL LLM providers use Vercel AI SDK v5** as their primary implementation:

- **OpenAI**: Uses `@ai-sdk/openai` (automatically uses **Responses API** for OpenAI models and GPT‑OSS)
- **Groq**: Uses `@ai-sdk/groq`
- **Anthropic**: Uses `@ai-sdk/anthropic`
- **Google Gemini**: Uses `@ai-sdk/google`
- **Local/OSS models**: Uses `@ai-sdk/openai` with custom `baseURL` (automatically uses **Chat Completions API** `/v1/chat/completions`)
  - vLLM, Ollama, and other OpenAI-compatible local endpoints only support the Chat Completions API
  - AI SDK auto-detects non-OpenAI endpoints and uses appropriate API
  - Configuration supports optional API key for authenticated local endpoints

**Important API distinction (auto-detected by AI SDK):**
- OpenAI endpoints (api.openai.com) → Responses API (modern, supports structured outputs)
- Local providers (custom baseURL) → Chat Completions API (widely compatible with OSS models)

The AI SDK v5 automatically detects the appropriate endpoint based on the baseURL configuration.

Benefits of AI SDK v5 as the primary layer:

- **Unified interface**: Consistent `generateText()` / `streamText()` APIs across all providers
- **Automatic protocol handling**: AI SDK handles provider‑specific differences (e.g., OpenAI Responses API vs Chat Completions)
- **Built‑in streaming**: Consistent streaming support across all providers
- **Error handling**: Standardized error types and retry logic

The engine remains decoupled from AI SDK v5 specifics through the `LlmProviderClient` interface, but internally all provider implementations leverage AI SDK v5 for reliable, consistent LLM interactions.

### 6.4 EgressClient & Egress Guard

The **EgressClient** is the single choke‑point for:

- LLM calls (from `LlmRouter`).
- MCP/tool calls.
- Arbitrary HTTP client calls (e.g. fetching docs, RSS feeds).

It:

1. Constructs an `EgressGuardContext` (target type, provider, endpoint, payload, tenantId, jurisdictions…).
2. Passes this through the **Egress Guard aspect pipeline** defined in `docs/specs/safety-guards/egress_guard_v_0_2.md`.
3. The final aspect executes the actual outbound call using the provider SDK/HTTP client and attaches the raw response back onto the context.

Egress aspects can:

- Enforce provider/endpoint whitelists.
- Remove or mask sensitive data.
- Inject or modify prompts.
- Use **AI policy agents** (small local models) to review requests and veto/block if necessary.

All MCP calls (including Memgraph MCP if used) must go through this path.

---

## 7. Prompt Aspects & System Prompts

### 7.1 Jurisdiction‑Neutral Base Prompts

Base system prompts such as:

- `REGULATORY_COPILOT_SYSTEM_PROMPT`
- `GLOBAL_SYSTEM_PROMPT`
- The `/api/chat` base `SYSTEM_PROMPT`

…are kept **jurisdiction‑neutral**, describing only:

- The assistant’s high‑level role.
- Safety and non‑advice constraints.
- General expectations about using graph/timeline evidence.

Specific jurisdictions and personas are injected via aspects.

### 7.2 Prompt Aspect Pipeline

Prompt aspects (implemented in `reg-intel-prompts`) include:

- `jurisdictionAspect`
- `agentContextAspect`
- `profileContextAspect`
- `disclaimerAspect`
- `additionalContextAspect`

API examples:

```ts
const prompt = await buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, {
  jurisdictions: ['IE', 'MT'],
  agentId: 'GlobalRegulatoryComplianceAgent',
  profile: { personaType: 'single-director' },
});

const customBuilder = createPromptBuilder([
  jurisdictionAspect,
  myCustomAspect,
]);

const result = await customBuilder({
  basePrompt: '...',
  jurisdictions: ['DE'],
});
```

All LLM calls must use these builders; no agent should hand‑craft system prompts.

### 7.3 Dynamic Profile Tags

Profile tags are derived dynamically:

- e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_SINGLE_DIRECTOR_MT`, etc.

`getProfileTagId()` encapsulates this logic and is used consistently across:

- Graph schema (profile tag nodes).
- Routing logic.
- Prompt aspects.

---

## 8. Graph Layer – Memgraph Rules Graph

### 8.1 GraphClient & GraphWriteService

- **GraphClient** provides typed queries for read operations:

```ts
interface GraphClient {
  getRulesForProfileAndJurisdiction(...): Promise<...>;
  getNeighbourhood(...): Promise<...>;
  getMutualExclusions(...): Promise<...>;
  getTimelines(...): Promise<...>;
  getCrossBorderSlice(...): Promise<...>;
}
```

- **GraphWriteService** provides writes via the Graph Ingress Guard:

```ts
interface GraphWriteService {
  upsertRule(...): Promise<void>;
  upsertRelationship(...): Promise<void>;
  upsertTimelineEdge(...): Promise<void>;
  // etc.
}
```

All writes must go through `GraphWriteService`, which applies the ingress aspect pipeline (`graph_ingress_guard_v_0_1.md`) before issuing Cypher `MERGE`/`CREATE`.

### 8.2 Schema Overview (Summary)

Full details are in `docs/specs/graph-schema/versions/graph_schema_v_0_3.md`; in brief:

- **Key node labels**:
  - `:Jurisdiction`, `:Region`, `:Agreement`, `:Treaty`
  - `:Regime`, `:Rule`, `:Section`, `:Benefit`, `:Relief`
  - `:TimelineConstraint`, `:Event`, `:CaseLaw`, `:Guidance`
  - `:ProfileTag`, `:Community` (optional, for algorithms)

- **Key relationship types** (non‑exhaustive):
  - `APPLIES_IN`, `PART_OF_REGIME`, `CITES`, `REFERENCES`
  - `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`
  - `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`
  - `COORDINATED_WITH`, `TREATY_LINKED_TO`
  - `INTERPRETS` (case law/guidance → rule)
  - `HAS_PROFILE_TAG` (rule/benefit ← profile tags)
  - `CONTAINS` (community → member nodes)

These encode the semantics needed for:

- Mutual exclusions, eligibility chains, and conflicts.
- Timeline/lock‑in/lookback reasoning.
- Cross‑border interactions (IE/UK/NI/EU/IM/GI/AD/CTA).

### 8.3 Graph Algorithms (Optional, Non‑Breaking)

As per `graph_algorithms_v_0_1.md`:

- Core behaviour relies on **explicit edges + Cypher path queries**.
- Optional algorithms include:
  - **Leiden community detection** on snapshots to assign `community_id` and build `:Community` nodes.
  - **Centrality (PageRank/betweenness)** within communities to identify anchor rules.
  - **Bounded multi‑hop traversals** for impact analysis.

Invariants:

- Disabling Leiden/centrality must not break any existing behaviour.
- Algorithms are used for ranking, grouping, and GraphRAG context selection only.

---

## 9. Timeline Engine

The **Timeline Engine** (`timeline_engine_v_0_2.md`) handles time‑based reasoning:

- Consumes `LOOKBACK_WINDOW` and `LOCKS_IN_FOR_PERIOD` edges from the graph.
- Given a scenario (e.g. sequence of events, dates, actions), computes:
  - Whether a rule applies at a given date.
  - When lock‑in periods expire.
  - How lookbacks affect eligibility.

The Compliance Engine:

- Calls `TimelineEngine` when a question involves timing (e.g. CGT wash rules, PRSI contribution windows).
- Uses the output as evidence in LLM prompts and in explanations.

---

## 10. Special Jurisdictions & Cross‑Border Design

Special modelling for IE/UK/NI/EU/IM/GI/AD/CTA is captured in:

- `special_jurisdictions_modelling_v_0_1.md`
- Seed examples such as `graph_seed_ni_uk_ie_eu.cypher`

The architecture must:

- Allow nodes to belong to multiple overlapping regimes (e.g. NI under UK and covered by certain EU rules via the Withdrawal Agreement).
- Represent the **Common Travel Area** and its implications as first‑class graph relationships.
- Support queries like:
  - "I live in IE, work in NI, and have a company in IM – what rules interact here?"

This is expressed entirely in the graph schema and seed data; the engine and UI need only respect jurisdiction filters and profile context.

---

## 11. Reusability & Integration with Other SaaS Apps

Key goal: the regulatory engine must be reusable inside other Next.js/Supabase SaaS platforms.

Design choices:

- **Engine as libraries**
  - Compliance Engine, GraphClient, LlmRouter, Prompt Aspects, Ingress/Egress Guards are packaged as libraries.
  - The demo app is just one host; other apps can:
    - Import the engine.
    - Provide their own `/api/chat` routes.
    - Plug in their own auth, billing, and UI.

- **Clear interfaces**
  - All boundaries (LLM, graph, storage, E2B) are abstracted through interfaces and adapters.
  - Host apps can replace implementations without touching core logic.

- **Multi‑tenant awareness**
  - Tenant IDs are propagated through LLM policies and egress/ingress guards.
  - Memgraph remains a shared Rules Graph; multi‑tenancy is enforced in app storage and LLM policies.

This makes it feasible later to offer the **Regulatory Intelligence Copilot** as:

- A standalone SaaS product.
- A managed shared Memgraph‑as‑a‑service with this engine on top.
- An embeddable cog in other EU‑first compliance platforms.

---

## 12. Non‑Goals (v0.4)

To keep scope sane, v0.4 explicitly does **not** attempt to:

- Implement Memgraph multi‑tenant isolation (one shared rules graph is sufficient; multi‑tenant Memgraph is a future, separate project).
- Provide legal/tax advice; the system is strictly a research and explanation tool.
- Model every country globally; initial focus is IE/EU/UK/NI/IM/GI/AD and nearby interactions.
- Optimise for ultra‑low latency – correctness, safety, and clarity are prioritised over a few extra milliseconds.

Future versions (v0.5+) may extend the architecture in these directions once the core is stable.

---

**Status:** Architecture v0.4 – updated to incorporate all recent decisions on Node 24 baseline, LLM routing, ingress/egress guards, graph algorithms, and special jurisdiction modelling.

