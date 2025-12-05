# Regulatory Intelligence Copilot 🧭📚

> **Architecture version:** v0.6 (based on `architecture_v_0_6`)  
> **Goal:** A chat‑first, graph‑backed regulatory research copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal/tax advice or leaking sensitive data.
>
> ⚠️ **Important:** This project is a **research tool**, not legal or tax advice. Always confirm outcomes with Revenue, DSP, the Pensions Authority, your accountant, or another qualified professional.

---

## What This Is

The **Regulatory Intelligence Copilot** is a fork and evolution of the original `rfc-refactor` project.

Instead of auditing HTTP APIs against RFCs and OWASP, this repo focuses on:

- 🧠 **Graph‑based reasoning over regulations**  
  Tax, social welfare, pensions, CGT, and EU rules are modelled as a **shared rules graph** in Memgraph. The engine answers questions by traversing this graph rather than treating every query as a fresh web search.

- 💬 **Chat‑first UX**  
  A single conversational interface where users ask natural‑language questions. The chat engine streams answers while also capturing structured concepts and evidence behind the scenes.

- 🧑‍💼 **Expert agents**  
  Specialist agents (and a Global Regulatory Agent) for domains such as:
  - Single‑director Irish companies.
  - Self‑employed welfare & social safety net.
  - Irish CGT & investments.
  - R&D tax credits.
  - EU social security / cross‑border regulatory effects.

- 🌐 **Global Regulatory Agent**  
  A meta‑agent that can reason across domains and explain interactions (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU, across jurisdictions such as IE / UK / NI / EU / IM / MT / GI / AD).

- 🧪 **Sandboxed analysis & tools**  
  Heavy or untrusted work can run inside an **E2B sandbox**, with outbound calls routed through an MCP gateway. All external calls still flow through a central **Egress Guard**.

- 🔐 **Privacy‑first & non‑advice framing**  
  Conversations and tenant data live in Postgres/Supabase; Memgraph stays a shared, PII‑free rules graph. Prompts and UI copy consistently frame outputs as **research and explanation**, not formal advice.

- 🕸️ **Self‑populating rules graph (concept capture)**  
  Main chat responses can emit SKOS‑style concept metadata via tools. The engine resolves these to canonical graph nodes and, where needed, triggers ingestion jobs to upsert or enrich rules in the shared graph.

- 🧩 **Conversation context & referenced nodes**  
  Each chat turn updates backend‑owned conversation context. Answers include a `referencedNodes` list of Memgraph IDs actually used, so the UI can show evidence chips and keep the graph view in sync.

- 🎛 **Scenario & what‑if scaffolding (future‑ready)**  
  The architecture recognises a Scenario Engine and what‑if simulations as first‑class extension points, wired into the same graph + timeline stack without needing a redesign.

Under the hood, it reuses and extends the architecture from `rfc-refactor`:

- Next.js app with a **single `/api/chat`‑style** entrypoint.
- Optional **E2B sandbox** to host isolated agent runtimes.
- **MCP tools** for Memgraph, LLMs, and external legal content, mediated by an **E2B MCP gateway**.
- **Memgraph** as the core regulatory rules graph database (global, anonymous rule graph).

For the full product concept, see:

- 📄 `docs/specs/regulatory_graph_copilot_concept_v_0_6.md`

---

## Who This Is For

- **Self‑employed people** in Ireland or similar jurisdictions who want to understand:
  - What they may be entitled to (benefits, credits) and what might conflict.
  - How decisions interact across tax, welfare, pensions, and CGT.

- **Single‑director company owners** who juggle:
  - Corporation tax, PRSI, salary vs dividends, and social welfare entitlements.

- **Advisors & accountants** who need:
  - Faster research across multiple domains.
  - A graph view of rule interactions, mutual exclusions, and timelines.

- **Researchers & developers** exploring:
  - GraphRAG beyond simple document retrieval.
  - Agentic architectures for complex regulations.

Again: **this tool does not replace professional advice**. It is there to:

- Surface relevant rules.
- Reveal interactions and trade‑offs.
- Help you ask better questions of real authorities and professionals.

---

## Documentation Map

The README is intentionally light. The **docs directory** holds the full design.

If you’re new to the repo, start here:

- 🧭 **Docs index**  
  - `docs/README.md` – top‑level map of concept, architecture, safety, engines, and governance docs.

- 🏛 **Architecture**  
  - `docs/architecture/README.md` – high‑level architecture overview for v0.6, with links to `architecture_v_0_6.md`, diagrams, graph schema, change detection, engines, and integration guides.

