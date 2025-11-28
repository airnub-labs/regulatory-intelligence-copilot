# Timeline Integration (v0.3)

> **Status:** Draft v0.3 (aligned with architecture_v_0_6 and timeline_engine_v_0_2)
>
> **Scope:** How the Timeline Engine plugs into the Regulatory Intelligence Copilot stack (Compliance Engine, agents, graph, LLM / Responses tools) without changing the core engine.

This document replaces and supersedes the earlier `timeline-integration.md` notes. It describes how:

- Agents and the Compliance Engine **obtain timeline data** from the graph,
- Call the **Timeline Engine** as a pure library, and
- Optionally expose its functionality as an **OpenAI Responses tool** the LLM can call.

The core design principle remains:

- All time‑based reasoning lives in the Timeline Engine, not scattered across agents.
- The engine stays pure and graph‑agnostic; integration layers perform adaptation.

---

## 1. Where the Timeline Engine sits in the architecture

High‑level data flow for a single chat turn that needs time‑based reasoning:

```text
User → /api/chat → ComplianceEngine
    → Agent (domain‑specific)
      → GraphClient (Memgraph) → :Timeline nodes & edges
      → TimelineEngine (pure TS library)
      → LLM (OpenAI Responses via LlmRouter)
```

Optionally, the LLM may call the engine via a tool:

```text
LLM (Responses) --tool→ timeline_engine_evaluate (wrapper)
                 → TimelineEngine → tool result → LLM
```

Key invariants:

- Timeline Engine **never touches Memgraph** directly.
- Timeline Engine **never touches Supabase / conversations** directly.
- Timeline Engine is **pure and deterministic**: same inputs → same outputs.
- All user‑specific dates (e.g. disposal date, claim date) stay in the agent/Compliance Engine layer, not in the shared rules graph.

---

## 2. Responsibilities

### 2.1 Timeline Engine

- Implements the actual logic for:
  - Lookback windows ("in the last N months/years").
  - Lock‑in periods ("locks in for N years after event X").
  - Simple deadline / effective‑window calculations.
- Provides **explainable results**:
  - Always returns both raw dates/booleans and a human‑readable `description` summarising the rule.
- Stays unaware of:
  - Tenants, users, conversations.
  - Graph schema details beyond simple `TimelineNode`/`ScenarioTimeContext` interfaces.

### 2.2 Graph / Memgraph

- Stores **timeline concepts** as `:Timeline` nodes with edges from rules/benefits/reliefs:
  - `(:Benefit)-[:LOOKBACK_WINDOW]->(:Timeline)`
  - `(:Benefit)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`
  - `(:Section)-[:FILING_DEADLINE]->(:Timeline)`
- Provides `updated_at` timestamps for change detection and seeding, but **no user dates**.
- Is read via `GraphClient` / MCP adapters; the Timeline Engine only sees plain data objects.

### 2.3 Compliance Engine & Agents

- Decide **when** to apply time‑based reasoning.
- Fetch relevant `:Timeline` nodes for benefits/rules.
- Adapt graph data into `TimelineNode` + `ScenarioTimeContext` and call Timeline Engine functions.
- Integrate results into:
  - LLM prompts (as structured evidence), or
  - LLM tools (via `timeline_engine_evaluate`), or
  - Direct UI explanations.

---

## 3. Data Contracts (recap)

The integration uses the types from `timeline_engine_v_0_2`.

### 3.1 From graph → `TimelineNode`

Graph schema (conceptually):

```text
(:Benefit)-[:LOOKBACK_WINDOW]->(:Timeline { id, label, windowYears, windowMonths, windowDays, kind, jurisdictionCode })
(:Benefit)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline { ... })
(:Section)-[:FILING_DEADLINE]->(:Timeline { ... })
(:Relief)-[:USAGE_FREQUENCY]->(:Timeline { ... })
```

Adapted TypeScript shape:

```ts
export interface TimelineNode {
  id: string;
  label: string;
  notes?: string;

  windowDays?: number;
  windowMonths?: number;
  windowYears?: number;

  kind?:
    | "LOOKBACK"
    | "LOCK_IN"
    | "DEADLINE"
    | "EFFECTIVE_WINDOW"
    | "USAGE_FREQUENCY"
    | "OTHER";

  jurisdictionCode?: string; // e.g. "IE", "UK"
}
```

### 3.2 Scenario context

Provided by the agent based on the user scenario:

