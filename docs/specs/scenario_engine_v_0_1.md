# Scenario Engine Spec v0.1

> Draft spec for the Scenario Engine, building on `architecture_v_0_4.md`, `architecture_v_0_5.md`, `timeline_engine_v_0_2.md`, `graph_schema_v_0_4.md`, and `regulatory_graph_copilot_concept_v_0_4.md`.

Status: **Draft v0.1**  
Scope: **New core service in `reg-intel-core` that orchestrates multi-scenario evaluation against the shared rules graph + Timeline Engine, without storing any user PII in Memgraph.**

---

## 1. Purpose

The Scenario Engine is a **core orchestration service** that evaluates one or more *hypothetical or real-world scenarios* against the shared regulatory rules graph and the Timeline Engine.

A **Scenario** represents a structured, time-aware description of a person or entity's situation (e.g. income, residency, company structure, disposals, life events) without embedding any PII into Memgraph. The Scenario Engine:

- Accepts one or more `Scenario` objects (e.g. "Stay sole trader", "Incorporate in 2026", "Move to NI in 2027").
- Uses the **shared rules graph** (Memgraph) and **Timeline Engine** to determine:
  - Which rules, benefits, reliefs, obligations and constraints apply at specific points in time.
  - Which benefits/reliefs are **eligible**, **ineligible**, or **locked out** due to timelines or conflicts.
  - Which lock-ins, deadlines, or lookback rules are triggered.
- Returns structured results that can be:
  - Rendered directly in the UI (tables, charts, graphs), and/or
  - Passed as **grounding evidence** to LLM agents (e.g. a "What-if Scenario Agent") for explanation and comparison.

The Scenario Engine is **read-only with respect to Memgraph** and respects all existing privacy and data boundaries:

- **No user PII** is ever written to Memgraph.
- Scenarios live in **tenant-specific storage** (e.g. Supabase) and are passed to the engine at runtime.
- The Scenario Engine uses existing `GraphClient` and `TimelineEngine` interfaces in `reg-intel-core`.

---

## 2. Non-Goals

The Scenario Engine v0.1 explicitly does *not*:

- Implement complex stochastic simulations (Monte Carlo, macroeconomic scenario generation, etc.).
- Persist scenarios, scenario histories, or evidence bundles (those belong in the host app or a separate Evidence/Episode service).
- Replace the Timeline Engine or Graph Engine; it **composes** them.
- Perform heavy numerical projection (tax amounts, benefit amounts) beyond simple boolean applicability / eligibility flags.
- Provide any UI. It is a backend/core service.

These may be addressed in future versions (e.g. `scenario_engine_v_0_2+`) or separate services.

---

## 3. Core Concepts & Data Model

### 3.1 Scenario

A **Scenario** is a structured description of a hypothetical or real situation over time.

Key design constraints:

- Scenarios are **tenant-local**; they must not be persisted into Memgraph.
- Scenario data can contain PII but never leaves the host app except in **sanitized form** when passed to LLMs via the Egress Guard.
- The Scenario Engine operates on **already-loaded Scenario objects** and treats them as in-memory inputs.

Proposed TypeScript shape (in `reg-intel-core`):

```ts
export type ScenarioId = string;

export interface ScenarioSnapshotFacts {
  /**
   * Structured facts at this point in time, expressed as key/value pairs.
   * Examples (non-exhaustive):
   * - ageYears: number
   * - residencyCountry: string ("IE", "UK", "NI", "IM", "EU"...)
   * - maritalStatus: "single" | "married" | "cohabiting" | ...
   * - dependants: number
   * - employmentStatus: "employed" | "self_employed" | "unemployed" | ...
   * - companyType: "sole_trader" | "single_director_company" | ...
   * - annualIncomeBand: "LOW" | "MEDIUM" | "HIGH" | ...
   * - assetDisposals: { date: string; assetType: string; amountBand: string }[]
   *
   * The engine treats this as **opaque**; interpretation happens
   * inside rule evaluation and Timeline Engine logic.
   */
  [key: string]: unknown;
}

export interface ScenarioSnapshot {
  /** Point in time being evaluated (ISO string or Date). */
  at: Date;
  /** Structured facts at that moment. */
  facts: ScenarioSnapshotFacts;
}

export interface Scenario {
  id: ScenarioId;
  label: string; // e.g. "Stay sole trader", "Incorporate in 2026"

  /**
   * Primary jurisdictions relevant to this scenario
   * (e.g. ["IE"], ["IE", "UK"], ["IE", "NI"], etc.).
   */
  jurisdictions: string[];

  /**
   * Profile tags mapping to graph-level personas, e.g.:
   * - PROFILE_SINGLE_DIRECTOR_IE
   * - PROFILE_CROSS_BORDER_IE_UK
   * - PROFILE_SINGLE_PARENT_IE
   */
  profileTags: string[];

  /**
   * Ordered list of snapshots representing the scenario over time.
   * Each snapshot can be a discrete evaluation point (e.g. year-end) or a key life event.
   */
  timeline: ScenarioSnapshot[];
}
```

