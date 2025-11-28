# MIGRATION PLAN – Regulatory Intelligence Copilot (v0.2)

> This document supersedes the original `migration_plan_v_0_1.md` that described the initial fork from `rfc-refactor`.
>
> **Current status:**
> - Repo has been forked and renamed to **`regulatory-intelligence-copilot`**.
> - **PR #2 has been merged**, introducing:
>   - Jurisdiction‑neutral system prompts.
>   - Dynamic profile tag construction.
>   - Prompt aspects (`jurisdictionAspect`, `agentContextAspect`, `profileContextAspect`, `disclaimerAspect`, `additionalContextAspect`).
> - The project is now formally a **chat-first, graph-powered regulatory research copilot**, not an HTTP/RFC auditor.

The purpose of this migration plan is to describe how to get from the **current PR#2 state** to the **v0.2 architecture** documented in `ARCHITECTURE_v0_2.md` and `DECISIONS_v0_2.md`.

---

## 0. Goals & Non‑Goals

### 0.1 Goals

- Fully pivot from HTTP/RFC auditing → **Regulatory Intelligence Copilot**.
- Align implementation with:
  - Jurisdiction‑neutral prompts + dynamic profile tags.
  - Prompt aspects as the **only** way to build system prompts.
  - Provider‑agnostic LLM router (OpenAI Responses + GPT‑OSS, Groq, local/OSS).
  - Direct **Memgraph GraphClient** (no Memgraph MCP in hot path).
  - WebSocket‑based graph streaming with incremental patches.
  - Engine + demo app split so this can be reused in other Next.js/Supabase SaaS apps.
- Keep and modernise existing integrations that were hard‑won in `rfc-refactor` (E2B, MCP gateway, Memgraph wiring, basic chat flow, redaction).

### 0.2 Non‑Goals

- Not trying to fully implement all Ireland/EU domain content in one go.
- Not trying to perfect UX/branding; the focus is architecture + core flows.
- Not trying to enforce a specific hosting stack (can run on Codespaces, local dev, or your own VPS/cloud).

---

## 1. Current State (Post‑PR #2)

**What we have now:**

- A working Next.js app with a chat route (`/api/chat`).
- System prompts updated to be **jurisdiction‑neutral**, with support for jurisdiction‑specific agents.
- A **prompt aspects** module that supports:
  - `jurisdictionAspect`
  - `agentContextAspect`
  - `profileContextAspect`
  - `disclaimerAspect`
  - `additionalContextAspect`
- Dynamic profile tag construction (e.g. `PROFILE_SINGLE_DIRECTOR_IE` vs `PROFILE_SINGLE_DIRECTOR_MT`).
- Legacy `rfc-refactor` code still present in places:
  - HTTP/RFC auditing concepts.
  - OWASP/RFC data structures and UI components.
  - Memgraph integration patterns that were oriented toward RFC/OWASP graphs.

The migration plan below assumes this is the starting point.

---

## 2. Wave 1 – Legacy Cleanup & Doc Alignment

**Objective:** Remove/cordon off HTTP/RFC audit legacy, and make sure documentation and code agree.

### 2.1 Code Cleanup

**Actions**
- [ ] Create a `legacy/` folder (or similar) and move any obviously HTTP/RFC‑specific modules into it:
  - Sample HTTP API server (if still present).
  - HTTP probe runners / audit orchestration (`runAudit`, `analyzeCompliance`, etc.).
  - OWASP Top 10 enums, HTTP header findings, RFC ID types.
  - UI components that render HTTP transcripts, header tables, vulnerability lists.
- [ ] Remove all imports of these legacy modules from the active app.
- [ ] Ensure `/api/chat` and the chat UI do **not** reference audit concepts.

### 2.2 Documentation Alignment

**Actions**
- [ ] Replace old docs with v0.2 docs:
  - [ ] `README.md` → regulatory copilot description.
  - [ ] `ARCHITECTURE_v0_2.md` → committed and linked from README.
  - [ ] `DECISIONS_v0_2.md` → committed and linked.
  - [ ] `ROADMAP_v0_2.md` → committed and linked.
  - [ ] `AGENTS.md` → committed and linked.
- [ ] Delete or clearly mark as legacy the original `migration_plan_v_0_1.md`.

**Exit Criteria (Wave 1)**

- No active codepath mentions HTTP auditing, OWASP, or RFC headers.
- All “source of truth” docs (README, ARCHITECTURE, DECISIONS, ROADMAP, AGENTS) refer to the regulatory copilot domain.

---

## 3. Wave 2 – Engine Packages, LLM Router & Prompt Discipline

**Objective:** Put the correct *abstractions* in place before deep domain work.

### 3.1 Package Layout

Create the following packages (names can be adjusted, but keep the separation):

- `packages/reg-intel-core`
  - Compliance Engine interface and implementation.
  - Agent interfaces and orchestrator (Global + domain agents skeletons).
- `packages/reg-intel-llm`
  - `LlmClient`, `LlmRouter`, provider backends.
  - Egress guard integration.
