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
 * Graph node representing any regulatory entity
 */
export interface GraphNode {
  id: string;
  label: string;
  type: 'Statute' | 'Section' | 'Benefit' | 'Relief' | 'Condition' | 'Timeline' | 'Case' | 'Guidance' | 'EURegulation' | 'EUDirective' | 'ProfileTag' | 'Jurisdiction' | 'Update';
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
   * Execute raw Cypher query
   */
  executeCypher(query: string, params?: Record<string, unknown>): Promise<unknown>;
}
