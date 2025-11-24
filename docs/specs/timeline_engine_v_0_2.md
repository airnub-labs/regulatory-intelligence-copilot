# Timeline Engine Spec v0.2 – Regulatory Intelligence Copilot

> **Status:** Draft v0.2  
> **Scope:** Time-based reasoning over regulatory rules, windows, lock-ins, eligibility periods, and cross‑jurisdiction scenarios.

This document updates the v0.1 Timeline Engine spec to align with the **regulatory-intelligence-copilot** architecture. The engine is a small, pure library used by agents and orchestrators (whether they run inside E2B sandboxes, Node workers, or other runtimes).

The Timeline Engine does **not** make legal/tax decisions or give advice. It:

- Interprets `:Timeline` nodes and related edges from the regulatory graph.
- Performs date arithmetic and basic calendar logic.
- Provides helper functions and **explanations** for agents and LLMs.

---

## 1. Design Goals

1. **Centralise time logic**  
   All regulatory time calculations (lookbacks, lock‑ins, deadlines, cooling‑off periods) flow through this module, not scattered across agents.

2. **Explainability**  
   Every function returns **both** a machine‑usable result and a human‑readable explanation string for LLMs and UI.

3. **Graph‑aware**  
   The engine consumes `:Timeline` nodes and edges like `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`, etc., as defined in the graph schema.

4. **Scenario‑first**  
   Works with real or simulated user scenarios: sequences of events (claims, contributions, disposals, re‑acquisitions) across years.

5. **Cross‑jurisdiction friendly**  
   Time logic can take a `jurisdictionCode` and `taxYearConfig` so that different countries’ tax years and conventions can be supported.

6. **Non‑prescriptive**  
   The engine never says "you must" or "you will". It produces approximate ranges and narratives like "this rule appears to require…", leaving room for professional judgment.

7. **Purity & testability**  
   Functions are pure (input → output) with no hidden I/O, suitable for unit tests and for use inside deterministic pipelines.

---

## 2. Data Model Interface

The Timeline Engine is deliberately agnostic about where data comes from. Agents adapt graph data into simple TypeScript types.

### 2.1 Timeline Nodes

Standardised `TimelineNode` shape (derived from `:Timeline` nodes in Memgraph):

```ts
interface TimelineNode {
  id: string;
  label: string;
  notes?: string;

  // Window size (any combination may be present)
  windowDays?: number;
  windowMonths?: number;
  windowYears?: number;

  // Optional classification, for debugging and explanation
  kind?:
    | "LOOKBACK"
    | "LOCK_IN"
    | "DEADLINE"
    | "EFFECTIVE_WINDOW"
    | "USAGE_FREQUENCY" // e.g. once per lifetime, once per N years
    | "OTHER";

  // Optional jurisdiction hint (for tax year and calendar behaviour)
  jurisdictionCode?: string; // e.g. "IE", "MT", "IM", "DE"
}
```

### 2.2 Timeline Edges

Edges that connect rules/benefits/reliefs/cases to timelines, as per graph schema v0.2:

- `(:Benefit|:Relief|:Condition)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:Benefit|:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`
- `(:Section|:Rule)-[:FILING_DEADLINE]->(:Timeline)`
- `(:Update|:ChangeEvent)-[:EFFECTIVE_WINDOW]->(:Timeline)`
- `(:Relief|:Benefit)-[:USAGE_FREQUENCY]->(:Timeline)` (e.g. once per lifetime / once per N years)

The engine does not query the graph directly. Agents pass in the relevant `TimelineNode` plus contextual dates.

### 2.3 Scenario Time Context

Agents supply a **ScenarioTimeContext** to make time calculations explicit and testable:

```ts
interface ScenarioTimeContext {
  now: Date;                   // "Today" or reference analysis date
  jurisdictionCode?: string;   // e.g. "IE", "MT", "IM"

  // Optional tax/welfare year definitions (if known)
  taxYearStart?: Date;         // e.g. 1 Jan or 6 Apr depending on jurisdiction
  taxYearEnd?: Date;

  // Optional calendar / holiday profile (future extension)
  calendarId?: string;         // later: for business-day aware deadlines
}
```

### 2.4 Events

The engine works with simple events (agents can enrich them upstream):

```ts
interface TimeEvent {
  date: Date;
  kind?: string;       // e.g. "DISPOSAL", "ACQUISITION", "CLAIM", "CONTRIBUTION"
  label?: string;      // free-text label for explanation
}
```

---

## 3. Public API (v0.2)

All functions live in a `timelineEngine` module (e.g. `packages/reg-intel-core/timeline/timelineEngine.ts`).

