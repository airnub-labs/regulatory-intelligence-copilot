# Changes & Architecture Decisions – Regulatory Intelligence Copilot

This document captures the **recent changes already implemented** and the **new architecture decisions** that should guide future work on the `regulatory-intelligence-copilot` repo (forked from `rfc-refactor`).

---

## 1. Implemented Changes

### 1.1 Jurisdiction‑Neutral System Prompts with Country‑Specific Expert Agents

**Goal:** Make the **core system prompts jurisdiction‑neutral**, while still supporting **jurisdiction‑specific expert agents** (e.g. Ireland‑focused agents) and future agents for other countries.

**Changes made**

- **Made jurisdiction‑neutral:**
  - `REGULATORY_COPILOT_SYSTEM_PROMPT` in `llm/llmClient.ts`.
  - `GLOBAL_SYSTEM_PROMPT` in `GlobalRegulatoryComplianceAgent.ts`.
  - `SYSTEM_PROMPT` in `apps/web/src/app/api/chat/route.ts`.

- **New helper:**
  - `buildSystemPrompt(jurisdictions?: string[])` – builds a jurisdiction‑aware system prompt by:
    - Starting from a neutral base prompt.
    - Adding context such as: _"The user is primarily interested in rules from: MT"_ when jurisdiction info is available.

- **Updated logic:**
  - `getProfileTagId()` now **constructs profile tags dynamically** from persona + jurisdiction, e.g.:
    - `PROFILE_SINGLE_DIRECTOR_IE`
    - `PROFILE_SINGLE_DIRECTOR_MT`
  - `buildGlobalSystemPrompt()` now uses **jurisdiction context from the user profile** instead of hardcoded Ireland assumptions.

- **Kept intentionally country‑specific:**
  - `SingleDirector_IE_SocialSafetyNet_Agent` remains an **Ireland‑specific expert agent**, so references to Irish rules in that agent are still hardcoded and appropriate.

**How it works**

When a user provides their jurisdiction (via profile or context):

1. The jurisdiction list is passed into `buildSystemPrompt(jurisdictions)`, which augments the otherwise‑neutral system prompt with hints like:  
   _"The user is primarily interested in rules from: MT"_.
2. `getProfileTagId()` constructs the appropriate profile tag dynamically, e.g. `PROFILE_SINGLE_DIRECTOR_MT` instead of a previously hardcoded `PROFILE_SINGLE_DIRECTOR_IE`.
3. The orchestrator/agents:
   - Route to jurisdiction‑specific expert agents when available (e.g. Ireland social safety net agent).
   - Fall back to a **global regulatory compliance agent** that still receives jurisdiction context for unsupported jurisdictions.

This makes it easy to add new agents like `MT_Tax_Agent` or `DE_SocialSecurity_Agent` in the future **without changing the core architecture**.

---

### 1.2 Prompt Aspects for Composable Prompt Building

**Goal:** Avoid repeatedly hand‑building system prompts and instead use an **aspect/interceptor pattern** for prompts. This matches the "Java aspects" idea and keeps prompts consistent, composable, and privacy‑aware.

**Changes made**

- **New module:** `aspects/promptAspects.ts`

- **Reusable prompt aspects:**
  - `jurisdictionAspect`
    - Adds jurisdiction context based on user location / company registration.
  - `agentContextAspect`
    - Adds agent‑specific info (agent ID, description, role of the agent).
  - `profileContextAspect`
    - Adds user profile info, such as persona type (e.g. single‑director, contractor).
  - `disclaimerAspect`
    - Ensures that the **non‑advice disclaimer** is always present in the system prompt.
  - `additionalContextAspect`
    - Adds custom context strings for special cases or temporary experiments.

- **API functions:**
  - `buildPromptWithAspects(basePrompt, options)`
    - Builds a prompt with the default aspect chain.
  - `createPromptBuilder(aspects)`
    - Creates a custom builder with a specific ordered list of aspects.
  - `createCustomPromptBuilder(basePrompt, aspects)`
    - Creates a builder for a specific base prompt with a given aspect chain.

**Usage example**

```ts
// Simple usage with defaults
const prompt = await buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, {
  jurisdictions: ['IE', 'MT'],
  agentId: 'MyAgent',
  profile: { personaType: 'single-director' },
});

// Custom aspect chain
const customBuilder = createPromptBuilder([
  jurisdictionAspect,
  myCustomAspect,  // add your own aspects
]);

const result = await customBuilder({
  basePrompt: '...',
  jurisdictions: ['DE'],
});
```

