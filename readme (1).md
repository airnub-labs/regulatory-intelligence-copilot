# Regulatory Intelligence Copilot 🧭📚

> **Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.**
>
> ⚠️ **Important:** This project is a **research tool**, not legal or tax advice. Always confirm outcomes with Revenue, DSP, the Pensions Authority, your accountant, or another qualified professional.

---

## What This Is

The **Regulatory Intelligence Copilot** is a fork and evolution of the original `rfc-refactor` project.

Instead of auditing HTTP APIs against RFCs and OWASP, this repo focuses on:

- 🧠 **Graph-based reasoning over regulations** – Irish tax, social welfare, pensions, CGT, and EU rules are modelled as a **knowledge graph** in Memgraph.
- 💬 **Chat-first UX** – a single conversational interface where users ask natural-language questions.
- 🧑‍💼 **Expert agents** – specialised agents for:
  - Single-director Irish companies.
  - Self-employed welfare & social safety net.
  - Irish CGT & investments.
  - R&D tax credits.
  - EU social security / regulatory effects.
- 🌐 **Global Regulatory Agent** – a meta-agent that can reason across domains and explain interactions (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU).
- 🧪 **Sandboxed analysis** – all heavy work runs inside an **E2B sandbox**, with outbound calls routed through an **MCP gateway**.
- 🔐 **Privacy-first & non-advice** – PII redaction on egress and explicit “research-only” framing.

Under the hood, it reuses the original architecture patterns:

- Next.js app with a **single `/api/chat`** endpoint.
- **E2B sandbox** to host the internal agent runtime.
- **MCP tools** for Memgraph, LLMs (Groq), and legal document search.
- **Memgraph** as the core regulatory graph database.

---

## High-Level Architecture

At a high level, the system looks like this:

1. **User** types a question into the chat UI.
2. The **Next.js API route** (`POST /api/chat`) forwards the message and any basic profile info (e.g. self-employed, single director, investor) to the backend **compliance orchestrator**.
3. The orchestrator:
   - Decides which **agent** to invoke (global vs domain-specific).
   - Spins up or reuses an **E2B sandbox**.
4. Inside the sandbox, the selected **agent runner**:
   - Uses an **egress guard** to redact personal/financial data.
   - Queries **Memgraph** (via an MCP server) for relevant laws, benefits, reliefs, timelines, exclusions, and case law.
   - Optionally calls **legal search MCPs** to discover missing rules, then upserts them into the graph.
   - Uses a **timeline & exclusion engine** to reason about deadlines, lock-ins, and mutual exclusions.
   - Calls a **Groq LLM** (via MCP) to generate an explanation based on the question and graph slice.
5. The sandbox streams a **research-style answer** back through the orchestrator to `/api/chat` and then to the UI.

For a more detailed breakdown of components and data flow, see:

> 📄 **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## Core Concepts

### 1. Regulatory Graph (Memgraph)

All the interesting reasoning lives in a **graph**, not in ad-hoc prompts:

- Node types like `:Statute`, `:Section`, `:Benefit`, `:Relief`, `:Condition`, `:Case`, `:Guidance`, `:EURegulation`, `:Timeline`, `:ProfileTag`.
- Edge types like `CITES`, `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `IMPLEMENTED_BY`, `INTERPRETS`, `APPLIES_TO`.

This allows the system to:

- Surface **hidden interactions** (e.g. claiming one benefit excludes another, or a tax relief is limited by an EU rule).
- Model **time-based eligibility** (lookback windows, waiting periods, lock-ins).
- Represent **cross-domain dependencies** (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU).

### 2. Agent Lenses

Agents are **different lenses on the same graph**:

- `SingleDirector_IE_SocialSafetyNet_Agent`
- `IE_SelfEmployed_TaxAgent`
- `IE_CGT_Investor_Agent`
- `IE_RnD_TaxCredit_Agent`
- `EU_Regulation_Agent`
- `GlobalRegulatoryComplianceAgent` (orchestrator / meta-agent)

Each agent:

- Has a domain-specific system prompt.
- Queries a **filtered subgraph** (e.g. only rules tagged as relevant for a single director).
- Uses the same sandbox + MCP + timeline engine stack.

See **[AGENTS.md](./AGENTS.md)** for detailed agent definitions.

### 3. E2B + MCP + Egress Guard

- All execution happens inside **E2B sandboxes**.
- The sandbox only talks to the outside via **MCP tools** (Memgraph, LLMs, legal search, etc.).
- An **egress guard** ensures we don’t leak sensitive details to external tools:
  - Redacts PII like names, addresses, PPSNs, phone numbers, emails.
  - Buckets or obfuscates exact financial figures where possible.
  - Sends only what’s needed to reason about rules and relationships.

---

## Who This Is For

- **Self-employed people** in Ireland who want to understand:
  - What they may be entitled to (benefits, credits) and what might conflict.
  - How different decisions interact across tax, welfare, pensions, CGT.
- **Single-director company owners** who juggle:
  - Corporation tax, PRSI, salary vs dividends, and social welfare entitlements.
- **Advisors & accountants** who need:
  - Faster research across multiple domains.
  - A graph view of rule interactions, mutual exclusions, and timelines.
- **Curious developers / researchers** exploring:
  - GraphRAG beyond simple document retrieval.
  - Agentic architectures on real-world regulations.

Again: **this tool does not replace professional advice**. It’s there to:

- Surface relevant rules.
- Reveal interactions and trade-offs.
- Help you ask better questions of real-world authorities and professionals.

---

## Features (Current & Planned)

- 🧠 **Graph-based regulatory reasoning** (Memgraph) over laws, benefits, reliefs, guidance, and case law.
- ⏱️ **Timeline & exclusion logic** for deadlines, waiting periods, lookback windows, and lock-ins.
- 🧑‍💼 **Domain agents + Global agent** for different personas and use cases.
- 🧪 **E2B sandboxed runtime** with MCP tools for Memgraph, Groq, and legal search.
- 🔎 **On-demand graph enrichment** when the system encounters new or underspecified areas.
- 🔐 **Egress guard & non-advice stance** baked into prompts and pipeline.
- 🔔 **(Planned)** Change detection & notifications when new court rulings or legislative updates affect your situation.

---

## Getting Started

> ⚠️ This is an experimental research project. Don’t rely on it for real compliance decisions.

### 1. Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** (or your preferred package manager)
- **Docker** (for Memgraph + MCP gateway + E2B sidecars)
- Accounts / API keys for:
  - **E2B**
  - **Groq** (for LLM inference)
  - Any legal search APIs you wire into MCP (optional / pluggable)

### 2. Clone & Install

```bash
git clone https://github.com/<your-org>/regulatory-intelligence-copilot.git
cd regulatory-intelligence-copilot

