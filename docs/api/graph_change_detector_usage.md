# GraphChangeDetector Usage Guide

**Version:** v0.3.1
**Audience:** Developers integrating GraphChangeDetector into applications

This guide provides practical examples and patterns for using the GraphChangeDetector system.

## Table of Contents

- [Quick Start](#quick-start)
- [Basic Patterns](#basic-patterns)
- [Advanced Patterns](#advanced-patterns)
- [Integration Examples](#integration-examples)
- [Best Practices](#best-practices)
- [Common Pitfalls](#common-pitfalls)

---

## Quick Start

### 1. Install Package

```bash
pnpm add @reg-copilot/compliance-core
```

### 2. Basic Setup

```typescript
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';
import type { ChangeFilter, GraphContext } from '@reg-copilot/compliance-core';

// Define your query function
async function queryGraph(filter: ChangeFilter): Promise<GraphContext> {
  // Query your graph database
  const result = await graphDb.query({
    jurisdictions: filter.jurisdictions || ['IE'],
    profileType: filter.profileType || 'single-director'
  });

  return {
    nodes: result.nodes,
    edges: result.edges
  };
}

// Create and start detector
const detector = createGraphChangeDetector(queryGraph);
detector.start();

// Subscribe to changes
const subscription = detector.subscribe(
  { jurisdictions: ['IE'], profileType: 'single-director' },
  (patch) => {
    console.log('Graph changed!', patch);
  }
);

// Clean up when done
process.on('SIGTERM', () => {
  subscription.unsubscribe();
  detector.stop();
});
```

---

## Basic Patterns

### Pattern 1: Single Subscription

Use when you have one client or one view to update.

```typescript
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';

const detector = createGraphChangeDetector(queryGraph);
detector.start();

// Subscribe for a specific jurisdiction and profile
const subscription = detector.subscribe(
  {
    jurisdictions: ['IE'],
    profileType: 'single-director'
  },
  (patch) => {
    // Update your UI or cache
    if (patch.nodes_added) {
      patch.nodes_added.forEach(node => {
        addNodeToGraph(node);
      });
    }

    if (patch.nodes_updated) {
      patch.nodes_updated.forEach(node => {
        updateNodeInGraph(node);
      });
    }

    if (patch.nodes_removed) {
      patch.nodes_removed.forEach(nodeId => {
        removeNodeFromGraph(nodeId);
      });
    }

    if (patch.edges_added) {
      patch.edges_added.forEach(edge => {
        addEdgeToGraph(edge);
      });
    }

    if (patch.edges_removed) {
      patch.edges_removed.forEach(edge => {
        removeEdgeFromGraph(edge);
      });
    }
  }
);

// Unsubscribe when component unmounts or view closes
subscription.unsubscribe();
```

---

### Pattern 2: Multiple Filters

Use when you need to monitor multiple jurisdictions or profiles.

```typescript
const detector = createGraphChangeDetector(queryGraph);
detector.start();

// Monitor different combinations
const subscriptions = [
  // Ireland, single director
  detector.subscribe(
    { jurisdictions: ['IE'], profileType: 'single-director' },
    (patch) => updateDashboard('IE-single', patch)
  ),

  // UK, married couple
  detector.subscribe(
    { jurisdictions: ['UK'], profileType: 'married-couple' },
    (patch) => updateDashboard('UK-married', patch)
  ),

  // Multi-jurisdiction
  detector.subscribe(
    { jurisdictions: ['IE', 'UK', 'NI'], profileType: 'company' },
    (patch) => updateDashboard('multi-company', patch)
  )
];

// Clean up all subscriptions
function cleanup() {
  subscriptions.forEach(sub => sub.unsubscribe());
  detector.stop();
}
```

---

### Pattern 3: Shared Subscriptions

Multiple callbacks can subscribe to the same filter (they share the same snapshot).

```typescript
const filter = {
  jurisdictions: ['IE'],
  profileType: 'single-director'
};

// First subscriber: Update UI
const uiSub = detector.subscribe(filter, (patch) => {
  console.log('[UI] Updating graph visualization');
  updateGraphVisualization(patch);
});

// Second subscriber: Log to analytics
const analyticsSub = detector.subscribe(filter, (patch) => {
  console.log('[Analytics] Tracking changes');
  logToAnalytics({
    event: 'graph_changed',
    nodesAdded: patch.nodes_added?.length || 0,
    nodesUpdated: patch.nodes_updated?.length || 0,
    nodesRemoved: patch.nodes_removed?.length || 0
  });
});

// Third subscriber: Cache invalidation
const cacheSub = detector.subscribe(filter, (patch) => {
  console.log('[Cache] Invalidating affected entries');
  invalidateCacheFor(patch);
});

// All three share the same snapshot internally
// Efficient memory usage!
```

---

## Advanced Patterns

### Pattern 4: Timestamp-Based Queries

Optimize performance by querying only recent changes.

```typescript
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';
import type { TimestampQueryFunction } from '@reg-copilot/compliance-core';

// Full query function (used for initial snapshot)
async function queryFullGraph(filter: ChangeFilter): Promise<GraphContext> {
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
    profileType: filter.profileType || 'single-director',
    jurisdictions: filter.jurisdictions || ['IE']
  });

  return parseResult(result);
}

// Timestamp query function (used for subsequent polls)
const queryTimestampBased: TimestampQueryFunction = async (filter, since) => {
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

  return parseResult(result);
};

// Create detector with timestamp optimization
const detector = createGraphChangeDetector(
  queryFullGraph,
  {
    pollIntervalMs: 5000,
    useTimestamps: true,  // Enable timestamp queries
    enableBatching: true
  },
  queryTimestampBased  // Provide timestamp query function
);

detector.start();

// Performance: 80-95% reduction in query overhead!
```

---

### Pattern 5: Custom Batching Configuration

Tune batching for your use case.

```typescript
// High responsiveness (minimal batching)
const fastDetector = createGraphChangeDetector(
  queryGraph,
  {
    pollIntervalMs: 2000,  // Poll more frequently
    batchWindowMs: 500,    // Shorter batch window
    enableBatching: true
  }
);

// Low overhead (maximum batching)
const efficientDetector = createGraphChangeDetector(
  queryGraph,
  {
    pollIntervalMs: 10000,  // Poll less frequently
    batchWindowMs: 2000,    // Longer batch window
    enableBatching: true
  }
);

// No batching (immediate updates)
const immediateDetector = createGraphChangeDetector(
  queryGraph,
  {
    pollIntervalMs: 5000,
    enableBatching: false  // Disable batching entirely
  }
);
```

---

### Pattern 6: Graceful Error Handling

Handle query failures and callback errors.

```typescript
// Wrap query function with error handling
async function queryGraphWithRetry(
  filter: ChangeFilter
): Promise<GraphContext> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await queryGraph(filter);
    } catch (error) {
      lastError = error as Error;
      console.error(`Query failed (attempt ${i + 1}/${maxRetries}):`, error);

      if (i < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, i) * 1000)
        );
      }
    }
  }

  // Return empty context on failure
  console.error('All query attempts failed:', lastError);
  return { nodes: [], edges: [] };
}

const detector = createGraphChangeDetector(queryGraphWithRetry);
detector.start();

// Wrap callback with error handling
detector.subscribe(filter, (patch) => {
  try {
    applyPatch(patch);
  } catch (error) {
    console.error('Failed to apply patch:', error);
    // Could trigger a full refresh here
    refreshGraph();
  }
});
```

---

## Integration Examples

### Example 1: Next.js API Route (SSE Endpoint)

```typescript
// app/api/graph/stream/route.ts
import { getGraphChangeDetector } from '@/lib/graphChangeDetectorInstance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
  const profileType = searchParams.get('profileType') || 'single-director';

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send connection confirmation
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'connected',
            timestamp: new Date().toISOString(),
            message: 'Graph stream connected'
          })}\n\n`
        )
      );

      // Subscribe to changes
      const detector = getGraphChangeDetector();
      const subscription = detector.subscribe(
        { jurisdictions, profileType },
        (patch) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(patch)}\n\n`)
            );
          } catch (error) {
            console.error('Failed to send patch:', error);
          }
        }
      );

      // Keep-alive ping every 30s
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch (error) {
          clearInterval(keepAliveInterval);
        }
      }, 30000);

      // Clean up on disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval);
        subscription.unsubscribe();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}
```

---

### Example 2: React Component

```typescript
// components/GraphVisualization.tsx
'use client';

import { useEffect, useState } from 'react';
import type { GraphPatch, GraphNode, GraphEdge } from '@reg-copilot/compliance-core';

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function GraphVisualization() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    // Connect to SSE endpoint
    const eventSource = new EventSource(
      '/api/graph/stream?jurisdictions=IE&profileType=single-director'
    );

    eventSource.onopen = () => {
      setStatus('connected');
      console.log('[SSE] Connected');
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'connected') {
        console.log('[SSE] Connection confirmed');
        return;
      }

      if (data.type === 'graph_patch') {
        applyPatch(data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Error:', error);
      setStatus('disconnected');
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
      setStatus('disconnected');
    };
  }, []);

  function applyPatch(patch: GraphPatch) {
    setGraphData(prev => {
      let { nodes, edges } = prev;

      // Remove nodes
      if (patch.nodes_removed && patch.nodes_removed.length > 0) {
        const removedIds = new Set(patch.nodes_removed);
        nodes = nodes.filter(n => !removedIds.has(n.id));
        // Remove edges connected to removed nodes
        edges = edges.filter(
          e => !removedIds.has(e.source) && !removedIds.has(e.target)
        );
      }

      // Add nodes
      if (patch.nodes_added && patch.nodes_added.length > 0) {
        const existingIds = new Set(nodes.map(n => n.id));
        const newNodes = patch.nodes_added.filter(n => !existingIds.has(n.id));
        nodes = [...nodes, ...newNodes];
      }

      // Update nodes
      if (patch.nodes_updated && patch.nodes_updated.length > 0) {
        const updateMap = new Map(patch.nodes_updated.map(n => [n.id, n]));
        nodes = nodes.map(n => updateMap.get(n.id) || n);
      }

      // Remove edges
      if (patch.edges_removed && patch.edges_removed.length > 0) {
        const removedKeys = new Set(
          patch.edges_removed.map(e => `${e.source}:${e.type}:${e.target}`)
        );
        edges = edges.filter(
          e => !removedKeys.has(`${e.source}:${e.type}:${e.target}`)
        );
      }

      // Add edges
      if (patch.edges_added && patch.edges_added.length > 0) {
        const existingKeys = new Set(
          edges.map(e => `${e.source}:${e.type}:${e.target}`)
        );
        const newEdges = patch.edges_added.filter(
          e => !existingKeys.has(`${e.source}:${e.type}:${e.target}`)
        );
        edges = [...edges, ...newEdges];
      }

      return { nodes, edges };
    });
  }

  return (
    <div>
      <div className="status">
        Status: {status}
        {status === 'connected' && ' ✓'}
      </div>
      <div className="graph-stats">
        Nodes: {graphData.nodes.length} | Edges: {graphData.edges.length}
      </div>
      {/* Render graph visualization here */}
    </div>
  );
}
```

---

### Example 3: Singleton Manager

```typescript
// lib/graphChangeDetectorInstance.ts
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';
import type { GraphChangeDetector } from '@reg-copilot/compliance-core';
import { createGraphClient } from './graphClient';

let detectorInstance: GraphChangeDetector | null = null;

export function getGraphChangeDetector(): GraphChangeDetector {
  if (detectorInstance) {
    return detectorInstance;
  }

  // Query function
  async function queryGraphByFilter(filter: ChangeFilter) {
    const graphClient = createGraphClient();
    const jurisdictions = filter.jurisdictions || ['IE'];
    const profileType = filter.profileType || 'single-director';

    const result = await graphClient.querySubgraph({
      jurisdictions,
      profileType
    });

    return {
      nodes: result.nodes,
      edges: result.edges
    };
  }

  // Timestamp query function
  async function queryGraphByTimestamp(filter: ChangeFilter, since: Date) {
    const graphClient = createGraphClient();
    const jurisdictions = filter.jurisdictions || ['IE'];
    const profileType = filter.profileType || 'single-director';

    const result = await graphClient.querySubgraphSince({
      jurisdictions,
      profileType,
      since: since.toISOString()
    });

    return {
      nodes: result.nodes,
      edges: result.edges
    };
  }

  // Create detector
  detectorInstance = createGraphChangeDetector(
    queryGraphByFilter,
    {
      pollIntervalMs: 5000,
      useTimestamps: true,
      enableBatching: true,
      batchWindowMs: 1000
    },
    queryGraphByTimestamp
  );

  // Start automatically
  detectorInstance.start();
  console.log('[GraphChangeDetector] Started singleton instance');

  // Clean up on process exit
  process.on('SIGTERM', () => {
    if (detectorInstance) {
      detectorInstance.stop();
      console.log('[GraphChangeDetector] Stopped on SIGTERM');
    }
  });

  return detectorInstance;
}
```

---

## Best Practices

### 1. Use Singleton Pattern

Create one detector instance per application, not per request.

```typescript
// ✅ Good: Singleton
const detector = getGraphChangeDetector();

// ❌ Bad: New instance per request
app.get('/api/stream', (req, res) => {
  const detector = createGraphChangeDetector(queryFn);  // DON'T DO THIS
  detector.start();
});
```

---

### 2. Always Unsubscribe

Prevent memory leaks by unsubscribing when done.

```typescript
// ✅ Good: Clean up subscription
const subscription = detector.subscribe(filter, callback);

// When done (component unmount, connection close, etc.)
subscription.unsubscribe();

// ❌ Bad: Never unsubscribe (memory leak!)
detector.subscribe(filter, callback);
// Subscription never cleaned up
```

---

### 3. Enable Timestamp Queries

Provide a timestamp query function for 80-95% performance improvement.

```typescript
// ✅ Good: With timestamp optimization
const detector = createGraphChangeDetector(
  queryFullGraph,
  { useTimestamps: true },
  queryTimestampBased  // Provide timestamp function
);

// ⚠️ Okay: Without timestamp optimization (less efficient)
const detector = createGraphChangeDetector(queryFullGraph);
```

---

### 4. Handle Errors Gracefully

Don't let query failures crash your application.

```typescript
// ✅ Good: Handle errors
async function queryGraph(filter: ChangeFilter): Promise<GraphContext> {
  try {
    return await graphDb.query(filter);
  } catch (error) {
    console.error('Query failed:', error);
    return { nodes: [], edges: [] };  // Return empty on error
  }
}

// ❌ Bad: Unhandled errors
async function queryGraph(filter: ChangeFilter): Promise<GraphContext> {
  return await graphDb.query(filter);  // Throws on error!
}
```

---

### 5. Tune Configuration for Your Use Case

Don't use default values blindly - optimize for your scenario.

```typescript
// Development: Fast updates
const devConfig = {
  pollIntervalMs: 2000,
  batchWindowMs: 500
};

// Production: Balanced
const prodConfig = {
  pollIntervalMs: 5000,
  batchWindowMs: 1000
};

// Low-priority monitoring: Efficient
const monitoringConfig = {
  pollIntervalMs: 30000,  // Poll every 30s
  batchWindowMs: 5000
};

const detector = createGraphChangeDetector(
  queryFn,
  process.env.NODE_ENV === 'production' ? prodConfig : devConfig
);
```

---

## Common Pitfalls

### Pitfall 1: Creating Multiple Detectors

```typescript
// ❌ Bad: Multiple detectors (waste resources)
const detector1 = createGraphChangeDetector(queryFn);
const detector2 = createGraphChangeDetector(queryFn);

detector1.start();
detector2.start();

// ✅ Good: Single detector, multiple subscriptions
const detector = createGraphChangeDetector(queryFn);
detector.start();

detector.subscribe(filter1, callback1);
detector.subscribe(filter2, callback2);
```

---

### Pitfall 2: Not Starting the Detector

```typescript
// ❌ Bad: Forgot to start
const detector = createGraphChangeDetector(queryFn);
detector.subscribe(filter, callback);  // Won't receive patches!

// ✅ Good: Start before subscribing
const detector = createGraphChangeDetector(queryFn);
detector.start();  // Start polling
detector.subscribe(filter, callback);  // Now will receive patches
```

---

### Pitfall 3: Ignoring Timestamp Optimization

```typescript
// ⚠️ Inefficient: Querying full graph every poll
const detector = createGraphChangeDetector(queryFullGraph);

// ✅ Efficient: Timestamp-based queries (80-95% faster)
const detector = createGraphChangeDetector(
  queryFullGraph,
  { useTimestamps: true },
  queryTimestampBased
);
```

---

### Pitfall 4: Blocking Callbacks

```typescript
// ❌ Bad: Slow callback blocks detector
detector.subscribe(filter, (patch) => {
  // Expensive synchronous operation
  for (let i = 0; i < 1000000; i++) {
    doWork();
  }
});

// ✅ Good: Async processing
detector.subscribe(filter, (patch) => {
  // Queue for async processing
  queuePatchProcessing(patch);
});
```

---

### Pitfall 5: Not Handling Edge Removals

```typescript
// ❌ Bad: Only handling node changes
applyPatch(patch) {
  if (patch.nodes_added) addNodes(patch.nodes_added);
  if (patch.nodes_updated) updateNodes(patch.nodes_updated);
  if (patch.nodes_removed) removeNodes(patch.nodes_removed);
  // Missing: edges_added, edges_removed
}

// ✅ Good: Complete patch handling
applyPatch(patch) {
  if (patch.nodes_removed) removeNodes(patch.nodes_removed);
  if (patch.nodes_added) addNodes(patch.nodes_added);
  if (patch.nodes_updated) updateNodes(patch.nodes_updated);
  if (patch.edges_removed) removeEdges(patch.edges_removed);
  if (patch.edges_added) addEdges(patch.edges_added);
}
```

---

## Next Steps

- [API Reference](./graph_change_detector_api.md) - Detailed API documentation
- [Testing Guide](./graph_change_detector_testing.md) - How to test your integration
- [Performance Guide](./graph_change_detector_performance.md) - Optimize performance
- [Troubleshooting](./graph_change_detector_troubleshooting.md) - Common issues and solutions

---

**Last Updated:** 2025-11-25
**Version:** v0.3.1
