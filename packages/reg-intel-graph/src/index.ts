/**
 * @package reg-intel-graph
 *
 * Graph client, schema, write services, and ingress guard for regulatory intelligence.
 *
 * This package provides:
 * - Graph clients (direct Bolt)
 * - GraphWriteService (guarded writes to Memgraph)
 * - Graph Ingress Guard (aspect pipeline for write validation)
 * - GraphChangeDetector (patch-based streaming)
 */

// Graph Clients
export {
  BoltGraphClient,
  createBoltGraphClient,
  type BoltGraphClientConfig,
} from './boltGraphClient.js';

// Re-export types
export type {
  GraphClient,
  GraphContext,
  GraphNode,
  GraphEdge,
  Timeline,
} from './types.js';

export type {
  GraphError,
  ComplianceError,
} from './errors.js';

// Graph Ingress Guard
export {
  type GraphWriteContext,
  type GraphIngressAspect,
  composeIngressAspects,
  schemaValidationAspect,
  piiBlockingAspect,
  propertyWhitelistAspect,
  createBaselineAspects,
} from './graphIngressGuard.js';

// Graph Write Service
export {
  GraphWriteService,
  createGraphWriteService,
  type GraphWriteServiceConfig,
  type UpsertJurisdictionDto,
  type UpsertRegionDto,
  type UpsertStatuteDto,
  type UpsertSectionDto,
  type UpsertBenefitDto,
  type UpsertReliefDto,
  type UpsertTimelineDto,
  type UpsertAgreementDto,
  type UpsertRegimeDto,
  type CreateRelationshipDto,
} from './graphWriteService.js';

// Graph Change Detector
export {
  GraphChangeDetector,
  createGraphChangeDetector,
  type GraphChangeDetectorConfig,
  type GraphPatch,
  type ChangeFilter,
  type ChangeCallback,
  type ChangeSubscription,
} from './graphChangeDetector.js';
