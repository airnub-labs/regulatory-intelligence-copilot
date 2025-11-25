/**
 * Singleton GraphChangeDetector instance for the demo-web app
 *
 * Manages a single shared GraphChangeDetector that monitors the Memgraph
 * database for changes and notifies subscribed SSE clients.
 */

import {
  createGraphChangeDetector,
  createGraphClient,
  type GraphChangeDetector,
  type ChangeFilter,
  type GraphContext,
} from '@reg-copilot/compliance-core';

let detectorInstance: GraphChangeDetector | null = null;

/**
 * Query function that fetches graph state based on filter criteria
 */
async function queryGraphByFilter(filter: ChangeFilter): Promise<GraphContext> {
  const graphClient = createGraphClient();

  // Default to IE if no jurisdictions specified
  const jurisdictions = filter.jurisdictions && filter.jurisdictions.length > 0
    ? filter.jurisdictions
    : ['IE'];

  const profileType = filter.profileType || 'single-director';

  try {
    // Get rules for primary jurisdiction
    const primaryJurisdiction = jurisdictions[0];
    const graphContext = await graphClient.getRulesForProfileAndJurisdiction(
      profileType,
      primaryJurisdiction
    );

    // If multiple jurisdictions, also get cross-border slice
    if (jurisdictions.length > 1) {
      const crossBorderContext = await graphClient.getCrossBorderSlice(jurisdictions);

      // Merge contexts (deduplicate nodes and edges)
      const nodeMap = new Map<string, typeof graphContext.nodes[0]>();
      const edgeSet = new Set<string>();
      const mergedEdges: typeof graphContext.edges = [];

      // Add nodes from both contexts
      for (const node of [...graphContext.nodes, ...crossBorderContext.nodes]) {
        if (!nodeMap.has(node.id)) {
          nodeMap.set(node.id, node);
        }
      }

      // Add edges from both contexts
      for (const edge of [...graphContext.edges, ...crossBorderContext.edges]) {
        const edgeKey = `${edge.source}-${edge.type}-${edge.target}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          mergedEdges.push(edge);
        }
      }

      graphContext.nodes = Array.from(nodeMap.values());
      graphContext.edges = mergedEdges;
    }

    return graphContext;
  } catch (error) {
    console.error('[GraphChangeDetector] Error querying graph:', error);
    // Return empty context on error
    return { nodes: [], edges: [] };
  }
}

/**
 * Get or create the singleton GraphChangeDetector instance
 *
 * @param config - Configuration options
 * @returns The shared GraphChangeDetector instance
 */
export function getGraphChangeDetector(config?: {
  pollIntervalMs?: number;
  useTimestamps?: boolean;
  batchWindowMs?: number;
  enableBatching?: boolean;
}): GraphChangeDetector {
  if (!detectorInstance) {
    console.log('[GraphChangeDetector] Creating new detector instance with config:', config);

    // Create detector with enhanced configuration
    // Note: Timestamp-based queries require a separate implementation
    // For now, we use the default snapshot-based approach
    detectorInstance = createGraphChangeDetector(queryGraphByFilter, config);

    // Start polling immediately
    detectorInstance.start();

    // Set up cleanup on process exit
    const cleanup = () => {
      if (detectorInstance) {
        console.log('[GraphChangeDetector] Stopping detector on process exit');
        detectorInstance.stop();
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }

  return detectorInstance;
}

/**
 * Stop and reset the detector instance
 * (Mainly for testing purposes)
 */
export function resetGraphChangeDetector(): void {
  if (detectorInstance) {
    detectorInstance.stop();
    detectorInstance = null;
  }
}
