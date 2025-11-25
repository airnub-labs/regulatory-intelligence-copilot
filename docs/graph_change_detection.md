# Graph Change Detection Architecture

## Overview

The Graph Change Detection system provides real-time monitoring of the Memgraph regulatory knowledge graph and streams incremental updates to connected clients via Server-Sent Events (SSE).

**Per v0.3 architecture** (docs/architecture_v_0_3.md Section 9):
- Implements incremental graph patches for WebSocket/SSE streaming
- Supports jurisdiction and profile filtering
- Enables scalable, responsive graph visualization

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                        SSE Clients                           │
│                  (GraphVisualization UI)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ SSE Connection
                      │ (graph patches)
┌─────────────────────▼───────────────────────────────────────┐
│            GET /api/graph/stream                             │
│         (Next.js API Route Handler)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ Subscribe
                      │
┌─────────────────────▼───────────────────────────────────────┐
│          GraphChangeDetector (Singleton)                     │
│  - Maintains snapshots per filter                            │
│  - Polls Memgraph periodically                               │
│  - Computes diffs                                            │
│  - Notifies subscribers                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ Query
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  GraphClient                                 │
│         (Queries Memgraph via MCP)                           │
└─────────────────────┬───────────────────────────────────────┘
                      │ Cypher
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Memgraph                                  │
│           (Regulatory Knowledge Graph)                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Classes

#### `GraphChangeDetector`

**Location:** `packages/compliance-core/src/graph/graphChangeDetector.ts`

**Responsibilities:**
- Maintain graph snapshots for each active filter (jurisdiction + profile)
- Poll Memgraph at configurable intervals (default: 5 seconds)
- Compute diffs between snapshots
- Emit `GraphPatch` events to subscribed clients
- Manage subscription lifecycle

**Key Methods:**
```typescript
class GraphChangeDetector {
  constructor(
    graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>,
    pollIntervalMs?: number
  )

  start(): void
  stop(): void
  subscribe(filter: ChangeFilter, callback: ChangeCallback): ChangeSubscription
  getSubscriptionCount(): number
}
```

#### `getGraphChangeDetector()` (Singleton)

**Location:** `apps/demo-web/src/lib/graphChangeDetectorInstance.ts`

**Responsibilities:**
- Create and manage a single shared `GraphChangeDetector` instance
- Configure the graph query function
- Auto-start polling on first access
- Handle cleanup on process exit

**Usage:**
```typescript
const detector = getGraphChangeDetector();
const subscription = detector.subscribe(
  { jurisdictions: ['IE'], profileType: 'single-director' },
  (patch) => {
    // Handle patch
  }
);
```

### Data Structures

#### `GraphPatch`

Represents an incremental change to the graph:

```typescript
interface GraphPatch {
  type: 'graph_patch';
  timestamp: string;
  nodes_added?: GraphNode[];
  nodes_updated?: GraphNode[];
  nodes_removed?: string[]; // Node IDs
  edges_added?: GraphEdge[];
  edges_removed?: GraphEdge[];
}
```

#### `ChangeFilter`

Specifies filtering criteria for change detection:

```typescript
interface ChangeFilter {
  jurisdictions?: string[];  // e.g., ['IE', 'UK']
  profileType?: string;      // e.g., 'single-director'
}
```

## Implementation Strategy

### 1. Polling-Based Change Detection

**Why Polling?**
- Simple to implement and understand
- No special Memgraph configuration required
- Works reliably across different Memgraph versions
- Easy to adjust polling frequency based on load

**How It Works:**
1. For each active filter, maintain a snapshot: `Map<nodeId, GraphNode>`
2. Every N seconds, query Memgraph for current state
3. Compute diff: added, updated, removed nodes and edges
4. Emit non-empty patches to subscribers

**Polling Interval:**
- Default: 5000ms (5 seconds)
- Configurable via `GraphChangeDetector` constructor
- Trade-off: Lower interval = more responsive, higher load

### 2. Snapshot Comparison

