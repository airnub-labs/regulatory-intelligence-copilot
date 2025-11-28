# Regulatory Graph Copilot for Irish Self‑Employed, Single Directors & Advisors – Concept v0.2

## 1. Core Idea

Build a **Regulatory Intelligence Copilot** for Ireland that:

- Understands **Revenue (tax) law**, **social welfare rules**, **pension regulations**, **capital gains rules**, and **EU coordination/case law** as a **graph**, not isolated documents.
- Uses that graph to reveal **hidden interactions**, including:
  - When one relief/benefit explicitly **disqualifies** or **excludes** another.
  - When rules create **lock‑in periods** or **time‑based eligibility windows** (e.g. if you do X, you can’t do Y for N years).
  - When timing of transactions (e.g. share disposals/reacquisitions for CGT) affects eligibility for relief.
- Runs all sensitive calculations and data handling inside an **E2B sandbox**, with **egress redaction**.
- Uses an **MCP gateway** to stay up‑to‑date with:
  - Court decisions (TAC, Irish courts, CJEU).
  - Revenue eBriefs & guidance updates.
  - Pensions, welfare, and EU rule changes.
- Exposes this intelligence via:
  - **Expert agents** (e.g. “Single Director IE”, “Self‑Employed Welfare”, “CGT & Investments”, “R&D Credit”), and
  - A **Global Expert Agent** that can connect across all lenses and domains.

The system is a **research & explanation tool**, not a legal/tax advisor. It supports:

- **Advisors** (accountants, tax professionals, welfare advisers) in doing faster, better‑documented research.
- **End users** (e.g. self‑employed / single‑director company owners) in understanding what might apply to them and what questions to ask professionals.

---

## 2. Why This Problem Fits Your Architecture

### 2.1. Regulation Is Graph‑Shaped, Including Mutual Exclusions & Time Rules

Irish tax, welfare, pension and CGT regimes are full of cross‑references such as:

- “Subject to section …”
- “Notwithstanding subsection (3)…”
- “This relief shall not apply where the individual has claimed under section …”
- “No further claim shall be made in respect of … within the period of … years.”

They create:

- **Mutual exclusions**: claiming one relief/benefit can make you ineligible for another.
- **Lock‑in and cooling‑off periods**: timelines during which you can or cannot make certain claims.
- **Priority & ordering rules**: which claim/relief is applied first and how that affects the rest.
- **Timing‑sensitive CGT scenarios**: e.g. when selling and then buying back the same shares can restrict how losses are relieved.

A graph can model all of this explicitly:

- Nodes: sections, reliefs, benefits, conditions, time windows, transaction types.
- Edges:
  - `:EXCLUDES` / `:MUTUALLY_EXCLUSIVE_WITH`
  - `:LOCKS_IN_FOR_PERIOD` / `:COOLING_OFF_PERIOD`
  - `:LOOKBACK_WINDOW` (e.g. “consider transactions in the last N days”)
  - `:REFERENCES` / `:REQUIRES` / `:LIMITED_BY` / `:OVERRIDES`

This makes it possible to answer:

- “If I claim X now, what else do I rule out for the next N years?”
- “If I time these disposals/purchases like this, how does that affect CGT loss relief?”

### 2.2. How Your Stack Maps

| Component        | Role in This Product                                                                         |
|------------------|----------------------------------------------------------------------------------------------|
| **Memgraph**     | Core **rule & interaction graph**: statutes, guidance, benefits, reliefs, timelines, cases. |
| **E2B sandbox**  | Safe environment for **calculations, scenario simulation, ingestion jobs**.                 |
| **MCP gateway**  | Pluggable **live data + change‑detection** from official & legal sources.                   |
| **Groq LLM**     | **Reasoning + explanation** over graph slices and user scenarios.                           |
| **Egress guard** | Redacts PII/financial detail before anything leaves the sandbox.                            |
| **Expert agents**| Pre‑configured lenses for specific profiles & problems.                                     |
| **Global agent** | Cross‑domain “orchestrator” able to stitch together multiple lenses for complex cases.      |

