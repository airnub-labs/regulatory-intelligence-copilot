# Regulatory Graph Copilot – Concept Spec v0.6

> **Status:** v0.6 – aligned with `architecture_v_0_6.md`  
> **Supersedes:** `regulatory_graph_copilot_concept_v_0_4.md`  
> **Scope:** Product and system concept for the Regulatory Intelligence Copilot

This document explains **what** the Regulatory Intelligence Copilot is trying to be, **for whom**, and **how** it conceptually works – independent of any single implementation detail.

It is the conceptual layer that all other specs (architecture, graph schema, timeline engine, agents, LLM routing, MCP integrations) should support.

---

## 1. Problem & Vision

### 1.1 Problem

Modern tax, welfare, pensions, and cross‑border coordination rules (e.g. IE / UK / NI / IM / EU / CTA / GI / AD) are:

- **Fragmented** across Acts, regulations, guidance, FAQs, calculators, and case law.
- **Temporal** – they change over time, with lookbacks, lock‑ins, deadlines, and effective windows.
- **Profile‑dependent** – the answer for a single‑director IE company is different than for a PAYE employee or cross‑border worker.
- **Cross‑jurisdictional** – CTA, EU rules, and bilateral agreements can override or coordinate domestic rules.

Professionals and citizens end up doing:

- Repetitive, manual document hunting.
- Mental graph work ("if I do X today, what happens to Y in 3 years across IE/UK/EU?").
- Ad‑hoc note‑taking that’s hard to reuse or generalise.

### 1.2 Vision

The **Regulatory Intelligence Copilot** aims to be a **chat‑first research partner** that:

1. Exposes a **regulatory rules graph** (Memgraph) as a first‑class, explainable knowledge structure.
2. Uses a **Timeline Engine** to reason about lookbacks, lock‑ins, deadlines, and effective windows.
3. Uses **LLM agents** to navigate and explain this graph, not to replace it.
4. Provides **research‑style answers** with evidence, not black‑box “advice”.
5. **Self‑populates** over time:
   - Every conversation can identify regulatory concepts (VAT, VRT, import duty, specific benefits/reliefs),
   - These concepts seed ingestion jobs that enrich the shared rules graph.

The goal is a system where both users and agents rely on the **same underlying graph**, which becomes more complete as it is used, while **never storing user PII** in that graph.

---

## 2. Product Goals & Non‑Goals

### 2.1 Goals

1. **Research, not advice**  
   Provide structured, evidence‑linked explanations of rules, benefits, reliefs, interactions, and timelines. Always frame outputs as **research** and direct users to qualified professionals.

2. **Explain interactions, not just single rules**  
   Help users understand how multiple rules interact, conflict, or exclude each other for a given profile and time window.

3. **Support profiles/personas**  
   Use **ProfileTags** and agents to reflect persona‑specific concerns (e.g. single‑director IE LTD, self‑employed contractor, cross‑border IE/UK worker) without ever writing individual user PII into the shared graph.

4. **Handle time explicitly**  
   Make lookbacks, deadlines, lock‑ins, and effective windows visible and queryable via the Timeline Engine.

5. **Handle cross‑border complexity**  
   Model IE / UK / NI / IM / EU / CTA / GI / AD and similar special jurisdictions clearly, including coordination regimes and equivalent rules.

6. **Self‑populate regulatory concepts**  
   Capture SKOS‑like concepts (VAT, VRT, import duty, specific benefits/reliefs) directly from chat, resolve them into `:Concept` nodes, and drive ingestion/enrichment.

7. **Remain tenant‑agnostic and PII‑free at the graph level**  
   Memgraph is a shared regulatory rules graph. Conversations, scenarios, user identities, and tenant boundaries live in the app DB (Supabase) and never bleed into Memgraph.

8. **Be explainable and auditable**  
   Every answer should be able to point back to concrete nodes (sections, benefits, cases, concepts, timelines) via `referencedNodes`, so the graph can be inspected and verified.

### 2.2 Non‑Goals

- **No personal tax/welfare advice**  
  The system does not replace tax advisors, solicitors, or welfare officers.