Notes:

- The `ScenarioSnapshotFacts` type is intentionally open-ended; we expect a combination of:
  - Standard keys that the Timeline Engine and rules know how to interpret.
  - Tenant-specific or domain-specific keys that may be used by bespoke rules or agents.
- The mapping between **facts** and **graph rules** lives in:
  - Rule modelling (graph schema extensions, condition nodes/edge properties).
  - Timeline Engine evaluation logic.

### 3.2 Scenario Evaluation Result

The core output of the Scenario Engine is a **ScenarioEvaluationResult**, which can be used by:

- UI components (tables, charts) for direct comparison.
- Agents as structured evidence when constructing LLM prompts.

Proposed shape:

```ts
export interface ScenarioSnapshotEvaluation {
  at: Date;

  /** Identifiers of graph nodes (rules, sections, benefits, reliefs) that apply at this snapshot. */
  applicableRuleNodeIds: string[];

  /**
   * Benefits/reliefs that are eligible at this snapshot, expressed as node IDs.
   * These IDs can be dereferenced via GraphClient when needed.
   */
  eligibleBenefitNodeIds: string[];

  /** Benefits/reliefs that are *not* eligible due to conditions or timelines. */
  ineligibleBenefitNodeIds: string[];

  /**
   * Benefits/reliefs that are *locked out* because of past decisions or lock-in rules
   * (e.g. already claimed an incompatible benefit, or missed a critical deadline).
   */
  lockedOutBenefitNodeIds: string[];

  /**
   * Snapshot-level flags or tags that can help the UI or agents, e.g.:
   * - ["LOCK_IN_ACTIVE", "DEADLINE_IMMINENT"]
   */
  flags: string[];
}

export interface ScenarioEvaluationResult {
  scenarioId: ScenarioId;
  label: string;

  /** Per-snapshot evaluation results in the same order as Scenario.timeline. */
  snapshots: ScenarioSnapshotEvaluation[];
}
```

Notes:

- Node IDs are **graph node identifiers** (e.g. Memgraph internal IDs or stable external IDs stored as properties). The engine does not embed full node data.
- Agents can use GraphClient to fetch more detail (labels, citations) when forming LLM prompts.
- In v0.1 we treat eligibility as boolean; future versions may also include estimated amounts or probabilistic flags.

---

## 4. Responsibilities & Collaboration

### 4.1 Scenario Engine Responsibilities

The Scenario Engine is responsible for:

1. **Accepting one or more Scenarios** for a given evaluation request.
2. For each Scenario:
   - For each `ScenarioSnapshot`:
     - Resolve relevant rules/benefits/reliefs from the shared graph based on:
       - Jurisdictions.
       - Profile tags.
     - Call the **Timeline Engine** to evaluate temporal constraints:
       - Lookback windows (e.g. insurable weeks, contribution periods).
       - Lock-in periods and effective windows.
       - Deadlines and grace periods.
     - Determine:
       - Which rules apply.
       - Which benefits/reliefs are eligible, ineligible, or locked out.
3. Returning a list of `ScenarioEvaluationResult` objects.

The Scenario Engine does **not**:

- Decide how the results are displayed (UI concern).
- Directly call LLMs (agent/ComplianceEngine concern).
- Modify the graph (no write operations to Memgraph).

### 4.2 Collaborators

The Scenario Engine depends on:

- `GraphClient` (from `reg-intel-graph`):
  - To retrieve rules, benefits, reliefs, and relationships for given jurisdictions + profile tags.
  - To dereference node IDs to richer metadata when needed (e.g. for agents).
