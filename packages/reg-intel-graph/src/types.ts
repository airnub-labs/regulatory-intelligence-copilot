/**
 * Type definitions for @reg-copilot/reg-intel-graph
 *
 * Graph-related types for nodes, edges, contexts, and clients.
 */

/**
 * Timeline representing temporal constraints
 */
export interface Timeline {
  id: string;
  label: string;
  window_days?: number;
  window_months?: number;
  window_years?: number;
  notes?: string;
}

/**
 * Obligation representing a compliance requirement
 */
export interface Obligation {
  id: string;
  label: string;
  category: 'FILING' | 'REPORTING' | 'PAYMENT' | 'REGISTRATION';
  frequency?: 'ANNUAL' | 'QUARTERLY' | 'MONTHLY' | 'ONE_TIME';
  penalty_applies?: boolean;
  description?: string;
}

/**
 * Threshold representing a numeric limit or boundary
 */
export interface Threshold {
  id: string;
  label: string;
  value: number;
  unit: 'EUR' | 'GBP' | 'WEEKS' | 'DAYS' | 'COUNT' | 'PERCENT';
  direction: 'ABOVE' | 'BELOW' | 'BETWEEN';
  upper_bound?: number;
  effective_from?: string;
  effective_to?: string;
  category?: string;
}

/**
 * Rate representing a tax rate, contribution rate, or benefit rate
 */
export interface Rate {
  id: string;
  label: string;
  percentage?: number;
  flat_amount?: number;
  currency?: string;
  band_lower?: number;
  band_upper?: number;
  effective_from?: string;
  effective_to?: string;
  category: string;
}

/**
 * Form representing a regulatory form or document
 */
export interface Form {
  id: string;
  label: string;
  issuing_body: string;
  form_number?: string;
  source_url?: string;
  category: string;
  online_only?: boolean;
}

/**
 * PRSIClass representing Irish social insurance classification
 */
export interface PRSIClass {
  id: string;
  label: string;
  description: string;
  eligible_benefits?: string[];
}

/**
 * LifeEvent representing significant life events that trigger regulatory changes
 */
export interface LifeEvent {
  id: string;
  label: string;
  category: 'FAMILY' | 'EMPLOYMENT' | 'HEALTH' | 'RESIDENCY';
  triggers_timeline?: boolean;
  description?: string;
}

/**
 * Graph node representing any regulatory entity
 */
export interface GraphNode {
  id: string;
  label: string;
  type:
    | 'Statute'
    | 'Section'
    | 'Benefit'
    | 'Relief'
    | 'Condition'
    | 'Timeline'
    | 'Case'
    | 'Guidance'
    | 'EURegulation'
    | 'EUDirective'
    | 'ProfileTag'
    | 'Jurisdiction'
    | 'Update'
    | 'Concept'
    | 'Label'
    | 'Region'
    | 'Agreement'
    | 'Treaty'
    | 'Regime'
    | 'Community'
    | 'ChangeEvent'
    | 'Obligation'
    | 'Threshold'
    | 'Rate'
    | 'Form'
    | 'PRSIClass'
    | 'LifeEvent';
  properties: Record<string, unknown>;
}

/**
 * Graph edge representing a relationship
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

/**
 * Graph context for agent reasoning
 */
export interface GraphContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Graph client interface for Memgraph operations
 */
export interface GraphClient {
  /**
   * Get rules matching profile and jurisdiction with optional keyword
   *
   * @param profileId - Profile identifier (e.g., 'self-employed', 'single-director').
   *   Accepts string for flexibility but typically receives ProfileId values from upper layers.
   *   Note: Parameter is named 'profileId' at the graph layer, but may be called 'profileType'
   *   in API/filter contexts - both refer to the same ProfileId concept.
   * @param jurisdictionId - Jurisdiction code (e.g., 'IE', 'UK')
   * @param keyword - Optional keyword filter for nodes/edges
   * @returns Graph context containing matching nodes and edges
   */
  getRulesForProfileAndJurisdiction(
    profileId: string,
    jurisdictionId: string,
    keyword?: string
  ): Promise<GraphContext>;

  /**
   * Get neighbourhood of a node (1-2 hops)
   */
  getNeighbourhood(nodeId: string): Promise<GraphContext>;

  /**
   * Get mutual exclusions for a node
   */
  getMutualExclusions(nodeId: string): Promise<GraphNode[]>;

  /**
   * Get timeline constraints for a node
   */
  getTimelines(nodeId: string): Promise<Timeline[]>;

  /**
   * Get cross-border slice for multiple jurisdictions
   */
  getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphContext>;

  /**
   * Get obligations for a profile and jurisdiction
   */
  getObligationsForProfile(
    profileId: string,
    jurisdictionId: string
  ): Promise<Obligation[]>;

  /**
   * Get thresholds for a condition
   */
  getThresholdsForCondition(conditionId: string): Promise<Threshold[]>;

  /**
   * Get rates for a category and jurisdiction
   */
  getRatesForCategory(
    category: string,
    jurisdictionId: string
  ): Promise<Rate[]>;

  /**
   * Check if a value is near any threshold (within tolerance)
   */
  getThresholdsNearValue(
    value: number,
    unit: string,
    tolerancePercent: number
  ): Promise<Threshold[]>;

  /**
   * Get form required for an obligation or benefit
   */
  getFormForObligation(obligationId: string): Promise<Form | null>;

  /**
   * Get concept hierarchy (broader/narrower concepts)
   */
  getConceptHierarchy(conceptId: string): Promise<{
    broader: GraphNode[];
    narrower: GraphNode[];
    related: GraphNode[];
  }>;

  /**
   * Get PRSI class by ID
   */
  getPRSIClassById(prsiClassId: string): Promise<PRSIClass | null>;

  /**
   * Get benefits entitled by PRSI class
   */
  getBenefitsForPRSIClass(prsiClassId: string, jurisdictionId: string): Promise<GraphNode[]>;

  /**
   * Get life events that trigger a specific benefit or obligation
   */
  getLifeEventsForNode(nodeId: string): Promise<LifeEvent[]>;

  /**
   * Get benefits and obligations triggered by a life event
   */
  getTriggeredByLifeEvent(lifeEventId: string, jurisdictionId: string): Promise<{
    benefits: GraphNode[];
    obligations: GraphNode[];
  }>;

  /**
   * Execute raw Cypher query
   */
  executeCypher(query: string, params?: Record<string, unknown>): Promise<unknown>;
}