- **No PII in Memgraph**  
  No user names, addresses, PPSNs, company IDs, or concrete scenarios are ever written into the rules graph.

- **Not a full legal document repository**  
  The graph links to full texts (e.g. Revenue, DSP, EU, TAC) but does not store them wholesale.

- **Not a generic knowledge graph**  
  The scope is regulatory compliance domains (tax, welfare, pensions, related case law), not arbitrary web knowledge.

---

## 3. Core Conceptual Pillars

### 3.1 Shared Rules Graph (Memgraph)

The **rules graph** is a **global, shared representation** of regulatory knowledge:

- Nodes: statutes, sections, benefits, reliefs, conditions, timelines, cases, guidance, EU regs/directives, profile tags, change events, concepts.
- Edges: applicability, conditions, mutual exclusions, timelines, cross‑border links, change impact, concept alignments.

Key properties:

- **Write‑guarded**: all writes go through `GraphWriteService` + Graph Ingress Guard.
- **Read‑only to agents**: agents and MCP tools can query but not write directly.
- **Self‑populating**: ingestion jobs and concept capture gradually enrich it.
- **PII‑free**: only public/regulatory knowledge, never tenant or user data.

### 3.2 Timeline Engine

The **Timeline Engine** is a conceptual layer that:

- Interprets `:Timeline` nodes and edges (lookbacks, lock‑ins, deadlines, effective windows, usage frequency).
- Evaluates soundness of scenarios over time:
  - "If I did X on date D, can I claim Y by date D+K?"
  - "What lock‑ins or clawbacks are triggered?"
- Provides structured outputs that agents can explain in natural language.

### 3.3 Agents & Prompt Aspects

Agents are specialised orchestrators for different domains or personas, e.g.:

- Global Regulatory Research Agent
- IE Single‑Director Tax Agent
- Cross‑Border IE/UK Welfare Agent

They rely on **prompt aspects** to assemble system prompts:

- Jurisdiction aspect (IE, IE/UK, EU, etc.).
- Agent role aspect (researcher vs summariser vs scenario simulator).
- Profile/persona aspect (single‑director IE, PAYE worker, etc.).
- Disclaimer aspect (non‑advice, research‑only).
- Additional context aspect (conversation context, active concepts).

Agents do **not** embed bespoke logic for every rule; they call:

- Graph layer for structure.
- Timeline Engine for temporal reasoning.
- LLM providers via `LlmRouter` for language + weak reasoning.

### 3.4 Chat‑First UX

Users primarily interact through chat:

- **Q&A mode**: "What is the VAT rate in Ireland?"  
- **Scenario mode**: "I’m a single‑director IE LTD, paying myself X, can I also claim benefit Y?"  
- **What‑if mode**: "What if I delay this transaction by 6 months? How does that affect tax or welfare eligibility?"

Every chat turn flows through:

1. `/api/chat` in the shell app.
2. Compliance Engine in `reg-intel-core`.
3. LlmRouter + tools (graph, concept capture, etc.).
4. Streaming answer back to the UI + meta (referenced nodes, jurisdictions, uncertainty, etc.).

### 3.5 Concept Capture & Self‑Populating Graph (v0.6)

v0.6 introduces a **SKOS‑inspired concept layer**:

- The main chat LLM call always includes a `capture_concepts` tool.
- The model **streams natural language answer tokens** to the UI **and** emits a **structured concept payload**:
  - `domain`, `kind`, `jurisdiction`
  - `prefLabel`, `altLabels`, `definition`, `sourceUrls`
- The Compliance Engine:
  - Resolves concepts into canonical `:Concept` nodes (or creates them) via `GraphWriteService`.
  - Attaches `:Label` nodes for synonyms (`HAS_ALT_LABEL`).
  - Aligns concepts to rule nodes where possible (`ALIGNS_WITH`).
  - Adds concept IDs and key rule nodes to `ChatResponse.referencedNodes`.

If a concept is **new or sparse**, the engine can:

- Queue an ingestion job keyed by `Concept.id`,
- Use MCP/HTTP tools to fetch official docs (e.g. Revenue VAT/VRT pages, TAC decisions),
- Use extraction agents to create or enrich rule nodes and link them back to the concept.

