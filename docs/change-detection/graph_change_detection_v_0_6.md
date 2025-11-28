# Graph Change Detection (v0.6)

## 1. Overview

The **Graph Change Detection** subsystem provides near‑real‑time updates of the Memgraph‑backed regulatory rules graph to any connected clients (e.g. the `GraphVisualization` view in `apps/demo-web`).

It:
- Maintains **per‑filter graph snapshots** in memory.
- Periodically **polls Memgraph** for changes, using timestamp‑based queries where available.
- Computes **incremental diffs** (graph patches) between snapshots.
- Streams **Server‑Sent Events (SSE)** to subscribed clients with compact `GraphPatch` payloads.
- Supports **change batching** to reduce SSE noise and client thrash.

This document supersedes the earlier `graph_change_detection.md` (v0.3) and `graph_change_detection_enhancements.md` (v0.3.1) by folding the enhancements into a single v0.6 spec aligned with `architecture_v_0_6.md` and the updated graph schema.

---

## 2. Architecture

### 2.1 High‑level components

```text
┌─────────────────────────────────────────────────────────────┐
│                        SSE Clients                          │
│                  (GraphVisualization UI)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │  SSE connection
                      │  (GraphPatch events)
┌─────────────────────▼───────────────────────────────────────┐
│           GET /api/graph/stream (Next.js API)               │
│  - Parses query params → ChangeFilter                       │
│  - Subscribes to GraphChangeDetector                        │
│  - Streams events to client                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ subscribe(filter, callback)
                      │
┌─────────────────────▼───────────────────────────────────────┐
│         GraphChangeDetector (process‑wide singleton)        │
│  - Maintains snapshots per filter                           │
│  - Polls Memgraph periodically                              │
│  - Uses timestamp queries where available                   │
│  - Computes diffs → GraphPatch                              │
│  - Optionally batches patches over a short window           │
│  - Notifies subscribers                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ queryGraphByFilter / timestampQueryFn
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                     GraphClient (MCP)                       │
│    - Read‑only queries to Memgraph                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ Cypher
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Memgraph                                 │
│           (Regulatory Rules Knowledge Graph)                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Invariants

- **Read‑only path:**
  - Graph Change Detection **never writes** to Memgraph.
  - All writes still go through `GraphWriteService` + `GraphIngressGuard`.
- **PII‑free:**
  - Only rules/benefits/sections/timelines/etc. are streamed.
  - No user identifiers or conversation content are ever included.
- **Filter‑aware:**
  - Each subscription is scoped by a **`ChangeFilter`** (jurisdictions, profileType, later node types/keywords).
  - Each filter maintains its own snapshot and polling state.

---

## 3. Core Types

These are conceptual interfaces; actual TypeScript lives under `packages/reg-intel-graph/` or `packages/reg-intel-core/` depending on your final layout.

### 3.1 GraphPatch

Represents an incremental graph update for a particular filter.

```ts
interface GraphPatch {
  type: 'graph_patch';
  timestamp: string;          // ISO8601 when patch was emitted

  nodes_added?: GraphNode[];
  nodes_updated?: GraphNode[];
  nodes_removed?: string[];   // node IDs

  edges_added?: GraphEdge[];
  edges_updated?: GraphEdge[]; // same shape as GraphEdge, full replacement
  edges_removed?: string[];     // edge IDs
}
```

`GraphNode` / `GraphEdge` are the same wire‑level structures used elsewhere for graph visualization (aligned with `graph_schema_v_0_6.md`).

**Diff semantics:**

- A node is **added** if its ID is in the new snapshot and not in the old.
- A node is **updated** if its ID is in both snapshots but one or more properties differ.
- A node is **removed** if its ID is in the old snapshot and not in the new.
- An edge is **added** if its ID is in the new snapshot and not in the old (structural or first‑seen).
- An edge is **updated** if its ID is in both snapshots but any property differs (e.g. weight, provenance, certainty, last_verified).
- An edge is **removed** if its ID is in the old snapshot and not in the new.

Clients that don’t care about edge properties can safely ignore `edges_updated`.

### 3.2 ChangeFilter

```ts
interface ChangeFilter {
  jurisdictions?: string[];   // e.g. ["IE", "UK"]
  profileType?: string;       // e.g. "single-director", "household_ie"