### 3.1 `computeLookbackRange(timeline, context)`

**Input**

```ts
function computeLookbackRange(
  timeline: TimelineNode,
  context: ScenarioTimeContext
): LookbackResult;

interface DateRange {
  start: Date;
  end: Date;
}

interface LookbackResult {
  range: DateRange;
  description: string;
}
```

**Behaviour**

- Uses `context.now` as the range end.
- Subtracts `windowYears`, then `windowMonths`, then `windowDays` from `now` to compute `start`.
- If no window fields exist, returns a zero-length range `[now, now]` and explains that the timeline node is underspecified.

### 3.2 `isWithinLookback(eventDate, timeline, context)`

**Input**

```ts
function isWithinLookback(
  eventDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext
): LookbackCheckResult;

interface LookbackCheckResult {
  within: boolean;
  range: DateRange;
  description: string;
}
```

**Behaviour**

- Calls `computeLookbackRange`.
- Checks whether `eventDate` falls within `[start, end]`.
- Description summarises:
  - The lookback range.
  - Whether the event falls inside or outside.

### 3.3 `computeLockInEnd(triggerDate, timeline, context)`

**Input**

```ts
function computeLockInEnd(
  triggerDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext
): LockInResult;

interface LockInResult {
  end: Date;
  description: string;
}
```

**Behaviour**

- Adds `windowYears`, `windowMonths`, and `windowDays` to `triggerDate` (in that order).
- Returns `end` and a description like:

> "This rule appears to lock in your position for approximately 4 years from 2025‑04‑01, until around 2029‑04‑01."

### 3.4 `isLockInActive(triggerDate, timeline, context)`

**Input**

```ts
function isLockInActive(
  triggerDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext
): LockInCheckResult;

interface LockInCheckResult {
  active: boolean;
  end: Date;
  description: string;
}
```

**Behaviour**

- Calls `computeLockInEnd`.
- Compares `context.now` to `end` to determine whether the lock‑in appears active.
- Description explains:
  - The lock‑in duration and end date.
  - Whether the lock‑in is likely still in force.

### 3.5 `describeDeadline(baseDate, timeline, context)`

Used for *relative* deadlines such as:

- "File within 31 days of period end".
- "Apply within 4 months of the end of the tax year".

**Input**

```ts
function describeDeadline(
  baseDate: Date,
  timeline: TimelineNode,
  context: ScenarioTimeContext
): DeadlineResult;

interface DeadlineResult {
  deadline: Date;
  description: string;
}
```

**Behaviour**

- Adds the window fields to `baseDate` to compute a `deadline`.
- Description explains:
  - How the deadline is derived.
  - Whether `context.now` is before or after that date (for narrative only, not enforcement).

### 3.6 `computeUsageWindow(timeline, context)` (Usage Frequency)

Used for rules such as:

- "Once per lifetime".
- "Once every 4 years".

**Input**

```ts
function computeUsageWindow(
  timeline: TimelineNode,
  context: ScenarioTimeContext
): UsageWindowResult;

interface UsageWindowResult {
  window: DateRange | null; // null for lifetime/no explicit upper bound
  description: string;
}
```

**Behaviour**

- If `kind === "USAGE_FREQUENCY"` and window properties are present, constructs a **window length** but leaves it to agents to anchor it to specific events.
- If this represents "once per lifetime" without explicit window fields, `window` may be `null` with a description clarifying semantics.

### 3.7 `compareTimelines(t1, t2, anchorDate, context)`

Utility to understand how two windows relate (e.g. CGT timing vs benefit lock‑in).

**Input**

```ts
type TimelineRelation =
  | "DISJOINT"
  | "OVERLAPPING"
  | "EQUAL"
  | "T1_CONTAINS_T2"
  | "T2_CONTAINS_T1";

interface TimelineComparisonResult {
  relation: TimelineRelation;
  t1Range: DateRange;
  t2Range: DateRange;
  description: string;
}

function compareTimelines(
  t1: TimelineNode,
  t2: TimelineNode,
  anchorDate: Date,              // e.g. now or a specific trigger date
  context: ScenarioTimeContext
): TimelineComparisonResult;
```

**Behaviour**

- Uses `anchorDate` to compute windows for both timelines (lookback or forward, depending on `kind`).
- Determines whether ranges are disjoint, overlapping, or nested.
- Description mentions implications like:

> "These two windows overlap for approximately 18 months. Claims made in that overlapping period may be affected by both rules."

---

## 4. Agent Usage Patterns

### 4.1 Eligibility Windows (Contributions & Benefits)

Example: A benefit has a 2‑year lookback requirement on contributions.

