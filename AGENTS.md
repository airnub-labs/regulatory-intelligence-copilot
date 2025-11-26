# AGENTS – Regulatory Intelligence Copilot (v0.4)

> **Status:** Current  
> **Supersedes:** `AGENTS.md` (v0.3)  
> **Aligned with:**  
> - `docs/architecture_v_0_4.md`  
> - `docs/specs/regulatory_graph_copilot_concept_v_0_4.md`  
> - `docs/specs/graph_schema_v_0_4.md`  
> - `docs/specs/graph_algorithms_v_0_1.md`  
> - `docs/specs/timeline_engine_v_0_2.md`  
> - `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`  
> - `docs/specs/graph_ingress_guard_v_0_1.md`  
> - `docs/specs/egress_guard_v_0_2.md`  
> - `docs/specs/special_jurisdictions_modelling_v_0_1.md`  
> - `docs/decisions_v_0_4.md`  
> - `docs/roadmap_v_0_4.md`

> **Purpose:** Define the *logical agents* in the Regulatory Intelligence Copilot and how they should behave. Implementation details (files, classes, wiring) must follow this specification.

This v0.4 document updates the v0.3 agent design to reflect:

- Node 24 LTS baseline and modern web stack (Next.js 16, React 19, Tailwind 4).
- Provider‑agnostic LLM routing (OpenAI Responses incl. GPT‑OSS, Groq, local/OSS models).
- Vercel AI SDK v5 used **only inside LLM provider adapters**, never directly by agents or UI.
- Direct Memgraph `GraphClient` using `graph_schema_v_0_4.md` as the authoritative rules model.
- Prompt **aspects** for jurisdiction, persona/profile, disclaimers and agent context.
- Strict **ingress/egress guards**:
> - Memgraph is a **shared rules graph** (no tenant/user PII; all writes via `GraphWriteService` + Graph Ingress Guard).
> - All external calls (LLM/MCP/HTTP) pass via an **Egress Guard** that can apply custom/AI aspects.
- Cross‑jurisdiction modelling including IE/UK/NI/IM/MT/GI/AD and CTA/EU interactions.

---

## 1. Agent Architecture Overview

The system is **chat‑first**, **engine‑centric**, and **agent‑orchestrated**:

- A single **Global Regulatory Copilot Agent** is the *primary entry point* for user conversations.
- It delegates to **domain/jurisdiction expert agents** when needed, then reconciles their results.
- Agents are:
  - **Jurisdiction‑aware but jurisdiction‑neutral** by default (they accept one or more jurisdictions as context; code is not hard‑wired to Ireland only except where explicitly intended for a specialist lens).
  - Consumers of the **Memgraph Regulatory Rules Graph** (no writes) using `GraphClient` with `graph_schema_v_0_4.md`.
  - Users of the **Timeline Engine v0.2** for any time‑based logic.
  - Callers of LLMs through a **provider‑agnostic LLM router** (no direct calls to OpenAI/Groq/etc.).
  - Subject to **egress guard aspects** before anything leaves the platform.

Agents are identified by **stable agent IDs** (strings) used in prompts, routing, tenant policies, and logging.

### 1.1 Agent Interfaces (Logical)

All chat‑facing agents operate over a shared logical interface (TS types may differ but should follow this shape):

```ts
interface UserProfileContext {
  tenantId: string;
  persona: string;               // e.g. 'single-director', 'advisor', 'individual-investor'
  jurisdictions: string[];       // e.g. ['IE'], ['IE','EU'], ['MT','EU'], ['IE','UK','NI']
  locale?: string;               // e.g. 'en-IE'
}

interface AgentChatRequest {
  messages: ChatTurn[];          // conversation history
  profile: UserProfileContext;
}

interface AgentChatResponse {
  answer: string;
  referencedNodes: string[];     // graph node IDs referenced in reasoning
  jurisdictions: string[];       // jurisdictions considered for this answer
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;         // key for standardised disclaimer text
  agentId: string;               // which agent produced this answer
}
```

All agents **MUST**:

- Use the **GraphClient** (read‑only) instead of hard‑coding rules.
- Use the **Timeline Engine** for time logic; never hard‑code statutory durations.
- Use the **prompt aspect system** to build system prompts.
- Call the **LLM router** with an appropriate `task` (e.g. `"main-chat"`) and rely on tenant/task policies to select model and provider.
- Respect **ingress/egress guardrails** and never introduce user PII into Memgraph or external calls.

---

## 2. Global Regulatory Copilot Agent

**Agent ID (canonical):** `global_regulatory_copilot`  
**Role:** Primary orchestrator and generalist, chat entry point.

### 2.1 Scope

