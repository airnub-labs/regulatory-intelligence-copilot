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
import { LOG_PREFIX } from '../constants.js';

/**
 * Escape string for Cypher query
 */
function escapeCypher(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Parse Memgraph query result into GraphContext
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
    // Process nodes
    for (const [, value] of Object.entries(row)) {
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
              type: v.labels[0] as GraphNode['type'],
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

  return { nodes, edges };
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

      console.log(`${LOG_PREFIX.graph} Querying rules for profile ${profileId} in ${jurisdictionId}`);
      const result = await callMemgraphMcp(query);
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

      console.log(`${LOG_PREFIX.graph} Getting neighbourhood for ${nodeId}`);
      const result = await callMemgraphMcp(query);
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

      console.log(`${LOG_PREFIX.graph} Getting mutual exclusions for ${nodeId}`);
      const result = await callMemgraphMcp(query);
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

      console.log(`${LOG_PREFIX.graph} Getting timelines for ${nodeId}`);
      const result = await callMemgraphMcp(query);
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

      console.log(`${LOG_PREFIX.graph} Getting cross-border slice for ${jurisdictionIds.join(', ')}`);
      const result = await callMemgraphMcp(query);
      return parseGraphResult(result);
    },

    /**
     * Execute raw Cypher query
     */
    async executeCypher(query: string): Promise<unknown> {
      console.log(`${LOG_PREFIX.graph} Executing Cypher query`);
      return callMemgraphMcp(query);
    },
  };
}