- `packages/reg-intel-prompts`
  - Base system prompts.
  - Prompt aspects and builders.
- `packages/reg-intel-next-adapter`
  - Helpers to mount a `ComplianceEngine` into a Next.js API route.

**Actions**
- [ ] Move any LLM client logic from the app into `reg-intel-llm`.
- [ ] Move system prompts and prompt aspects into `reg-intel-prompts` (if not already there fully).
- [ ] Introduce `createComplianceEngine(deps)` in `reg-intel-core`.
- [ ] Update `/api/chat` to use `reg-intel-next-adapter` → `ComplianceEngine` → `LlmRouter`.

### 3.2 LLM Router & Providers

**Actions**
- [ ] Define interfaces:
  - `LlmMessage`, `LlmCompletionOptions`, `LlmClient`.
  - `TenantLlmPolicy`, `LlmTaskPolicy`.
- [ ] Implement **LlmRouter** that:
  - Chooses provider/model based on tenant + `task` (e.g. `"main-chat"`, `"egress-guard"`, `"pii-sanitizer"`).
  - Calls the correct backend client.
- [ ] Implement backends:
  - [ ] `OpenAiResponsesClient` using `/v1/responses` (including GPT‑OSS models).
  - [ ] `GroqLlmClient`.
  - [ ] `LocalHttpLlmClient` targeting a configurable local/OSS model server (vLLM, Ollama, etc.).
- [ ] Implement a minimal in-memory or file-based config store for `TenantLlmPolicy`.

### 3.3 Prompt Aspects Enforcement

Prompt aspects exist after PR#2 but may not yet be fully enforced.

**Actions**
- [ ] Ensure **all** LLM calls (in agents, `/api/chat`, utilities) use:
  - `buildPromptWithAspects` or a builder returned by `createPromptBuilder`.
- [ ] Remove any direct string concatenation of system prompts.
- [ ] Add tests for at least one aspect pipeline to ensure disclaimers and jurisdiction context are always included.

**Exit Criteria (Wave 2)**

- The app uses a **provider-agnostic LlmRouter** and prompt aspects everywhere.
- Changing LLM provider/model for `main-chat` or `egress-guard` can be done via configuration only.
- `/api/chat` calls `createComplianceEngine()` from `reg-intel-core` and no longer directly deals with raw LLMs.

---

## 4. Wave 3 – GraphClient, Timeline Engine & Minimal Graph

**Objective:** Move from RFC-oriented graph assumptions to a regulatory schema, and encapsulate Memgraph access.

### 4.1 GraphClient Package

Create `packages/reg-intel-graph`:

**Actions**
- [ ] Define `GraphClient` interface, with methods like:
  - `getRulesForProfileAndJurisdiction(...)`
  - `getNeighbourhood(...)`
  - `getMutualExclusions(...)`
  - `getTimelines(...)`
  - `getCrossBorderSlice(...)`
- [ ] Implement `createMemgraphGraphClient(config)` using **direct Memgraph Bolt/HTTP**, not Memgraph MCP.
- [ ] Replace any direct Cypher calls in app/agents with GraphClient usage.

### 4.2 Timeline Engine v0.1

**Actions**
- [ ] Implement a `TimelineEngine` module (can live in `reg-intel-core` or its own package) that can:
  - Parse `:Timeline` nodes.
  - Compute lookback ranges (e.g. N months/years back from a reference date).
  - Compute lock-in end dates.
  - Answer yes/no questions like `isWithinLookback(date, timelineNode)`.
- [ ] Integrate `TimelineEngine` into relevant agents via the Compliance Engine.

### 4.3 Minimal Graph Seeding

