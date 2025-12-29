/**
 * Direct Bolt-based Memgraph Graph Client
 *
 * Provides direct connection to Memgraph using the Bolt protocol (via neo4j-driver).
 * This bypasses MCP for core graph operations, improving performance and reliability.
 */

import { createHash } from 'node:crypto';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { SEMATTRS_DB_SYSTEM, SEMATTRS_DB_NAME, SEMATTRS_DB_OPERATION, SEMATTRS_DB_STATEMENT } from '@opentelemetry/semantic-conventions';
import { createLogger, withSpan } from '@reg-copilot/reg-intel-observability';
import type {
  GraphClient,
  GraphContext,
  GraphNode,
  GraphEdge,
  Timeline,
  Obligation,
  Threshold,
  Rate,
  Form,
  PRSIClass,
  LifeEvent,
} from './types.js';
import { GraphError } from './errors.js';
import { LOG_PREFIX } from './constants.js';

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
  private logger = createLogger('BoltGraphClient', { component: 'GraphClient' });

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

    this.logger.info({ uri: config.uri }, `${LOG_PREFIX.graph} BoltGraphClient initialized`);
  }

  /**
   * Execute a Cypher query and return raw results
   */
  async executeCypher(query: string, params?: Record<string, unknown>): Promise<unknown> {
    const queryHash = createHash('sha256').update(query).digest('hex');

    return withSpan(
      'db.memgraph.query',
      {
        [SEMATTRS_DB_SYSTEM]: 'memgraph',
        [SEMATTRS_DB_NAME]: this.database,
        [SEMATTRS_DB_OPERATION]: 'query',
        [SEMATTRS_DB_STATEMENT]: `hash:sha256:${queryHash}`,
      },
      async () => {
        const session = this.driver.session({ database: this.database });

        // Debug logging for query execution
        this.logger.debug({
          queryHash,
          database: this.database,
          query: query.substring(0, 200), // Log first 200 chars of query
          hasParams: !!params && Object.keys(params).length > 0,
          paramKeys: params ? Object.keys(params) : [],
        }, `${LOG_PREFIX.graph} Executing Cypher query`);

        try {
          const result = await session.run(query, params || {});
          const recordCount = result.records.length;

          this.logger.debug({
            queryHash,
            recordCount,
          }, `${LOG_PREFIX.graph} Cypher query completed`);

          return result.records.map(record => record.toObject());
        } catch (error) {
          this.logger.error({
            error,
            queryHash,
          }, `${LOG_PREFIX.graph} Cypher execution error`);
          throw new GraphError(
            `Failed to execute Cypher query: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        } finally {
          await session.close();
        }
      }
    );
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
    this.logger.info({
      profileId,
      jurisdictionId,
      keyword,
    }, `${LOG_PREFIX.graph} Getting rules`);

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
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting neighbourhood`);

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
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting mutual exclusions`);

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
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting timelines`);

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
    this.logger.info({ jurisdictions: jurisdictionIds }, `${LOG_PREFIX.graph} Getting cross-border slice`);

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
   * Get obligations for a profile and jurisdiction
   */
  async getObligationsForProfile(
    profileId: string,
    jurisdictionId: string
  ): Promise<Obligation[]> {
    this.logger.info({
      profileId,
      jurisdictionId,
    }, `${LOG_PREFIX.graph} Getting obligations for profile`);

    const query = `
      MATCH (p:ProfileTag {id: $profileId})
      MATCH (j:Jurisdiction {id: $jurisdictionId})
      MATCH (p)-[:HAS_OBLIGATION]->(o:Obligation)-[:IN_JURISDICTION]->(j)
      RETURN o
    `;

    const records = await this.executeCypher(query, { profileId, jurisdictionId }) as Array<Record<string, unknown>>;

    const obligations: Obligation[] = [];
    for (const record of records) {
      const o = record.o;
      if (o && typeof o === 'object' && 'properties' in o) {
        const props = (o as { properties: Record<string, unknown> }).properties;
        obligations.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Obligation',
          category: (props.category as Obligation['category']) || 'FILING',
          frequency: props.frequency as Obligation['frequency'],
          penalty_applies: props.penalty_applies as boolean | undefined,
          description: props.description as string | undefined,
        });
      }
    }

    return obligations;
  }

  /**
   * Get thresholds for a condition
   */
  async getThresholdsForCondition(conditionId: string): Promise<Threshold[]> {
    this.logger.info({ conditionId }, `${LOG_PREFIX.graph} Getting thresholds for condition`);

    const query = `
      MATCH (c:Condition {id: $conditionId})-[:HAS_THRESHOLD]->(t:Threshold)
      RETURN t
    `;

    const records = await this.executeCypher(query, { conditionId }) as Array<Record<string, unknown>>;

    const thresholds: Threshold[] = [];
    for (const record of records) {
      const t = record.t;
      if (t && typeof t === 'object' && 'properties' in t) {
        const props = (t as { properties: Record<string, unknown> }).properties;
        thresholds.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Threshold',
          value: props.value as number || 0,
          unit: (props.unit as Threshold['unit']) || 'EUR',
          direction: (props.direction as Threshold['direction']) || 'BELOW',
          upper_bound: props.upper_bound as number | undefined,
          effective_from: props.effective_from as string | undefined,
          effective_to: props.effective_to as string | undefined,
          category: props.category as string | undefined,
        });
      }
    }

    return thresholds;
  }

  /**
   * Get rates for a category and jurisdiction
   */
  async getRatesForCategory(
    category: string,
    jurisdictionId: string
  ): Promise<Rate[]> {
    this.logger.info({
      category,
      jurisdictionId,
    }, `${LOG_PREFIX.graph} Getting rates for category`);

    const query = `
      MATCH (j:Jurisdiction {id: $jurisdictionId})
      MATCH (r:Rate {category: $category})-[:IN_JURISDICTION]->(j)
      RETURN r
    `;

    const records = await this.executeCypher(query, { category, jurisdictionId }) as Array<Record<string, unknown>>;

    const rates: Rate[] = [];
    for (const record of records) {
      const r = record.r;
      if (r && typeof r === 'object' && 'properties' in r) {
        const props = (r as { properties: Record<string, unknown> }).properties;
        rates.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Rate',
          percentage: props.percentage as number | undefined,
          flat_amount: props.flat_amount as number | undefined,
          currency: props.currency as string | undefined,
          band_lower: props.band_lower as number | undefined,
          band_upper: props.band_upper as number | undefined,
          effective_from: props.effective_from as string | undefined,
          effective_to: props.effective_to as string | undefined,
          category: props.category as string || category,
        });
      }
    }

    return rates;
  }

  /**
   * Check if a value is near any threshold (within tolerance)
   */
  async getThresholdsNearValue(
    value: number,
    unit: string,
    tolerancePercent: number
  ): Promise<Threshold[]> {
    this.logger.info({
      value,
      unit,
      tolerancePercent,
    }, `${LOG_PREFIX.graph} Getting thresholds near value`);

    const lowerBound = value * (1 - tolerancePercent / 100);
    const upperBound = value * (1 + tolerancePercent / 100);

    const query = `
      MATCH (t:Threshold {unit: $unit})
      WHERE t.value >= $lowerBound AND t.value <= $upperBound
      RETURN t
    `;

    const records = await this.executeCypher(query, { unit, lowerBound, upperBound }) as Array<Record<string, unknown>>;

    const thresholds: Threshold[] = [];
    for (const record of records) {
      const t = record.t;
      if (t && typeof t === 'object' && 'properties' in t) {
        const props = (t as { properties: Record<string, unknown> }).properties;
        thresholds.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Threshold',
          value: props.value as number || 0,
          unit: (props.unit as Threshold['unit']) || 'EUR',
          direction: (props.direction as Threshold['direction']) || 'BELOW',
          upper_bound: props.upper_bound as number | undefined,
          effective_from: props.effective_from as string | undefined,
          effective_to: props.effective_to as string | undefined,
          category: props.category as string | undefined,
        });
      }
    }

    return thresholds;
  }

  /**
   * Get form required for an obligation or benefit
   */
  async getFormForObligation(obligationId: string): Promise<Form | null> {
    this.logger.info({ obligationId }, `${LOG_PREFIX.graph} Getting form for obligation`);

    const query = `
      MATCH (o:Obligation {id: $obligationId})-[:REQUIRES_FORM]->(f:Form)
      RETURN f
      LIMIT 1
    `;

    const records = await this.executeCypher(query, { obligationId }) as Array<Record<string, unknown>>;

    if (records.length === 0) {
      return null;
    }

    const f = records[0].f;
    if (f && typeof f === 'object' && 'properties' in f) {
      const props = (f as { properties: Record<string, unknown> }).properties;
      return {
        id: props.id as string || 'unknown',
        label: props.label as string || 'Unknown Form',
        issuing_body: props.issuing_body as string || 'Unknown',
        form_number: props.form_number as string | undefined,
        source_url: props.source_url as string | undefined,
        category: props.category as string || 'UNKNOWN',
        online_only: props.online_only as boolean | undefined,
      };
    }

    return null;
  }

  /**
   * Get concept hierarchy (broader/narrower concepts)
   */
  async getConceptHierarchy(conceptId: string): Promise<{
    broader: GraphNode[];
    narrower: GraphNode[];
    related: GraphNode[];
  }> {
    this.logger.info({ conceptId }, `${LOG_PREFIX.graph} Getting concept hierarchy`);

    const query = `
      MATCH (c:Concept {id: $conceptId})
      OPTIONAL MATCH (c)-[:BROADER]->(broader)
      OPTIONAL MATCH (c)-[:NARROWER]->(narrower)
      OPTIONAL MATCH (c)-[:RELATED]->(related)
      RETURN broader, narrower, related
    `;

    const records = await this.executeCypher(query, { conceptId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);

    // Separate nodes by relationship type
    const broader: GraphNode[] = [];
    const narrower: GraphNode[] = [];
    const related: GraphNode[] = [];

    // This is a simplified approach - ideally we'd track which edge type each node came from
    // For now, we'll just return all nodes in each category
    for (const node of context.nodes) {
      if (node.id !== conceptId) {
        // We'd need to check the relationship type to categorize properly
        // For now, we'll just put them all in related
        related.push(node);
      }
    }

    return { broader, narrower, related };
  }

  /**
   * Get PRSI class by ID
   */
  async getPRSIClassById(prsiClassId: string): Promise<PRSIClass | null> {
    this.logger.info({ prsiClassId }, `${LOG_PREFIX.graph} Getting PRSI class by ID`);

    const query = `
      MATCH (p:PRSIClass {id: $prsiClassId})
      RETURN p
      LIMIT 1
    `;

    const records = await this.executeCypher(query, { prsiClassId }) as Array<Record<string, unknown>>;

    if (records.length === 0) {
      return null;
    }

    const p = records[0].p;
    if (p && typeof p === 'object' && 'properties' in p) {
      const props = (p as { properties: Record<string, unknown> }).properties;
      return {
        id: props.id as string || 'unknown',
        label: props.label as string || 'Unknown PRSI Class',
        description: props.description as string || '',
        eligible_benefits: props.eligible_benefits as string[] | undefined,
      };
    }

    return null;
  }

  /**
   * Get benefits entitled by PRSI class
   */
  async getBenefitsForPRSIClass(prsiClassId: string, jurisdictionId: string): Promise<GraphNode[]> {
    this.logger.info({
      prsiClassId,
      jurisdictionId,
    }, `${LOG_PREFIX.graph} Getting benefits for PRSI class`);

    const query = `
      MATCH (p:PRSIClass {id: $prsiClassId})
      MATCH (j:Jurisdiction {id: $jurisdictionId})
      MATCH (p)-[:ENTITLES_TO]->(b:Benefit)-[:IN_JURISDICTION]->(j)
      RETURN b
    `;

    const records = await this.executeCypher(query, { prsiClassId, jurisdictionId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);
    return context.nodes;
  }

  /**
   * Get life events that trigger a specific benefit or obligation
   */
  async getLifeEventsForNode(nodeId: string): Promise<LifeEvent[]> {
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting life events for node`);

    const query = `
      MATCH (e:LifeEvent)-[:TRIGGERS]->(n {id: $nodeId})
      RETURN e
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;

    const lifeEvents: LifeEvent[] = [];
    for (const record of records) {
      const e = record.e;
      if (e && typeof e === 'object' && 'properties' in e) {
        const props = (e as { properties: Record<string, unknown> }).properties;
        lifeEvents.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Life Event',
          category: (props.category as LifeEvent['category']) || 'FAMILY',
          triggers_timeline: props.triggers_timeline as boolean | undefined,
          description: props.description as string | undefined,
        });
      }
    }

    return lifeEvents;
  }

  /**
   * Get benefits and obligations triggered by a life event
   */
  async getTriggeredByLifeEvent(lifeEventId: string, jurisdictionId: string): Promise<{
    benefits: GraphNode[];
    obligations: GraphNode[];
  }> {
    this.logger.info({
      lifeEventId,
      jurisdictionId,
    }, `${LOG_PREFIX.graph} Getting items triggered by life event`);

    const query = `
      MATCH (e:LifeEvent {id: $lifeEventId})
      MATCH (j:Jurisdiction {id: $jurisdictionId})
      OPTIONAL MATCH (e)-[:TRIGGERS]->(b:Benefit)-[:IN_JURISDICTION]->(j)
      OPTIONAL MATCH (e)-[:TRIGGERS]->(o:Obligation)-[:IN_JURISDICTION]->(j)
      RETURN b, o
    `;

    const records = await this.executeCypher(query, { lifeEventId, jurisdictionId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);

    const benefits: GraphNode[] = [];
    const obligations: GraphNode[] = [];

    for (const node of context.nodes) {
      if (node.type === 'Benefit') {
        benefits.push(node);
      } else if (node.type === 'Obligation') {
        obligations.push(node);
      }
    }

    return { benefits, obligations };
  }

  /**
   * Close the driver connection
   */
  async close(): Promise<void> {
    await this.driver.close();
    this.logger.info(`${LOG_PREFIX.graph} BoltGraphClient closed`);
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
