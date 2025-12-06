# GraphChangeDetector API Reference

**Version:** v0.3.1
**Package:** `@reg-copilot/compliance-core`
**Module:** `graph/graphChangeDetector`

## Table of Contents

- [Classes](#classes)
  - [GraphChangeDetector](#graphchangedetector)
- [Factory Functions](#factory-functions)
- [Interfaces](#interfaces)
- [Type Definitions](#type-definitions)
- [Constants](#constants)

---

## Classes

### GraphChangeDetector

Real-time graph change detection service that polls a graph data source and emits incremental patches to subscribers.

#### Constructor

```typescript
constructor(
  graphQueryFn: GraphQueryFunction,
  config?: GraphChangeDetectorConfig,
  timestampQueryFn?: TimestampQueryFunction
)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `graphQueryFn` | `GraphQueryFunction` | Yes | Function that queries the full graph for a given filter |
| `config` | `GraphChangeDetectorConfig` | No | Configuration options (default: see below) |
| `timestampQueryFn` | `TimestampQueryFunction` | No | Optional function for timestamp-based queries |

**Default Configuration:**

```typescript
{
  pollIntervalMs: 5000,
  useTimestamps: true,
  batchWindowMs: 1000,
  enableBatching: true
}
```

**Example:**

```typescript
import { GraphChangeDetector } from '@reg-copilot/compliance-core';

const detector = new GraphChangeDetector(
  async (filter) => {
    // Query your graph database
    return await graphClient.query(filter);
  },
  {
    pollIntervalMs: 5000,
    enableBatching: true
  }
);
```

#### Methods

##### start()

Starts the polling mechanism. Must be called before any change detection occurs.

```typescript
start(): void
```

**Example:**

```typescript
detector.start();
console.log('Change detection started');
```

**Notes:**
- Safe to call multiple times (no-op if already started)
- Polling begins immediately on first call
- Should be called before subscribing for immediate change detection

---

##### stop()

Stops the polling mechanism and cleans up all subscriptions.

```typescript
stop(): void
```

**Example:**

```typescript
detector.stop();
console.log('Change detection stopped');
```

**Notes:**
- Clears all snapshots and subscriptions
- Cancels pending batches
- Safe to call multiple times
- Can call `start()` again to resume

---

##### subscribe()

Subscribes to graph changes for a specific filter.

```typescript
subscribe(
  filter: ChangeFilter,
  callback: ChangeCallback
): ChangeSubscription
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | `ChangeFilter` | Filtering criteria (jurisdiction, profile type) |
| `callback` | `ChangeCallback` | Function called when patches are detected |

**Returns:** `ChangeSubscription` - Object with `unsubscribe()` method

**Example:**

```typescript
const subscription = detector.subscribe(
  {
    jurisdictions: ['IE', 'UK'],
    profileType: 'single-director'
  },
  (patch) => {
    console.log('Received patch:', patch);
    if (patch.nodes_added) {
      console.log(`Added ${patch.nodes_added.length} nodes`);
    }
  }
);

// Later, to unsubscribe:
subscription.unsubscribe();
```

**Notes:**
- Creates initial snapshot if first subscription for this filter
- Multiple subscriptions to the same filter share a single snapshot
- Callback is invoked synchronously when patches are emitted
- Snapshot is removed when last subscriber unsubscribes

---

##### getSubscriptionCount()

Returns the total number of active subscriptions across all filters.

```typescript
getSubscriptionCount(): number
```

**Returns:** `number` - Total subscription count

**Example:**

```typescript
const count = detector.getSubscriptionCount();
console.log(`Active subscriptions: ${count}`);
```

---

## Factory Functions

### createGraphChangeDetector()

Factory function that creates a configured `GraphChangeDetector` instance. Recommended over direct constructor usage.

```typescript
function createGraphChangeDetector(
  graphQueryFn: GraphQueryFunction,
  config?: GraphChangeDetectorConfig,
  timestampQueryFn?: TimestampQueryFunction
): GraphChangeDetector
```

**Parameters:** Same as `GraphChangeDetector` constructor

**Returns:** `GraphChangeDetector` instance

**Example:**

```typescript
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';

const detector = createGraphChangeDetector(
  queryFunction,
  { pollIntervalMs: 3000 }
);

detector.start();
```

---

## Interfaces

### GraphChangeDetectorConfig

Configuration options for the change detector.

```typescript
interface GraphChangeDetectorConfig {
  /** Polling interval in milliseconds (default: 5000) */
  pollIntervalMs?: number;

  /** Enable timestamp-based queries for efficiency (default: true) */
  useTimestamps?: boolean;

  /** Batching window in milliseconds (default: 1000) */
  batchWindowMs?: number;

  /** Enable change batching (default: true) */
  enableBatching?: boolean;
}
```

**Field Details:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `pollIntervalMs` | `number` | `5000` | How often to poll the graph (ms). Lower = more responsive, higher load |
| `useTimestamps` | `boolean` | `true` | Use timestamp-based queries if `timestampQueryFn` provided |
| `batchWindowMs` | `number` | `1000` | Time window for batching changes (ms). Only used if `enableBatching: true` |
| `enableBatching` | `boolean` | `true` | Batch multiple changes into single patches |

**Examples:**

```typescript
// High responsiveness
const config1: GraphChangeDetectorConfig = {
  pollIntervalMs: 2000,
  batchWindowMs: 500
};

// Low overhead
const config2: GraphChangeDetectorConfig = {
  pollIntervalMs: 10000,
  batchWindowMs: 2000
};

// No batching (immediate)
const config3: GraphChangeDetectorConfig = {
  pollIntervalMs: 5000,
  enableBatching: false
};
```

---

### ChangeFilter

Specifies filtering criteria for graph queries and subscriptions.

```typescript
interface ChangeFilter {
  /** List of jurisdiction IDs (e.g., ['IE', 'UK', 'EU']) */
  jurisdictions?: string[];

  /** Profile type identifier (e.g., 'single-director', 'company') */
  profileType?: string;
}
```

**Examples:**

```typescript
// Single jurisdiction, specific profile
const filter1: ChangeFilter = {
  jurisdictions: ['IE'],
  profileType: 'single-director'
};

// Multiple jurisdictions
const filter2: ChangeFilter = {
  jurisdictions: ['IE', 'UK', 'NI'],
  profileType: 'married-couple'
};

// No filter (all data)
const filter3: ChangeFilter = {};
```

**Notes:**
- Filters are normalized to a unique key for snapshot management
- Two filters with same values share the same snapshot
- Empty filter means no filtering (return all nodes)

---

### GraphPatch

Represents an incremental change to the graph.

```typescript
interface GraphPatch {
  /** Always 'graph_patch' */
  type: 'graph_patch';

  /** ISO 8601 timestamp of when patch was generated */
  timestamp: string;

  /** Nodes that were added to the graph */
  nodes_added?: GraphNode[];

  /** Nodes with updated properties */
  nodes_updated?: GraphNode[];

  /** IDs of nodes that were removed */
  nodes_removed?: string[];

  /** Edges that were added to the graph */
  edges_added?: GraphEdge[];

  /** Edges that were removed from the graph */
  edges_removed?: GraphEdge[];
}
```

**Example:**

```typescript
{
  type: 'graph_patch',
  timestamp: '2025-11-25T15:30:00.000Z',
  nodes_added: [
    {
      id: 'benefit-123',
      label: 'New Benefit',
      type: 'Benefit',
      properties: {
        description: 'A new benefit for single directors',
        created_at: '2025-11-25T15:30:00.000Z',
        updated_at: '2025-11-25T15:30:00.000Z'
      }
    }
  ],
  edges_added: [
    {
      source: 'benefit-123',
      target: 'jurisdiction-ie',
      type: 'IN_JURISDICTION'
    }
  ]
}
```

**Notes:**
- All fields except `type` and `timestamp` are optional
- Empty arrays are omitted (not included in patch)
- `nodes_removed` contains only IDs (not full objects)
- `edges_removed` contains full edge objects for identification

---

### GraphNode

Represents a node in the regulatory graph.

```typescript
interface GraphNode {
  /** Unique node identifier */
  id: string;

  /** Human-readable label */
  label: string;

  /** Node type (e.g., 'Benefit', 'Relief', 'Section', 'Jurisdiction') */
  type: string;

  /** Additional node properties */
  properties: Record<string, any>;
}
```

**Common Node Types:**
- `Benefit` - Social welfare benefits
- `Relief` - Tax reliefs
- `Section` - Legislative sections
- `Jurisdiction` - Geographic jurisdictions
- `ProfileTag` - User profile types

**Example:**

```typescript
const node: GraphNode = {
  id: 'benefit-jobseekers-benefit',
  label: "Jobseeker's Benefit",
  type: 'Benefit',
  properties: {
    description: 'Weekly payment for people who lost employment',
    payment_rate: 232.00,
    currency: 'EUR',
    duration_weeks: 39,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-11-25T15:30:00.000Z'
  }
};
```

---

### GraphEdge

Represents a directed edge between two nodes.

```typescript
interface GraphEdge {
  /** Source node ID */
  source: string;

  /** Target node ID */
  target: string;

  /** Relationship type */
  type: string;

  /** Optional edge properties */
  properties?: Record<string, any>;
}
```

**Common Edge Types:**
- `IN_JURISDICTION` - Node belongs to jurisdiction
- `APPLIES_TO` - Benefit/Relief applies to profile
- `CITES` - Node references another node
- `REQUIRES` - Node depends on another node
- `MUTUALLY_EXCLUSIVE_WITH` - Cannot be combined
- `LIMITED_BY` - Node is limited by another node
- `EXCLUDES` - Node excludes another node

**Example:**

```typescript
const edge: GraphEdge = {
  source: 'benefit-jobseekers-benefit',
  target: 'jurisdiction-ie',
  type: 'IN_JURISDICTION'
};

// Edge with properties
const edgeWithProps: GraphEdge = {
  source: 'benefit-maternity',
  target: 'benefit-jobseekers',
  type: 'MUTUALLY_EXCLUSIVE_WITH',
  properties: {
    reason: 'Cannot claim both simultaneously',
    regulation_ref: 'SI-2024-123'
  }
};
```

---

### GraphContext

Represents the complete state of a filtered graph subgraph.

```typescript
interface GraphContext {
  /** All nodes in this context */
  nodes: GraphNode[];

  /** All edges in this context */
  edges: GraphEdge[];
}
```

**Example:**

```typescript
const context: GraphContext = {
  nodes: [
    { id: 'node1', label: 'Node 1', type: 'Benefit', properties: {} },
    { id: 'node2', label: 'Node 2', type: 'Relief', properties: {} }
  ],
  edges: [
    { source: 'node1', target: 'node2', type: 'CITES' }
  ]
};
```

---

## Type Definitions

### GraphQueryFunction

Function that queries the full graph for a given filter.

```typescript
type GraphQueryFunction = (
  filter: ChangeFilter
) => Promise<GraphContext>;
```

**Example Implementation:**

```typescript
const queryFunction: GraphQueryFunction = async (filter) => {
  const { jurisdictions, profileType } = filter;

  // Build Cypher query
  const query = `
    MATCH (p:ProfileTag {id: $profileType})
    MATCH (j:Jurisdiction)
    WHERE j.id IN $jurisdictions
    MATCH (n)-[:IN_JURISDICTION]->(j)
    WHERE (n)-[:APPLIES_TO]->(p)
    OPTIONAL MATCH (n)-[r]->(m)
    RETURN n, collect(r) AS rels, collect(m) AS targets
  `;

  const result = await graphDb.execute(query, {
    profileType: profileType || 'single-director',
    jurisdictions: jurisdictions || ['IE']
  });

  return {
    nodes: parseNodes(result),
    edges: parseEdges(result)
  };
};
```

---

### TimestampQueryFunction

Function that queries only nodes/edges updated since a specific timestamp.

```typescript
type TimestampQueryFunction = (
  filter: ChangeFilter,
  since: Date
) => Promise<GraphContext>;
```

**Example Implementation:**

```typescript
const timestampQueryFn: TimestampQueryFunction = async (filter, since) => {
  const sinceIso = since.toISOString();

  const query = `
    MATCH (p:ProfileTag {id: $profileType})
    MATCH (j:Jurisdiction)
    WHERE j.id IN $jurisdictions
    MATCH (n)-[:IN_JURISDICTION]->(j)
    WHERE (n)-[:APPLIES_TO]->(p)
      AND n.updated_at >= datetime($since)
    OPTIONAL MATCH (n)-[r]->(m)
    RETURN n, collect(r) AS rels, collect(m) AS targets
  `;

  const result = await graphDb.execute(query, {
    profileType: filter.profileType || 'single-director',
    jurisdictions: filter.jurisdictions || ['IE'],
    since: sinceIso
  });

  return {
    nodes: parseNodes(result),
    edges: parseEdges(result)
  };
};
```

**Notes:**
- Only called if `useTimestamps: true` in config
- Falls back to full query if function not provided
- Should return only nodes/edges modified since `since`
- Significantly improves performance (80-95% reduction in query overhead)

---

### ChangeCallback

Function called when a graph patch is detected.

```typescript
type ChangeCallback = (patch: GraphPatch) => void;
```

**Example:**

```typescript
const callback: ChangeCallback = (patch) => {
  console.log(`Received patch at ${patch.timestamp}`);

  if (patch.nodes_added && patch.nodes_added.length > 0) {
    console.log(`Added ${patch.nodes_added.length} nodes`);
    patch.nodes_added.forEach(node => {
      console.log(`  - ${node.label} (${node.type})`);
    });
  }

  if (patch.nodes_updated && patch.nodes_updated.length > 0) {
    console.log(`Updated ${patch.nodes_updated.length} nodes`);
  }

  if (patch.nodes_removed && patch.nodes_removed.length > 0) {
    console.log(`Removed ${patch.nodes_removed.length} nodes`);
  }
};

detector.subscribe(filter, callback);
```

---

### ChangeSubscription

Object returned from `subscribe()` that allows unsubscribing.

```typescript
interface ChangeSubscription {
  /** Unsubscribe from change notifications */
  unsubscribe: () => void;
}
```

**Example:**

```typescript
const subscription = detector.subscribe(filter, callback);

// Later...
subscription.unsubscribe();
console.log('Unsubscribed from changes');
```

**Notes:**
- Safe to call `unsubscribe()` multiple times
- Automatically cleans up snapshot if last subscriber
- Should always be called to prevent memory leaks

---

## Constants

### Default Values

```typescript
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_BATCH_WINDOW_MS = 1000;
const DEFAULT_USE_TIMESTAMPS = true;
const DEFAULT_ENABLE_BATCHING = true;
```

---

## Usage Patterns

### Basic Usage

```typescript
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';

// Create detector
const detector = createGraphChangeDetector(async (filter) => {
  return await queryGraph(filter);
});

// Start polling
detector.start();

// Subscribe to changes
const subscription = detector.subscribe(
  { jurisdictions: ['IE'], profileType: 'single-director' },
  (patch) => {
    console.log('Graph changed:', patch);
  }
);

// Clean up
subscription.unsubscribe();
detector.stop();
```

### Advanced Usage with Timestamps

```typescript
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';

const detector = createGraphChangeDetector(
  // Full query function
  async (filter) => {
    return await queryFullGraph(filter);
  },
  // Config
  {
    pollIntervalMs: 3000,
    useTimestamps: true,
    enableBatching: true,
    batchWindowMs: 500
  },
  // Timestamp query function
  async (filter, since) => {
    return await queryGraphSince(filter, since);
  }
);

detector.start();

const sub = detector.subscribe(myFilter, (patch) => {
  applyPatchToUI(patch);
});
```

### Multiple Subscriptions

```typescript
// Different filters, different callbacks
const sub1 = detector.subscribe(
  { jurisdictions: ['IE'], profileType: 'single-director' },
  (patch) => console.log('IE single-director patch:', patch)
);

const sub2 = detector.subscribe(
  { jurisdictions: ['UK'], profileType: 'married-couple' },
  (patch) => console.log('UK married-couple patch:', patch)
);

// Same filter, different callbacks (share snapshot)
const sub3 = detector.subscribe(
  { jurisdictions: ['IE'], profileType: 'single-director' },
  (patch) => logToAnalytics(patch)
);

// Clean up
sub1.unsubscribe();
sub2.unsubscribe();
sub3.unsubscribe();
```

---

## Error Handling

The detector handles errors gracefully:

```typescript
// Query function errors are caught and logged
const detector = createGraphChangeDetector(async (filter) => {
  try {
    return await queryGraph(filter);
  } catch (error) {
    console.error('Query failed:', error);
    // Return empty context on error
    return { nodes: [], edges: [] };
  }
});

// Callback errors don't crash the detector
detector.subscribe(filter, (patch) => {
  try {
    processPatchwith(patch);
  } catch (error) {
    console.error('Patch processing failed:', error);
  }
});
```

---

## Performance Considerations

### Polling Interval

- **2-3s:** High responsiveness, higher load (development)
- **5s (default):** Good balance (production)
- **10-15s:** Lower load, less responsive (low-priority updates)

### Batching Window

- **100-500ms:** Minimal latency, fewer savings
- **1000ms (default):** Good balance
- **2-5s:** Maximum batching, higher latency

### Memory Usage

Per active filter:
- Snapshot: ~25-50 KB (100 nodes)
- Overhead: ~500 bytes
- Total: Minimal (<1 MB for 10 filters)

---

## Related Documentation

- [Architecture Overview](../architecture/graph/change_detection_v_0_6.md)
- [Enhancement Details](../architecture/graph/archive/change_detection_enhancements_v_0_3_1.md)
- [Usage Guide](./graph_change_detector_usage.md)
- [Testing Guide](./graph_change_detector_testing.md)
- [Performance Guide](./graph_change_detector_performance.md)

---

**Last Updated:** 2025-11-25
**Version:** v0.3.1
**Maintainer:** Regulatory Intelligence Copilot Team
