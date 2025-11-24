# Regulatory Graph Copilot for Irish Self‑Employed & Single Directors – Concept v0.1

## 1. Core Idea

Build a **Regulatory Intelligence Copilot** for Irish self‑employed people and single‑director companies that:

- Understands **Revenue (tax) law**, **social welfare rules**, **pension regulations**, and **EU coordination rules** as a **graph**, not isolated documents.
- Uses that graph to reveal **hidden interactions**:
  - When one relief disqualifies another.
  - When a pension/tax change affects PRSI or welfare entitlement.
  - When an EU or court decision silently changes how an existing rule applies.
- Runs all sensitive calculations and data handling inside an **E2B sandbox**, with **egress redaction**.
- Uses an **MCP gateway** to stay up‑to‑date with:
  - Court decisions.
  - Revenue eBriefs & guidance updates.
  - Pensions, welfare, and EU rule changes.
- Exposes everything through **expert agents** ("Single Director IE", "Self‑Employed Welfare", etc.) that narrow the domain for the user.

The system is a **research & explanation tool**, not a legal/tax advisor. It helps users and professionals *see* which rules apply and how they interact, so they can make informed decisions and talk to Revenue/DSP/advisors with better questions.

---

## 2. Why This Problem Fits Your Architecture

### 2.1. Tax & Welfare Are Graph‑Shaped, Not Linear

Irish tax and welfare rules are full of cross‑references like:

- "Subject to section 472A…"
- "Notwithstanding the provisions of subsection (3)…"
- "This relief shall not apply where the individual has claimed under section…"

These create **hidden interactions** that cause people to:

- Miss legitimate deductions (R&D credits, capital allowances, employment incentives).
- Accidentally double‑claim and face penalties.
- Not realise that one claim **disqualifies** another.

Similarly, social welfare and PRSI rules for self‑employed/single directors involve:

- PRSI classes (A/S/M), voluntary contributions, mixed roles.
- Contribution conditions, means tests, category‑specific rules.
- EU coordination (Reg 883/2004) and court rulings on who counts as a worker/self‑employed.

A **graph** makes these relationships **visible, queryable, and explainable** in a way flat documents can’t.

### 2.2. How Your Existing Stack Maps

| Component      | Role in This Product                                                                 |
|----------------|----------------------------------------------------------------------------------------|
| **Memgraph**   | Core **rule interaction graph**: statutes, guidance, benefits, conditions, cases.     |
| **E2B sandbox**| Safe environment for **calculations, scenario simulation, ingestion jobs**.           |
| **MCP gateway**| Pluggable **live data + change‑detection** from official sites and case‑law sources.  |
| **Groq LLM**   | **Reasoning + explanation** over graph slices and user scenarios.                     |
| **Egress guard** | Redacts PII/financial detail before anything leaves the sandbox.                   |
| **Expert Agents** | Pre‑configured lenses (e.g. SingleDirectorIE) that narrow domain + tools.         |

This is essentially the same pattern you built for RFCRefactor, applied to a **much more painful and monetisable** domain.

---

## 3. Core Use Cases

### 3.1. Revenue / Tax Rule Interaction

**Goal:** Help users and advisors see how tax rules interact, especially where one claim affects another.

Examples:

1. **Deduction conflict detection**
   - "You’re claiming the Employment Investment Incentive; under TCA s.489(4), this excludes relief X."  
   - Show a **graph path**: `EII Relief → excludes → Other Relief → applies_to → your income type`.

2. **Eligibility path‑finding**
   - "To claim R&D Tax Credit (s.766), you must satisfy these 6 conditions"  
   - Present as a graph of conditions and cross‑references, not a wall of text.

3. **Scenario simulation (in sandbox)**
   - Compare: staying sole trader vs incorporating as a single‑director company.  
   - Show how effective tax rate and available reliefs change.

4. **Annual change impact (Finance Act)**
   - "Finance Act 2027 changed s.481 – here’s every other section that references it and how it affects your situation."

### 3.2. Self‑Employed & Single‑Director Social Welfare

**Goal:** Explain possible social welfare entitlements and constraints for:

- Self‑employed individuals (PRSI Class S, possibly others).
- Single‑director Irish companies (proprietary directors, mixed PRSI situations).

Key complexities:

- PRSI class confusion:
  - Class S contributions → limited benefits.
  - Employer PRSI on salary → different entitlements.
  - Voluntary Class A contributions → unlock more benefits.
- Benefit eligibility maze: Jobseeker’s Benefit (Self‑Employed), Illness Benefit (since 2017 for S), Maternity/Paternity/Parent’s Benefit, Treatment Benefit, State Pension (Contributory), Invalidity Pension vs Disability Allowance, etc.
- Hidden interactions:
  - Salary vs dividends → PRSI class → future pension + benefits.
  - Spouse as employee vs director → household entitlements.
  - Company car BIK and rental income → means testing in different ways.

