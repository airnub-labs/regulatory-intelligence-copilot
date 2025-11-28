# Regulatory Intelligence Copilot

> **Version:** Architecture v0.6  
> **Status:** Work‑in‑progress research tool – not legal/tax/welfare advice.

A **chat‑first, graph‑powered regulatory research copilot** for complex tax, welfare, pensions, and cross‑border rules (starting with **Ireland / UK / EU / CTA**).

The system combines:

- A **shared, PII‑free regulatory rules graph** in Memgraph.  
- A **Timeline Engine** for lookbacks, lock‑ins, deadlines, and effective windows.  
- **Agents** that orchestrate LLMs, graph queries, and tools.  
- A **self‑populating concept layer** that learns regulatory concepts (VAT, VRT, benefits, reliefs) from normal chat.  
- A **Next.js demo shell** with chat + graph views, backed by Supabase for tenants, users, conversations, and conversation context.

The goal is to help people and professionals **understand how rules interact** – across time and jurisdictions – while never pretending to replace qualified advisors.

> ⚠️ **Important:** The copilot is a **research assistant only**. It does *not* provide legal, tax, or welfare advice. Always consult qualified professionals and official sources.

---

## 1. Motivation

Modern tax and welfare systems are:

- **Fragmented** – statutes, regulations, guidance notes, calculators, and case law live in different places.  
- **Temporal** – rules change over time; eligibility can depend on what you did years ago.  
- **Profile‑dependent** – company directors, self‑employed, PAYE workers, cross‑border commuters all have different pathways.  
- **Cross‑jurisdictional** – IE / UK / NI / IM / EU / CTA / GI / AD and bilateral agreements complicate everything.

People end up:

- Reading the same documents repeatedly.  
- Doing mental graph work to connect obligations, benefits, and timing.  
- Maintaining personal notes that cannot be easily reused or audited.

The Regulatory Intelligence Copilot aims to:

- Represent this complexity as a **shared rules graph**.  
- Use a **Timeline Engine** to make time‑based constraints explicit.  
- Use **agents + LLMs** to query and explain that graph in chat form.  
- **Self‑populate** over time so that every conversation helps enrich the graph.

---

## 2. High‑Level Architecture (v0.6)

v0.6 is built around a few key ideas:

1. **Shared Regulatory Rules Graph (Memgraph)**  
   - Stores rules, sections, benefits, reliefs, conditions, timelines, guidance, cases, EU instruments, profile tags, and change events.  
   - Contains a **concept layer** (`:Concept` + `:Label`) that anchors SKOS‑like regulatory concepts (e.g. `tax:ie:vat`, `vehicle:ie:vrt`, `import:ie:vehicle:japan`).  
   - Is **write‑guarded** by `GraphWriteService` + Graph Ingress Guard and is strictly **PII‑free**.

2. **Timeline Engine (v0.2)**  
   - Interprets `:Timeline` nodes and edges for lookbacks, lock‑ins, deadlines, effective windows, and usage frequency.  
   - Used by agents to answer “when” and “how long” questions without hard‑coding time rules.

3. **Agents & Compliance Engine**  
   - A **Global Regulatory Copilot Agent** orchestrates chat, delegates to domain/jurisdiction experts, and coordinates what‑if/scenario agents.  
   - Agents query the rules graph via `GraphClient`, invoke the Timeline Engine, and call LLMs via a provider‑agnostic **LlmRouter**.  
   - A **Compliance Engine** in `reg-intel-core` manages:
     - Chat flows and streaming,  
     - Agent selection and prompt assembly (via prompt aspects),  
     - Concept capture from main chat,  
     - Conversation Context (per conversation, per tenant).

4. **Concept Capture & Self‑Populating Graph (v0.6)**  
   - Every main chat call includes a `capture_concepts` tool with a SKOS‑like JSON schema.  
   - The LLM:
     - Streams user‑visible answer text, and  
     - Emits a structured concept payload for regulatory concepts mentioned in the conversation.  
   - The Compliance Engine:
     - Resolves concepts into `:Concept` nodes via a canonical concept resolver + `GraphWriteService`.  
     - Attaches `:Label` nodes for synonyms, and links concepts to rule nodes (`ALIGNS_WITH`).  
     - Updates `ChatResponse.referencedNodes` and `ConversationContext.activeNodeIds` so answers are evidence‑linked and context‑aware.  
   - If a concept is new or sparse, the engine can queue **ingestion jobs** (MCP + HTTP tools) to fetch official documents (e.g. Revenue VAT/VRT pages) and extract rules into the graph.

