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
 * Penalty representing consequences of non-compliance
 */
export interface Penalty {
  id: string;
  label: string;
  penalty_type: 'SURCHARGE' | 'INTEREST' | 'FIXED' | 'PROSECUTION' | 'RESTRICTION';
  rate?: number;
  daily_rate?: number;
  flat_amount?: number;
  currency?: string;
  max_amount?: number;
  applies_after_days?: number;
  applies_after_months?: number;
  description?: string;
}

/**
 * LegalEntity representing a type of legal structure
 */
export interface LegalEntity {
  id: string;
  label: string;
  abbreviation?: string;
  jurisdiction: string;
  category: 'COMPANY' | 'PARTNERSHIP' | 'SOLE_TRADER' | 'TRUST' | 'CHARITY' | 'FUND';
  sub_category?: string;
  has_separate_legal_personality: boolean;
  limited_liability: boolean;
  can_trade: boolean;
  can_hold_property: boolean;
  tax_transparent?: boolean;
  description?: string;
}

/**
 * TaxCredit representing a direct reduction in tax liability
 */
export interface TaxCredit {
  id: string;
  label: string;
  amount: number;
  currency: string;
  tax_year: number;
  refundable: boolean;
  transferable: boolean;
  restricted_to_marginal?: boolean;
  category: 'PERSONAL' | 'EMPLOYMENT' | 'FAMILY' | 'HEALTH' | 'HOUSING' | 'OTHER';
  description?: string;
}

/**
 * RegulatoryBody representing a government body or regulator
 */
export interface RegulatoryBody {
  id: string;
  label: string;
  abbreviation?: string;
  jurisdiction: string;
  domain: 'TAX' | 'SOCIAL_WELFARE' | 'COMPANY' | 'PENSIONS' | 'FINANCIAL' | 'OTHER';
  website?: string;
  contact_info?: string;
  description?: string;
}

/**
 * AssetClass representing a category of assets for tax purposes
 */
export interface AssetClass {
  id: string;
  label: string;
  category: 'PROPERTY' | 'SHARES' | 'CRYPTO' | 'AGRICULTURAL' | 'OTHER';
  sub_category?: string;
  tangible: boolean;
  cgt_applicable: boolean;
  cat_applicable: boolean;
  stamp_duty_applicable: boolean;
  description?: string;
}

/**
 * MeansTest representing eligibility criteria for benefits
 */
export interface MeansTest {
  id: string;
  label: string;
  income_disregard?: number;
  capital_threshold?: number;
  capital_weekly_assessment?: number;
  spouse_income_assessed?: boolean;
  maintenance_assessed?: boolean;
  categories?: string[];
  description?: string;
}

/**
 * TaxYear representing a fiscal year
 */
export interface TaxYear {
  id: string;
  year: number;
  start_date: string;
  end_date: string;
  jurisdiction: string;
}

/**
 * NIClass representing UK National Insurance classification
 */
export interface NIClass {
  id: string;
  label: string;
  description: string;
  rate: number;
  threshold_weekly?: number;
  threshold_annual?: number;
  eligible_benefits?: string[];
}

/**
 * BenefitCap representing maximum benefit amounts
 */
export interface BenefitCap {
  id: string;
  label: string;
  amount_single?: number;
  amount_couple?: number;
  amount_with_children?: number;
  currency: string;
  frequency: 'WEEKLY' | 'MONTHLY' | 'ANNUAL';
  exemptions?: string[];
  effective_from?: string;
  effective_to?: string;
}

/**
 * CoordinationRule representing EU social security coordination
 */
export interface CoordinationRule {
  id: string;
  label: string;
  regulation: string;
  article?: string;
  applies_to: string;
  home_jurisdiction?: string;
  host_jurisdiction?: string;
  duration_months?: number;
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
    | 'LifeEvent'
    | 'Penalty'
    | 'LegalEntity'
    | 'TaxCredit'
    | 'RegulatoryBody'
    | 'AssetClass'
    | 'MeansTest'
    | 'TaxYear'
    | 'NIClass'
    | 'BenefitCap'
    | 'CoordinationRule';
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
   * Get penalties for an obligation
   */
  getPenaltiesForObligation(obligationId: string): Promise<Penalty[]>;

  /**
   * Get all penalties for a profile's obligations
   */
  getPenaltiesForProfile(
    profileId: string,
    jurisdictionId: string
  ): Promise<{ obligation: Obligation; penalties: Penalty[] }[]>;

  /**
   * Check if penalty can be waived based on conditions
   */
  getPenaltyWaiverConditions(penaltyId: string): Promise<GraphNode[]>;

  /**
   * Get legal entity types for a jurisdiction
   */
  getLegalEntitiesForJurisdiction(jurisdictionId: string): Promise<LegalEntity[]>;

  /**
   * Get obligations specific to an entity type
   */
  getObligationsForEntityType(entityTypeId: string): Promise<Obligation[]>;

  /**
   * Get tax credits for a profile and tax year
   */
  getTaxCreditsForProfile(
    profileId: string,
    taxYear: number,
    jurisdictionId: string
  ): Promise<TaxCredit[]>;

  /**
   * Get reliefs/benefits that stack with a given node
   */
  getStackingOptions(nodeId: string): Promise<GraphNode[]>;

  /**
   * Get items that reduce a benefit/relief
   */
  getReducingFactors(nodeId: string): Promise<GraphNode[]>;

  /**
   * Get regulatory bodies for a jurisdiction
   */
  getRegulatoryBodiesForJurisdiction(jurisdictionId: string): Promise<RegulatoryBody[]>;

  /**
   * Get regulatory body that administers an obligation or benefit
   */
  getAdministeringBody(nodeId: string): Promise<RegulatoryBody | null>;

  /**
   * Get asset classes for a jurisdiction
   */
  getAssetClassesForJurisdiction(jurisdictionId: string): Promise<AssetClass[]>;

  /**
   * Get CGT rate for an asset class
   */
  getCGTRateForAsset(assetClassId: string): Promise<Rate | null>;

  /**
   * Get rates and thresholds for tax year
   */
  getRatesForTaxYear(taxYear: number, jurisdictionId: string): Promise<{
    rates: Rate[];
    thresholds: Threshold[];
    credits: TaxCredit[];
  }>;

  /**
   * Get means test for a benefit
   */
  getMeansTestForBenefit(benefitId: string): Promise<MeansTest | null>;

  /**
   * Get National Insurance classes for a jurisdiction
   */
  getNIClassesForJurisdiction(jurisdictionId: string): Promise<NIClass[]>;

  /**
   * Get NI class for an employment type
   */
  getNIClassForEmploymentType(employmentType: string, jurisdictionId: string): Promise<NIClass | null>;

  /**
   * Get benefit caps for a jurisdiction
   */
  getBenefitCapsForJurisdiction(jurisdictionId: string): Promise<BenefitCap[]>;

  /**
   * Get benefits subject to a benefit cap
   */
  getBenefitsSubjectToCap(capId: string): Promise<GraphNode[]>;

  /**
   * Get coordination rules between jurisdictions
   */
  getCoordinationRules(homeJurisdiction: string, hostJurisdiction: string): Promise<CoordinationRule[]>;

  /**
   * Get posted worker rules for a profile
   */
  getPostedWorkerRules(profileId: string, homeJurisdiction: string, hostJurisdiction: string): Promise<{
    rules: CoordinationRule[];
    benefits: GraphNode[];
  }>;

  /**
   * Execute raw Cypher query
   */
  executeCypher(query: string, params?: Record<string, unknown>): Promise<unknown>;
}
