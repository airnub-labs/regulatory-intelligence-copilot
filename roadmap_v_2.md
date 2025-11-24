# ROADMAP – Regulatory Intelligence Copilot

> **Project:** `regulatory-intelligence-copilot`  
> **Tagline:** Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.

This roadmap focuses on getting to a **useful, credible v1** as quickly as possible, while leaving room for more advanced graph/GraphRAG work (including potential Microsoft GraphRAG integration) and **multi-jurisdiction expansion (other EU countries, Isle of Man, Malta)** later.

---

## Phase 0 – Fork, Clean-Up, and Baseline

**Goal:** Stand up the new repo with a clean, focused foundation that reuses the working infra from `rfc-refactor`.

**Tasks**
- [ ] Fork `rfc-refactor` → `regulatory-intelligence-copilot`.
- [ ] Replace README, ARCHITECTURE, DECISIONS, AGENTS with the new docs.
- [ ] Remove or archive:
  - HTTP probe runners and sample API.
  - OWASP/RFC-specific models, types, and UI components.
- [ ] Keep and rewire:
  - Next.js app and `/api/chat` plumbing.
  - E2B sandbox integration.
  - MCP gateway wiring.
  - Memgraph client / configuration.
  - Any generic redaction utilities.
- [ ] Ensure dev environment runs end-to-end (chat → sandbox → dummy response) with no domain-specific logic yet.

**Exit criteria**
- New repo builds and runs `pnpm dev` cleanly.
- `/api/chat` returns a trivial stubbed answer from the sandbox.

---

## Phase 1 – Minimal Vertical Slice (Single Director + Small Graph)

**Goal:** Deliver the smallest useful end-to-end slice for a specific persona: **single-director Irish company** asking about welfare/tax interactions.

**Scope**
- One primary agent: `SingleDirector_IE_SocialSafetyNet_Agent`.
- Tiny but realistic graph subset in Memgraph (e.g. a few benefits and sections).
- Full pipeline: chat → orchestrator → sandbox → Memgraph → Groq → answer.

**Tasks**
- [ ] Implement `packages/compliance-core` with:
  - [ ] Agent interface + `AgentContext`.
  - [ ] Orchestrator that always routes to `SingleDirector_IE_SocialSafetyNet_Agent` (ignore others for now).
- [ ] Implement sandbox runtime:
  - [ ] Agent runner for `SingleDirector_IE_SocialSafetyNet_Agent`.
  - [ ] Basic egress guard (PII redaction + minimal financial bucketing).
  - [ ] MCP client integration (memgraph-mcp + llm-groq-mcp).
- [ ] Seed Memgraph with a **very small** initial graph:
  - [ ] A few `:Benefit` nodes (e.g. Illness Benefit, Jobseeker’s Benefit (Self-Employed)).
  - [ ] A few `:Section` and `:Condition` nodes relevant to single directors.
  - [ ] Basic edges: `APPLIES_TO`, `REQUIRES`, `EXCLUDES`, `LOOKBACK_WINDOW`.
- [ ] Implement `timeline` module v0.1 (lookback windows only).
- [ ] Adjust UI:
  - [ ] Single chat page.
  - [ ] Show which agent answered and which rules were referenced.

**Exit criteria**
- You can ask: “I’m a single director of an Irish LTD, what happens to my Illness Benefit if I pay myself a salary?” and get:
  - A coherent explanation.
  - At least one referenced benefit and section.
  - A visible disclaimer that this is not advice.

---

## Phase 2 – Expand Graph & Add More Domain Agents

**Goal:** Move from a narrow slice to a more representative regulatory mesh: tax, welfare, CGT, R&D, EU interactions.

**Scope**
- Add more node types and edges per `graph_schema_v0_1.md`.
- Implement additional domain agents.

**Tasks**
- [ ] Expand graph schema coverage:
  - [ ] Add more `:Section`, `:Benefit`, `:Relief`, `:Condition`, `:Timeline`, `:Case`, `:Guidance` nodes.
  - [ ] Add `:EURegulation` / `:EUDirective` nodes and `IMPLEMENTED_BY` edges.
  - [ ] Ensure `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `REQUIRES`, `LIMITED_BY`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD` are all exercised.
- [ ] Implement additional agents:
  - [ ] `IE_SelfEmployed_TaxAgent`.
  - [ ] `IE_CGT_Investor_Agent` (with timing-aware CGT reasoning).
  - [ ] `IE_RnD_TaxCredit_Agent` (narrow but high-value, R&D relief pathfinding).
  - [ ] `EU_Regulation_Agent` (high level, focusing on EU → IE implementation edges).
