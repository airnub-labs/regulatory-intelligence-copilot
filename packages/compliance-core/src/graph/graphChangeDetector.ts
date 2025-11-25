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
 *
 * Enhancements:
 * - Timestamp-based queries: Only fetches nodes updated since last poll
 * - Change batching: Collects changes over a time window before emitting
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
 * Configuration options for GraphChangeDetector
 */
export interface GraphChangeDetectorConfig {
  /** Polling interval in milliseconds (default: 5000) */
  pollIntervalMs?: number;
  /** Enable timestamp-based queries (default: true) */
  useTimestamps?: boolean;
  /** Change batching window in milliseconds (default: 1000) */
  batchWindowMs?: number;
  /** Enable change batching (default: true) */
  enableBatching?: boolean;
}

/**
 * Pending batch of changes for a filter
 */
interface PendingBatch {
  patches: GraphPatch[];
  timeoutId: NodeJS.Timeout | null;
}

/**
 * Last poll timestamp for timestamp-based queries
 */
interface LastPollInfo {
  timestamp: Date;
  hasData: boolean;
}

/**
 * Graph Change Detector Service
 *
 * Monitors Memgraph for changes and emits incremental patches.
 * Uses polling-based change detection with configurable intervals.
 * Supports timestamp-based queries and change batching for efficiency.
 */
export class GraphChangeDetector {
  private snapshots = new Map<string, GraphSnapshot>();
  private listeners = new Map<string, Set<ChangeCallback>>();
  private lastPollTimes = new Map<string, LastPollInfo>();
  private pendingBatches = new Map<string, PendingBatch>();
  private pollIntervalId: NodeJS.Timeout | null = null;
  private config: Required<GraphChangeDetectorConfig>;
  private graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>;
  private timestampQueryFn?: (filter: ChangeFilter, since: Date) => Promise<GraphContext>;

  /**
   * Create a new GraphChangeDetector
   *
   * @param graphQueryFn - Function to query the current graph state
   * @param config - Configuration options
   * @param timestampQueryFn - Optional function to query nodes updated since a timestamp
   */
  constructor(
    graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>,
    config?: GraphChangeDetectorConfig,
    timestampQueryFn?: (filter: ChangeFilter, since: Date) => Promise<GraphContext>
  ) {
    this.graphQueryFn = graphQueryFn;
    this.timestampQueryFn = timestampQueryFn;
    this.config = {
      pollIntervalMs: config?.pollIntervalMs ?? 5000,
      useTimestamps: config?.useTimestamps ?? true,
      batchWindowMs: config?.batchWindowMs ?? 1000,
      enableBatching: config?.enableBatching ?? true,
    };
  }