The **architecture is global**; domain narrowing is handled at the agent layer, not in the core.

---

## 3. Core Use Cases

### 3.1. Revenue / Tax Rule Interaction

**Goal:** Show how tax rules interact, especially where one claim:

- Excludes another.
- Depends on time windows (e.g. claiming within certain accounting periods).
- Changes effective rates depending on ordering.

Examples:

1. **Deduction conflict detection**  
   “You’re claiming Relief A; this explicitly excludes Relief B in section …”  
   → Graph path: `ReliefA -[:EXCLUDES]-> ReliefB -[:APPLIES_TO]-> IncomeType`.

2. **Eligibility path‑finding**  
   “To claim R&D Tax Credit, you must meet these conditions and not have taken mutually exclusive reliefs.”

3. **Scenario simulation** (inside E2B)  
   Compare structures (sole trader vs single‑director company, changes in remuneration), and show how allowed reliefs change.

4. **Annual change impact (Finance Act)**  
   “Finance Act 2027 changed s.XXX – here are all dependent reliefs and mutual exclusions affected.”

### 3.2. Self‑Employed & Single‑Director Social Welfare

**Goal:** Explain possible social welfare benefits & constraints for:

- Self‑employed individuals (PRSI Class S, etc.).
- Single‑director Irish companies (proprietary directors, mixed PRSI situations).

Key complexities modelled in the graph:

- PRSI classes & voluntary contributions.
- Contribution‑based conditions (e.g. number of contributions in a lookback period).
- Means‑tested vs contributory schemes.
- Mutually exclusive benefits or combinations (e.g. specific combinations you can’t claim at the same time).
- Dependencies between:
  - Salary vs dividends.
  - Spouse as employee vs director.
  - Rental/investment income vs earned income.

The EU layer (Reg 883/2004 and case law) adds:

- Rules about which state’s system applies.
- Contribution aggregation across states.
- Case‑driven redefinitions of “worker” vs “self‑employed” and exportability.

### 3.3. Cross‑Domain Change Impact

**Goal:** Show how a change in one area ripples through tax, welfare, pensions, and employment.

Examples:

- Pensions Authority changes PRSA contribution limits → affects:
  - Income tax relief rules.
  - Employer PRSI treatment.
  - BIK calculations.
  - Means tests for some benefits.

- New CJEU or TAC case changes the interpretation of “self‑employed” in social security → affects:
  - PRSI classification.
  - Welfare entitlements.
  - Possibly tax treatment and pension rules.

The graph stores both **domain edges** and **cross‑domain edges**, allowing impact analysis queries like:

> “This new rule/update/case touches Node X. Show all connected nodes across tax, welfare, pensions, and PRSI that are relevant to profile P.”

### 3.4. Mutual Exclusions & Time‑Based Eligibility

**Goal:** Make **exclusions and time windows** first‑class citizens in the knowledge graph.

Graph modelling patterns:

- `(:ReliefA)-[:EXCLUDES]->(:ReliefB)`
- `(:Benefit)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Benefit)`
- `(:Rule)-[:LOCKS_IN_FOR_PERIOD {years: 4}]->(:PersonType)`
- `(:Condition)-[:LOOKBACK_WINDOW {days: 30}]->(:TransactionType)`
- `(:Relief)-[:AVAILABLE_ONCE_PER_PERIOD {period: "lifetime"}]->(:PersonType)`

This allows questions like:

- “If I claim this relief now, which other reliefs or benefits do I lose access to, and for how long?”
- “If I wait N months/years, do different options open up?”
- “Are there combinations that are strictly dominated (worse overall) compared to waiting or choosing differently?”

Groq uses these edges to explain:

- The **trade‑offs over time**.
- Which decisions are **irreversible or costly to reverse**.

### 3.5. Capital Gains Tax (CGT) & Timing‑Sensitive Strategies