- First contact for *all* user questions.
- Works across domains:
  - Tax (income, corporation, CGT).  
  - Social welfare and benefits.  
  - Pensions.  
  - Company/director obligations.  
  - EU‑level rules affecting any of the above.  
  - Cross‑border interactions (e.g. IE–UK–NI–IM–MT–EU).

### 2.2 Responsibilities

1. **Conversation orchestration**
   - Interpret the user’s question, persona/profile tags, and jurisdiction context.
   - Decide whether to:
     - Answer directly using **global graph queries** + Timeline Engine, or
     - Delegate to one or more **expert agents** and merge results.
   - Record which agents and rule clusters contributed to the answer.

2. **Graph‑first reasoning**
   - Use `GraphClient` to query the rules graph for:
     - Relevant statutes/sections, benefits, reliefs, guidance, case law, EU instruments, treaties, special regimes.
     - Conditions, timelines, mutual exclusions, cross‑jurisdiction links.
   - Pull a **local neighbourhood subgraph** relevant to the query based on persona and jurisdictions.
   - Optionally use graph algorithms (as per `graph_algorithms_v_0_1.md`) to:
     - Identify important nodes/communities in that neighbourhood.
     - Provide better retrieval and explanation hints to the LLM.

3. **Timeline reasoning via Timeline Engine**
   - When a question involves dates or periods, call the Timeline Engine to:
     - Compute lookback windows.
     - Evaluate lock‑ins and cooling‑off periods.
     - Identify filing deadlines and effective windows.
   - Never hard‑code time rules; always derive them from `:Timeline` nodes in the graph.

4. **Jurisdiction neutrality + expert routing**
   - Treat the user’s jurisdictions as **context**, not as hard‑coded `if/else` logic.
   - Use prompt aspects (jurisdiction + persona) to frame the LLM’s view of the subgraph.
   - Where a specific expert exists (e.g. IE single‑director social safety net), call that expert agent with a well‑formed sub‑task.
   - For unsupported jurisdictions, remain helpful using EU principles, graph data, and clear limitations.

5. **Safety and tone**
   - Provide **research assistance**, not legal/tax/welfare advice.
   - Emphasise ambiguity and encourage consulting qualified professionals.
   - Avoid telling users exactly what to claim or how to file; instead, explain rules, interactions, trade‑offs, and good questions to ask.

---

## 3. Expert Research Agents (Domain & Jurisdiction Lenses)

Expert agents are **narrow and deep** lenses into the same underlying rules graph.

They:

- Use the **same GraphClient and Timeline Engine** as the global agent.
- Have **specialised prompts** (built from shared prompt aspects) that focus them on a particular domain + jurisdiction combination.
- Are invoked by the global agent when it detects that a question fits their niche.
- Return structured data the global agent can merge into a single conversational answer.

The architecture must allow adding new expert agents (e.g. for Malta, Isle of Man, UK cross‑border, etc.) without modifying the global orchestrator’s core logic.

Below are the initial v0.4 lenses.

---

### 3.1 Single‑Director IE Social Safety Net Agent

**Agent ID:** `single_director_ie_social_safety_net`  
**Scope:** Social welfare and related entitlements for a **single‑director company** registered in Ireland.

#### Responsibilities

- Interpret the user’s situation via profile:
  - Persona: `single-director` (company owner/manager).  
  - Primary jurisdiction: `IE`.  
  - Possible cross‑border context: `['IE','UK','NI']`, `['IE','EU']`, etc.

- Use the graph to:
  - Find relevant **benefits**: Jobseeker’s Benefit (Self‑Employed), Illness Benefit, Treatment Benefit, Paternity/Maternity/Parent’s Benefit, State Pension, etc.
  - Follow edges from benefits to conditions and profile tags, e.g.:
    - `:REQUIRES`, `:LIMITED_BY`, `:EXCLUDES`, `:MUTUALLY_EXCLUSIVE_WITH`, `:APPLIES_TO_PROFILE`, `:IN_JURISDICTION`.
  - Discover **mutual exclusions** and compatibility:
    - Which benefits cannot be combined at the same time.
    - How taking salary vs dividends affects PRSI class and future entitlements.

- Apply **timeline logic** to:
  - Contributions lookback windows (PRSI history).
  - Waiting periods and review cycles.
  - Lock‑in effects of decisions (e.g. choosing certain schemes).

- Provide **plain‑language explanations** of:
  - Why a benefit may or may not be available.
  - What interactions exist between benefits, PRSI classes, and company status.

- Clearly **avoid personalised advice**; frame results as insights about rules and possible questions to bring to an advisor or welfare office.

---

### 3.2 IE Tax & Company Obligations Agent

