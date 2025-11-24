# AGENTS – Regulatory Intelligence Copilot (v0.3)

> **Status:** Current (aligned with:** `architecture_v_0_3.md`, `regulatory_graph_copilot_concept_v_0_3.md`, `graph_schema_v_0_3.md`, `timeline_engine_v_0_2.md`, `decisions_v_0_3.md`, `roadmap_v_0_3.md`)  
> **Purpose:** Define the *logical* agents in the Regulatory Intelligence Copilot and how they should behave. Implementation details (files, classes, wiring) must follow this specification.

This document supersedes earlier versions of `AGENTS.md` and incorporates the v0.3 decisions including:

- Node 24 LTS baseline.
- Next.js 16 / React 19 / Tailwind 4 for web apps.
- Provider-agnostic LLM routing (OpenAI Responses + GPT‑OSS, Groq, local/OSS models).
- Vercel AI SDK v5 used only inside LLM provider adapters (never in agents/UI).
- Direct Memgraph `GraphClient` using `graph_schema_v_0_3.md`.
- Prompt aspects and jurisdiction‑neutral base prompts.
- Tenant‑ and task‑aware LLM policies and egress control.

---

## 1. Agent Architecture Overview

The system is **chat‑first** and **agent‑orchestrated**:

- A single **Global Regulatory Copilot Agent** is the *primary entry point* for user conversations.
- It delegates to **domain/jurisdiction expert agents** when needed, then reconciles their results.
- All agents:
  - Are **jurisdiction‑aware but jurisdiction‑neutral** by default (they accept one or more jurisdictions as context; code is not hard‑wired to Ireland only except where explicitly intended for a specialist lens).
  - Use the **Memgraph regulatory graph** (`graph_schema_v_0_3.md`) as the structured source of truth.
  - Use the **Timeline Engine** (`timeline_engine_v_0_2.md`) for any time‑based logic.
  - Call LLMs through the **provider‑agnostic LLM router** (no direct calls to OpenAI/Groq/etc.).
  - Respect **privacy / egress guardrails** and never leak raw personal data unnecessarily.

Agents are identified by **stable agent IDs** (strings) used in prompts, routing, tenant policies, and logging.


### 1.1 Agent Inputs & Outputs

All agents operate over a shared logical interface (actual TypeScript types may differ but should follow this shape):