# Install dependencies (adjust if you prefer npm or yarn)
pnpm install
```

### 3. Environment Configuration

Create a `.env` or `.env.local` file (depending on your setup) and configure environment variables, for example:

```bash
E2B_API_KEY=...
GROQ_API_KEY=...
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=...
MEMGRAPH_PASSWORD=...
MCP_GATEWAY_URL=http://localhost:port
# Any other MCP-specific config
```

The exact env var names may differ depending on how you wire up the MCP gateway and clients. Keep all secrets **out of source control**.

### 4. Start Infra (Memgraph + MCP Gateway)

With Docker installed, bring up the graph DB and MCP gateway stack. A typical pattern is:

```bash
# Example – adjust to match your docker-compose.yml
docker compose up memgraph mcp-gateway
```

Ensure:

- Memgraph is reachable at the URI you configured.
- The MCP gateway exposes:
  - `memgraph-mcp`
  - `llm-groq-mcp`
  - `legal-search-mcp` (or similar)

### 5. Run the Dev Server

```bash
# Start the Next.js dev server
pnpm dev

# By default, visit:
http://localhost:3000
```

You should see the chat UI. Try questions like:

- “I’m a single director of an Irish limited company, what do I need to know about PRSI and Illness Benefit?”
- “If I sell and then buy back shares within 30 days, how might that affect CGT loss relief?”

(Answers will depend on how much law you’ve already ingested into Memgraph.)

---

## Repository Layout (Target)

The target structure for the forked repo is roughly:

```txt
regulatory-intelligence-copilot/
  apps/
    web/                 # Next.js chat UI + /api/chat
  packages/
    compliance-core/     # Orchestrator, agent interfaces, timeline/exclusion logic
    graph-client/        # Thin Memgraph client wrapper (via MCP)
    egress-guard/        # PII & financial redaction utilities
  docs/
    ARCHITECTURE.md
    AGENTS.md
    MIGRATION_PLAN.md
    specs/
      graph_schema_v0.1.md
      timeline_engine_v0.1.md
```

The exact names may change as you implement, but the idea is:

- **apps/web** – UI + HTTP edge.
- **compliance-core** – brain of the orchestration and agents.
- **graph-client** – isolated Memgraph access, easy to test.
- **egress-guard** – reusable redaction logic.
- **docs/** – living design docs.

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
  - To the very messy domain of real-world regulations.

Always treat outputs as **starting points for further research**.

---

## Roadmap (High-Level)

- [ ] Implement minimal Global + SingleDirector agent over a small set of statutes/benefits.
- [ ] Add structured ingestion jobs for core Irish tax & welfare rules.
- [ ] Implement CGT & R&D agents with timeline-aware reasoning.
- [ ] Wire in basic change detection and a simple notification feed.
- [ ] Improve graph visualisation / inspector for power users and advisors.
- [ ] Harden prompts & redaction for safety and robustness.

---

## Contributing

Contributions, suggestions, and critiques are welcome — especially from:

- Accountants / tax advisors.
- Welfare rights advocates.
- Legal professionals.
- Graph and AI researchers.

Please open issues or PRs with:

- Clear descriptions of the regulatory scenarios you care about.
- Pointers (links) to official legislation or guidance you think should be modelled.

---

## License

_Choose a license appropriate for your goals (MIT / Apache-2.0 / other) and document it here._

