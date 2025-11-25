# GraphChangeDetector Testing Guide

**Version:** v0.3.1
**Framework:** Vitest
**Coverage Target:** >90%

This guide covers testing strategies, patterns, and examples for the GraphChangeDetector system.

## Table of Contents

- [Test Setup](#test-setup)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [Manual Testing](#manual-testing)
- [Testing Utilities](#testing-utilities)
- [Best Practices](#best-practices)
- [Continuous Integration](#continuous-integration)

---

## Test Setup

### Install Dependencies

```bash
pnpm add -D vitest @vitest/ui
```

### Configure Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
});
```

### Package Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch"
  }
}
```

---

## Unit Testing

### Test File Structure

```
packages/compliance-core/
└── src/
    └── graph/
        ├── graphChangeDetector.ts
        └── graphChangeDetector.test.ts  ← Test file
```

### Basic Test Setup

```typescript
// graphChangeDetector.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GraphChangeDetector } from './graphChangeDetector';
import type { ChangeFilter, GraphContext, GraphPatch } from './types';

describe('GraphChangeDetector', () => {
  let detector: GraphChangeDetector;
  let mockQueryFn: ReturnType<typeof vi.fn>;
  let mockCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock query function
    mockQueryFn = vi.fn<[ChangeFilter], Promise<GraphContext>>();
    mockQueryFn.mockResolvedValue({ nodes: [], edges: [] });

    // Create mock callback
    mockCallback = vi.fn<[GraphPatch], void>();

    // Create detector instance
    detector = new GraphChangeDetector(mockQueryFn, {
      pollIntervalMs: 100,  // Fast polling for tests
      enableBatching: false  // Disable batching for predictable behavior
    });
  });

  afterEach(() => {
    // Clean up
    detector.stop();
    vi.clearAllMocks();
  });

  it('should create detector instance', () => {
    expect(detector).toBeDefined();
    expect(detector.getSubscriptionCount()).toBe(0);
  });
});
```

---

### Testing Core Functionality

#### Test 1: Starting and Stopping

```typescript
describe('Start and Stop', () => {
  it('should start polling', async () => {
    detector.start();

    // Wait for first poll
    await new Promise(resolve => setTimeout(resolve, 150));

    // Query function should be called
    expect(mockQueryFn).toHaveBeenCalled();
  });

  it('should stop polling', async () => {
    detector.start();
    await new Promise(resolve => setTimeout(resolve, 150));

    mockQueryFn.mockClear();
    detector.stop();

    // Wait to ensure no more polls
    await new Promise(resolve => setTimeout(resolve, 200));

    // Query function should not be called after stop
    expect(mockQueryFn).not.toHaveBeenCalled();
  });

  it('should handle multiple start calls', () => {
    detector.start();
    detector.start();  // Should be no-op
    detector.start();  // Should be no-op

    expect(mockQueryFn).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple stop calls', () => {
    detector.start();
    detector.stop();
    detector.stop();  // Should be no-op

    expect(() => detector.stop()).not.toThrow();
  });
});
```

#### Test 2: Subscriptions

```typescript
describe('Subscriptions', () => {
  const filter: ChangeFilter = {
    jurisdictions: ['IE'],
    profileType: 'single-director'
  };

  it('should accept subscriptions', () => {
    const subscription = detector.subscribe(filter, mockCallback);

    expect(subscription).toBeDefined();
    expect(subscription.unsubscribe).toBeInstanceOf(Function);
    expect(detector.getSubscriptionCount()).toBe(1);
  });

  it('should support multiple subscriptions', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const callback3 = vi.fn();

    detector.subscribe(filter, callback1);
    detector.subscribe(filter, callback2);
    detector.subscribe(filter, callback3);

    expect(detector.getSubscriptionCount()).toBe(3);
  });

  it('should unsubscribe correctly', () => {
    const sub1 = detector.subscribe(filter, vi.fn());
    const sub2 = detector.subscribe(filter, vi.fn());

    expect(detector.getSubscriptionCount()).toBe(2);

    sub1.unsubscribe();
    expect(detector.getSubscriptionCount()).toBe(1);

    sub2.unsubscribe();
    expect(detector.getSubscriptionCount()).toBe(0);
  });

  it('should handle duplicate unsubscribe', () => {
    const subscription = detector.subscribe(filter, mockCallback);

    subscription.unsubscribe();
    expect(() => subscription.unsubscribe()).not.toThrow();
  });
});
```

#### Test 3: Change Detection

```typescript
describe('Change Detection', () => {
  const filter: ChangeFilter = {
    jurisdictions: ['IE'],
    profileType: 'single-director'
  };

  function createNode(id: string, label: string) {
    return {
      id,
      label,
      type: 'Benefit',
      properties: { created_at: new Date().toISOString() }
    };
  }

  it('should detect added nodes', async () => {
    // Start with empty graph
    mockQueryFn.mockResolvedValue({ nodes: [], edges: [] });

    detector.start();
    detector.subscribe(filter, mockCallback);

    // Wait for initial poll
    await new Promise(resolve => setTimeout(resolve, 150));
    mockCallback.mockClear();

    // Add a node
    mockQueryFn.mockResolvedValue({
      nodes: [createNode('node1', 'Node 1')],
      edges: []
    });

    // Wait for next poll
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should emit patch with added node
    expect(mockCallback).toHaveBeenCalled();
    const patch = mockCallback.mock.calls[0][0];
    expect(patch.nodes_added).toHaveLength(1);
    expect(patch.nodes_added[0].id).toBe('node1');
  });

  it('should detect updated nodes', async () => {
    const node = createNode('node1', 'Original Label');

    // Start with one node
    mockQueryFn.mockResolvedValue({ nodes: [node], edges: [] });

    detector.start();
    detector.subscribe(filter, mockCallback);

    await new Promise(resolve => setTimeout(resolve, 150));
    mockCallback.mockClear();

    // Update the node
    const updatedNode = {
      ...node,
      label: 'Updated Label',
      properties: { ...node.properties, updated: true }
    };

    mockQueryFn.mockResolvedValue({
      nodes: [updatedNode],
      edges: []
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    // Should emit patch with updated node
    expect(mockCallback).toHaveBeenCalled();
    const patch = mockCallback.mock.calls[0][0];
    expect(patch.nodes_updated).toHaveLength(1);
    expect(patch.nodes_updated[0].label).toBe('Updated Label');
  });

  it('should detect removed nodes', async () => {
    // Start with two nodes
    mockQueryFn.mockResolvedValue({
      nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
      edges: []
    });

    detector.start();
    detector.subscribe(filter, mockCallback);

    await new Promise(resolve => setTimeout(resolve, 150));
    mockCallback.mockClear();

    // Remove one node
    mockQueryFn.mockResolvedValue({
      nodes: [createNode('node1', 'Node 1')],
      edges: []
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    // Should emit patch with removed node
    expect(mockCallback).toHaveBeenCalled();
    const patch = mockCallback.mock.calls[0][0];
    expect(patch.nodes_removed).toHaveLength(1);
    expect(patch.nodes_removed[0]).toBe('node2');
  });

  it('should detect edge changes', async () => {
    const node1 = createNode('node1', 'Node 1');
    const node2 = createNode('node2', 'Node 2');

    // Start with nodes but no edges
    mockQueryFn.mockResolvedValue({
      nodes: [node1, node2],
      edges: []
    });

    detector.start();
    detector.subscribe(filter, mockCallback);

    await new Promise(resolve => setTimeout(resolve, 150));
    mockCallback.mockClear();

    // Add edge
    mockQueryFn.mockResolvedValue({
      nodes: [node1, node2],
      edges: [{
        source: 'node1',
        target: 'node2',
        type: 'CITES'
      }]
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    // Should emit patch with added edge
    expect(mockCallback).toHaveBeenCalled();
    const patch = mockCallback.mock.calls[0][0];
    expect(patch.edges_added).toHaveLength(1);
    expect(patch.edges_added[0].type).toBe('CITES');
  });

  it('should not emit empty patches', async () => {
    // Start with one node
    mockQueryFn.mockResolvedValue({
      nodes: [createNode('node1', 'Node 1')],
      edges: []
    });

    detector.start();
    detector.subscribe(filter, mockCallback);

    await new Promise(resolve => setTimeout(resolve, 150));
    mockCallback.mockClear();

    // No changes
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should not call callback
    expect(mockCallback).not.toHaveBeenCalled();
  });
});
```

#### Test 4: Batching

```typescript
describe('Batching', () => {
  const filter: ChangeFilter = {
    jurisdictions: ['IE'],
    profileType: 'single-director'
  };

  it('should batch multiple changes', async () => {
    // Create detector with batching enabled
    const batchDetector = new GraphChangeDetector(
      mockQueryFn,
      {
        pollIntervalMs: 50,
        enableBatching: true,
        batchWindowMs: 200
      }
    );

    mockQueryFn.mockResolvedValue({ nodes: [], edges: [] });

    batchDetector.start();
    batchDetector.subscribe(filter, mockCallback);

    await new Promise(resolve => setTimeout(resolve, 100));
    mockCallback.mockClear();

    // Trigger multiple rapid changes
    for (let i = 1; i <= 3; i++) {
      mockQueryFn.mockResolvedValue({
        nodes: Array.from({ length: i }, (_, j) =>
          ({ id: `node${j}`, label: `Node ${j}`, type: 'Benefit', properties: {} })
        ),
        edges: []
      });

      await new Promise(resolve => setTimeout(resolve, 60));
    }

    // Wait for batch window to expire
    await new Promise(resolve => setTimeout(resolve, 250));

    // Should have called callback once with merged patch
    expect(mockCallback).toHaveBeenCalledTimes(1);
    const patch = mockCallback.mock.calls[0][0];
    expect(patch.nodes_added).toBeDefined();

    batchDetector.stop();
  });
});
```

#### Test 5: Timestamp Queries

```typescript
describe('Timestamp Queries', () => {
  const filter: ChangeFilter = {
    jurisdictions: ['IE'],
    profileType: 'single-director'
  };

  it('should use timestamp query function', async () => {
    const mockTimestampFn = vi.fn<[ChangeFilter, Date], Promise<GraphContext>>();
    mockTimestampFn.mockResolvedValue({ nodes: [], edges: [] });

    const detector = new GraphChangeDetector(
      mockQueryFn,
      {
        pollIntervalMs: 100,
        useTimestamps: true,
        enableBatching: false
      },
      mockTimestampFn
    );

    mockQueryFn.mockResolvedValue({ nodes: [], edges: [] });

    detector.start();
    detector.subscribe(filter, mockCallback);

    // Wait for initial poll (uses full query)
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(mockQueryFn).toHaveBeenCalledTimes(1);
    expect(mockTimestampFn).not.toHaveBeenCalled();

    mockQueryFn.mockClear();

    // Wait for second poll (uses timestamp query)
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(mockQueryFn).not.toHaveBeenCalled();
    expect(mockTimestampFn).toHaveBeenCalledTimes(1);

    detector.stop();
  });

  it('should fall back to full query if timestamp query fails', async () => {
    const mockTimestampFn = vi.fn<[ChangeFilter, Date], Promise<GraphContext>>();
    mockTimestampFn.mockRejectedValue(new Error('Timestamp query failed'));

    const detector = new GraphChangeDetector(
      mockQueryFn,
      {
        pollIntervalMs: 100,
        useTimestamps: true,
        enableBatching: false
      },
      mockTimestampFn
    );

    mockQueryFn.mockResolvedValue({ nodes: [], edges: [] });

    detector.start();
    detector.subscribe(filter, mockCallback);

    await new Promise(resolve => setTimeout(resolve, 150));
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should fall back to full query
    expect(mockQueryFn).toHaveBeenCalled();

    detector.stop();
  });
});
```

---

## Integration Testing

### Testing with Real Database

```typescript
// graphChangeDetector.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphChangeDetector } from './graphChangeDetector';
import { createGraphClient } from '../graphClient';

describe('GraphChangeDetector Integration', () => {
  let graphClient: ReturnType<typeof createGraphClient>;
  let detector: GraphChangeDetector;

  beforeAll(async () => {
    // Connect to test database
    graphClient = createGraphClient({
      uri: process.env.TEST_GRAPH_URI || 'bolt://localhost:7687'
    });

    // Clear test data
    await graphClient.execute('MATCH (n) DETACH DELETE n');

    // Create detector
    detector = new GraphChangeDetector(
      async (filter) => {
        return await graphClient.querySubgraph(filter);
      },
      { pollIntervalMs: 1000, enableBatching: false }
    );

    detector.start();
  });

  afterAll(async () => {
    detector.stop();
    await graphClient.close();
  });

  it('should detect node addition in real database', async () => {
    const patches: GraphPatch[] = [];

    const subscription = detector.subscribe(
      { jurisdictions: ['IE'], profileType: 'test' },
      (patch) => patches.push(patch)
    );

    // Wait for initial poll
    await new Promise(resolve => setTimeout(resolve, 1500));
    patches.length = 0;  // Clear initial patches

    // Add a node to database
    await graphClient.execute(`
      CREATE (b:Benefit {
        id: 'test-benefit-1',
        label: 'Test Benefit',
        created_at: datetime(),
        updated_at: datetime()
      })
    `);

    // Wait for detector to poll
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have detected the new node
    expect(patches.length).toBeGreaterThan(0);
    expect(patches[0].nodes_added).toBeDefined();
    expect(patches[0].nodes_added.some(n => n.id === 'test-benefit-1')).toBe(true);

    subscription.unsubscribe();
  });
});
```

---

## Manual Testing

### Testing with Test Utility

The project includes a test utility script for manual testing.

#### 1. Start Services

```bash
# Start Memgraph
cd docker
docker-compose up memgraph memgraph-mcp

# Seed data
cd ..
pnpm seed:all

# Start dev server
pnpm dev:web
```

#### 2. Open Graph UI

```
http://localhost:3000/graph
```

#### 3. Run Test Commands

```bash
# Simulate sequence of changes
pnpm test:changes:simulate

# Individual operations
pnpm test:changes:add
pnpm test:changes:update
pnpm test:changes:remove
```

#### 4. Verify Behavior

Check that:
- Initial graph loads with nodes
- Status shows "Live Updates" (green dot)
- Running test commands triggers visible updates
- Node/edge counts update
- Graph visualization updates without page reload
- Console shows patch details

---

## Testing Utilities

### Mock Factory

Create reusable mocks for tests.

```typescript
// test-utils/mockFactory.ts
import type { GraphContext, GraphNode, GraphEdge } from '@reg-copilot/compliance-core';

export class MockGraphFactory {
  private nodeCounter = 0;
  private edgeCounter = 0;

  createNode(overrides?: Partial<GraphNode>): GraphNode {
    return {
      id: `node-${++this.nodeCounter}`,
      label: `Node ${this.nodeCounter}`,
      type: 'Benefit',
      properties: {},
      ...overrides
    };
  }

  createEdge(overrides?: Partial<GraphEdge>): GraphEdge {
    return {
      source: `node-1`,
      target: `node-2`,
      type: 'CITES',
      ...overrides
    };
  }

  createContext(nodeCount: number, edgeCount: number): GraphContext {
    const nodes = Array.from({ length: nodeCount }, () => this.createNode());
    const edges = Array.from({ length: edgeCount }, (_, i) => this.createEdge({
      source: nodes[i % nodeCount].id,
      target: nodes[(i + 1) % nodeCount].id
    }));

    return { nodes, edges };
  }

  reset() {
    this.nodeCounter = 0;
    this.edgeCounter = 0;
  }
}

// Usage in tests
const factory = new MockGraphFactory();
const node = factory.createNode({ label: 'Custom Label' });
const context = factory.createContext(10, 5);
```

### Test Helpers

```typescript
// test-utils/helpers.ts
export async function waitForPoll(pollIntervalMs: number) {
  await new Promise(resolve => setTimeout(resolve, pollIntervalMs + 50));
}

export async function waitForBatch(batchWindowMs: number) {
  await new Promise(resolve => setTimeout(resolve, batchWindowMs + 50));
}

export function expectPatch(patch: GraphPatch, expected: {
  nodesAdded?: number;
  nodesUpdated?: number;
  nodesRemoved?: number;
  edgesAdded?: number;
  edgesRemoved?: number;
}) {
  if (expected.nodesAdded !== undefined) {
    expect(patch.nodes_added?.length || 0).toBe(expected.nodesAdded);
  }
  if (expected.nodesUpdated !== undefined) {
    expect(patch.nodes_updated?.length || 0).toBe(expected.nodesUpdated);
  }
  // ... etc
}
```

---

## Best Practices

### 1. Use Fast Poll Intervals in Tests

```typescript
// Test config
const testDetector = new GraphChangeDetector(mockQueryFn, {
  pollIntervalMs: 100,  // Fast for tests
  enableBatching: false  // Predictable behavior
});

// Production config
const prodDetector = new GraphChangeDetector(queryFn, {
  pollIntervalMs: 5000,  // Realistic interval
  enableBatching: true
});
```

### 2. Disable Batching for Unit Tests

```typescript
// Makes tests more predictable
const detector = new GraphChangeDetector(mockQueryFn, {
  enableBatching: false
});
```

### 3. Clear Mocks Between Tests

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  detector.stop();
});
```

### 4. Test Edge Cases

```typescript
it('should handle empty graph', async () => {
  mockQueryFn.mockResolvedValue({ nodes: [], edges: [] });
  // Test behavior
});

