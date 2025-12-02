/**
 * Graph Write Service
 *
 * The ONLY entry point for writing to the global Memgraph instance.
 * All writes pass through the Graph Ingress Guard aspect pipeline.
 *
 * See: docs/specs/safety-guards/graph_ingress_guard_v_0_1.md
 */

import type { Driver, Session } from 'neo4j-driver';
import {
  type GraphWriteContext,
  type GraphIngressAspect,
  composeIngressAspects,
  createBaselineAspects,
} from './graphIngressGuard.js';

/**
 * DTO for upserting a jurisdiction
 */
export interface UpsertJurisdictionDto {
  id: string;
  name: string;
  type: 'COUNTRY' | 'SUPRANATIONAL' | 'CROWN_DEPENDENCY';
  code?: string;
  notes?: string;
}

/**
 * DTO for upserting a region
 */
export interface UpsertRegionDto {
  id: string;
  name: string;
  type: string;
  parentJurisdictionId: string;
  notes?: string;
}

/**
 * DTO for upserting a statute
 */
export interface UpsertStatuteDto {
  id: string;
  name: string;
  citation?: string;
  source_url?: string;
  type: 'PRIMARY' | 'SECONDARY';
  jurisdictionId: string;
}

/**
 * DTO for upserting a section
 */
export interface UpsertSectionDto {
  id: string;
  label: string;
  title: string;
  text_excerpt?: string;
  effective_from?: string;
  effective_to?: string;
  section_number?: string;
  statuteId: string;
  jurisdictionId: string;
}

/**
 * DTO for upserting a benefit
 */
export interface UpsertBenefitDto {
  id: string;
  name: string;
  category: string;
  short_summary?: string;
  description?: string;
  jurisdictionId: string;
}

/**
 * DTO for upserting a relief
 */
export interface UpsertReliefDto {
  id: string;
  name: string;
  tax_type: string;
  short_summary?: string;
  description?: string;
  jurisdictionId: string;
}

/**
 * DTO for upserting a timeline constraint
 */
export interface UpsertTimelineDto {
  id: string;
  label: string;
  window_days?: number;
  window_months?: number;
  window_years?: number;
  kind?: 'LOOKBACK' | 'LOCK_IN' | 'DEADLINE' | 'EFFECTIVE_WINDOW' | 'USAGE_FREQUENCY' | 'OTHER';
  jurisdictionCode?: string;
  description?: string;
}

/**
 * DTO for upserting an agreement
 */
export interface UpsertAgreementDto {
  id: string;
  name: string;
  type?: string;
  description?: string;
  effective_from?: string;
  effective_to?: string;
}

/**
 * DTO for upserting a regime
 */
export interface UpsertRegimeDto {
  id: string;
  name: string;
  category?: string;
  description?: string;
}

/**
 * DTO for upserting a captured concept
 */
export interface UpsertConceptDto {
  id: string;
  domain: string;
  kind: string;
  jurisdiction: string;
  pref_label: string;
  alt_labels?: string[];
  definition?: string;
  source_urls?: string[];
  created_at?: string;
  updated_at?: string;
  last_verified_at?: string;
}

/**
 * DTO for creating a relationship
 */
export interface CreateRelationshipDto {
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  relType: string;
  properties?: Record<string, unknown>;
}

/**
 * Configuration for GraphWriteService
 */
export interface GraphWriteServiceConfig {
  /** Neo4j driver instance */
  driver: Driver;
  /** Custom aspects to add to the baseline pipeline (optional) */
  customAspects?: GraphIngressAspect[];
  /** Tenant ID for logging/audit (never persisted in graph) */
  tenantId?: string;
  /** Source identifier for this write service instance */
  defaultSource?: 'ingestion' | 'agent' | 'background_job' | 'script';
}

/**
 * Graph Write Service
 *
 * All writes to Memgraph MUST go through this service.
 * Enforces schema validation, PII blocking, and other ingress guard aspects.
 */
export class GraphWriteService {
  private driver: Driver;
  private customAspects: GraphIngressAspect[];
  private tenantId?: string;
  private defaultSource: 'ingestion' | 'agent' | 'background_job' | 'script';

  constructor(config: GraphWriteServiceConfig) {
    this.driver = config.driver;
    this.customAspects = config.customAspects || [];
    this.tenantId = config.tenantId;
    this.defaultSource = config.defaultSource || 'script';
  }

  /**
   * Execute a write operation through the ingress guard pipeline
   */
  private async executeWrite(ctx: GraphWriteContext): Promise<void> {
    // Build the aspect pipeline: baseline aspects + custom aspects + terminal
    const baselineAspects = createBaselineAspects();
    const allAspects = [...baselineAspects, ...this.customAspects];

    // Terminal function: actually execute the write
    const terminal = async (finalCtx: GraphWriteContext): Promise<GraphWriteContext> => {
      const session: Session = this.driver.session();
      try {
        await this.executeCypher(session, finalCtx);
      } finally {
        await session.close();
      }
      return finalCtx;
    };

    // Compose and run the pipeline
    const pipeline = composeIngressAspects(allAspects, terminal);
    await pipeline(ctx);
  }

