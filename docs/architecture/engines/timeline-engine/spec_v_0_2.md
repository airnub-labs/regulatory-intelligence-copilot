# Timeline Engine Spec v0.2 – Regulatory Intelligence Copilot

> **Status:** v0.2 (updated to clarify LLM tool integration)
> **Scope:** Time‑based reasoning over regulatory rules, windows, lock‑ins, eligibility periods, and cross‑jurisdiction scenarios.

This document refines the v0.1/v0.2 design for the **Timeline Engine** and explains **how it can be exposed to the LLM as an OpenAI Responses tool** without changing the engine itself.

The engine is a small, pure TypeScript library used by agents and orchestrators (inside Node, E2B sandboxes, or other runtimes). It never gives legal/tax advice; it only performs date calculations and returns structured results plus human‑readable explanations.

---

## 1. Design Goals

1. **Single place for time logic**  
   All regulatory time calculations (lookbacks, lock‑ins, filing deadlines, effective windows) are implemented here, not ad‑hoc in agents.

2. **Explainability**  
   Every function returns both:
   - a machine‑friendly result (dates, booleans, ranges), and
   - a narrative string that the LLM or UI can surface.

3. **Graph‑aware but graph‑agnostic**  
   The engine understands `:Timeline` concepts (lookback, lock‑in, etc.) but does not query Memgraph itself. Agents adapt graph data into simple `TimelineNode` objects.

4. **Scenario‑oriented**  
   Supports reasoning over concrete situations: sequences of events (claims, contributions, disposals, reacquisitions) across years.

5. **Cross‑jurisdiction ready**  
   Accepts `jurisdictionCode` and optional tax‑year config so IE / UK / NI / IM / MT etc. can be supported without changing the core engine.

6. **Non‑prescriptive**  
   Descriptions are phrased as "appears to" / "around" / "based on the encoded rule" – never as binding advice.

7. **Pure & testable**  
   Functions are pure (input → output) with no hidden I/O. This makes them safe for unit tests and deterministic pipelines.

---

## 2. Data Model Interface

The Timeline Engine deliberately knows nothing about Memgraph, Supabase, or MCP. Agents and orchestrators adapt their data into simple TypeScript shapes.

### 2.1 `TimelineNode`

Represents a generic `:Timeline` concept in the rules graph.

```ts
export interface TimelineNode {
  id: string;          // Graph id, e.g. "lookback-2-years"
  label: string;       // Human label, e.g. "2‑Year Lookback"
  notes?: string;

  // Window size; any combination may be present
  windowDays?: number;
  windowMonths?: number;
  windowYears?: number;

  // Optional classification, mostly for explanations / debugging
  kind?:
    | "LOOKBACK"
    | "LOCK_IN"
    | "DEADLINE"
    | "EFFECTIVE_WINDOW"
    | "USAGE_FREQUENCY" // e.g. once per lifetime, or once per N years
    | "OTHER";

  // Optional hint for jurisdiction‑specific behaviour
  jurisdictionCode?: string; // e.g. "IE", "UK", "IM", "MT"
}
```

### 2.2 Timeline Edges (from the graph schema)

Agents obtain timelines from the graph via `GraphClient` and then adapt them into `TimelineNode` objects. The engine assumes that the graph schema provides edges such as:

- `(:Benefit|:Relief|:Condition)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:Benefit|:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`
- `(:Section|:Rule)-[:FILING_DEADLINE]->(:Timeline)`
- `(:Update|:ChangeEvent)-[:EFFECTIVE_WINDOW]->(:Timeline)`
- `(:Relief|:Benefit)-[:USAGE_FREQUENCY]->(:Timeline)` (e.g. once per lifetime / once per N years)

The engine never runs Cypher; it simply consumes already‑loaded `TimelineNode` objects.

### 2.3 Scenario Time Context

Agents supply a **ScenarioTimeContext** so calculations are explicit and repeatable.

```ts
export interface ScenarioTimeContext {
  now: Date;                 // Reference date for analysis
  jurisdictionCode?: string; // Optional primary jurisdiction, e.g. "IE"

  // Optional tax / welfare year definitions
  taxYearStart?: Date;       // e.g. 1 Jan or 6 Apr
  taxYearEnd?: Date;

  // Optional calendar profile (future extension for business days)
  calendarId?: string;
}
```

### 2.4 Time Events

Some functions work with generic events supplied by the agent.

