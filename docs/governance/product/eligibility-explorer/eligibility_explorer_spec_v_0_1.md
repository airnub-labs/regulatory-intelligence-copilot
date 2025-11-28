# Eligibility Explorer Spec v0.1

> Draft spec for the Eligibility Explorer feature (Use Case 1), building on `docs/architecture/archive/architecture_v_0_4.md`, `docs/architecture/archive/architecture_v_0_5.md`, `docs/architecture/graph/archive/graph_schema_v_0_4.md`, `docs/architecture/engines/timeline-engine/timeline_engine_v_0_2.md`, `docs/architecture/engines/scenario-engine/scenario_engine_v_0_1.md`, and `docs/architecture/copilot-concept/archive/regulatory_graph_copilot_concept_v_0_4.md`.

Status: **Draft v0.1**  
Scope: **End-to-end eligibility exploration service and feature set in `reg-intel-core` + demo web UI, using the shared rules graph, Timeline Engine, and Scenario Engine without storing PII in Memgraph.**

---

## 1. Purpose

The **Eligibility Explorer** is a core feature that lets users (citizens, advisors, small-business owners) understand which **benefits, reliefs, or schemes** they may be eligible for under current rules, given a structured scenario.

It should support:

- Single-scenario, single-timepoint queries ("What am I eligible for today?").
- Single-scenario, multi-timepoint queries ("What changes over the next 5 years if nothing else changes?").
- Multi-scenario comparisons (via Scenario Engine) such as:
  - Stay sole trader vs incorporate.
  - Stay in IE vs move to NI/UK.

The Eligibility Explorer:

- Uses **shared rules graph** data (`:Benefit`, `:Relief`, `:Condition`, `:ProfileTag`, `:TimelineConstraint`, etc.).
- Uses the **Timeline Engine** to evaluate time-based conditions (lookbacks, lock-ins, deadlines).
- Uses the **Scenario Engine** as the canonical way to evaluate multi-snapshot or multi-scenario eligibility.
- Returns structured **EligibilityResult** objects that can be displayed in the UI and/or fed into LLM agents for natural-language explanations.

The goal is to make adding a new eligibility domain (e.g. pensions, a specific welfare regime, or a tax-relief cluster) as simple as:

- Adding/adjusting **rule nodes and edges** in the graph (ideally via ingestion + UI tools).
- Adding or reusing **profile tags** and **agent configurations**.
- Optionally adding **domain-specific GraphClient helper queries**.

---

## 2. Non-Goals

Eligibility Explorer v0.1 explicitly does *not*:

- Perform detailed numeric calculations for benefit/tax amounts (beyond simple boolean eligibility).  
  - Amount calculation can be layered later via dedicated numeric/calculation engines.
- Persist user scenarios or results (handled by host app and/or Evidence Engine in future).
- Replace the Scenario Engine or Timeline Engine; it builds on them.
- Implement a full rule-authoring UI (v0.1 assumes seed data exists, with optional basic admin UI).

---

## 3. Core Concepts & Data Model

### 3.1 Eligibility Domain

An **Eligibility Domain** groups rules, benefits, and conditions by high-level area, e.g.:

- `SOCIAL_WELFARE`  
- `TAX`  
- `PENSIONS`  
- `HOUSING_SUPPORT`  

Domains are used to:

- Limit queries for performance and clarity.
- Drive UI labels and agent prompts ("we are exploring social welfare eligibility in IE").

### 3.2 Benefit / Relief / Condition / ProfileTag

The Eligibility Explorer primarily works with the following graph concepts:

- `:Benefit`
  - e.g. specific social welfare payment, child benefit, jobseeker's benefit, housing support.
- `:Relief`
  - e.g. tax credits, CGT reliefs, pension-related reliefs.
- `:Condition`
  - e.g. contribution history thresholds, age bands, residency tests, dependency requirements.
- `:ProfileTag`
  - e.g. `PROFILE_SINGLE_PARENT_IE`, `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_CROSS_BORDER_IE_UK`.

Key relationships include:

- `(:Benefit)-[:REQUIRES]->(:Condition)`  
- `(:Relief)-[:REQUIRES]->(:Condition)`  
- `(:Benefit)-[:HAS_PROFILE_TAG]->(:ProfileTag)`  
- `(:Relief)-[:HAS_PROFILE_TAG]->(:ProfileTag)`  
- `(:Benefit)-[:APPLIES_IN]->(:Jurisdiction)`  
- `(:Relief)-[:APPLIES_IN]->(:Jurisdiction)`  
- `(:Benefit)-[:EXCLUDES]->(:Benefit|:Relief)`  
- `(:Benefit)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Benefit|:Relief)`  
- `(:Relief)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Relief)`  

Time-related relationships:

- `(:Benefit)-[:LOOKBACK_WINDOW]->(:TimelineConstraint)`  
- `(:Benefit)-[:LOCKS_IN_FOR_PERIOD]->(:TimelineConstraint)`  
- `(:Benefit)-[:FILING_DEADLINE]->(:TimelineConstraint)`  
- Equivalent edges for `:Relief`.

These nodes/edges are defined and constrained by `docs/architecture/graph/archive/graph_schema_v_0_4.md` and `docs/architecture/engines/timeline-engine/timeline_engine_v_0_2.md`.

### 3.3 Eligibility Query

For v0.1, define an `EligibilityQuery` type in `reg-intel-core`:

```ts
export interface EligibilityQuery {
  /** Primary jurisdictions to consider (e.g. ["IE"], ["IE", "UK"]). */
  jurisdictions: string[];

  /** Profile tags that describe the person/entity (e.g. PROFILE_SINGLE_PARENT_IE). */
  profileTags: string[];

  /** Eligibility domains to consider (e.g. ["SOCIAL_WELFARE"], ["TAX"], etc.). */
  domains: string[];

  /**
   * Optional explicit evaluation time. If omitted, the host app may default to now
   * or a specified reference date.
   */
  at?: Date;

  /** Optional reference to an existing Scenario or subset of it. */
  scenarioId?: string;

  /**
   * Optional inline ScenarioSnapshotFacts to evaluate a single snapshot without
   * creating a persisted Scenario.
   */
  facts?: ScenarioSnapshotFacts;
}
```

Notes:

- `ScenarioSnapshotFacts` is imported from `scenario_engine_v_0_1.ts`.
- The query may either reference a pre-existing `Scenario` via `scenarioId` or supply a one-off `facts` object.

### 3.4 Eligibility Result

Eligibility results should be simple enough for UI rendering and rich enough for LLM prompts.

```ts
export interface EligibilityItem {
  /** Graph node ID for the benefit/relief. */
  nodeId: string;

  /** Node label type, e.g. "Benefit" or "Relief". */
  type: "Benefit" | "Relief";

  /**
   * Short machine-friendly reason/status tags, e.g.:
   * - ["CONDITIONS_MET"]
   * - ["AGE_TOO_LOW"]
   * - ["INSUFFICIENT_CONTRIBUTIONS"]
   * - ["LOCKED_OUT_BY_INCOMPATIBLE_BENEFIT"]
   */
  flags: string[];
}

export interface EligibilityResult {
  /** Evaluation timestamp (either query.at or derived). */
  at: Date;

  /** Benefits/reliefs that the person/entity is eligible for at this time. */
  eligible: EligibilityItem[];

  /** Benefits/reliefs that are not eligible (conditions not met, wrong profile, etc.). */
  ineligible: EligibilityItem[];

  /** Benefits/reliefs that are not eligible *because of lock-ins or mutual exclusions*. */
  lockedOut: EligibilityItem[];

  /**
   * Optional warnings or notes from the engine, e.g. incomplete data, ambiguous conditions.
   */
  warnings: string[];
}
```

For scenario-based operations, Eligibility Explorer will typically produce one `EligibilityResult` per snapshot using the Scenario Engine (see below).

---

## 4. Responsibilities & Collaboration

### 4.1 Eligibility Explorer Responsibilities

In v0.1 the Eligibility Explorer is responsible for:

1. Accepting `EligibilityQuery` requests from:
   - API routes (e.g. `/api/eligibility` in demo web app).
   - Agents via the Compliance Engine (task type: `ELIGIBILITY_EXPLORATION`).