  /**
   * Convert context to Cypher and execute
   */
  private async executeCypher(session: Session, ctx: GraphWriteContext): Promise<void> {
    if (ctx.nodeLabel) {
      await this.executeCypherNode(session, ctx);
    } else if (ctx.relType) {
      await this.executeCypherRelationship(session, ctx);
    } else {
      throw new Error('GraphWriteContext must specify either nodeLabel or relType');
    }
  }

  /**
   * Execute Cypher for node operations
   */
  private async executeCypherNode(session: Session, ctx: GraphWriteContext): Promise<void> {
    const { nodeLabel, properties, operation } = ctx;

    if (operation === 'merge' || operation === 'create') {
      // Build property string for Cypher
      const propEntries = Object.entries(properties).filter(
        ([_, value]) => value !== undefined && value !== null,
      );
      const propString = propEntries.map(([key]) => `${key}: $${key}`).join(', ');

      const cypher =
        operation === 'merge'
          ? `MERGE (n:${nodeLabel} {id: $id}) SET n += {${propString}}`
          : `CREATE (n:${nodeLabel} {${propString}})`;

      await session.run(cypher, properties);
    } else if (operation === 'update') {
      const propString = Object.entries(properties)
        .filter(([key]) => key !== 'id')
        .map(([key]) => `n.${key} = $${key}`)
        .join(', ');

      const cypher = `MATCH (n:${nodeLabel} {id: $id}) SET ${propString}`;
      await session.run(cypher, properties);
    } else if (operation === 'delete') {
      const cypher = `MATCH (n:${nodeLabel} {id: $id}) DETACH DELETE n`;
      await session.run(cypher, properties);
    }
  }

  /**
   * Execute Cypher for relationship operations
   */
  private async executeCypherRelationship(
    session: Session,
    ctx: GraphWriteContext,
  ): Promise<void> {
    const { relType, properties, operation, metadata } = ctx;

    if (operation === 'merge' || operation === 'create') {
      const fromLabel = metadata?.fromLabel as string;
      const toLabel = metadata?.toLabel as string;
      const fromId = metadata?.fromId as string;
      const toId = metadata?.toId as string;

      if (!fromLabel || !toLabel || !fromId || !toId) {
        throw new Error(
          'Relationship operations require fromLabel, toLabel, fromId, toId in metadata',
        );
      }

      const propEntries = Object.entries(properties).filter(
        ([_, value]) => value !== undefined && value !== null,
      );
      const propString =
        propEntries.length > 0
          ? `{${propEntries.map(([key]) => `${key}: $${key}`).join(', ')}}`
          : '';

      const cypher =
        operation === 'merge'
          ? `MATCH (a:${fromLabel} {id: $fromId}), (b:${toLabel} {id: $toId}) ` +
            `MERGE (a)-[r:${relType}]->(b) ` +
            (propString ? `SET r += ${propString}` : '')
          : `MATCH (a:${fromLabel} {id: $fromId}), (b:${toLabel} {id: $toId}) ` +
            `CREATE (a)-[r:${relType} ${propString}]->(b)`;

      await session.run(cypher, { ...properties, fromId, toId });
    }
  }

  /**
   * Upsert a jurisdiction
   */
  async upsertJurisdiction(dto: UpsertJurisdictionDto): Promise<void> {
    const ctx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Jurisdiction',
      properties: { ...dto },
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(ctx);
  }

  /**
   * Upsert a region
   */
  async upsertRegion(dto: UpsertRegionDto): Promise<void> {
    const { parentJurisdictionId, ...nodeProps } = dto;

    // First, upsert the region node
    const nodeCtx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Region',
      properties: nodeProps,
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(nodeCtx);

    // Then, create the relationship to parent jurisdiction
    const relCtx: GraphWriteContext = {
      operation: 'merge',
      relType: 'PART_OF',
      properties: {},
      tenantId: this.tenantId,
      source: this.defaultSource,
      metadata: {
        fromLabel: 'Region',
        fromId: dto.id,
        toLabel: 'Jurisdiction',
        toId: parentJurisdictionId,
      },
    };
    await this.executeWrite(relCtx);
  }

  /**
   * Upsert a statute
   */
  async upsertStatute(dto: UpsertStatuteDto): Promise<void> {
    const { jurisdictionId, ...nodeProps } = dto;

    const nodeCtx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Statute',
      properties: nodeProps,
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(nodeCtx);

    const relCtx: GraphWriteContext = {
      operation: 'merge',
      relType: 'IN_JURISDICTION',
      properties: {},
      tenantId: this.tenantId,
      source: this.defaultSource,
      metadata: {
        fromLabel: 'Statute',
        fromId: dto.id,
        toLabel: 'Jurisdiction',
        toId: jurisdictionId,
      },
    };
    await this.executeWrite(relCtx);
  }

