# Regulatory Graph Copilot – Architecture

> **Goal:** A chat‑driven, graph‑backed regulatory copilot for Ireland that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal / tax advice or leaking sensitive data.

The system reuses the original RFC auditor’s strengths (E2B sandbox, MCP gateway, Memgraph graph, chat‑first UX) but pivots the business logic from HTTP/RFC auditing to **regulatory intelligence**.

---

## 1. High‑Level Overview

The system is a **single chat‑centric web app** that:

1. Runs a **Next.js** front‑end (`apps/web`) with a single chat UI.
2. Talks to a single backend endpoint: **`POST /api/chat`**.
3. Uses a **compliance core library** (`packages/compliance-core`) that:
   - Selects and orchestrates **agents** (global + domain‑specific).
   - Talks to an **E2B sandbox** for graph queries, scenarios, and ingestion.
   - Uses an **egress guard** to redact sensitive data before any outbound call.
4. Inside the **E2B sandbox**, an agent runtime:
   - Connects to **Memgraph** via the Memgraph MCP server.
   - Uses MCP tools to fetch legal / regulatory content (e.g. Revenue, gov.ie, EU law sources).
   - Maintains and queries a **regulatory knowledge graph** (tax, welfare, CGT, pensions, EU).
   - Uses a **timeline + exclusion engine** to reason about deadlines, lock‑ins, and mutual exclusions.
5. The main UI surface is a single chat that:
   - Accepts natural language questions.
   - Returns explanations and references to rules/sections.
   - Clearly states it is a research tool, not advice.

At every layer, the architecture is designed to be:

- **Graph‑first**: rules and relationships live in Memgraph.
- **Agentic**: separate agents for different personas / domains, plus a Global agent.
- **Sandboxed & redacted**: sensitive user data never leaves the E2B environment in raw form.
- **Extensible**: new domains (e.g. company law, sector‑specific rules) can be plugged into the same graph.

---

## 2. Request Flow (End‑to‑End)

1. **User sends a message** in the chat UI.
2. **Next.js API route** (`POST /api/chat`) receives the message plus any optional profile data (e.g. self‑employed, single director, investor).
3. The API route calls the **compliance orchestrator** in `packages/compliance-core`:
   - Normalises the message.
   - Runs light intent classification to route to a domain agent or the Global agent.
4. The orchestrator requests an **E2B sandbox session** (one per conversation or per request, depending on configuration).
5. Inside the sandbox, the **agent runtime**:
   - Applies the **egress guard** to the user message and profile (redacting PII/financial details).
   - Uses **Memgraph** (via MCP) to:
     - Retrieve relevant rules and relationships for the question.
     - Optionally grow the graph by calling external MCP tools, then upserting nodes/edges.
   - Uses the **timeline engine** to compute date‑sensitive aspects (deadlines, lookback windows, lock‑ins).
   - Calls a **Groq‑hosted LLM** (via MCP) with:
     - A domain‑specific system prompt.
     - Sanitised user question.
     - Summaries / subgraphs from Memgraph.
   - Receives a draft answer and post‑processes it:
     - Insert references to sections / benefits / cases.
     - Inject safety language (non‑advice disclaimer).
6. The sandbox streams the answer back through the orchestrator to `/api/chat`.
7. The Next.js API route streams the response to the UI as chat messages.

All outbound network calls from inside the sandbox go through:

- The **MCP gateway** (Memgraph MCP, legal search MCPs, etc.).
- The **egress guard** layer that removes or generalises sensitive values.

---

## 3. Frontend – `apps/web`

### 3.1 Chat UI

The web frontend is intentionally minimal:

- Single chat page (`/`) powered by a React + Tailwind + shadcn/ui stack.
- Messages are rendered as a scrollable conversation:
  - User bubbles.
  - Assistant bubbles (with optional “Agent: …” and “Rules referenced” metadata).
- Input box at the bottom:
  - Free‑text.
  - Optional shortcuts (“Ask about my company”, “Ask about my benefits”) that prefill a question.

### 3.2 Profile & Context

Optionally, a simple profile sidebar/component:

- Persona (self‑employed, single director, PAYE employee, investor, advisor).
- Very coarse info only (age band, whether they have a company, etc.).
- Stored client‑side or in a minimal backend profile document, and always passed through the egress guard before leaving the sandbox.

The profile is used to:

- Aid intent classification (which agent to use).
- Narrow graph queries (e.g. focus on rules that apply to a single director).

No detailed PII (names, PPSN, exact addresses) is required or stored.

---

## 4. Backend – `POST /api/chat` and Orchestrator

### 4.1 API Route

The single backend HTTP API is `/api/chat` (implemented in Next.js app router).

Responsibilities:

- Validate and normalise incoming payloads.
- Attach a **conversation ID** and lightweight session context.
- Invoke the **compliance orchestrator** with:
  - Message text.
  - Optional profile.
  - Conversation history (for continuity).
- Stream back assistant messages to the client.

