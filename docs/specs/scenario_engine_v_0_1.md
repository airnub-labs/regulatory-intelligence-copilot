# Scenario Engine Spec v0.1

> **Status:** Draft v0.1 (updated for architecture_v_0_6)
>
> **Builds on:**
> - `architecture_v_0_6.md`
> - `graph_schema_v_0_6.md`
> - `docs/specs/timeline-engine/timeline_engine_v_0_2.md`
> - `timeline-integration_v_0_3.md`
> - `concept_capture_from_main_chat_v_0_1.md`
> - `conversation_context_spec_v_0_1.md`
> - `docs/specs/concept/regulatory_graph_copilot_concept_v_0_6.md`

## 1. Purpose

The **Scenario Engine** is a core orchestration service in `reg-intel-core` that evaluates one or more **hypothetical or real-world scenarios** against:

- The **shared regulatory rules graph** (Memgraph), and
- The **Timeline Engine** (time-based reasoning),

without ever writing user- or tenant-specific PII into Memgraph.

A **Scenario** is a structured, time-aware description of a person or entity's situation (income, residency, company structure, disposals, life events, etc.), expressed as snapshots over time.

The Scenario Engine:

- Accepts one or more `Scenario` objects (e.g. "Stay sole trader", "Incorporate in 2026", "Move to NI in 2027").
- Uses **GraphClient** and **Timeline Engine** to determine, per snapshot:
  - Which rules, benefits, reliefs, obligations, and constraints apply.
  - Which benefits/reliefs are **eligible**, **ineligible**, or **locked out** due to timelines or conflicts.
  - Which lock-ins, deadlines, or lookback rules are in play.
- Returns **structured evaluation results** that can be:
  - Rendered in the UI (tables, charts, graph overlays), and/or
  - Used as **grounding evidence** for LLM agents (e.g. a "What-if Scenario Agent") in the Compliance Engine.

The Scenario Engine is **read-only with respect to Memgraph** and respects all privacy & data boundaries:

- No user PII is ever written to Memgraph.
- Scenarios live in tenant-specific storage (e.g. Supabase) and are loaded at runtime.
- The engine composes existing `GraphClient`, `TimelineEngine`, and (optionally) conversation context, but never owns storage itself.

---

## 2. Non-Goals (v0.1)

Scenario Engine v0.1 explicitly does **not**:

- Implement stochastic simulations (Monte Carlo, macroeconomic scenarios, etc.).
- Persist scenarios, histories, or evidence bundles (that belongs to the host app / Evidence service).
- Replace Timeline Engine or rules graph logic; it **composes** them.
- Compute monetary amounts (tax or benefit values) beyond simple boolean applicability / eligibility flags.
- Provide any UI; it is a backend/core service.
- Talk directly to LLMs or external HTTP endpoints.

Future versions (v0.2+) may add numeric estimation, templated scenario DSLs, and LLM tool wrappers.

---

## 3. Core Concepts & Data Model

### 3.1 Scenario

A **Scenario** is a structured description of a hypothetical or real situation over time.

Design constraints:

- Scenarios are **tenant-local**; they must not be persisted into Memgraph.
- Scenario data **may** contain PII but must remain in tenant storage (e.g. Supabase) and under Egress Guard rules when passed to LLMs.
- Scenario Engine treats Scenarios as **in-memory inputs**; it does not persist them.

TypeScript shape (in `reg-intel-core`):

```ts
export type ScenarioId = string;

export interface ScenarioSnapshotFacts {
  /**
   * Structured facts at this point in time, expressed as key/value pairs.
   * Examples (non-exhaustive):
   * - ageYears: number
   * - residencyCountry: string ("IE", "UK", "NI", "IM", "EU", ...)
   * - maritalStatus: "single" | "married" | "cohabiting" | ...
   * - dependants: number
   * - employmentStatus: "employed" | "self_employed" | "unemployed" | ...
   * - companyType: "sole_trader" | "single_director_company" | ...
   * - annualIncomeBand: "LOW" | "MEDIUM" | "HIGH" | ...
   * - assetDisposals: { date: string; assetType: string; amountBand: string }[]
   *
   * The engine treats this as **opaque**; interpretation happens in rule
   * evaluation and Timeline Engine logic based on graph modelling.
   */
  [key: string]: unknown;
}

export interface ScenarioSnapshot {
  /** Point in time being evaluated. */
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
   * Each snapshot can be a discrete evaluation point (e.g. year-end)
   * or a key life event.
   */
  timeline: ScenarioSnapshot[];
}
```