```ts
export interface ScenarioTimeContext {
  now: Date;                 // Reference date for this analysis
  jurisdictionCode?: string; // e.g. "IE"

  taxYearStart?: Date;       // e.g. 1 Jan or 6 Apr
  taxYearEnd?: Date;
  calendarId?: string;       // future: calendar of business days/public holidays
}
```

### 3.3 Engine functions (used by integrators)

Key functions:

```ts
export function computeLookbackRange(
  timeline: TimelineNode,
  context: ScenarioTimeContext,
): LookbackResult;

export function isWithinLookback(
  eventDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext,
): LookbackCheckResult;

export function computeLockInEnd(
  triggerDate: Date,
  context: ScenarioTimeContext,
  timeline: TimelineNode,
): LockInResult;

export function isLockInActive(
  triggerDate: Date,
  context: ScenarioTimeContext,
  timeline: TimelineNode,
): LockInCheckResult;
```

Each result includes structured data and a `description` string for prompts/UI.

---

## 4. Integration in reg-intel-core (direct function calls)

### 4.1 Injection into Compliance Engine

`createComplianceEngine` (simplified):

```ts
interface ComplianceEngineDeps {
  llm: LlmRouter;
  graph: GraphClient;
  timeline: TimelineEngine; // module with the functions described above
  // ... other deps: egressGuard, prompts, scenarioEngine, etc.
}

export function createComplianceEngine(deps: ComplianceEngineDeps): ComplianceEngine {
  // store deps & wire agents
}
```

The `timeline` dependency is passed into agents that care about time.

### 4.2 Agent workflow (example: benefit eligibility)

Example: an IE benefit with a 2‑year lookback on contributions.

```ts
async function analyseBenefitEligibility(args: {
  benefitId: string;
  userEvents: TimeEvent[];          // contributions, claims, etc.
  context: ScenarioTimeContext;     // now, jurisdiction, tax year
  deps: ComplianceEngineDeps;
}): Promise<EligibilityAnalysis> {
  const { graph, timeline } = deps;

  // 1) Fetch timeline nodes from graph
  const timelines = await graph.getTimelinesForBenefit(args.benefitId);
  const lookback = timelines.find(t => t.kind === "LOOKBACK");

  // 2) Run time logic via Timeline Engine
  let lookbackSummary: LookbackCheckResult | undefined;

  if (lookback) {
    const lastContribution = getMostRecentContribution(args.userEvents);
    if (lastContribution) {
      lookbackSummary = timeline.isWithinLookback(
        lastContribution.date,
        lookback,
        args.context,
      );
    }
  }

  // 3) Build structured evidence for LLM
  const timelineEvidence = lookbackSummary
    ? {
        explanation: lookbackSummary.description,
        range: lookbackSummary.range,
      }
    : undefined;

  // 4) Return a structured object the Compliance Engine
  //    can feed into prompts or directly to the UI
  return {
    benefitId: args.benefitId,
    eligibilityWindow: lookbackSummary?.range,
    timelineExplanation: lookbackSummary?.description,
    // ...other checks
  };
}
```

This is the **direct call path**: the engine runs before the LLM and its results become part of the prompt.

### 4.3 Prompt integration (high‑level)

The Compliance Engine uses prompt aspects to inject timeline evidence:

- A `timelineAspect` takes `EligibilityAnalysis` and formats:

```text
Timeline analysis for Benefit X:
- Rule: contributions must be within the last 2 years.
- Last contribution: 14 March 2024.
- Computed lookback window: 15 March 2022 → 14 March 2024.
- Result: contribution is inside the lookback window.

Use this information when reasoning about eligibility. Do not recompute dates yourself.
```

This text becomes part of the system/context messages for the LLM.

---

## 5. Exposing the Timeline Engine as an LLM Tool

In addition to the direct path, the Responses API + LlmRouter can expose the engine via a tool named `timeline_engine_evaluate`, as described in `timeline_engine_v_0_2`.

### 5.1 Tool contract (summary)

**Tool name:** `timeline_engine_evaluate`  
**Purpose:** "Evaluate regulatory timeline windows (lookbacks, lock‑ins, etc.) using the Timeline Engine."

**Arguments:**

- `operations[]` – each operation includes:
  - `op`: one of `LOOKBACK_RANGE`, `WITHIN_LOOKBACK`, `LOCK_IN_END`, `LOCK_IN_ACTIVE`.
  - `timeline`: a serialised `TimelineNodeInput` with windowYears/windowMonths/windowDays.
  - `context`: a serialised `ScenarioTimeContextInput` (dates as ISO strings).
  - `eventDate` / `triggerDate` (ISO) depending on the operation.

**Result:**