**Algorithm:**
```typescript
function computeDiff(oldSnapshot, newSnapshot): GraphPatch {
  // Nodes
  for (newNode in newSnapshot.nodes) {
    if (!oldSnapshot.nodes.has(newNode.id))
      → nodes_added.push(newNode)
    else if (nodeHasChanged(oldNode, newNode))
      → nodes_updated.push(newNode)
  }

  for (oldNode in oldSnapshot.nodes) {
    if (!newSnapshot.nodes.has(oldNode.id))
      → nodes_removed.push(oldNode.id)
  }

  // Edges (similar logic)
  // ...

  return patch
}
```

**Change Detection:**
- Nodes: Compare properties via JSON serialization
- Edges: Compare by `source:type:target` key
- Efficient: O(n) where n = number of nodes/edges in scope

### 3. Per-Filter Snapshots

**Why?**
- Different clients may request different jurisdictions/profiles
- Each filter produces a different subgraph
- Avoids sending irrelevant changes to clients

**Memory Management:**
- Snapshots created on first subscription
- Removed when last subscriber unsubscribes
- Bounded by number of unique filters (typically small)

## SSE Streaming

### Endpoint: `GET /api/graph/stream`

**Query Parameters:**
- `jurisdictions`: Comma-separated list (e.g., `IE,UK,EU`)
- `profileType`: Profile identifier (e.g., `single_director`)

**Event Format:**

1. **Connection Confirmation:**
```json
{
  "type": "connected",
  "timestamp": "2025-11-25T12:00:00Z",
  "message": "Graph stream connected"
}
```

2. **Graph Patches:**
```json
{
  "type": "graph_patch",
  "timestamp": "2025-11-25T12:00:05Z",
  "nodes_added": [
    {
      "id": "test-benefit-1234",
      "label": "New Benefit",
      "type": "Benefit",
      "properties": { ... }
    }
  ],
  "edges_added": [
    {
      "source": "benefit-1",
      "target": "jurisdiction-ie",
      "type": "IN_JURISDICTION"
    }
  ]
}
```

3. **Keep-Alive:**
```
: keepalive
```
Sent every 30 seconds to prevent connection timeout.

### Client Implementation

The `GraphVisualization` component (`apps/demo-web/src/components/GraphVisualization.tsx`) handles patches:

```typescript
const applyPatch = (patch: GraphPatch) => {
  // 1. Remove nodes and associated edges
  // 2. Add new nodes
  // 3. Update existing nodes
  // 4. Remove edges
  // 5. Add new edges
  setGraphData(updatedData);
};

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'graph_patch') {
    applyPatch(data);
  }
};
```

## Testing

### Test Utility: `test-graph-changes.ts`

**Location:** `scripts/test-graph-changes.ts`

**Purpose:** Simulate graph changes for development and testing without complex operations.

**Usage:**

```bash
# Run simulation (sequence of changes with delays)
pnpm test:changes:simulate

# Individual actions
pnpm test:changes:add        # Add a test node
pnpm test:changes:update     # Update a test node
pnpm test:changes:remove     # Remove a test node
```

**Test Workflow:**

1. **Start Memgraph:**
   ```bash
   cd docker
   docker-compose up memgraph memgraph-mcp
   ```

2. **Seed Initial Data:**
   ```bash
   pnpm seed:all
   ```

3. **Start Dev Server:**
   ```bash
   pnpm dev:web
   ```

4. **Open Graph UI:**
   Navigate to `http://localhost:3000/graph`

5. **Run Change Simulation:**
   ```bash
   pnpm test:changes:simulate
   ```

6. **Observe:** Watch the graph update in real-time as changes are detected and streamed.

### Verification

**Expected Behavior:**
- Initial snapshot loads with nodes from seeded data
- Status indicator shows "Live Updates" (green dot)
- Running `test:changes:simulate` triggers visible updates
- Node/edge counts update in the status panel
- Graph visualization updates without page reload
- Console logs show patch details

**Debugging:**

Server-side logs:
```
[GraphChangeDetector] Starting change detector (poll interval: 5000ms)
[GraphChangeDetector] New subscription for filter: IE:single-director
[GraphChangeDetector] Initialized snapshot for IE:single-director: 15 nodes, 23 edges
[GraphChangeDetector] Emitting patch for IE:single-director: { nodesAdded: 1, ... }
[API/graph/stream] Sent patch to client: { nodesAdded: 1, ... }
```

