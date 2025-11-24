# Regulatory Intelligence Copilot – Architecture (v0.2)

> **Goal:** A chat‑driven, graph‑backed regulatory copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal / tax advice or leaking sensitive data. The system is EU‑first, privacy‑conscious, and designed to be reused inside other Next.js/Supabase SaaS products.

This version updates the original architecture to:

- Make the **core prompts jurisdiction‑neutral**, with country‑specific agents layered on top.
- Introduce a **provider‑agnostic LLM router** that supports OpenAI (Responses API), Groq, and local/OSS models.
- Use a **direct Memgraph GraphClient** for core graph queries (instead of Memgraph MCP), while still using MCP for external data.
- Add **WebSocket‑based graph streaming** with incremental patches.
- Structure the repo as a **reusable engine + demo app**, so it can be embedded into other Next.js/Supabase platforms.

---

## 1. High‑Level Overview

The system is a **chat‑centric web app + reusable engine** that:

1. Runs a **Next.js** front‑end (`apps/demo-web`) with a single chat UI and live graph view.
2. Talks primarily to a single backend endpoint: **`POST /api/chat`**.
3. Delegates all regulatory reasoning to a **Compliance Engine** defined in reusable packages (e.g. `reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`).
4. Uses **Memgraph** as a regulatory knowledge graph for:
   - Statutes, sections, benefits, reliefs, timelines, cases, guidance, EU instruments.
   - Mutual exclusions, lookback windows, lock‑ins, profile tags.
5. Uses a **provider‑agnostic LLM router** to:
   - Route tasks like `main-chat`, `egress-guard`, `pii-sanitizer` to different models/providers.
   - Support OpenAI’s Responses API, Groq, and local/OSS models running in EU‑controlled infra.
6. Applies an **egress guard** before any outbound LLM/tool call to prevent PII and sensitive financial data from leaking.
7. Optionally uses an **E2B sandbox** for:
   - Heavy or untrusted code execution (e.g. complex scenario simulations or ingestion jobs).
   - MCP‑based access to external sources (e.g. Revenue, EU law portals) when needed.

At every layer, the architecture is designed to be:

- **Graph‑first** – rules and relationships live in Memgraph.
- **Agentic** – separate agents for global reasoning and domain/jurisdiction‑specific lenses.
- **Prompt‑disciplined** – all prompts are built through a composable aspect system.
- **Provider‑agnostic & EU‑friendly** – easy to run entirely on local models for strict data residency.
- **Reusable** – engine packages can be imported into other Next.js/Supabase apps.

---

## 2. Request Flow (End‑to‑End)

1. **User sends a message** in the chat UI.
2. **Next.js API route** (`POST /api/chat`) receives:
   - Chat messages.
   - A `UserProfileContext` (persona, jurisdictions, tenantId, locale).
3. The API route delegates to the **Compliance Engine** created from `reg-intel-core`:
   - Normalises the message.
   - Uses simple routing to select an agent (global vs domain‑specific).
   - Passes the request to the selected agent along with graph and LLM clients.
4. The Compliance Engine calls into:
   - **GraphClient** (direct Memgraph) to fetch relevant rules, relationships, and timelines.
   - **Timeline Engine** to compute time‑based constraints (lookback, lock‑in, deadlines).
   - **LlmRouter** to generate an answer using the appropriate model for the `main-chat` task.
   - **Prompt Aspects** to build a jurisdiction‑aware, persona‑aware, safety‑aware system prompt.
5. The LLM’s draft answer is post‑processed to:
   - Attach references to relevant nodes/sections/cases.
   - Attach a non‑advice disclaimer.
   - Compute a simple uncertainty level flag.
6. The Compliance Engine returns a **ChatResponse** to `/api/chat`.
7. The API route streams the response to the frontend as assistant messages.
8. In parallel, graph updates (from ingestion jobs or external updates) are pushed via **WebSocket graph patches** so the live graph can update incrementally.

Optional:

- For heavy computations or untrusted transformations, the Compliance Engine can spin up an **E2B sandbox session** and run part of the workflow inside the sandbox, still using GraphClient and LlmRouter abstractions.

---

## 3. Frontend – `apps/demo-web`

### 3.1 Chat UI

The web frontend is intentionally minimal and reusable:

- Single chat page (`/`) powered by Next.js (App Router), React, Tailwind, shadcn/ui.
- Conversation view:
  - User messages.
  - Assistant messages with optional metadata (agent name, jurisdictions considered, rules referenced).
- Input box at the bottom:
  - Free‑text input.
  - Optional quick actions that prefill typical questions.