- `results[]` – one entry per operation, each containing:
  - A normalised, ISO‑string version of the engine’s result.
  - The original `op` and optionally the `timelineId`.
  - An `error` field if something went wrong.

### 5.2 Tool handler location

- Implemented in `reg-intel-core` or `reg-intel-llm`, e.g.:
  - `packages/reg-intel-core/llm/tools/timelineEngineTool.ts`.
- The handler:
  - Parses JSON → `TimelineNode` / `ScenarioTimeContext`.
  - Calls the pure Timeline Engine functions.
  - Converts results back to JSON with ISO dates.

The Timeline Engine module itself does **not** know about this tool; it remains a pure domain library.

### 5.3 When to use the tool vs direct calls

Agent strategies:

- **Direct calls (recommended default):**
  - When the agent already has all the necessary dates (e.g. from scenario input), it calls the engine directly and passes only the final explanation to the LLM.

- **Tool calls (optional, more dynamic):**
  - When the agent wants the LLM to explore multiple hypotheses or what‑ifs about dates (e.g. "if disposal happened in March vs November"), it can allow the model to call `timeline_engine_evaluate` to check each scenario.

In both cases, the actual calculations are performed by the Timeline Engine; the tool wrapper adds flexibility but not new logic.

---

## 6. End‑to‑end example

### 6.1 Scenario

User:

> "If I claim this relief in 2024, how long am I locked in before I can change my structure again?"

### 6.2 Flow (direct function path)

1. **Compliance Engine** identifies a relevant tax relief in IE.
2. **GraphClient** loads the benefit node and its `LOCKS_IN_FOR_PERIOD` timeline:

   ```text
   (:Relief {id: "relief-X"})-[:LOCKS_IN_FOR_PERIOD]->(:Timeline {
     id: "lockin-3-years",
     windowYears: 3,
     kind: "LOCK_IN",
     jurisdictionCode: "IE"
   })
   ```

3. Agent builds `ScenarioTimeContext` with `now` and IE tax year boundaries.
4. Agent interprets the user’s question or earlier data to get a `triggerDate` (e.g. planned claim date 1 July 2024).
5. Agent calls:

   ```ts
   const r = timeline.isLockInActive(
     new Date("2024-07-01"),
     timelineNode,
     context,
   );
   ```

6. Result:

   - `r.end` = 1 July 2027.
   - `r.active` = true (if `now` < 1 July 2027).
   - `r.description` = "Based on a 3‑year lock‑in period in IE, a claim made on 1 July 2024 appears to lock in your position until around 1 July 2027." (for example).

7. Agent passes this to the LLM as evidence in the context:

   ```text
   Timeline analysis:
   - Lock‑in period: 3 years after claim date.
   - If claimed on 1 July 2024, lock‑in ends around 1 July 2027.
   - As of today, the lock‑in would appear to still be active.
   ```

8. LLM incorporates this in a research‑style answer, with standard disclaimers.

### 6.3 Flow (tool path, if enabled)

Alternatively, the model might:

1. Ask itself: "I should confirm the lock‑in end date using the timeline engine tool."
2. Call `timeline_engine_evaluate` with:

   ```json
   {
     "operations": [
       {
         "op": "LOCK_IN_END",
         "timeline": {
           "id": "lockin-3-years",
           "label": "3‑year lock‑in",
           "windowYears": 3,
           "kind": "LOCK_IN",
           "jurisdictionCode": "IE"
         },
         "context": {
           "now": "2024-06-15T00:00:00Z",
           "jurisdictionCode": "IE"
         },
         "triggerDate": "2024-07-01T00:00:00Z"
       }
     ]
   }
   ```

3. The tool handler calls `computeLockInEnd` and returns the ISO end date + explanation.
4. The model incorporates that result into its final text answer.

---

## 7. Migration Notes

From the original `timeline-integration.md` to this v0.3:

- **Clarified boundaries:**
  - Timeline Engine is explicitly positioned as a pure module, injected into Compliance Engine.
- **Graph schema alignment:**
  - Integration assumes `:Timeline` nodes and specific edge types (`LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, etc.) as per `graph_schema_v_0_6`.
- **LLM tool integration:**
  - New section describing how to wrap the Timeline Engine for OpenAI Responses as `timeline_engine_evaluate` without changing the engine’s own API.
- **Examples extended:**
  - Included direct and tool‑based flows for lock‑ins and lookback windows.

This document is now the canonical reference for how the Timeline Engine plugs into the rest of the Regulatory Intelligence Copilot stack in architecture v0.6.

