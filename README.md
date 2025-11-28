# Regulatory Intelligence Copilot 🧭📚

> **Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.**
>
> ⚠️ **Important:** This project is a **research tool**, not legal or tax advice. Always confirm outcomes with Revenue, DSP, the Pensions Authority, your accountant, or another qualified professional.

---

## What This Is

The **Regulatory Intelligence Copilot** is a fork and evolution of the original `rfc-refactor` project.

Instead of auditing HTTP APIs against RFCs and OWASP, this repo focuses on:

* 🧠 **Graph-based reasoning over regulations** – tax, social welfare, pensions, CGT, and EU rules are modelled as a **knowledge graph** in Memgraph.
* 💬 **Chat-first UX** – a single conversational interface where users ask natural-language questions.
* 🧑‍💼 **Expert agents** – specialised agents for (examples):

  * Single-director Irish companies.
  * Self-employed welfare & social safety net.
  * Irish CGT & investments.
  * R&D tax credits.
  * EU social security / cross-border regulatory effects.
* 🌐 **Global Regulatory Agent** – a meta-agent that can reason across domains and explain interactions (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU, across jurisdictions such as IE / UK / NI / EU / IM / MT / GI / AD).
* 🧪 **Sandboxed analysis** – heavy or untrusted work can run inside an **E2B sandbox**, with outbound calls routed through an **MCP gateway**.
* 🔐 **Privacy-first & non-advice** – PII redaction on egress, strict ingress rules for the shared graph, and explicit “research-only” framing.
* 🕸 **Self-populating rules graph (v0.6)** – the main chat model emits SKOS-like concept metadata via tools; the engine resolves/creates concepts in Memgraph and can trigger ingestion jobs (via MCP) to enrich the rules graph in the background.
* 🧩 **Conversation context (v0.6)** – each conversation maintains a server-side context of “active” rule/benefit/tax nodes; answers expose `referencedNodes` so the chat and graph views stay in sync without ever storing PII in Memgraph.
* 🎛 **Scenario & what‑if scaffolding (v0.6)** – early support for a `Scenario Engine` so the same architecture can power “what if I change X?” workflows later.

Under the hood, it reuses and extends the architecture from `rfc-refactor`:

* Next.js app with a **single `/api/chat`**-style entrypoint.
* Optional **E2B sandbox** to host isolated agent runtimes.
* **MCP tools** for Memgraph, LLMs, and external legal content, mediated by an **E2B MCP gateway**.
* **Memgraph** as the core regulatory rules graph database (global, anonymous rule graph).

For the full concept, see:

* 📄 `docs/specs/regulatory_graph_copilot_concept_v_0_6.md`

---

## 📚 Architecture & Design Documentation

Comprehensive design documentation is available in the `docs/` directory.

### Core Architecture (v0.6)

* **`docs/architecture_v_0_6.md`** – System components, data flow, packages, and how everything fits together, including concept capture and conversation context.
* **`docs/decisions_v_0_6.md`** – Architectural decision records (ADRs) and design rationale up to v0.6.
* **`docs/roadmap_v_0_6.md`** – Roadmap and phased implementation plan, including future use cases (scenario engine, eligibility explorers, advisory workflows).
* **`docs/migration_plan_v_0_2.md`** – Migration from the original RFC/OWASP auditor to the regulatory copilot.
* **`docs/node_24_lts_rationale.md`** – Why Node.js 24 LTS is the minimum supported runtime.

### Agents, Prompts & Behaviour (v0.6)

* **`AGENTS.md`** (v0.6) – Agent interfaces, orchestration, domain/jurisdiction-specific agents, and the Global Regulatory Compliance Agent, updated for concept capture + conversation context.
* **`PROMPT.md`** (v0.6) – Coding-agent prompt for implementing and evolving the v0.6 architecture, including LlmRouter, concept tools, and ConversationContext.

### Graph, Algorithms, Timeline & Scenarios

* **`docs/specs/graph_schema_v_0_6.md`** – Node/edge types, schema design, concept/label nodes, and how rules are represented.
* **`docs/specs/graph_schema_changelog_v_0_6.md`** – Schema evolution and breaking changes.
* **`docs/specs/graph_algorithms_v_0_1.md`** – Graph algorithm choices (e.g. focused neighbourhood queries, optional Leiden community detection) and how they're used.
* **`docs/specs/timeline_engine_v_0_2.md`** – Time-based reasoning (lookback windows, lock-ins, deadlines, effective windows).
* **`docs/specs/scenario_engine_v_0_1.md`** – How “what‑if” scenarios and synthetic timelines are modelled alongside the rules graph.
* **`docs/specs/special_jurisdictions_modelling_v_0_1.md`** – Special cases (IE/UK/NI/IM/GI/AD/CTA) modelling patterns.