The chat UI is **not tied** to any specific LLM provider or graph; it only knows about `/api/chat`.

### 3.2 Profile & Context

A lightweight profile sidebar or settings panel allows the user to set:

- Persona: `single-director`, `contractor`, `employee`, `advisor`, `investor`, etc.
- Jurisdictions of interest: e.g. `['IE', 'EU', 'MT', 'IM']`.
- Locale (for UI and explanation style): e.g. `en-IE`.

The frontend includes only **coarse, non‑PII info** and sends this as `UserProfileContext` in each `/api/chat` call. Any richer data, if ever used, is processed through the egress guard before leaving backend boundaries.

### 3.3 Live Graph UI

The graph UI displays a subgraph relevant to the current question or profile:

- On initial load, it calls `GET /api/graph` with filters (jurisdictions, profile tag) to get a **snapshot** of the relevant subgraph.
- It then connects to `ws://.../api/graph/stream` to receive **incremental graph patches**.
- Only changes (added/updated/removed nodes/edges) are sent over WS, not the full graph.

This enables a responsive, scalable visualisation of the regulatory graph that can evolve over time.

---

## 4. Backend – `/api/chat` and Compliance Engine

### 4.1 Next.js API Route

The main backend HTTP API is `POST /api/chat` (App Router route handler).

Responsibilities:

- Parse and validate the incoming payload.
- Extract or construct a `UserProfileContext`:
  - `tenantId`
  - `persona`
  - `jurisdictions[]`
  - `locale`
- Call the **Compliance Engine** with:
  - `messages`
  - `profile`
- Stream the resulting `ChatResponse` back to the client.

The route handler itself is intentionally thin so it can be easily re‑used (or re‑created) in other Next.js apps via a small adapter package.

### 4.2 Compliance Engine

The **Compliance Engine** lives in `reg-intel-core` and exposes something like:

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

function createComplianceEngine(deps: {
  llm: LlmClient;
  graph: GraphClient;
  timeline: TimelineEngine;
  egressGuard: EgressGuard;
}): ComplianceEngine;
```

Responsibilities:

- **Intent routing**:
  - Decide whether to use the `GlobalRegulatoryComplianceAgent` or a domain/jurisdiction‑specific agent.
  - Use persona + jurisdictions + message content for routing.
- **Agent orchestration**:
  - Build an `AgentContext` with LLM, graph, timeline, profile.
  - Delegate to the chosen agent’s `run(context)`.
- **Safety wrapping**:
  - Ensure every LLM call uses prompt aspects (disclaimer, jurisdiction, profile context).
  - Ensure outputs include disclaimers and do not cross the “advice” line.
- **Abstraction from infra**:
  - The engine does *not* know whether LLMs and GraphClient are backed by MCP, direct HTTP, or local services.
  - This makes it portable across environments and host apps.

---

## 5. LLM Layer – Router, Providers, Tasks

### 5.1 LlmClient and LlmRouter

The LLM layer is designed to be **provider‑agnostic** and configurable per task and per tenant.

Core abstractions:

```ts
interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmCompletionOptions {
  model: string;    // e.g. "openai:gpt-4.1", "groq:llama-3-70b", "local:llama-3-8b"
  task?: string;    // e.g. "main-chat", "egress-guard", "pii-sanitizer"
  temperature?: number;
  maxTokens?: number;
}

interface LlmClient {
  chat(
    messages: LlmMessage[],
    options: LlmCompletionOptions & { tenantId: string }
  ): Promise<string>;
}
```

The **LlmRouter** implements `LlmClient` and:

- Knows about multiple backends:
  - `OpenAiResponsesClient` – calls OpenAI’s Responses API.
  - `GroqLlmClient` – calls Groq.
  - `LocalHttpLlmClient` – calls a local/OSS model server (e.g. vLLM, Ollama) in EU‑controlled infra.
- Resolves provider/model based on:
  - Tenant policies (`TenantLlmPolicy`).
  - Task (`"main-chat"`, `"egress-guard"`, `"pii-sanitizer"`, etc.).

### 5.2 Tenant and Task Policies

A policy layer defines what each tenant is allowed to use:

```ts
interface LlmTaskPolicy {
  task: string;           // e.g. "main-chat", "egress-guard"
  model: string;          // e.g. "openai:gpt-4.1", "local:llama-3-8b"
  provider: string;       // e.g. "openai", "groq", "local"
}