Client-side logs:
```
[GraphVisualization] SSE connected
[GraphVisualization] Stream connected: Graph stream connected
[GraphVisualization] Received patch: { type: 'graph_patch', ... }
```

## Performance Considerations

### Polling Frequency

**Trade-offs:**
- **Lower interval (e.g., 1s):** More responsive, higher CPU/network load
- **Higher interval (e.g., 10s):** Less responsive, lower load
- **Recommended:** 5s for development, adjust based on usage patterns

### Snapshot Size

**Per-filter snapshot memory:**
- Small subgraph (20 nodes): ~5-10 KB
- Medium subgraph (100 nodes): ~25-50 KB
- Large subgraph (500 nodes): ~125-250 KB

**Total memory:** `# unique filters × average snapshot size`

Typically: 5-10 filters × 25 KB = 125-250 KB (negligible)

### Diff Computation

**Complexity:** O(n) where n = nodes + edges in subgraph
**Typical:** < 1ms for 100-node subgraph

### SSE Bandwidth

**Per client per update:**
- Empty patch (no changes): ~100 bytes
- 1 node added: ~200-500 bytes (depends on properties)
- 10 nodes + 5 edges: ~2-5 KB

**Network impact:** Minimal for typical change frequencies

## Future Enhancements

### 1. Memgraph Triggers (Alternative to Polling)

**Approach:**
```cypher
CREATE TRIGGER on_node_change
ON CREATE, UPDATE, DELETE
BEFORE COMMIT
EXECUTE
  // Emit change event to pub/sub system
```

**Pros:**
- Real-time (no polling delay)
- Lower CPU overhead

**Cons:**
- Requires Memgraph Enterprise or custom triggers
- More complex setup
- Harder to filter/batch changes

### 2. Timestamp-Based Queries

**Optimization:** Add `updated_at` to all nodes/edges:

```cypher
MERGE (n:Benefit {id: $id})
SET n.updated_at = datetime()
```

Query only recent changes:
```cypher
MATCH (n)
WHERE n.updated_at > datetime($lastCheck)
RETURN n
```

**Benefits:**
- More efficient queries (index on `updated_at`)
- Avoid full snapshot comparison

**Implementation:** Update seeding scripts and agent upsert logic

### 3. Change Batching

**Optimization:** Batch multiple changes into single patch:
- Collect changes over a time window (e.g., 1 second)
- Emit single patch with all changes
- Reduces SSE message frequency

### 4. Compression

**For large patches:**
- Use gzip compression on SSE stream
- Reduce bandwidth for large change sets
- Minimal CPU overhead

### 5. Selective Subscriptions

**Granular filtering:**
```typescript
interface ChangeFilter {
  jurisdictions?: string[];
  profileType?: string;
  nodeTypes?: string[];      // e.g., ['Benefit', 'Relief']
  keywords?: string[];        // e.g., ['CGT', 'PRSI']
}
```

## Migration Path

### From Placeholder to Production

**Current state:** ✅ Implemented polling-based detection

**Next steps:**

1. **Production deployment:**
   - Monitor polling overhead in production
   - Adjust `pollIntervalMs` based on actual load
   - Consider increasing to 10-15s for lower load

2. **Timestamp optimization:**
   - Add `updated_at` fields to schema
   - Update seed scripts
   - Optimize queries to only fetch recent changes

3. **Memgraph triggers (optional):**
   - Evaluate Memgraph Enterprise
   - Implement trigger-based system if needed
   - Keep polling as fallback

## Related Documentation

- **Architecture:** `docs/architecture_v_0_3.md` (Section 9)
- **Graph Schema:** `docs/specs/graph_schema_v_0_3.md`
- **Seeding Scripts:** `scripts/seed-graph.ts`, `scripts/seed-special-jurisdictions.ts`
- **Test Utility:** `scripts/test-graph-changes.ts`

## API Reference

See:
- `packages/compliance-core/src/graph/graphChangeDetector.ts` (implementation)
- `apps/demo-web/src/lib/graphChangeDetectorInstance.ts` (singleton manager)
- `apps/demo-web/src/app/api/graph/stream/route.ts` (SSE endpoint)
- `apps/demo-web/src/components/GraphVisualization.tsx` (client integration)