This allows new aspects (e.g. for specific compliance requirements, new jurisdictions, safety filters) to be added **without modifying existing client code**—they are composed into the aspect chain instead of being hardcoded into each call site.

---

## 2. Agreed Architecture Changes (To Be Implemented)

The following are **design decisions** that should be implemented in upcoming PRs.

### 2.1 Live Graph via WebSockets + Incremental Updates

**Decision:**

- Upgrade the **graph visualisation in the UI** to use **WebSockets** instead of polling.
- Because the regulatory graph can become very large, the **WS channel should send only incremental updates** (patches), *not* the full graph on every message.
- Keep the existing **REST graph endpoint** for:
  - Initial full/subgraph load.
  - Testing and debugging.

**Planned behaviour:**

- On initial load, the UI will:
  - Call `GET /api/graph` (or similar) to load the initial relevant subgraph (e.g. nodes/edges for particular jurisdictions and persona).
  - Render this snapshot in the graph UI.
- Then it will:
  - Open a WebSocket connection to something like `/api/graph/stream`.
  - Receive **patch events**, e.g.:

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

  - Apply patches incrementally to the in‑memory graph representation.

This preserves **performance and scalability** as the graph grows, while still giving users a **live, reactive view** of regulatory changes and new ingested rules/cases.

---

### 2.2 LLM Provider–Agnostic Architecture with Local/OSS Options (EU‑friendly)

**Decision:**

To meet EU regulatory and privacy expectations, especially for larger customers:

- The architecture must support **any LLM provider and model**, including:
  - Remote providers (e.g. OpenAI, Groq, Anthropic, Mistral).
  - **Open‑source models** (e.g. Llama, Mistral) running locally or in self‑hosted cloud infrastructure.
- It must be possible to configure some tenants / environments so that **sensitive data never leaves the app platform / own cloud / EU region**.

**Key design points:**

- Introduce a **provider‑neutral LLM interface**:

  ```ts
  interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }

  interface LlmCompletionOptions {
    model: string;   // e.g. "openai:gpt-4.1", "local:llama-3-8b"
    task?: string;   // e.g. "main-chat", "egress-guard", "pii-sanitizer"
    temperature?: number;
    maxTokens?: number;
  }

  interface LlmClient {
    chat(messages: LlmMessage[], options: LlmCompletionOptions & { tenantId: string }): Promise<string>;
  }
  ```

- Implement multiple **backends** behind this interface:
  - `OpenAiResponsesClient` – uses **OpenAI Responses API** (`/v1/responses`), not legacy chat completions.
  - `GroqLlmClient` – current Groq integration.
  - `LocalHttpLlmClient` – talks to e.g. vLLM/Ollama/llamacpp running on a local or self‑hosted HTTP endpoint.

- Introduce an `LlmRouter` that:
  - Chooses the appropriate backend + model **per tenant and per task**.
  - Respects tenant policies like `allowRemoteEgress = false`.

This allows highly privacy‑sensitive EU customers to use **local‑only OSS models**, while others can opt into OpenAI, Groq, etc., without changing application code.

---

### 2.3 Fine‑Grained Model & Provider Selection (Per Task, Per Tenant)

**Decision:**

- LLM model and provider must be configurable **not just globally**, but for **small, specialised tasks** (and per tenant), such as:
  - `task = "egress-guard"` – a small, efficient model for continuous monitoring.
  - `task = "pii-sanitizer"` – a tiny model focused on PII detection and redaction.
  - `task = "main-chat"` – a larger, more capable model.
- Changing model/provider for any of these tasks **must not require refactoring client code or redeploying the app**.

**Design outline:**

