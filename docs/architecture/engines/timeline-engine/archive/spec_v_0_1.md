# Timeline Engine Spec v0.1 – Regulatory Intelligence Copilot

> **Status:** Draft v0.1  
> **Scope:** Time-based reasoning over regulatory rules, windows, lock-ins, and eligibility periods.

This document defines the **Timeline Engine** used by agents inside the E2B sandbox. The engine is responsible for turning abstract time concepts in the graph (e.g. lookback windows, lock-in periods) into concrete reasoning steps that can be explained to users.

The engine does **not** make decisions or give advice. It:

- Interprets `:Timeline` nodes and related edges.
- Performs date arithmetic.
- Provides helper functions for agents and LLM prompts.

---

## 1. Design Goals

1. **Centralise time logic**  
   All date calculations should go through this module, not be scattered across agents.

2. **Explainability**  
   Functions should return **both** a machine-usable result and a human-readable explanation that agents/LLMs can surface.

3. **Graph-aware**  
   The engine reads `:Timeline` nodes and edges like `LOOKBACK_WINDOW` and `LOCKS_IN_FOR_PERIOD` from Memgraph.

4. **Non-prescriptive**  
   The engine should never say “you must do X by date Y”. Instead, it should say “the rule appears to require action by around this date, based on these assumptions”.

---

## 2. Data Model Interface

The engine consumes:

### 2.1 Timeline Nodes

`(:Timeline)` nodes (see `schema_v_0_1.md`) with properties:

- `window_days?: int`
- `window_months?: int`
- `window_years?: int`
- `label: string`
- `notes?: string`

### 2.2 Timeline Edges

The engine cares about edges of the form:

- `(:Benefit|:Relief|:Condition)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:Benefit|:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`

It may also later support:

- `(:Section)-[:FILING_DEADLINE]->(:Timeline)`
- `(:Update)-[:EFFECTIVE_WINDOW]->(:Timeline)`

### 2.3 Event Dates

Agents provide **event dates** as standard JavaScript `Date` objects (or ISO strings):

- `triggerDate` – when something happens (e.g. disposal of an asset, claiming a benefit, starting a job).
- `now` – the reference “today” for the analysis.

---

## 3. Public API

All functions live in a `timeline` module inside the sandbox runtime, e.g. `packages/compliance-core/timeline/timelineEngine.ts`.

### 3.1 `computeLookbackRange(timelineNode, now)`

**Input**

- `timelineNode: TimelineNode` – properties read from Memgraph.
- `now: Date` – reference point (usually “today”).

**Output**

```ts
interface DateRange {
  start: Date;
  end: Date;
}

interface LookbackResult {
  range: DateRange;       // start/end of the lookback period
  description: string;    // human-readable explanation
}
```

**Behaviour**

- Constructs a `range` that ends at `now` and starts `window_days|months|years` before `now`.
- If multiple properties exist (e.g. years + months), apply them cumulatively.
- If no window properties exist, returns a zero-length range and a description noting that the timeline node is underspecified.

**Example**

- Timeline node: `label = "12-month Lookback", window_years = 1`.
- `now = 2025-03-15` → `start = 2024-03-15`, `end = 2025-03-15`.

### 3.2 `isWithinLookback(eventDate, timelineNode, now)`

**Input**

- `eventDate: Date`
- `timelineNode: TimelineNode`
- `now: Date`

**Output**

```ts
interface LookbackCheckResult {
  within: boolean;
  range: DateRange;
  description: string; // explanation for LLM/user
}
```

**Behaviour**

- Calls `computeLookbackRange` internally.
- Returns whether `eventDate` lies within `[start, end]`.
- `description` explains:
  - The window.
  - Whether the event falls inside or outside.

**Example description**

> "This rule uses a 12-month lookback window (2024-03-15 to 2025-03-15). Your event date (2024-07-01) falls **within** that window."

### 3.3 `computeLockInEnd(triggerDate, timelineNode)`

**Input**

- `triggerDate: Date` – when the lock-in starts (e.g. claim date).
- `timelineNode: TimelineNode`

**Output**

```ts
interface LockInResult {
  end: Date;
  description: string;
}
```

**Behaviour**

- Adds `window_days|months|years` to `triggerDate`.
- Returns `end` and a description summarising the lock-in.

**Example description**

