# Regulatory Intelligence Copilot 🧭📚

> **Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.**
>
> ⚠️ **Important:** This project is a **research tool**, not legal or tax advice. Always confirm outcomes with Revenue, DSP, the Pensions Authority, your accountant, or another qualified professional.

---

## What This Is

The **Regulatory Intelligence Copilot** is a fork and evolution of the original `rfc-refactor` project.

Instead of auditing HTTP APIs against RFCs and OWASP, this repo focuses on:

- 🧠 **Graph-based reasoning over regulations** – tax, social welfare, pensions, CGT, and EU rules are modelled as a **knowledge graph** in Memgraph.
- 💬 **Chat-first UX** – a single conversational interface where users ask natural-language questions.
- 🧑‍💼 **Expert agents** – specialised agents for:
  - Single-director Irish companies.
  - Self-employed welfare & social safety net.
  - Irish CGT & investments.
  - R&D tax credits.
  - EU social security / cross-border regulatory effects.
- 🌐 **Global Regulatory Agent** – a meta-agent that can reason across domains and explain interactions (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU, across jurisdictions such as IE / EU / MT / IM).
- 🧪 **Sandboxed analysis** – heavy or untrusted work can run inside an **E2B sandbox**, with outbound calls routed through an **MCP gateway**.
- 🔐 **Privacy-first & non-advice** – PII redaction on egress and explicit “research-only” framing.

Under the hood, it reuses and extends the architecture from `rfc-refactor`:

- Next.js app with a **single `/api/chat`**-style entrypoint.
- Optional **E2B sandbox** to host isolated agent runtimes.
- **MCP tools** for Memgraph, LLMs, and external legal content.
- **Memgraph** as the core regulatory graph database.

For the full concept, see:

- 📄 `docs/specs/regulatory_graph_copilot_concept_v_0_3.md`

---

## 📚 Architecture & Design Documentation

Comprehensive design documentation is available in the `docs/` directory.

### Core Architecture

- **`docs/architecture_v_0_3.md`** – System components, data flow, packages, and how everything fits together.
- **`docs/decisions_v_0_3.md`** – Architectural decision records (ADRs) and design rationale.
- **`docs/migration_plan_v_0_2.md`** – Migration from the original RFC/OWASP auditor to the regulatory copilot.
- **`docs/roadmap_v_0_3.md`** – Roadmap and phased implementation plan.
- **`docs/node_24_lts_rationale.md`** – Why Node.js 24 LTS is the minimum supported runtime.

### Agents & Behaviour

- **`AGENTS.md`** – Agent interfaces, orchestration, domain/jurisdiction-specific agents, and the Global Regulatory Compliance Agent.

### Graph & Timeline Modelling

- **`docs/specs/graph_schema_v_0_3.md`** – Node/edge types, schema design, and cross-jurisdiction modelling.
- **`docs/specs/graph_schema_changelog_v_0_3.md`** – Schema evolution and breaking changes.
- **`docs/specs/timeline_engine_v_0_2.md`** – Time-based reasoning (lookback windows, lock-ins, deadlines, effective windows).

Earlier versions (e.g. `*_v_0_1.md`, `graph_schema_v_0_2.md`, `regulatory_graph_copilot_concept_v_0_1/0_2.md`) are kept as **historical context** only.

---

## High-Level Architecture

At a high level, the system looks like this:

1. The **user** types a question into the chat UI.
2. The **Next.js API route** (e.g. `POST /api/chat`) forwards the message and basic profile info (persona, jurisdictions) to the backend **Compliance Engine**.
3. The Compliance Engine:
   - Uses a provider-agnostic **LLM router** to pick the appropriate model/provider for the task (OpenAI Responses + GPT‑OSS, Groq, or local/OSS models).
   - Builds system prompts via **prompt aspects** (jurisdiction, persona, agent context, disclaimers).
   - Selects a **domain or global agent** to handle the query.
4. The selected agent:
   - Queries **Memgraph** (via a typed `GraphClient`) for relevant rules, benefits, timelines, exclusions, and cross-jurisdiction links.
   - Uses the **Timeline Engine** to reason about lookbacks, lock-ins, deadlines, and effective periods.
   - Optionally calls **MCP tools** (e.g. legal search, case-law feeds) from a sandbox to discover missing rules, then upserts them into the graph.
   - Sends a graph slice + context through the LLM router to generate a research-style explanation.
5. The backend streams a **research-style answer** back to `/api/chat` and from there to the UI.
6. In parallel, **graph updates** (from ingestion jobs or change-monitoring) are sent to the frontend via **WebSocket graph patches**, so the live graph view stays up to date without reloading full snapshots.