2. For **single-snapshot queries** (one `facts` object or a single snapshot from an existing Scenario):
   - Resolve a **rule universe** from the graph:
     - Relevant `:Benefit` and `:Relief` nodes.
     - Their associated `:Condition`, `:ProfileTag`, and `:TimelineConstraint` nodes/edges.
   - Evaluate eligibility at that point using:
     - Rule logic (profile tags, conditions).
     - Timeline logic (via the Timeline Engine).

3. For **multi-snapshot or multi-scenario queries**:
   - Delegate to the **Scenario Engine** to produce `ScenarioEvaluationResult`s.
   - Transform those into one or more `EligibilityResult`s per scenario/snapshot.

4. Returning `EligibilityResult` objects that other layers can use directly.

Eligibility Explorer does **not**:

- Write to Memgraph.
- Call LLMs directly.
- Persist scenarios or user data.

### 4.2 Collaborators

- `GraphClient` (reg-intel-graph):
  - `getBenefitsAndReliefsForProfileAndJurisdictions` (new helper, domain-filtered).
  - `getConditionsForBenefit/Relief` as needed.
- `TimelineEngine` (existing):
  - For evaluating lookbacks, lock-ins, deadlines.
- `ScenarioEngine` (new core service):
  - For multi-snapshot/multi-scenario eligibility.
- `ComplianceEngine` & Agents:
  - Orchestrate which queries to run and which prompts to use.
- Host app:
  - Stores scenarios and user profile data, calls Eligibility Explorer via internal API.

---

## 5. Public API (TypeScript, v0.1)

### 5.1 Interface

Define an interface in `reg-intel-core`:

```ts
export interface EligibilityExplorerOptions {
  /** Optional domain filter (e.g. ["SOCIAL_WELFARE"], ["TAX", "PENSIONS"]). */
  domains?: string[];

  /** Optional max results (e.g. to limit UI load). */
  maxResults?: number;
}

export interface EligibilityExplorer {
  /**
   * Evaluate eligibility for a single snapshot (ad-hoc query or one snapshot of a Scenario).
   */
  evaluateEligibility(
    query: EligibilityQuery,
    options?: EligibilityExplorerOptions
  ): Promise<EligibilityResult>;

  /**
   * Evaluate eligibility across all snapshots for one or more Scenarios.
   * This is a thin wrapper around ScenarioEngine to keep a consistent API.
   */
  evaluateEligibilityForScenarios(
    scenarios: Scenario[],
    options?: EligibilityExplorerOptions
  ): Promise<ScenarioEvaluationResult[]>;
}
```

Notes:

- `Scenario` and `ScenarioEvaluationResult` come from `scenario_engine_v_0_1.ts`.
- `evaluateEligibilityForScenarios` returns `ScenarioEvaluationResult` rather than `EligibilityResult` to avoid duplicating types and logic; callers can adapt as needed.

### 5.2 Default Implementation Sketch

A default implementation, e.g. `DefaultEligibilityExplorer`, should:

1. Validate `EligibilityQuery`:
   - Ensure at least one jurisdiction and one domain.
   - Validate either `facts` or `scenarioId` is supplied.

2. For **single-snapshot**:
   - If `scenarioId` is provided:
     - Load the relevant Scenario snapshot from host app via a callback or adapter.
   - Else, construct a temporary `Scenario` with a single `ScenarioSnapshot` from `query.facts`.
   - Build a rule universe via `GraphClient`:

     ```ts
     const ruleUniverse = await graphClient.getRulesForProfileAndJurisdictions({
       jurisdictions: query.jurisdictions,
       profileTags: query.profileTags,
       domains: query.domains,
     });
     ```

   - Call `timelineEngine.evaluate(...)` with the snapshot and rule universe to compute applicability.
   - Map applicable/inapplicable/locked-out rules into `EligibilityResult`.

3. For **multi-snapshot / multi-scenario**:
   - Construct or retrieve one or more `Scenario` objects.
   - Call `scenarioEngine.evaluateScenarios(scenarios, { domains: options?.domains })`.
   - Return the ScenarioEvaluationResult list.

---

## 6. Integration with Agents & ComplianceEngine

### 6.1 New Task Type: `ELIGIBILITY_EXPLORATION`

