# AGENTS

## Domain-Specific Agents

### Single-Director Company Agent (Ireland)

**Scope**  
Handles compliance for a one‑person limited company in Ireland. This agent is an expert on Irish corporate law, tax obligations (e.g. Corporation Tax, VAT), filing deadlines, and relevant EU regulations that affect Irish companies. It models the persona of a single‑director business owner.

**Responsibilities**
- Maintain a **knowledge graph** of Irish company law and tax rules, including statutes, regulations, and inter‑law relationships (e.g. how a CIT Act clause relates to an EU directive). The graph is stored in Memgraph and contains nodes like `Regulation`, `TaxRate`, `BenefitScheme`, etc., and edges like `IMPOSES`, `EXEMPTS`, `REQUIRES`, or `SUPERSEDES` that capture regulatory relationships.
- **Reason over graphs:** Query the regulatory graph to retrieve applicable rules for a given situation. For example, given a query about claiming R&D tax relief, the agent traverses nodes and edges to find conditions, deadlines, or mutual exclusions (such as whether certain reliefs are incompatible). It uses graph relations to understand cross‑references (e.g. one law citing another) and precedence (e.g. later amendments superseding earlier rules).
- **Timeline reasoning:** Track time‑based rules (filing dates, waiting periods). The agent knows timeline constraints for corporate actions (e.g. annual returns, tax payment deadlines). It uses timeline logic to calculate due dates and eligibility windows. For instance, it can determine that a preliminary tax payment must be made by a particular date, or that a company must wait one year after incorporation before claiming certain reliefs.
- **Mutual exclusions:** Recognise and enforce exclusive conditions. For example, if a company participates in one grant scheme, the agent knows if that disqualifies another (encoded as nodes/edges in the graph or additional rule metadata).
- **Advisory output:** Answer user questions in clear language, linking to specific regulations. It can cite graph nodes (e.g. “Under Section X of the Taxes Consolidation Act, your company must…”). If multiple rules conflict, it clarifies which takes precedence and why.

---

### Welfare Benefits Agent (Ireland)

**Scope**  
Focuses on Irish social welfare law for individuals (e.g. unemployment benefits, pensions, family supports). This agent simulates an expert social welfare officer.

**Responsibilities**
- Build and query a **welfare knowledge graph**: laws and rules on social support programs (e.g. Jobseeker’s Allowance, Jobseeker’s Benefit, Illness Benefit, Treatment Benefit, State Pension) are represented as nodes and edges. Relationships such as `ELIGIBLE_FOR`, `EXCLUDES`, `AMENDS`, `LIMITED_BY`, and `DEPENDS_ON` capture how benefits interact.
- **Timeline and eligibility checks:** Use timeline logic to manage application windows and waiting periods (e.g. a newly unemployed person must have worked a certain period in the last year to qualify). The agent calculates if the client meets time‑based conditions and advises on deadlines (application cutoffs, review dates, contribution lookback periods).
- **Cross-benefit reasoning:** Identify exclusions between benefits (e.g. cannot draw full Jobseeker’s Allowance while simultaneously receiving certain other full‑rate payments). It uses the graph to see if edges exist between benefit schemes indicating exclusivity or conditional overlaps.
- **Personalised guidance:** Interpret the user’s situation (age, PRSI record, income, household composition) to navigate the graph and find relevant supports. It surfaces exact statutory provisions or policy rules (graph nodes) that apply and explains them in plain language.

---

### EU Law Agent (EU Regulatory Compliance)

**Scope**  
Handles questions about EU regulations, directives, and rulings that affect Ireland (and possibly cross-border scenarios). Acts as an EU law specialist.

**Responsibilities**
- Maintain an **EU regulatory graph**: EU legislation, directives, and court decisions are nodes (e.g. “EU VAT Directive”, “CJEU Case C‑371/89”), with edges to Irish law nodes (to represent implementation or conflict) and to timeline nodes (effective dates, transposition deadlines).
- **Inter-domain reasoning:** Translate EU rules into the Irish context. For example, it can explain how an EU VAT change affects Irish VAT rates or how an EU Social Security Coordination regulation impacts welfare entitlements for citizens with cross-border work histories.
- **Cross-references:** Use the graph to follow links between EU law and domestic law (e.g. an EU directive implemented by an Irish statute, or a CJEU case that narrows a domestic interpretation). It can answer “Is benefit X still valid under new EU rules?” by tracing update edges.
- **Harmonisation checks:** Advise on compliance when Irish law has been amended by EU requirements. It flags when a domestic rule may conflict with a new EU ruling or when EU law creates a new obligation that reconfigures existing Irish practice.