For a more detailed breakdown of components and data flow, see:

- 📄 `docs/architecture_v_0_3.md`

---

## Core Concepts

### 1. Regulatory Graph (Memgraph)

All the interesting reasoning lives in a **graph**, not in ad-hoc prompts.

See:

- 📄 `docs/specs/graph_schema_v_0_3.md`
- 📄 `docs/specs/graph_schema_changelog_v_0_3.md`

Key ideas:

- Node types like `:Section`, `:Benefit`, `:Relief`, `:Condition`, `:Case`, `:Guidance`, `:EURegulation`, `:EUDirective`, `:Timeline`, `:ProfileTag`, `:Jurisdiction`, etc.
- Edge types like `CITES`, `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`, `IMPLEMENTED_BY`, `INTERPRETS`, `APPLIES_TO`, `IN_JURISDICTION`.

This allows the system to:

- Surface **hidden interactions** (e.g. claiming one benefit excludes another, or a tax relief is limited by an EU rule or treaty).
- Model **time-based eligibility** (lookback windows, waiting periods, lock-ins, filing deadlines, usage frequency).
- Represent **cross-domain dependencies** (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU) across multiple jurisdictions (e.g. IE, EU, MT, IM).

The graph is a **living knowledge graph**:

- Batch ingestion loads baseline legislation, guidance, and key case law.
- MCP jobs and agents **upsert** (`MERGE`) new nodes and edges when new sources are discovered.
- No user-specific scenarios are stored; personas are represented via `:ProfileTag` and user scenarios remain ephemeral.

### 2. Timeline Engine

Temporal rules are handled by a dedicated **Timeline Engine**:

- 📄 `docs/specs/timeline_engine_v_0_2.md`

Key features:

- Encodes lookback windows, lock-in periods, filing deadlines, and effective windows as `:Timeline` nodes linked to rules and benefits.
- Provides pure functions to evaluate things like:
  - “Given this scenario time and jurisdiction, is the user inside or outside the window?”
  - “What changes if they act now vs in 6 months?”
- Agents **do not hard-code** durations or deadlines; they query the graph for `:Timeline` nodes and pass them to the Timeline Engine.

### 3. Agent Lenses

Agents are **different lenses on the same graph**. They are defined in:

- 📄 `AGENTS.md`

Examples:

- Global Regulatory Compliance Agent (orchestrator / meta-agent).
- Single-director IE social safety net agent.
- IE tax & company obligations agent.
- EU regulation & cross-border coordination agent.
- IE CGT & investments agent.
- IE R&D tax credit agent.

Each agent:

- Has a domain-specific system prompt built using **prompt aspects**.
- Queries a **filtered subgraph** (e.g. only rules tagged as relevant for a single director in a given jurisdiction).
- Uses the shared Timeline Engine + LLM router.

### 4. LLM Router & Prompt Aspects

LLM usage is **provider- and model-agnostic**.

A single **LLM router** chooses which provider/model to call based on:

- Tenant configuration and data-protection requirements.
- Task type (`main_chat`, `egress_guard`, `pii_sanitizer`, etc.).

Supported patterns include:

- OpenAI **Responses API** (including `gpt-4.x` and `gpt-oss-*` models).
- Groq-hosted models.
- Locally-hosted OSS models (for tenants that require **no external egress**).

Prompts are built via a composable **aspect** system:

- Jurisdiction context (primary + secondary jurisdictions).
- Agent context (agent ID and domain).
- User profile / persona context.
- Standard disclaimers and safety text.
- Optional additional aspects (e.g. product tier, audience).

See:

- 📄 `PROMPTS.md`
- 📄 `docs/decisions_v_0_3.md`

---

## Who This Is For

- **Self-employed people** in Ireland or similar jurisdictions who want to understand:
  - What they may be entitled to (benefits, credits) and what might conflict.
  - How decisions interact across tax, welfare, pensions, and CGT.
- **Single-director company owners** who juggle:
  - Corporation tax, PRSI, salary vs dividends, and social welfare entitlements.
- **Advisors & accountants** who need:
  - Faster research across multiple domains.
  - A graph view of rule interactions, mutual exclusions, and timelines.
- **Researchers & developers** exploring:
  - GraphRAG beyond simple document retrieval.
  - Agentic architectures for complex regulations.

Again: **this tool does not replace professional advice**. It is there to:

- Surface relevant rules.
- Reveal interactions and trade-offs.
- Help you ask better questions of real authorities and professionals.

---

## Documentation Map

If you’re new to the repo, start here:

- 🧠 **Concept & vision**
  - `docs/specs/regulatory_graph_copilot_concept_v_0_3.md`

- 🏛 **Architecture & decisions**
  - `docs/architecture_v_0_3.md`
  - `docs/decisions_v_0_3.md`
  - `docs/roadmap_v_0_3.md`
  - `docs/migration_plan_v_0_2.md`
  - `docs/node_24_lts_rationale.md`

- 🕸 **Graph & timelines**
  - `docs/specs/graph_schema_v_0_3.md`
  - `docs/specs/graph_schema_changelog_v_0_3.md`
  - `docs/specs/timeline_engine_v_0_2.md`

- 🤖 **Agents & prompts**
  - `AGENTS.md`
  - `PROMPTS.md`

Older versions (e.g. v0.1/v0.2) are kept for historical context only.

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
# Add any other MCP- or provider-specific config
```

Keep all secrets **out of source control**.

### 4. Start Infra (Memgraph + MCP Gateway)

With Docker installed, bring up the graph DB and MCP gateway stack. For example:

```bash
# Example – adjust to match your docker-compose.yml
docker compose up memgraph mcp-gateway
```

Ensure:

- Memgraph is reachable at the configured `MEMGRAPH_URI`.
- The MCP gateway exposes the tools you expect (e.g. Memgraph MCP, legal-search MCP, LLM MCPs).

### 5. Run the Dev Server

```bash
# Start the Next.js dev server
pnpm dev

# By default, visit:
http://localhost:3000
```

You should see the chat UI. Try questions like:

- “I’m a single director of an Irish limited company. What should I understand about PRSI and Illness Benefit?”
- “If I sell shares at a loss and buy back within a short period, how might that affect CGT loss relief eligibility?”

(Answers will depend on how much law and guidance you’ve already ingested into Memgraph.)

---

## Repository Layout (Target)

The exact structure may evolve, but the **target layout** is roughly:

```txt
regulatory-intelligence-copilot/
  apps/
    demo-web/                 # Next.js chat UI + /api/chat
  packages/
    reg-intel-core/           # Compliance Engine, agent interfaces, orchestrator
    reg-intel-graph/          # Typed Memgraph GraphClient + graph utilities
    reg-intel-llm/            # Provider-agnostic LLM router + egress guard + providers
    reg-intel-prompts/        # Prompt aspects, base system prompts
    reg-intel-next-adapter/   # Helpers to mount the engine in Next.js apps
  docs/
    architecture_v_0_3.md
    decisions_v_0_3.md
    roadmap_v_0_3.md
    migration_plan_v_0_2.md
    node_24_lts_rationale.md
    specs/
      regulatory_graph_copilot_concept_v_0_3.md
      graph_schema_v_0_3.md
      graph_schema_changelog_v_0_3.md
      timeline_engine_v_0_2.md
      # plus historical v0.1/v0.2 docs
  AGENTS.md
  PROMPTS.md
```

The important part is the separation between:

- **apps/** – UI and HTTP edges.
- **packages/** – reusable engine components.
- **docs/** – living design & spec documents.

This makes it easier to reuse the engine inside other Next.js/Supabase SaaS projects.

---

## Safety, Limitations & Disclaimers

This project is **not**:

- A substitute for a tax advisor, accountant, solicitor, welfare officer, or any other professional.
- Guaranteed to be correct, complete, or current.
- Suitable for making real-world financial or legal decisions.

This project **is**:

- An experiment in applying:
  - Graph-based reasoning.
  - Agentic architectures.
  - E2B + MCP patterns.
  - To the messy domain of real-world regulations.

Always treat outputs as **starting points for further research**.

---

## Roadmap (High-Level)

For detailed milestones, see:

- 📄 `docs/roadmap_v_0_3.md`

At a high level, the goals include:

- [ ] Implement minimal Global + SingleDirector agent over a small set of statutes/benefits.
- [ ] Add structured ingestion jobs for core Irish tax & welfare rules.
- [ ] Implement CGT & R&D agents with timeline-aware reasoning.
- [ ] Wire in change detection and a notification feed when new rulings / updates affect parts of the graph.
- [ ] Improve graph visualisation / inspector for power users and advisors.
- [ ] Harden prompts, redaction, and egress guard for safety and robustness.

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

---

## License

_Choose a license appropriate for your goals (MIT / Apache-2.0 / other) and document it here._

