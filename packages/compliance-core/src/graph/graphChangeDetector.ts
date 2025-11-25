/**
 * Graph Change Detector for Regulatory Intelligence Copilot
 *
 * Implements real-time graph change detection for streaming updates to clients.
 * Uses a polling-based approach with timestamp tracking to detect changes in Memgraph.
 *
 * Per v0.3 architecture (docs/architecture_v_0_3.md Section 9):
 * - Detects nodes_added, nodes_updated, nodes_removed
 * - Detects edges_added, edges_removed
 * - Filters changes by jurisdiction and profile
 * - Emits incremental graph patches for SSE streaming
 */

import type { GraphNode, GraphEdge, GraphContext } from '../types.js';
import { LOG_PREFIX } from '../constants.js';

/**
 * Graph patch format per v0.3 spec
 */
export interface GraphPatch {
  type: 'graph_patch';
  timestamp: string;
  nodes_added?: GraphNode[];
  nodes_updated?: GraphNode[];
  nodes_removed?: string[]; // Node IDs
  edges_added?: GraphEdge[];
  edges_removed?: GraphEdge[];
}

/**
 * Filter criteria for change detection
 */
export interface ChangeFilter {
  jurisdictions?: string[];
  profileType?: string;
}

/**
 * Snapshot of graph state at a point in time
 */
interface GraphSnapshot {
  timestamp: Date;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
}

/**
 * Change detection callback
 */
export type ChangeCallback = (patch: GraphPatch) => void;

/**
 * Subscription handle for managing listeners
 */
export interface ChangeSubscription {
  unsubscribe: () => void;
}

/**
 * Graph Change Detector Service
 *
 * Monitors Memgraph for changes and emits incremental patches.
 * Uses polling-based change detection with configurable intervals.
 */
export class GraphChangeDetector {
  private snapshots = new Map<string, GraphSnapshot>();
  private listeners = new Map<string, Set<ChangeCallback>>();
  private pollIntervalId: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  private graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>;