  // Optional future filters (not required by v0.6, but anticipated):
  nodeTypes?: string[];       // e.g. ["Benefit", "Relief"]
  keywords?: string[];        // e.g. ["VAT", "VRT"]
}
```

### 3.3 GraphChangeDetectorConfig

```ts
interface GraphChangeDetectorConfig {
  /** Polling interval in milliseconds (default: 5000) */
  pollIntervalMs?: number;

  /** Enable timestamp-based queries (default: true) */
  useTimestamps?: boolean;

  /** Change batching window in milliseconds (default: 1000) */
  batchWindowMs?: number;

  /** Enable change batching (default: true) */
  enableBatching?: boolean;
}
```

### 3.4 TimestampQueryFn

```ts
interface TimestampQueryFn {
  (filter: ChangeFilter, since: Date): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>;
}
```

---

## 4. GraphChangeDetector

### 4.1 Responsibilities

`GraphChangeDetector` is a process‑wide singleton responsible for:

- Maintaining **snapshots per filter** (jurisdiction/profile).
- Managing **subscriptions** and their lifecycles.
- Polling Memgraph at a configurable interval.
- Using **timestamp‑based incremental queries** when enabled.
- Computing diffs between snapshots → `GraphPatch`.
- Applying **change batching** before emitting to subscribers.

### 4.2 Class shape

```ts
class GraphChangeDetector {
  constructor(
    private readonly queryGraphByFilter: (filter: ChangeFilter) => Promise<GraphContext>,
    private readonly config: GraphChangeDetectorConfig = {},
    private readonly timestampQueryFn?: TimestampQueryFn,
  ) {}

  start(): void;
  stop(): void;

  subscribe(filter: ChangeFilter, callback: (patch: GraphPatch) => void): ChangeSubscription;
  getSubscriptionCount(): number;
}
```

**Notes:**
- `GraphContext` is the full subgraph for a filter (nodes + edges) used for initial snapshots.
- `ChangeSubscription` exposes `unsubscribe()` and is tied to an SSE connection.

### 4.3 Per‑filter state

For each `ChangeFilter` (internally keyed, e.g. `IE:single-director`):

- `snapshot`: `GraphSnapshot` (maps of nodes/edges by ID).
- `lastPollTime`: `Date | null` (for timestamp queries).
- `pendingBatch`: optional in‑flight batch (see §6).

---

## 5. Polling & Diff Strategy

### 5.1 Why polling?

- Keeps Memgraph configuration simple (no triggers / streams required).
- Works across Community and Enterprise editions.
- Easy to tune: polling interval can be adjusted per environment.

Triggers / native change streams remain a possible future optimization but are **not required** for v0.6.

### 5.2 Initial snapshot

On first subscription for a given `ChangeFilter`:

1. Call `queryGraphByFilter(filter)` to get the full subgraph.
2. Build a `GraphSnapshot` (maps of nodes and edges by ID).
3. Store `lastPollTime = new Date()`.
4. Emit an initial `GraphPatch` containing the whole subgraph as `nodes_added` / `edges_added`.

### 5.3 Subsequent polls without timestamps

If `useTimestamps === false` **or** `timestampQueryFn` is not provided:

1. Poll Memgraph with `queryGraphByFilter(filter)` each interval.
2. Compute diff between `oldSnapshot` and `newSnapshot`:
   - Nodes: see semantics in §3.1.
   - Edges: see semantics in §3.1.
3. If patch is non‑empty (at least one of `*_added`, `*_updated`, `*_removed` is populated), emit it (subject to batching).

### 5.4 Timestamp‑based incremental queries (recommended)

When `useTimestamps === true` and `timestampQueryFn` is provided:

1. **Initial poll:**
   - Same as above: full snapshot + `lastPollTime = now`.
2. **Subsequent polls:**
   - Call `timestampQueryFn(filter, lastPollTime)` to get only nodes/edges whose `updated_at` is newer than the last poll.
   - Merge these into the existing `snapshot` (update or insert).
   - Compute a patch based only on the changed IDs:
     - Added vs previously missing.
     - Updated vs existing.
     - Removals can still be detected via either:
       - Periodic full snapshot (e.g. every N polls), or
       - Additional tombstone/soft‑delete semantics in the schema.
   - Update `lastPollTime = now`.

This yields **significant reductions** in query overhead and bandwidth for typical workloads.

### 5.5 Schema requirements for timestamps

To support timestamp queries, nodes should include `created_at` and `updated_at` properties. Example pattern:

```cypher
MERGE (n:Benefit {id: $id})
SET n.label      = $label,
    n.created_at = CASE WHEN n.created_at IS NULL THEN datetime() ELSE n.created_at END,
    n.updated_at = datetime();