**Agent ID:** `ie_tax_company_obligations`  
**Scope:** Irish tax and company law obligations for small companies and self‑employed individuals.

#### Responsibilities

- Use graph nodes/edges for:
  - Corporation tax, income tax, VAT rules.
  - Filing obligations (annual returns, CT1, VAT returns, etc.).
  - Director obligations and close‑company rules.

- Focus on:
  - **Timelines**: filing deadlines, payment due dates, preliminary tax rules.
  - **Interactions**: how taking income as salary vs dividends impacts tax and PRSI, and how that flows into welfare and pension entitlements.
  - **Conflict detection**: whether using one relief affects eligibility for another (mutual exclusions, stacking rules, limits).

- Provide structured explanations and highlight connections to other domains (welfare/PRSI, pensions, CGT) for the global agent to merge.

---

### 3.3 EU Regulation & Cross‑Border Coordination Agent

**Agent ID:** `eu_cross_border_coordination`  
**Scope:** EU regulations/directives, social security coordination, and cross‑border interactions (e.g. IE–MT–IM–EU, IE–UK–NI with special agreement structures).

#### Responsibilities

- Work with:
  - `:EURegulation`, `:EUDirective`, `:Agreement`, `:Regime` nodes.  
  - Edges like `:IMPLEMENTED_BY`, `:OVERRIDES`, `:COORDINATED_WITH`, `:TREATY_LINKED_TO`, `:EQUIVALENT_TO`, `:APPLIES_TO_JURISDICTION`.

- Answer questions like:
  - Which country's system applies when the user works in multiple EU states?  
  - How coordination instruments (e.g. EC 883/2004) affect benefit or contribution rules.  
  - How an EU court decision affects domestic interpretation in IE/UK/NI/IM/MT.

- Provide **cross‑jurisdiction views** for the global agent to integrate into overall guidance.

This agent must respect the special modelling in `special_jurisdictions_modelling_v_0_1.md` (e.g. NI’s dual status, CTA relationships, Gibraltar/Andorra edge cases).

---

### 3.4 CGT & Investments Agent (Ireland)

**Agent ID:** `ie_cgt_investments`  
**Scope:** Irish Capital Gains Tax & investment‑related rules, especially **timing‑sensitive** aspects (disposals, reacquisitions, loss relief, anti‑avoidance patterns).

#### Responsibilities

- Use the rules graph to reason about:
  - CGT‑related `:Section`, `:Relief`, `:Condition`, and `:Timeline` nodes.
  - Conditions and timelines around disposals, reacquisitions, matching rules, and anti‑avoidance.

- Use timelines to:
  - Explain lookback windows affecting loss relief.
  - Identify when a sale and buyback pattern may trigger restrictions.

- Provide structured explanations of:
  - How different timing choices can change which rules apply.
  - Which combinations may be disallowed (mutual exclusions / anti‑avoidance) according to the modelled rules.

- **Never** give personalised trading or tax advice; focus on explaining the rule structure.

---

### 3.5 R&D Tax Credit Agent (Ireland)

**Agent ID:** `ie_rnd_tax_credit`  
**Scope:** Irish R&D tax credit regime (and related reliefs), focusing on eligibility, interactions, and documentation expectations.

#### Responsibilities

- Operate on a focused subgraph of R&D‑related statutes, reliefs, and guidance.
- Explain:
  - Eligibility conditions and thresholds.
  - Interactions with other state aid and reliefs (mutual exclusions, stacking limits, sector‑specific constraints).
  - Documentation expectations and typical risk points (as reflected in guidance and case law where modelled).

- Provide a clear explanation of **why** a project may appear to meet (or not meet) criteria, but avoid definitive eligibility pronouncements.

---

### 3.6 Future / Cross‑Jurisdiction Expert Agents

The system must support adding more expert lenses, for example:

- `uk_ie_cross_border_income_agent` – UK/IE employment and income tax coordination, including NI and CTA specifics.
- `im_tax_and_welfare_agent` – Isle of Man tax and social security interactions, including cross‑border IE/UK workers.
- `mt_tax_company_obligations` – Malta tax & company law for SMEs and single‑director analogues.
- `gi_financial_services_agent` – Gibraltar tax and regulatory edge cases for finance.
- `ad_cross_border_workers_agent` – Andorra cross‑border worker rules and interactions with ES/FR/EU regimes.

When defining future agents:

1. Declare the new agent in `AGENTS.md` with clear scope and responsibilities.  
2. Implement it using the same GraphClient, Timeline Engine, LLM router, and prompt aspects.  
3. Register it with the orchestrator so the global agent can route appropriately.

---

## 4. Backend / Maintenance Agents (Non‑Chat)