### 4.2 Compliance Orchestrator (`packages/compliance-core`)

Core responsibilities:

- **Intent routing**:
  - Simple classifier or heuristic to choose between:
    - `GlobalRegulatoryComplianceAgent`
    - `SingleDirector_IE_SocialSafetyNet_Agent`
    - `IE_SelfEmployed_TaxAgent`
    - `IE_CGT_Investor_Agent`
    - `IE_RnD_TaxCredit_Agent`
  - Fall back to Global agent when ambiguous.
- **Sandbox session management**:
  - Request or reuse an E2B sandbox instance for the conversation.
  - Pass in the conversation’s context as environment / files if needed.
- **Agent invocation**:
  - Build an `AgentContext` (graph client proxy, MCP client proxy, timeline helper).
  - Call the selected agent “runner” inside the sandbox.
- **Safety wrapping**:
  - Ensure all agent outputs include:
    - Non‑advice disclaimer.
    - References to law as “may apply, must confirm with authorities / advisors”.

The orchestrator itself does **not** talk directly to Memgraph or external MCP tools. All such calls are proxied through the sandbox.

---

## 5. In‑Sandbox Runtime (E2B)

Inside the E2B sandbox we run a small Node.js/TypeScript runtime that:

- Hosts the **agent runners**.
- Hosts the **graph & timeline utilities**.
- Connects to the **MCP gateway** configured with:
  - `memgraph-mcp` (for Cypher queries).
  - `legal-search-mcp` (for Revenue / gov.ie / EU lookups).
  - `llm-groq-mcp` (Groq APIs).
  - Any additional tools (e.g. document loaders, PDF parsers).

### 5.1 Egress Guard

All outbound content passes through an `egressGuard`:

- Redacts obvious PII:
  - Names, addresses, PPSNs, IBANs, emails, phone numbers.
- Rounds or buckets exact financial figures (e.g. “~€Xk” instead of “€12,345.67”) where possible.
- Strips narrative details that are not needed for legal reasoning.
- Ensures prompts to LLMs/MCP tools are focused on **rules and relationships**, not on the user’s identity.

### 5.2 Agent Runner Interface

Every agent implements a common interface, e.g.:

```ts
interface AgentContext {
  memgraph: MemgraphClient;
  mcp: McpClient;
  timeline: TimelineEngine;
  now: Date;
  profile?: UserProfile;
  conversation: ConversationHistory;
}

interface AgentResult {
  answer: string;
  referencedNodes: Array<{ id: string; label: string; title: string }>;
  followUps?: string[];
}
```

The runtime includes:

- `GlobalRegulatoryComplianceAgent.run(context)`
- `SingleDirector_IE_SocialSafetyNet_Agent.run(context)`
- etc.

Each agent:

1. Uses `memgraph` to fetch a **subgraph** relevant to the question.
2. Optionally calls MCP tools to discover missing rules, then upserts them.
3. Uses `timeline` to compute deadlines or eligibility windows from graph data.
4. Calls `llm-groq-mcp` with:
   - A system prompt describing its domain and safety constraints.
   - A structured representation of the subgraph (compressed).
   - The sanitised question.
5. Returns an `AgentResult` to the orchestrator.

---

## 6. Memgraph – Regulatory Knowledge Graph

Memgraph is the **source of truth** for regulatory relationships.

### 6.1 Schema Overview

**Node labels (examples)**:

- `:Statute` – Acts / primary legislation (e.g. “Taxes Consolidation Act 1997”).
- `:Section` – Specific sections/subsections (e.g. “s.81”, “s.766”).
- `:Benefit` – Welfare and social benefits (e.g. “Jobseeker’s Benefit”).
- `:Relief` – Tax reliefs/credits (e.g. “R&D Tax Credit”).
- `:Condition` – Eligibility or application conditions.
- `:Timeline` – Abstract time windows / periods / deadlines.
- `:Case` – TAC, Irish court, or CJEU decisions.
- `:Guidance` – Revenue or DSP manuals, eBriefs, circulars.
- `:EURegulation` / `:EUDirective` – EU law.
- `:ProfileTag` – Tags representing user types (e.g. “SINGLE_DIRECTOR”, “SELF_EMPLOYED”, “INVESTOR”).

**Edge types (examples)**:

- `CITES`, `REFERENCES` – textual cross‑references.
- `REQUIRES` – a condition that must be satisfied.
- `LIMITED_BY` – caps, thresholds, or other limitations.
- `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH` – mutual exclusions between reliefs/benefits.
- `LOOKBACK_WINDOW` – relation to a Timeline node defining retrospective periods.
- `LOCKS_IN_FOR_PERIOD` – lock‑in or cooling‑off periods.
- `IMPLEMENTED_BY` – EU → Irish law implementation edges.
- `INTERPRETS`, `NARROWS`, `EXPANDS` – case law effects on statutes.
- `APPLIES_TO` – mapping to `ProfileTag` nodes.

### 6.2 GraphRAG‑Style Retrieval