- [ ] Implement `GlobalRegulatoryComplianceAgent` that:
  - [ ] Does basic intent routing between domain agents.
  - [ ] Merges their responses when the question spans multiple domains.
- [ ] Extend timeline engine:
  - [ ] Support lock-in periods (`LOCKS_IN_FOR_PERIOD`).
  - [ ] Improve descriptive output for LLM prompts.

**Exit criteria**
- You can ask questions that span domains, e.g. “If I sell shares for a loss and buy back within 30 days, how might that affect my CGT loss relief?” or “How might a change in PRSA limits affect my tax and social welfare entitlement?” and the system:
  - Routes to the right agents.
  - Surfaces cross-rule relationships and time windows.
  - Clearly calls out exclusions and uncertainties.

---

## Phase 3 – On-Demand Enrichment & Change Tracking

**Goal:** Make the system adaptive: grow the graph when gaps are discovered, and track updates in law/guidance/case law.

**Scope**
- Legal search via MCP.
- On-demand ingestion when agents hit sparse areas.
- Basic change-tracking and notifications.

**Tasks**
- [ ] Implement `legal-search-mcp` integration:
  - [ ] Configured for Revenue.ie, gov.ie, eur-lex, TAC decisions, etc. (search/snippets only).
- [ ] Add on-demand enrichment workflow inside sandbox:
  - [ ] When a question hits an area with little graph coverage, agent calls legal search.
  - [ ] Parse results into candidate nodes/edges.
  - [ ] Upsert them into Memgraph using the schema.
- [ ] Implement `:Update` / change-tracking nodes:
  - [ ] Represent Finance Acts, new eBriefs, new TAC decisions, key EU rulings.
  - [ ] Link them via `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`, etc.
- [ ] Add a very simple notification mechanism:
  - [ ] A table / store mapping profile tags to affected rules.
  - [ ] A basic “updates” view in the UI (even if just a list of recent impactful changes).

**Exit criteria**
- When a new TAC decision is ingested, the system can:
  - Show which rules it affects.
  - Surface a note in future answers when those rules are relevant.

---

## Phase 4 – Advisor-Facing Features & UX Polish

**Goal:** Make the tool more obviously useful to accountants and advisors, and polish the UX.

**Tasks**
- [ ] Add support for multiple saved scenarios/profiles per user.
- [ ] Allow exporting "research bundles" (graph snippets + explanation) that an advisor can attach to a file.
- [ ] Improve graph introspection tooling:
  - [ ] Basic graph visualisation for debugging and expert users.
- [ ] Add more guardrails and prompt hardening.
- [ ] Refinements to redaction/egress guard based on real usage.

**Exit criteria**
- An advisor can:
  - Configure a few client profiles.
  - Run scenario questions.
  - Export structured research notes with references.

---

## Phase 5 – Potential Enhancements

This phase collects **non-essential but high-leverage enhancements**, including evaluating **Microsoft GraphRAG**, and expanding to **other European jurisdictions (other EU countries, Isle of Man, Malta)**.

### 5.1 Microsoft GraphRAG Integration (Evaluation & Optional Adoption)

**Context**

Right now, the project uses a **hand-rolled GraphRAG pattern**:
- Memgraph stores the regulatory graph.
- Agents issue Cypher queries to fetch subgraphs.
- LLMs get a compressed representation of those subgraphs.

Microsoft’s **GraphRAG** provides a more opinionated framework for graph-centric retrieval and reasoning, with features like:
- Richer retrieval orchestration and query planning.
- Built-in workflows combining text chunks + graph structure.
- Potentially more advanced subgraph ranking, summarisation, and global/local context stitching.

**Potential Benefits**

- **Improved retrieval quality**: Better identification of which parts of the graph (and which associated text passages) matter for a specific question.
- **More advanced reasoning flows**: GraphRAG patterns for global context + focused local reasoning could reduce hallucinations and improve cross-rule explanations.
- **Reusability of patterns**: Instead of hand-coding retrieval flows, we could leverage GraphRAG’s pluggable pipelines and focus more on domain modelling.

**Potential Drawbacks / Costs**

- **Complexity & infra overhead**:
  - GraphRAG typically expects specific storage/indexing setups (e.g. Azure ecosystems, particular graph/embedding stores).
  - We already have Memgraph as the canonical graph; bridging the two might require duplication or custom adapters.