Some “agents” are **backend components** rather than user‑facing chat personas, but they follow similar principles.

### 4.1 Change Monitoring & Ingestion Agent

**Conceptual ID:** `regulatory_change_ingestion_agent`

Responsibilities:

- Monitor MCP sources (via E2B MCP gateway) for:
  - New court/tribunal decisions (TAC, Irish courts, CJEU, UK courts, etc.).
  - Revenue/authority guidance updates (eBriefs, manuals, circulars).
  - Pensions/social welfare updates.
  - EU regulations/directives and implementation changes.

- Propose graph changes (new nodes/edges) which are:
  - Normalised to the current schema.
  - Passed through **Graph Ingress Guard aspects** to prevent PII or tenant‑specific data entering Memgraph.

- Optionally trigger graph algorithms (per `graph_algorithms_v_0_1.md`) to refresh communities or centrality hints after major updates.

This agent is typically invoked as a scheduled job or background workflow rather than from chat.

### 4.2 Graph QA & Consistency Agent (Future)

Potential future agent to:

- Periodically scan the graph for:
  - Broken references.
  - Conflicting relationships (e.g. contradictory `:EXCLUDES` / `:REQUIRES` edges).
  - Missing timelines where they are expected.
- Surface issues to maintainers.

This agent must also respect the graph ingress guard rules and never introduce PII.

---

## 5. Shared Behaviour & Safety Rules

All agents MUST follow these principles:

### 5.1 Graph‑First, LLM‑Second

- Use the Memgraph rules graph as the **first stop** for relevant rules and relationships.
- Only then use LLMs (via the LLM router + Egress Guard) to:
  - Summarise results.
  - Rank or structure relevant rules.
  - Generate natural‑language explanations and caveats.

### 5.2 Timeline Engine for Temporal Logic

- Never hard‑code dates or durations in prompts or code.
- Always derive time rules from `:Timeline` nodes and pass them to the Timeline Engine for evaluation.

### 5.3 Jurisdiction & Persona‑Aware Prompts via Aspects

- All prompts must be built using the **prompt aspect system** (e.g. `jurisdictionAspect`, `agentContextAspect`, `profileContextAspect`, `disclaimerAspect`, `additionalContextAspect`).
- No agent should hand‑craft raw system prompts; aspects enforce consistency, safety, and jurisdiction/persona awareness.

### 5.4 Provider‑Agnostic LLM Usage

- Agents call a **logical task** on the LLM router (e.g. `"main-chat"`, `"egress-guard"`, `"pii-sanitizer"`) and must not depend on a specific provider or model.
- Tenant‑ and task‑specific model selection is handled by configuration and the router, not by the agent itself.
- The LLM router may internally use Vercel AI SDK v5–based providers (OpenAI Responses incl. GPT‑OSS, Groq, OSS models), but agents must be unaware of this.

### 5.5 Privacy, Redaction, and Egress Control

- Agents run inside controlled backends and/or E2B sandboxes.
- **Egress Guard aspects** are applied before any context is sent to external LLMs or MCPs:
  - Redacting PII and sensitive business information when configured.
  - Allowing specialised “egress guard agents” (small LLMs or deterministic logic) to inspect payloads.
- The Memgraph graph stores **rules and relationships only**, never user‑ or tenant‑specific data.

### 5.6 Research Assistance, Not Legal Advice

- Clearly signal that responses are **intelligence and research tools**.
- Encourage users to consult qualified professionals for decisions involving risk, disputes, or large sums.
- Surface uncertainty levels and references when appropriate.

---

## 6. Extending the Agent Set – Checklist

When adding or modifying an agent, ensure:

1. **Documented Identity & Scope**  
   - Add/update the agent’s entry in `AGENTS.md` with an ID, scope, responsibilities, and jurisdictions.

2. **Engine‑Aligned Implementation**  
   - Use `ComplianceEngine` / `GraphClient` / `TimelineEngine` / LLM router.  
   - No direct provider calls or direct Memgraph writes.

3. **Prompt Aspects & Guards**  
   - Use prompt aspects to build system prompts.  
   - Ensure all outbound calls flow through Egress Guard.  
   - Ensure any proposed graph changes go via Graph Ingress Guard.

4. **Jurisdiction & Persona Awareness**  
   - Respect profile personas and jurisdictions; don’t hard‑code countries unless the agent is intentionally specific (e.g. IE‑only lens).

5. **Safety & Non‑Advice**  
   - Maintain the research‑only stance; never claim to provide definitive legal/tax/welfare advice.

Following this spec keeps the agent layer consistent with the v0.4 architecture and allows the entire system to be reused in other host apps (e.g. a separate Next.js/Supabase SaaS) without rewriting core logic.

