/**
 * Direct Bolt-based Memgraph Graph Client
 *
 * Provides direct connection to Memgraph using the Bolt protocol (via neo4j-driver).
 * This bypasses MCP for core graph operations, improving performance and reliability.
 *
 * ARCHITECTURE NOTE (Option A - Query-Level ID Resolution):
 * Queries return enriched relationship data with semantic IDs directly,
 * eliminating the need for two-pass parsing and identity mapping.
 * This provides O(n) single-pass parsing with optimal memory usage.
 */

import { createHash } from 'node:crypto';
import neo4j, { Driver } from 'neo4j-driver';
import { SEMATTRS_DB_SYSTEM, SEMATTRS_DB_NAME, SEMATTRS_DB_OPERATION, SEMATTRS_DB_STATEMENT } from '@opentelemetry/semantic-conventions';
import { createLogger, withSpan, recordGraphQuery } from '@reg-copilot/reg-intel-observability';
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
  Penalty,
  LegalEntity,
  TaxCredit,
  RegulatoryBody,
  AssetClass,
  MeansTest,
  NIClass,
  BenefitCap,
  CoordinationRule,
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
 * Enriched relationship returned from queries with semantic IDs
 */
interface EnrichedRelationship {
  sourceId: string;
  targetId: string;
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Direct Bolt-based Memgraph GraphClient
 *
 * Uses Option A architecture: Query-level ID resolution for optimal performance.
 * All queries return relationships with semantic IDs, enabling single-pass parsing.
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
   * Execute a Cypher query and return raw results with comprehensive metrics
   */
  async executeCypher(query: string, params?: Record<string, unknown>): Promise<unknown> {
    const queryHash = createHash('sha256').update(query).digest('hex').substring(0, 16);
    const startTime = Date.now();
    let success = true;
    let recordCount = 0;

    return withSpan(
      'db.memgraph.query',
      {
        [SEMATTRS_DB_SYSTEM]: 'memgraph',
        [SEMATTRS_DB_NAME]: this.database,
        [SEMATTRS_DB_OPERATION]: 'query',
        [SEMATTRS_DB_STATEMENT]: `hash:${queryHash}`,
        'db.query.hash': queryHash,
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
          recordCount = result.records.length;

          this.logger.debug({
            queryHash,
            recordCount,
            durationMs: Date.now() - startTime,
          }, `${LOG_PREFIX.graph} Cypher query completed`);

          return result.records.map(record => record.toObject());
        } catch (error) {
          success = false;
          this.logger.error({
            error,
            queryHash,
            durationMs: Date.now() - startTime,
          }, `${LOG_PREFIX.graph} Cypher execution error`);
          throw new GraphError(
            `Failed to execute Cypher query: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        } finally {
          await session.close();

          // Record comprehensive metrics
          const durationMs = Date.now() - startTime;
          recordGraphQuery(durationMs, {
            operation: 'query',
            queryType: 'cypher',
            success,
            nodeCount: recordCount,
            queryHash,
          });
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
   * Parse enriched relationship (from Option A query format) to GraphEdge
   */
  private parseEnrichedRelationship(enriched: unknown): GraphEdge | null {
    if (!enriched || typeof enriched !== 'object') return null;

    const e = enriched as EnrichedRelationship;
    if (!e.sourceId || !e.targetId || !e.type) return null;

    return {
      source: e.sourceId,
      target: e.targetId,
      type: e.type,
      properties: e.properties || {},
    };
  }

  /**
   * Parse query results into GraphContext using Option A (single-pass with enriched relationships)
   *
   * This method handles both:
   * 1. Enriched relationship format (preferred): { sourceId, targetId, type, properties }
   * 2. Legacy format with identity mapping (fallback for raw relationship objects)
   */
  private parseGraphContext(records: Array<Record<string, unknown>>): GraphContext {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();
    // Fallback identity mapping for legacy query formats
    const identityToSemanticId = new Map<number, string>();

    for (const record of records) {
      for (const [key, value] of Object.entries(record)) {
        // Handle enriched relationships (Option A format)
        if (key === 'enrichedRels' && Array.isArray(value)) {
          for (const enriched of value) {
            if (enriched) {
              const edge = this.parseEnrichedRelationship(enriched);
              if (edge) {
                const edgeKey = `${edge.source}-${edge.type}-${edge.target}`;
                if (!seenEdges.has(edgeKey)) {
                  seenEdges.add(edgeKey);
                  edges.push(edge);
                }
              }
            }
          }
          continue;
        }

        // Handle single enriched relationship
        if (key === 'enrichedRel' && value && typeof value === 'object') {
          const edge = this.parseEnrichedRelationship(value);
          if (edge) {
            const edgeKey = `${edge.source}-${edge.type}-${edge.target}`;
            if (!seenEdges.has(edgeKey)) {
              seenEdges.add(edgeKey);
              edges.push(edge);
            }
          }
          continue;
        }

        this.collectValue(value, nodes, edges, seenNodes, seenEdges, identityToSemanticId);
      }
    }

    return { nodes, edges };
  }

  /**
   * Recursively collect nodes and edges from a value
   * Uses identity mapping as fallback for legacy query formats
   */
  private collectValue(
    value: unknown,
    nodes: GraphNode[],
    edges: GraphEdge[],
    seenNodes: Set<string>,
    seenEdges: Set<string>,
    identityToSemanticId: Map<number, string>
  ): void {
    if (!value || typeof value !== 'object') return;

    // Check if it's a node (has labels)
    if ('labels' in value && Array.isArray((value as { labels?: unknown }).labels)) {
      const node = this.parseNode(value);
      if (node && !seenNodes.has(node.id)) {
        seenNodes.add(node.id);
        nodes.push(node);

        // Build identity mapping for fallback relationship resolution
        const n = value as { identity?: { low: number; high: number } };
        if (n.identity?.low !== undefined) {
          identityToSemanticId.set(n.identity.low, node.id);
        }
      }
      return;
    }

    // Check if it's a raw relationship (fallback path)
    if ('type' in value && 'start' in value && 'end' in value) {
      const r = value as {
        start?: { low: number; high: number };
        end?: { low: number; high: number };
        type?: string;
        properties?: Record<string, unknown>;
      };

      if (r.type && r.start && r.end) {
        // Resolve internal identity to semantic ID using mapping
        const sourceId = identityToSemanticId.get(r.start.low) ?? `node_${r.start.low}`;
        const targetId = identityToSemanticId.get(r.end.low) ?? `node_${r.end.low}`;

        const edgeKey = `${sourceId}-${r.type}-${targetId}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edges.push({
            source: sourceId,
            target: targetId,
            type: r.type,
            properties: r.properties || {},
          });
        }
      }
      return;
    }

    // Handle arrays (path results, collected nodes, etc.)
    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectValue(item, nodes, edges, seenNodes, seenEdges, identityToSemanticId);
      }
    }
  }

  /**
   * Get rules matching profile and jurisdiction with optional keyword
   * Uses Option A: Returns enriched relationships with semantic IDs
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

    // Option A: Return enriched relationships with semantic IDs
    query += `
      OPTIONAL MATCH (rule)-[r]->(related)
      WITH rule,
           CASE WHEN r IS NOT NULL AND related IS NOT NULL
                THEN {sourceId: rule.id, targetId: related.id, type: type(r), properties: properties(r)}
                ELSE NULL
           END AS enrichedRel,
           related
      RETURN rule, collect(enrichedRel) AS enrichedRels, collect(related) AS related
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
   * Uses Option A: Returns enriched relationships with semantic IDs
   */
  async getNeighbourhood(nodeId: string): Promise<GraphContext> {
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting neighbourhood`);

    // Option A: Return enriched relationships with semantic IDs
    const query = `
      MATCH (n {id: $nodeId})
      OPTIONAL MATCH (n)-[r1]-(n1)
      OPTIONAL MATCH (n1)-[r2]-(n2)
      WHERE n2 IS NULL OR n2.id <> $nodeId
      WITH n, r1, n1, r2, n2
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
      LIMIT 100
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;

    // Parse with support for multiple enriched relationship arrays
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();

    for (const record of records) {
      // Parse center node
      if (record.n) {
        const node = this.parseNode(record.n);
        if (node && !seenNodes.has(node.id)) {
          seenNodes.add(node.id);
          nodes.push(node);
        }
      }

      // Parse neighbour nodes
      for (const key of ['neighbours1', 'neighbours2']) {
        const neighbours = record[key];
        if (Array.isArray(neighbours)) {
          for (const n of neighbours) {
            if (n) {
              const node = this.parseNode(n);
              if (node && !seenNodes.has(node.id)) {
                seenNodes.add(node.id);
                nodes.push(node);
              }
            }
          }
        }
      }

      // Parse enriched relationships
      for (const key of ['enrichedRels1', 'enrichedRels2']) {
        const rels = record[key];
        if (Array.isArray(rels)) {
          for (const enriched of rels) {
            if (enriched) {
              const edge = this.parseEnrichedRelationship(enriched);
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

    return { nodes, edges };
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
   * Uses Option A: Returns enriched relationships with semantic IDs
   */
  async getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphContext> {
    this.logger.info({ jurisdictions: jurisdictionIds }, `${LOG_PREFIX.graph} Getting cross-border slice`);

    // Option A: Return enriched relationships with semantic IDs
    const query = `
      MATCH (j:Jurisdiction)
      WHERE j.id IN $jurisdictionIds
      MATCH (rule)-[:IN_JURISDICTION]->(j)
      OPTIONAL MATCH (rule)-[r:COORDINATED_WITH|TREATY_LINKED_TO|EQUIVALENT_TO]-(related)
      WITH rule, j,
           CASE WHEN r IS NOT NULL AND related IS NOT NULL
                THEN {sourceId: CASE WHEN startNode(r) = rule THEN rule.id ELSE related.id END,
                      targetId: CASE WHEN endNode(r) = rule THEN rule.id ELSE related.id END,
                      type: type(r), properties: properties(r)}
                ELSE NULL
           END AS enrichedRel,
           related
      RETURN rule, j, collect(enrichedRel) AS enrichedRels, collect(related) AS related
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
   * Uses Option A: Returns enriched relationships with semantic IDs
   */
  async getConceptHierarchy(conceptId: string): Promise<{
    broader: GraphNode[];
    narrower: GraphNode[];
    related: GraphNode[];
  }> {
    this.logger.info({ conceptId }, `${LOG_PREFIX.graph} Getting concept hierarchy`);

    // Option A: Return categorized nodes with relationship type
    const query = `
      MATCH (c:Concept {id: $conceptId})
      OPTIONAL MATCH (c)-[:BROADER]->(broader)
      OPTIONAL MATCH (c)-[:NARROWER]->(narrower)
      OPTIONAL MATCH (c)-[:RELATED]->(related)
      RETURN c, collect(DISTINCT broader) AS broaderNodes,
             collect(DISTINCT narrower) AS narrowerNodes,
             collect(DISTINCT related) AS relatedNodes
    `;

    const records = await this.executeCypher(query, { conceptId }) as Array<Record<string, unknown>>;

    const broader: GraphNode[] = [];
    const narrower: GraphNode[] = [];
    const related: GraphNode[] = [];

    if (records.length > 0) {
      const record = records[0];

      for (const n of (record.broaderNodes as unknown[]) || []) {
        if (n) {
          const node = this.parseNode(n);
          if (node) broader.push(node);
        }
      }

      for (const n of (record.narrowerNodes as unknown[]) || []) {
        if (n) {
          const node = this.parseNode(n);
          if (node) narrower.push(node);
        }
      }

      for (const n of (record.relatedNodes as unknown[]) || []) {
        if (n) {
          const node = this.parseNode(n);
          if (node) related.push(node);
        }
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
      RETURN collect(DISTINCT b) AS benefits, collect(DISTINCT o) AS obligations
    `;

    const records = await this.executeCypher(query, { lifeEventId, jurisdictionId }) as Array<Record<string, unknown>>;

    const benefits: GraphNode[] = [];
    const obligations: GraphNode[] = [];

    if (records.length > 0) {
      const record = records[0];

      for (const b of (record.benefits as unknown[]) || []) {
        if (b) {
          const node = this.parseNode(b);
          if (node) benefits.push(node);
        }
      }

      for (const o of (record.obligations as unknown[]) || []) {
        if (o) {
          const node = this.parseNode(o);
          if (node) obligations.push(node);
        }
      }
    }

    return { benefits, obligations };
  }

  /**
   * Get penalties for an obligation
   */
  async getPenaltiesForObligation(obligationId: string): Promise<Penalty[]> {
    this.logger.info({ obligationId }, `${LOG_PREFIX.graph} Getting penalties for obligation`);

    const query = `
      MATCH (o:Obligation {id: $obligationId})-[:HAS_PENALTY]->(p:Penalty)
      RETURN p
      ORDER BY p.applies_after_days ASC
    `;

    const records = await this.executeCypher(query, { obligationId }) as Array<Record<string, unknown>>;

    const penalties: Penalty[] = [];
    for (const record of records) {
      const p = record.p;
      if (p && typeof p === 'object' && 'properties' in p) {
        const props = (p as { properties: Record<string, unknown> }).properties;
        penalties.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Penalty',
          penalty_type: (props.penalty_type as Penalty['penalty_type']) || 'FIXED',
          rate: props.rate as number | undefined,
          daily_rate: props.daily_rate as number | undefined,
          flat_amount: props.flat_amount as number | undefined,
          currency: props.currency as string | undefined,
          max_amount: props.max_amount as number | undefined,
          applies_after_days: props.applies_after_days as number | undefined,
          applies_after_months: props.applies_after_months as number | undefined,
          description: props.description as string | undefined,
        });
      }
    }

    return penalties;
  }

  /**
   * Get all penalties for a profile's obligations
   */
  async getPenaltiesForProfile(
    profileId: string,
    jurisdictionId: string
  ): Promise<{ obligation: Obligation; penalties: Penalty[] }[]> {
    this.logger.info({
      profileId,
      jurisdictionId,
    }, `${LOG_PREFIX.graph} Getting penalties for profile`);

    const query = `
      MATCH (pt:ProfileTag {id: $profileId})
      MATCH (j:Jurisdiction {id: $jurisdictionId})
      MATCH (pt)-[:HAS_OBLIGATION]->(o:Obligation)-[:IN_JURISDICTION]->(j)
      OPTIONAL MATCH (o)-[:HAS_PENALTY]->(p:Penalty)
      RETURN o, collect(p) as penalties
    `;

    const records = await this.executeCypher(query, { profileId, jurisdictionId }) as Array<Record<string, unknown>>;

    const results: { obligation: Obligation; penalties: Penalty[] }[] = [];

    for (const record of records) {
      const o = record.o;
      const penaltyNodes = record.penalties as Array<unknown>;

      if (o && typeof o === 'object' && 'properties' in o) {
        const oProps = (o as { properties: Record<string, unknown> }).properties;
        const obligation: Obligation = {
          id: oProps.id as string || 'unknown',
          label: oProps.label as string || 'Unknown Obligation',
          category: (oProps.category as Obligation['category']) || 'FILING',
          frequency: oProps.frequency as Obligation['frequency'],
          penalty_applies: oProps.penalty_applies as boolean | undefined,
          description: oProps.description as string | undefined,
        };

        const penalties: Penalty[] = [];
        for (const p of penaltyNodes) {
          if (p && typeof p === 'object' && 'properties' in p) {
            const pProps = (p as { properties: Record<string, unknown> }).properties;
            penalties.push({
              id: pProps.id as string || 'unknown',
              label: pProps.label as string || 'Unknown Penalty',
              penalty_type: (pProps.penalty_type as Penalty['penalty_type']) || 'FIXED',
              rate: pProps.rate as number | undefined,
              daily_rate: pProps.daily_rate as number | undefined,
              flat_amount: pProps.flat_amount as number | undefined,
              currency: pProps.currency as string | undefined,
              max_amount: pProps.max_amount as number | undefined,
              applies_after_days: pProps.applies_after_days as number | undefined,
              applies_after_months: pProps.applies_after_months as number | undefined,
              description: pProps.description as string | undefined,
            });
          }
        }

        results.push({ obligation, penalties });
      }
    }

    return results;
  }

  /**
   * Check if penalty can be waived based on conditions
   */
  async getPenaltyWaiverConditions(penaltyId: string): Promise<GraphNode[]> {
    this.logger.info({ penaltyId }, `${LOG_PREFIX.graph} Getting waiver conditions for penalty`);

    const query = `
      MATCH (p:Penalty {id: $penaltyId})-[:WAIVED_IF]->(c:Condition)
      RETURN c
    `;

    const records = await this.executeCypher(query, { penaltyId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);
    return context.nodes;
  }

  /**
   * Get legal entity types for a jurisdiction
   */
  async getLegalEntitiesForJurisdiction(jurisdictionId: string): Promise<LegalEntity[]> {
    this.logger.info({ jurisdictionId }, `${LOG_PREFIX.graph} Getting legal entities for jurisdiction`);

    const query = `
      MATCH (e:LegalEntity)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
      RETURN e
      ORDER BY e.category, e.label
    `;

    const records = await this.executeCypher(query, { jurisdictionId }) as Array<Record<string, unknown>>;

    const entities: LegalEntity[] = [];
    for (const record of records) {
      const e = record.e;
      if (e && typeof e === 'object' && 'properties' in e) {
        const props = (e as { properties: Record<string, unknown> }).properties;
        entities.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Entity',
          abbreviation: props.abbreviation as string | undefined,
          jurisdiction: props.jurisdiction as string || jurisdictionId,
          category: (props.category as LegalEntity['category']) || 'COMPANY',
          sub_category: props.sub_category as string | undefined,
          has_separate_legal_personality: props.has_separate_legal_personality as boolean || false,
          limited_liability: props.limited_liability as boolean || false,
          can_trade: props.can_trade as boolean || false,
          can_hold_property: props.can_hold_property as boolean || false,
          tax_transparent: props.tax_transparent as boolean | undefined,
          description: props.description as string | undefined,
        });
      }
    }

    return entities;
  }

  /**
   * Get obligations specific to an entity type
   */
  async getObligationsForEntityType(entityTypeId: string): Promise<Obligation[]> {
    this.logger.info({ entityTypeId }, `${LOG_PREFIX.graph} Getting obligations for entity type`);

    const query = `
      MATCH (o:Obligation)-[:APPLIES_TO_ENTITY]->(e:LegalEntity {id: $entityTypeId})
      RETURN o
      ORDER BY o.category, o.label
    `;

    const records = await this.executeCypher(query, { entityTypeId }) as Array<Record<string, unknown>>;

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
   * Get tax credits for a profile and tax year
   */
  async getTaxCreditsForProfile(
    profileId: string,
    taxYear: number,
    jurisdictionId: string
  ): Promise<TaxCredit[]> {
    this.logger.info({
      profileId,
      taxYear,
      jurisdictionId,
    }, `${LOG_PREFIX.graph} Getting tax credits for profile`);

    const query = `
      MATCH (pt:ProfileTag {id: $profileId})-[:ENTITLED_TO]->(c:TaxCredit)
      MATCH (c)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
      WHERE c.tax_year = $taxYear
      RETURN c
      ORDER BY c.category, c.amount DESC
    `;

    const records = await this.executeCypher(query, { profileId, taxYear, jurisdictionId }) as Array<Record<string, unknown>>;

    const credits: TaxCredit[] = [];
    for (const record of records) {
      const c = record.c;
      if (c && typeof c === 'object' && 'properties' in c) {
        const props = (c as { properties: Record<string, unknown> }).properties;
        credits.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Tax Credit',
          amount: props.amount as number || 0,
          currency: props.currency as string || 'EUR',
          tax_year: props.tax_year as number || taxYear,
          refundable: props.refundable as boolean || false,
          transferable: props.transferable as boolean || false,
          restricted_to_marginal: props.restricted_to_marginal as boolean | undefined,
          category: (props.category as TaxCredit['category']) || 'OTHER',
          description: props.description as string | undefined,
        });
      }
    }

    return credits;
  }

  /**
   * Get reliefs/benefits that stack with a given node
   */
  async getStackingOptions(nodeId: string): Promise<GraphNode[]> {
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting stacking options`);

    const query = `
      MATCH (n {id: $nodeId})-[:STACKS_WITH]->(stackable)
      RETURN stackable
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);
    return context.nodes;
  }

  /**
   * Get items that reduce a benefit/relief
   */
  async getReducingFactors(nodeId: string): Promise<GraphNode[]> {
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting reducing factors`);

    const query = `
      MATCH (reducer)-[:REDUCES]->(n {id: $nodeId})
      RETURN reducer
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);
    return context.nodes;
  }

  /**
   * Get regulatory bodies for a jurisdiction
   */
  async getRegulatoryBodiesForJurisdiction(jurisdictionId: string): Promise<RegulatoryBody[]> {
    this.logger.info({ jurisdictionId }, `${LOG_PREFIX.graph} Getting regulatory bodies for jurisdiction`);

    const query = `
      MATCH (rb:RegulatoryBody)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
      RETURN rb
      ORDER BY rb.domain, rb.label
    `;

    const records = await this.executeCypher(query, { jurisdictionId }) as Array<Record<string, unknown>>;

    const bodies: RegulatoryBody[] = [];
    for (const record of records) {
      const rb = record.rb;
      if (rb && typeof rb === 'object' && 'properties' in rb) {
        const props = (rb as { properties: Record<string, unknown> }).properties;
        bodies.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Body',
          abbreviation: props.abbreviation as string | undefined,
          jurisdiction: props.jurisdiction as string || jurisdictionId,
          domain: (props.domain as RegulatoryBody['domain']) || 'OTHER',
          website: props.website as string | undefined,
          contact_info: props.contact_info as string | undefined,
          description: props.description as string | undefined,
        });
      }
    }

    return bodies;
  }

  /**
   * Get regulatory body that administers an obligation or benefit
   */
  async getAdministeringBody(nodeId: string): Promise<RegulatoryBody | null> {
    this.logger.info({ nodeId }, `${LOG_PREFIX.graph} Getting administering body`);

    const query = `
      MATCH (n {id: $nodeId})-[:ADMINISTERED_BY]->(rb:RegulatoryBody)
      RETURN rb
      LIMIT 1
    `;

    const records = await this.executeCypher(query, { nodeId }) as Array<Record<string, unknown>>;

    if (records.length === 0) return null;

    const rb = records[0].rb;
    if (rb && typeof rb === 'object' && 'properties' in rb) {
      const props = (rb as { properties: Record<string, unknown> }).properties;
      return {
        id: props.id as string || 'unknown',
        label: props.label as string || 'Unknown Body',
        abbreviation: props.abbreviation as string | undefined,
        jurisdiction: props.jurisdiction as string || 'unknown',
        domain: (props.domain as RegulatoryBody['domain']) || 'OTHER',
        website: props.website as string | undefined,
        contact_info: props.contact_info as string | undefined,
        description: props.description as string | undefined,
      };
    }

    return null;
  }

  /**
   * Get asset classes for a jurisdiction
   */
  async getAssetClassesForJurisdiction(jurisdictionId: string): Promise<AssetClass[]> {
    this.logger.info({ jurisdictionId }, `${LOG_PREFIX.graph} Getting asset classes for jurisdiction`);

    const query = `
      MATCH (ac:AssetClass)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
      RETURN ac
      ORDER BY ac.category, ac.label
    `;

    const records = await this.executeCypher(query, { jurisdictionId }) as Array<Record<string, unknown>>;

    const assetClasses: AssetClass[] = [];
    for (const record of records) {
      const ac = record.ac;
      if (ac && typeof ac === 'object' && 'properties' in ac) {
        const props = (ac as { properties: Record<string, unknown> }).properties;
        assetClasses.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Asset Class',
          category: (props.category as AssetClass['category']) || 'OTHER',
          sub_category: props.sub_category as string | undefined,
          tangible: props.tangible as boolean || false,
          cgt_applicable: props.cgt_applicable as boolean || false,
          cat_applicable: props.cat_applicable as boolean || false,
          stamp_duty_applicable: props.stamp_duty_applicable as boolean || false,
          description: props.description as string | undefined,
        });
      }
    }

    return assetClasses;
  }

  /**
   * Get CGT rate for an asset class
   */
  async getCGTRateForAsset(assetClassId: string): Promise<Rate | null> {
    this.logger.info({ assetClassId }, `${LOG_PREFIX.graph} Getting CGT rate for asset`);

    const query = `
      MATCH (ac:AssetClass {id: $assetClassId})-[:HAS_CGT_RATE]->(r:Rate)
      RETURN r
      LIMIT 1
    `;

    const records = await this.executeCypher(query, { assetClassId }) as Array<Record<string, unknown>>;

    if (records.length === 0) return null;

    const r = records[0].r;
    if (r && typeof r === 'object' && 'properties' in r) {
      const props = (r as { properties: Record<string, unknown> }).properties;
      return {
        id: props.id as string || 'unknown',
        label: props.label as string || 'Unknown Rate',
        percentage: props.percentage as number | undefined,
        flat_amount: props.flat_amount as number | undefined,
        currency: props.currency as string | undefined,
        band_lower: props.band_lower as number | undefined,
        band_upper: props.band_upper as number | undefined,
        effective_from: props.effective_from as string | undefined,
        effective_to: props.effective_to as string | undefined,
        category: props.category as string || 'unknown',
      };
    }

    return null;
  }

  /**
   * Get rates and thresholds for tax year
   */
  async getRatesForTaxYear(taxYear: number, jurisdictionId: string): Promise<{
    rates: Rate[];
    thresholds: Threshold[];
    credits: TaxCredit[];
  }> {
    this.logger.info({
      taxYear,
      jurisdictionId,
    }, `${LOG_PREFIX.graph} Getting rates/thresholds for tax year`);

    const query = `
      MATCH (ty:TaxYear {year: $taxYear, jurisdiction: $jurisdictionId})
      OPTIONAL MATCH (r:Rate)-[:APPLIES_IN_YEAR]->(ty)
      OPTIONAL MATCH (t:Threshold)-[:APPLIES_IN_YEAR]->(ty)
      OPTIONAL MATCH (c:TaxCredit)-[:APPLIES_IN_YEAR]->(ty)
      RETURN collect(DISTINCT r) as rates, collect(DISTINCT t) as thresholds, collect(DISTINCT c) as credits
    `;

    const records = await this.executeCypher(query, { taxYear, jurisdictionId }) as Array<Record<string, unknown>>;

    const rates: Rate[] = [];
    const thresholds: Threshold[] = [];
    const credits: TaxCredit[] = [];

    if (records.length > 0) {
      const record = records[0];

      // Parse rates
      const rateNodes = record.rates as Array<unknown>;
      for (const r of rateNodes) {
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
            category: props.category as string || 'unknown',
          });
        }
      }

      // Parse thresholds
      const thresholdNodes = record.thresholds as Array<unknown>;
      for (const t of thresholdNodes) {
        if (t && typeof t === 'object' && 'properties' in t) {
          const props = (t as { properties: Record<string, unknown> }).properties;
          thresholds.push({
            id: props.id as string || 'unknown',
            label: props.label as string || 'Unknown Threshold',
            value: props.value as number || 0,
            unit: (props.unit as Threshold['unit']) || 'EUR',
            direction: (props.direction as Threshold['direction']) || 'ABOVE',
            upper_bound: props.upper_bound as number | undefined,
            effective_from: props.effective_from as string | undefined,
            effective_to: props.effective_to as string | undefined,
            category: props.category as string | undefined,
          });
        }
      }

      // Parse credits
      const creditNodes = record.credits as Array<unknown>;
      for (const c of creditNodes) {
        if (c && typeof c === 'object' && 'properties' in c) {
          const props = (c as { properties: Record<string, unknown> }).properties;
          credits.push({
            id: props.id as string || 'unknown',
            label: props.label as string || 'Unknown Tax Credit',
            amount: props.amount as number || 0,
            currency: props.currency as string || 'EUR',
            tax_year: props.tax_year as number || taxYear,
            refundable: props.refundable as boolean || false,
            transferable: props.transferable as boolean || false,
            restricted_to_marginal: props.restricted_to_marginal as boolean | undefined,
            category: (props.category as TaxCredit['category']) || 'OTHER',
            description: props.description as string | undefined,
          });
        }
      }
    }

    return { rates, thresholds, credits };
  }

  /**
   * Get means test for a benefit
   */
  async getMeansTestForBenefit(benefitId: string): Promise<MeansTest | null> {
    this.logger.info({ benefitId }, `${LOG_PREFIX.graph} Getting means test for benefit`);

    const query = `
      MATCH (b:Benefit {id: $benefitId})-[:HAS_MEANS_TEST]->(mt:MeansTest)
      RETURN mt
      LIMIT 1
    `;

    const records = await this.executeCypher(query, { benefitId }) as Array<Record<string, unknown>>;

    if (records.length === 0) return null;

    const mt = records[0].mt;
    if (mt && typeof mt === 'object' && 'properties' in mt) {
      const props = (mt as { properties: Record<string, unknown> }).properties;
      return {
        id: props.id as string || 'unknown',
        label: props.label as string || 'Unknown Means Test',
        income_disregard: props.income_disregard as number | undefined,
        capital_threshold: props.capital_threshold as number | undefined,
        capital_weekly_assessment: props.capital_weekly_assessment as number | undefined,
        spouse_income_assessed: props.spouse_income_assessed as boolean | undefined,
        maintenance_assessed: props.maintenance_assessed as boolean | undefined,
        categories: props.categories as string[] | undefined,
        description: props.description as string | undefined,
      };
    }

    return null;
  }

  /**
   * Get National Insurance classes for a jurisdiction
   */
  async getNIClassesForJurisdiction(jurisdictionId: string): Promise<NIClass[]> {
    this.logger.info({ jurisdictionId }, `${LOG_PREFIX.graph} Getting NI classes for jurisdiction`);

    const query = `
      MATCH (ni:NIClass)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
      RETURN ni
      ORDER BY ni.label
    `;

    const records = await this.executeCypher(query, { jurisdictionId }) as Array<Record<string, unknown>>;

    const niClasses: NIClass[] = [];
    for (const record of records) {
      const ni = record.ni;
      if (ni && typeof ni === 'object' && 'properties' in ni) {
        const props = (ni as { properties: Record<string, unknown> }).properties;
        niClasses.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown NI Class',
          description: props.description as string || '',
          rate: props.rate as number || 0,
          threshold_weekly: props.threshold_weekly as number | undefined,
          threshold_annual: props.threshold_annual as number | undefined,
          eligible_benefits: props.eligible_benefits as string[] | undefined,
        });
      }
    }

    return niClasses;
  }

  /**
   * Get NI class for an employment type
   */
  async getNIClassForEmploymentType(employmentType: string, jurisdictionId: string): Promise<NIClass | null> {
    this.logger.info({ employmentType, jurisdictionId }, `${LOG_PREFIX.graph} Getting NI class for employment type`);

    const query = `
      MATCH (pt:ProfileTag {id: $employmentType})-[:HAS_NI_CLASS]->(ni:NIClass)
      MATCH (ni)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
      RETURN ni
      LIMIT 1
    `;

    const records = await this.executeCypher(query, { employmentType, jurisdictionId }) as Array<Record<string, unknown>>;

    if (records.length === 0) return null;

    const ni = records[0].ni;
    if (ni && typeof ni === 'object' && 'properties' in ni) {
      const props = (ni as { properties: Record<string, unknown> }).properties;
      return {
        id: props.id as string || 'unknown',
        label: props.label as string || 'Unknown NI Class',
        description: props.description as string || '',
        rate: props.rate as number || 0,
        threshold_weekly: props.threshold_weekly as number | undefined,
        threshold_annual: props.threshold_annual as number | undefined,
        eligible_benefits: props.eligible_benefits as string[] | undefined,
      };
    }

    return null;
  }

  /**
   * Get benefit caps for a jurisdiction
   */
  async getBenefitCapsForJurisdiction(jurisdictionId: string): Promise<BenefitCap[]> {
    this.logger.info({ jurisdictionId }, `${LOG_PREFIX.graph} Getting benefit caps for jurisdiction`);

    const query = `
      MATCH (cap:BenefitCap)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
      RETURN cap
      ORDER BY cap.label
    `;

    const records = await this.executeCypher(query, { jurisdictionId }) as Array<Record<string, unknown>>;

    const caps: BenefitCap[] = [];
    for (const record of records) {
      const cap = record.cap;
      if (cap && typeof cap === 'object' && 'properties' in cap) {
        const props = (cap as { properties: Record<string, unknown> }).properties;
        caps.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Benefit Cap',
          amount_single: props.amount_single as number | undefined,
          amount_couple: props.amount_couple as number | undefined,
          amount_with_children: props.amount_with_children as number | undefined,
          currency: props.currency as string || 'GBP',
          frequency: (props.frequency as BenefitCap['frequency']) || 'ANNUAL',
          exemptions: props.exemptions as string[] | undefined,
          effective_from: props.effective_from as string | undefined,
          effective_to: props.effective_to as string | undefined,
        });
      }
    }

    return caps;
  }

  /**
   * Get benefits subject to a benefit cap
   */
  async getBenefitsSubjectToCap(capId: string): Promise<GraphNode[]> {
    this.logger.info({ capId }, `${LOG_PREFIX.graph} Getting benefits subject to cap`);

    const query = `
      MATCH (b:Benefit)-[:SUBJECT_TO_CAP]->(cap:BenefitCap {id: $capId})
      RETURN b
    `;

    const records = await this.executeCypher(query, { capId }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);
    return context.nodes;
  }

  /**
   * Get coordination rules between jurisdictions
   */
  async getCoordinationRules(homeJurisdiction: string, hostJurisdiction: string): Promise<CoordinationRule[]> {
    this.logger.info({ homeJurisdiction, hostJurisdiction }, `${LOG_PREFIX.graph} Getting coordination rules`);

    const query = `
      MATCH (cr:CoordinationRule)
      WHERE cr.home_jurisdiction = $homeJurisdiction
        AND cr.host_jurisdiction = $hostJurisdiction
      RETURN cr
      ORDER BY cr.regulation, cr.article
    `;

    const records = await this.executeCypher(query, { homeJurisdiction, hostJurisdiction }) as Array<Record<string, unknown>>;

    const rules: CoordinationRule[] = [];
    for (const record of records) {
      const cr = record.cr;
      if (cr && typeof cr === 'object' && 'properties' in cr) {
        const props = (cr as { properties: Record<string, unknown> }).properties;
        rules.push({
          id: props.id as string || 'unknown',
          label: props.label as string || 'Unknown Coordination Rule',
          regulation: props.regulation as string || '',
          article: props.article as string | undefined,
          applies_to: props.applies_to as string || '',
          home_jurisdiction: props.home_jurisdiction as string | undefined,
          host_jurisdiction: props.host_jurisdiction as string | undefined,
          duration_months: props.duration_months as number | undefined,
          description: props.description as string | undefined,
        });
      }
    }

    return rules;
  }

  /**
   * Get posted worker rules for a profile
   */
  async getPostedWorkerRules(profileId: string, homeJurisdiction: string, hostJurisdiction: string): Promise<{
    rules: CoordinationRule[];
    benefits: GraphNode[];
  }> {
    this.logger.info({ profileId, homeJurisdiction, hostJurisdiction }, `${LOG_PREFIX.graph} Getting posted worker rules`);

    // Get coordination rules
    const rules = await this.getCoordinationRules(homeJurisdiction, hostJurisdiction);

    // Get benefits coordinated under these rules
    const query = `
      MATCH (pt:ProfileTag {id: $profileId})-[:APPLIES_TO_PROFILE]->(b:Benefit)
      MATCH (b)-[:COORDINATED_UNDER]->(cr:CoordinationRule)
      WHERE cr.home_jurisdiction = $homeJurisdiction
        AND cr.host_jurisdiction = $hostJurisdiction
      RETURN b
    `;

    const records = await this.executeCypher(query, { profileId, homeJurisdiction, hostJurisdiction }) as Array<Record<string, unknown>>;
    const context = this.parseGraphContext(records);

    return {
      rules,
      benefits: context.nodes,
    };
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