```ts
interface UserProfileContext {
  tenantId: string;
  persona: string;               // e.g. 'single-director', 'advisor', 'individual-investor'
  jurisdictions: string[];       // e.g. ['IE'], ['IE','EU'], ['MT','EU']
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

All agents must:

- Use the **GraphClient** and **Timeline Engine** instead of hard‑coding rules.
- Use the **prompt aspect system** to build system prompts.
- Call the **LLM router** with an appropriate `task` (e.g. `"main-chat"`) and rely on tenant/task policies to select model and provider.

---

## 2. Global Regulatory Copilot Agent

**Agent ID (suggested):** `global_regulatory_copilot`  
**Role:** Primary orchestrator and generalist.

### 2.1 Scope

- First contact for *all* user questions.
- Works across:
  - Tax (income, corporation, CGT)  
  - Social welfare and benefits  
  - Pensions  
  - Company/director obligations  
  - EU‑level rules affecting any of the above  
  - Cross‑border interactions (e.g. IE–MT–IM–EU)

### 2.2 Responsibilities

1. **Conversation orchestration**
   - Interpret the user’s question, profile (persona tags), and jurisdiction context.
   - Decide whether to:
     - Answer directly using **global graph queries**, or
     - Delegate to one or more **expert agents** and merge results.

2. **Graph‑first reasoning**
   - Use `GraphClient` to query the regulatory graph for:
     - Relevant statutes/sections, benefits, reliefs, guidance, case law nodes.
     - Conditions, timelines, mutual exclusions, and cross‑jurisdiction links.
   - Pull a **local neighbourhood subgraph** relevant to the query based on persona and jurisdictions.
   - Use the LLM router to explain that subgraph in natural language.

3. **Timeline reasoning via Timeline Engine**
   - When a question involves dates or periods, call the Timeline Engine to:
     - Compute lookback windows.
     - Evaluate lock‑ins.
     - Identify filing deadlines and effective windows.
   - Never hard‑code time rules; always derive them from `:Timeline` nodes in the graph.

4. **Jurisdiction neutrality + expert routing**
   - Treat the user’s jurisdictions as **context**, not as hard‑coded if/else logic.
   - Where a specific expert exists (e.g. IE single‑director social safety net), call that expert agent with a well‑formed sub‑task.
   - For unsupported jurisdictions, remain helpful using EU principles, general patterns, and graph data where available, while clearly flagging limitations.

5. **Safety and tone**
   - Provide **research assistance**, not legal/tax/welfare advice.
   - Emphasise ambiguity and encourage users to confirm with qualified professionals.
   - Avoid telling users exactly what to claim or how to file; instead, explain rules, interactions, and trade‑offs.

---

## 3. Expert Agents

Expert agents are **narrow and deep** lenses into the same underlying graph.
They:

- Use the **same GraphClient and Timeline Engine** as the global agent.
- Have **specialised prompts** (built from shared aspects) that focus them on a particular domain + jurisdiction combination.
- Are invoked by the global agent when it detects that a question fits their niche.

The architecture must allow adding new expert agents (e.g. for Malta, Isle of Man, other EU states) without modifying the global orchestrator’s core logic.

Below are the initial v0.3 lenses; their exact file locations may evolve but their behaviour must not.

---

### 3.1 Single‑Director IE Social Safety Net Agent

**Agent ID (suggested):** `single_director_ie_social_safety_net`  
**Scope:** Social welfare and related entitlements for a **single‑director company** registered in Ireland.

#### Responsibilities

- Interpret the user’s situation as a **persona + jurisdiction**:
  - Persona: single director of a limited company.
  - Primary jurisdiction: Ireland (IE).

- Use the graph to:
  - Find relevant **benefits** (Jobseeker’s Benefit (Self‑Employed), Illness Benefit, Treatment Benefit, Paternity/Maternity/Parent’s Benefit, State Pension, etc.).
  - Follow edges from benefits to conditions and profile tags, e.g.:
    - `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `APPLIES_TO`, `IN_JURISDICTION`, `PROFILE_MATCHES`.
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

**Agent ID (suggested):** `ie_tax_company_obligations`  
**Scope:** Irish tax and company law obligations for small companies and self‑employed individuals.

#### Responsibilities

- Use graph nodes/edges for:
  - Corporation tax, income tax, VAT rules.
  - Filing obligations (annual returns, CT1, VAT returns, etc.).
  - Director obligations and close‑company rules.

- Focus on:
  - **Timelines**: filing deadlines, payment due dates, preliminary tax rules.
  - **Interactions**: how taking income as salary vs dividends impacts tax and PRSI.
  - **Conflict detection**: whether using one relief affects eligibility for another (mutual exclusions, limitations).

- Provide structured explanations and highlight connections to other domains (e.g. welfare/PRSI impacts) for the global agent to merge.

---

### 3.3 EU Regulation & Cross‑Border Coordination Agent

**Agent ID (suggested):** `eu_cross_border_coordination`  
**Scope:** EU regulations/directives, social security coordination, and cross‑border interactions (e.g. IE‑MT‑IM‑EU).

#### Responsibilities

- Work primarily with:
  - `:EURegulation` / `:EUDirective` nodes.
  - `IMPLEMENTED_BY`, `OVERRIDES`, `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`, and related edges.

- Answer questions like:
  - Which country's system applies when the user works in multiple EU states?
  - How does EC 883/2004 (or similar coordination instruments) affect benefit or contribution rules?
  - How an EU court decision affects domestic interpretation.

- Provide **cross‑jurisdiction views** for the global agent to integrate into overall guidance.

This agent relies on the special jurisdictions modelling defined in `docs/specs/special_jurisdictions_modelling_v_0_1.md`.

---

### 3.4 CGT & Investments Agent (Ireland)