### Concept Capture & Conversation Context

* **`docs/specs/concept_capture_from_main_chat_v_0_1.md`** – SKOS-inspired concept capture from main chat using a `capture_concepts` tool and structured outputs.
* **`docs/specs/conversation_context_spec_v_0_1.md`** – Server-side, per-conversation `ConversationContext` that tracks active rule/benefit/tax nodes without storing PII in Memgraph.

### Privacy, Ingress & Egress Guards

* **`docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`** – High-level privacy model, what can/can't go into the global graph, and handling of user uploads.
* **`docs/specs/graph_ingress_guard_v_0_1.md`** – Ingress guard and ingress-aspect pipeline for all graph writes.
* **`docs/specs/egress_guard_v_0_2.md`** – Egress guard and egress-aspect pipeline for all outbound calls (LLM, MCP, HTTP).

Earlier versions (e.g. `*_v_0_1.md`, `graph_schema_v_0_3/0_4.md`, `regulatory_graph_copilot_concept_v_0_3/0_4.md`) are kept as **historical context** only.

---

## Who This Is For

* **Self-employed people** in Ireland or similar jurisdictions who want to understand:

  * What they may be entitled to (benefits, credits) and what might conflict.
  * How decisions interact across tax, welfare, pensions, and CGT.
* **Single-director company owners** who juggle:

  * Corporation tax, PRSI, salary vs dividends, and social welfare entitlements.
* **Advisors & accountants** who need:

  * Faster research across multiple domains.
  * A graph view of rule interactions, mutual exclusions, and timelines.
* **Researchers & developers** exploring:

  * GraphRAG beyond simple document retrieval.
  * Agentic architectures for complex regulations.

Again: **this tool does not replace professional advice**. It is there to:

* Surface relevant rules.
* Reveal interactions and trade-offs.
* Help you ask better questions of real authorities and professionals.

---

## Getting Started

> ⚠️ This is an experimental research project. Don’t rely on it for real compliance decisions.

### 1. Prerequisites

* **Node.js** 24+ (LTS) – see `docs/node_24_lts_rationale.md` for why.
* **pnpm** (or your preferred package manager).
* **Docker** (for Memgraph + MCP gateway + any sandbox sidecars).
* Accounts / API keys for:

  * **E2B** (if using sandboxed code execution).
  * At least one LLM provider (e.g. OpenAI, Groq) or a locally hosted OSS model.

In v0.6, the engine also expects:

* A Postgres/Supabase instance (or in-memory stub in dev) for **conversations + ConversationContext**.
* Memgraph reachable from the engine for the **shared rules graph**.

### 2. Clone & Install

```bash
git clone https://github.com/<your-org>/regulatory-intelligence-copilot.git
cd regulatory-intelligence-copilot

# Install dependencies
pnpm install
```

### 3. Environment Configuration

Create a `.env` / `.env.local` and configure environment variables, for example:

```bash
E2B_API_KEY=...
OPENAI_API_KEY=...
GROQ_API_KEY=...
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=...
MEMGRAPH_PASSWORD=...
MCP_GATEWAY_URL=http://localhost:4000

# Conversation + tenant storage (Supabase / Postgres)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
```

Keep all secrets **out of source control**.

### 4. Start Infra (Memgraph + MCP Gateway)

With Docker installed, bring up the graph DB and MCP gateway stack:

```bash
# Start Memgraph (with Lab UI and MAGE included) and Memgraph MCP server
docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp
```

The `memgraph` service uses `memgraph/memgraph-platform:latest` which includes the Memgraph database, Memgraph Lab (web UI), and MAGE (Memgraph Advanced Graph Extensions) in a single container.

Ensure:

* Memgraph is reachable at the configured `MEMGRAPH_URI` (default: `bolt://localhost:7687`).
* Memgraph Lab UI is available at `http://localhost:7444`.
* The Memgraph MCP server exposes tools at `http://localhost:8001`.

### 5. Run the Dev Server

```bash
# Start the Next.js dev server
pnpm dev

# By default, visit:
http://localhost:3000
```

You should see the chat UI. Try questions like:

* "I'm a single director of an Irish limited company. What should I understand about PRSI and Illness Benefit?"
* "If I sell shares at a loss and buy back within a short period, how might that affect CGT loss relief eligibility?"
* "What is the VAT rate in Ireland, and how does it interact with VRT and import duties for a car from Japan?" (v0.6: this will also seed VAT/VRT/import concepts into the rules graph.)