```ts
export interface TimeEvent {
  date: Date;
  kind?: string;  // e.g. "DISPOSAL", "ACQUISITION", "CLAIM", "CONTRIBUTION"
  label?: string; // Free‑text label for explanations
}
```

---

## 3. Public API (v0.2)

All functions live in a `timelineEngine` module, e.g. `packages/reg-intel-core/timeline/timelineEngine.ts`. They are **synchronous and pure**.

### 3.1 `computeLookbackRange(timeline, context)`

```ts
export interface DateRange {
  start: Date;
  end: Date;
}

export interface LookbackResult {
  range: DateRange;
  description: string;
}

export function computeLookbackRange(
  timeline: TimelineNode,
  context: ScenarioTimeContext,
): LookbackResult;
```

**Behaviour**

- Uses `context.now` as the end of the range.
- Subtracts `windowYears`, then `windowMonths`, then `windowDays` to compute the start.
- If no window properties are present, returns `[now, now]` and a description noting that the rule is underspecified.

### 3.2 `isWithinLookback(eventDate, timeline, context)`

```ts
export interface LookbackCheckResult {
  within: boolean;
  range: DateRange;
  description: string;
}

export function isWithinLookback(
  eventDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext,
): LookbackCheckResult;
```

**Behaviour**

- Calls `computeLookbackRange` and checks if `eventDate` lies inside the range.
- Description summarises the range and whether the date is inside or outside.

### 3.3 `computeLockInEnd(triggerDate, timeline, context)`

```ts
export interface LockInResult {
  end: Date;
  description: string;
}

export function computeLockInEnd(
  triggerDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext,
): LockInResult;
```

**Behaviour**

- Adds `windowYears`, `windowMonths`, and `windowDays` to `triggerDate` in that order.
- Returns the lock‑in end date and a narrative description.

### 3.4 `isLockInActive(triggerDate, timeline, context)`

```ts
export interface LockInCheckResult {
  active: boolean;
  end: Date;
  description: string;
}

export function isLockInActive(
  triggerDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext,
): LockInCheckResult;
```

**Behaviour**

- Calls `computeLockInEnd`.
- Compares the resulting `end` with `context.now` to determine whether the lock‑in is still in force.

### 3.5 `compareTimelines(a, b, context)` (optional helper)

```ts
export interface TimelineComparisonResult {
  a: TimelineNode;
  b: TimelineNode;
  description: string;
}

export function compareTimelines(
  a: TimelineNode,
  b: TimelineNode,
  context: ScenarioTimeContext,
): TimelineComparisonResult;
```

**Behaviour**

- Compares two timeline windows relative to `context.now`.
- Description explains which window is longer, how they overlap, and any relevant ordering.

---

## 4. Usage Patterns

This section illustrates how agents use the engine **directly** (without LLM tools) to pre‑compute dates and feed them into prompts.

### 4.1 Lookback Windows for Eligibility

Example: A welfare rule requires contributions in the last N months/years.

1. Graph expresses `LOOKBACK_WINDOW` edges from `:Benefit` to `:Timeline` nodes.
2. Agent uses `GraphClient.getTimelines(benefitId)` to retrieve relevant `TimelineNode`s.
3. Agent constructs `ScenarioTimeContext` with `now` and jurisdiction hints.
4. For each timeline, agent calls `computeLookbackRange` and/or `isWithinLookback`.
5. Agent passes both the raw dates and the explanation strings into the LLM context.

### 4.2 Lock‑Ins & Future Options

Example: A tax relief locks in a position for a number of years after a claim or disposal.

1. Graph uses `LOCKS_IN_FOR_PERIOD` edges to a `Timeline` node with a window.
2. Agent knows the `triggerDate` (e.g. when a claim/disposal occurred).
3. Agent calls `isLockInActive(triggerDate, timeline, context)`.
4. Result indicates the end date and whether the lock‑in is currently active.

### 4.3 Cross‑Jurisdiction & Tax‑Year‑Aware Calculations

- Agents set `jurisdictionCode`, `taxYearStart`, and `taxYearEnd` in `ScenarioTimeContext` when they know the jurisdiction’s fiscal calendar.
- Timeline Engine includes this info in descriptions (e.g. "within the 2024 tax year for IE").

---

## 5. Error Handling & Uncertainty

The engine must be explicit about uncertainty or missing data.

