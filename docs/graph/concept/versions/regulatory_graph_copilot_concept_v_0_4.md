# Regulatory Graph Copilot – Concept v0.4

> **Status:** v0.4  
> **Supersedes:** `docs/graph/concept/versions/regulatory_graph_copilot_concept_v_0_3.md`  
> **Companion specs:**
> - `architecture_v_0_4.md`
> - `docs/graph/graph-schema/versions/graph_schema_v_0_4.md`
> - `graph_algorithms_v_0_1.md`
> - `docs/engines/timeline-engine/timeline_engine_v_0_2.md`
> - `data_privacy_and_architecture_boundaries_v_0_1.md`
> - `docs/safety/safety-guards/graph_ingress_guard_v_0_1.md`
> - `docs/safety/safety-guards/egress_guard_v_0_2.md`
> - `special_jurisdictions_modelling_v_0_1.md`

---

## 1. Core Idea (Refined v0.4)

Build a **Regulatory Intelligence Copilot** that:

- Represents **tax, social welfare, pensions, capital gains, and EU coordination law** as a **shared rules graph** in Memgraph, not as flat documents.
- Uses that graph to surface:
  - Hidden **mutual exclusions** ("if you claim X, you can’t claim Y").
  - **Lock‑in periods** and **time‑based eligibility windows** (via `:Timeline` + Timeline Engine v0.2).
  - Cross‑domain interactions (tax ↔ welfare ↔ pensions ↔ CGT ↔ EU rules ↔ employment).
  - **Cross‑jurisdiction interactions** (e.g. IE ↔ UK ↔ NI ↔ Isle of Man ↔ Malta ↔ other EU states), including special regimes (CTA, Gibraltar, Andorra, NI–EU trade arrangements).
- Keeps sensitive tenant and scenario data **out of the graph** and under strict control, by design:
  - Memgraph is a **shared, user‑agnostic rules graph** (no user or tenant PII).
  - All graph writes go through a **GraphWriteService + Graph Ingress Guard (aspects)**.
  - MCP calls and LLM calls go through an **Egress Guard (aspects)**.
- Uses a **provider‑agnostic LLM router** with pluggable providers:
  - OpenAI Responses (incl. GPT‑OSS models),
  - Groq,
  - Local/OSS models running inside your own infrastructure.
- Uses **MCP via the E2B MCP gateway** plus ingestion jobs to keep rules fresh:
  - Court decisions (TAC, Irish courts, CJEU, other EU/UK courts).
  - Revenue eBriefs & manuals.
  - Pensions Authority, DSP/social welfare, EU regulations, guidance from other jurisdictions.
- Exposes this intelligence via:
  - **Specialist agents** (e.g. Single Director IE Social Safety Net, IE Self‑Employed Tax, IE CGT Investor, IE R&D Credit, EU Cross‑Border coordinator, later UK/NI/IoM/Malta agents).
  - A **Global Regulatory Agent** that can combine multiple lenses and jurisdictions in one conversation.

The system is a **research and explanation copilot**, not a legal/tax/welfare advisor. It:

- Helps **advisors** (accountants, tax professionals, welfare advisers, in‑house teams) perform faster, better‑documented research.
- Helps **end users** (e.g. single‑director company owners, self‑employed individuals with cross‑border lives) understand which rules might apply, see trade‑offs, and arrive at professionals with better questions.

Ireland, the UK/NI, EU, Isle of Man and Malta are the **initial focus**, but the architecture is explicitly cross‑jurisdiction and can grow to include other countries and regimes.

---

## 2. Why This Problem Fits the Architecture

### 2.1 Regulation Is Graph‑Shaped (with Time & Jurisdictions)

Tax, welfare, pensions, CGT, employment and EU law are full of cross‑references and time‑dependent constraints:

- "Subject to section …"
- "Notwithstanding subsection (3)…"
- "This relief shall not apply where the individual has claimed under section …"
- "No further claim shall be made … within the period of … years."
- "Where the person is subject to the legislation of another Member State under Regulation (EC) No 883/2004…"

These create:

- **Mutual exclusions** – one claim blocks another (sometimes permanently, sometimes for a period).
- **Lock‑ins and cooling‑off periods** – choices that constrain future options.
- **Ordering rules** – the sequence in which reliefs/benefits are applied matters.
- **Timing‑sensitive events** – especially for CGT (disposals vs reacquisitions, share matching), contribution windows, and qualifying periods for benefits.
- **Cross‑border interactions** – which country’s system applies, how contributions aggregate, how treaties and EU regulations coordinate.

The graph model (see `docs/graph/graph-schema/versions/graph_schema_v_0_4.md`) expresses this as:

- Nodes: statutes/sections, benefits, reliefs, conditions, timelines, cases, guidance, EU instruments, jurisdictions, profile tags, change events.
- Edges (examples):
  - `:EXCLUDES`, `:MUTUALLY_EXCLUSIVE_WITH` (mutual exclusions and directional exclusions).
  - `:REQUIRES`, `:LIMITED_BY` (eligibility and thresholds).
  - `:LOOKBACK_WINDOW`, `:LOCKS_IN_FOR_PERIOD`, `:FILING_DEADLINE`, `:EFFECTIVE_WINDOW`, `:USAGE_FREQUENCY` (time windows and usage constraints).
  - `:COORDINATED_WITH`, `:TREATY_LINKED_TO`, `:IMPLEMENTED_BY`, `:INTERPRETS`, `:CHANGES_INTERPRETATION_OF`.
  - `:AFFECTS` (change impact from updates).

This makes it possible to answer:

- "If I claim X now, what else do I rule out and for how long?"
- "If I time these disposals/purchases like this, how does that affect CGT loss relief?"
- "If I move from country A to B, which social security and tax rules interact for my profile?"
- "Which rules did this new case or Finance Act update actually affect, and where are the cross‑border knock‑on effects?"

### 2.2 Stack Mapping (v0.4)

| Component                        | Role in This Product                                                                                          |
|----------------------------------|----------------------------------------------------------------------------------------------------------------|
| **Memgraph (Community Edition)** | Core **rules & interactions graph** (no user PII), optional GraphRAG/algorithm metadata                       |
| **GraphWriteService**            | The **only write gate** to Memgraph; enforces schema & privacy via Graph Ingress Guard (aspects)              |
| **Graph Ingress Guard**          | Aspect pipeline protecting graph writes (no PII, no tenant data, only whitelisted labels/props/edges)         |
| **Graph algorithms layer**       | Optional Leiden communities, centrality, and helper nodes for GraphRAG‑style retrieval and explanation        |
| **E2B MCP gateway**              | Choke‑point for MCP tools; all external MCP traffic passes through with an egress guard                        |
| **MCP tools**                    | Legal & regulatory sources (Revenue, TAC, courts, EU, national authorities, etc.)                             |
| **LLM Router + providers**       | Provider‑agnostic LLM layer - ALL providers use Vercel AI SDK v5 (OpenAI Responses incl. GPT‑OSS, Groq, Anthropic, Google Gemini, local/OSS models via OpenAI client with custom baseURL), behind Egress Guard |
| **Egress Guard**                 | Aspect pipeline for **any outbound call** (LLM or HTTP/MCP), capable of AI‑driven PII/sensitive‑data stripping|
| **ComplianceEngine**             | Core orchestration engine (chat, graph queries, timeline engine, agents)                                      |
| **Expert agents**                | Pre‑configured domain/jurisdiction lenses on top of the engine                                                |
| **Global regulatory agent**      | Orchestrator that coordinates expert agents into a single conversation                                        |
| **Next.js 16 web app**           | Web app shell: chat UI, SSE streaming, calling `/v1/chat` and graph endpoints                                 |

Domain narrowing happens at the **agent + prompt aspect** layer (persona, jurisdictions, topic), not in the core engine.

---

## 3. Core Use Cases (v0.4 View)

### 3.1 Revenue / Tax Rule Interaction

Same as v0.3, but now explicitly:

- Backed by `docs/graph/graph-schema/versions/graph_schema_v_0_4.md` for structure.
- Leveraging Timeline Engine v0.2 for time windows.
- Optionally using graph algorithms (e.g. communities) for better retrieval/explanation.

Key questions:

1. **Deduction conflict detection**  
   "You’re claiming Relief A; this explicitly excludes Relief B in section … and also narrows access to Benefit C for N years."

2. **Eligibility path‑finding**  
   "To claim this credit, you must meet these conditions and avoid these mutually exclusive reliefs, within these time windows."

3. **Scenario comparison**  
   Compare scenarios (sole trader vs single‑director company; local vs cross‑border) by traversing different slices of the graph.

4. **Annual change impact**  
   Use `:Update`/`:ChangeEvent` + `:AFFECTS` + timelines to show which rules, reliefs and exclusions changed after a new Finance Act or guidance.

### 3.2 Self‑Employed & Single‑Director Social Welfare

As in v0.3, but integrated with:

- Refined **ProfileTags** (e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_CROSS_BORDER_IE_UK`, etc.).
- Time‑based eligibility conditions via the `:Timeline` modelling.
- Special‑jurisdiction modelling (e.g. NI’s position inside UK and EU access for goods, CTA, cross‑border PRSI situations) as per `special_jurisdictions_modelling_v_0_1.md`.

### 3.3 Cross‑Domain Change Impact

Now explicitly supported through:

- `:Update`/`:ChangeEvent` nodes for Finance Acts, guidance, cases, EU judgments.
- `:AFFECTS`, `:CHANGES_INTERPRETATION_OF`, `:EFFECTIVE_WINDOW` edges.
- Timeline Engine v0.2 to work out which updates affect which time periods for a given scenario.

Agents can form explanations like:

> "The 2028 Finance Act update narrowed the conditions for this benefit, which affects your scenario from date X, and also cascades to these related reliefs and exclusions."

### 3.4 Mutual Exclusions & Time‑Based Eligibility

Unchanged in principle from v0.3, but now:

- Expressed in `docs/graph/graph-schema/versions/graph_schema_v_0_4.md` using explicit edge types for different time aspects.
- Federated into the Timeline Engine v0.2 so the engine can reason over timelines, not just the graph.

This supports explanations like:

> "If you claim this relief this year, you cannot claim these other reliefs for N years, but if you defer until year Y, a better combination becomes possible."

### 3.5 Capital Gains Tax (CGT) & Timing Strategies

Same goals as v0.3, but with:

- Time windows expressed via `:Timeline` nodes.
- Optional graph algorithms to surface particularly important rules or patterns.

Agents can use sandboxed simulations for transaction sequences while still relying on the shared graph for rule structure.

### 3.6 Cross‑Jurisdiction Scenarios (IE/UK/NI/EU/IM/MT/GI/AD)

Expanded in v0.4 to explicitly recognise special jurisdictions and regimes:

- **IE / UK / NI** – NI’s dual positioning under certain trade agreements, CTA interactions.
- **Isle of Man (IM)** – Crown dependency with tax and social security interactions with IE/UK.
- **Malta (MT)** – Example EU Member State for additional cross‑border scenarios.
- **Gibraltar (GI)** – Part of the UK but not in the EU; relevant for some tax/financial services interactions.
- **Andorra (AD)** – Non‑EU state between Spain and France with cross‑border workers.

The graph schema, plus `special_jurisdictions_modelling_v_0_1.md`, ensures:

- These are modelled as first‑class `:Jurisdiction`/`:Region`/`:Regime`/`:Agreement` nodes.
- Cross‑border edges (`:COORDINATED_WITH`, `:TREATY_LINKED_TO`, `:EQUIVALENT_TO`, etc.) can represent complex interactions without privileging any single country as the only primary system.

Agents use **prompt aspects** (jurisdiction aspect, persona aspect) to:

- Focus on a user’s primary and secondary jurisdictions.
- Decide when to bring cross‑border rules or special regimes into the explanation.

---

## 4. MCP vs Batch Ingestion (v0.4)

The separation is now clearer:

### 4.1 Core Graph Ingestion (Batch)

- Regular ingestion pipelines construct and refresh the **core rules graph** from:
  - Primary and secondary legislation,
  - Revenue/authority guidance,
  - EU regulations and directives, national implementing provisions,
  - Selected case law and court/tribunal decisions.
- These jobs write via `GraphWriteService` → `GraphIngressGuard` → Memgraph.

### 4.2 MCP for Freshness & Discovery

MCP via E2B MCP gateway is used to:

- Monitor **volatile sources**: recent TAC decisions, Revenue eBriefs, guidance updates, pensions/social welfare updates, eur‑lex, courts.
- Fetch relevant documents when signals or user questions indicate a gap.
- Extract candidate rules/relationships for ingestion into the graph.

MCP is the **live sensor network**; Memgraph is the **structured memory**.

### 4.3 Living Graph via Incremental Upserts

As conversations and MCP runs discover new authoritative references:

- Proposed nodes/edges are passed through graph ingress aspects:
  - Rejecting any PII or scenario‑specific details.
  - Normalising IDs, labels, relationships.
- The upsert pattern ensures that:
  - The graph gradually becomes richer,
  - The schema remains stable,
  - New algorithm runs (e.g. community detection) can derive better summary nodes and hints without changing core meaning.

---

## 5. Change Impact & Notifications (v0.4)

Change handling in v0.4 is conceptually the same as v0.3, with clearer alignment to the schema and algorithms specs:

1. **Detect** – MCP sees a new case, guidance, or update from monitored sources.
2. **Parse & map** – Extract affected sections, benefits, reliefs, conditions, timelines.
3. **Ingest** – Upsert `:Update`/`:ChangeEvent`, `:Case`, `:Guidance` nodes and edges (`:AFFECTS`, `:CHANGES_INTERPRETATION_OF`, `:EFFECTIVE_WINDOW`, etc.) through `GraphWriteService`.
4. **Impact traversal** – Query the graph from the update node outwards to find direct and indirect impacts.
5. **Community & centrality (optional)** – Use graph algorithms to:
   - Highlight which parts of the mesh are most central or heavily affected.
   - Feed GraphRAG‑style summaries to LLMs.
6. **Profile matching** – Match impacted rules to profile tags relevant to advisors’ client segments.
7. **Notify & explain** – Agents frame the change clearly, with:
   - Important nodes and edges,
   - Timelines,
   - Cross‑jurisdiction implications,
   - Clear explanation that this is research guidance, not binding advice.

---

## 6. Agent‑Based Architecture (v0.4)

### 6.1 Engine‑First Design

The regulatory intelligence is implemented in a **framework‑agnostic engine**:

- `ComplianceEngine` and related core packages (LLM router, graph client, timeline engine, agents) are independent of any specific web UI.
- `apps/web` (Next.js 16 + Vercel AI SDK v5) is a **thin adapter layer**:
  - `POST /v1/chat` → `ComplianceEngine.handleChat()`
  - Graph endpoints/streams → graph service APIs

This allows:

- Reuse in other Next.js/Supabase apps.
- Future headless / CLI / other UI experiments.
- Eventually: exposing the engine as a managed **Regulatory Graph Copilot as a Service** with different frontends.

### 6.2 Specialist Agents & Prompt Aspects

Agents are configured via:

- **Prompt aspects** (jurisdiction, profile/persona, agent context, disclaimers, additional context),
- Selected tools (LLM providers, MCP sources, graph/timeline queries),
- Jurisdiction sets (e.g. `['IE']` vs `['IE', 'UK', 'NI', 'IM', 'EU']`).

Specialist agents include (non‑exhaustive):

- `SingleDirector_IE_SocialSafetyNet_Agent`
- `IE_SelfEmployed_TaxAgent`
- `IE_CGT_Investor_Agent`
- `IE_RnD_TaxCredit_Agent`
- `EU_CrossBorder_Coordinator_Agent`
- Future: `UK_CrossBorder_Agent`, `IM_TaxAndWelfare_Agent`, etc.

### 6.3 Global Regulatory Agent

The **GlobalRegulatoryComplianceAgent**:

- Is the canonical conversational entry point.
- Looks at persona/profile, jurisdictions and question type.
- Dispatches sub‑tasks to specialist agents as needed.
- Merges their results into a single coherent answer, with:
  - Which agents were involved.
  - Which jurisdictions and rule clusters were used.
  - Which parts are speculative vs clearly grounded in the graph and documents.

---

## 7. MVP vs Platform (unchanged in spirit, refined in scope)

- **Platform vision:**
  - Multi‑domain, multi‑jurisdiction, multi‑agent regulatory intelligence layer.
  - Shared rules graph that grows and improves as more users and advisors interact with it.
  - Strong privacy, SOC2/GDPR‑friendly separation of tenant data from shared knowledge.

- **MVP focus:**
  - Start with IE/EU and core special jurisdictions (UK/NI/IM/MT) for:
    - Self‑employed and single‑director social welfare.
    - Key tax reliefs and CGT interactions that matter most for those profiles.
    - A small, well‑curated set of cross‑border patterns.
  - Deliver value to advisors and end users even before the graph is complete.

Nothing in the v0.4 concept constrains you to one niche; it codifies how the engine, graph, agents, MCP and LLM layers fit together so new domains and jurisdictions can be added without rewriting the core.

---

## 8. Positioning & Safety (v0.4)

### 8.1 Primary Audiences

1. **Professional users (B2B)**
   - Accounting and tax firms.
   - Welfare and financial advisers.
   - In‑house finance/compliance teams.

   Value:
   - Faster, deeper cross‑domain regulatory research.
   - Clear visualisation of interactions, exclusions, timelines and cross‑border effects.
   - Better internal documentation and audit trail (graph slices, citations, change history).

2. **End users (B2C)**
   - Self‑employed individuals.
   - Single‑director company owners.
   - Individuals with investment portfolios and cross‑border lives.

   Value:
   - Understand potential entitlements and obligations.
   - See mutual exclusions and timing issues before committing to a path.
   - Arrive at professionals and authorities with better‑structured questions.

### 8.2 Safety Line

- The system is a **research and explanation copilot**, not a provider of legal, tax or social welfare advice.
- It:
  - Surfaces rules, relationships, timelines and change impacts.
  - Highlights plausible applicability and trade‑offs given a profile.
  - Encourages consultation with qualified professionals and official sources.
- Architecture decisions (Node 24 LTS, EU‑friendly hosting, provider‑agnostic LLM layer, Egress Guard, Graph Ingress Guard, no PII in Memgraph) are chosen to make future SOC2/GDPR compliance easier and to allow **EU‑centric deployments where user and tenant data never leave your control**.

**North Star:**  
Help people and advisors understand how complex, interacting rules affect them – across time, domains, and jurisdictions – while maintaining strict privacy boundaries and a clear line between research support and professional advice.