**Actions**
- [ ] Define a tiny but realistic initial graph in line with `graph_schema_v0_2.md`:
  - A few `:Benefit` nodes (Illness Benefit, Jobseeker’s Benefit (Self-Employed), Treatment Benefit).
  - Some `:Section`, `:Condition`, `:Timeline` nodes.
  - Edges: `APPLIES_TO`, `REQUIRES`, `EXCLUDES`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`.
- [ ] Write a simple seeding script (can be a Node script or E2B job) that upserts this into Memgraph.

**Exit Criteria (Wave 3)**

- Compliance Engine uses GraphClient for all graph reads in the hot path.
- At least one user flow demonstrates timeline-aware reasoning using real Memgraph nodes.

---

## 5. Wave 4 – Agents & Ireland/EU Vertical Slice

**Objective:** Implement useful domain agents and a global orchestrator for an Ireland-first slice.

### 5.1 Domain Agents

Implement agents in `reg-intel-core` as per `AGENTS.md`:

**Actions**
- [ ] `SingleDirector_IE_SocialSafetyNet_Agent` – deep, Ireland-specific.
- [ ] `IE_SelfEmployed_TaxAgent` – high-level, focusing on key reliefs and conflict detection.
- [ ] `IE_CGT_Investor_Agent` – including CGT loss relief timing and buy-back rules.
- [ ] `IE_RnD_TaxCredit_Agent` – focused on Section 766 and related conditions.
- [ ] `EU_CrossBorder_Coordinator_Agent` – handles basic EU coordination scenarios.

Each agent should:
- Use GraphClient to retrieve rules and relationships.
- Use `TimelineEngine` for time-based constraints.
- Use LlmRouter + prompt aspects for explanation.

### 5.2 Global Orchestrator

**Actions**
- [ ] Implement `GlobalRegulatoryComplianceAgent` that:
  - Receives each chat request from Compliance Engine.
  - Uses persona, jurisdictions, and heuristics to decide which domain agent(s) to call.
  - Merges outputs into a single `ChatResponse`.
- [ ] Ensure the orchestrator annotates responses with:
  - Which agents contributed.
  - Which jurisdictions were considered.
  - Which graph nodes were referenced.

**Exit Criteria (Wave 4)**

- From the demo app, you can ask realistic questions about a single-director IE company and receive:
  - Multi-agent answers grounded in the graph.
  - Time- and exclusion-aware explanations.
  - Clear non-advice disclaimers.

---

## 6. Wave 5 – WebSocket Graph Streaming & UI Integration

**Objective:** Replace graph polling with incremental WS patches and wire the engine into the UI.

### 6.1 Backend Graph Streaming

**Actions**
- [ ] Implement `GET /api/graph` for initial subgraph (filtered by persona/jurisdictions if needed).
- [ ] Implement a WebSocket endpoint (e.g. `/api/graph/stream`) that:
  - Sends `graph_patch` messages with nodes/edges added/updated/removed.
  - Uses a simple patch format defined in a small spec (can later be formalised).
- [ ] Integrate Memgraph queries and ingestion hooks so changes trigger patch events.

### 6.2 Frontend Graph UI

**Actions**
- [ ] On page load, fetch the initial graph via `GET /api/graph`.
- [ ] Connect to `/api/graph/stream` and apply patches in memory.
- [ ] Ensure the graph visual component supports:
  - Updating only affected nodes/edges.
  - Avoiding complete re-renders of large graphs.

**Exit Criteria (Wave 5)**

- The UI shows a graph that:
  - Loads once via REST.
  - Responds to incremental updates pushed via WS.

---

## 7. Wave 6 – MCP Integration, On-Demand Enrichment & Change Tracking

**Objective:** Make the graph a living knowledge base and start tracking updates.

### 7.1 MCP for External Legal Sources

**Actions**
- [ ] Configure MCP tools for:
  - Revenue.ie / gov.ie / DSP / Pensions Authority search or document access.
  - EU law (eur-lex) and case law.
- [ ] Use E2B sandbox or a separate worker to run ingestion jobs that call these MCP tools.

### 7.2 On-Demand Enrichment

**Actions**
- [ ] Add agent hooks so that when gaps are detected (sparse graph around a topic), they can ask:
  - The MCP-backed search for more information.
  - A small LLM (possibly local) to propose candidate nodes/edges.
- [ ] Implement safe upsert paths from these proposals into Memgraph.

### 7.3 Change Event Nodes

**Actions**
- [ ] Introduce `:Update` / `:ChangeEvent` nodes for Finance Acts, eBriefs, TAC decisions, EU rulings.
- [ ] Link them to affected rules via edges like `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`.
- [ ] Add a simple mapping from profile tags to affected rules for future notification mechanisms.

**Exit Criteria (Wave 6)**

- The graph is enriched both via batch ingestion and chat-driven on-demand enrichment.
- New rulings/guidance can be represented as change events in the graph.

---

## 8. Wave 7 – SaaS Readiness & Reuse in Other Next.js/Supabase Apps

**Objective:** Make it straightforward to embed this engine into another EU-focused SaaS app.

### 8.1 Tenant & Policy Hardening

**Actions**
- [ ] Wire `tenantId` from HTTP layer → Compliance Engine → LlmRouter.
- [ ] Persist `TenantLlmPolicy` in a proper store (Supabase or similar).
- [ ] Enforce `allowRemoteEgress` for each tenant.

### 8.2 Next.js/Supabase Integration

**Actions**
- [ ] Finalise `reg-intel-next-adapter` to expose a simple `createChatRouteHandler(engineFactory)`.
- [ ] Document how to:
  - Install engine packages.
  - Configure LlmRouter and GraphClient.
  - Mount `/api/reg-intel` in another Next.js app.

**Exit Criteria (Wave 7)**

- Another Next.js/Supabase project can:
  - Import engine packages.
  - Instantiate a Compliance Engine.
  - Expose a working API endpoint for regulatory chat.

---

## 9. Summary

This migration plan assumes:

- The **fork and initial PR#2 changes are complete**.
- You want a **clean break** from HTTP/RFC auditing while preserving the hardest parts of the infra (chat, Memgraph, MCP, sandbox, redaction).

By executing Waves 1–7 in order, you will:

- Land a well-structured, **engine-driven** regulatory copilot.
- Achieve a strong Ireland/EU vertical slice grounded in a real graph.
- Be able to run entirely on **local/OSS models** for sensitive EU tenants.
- Have a reusable engine that you can drop into your other Next.js/Supabase SaaS platform with minimal friction.