Agents use a GraphRAG‑style flow:

1. For a given question + profile, build a query that:
   - Finds relevant nodes (law, benefits, reliefs) tagged with applicable `ProfileTag`s.
   - Expands neighbourhoods along `CITES`, `REQUIRES`, `EXCLUDES`, `LOOKBACK_WINDOW`, etc.
2. Compress that subgraph into a text/JSON representation.
3. Provide it to the LLM as structured context.

The graph can be seeded from static ingestion jobs and enriched on demand when agents discover gaps.

---

## 7. Timeline & Exclusion Engine

A small utility module inside the sandbox provides:

- Date arithmetic helpers.
- Converters from `Timeline` nodes and edge properties (e.g. `{ years: 4 }`) into concrete date ranges.
- Helpers like:
  - `isWithinLookback(transactionDate, lookbackNode, now)`
  - `lockInEndDate(lockInNode, triggeringEventDate)`

Agents combine this with graph data to answer:

- “If I claim X now, which other reliefs become unavailable, and for how long?”
- “If I delay action until next tax year, what changes?”

The LLM is instructed to always:

- Mention relevant time windows and mutual exclusions when present in the graph.
- Avoid precise prescriptive timing (no “you should sell on exactly this date”).

---

## 8. MCP Topology

Outside the E2B sandbox, Docker runs an MCP ecosystem similar in spirit to the original auditor, but with different tools:

```txt
+------------------------------+
|         MCP Gateway          |
|------------------------------|
|  memgraph-mcp                |
|  legal-search-mcp            |
|  llm-groq-mcp                |
|  (optional) doc-loader-mcp   |
+------------------------------+
```

- **memgraph-mcp** – exposes a Cypher API into Memgraph from inside the sandbox.
- **legal-search-mcp** – wraps external legal/document search APIs (Revenue, gov.ie, eur-lex, etc.), returning snippets and citations.
- **llm-groq-mcp** – talks to Groq LLM APIs with streaming.
- **doc-loader-mcp** – optional helper to ingest PDFs/HTML into sandbox jobs for parsing.

The E2B sandbox only talks to MCP tools via this gateway, always through the egress guard.

---

## 9. Data Ingestion & Change Tracking

### 9.1 Initial Seeding

Initial Memgraph population is done via E2B “ingestion” tasks:

- Parse selected:
  - TCA sections for corporate tax, R&D, CGT basics.
  - Key social welfare acts for core benefits.
  - Selected EU regulations/directives affecting social security / tax.
- Insert nodes/edges using Cypher via `memgraph-mcp`.

These jobs can be triggered manually during development and automated later.

### 9.2 On‑Demand Enrichment

When a question touches an area with sparse coverage:

1. The agent calls `legal-search-mcp` with a focused query.
2. The sandbox parses results into candidate nodes/edges.
3. After light validation, those nodes/edges are upserted into Memgraph.
4. Future questions benefit from the richer graph.

### 9.3 Change Detection & Notifications

A background process (could also run inside E2B) periodically:

- Queries legal sources (RSS feeds, APIs) via `legal-search-mcp`.
- Detects new:
  - Finance Acts / amendments.
  - Revenue eBriefs / manual updates.
  - TAC / court decisions.
  - Pensions Authority / DSP changes.
  - EU regulations / CJEU cases.
- Upserts `:Update` / `:Case` / `:Guidance` nodes with edges to affected rules.
- Marks which `ProfileTag`s are impacted.

The frontend can surface a simple notification stream:

- “New TAC decision may affect Illness Benefit for Class S contributors.”
- “Finance Act 2027 changed CGT rules relevant to investors like you.”

---

## 10. Safety, Non‑Advice, and Roles

The architecture explicitly supports:

- **Research, not advice**:
  - Every agent prompt and answer template includes language like:
    - “This is informational, not legal/tax advice.”
    - “You should confirm with Revenue, DSP, Pensions Authority, or a qualified advisor.”
- **Role separation**:
  - Domain agents (tax, welfare, CGT, EU) stay within their lane.
  - Global agent orchestrates but does not invent new law.
- **Data protection**:
  - PII/financial redaction via egress guard.
  - Minimal profile storage.
  - No raw documents or transcripts are sent unfiltered to external tools.

---

## 11. Extensibility & Roadmap

The design intentionally leaves room to:

- Add more agents:
  - Sector‑specific (e.g. construction RCT, tech stock options).
  - Cross‑border workers (multi‑state contributions).
- Plug in additional MCP tools:
  - Jurisdiction‑specific legal databases.
  - Local tax calculators run inside E2B.
- Provide advisor‑oriented features:
  - Multiple client profiles.
  - Saved graphs and explanations.
  - Exportable “research bundles” with graph snippets and citations.

At its core, the architecture stays the same:

- **One chat endpoint.**
- **One sandboxed agent runtime.**
- **One evolving regulatory knowledge graph.**

Everything else is layering more capabilities and domains on top of that foundation.