(Answers will depend on how much law and guidance you've already ingested into Memgraph.)

### 6. Development Tools

#### Memgraph Lab UI

**Memgraph Lab** is a web-based interface for managing and exploring your Memgraph database:

* **URL**: `http://localhost:7444/`
* **Features**:

  * Visual graph exploration and querying
  * Query editor with syntax highlighting
  * Database schema visualization
  * Performance monitoring
  * MAGE algorithm integration

#### E2B / MCP Gateway

The **E2B MCP gateway** mediates:

* Access to the Memgraph MCP server.
* Access to external legal content/search MCPs.
* Any optional sandboxed code execution.

All such calls go through the **Egress Guard** inside the engine, which enforces:

* PII redaction.
* Tenant policy (e.g. allow/deny external egress).
* Optional AI-based safety checks.

---

## High-Level Architecture (v0.6)

At a high level, the system looks like this:

1. The **user** types a question into the chat UI.
2. The **Next.js API route** (e.g. `/api/chat`) forwards the request to the **Compliance Engine** with `tenantId`, `userId`, and `conversationId`.
3. The **Compliance Engine**:

   * Loads **ConversationContext** (active graph node IDs, jurisdictions, flags) from Postgres/Supabase.
   * Selects an appropriate **agent** via the Global Regulatory Agent.
   * Builds prompts using **prompt aspects** (jurisdiction, persona, disclaimers, conversation context, etc.).
   * Calls **LlmRouter** for the main chat task using a provider (OpenAI Responses, Groq, local OSS model, etc.).
   * Enables the `capture_concepts` tool so the model can emit SKOS-like concept metadata alongside its answer.
4. The **LLM provider** streams back:

   * `text` chunks → forwarded directly to the UI as streamed answer tokens.
   * `tool` chunks for `capture_concepts` → consumed server-side only.
5. The engine handles `capture_concepts` output by:

   * Normalising concepts (domain, kind, jurisdiction, labels).
   * Resolving/creating concept nodes in Memgraph via `GraphWriteService` + **Graph Ingress Guard**.
   * Optionally enqueuing ingestion jobs (via MCP) if the concept is new or under-populated.
   * Collecting the resolved graph node IDs into `referencedNodes` and updating **ConversationContext**.
6. The **ChatResponse** (and SSE meta event) includes:

   * The final answer text.
   * `referencedNodes` → rule/benefit/tax node IDs used in the answer.
   * `jurisdictions`, `uncertaintyLevel`, and a `disclaimerKey`.
7. The **UI**:

   * Renders the streamed answer.
   * Optionally displays `referencedNodes` as evidence chips and syncs the graph view.
   * Never handles ConversationContext directly; that’s managed server-side by the engine.
8. In parallel, the **graph UI** subscribes to `/api/graph/stream`:

   * Receives patches when ingestion jobs enrich the graph.
   * Updates the visualisation in near real time.

Throughout, Memgraph remains a **shared, PII-free rules graph**; all tenant- and user-specific state (conversations, context, scenarios) lives in Postgres/Supabase.

---

## Core Features (Implemented so far)

> **Note:** This section is descriptive; see the architecture + specs for the authoritative design.

### ✅ v0.4–v0.6 Engine & Graph

* **Unified Compliance Engine** (in `packages/compliance-core/`, with a planned evolution to `reg-intel-{core,graph,llm,prompts,next-adapter}`):

  * Engine-first design, importable into multiple Next.js/SaaS shells.
  * Global Regulatory Agent + specialist agents as described in `AGENTS.md`.
* **LLM Router**:

  * Provider-agnostic abstraction for OpenAI Responses, Groq, and local HTTP models.
  * Uses Vercel AI SDK v5 *only* inside provider adapters.
  * Supports streaming via `AsyncIterable` with `text` / `tool` / `error` chunks.
* **Egress Guard**:

  * Aspect-based guard for all outbound HTTP/LLM/MCP calls.
  * Enforces tenant policies, PII redaction, and optional AI aspects.
* **GraphClient + Graph Schema (v0.6)**:

  * Direct Bolt connection to Memgraph.
  * Schema aligned with `graph_schema_v_0_6.md` (rules, timelines, jurisdictions, concepts, labels).
  * Strict write path via `GraphWriteService` + Graph Ingress Guard.
* **Timeline Engine**:

  * Pure functions for lookback windows, lock-ins, deadlines.
  * Used by agents when reasoning about time-based eligibility.

### ✅ v0.6 Concept Capture & Conversation Context

* **SKOS-like concept capture from main chat** (`concept_capture_from_main_chat_v_0_1.md`):

  * `capture_concepts` tool attached to the main chat call.
  * LLM streams text to the UI while emitting concept metadata as tool output.
* **Self-populating rules graph**:

  * Concept resolver checks if a concept already exists in Memgraph.
  * If missing/under-populated, the engine enqueues ingestion jobs using MCP.
* **ConversationContext** (`conversation_context_spec_v_0_1.md`):

  * Server-side context per conversation, tracking active graph node IDs and related flags.
  * Stored in Postgres/Supabase, not in Memgraph.
  * Injected into prompts via a dedicated prompt aspect so frontends can remain dumb.
* **`referencedNodes`**:

  * Chat responses include graph node IDs that the answer relied on.
  * UI can surface these as evidence and use them to focus the graph view.

### ✅ UI & Demo App

* **Next.js 16 + React 19 + Tailwind CSS v4** demo app in `apps/demo-web/`.
* Chat UI based on Vercel AI SDK patterns, wired to `/api/chat`.
* Graph panel that:

  * Loads an initial subgraph via `GET /api/graph`.
  * Subscribes to `GET /api/graph/stream` for patch-based updates.

### 🚧 In Progress / Planned (v0.6+)

* Hardening of **graph change detection** and patch streaming.
* First concrete **Scenario Engine** implementation for “what‑if” analyses.
* More specialised agents (additional IE/UK/EU tax and welfare lenses).
* Multi-tenant policy store aligned with Supabase-based SaaS shells.
* Richer graph visualisation (clusters, timelines, impact views).
* Decomposition of `compliance-core` into `reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`, `reg-intel-next-adapter` once the surface stabilises.

---

## Repository Layout

> **Note:** This reflects the current layout; see the architecture doc for the target package split.

### Current Structure (v0.6-in-progress)

```txt
regulatory-intelligence-copilot/
  apps/
    demo-web/                 # Next.js 16 chat UI + /api/chat
  packages/
    compliance-core/          # Unified engine package containing:
                              # - Compliance Engine, agent interfaces, orchestrator
                              # - LLM Router + providers (OpenAI Responses, Groq, Local)
                              # - GraphClient (Memgraph)
                              # - Timeline Engine
                              # - Prompt aspects & base system prompts
                              # - Ingress & Egress guards
  docs/
    architecture_v_0_6.md
    decisions_v_0_6.md
    roadmap_v_0_6.md
    migration_plan_v_0_2.md
    node_24_lts_rationale.md
    specs/
      regulatory_graph_copilot_concept_v_0_6.md
      graph_schema_v_0_6.md
      graph_schema_changelog_v_0_6.md
      graph_algorithms_v_0_1.md
      timeline_engine_v_0_2.md
      scenario_engine_v_0_1.md
      conversation_context_spec_v_0_1.md
      concept_capture_from_main_chat_v_0_1.md
      special_jurisdictions_modelling_v_0_1.md
      data_privacy_and_architecture_boundaries_v_0_1.md
      graph_ingress_guard_v_0_1.md
      egress_guard_v_0_2.md
      # plus historical v0.1/v0.2/v0.3/v0.4 docs
  AGENTS.md                   # v0.6 agent spec
  PROMPT.md                   # v0.6 coding agent prompt
```

### Target Structure (Future)

The v0.6 architecture spec still describes a **future split** of `compliance-core` into smaller, more focused packages:

```txt
packages/
  reg-intel-core/           # Compliance Engine, agent interfaces, orchestrator only
  reg-intel-graph/          # GraphClient + Memgraph utilities
  reg-intel-llm/            # LLM router + providers + egress guard
  reg-intel-prompts/        # Prompt aspects + base system prompts
  reg-intel-next-adapter/   # Helpers to mount engine in Next.js apps
```

The important principle remains:

* **apps/** – UI and HTTP edges.
* **packages/** – reusable engine components.
* **docs/** – living design & spec documents.

This makes it easier to reuse the engine inside other Next.js/Supabase SaaS projects.

---

## Safety, Limitations & Disclaimers

This project is **not**:

* A substitute for a tax advisor, accountant, solicitor, welfare officer, or any other professional.
* Guaranteed to be correct, complete, or current.
* Suitable for making real-world financial or legal decisions.

This project **is**:

* A research tool to help you **see the structure** of complex rules.
* A way to experiment with **graph-based reasoning + LLMs** in a safety-conscious way.
* A foundation for future tooling (for advisors, firms, or SaaS platforms) that can be built on top of a well-structured, well-guarded regulatory graph.

Use it with caution, curiosity, and critical thinking.