Plus the **EU dimension**:

- Reg 883/2004 social security coordination: which state covers you, aggregation of contributions, A1 certificates.
- CJEU decisions changing definitions of "worker", "self‑employed", portability, non‑discrimination.

This is **exactly** the kind of tangle a graph + LLM explainer can help with.

### 3.3. Cross‑Domain Change Impact

**Goal:** Understand how a change in one regulatory area ripples through others.

Examples:

- Pensions Authority changes PRSA contribution limits → affects:
  - Income tax relief rules.
  - Employer PRSI treatment.
  - Benefit‑in‑kind calculations.
  - Social welfare means tests.

- New EU or TAC case redefines who counts as "self‑employed" → affects:
  - PRSI classification.
  - Welfare eligibility.
  - Possibly tax treatment.

The system should be able to answer queries like:

> "The Pensions Authority just changed PRSA limits. Show every tax section, social welfare rule, and employment regulation this interacts with for my situation."  

This is nearly impossible with flat documents, but natural with a graph + MCP‑fed change events.

---

## 4. Role of MCP vs Pure Ingestion

### 4.1. When Ingestion Alone Is Enough

For **static-ish core law** (e.g., the Taxes Consolidation Act 1997, core social welfare acts):

- You can ingest and parse once.
- Update annually/quarterly after Finance Acts.
- Build the rule‑relationship graph in Memgraph.

This is ideal for:

- Static rule relationships.
- Core path‑finding and conflict detection.

### 4.2. Where MCP Adds Real Value

MCP becomes critical for **fast‑moving or cross‑domain sources**, for example:

- **Tax Appeals Commission decisions** – weekly; interpret ambiguous rules and can re‑shape how sections apply.
- **Revenue eBriefs and Tax & Duty Manual updates** – weekly; operational clarifications.
- **Pensions Authority guidance** – monthly; affects tax and welfare interactions.
- **Social welfare rates and rule tweaks** – budget + mid‑year adjustments.
- **EU Court (CJEU) judgments** – anytime; can override Irish practice.
- **Employment law / WRC decisions** – ongoing; affect PRSI, BIK, etc.

MCP lets you:

- Detect new decisions/guidance as they appear.
- Pull in relevant text and metadata.
- Map them into the graph as `:Case`, `:Guidance`, or updated `:Rule` nodes with edges like:
  - `(:Case)-[:INTERPRETS]->(:StatuteSection)`
  - `(:Guidance)-[:SUPERSEDES]->(:Guidance)`
  - `(:Guidance)-[:APPLIES_TO]->(:Benefit)`

### 4.3. Hybrid Strategy

Best of both worlds:

- **Core graph via ingestion**
  - TCA, primary social welfare acts, base pension regs, key EU regulations.
- **MCP as eyes & ears**:
  - Watch specified feeds/APIs.
  - Fetch new case law, guidance, and updates.
  - Enrich the graph with new nodes/edges.

The result:

- Memgraph holds the **current cross‑domain structure**.
- MCP ensures it stays **fresh and complete where it matters most**.

---

## 5. Change Impact & Notification Architecture

### 5.1. Change Processing Pipeline

1. **Detect change (MCP)**
   - Tax Appeals Commission ruling, CJEU judgment, Revenue eBrief, Pensions Authority update, DSP update, etc.

2. **Parse affected concepts**
   - Extract which sections/benefits/regs/concepts are mentioned.
   - E.g. `PRSI Class S`, `Illness Benefit`, `Reg 883/2004`, `TCA s.766`.

3. **Graph update (Memgraph)**
   - Upsert a `:Case` / `:Guidance` / `:Update` node.
   - Create edges:
     - `(:Case)-[:NARROWS|EXPANDS|CLARIFIES]->(:Benefit|:Section|:Condition)`.

4. **Impact query**
   - From the changed node, traverse the graph:

   ```cypher
   MATCH (c:Case {id: $newCaseId})-[:NARROWS|EXPANDS|CLARIFIES]->(n)
   MATCH path = (n)-[:REQUIRES|AVAILABLE_TO|LIMITED_BY*1..3]->(m)
   RETURN path
   ```

   - This shows the "neighbourhood" of impacted rules/benefits.

5. **Match impacted users**
   - Users are modelled in the graph, e.g.:
     - `(:User)-[:HAS_PRSI_CLASS]->(:PRSIClass)`
     - `(:User)-[:HAS_STATUS]->(:PersonType)`
     - `(:User)-[:INTERESTED_IN]->(:Benefit)`
   - Find users whose subgraphs intersect the impacted neighbourhood.

6. **Send notifications**
   - e.g.  
     "New TAC ruling on Class S PRSI affects your Illness Benefit eligibility. See 4 connected rules →"

