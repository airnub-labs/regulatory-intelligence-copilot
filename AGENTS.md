# AGENTS – Regulatory Intelligence Copilot (v0.6)

> **Status:** Current  
> **Supersedes:** `AGENTS.md` (v0.4)  
> **Aligned with:**  
> - `docs/architecture/architecture_v_0_6.md`
> - `docs/architecture/copilot-concept/regulatory_graph_copilot_concept_v_0_6.md`
> - `docs/architecture/graph/graph_schema_v_0_6.md`
> - `docs/architecture/graph/graph_schema_changelog_v_0_6.md`
> - `docs/architecture/graph/graph_algorithms_v_0_1.md`
> - `docs/architecture/engines/timeline-engine/timeline_engine_v_0_2.md`
> - `docs/architecture/data_privacy_and_architecture_boundaries_v_0_1.md`
> - `docs/architecture/guards/graph_ingress_guard_v_0_1.md`
> - `docs/architecture/guards/egress_guard_v_0_2.md`
> - `docs/architecture/conversation-context/concept_capture_from_main_chat_v_0_1.md`
> - `docs/architecture/conversation-context/conversation_context_spec_v_0_1.md`
> - `docs/architecture/engines/scenario-engine/scenario_engine_v_0_1.md`
> - `docs/governance/decisions/decisions_v_0_6.md`
> - `docs/governance/roadmap/roadmap_v_0_6.md`

> **Purpose:** Define the *logical agents* in the Regulatory Intelligence Copilot and how they should behave under the v0.6 architecture. Implementation details (files, classes, wiring) must follow this specification.

v0.6 updates the v0.4 agent design by:

- Integrating the **concept capture from main chat** pipeline (SKOS‑like concepts via LLM tools) so the rules graph can self‑populate from normal conversations.
- Introducing a **server‑side Conversation Context** (per conversation, per tenant) that tracks which rule graph nodes are “active” and feeds that back into prompts via aspects.
- Clarifying how agents should set `referencedNodes` and how that connects to concept capture, graph enrichment, and the scenario engine.
- Making room for **scenario/what‑if agents** and **discovery/onboarding flows** without changing the core agent interface.

---

## 1. Agent Architecture Overview

The system is **chat‑first**, **engine‑centric**, and **agent‑orchestrated**:

- A single **Global Regulatory Copilot Agent** is the *primary entry point* for user conversations.
- It delegates to **domain/jurisdiction expert agents** and, where relevant, **scenario/what‑if agents**, then reconciles their results.
- Agents are:
  - **Jurisdiction‑aware but jurisdiction‑neutral** by default (they accept one or more jurisdictions as context; code is not hard‑wired to Ireland only except where explicitly intended for a specialist lens).
  - Consumers of the **Memgraph Regulatory Rules Graph** (no writes) using `GraphClient` with `graph_schema_v_0_6.md`.
  - Users of the **Timeline Engine v0.2** for any time‑based logic.
  - Callers of LLMs through a **provider‑agnostic LLM router** (no direct calls to OpenAI/Groq/etc.).
  - Subject to **egress guard aspects** before anything leaves the platform.
  - Beneficiaries of an **implicit concept capture tool** and **Conversation Context** managed by the Compliance Engine – agents do not perform separate entity‑extraction calls.

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
  // ConversationContext is managed server-side by the Compliance Engine and
  // injected into prompts via aspects; it is *not* a required field here.
}

interface AgentChatResponse {
  answer: string;

  // Graph node IDs referenced in reasoning (rules, benefits, timelines, etc.).
  // These are used to:
  // - populate ChatResponse.referencedNodes,
  // - update per-conversation ConversationContext.activeNodeIds,
  // - drive graph highlighting/evidence in the UI.
  referencedNodes: string[];

  // Jurisdictions actually considered for this answer (may be narrower than
  // profile.jurisdictions if the agent focuses on a subset).
  jurisdictions: string[];

  // Coarse confidence signal for downstream UX and safety messaging.
  uncertaintyLevel: 'low' | 'medium' | 'high';

  // Key for standardised disclaimer text (e.g. 'research_only_tax',
  // 'research_only_welfare').
  disclaimerKey: string;

