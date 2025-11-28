# GraphChangeDetector Troubleshooting Guide

**Version:** v0.3.1
**Last Updated:** 2025-11-25

This guide helps you diagnose and resolve common issues with the GraphChangeDetector system.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues](#common-issues)
- [Connection Problems](#connection-problems)
- [Performance Issues](#performance-issues)
- [Data Consistency Issues](#data-consistency-issues)
- [Debugging Tools](#debugging-tools)
- [Getting Help](#getting-help)

---

## Quick Diagnostics

### Check System Health

```bash
# 1. Verify services are running
docker ps | grep memgraph

# 2. Check database connection
curl http://localhost:7687

# 3. Test API endpoint
curl http://localhost:3000/api/graph/stream

# 4. Check logs
tail -f logs/detector.log
```

### Enable Debug Logging

```typescript
// Add to your environment or code
process.env.DEBUG = 'graph:detector,graph:query';

// The detector will output detailed logs
[graph:detector] Starting change detector (poll interval: 5000ms)
[graph:detector] New subscription for filter: IE:single-director
[graph:query] Executing query: MATCH (n)...
```

---

## Common Issues

### Issue 1: No Patches Received

**Symptoms:**
- SSE connection established
- No patches received despite database changes
- Callback never called

**Possible Causes & Solutions:**

#### Cause 1: Detector Not Started

```typescript
// ❌ Bad: Forgot to start
const detector = createGraphChangeDetector(queryFn);
detector.subscribe(filter, callback);  // Won't work!

// ✅ Good: Start before subscribing
const detector = createGraphChangeDetector(queryFn);
detector.start();  // Start polling
detector.subscribe(filter, callback);
```

#### Cause 2: Query Function Returns Empty Results

```typescript
// Debug your query function
async function queryGraph(filter: ChangeFilter) {
  console.log('[Query] Filter:', filter);
  const result = await graphDb.query(filter);
  console.log('[Query] Result:', result.nodes.length, 'nodes');
  return result;
}
```

**Expected output:**
```
[Query] Filter: { jurisdictions: ['IE'], profileType: 'single-director' }
[Query] Result: 15 nodes
```

**If 0 nodes:**
- Check database has data: `MATCH (n) RETURN count(n)`
- Verify filter matches data in database
- Check query logic

#### Cause 3: Changes Outside Filtered Scope

```typescript
// You're watching Ireland
detector.subscribe(
  { jurisdictions: ['IE'], profileType: 'single-director' },
  callback
);

// But changes are happening in UK
// INSERT INTO UK data...

// Solution: Subscribe to correct filter
detector.subscribe(
  { jurisdictions: ['UK'], profileType: 'single-director' },
  callback
);
```

#### Cause 4: Batching Delay

```typescript
// Changes happened, but waiting for batch window
const detector = createGraphChangeDetector(queryFn, {
  batchWindowMs: 1000  // Wait up to 1 second
});

// Solution: Wait for batch window or disable batching
const detector = createGraphChangeDetector(queryFn, {
  enableBatching: false  // Emit immediately
});
```

---

### Issue 2: Patches Delayed

**Symptoms:**
- Patches received, but with significant delay (>10 seconds)

**Possible Causes & Solutions:**

#### Cause 1: Long Poll Interval

```typescript
// Check your configuration
const detector = createGraphChangeDetector(queryFn, {
  pollIntervalMs: 30000  // 30 seconds! Too long
});

// Solution: Reduce poll interval
const detector = createGraphChangeDetector(queryFn, {
  pollIntervalMs: 5000  // 5 seconds (default)
});
```

#### Cause 2: Slow Queries

```bash
# Check query performance in database logs
EXPLAIN MATCH (n) WHERE n.updated_at >= datetime('2025-11-25')
```

**Solutions:**
- Add indexes (see [Performance Guide](./graph_change_detector_performance.md))
- Enable timestamp queries
- Optimize query logic

#### Cause 3: Batching Window Too Long

```typescript
const detector = createGraphChangeDetector(queryFn, {
  batchWindowMs: 5000  // 5 seconds is too long
});

// Solution: Reduce batch window
const detector = createGraphChangeDetector(queryFn, {
  batchWindowMs: 1000  // 1 second (default)
});
```

---

### Issue 3: Duplicate Patches

**Symptoms:**
- Same changes reported multiple times
- Nodes appear to be added twice

**Possible Causes & Solutions:**

#### Cause 1: Multiple Detector Instances

```typescript
// ❌ Bad: Creating multiple detectors
function handleRequest() {
  const detector = createGraphChangeDetector(queryFn);  // NEW INSTANCE!
  detector.start();
  detector.subscribe(filter, callback);
}

// ✅ Good: Use singleton pattern
let detectorInstance: GraphChangeDetector | null = null;

function getDetector() {
  if (!detectorInstance) {
    detectorInstance = createGraphChangeDetector(queryFn);
    detectorInstance.start();
  }
  return detectorInstance;
}
```

#### Cause 2: Not Clearing Snapshots

```typescript
// Make sure to unsubscribe when done
const subscription = detector.subscribe(filter, callback);

// When component unmounts or connection closes
subscription.unsubscribe();
```

---

### Issue 4: Memory Leak

**Symptoms:**
- Memory usage grows over time
- Application becomes slow
- Eventually crashes

**Possible Causes & Solutions:**

#### Cause 1: Not Unsubscribing

```typescript
// ❌ Bad: Subscriptions never cleaned up
function watchChanges() {
  detector.subscribe(filter, callback);
  // Function exits, but subscription remains!
}

// ✅ Good: Always unsubscribe
function watchChanges() {
  const subscription = detector.subscribe(filter, callback);

  return () => {
    subscription.unsubscribe();  // Clean up
  };
}
```

#### Cause 2: Accumulating Snapshots

```typescript
// Debug: Check subscription count
console.log('Subscriptions:', detector.getSubscriptionCount());

// If count keeps growing, you have a leak
// Solution: Find where subscriptions aren't being cleaned up
```

#### Cause 3: Large Snapshots

```typescript
// Limit properties in query
MATCH (n:Benefit)
RETURN n {
  .id,
  .label,
  .type,
  .updated_at
  // Don't include huge description fields
}
```

---

### Issue 5: High CPU Usage

**Symptoms:**
- CPU usage consistently high (>50%)
- Server becomes unresponsive

**Possible Causes & Solutions:**

#### Cause 1: Poll Interval Too Low

```typescript
// Check configuration
const detector = createGraphChangeDetector(queryFn, {
  pollIntervalMs: 500  // Polling twice per second!
});

// Solution: Increase interval
const detector = createGraphChangeDetector(queryFn, {
  pollIntervalMs: 5000  // Poll every 5 seconds
});
```

#### Cause 2: Not Using Timestamp Queries

```typescript
// Every poll queries entire graph
const detector = createGraphChangeDetector(fullQueryFn);

// Solution: Enable timestamp optimization
const detector = createGraphChangeDetector(
  fullQueryFn,
  { useTimestamps: true },
  timestampQueryFn  // Query only recent changes
);
```

#### Cause 3: Heavy Diff Computation

```typescript
// Check if you have very large graphs
console.log('Nodes in snapshot:', snapshot.nodes.size);

// If >1000 nodes per filter:
// - Split into smaller filters
// - Optimize query to return less data
// - Add pagination
```

---

## Connection Problems

### SSE Connection Fails

**Symptoms:**
- EventSource error event
- "Failed to connect" in browser console

**Debugging Steps:**

```javascript
// Client-side debugging
const eventSource = new EventSource('/api/graph/stream');

eventSource.addEventListener('open', () => {
  console.log('[SSE] Connection opened');
});

eventSource.addEventListener('error', (error) => {
  console.error('[SSE] Connection error:', error);
  console.log('[SSE] ReadyState:', eventSource.readyState);
  // CONNECTING = 0, OPEN = 1, CLOSED = 2
});

eventSource.addEventListener('message', (event) => {
  console.log('[SSE] Message:', event.data);
});
```

**Common Causes:**

1. **API endpoint not running**
   ```bash
   # Check server is running
   curl http://localhost:3000/api/graph/stream
   ```

2. **CORS issues**
   ```typescript
   // Add CORS headers to API route
   return new Response(stream, {
     headers: {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive',
       'Access-Control-Allow-Origin': '*'  // For development
     }
   });
   ```

3. **Proxy/load balancer timeout**
   ```nginx
   # Nginx config
   location /api/graph/stream {
     proxy_pass http://backend;
     proxy_read_timeout 300s;  # Increase timeout
     proxy_buffering off;      # Disable buffering for SSE
   }
   ```

### SSE Connection Drops

**Symptoms:**
- Connection established, then closes after few seconds/minutes

**Solutions:**

```typescript
// Add keep-alive ping
const keepAliveInterval = setInterval(() => {
  try {
    controller.enqueue(encoder.encode(': keepalive\n\n'));
  } catch (error) {
    clearInterval(keepAliveInterval);
  }
}, 30000);  // Every 30 seconds

// Auto-reconnect on client
const eventSource = new EventSource('/api/graph/stream');

eventSource.addEventListener('error', () => {
  if (eventSource.readyState === EventSource.CLOSED) {
    // Reconnect after delay
    setTimeout(() => {
      connectToStream();
    }, 5000);
  }
});
```

---

## Performance Issues

### Slow Queries

**Diagnosis:**

```typescript
// Add timing to query function
async function queryGraph(filter: ChangeFilter) {
  const start = Date.now();
  const result = await graphDb.query(filter);
  const duration = Date.now() - start;

  console.log(`[Query] Took ${duration}ms for ${result.nodes.length} nodes`);

  if (duration > 100) {
    console.warn('[Query] Slow query detected!');
  }

  return result;
}
```

**Solutions:**

1. **Add database indexes**
   ```cypher
   CREATE INDEX ON :Benefit(updated_at);
   CREATE INDEX ON :Benefit(id);
   ```

2. **Enable timestamp queries**
   ```typescript
   const detector = createGraphChangeDetector(
     fullQuery,
     { useTimestamps: true },
     timestampQuery
   );
   ```

3. **Optimize query**
   ```cypher
   -- Instead of:
   MATCH (n)
   WHERE n.updated_at >= datetime($since)
   RETURN n

   -- Use:
   MATCH (n)
   WHERE n.updated_at >= datetime($since)
   WITH n LIMIT 100  -- Limit results
   RETURN n
   ```

### High Bandwidth Usage

**Diagnosis:**

```typescript
// Log patch sizes
detector.subscribe(filter, (patch) => {
  const size = JSON.stringify(patch).length;
  console.log(`[Patch] Size: ${size} bytes`);

  if (size > 10000) {
    console.warn('[Patch] Large patch!', {
      nodesAdded: patch.nodes_added?.length,
      nodesUpdated: patch.nodes_updated?.length
    });
  }
});
```

**Solutions:**

1. **Enable batching**
   ```typescript
   const detector = createGraphChangeDetector(queryFn, {
     enableBatching: true,
     batchWindowMs: 1000
   });
   ```

2. **Reduce property size**
   ```cypher
   -- Don't return huge text fields
   RETURN n {
     .id,
     .label,
     .type,
     .updated_at
     -- Exclude .description, .fullText, etc.
   }
   ```

3. **Add compression** (Advanced)
   ```typescript
   import { gzip } from 'zlib';

   // Compress large patches
   if (patchSize > 5000) {
     const compressed = await gzip(JSON.stringify(patch));
     // Send compressed data
   }
   ```

---

## Data Consistency Issues

### Nodes Show as Updated But Haven't Changed

**Cause:** Timestamp always updates, even without property changes

**Solution:**

```cypher
-- Only update timestamp when properties actually change
MERGE (n:Benefit {id: $id})
SET n.label = $label,
    n.description = $description,
    n.updated_at = CASE
      WHEN n.label <> $label OR n.description <> $description
      THEN datetime()
      ELSE n.updated_at
    END
```

### Missing Edges in Patches

**Cause:** Edge changes not detected correctly

**Debugging:**

```typescript
// Log edge snapshot
console.log('Current edges:', Array.from(snapshot.edges.keys()));

// Check if edge key is correct
const edgeKey = `${edge.source}:${edge.type}:${edge.target}`;
console.log('Edge key:', edgeKey);
```

**Solution:** Ensure edges have unique keys

```typescript
function edgeKey(edge: GraphEdge): string {
  return `${edge.source}:${edge.type}:${edge.target}`;
}
```

---

## Debugging Tools

### Enable Verbose Logging

```typescript
// Set environment variable
process.env.DEBUG = 'graph:*';

// Or in code
const detector = createGraphChangeDetector(
  queryFn,
  { debug: true }  // If you added debug flag
);
```

### Inspect Snapshots

```typescript
// Access internal state (for debugging only)
const detector = getGraphChangeDetector();

// @ts-ignore - accessing private field
const snapshots = detector.snapshots;

console.log('Active filters:', Array.from(snapshots.keys()));

for (const [filterKey, snapshot] of snapshots) {
  console.log(`Filter ${filterKey}:`, {
    nodes: snapshot.nodes.size,
    edges: snapshot.edges.size
  });
}
```

### Monitor Subscription Count

```typescript
setInterval(() => {
  const count = detector.getSubscriptionCount();
  console.log(`[Monitor] Active subscriptions: ${count}`);

  if (count > 100) {
    console.warn('[Monitor] High subscription count!');
  }
}, 60000);  // Every minute
```

### Test Utility

```bash
# Use built-in test utility
pnpm test:changes:simulate

# Watch logs while running
tail -f logs/detector.log
```

---

## Getting Help

### Before Reporting an Issue

1. **Check this guide** for common issues
2. **Enable debug logging** to get detailed output
3. **Collect relevant information:**
   - Node.js version
   - Package version
   - Configuration used
   - Error messages
   - Steps to reproduce

### Report Template

```markdown
## Issue Description
Brief description of the problem

## Environment
- OS: [e.g., macOS 14.0]
- Node.js version: [e.g., 20.10.0]
- Package version: [e.g., v0.3.1]
- Database: [e.g., Memgraph 2.15]

## Configuration
```typescript
const detector = createGraphChangeDetector(queryFn, {
  pollIntervalMs: 5000,
  enableBatching: true,
  // ... your config
});
```

## Steps to Reproduce
1. Start detector
2. Subscribe to filter
3. Make database change
4. Observe behavior

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Logs
```
[Paste relevant logs here]
```

## Additional Context
Any other relevant information
```

### Community Resources

- **GitHub Issues:** https://github.com/your-repo/issues
- **Documentation:** [Main docs](../architecture/change-detection/graph_change_detection_v_0_6.md)
- **API Reference:** [API docs](./graph_change_detector_api.md)
- **Discord/Slack:** [Community link]

---

## Related Documentation

- [API Reference](./graph_change_detector_api.md)
- [Usage Guide](./graph_change_detector_usage.md)
- [Testing Guide](./graph_change_detector_testing.md)
- [Performance Guide](./graph_change_detector_performance.md)
- [Architecture Overview](../architecture/change-detection/graph_change_detection_v_0_6.md)

---

**Last Updated:** 2025-11-25
**Version:** v0.3.1

**Need more help?** Open an issue on GitHub with the report template above.