> "Claiming this relief appears to lock in your position for approximately 4 years from 2025-04-01, to around 2029-04-01, according to this rule."

### 3.4 `isLockInActive(triggerDate, timelineNode, now)`

**Input**

- `triggerDate: Date`
- `timelineNode: TimelineNode`
- `now: Date`

**Output**

```ts
interface LockInCheckResult {
  active: boolean;
  end: Date;
  description: string;
}
```

**Behaviour**

- Uses `computeLockInEnd` to get `end`.
- Compares `now` against `end`.
- If `now <= end`, `active = true`.
- Description explains whether the lock-in appears active.

### 3.5 `describeDeadline(baseDate, timelineNode)` (optional v0.1)

**Use case**: Some rules may encode deadlines relative to a base date (e.g. end of tax year, end of month).

**Input**

- `baseDate: Date` – e.g. end of a tax period.
- `timelineNode: TimelineNode` – may contain properties like `window_months` or `window_days` representing “file within X days/months of baseDate”.

**Output**

```ts
interface DeadlineResult {
  deadline: Date;
  description: string;
}
```

This function may be partially implemented in v0.1, with more sophistication added later.

---

## 4. Agent Usage Patterns

### 4.1 Checking Eligibility Windows

Example: A benefit has a `LOOKBACK_WINDOW` of 2 years of contributions.

1. Agent queries Memgraph:
   - Finds `(:Benefit)-[:LOOKBACK_WINDOW]->(t:Timeline {id: ...})`.
2. Agent obtains user’s contribution event dates from the scenario (not stored in the graph).
3. For each event date:
   - Calls `isWithinLookback(eventDate, t, now)`.
4. LLM prompt receives a compact summary:

```json
{
  "benefit": "Jobseeker's Benefit (Self-Employed)",
  "lookback": {
    "label": "2-year Lookback",
    "range": {"start": "2023-03-15", "end": "2025-03-15"},
    "events_within": 5,
    "events_outside": 2
  }
}
```

LLM then explains how the lookback interacts with eligibility, without making a definitive decision.

### 4.2 Explaining Lock-in Interactions

Example: A CGT relief with a 4-year lock-in after disposal.

1. Graph: `(:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline {window_years: 4})`.
2. Agent knows a disposal happened on `triggerDate`.
3. Calls `isLockInActive(triggerDate, t, now)`.
4. LLM is told:

```json
{
  "relief": "CGT Relief X",
  "trigger_date": "2025-04-01",
  "lock_in": {
    "end": "2029-04-01",
    "active": true
  }
}
```

Then it can say:

> "Based on this rule, claiming this relief appears to have locked in your position until around 2029-04-01. Other reliefs with mutual exclusions may not be available during this period."

---

## 5. Error Handling & Uncertainty

The engine must be **honest about gaps**:

- If a `Timeline` node has no usable window fields, functions should:
  - Return a safe default (e.g. `range.start = range.end = now`).
  - Set `description` to something like:
    - "This timeline node doesn’t define a concrete window; the rule may need more manual interpretation."

- If date arithmetic fails (invalid date), functions should:
  - Surface an error message suitable for logging.
  - Return a result with `description` explaining the failure.

Agents/LLMs should be encouraged to:

- Report uncertainty explicitly.
- Never present uncertain timelines as firm deadlines.

---

## 6. Implementation Notes

- Use a robust date library in the sandbox runtime (or built-in `Temporal` when mature) rather than hand-rolling complex logic.
- All functions should be **pure** (no hidden I/O), taking their inputs explicitly and returning outputs.
- Unit tests should cover:
  - Year/month/day combinations.
  - Boundary conditions (event exactly on start/end of windows).
  - Different `now` values (including retrospective analysis).

---

## 7. Future Extensions

Potential extensions beyond v0.1:

- Support for **multiple timelines per rule** (e.g. a short and a long lookback window depending on subconditions).
- `:Timeline` nodes for **recurring deadlines** (e.g. annual return filing by N months after year-end).
- Country/region-aware calendars and public holidays for more realistic deadline examples.
- User-specific calendar outputs (e.g. exporting date ranges to iCal / reminders), *while still emphasising that these are not official deadlines*.

For v0.1, the primary goal is to:

- Make lookback windows, lock-ins, and simple relative deadlines **machine-usable**, and
- Give LLMs clear, structured inputs for natural-language explanations.