- **Cognitive overhead**:
  - Adds another conceptual and tooling layer on top of E2B + MCP + Memgraph.
  - For early versions, this could slow feature delivery.
- **Lock-in risk**:
  - Depending on how deeply integrated we get, future migrations might be harder.

**Strategic Position**

- For **v1–v2**, we keep the **Memgraph-only GraphRAG approach**:
  - It’s simpler and under full control.
  - It’s already tuned to the custom schema in `graph_schema_v0_1.md`.
- For **later phases**, we consider GraphRAG as:
  - A **complementary retrieval layer** (e.g. for text-heavy sources like guidance and case law).
  - Or a **separate mode** for experimentation and benchmarking.

**Roadmap Items**

- [ ] **Spike: GraphRAG feasibility study**
  - Prototype a small GraphRAG pipeline over a subset of the data.
  - Compare answer quality and latency vs the current Memgraph-centric approach.
- [ ] **Design: Integration strategy**
  - Decide whether GraphRAG:
    - Directly queries a separate store, or
    - Uses Memgraph as the graph backend via adapters.
  - Ensure E2B + MCP + redaction story stays intact.
- [ ] **Optional: Hybrid retrieval mode**
  - Implement a mode where:
    - Rules/relationships come from Memgraph.
    - Long-form text (guidance, case law) is retrieved via GraphRAG pipelines.

**Exit Criteria for Adoption**

- Measurable improvement in:
  - Accuracy and completeness of explanations.
  - Coverage of subtle cross-document interactions.
- Acceptable operational complexity and cost.
- No regression in privacy/egress guarantees.

---

### 5.2 Multi-Jurisdiction Expansion (Other EU Countries, Isle of Man, Malta)

**Context**

Many real-world scenarios involve cross-border considerations, especially for self-employed people, company directors, and investors operating between:
- Ireland and other **EU member states**.
- Ireland and nearby jurisdictions like the **Isle of Man** and **Malta**.

These jurisdictions can have:
- Different tax and social security rules.
- Different implementations of EU regulations and directives.
- Bilateral agreements and special regimes that interact with Irish and EU law.

**Goals**

- Introduce additional jurisdictions while keeping Ireland as the initial anchor.
- Model cross-border interactions and conflicts explicitly in the graph.

**Approach**

- [ ] Extend graph schema usage:
  - Use `jurisdiction` property consistently across nodes.
  - Add `:Statute`, `:Section`, `:Benefit`, `:Relief`, etc. for:
    - Selected **EU member states** most relevant to the intended user base.
    - **Isle of Man** (Crown dependency with specific tax/social security links).
    - **Malta** (often relevant for company structuring and tax residency planning).
  - Add edges for cross-border relationships:
    - `COORDINATED_WITH` – for social security coordination rules.
    - `TREATY_LINKED_TO` – for double tax treaties, social security agreements.
    - `MIRRORS` / `DERIVED_FROM` – for local implementations of EU directives.
- [ ] Add new agents or extend existing ones:
  - EU cross-border worker / contractor agent.
  - Cross-jurisdiction investor / company-structure agent.
- [ ] Ensure UI/UX makes jurisdictions explicit:
  - Questions and answers should clearly identify which country’s rules are being discussed.

**Exit Criteria**

- Ability to ask questions like:
  - “I’m an Irish single-director company doing work in Malta – how do tax and social security rules interact?”
  - “How does moving to the Isle of Man affect my Irish PRSI record and benefits?”
- System can:
  - Retrieve relevant Irish, EU, and target-jurisdiction rules.
  - Surface key interactions and conflicts.
  - Clearly indicate uncertainty and the need for country-specific professional advice.

---

### 5.3 Additional Enhancements (Examples)

- [ ] Richer graph visualisation for end-users (not just internal).
- [ ] Deeper EU cross-border scenarios (multi-country contributions, A1 forms, etc.).
- [ ] Sector-specific rule packs (e.g. construction RCT, gig workers, tech stock options).
- [ ] Localisation / multi-language support for explanations.

---

## Summary

This roadmap deliberately:
- Starts **narrow and vertical** (single director, small graph, basic agent).
- Grows into a **multi-domain regulatory mesh** with Memgraph at the centre.
- Adds **on-demand enrichment and change tracking** once the basics are solid.
- Only then considers heavier frameworks like **Microsoft GraphRAG** and **multi-jurisdiction expansion (other EU countries, Isle of Man, Malta)** as optional, higher-order enhancements.

The north star remains the same:  
> Help people and advisors understand how complex rules interact, without pretending to be the final authority on what they must do.