5. **Conversation Context (v0.6)**  
   - Conversation Context is stored in Supabase/app DB (per tenant, per conversation).  
   - It tracks a small set of active graph node IDs (`activeNodeIds`), usually concept IDs and key rule nodes referenced in answers.  
   - A prompt aspect turns this into a short “concepts in play” summary injected into subsequent LLM calls.  
   - This provides a **stable, graph‑backed conversational memory** without ever storing conversation text or PII in Memgraph.

6. **Scenario Engine & What‑If (early v0.6)**  
   - Scenario Engine (spec’d separately) defines how to represent hypothetical fact patterns and compare outcomes over time.  
   - Scenario/what‑if agents use it to evaluate alternative paths (“import a car now vs next year”, “claim benefit A vs B”), always backed by the rules graph and Timeline Engine.  
   - Scenario definitions and user‑specific inputs live in Supabase/app DB, **not** in Memgraph.

7. **Shell Apps (Next.js 16 / React 19 / Tailwind v4)**  
   - `apps/demo-web` is a demo shell that uses the engine packages.  
   - It exposes `/api/chat` and graph endpoints, renders chat and graph visualisations, and handles auth/tenants via Supabase.  
   - The long‑term goal is to use the same engine packages in multiple shells (SaaS products, internal tools) without rewriting the core.

---

## 3. Packages & Responsibilities

The monorepo is organised around domain responsibilities:

### 3.1 `packages/reg-intel-core`

**Compliance Engine and chat orchestration**.

- Implements `/api/chat`‑facing logic (in the app, usually via a thin wrapper).  
- Selects the appropriate agent(s) based on profile, jurisdictions, and question type.  
- Applies prompt aspects (jurisdiction, agent, persona, disclaimers, Conversation Context).  
- Calls `LlmRouter.stream` with:
  - Main chat messages, and  
  - The `capture_concepts` tool definition for concept capture.  
- Handles streaming:
  - Forwards `text` chunks to the client immediately.  
  - Intercepts `tool` chunks (e.g. `capture_concepts`) and routes them to the concept handler.  
- Updates:
  - `ChatResponse.referencedNodes` (graph nodes used in the answer).  
  - `ConversationContext.activeNodeIds` (stored in Supabase/app DB).  
- Delegates scenario/what‑if questions to Scenario Engine and specialist agents.

### 3.2 `packages/reg-intel-graph`

**Memgraph infrastructure and write guarding**.

- `GraphClient` for read‑only queries (used by agents and Timeline Engine).  
- `GraphWriteService` as the only write path.  
- `GraphIngressGuard` enforcing:
  - Allowed labels and relationships (incl. v0.6 `:Concept`, `:Label`, `:HAS_ALT_LABEL`, `:ALIGNS_WITH`).  
  - Property whitelists and PII stripping.  
- Concept support:
  - Creating / merging `:Concept` nodes and `:Label` nodes from SKOS‑like payloads.  
  - Linking concepts to rules via `:ALIGNS_WITH` and sources via `:HAS_SOURCE` / `:DERIVED_FROM`.  
- `GraphChangeDetector` and streaming patches for graph UI updates.

### 3.3 `packages/reg-intel-llm`

**LLM router, providers, and egress guard**.

- Provider‑agnostic `LlmRouter` interface.  
- Adapters for OpenAI Responses, Groq, and local models.  
- Streaming interface that emits:

  ```ts
  type LlmStreamChunk =
    | { type: 'text'; delta: string }
    | { type: 'tool'; name: string; argsJson: unknown }
    | { type: 'error'; error: Error };
  ```

- `capture_concepts` tool definition (SKOS‑inspired JSON schema).  
- Egress Guard integration for all outbound calls (LLM, MCP, HTTP).  
- Tenant/task policies to control which models/providers are used and whether remote egress is allowed.

### 3.4 `packages/reg-intel-prompts`

**Prompt aspect system**.

- Aspects for:
  - Jurisdiction context (primary + secondary).  
  - Agent identity and role.  
  - Persona/profile (e.g. single‑director IE LTD).  
  - Standard disclaimers.  
  - Additional context (conversation context summary, feature flags, etc.).

- `conversationContextAspect` summarises `activeNodeIds` into a short description of “concepts in play” (using data from Memgraph via `reg-intel-graph`).

### 3.5 `apps/demo-web`

**Next.js demo shell**.

- `/api/chat` – thin wrapper around Compliance Engine.  
- `/api/graph` + graph streaming – thin wrappers around `reg-intel-graph`.  
- Chat UI – React 19 + Tailwind v4, streaming answers, showing referenced nodes, jurisdictions, and uncertainty.  
- Graph UI – subscribes to graph patch stream and highlights `referencedNodes` from chat responses.  
- Supabase integration for tenants, users, conversations, and Conversation Context.