Over time, this creates a **feedback loop**:

- Conversations reveal important concepts.
- Concepts seed ingestion.
- The rules graph gets richer.
- Future conversations are more grounded and precise.

### 3.6 Conversation Context (v0.6)

Conversations are persisted in Supabase (or another app DB) and have an associated **conversation context**:

- `activeNodeIds`: a small set of `:Concept` and/or rule node IDs relevant so far.
- Possibly, in future, `activeScenarios` and scenario IDs.

After each chat turn:

- The Compliance Engine updates `ConversationContext.activeNodeIds` from the resolved concepts and referenced nodes.
- A prompt aspect (`conversationContextAspect`) turns those IDs into a short human‑readable summary that is injected into the next LLM call.

This gives the model a **stable, graph‑backed memory** for concepts in play, while keeping **all PII and raw messages in Supabase**, not in Memgraph.

### 3.7 Scenario Engine & What‑If (Future‑Facing, Conceptual)

The **Scenario Engine** (spec’d separately) is a conceptual layer that:

- Represents hypothetical fact patterns as structured input (not stored in Memgraph).
- Uses the rules graph + Timeline Engine to evaluate eligibility, conflicts, and trajectories over time.
- Powers "what if I…" queries:
  - Move dates,
  - Change incomes,
  - Add or remove jurisdictions,
  - Explore alternative planning paths.

In v0.6, the Scenario Engine is largely **conceptual** and **API‑level** only; early prototypes may implement limited forms (e.g. simple date shifts, limited rule sets) while the underlying graph and timeline representations are designed to support it.

---

## 4. High‑Level Architecture View (Conceptual)

At a high level, the system is composed of:

1. **Shell App(s)** (e.g. Next.js 16 demo web)
   - Provide `/api/chat` and graph views.
   - Handle auth, tenants, users, conversations (Supabase).

2. **Reg‑Intel Core** (`packages/reg-intel-core`)
   - Compliance Engine / chat orchestrator.
   - Agent selection and prompt assembly.
   - Conversation context loading/saving.
   - Calls LlmRouter, GraphClient, Timeline Engine.

3. **Reg‑Intel Graph** (`packages/reg-intel-graph`)
   - Memgraph drivers and clients.
   - `GraphWriteService` + Graph Ingress Guard.
   - GraphChangeDetector and streaming patches.

4. **Reg‑Intel LLM** (`packages/reg-intel-llm`)
   - LlmRouter and provider adapters (OpenAI, Groq, local models).
   - Egress Guard for outbound calls.
   - Tools configuration (graph queries, concept capture, MCP HTTP tools).

5. **Reg‑Intel Prompts** (`packages/reg-intel-prompts`)
   - Prompt aspect system (jurisdiction, agent, profile, disclaimers, conversation context, feature flags).

6. **External Integrations**
   - Revenue/DSP/EU/TAC sites via MCP/HTTP tools.
   - Supabase/Postgres for chats, conversations, context, tenants.

The **concept spec** does not define the code layout, but these packages shape how the conceptual responsibilities are divided.

---

## 5. Example User Journeys

### 5.1 Simple Rate Lookup – VAT in Ireland

**Question**: "What is the VAT rate in Ireland?"

Conceptual flow:

1. User asks via chat.
2. Compliance Engine calls main chat agent with:
   - Jurisdiction: IE.
   - Profile: generic or single‑director IE LTD.
   - Concept capture tool enabled.
3. LLM:
   - Streams answer: explains VAT standard/reduced/zero rates and caveats.
   - Calls `capture_concepts` with a concept like `{ domain: "TAX", kind: "VAT", jurisdiction: "IE", ... }`.
4. Compliance Engine:
   - Resolves/creates `:Concept { id: "tax:ie:vat" }` via GraphWriteService.
   - Aligns it to existing sections/reliefs if present.
   - Adds `Concept.id` and any aligned nodes to `referencedNodes` and `activeNodeIds`.

Future questions about VAT in IE now have a **stable concept anchor** and graph representation.

### 5.2 VRT and Importing a Car from Japan

**Questions**:

1. "What are the VRT rates in Ireland?"
2. "How do I calculate the cost of importing a car from Japan?"

