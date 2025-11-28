# Scenario Integration (v0.1)

> **Status:** Draft v0.1 (aligned with architecture_v_0_6 and scenario_engine_v_0_1)
>
> **Scope:** How the Scenario Engine plugs into the Regulatory Intelligence Copilot stack (Compliance Engine, agents, graph, Timeline Engine, LLM) without changing the core Scenario Engine.

This document is the sibling of `timeline-integration_v_0_3.md` and explains:

- How scenarios are created, stored, and loaded (tenant-local, PII-safe).
- How the **Scenario Engine** composes `GraphClient` and `TimelineEngine`.
- How its results feed into **agents**, **chat**, and **graph UI**.

The core design principles are:

- Scenario Engine is an **orchestration service** in `reg-intel-core`.
- It is **read-only** with respect to Memgraph and has **no LLM / HTTP dependencies**.
- All user/tenant PII lives in tenant storage (e.g. Supabase), never in Memgraph.

---

## 1. Where the Scenario Engine sits in the architecture

High‑level flow for a what‑if or scenario comparison task:

```text
User → /api/chat → ComplianceEngine
    → What-If Scenario Agent
      → Scenario store (Supabase) → Scenario objects
      → ScenarioEngine (reg-intel-core)
        → GraphClient (Memgraph, read-only)
        → TimelineEngine (pure TS library)
      → ScenarioEvaluationResult[]
      → LLM (OpenAI Responses via LlmRouter) + UI
```

Key invariants:

- Scenario data **never** enters Memgraph.
- Scenario Engine **never** writes to Memgraph.
- All graph access is via `GraphClient` (or read-only MCP adapters).
- Any scenario data sent to LLMs passes through **Egress Guard**.

---

## 2. Responsibilities

### 2.1 Scenario Engine

The Scenario Engine is responsible for:

1. Accepting one or more `Scenario` objects (real or hypothetical).
2. For each Scenario, for each `ScenarioSnapshot`:
   - Resolving a **rule universe** from the graph based on:
     - Jurisdictions.
     - Profile tags.
     - Optional domains (welfare, tax, CGT, pensions, etc.).
   - Using the **Timeline Engine** to apply temporal constraints:
     - Lookback windows (contributions, disposals, insurable weeks).
     - Lock‑ins, effective windows, and deadlines.
   - Classifying benefits/reliefs per snapshot as:
     - `applicable` (rules that match snapshot facts),
     - `eligible`,
     - `ineligible` (conditions not met),
     - `lockedOut` (e.g. due to prior claims/lock‑ins).
3. Returning `ScenarioEvaluationResult[]` with node IDs and flags.

It explicitly **does not**:

- Store scenarios or results (host app/Supabase concern).
- Call LLMs or external HTTP endpoints.
- Change Memgraph content.

### 2.2 Graph / Memgraph

- Stores **rules, benefits, reliefs, conditions, timelines, profile tags** as nodes/edges.
- Provides read‑only queries for Scenario Engine via `GraphClient`, e.g.:
  - `getRulesForProfileAndJurisdictions({ jurisdictions, profileTags, domains })`.
  - `getTimelinesForRule(ruleId)`.
- Contains **no PII**; all scenario data is passed in transiently and never written back.

### 2.3 Timeline Engine

- Performs date arithmetic and temporal reasoning (see `docs/architecture/engines/timeline-engine/timeline_engine_v_0_2.md`).
- Scenario Engine calls Timeline Engine functions when rules have `:Timeline` attachments, e.g.:
  - `isWithinLookback(...)` for contribution windows.
  - `isLockInActive(...)` for lock‑ins.

### 2.4 Compliance Engine & Agents

- Decide **when** to invoke scenarios (task routing).
- Load or construct `Scenario` objects from tenant storage and/or prompts.
- Call Scenario Engine to obtain `ScenarioEvaluationResult[]`.
- Feed results into:
  - UI views (tables, charts, scenario compare pages).
  - Chat prompts (as structured evidence).
  - Conversation context (`activeNodeIds`).

---

## 3. Data Contracts (recap from scenario_engine_v_0_1)

### 3.1 Scenario and snapshots

```ts
export type ScenarioId = string;

export interface ScenarioSnapshotFacts {
  [key: string]: unknown; // opaque to the engine; interpreted via rules
}

export interface ScenarioSnapshot {
  at: Date;
  facts: ScenarioSnapshotFacts;
}

export interface Scenario {
  id: ScenarioId;
  label: string;
  jurisdictions: string[]; // e.g. ["IE"], ["IE", "UK"]
  profileTags: string[];   // e.g. ["PROFILE_SINGLE_DIRECTOR_IE"]
  timeline: ScenarioSnapshot[];
}
```

