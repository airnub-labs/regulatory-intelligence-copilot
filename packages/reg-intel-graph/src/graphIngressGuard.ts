/**
 * Graph Ingress Guard v0.1
 *
 * Implements the aspect-based ingress guard pattern for all Memgraph writes.
 * See: docs/safety/safety-guards/graph_ingress_guard_v_0_1.md
 */

/**
 * Context for a graph write operation
 */
export interface GraphWriteContext {
  /** Operation type */
  operation: 'create' | 'merge' | 'update' | 'delete';
  /** Node label (if writing a node) */
  nodeLabel?: string;
  /** Relationship type (if writing a relationship) */
  relType?: string;
  /** Properties to write */
  properties: Record<string, unknown>;
  /** Tenant ID (for logging/audit only, never persisted in graph) */
  tenantId?: string;
  /** Source of the write request */
  source: 'ingestion' | 'agent' | 'background_job' | 'script';
  /** Additional metadata for aspects to use */
  metadata?: Record<string, unknown>;
}

/**
 * Graph ingress aspect function type
 */
export type GraphIngressAspect = (
  ctx: GraphWriteContext,
  next: (ctx: GraphWriteContext) => Promise<GraphWriteContext>,
) => Promise<GraphWriteContext>;

/**
 * Compose multiple ingress aspects into a pipeline
 */
export function composeIngressAspects(
  aspects: GraphIngressAspect[],
  terminal: (ctx: GraphWriteContext) => Promise<GraphWriteContext>,
): (ctx: GraphWriteContext) => Promise<GraphWriteContext> {
  return aspects.reduceRight<(ctx: GraphWriteContext) => Promise<GraphWriteContext>>(
    (next, aspect) => (ctx) => aspect(ctx, next),
    terminal,
  );
}

/**
 * Baseline aspect: Schema validation
 * Ensures node labels and relationship types are whitelisted
 */
export const schemaValidationAspect: GraphIngressAspect = async (ctx, next) => {
  const allowedNodeLabels = [
    'Jurisdiction',
    'Region',
    'Agreement',
    'Treaty',
    'Regime',
    'Statute',
    'Section',
    'Benefit',
    'Relief',
    'Condition',
    'Timeline',
    'ProfileTag',
    'Community',
    'EURegulation',
    'EUDirective',
    'Guidance',
    'Case',
    'Update',
    'ChangeEvent',
  ];

  const allowedRelTypes = [
    'IN_JURISDICTION',
    'PART_OF',
    'PART_OF_REGIME',
    'SUBSECTION_OF',
    'APPLIES_IN',
    'CITES',
    'REFERENCES',
    'REQUIRES',
    'LIMITED_BY',
    'EXCLUDES',
    'MUTUALLY_EXCLUSIVE_WITH',
    'LOOKBACK_WINDOW',
    'LOCKS_IN_FOR_PERIOD',
    'FILING_DEADLINE',
    'EFFECTIVE_WINDOW',
    'USAGE_FREQUENCY',
    'COORDINATED_WITH',
    'TREATY_LINKED_TO',
    'EQUIVALENT_TO',
    'IMPLEMENTED_BY',
    'OVERRIDES',
    'INTERPRETS',
    'AFFECTS',
    'CHANGES_INTERPRETATION_OF',
    'UPDATES',
    'AMENDED_BY',
    'HAS_PROFILE_TAG',
    'APPLIES_TO_PROFILE',
    'CONTAINS',
    'PARTY_TO',
    'MODIFIED_BY',
    'ESTABLISHES_REGIME',
    'IMPLEMENTED_VIA',
    'SUBJECT_TO_REGIME',
    'AVAILABLE_VIA_REGIME',
  ];

  if (ctx.nodeLabel && !allowedNodeLabels.includes(ctx.nodeLabel)) {
    throw new Error(
      `Graph Ingress Guard: Disallowed node label "${ctx.nodeLabel}". ` +
        `Allowed labels: ${allowedNodeLabels.join(', ')}`,
    );
  }

  if (ctx.relType && !allowedRelTypes.includes(ctx.relType)) {
    throw new Error(
      `Graph Ingress Guard: Disallowed relationship type "${ctx.relType}". ` +
        `Allowed types: ${allowedRelTypes.join(', ')}`,
    );
  }

  return next(ctx);
};

/**
 * Baseline aspect: PII and tenant data blocking
 * Ensures no user/tenant PII is written to the graph
 */