- `TimelineEngine` (from `reg-intel-core` or `reg-intel-graph`, per existing spec):
  - To interpret time-related edges and properties (`LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, etc.).
- Host app / orchestrator (ComplianceEngine & agents):
  - To provide Scenarios loaded from tenant storage.
  - To consume evaluation results and decide next steps (LLM prompts, UI responses).

It respects:

- `data_privacy_and_architecture_boundaries_v_0_1.md`:
  - No PII in Memgraph.
  - Scenario data lives outside the shared graph.
- `graph_ingress_guard_v_0_1.md` and `egress_guard_v_0_2.md`:
  - Scenario Engine itself does not perform graph writes or external calls.

---

## 5. Public API (TypeScript, v0.1)

The Scenario Engine is exposed as an interface and one or more concrete implementations in `reg-intel-core`.

### 5.1 Interface

```ts
export interface ScenarioEngineEvaluateOptions {
  /**
   * Optional hint for which rule domains to focus on, e.g.:
   * - ["SOCIAL_WELFARE"]
   * - ["TAX", "CGT"]
   * - ["PENSIONS"]
   * This can be used to limit graph queries.
   */
  domains?: string[];

  /**
   * Optional max snapshot count per scenario (for safety in UIs).
   */
  maxSnapshotsPerScenario?: number;
}

export interface ScenarioEngine {
  /**
   * Evaluate one or more scenarios against the rules graph and Timeline Engine.
   */
  evaluateScenarios(
    scenarios: Scenario[],
    options?: ScenarioEngineEvaluateOptions
  ): Promise<ScenarioEvaluationResult[]>;
}
```

### 5.2 Default Implementation Sketch

A default implementation might live in `reg-intel-core/src/scenario/DefaultScenarioEngine.ts` and:

1. Validates inputs (max scenario count, max snapshots, etc.).
2. For each scenario:
   - Resolve a **rule universe** for the scenario from the graph, e.g.:

     ```ts
     const ruleUniverse = await graphClient.getRulesForProfileAndJurisdictions({
       jurisdictions: scenario.jurisdictions,
       profileTags: scenario.profileTags,
       domains: options?.domains,
     });
     ```

   - For each snapshot in `scenario.timeline`:
     - Call `timelineEngine.evaluate({
          snapshot,
          ruleUniverse,
        })` to determine applicability and lock-ins.
     - Transform the result into a `ScenarioSnapshotEvaluation`.
3. Return all `ScenarioEvaluationResult`s.

The precise shape of `getRulesForProfileAndJurisdictions` and `timelineEngine.evaluate` should follow existing specs and implementations; this spec only defines *how* the Scenario Engine composes them.

---

## 6. Integration with Agents & ComplianceEngine

### 6.1 New Task Type: "What-If Scenario Evaluation"

To support use cases like **"What-if scenarios / scenario comparison"**, we introduce a new logical task type in the Compliance Engine:

- `TaskType.WHAT_IF_SCENARIO_EVALUATION`

This task type:

1. Interprets the user request (via an LLM or deterministic parser) to:
   - Select or construct one or more Scenarios (using host app APIs).
2. Calls `scenarioEngine.evaluateScenarios(scenarios, options)`.
3. Returns evaluation results either:
   - Directly to the UI, or
   - As structured evidence into a follow-up LLM call ("Explain differences between Scenario A and B").

### 6.2 Specialised Agent: What-If Scenario Agent

We anticipate a specialised agent configuration (in `AGENTS.md` and/or an `agents.config` file), e.g.:

- `IE_WhatIfScenario_Agent`

Characteristics:

- Jurisdictions: `IE`, optional cross-border variants (IE+NI, IE+UK).
- Profile tags: generic tags (e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_CROSS_BORDER_IE_UK`).
- Tools:
  - `scenarioEngine.evaluateScenarios`
  - Graph reading tools for dereferencing node IDs.
- Prompt aspects:
  - Jurisdiction aspect: IE (primary), optionally secondary.
  - Profile/persona aspect: small business owner, single director, etc.
  - Disclaimer aspect: emphasise that results are scenario-based simulations, not legal/tax advice.

Agents remain **configuration**; the Scenario Engine is a generic component.

---

## 7. Error Handling & Limits

v0.1 should implement conservative safeguards:

- Limit the number of scenarios per call (e.g. max 5).
- Limit the number of snapshots per scenario (e.g. max 50 in UI-driven flows).
- Graceful handling when:
  - No rules are found for a scenario (return empty results with a flag).
  - Timeline Engine returns partial results or errors (annotate flags, fail softly where possible).

Errors should:

- Be logged via the existing observability/telemetry stack.
- Be surfaced to callers as structured error objects, not thrown raw to the UI.

---

## 8. Privacy & Compliance Considerations

- Scenarios may contain sensitive and PII data; they **must not** be written into Memgraph.
- Scenario data should:
  - Stay within the host app's data store (e.g. Supabase) under tenant control.
  - Be transformed/minimised before being passed to LLMs via Egress Guard.
- Scenario Engine itself:
  - Does not perform any external HTTP or LLM calls.
  - Operates only on in-memory scenario objects and graph/timeline query results.

Future versions may:

- Introduce a dedicated Scenario Store abstraction with encryption, retention policies, and audit logs.

---

## 9. Roadmap (v0.1 → v0.2+)

Potential enhancements for later versions:

1. **Amount Estimation**
   - Extend results to include estimated benefit/tax amounts, using safe numeric engines.
2. **Scenario Differencing Helpers**
   - Utility functions to compute diffs between scenarios (e.g. which benefits diverge and when), for UI and agents.
3. **Policy Sandbox Overlays**
   - Support evaluating scenarios against **proposed** rule overlays (e.g. draft legislation), not just the current production graph.
4. **Stochastic / Macro Scenarios**
   - Integration with macroeconomic scenarios (e.g. interest rate paths, inflation), for long-horizon pension or investment use cases.
5. **Declarative Scenario Templates**
   - YAML/JSON templates that can be turned into scenarios via a small DSL, making it easier to predefine common what-if comparisons.

v0.1 focuses on deterministic, boolean eligibility and rule applicability across one or more scenarios, leveraging the existing graph + T