1. Agent queries Memgraph for `(:Benefit)-[:LOOKBACK_WINDOW]->(t:Timeline)`.
2. Agent collects user contribution events from the scenario.
3. For each contribution date, it calls `isWithinLookback(event.date, t, context)`.
4. It aggregates results into a summary for the LLM:

```json
{
  "benefit": "Jobseeker's Benefit (Self‑Employed)",
  "lookback": {
    "label": "2‑year lookback",
    "range": {"start": "2023‑03‑15", "end": "2025‑03‑15"},
    "events_within": 5,
    "events_outside": 2
  }
}
```

The LLM then explains how the lookback may relate to eligibility, while explicitly stating uncertainty.

### 4.2 Lock‑Ins & Future Options

Example: A CGT relief locks in a position for 4 years after a disposal.

1. Graph: `(:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline {windowYears: 4})`.
2. Agent knows a disposal happened on `triggerDate`.
3. Calls `isLockInActive(triggerDate, t, context)`.
4. LLM sees:

```json
{
  "relief": "CGT Relief X",
  "trigger_date": "2025‑04‑01",
  "lock_in": {
    "end": "2029‑04‑01",
    "active": true
  }
}
```

From this it can explain which other reliefs/benefits might be mutually exclusive during that window (based on the graph, not the Timeline Engine itself).

### 4.3 CGT Timing & Wash‑Sale‑Style Patterns

Example: Modelling when CGT losses are usable based on disposal and reacquisition dates.

- A rule encodes a `LOOKBACK_WINDOW` on acquisitions relative to a disposal (e.g. acquisitions within N days of a disposal affect loss relief).
- The agent:
  - Uses `computeLookbackRange`/`isWithinLookback` for transaction pairs.
  - Uses `compareTimelines` to see how these windows interact with other rules (e.g. annual CGT exemption periods).

Timeline Engine does **not** implement jurisdiction‑specific share matching – that remains in the agent/graph – but it provides consistent date math and explanations.

### 4.4 Cross‑Jurisdiction Cases

For cross‑border scenarios, agents can:

- Pass `jurisdictionCode` into `ScenarioTimeContext`.
- Optionally set `taxYearStart`/`taxYearEnd` based on the primary jurisdiction.
- Use deadlines/lookbacks relative to the correct fiscal calendar.

The engine itself remains jurisdiction‑agnostic: it just honours `taxYearStart`/`taxYearEnd` when provided and includes them in explanations.

---

## 5. Error Handling & Uncertainty

The engine must be honest about what it can and cannot infer.

- If a `TimelineNode` has no usable window fields:
  - Return a degenerate range or `null` where appropriate.
  - Set `description` to indicate that the rule appears underspecified or requires manual interpretation.

- If input dates are invalid:
  - Surface a clear error message for logging.
  - Return a result with `description` explaining that the calculation failed.

Agents and LLMs should:

- Reflect uncertainty explicitly ("appears to", "likely", "based on the information encoded in this graph").
- Avoid treating these ranges as official deadlines.

---

## 6. Implementation Notes

- Use a robust date library (e.g. `date-fns`, `luxon`) instead of hand‑rolling complex calendar logic.
- All functions are **pure** and should be easy to unit test.
- Tests should cover:
  - Combinations of years/months/days.
  - Boundary conditions (event exactly on start/end of range).
  - Retrospective analysis (changing `context.now`).
  - Different tax year boundaries where `taxYearStart`/`taxYearEnd` are supplied.

---

## 7. Future Extensions

Planned or possible enhancements beyond v0.2:

1. **Recurring deadlines**  
   Support for rules like "file by N months after the end of each tax year" with automatic derivation of multiple deadlines.

2. **Business‑day aware calculations**  
   Integrate jurisdiction‑specific calendars to answer questions like "around when would this deadline fall, ignoring weekends and public holidays?".

3. **Scenario timeline summaries**  
   Given a set of events and relevant timelines, generate a structured summary of key upcoming/expired windows for an advisor.

4. **Graph‑linked explanations**  
   Return IDs of `:Timeline` nodes and related `:Rule`/`:Benefit`/`:Relief` nodes alongside human text, so the UI can show which parts of the graph underpin each statement.

5. **Time‑based notification hooks**  
   Integrate with a scheduler so changes in law (captured as `:Update` nodes with `:EFFECTIVE_WINDOW`) can trigger user‑facing notifications when relevant windows open/close.

For v0.2, the core objective is to provide **solid, explainable building blocks** for lookback windows, lock‑ins, deadlines, usage frequency and basic window comparisons, across multiple domains and jurisdictions.

