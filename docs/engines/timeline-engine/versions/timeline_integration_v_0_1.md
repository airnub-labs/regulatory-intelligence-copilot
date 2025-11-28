# Timeline Engine Integration Guide

This guide explains how the Timeline Engine is integrated into the Regulatory Intelligence Copilot agents to provide time-based reasoning over regulatory rules.

## Overview

The Timeline Engine provides pure functions for computing:
- **Lookback windows** - date ranges for checking eligibility requirements (e.g., "104 weeks of PRSI contributions in the last 2 years")
- **Lock-in periods** - time periods during which certain benefits or tax reliefs prevent other options (e.g., "4-year R&D credit lock-in")
- **Date range checks** - determining if events fall within required windows

## Architecture

```
┌─────────────────┐
│   Agent         │
│  (e.g. Single   │
│   Director)     │
└────────┬────────┘
         │
         ├─→ Fetch graph context (benefits, conditions, timelines)
         │
         ├─→ For each benefit:
         │     ├─→ graphClient.getTimelines(benefitId)
         │     ├─→ computeLookbackRange(timeline, now)
         │     └─→ computeLockInEnd(triggerDate, timeline)
         │
         └─→ Format enhanced context with date calculations
             └─→ Pass to LLM for reasoning
```

## Integration Steps

### 1. Import Timeline Engine Functions

```typescript
import {
  computeLookbackRange,
  computeLockInEnd,
  isWithinLookback,
  isLockInActive,
} from '../timeline/timelineEngine.js';
import type { Timeline } from '../types.js';
```

### 2. Fetch Timeline Constraints from Graph

After fetching graph context, identify benefits and fetch their timeline constraints:

```typescript
const benefits = graphContext.nodes.filter(n => n.type === 'Benefit');
const now = new Date();

for (const benefit of benefits) {
  // Fetch timeline constraints for this benefit
  const timelines = await ctx.graphClient.getTimelines(benefit.id);

  // timelines is an array of Timeline objects with window properties
}
```

### 3. Compute Date Ranges

For each timeline, compute the relevant date ranges:

#### Lookback Windows (for contribution requirements)

```typescript
const lookbackResult = computeLookbackRange(timeline, now);
// Returns:
// {
//   range: { start: Date, end: Date },
//   description: "This rule uses a 2 year lookback window (2022-11-24 to 2024-11-24)..."
// }
```

#### Lock-in Periods (for mutual exclusions)

```typescript
const triggerDate = new Date('2024-01-01'); // When benefit was claimed
const lockInResult = computeLockInEnd(triggerDate, timeline);
// Returns:
// {
//   end: Date,
//   description: "Claiming this relief locks in your position for 4 years..."
// }
```

### 4. Check Specific Dates

To check if a specific event (e.g., PRSI contribution) falls within a lookback window:

```typescript
const contributionDate = new Date('2023-06-01');
const withinResult = isWithinLookback(contributionDate, timeline, now);
// Returns:
// {
//   within: boolean,
//   range: { start: Date, end: Date },
//   description: "Your event date falls **within** that window."
// }
```

To check if a lock-in period is currently active:

```typescript
const claimDate = new Date('2020-01-01'); // When relief was claimed
const activeResult = isLockInActive(claimDate, timeline, now);
// Returns:
// {
//   active: boolean,
//   end: Date,
//   description: "The lock-in period appears to still be active..."
// }
```

### 5. Format Context for LLM

Include timeline calculations in the context passed to the LLM:

```typescript
interface TimelineCalculations {
  benefitId: string;
  lookbackRanges: Array<{ timeline: Timeline; description: string }>;
  lockInPeriods: Array<{ timeline: Timeline; description: string }>;
}

function formatGraphContext(
  context: GraphContext,
  timelineCalculations?: TimelineCalculations[]
): string {
  // Format benefits, conditions, sections...

  // Add timeline calculations
  if (timelineCalculations && timelineCalculations.length > 0) {
    for (const calc of timelineCalculations) {
      // Include lookback ranges with computed dates
      // Include lock-in periods with computed end dates
    }
  }

  return formattedContext;
}
```

## Example: SingleDirector Agent Integration

See `packages/compliance-core/src/agents/SingleDirector_IE_SocialSafetyNet_Agent.ts` for a complete example.

**Key sections:**

1. **Import Timeline Engine** (lines 9-20)
2. **Define TimelineCalculations interface** (lines 85-92)
3. **Enhance formatGraphContext** to accept timeline calculations (lines 94-167)
4. **Compute timeline calculations in handle()** (lines 266-310):
   - Fetch timelines for each benefit
   - Compute lookback ranges and lock-in periods
   - Pass calculations to formatter

## Timeline Node Schema

Timeline nodes in the graph have the following structure:

```typescript
interface Timeline {
  id: string;              // e.g., "lookback-2-years"
  label: string;           // e.g., "2-Year Lookback"
  window_years?: number;   // e.g., 2
  window_months?: number;  // e.g., 12
  window_days?: number;    // e.g., 273 (39 weeks)
  notes?: string;          // Optional description
}
```