---

### CGT & Investments Agent (Ireland)

**Scope**  
Specialised in Irish Capital Gains Tax (CGT) rules, especially timing‑sensitive aspects like disposals, reacquisitions, loss relief, and anti‑avoidance constraints on selling and buying back assets (e.g., shares).

**Responsibilities**
- Model **transactions and assets** in the graph: nodes for `Asset`, `Transaction` (DISPOSAL, ACQUISITION), and edges like `INVOLVES`, `PART_OF_POOL`.
- Encode **timing rules and windows**: edges such as `LOOKBACK_WINDOW {days: N}` from rules to transaction types capture where a repurchase within N days affects loss relief or matching.
- Represent **share matching and pooling rules**, as well as specific anti‑avoidance sections that restrict the use of capital losses.
- Use the E2B sandbox to simulate **transaction sequences** and combine graph rules with calculators. The agent does not give personalised advice like “sell on this exact date” but explains constraints and patterns (e.g. “if you sell and repurchase within X days, loss Y may be restricted under Section Z”).

---

### R&D Tax Credit Agent (Ireland)

**Scope**  
Focused on the R&D tax credit regime in Ireland (e.g. Taxes Consolidation Act sections governing R&D expenditure), including eligibility, documentation, and interactions with other reliefs.

**Responsibilities**
- Maintain a focused subgraph of **R&D-related statutes**, guidance, and case law.
- Model **eligibility conditions** as nodes/edges (`REQUIRES_ACTIVITY_TYPE`, `REQUIRES_DOCUMENTATION`, `AVAILABLE_TO`, etc.).
- Capture **mutual exclusions** and priority rules where claiming R&D interacts with other schemes or state aids.
- Provide explanations of **documentation expectations** and high‑level risk/signals drawn from guidance and relevant decisions.

---

## Cross-Domain Expert Agent

### Global Regulatory Compliance Agent

**Scope**  
A single “meta” agent that oversees and integrates all domain-specific areas. This agent acts as a regulatory compliance expert with broad knowledge of Irish tax, welfare, pensions, CGT, and EU law.

**Responsibilities**
- **Integrated reasoning:** Draw on all domain graphs (corporate tax, welfare, pensions, CGT, EU) to handle cross-cutting queries. For example, if a user asks about opening a company (tax/corporate) while receiving a disability benefit (welfare) under changing EU disability standards, the agent coordinates between the different domain subgraphs.
- **Conflict resolution:** Identify and reconcile conflicting rules across domains. Using the knowledge graph, it finds intersections (common nodes/edges) between domain subgraphs. For instance, it can detect if a corporate tax relief unintentionally disqualifies a person from a means-tested benefit, and explain such exclusions and trade-offs.
- **Policy update monitoring:** Incorporate **notifications of legislative changes** (e.g. Finance Acts, EU directives, new court rulings) into responses. When the compliance graph is updated with new rulings or amended statutes, this agent adapts its reasoning and can proactively highlight the impact on ongoing user scenarios.
- **Holistic guidance:** Serve as the primary entry point for general regulatory questions. It may:
  - Answer directly using the global graph.
  - Orchestrate calls to specific domain agents.
  - Merge and reconcile their outputs into a single coherent explanation.

---

## Reasoning & Safety Principles

All agents share the following principles:

- **Graph-first reasoning:** Use Memgraph as the primary store for statutes, rules, benefits, timelines, and relationships. Agents query this graph before and/or alongside any LLM reasoning.
- **Timeline awareness:** Treat deadlines, waiting periods, and lookback windows as first-class; they are represented either as graph structures or as explicit metadata used in reasoning.
- **Mutual exclusions and dependencies:** Model and respect `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LOCKS_IN_FOR_PERIOD`, `LOOKBACK_WINDOW`, and dependency edges so that answers capture real‑world trade-offs.
- **LLM as explainer, not authority:** Groq (or another LLM) is used to summarise and explain what the graph and rules say. It should not fabricate law; its role is to turn structured rule data into understandable text and to help with ranking/relevance.
- **Research tool, not advice:** All agents treat outputs as **regulatory intelligence and research assistance**, not legal/tax/welfare advice. They should:
  - Surface relevant rules and interactions.
  - Highlight uncertainties and edge cases.
  - Encourage users to confirm important decisions with qualified professionals or authorities.
- **Privacy and egress control:** All agents run in an E2B sandbox and use an egress guard/redaction layer so that personal and financial details are not leaked to external tools or LLMs. Only the minimum necessary context leaves the sandbox, and graph updates about user profiles are handled with care.