Add a logical task type in the Compliance Engine:

- `TaskType.ELIGIBILITY_EXPLORATION`

Behaviours:

1. Interpret the user request ("what am I eligible for", "what supports can I get", etc.) to:
   - Identify jurisdictions.
   - Identify relevant domains (welfare, pensions, tax, etc.).
   - Identify or construct a Scenario or `facts` snapshot.
2. Call `eligibilityExplorer.evaluateEligibility(...)`.
3. Use the result to either:
   - Respond directly to the user with a structured summary (graph + table), and/or
   - Feed into a follow-up LLM call for natural-language explanation.

### 6.2 Specialist Agents

Examples (to be defined in `AGENTS.md` or config):

- `IE_Welfare_Eligibility_Agent`
  - Jurisdiction: `IE`.
  - Domains: `SOCIAL_WELFARE`.
  - Profile tags: generic welfare personas (single, lone parent, couple with children, etc.).
- `IE_TaxRelief_Eligibility_Agent`
  - Jurisdiction: `IE`.
  - Domains: `TAX`, `PENSIONS`.

Each agent:

- Uses **prompt aspects** to embed domain- and persona-specific context.
- Uses the **Eligibility Explorer** as a deterministic tool; the LLM explains results.

---

## 7. UI and UX (Demo Web v0.1)

While the Eligibility Explorer is a core service, v0.1 will include a basic demo UI in `apps/demo-web`:

1. **Scenario & Profile Form**
   - Inputs for:
     - Jurisdiction(s).
     - Basic facts (age, residency, dependants, income band, employment status, etc.).
     - Domain selection (welfare, tax, pensions).
   - Optionally saves a Scenario in host app and calls `/api/eligibility`.

2. **Eligibility Results View**
   - Shows list of **eligible**, **ineligible**, and **locked-out** benefits/reliefs.
   - Uses `graph_change_detection` streaming where appropriate to update when rules change.

3. **Chat Integration**
   - Chat messages can:
     - Trigger eligibility evaluations.
     - Display results inline (tables, tags).
     - Ask follow-up questions which re-use the same Scenario.

The UI should follow the v0.5 architecture (Tailwind v4, Radix, shadcn/ui, AI Elements-style chat components).

---

## 8. Error Handling & Limits

Eligibility Explorer should:

- Limit the number of benefits/reliefs evaluated per query (configurable).
- Limit the number of scenarios and snapshots evaluated in one call when delegating to Scenario Engine.
- Provide meaningful error codes for:
  - Missing or unsupported jurisdictions.
  - No matching domains.
  - Incomplete or conflicting scenario facts.

Errors should be:

- Logged via the existing telemetry stack.
- Returned as structured error responses to API callers.

---

## 9. Privacy & Compliance

- Scenario facts may contain PII or sensitive data; they should:
  - Reside only in host app storage (e.g. Supabase).
  - Be minimized before any LLM call via Egress Guard.
- Eligibility Explorer itself:
  - Does not write to Memgraph or external systems.
  - Only reads from Memgraph via `GraphClient` and uses in-memory data.

This aligns with `data_privacy_and_architecture_boundaries_v_0_1.md` and the graph ingress/egress guard specs.

---

## 10. Roadmap (v0.1 → v0.2+)

Potential future enhancements:

1. **Amount Calculation Integration**
   - Integrate with a numeric engine to compute approximate monetary values or ranges for eligible benefits/reliefs.

2. **Rule Authoring & Admin UI**
   - Visual tools for adding/updating benefits, conditions, and profile tags which feed into the graph via GraphWriteService.

3. **Eligibility Diff Utilities**
   - Helpers to compare EligibilityResult sets (e.g. between scenarios) for easier explanation and UI visualisation.

4. **Policy Sandbox Support**
   - Ability to evaluate eligibility against proposed rule overlays (draft legislation) using a staging/sandbox graph layer.

5. **Declarative Templates**
   - YAML/JSON templates for common personas and scenarios to bootstrap eligibility evaluations quickly.

v0.1 focuses on deterministic, boolean eligibility for one or more domains, leveraging the existing graph schema, Timeline Engine, and Scenario Engine, while keeping PII outside the shared rules graph.