Conceptual flow:

- Q1 introduces `:Concept { id: "vehicle:ie:vrt" }` and links to VRT sections, rates, and conditions.
- Q2 introduces an "import vehicle from Japan to IE" concept:
  - Concept capture tool outputs a new concept (if not known), e.g. `"vehicle:ie:import_jp"`.
  - Engine resolves/creates this concept and notes it is **under‑specified** (no aligned rules yet).
  - An ingestion job is queued to fetch/infer:
    - VRT rules,
    - Customs duty rules,
    - VAT on imports,
    - Any special regimes.
- Over time, importing a car from Japan becomes a rich subgraph of rules/timelines.

From the user’s perspective, they just see **better answers over time**; from the system’s perspective, each conversation helps build a richer rules graph.

### 5.3 Persona‑Aware Interaction – Single‑Director IE Company

**Question**: "As a single‑director IE LTD, how does paying myself a salary vs dividends interact with PRSI and benefits?"

Conceptual flow:

- User profile / agent selection picks a **Single‑Director IE** agent.
- Profile aspect adds relevant `:ProfileTag` filters to graph queries.
- The agent queries:
  - Tax rules for salary vs dividends.
  - PRSI classes and related benefits.
  - Mutual exclusions and timelines.
- Concept capture might identify:
  - Concepts for specific benefits, PRSI classes, tax treatments.
- Conversation context keeps these concepts active for follow‑up "what if" questions.

---

## 6. Data & Privacy Boundaries (Conceptual)

Core principle:

> **Memgraph is a shared regulatory rules graph; user‑ and tenant‑specific data live elsewhere.**

### 6.1 Memgraph (Global Rules Graph)

Allowed content:

- Public, persistent regulatory knowledge: statutes, sections, benefits, reliefs, conditions, timelines, cases, guidance, EU regs/directives, agreements, regimes, concepts, labels, change events.
- SKOS‑like concept labels and definitions.
- Algorithm‑derived metadata (communities, centrality scores, etc.).

Disallowed content:

- User names, addresses, emails, phone numbers.
- PPS numbers, company IDs, bank details.
- Concrete scenarios ("Alan imported a car in 2024 for €X").
- Tenant IDs, conversation IDs, message transcripts.

All writes are enforced by:

- **Graph Ingress Guard** – label/relationship/property whitelist + PII stripping.
- **GraphWriteService** – single entrypoint for writes.

### 6.2 Supabase / App DB

Contains:

- Tenants, users, auth.
- Conversations, messages.
- Conversation context (active node IDs, flags).
- Scenario data (hypothetical inputs) – if/when implemented.

Not replicated into Memgraph.

### 6.3 Egress Guard

All outbound calls (LLM providers, MCP tools, HTTP APIs) go through an **Egress Guard** that can:

- Redact or mask sensitive fields.
- Enforce tenant policies (e.g. no external egress for certain tenants).
- Route to specialised guard models for higher tiers.

---

## 7. Evolvability & Roadmap Alignment

The concept spec aligns with roadmap v0.6, where:

- **Phase 1–2**: Core chat, basic graph queries, timeline reasoning, IE tax/welfare focus.
- **Phase 3**: Graph streaming patches, referenced node evidence in the UI, early concept capture.
- **Phase 4+**: Scenario Engine (what‑if), richer cross‑border regimes, community/centrality‑aware graph retrieval.

The concept layer is intentionally:

- **Provider‑agnostic** (LLM providers are pluggable behind `LlmRouter`).
- **Shell‑agnostic** (Next.js demo app is one shell; others can be added later).
- **Extensible** to new jurisdictions and regimes by adding:
  - Graph seed data,
  - Agent definitions and prompt aspects,
  - Ingestion profiles.

---

## 8. One‑Sentence Concept Summary

> The Regulatory Intelligence Copilot is a chat‑first, agent‑driven research companion that uses a shared, PII‑free regulatory rules graph – enriched over time via concept capture and ingestion – plus a timeline engine and scenario reasoning to help people understand how complex tax, welfare, and cross‑border rules interact over time, without ever pretending to be legal or tax advice.

