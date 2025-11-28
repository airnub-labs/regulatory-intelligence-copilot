# Regulatory Intelligence Copilot – Architecture (v0.6)

> **Goal:** A chat‑first, graph‑backed regulatory research copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal/tax advice or leaking sensitive data.
>
> **Scope of v0.6:** Extends v0.4/v0.5 by:
> - Keeping the **Node 24 / Next 16 / React 19 / Tailwind v4** baseline.
> - Preserving the **shared Memgraph rules graph** and strict privacy boundaries.
> - Incorporating the **v0.5 UI architecture** (Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK v5 on the frontend only).
> - Making the backend architecture **self‑contained** (no longer defers to `architecture_v_0_4.md`).
> - Adding explicit support for **self‑populating graph concepts** from main chat (SKOS‑style concepts + tools).
> - Introducing **conversation context** and **referenced node tracking** as first‑class architectural concerns.
> - Recognising future **Scenario Engine** and **What‑If simulations** as supported extension points.

---

## 0. Normative References

This architecture sits on top of, and must remain consistent with, the following specs:

### Core Graph & Engine Specs

- `docs/specs/graph_schema_v_0_4.md`
- `docs/specs/graph_schema_changelog_v_0_4.md`
- `docs/specs/graph_algorithms_v_0_1.md`
- `docs/specs/timeline_engine_v_0_2.md`
- `docs/specs/regulatory_graph_copilot_concept_v_0_4.md`
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/graph_ingress_guard_v_0_1.md`
- `docs/specs/egress_guard_v_0_2.md`

### New / Refined Specs Introduced by v0.6

- `docs/specs/concept_capture_from_main_chat_v_0_1.md`  
  (SKOS‑inspired concept capture via LLM tools and self‑population of the rules graph.)
- `docs/specs/conversation_context_spec_v_0_1.md`  
  (Conversation‑level context, active graph node IDs, and how they are persisted and applied.)
- `docs/specs/scenario_engine_v_0_1.md`  
  (Initial design for a Scenario / What‑If Engine built on top of the rules graph + timeline.)

### Project‑Level Docs

- `docs/architecture_v_0_4.md` (historic, now superseded by this document as the canonical architecture summary)
- `docs/architecture_v_0_5.md` (UI‑focused extension, now folded into v0.6)
- `docs/decisions_v_0_5.md`
- `docs/roadmap_v_0_4.md`
- `docs/node_24_lts_rationale.md`
- `AGENTS.md` (agent landscape)
- `PROMPTS.md` (coding‑agent prompts and implementation guidance)

Where there is ambiguity, **specs and decision docs take precedence** over this document.

---

## 1. High‑Level Architecture

### 1.1 System Overview

The system consists of:

1. **Web app** (`apps/demo-web`)
   - Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, Radix UI.
   - Vercel AI SDK v5 used **only** in the UI layer to talk to backend LLM endpoints.
   - Primary UX:
     - Chat interface for regulatory questions.
     - Live regulatory graph view (Memgraph‑backed).

2. **Compliance Engine** (reusable packages)
   - Core logic in `packages/reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`.
   - Implements the regulatory copilot behaviour:
     - Agent selection and orchestration.
     - LLM routing and guardrails.
     - Graph queries and self‑population.
     - Timeline reasoning.
   - Designed to be reused by other Next.js/Supabase SaaS apps via a thin adapter.

3. **Shared Rules Graph (Memgraph)**
   - Memgraph Community + MAGE as a **single global regulatory knowledge graph**.
   - Stores public rules, relationships, timelines, jurisdictions, case law, guidance, and their interactions.
   - **Never stores tenant/user‑specific PII**; it is a shared, anonymous rules graph.

4. **LLM + Tooling Layer**
   - `LlmRouter` with pluggable providers (OpenAI Responses, Groq, local/OSS models).
   - Uses OpenAI Responses API (incl. GPT‑OSS models) as a primary reference implementation.
   - All outbound calls (LLM, MCP, HTTP) go through `EgressClient` and the **Egress Guard**.
   - Main‑chat calls can emit **streamed text** for the UI and **structured tool output** for concept capture and other metadata.

5. **Graph Ingress & Ingestion**
   - `GraphClient` for read queries.
   - `GraphWriteService` for all writes, wrapped in **Graph Ingress Guard** aspects:
     - Schema validation.
     - Property whitelisting.
     - PII stripping.
   - Ingestion agents (e.g. MCP/E2B‑based) must upsert rules exclusively via `GraphWriteService`.

6. **Optional E2B + MCP Gateway**
   - E2B sandbox to run heavier or untrusted work.
   - MCP gateway used for:
     - Memgraph read‑only access.
     - External regulatory content (e.g. Revenue, TAC, EU regs) via HTTP.
   - All egress from sandboxes still flows through the **Egress Guard**.

7. **Storage Layer (Host App)**
   - Supabase (or similar Postgres) provides multi‑tenant application storage:
     - Tenants, users, auth.
     - Conversations and messages.
     - Conversation‑level context (active node IDs, flags, scenario state).
   - May store references to graph node IDs, but the graph never stores tenant/user identifiers.

### 1.2 Privacy & Data Boundaries (Summary)

From `data_privacy_and_architecture_boundaries_v_0_1.md`:

- **Memgraph (Rules Graph)**
  - Stores only *public regulatory knowledge*:
    - Jurisdictions, regions, treaties, regimes, rules, benefits, timelines, case law, guidance, and their relationships.
  - **MUST NOT** store:
    - User PII, tenant PII, personal financial data, individual scenarios, or uploaded file contents.

- **Supabase / App DB**
  - Multi‑tenant application data: accounts, subscriptions, settings, saved scenarios.
  - Stores **conversations and conversation context** (e.g. active graph node IDs).
  - May hold references to graph node IDs (e.g. `Rule:VAT_IE`), but there is no back‑reference from the graph to app‑level IDs.

- **E2B Sandboxes**
  - Transient execution environments for code and document processing.
  - User documents are processed here and deleted with the sandbox unless the user explicitly opts into persistent storage.

- **Egress Guard**
  - All outbound calls (LLM, MCP, HTTP) pass through `EgressClient` → egress aspect pipeline.
  - Responsible for:
    - PII / sensitive‑data stripping.
    - Enforcing provider / jurisdiction policies.
    - Optional AI‑based egress review in higher tiers.

---

## 2. Engine Packages & Boundaries

The engine is implemented as a set of reusable packages:

- `reg-intel-core`
  - `ComplianceEngine` (central orchestration entrypoint).
  - Agent registry and selection.
  - Conversation context handling.
  - Integration with timeline engine and scenario engine (where present).

- `reg-intel-graph`
  - `GraphClient` for Memgraph queries.
  - `GraphWriteService` for upserts.
  - `GraphIngressGuard` aspect pipeline for all writes.
  - `GraphChangeDetector` and patch streaming for graph UI.

- `reg-intel-llm`
  - `LlmRouter` and `LlmProvider` abstractions.
  - Provider implementations (OpenAI, Groq, local HTTP models).
  - `EgressClient` + egress aspects.
  - Streaming interface emitting both **text** and **tool** chunks.

- `reg-intel-prompts`
  - Prompt aspect system (jurisdiction, agent, persona, disclaimers, additional context).
  - Standardised system prompts and guardrails.

The **demo web app** depends on these packages but does **not** contain core business logic. This makes it easy to embed the engine in other hosts (Next.js apps, CLI, future SaaS shells).

---

## 3. LLM Routing, Streaming & Concept Capture

### 3.1 LLM Routing & Providers

- The `LlmRouter` decides which provider/model to use based on:
  - Tenant configuration and policies.
  - Task type (main chat vs guard vs ingestion vs PII sanitizer).
- Providers implement a common streaming interface, conceptually:

```ts
interface LlmProviderStreamChunk {
  type: 'text' | 'tool' | 'error';
  delta?: string;            // for type === 'text'
  name?: string;             // for type === 'tool'
  argsJson?: unknown;        // for type === 'tool'
  error?: Error;             // for type === 'error'
}
```

- OpenAI Responses API is wrapped so that:
  - Text deltas become `type: 'text', delta` chunks.
  - Tool/structured output becomes `type: 'tool', name, argsJson` chunks.
  - Errors become `type: 'error', error` chunks.

### 3.2 Main‑Chat + SKOS‑Style Concept Capture

v0.6 makes **concept capture from main chat** a first‑class concern:

- Instead of a separate "entity extraction" task, main chat is responsible for both:
  - Answering the user’s question.
  - Emitting **SKOS‑inspired concept metadata** via a dedicated tool.

- A canonical tool (defined in `concept_capture_from_main_chat_v_0_1.md`) is
  available to the main chat model, e.g. `capture_concepts`:
  - Captures **domain**, **kind**, **jurisdiction**, **prefLabel**, **altLabels**, **definition**, **sourceUrls**.
  - Follows a SKOS‑like structure (prefLabel, altLabels, definition).

- The Compliance Engine:
  - Always registers the `capture_concepts` tool on main chat calls.
  - Uses prompt aspects to instruct the model:
    - "In addition to answering the user, call `capture_concepts` once with any tax/benefit/regulatory concepts you detect."

### 3.3 Streaming Behaviour

The streaming model in v0.6 is:

- **Text chunks (`type: 'text'`)**
  - Passed straight through to the `/api/chat` SSE stream.
  - UI renders them as they arrive (typing effect).

- **Tool chunks (`type: 'tool'`)**
  - Never forwarded to the UI.
  - Interpreted inside `ComplianceEngine`:
    - Tool `name` identifies `capture_concepts` or other tools.
    - `argsJson` contains structured payload (e.g. SKOS concepts).
  - Trigger self‑population, concept resolution, scenario updates, etc.

- **Error chunks (`type: 'error'`)**
  - Abort the stream and emit a safe error message to the UI.

This ensures:

- Streaming UX is preserved.
- Metadata (concepts, references, scenarios) flows through a **server‑side side channel**, not in the user‑visible text.

---

## 4. Self‑Populating Rules Graph (Concept Pipeline)

v0.6 formalises the **self‑populating graph** pattern:

1. **User asks a question** (e.g. "What is the VAT rate in Ireland?").
2. The main chat model:
   - Streams back an answer.
   - Calls `capture_concepts` with SKOS‑like concept payloads, e.g. `VAT_IE`, `VRT_IE`, `IMPORT_VEHICLE_TO_IE`.
3. `ComplianceEngine` receives `capture_concepts` tool output and calls a **Canonical Concept Resolver** in `reg-intel-graph`:

   - Normalises labels and jurisdiction.
   - Checks Memgraph via `GraphClient` for an existing concept node matching `(domain, kind, jurisdiction)`.
   - If exists:
     - Returns its node ID.
     - Optionally enriches altLabels or source references via `GraphWriteService`.
   - If not exists:
     - Creates a new concept node via `GraphWriteService` + `GraphIngressGuard`.
     - Assigns a stable canonical ID (e.g. `tax:ie:vat`).

4. After resolution, `ComplianceEngine` decides whether to trigger **auto‑ingestion**:

   - If the graph already contains rich detail for this concept (rates, timelines, links to legislation), no ingestion is needed.
   - If the concept is missing or sparse:
     - Enqueues an ingestion job (MCP/E2B‑based) that fetches primary sources (e.g. Revenue manuals, TAC decisions) and upserts rule/timeline nodes via `GraphWriteService`.

5. `GraphChangeDetector` watches Memgraph and emits **patches** over the graph streaming endpoint:

   - Graph UI updates with newly created or enriched nodes/edges.
   - Chat UI can show updated referenced nodes or evidence lists.

This pipeline supports the desired behaviour where:

- Each Q&A gradually **enriches** the global rules graph.
- Future questions about VAT, VRT, or imports benefit from the pre‑populated graph rather than ad‑hoc web search alone.

---

## 5. Conversation Context & Referenced Nodes

### 5.1 Chat Response Shape (Conceptual)

The architecture assumes a `ChatResponse` shape similar to:

```ts
interface ChatResponse {
  answer: string;                 // Final answer text (can be streamed)
  referencedNodes: string[];      // Memgraph node IDs used as evidence
  jurisdictions: string[];        // Jurisdictions considered in this answer
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;          // Which stock disclaimer to show
}
```

- `referencedNodes` is now explicitly populated via the concept pipeline and graph queries:
  - Includes IDs of rules/benefits/sections/concepts (e.g. `Rule:VAT_IE`, `Rule:VRT_IE`).
  - Intended for **UI evidence chips** and for syncing with the graph view.

### 5.2 Conversation Context (Backend‑Owned)

v0.6 introduces a backend‑owned **Conversation Context**, defined in `conversation_context_spec_v_0_1.md`:

```ts
interface ConversationContext {
  activeNodeIds: string[];   // Graph node IDs currently in play for this conversation
  // Future: activeScenarios, flags, selected jurisdictions, etc.
}
```

- `ConversationContext` is **not** stored in Memgraph.
- It is persisted in Supabase or an equivalent app DB, keyed by `(tenantId, conversationId)`.

Flow per chat turn:

1. `/api/chat` receives a request for `(tenantId, userId, conversationId)`.
2. `ComplianceEngine` loads `ConversationContext` from a `ConversationContextStore` abstraction.
3. A **prompt aspect** (e.g. `conversationContextAspect`) resolves `activeNodeIds` to short summaries via `GraphClient` and injects them into the system prompt, so the model knows which concepts are already in play.
4. During the LLM call, concept tools and graph queries may identify additional relevant nodes.
5. At the end of the turn, `ComplianceEngine`:
   - Builds `referencedNodes` from resolved concept IDs and other graph lookups.
   - Updates `ConversationContext.activeNodeIds` (union + pruning if needed).
   - Persists the updated context via `ConversationContextStore`.
6. `ChatResponse` is sent back to the UI (streamed answer + final metadata). The frontend remains **dumb** and does not need to round‑trip context explicitly.

This design ensures:

- The engine, not the UI, owns conversation memory.
- Graph concepts recognised in previous turns are automatically available to later turns.
- Multiple UIs can reuse the same engine without bespoke context wiring.

---

## 6. Graph Layer & Streaming

### 6.1 Graph Client & Writes

- `GraphClient` encapsulates Memgraph connections and Cypher queries.
- `GraphWriteService` is the **only** path for writes to Memgraph:
  - Enforces schema through the `GraphIngressGuard` aspect pipeline.
  - Rejects any write that attempts to introduce PII or unapproved properties.
  - Provides higher‑level upsert operations (e.g. `upsertConcept`, `upsertRule`, `upsertTimelineConstraint`).

### 6.2 GraphChangeDetector & Streaming

- `GraphChangeDetector` monitors Memgraph for changes relevant to the current tenant’s view of the rules graph.
- When changes occur (e.g. ingestion creates new nodes/edges):
  - It computes a **patch** (nodes/edges added, removed, or updated).
  - Streams patches over a dedicated endpoint (e.g. `/api/graph/stream`) to subscribed clients.
- The graph UI renders patches incrementally instead of reloading the full graph.

---

## 7. Timeline Engine & Scenario Engine

### 7.1 Timeline Engine (Unchanged in Scope)

- The **Timeline Engine** (`timeline_engine_v_0_2.md`) consumes time‑based graph edges such as `:LOOKBACK_WINDOW` and `:LOCKS_IN_FOR_PERIOD`.
- Given a scenario (sequence of events + dates), it can answer:
  - Whether a rule applies at a given date.
  - When lock‑in periods expire.
  - How lookbacks affect eligibility.
- `ComplianceEngine` integrates it for timing‑sensitive questions (CGT wash rules, PRSI contribution windows, etc.).

### 7.2 Scenario Engine (Future but Supported)

v0.6 recognises a future **Scenario Engine** (`scenario_engine_v_0_1.md`) as a first‑class extension point:

- Models structured "what‑if" scenarios (e.g. importing a car from Japan, changing residency, altering income).
- Uses:
  - Memgraph rules graph for structure and eligibility rules.
  - Timeline Engine for time‑based reasoning.
  - Conversation Context for linking scenarios to ongoing chat.
- The architecture provides hooks for:
  - Scenario definitions and IDs in ConversationContext.
  - Dedicated scenario‑oriented agents that can run simulations and report deltas.

No concrete implementation is mandated by v0.6, but the architecture is explicitly designed to support it without refactoring core layers.

---

## 8. Agents & Prompt Aspects

### 8.1 Engine‑First Agent Design

- `ComplianceEngine` hosts a registry of **specialist agents** and a **Global Regulatory Agent**.
- Agents are configured via:
  - Prompt aspects (jurisdiction, persona/profile, agent role, disclaimers, conversation context).
  - Tool selections (graph queries, timeline engine, concept capture, MCP fetchers).

### 8.2 Prompt Aspect System

- Prompt aspects compose into a single system prompt for each LLM call.
- Key aspects include:
  - **Jurisdiction aspect:** which jurisdictions are in scope.
  - **Agent aspect:** describes the agent’s role and domain.
  - **Persona/profile aspect:** user profile and constraints.
  - **Disclaimer aspect:** non‑advice framing.
  - **Conversation context aspect:** summarises active graph nodes and scenarios.
  - **Additional context aspect:** for ad‑hoc context (feature flags, environment markers).

This keeps prompts consistent, auditable, and easily extended.

---

## 9. UI Architecture (Incorporating v0.5)

v0.6 fully incorporates the UI architecture additions from v0.5.

### 9.1 Frontend Stack

- Next.js 16 (App Router, Turbopack).
- React 19.
- TypeScript 5.9+.
- Tailwind CSS v4 with PostCSS 8 (`@tailwindcss/postcss` plugin).
- shadcn/ui components (copy‑into‑repo model).
- Radix UI primitives for accessible foundations.
- lucide‑react for icons.
- Vercel AI SDK v5 (`ai`, `@ai-sdk/react`) for streaming chat UX on the frontend.
- class‑variance‑authority, `clsx`, and `tailwind-merge` for composable, type‑safe styling.

### 9.2 Chat & Graph Views

- `apps/demo-web/src/app/page.tsx`
  - Main chat interface.
  - Uses AI Elements‑inspired components for conversations (message bubbles, loading states, prompt input).
  - Subscribes to the `/api/chat` SSE endpoint for streamed answers.

- `apps/demo-web/src/app/graph/page.tsx`
  - Graph visualisation view.
  - Renders nodes/edges using ForceGraph (or similar) based on graph patches.

### 9.3 API Routes

- `/api/chat`
  - Thin adapter onto `ComplianceEngine.handleChat`.
  - Streams `text` chunks as SSE events.
  - Emits a final metadata event with `referencedNodes`, `jurisdictions`, `uncertaintyLevel`, `disclaimerKey`.

- `/api/graph/*`
  - Read‑only routes for fetching initial graph snapshots and streaming patches.

The UI is deliberately **thin and dumb**: it does not implement business logic, graph reasoning, or conversation context management.

---

## 10. Technology Stack Summary

- **Runtime:** Node.js 24 LTS.
- **Frontend:** Next.js 16, React 19, Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK v5.
- **Backend engine:** TypeScript packages (`reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`).
- **Graph:** Memgraph Community + MAGE.
- **Storage:** Supabase/Postgres for multi‑tenant app data and conversation context.
- **Sandboxing & tools:** E2B + MCP gateway (optional but supported).

---

## 11. Non‑Goals (v0.6)

To keep scope sane, v0.6 explicitly does **not** attempt to:

- Implement Memgraph‑level multi‑tenant isolation (single shared rules graph remains the model).
- Provide legal/tax/welfare advice; the system stays a **research and explanation tool**.
- Fully implement the Scenario Engine or advanced What‑If UI flows (they remain roadmap items).
- Optimise for ultra‑low latency at the expense of clarity or safety.

---

## 12. Summary of Changes in v0.6

### Added

- ✅ Self‑contained backend architecture description (no longer defers to v0.4).
- ✅ Streaming model that separates **text** vs **tool** chunks in `LlmProvider`.
- ✅ Main‑chat **SKOS‑style concept capture** tool and self‑populating graph pipeline.
- ✅ Backend‑owned **Conversation Context** and `referencedNodes` semantics.
- ✅ Hooks for future **Scenario Engine** and What‑If scenarios.
- ✅ Explicit alignment with `concept_capture_from_main_chat_v_0_1.md`, `conversation_context_spec_v_0_1.md`, and `scenario_engine_v_0_1.md`.

### Carried Forward (Unchanged in Spirit)

- ✅ Node 24 LTS baseline and TS/Next/React/Tailwind versions.
- ✅ Memgraph as a shared, PII‑free rules graph.
- ✅ Egress Guard and Graph Ingress Guard invariants.
- ✅ LlmRouter and provider‑agnostic LLM routing.
- ✅ Timeline Engine and special jurisdictions modelling.
- ✅ UI architecture from v0.5 (Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK).

v0.6 is now the **canonical architecture document** for the Regulatory Intelligence Copilot and should be treated as the primary reference for future work on the engine, UI, and roadmap.