interface TenantLlmPolicy {
  tenantId: string;
  defaultModel: string;
  defaultProvider: string;
  allowRemoteEgress: boolean;
  tasks: LlmTaskPolicy[];
}
```

The router:

- Looks up the tenant’s policy from a store (DB/config).
- If `options.task` is specified, applies the corresponding `LlmTaskPolicy`.
- Otherwise, falls back to the default model/provider.
- Works in tandem with the **egress guard**:
  - If `allowRemoteEgress = false`, remote providers (OpenAI, Anthropic, Groq, etc.) are blocked.
  - Local/OSS providers can be used exclusively for sensitive tenants.

This enables **fine‑grained control** so that, for example:

- `main-chat` uses a mid‑size Groq or OpenAI model.
- `egress-guard` uses a small, cheap local model.
- `pii-sanitizer` uses a tiny local model designed for PII detection.

All of this is configured without changing application code.

---

## 6. Prompt Aspects & Jurisdiction‑Neutral System Prompts

### 6.1 System Prompts

Core system prompts are **jurisdiction‑neutral**:

- `REGULATORY_COPILOT_SYSTEM_PROMPT`
- `GLOBAL_SYSTEM_PROMPT`
- `SYSTEM_PROMPT` used by `/api/chat`

They describe:

- The role of the assistant as a **regulatory research copilot**.
- Strong safety and non‑advice constraints.
- How to use graph context and timelines.

Jurisdiction and persona specifics are injected via **prompt aspects**, not hardcoded into these base prompts.

### 6.2 Prompt Aspects

Prompt building uses an aspect/interceptor pattern (in `reg-intel-prompts`), roughly:

- `jurisdictionAspect` – adds jurisdiction context based on `profile.jurisdictions`.
- `agentContextAspect` – adds agent identity and domain description.
- `profileContextAspect` – adds persona info (e.g. single director, advisor).
- `disclaimerAspect` – ensures non‑advice disclaimer and safety language is always present.
- `additionalContextAspect` – optional extra hints or context.

APIs:

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

All agents and LLM calls **must** use these builders instead of hand‑concatenating system prompts.

### 6.3 Dynamic Profile Tags

Profile tags are constructed dynamically from persona and jurisdiction, e.g.:

- `PROFILE_SINGLE_DIRECTOR_IE`
- `PROFILE_SINGLE_DIRECTOR_MT`

`getProfileTagId()` encapsulates this logic, ensuring:

- No hardcoded `PROFILE_SINGLE_DIRECTOR_IE` assumption.
- Easy extension to new personas and jurisdictions.

These tags are used in the graph (e.g. `:ProfileTag` nodes) and in routing logic.

---

## 7. Graph Layer – Memgraph & GraphRAG

### 7.1 GraphClient Abstraction

The app talks to Memgraph through a **typed GraphClient**:

```ts
interface GraphClient {
  getRulesForProfileAndJurisdiction(...): Promise<...>;
  getNeighbourhood(...): Promise<...>;
  getMutualExclusions(...): Promise<...>;
  getTimelines(...): Promise<...>;
  getCrossBorderSlice(...): Promise<...>;
}

function createMemgraphGraphClient(config: {
  uri: string;
  username?: string;
  password?: string;
}): GraphClient;
```

This client uses Memgraph’s Bolt/HTTP interface directly. MCP may still wrap Memgraph for certain LLM tool‑calling scenarios, but **core app graph queries use GraphClient directly**.

### 7.2 Schema Overview (Summary)

The graph schema continues to include:

- Node labels like `:Statute`, `:Section`, `:Benefit`, `:Relief`, `:Condition`, `:Timeline`, `:Case`, `:Guidance`, `:EURegulation`, `:EUDirective`, `:ProfileTag`, `:Jurisdiction`.
- Edge types like `CITES`, `REFERENCES`, `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `IMPLEMENTED_BY`, `INTERPRETS`, `APPLIES_TO`.

The exact details remain in the graph schema spec documents.

### 7.3 GraphRAG Retrieval

Agents use a GraphRAG‑style flow:

1. Build queries based on:
   - Jurisdictions.
   - Profile tags.
   - Keywords/entities extracted from the user question.
2. Retrieve a subgraph of relevant rules, benefits, reliefs, and cases.
3. Compress that subgraph into a structured representation passed to the LLM.
4. Use the LLM to explain the interactions and implications.

The graph is **seeded** from static ingestion jobs and **enriched on demand** when agents find gaps.

---

## 8. WebSocket Graph Streaming

To support a live, scalable graph UI:

- A REST endpoint (e.g. `GET /api/graph`) returns an initial subgraph snapshot.
- A WebSocket endpoint (e.g. `GET /api/graph/stream`) sends **incremental graph patches**.