### 3.2 Evaluation result

```ts
export interface ScenarioSnapshotEvaluation {
  at: Date;
  applicableRuleNodeIds: string[];
  eligibleBenefitNodeIds: string[];
  ineligibleBenefitNodeIds: string[];
  lockedOutBenefitNodeIds: string[];
  flags: string[]; // e.g. ["LOCK_IN_ACTIVE", "NO_RULES_FOUND"]
}

export interface ScenarioEvaluationResult {
  scenarioId: ScenarioId;
  label: string;
  snapshots: ScenarioSnapshotEvaluation[];
}
```

All node IDs are **rule graph node IDs**, suitable for dereferencing in the UI and for `ConversationContext.activeNodeIds`.

### 3.3 Public Scenario Engine API

```ts
export interface ScenarioEngineEvaluateOptions {
  domains?: string[];              // optional rule domains
  maxSnapshotsPerScenario?: number; // safety limit
}

export interface ScenarioEngine {
  evaluateScenarios(
    scenarios: Scenario[],
    options?: ScenarioEngineEvaluateOptions,
  ): Promise<ScenarioEvaluationResult[]>;
}
```

---

## 4. Integration in reg-intel-core

### 4.1 Injection into Compliance Engine

`createComplianceEngine` receives Scenario Engine as a dependency:

```ts
interface ComplianceEngineDeps {
  llm: LlmRouter;
  graph: GraphClient;
  timeline: TimelineEngine;
  scenario: ScenarioEngine; // new
  // ... egressGuard, prompts, etc.
}

export function createComplianceEngine(deps: ComplianceEngineDeps): ComplianceEngine {
  // store deps & wire agents, including scenario agents
}
```

Scenario Engine lives in `reg-intel-core/src/scenario/` and is wired into dedicated scenario agents.

### 4.2 DefaultScenarioEngine usage pattern

`DefaultScenarioEngine` (from the spec) runs evaluations as follows:

1. Validate inputs and enforce `maxSnapshotsPerScenario`.
2. For each Scenario:
   - Preload a **rule universe** from the graph based on jurisdictions, profileTags, domains.
   - Iterate snapshots up to the max limit.
   - For each snapshot:
     - Filter rules against `ScenarioSnapshot.facts` (rule/condition logic).
     - For matching rules, fetch their timelines and invoke Timeline Engine.
     - Classify benefits/reliefs as eligible/ineligible/locked-out.
3. Return `ScenarioEvaluationResult` with all snapshot evaluations.

This process is entirely **read-only** with respect to Memgraph.

### 4.3 Task type: WHAT_IF_SCENARIO_EVALUATION

The Compliance Engine introduces or reuses a task concept for scenarios, e.g.:

```ts
type TaskType =
  | "MAIN_CHAT"
  | "GRAPH_DEBUG"
  | "WHAT_IF_SCENARIO_EVALUATION"
  // ...others
```

Flow for a what-if question (e.g. "What if I incorporate in 2026 vs stay sole trader?"):

1. A high‑level agent interprets the user intent and constructs two `Scenario` objects.
2. Compliance Engine calls `scenario.evaluateScenarios([scenarioA, scenarioB], options)`.
3. It receives `ScenarioEvaluationResult[]` and:
   - Passes structured results to the UI for side‑by‑side comparison.
   - Summarises key differences in a follow‑up LLM call.

---

## 5. Integration with Chat & Conversation Context

### 5.1 Using scenario results as referenced nodes

When scenarios are evaluated as part of a chat turn, the Compliance Engine can:

- Collect all node IDs from `ScenarioSnapshotEvaluation` fields across scenarios:

  ```ts
  const referencedNodes = new Set<string>();

  for (const evalResult of scenarioResults) {
    for (const snapshot of evalResult.snapshots) {
      snapshot.applicableRuleNodeIds.forEach(id => referencedNodes.add(id));
      snapshot.eligibleBenefitNodeIds.forEach(id => referencedNodes.add(id));
      snapshot.ineligibleBenefitNodeIds.forEach(id => referencedNodes.add(id));
      snapshot.lockedOutBenefitNodeIds.forEach(id => referencedNodes.add(id));
    }
  }
  ```

