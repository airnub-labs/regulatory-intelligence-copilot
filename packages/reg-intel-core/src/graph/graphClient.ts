/**
 * Graph Client for Regulatory Intelligence Copilot
 *
 * Provides high-level methods to query the Memgraph regulatory knowledge graph
 * following the v0.2 schema specification.
 */

import type {
  GraphClient,
  GraphContext,
  GraphNode,
  GraphEdge,
  Timeline,
} from '../types.js';
import { callMemgraphMcp } from '../mcpClient.js';
import { ensureMcpGatewayConfigured } from '../sandboxManager.js';
import { createLogger, recordGraphQuery } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('GraphClient', { component: 'Graph' });

/**
 * Escape string for Cypher query
 */
function escapeCypher(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Parse Memgraph query result into GraphContext
 *
 * IMPORTANT: We must track a mapping from internal ID to semantic ID
 * because relationships reference nodes by internal ID, but we use semantic IDs.
 */
function parseGraphResult(result: unknown): GraphContext {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();
  // Map from internal ID to semantic node ID
  const internalToSemanticId = new Map<string, string>();

  if (!result || !Array.isArray(result)) {
    return { nodes, edges };
  }

  // First pass: collect all nodes and build ID mapping
  for (const row of result) {
    for (const [, value] of Object.entries(row)) {
      collectNodesFromValue(value, nodes, seenNodes, internalToSemanticId);
    }
  }

  // Second pass: collect all relationships using the ID mapping
  for (const row of result) {
    for (const [, value] of Object.entries(row)) {
      collectEdgesFromValue(value, edges, seenEdges, internalToSemanticId);
    }
  }

  return { nodes, edges };
}

/**
 * Recursively collect nodes from a value and build ID mapping
 */
function collectNodesFromValue(
  value: unknown,
  nodes: GraphNode[],
  seenNodes: Set<string>,
  internalToSemanticId: Map<string, string>
): void {
  if (!value || typeof value !== 'object') return;

  const v = value as Record<string, unknown>;

  // Check if it's a node (has id and labels)
  if (v.id && v.labels && Array.isArray(v.labels)) {
    const internalId = String(v.id);
    const props = (v.properties || {}) as Record<string, unknown>;
    const semanticId = props.id as string || internalId;

    if (!seenNodes.has(semanticId)) {
      seenNodes.add(semanticId);
      nodes.push({
        id: semanticId,
        label: props.label as string || props.name as string || String(v.labels[0]),
        type: v.labels[0] as GraphNode['type'],
        properties: props,
      });

      // Build mapping from internal ID to semantic ID for relationship resolution
      internalToSemanticId.set(internalId, semanticId);
    }
  }

  // Handle arrays (collected nodes, neighbours, etc.)
  if (Array.isArray(value)) {
    for (const item of value) {
      collectNodesFromValue(item, nodes, seenNodes, internalToSemanticId);
    }
  }
}

/**
 * Recursively collect edges from a value, resolving internal IDs to semantic IDs
 */
function collectEdgesFromValue(
  value: unknown,
  edges: GraphEdge[],
  seenEdges: Set<string>,
  internalToSemanticId: Map<string, string>
): void {
  if (!value || typeof value !== 'object') return;

  const v = value as Record<string, unknown>;

  // Check if it's an edge/relationship (has type, start, end but no labels)
  if (v.type && v.start && v.end && !v.labels) {
    const internalStart = String(v.start);
    const internalEnd = String(v.end);

    // Resolve internal IDs to semantic IDs
    const sourceId = internalToSemanticId.get(internalStart) ?? internalStart;
    const targetId = internalToSemanticId.get(internalEnd) ?? internalEnd;

    const edgeKey = `${sourceId}-${v.type}-${targetId}`;
    if (!seenEdges.has(edgeKey)) {
      seenEdges.add(edgeKey);
      edges.push({
        source: sourceId,
        target: targetId,
        type: String(v.type),
        properties: (v.properties || {}) as Record<string, unknown>,
      });
    }
  }

  // Handle arrays (collected relationships, etc.)
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEdgesFromValue(item, edges, seenEdges, internalToSemanticId);
    }
  }
}

/**
 * Parse timeline nodes from query result
 */
function parseTimelineResult(result: unknown): Timeline[] {
  const timelines: Timeline[] = [];

  if (!result || !Array.isArray(result)) {
    return timelines;
  }

  for (const row of result) {
    for (const [, value] of Object.entries(row)) {
      if (value && typeof value === 'object') {
        const v = value as Record<string, unknown>;
        if (v.labels && Array.isArray(v.labels) && v.labels.includes('Timeline')) {
          const props = (v.properties || {}) as Record<string, unknown>;
          timelines.push({
            id: props.id as string || String(v.id),
            label: props.label as string || 'Unknown',
            window_days: props.window_days as number | undefined,
            window_months: props.window_months as number | undefined,
            window_years: props.window_years as number | undefined,
            notes: props.notes as string | undefined,
          });
        }
      }
    }
  }

  return timelines;
}

