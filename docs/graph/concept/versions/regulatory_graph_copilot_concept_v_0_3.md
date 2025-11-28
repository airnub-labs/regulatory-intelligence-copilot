# Regulatory Graph Copilot – Concept v0.3

## 1. Core Idea

Build a **Regulatory Intelligence Copilot** that:

- Represents **tax, social welfare, pensions, capital gains, and EU coordination law** as a **graph**, not flat documents.
- Uses that graph to surface:
  - Hidden **mutual exclusions** ("if you claim X, you can’t claim Y").
  - **Lock‑in periods** and **time‑based eligibility windows**.
  - Cross‑domain interactions (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU rules).
  - **Cross‑jurisdiction interactions** (e.g. Ireland ↔ Malta ↔ Isle of Man ↔ other EU states).
- Keeps sensitive scenario data inside your own infrastructure, with:
  - **Provider‑agnostic LLM routing** (OpenAI Responses + GPT‑OSS, Groq, local/OSS models).
  - Optional **fully local** LLM mode where no data leaves your EU cloud/VPS.
  - A dedicated **egress guard** that redacts PII and unnecessary details before any external call.
- Uses an **MCP gateway** plus ingestion jobs to stay up to date on:
  - Court decisions (TAC, Irish courts, CJEU).
  - Revenue eBriefs & manuals.
  - Pensions Authority, DSP/social welfare, EU regulations.
- Exposes this intelligence via:
  - **Specialist agents** (e.g. Single Director IE Social Safety Net, IE Self‑Employed Tax, IE CGT Investor, IE R&D Credit, EU Cross‑Border coordination).
  - A **Global Regulatory Agent** that can combine multiple lenses in one conversation.

The system is a **research and explanation copilot**, not a legal/tax/welfare advisor. It helps:

- **Advisors** (accountants, tax professionals, welfare advisers) do faster, better‑documented research.
- **End users** (e.g. single‑director company owners) understand what might apply to them and what questions to ask.

Ireland and EU rules are the **initial focus**, but the architecture is explicitly cross‑jurisdiction and can grow to include other countries.

---

## 2. Why This Problem Fits the Architecture

### 2.1 Regulation Is Graph‑Shaped

Tax, welfare, pensions, CGT and EU law are full of cross‑references like:

- "Subject to section …"
- "Notwithstanding subsection (3)…"
- "This relief shall not apply where the individual has claimed under section …"
- "No further claim shall be made … within the period of … years."

These create:

- **Mutual exclusions** – one claim blocks another.
- **Lock‑ins and cooling‑off periods** – choices that constrain future options for years.
- **Priority & ordering rules** – the order in which reliefs/benefits are applied matters.
- **Timing‑sensitive events** – especially for CGT (disposals vs reacquisitions, share matching).
- **Cross‑border interactions** – which country’s system applies, how contributions aggregate, how treaties and EU regulations coordinate.

Modelling this as a graph:

- Nodes: statutes/sections, reliefs, benefits, contributions, timelines, transaction types, cases, EU instruments, jurisdictions.
- Edges (examples):
  - `:EXCLUDES`, `:MUTUALLY_EXCLUSIVE_WITH`.
  - `:LOCKS_IN_FOR_PERIOD`, `:COOLING_OFF_PERIOD`, `:LOOKBACK_WINDOW`.
  - `:REFERENCES`, `:REQUIRES`, `:LIMITED_BY`, `:OVERRIDES`.
  - `:COORDINATED_WITH`, `:TREATY_LINKED_TO`, `:IMPLEMENTED_BY`, `:INTERPRETS`.

This makes it possible to answer:

- "If I claim X now, what else do I rule out and for how long?"
- "If I time these disposals/purchases like this, how does that affect CGT loss relief?"
- "If I move from country A to B, which social security and tax rules interact for my profile?"

### 2.2 How the Stack Maps

| Component                    | Role in This Product                                                                                   |
|------------------------------|--------------------------------------------------------------------------------------------------------|
| **Memgraph**                 | Core **rule & interaction graph** – statutes, guidance, benefits, reliefs, timelines, cases, treaties |
| **E2B sandbox** (optional)   | Safe environment for **simulations and ingestion jobs**                                                |
| **MCP gateway**              | Pluggable **live data + change‑detection** from official & legal sources                              |
| **LLM Router + providers**   | **Reasoning + explanation** over graph slices and scenarios (OpenAI Responses, Groq, local/OSS)       |
| **Egress guard**             | Redacts PII/financial detail before any external tool/LLM                                             |
| **Expert agents**            | Pre‑configured lenses for specific profiles/jurisdictions/domains                                     |
| **Global regulatory agent**  | Orchestrator that stitches together multiple lenses for complex cases                                 |

Domain narrowing is handled at the **agent + prompt aspect** layer (persona, jurisdiction), not hard‑coded into the engine.

---

## 3. Core Use Cases

### 3.1 Revenue / Tax Rule Interaction

**Goal:** Reveal how tax rules interact, especially where one claim:

- Excludes another.
- Depends on time windows.
- Changes effective rates depending on ordering.

Examples:

1. **Deduction conflict detection**  
   "You’re claiming Relief A; this explicitly excludes Relief B in section …"  
   → Graph path: `ReliefA -[:EXCLUDES]-> ReliefB -[:APPLIES_TO]-> IncomeType`.

2. **Eligibility path‑finding**  
   "To claim R&D tax credit, you must meet these conditions and not have taken mutually exclusive reliefs."

3. **Scenario comparison**  
   "Compare sole trader vs single‑director company for this income mix and show which reliefs/benefits open or close under each."

4. **Annual change impact**  
   "Finance Act 2027 changed s.XXX – here are all dependent reliefs and mutual exclusions affected."

### 3.2 Self‑Employed & Single‑Director Social Welfare

**Goal:** Explain potential social welfare benefits and constraints for:

- Self‑employed individuals (e.g. PRSI Class S, voluntary contributions).
- Single‑director companies (proprietary directors, mixed PRSI situations).

Graph models:

- PRSI classes and contribution histories as abstract profiles.
- Contribution‑based conditions (number/type of contributions in a lookback window).
- Means‑tested vs contributory benefits.
- Mutually exclusive benefits or combinations.
- Interactions with salary vs dividends, spouse employment status, rental/investment income.

The EU layer adds:

- Which state’s system applies (social security coordination).
- Contribution aggregation across states.
- Case‑driven reinterpretations of "self‑employed" vs "worker".

### 3.3 Cross‑Domain Change Impact

**Goal:** Show how a change in one area ripples through tax, welfare, pensions, employment and CGT.

Examples:

- Pensions Authority changes PRSA limits → affects:
  - Income tax relief.
  - Employer PRSI.
  - BIK calculations.
  - Means tests.

- CJEU or TAC case redefines who counts as self‑employed → affects:
  - PRSI class.
  - Welfare entitlements.
  - Possibly tax and pension treatment.

The graph supports queries like:

> "This new ruling touches Node X. Show all connected nodes relevant to profile P, across tax, welfare, pensions and CGT."

### 3.4 Mutual Exclusions & Time‑Based Eligibility

**Goal:** Make **exclusions and time windows** first‑class.

Graph patterns:

- `(:ReliefA)-[:EXCLUDES]->(:ReliefB)`
- `(:Benefit)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Benefit)`
- `(:Rule)-[:LOCKS_IN_FOR_PERIOD {years: 4}]->(:PersonType)`
- `(:Condition)-[:LOOKBACK_WINDOW {days: 30}]->(:TransactionType)`
- `(:Relief)-[:AVAILABLE_ONCE_PER_PERIOD {period: "lifetime"}]->(:PersonType)`

This enables questions like:

- "If I claim this relief now, which other reliefs/benefits do I lose access to, and for how long?"
- "If I wait N months/years, do better combinations become possible?"

### 3.5 Capital Gains Tax (CGT) & Timing Strategies

**Goal:** Support reasoning about **timing of disposals and acquisitions** for CGT.

The system models:

- Disposals and reacquisitions of shares/securities.
- Timing windows that affect whether a loss is relievable or how it is matched.
- Anti‑avoidance rules and share matching rules.

Graph patterns:

- `(:Transaction)-[:DISPOSAL]->(:Asset)` / `(:Transaction)-[:ACQUISITION]->(:Asset)`.
- `(:Rule)-[:LOOKBACK_WINDOW {days: N}]->(:TransactionType)`.
- Relationships between transactions that influence loss matching.

Inside a sandbox, the system can simulate transaction sequences and:

- Show when losses are usable.
- Highlight timing patterns that weaken relief.

### 3.6 Cross‑Jurisdiction Scenarios

**Goal:** Support cross‑border situations without hard‑coding any one country as primary.

Examples:

- Single director company registered in Ireland, working partly in another EU country.
- Resident in Malta or Isle of Man with Irish corporate ties.
- Multi‑state contribution histories under EU social security coordination rules.

Graph modelling:

- `(:Jurisdiction {code: "IE" | "MT" | "IM" | …})` nodes.
- `:COORDINATED_WITH`, `:TREATY_LINKED_TO`, `:MIRRORS`, `:DERIVED_FROM` edges.
- Rules tagged with primary and secondary jurisdictions.

Agents and prompt aspects use this to:

- Frame answers for the user's **primary jurisdiction** while still surfacing relevant interactions with secondary jurisdictions.
- Make it clear when EU/coordination rules override or constrain national rules.

For details on how IE/UK/NI/IM/CTA/GI/AD are represented in the graph, see `docs/graph/special_jurisdictions_modelling_v_0_1.md`.

---

## 4. Role of MCP vs Batch Ingestion

### 4.1 Core Graph Ingestion

A base graph is built via ingestion jobs from:

- Primary legislation (tax, welfare, pensions, CGT).
- Revenue/authority guidance.
- Key EU regulations and implementing provisions.

These are updated periodically (e.g. annually, post‑Finance Act, or when major updates happen).

### 4.2 MCP for Freshness & Signals

MCP tools are used to:

- Monitor **change sources** (TAC decisions, eBriefs, manuals, Pensions Authority, DSP/gov.ie, eur‑lex, court sites).
- Fetch relevant documents when signals are detected.
- Extract:
  - Affected sections and rules.
  - New conditions, exclusions, or time bounds.
  - Cross‑domain and cross‑jurisdiction implications.

MCP is the **eyes & ears**; Memgraph is the **structured memory**.

### 4.3 Living Graph via Incremental Upserts

As conversations and update jobs discover new authoritative references:

- The system proposes nodes/edges.
- After basic validation, they are upserted into Memgraph.
- Future sessions automatically benefit from the enriched graph.

The graph evolves over time based on real use and real updates.

---

## 5. Change Impact & Notifications

### 5.1 Change Processing

A typical change pipeline:

1. **Detect** – MCP sees a new case, guidance, or update.
2. **Parse & map** – Extract affected rules/sections/benefits.
3. **Graph update** – Upsert `:Case`, `:Guidance`, `:Update` nodes and `:AFFECTS`, `:CHANGES_INTERPRETATION_OF`, `:NARROWS`, `:EXPANDS` edges.
4. **Impact traversal** – Query the graph to find connected rules, exclusions, timelines, and cross‑border links.
5. **Profile matching** – Match impacted rules to stored profile tags/person types (for advisors’ client segments, etc.).
6. **Notify** – Surface concise change summaries plus a graph view entry point.
7. **Explain** – Agents use LLMs to explain what changed and which questions users/advisors should consider.

### 5.2 Safety & Framing

- Always framed as **research and intelligence**, not binding advice.
- Messages emphasise:
  - Which rules and relationships changed.
  - What to discuss with advisors or authorities.

---

## 6. Agent‑Based Architecture

### 6.1 Core Layer

- **Graph layer (Memgraph)** – stores rules, relationships, timelines, jurisdictions, and change events.
- **LLM layer (LlmRouter)** – routes tasks to OpenAI Responses (incl. GPT‑OSS), Groq, or local/OSS models.
- **Egress guard** – sanitises prompts for any external calls.
- **MCP + sandbox layer** – handles ingestion, simulations, and untrusted or heavy workloads.

### 6.2 Specialist Agents

Sample agents:

- `SingleDirector_IE_SocialSafetyNet_Agent`
- `IE_SelfEmployed_TaxAgent`
- `IE_CGT_Investor_Agent`
- `IE_RnD_TaxCredit_Agent`
- `EU_CrossBorder_Coordinator_Agent`
- Future: analogous agents for other EU states, Malta, Isle of Man, etc.

Each agent defines:

- Default **jurisdiction set**.
- Relevant graph regions (labels/edge types).
- Allowed MCP tools.
- A specialised system prompt built via **prompt aspects**.

### 6.3 Global Regulatory Agent

A **GlobalRegulatoryComplianceAgent**:

- Is the main entry point for `/api/chat`.
- Uses persona + jurisdictions + question type to route work to specialist agents.
- Merges their outputs into a coherent answer with:
  - Which agents contributed.
  - Which jurisdictions were involved.
  - Which rules/nodes were key.

This allows both:

- Narrow expert conversations ("just show me my CGT timing patterns"), and
- Broad multi‑lens explorations ("how do these tax, welfare and pension rules interact for me?").

---

## 7. MVP Slice vs Platform Scope

- **Platform scope:** multi‑domain, multi‑jurisdiction, supporting both professionals and end users with a living graph and agent ecosystem.
- **Architecture:** already supports this scope (graph, agents, LLM router, MCP, cross‑jurisdiction design).
- **MVP slice:**
  - Focus on Ireland + EU coordination first.
  - Start with self‑employed / single‑director social welfare, plus a small tax + CGT overlay.
  - Add more depth (R&D credits, pensions, cross‑border) as the graph matures.

Nothing in the architecture forces you into a single lens; agents are simply different views into the same regulatory graph brain.

---

## 8. Positioning & Value

### 8.1 Primary Audiences

1. **Professional users (B2B)**
   - Accounting and tax firms.
   - Welfare and financial advisers.
   - In‑house finance/compliance teams.

   Value:
   - Faster, more thorough cross‑domain research.
   - Clear visualisation of interactions, exclusions, and timelines.
   - Better internal documentation (graphs, citations, change history).

2. **End users (B2C)**
   - Self‑employed individuals.
   - Single‑director company owners.
   - Individuals with investment portfolios worried about CGT and timing.

   Value:
   - Understand potential entitlements and obligations.
   - See mutual exclusions and timing issues before making moves.
   - Arrive at advisors/Revenue/DSP with better questions.

### 8.2 Safety Line

- The system does **not** provide legal, tax or social welfare advice.
- It:
  - Surfaces rules, relationships, timelines, and change impacts.
  - Helps users and advisors see plausible applicability and trade‑offs.
  - Encourages consultation with qualified professionals and official sources.
- Architecture (LLM router + local model support + egress guard) is designed so:
  - Sensitive data can stay within your EU infrastructure if required.
  - External tools and cloud LLMs are optional and tightly controlled.

---

**North Star:**  
Help people and advisors understand how complex, interacting rules affect them – across time, domains, and jurisdictions – without pretending to be the final authority on what they must do.