export const piiBlockingAspect: GraphIngressAspect = async (ctx, next) => {
  // Disallowed property keys that might contain PII or tenant data
  const disallowedKeys = [
    'userId',
    'user_id',
    'userName',
    'user_name',
    'userEmail',
    'user_email',
    'email',
    'tenantId', // tenant ID is OK in context for logging, but NEVER in graph properties
    'tenant_id',
    'tenantName',
    'tenant_name',
    'organizationId',
    'organization_id',
    'accountId',
    'account_id',
    'ppsn',
    'PPSN',
    'ssn',
    'SSN',
    'nino',
    'NINO',
    'iban',
    'IBAN',
    'phone',
    'phoneNumber',
    'phone_number',
    'address',
    'street',
    'postalCode',
    'postal_code',
    'postcode',
    'firstName',
    'first_name',
    'lastName',
    'last_name',
    'fullName',
    'full_name',
    'dateOfBirth',
    'date_of_birth',
    'dob',
    'DOB',
  ];

  // Check for disallowed keys in properties
  for (const key of Object.keys(ctx.properties)) {
    if (disallowedKeys.includes(key)) {
      throw new Error(
        `Graph Ingress Guard: Disallowed property key "${key}" detected. ` +
          `The global graph must not contain user or tenant PII. ` +
          `See: docs/safety/data_privacy_and_architecture_boundaries_v_0_1.md`,
      );
    }
  }

  // Check for potential PII in string values (basic heuristics)
  for (const [key, value] of Object.entries(ctx.properties)) {
    if (typeof value === 'string') {
      // Check for email-like patterns
      if (/@/.test(value) && /\.[a-z]{2,}$/i.test(value)) {
        throw new Error(
          `Graph Ingress Guard: Property "${key}" appears to contain an email address. ` +
            `No PII allowed in the global graph.`,
        );
      }

      // Check for phone-like patterns (very basic)
      if (/^\+?[\d\s\-()]{10,}$/.test(value)) {
        throw new Error(
          `Graph Ingress Guard: Property "${key}" appears to contain a phone number. ` +
            `No PII allowed in the global graph.`,
        );
      }
    }
  }

  return next(ctx);
};

/**
 * Baseline aspect: Property whitelisting
 * Ensures only approved properties are written for each node/relationship type
 */
export const propertyWhitelistAspect: GraphIngressAspect = async (ctx, next) => {
  // Define allowed properties for each node label
  // This is a simplified version - expand as needed per graph_schema_v_0_4.md
  const nodePropertyWhitelist: Record<string, string[]> = {
    Jurisdiction: ['id', 'name', 'type', 'notes', 'code'],
    Region: ['id', 'name', 'type', 'notes'],
    Agreement: ['id', 'name', 'type', 'description', 'effective_from', 'effective_to'],
    Treaty: ['id', 'name', 'type', 'description', 'effective_from', 'effective_to'],
    Regime: ['id', 'name', 'category', 'description'],
    Statute: ['id', 'name', 'citation', 'source_url', 'type'],
    Section: [
      'id',
      'label',
      'title',
      'text_excerpt',
      'effective_from',
      'effective_to',
      'section_number',
    ],
    Benefit: ['id', 'name', 'category', 'short_summary', 'description'],
    Relief: ['id', 'name', 'tax_type', 'short_summary', 'description'],
    Condition: ['id', 'label', 'description', 'category'],
    Timeline: [
      'id',
      'label',
      'window_days',
      'window_months',
      'window_years',
      'kind',
      'jurisdictionCode',
      'description',
    ],
    ProfileTag: ['id', 'label', 'description'],
    Community: ['id', 'label', 'size', 'representative_nodes'],
    EURegulation: ['id', 'name', 'number', 'effective_from', 'effective_to', 'description'],
    EUDirective: ['id', 'name', 'number', 'effective_from', 'effective_to', 'description'],
    Guidance: ['id', 'title', 'source', 'url', 'effective_from', 'category'],
    Case: ['id', 'title', 'citation', 'court', 'decision_date', 'summary'],
    Update: ['id', 'kind', 'description', 'effective_from', 'effective_to', 'source_url'],
    ChangeEvent: ['id', 'kind', 'description', 'effective_from', 'effective_to', 'source_url'],
  };

  // Algorithm-derived properties that are allowed on any node
  const universalAllowedProps = ['community_id', 'centrality_score'];

  if (ctx.nodeLabel) {
    const allowedProps = nodePropertyWhitelist[ctx.nodeLabel] || [];
    const allAllowed = [...allowedProps, ...universalAllowedProps];

    for (const key of Object.keys(ctx.properties)) {
      if (!allAllowed.includes(key)) {
        throw new Error(
          `Graph Ingress Guard: Property "${key}" is not whitelisted for node label "${ctx.nodeLabel}". ` +
            `Allowed properties: ${allAllowed.join(', ')}`,
        );
      }
    }
  }

  // For relationships, we're more lenient for now
  // Expand this as needed based on schema requirements

  return next(ctx);
};

/**
 * Create default baseline aspects pipeline
 */
export function createBaselineAspects(): GraphIngressAspect[] {
  return [schemaValidationAspect, piiBlockingAspect, propertyWhitelistAspect];
}
