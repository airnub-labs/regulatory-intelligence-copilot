/**
 * GraphChangeDetector Tests
 *
 * Comprehensive tests for graph change detection functionality:
 * - Lifecycle management (start/stop)
 * - Subscription management
 * - Snapshot comparison and diff computation
 * - Timestamp-based queries
 * - Change batching
 * - Patch emission and delivery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { requestContext, createLogger } from '@reg-copilot/reg-intel-observability';
import { Writable } from 'node:stream';
import { GraphChangeDetector, type GraphPatch, type ChangeFilter } from './graphChangeDetector.js';
import type { GraphContext, GraphNode, GraphEdge } from './types.js';

describe('GraphChangeDetector', () => {
  // Mock graph query function
  const createMockQueryFn = (initialContext: GraphContext) => {
    let currentContext = { ...initialContext };
    return {
      queryFn: vi.fn(async () => currentContext),
      setContext: (newContext: GraphContext) => {
        currentContext = { ...newContext };
      },
      getContext: () => currentContext,
    };
  };

  // Mock timestamp query function
  const createMockTimestampQueryFn = () => {
    let mockResults: GraphContext = { nodes: [], edges: [] };
    return {
      queryFn: vi.fn(async () => mockResults),
      setResults: (results: GraphContext) => {
        mockResults = { ...results };
      },
    };
  };

  // Helper to create test nodes
  const createNode = (id: string, label: string, type: string = 'Benefit'): GraphNode => ({
    id,
    label,
    type: type as GraphNode['type'],
    properties: { id, label },
  });

  // Helper to create test edges
  const createEdge = (source: string, target: string, type: string = 'REQUIRES'): GraphEdge => ({
    source,
    target,
    type,
    properties: {},
  });

  describe('Lifecycle Management', () => {
    it('should start and stop polling', () => {
      const mock = createMockQueryFn({ nodes: [], edges: [] });
      const detector = new GraphChangeDetector(mock.queryFn);

      // Initially not started
      expect(detector.getSubscriptionCount()).toBe(0);

      // Start should work
      detector.start();

      // Stop should work
      detector.stop();
    });

    it('should not start twice', () => {
      const mock = createMockQueryFn({ nodes: [], edges: [] });
      const detector = new GraphChangeDetector(mock.queryFn, { pollIntervalMs: 1000 });

      detector.start();
      detector.start(); // Should be a no-op

      detector.stop();
    });

    it('should handle stop when not started', () => {
      const mock = createMockQueryFn({ nodes: [], edges: [] });
      const detector = new GraphChangeDetector(mock.queryFn);

      // Should not throw
      expect(() => detector.stop()).not.toThrow();
    });
  });

  describe('Subscription Management', () => {
    it('should allow subscriptions', () => {
      const mock = createMockQueryFn({ nodes: [], edges: [] });
      const detector = new GraphChangeDetector(mock.queryFn);

      const callback = vi.fn();
      const filter: ChangeFilter = {
        jurisdictions: ['IE'],
        profileType: 'single-director',
      };

      const subscription = detector.subscribe(filter, callback);

      expect(detector.getSubscriptionCount()).toBe(1);

      subscription.unsubscribe();
      expect(detector.getSubscriptionCount()).toBe(0);
    });

    it('should support multiple subscriptions', () => {
      const mock = createMockQueryFn({ nodes: [], edges: [] });
      const detector = new GraphChangeDetector(mock.queryFn);

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const filter1: ChangeFilter = { jurisdictions: ['IE'] };
      const filter2: ChangeFilter = { jurisdictions: ['UK'] };

      const sub1 = detector.subscribe(filter1, callback1);
      const sub2 = detector.subscribe(filter2, callback2);

      expect(detector.getSubscriptionCount()).toBe(2);

      sub1.unsubscribe();
      expect(detector.getSubscriptionCount()).toBe(1);

      sub2.unsubscribe();
      expect(detector.getSubscriptionCount()).toBe(0);
    });

    it('should support multiple callbacks for same filter', () => {
      const mock = createMockQueryFn({ nodes: [], edges: [] });
      const detector = new GraphChangeDetector(mock.queryFn);

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const filter: ChangeFilter = { jurisdictions: ['IE'] };

      const sub1 = detector.subscribe(filter, callback1);
      const sub2 = detector.subscribe(filter, callback2);

      expect(detector.getSubscriptionCount()).toBe(2);

      sub1.unsubscribe();
      expect(detector.getSubscriptionCount()).toBe(1);

      sub2.unsubscribe();
      expect(detector.getSubscriptionCount()).toBe(0);
    });
  });

  describe('Diff Computation', () => {
    it('should detect added nodes', async () => {
      const initialContext: GraphContext = {
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      };

      const mock = createMockQueryFn(initialContext);
      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false, // Use snapshot comparison
        enableBatching: false, // Disable batching for predictable test timing
      });

      const callback = vi.fn();
      const filter: ChangeFilter = { jurisdictions: ['IE'] };

      detector.subscribe(filter, callback);
      detector.start();

      // Wait for initial snapshot
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Clear any initial calls
      callback.mockClear();

      // Add a node
      mock.setContext({
        nodes: [
          createNode('node1', 'Node 1'),
          createNode('node2', 'Node 2'),
        ],
        edges: [],
      });

      // Wait for next poll (at least 2 poll cycles to be safe)
      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      // Should have emitted a patch with node2 added
      expect(callback).toHaveBeenCalled();
      const patch = callback.mock.calls[callback.mock.calls.length - 1][0] as GraphPatch;
      expect(patch.nodes.added.length).toBe(1);
      expect(patch.nodes.added[0].id).toBe('node2');
      expect(patch.meta.nodeChanges).toBe(1);
    });

    it('should detect updated nodes', async () => {
      const initialContext: GraphContext = {
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      };

      const mock = createMockQueryFn(initialContext);
      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false,
        enableBatching: false,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      callback.mockClear();

      // Update node1's label
      mock.setContext({
        nodes: [createNode('node1', 'Node 1 Updated')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      expect(callback).toHaveBeenCalled();
      const patch = callback.mock.calls[callback.mock.calls.length - 1][0] as GraphPatch;
      expect(patch.nodes.updated.length).toBe(1);
      expect(patch.nodes.updated[0].label).toBe('Node 1 Updated');
    });

    it('should detect removed nodes', async () => {
      const initialContext: GraphContext = {
        nodes: [
          createNode('node1', 'Node 1'),
          createNode('node2', 'Node 2'),
        ],
        edges: [],
      };

      const mock = createMockQueryFn(initialContext);
      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false,
        enableBatching: false,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      callback.mockClear();

      // Remove node2
      mock.setContext({
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      expect(callback).toHaveBeenCalled();
      const patch = callback.mock.calls[callback.mock.calls.length - 1][0] as GraphPatch;
      expect(patch.nodes.removed.length).toBe(1);
      expect(patch.nodes.removed[0]).toBe('node2');
    });

    it('should detect added edges', async () => {
      const initialContext: GraphContext = {
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [],
      };

      const mock = createMockQueryFn(initialContext);
      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false,
        enableBatching: false,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      callback.mockClear();

      // Add edge
      mock.setContext({
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [createEdge('node1', 'node2', 'REQUIRES')],
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      expect(callback).toHaveBeenCalled();
      const patch = callback.mock.calls[callback.mock.calls.length - 1][0] as GraphPatch;
      expect(patch.edges.added.length).toBe(1);
      expect(patch.edges.added[0].source).toBe('node1');
      expect(patch.edges.added[0].target).toBe('node2');
    });

    it('should detect removed edges', async () => {
      const initialContext: GraphContext = {
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [createEdge('node1', 'node2', 'REQUIRES')],
      };

      const mock = createMockQueryFn(initialContext);
      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false,
        enableBatching: false,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      callback.mockClear();

      // Remove edge
      mock.setContext({
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      expect(callback).toHaveBeenCalled();
      const patch = callback.mock.calls[callback.mock.calls.length - 1][0] as GraphPatch;
      expect(patch.edges.removed.length).toBe(1);
    });
  });

  describe('Timestamp-Based Queries', () => {
    it('should use timestamp query when provided', async () => {
      const mockSnapshot = createMockQueryFn({
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      });

      const mockTimestamp = createMockTimestampQueryFn();

      const detector = new GraphChangeDetector(
        mockSnapshot.queryFn,
        {
          pollIntervalMs: 100,
          useTimestamps: true,
        },
        mockTimestamp.queryFn
      );

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      // Wait for initial snapshot
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Simulate timestamp query returning new node
      mockTimestamp.setResults({
        nodes: [createNode('node2', 'Node 2')],
        edges: [],
      });

      // Wait for next poll
      await new Promise((resolve) => setTimeout(resolve, 150));

      detector.stop();

      // Timestamp query should have been called
      expect(mockTimestamp.queryFn).toHaveBeenCalled();
    });

    it('should fall back to snapshot when timestamp query unavailable', async () => {
      const mock = createMockQueryFn({
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      });

      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: true, // Enabled but no timestamp function provided
        enableBatching: false,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      callback.mockClear();

      mock.setContext({
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      // Should still work via snapshot comparison
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Change Batching', () => {
    it('should batch changes when enabled', async () => {
      const mock = createMockQueryFn({
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      });

      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 50,
        useTimestamps: false,
        enableBatching: true,
        batchWindowMs: 200,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Make multiple rapid changes
      mock.setContext({
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      mock.setContext({
        nodes: [
          createNode('node1', 'Node 1'),
          createNode('node2', 'Node 2'),
          createNode('node3', 'Node 3'),
        ],
        edges: [],
      });

      // Wait for batch window to flush
      await new Promise((resolve) => setTimeout(resolve, 300));

      detector.stop();

      // Should have batched the changes
      expect(callback).toHaveBeenCalled();
    });

    it('should emit immediately when batching disabled', async () => {
      const mock = createMockQueryFn({
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      });

      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false,
        enableBatching: false,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);
      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 150));

      mock.setContext({
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      detector.stop();

      // Should have emitted immediately
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Multiple Filters', () => {
    it('should maintain separate snapshots for different filters', async () => {
      const mock = createMockQueryFn({
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      });

      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false,
        enableBatching: false,
      });

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      detector.subscribe({ jurisdictions: ['IE'] }, callback1);
      detector.subscribe({ jurisdictions: ['UK'] }, callback2);

      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      callback1.mockClear();
      callback2.mockClear();

      mock.setContext({
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      // Both callbacks should have been called
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle query errors gracefully', async () => {
      const errorQueryFn = vi.fn(async () => {
        throw new Error('Query failed');
      });

      const detector = new GraphChangeDetector(errorQueryFn, {
        pollIntervalMs: 100,
      });

      const callback = vi.fn();
      detector.subscribe({ jurisdictions: ['IE'] }, callback);

      // Should not throw
      expect(() => detector.start()).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 150));

      detector.stop();

      // Callback should not have been called due to error
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const mock = createMockQueryFn({
        nodes: [createNode('node1', 'Node 1')],
        edges: [],
      });

      const detector = new GraphChangeDetector(mock.queryFn, {
        pollIntervalMs: 100,
        useTimestamps: false,
        enableBatching: false,
      });

      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });

      const normalCallback = vi.fn();

      detector.subscribe({ jurisdictions: ['IE'] }, errorCallback);
      detector.subscribe({ jurisdictions: ['IE'] }, normalCallback);

      detector.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      errorCallback.mockClear();
      normalCallback.mockClear();

      mock.setContext({
        nodes: [createNode('node1', 'Node 1'), createNode('node2', 'Node 2')],
        edges: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      detector.stop();

      // Error in one callback should not prevent others from being called
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('Logging correlation', () => {
    let provider: BasicTracerProvider;
    let contextManager: AsyncLocalStorageContextManager;
    let exporter: InMemorySpanExporter;

    beforeEach(() => {
      exporter = new InMemorySpanExporter();
      provider = new BasicTracerProvider();
      provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
      contextManager = new AsyncLocalStorageContextManager().enable();
      provider.register({ contextManager });
    });

    afterEach(async () => {
      await provider.shutdown();
      contextManager.disable();
      exporter.reset();
    });

    it('includes trace and request context metadata in logs', async () => {
      const captured: Array<Record<string, unknown>> = [];
      const destination = new Writable({
        write(chunk, _encoding, callback) {
          try {
            captured.push(JSON.parse(chunk.toString()));
          } catch (error) {
            // Ignore non-JSON logs
          }
          callback();
        },
      });
      const logger = createLogger('GraphChangeDetector', {
        component: 'GraphChangeDetector',
        destination,
      });

      const mock = createMockQueryFn({ nodes: [], edges: [] });
      const tracer = trace.getTracer('graph-change-detector-log-test');

      await tracer.startActiveSpan('graph-change-detector-log-span', async (span) => {
        await requestContext.run({ tenantId: 'tenant-graph', conversationId: 'conversation-graph' }, async () => {
          const detector = new GraphChangeDetector(
            mock.queryFn,
            { pollIntervalMs: 50, enableBatching: false, useTimestamps: false },
            undefined,
            logger
          );

          detector.subscribe({ jurisdictions: ['IE'] }, vi.fn());
          detector.start();
          detector.stop();
        });
        span.end();
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      const logEntry = captured.find(
        (entry) =>
          entry.scope === 'GraphChangeDetector' &&
          typeof entry.message === 'string' &&
          entry.message.includes('Starting change detector')
      );

      expect(logEntry?.trace_id).toBeDefined();
      expect(logEntry?.span_id).toBeDefined();
      expect(logEntry?.tenantId).toBe('tenant-graph');
      expect(logEntry?.conversationId).toBe('conversation-graph');
    });
  });
});