  /**
   * Upsert a section
   */
  async upsertSection(dto: UpsertSectionDto): Promise<void> {
    const { statuteId, jurisdictionId, ...nodeProps } = dto;

    const nodeCtx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Section',
      properties: nodeProps,
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(nodeCtx);

    // Link to statute
    const relCtx1: GraphWriteContext = {
      operation: 'merge',
      relType: 'PART_OF',
      properties: {},
      tenantId: this.tenantId,
      source: this.defaultSource,
      metadata: {
        fromLabel: 'Section',
        fromId: dto.id,
        toLabel: 'Statute',
        toId: statuteId,
      },
    };
    await this.executeWrite(relCtx1);

    // Link to jurisdiction
    const relCtx2: GraphWriteContext = {
      operation: 'merge',
      relType: 'IN_JURISDICTION',
      properties: {},
      tenantId: this.tenantId,
      source: this.defaultSource,
      metadata: {
        fromLabel: 'Section',
        fromId: dto.id,
        toLabel: 'Jurisdiction',
        toId: jurisdictionId,
      },
    };
    await this.executeWrite(relCtx2);
  }

  /**
   * Upsert a benefit
   */
  async upsertBenefit(dto: UpsertBenefitDto): Promise<void> {
    const { jurisdictionId, ...nodeProps } = dto;

    const nodeCtx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Benefit',
      properties: nodeProps,
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(nodeCtx);

    const relCtx: GraphWriteContext = {
      operation: 'merge',
      relType: 'IN_JURISDICTION',
      properties: {},
      tenantId: this.tenantId,
      source: this.defaultSource,
      metadata: {
        fromLabel: 'Benefit',
        fromId: dto.id,
        toLabel: 'Jurisdiction',
        toId: jurisdictionId,
      },
    };
    await this.executeWrite(relCtx);
  }

  /**
   * Upsert a relief
   */
  async upsertRelief(dto: UpsertReliefDto): Promise<void> {
    const { jurisdictionId, ...nodeProps } = dto;

    const nodeCtx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Relief',
      properties: nodeProps,
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(nodeCtx);

    const relCtx: GraphWriteContext = {
      operation: 'merge',
      relType: 'IN_JURISDICTION',
      properties: {},
      tenantId: this.tenantId,
      source: this.defaultSource,
      metadata: {
        fromLabel: 'Relief',
        fromId: dto.id,
        toLabel: 'Jurisdiction',
        toId: jurisdictionId,
      },
    };
    await this.executeWrite(relCtx);
  }

  /**
   * Upsert a timeline constraint
   */
  async upsertTimeline(dto: UpsertTimelineDto): Promise<void> {
    const ctx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Timeline',
      properties: { ...dto },
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(ctx);
  }

  /**
   * Upsert an agreement
   */
  async upsertAgreement(dto: UpsertAgreementDto): Promise<void> {
    const ctx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Agreement',
      properties: { ...dto },
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(ctx);
  }

  /**
   * Upsert a regime
   */
  async upsertRegime(dto: UpsertRegimeDto): Promise<void> {
    const ctx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Regime',
      properties: { ...dto },
      tenantId: this.tenantId,
      source: this.defaultSource,
    };
    await this.executeWrite(ctx);
  }

  /**
   * Create a generic relationship between two nodes
   */
  async createRelationship(dto: CreateRelationshipDto): Promise<void> {
    const ctx: GraphWriteContext = {
      operation: 'merge',
      relType: dto.relType,
      properties: dto.properties || {},
      tenantId: this.tenantId,
      source: this.defaultSource,
      metadata: {
        fromLabel: dto.fromLabel,
        fromId: dto.fromId,
        toLabel: dto.toLabel,
        toId: dto.toId,
      },
    };
    await this.executeWrite(ctx);
  }

  /**
   * Upsert a SKOS-style concept captured from chat
   */
  async upsertConcept(dto: UpsertConceptDto): Promise<void> {
    const now = new Date().toISOString();
    const ctx: GraphWriteContext = {
      operation: 'merge',
      nodeLabel: 'Concept',
      properties: {
        ...dto,
        created_at: dto.created_at || now,
        updated_at: dto.updated_at || now,
      },
      tenantId: this.tenantId,
      source: this.defaultSource,
    };

    await this.executeWrite(ctx);
  }

  /**
   * Close the driver connection
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}

/**
 * Create a GraphWriteService instance
 */
export function createGraphWriteService(config: GraphWriteServiceConfig): GraphWriteService {
  return new GraphWriteService(config);
}