it('should handle large graphs', async () => {
  const nodes = Array.from({ length: 1000 }, (_, i) => createNode(`n${i}`, `Node ${i}`));
  mockQueryFn.mockResolvedValue({ nodes, edges: [] });
  // Test behavior
});

it('should handle query errors', async () => {
  mockQueryFn.mockRejectedValue(new Error('Query failed'));
  // Test error handling
});
```

### 5. Test Cleanup

```typescript
it('should clean up on unsubscribe', () => {
  const sub = detector.subscribe(filter, callback);
  expect(detector.getSubscriptionCount()).toBe(1);

  sub.unsubscribe();
  expect(detector.getSubscriptionCount()).toBe(0);
});
```

---

## Continuous Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      memgraph:
        image: memgraph/memgraph:latest
        ports:
          - 7687:7687

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Run unit tests
        run: pnpm test:unit

      - name: Run integration tests
        run: pnpm test:integration
        env:
          TEST_GRAPH_URI: bolt://localhost:7687

      - name: Generate coverage
        run: pnpm test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Coverage Goals

Target coverage metrics:

- **Overall:** >90%
- **Core logic:** >95%
- **Edge cases:** >85%
- **Integration:** >80%

### Run Coverage

```bash
pnpm test:coverage
```

View report:

```bash
open coverage/index.html
```

---

## Related Documentation

- [API Reference](./graph_change_detector_api.md)
- [Usage Guide](./graph_change_detector_usage.md)
- [Performance Guide](./graph_change_detector_performance.md)

---

**Last Updated:** 2025-11-25
**Version:** v0.3.1