  // Which agent produced this answer.
  agentId: string;
}
```

All agents **MUST**:

- Use the **GraphClient** (read‑only) instead of hard‑coding rules.
- Use the **Timeline Engine** for time logic; never hard‑code statutory durations.
- Use the **prompt aspect system** to build system prompts.
- Call the **LLM router** with an appropriate `task` (e.g. `"main-chat"`) and rely on tenant/task policies to select model and provider.
- Respect **ingress/egress guardrails** and never introduce user PII into Memgraph or external calls.
- Populate `referencedNodes` with the Memgraph IDs of rules/benefits/sections/timelines actually used, so that:
  - `ChatResponse.referencedNodes` can be set accurately.
  - `ConversationContext.activeNodeIds` can be updated (see `conversation_context_spec_v_0_1.md`).
- Treat **concept capture** as an engine capability:
  - Agents do *not* call a separate entity‑extraction task.
  - The Compliance Engine attaches a `capture_concepts` tool (see `concept_capture_from_main_chat_v_0_1.md`) to main‑chat LLM calls and processes its output behind the scenes.

### 1.2 Non‑Chat / Utility Agents

Some agents are not directly exposed to the user but are part of the agent layer conceptually:

- **Graph ingestion agents** – orchestrate MCP calls + LLM extraction to turn source documents into graph upserts (always via `GraphWriteService` + Graph Ingress Guard).
- **Change detection / impact analysis agents** – reason over `:Update`/`:ChangeEvent` nodes and affected rules to summarise impacts.
- **Scenario/what‑if agents** – built on `scenario_engine_v_0_1.md`, they evaluate alternative paths and explain trade‑offs.
- **Egress guard helper agents** – small LLM/deterministic helpers that inspect outbound payloads (to LLMs/MCPs) for PII / risky content.

These follow the same safety and graph‑access rules but may have narrower interfaces (batch jobs, ingestion pipelines, etc.).

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
- Coordinates with **scenario/what‑if agents** for explicit “what if I do X vs Y?” questions (see `scenario_engine_v_0_1.md`).

### 2.2 Responsibilities

1. **Conversation orchestration**
   - Interpret the user’s question, persona/profile tags, and jurisdiction context.
   - Decide whether to:
     - Answer directly using **global graph queries** + Timeline Engine, or
     - Delegate to one or more **expert agents** and merge results, or
     - Invoke scenario/what‑if evaluation via the Scenario Engine.
   - Record which agents and rule clusters contributed to the answer.

2. **Graph‑first reasoning**
   - Use `GraphClient` to query the rules graph for:
     - Relevant statutes/sections, benefits, reliefs, guidance, case law, EU instruments, treaties, special regimes.
     - Conditions, timelines, mutual exclusions, cross‑jurisdiction links.
   - Pull a **local neighbourhood subgraph** relevant to the query based on persona and jurisdictions.
   - Optionally use graph algorithms (as per `graph_algorithms_v_0_1.md`) to:
     - Identify important nodes/communities in that neighbourhood.
     - Provide better retrieval and explanation hints to the LLM.
   - Ensure all nodes actually used in reasoning are included in `referencedNodes`.

3. **Timeline reasoning via Timeline Engine**
   - When a question involves dates or periods, call the Timeline Engine to:
     - Compute lookback windows.
     - Evaluate lock‑ins and cooling‑off periods.
     - Identify filing deadlines and effective windows.
   - Never hard‑code time rules; always derive them from `:Timeline` nodes in the graph.

4. **Jurisdiction neutrality + expert routing**
   - Treat the user’s jurisdictions as **context**, not as hard‑coded `if/else` logic.
   - Use prompt aspects (jurisdiction + persona) and Conversation Context (active node IDs) to frame the LLM’s view of the subgraph.
   - Where a specific expert exists (e.g. IE single‑director social safety net), call that expert agent with a well‑formed sub‑task.
   - For unsupported jurisdictions, remain helpful using EU principles, graph data, and clear limitations.

5. **Concept capture + Conversation Context integration**
   - Rely on the Compliance Engine to:
     - Attach the `capture_concepts` tool to the main‑chat LLM call.
     - Process tool output into SKOS‑like concept objects.
     - Resolve/upssert concepts in Memgraph and update `referencedNodes` / Conversation Context.
   - Ensure that answers are phrased in a way that makes it easy for the concept capture tool to recognise key regulatory concepts (clear names, jurisdictions, basic definitions).

6. **Safety, disclaimers, and tone**
   - Always set an appropriate `uncertaintyLevel` and `disclaimerKey`.
   - Clearly signal that responses are **research assistance**, not binding advice.
   - Highlight gaps, missing graph coverage, or ambiguous areas rather than guessing.

---

## 3. Domain & Jurisdiction Expert Agents

Expert agents provide **focused lenses** over subsets of the rules graph. They share the same interface but narrower scope.

Examples (non‑exhaustive):

- `SingleDirector_IE_SocialSafetyNet_Agent`
- `IE_SelfEmployed_TaxAgent`
- `IE_CGT_Investor_Agent`
- `IE_RnD_TaxCredit_Agent`
- `EU_CrossBorder_Coordinator_Agent`
- Future: `UK_CrossBorder_Agent`, `IM_TaxAndWelfare_Agent`, etc.

### 3.1 Common Responsibilities

All expert agents:

- **Scope:**
  - Focus on a domain (e.g. social welfare, CGT, pensions) and a set of jurisdictions.
  - Make their scope explicit in prompts, logs, and documentation.

- **Graph usage:**
  - Query Memgraph via `GraphClient` using the schema in `graph_schema_v_0_6.md`.
  - Prefer fetching a small, relevant subgraph plus timeline info rather than raw documents.
  - Populate `referencedNodes` with the IDs of rules/benefits/sections/timelines actually used.

- **Timeline usage:**
  - Call Timeline Engine whenever time‑based reasoning is involved.

- **Conversation Context awareness:**
  - Benefit from Conversation Context automatically applied via prompt aspects (e.g. “The user’s conversation so far involves VAT (IE) and VRT (IE)”).
  - Do not attempt to manage or persist context themselves.

- **Concept capture friendliness:**
  - Use clear, canonical labels for concepts and link them to jurisdictions (e.g. “Irish Value‑Added Tax (VAT)”, “Vehicle Registration Tax (VRT) in Ireland”).
  - Let the Compliance Engine handle the SKOS‑style concept capture and graph enrichment.

### 3.2 Delegation from Global Agent

The Global Regulatory Copilot Agent may delegate to expert agents when:

- A question clearly falls into a specialist domain (e.g. IE CGT calculations for an investor).
- A cross‑border question requires a coordinating agent (e.g. IE–UK self‑employed tax and social security).
- A scenario/what‑if question needs domain‑specific calculation before scenario comparison.

Expert agents return an `AgentChatResponse` which the global agent then merges into a single answer, preserving:

- `referencedNodes` (union of all unique node IDs).
- Combined jurisdictions.
- A conservative `uncertaintyLevel` (max of contributing agents).

---

## 4. Scenario & What‑If Agents (v0.6)

Scenario/what‑if agents sit on top of the **Scenario Engine** (`scenario_engine_v_0_1.md`) and help users explore alternative paths (e.g. “import car now vs next year”, “claim benefit A vs benefit B”).

### 4.1 Roles

- Interpret scenario definitions (baseline plus one or more alternatives).
- Call domain/jurisdiction expert agents as needed to:
  - Evaluate each scenario against the rules graph and timelines.
  - Estimate high‑level impacts (eligibility, tax payable, risk indicators, lock‑ins).
- Produce a comparison answer that:
  - Clearly describes each scenario.
  - Surfaces key trade‑offs and constraints.
  - Stays within the research‑only safety boundary.

### 4.2 Interaction with Conversation Context & Concept Capture

- Scenario agents receive prompts that already include:
  - Relevant `ConversationContext` (activeNodeIds summarised as natural language), and
  - Any SKOS concepts captured so far in the conversation.
- They:
  - Continue to populate `referencedNodes` with the rules used in scenario evaluation.
  - Benefit from concept capture but do not manage it directly.

Scenario agents **do not** store scenario data in Memgraph. Scenario definitions and user‑specific inputs live in Supabase/Postgres as per `conversation_context_spec_v_0_1.md` and scenario engine docs.

---

## 5. Shared Behaviour, Safety & Guards

### 5.1 Graph Access

- All agents use **read‑only** `GraphClient` to query Memgraph.
- Any writes (concept upserts, rule updates, ingestion) are done via **GraphWriteService + Graph Ingress Guard**, not by agents directly.
- Memgraph remains **PII‑free** and **tenant‑agnostic**; agents must not attempt to store user‑ or tenant‑specific data as nodes/edges.

### 5.2 Timeline Engine

- Agents must route all non‑trivial time reasoning through the Timeline Engine.
- Time rules are stored as `:Timeline` nodes and edges in Memgraph and interpreted by the engine.

### 5.3 LLM Router & Provider Policies

- Agents never call providers directly; they always go through the **LLM router**.
- Tenant and task policies determine which models/providers are used and whether remote egress is allowed.
- AI SDK v5, Responses API, and other provider specifics are implementation details behind the `LlmProvider` abstraction.

### 5.4 Egress Guard

- All outbound calls (LLMs, MCP, HTTP) are wrapped by the **Egress Guard**.
- Egress Guard applies:
  - Static/deterministic checks (PII patterns, domain allowlists, etc.).
  - Optional LLM‑powered inspectors (egress guard helper agents).
- Agents must be written assuming that egress may be **blocked, redacted, or downgraded** depending on tenant policy.

### 5.5 Concept Capture & Self‑Populating Graph

- The Compliance Engine attaches the `capture_concepts` tool to main‑chat LLM calls.
- Tool output is parsed into SKOS‑like concept objects and processed by:
  - A **canonical concept resolver** (graph‑only in v0.1), and
  - **GraphWriteService** for new or incomplete concepts.
- Agents:
  - Must not implement their own concept extraction pipelines.
  - Should use clear terminology and cite jurisdictions to help concept capture.
  - Rely on updated graph content and Conversation Context in subsequent turns.

### 5.6 Conversation Context

- Conversation Context is stored in Supabase/Postgres (per tenant, per conversation) and managed by the Compliance Engine.
- It typically includes:
  - `activeNodeIds` (graph nodes recently referenced in answers).
  - Scenario/what‑if metadata (where relevant).
- Agents do not read or write Conversation Context directly; they benefit from it via prompt aspects that summarise the active concepts and nodes.

### 5.7 Privacy, Redaction, and Non‑Advice Line

- Agents run inside controlled backends and/or E2B sandboxes.
- PII and sensitive business information must be handled according to `data_privacy_and_architecture_boundaries_v_0_1.md`.
- All responses must:
  - Respect the **research‑only** positioning.
  - Use `disclaimerKey` to signal the correct standard disclaimer.
  - Avoid definitive claims about entitlement, liability, or compliance status.

---

## 6. Extending the Agent Set – Checklist (v0.6)

When adding or modifying an agent, ensure:

1. **Documented Identity & Scope**  
   - Add/update the agent’s entry in `AGENTS.md` with an ID, scope, responsibilities, and jurisdictions.

2. **Engine‑Aligned Implementation**  
   - Use `ComplianceEngine` / `GraphClient` / Timeline Engine / LLM router.  
   - No direct provider calls or direct Memgraph writes.

3. **Prompt Aspects, Concept Capture & Guards**  
   - Use prompt aspects (jurisdiction, persona, agent context, disclaimers, Conversation Context) to build system prompts.  
   - Ensure all outbound calls flow through the Egress Guard.  
   - Do **not** build your own entity‑extraction pipeline; rely on the shared `capture_concepts` tool and concept capture spec.  
   - Ensure any proposed graph changes go via Graph Ingress Guard.

4. **Jurisdiction, Persona & Scenario Awareness**  
   - Respect profile personas and jurisdictions; don’t hard‑code countries unless the agent is intentionally specific (e.g. IE‑only lens).  
   - When relevant, integrate with the Scenario Engine through the global agent rather than duplicating scenario logic.

5. **Safety & Non‑Advice**  
   - Maintain the research‑only stance; never claim to provide definitive legal/tax/welfare advice.  
   - Set `uncertaintyLevel` conservatively and choose an appropriate `disclaimerKey`.

Following this spec keeps the agent layer consistent with the v0.6 architecture and allows the entire system to be reused in other host apps (e.g. separate Next.js/Supabase SaaS products) without rewriting core logic.