- 🗺 **Roadmap & decisions**  
  - `docs/governance/roadmap/roadmap_v_0_6.md` – phased implementation plan and future use cases (scenario engine, eligibility explorers, advisory workflows).  
  - `docs/governance/decisions/decisions_v_0_6.md` – architectural decision records (ADRs) and design rationale.

- 🤖 **Agents & prompts**  
  - `AGENTS.md` – agent landscape, domains/jurisdictions, and orchestration.  
  - `PROMPT.md` – coding‑agent prompt for implementing and evolving the v0.6 architecture.

- 🛡 **Safety & privacy**  
  - See the **Safety** section of `docs/README.md` for ingress/egress guards and data‑boundary specs.

Specs and decisions in `docs/` are the **source of truth**. If anything in this README disagrees with them, the docs win.

---

## Current Status

- **Architecture:** v0.6, based on `docs/architecture/versions/architecture_v_0_6.md`.
- **Backend engine:** Implemented as reusable TypeScript packages (`reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`).
- **Frontend:** Next.js 16, React 19, Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK v5.
- **Graph:** Memgraph Community + MAGE as a single shared rules graph.
- **Storage:** Supabase/Postgres for multi‑tenant app data and conversation context.
- **Safety:** Graph Ingress Guard for all writes; Egress Guard for all outbound calls.

This repo is **not** a finished product. It is a living reference implementation that tracks the architecture and decision docs.

---

## Getting Started

> ⚠️ This is an experimental research project. Don’t rely on it for real compliance decisions.

### 1. Prerequisites

- **Node.js** 24+ (LTS) – see `docs/node_24_lts_rationale.md` for why.  
- **pnpm** (or your preferred package manager).  
- **Docker** (for Memgraph + MCP gateway + any sandbox sidecars).  
- Accounts / API keys for:
  - **E2B** (if using sandboxed code execution).  
  - At least one LLM provider (e.g. OpenAI, Groq) or a locally hosted OSS model.

In v0.6, the engine also expects:

- A Postgres/Supabase instance (or in‑memory stub in dev) for **conversations + ConversationContext**.  
- Memgraph reachable from the engine for the **shared rules graph**.

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

For non‑development deployments, always provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` so the platform can use the
Supabase/Postgres conversation store. Avoid forcing `COPILOT_CONVERSATIONS_MODE` to `memory` outside dev/test; leave it unset (or
`auto`) so the Supabase store is selected when credentials are present.

Keep all secrets **out of source control**.

### 4. Start Infra (Memgraph + MCP Gateway)

With Docker installed, bring up the graph DB and MCP gateway stack:

```bash
# Start Memgraph (with Lab UI and MAGE included) and Memgraph MCP server
docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp
```

The `memgraph` service uses `memgraph/memgraph-platform:latest` which includes the Memgraph database, Memgraph Lab (web UI), and MAGE (Memgraph Advanced Graph Extensions) in a single container.

Ensure:

- Memgraph is reachable at the configured `MEMGRAPH_URI` (default: `bolt://localhost:7687`).  
- Memgraph Lab UI is available at `http://localhost:7444`.  
- The Memgraph MCP server exposes tools at `http://localhost:8001`.

### 5. Start Supabase / Postgres (for conversations)

For local development you can either:

- Use the **Supabase CLI / docker stack** for a full local Supabase instance, or  
- Point `DATABASE_URL` at a local Postgres instance.

The recommended path is described in **`docs/local_development.md`**, which covers:

- Starting Supabase locally.
- Running database migrations.
- Applying seed data for demo conversations and tenants.
- Reading the first‑run Supabase notice that prints the **seeded demo user ID and tenant ID**; copy those values into the **repo root** `.env.local` (used by the demo web app) so the UI can authenticate as the seeded demo user.

### 6. Seed Memgraph with demo data

Seed scripts and example Cypher files live under `scripts/` and `docs/specs/graph-seed/` (see `docs/architecture/README.md` for pointers).

A typical flow looks like:

```bash
# Example: run a seed script (adjust to your actual script names)
pnpm ts-node scripts/seed/memgraph_seed_ie_tax_welfare.ts
```

Check the Memgraph Lab UI after seeding to confirm:

- Core jurisdiction nodes (IE / UK / EU / NI / IM / etc.) exist.  
- Initial rule/benefit/timeline nodes are visible.

### 7. Run the Dev Server

```bash
# Start the Next.js dev server
pnpm dev

# By default, visit:
http://localhost:3000
```

You should see the chat UI. Try questions like:

- "I'm a single director of an Irish limited company. What should I understand about PRSI and Illness Benefit?"  
- "If I sell shares at a loss and buy back within a short period, how might that affect CGT loss relief eligibility?"  
- "What is the VAT rate in Ireland, and how does it interact with VRT and import duties for a car from Japan?" (v0.6: this will also seed VAT/VRT/import concepts into the rules graph.)

(Answers will depend on how much law and guidance you've already ingested into Memgraph.)

### 8. Development Tools

#### Memgraph Lab UI

**Memgraph Lab** is a web‑based interface for managing and exploring your Memgraph database:

- **URL**: `http://localhost:7444/`  
- **Features**:
  - Visual graph exploration and querying.  
  - Query editor with syntax highlighting.  
  - Database schema visualization.  
  - Performance monitoring.  
  - MAGE algorithm integration.

---

## Repository Layout (v0.6)

This is the **current** layout. Some names may still reflect the older `compliance-core` era but are being moved towards the v0.6 package split.

```txt
apps/
  demo-web/                    # Next.js 16 demo app (chat + graph view)

packages/
  reg-intel-core/              # ComplianceEngine, agents, ConversationContext integration
  reg-intel-graph/             # GraphClient, GraphWriteService, GraphChangeDetector, ingress guard
  reg-intel-llm/               # LlmRouter, providers, egress client/guard
  reg-intel-prompts/           # Prompt aspects, base system prompts

  # (some legacy folders may still exist while migration completes)

docs/
  README.md                    # Docs index (start here)
  architecture/
    README.md                  # Architecture index / map
    versions/
      architecture_v_0_6.md
      # older versions archived here
    diagrams/
      architecture_diagrams_v_0_6.md
  governance/
    decisions/
      decisions_v_0_6.md
      versions/...
    product/
      scenario-engine/
        scenario_engine_v_0_1.md
  roadmap/
    roadmap_v_0_6.md
    versions/...
  change-detection/
    graph_change_detection_v_0_6.md
    archive/...
  specs/
    regulatory_graph_copilot_concept_v_0_6.md
    graph_schema_v_0_6.md
    graph_schema_changelog_v_0_6.md
    graph_algorithms_v_0_1.md
    timeline_engine_v_0_2.md
    special_jurisdictions_modelling_v_0_1.md
    data_privacy_and_architecture_boundaries_v_0_1.md
    graph_ingress_guard_v_0_1.md
    egress_guard_v_0_2.md
    conversation-context/
      conversation_context_spec_v_0_1.md
      concept_capture_from_main_chat_v_0_1.md

  # plus historical v0.1/v0.2/v0.3/v0.4 docs

AGENTS.md                      # v0.6 agent spec
PROMPT.md                      # v0.6 coding agent prompt
```

### Target Structure (Future)

The v0.6 architecture spec still describes a **future split** of the engine into smaller, more focused packages:

```txt
packages/
  reg-intel-core/           # Compliance Engine, agent interfaces, orchestrator only
  reg-intel-graph/          # GraphClient + Memgraph utilities
  reg-intel-llm/            # LLM router + providers + egress guard
  reg-intel-prompts/        # Prompt aspects + base system prompts
  reg-intel-next-adapter/   # Helpers to mount engine in Next.js apps
```

The important principle remains:

- **apps/** – UI and HTTP edges.  
- **packages/** – reusable engine components.  
- **docs/** – living design & spec documents.

This makes it easier to reuse the engine inside other Next.js/Supabase SaaS projects.

---

## Safety, Limitations & Disclaimers

This project is **not**:

- A substitute for a tax advisor, accountant, solicitor, welfare officer, or any other professional.  
- Guaranteed to be correct, complete, or current.  
- Suitable for making real‑world financial or legal decisions.

This project **is**:

- A research tool to help you **see the structure** of complex rules.  
- A way to experiment with **graph‑based reasoning + LLMs** in a safety‑conscious way.  
- A foundation for future tooling (for advisors, firms, or SaaS platforms) that can be built on top of a well‑structured, well‑guarded regulatory graph.

Always treat outputs as **starting points for further research**.

---

## Contributing

Contributions, suggestions, and critiques are welcome — especially from:

- Accountants / tax advisors.  
- Welfare rights advocates.  
- Legal professionals.  
- Graph and AI researchers.

Please open issues or PRs with:

- Clear descriptions of the regulatory scenarios you care about.  
- Links to official legislation or guidance you think should be modelled.  
- Suggestions for gaps in the current architecture/docs.

---

## License

_Choose a license appropriate for your goals (MIT / Apache‑2.0 / other) and document it here._