Notes:

- `ScenarioSnapshotFacts` is intentionally open-ended; specific keys are interpreted by:
  - Rule modelling in the graph (conditions, profile tags, edges), and
  - Timeline Engine logic (dates, lookbacks, lock-ins).
- Mapping between facts and graph rules is defined in graph schema & agents, not inside Scenario Engine.

### 3.2 Scenario Evaluation Result

The main output is a **ScenarioEvaluationResult**, consumable by UI and agents.

```ts
export interface ScenarioSnapshotEvaluation {
  at: Date;

  /** Graph node IDs (rules, sections, benefits, reliefs) that apply. */
  applicableRuleNodeIds: string[];

  /** Eligible benefits/reliefs at this snapshot (node IDs). */
  eligibleBenefitNodeIds: string[];

  /** Not eligible due to conditions or timelines. */
  ineligibleBenefitNodeIds: string[];

  /**
   * Locked out because of past decisions or lock-ins
   * (e.g. incompatible claims, missed deadlines).
   */
  lockedOutBenefitNodeIds: string[];

  /** Flags that can help UI/agents (e.g. ["LOCK_IN_ACTIVE", "DEADLINE_IMMINENT"]). */
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

- Node IDs are **rule-graph node identifiers** (Memgraph internal IDs or stable IDs stored as properties).
- Agents can dereference IDs via `GraphClient` (or MCP) for labels, citations, and details.
- These node IDs are also natural candidates for **ConversationContext.activeNodeIds** when scenario evaluations feed into chat.

---

## 4. Responsibilities & Collaborators

### 4.1 Scenario Engine Responsibilities

Scenario Engine is responsible for:

1. Accepting one or more `Scenario` objects for evaluation.
2. For each Scenario, for each `ScenarioSnapshot`:
   - Resolving a **rule universe** from the graph based on:
     - Jurisdictions.
     - Profile tags.
     - Optional domains (welfare, tax, pensions, etc.).
   - Using the **Timeline Engine** to evaluate temporal constraints:
     - Lookback windows (insurable weeks, contribution periods, recent disposals).
     - Lock-ins and effective windows.
     - Deadlines and grace periods.
   - Determining, per snapshot:
     - Applicable rules.
     - Eligible / ineligible / locked-out benefits/reliefs.
   - Producing a `ScenarioSnapshotEvaluation` with node IDs + flags.
3. Returning a list of `ScenarioEvaluationResult` objects.

Scenario Engine does **not**:

- Decide how results are rendered (UI concern).
- Own conversations or Scenario storage (Supabase / host app concern).
- Call LLMs or external HTTP endpoints (Compliance Engine & EgressGuard concern).
- Modify Memgraph (no writes).

### 4.2 Collaborators

Scenario Engine composes:

- **GraphClient** (`reg-intel-graph`):
  - Read-only access to rules, benefits, reliefs, conditions, timelines.
  - Helper queries like `getRulesForProfileAndJurisdictions` / `getTimelinesForBenefit`.
- **TimelineEngine** (`docs/specs/timeline-engine/timeline_engine_v_0_2.md`):
  - Evaluates lookbacks, lock-ins, deadlines, and effective windows per rule/timeline.
- **ComplianceEngine & Agents** (`reg-intel-core`):
  - Provide Scenarios loaded from tenant storage.
  - Decide when to run scenario evaluations (task type).
  - Use Scenario results as grounding evidence for LLM prompts.
- **ConversationContext** (optional):
  - ComplianceEngine may feed SnapshotEvaluation node IDs into `ConversationContext.activeNodeIds` so subsequent chat turns know which graph concepts are "in play".

It respects:

- `data_privacy_and_architecture_boundaries_v_0_1` (no PII in Memgraph).
- `graph_ingress_guard_v_0_1` (no direct graph writes).
- `egress_guard_v_0_2` (any scenario data leaving to LLMs must pass through Egress Guard).

---

## 5. Public API (TypeScript, v0.1)

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

  /** Max snapshot count per scenario (safety guard for UIs & LLM flows). */
  maxSnapshotsPerScenario?: number;
}

export interface ScenarioEngine {
  /**
   * Evaluate one or more scenarios against the rules graph and Timeline Engine.
   */
  evaluateScenarios(
    scenarios: Scenario[],
    options?: ScenarioEngineEvaluateOptions,
  ): Promise<ScenarioEvaluationResult[]>;
}
```