  /**
   * Start polling for changes
   */
  start(): void {
    if (this.pollIntervalId) {
      console.log(`${LOG_PREFIX.graph} Change detector already running`);
      return;
    }

    console.log(`${LOG_PREFIX.graph} Starting change detector (poll interval: ${this.config.pollIntervalMs}ms, timestamps: ${this.config.useTimestamps}, batching: ${this.config.enableBatching})`);

    // Poll immediately on start
    this.pollAllFilters().catch((error) => {
      console.error(`${LOG_PREFIX.graph} Error in initial poll:`, error);
    });

    // Set up periodic polling
    this.pollIntervalId = setInterval(() => {
      this.pollAllFilters().catch((error) => {
        console.error(`${LOG_PREFIX.graph} Error in polling:`, error);
      });
    }, this.config.pollIntervalMs);
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
    const lastPoll = this.lastPollTimes.get(filterKey);

    if (!snapshot) {
      // Initialize snapshot on first poll
      await this.initializeSnapshot(filter);
      return;
    }

    try {
      let currentContext: GraphContext;

      // Use timestamp-based query if enabled and available
      if (this.config.useTimestamps && this.timestampQueryFn && lastPoll) {
        // Query only nodes updated since last poll
        currentContext = await this.timestampQueryFn(filter, lastPoll.timestamp);

        // If timestamp query returns results, merge with snapshot
        if (currentContext.nodes.length > 0 || currentContext.edges.length > 0) {
          console.log(`${LOG_PREFIX.graph} Timestamp query for ${filterKey}: ${currentContext.nodes.length} nodes since ${lastPoll.timestamp.toISOString()}`);

          // Update snapshot with changed nodes
          const currentNodes = this.nodesToMap(currentContext.nodes);
          const currentEdges = this.edgesToMap(currentContext.edges);

          // Merge into existing snapshot
          for (const [id, node] of currentNodes) {
            snapshot.nodes.set(id, node);
          }
          for (const [key, edge] of currentEdges) {
            snapshot.edges.set(key, edge);
          }
        }

        // Update last poll time
        this.lastPollTimes.set(filterKey, {
          timestamp: new Date(),
          hasData: currentContext.nodes.length > 0,
        });

        // Compute diff from timestamp query results
        const patch = this.computeTimestampBasedDiff(currentContext, snapshot);

        if (this.hasChanges(patch)) {
          this.emitPatchWithBatching(filterKey, patch);
        }

        return;
      }

      // Fall back to full snapshot comparison
      currentContext = await this.graphQueryFn(filter);
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
        this.emitPatchWithBatching(filterKey, patch);
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

      // Initialize last poll time for timestamp-based queries
      this.lastPollTimes.set(filterKey, {
        timestamp: new Date(),
        hasData: true,
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
   * Emit patch with batching support
   * Collects patches over a time window before emitting
   */
  private emitPatchWithBatching(filterKey: string, patch: GraphPatch): void {
    if (!this.config.enableBatching) {
      // Batching disabled, emit immediately
      this.emitPatch(filterKey, patch);
      return;
    }

    // Get or create pending batch for this filter
    let batch = this.pendingBatches.get(filterKey);
    if (!batch) {
      batch = {
        patches: [],
        timeoutId: null,
      };
      this.pendingBatches.set(filterKey, batch);
    }

    // Add patch to batch
    batch.patches.push(patch);

    // Clear existing timeout if any
    if (batch.timeoutId) {
      clearTimeout(batch.timeoutId);
    }

    // Set new timeout to emit batched patch
    batch.timeoutId = setTimeout(() => {
      const batchedPatch = this.mergePatchBatch(batch!.patches);
      this.emitPatch(filterKey, batchedPatch);

      // Clear batch
      this.pendingBatches.delete(filterKey);
    }, this.config.batchWindowMs);
  }

  /**
   * Merge multiple patches into a single batched patch
   */
  private mergePatchBatch(patches: GraphPatch[]): GraphPatch {
    if (patches.length === 0) {
      throw new Error('Cannot merge empty patch batch');
    }

    if (patches.length === 1) {
      return patches[0];
    }

    const merged: GraphPatch = {
      type: 'graph_patch',
      timestamp: new Date().toISOString(),
      nodes_added: [],
      nodes_updated: [],
      nodes_removed: [],
      edges_added: [],
      edges_removed: [],
    };

    // Merge all patches
    for (const patch of patches) {
      if (patch.nodes_added) merged.nodes_added!.push(...patch.nodes_added);
      if (patch.nodes_updated) merged.nodes_updated!.push(...patch.nodes_updated);
      if (patch.nodes_removed) merged.nodes_removed!.push(...patch.nodes_removed);
      if (patch.edges_added) merged.edges_added!.push(...patch.edges_added);
      if (patch.edges_removed) merged.edges_removed!.push(...patch.edges_removed);
    }

    // Deduplicate nodes and edges
    merged.nodes_added = this.deduplicateNodes(merged.nodes_added!);
    merged.nodes_updated = this.deduplicateNodes(merged.nodes_updated!);
    merged.nodes_removed = Array.from(new Set(merged.nodes_removed!));
    merged.edges_added = this.deduplicateEdges(merged.edges_added!);
    merged.edges_removed = this.deduplicateEdges(merged.edges_removed!);

    return merged;
  }

  /**
   * Compute diff from timestamp-based query results
   * Unlike full snapshot comparison, this assumes all returned nodes are either added or updated
   */
  private computeTimestampBasedDiff(
    recentChanges: GraphContext,
    currentSnapshot: GraphSnapshot
  ): GraphPatch {
    const patch: GraphPatch = {
      type: 'graph_patch',
      timestamp: new Date().toISOString(),
    };

    const nodesAdded: GraphNode[] = [];
    const nodesUpdated: GraphNode[] = [];

    // All nodes from timestamp query are either added or updated
    for (const node of recentChanges.nodes) {
      if (currentSnapshot.nodes.has(node.id)) {
        nodesUpdated.push(node);
      } else {
        nodesAdded.push(node);
      }
    }

    const edgesAdded: GraphEdge[] = [];
    // Edges from timestamp query are added
    for (const edge of recentChanges.edges) {
      const edgeKey = this.getEdgeKey(edge);
      if (!currentSnapshot.edges.has(edgeKey)) {
        edgesAdded.push(edge);
      }
    }

    // Only include non-empty arrays
    if (nodesAdded.length > 0) patch.nodes_added = nodesAdded;
    if (nodesUpdated.length > 0) patch.nodes_updated = nodesUpdated;
    if (edgesAdded.length > 0) patch.edges_added = edgesAdded;

    return patch;
  }

  /**
   * Deduplicate nodes by ID (keeping last occurrence)
   */
  private deduplicateNodes(nodes: GraphNode[]): GraphNode[] {
    const map = new Map<string, GraphNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return Array.from(map.values());
  }

  /**
   * Deduplicate edges by key (keeping last occurrence)
   */
  private deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
    const map = new Map<string, GraphEdge>();
    for (const edge of edges) {
      const key = this.getEdgeKey(edge);
      map.set(key, edge);
    }
    return Array.from(map.values());
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
 * @param config - Configuration options
 * @param timestampQueryFn - Optional function to query nodes updated since a timestamp
 */
export function createGraphChangeDetector(
  graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>,
  config?: GraphChangeDetectorConfig,
  timestampQueryFn?: (filter: ChangeFilter, since: Date) => Promise<GraphContext>
): GraphChangeDetector {
  return new GraphChangeDetector(graphQueryFn, config, timestampQueryFn);
}

/**
 * Create a GraphChangeDetector with legacy signature (backwards compatible)
 * @deprecated Use createGraphChangeDetector with config object instead
 */
export function createGraphChangeDetectorLegacy(
  graphQueryFn: (filter: ChangeFilter) => Promise<GraphContext>,
  pollIntervalMs?: number
): GraphChangeDetector {
  return new GraphChangeDetector(graphQueryFn, { pollIntervalMs });
}