7. **User clicks through**
   - Show a **graph slice**:
     - The ruling.
     - The PRSI/social welfare section it interprets.
     - The benefits and conditions affected.
     - Their own situation overlaid.

### 5.2. Safety & Positioning

- Always present this as **informational**:
  - "This change may affect you because… here are the rules/cases involved."
- Encourage users to **confirm with professionals**:
  - Welfare officers, Revenue, accountants, or legal advisors.

---

## 6. Agent‑Based Architecture

You don’t narrow the **architecture**; you narrow via **expert agents** that sit on top of it.

### 6.1. Global Architecture

- One **Memgraph** instance modelling:
  - Tax, pensions, social welfare, company law, EU rules, case law.
- One **E2B sandbox manager** for secure calculations + ingestion tasks.
- One **MCP gateway** connected to multiple MCP tools.
- One **LLM client (Groq)** with strong system prompt(s).
- One **egress guard** wrapping all outbound calls.

### 6.2. Expert Agents as Lenses

Each expert agent is a small configuration + prompt on top of the global system.

Example: `SingleDirector_IE_SocialSafetyNet_Agent`

- **Profile baked in**:
  - Jurisdiction: `IE`.
  - PersonType: `SINGLE_DIRECTOR_COMPANY`.
  - Relevant domains: tax, PRSI, social welfare, pensions, EU coordination.

- **Graph filters**:
  - When querying Memgraph, always filter nodes by:
    - `jurisdiction = "IE"`
    - `applies_to` includes `SINGLE_DIRECTOR_COMPANY` or PRSI Class S/A combos.

- **MCP set**:
  - Allowed tools: Revenue.ie search, DSP/gov.ie updates, TAC decisions, Pensions Authority, EU case law.

- **System prompt**:
  - Explain rules and interactions for a single‑director Irish company.
  - Always cite sections/guidance/cases.
  - Never give definitive entitlement; always encourage professional confirmation.

Other agents could include:

- `IE_SelfEmployed_TaxAgent` (focused on SME tax reliefs, expenses, R&D credit).
- `EU_CrossBorder_Worker_Agent` (focused on Reg 883/2004 and multi‑state contributions).

All reuse the **same** infrastructure; they just:

- Filter the graph differently.
- Use different subsets of MCP tools.
- Have different expert prompts.

---

## 7. MVP and Product Direction (High‑Level)

Even though the architecture is broad, you can still choose a *thin slice* to implement first without constraining the underlying design.

### 7.1. High‑Value Starting Slice

A particularly strong first slice is:

- Domain focus: **Self‑employed / single‑director social welfare & PRSI**, plus a small slice of tax & pensions where they touch.
- Agent: `SingleDirector_IE_SocialSafetyNet_Agent`.
- Capabilities:
  1. Explain which **contributory benefits** *might* be in play (Jobseeker’s Benefit Self‑Employed, Illness Benefit, Maternity/Paternity, Treatment Benefit, State Pension Contributory).
  2. Show a graph of the **conditions** (PRSI classes, contribution records, ages) and **interactions** (e.g. salary vs dividends, spouse employment).
  3. Monitor relevant updates (TAC cases on Class S, DSP guidance, Pensions Authority changes) and show impact graph slices.

### 7.2. Expansion Paths

Once the core is working, you can incrementally add:

- Full SME tax interactions (reliefs, capital allowances, R&D credit).
- Pensions optimisation across PRSA, occupational schemes, state pension.
- Multi‑jurisdiction (Irish + other EU systems).
- Advisor‑focused views (graph explorer, saved analyses, client‑level alerts).

---

## 8. Positioning & Value Proposition

### 8.1. Who Benefits

- **Self‑employed individuals & single‑director company owners** in Ireland.
- **Accountants and tax advisers** who struggle to stay on top of welfare/pension/EU interactions.
- **Welfare and advisory NGOs** who need clearer visuals and explanations.

### 8.2. Why They’d Pay

- Tax and welfare mistakes are **expensive** (missed reliefs, penalties, lost entitlements).
- The interaction across domains is **too complex to track manually**.
- Existing tools are **siloed** (tax software, payroll, pension calculators, Citizens Information pages).
- A graph‑based, always‑updating, agent‑driven copilot is a **step‑change** in how people understand their "safety net" and obligations.

### 8.3. Safety Line

- Always presented as **regulatory intelligence & research**, not professional advice.
- Clearly prompt users to confirm major decisions with Revenue, DSP, Pensions Authority, or a qualified advisor.
- E2B sandbox + egress guard provide a strong privacy story: raw personal/financial data stays inside an isolated environment.

---

This document captures the combined thinking so far and can be treated as **Concept Spec v0.1** for your Regulatory Graph Copilot. You can now:

- Derive a more formal ARCHITECTURE.md.
- Write AGENTS.md entries for specific expert agents.
- Plan a small, demonstrable MVP without changing the broad architectural vision.

