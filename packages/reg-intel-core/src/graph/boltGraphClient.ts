/**
 * Direct Bolt-based Memgraph Graph Client
 *
 * Provides direct connection to Memgraph using the Bolt protocol (via neo4j-driver).
 * This bypasses MCP for core graph operations, improving performance and reliability.
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import type {
  GraphClient,
  GraphContext,
  GraphNode,
  GraphEdge,
  Timeline,
} from '../types.js';
import { GraphError } from '../errors.js';
import { LOG_PREFIX } from '../constants.js';

/**
 * Configuration for Bolt GraphClient
 */
export interface BoltGraphClientConfig {
  uri: string; // e.g., "bolt://localhost:7687"
  username?: string;
  password?: string;
  database?: string; // default: "memgraph"
}

/**
 * Direct Bolt-based Memgraph GraphClient
 */
export class BoltGraphClient implements GraphClient {
  private driver: Driver;
  private database: string;

  constructor(config: BoltGraphClientConfig) {
    let auth;
    if (config.username && config.password) {
      auth = neo4j.auth.basic(config.username, config.password);
    } else {
      // No auth - pass undefined for Memgraph without authentication
      auth = undefined;
    }

    this.driver = neo4j.driver(config.uri, auth);
    this.database = config.database || 'memgraph';

    console.log(`${LOG_PREFIX.graph} BoltGraphClient initialized: ${config.uri}`);
  }