  /**
   * Create a new GraphChangeDetector
   *
   * @param graphQueryFn - Function to query the current graph state
   * @param pollIntervalMs - Polling interval in milliseconds (default: 5000)
   */
  constructor(
    graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>,
    pollIntervalMs = 5000
  ) {
    this.graphQueryFn = graphQueryFn;
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Start polling for changes
   */
  start(): void {
    if (this.pollIntervalId) {
      console.log(`${LOG_PREFIX.graph} Change detector already running`);
      return;
    }

    console.log(`${LOG_PREFIX.graph} Starting change detector (poll interval: ${this.pollIntervalMs}ms)`);

    // Poll immediately on start
    this.pollAllFilters().catch((error) => {
      console.error(`${LOG_PREFIX.graph} Error in initial poll:`, error);
    });

    // Set up periodic polling
    this.pollIntervalId = setInterval(() => {
      this.pollAllFilters().catch((error) => {
        console.error(`${LOG_PREFIX.graph} Error in polling:`, error);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling for changes
   */
  stop(): void {
    if (this.pollIntervalId) {
      console.log(`${LOG_PREFIX.graph} Stopping change detector`);
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  /**
   * Subscribe to changes for a specific filter
   *
   * @param filter - Filter criteria (jurisdictions, profile)
   * @param callback - Callback to invoke when changes are detected
   * @returns Subscription handle
   */
  subscribe(filter: ChangeFilter, callback: ChangeCallback): ChangeSubscription {
    const filterKey = this.getFilterKey(filter);

    if (!this.listeners.has(filterKey)) {
      this.listeners.set(filterKey, new Set());
    }

    this.listeners.get(filterKey)!.add(callback);

    console.log(`${LOG_PREFIX.graph} New subscription for filter: ${filterKey}`);

    // Initialize snapshot if this is the first subscriber
    if (!this.snapshots.has(filterKey)) {
      this.initializeSnapshot(filter).catch((error) => {
        console.error(`${LOG_PREFIX.graph} Error initializing snapshot:`, error);
      });
    }

    return {
      unsubscribe: () => {
        const listeners = this.listeners.get(filterKey);
        if (listeners) {
          listeners.delete(callback);
          if (listeners.size === 0) {
            this.listeners.delete(filterKey);
            this.snapshots.delete(filterKey);
            console.log(`${LOG_PREFIX.graph} Removed subscription and snapshot for: ${filterKey}`);
          }
        }
      },
    };
  }

  /**
   * Get number of active subscriptions
   */
  getSubscriptionCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  /**
   * Poll all active filters for changes
   */
  private async pollAllFilters(): Promise<void> {
    const filterKeys = Array.from(this.listeners.keys());

    if (filterKeys.length === 0) {
      return; // No active subscriptions
    }

    await Promise.all(
      filterKeys.map((filterKey) => {
        const filter = this.parseFilterKey(filterKey);
        return this.pollFilter(filter);
      })
    );
  }

  /**
   * Poll a specific filter for changes
   */
  private async pollFilter(filter: ChangeFilter): Promise<void> {
    const filterKey = this.getFilterKey(filter);
    const snapshot = this.snapshots.get(filterKey);

    if (!snapshot) {
      // Initialize snapshot on first poll
      await this.initializeSnapshot(filter);
      return;
    }

    try {
      // Query current state
      const currentContext = await this.graphQueryFn(filter);
      const currentNodes = this.nodesToMap(currentContext.nodes);
      const currentEdges = this.edgesToMap(currentContext.edges);

      // Compute diff
      const patch = this.computeDiff(snapshot, {
        timestamp: new Date(),
        nodes: currentNodes,
        edges: currentEdges,
      });

      // Update snapshot
      this.snapshots.set(filterKey, {
        timestamp: new Date(),
        nodes: currentNodes,
        edges: currentEdges,
      });

      // Emit patch if there are changes
      if (this.hasChanges(patch)) {
        this.emitPatch(filterKey, patch);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX.graph} Error polling filter ${filterKey}:`, error);
    }
  }

  /**
   * Initialize snapshot for a filter
   */
  private async initializeSnapshot(filter: ChangeFilter): Promise<void> {
    const filterKey = this.getFilterKey(filter);

    try {
      const context = await this.graphQueryFn(filter);
      this.snapshots.set(filterKey, {
        timestamp: new Date(),
        nodes: this.nodesToMap(context.nodes),
        edges: this.edgesToMap(context.edges),
      });
      console.log(`${LOG_PREFIX.graph} Initialized snapshot for ${filterKey}: ${context.nodes.length} nodes, ${context.edges.length} edges`);
    } catch (error) {
      console.error(`${LOG_PREFIX.graph} Error initializing snapshot for ${filterKey}:`, error);
    }
  }

  /**
   * Compute diff between two snapshots
   */
  private computeDiff(oldSnapshot: GraphSnapshot, newSnapshot: GraphSnapshot): GraphPatch {
    const patch: GraphPatch = {
      type: 'graph_patch',
      timestamp: newSnapshot.timestamp.toISOString(),
    };

    // Compute node changes
    const nodesAdded: GraphNode[] = [];
    const nodesUpdated: GraphNode[] = [];
    const nodesRemoved: string[] = [];

    // Find added and updated nodes
    for (const [id, newNode] of newSnapshot.nodes) {
      const oldNode = oldSnapshot.nodes.get(id);
      if (!oldNode) {
        nodesAdded.push(newNode);
      } else if (this.nodeHasChanged(oldNode, newNode)) {
        nodesUpdated.push(newNode);
      }
    }

    // Find removed nodes
    for (const [id] of oldSnapshot.nodes) {
      if (!newSnapshot.nodes.has(id)) {
        nodesRemoved.push(id);
      }
    }

    // Compute edge changes
    const edgesAdded: GraphEdge[] = [];
    const edgesRemoved: GraphEdge[] = [];

    // Find added edges
    for (const [key, newEdge] of newSnapshot.edges) {
      if (!oldSnapshot.edges.has(key)) {
        edgesAdded.push(newEdge);
      }
    }

    // Find removed edges
    for (const [key, oldEdge] of oldSnapshot.edges) {
      if (!newSnapshot.edges.has(key)) {
        edgesRemoved.push(oldEdge);
      }
    }

    // Only include non-empty arrays
    if (nodesAdded.length > 0) patch.nodes_added = nodesAdded;
    if (nodesUpdated.length > 0) patch.nodes_updated = nodesUpdated;
    if (nodesRemoved.length > 0) patch.nodes_removed = nodesRemoved;
    if (edgesAdded.length > 0) patch.edges_added = edgesAdded;
    if (edgesRemoved.length > 0) patch.edges_removed = edgesRemoved;

    return patch;
  }

  /**
   * Check if a node has changed
   */
  private nodeHasChanged(oldNode: GraphNode, newNode: GraphNode): boolean {
    // Compare label
    if (oldNode.label !== newNode.label) return true;

    // Compare properties (shallow comparison)
    const oldProps = JSON.stringify(oldNode.properties);
    const newProps = JSON.stringify(newNode.properties);
    return oldProps !== newProps;
  }

  /**
   * Check if patch has any changes
   */
  private hasChanges(patch: GraphPatch): boolean {
    return !!(
      patch.nodes_added?.length ||
      patch.nodes_updated?.length ||
      patch.nodes_removed?.length ||
      patch.edges_added?.length ||
      patch.edges_removed?.length
    );
  }

  /**
   * Emit patch to all listeners for a filter
   */
  private emitPatch(filterKey: string, patch: GraphPatch): void {
    const listeners = this.listeners.get(filterKey);
    if (!listeners || listeners.size === 0) return;

    console.log(`${LOG_PREFIX.graph} Emitting patch for ${filterKey}:`, {
      nodesAdded: patch.nodes_added?.length || 0,
      nodesUpdated: patch.nodes_updated?.length || 0,
      nodesRemoved: patch.nodes_removed?.length || 0,
      edgesAdded: patch.edges_added?.length || 0,
      edgesRemoved: patch.edges_removed?.length || 0,
    });

    for (const callback of listeners) {
      try {
        callback(patch);
      } catch (error) {
        console.error(`${LOG_PREFIX.graph} Error in change callback:`, error);
      }
    }
  }

  /**
   * Convert nodes array to map
   */
  private nodesToMap(nodes: GraphNode[]): Map<string, GraphNode> {
    const map = new Map<string, GraphNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }

  /**
   * Convert edges array to map
   */
  private edgesToMap(edges: GraphEdge[]): Map<string, GraphEdge> {
    const map = new Map<string, GraphEdge>();
    for (const edge of edges) {
      const key = this.getEdgeKey(edge);
      map.set(key, edge);
    }
    return map;
  }

  /**
   * Get unique key for an edge
   */
  private getEdgeKey(edge: GraphEdge): string {
    return `${edge.source}:${edge.type}:${edge.target}`;
  }

  /**
   * Get unique key for a filter
   */
  private getFilterKey(filter: ChangeFilter): string {
    const jurisdictions = filter.jurisdictions?.sort().join(',') || '*';
    const profileType = filter.profileType || '*';
    return `${jurisdictions}:${profileType}`;
  }

  /**
   * Parse filter key back to filter object
   */
  private parseFilterKey(filterKey: string): ChangeFilter {
    const [jurisdictionsStr, profileType] = filterKey.split(':');
    return {
      jurisdictions: jurisdictionsStr === '*' ? undefined : jurisdictionsStr.split(','),
      profileType: profileType === '*' ? undefined : profileType,
    };
  }
}

/**
 * Create a GraphChangeDetector instance
 *
 * @param graphQueryFn - Function to query graph state
 * @param pollIntervalMs - Polling interval (default: 5000ms)
 */
export function createGraphChangeDetector(
  graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>,
  pollIntervalMs?: number
): GraphChangeDetector {
  return new GraphChangeDetector(graphQueryFn, pollIntervalMs);
}
