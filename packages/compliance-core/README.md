# @reg-copilot/compliance-core

**Version:** 0.3.1
**License:** MIT

Core compliance and graph utilities for the Regulatory Intelligence Copilot.

## Features

- **GraphChangeDetector** - Real-time graph change detection with SSE streaming
- **Graph Client** - Query interface for regulatory knowledge graph
- **Type Definitions** - Comprehensive TypeScript types for graph data

## Installation

```bash
pnpm add @reg-copilot/compliance-core
```

## Quick Start

### Graph Change Detection

Monitor your regulatory graph for changes in real-time:

```typescript
import { createGraphChangeDetector } from '@reg-copilot/compliance-core';

// Create detector
const detector = createGraphChangeDetector(async (filter) => {
  // Query your graph database
  return await queryGraph(filter);
});

// Start polling
detector.start();

// Subscribe to changes
const subscription = detector.subscribe(
  {
    jurisdictions: ['IE'],
    profileType: 'single-director'
  },
  (patch) => {
    console.log('Graph changed!', patch);

    if (patch.nodes_added) {
      patch.nodes_added.forEach(node => {
        console.log(`Added node: ${node.label}`);
      });
    }

    if (patch.nodes_updated) {
      patch.nodes_updated.forEach(node => {
        console.log(`Updated node: ${node.label}`);
      });
    }

    if (patch.nodes_removed) {
      patch.nodes_removed.forEach(nodeId => {
        console.log(`Removed node: ${nodeId}`);
      });
    }
  }
);

// Clean up when done
subscription.unsubscribe();
detector.stop();
```

## API Overview

### GraphChangeDetector

Real-time change detection for graph data.

**Key Methods:**

```typescript
class GraphChangeDetector {
  start(): void;
  stop(): void;
  subscribe(filter: ChangeFilter, callback: ChangeCallback): ChangeSubscription;
  getSubscriptionCount(): number;
}
```

**Configuration Options:**

```typescript
interface GraphChangeDetectorConfig {
  pollIntervalMs?: number;        // Default: 5000
  useTimestamps?: boolean;        // Default: true
  batchWindowMs?: number;         // Default: 1000
  enableBatching?: boolean;       // Default: true
}
```

### Types

**GraphPatch** - Incremental graph change:

```typescript
interface GraphPatch {
  type: 'graph_patch';
  timestamp: string;
  nodes_added?: GraphNode[];
  nodes_updated?: GraphNode[];
  nodes_removed?: string[];
  edges_added?: GraphEdge[];
  edges_removed?: GraphEdge[];
}
```

**GraphNode** - Node in the regulatory graph:

```typescript
interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
}
```

**GraphEdge** - Directed edge between nodes:

```typescript
interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}
```

**ChangeFilter** - Filtering criteria:

```typescript
interface ChangeFilter {
  jurisdictions?: string[];
  profileType?: string;
}
```

## Advanced Usage

### Timestamp-Based Queries

Optimize performance by querying only recent changes:

```typescript
// Full query function (initial snapshot)
async function queryFullGraph(filter: ChangeFilter) {
  const result = await graphDb.query({
    jurisdictions: filter.jurisdictions || ['IE'],
    profileType: filter.profileType || 'single-director'
  });

  return {
    nodes: result.nodes,
    edges: result.edges
  };
}

// Timestamp query function (subsequent polls)
async function queryTimestampBased(filter: ChangeFilter, since: Date) {
  const result = await graphDb.query({
    jurisdictions: filter.jurisdictions || ['IE'],
    profileType: filter.profileType || 'single-director',
    updatedSince: since.toISOString()
  });

  return {
    nodes: result.nodes,
    edges: result.edges
  };
}

// Create detector with timestamp optimization
const detector = createGraphChangeDetector(
  queryFullGraph,
  {
    pollIntervalMs: 5000,
    useTimestamps: true,
    enableBatching: true
  },
  queryTimestampBased  // 80-95% performance improvement!
);
```

### Change Batching

Reduce SSE message frequency by batching changes:

```typescript
const detector = createGraphChangeDetector(
  queryGraph,
  {
    enableBatching: true,
    batchWindowMs: 1000  // Collect changes for 1 second
  }
);

// Result: 80%+ reduction in SSE messages during bulk operations
```

### Custom Configuration

Tune for your specific use case:

```typescript
// High responsiveness
const fastDetector = createGraphChangeDetector(queryGraph, {
  pollIntervalMs: 2000,
  batchWindowMs: 500
});

// Low overhead
const efficientDetector = createGraphChangeDetector(queryGraph, {
  pollIntervalMs: 10000,
  batchWindowMs: 2000
});

// No batching (immediate updates)
const immediateDetector = createGraphChangeDetector(queryGraph, {
  pollIntervalMs: 5000,
  enableBatching: false
});
```

### Multiple Subscriptions

Subscribe to different filters with a single detector:

```typescript
const detector = createGraphChangeDetector(queryGraph);
detector.start();

// Ireland, single director
const sub1 = detector.subscribe(
  { jurisdictions: ['IE'], profileType: 'single-director' },
  handleIrelandChanges
);

// UK, married couple
const sub2 = detector.subscribe(
  { jurisdictions: ['UK'], profileType: 'married-couple' },
  handleUKChanges
);

// Multi-jurisdiction
const sub3 = detector.subscribe(
  { jurisdictions: ['IE', 'UK', 'NI'], profileType: 'company' },
  handleMultiJurisdictionChanges
);

// Clean up
sub1.unsubscribe();
sub2.unsubscribe();
sub3.unsubscribe();
```

## SSE Integration