**Goal:** Support reasoning about **timing of disposals and acquisitions** for CGT, especially around loss relief and anti‑avoidance constraints.

This includes:

- Modelling **disposals and reacquisitions** of shares/securities.
- Capturing **timing windows** where certain pairings of disposal/repurchase affect whether a loss can be relieved or how it is matched.
- Representing rules like:
  - “If you repurchase the same asset within X days under conditions Y, loss Z may not be relievable in the usual way.”
- Incorporating **share matching rules**, **pools**, and **specific anti‑avoidance rules** as graph nodes/edges.

In the graph:

- `(:Transaction)-[:INVOLVES]->(:Asset)`
- `(:Transaction)-[:DISPOSAL]->(:Asset)`
- `(:Transaction)-[:ACQUISITION]->(:Asset)`
- `(:Rule)-[:LOOKBACK_WINDOW {days: N}]->(:TransactionType)` for matching.

Inside the E2B sandbox:

- You can simulate proposed transaction sequences.
- Use the graph + calculators to show:
  - When losses are usable.
  - When timing makes relief less effective.

**Important:** The system **does not** give personalised advice like “do this transaction on this exact date”; instead it:

- Explains the **constraints and patterns** in the rules.
- Helps users and advisors see **which questions** to ask and **which timing issues** to consider.

---

## 4. Role of MCP vs Pure Ingestion

### 4.1. Core Ingestion

Use ingestion to build the base graph from:

- Primary tax legislation (TCA, etc.).
- Social welfare and pensions legislation.
- Revenue manuals and welfare guidance.
- Core CGT rules and share matching/anti‑avoidance provisions.
- Key EU regulations (e.g. social security coordination).

This base is updated:

- Annually/periodically (Finance Acts, consolidated updates).
- As manual/guidance structures change significantly.

### 4.2. MCP for Freshness & Cross‑Domain Signals

Use MCP to:

- Monitor **change sources**:
  - Tax Appeals Commission decisions.
  - Revenue eBriefs and Tax & Duty Manual updates.
  - Pensions Authority guidance.
  - DSP/gov.ie welfare updates.
  - EU case law and relevant judgments.
  - Possibly WRC/employment law updates where they affect BIK/PRSI.
- Fetch relevant documents when a change is detected.
- Extract and map:
  - Affected sections.
  - New conditions, exclusions, or timelines.
  - Relationships to existing nodes.

MCP is the **eyes & ears**; Memgraph is the **memory and structure**.

---

## 5. Change Impact & Notifications

### 5.1. Change Processing Pipeline

1. **Detection (MCP)**  
   A source reports a new decision, guidance, or update.

2. **Parsing & Mapping**  
   Extract:
   - Which rules/sections/benefits/reliefs/conditions are affected.
   - Whether it narrows, expands, clarifies or introduces exclusions/time limits.

3. **Graph Update (Memgraph)**  
   Upsert nodes (`:Case`, `:Guidance`, `:Update`) and edges:
   - `:NARROWS`, `:EXPANDS`, `:CLARIFIES`, `:EXCLUDES`, `:LOCKS_IN_FOR_PERIOD`.

4. **Impact Query**  
   From the changed nodes, traverse to find:
   - Affected reliefs/benefits.
   - Related time windows and exclusions.
   - Cross‑domain connections (tax ↔ welfare ↔ pensions ↔ CGT).

5. **User Matching**  
   Users (and advisor client profiles) are represented via:
   - PersonType (e.g. single director, self‑employed, PAYE only).
   - PRSI classes, benefit interests.
   - Asset/transaction patterns (for CGT‑relevant users).

6. **Notifications**  
   For each impacted user/profile:
   - Send concise update plus link to graph view.

7. **Explain & Explore**  
   Global or expert agents use Groq to explain:
   - What changed.
   - Which rules it touches.
   - What high‑level questions the user/advisor should consider.

### 5.2. Safety & Framing