---

## 4. Data & Privacy Boundaries

v0.6 keeps strict boundaries between **global rules** and **tenant/user state**:

### 4.1 Memgraph (Global Rules Graph)

Contains only:

- Public/regulatory knowledge: statutes, sections, benefits, reliefs, conditions, timelines, guidance, cases, EU regs/directives, treaties, regime nodes, profile tags, concept nodes (`:Concept`, `:Label`), and change events.  
- Algorithm‑derived metadata (communities, centrality scores, etc.).

Must **never** contain:

- User PII: names, emails, addresses, PPSNs, company IDs, bank details.  
- Tenant IDs, conversation IDs, raw message text.  
- Concrete user scenario data (“Alan imported a car in 2024 for €X”).

### 4.2 Supabase / Application Database

Contains:

- Tenants, users, auth.  
- Conversations and message history.  
- Conversation Context (e.g. `activeNodeIds`, scenario metadata).  
- Scenario inputs and results (what‑if), if implemented.

Is **never** replicated into Memgraph.

### 4.3 Ingress & Egress Guards

- **Graph Ingress Guard** – enforces schema and PII rules for Memgraph writes.
- **Egress Guard** – inspects outbound payloads (LLMs, MCP, HTTP) for:
  - PII and sensitive data.  
  - Tenant egress policies.  
  - Potential routing to additional guard models.

---

## 5. Getting Started (Dev)

> **Note:** The exact scripts/commands may differ in your local setup; this is a conceptual quickstart. Keep it aligned with your actual `package.json` / devcontainer setup.

1. **Prerequisites**
   - Node.js **24 LTS**.  
   - pnpm (preferred) or npm.  
   - Docker (for Memgraph, Supabase, and other services).  
   - Access to OpenAI/Groq/local model endpoints if you want LLMs.

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Start infrastructure (local)**

   Common pattern (adjust for your repo):

   ```bash
   docker compose up -d   # Memgraph, Supabase, etc.
   ```

4. **Run dev shell app**

   ```bash
   pnpm dev   # or pnpm dev --filter apps/demo-web
   ```

5. **Open the app**

   Visit the printed URL (typically `http://localhost:3000`) and try:

   - Asking about **VAT in Ireland**.  
   - Asking about **VRT and importing a car from Japan**.  
   - Watching how answers start to link to graph nodes (`referencedNodes`) and how the graph view evolves.

---

## 6. Working on the Project

When you change or add features:

1. **Identify the affected package(s)** (core, graph, llm, prompts, demo web).  
2. **Re‑read relevant specs** (`architecture_v_0_6`, `graph_schema_v_0_6`, concept/Conversation Context/scenario specs).  
3. **Follow the coding agent prompt** (`PROMPT_v_0_6.md`) for boundaries and invariants.  
4. **Keep changes incremental** and aligned with `roadmap_v_0_6`.  
5. **Update docs** if behaviour or architecture changes.

---

## 7. Roadmap Snapshot (v0.6‑aligned)

A simplified snapshot (see `roadmap_v_0_6.md` for detail):

- **Phase 1–2** – Core chat + graph integration
  - IE‑focused tax/welfare domain.  
  - Basic graph queries, Timeline Engine integration.  
  - Demo chat + graph UI.

- **Phase 3** – Graph streaming & evidence
  - GraphChangeDetector → patch streaming to the UI.  
  - `referencedNodes` wired up from agents → UI highlights rule nodes used in answers.

- **Phase 4** – Concept capture & Conversation Context (v0.6)
  - `capture_concepts` tool wired into main chat.  
  - SKOS‑like `:Concept` + `:Label` nodes in Memgraph.  
  - Conversation Context (`activeNodeIds`) and prompt aspects.  
  - Auto‑ingestion jobs keyed by concepts to enrich sparse areas.

- **Phase 5+** – Scenario Engine & cross‑border expansion
  - Scenario/what‑if agent flows.  
  - Richer cross‑border regimes (IE/UK/NI/IM/EU/CTA/GI/AD).  
  - More robust graph algorithms for retrieval and prioritisation.

---

## 8. Disclaimer

This project is intended as a **research and exploration tool** for understanding regulatory systems. Nothing produced by this system constitutes legal, tax, welfare, or financial advice. Rules may change, be interpreted differently, or apply differently to individual situations.

> Always consult relevant authorities and qualified professionals before making decisions based on any outputs from this system.

---

**End of README_v_0_6**