  /**
   * Execute a Cypher query and return raw results
   */
  async executeCypher(query: string, params?: Record<string, unknown>): Promise<unknown> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(query, params || {});
      return result.records.map(record => record.toObject());
    } catch (error) {
      console.error(`${LOG_PREFIX.graph} Cypher execution error:`, error);
      throw new GraphError(
        `Failed to execute Cypher query: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Parse Neo4j node to GraphNode
   */
  private parseNode(node: unknown): GraphNode | null {
    if (!node || typeof node !== 'object') return null;

    const n = node as {
      identity?: { low: number; high: number };
      labels?: string[];
      properties?: Record<string, unknown>;
    };

    if (!n.labels || n.labels.length === 0) return null;

    const props = n.properties || {};
    const id = props.id as string || `node_${n.identity?.low || 'unknown'}`;

    return {
      id,
      label: props.label as string || props.name as string || id,
      type: n.labels[0] as GraphNode['type'],
      properties: props,
    };
  }

  /**
   * Parse Neo4j relationship to GraphEdge
   */
  private parseRelationship(rel: unknown): GraphEdge | null {
    if (!rel || typeof rel !== 'object') return null;

    const r = rel as {
      start?: { low: number; high: number };
      end?: { low: number; high: number };
      type?: string;
      properties?: Record<string, unknown>;
    };

    if (!r.type || !r.start || !r.end) return null;

    return {
      source: `node_${r.start.low}`,
      target: `node_${r.end.low}`,
      type: r.type,
      properties: r.properties || {},
    };
  }

  /**
   * Parse query results into GraphContext
   */
  private parseGraphContext(records: Array<Record<string, unknown>>): GraphContext {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();

    for (const record of records) {
      for (const [, value] of Object.entries(record)) {
        // Check if it's a node
        if (value && typeof value === 'object' && 'labels' in value) {
          const node = this.parseNode(value);
          if (node && !seenNodes.has(node.id)) {
            seenNodes.add(node.id);
            nodes.push(node);
          }
        }

        // Check if it's a relationship
        if (value && typeof value === 'object' && 'type' in value && 'start' in value) {
          const edge = this.parseRelationship(value);
          if (edge) {
            const edgeKey = `${edge.source}-${edge.type}-${edge.target}`;
            if (!seenEdges.has(edgeKey)) {
              seenEdges.add(edgeKey);
              edges.push(edge);
            }
          }
        }

        // Handle arrays (path results, etc.)
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object') {
              if ('labels' in item) {
                const node = this.parseNode(item);
                if (node && !seenNodes.has(node.id)) {
                  seenNodes.add(node.id);
                  nodes.push(node);
                }
              }
              if ('type' in item && 'start' in item) {
                const edge = this.parseRelationship(item);
                if (edge) {
                  const edgeKey = `${edge.source}-${edge.type}-${edge.target}`;
                  if (!seenEdges.has(edgeKey)) {
                    seenEdges.add(edgeKey);
                    edges.push(edge);
                  }
                }
              }
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Get rules matching profile and jurisdiction with optional keyword
   */
  async getRulesForProfileAndJurisdiction(
    profileId: string,
    jurisdictionId: string,
    keyword?: string
  ): Promise<GraphContext> {
    console.log(`${LOG_PREFIX.graph} Getting rules for profile=${profileId}, jurisdiction=${jurisdictionId}, keyword=${keyword}`);

    let query = `
      MATCH (p:ProfileTag {id: $profileId})
      MATCH (j:Jurisdiction {id: $jurisdictionId})
      MATCH (rule)-[:APPLIES_TO]->(p)
      MATCH (rule)-[:IN_JURISDICTION]->(j)
    `;

    if (keyword) {
      query += `
      WHERE rule.label CONTAINS $keyword
         OR rule.name CONTAINS $keyword
         OR rule.description CONTAINS $keyword
      `;
    }

    query += `
      OPTIONAL MATCH (rule)-[r]->(related)
      RETURN rule, r, related
      LIMIT 50
    `;

    const records = await this.executeCypher(query, {
      profileId,
      jurisdictionId,
      keyword: keyword || '',
    }) as Array<Record<string, unknown>>;

    return this.parseGraphContext(records);
  }

  /**
   * Get neighbourhood of a node (1-2 hops)
   */
  async getNeighbourhood(nodeId: string): Promise<GraphContext> {
    console.log(`${LOG_PREFIX.graph} Getting neighbourhood for node=${nodeId}`);

    const query = `
      MATCH (n {id: $nodeId})
      OPTIONAL MATCH path = (n)-[r1]-(n1)
      OPTIONAL MATCH path2 = (n1)-[r2]-(n2)
      WHERE n2.id <> $nodeId
      RETURN n, r1, n1, r2, n2
      LIMIT 100
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;
    return this.parseGraphContext(records);
  }

  /**
   * Get mutual exclusions for a node
   */
  async getMutualExclusions(nodeId: string): Promise<GraphNode[]> {
    console.log(`${LOG_PREFIX.graph} Getting mutual exclusions for node=${nodeId}`);

    const query = `
      MATCH (n {id: $nodeId})-[:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH]-(excluded)
      RETURN excluded
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);
    return context.nodes;
  }

  /**
   * Get timeline constraints for a node
   */
  async getTimelines(nodeId: string): Promise<Timeline[]> {
    console.log(`${LOG_PREFIX.graph} Getting timelines for node=${nodeId}`);

    const query = `
      MATCH (n {id: $nodeId})-[:LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD|FILING_DEADLINE|EFFECTIVE_WINDOW]->(t:Timeline)
      RETURN t
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;

    const timelines: Timeline[] = [];
    for (const record of records) {
      const t = record.t;
      if (t && typeof t === 'object' && 'properties' in t) {
        const props = (t as { properties: Record<string, unknown> }).properties;
        timelines.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Timeline',
          window_days: props.window_days as number | undefined,
          window_months: props.window_months as number | undefined,
          window_years: props.window_years as number | undefined,
          notes: props.notes as string | undefined,
        });
      }
    }

    return timelines;
  }

  /**
   * Get cross-border slice for multiple jurisdictions
   */
  async getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphContext> {
    console.log(`${LOG_PREFIX.graph} Getting cross-border slice for jurisdictions=${jurisdictionIds.join(', ')}`);

    const query = `
      MATCH (j:Jurisdiction)
      WHERE j.id IN $jurisdictionIds
      MATCH (rule)-[:IN_JURISDICTION]->(j)
      OPTIONAL MATCH (rule)-[r:COORDINATED_WITH|TREATY_LINKED_TO|EQUIVALENT_TO]-(related)
      RETURN rule, r, related, j
      LIMIT 100
    `;

    const records = await this.executeCypher(query, { jurisdictionIds }) as Array<Record<string, unknown>>;
    return this.parseGraphContext(records);
  }

  /**
   * Close the driver connection
   */
  async close(): Promise<void> {
    await this.driver.close();
    console.log(`${LOG_PREFIX.graph} BoltGraphClient closed`);
  }
}

/**
 * Create a Bolt-based GraphClient from environment variables
 */
export function createBoltGraphClient(config?: Partial<BoltGraphClientConfig>): BoltGraphClient {
  const uri = config?.uri || process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
  const username = config?.username || process.env.MEMGRAPH_USERNAME;
  const password = config?.password || process.env.MEMGRAPH_PASSWORD;
  const database = config?.database || process.env.MEMGRAPH_DATABASE || 'memgraph';

  return new BoltGraphClient({
    uri,
    username,
    password,
    database,
  });
}