### Timeline Relationships

Benefits connect to Timeline nodes via relationships:

- `LOOKBACK_WINDOW` - Contribution requirement windows
- `LOCKS_IN_FOR_PERIOD` - Mutual exclusion lock-in periods
- `FILING_DEADLINE` - Deadline windows (future use)
- `EFFECTIVE_WINDOW` - Validity periods (future use)

## Real-World Examples

### Example 1: Jobseeker's Benefit (Self-Employed)

**Graph Data:**
```cypher
(:Benefit {id: 'jobseekers-benefit-self-employed'})
  -[:LOOKBACK_WINDOW]->(:Timeline {id: 'lookback-2-years', window_years: 2})
  -[:LOOKBACK_WINDOW]->(:Timeline {id: 'lookback-39-weeks', window_days: 273})
```

**Timeline Calculations (as of 2024-11-24):**

- **2-Year Lookback**: 2022-11-24 to 2024-11-24
  - Used for: "104 weeks of PRSI contributions in the last 2-4 years"

- **39-Week Lookback**: 2024-03-05 to 2024-11-24
  - Used for: "39 weeks of contributions in the 12 months before claiming"

**Agent Output:**
```
For Jobseeker's Benefit (Self-Employed):
  Lookback Windows:
  - 2-Year Lookback: This rule uses a 2 year lookback window (2022-11-24 to 2024-11-24).
    Events within this period may be relevant to eligibility or calculations.
  - 39-Week Lookback: This rule uses a 273 day lookback window (2024-03-05 to 2024-11-24).
    Events within this period may be relevant to eligibility or calculations.
```

### Example 2: R&D Tax Credit Lock-in

**Graph Data:**
```cypher
(:Benefit {id: 'rd-tax-credit'})
  -[:LOCKS_IN_FOR_PERIOD]->(:Timeline {id: 'lock-in-4-years', window_years: 4})
```

**Timeline Calculations (claimed 2020-01-01, checked 2024-11-24):**

- **4-Year Lock-in**: Ends 2024-01-01
  - Status: Lock-in has ended
  - Description: "The lock-in period appears to have ended. It started on 2020-01-01 and ran for 4 years, ending around 2024-01-01. Options that were previously excluded may now be available."

## Testing

### Unit Tests

Timeline Engine functions have comprehensive unit tests:

```bash
cd packages/compliance-core
pnpm test
```

See `packages/compliance-core/src/timeline/timelineEngine.test.ts` for 25 test cases covering:
- Lookback range calculations (2-year, 12-month, 39-week, combined periods)
- Boundary conditions (start/end of windows, leap years)
- Lock-in period calculations
- Real-world scenarios (PRSI contributions, tax reliefs)

### Integration Tests

To test with real graph data:

```bash
# 1. Start Memgraph
docker run -p 7687:7687 memgraph/memgraph-platform

# 2. Seed graph
npx tsx scripts/seed-graph.ts

# 3. Run integration tests
npx tsx scripts/test-timeline-integration.ts
```

The integration test verifies:
- BoltGraphClient can fetch timeline constraints
- Timeline Engine correctly computes date ranges
- Agent integration provides enhanced context to LLM

## Benefits of Timeline Engine Integration

1. **Accurate Date Calculations** - No more vague "approximately 2 years" - agents provide exact date ranges
2. **Consistency** - All agents use the same pure functions for timeline reasoning
3. **Explainability** - LLM receives concrete dates to reason about, improving transparency
4. **Testability** - Timeline calculations are unit-tested with 100% coverage
5. **Extensibility** - Easy to add new timeline types (filing deadlines, effective windows, etc.)

## Future Enhancements

- **User-specific date checks** - When user provides contribution dates, use `isWithinLookback()` to check eligibility
- **Lock-in warnings** - Proactively warn users when claiming benefits with lock-in periods
- **Filing deadline tracking** - Add `FILING_DEADLINE` timeline relationships
- **Effective date ranges** - Use `EFFECTIVE_WINDOW` for rules that expire or phase in
- **Calendar integration** - Export timeline dates to calendar apps for reminders

## References

- **Timeline Engine Spec**: [`docs/engines/timeline-engine/versions/timeline_engine_v_0_1.md`](timeline_engine_v_0_1.md)
- **Graph Schema**: [`docs/graph/graph-schema/versions/graph_schema_v_0_2.md`](specs/graph_schema_v_0_2.md)
- **Agent Implementation**: [`packages/compliance-core/src/agents/SingleDirector_IE_SocialSafetyNet_Agent.ts`](../packages/compliance-core/src/agents/SingleDirector_IE_SocialSafetyNet_Agent.ts)
- **BoltGraphClient**: [`packages/compliance-core/src/graph/boltGraphClient.ts`](../packages/compliance-core/src/graph/boltGraphClient.ts)