### Server-Side (Next.js API Route)

```typescript
// app/api/graph/stream/route.ts
import { getGraphChangeDetector } from '@/lib/graphChangeDetectorInstance';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
  const profileType = searchParams.get('profileType') || 'single-director';

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Subscribe to changes
      const detector = getGraphChangeDetector();
      const subscription = detector.subscribe(
        { jurisdictions, profileType },
        (patch) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(patch)}\n\n`)
          );
        }
      );

      // Clean up on disconnect
      request.signal.addEventListener('abort', () => {
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

### Client-Side (React)

```typescript
'use client';

import { useEffect, useState } from 'react';

export function GraphVisualization() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });

  useEffect(() => {
    const eventSource = new EventSource('/api/graph/stream?jurisdictions=IE');

    eventSource.onmessage = (event) => {
      const patch = JSON.parse(event.data);

      if (patch.type === 'graph_patch') {
        applyPatch(patch);
      }
    };

    return () => eventSource.close();
  }, []);

  function applyPatch(patch) {
    setGraphData(prev => {
      // Apply patch logic
      return updatedGraph;
    });
  }

  return <div>{/* Render graph */}</div>;
}
```

## Performance

### Metrics

| Metric | Typical Performance |
|--------|-------------------|
| Query time (full) | 20-50ms |
| Query time (timestamp) | 2-5ms |
| Diff computation | <1ms |
| Memory per filter | 25-50KB |
| SSE latency | 50-100ms |

### Optimization Tips

1. **Enable timestamp queries** - 80-95% reduction in query overhead
2. **Add database indexes** - 50% faster queries
3. **Enable change batching** - 80%+ fewer SSE messages
4. **Tune poll interval** - Balance responsiveness vs load
5. **Use singleton pattern** - Share detector across connections

See [Performance Guide](../../docs/api/graph_change_detector_performance.md) for detailed optimization strategies.

## Testing

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GraphChangeDetector } from '@reg-copilot/compliance-core';

describe('GraphChangeDetector', () => {
  it('should detect added nodes', async () => {
    const mockQuery = vi.fn();
    const detector = new GraphChangeDetector(mockQuery, {
      pollIntervalMs: 100,
      enableBatching: false
    });

    mockQuery.mockResolvedValue({ nodes: [], edges: [] });

    detector.start();

    const callback = vi.fn();
    detector.subscribe({ jurisdictions: ['IE'] }, callback);

    await new Promise(resolve => setTimeout(resolve, 150));
    callback.mockClear();

    // Add a node
    mockQuery.mockResolvedValue({
      nodes: [{ id: 'n1', label: 'Node 1', type: 'Benefit', properties: {} }],
      edges: []
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls[0][0].nodes_added).toHaveLength(1);

    detector.stop();
  });
});
```

Run tests:

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
```

## Documentation

### Core Documentation

- [Architecture Overview](../../docs/graph_change_detection.md) - System architecture and design
- [Implementation Summary](../../docs/IMPLEMENTATION_SUMMARY.md) - What was built
- [Enhancements](../../docs/graph_change_detection_enhancements.md) - Timestamp queries and batching

### API Documentation

- [API Reference](../../docs/api/graph_change_detector_api.md) - Complete API documentation
- [Usage Guide](../../docs/api/graph_change_detector_usage.md) - Practical examples and patterns
- [Testing Guide](../../docs/api/graph_change_detector_testing.md) - Testing strategies
- [Performance Guide](../../docs/api/graph_change_detector_performance.md) - Optimization guide
- [Troubleshooting](../../docs/api/graph_change_detector_troubleshooting.md) - Common issues and solutions

## Examples

See the demo application for a complete working example:

```bash
# Start services
cd docker && docker-compose up memgraph

# Seed data
pnpm seed:all

# Start demo
pnpm dev:web

# Visit http://localhost:3000/graph
```

Test utilities:

```bash
# Run simulation
pnpm test:changes:simulate

# Individual operations
pnpm test:changes:add
pnpm test:changes:update
pnpm test:changes:remove
```

## Architecture

```
┌─────────────────────────────────────────────┐
│           SSE Clients (Browser)              │
│        (GraphVisualization UI)               │
└────────────────┬────────────────────────────┘
                 │ SSE Connection
                 │ (graph patches)
┌────────────────▼────────────────────────────┐
│      GET /api/graph/stream                  │
│    (Next.js API Route Handler)              │
└────────────────┬────────────────────────────┘
                 │ Subscribe
                 │
┌────────────────▼────────────────────────────┐
│     GraphChangeDetector (Singleton)         │
│  - Maintains snapshots per filter           │
│  - Polls database periodically              │
│  - Computes diffs                           │
│  - Notifies subscribers                     │
└────────────────┬────────────────────────────┘
                 │ Query
                 │
┌────────────────▼────────────────────────────┐
│           GraphClient                       │
│     (Queries database via MCP)              │
└────────────────┬────────────────────────────┘
                 │ Cypher
                 │
┌────────────────▼────────────────────────────┐
│           Memgraph/Neo4j                    │
│    (Regulatory Knowledge Graph)             │
└─────────────────────────────────────────────┘
```

## Contributing

### Development Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Type check
pnpm type-check
```

### Code Quality

- TypeScript for type safety
- Vitest for testing
- ESLint for linting
- Target >90% test coverage

## License

MIT

## Support

- **Documentation:** See links above
- **Issues:** GitHub Issues
- **Community:** [Discord/Slack link]

---

**Built for the Regulatory Intelligence Copilot project**

**Last Updated:** 2025-11-25
**Version:** 0.3.1
