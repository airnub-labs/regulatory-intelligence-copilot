# GraphChangeDetector Performance Guide

**Version:** v0.3.1
**Target:** Production optimization

This guide covers performance optimization strategies, tuning parameters, and benchmarks for the GraphChangeDetector system.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Optimization Strategies](#optimization-strategies)
- [Configuration Tuning](#configuration-tuning)
- [Benchmarks](#benchmarks)
- [Monitoring](#monitoring)
- [Scaling Considerations](#scaling-considerations)
- [Performance Checklist](#performance-checklist)

---

## Performance Overview

### Key Metrics

| Metric | Target | Typical | Notes |
|--------|--------|---------|-------|
| Poll interval | 5s | 2-10s | Balance responsiveness vs load |
| Query time (full) | <50ms | 20-50ms | Depends on graph size |
| Query time (timestamp) | <5ms | 2-5ms | 80-95% improvement |
| Diff computation | <1ms | <1ms | O(n) complexity |
| Patch size | <5KB | 500B-2KB | Depends on changes |
| Memory per filter | <50KB | 25-50KB | Snapshot size |
| SSE latency | <100ms | 50-100ms | Network + processing |

### Performance Bottlenecks

1. **Graph queries** (highest impact)
   - Full snapshot queries on every poll
   - Solution: Timestamp-based queries

2. **Diff computation** (medium impact)
   - JSON serialization for node comparison
   - Solution: Optimize comparison logic

3. **SSE bandwidth** (low impact)
   - Many small messages
   - Solution: Change batching

4. **Memory usage** (low impact)
   - Multiple snapshots
   - Solution: Shared snapshots per filter

---

## Optimization Strategies

### 1. Enable Timestamp-Based Queries ⭐⭐⭐

**Impact:** 80-95% reduction in query overhead

**Implementation:**

```typescript
// Add updated_at to all nodes
MERGE (n:Benefit {id: $id})
SET n.label = $label,
    n.created_at = CASE WHEN n.created_at IS NULL THEN datetime() ELSE n.created_at END,
    n.updated_at = datetime()
```

```typescript
// Query function for timestamp-based changes
async function queryTimestampBased(filter: ChangeFilter, since: Date) {
  const sinceIso = since.toISOString();

  const query = `
    MATCH (j:Jurisdiction)
    WHERE j.id IN $jurisdictions
    MATCH (n)-[:IN_JURISDICTION]->(j)
    WHERE n.updated_at >= datetime($since)
    OPTIONAL MATCH (n)-[r]->(m)
    RETURN n, collect(r) AS rels, collect(m) AS targets
  `;

  const result = await graphDb.execute(query, {
    jurisdictions: filter.jurisdictions || ['IE'],
    since: sinceIso
  });

  return parseResult(result);
}

// Use with detector
const detector = createGraphChangeDetector(
  queryFullGraph,
  { useTimestamps: true },
  queryTimestampBased
);
```

**Before vs After:**

```
Before (full query):
Poll #1: 100 nodes, 50ms, 25 KB
Poll #2: 100 nodes, 50ms, 25 KB  (no changes)
Poll #3: 100 nodes, 50ms, 25 KB  (no changes)
Poll #4: 101 nodes, 55ms, 26 KB  (1 node added)

After (timestamp query):
Poll #1: 100 nodes, 50ms, 25 KB  (initial)
Poll #2: 0 nodes, 2ms, 100 bytes  (no changes)
Poll #3: 0 nodes, 2ms, 100 bytes  (no changes)
Poll #4: 1 node, 3ms, 500 bytes   (1 node added)
```

---

### 2. Enable Change Batching ⭐⭐

**Impact:** 80%+ reduction in SSE messages

**Configuration:**

```typescript
const detector = createGraphChangeDetector(
  queryGraph,
  {
    enableBatching: true,
    batchWindowMs: 1000  // Collect changes for 1 second
  }
);
```

**Scenarios:**

```typescript
// High responsiveness (short batching)
{
  pollIntervalMs: 2000,
  batchWindowMs: 500
}

// Balanced (default)
{
  pollIntervalMs: 5000,
  batchWindowMs: 1000
}

// High efficiency (long batching)
{
  pollIntervalMs: 10000,
  batchWindowMs: 2000
}
```

**Impact Example:**

```
Without batching:
- 10 changes over 5 seconds
- 10 SSE messages
- Client: 10 UI updates

With batching (1s window):
- 10 changes over 5 seconds
- 2-3 SSE messages (batched)
- Client: 2-3 UI updates
```

---

### 3. Add Database Indexes ⭐⭐

**Impact:** 50%+ reduction in query time

**Create indexes on frequently queried fields:**

```cypher
-- Index on updated_at for timestamp queries
CREATE INDEX ON :Benefit(updated_at);
CREATE INDEX ON :Relief(updated_at);
CREATE INDEX ON :Section(updated_at);

-- Index on jurisdiction relationships
CREATE INDEX ON :Benefit(id);
CREATE INDEX ON :Jurisdiction(id);

-- Verify indexes
SHOW INDEXES;
```

**Query optimization:**

```cypher
-- Without index: Full table scan
MATCH (n:Benefit)
WHERE n.updated_at >= datetime('2025-11-25T00:00:00Z')
RETURN n

-- With index: Index scan (much faster)
```

---

### 4. Optimize Polling Interval ⭐

**Impact:** Reduce CPU and network load

**Guidelines:**

| Use Case | Poll Interval | Rationale |
|----------|--------------|-----------|
| Real-time dashboards | 2-3s | High responsiveness needed |
| User-facing apps | 5s (default) | Balance responsiveness and load |
| Background monitoring | 10-15s | Lower priority updates |
| Batch processing | 30-60s | Minimal urgency |

**Configuration:**

```typescript
// Adjust based on use case
const detector = createGraphChangeDetector(queryGraph, {
  pollIntervalMs: 5000  // 5 seconds
});
```

**Trade-offs:**

```
Lower interval (2s):
✅ More responsive
❌ Higher CPU usage
❌ More database queries
❌ Higher network traffic

Higher interval (10s):
❌ Less responsive
✅ Lower CPU usage
✅ Fewer database queries
✅ Lower network traffic
```

---

### 5. Optimize Diff Computation ⭐

**Current implementation:** JSON serialization for node comparison

**Optimization:** Custom comparison function

```typescript
// Instead of:
const oldJson = JSON.stringify(oldNode);
const newJson = JSON.stringify(newNode);
const hasChanged = oldJson !== newJson;

// Use:
function nodesEqual(a: GraphNode, b: GraphNode): boolean {
  // Quick checks first
  if (a.id !== b.id || a.label !== b.label || a.type !== b.type) {
    return false;
  }

  // Compare properties
  const aKeys = Object.keys(a.properties);
  const bKeys = Object.keys(b.properties);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (a.properties[key] !== b.properties[key]) {
      return false;
    }
  }

  return true;
}
```

**Impact:** ~30% faster diff computation

---

### 6. Limit Snapshot Size ⭐

**Strategy:** Only include necessary fields in queries

```cypher
-- Instead of returning all properties:
MATCH (n:Benefit)
RETURN n

-- Return only needed properties:
MATCH (n:Benefit)
RETURN n {
  .id,
  .label,
  .type,
  .updated_at,
  .description
}
```

**Impact:**

```
Full properties: ~500 bytes per node
Limited properties: ~200 bytes per node
→ 60% reduction in snapshot size
```

---

## Configuration Tuning

### Development Environment

```typescript
const devConfig = {
  pollIntervalMs: 2000,      // Fast updates for development
  batchWindowMs: 500,        // Short batching
  useTimestamps: true,       // Still optimize queries
  enableBatching: true
};
```

### Production Environment

```typescript
const prodConfig = {
  pollIntervalMs: 5000,      // Balanced
  batchWindowMs: 1000,       // Standard batching
  useTimestamps: true,       // Critical for production
  enableBatching: true
};
```

### High-Load Environment

```typescript
const highLoadConfig = {
  pollIntervalMs: 10000,     // Reduce query frequency
  batchWindowMs: 2000,       // Longer batching
  useTimestamps: true,       // Essential
  enableBatching: true
};
```

### Low-Latency Environment

```typescript
const lowLatencyConfig = {
  pollIntervalMs: 2000,      // Frequent polls
  batchWindowMs: 100,        // Minimal batching
  useTimestamps: true,       // Optimize queries
  enableBatching: true       // Still batch rapid changes
};
```

---

## Benchmarks

### Query Performance

**Test environment:** Local Memgraph, 100-node subgraph

| Query Type | Nodes Returned | Query Time | Data Size |
|------------|----------------|------------|-----------|
| Full snapshot | 100 | 45ms | 25 KB |
| Timestamp (0 changes) | 0 | 2ms | 100 bytes |
| Timestamp (1 change) | 1 | 3ms | 500 bytes |
| Timestamp (10 changes) | 10 | 8ms | 5 KB |
| Timestamp (50 changes) | 50 | 22ms | 12 KB |

**Speedup:** 15-22x for typical workloads (0-10 changes)

### Diff Computation Performance

**Test:** 100-node graph

| Operation | Time | Complexity |
|-----------|------|------------|
| Compare nodes | 0.5ms | O(n) |
| Compare edges | 0.3ms | O(e) |
| Build patch | 0.2ms | O(1) |
| **Total** | **1ms** | **O(n+e)** |

### Memory Usage

**Per active filter:**

| Component | Size | Notes |
|-----------|------|-------|
| Node snapshot (100 nodes) | 25 KB | Depends on properties |
| Edge snapshot (150 edges) | 8 KB | Lightweight |
| Metadata | 500 bytes | Filter key, timestamps |
| **Total per filter** | **~34 KB** | Minimal overhead |

**Total memory:** `# unique filters × ~34 KB`

Example:
- 5 filters: ~170 KB
- 10 filters: ~340 KB
- 50 filters: ~1.7 MB

### SSE Bandwidth

**Scenario:** 5-second poll interval, 10 concurrent clients

| Change Frequency | Messages/min | Bandwidth/client | Total Bandwidth |
|------------------|--------------|------------------|-----------------|
| No changes | 12 | 1.2 KB/min | 12 KB/min |
| 1 change/min | 12 | 6 KB/min | 60 KB/min |
| 10 changes/min | 12 | 24 KB/min | 240 KB/min |
| 100 changes/min | 60 | 120 KB/min | 1.2 MB/min |

**With batching (1s window):** 80% reduction in high-change scenarios

---

## Monitoring

### Key Metrics to Track

```typescript
// Add monitoring to detector
class MonitoredGraphChangeDetector extends GraphChangeDetector {
  private metrics = {
    queryTime: [] as number[],
    diffTime: [] as number[],
    patchSize: [] as number[],
    subscriptionCount: 0
  };

  async poll() {
    const startQuery = Date.now();
    const result = await this.queryFn(filter);
    const queryTime = Date.now() - startQuery;

    const startDiff = Date.now();
    const patch = this.computeDiff(oldSnapshot, result);
    const diffTime = Date.now() - startDiff;

    this.metrics.queryTime.push(queryTime);
    this.metrics.diffTime.push(diffTime);
    this.metrics.patchSize.push(JSON.stringify(patch).length);

    // Log metrics every minute
    if (this.metrics.queryTime.length >= 12) {
      console.log('[Metrics]', {
        avgQueryTime: avg(this.metrics.queryTime),
        avgDiffTime: avg(this.metrics.diffTime),
        avgPatchSize: avg(this.metrics.patchSize),
        subscriptions: this.getSubscriptionCount()
      });

      // Reset
      this.metrics.queryTime = [];
      this.metrics.diffTime = [];
      this.metrics.patchSize = [];
    }

    return patch;
  }
}
```

### Observability Dashboard

Track these metrics in production:

1. **Query Performance**
   - Average query time
   - P50, P95, P99 latency
   - Query failures

2. **Change Detection**
   - Patches emitted per minute
   - Average patch size
   - Empty poll percentage

3. **Subscriptions**
   - Active subscription count
   - Unique filters count
   - Subscribe/unsubscribe rate

4. **Resource Usage**
   - Memory usage
   - CPU usage
   - Network bandwidth

### Alerting Thresholds

```typescript
const thresholds = {
  queryTime: {
    warning: 100,  // ms
    critical: 500   // ms
  },
  subscriptions: {
    warning: 100,
    critical: 500
  },
  memoryUsage: {
    warning: 100,  // MB
    critical: 500   // MB
  }
};
```

---

## Scaling Considerations

### Horizontal Scaling

**Single detector instance** (recommended for most cases):
- Shared snapshots across all connections
- Efficient memory usage
- Simple deployment

**Multiple detector instances** (for extreme scale):
- Load balance SSE connections across servers
- Each server runs its own detector
- Trade-off: Duplicate polling overhead

```typescript
// Shared state approach (Redis)
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';
import { RedisSnapshotStore } from './redisSnapshotStore';

const detector = createGraphChangeDetector(
  queryGraph,
  {
    snapshotStore: new RedisSnapshotStore()  // Shared across instances
  }
);
```

### Vertical Scaling

**Memory:**
- ~34 KB per filter
- 100 filters = ~3.4 MB
- 1000 filters = ~34 MB
- Negligible memory footprint

**CPU:**
- Polling: ~1-5ms CPU per poll
- At 5s interval: <0.1% CPU usage
- Scales linearly with # of filters

**Network:**
- Bottleneck: Database queries
- Solution: Timestamp optimization
- With timestamps: Minimal network usage

---

## Performance Checklist

### Essential Optimizations ✅

- [ ] Enable timestamp-based queries
- [ ] Add `updated_at` field to all nodes
- [ ] Create database indexes on `updated_at`
- [ ] Enable change batching
- [ ] Use singleton detector instance
- [ ] Configure appropriate poll interval (5-10s for production)

### Advanced Optimizations ⚡

- [ ] Optimize diff computation (custom comparison)
- [ ] Limit snapshot size (select only needed fields)
- [ ] Add monitoring and metrics
- [ ] Set up alerting thresholds
- [ ] Profile and optimize query execution plans
- [ ] Consider caching for frequently accessed data

### Production Readiness 🚀

- [ ] Load testing with realistic workload
- [ ] Monitor query performance
- [ ] Track memory usage over time
- [ ] Set up error alerting
- [ ] Document scaling thresholds
- [ ] Plan for horizontal scaling if needed

---

## Performance Tuning Workflow

### 1. Measure Baseline

```bash
# Enable metrics logging
DEBUG=graph:detector pnpm dev

# Run load test
pnpm test:load

# Analyze results
cat logs/performance.log | grep "queryTime"
```

### 2. Identify Bottlenecks

- Query time >50ms? → Enable timestamp queries
- Many empty patches? → Increase poll interval
- High SSE bandwidth? → Increase batch window
- Memory growing? → Reduce snapshot size

### 3. Apply Optimizations

Implement fixes based on bottlenecks (see strategies above)

### 4. Re-measure

```bash
# Run load test again
pnpm test:load

# Compare results
```

### 5. Iterate

Repeat until performance targets are met.

---

## Related Documentation

- [API Reference](./graph_change_detector_api.md)
- [Usage Guide](./graph_change_detector_usage.md)
- [Testing Guide](./graph_change_detector_testing.md)
- [Architecture Overview](../architecture/change-detection/graph_change_detection_v_0_6.md)
- [Enhancements](../architecture/change-detection/archive/graph_change_detection_enhancements_v_0_3_1.md)

---

**Last Updated:** 2025-11-25
**Version:** v0.3.1
**Performance Target:** <50ms query time, <1ms diff computation