```

Recommended indexes:

```cypher
CREATE INDEX ON :Benefit(updated_at);
CREATE INDEX ON :Relief(updated_at);
CREATE INDEX ON :Section(updated_at);
// ...other high‑churn node labels
```

Edge‑level timestamps are optional; v0.6 can still detect edge changes via snapshot comparison (edge properties differ → `edges_updated`).

---

## 6. Change Batching

### 6.1 Problem

Without batching, rapid sequences of updates (e.g. seeding scripts, bulk imports) generate many small patches:

```text
12:00:00.100 - Patch: 1 node added
12:00:00.200 - Patch: 1 node added
12:00:00.300 - Patch: 1 node added
...
```

This leads to:
- Excessive SSE messages (network overhead).
- UI thrashing (many small renders).
- Inefficient patch processing.

### 6.2 Solution

Introduce a per‑filter **batching window**:

- Collect patches over `batchWindowMs` (default: 1000ms).
- Merge them into a single `GraphPatch`.
- Emit once when the window elapses.

### 6.3 Implementation sketch

```ts
class GraphChangeDetector {
  private pendingBatches = new Map<string, PendingBatch>();

  private emitPatchWithBatching(filterKey: string, patch: GraphPatch): void {
    if (!this.config.enableBatching) {
      this.emitPatch(filterKey, patch);
      return;
    }

    let batch = this.pendingBatches.get(filterKey);
    if (!batch) {
      batch = { patches: [], timeoutId: null };
      this.pendingBatches.set(filterKey, batch);
    }

    batch.patches.push(patch);

    if (batch.timeoutId) clearTimeout(batch.timeoutId);

    batch.timeoutId = setTimeout(() => {
      const merged = mergePatches(batch!.patches);
      this.pendingBatches.delete(filterKey);
      this.emitPatch(filterKey, merged);
    }, this.config.batchWindowMs ?? 1000);
  }
}
```

`mergePatches` performs concatenation + de‑duplication of `nodes_added`, `nodes_updated`, `nodes_removed`, `edges_added`, `edges_updated`, and `edges_removed`.

### 6.4 Trade‑offs

- **Latency:**
  - Adds up to `batchWindowMs` delay to visible updates.
  - Default 1s is acceptable for most regulatory UIs.
- **Performance:**
  - 10–100× fewer SSE messages under heavy writes.
  - Much smoother client rendering.

---

## 7. SSE Endpoint: `/api/graph/stream`

### 7.1 Request

**Method:** `GET`

**Query parameters:**
- `jurisdictions`: comma‑separated codes (e.g. `IE,UK,EU`).
- `profileType`: profile identifier (e.g. `single-director`).

The API route:
1. Parses query params → `ChangeFilter`.
2. Obtains the singleton `GraphChangeDetector` via a small factory (e.g. `getGraphChangeDetector()`).
3. Subscribes with the filter and a callback that writes SSE events.
4. Sends initial `connected` event, then subsequent `graph_patch` events.
5. Cleans up subscription on connection close.

### 7.2 Event format

1. **Connection confirmation:**

```json
{
  "type": "connected",
  "timestamp": "2025-11-25T12:00:00Z",
  "message": "Graph stream connected"
}
```

2. **Graph patch:**

```json
{
  "type": "graph_patch",
  "timestamp": "2025-11-25T12:00:05Z",
  "nodes_added": [ /* ... */ ],
  "nodes_updated": [ /* ... */ ],
  "nodes_removed": [ "node-1" ],
  "edges_added": [ /* ... */ ],
  "edges_updated": [ /* ... */ ],
  "edges_removed": [ "edge-1" ]
}
```

3. **Keep‑alive:**

```text
: keepalive
```

Sent at a fixed interval (e.g. every 30s) to prevent proxies from closing idle connections.

### 7.3 Client integration

The `GraphVisualization` client uses the SSE stream as:

```ts
const eventSource = new EventSource('/api/graph/stream?jurisdictions=IE&profileType=single-director');