- When a `TimelineNode` has no usable window fields, functions:
  - Return a degenerate range or minimal result, and
  - Produce a description that clearly states the rule appears underspecified.

- Invalid dates or impossible combinations should:
  - Surface as clear error messages for logs/tests, and/or
  - Return results with descriptions explaining the failure rather than throwing opaque errors in production.

Agents and LLMs should echo this uncertainty instead of overstating confidence.

---

## 6. Implementation Notes

- Use a robust date library (`date-fns`, `luxon`, etc.) for month/year arithmetic and leap‑year handling.
- Keep functions synchronous and side‑effect free.
- Unit tests should cover:
  - Combinations of `windowYears`/`windowMonths`/`windowDays`.
  - Boundary dates (exactly on start or end of window).
  - Different `now` values for retrospective analysis.
  - Different tax‑year boundaries when provided.

---

## 7. Future Extensions (beyond v0.2)

Possible enhancements that remain compatible with the current API:

1. **Recurring deadlines** – support for rules like "file N months after the end of each tax year" with multiple computed deadlines.
2. **Business‑day aware windows** – integrate calendar profiles so descriptions can say "around date X, ignoring weekends and local public holidays".
3. **Scenario bundles** – helper functions for evaluating multiple events and timelines together (e.g. PRSI contributions over several years).

---

## 8. Exposing the Timeline Engine as an LLM Tool (OpenAI Responses)

> **Important:** This section describes **how to wrap the existing engine as a tool** for the OpenAI Responses API and LlmRouter. The core `timelineEngine` module remains unchanged and pure.

### 8.1 Goals

- Allow the main chat model (via Responses + tools) to request date calculations **on demand**.
- Keep all heavy logic in the Timeline Engine; the tool handler is just a thin adapter.
- Preserve streaming UX: text tokens go to the UI, tool results stay server‑side unless explicitly surfaced by the agent.

### 8.2 Tool Shape (Conceptual)

We define a single tool, `timeline_engine_evaluate`, that can run one or more operations in a batch. The tool schema is expressed in JSON Schema for the Responses API.

**Tool name**: `timeline_engine_evaluate`

**Description**: "Evaluate regulatory timeline windows (lookbacks, lock‑ins, etc.) using the Timeline Engine."

**Parameters schema (conceptual TypeScript view):**

```ts
// Mirrors TimelineNode but with ISO date strings allowed for portability
export interface TimelineNodeInput {
  id?: string;
  label: string;
  notes?: string;
  windowDays?: number;
  windowMonths?: number;
  windowYears?: number;
  kind?: TimelineNode["kind"];
  jurisdictionCode?: string;
}

export interface ScenarioTimeContextInput {
  now: string;              // ISO date string
  jurisdictionCode?: string;
  taxYearStart?: string;    // ISO date string
  taxYearEnd?: string;      // ISO date string
  calendarId?: string;
}

export type TimelineOperationType =
  | "LOOKBACK_RANGE"
  | "WITHIN_LOOKBACK"
  | "LOCK_IN_END"
  | "LOCK_IN_ACTIVE";

export interface TimelineOperationInput {
  op: TimelineOperationType;
  timeline: TimelineNodeInput;
  context: ScenarioTimeContextInput;

  // Optional dates depending on op
  eventDate?: string;   // for WITHIN_LOOKBACK
  triggerDate?: string; // for LOCK_IN_* operations
}

export interface TimelineEngineToolArgs {
  operations: TimelineOperationInput[];
}
```

**Tool result shape (conceptual):**

```ts
export interface TimelineOperationResult {
  op: TimelineOperationType;
  timelineId?: string; // if provided in input

  // Normalised results – all dates returned as ISO strings
  lookback?: LookbackResult & { range: { start: string; end: string } };
  lookbackCheck?: LookbackCheckResult & { range: { start: string; end: string } };
  lockIn?: LockInResult & { end: string };
  lockInCheck?: LockInCheckResult & { end: string };

  error?: string; // set if something went wrong
}

export interface TimelineEngineToolResult {
  results: TimelineOperationResult[];
}
```

The JSON Schema for the Responses API encodes the same structure. The important part for this spec is **the intent**, not the exact schema text.

### 8.3 Tool Handler Implementation (Wrapper Only)

The actual tool handler lives outside the engine, for example in `packages/reg-intel-core/llm/tools/timelineEngineTool.ts`.

Rough outline:

```ts
import * as timelineEngine from "../timeline/timelineEngine";

export async function handleTimelineEngineTool(
  args: TimelineEngineToolArgs,
): Promise<TimelineEngineToolResult> {
  const results: TimelineOperationResult[] = [];

  for (const op of args.operations) {
    try {
      const timeline: TimelineNode = {
        ...op.timeline,
        // Ensure required defaults / coercions here
      };

      const context: ScenarioTimeContext = {
        now: new Date(op.context.now),
        jurisdictionCode: op.context.jurisdictionCode,
        taxYearStart: op.context.taxYearStart
          ? new Date(op.context.taxYearStart)
          : undefined,
        taxYearEnd: op.context.taxYearEnd
          ? new Date(op.context.taxYearEnd)
          : undefined,
        calendarId: op.context.calendarId,
      };

      const base: TimelineOperationResult = { op: op.op, timelineId: op.timeline.id };

      switch (op.op) {
        case "LOOKBACK_RANGE": {
          const r = timelineEngine.computeLookbackRange(timeline, context);
          results.push({
            ...base,
            lookback: {
              ...r,
              range: {
                start: r.range.start.toISOString(),
                end: r.range.end.toISOString(),
              },
            },
          });
          break;
        }

        case "WITHIN_LOOKBACK": {
          const eventDate = op.eventDate ? new Date(op.eventDate) : new Date(NaN);
          const r = timelineEngine.isWithinLookback(eventDate, timeline, context);
          results.push({
            ...base,
            lookbackCheck: {
              ...r,
              range: {
                start: r.range.start.toISOString(),
                end: r.range.end.toISOString(),
              },
            },
          });
          break;
        }

        case "LOCK_IN_END": {
          const trigger = op.triggerDate ? new Date(op.triggerDate) : new Date(NaN);
          const r = timelineEngine.computeLockInEnd(trigger, timeline, context);
          results.push({
            ...base,
            lockIn: { ...r, end: r.end.toISOString() },
          });
          break;
        }

        case "LOCK_IN_ACTIVE": {
          const trigger = op.triggerDate ? new Date(op.triggerDate) : new Date(NaN);
          const r = timelineEngine.isLockInActive(trigger, timeline, context);
          results.push({
            ...base,
            lockInCheck: { ...r, end: r.end.toISOString() },
          });
          break;
        }
      }
    } catch (err) {
      results.push({
        op: op.op,
        timelineId: op.timeline.id,
        error: (err as Error).message ?? "Timeline Engine tool error",
      });
    }
  }

  return { results };
}
```

Key points:

- **Timeline Engine remains unchanged.** The handler simply converts JSON → `TimelineNode`/`ScenarioTimeContext`, calls the pure functions, and converts back to JSON.
- All dates crossing the tool boundary are **ISO strings**; inside the engine they are `Date` objects.
- Validation and error handling live in the wrapper.

### 8.4 Wiring into LlmRouter / OpenAI Responses

The tool registration lives in the LLM/provider layer (e.g. `reg-intel-llm`). Conceptually:

- The OpenAI Responses provider registers `timeline_engine_evaluate` as a tool with the above JSON Schema.
- When a tool call for `timeline_engine_evaluate` appears in the stream:
  - The provider invokes `handleTimelineEngineTool` with parsed args.
  - It then returns the tool result chunk back into the Responses stream.
- The Compliance Engine can either:
  - Let the LLM see the JSON result (so it can quote dates/explanations itself), or
  - Treat it as a hidden side‑channel and format its own higher‑level explanation.

### 8.5 Streaming & UX Considerations

- Text tokens from the LLM stream directly to the UI as usual.
- Tool calls and their JSON results are **not** sent to the UI unless explicitly included in the final answer.
- Agents may still prefer to call the Timeline Engine directly in many cases (pre‑computing windows before calling the LLM). The tool is an additional capability for more complex or interactive reasoning.

### 8.6 Invariants

- The core `timelineEngine` public API (sections 2–3) stays stable and pure.
- Tool schemas and handlers live in the LLM/Compliance Engine layers, not in the Timeline Engine module.
- The engine remains domain‑agnostic and jurisdiction‑agnostic; any jurisdiction‑specific rules live in graph data and agent logic.

---

This completes the v0.2 spec for the Timeline Engine, including how it can be safely exposed as an OpenAI Responses tool while keeping the engine itself unchanged and fully testable.

