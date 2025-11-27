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
import { sanitizeObjectForEgress } from '@reg-copilot/reg-intel-llm';
import { callMemgraphMcp } from '../mcpClient.js';
import { ensureMcpGatewayConfigured } from '../sandboxManager.js';
import { createLogger } from '../logger.js';
import { getContext } from '../observability/requestContext.js';
import { startSpan } from '../observability/spanLogger.js';

const logger = createLogger({ component: 'GraphClient' });

const MEMGRAPH_QUERY_LOG_SAMPLE_RATE = Number.parseFloat(
  process.env.MEMGRAPH_QUERY_LOG_SAMPLE_RATE ?? '0.35'
);
const MEMGRAPH_ZERO_RESULT_LOG_SAMPLE_RATE = Number.parseFloat(
  process.env.MEMGRAPH_ZERO_RESULT_LOG_SAMPLE_RATE ?? '1'
);
const MEMGRAPH_LOG_MAX_CHARS = Number.parseInt(process.env.MEMGRAPH_LOG_MAX_CHARS ?? '640', 10);

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

function shouldSample(sampleRate: number): boolean {
  if (Number.isNaN(sampleRate) || sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return Math.random() < sampleRate;
}

function sanitizeQuerySnippet(query: string): string {
  const sanitized = sanitizeObjectForEgress(query);
  const normalized = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
  if (!normalized) return '';
  return normalized.length > MEMGRAPH_LOG_MAX_CHARS
    ? `${normalized.slice(0, MEMGRAPH_LOG_MAX_CHARS)}…`
    : normalized;
}

function getResultSize(result: unknown): number {
  if (!result) return 0;
  if (Array.isArray(result)) return result.length;
  if (typeof result === 'object') return Object.keys(result as Record<string, unknown>).length;
  return 1;
}

async function runMemgraphQuery(query: string): Promise<unknown> {
  await ensureMcpGatewayConfigured();

  const { correlationId } = getContext();
  const start = Date.now();
  const sanitizedQuery = sanitizeQuerySnippet(query);
  const toolName = 'memgraph_mcp.run_query';
  const log = logger.childWithContext({ correlationId, toolName });
  const span = startSpan({
    name: 'memgraph.query',
    provider: 'memgraph',
    toolName,
    attributes: { query: sanitizedQuery },
  });

  if (shouldSample(MEMGRAPH_QUERY_LOG_SAMPLE_RATE)) {
    log.info('Executing Memgraph query', { query: sanitizedQuery });
  }

  try {
    const result = await callMemgraphMcp(query);
    const durationMs = Date.now() - start;
    const resultSize = getResultSize(result);

    log.info('Memgraph query completed', {
      toolName,
      durationMs,
      resultSize,
      correlationId,
      query: sanitizedQuery,
    });
    span.end({ durationMs, resultSize });

    if (resultSize === 0 && shouldSample(MEMGRAPH_ZERO_RESULT_LOG_SAMPLE_RATE)) {
      log.warn('Memgraph query returned no results', {
        toolName,
        durationMs,
        correlationId,
        query: sanitizedQuery,
      });
    }

    if (result === null || result === undefined) {
      log.warn('Memgraph query returned an empty payload', {
        toolName,
        durationMs,
        correlationId,
      });
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - start;

    log.error('Memgraph query failed', {
      toolName,
      durationMs,
      correlationId,
      query: sanitizedQuery,
      error,
    });
    span.error(error, { durationMs });

    throw error;
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

      logger.info('Querying rules for profile and jurisdiction', { profileId, jurisdictionId });
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

      logger.info('Getting neighbourhood', { nodeId });
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

      logger.info('Getting mutual exclusions', { nodeId });
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

      logger.info('Getting timelines', { nodeId });
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

      logger.info('Getting cross-border slice', { jurisdictions: jurisdictionIds });
      const result = await runMemgraphQuery(query);
      return parseGraphResult(result);
    },

    /**
     * Execute raw Cypher query
     */
    async executeCypher(query: string): Promise<unknown> {
      logger.info('Executing custom Cypher query');
      return runMemgraphQuery(query);
    },
  };
}