Patch format (conceptual):

```json
{
  "type": "graph_patch",
  "timestamp": "2025-11-24T12:00:00Z",
  "nodes_added": [...],
  "nodes_updated": [...],
  "nodes_removed": [...],
  "edges_added": [...],
  "edges_removed": [...]
}
```

The frontend:

- Loads the initial snapshot via REST.
- Subscribes to WS patches and applies them in memory.
- Filters patches based on current view (jurisdictions, profile) to avoid clutter.

This design keeps bandwidth and memory usage manageable as the graph grows.

---

## 9. Timeline & Exclusion Engine

A timeline/exclusion utility module (used by agents via `TimelineEngine`) provides:

- Date arithmetic helpers.
- Conversion of `:Timeline` nodes and properties (e.g. `{ years: 4 }`) into concrete date ranges.
- Convenience helpers, e.g.:
  - `isWithinLookback(transactionDate, lookbackNode, now)`
  - `lockInEndDate(lockInNode, triggeringEventDate)`

Agents rely on this to answer questions like:

- “If I claim X now, which other reliefs become unavailable, and for how long?”
- “If I delay until next year, what changes?”

The LLM is instructed (via prompt aspects) to:

- Always mention relevant time windows and mutual exclusions when they exist in the graph.
- Avoid making prescriptive recommendations about exact timing.

---

## 10. MCP, E2B & External Data Ingestion

### 10.1 MCP Gateway & E2B Usage

MCP remains part of the ecosystem, mainly for **external data and tools**, not for core graph queries:

- `legal-search-mcp` – wraps external legal/document search APIs (Revenue, gov.ie, eur-lex, etc.).
- `llm-mcp` – optional wrapper around certain LLM providers if needed.
- `memgraph-mcp` – may be used for ad‑hoc LLM tool‑calling scenarios, but not the main path.

E2B sandboxes can host ingestion or simulation processes that:

- Call MCP tools to fetch or parse external data.
- Upsert new nodes/edges into Memgraph via GraphClient or Memgraph MCP.

### 10.2 Ingestion & Change Tracking

Ingestion flows:

- **Initial seeding** – parse key statutes, welfare rules, EU instruments, and guidance into Memgraph.
- **On‑demand enrichment** – when queries reveal gaps, use MCP tools to fetch relevant docs and extend the graph.
- **Change monitoring** – background processes watch:
  - Finance Acts, Revenue eBriefs, DSP updates.
  - Pensions Authority guidance, TAC/Court decisions.
  - EU regulations and CJEU cases.

Each detected change is mapped into new/updated nodes and edges with links to affected rules and profile tags.

---

## 11. Privacy, Non‑Advice & Compliance

The architecture enforces a strict **research‑only, non‑advice** stance and is designed for EU privacy expectations:

- **Non‑advice**:
  - Prompts and responses always emphasize that the system is informational only.
  - Agents recommend consulting Revenue, DSP, Pensions Authority, or qualified advisors.
- **Data protection**:
  - Egress guard redacts PII and sensitive financial figures.
  - Memgraph stores **rules and relationships**, not user identities.
  - Chat logs and profiles, if stored, reside in the host app’s data layer (e.g. Supabase) with its own access controls and auditing.
- **LLM egress control**:
  - Tenant policies (`allowRemoteEgress`) define whether external LLM APIs may be used.
  - For strict tenants, all LLM calls use local/OSS models inside EU‑controlled infra.

This makes the engine safe to embed in EU‑oriented SaaS products aiming for GDPR and SOC2 alignment.

---

## 12. Extensibility & Reuse

The architecture is intentionally modular so it can be reused and extended:

- **Engine vs demo app**:
  - `apps/demo-web` – a reference Next.js UI for chat and graph visualisation.
  - `packages/reg-intel-*` – engine packages that can be imported into other projects.
- **New domains & jurisdictions**:
  - Add new agents (e.g. `MT_Tax_Agent`, `DE_SocialSecurity_Agent`).
  - Extend graph schema with new node/edge types as needed.
  - Ingest new data sources and connect them via MCP/ingestion jobs.
- **Host app integration**:
  - Other Next.js/Supabase apps instantiate a `ComplianceEngine` and mount their own `/api/reg-intel` endpoint using a small adapter.
  - They can reuse or customise LlmRouter, GraphClient, and egress guard.

At its core, the system remains:

- **One chat interface** for users and advisors.
- **One regulatory graph** that encodes complex rule interactions.
- **One composable engine** that can be dropped into multiple EU‑focused compliance products.