### 5.2 Default Implementation Sketch

`DefaultScenarioEngine` in `reg-intel-core/src/scenario/DefaultScenarioEngine.ts`:

```ts
export class DefaultScenarioEngine implements ScenarioEngine {
  constructor(
    private readonly graph: GraphClient,
    private readonly timeline: TimelineEngine,
  ) {}

  async evaluateScenarios(
    scenarios: Scenario[],
    options: ScenarioEngineEvaluateOptions = {},
  ): Promise<ScenarioEvaluationResult[]> {
    // 1) Input validation / guards
    const maxSnapshots = options.maxSnapshotsPerScenario ?? 50;

    return Promise.all(
      scenarios.map(async (scenario) => {
        const trimmedTimeline = scenario.timeline.slice(0, maxSnapshots);

        // 2) Pre-load rule universe for this scenario
        const ruleUniverse = await this.graph.getRulesForProfileAndJurisdictions({
          jurisdictions: scenario.jurisdictions,
          profileTags: scenario.profileTags,
          domains: options.domains,
        });

        // 3) Evaluate each snapshot
        const snapshotResults: ScenarioSnapshotEvaluation[] = [];

        for (const snapshot of trimmedTimeline) {
          const snapshotEval = await this.evaluateSnapshot(
            scenario,
            snapshot,
            ruleUniverse,
          );

          snapshotResults.push(snapshotEval);
        }

        return {
          scenarioId: scenario.id,
          label: scenario.label,
          snapshots: snapshotResults,
        } satisfies ScenarioEvaluationResult;
      }),
    );
  }

  private async evaluateSnapshot(
    scenario: Scenario,
    snapshot: ScenarioSnapshot,
    ruleUniverse: RuleUniverse,
  ): Promise<ScenarioSnapshotEvaluation> {
    // Pseudo-code: filter rules by facts, call Timeline Engine for time logic

    const applicableRuleNodeIds: string[] = [];
    const eligibleBenefitNodeIds: string[] = [];
    const ineligibleBenefitNodeIds: string[] = [];
    const lockedOutBenefitNodeIds: string[] = [];
    const flags: string[] = [];

    // 1) Filter rules by conditions / profile tags / facts (graph-level logic)
    const candidateRules = ruleUniverse.filter((rule) =>
      rule.matchesFacts(snapshot.facts),
    );

    // 2) For each rule, use Timeline Engine where relevant
    for (const rule of candidateRules) {
      applicableRuleNodeIds.push(rule.id);

      const timelineNodes = await this.graph.getTimelinesForRule(rule.id);

      // Example: LOOKBACK + LOCK_IN handling
      const lookbackNode = timelineNodes.find((t) => t.kind === "LOOKBACK");
      const lockInNode = timelineNodes.find((t) => t.kind === "LOCK_IN");

      const context: ScenarioTimeContext = {
        now: snapshot.at,
        jurisdictionCode: scenario.jurisdictions[0],
      };

      const isLockedOut = lockInNode
        ? this.timeline.isLockInActive(rule.triggerDate ?? snapshot.at, lockInNode, context).active
        : false;

      if (isLockedOut) {
        lockedOutBenefitNodeIds.push(rule.benefitId);
        flags.push("LOCK_IN_ACTIVE");
        continue;
      }

      const meetsLookback = lookbackNode
        ? this.timeline.isWithinLookback(rule.referenceDate ?? snapshot.at, lookbackNode, context).within
        : true;

      if (meetsLookback) {
        eligibleBenefitNodeIds.push(rule.benefitId);
      } else {
        ineligibleBenefitNodeIds.push(rule.benefitId);
      }
    }

    return {
      at: snapshot.at,
      applicableRuleNodeIds,
      eligibleBenefitNodeIds,
      ineligibleBenefitNodeIds,
      lockedOutBenefitNodeIds,
      flags,
    };
  }
}
```

Notes:

- `RuleUniverse` and `rule.matchesFacts` are conceptual; concrete shapes live in graph/condition specs.
- Timeline Engine is used via its pure function API; no LLM tools are involved here.

---

## 6. Integration with ComplianceEngine & Agents

### 6.1 New Task Type: What-If Scenario Evaluation

To support **What-if scenarios / scenario comparison** use cases, ComplianceEngine introduces a logical task type, e.g.:

- `TaskType.WHAT_IF_SCENARIO_EVALUATION`

Flow:

1. Interpret the user request (LLM + prompts) to:
   - Select existing scenarios from tenant storage, and/or
   - Construct new scenarios from user input.
2. Call `scenarioEngine.evaluateScenarios(scenarios, options)`.
3. Use results to:
   - Build tabular/graphical UI comparisons, and/or
   - Feed a follow-up LLM call with structured evidence.

### 6.2 Dedicated Agent: What-If Scenario Agent

Example agent config (described in `AGENTS.md`):

- `IE_WhatIfScenario_Agent`
  - Jurisdictions: `IE` (possibly plus `NI`/`UK` for cross-border).
  - Profile tags: `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_CROSS_BORDER_IE_UK`, etc.
  - Tools / dependencies:
    - `ScenarioEngine.evaluateScenarios`
    - Graph read tools (dereference node IDs to labels/citations).
  - Prompt aspects:
    - Jurisdiction aspect: IE primary.
    - Persona aspect: small business owner / single director.
    - Disclaimer aspect: emphasise scenarios are research-only.

### 6.3 Conversation Context & Referenced Nodes

When Scenario Engine evaluations are used inside chat:

- ComplianceEngine **may**:
  - Merge `ScenarioSnapshotEvaluation.*NodeIds` into `ConversationContext.activeNodeIds` (see `conversation_context_spec_v_0_1`).
  - Add those node IDs to `ChatResponse.referencedNodes` for the turn.
- This ensures subsequent chat turns and graph UI views "know" which rules/benefits are relevant to the scenarios just analysed.

Scenario Engine itself remains unaware of conversations; it just returns node IDs and flags.

---

## 7. LLM & Tools (v0.1)

Scenario Engine v0.1 does **not** define its own OpenAI/Responses tool. The intended pattern is:

- ComplianceEngine or a Scenario Agent calls `ScenarioEngine` directly.
- The structured results are then:
  - Summarised into natural language via LLM (with Egress Guard), and/or
  - Displayed directly in the UI.

Future work (v0.2+) may:

- Introduce a `scenario_engine_evaluate` tool that:
  - Accepts serialised Scenario definitions.
  - Calls ScenarioEngine internally.
  - Returns compact summaries for LLM use.

Even then, the core Scenario Engine remains a pure TypeScript module with no LLM dependencies.

---

## 8. Error Handling & Limits

v0.1 must implement conservative guards:

- Maximum number of scenarios per call (e.g. 5).
- Maximum snapshots per scenario (default 50, configurable via `maxSnapshotsPerScenario`).

Errors and edge cases:

- If no rules are found for a scenario, return an empty `snapshots` array with an appropriate flag (e.g. `flags: ["NO_RULES_FOUND"]`).
- If Timeline Engine throws or returns invalid dates, catch and:
  - Log via observability stack.
  - Mark affected snapshots with an error flag (e.g. `flags: ["TIMELINE_EVALUATION_ERROR"]`).
- Never throw raw errors to UI; return structured error information to callers.

---

## 9. Privacy & Compliance

- Scenario data must **never** be written into Memgraph.
- Scenario data may contain PII; it must:
  - Stay in tenant storage (e.g. Supabase), protected by tenant/user ACLs.
  - Be minimised / redacted by Egress Guard before going to LLMs.
- Scenario Engine:
  - Operates only on in-memory `Scenario` objects and graph/timeline read models.
  - Performs no external HTTP/LLM calls.

---

## 10. Roadmap (v0.1 → v0.2+)

Future enhancements:

1. **Amount Estimation**  
   Extend evaluations with approximate benefit/tax amounts using a separate numeric engine.

2. **Scenario Differencing Helpers**  
   Helpers to compute diffs between scenarios (e.g. which benefits diverge and when) for UI and agents.

3. **Policy Sandbox Overlays**  
   Evaluate scenarios against draft rule overlays (proposed legislation) versus current production graph.

4. **Stochastic / Macro Scenarios**  
   Integrate macroeconomic scenarios (rates, inflation) for long-horizon pensions/investment analyses.

5. **Declarative Scenario Templates**  
   YAML/JSON templates that can be instantiated into Scenarios ("baseline", "incorporate", "move jurisdiction") from a small DSL.

v0.1 focuses on deterministic, boolean eligibility and rule applicability across one or more scenarios, composing the existing rules graph, Timeline Engine, and Compliance Engine without altering the core architecture.