**Agent ID (suggested):** `ie_cgt_investments`  
**Scope:** Irish Capital Gains Tax & investment‑related rules, especially **timing‑sensitive** aspects (disposals, reacquisitions, loss relief).

#### Responsibilities

- Model and reason over:
  - CGT‑related `:Section` and `:Relief` nodes.
  - Conditions and timelines around disposals, reacquisitions, matching rules, and anti‑avoidance.

- Use timelines to:
  - Explain lookback windows affecting loss relief.
  - Identify when a sale and buyback pattern may trigger restrictions.

- Explain constraints and patterns, **not** personalised trading or tax advice.

---

### 3.5 R&D Tax Credit Agent (Ireland)

**Agent ID (suggested):** `ie_rnd_tax_credit`  
**Scope:** Irish R&D tax credit regime (and related reliefs), focusing on eligibility, interactions, and documentation expectations.

#### Responsibilities

- Work on a focused subgraph of R&D‑related statutes, reliefs, and guidance.
- Explain:
  - Eligibility conditions and thresholds.
  - Interactions with other state aid and reliefs (mutual exclusions, stacking limits).
  - Documentation patterns and risk signals drawn from guidance and case law where modelled.

---

## 4. Shared Behaviour & Safety Rules

All agents MUST follow these principles:

### 4.1 Graph‑first, LLM‑second

- Use the Memgraph regulatory graph as the first stop for relevant rules and relationships.
- Only then use LLMs (via the LLM router) to:
  - Summarise results.
  - Rank or structure relevant rules.
  - Generate natural‑language explanations.

### 4.2 Timeline Engine for Temporal Logic

- Never hard‑code dates or durations in prompts or code.
- Always derive time rules from `:Timeline` nodes and pass them to the Timeline Engine for evaluation.

### 4.3 Jurisdiction‑Aware Prompts via Aspects

- All prompts must be built using the **prompt aspect system**:
  - `jurisdictionAspect`
  - `agentContextAspect`
  - `profileContextAspect`
  - `disclaimerAspect`
  - `additionalContextAspect`

- No agent should hand‑craft raw system prompts; aspects enforce consistency and safety.

### 4.4 Provider‑Agnostic LLM Usage

- Agents call a **logical task** on the LLM router (e.g. `"main-chat"`, `"egress-guard"`, `"pii-sanitizer"`) and must not depend on a specific provider or model.
- Tenant‑ and task‑specific model selection is handled by configuration and the router, not by the agent itself.
- The LLM router may internally use Vercel AI SDK v5–based providers, but agents must be completely unaware of this.

### 4.5 Privacy, Redaction, and Egress Control

- Agents run inside controlled backends and, if applicable, E2B sandboxes.
- An egress‑guard layer must be applied before any context is sent to external LLMs or MCPs.
- Where possible, summarise and anonymise before sending.
- The graph stores **rules and relationships**, not user‑identifiable data.

### 4.6 Research Assistance, Not Legal Advice

- Clearly signal that responses are **intelligence and research tools**.
- Encourage users to consult qualified professionals for decisions involving risk, disputes, or large sums.
- Surface uncertainty levels and references when appropriate.

---

## 5. Extending the Agent Set

The architecture must allow new agents to be added without touching core orchestrator logic.

To add a new agent:

1. Define a **stable agent ID** and description in `AGENTS.md`.
2. Implement the agent using:
   - The shared `GraphClient`.
   - The `TimelineEngine`.
   - The prompt aspect system.
   - The LLM router.
3. Register the agent in the **agent registry/orchestrator** so the global copilot can route to it based on:
   - Jurisdiction context.
   - Persona/profile tags.
   - Detected topic.
4. Add/update tests and, if needed, documentation describing its domain.

Example future agents:

- `mt_tax_company_obligations` – Malta tax & company law for SMEs.
- `im_social_security_agent` – Isle of Man social security & cross‑border coordination.
- `eu_pensions_coordination` – EU pensions and cross‑border retirement coordination.
- `mt_cgt_investments` – Malta CGT and structuring rules.

These agents should follow the same principles and share the same infrastructure as the initial set defined above.