async function runMemgraphQuery(query: string, operation = 'read'): Promise<unknown> {
  const startTime = Date.now();
  let success = true;
  let result: unknown = null;
  let nodeCount: number | undefined;

  try {
    await ensureMcpGatewayConfigured();
    result = await callMemgraphMcp(query);

    // Try to count nodes in result for metrics
    if (Array.isArray(result)) {
      nodeCount = result.length;
    }

    return result;
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const durationMs = Date.now() - startTime;

    // Record graph query metrics
    recordGraphQuery(durationMs, {
      operation,
      queryType: 'cypher',
      success,
      ...(nodeCount !== undefined && { nodeCount }),
    });
  }
}

/**
 * Create a GraphClient instance
 */
export function createGraphClient(): GraphClient {
  return {
    /**
     * Get rules matching profile and jurisdiction with optional keyword
     */
    async getRulesForProfileAndJurisdiction(
      profileId: string,
      jurisdictionId: string,
      keyword?: string
    ): Promise<GraphContext> {
      const keywordFilter = keyword
        ? `AND (n.name CONTAINS '${escapeCypher(keyword)}' OR n.title CONTAINS '${escapeCypher(keyword)}')`
        : '';

      const query = `
        MATCH (p:ProfileTag {id: '${escapeCypher(profileId)}'})
        MATCH (j:Jurisdiction {id: '${escapeCypher(jurisdictionId)}'})
        MATCH (n)-[:IN_JURISDICTION]->(j)
        WHERE (n:Benefit OR n:Relief OR n:Section)
        ${keywordFilter}
        MATCH (n)-[:APPLIES_TO]->(p)
        OPTIONAL MATCH (n)-[r:CITES|REQUIRES|LIMITED_BY|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD]->(m)
        RETURN n, collect(r) AS rels, collect(m) AS neighbours
        LIMIT 100
      `;

      logger.info({
        event: 'graph.query.rules',
        profileId,
        jurisdictionId,
        keyword: keyword || undefined,
      });
      const result = await runMemgraphQuery(query);
      return parseGraphResult(result);
    },

    /**
     * Get neighbourhood of a node (1-2 hops)
     */
    async getNeighbourhood(nodeId: string): Promise<GraphContext> {
      const query = `
        MATCH (n {id: '${escapeCypher(nodeId)}'})
        OPTIONAL MATCH (n)-[r1]->(m1)
        OPTIONAL MATCH (m1)-[r2]->(m2)
        RETURN n, r1, m1, r2, m2
        LIMIT 500
      `;

      logger.info({ event: 'graph.query.neighbourhood', nodeId });
      const result = await runMemgraphQuery(query);
      return parseGraphResult(result);
    },

    /**
     * Get mutual exclusions for a node
     */
    async getMutualExclusions(nodeId: string): Promise<GraphNode[]> {
      const query = `
        MATCH (n {id: '${escapeCypher(nodeId)}'})
        OPTIONAL MATCH (n)-[r:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH]-(m)
        RETURN m
      `;

      logger.info({ event: 'graph.query.mutualExclusions', nodeId });
      const result = await runMemgraphQuery(query);
      const context = parseGraphResult(result);
      return context.nodes;
    },

    /**
     * Get timeline constraints for a node
     */
    async getTimelines(nodeId: string): Promise<Timeline[]> {
      const query = `
        MATCH (n {id: '${escapeCypher(nodeId)}'})
        OPTIONAL MATCH (n)-[:LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD]->(t:Timeline)
        RETURN t
      `;

      logger.info({ event: 'graph.query.timelines', nodeId });
      const result = await runMemgraphQuery(query);
      return parseTimelineResult(result);
    },

    /**
     * Get cross-border slice for multiple jurisdictions
     */
    async getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphContext> {
      const jurisdictionList = jurisdictionIds.map(j => `'${escapeCypher(j)}'`).join(', ');

      const query = `
        MATCH (j:Jurisdiction)
        WHERE j.id IN [${jurisdictionList}]
        MATCH (n)-[:IN_JURISDICTION]->(j)
        WHERE n:Benefit OR n:Relief OR n:Section
        OPTIONAL MATCH (n)-[r:COORDINATED_WITH|TREATY_LINKED_TO|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|EQUIVALENT_TO]->(m)
        OPTIONAL MATCH (m)-[:IN_JURISDICTION]->(j2:Jurisdiction)
        WHERE j2.id IN [${jurisdictionList}]
        RETURN n, r, m
      `;

      logger.info({ event: 'graph.query.crossBorderSlice', jurisdictions: jurisdictionIds });
      const result = await runMemgraphQuery(query);
      return parseGraphResult(result);
    },

    /**
     * Execute raw Cypher query
     */
    async executeCypher(query: string): Promise<unknown> {
      logger.info({ event: 'graph.query.raw' });
      return runMemgraphQuery(query);
    },
  };
}
