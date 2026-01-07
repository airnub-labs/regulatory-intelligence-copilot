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
 * Enriched relationship returned from queries with semantic IDs
 * (Option A: Query-Level ID Resolution)
 */
interface EnrichedRelationship {
  sourceId: string;
  targetId: string;
  type: string;
  properties: Record<string, unknown>;
}

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
 * Handles enriched relationship format (Option A) with semantic IDs.
 * Single-pass parsing for optimal performance.
 */
function parseGraphResult(result: unknown): GraphContext {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  if (!result || !Array.isArray(result)) {
    return { nodes, edges };
  }

  for (const row of result) {
    for (const [key, value] of Object.entries(row)) {
      // Handle enriched relationships (Option A format)
      if ((key === 'enrichedRels' || key === 'enrichedRels1' || key === 'enrichedRels2') && Array.isArray(value)) {
        for (const enriched of value) {
          if (enriched && typeof enriched === 'object') {
            const e = enriched as { sourceId?: string; targetId?: string; type?: string; properties?: Record<string, unknown> };
            if (e.sourceId && e.targetId && e.type) {
              const edgeKey = `${e.sourceId}-${e.type}-${e.targetId}`;
              if (!seenEdges.has(edgeKey)) {
                seenEdges.add(edgeKey);
                edges.push({
                  source: e.sourceId,
                  target: e.targetId,
                  type: e.type,
                  properties: e.properties || {},
                });
              }
            }
          }
        }
        continue;
      }

      // Handle nodes
      collectNodesFromValue(value, nodes, seenNodes);
    }
  }

  return { nodes, edges };
}

/**
 * Recursively collect nodes from a value
 */
function collectNodesFromValue(
  value: unknown,
  nodes: GraphNode[],
  seenNodes: Set<string>
): void {
  if (!value || typeof value !== 'object') return;

  const v = value as Record<string, unknown>;

  // Check if it's a node (has id and labels)
  if (v.id && v.labels && Array.isArray(v.labels)) {
    const props = (v.properties || {}) as Record<string, unknown>;
    const semanticId = props.id as string || String(v.id);

    if (!seenNodes.has(semanticId)) {
      seenNodes.add(semanticId);
      nodes.push({
        id: semanticId,
        label: props.label as string || props.name as string || String(v.labels[0]),
        type: v.labels[0] as GraphNode['type'],
        properties: props,
      });
    }
  }

  // Handle arrays (collected nodes, neighbours, etc.)
  if (Array.isArray(value)) {
    for (const item of value) {
      collectNodesFromValue(item, nodes, seenNodes);
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
     * Uses Option A: Returns enriched relationships with semantic IDs
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
        MATCH (n)-[:APPLIES_TO_PROFILE]->(p)
        OPTIONAL MATCH (n)-[r:CITES|REQUIRES|LIMITED_BY|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD]->(m)
        WITH n,
             CASE WHEN r IS NOT NULL AND m IS NOT NULL
                  THEN {sourceId: n.id, targetId: m.id, type: type(r), properties: properties(r)}
                  ELSE NULL
             END AS enrichedRel,
             m
        RETURN n, collect(enrichedRel) AS enrichedRels, collect(m) AS neighbours
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
     * Uses Option A: Returns enriched relationships with semantic IDs
     */
    async getNeighbourhood(nodeId: string): Promise<GraphContext> {
      const query = `
        MATCH (n {id: '${escapeCypher(nodeId)}'})
        OPTIONAL MATCH (n)-[r1]-(n1)
        OPTIONAL MATCH (n1)-[r2]-(n2)
        WHERE n2 IS NULL OR n2.id <> '${escapeCypher(nodeId)}'
        WITH n, n1, n2,
             CASE WHEN r1 IS NOT NULL AND n1 IS NOT NULL
                  THEN {sourceId: CASE WHEN startNode(r1) = n THEN n.id ELSE n1.id END,
                        targetId: CASE WHEN endNode(r1) = n THEN n.id ELSE n1.id END,
                        type: type(r1), properties: properties(r1)}
                  ELSE NULL
             END AS rel1,
             CASE WHEN r2 IS NOT NULL AND n2 IS NOT NULL
                  THEN {sourceId: CASE WHEN startNode(r2) = n1 THEN n1.id ELSE n2.id END,
                        targetId: CASE WHEN endNode(r2) = n1 THEN n1.id ELSE n2.id END,
                        type: type(r2), properties: properties(r2)}
                  ELSE NULL
             END AS rel2
        RETURN n, collect(DISTINCT n1) AS neighbours1, collect(DISTINCT n2) AS neighbours2,
               collect(DISTINCT rel1) AS enrichedRels1, collect(DISTINCT rel2) AS enrichedRels2
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
     * Uses Option A: Returns enriched relationships with semantic IDs
     */
    async getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphContext> {
      const jurisdictionList = jurisdictionIds.map(j => `'${escapeCypher(j)}'`).join(', ');

      const query = `
        MATCH (j:Jurisdiction)
        WHERE j.id IN [${jurisdictionList}]
        MATCH (n)-[:IN_JURISDICTION]->(j)
        WHERE n:Benefit OR n:Relief OR n:Section
        OPTIONAL MATCH (n)-[r:COORDINATED_WITH|TREATY_LINKED_TO|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|EQUIVALENT_TO]-(m)
        OPTIONAL MATCH (m)-[:IN_JURISDICTION]->(j2:Jurisdiction)
        WHERE j2.id IN [${jurisdictionList}]
        WITH n, m,
             CASE WHEN r IS NOT NULL AND m IS NOT NULL
                  THEN {sourceId: CASE WHEN startNode(r) = n THEN n.id ELSE m.id END,
                        targetId: CASE WHEN endNode(r) = n THEN n.id ELSE m.id END,
                        type: type(r), properties: properties(r)}
                  ELSE NULL
             END AS enrichedRel
        RETURN n, collect(enrichedRel) AS enrichedRels, collect(m) AS related
        LIMIT 1000
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