- Define task/tenant policies, e.g.:

  ```ts
  interface LlmTaskPolicy {
    task: string;           // e.g. "main-chat", "egress-guard", "pii-sanitizer"
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

- `LlmRouter` will:
  - Look up `TenantLlmPolicy` (from DB/config) based on `tenantId`.
  - Select a `task`‑specific policy when provided (e.g. `task="egress-guard"`).
  - Route to the correct backend + model transparently.

- The **application code and agents** will:
  - Call `llmRouter.chat(messages, { tenantId, task: 'egress-guard' })` instead of hardcoding models.

This ensures that model/provider/size can be changed through **configuration** (e.g. via admin UI or config files) rather than code updates.

---

### 2.4 Memgraph Access – Direct Graph Client Instead of MCP for Core App

**Decision:**

- For this product, **Memgraph should be accessed via a dedicated TypeScript GraphClient**, not via an MCP adapter from the Next.js app.
- MCP remains useful for **external data sources** (e.g. Revenue, TAC, EU law, etc.), but the core app’s graph queries should be direct.

**Reasons:**

- Direct access:
  - Reduces latency and complexity (fewer hops).
  - Makes it easier to support streaming/patch queries for the WebSocket graph view.
  - Keeps graph query semantics strongly typed and under app control.

**Plan:**

- Introduce `GraphClient` abstraction (e.g. in `reg-intel-graph`):

  ```ts
  interface GraphClient {
    getRulesForProfileAndJurisdiction(...): Promise<...>;
    getNeighbourhood(...): Promise<...>;
    getMutualExclusions(...): Promise<...>;
    getTimelines(...): Promise<...>;
    getCrossBorderSlice(...): Promise<...>;
  }

  function createMemgraphGraphClient(config: { uri: string; username?: string; password?: string }): GraphClient { ... }
  ```

- **Next.js API routes, agents, and the sandbox** will talk only to `GraphClient`, not directly to Memgraph or Memgraph MCP.
- Memgraph MCP may still be used for **LLM tool‑calling scenarios**, but it is not the primary path for core app graph queries.

---

### 2.5 Reusable Engine Architecture for Other Next.js/Supabase SaaS Apps

**Decision:**

- Architect the repo so that the regulatory intelligence functionality can be **imported and reused** in other Next.js projects (e.g. an accessible, multi‑locale, GDPR/SOC2‑compliant Supabase SaaS platform) **without re‑implementing core logic**.

**High‑level plan:**

- Split repo into **engine packages** and a **demo app**, for example:

  ```txt
  apps/
    demo-web/                # Current Next.js demo app (chat UI, graph UI)

  packages/
    reg-intel-core/          # Agents, orchestrator, core types
    reg-intel-graph/         # Memgraph client + schema helpers
    reg-intel-llm/           # LlmRouter, providers, egress guard integration
    reg-intel-prompts/       # Prompt aspects, base system prompts
    reg-intel-next-adapter/  # Thin Next.js adapters (API handler factories)
  ```

- Define a stable **ComplianceEngine** interface in `reg-intel-core`:

  ```ts
  interface UserProfileContext {
    tenantId: string;
    persona: string;           // e.g. 'single-director'
    jurisdictions: string[];   // e.g. ['IE', 'EU']
    locale?: string;           // e.g. 'en-IE'
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
    disclaimerKey: string;     // i18n key for host app
  }

  interface ComplianceEngine {
    handleChat(request: ChatRequest): Promise<ChatResponse>;
  }
  ```

- Provide a helper to create the engine:

  ```ts
  function createComplianceEngine(deps: {
    llm: LlmClient;
    graph: GraphClient;
    timeline: TimelineEngine;
    egressGuard: EgressGuard;
  }): ComplianceEngine;
  ```

- Provide a **Next.js adapter** (`reg-intel-next-adapter`) with something like:

  ```ts
  export function createChatRouteHandler(engine: ComplianceEngine) {
    return async function POST(req: NextRequest): Promise<NextResponse> {
      const body = await req.json();
      const profile = extractProfileFromAuthOrBody(body);
      const response = await engine.handleChat({ messages: body.messages, profile });
      return NextResponse.json(response);
    };
  }
  ```

This allows any other Next.js/Supabase SaaS app to:

- Install the engine packages (or add the repo as a workspace).
- Instantiate a `ComplianceEngine` with its own LLM/graph configs.
- Mount a `/api/reg-intel` route via `createChatRouteHandler(engine)`.

**Privacy & compliance alignment:**

- Memgraph only stores **rules and relationships**, never user data.
- The engine itself is **stateless from a GDPR perspective**; logging and persistence of conversations happen in the host app (e.g. Supabase) with its own access controls and auditing.
- LLM routing and data egress are controlled via the `LlmRouter` + tenant policies, supporting EU‑only local models for sensitive clients.

---

This document should be treated as the **canonical summary** of the recent prompt/agent changes and the agreed next architecture steps. Future PRs should reference this when implementing WebSocket graph streaming, LLM router abstractions, direct Memgraph access, and the package/app split for reuse in other Next.js/Supabase projects.

