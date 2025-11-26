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
  type GraphPatch,
} from '@reg-copilot/reg-intel-core';

let detectorInstance: GraphChangeDetector | null = null;
const MAX_PATCH_NODE_CHANGES = 250;
const MAX_PATCH_EDGE_CHANGES = 500;
const MAX_PATCH_TOTAL_CHANGES = 700;
const MIN_MS_BETWEEN_PATCHES = 750;
const lastEmissionByFilter = new Map<string, number>();

function normalizeProfileType(profileType?: string) {
  return (profileType || 'single-director').replace('_', '-');
}

/**
 * Query function that fetches graph state based on filter criteria
 */
async function queryGraphByFilter(filter: ChangeFilter): Promise<GraphContext> {
  const graphClient = createGraphClient();

  // Default to IE if no jurisdictions specified
  const jurisdictions = filter.jurisdictions && filter.jurisdictions.length > 0
    ? filter.jurisdictions
    : ['IE'];

  const profileType = normalizeProfileType(filter.profileType);

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
 * Timestamp-based query function for efficient change detection
 * Only fetches nodes that have been updated since the given timestamp
 */
async function queryGraphByTimestamp(
  filter: ChangeFilter,
  since: Date
): Promise<GraphContext> {
  const graphClient = createGraphClient();

  // Default to IE if no jurisdictions specified
  const jurisdictions = filter.jurisdictions && filter.jurisdictions.length > 0
    ? filter.jurisdictions
    : ['IE'];

  const profileType = normalizeProfileType(filter.profileType);

  try {
    // Convert timestamp to ISO format for Cypher query
    const sinceIso = since.toISOString();

    // Build jurisdiction filter
    const jurisdictionList = jurisdictions.map(j => `'${j}'`).join(', ');

    // Query nodes updated since timestamp
    const query = `
      MATCH (p:ProfileTag {id: '${profileType}'})
      MATCH (j:Jurisdiction)
      WHERE j.id IN [${jurisdictionList}]
      MATCH (n)-[:IN_JURISDICTION]->(j)
      WHERE (n:Benefit OR n:Relief OR n:Section)
        AND (n)-[:APPLIES_TO]->(p)
        AND (
          n.updated_at IS NOT NULL
          AND datetime(n.updated_at) >= datetime('${sinceIso}')
        )
      OPTIONAL MATCH (n)-[r:CITES|REQUIRES|LIMITED_BY|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD]->(m)
      RETURN n, collect(r) AS rels, collect(m) AS neighbours
    `;

    console.log(`[GraphChangeDetector] Timestamp query since ${sinceIso}`);
    const result = await graphClient.executeCypher(query);

    // Parse result into GraphContext format
    const nodes: GraphContext['nodes'] = [];
    const edges: GraphContext['edges'] = [];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();

    if (result && Array.isArray(result)) {
      for (const row of result) {
        // Process nodes
        for (const [key, value] of Object.entries(row)) {
          if (value && typeof value === 'object') {
            const v = value as Record<string, unknown>;

            // Check if it's a node
            if (v.id && v.labels && Array.isArray(v.labels)) {
              const nodeId = String(v.id);
              if (!seenNodes.has(nodeId)) {
                seenNodes.add(nodeId);
                const props = (v.properties || {}) as Record<string, unknown>;
                nodes.push({
                  id: props.id as string || nodeId,
                  label: props.label as string || props.name as string || String(v.labels[0]),
                  type: v.labels[0] as GraphContext['nodes'][0]['type'],
                  properties: props,
                });
              }
            }

            // Check if it's an edge/relationship
            if (v.type && v.start && v.end) {
              const edgeKey = `${v.start}-${v.type}-${v.end}`;
              if (!seenEdges.has(edgeKey)) {
                seenEdges.add(edgeKey);
                edges.push({
                  source: String(v.start),
                  target: String(v.end),
                  type: String(v.type),
                  properties: (v.properties || {}) as Record<string, unknown>,
                });
              }
            }
          }
        }
      }
    }

    return { nodes, edges };
  } catch (error) {
    console.error('[GraphChangeDetector] Error in timestamp query:', error);
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
  maxNodesPerPatch?: number;
  maxEdgesPerPatch?: number;
  maxTotalChanges?: number;
}): GraphChangeDetector {
  if (!detectorInstance) {
    console.log('[GraphChangeDetector] Creating new detector instance with config:', config);

    // Create detector with timestamp-based queries and change batching enabled
    const mergedConfig = {
      pollIntervalMs: config?.pollIntervalMs ?? 5000,
      useTimestamps: config?.useTimestamps ?? true,
      batchWindowMs: config?.batchWindowMs ?? 1000,
      enableBatching: config?.enableBatching ?? true,
      maxNodesPerPatch: config?.maxNodesPerPatch ?? MAX_PATCH_NODE_CHANGES,
      maxEdgesPerPatch: config?.maxEdgesPerPatch ?? MAX_PATCH_EDGE_CHANGES,
      maxTotalChanges: config?.maxTotalChanges ?? MAX_PATCH_TOTAL_CHANGES,
    };

    detectorInstance = createGraphChangeDetector(
      queryGraphByFilter,
      mergedConfig,
      queryGraphByTimestamp
    );

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

function getFilterKey(filter: ChangeFilter): string {
  const jurisdictions = filter.jurisdictions?.slice().sort().join(',') || '*';
  const profileType = normalizeProfileType(filter.profileType);
  return `${jurisdictions}:${profileType}`;
}

function shouldThrottlePatch(filter: ChangeFilter, patch: GraphPatch): boolean {
  const filterKey = getFilterKey(filter);
  if (patch.meta.truncated || patch.meta.totalChanges > MAX_PATCH_TOTAL_CHANGES) {
    console.warn('[GraphChangeDetector] Dropping oversized patch', {
      filter: filterKey,
      meta: patch.meta,
    });
    return true;
  }

  const now = Date.now();
  const lastEmission = lastEmissionByFilter.get(filterKey) ?? 0;
  if (now - lastEmission < MIN_MS_BETWEEN_PATCHES) {
    return true;
  }

  lastEmissionByFilter.set(filterKey, now);
  return false;
}

export function subscribeToGraphPatches(
  filter: ChangeFilter,
  callback: (patch: GraphPatch) => void
): { unsubscribe: () => void } {
  const detector = getGraphChangeDetector();
  const wrappedCallback = (patch: GraphPatch) => {
    if (shouldThrottlePatch(filter, patch)) return;
    callback(patch);
  };

  const subscription = detector.subscribe(filter, wrappedCallback);
  return {
    unsubscribe: () => subscription.unsubscribe(),
  };
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
  lastEmissionByFilter.clear();
}