- Attach `Array.from(referencedNodes)` to `ChatResponse.referencedNodes` for that turn.

This lets the UI highlight relevant rules/benefits and keeps chat / graph views in sync.

### 5.2 Feeding scenario nodes into ConversationContext

In addition, the Compliance Engine may update `ConversationContext.activeNodeIds` (from `conversation_context_spec_v_0_1`) by merging in scenario node IDs. That way:

- Subsequent chat turns have access to which rules/benefits are currently "in play".
- Prompt aspects can inject a short summary, e.g.:

  > "In this conversation, we are analysing scenarios that involve: Benefit X, Relief Y, Section Z. Use these nodes from the rules graph as primary anchors."

Scenario Engine itself remains unaware of conversation context; this wiring lives entirely in Compliance Engine.

---

## 6. Agent Design: What-If Scenario Agents

### 6.1 Example agent: IE_WhatIfScenario_Agent

An example agent in `AGENTS.md`:

- **ID:** `IE_WhatIfScenario_Agent`
- **Jurisdictions:** `IE` (primary), optionally `NI` / `UK` for cross‑border.
- **Profile tags:** e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_CROSS_BORDER_IE_UK`.
- **Dependencies:**
  - `ScenarioEngine.evaluateScenarios`
  - `GraphClient` for dereferencing node IDs (labels, sections, citations).
  - `TimelineEngine` (indirectly via Scenario Engine).
- **Prompt aspects:**
  - Jurisdiction aspect (IE as primary).
  - Persona aspect (single director, small business).
  - Disclaimer aspect (research‑only, not legal/tax advice).

### 6.2 Interaction pattern

1. User asks a what-if question.
2. Main orchestrator routes to `IE_WhatIfScenario_Agent`.
3. The agent:
   - Either retrieves existing saved scenarios (from Supabase), or
   - Builds new ones from user input (with LLM assistance, under Egress Guard).
4. Calls `ScenarioEngine.evaluateScenarios(...)`.
5. Uses results to:
   - Populate UI scenario views.
   - Provide a summary to the LLM for a narrative comparison.

---

## 7. LLM & Tools (v0.1 stance)

Scenario Engine v0.1 does **not** expose itself directly as an OpenAI Responses tool. Instead:

- Agents and Compliance Engine call `ScenarioEngine` as a normal TypeScript service.
- Only the **results** (node IDs + flags + derived summaries) are exposed to LLMs and UI.

Future versions may add a `scenario_engine_evaluate` tool wrapper, but even then:

- The core Scenario Engine remains pure and does not depend on LLMs.
- The tool handler would live in the LLM/Compliance layer (similar to `timeline_engine_evaluate`).

---

## 8. Error Handling & Limits (Integration

At the integration level:

- Compliance Engine should:
  - Enforce global caps (max scenarios per request, max snapshots per scenario).
  - Handle structured errors from `ScenarioEngine` (e.g. missing rule data) and decide how to surface them (UI vs LLM summarisation).
- Observability:
  - Scenario Engine errors should be logged with scenario IDs but **not** with raw PII or full facts.
  - Metrics can track how often scenario evaluations run and where they fail.

---

## 9. Privacy & Compliance

The integration must respect:

- `data_privacy_and_architecture_boundaries_v_0_1`.

Concretely:

- Scenarios live only in tenant storage (Supabase, etc.) under tenant/user ACLs.
- Scenario Engine only sees in-memory `Scenario` objects; it never persists them.
- Memgraph remains a shared rules graph with no scenario‑level or user‑level data.
- Any scenario- or facts-derived text sent to LLMs passes through **Egress Guard**, which can:
  - Redact PII.
  - Apply tenant policies (e.g. "no external egress").

---

## 10. Roadmap for Scenario Integration

Future integration enhancements:

1. **Scenario diff view** – standardised shape for comparing two `ScenarioEvaluationResult`s and surfacing deltas to UI and agents.
2. **Policy sandbox overlays** – integrating draft rule overlays so scenarios can be evaluated against current vs proposed rules.
3. **Saved scenario bundles** – higher level grouping of scenarios ("baseline", "incorporate", "move jurisdiction") with shared metadata and ACLs.
4. **Tool exposure** – optional `scenario_engine_evaluate` tool wrapper for LLMs, mirroring the pattern used for Timeline Engine.

This v0.1 document is now the canonical reference for how Scenario Engine is integrated into the Regulatory Intelligence Copilot stack in architecture v0.6.