const applyPatch = (patch: GraphPatch) => {
  // 1. Remove nodes & associated edges
  // 2. Remove edges (edges_removed)
  // 3. Add new nodes (nodes_added)
  // 4. Update existing nodes (nodes_updated)
  // 5. Add new edges (edges_added)
  // 6. Update existing edges (edges_updated)
  setGraphData(updatedData);
};

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'graph_patch') {
    applyPatch(data as GraphPatch);
  }
};
```

Client code that doesn’t care about edge property changes can simply skip `edges_updated`.

---

## 8. Performance & Tuning

### 8.1 Polling interval

- **Lower interval (1–2s):** more responsive, higher CPU/IO.
- **Higher interval (10–15s):** lower load, less responsive.
- **Default:** 5s for development; production should tune based on real traffic.

### 8.2 Snapshot size

Approximate per‑filter snapshot memory:

- Small subgraph (~20 nodes): 5–10 KB.
- Medium subgraph (~100 nodes): 25–50 KB.
- Large subgraph (~500 nodes): 125–250 KB.

Total memory ≈ `#filters × averageSnapshotSize`. Typical deployments have 5–10 active filters → 125–250 KB total (negligible).

### 8.3 Bandwidth

Per client per non‑empty update:

- Empty patch (no changes): ~100 bytes.
- 1 node added: ~200–500 bytes.
- 10 nodes + 5 edges: ~2–5 KB.

With batching enabled and timestamp queries on, this remains small even under bursty writes.

### 8.4 Optional compression

For very large patches (e.g. initial load), the SSE endpoint may enable gzip/deflate compression at the HTTP layer. No protocol changes are required.

---

## 9. Testing & Tooling

### 9.1 Test utility: `test-graph-changes.ts`

**Location:** `scripts/test-graph-changes.ts`

**Purpose:** Simulate graph changes (add / update / remove) without complex operational steps.

**Usage:**

```bash
# Seed Memgraph
pnpm seed:all

# Run dev web app
pnpm dev:web

# In another terminal, simulate changes
pnpm test:changes:simulate
# or
pnpm test:changes:add
pnpm test:changes:update
pnpm test:changes:remove
```

### 9.2 Verification checklist

- Initial snapshot loads with seeded data.
- Status indicator in UI shows "Live updates".
- Running simulation commands produces visible graph updates.
- Console logs show detector polling and patch emission.
- SSE connection remains open with periodic keep‑alives.

### 9.3 Unit tests

At minimum:

- Diff computation: `computeDiff` behaves correctly for node and edge adds/updates/removals.
- Timestamp query logic returns only nodes/edges updated after `since`.
- Batching logic merges multiple patches correctly and deduplicates IDs.
- Config defaults behave as expected when no options are provided.

---

## 10. Migration Notes

From earlier v0.3 / v0.3.1 docs to v0.6:

- **Unchanged fundamentals:**
  - Still polling‑based, per‑filter snapshots, SSE `GraphPatch` events.
- **Folded enhancements:**
  - Timestamp‑based queries and batching are now **first‑class** in the core spec.
  - `GraphChangeDetectorConfig` replaces ad‑hoc constructor flags.
- **New in v0.6:**
  - `edges_updated` field in `GraphPatch` to support updates to edge properties.
  - Diff logic explicitly covers node and edge property changes.
- **Compatibility:**
  - Existing code that constructs `GraphChangeDetector(queryFn, 5000)` can be shimmed by treating the numeric second argument as `pollIntervalMs`.
  - Existing clients that ignore `edges_updated` will continue to work; they simply won’t react to edge property updates.

This v0.6 spec is now the single canonical reference for graph change detection in the Regulatory Intelligence Copilot architecture.