- Always framed as **regulatory intelligence and research**.
- Outputs are:
  - Explanations of rules and interactions.
  - Lists of potentially relevant provisions.
  - Suggested **questions to take to Revenue/DSP/your advisor**.

---

## 6. Agent‑Based Architecture

### 6.1. Core Layer (Global)

- Single global graph (Memgraph) with:
  - Tax, welfare, pensions, CGT, employment law snippets, EU regulations, cases.
- Single E2B sandbox layer for:
  - Calculations and simulations.
  - Ingestion and transformation jobs.
- Single MCP gateway for tool access.
- Single egress guard for redaction.

### 6.2. Expert Agents (Lenses)

Examples:

- `SingleDirector_IE_SocialSafetyNet_Agent`
- `IE_SelfEmployed_TaxAgent`
- `IE_CGT_Investor_Agent`
- `IE_RnD_TaxCredit_Agent`
- `EU_CrossBorder_Worker_Agent`

Each expert agent defines:

- **Profile assumptions** (jurisdiction, person type, income/asset focus).
- **Graph filters** (node labels and edge types that matter for that lens).
- **Tooling subset** (which MCP tools it may call).
- **System prompt** (voice, scope, refusal rules).

### 6.3. Global Expert Agent

On top of specialist agents, define a **Global Expert Agent** that can:

- Act as an orchestrator for complex queries spanning multiple domains.
- Decide which specialist agents to invoke, in what order.
- Merge and reconcile their outputs.

Use cases:

- Advisors handling complex SME clients where:
  - Tax, welfare, pensions, PRSI and CGT all interplay.
- High‑level “what changed this quarter that matters to my portfolio of clients?” views.
- Exploratory questions like:
  - “Show me everything that might affect a self‑employed director with overseas income, pension contributions, and an investment portfolio.”

The Global Expert Agent:

- Uses the same core architecture.
- Has broader access to graph regions and MCP tools.
- Is **explicitly pitched at professional users** (accountants/tax/welfare advisors).

---

## 7. MVP Slice vs Platform Scope

- **Platform scope:** global, multi‑domain, multi‑agent, supports both professionals and end users.
- **Architecture:** already designed to support this wide scope.
- **MVP slice:** can still be narrow for implementation sanity, e.g.:
  - Self‑employed / single‑director social welfare + a small tax/pension overlay.
  - Later adding CGT and more complex timing interactions as the graph matures.

Crucially, **nothing in the architecture limits you** to a single lens like Single Director; agents are just different entry points into the same regulatory graph brain.

---

## 8. Positioning & Value Proposition

### 8.1. Primary Audiences

1. **Professional users (B2B)**
   - Accounting and tax firms.
   - Welfare and financial advisers.
   - In‑house finance/compliance teams.

   Value:
   - Faster, more thorough research across multiple domains.
   - Clear visualisation of interactions, exclusions, and timelines.
   - Better documentation of reasoning (e.g. exportable graphs & citations for internal files).

2. **End users (B2C)**
   - Self‑employed individuals.
   - Single‑director company owners.
   - People with investment portfolios concerned about CGT and timing.

   Value:
   - Understand potential entitlements and obligations.
   - Learn about mutual exclusions and timing issues before making decisions.
   - Arrive at advisors/Revenue/DSP with better questions and context.

### 8.2. Safety Line

- The system **does not provide legal or tax advice**.
- It:
  - Surfaces rules, interactions, and timelines.
  - Helps users understand **possible** applicability and trade‑offs.
  - Encourages consultation with professionals for any decisions that matter.
- E2B sandbox + egress guard ensure raw personal and financial data stays isolated.

---

This v0.2 concept spec now explicitly includes:

- **Mutual exclusions** and **time‑based eligibility/lock‑in rules**.
- A dedicated **CGT and timing‑sensitive domain**.
- Support for both **specialist agents** and a **Global Expert Agent** able to connect across all lenses.
- A clear framing for both **professional users** (firms/advisors) and **end users** (e.g. single‑director companies) as primary customers.

