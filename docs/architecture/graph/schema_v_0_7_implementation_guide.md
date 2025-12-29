# Schema v0.7 Implementation Guide for Coding Agents

> **Purpose**: This guide provides step-by-step implementation instructions for coding agents to implement the v0.7 schema enhancements.
> **Audience**: AI coding agents, developers implementing the schema changes
> **Prerequisites**: Familiarity with TypeScript, Memgraph/Cypher, and the existing codebase structure

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Locations](#2-file-locations)
3. [Implementation Tasks](#3-implementation-tasks)
4. [TypeScript Interfaces](#4-typescript-interfaces)
5. [GraphWriteService Methods](#5-graphwriteservice-methods)
6. [Graph Ingress Guard Updates](#6-graph-ingress-guard-updates)
7. [GraphClient Query Methods](#7-graphclient-query-methods)
8. [Seed Data Scripts](#8-seed-data-scripts)
9. [Testing Requirements](#9-testing-requirements)
10. [Common Patterns](#10-common-patterns)

---

## 1. Overview

### What's Being Added

| Component | Files to Modify | New Files |
|-----------|-----------------|-----------|
| Type Definitions | `packages/reg-intel-graph/src/types.ts` | - |
| Write Service | `packages/reg-intel-graph/src/graphWriteService.ts` | - |
| Ingress Guard | `packages/reg-intel-graph/src/graphIngressGuard.ts` | - |
| Graph Client | `packages/reg-intel-core/src/graph/graphClient.ts` | - |
| Seed Data | - | `scripts/seed/seed_v0_7_*.ts` |
| Tests | - | `packages/reg-intel-graph/src/__tests__/v0_7_*.test.ts` |

### Priority Order

1. **HIGH**: Types → Ingress Guard → WriteService (Obligation, Threshold, Rate)
2. **MEDIUM**: WriteService (Authority, Form, Contribution) → GraphClient queries
3. **LOW**: Seed data → Advanced relationships → Full test coverage

---

## 2. File Locations

```
packages/
├── reg-intel-graph/
│   └── src/
│       ├── types.ts                    # Add new interfaces
│       ├── graphWriteService.ts        # Add upsert methods
│       ├── graphIngressGuard.ts        # Update whitelists
│       └── __tests__/
│           └── v0_7_nodes.test.ts      # New tests
├── reg-intel-core/
│   └── src/
│       ├── types.ts                    # Re-export types
│       └── graph/
│           └── graphClient.ts          # Add query methods
scripts/
└── seed/
    ├── seed_v0_7_authorities.ts        # Seed authorities
    ├── seed_v0_7_thresholds.ts         # Seed thresholds
    └── seed_v0_7_rates.ts              # Seed rates
```

---

## 3. Implementation Tasks

### Task 1: Add TypeScript Interfaces

**File**: `packages/reg-intel-graph/src/types.ts`

**Action**: Add the following interfaces after existing type definitions.

```typescript
// ============================================================================
// v0.7 Node Types
// ============================================================================

/**
 * Obligation - Represents something a person/entity MUST do
 *
 * Use cases:
 * - "What are my filing obligations as a single director?"
 * - "What happens if I miss the Form 11 deadline?"
 * - "What obligations does claiming R&D credit trigger?"
 */
export interface Obligation {
  id: string;
  label: string;
  description?: string;
  /** Category of obligation */
  category: 'FILING' | 'REGISTRATION' | 'REPORTING' | 'PAYMENT' | 'RECORD_KEEPING' | 'NOTIFICATION';
  /** How often the obligation recurs */
  frequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'EVENT_TRIGGERED' | 'CONTINUOUS';
  /** Type of penalty for non-compliance */
  penalty_type?: 'FIXED' | 'PERCENTAGE' | 'INTEREST' | 'SURCHARGE' | 'CRIMINAL' | 'DISQUALIFICATION';
  /** Fixed penalty amount (if penalty_type is FIXED) */
  penalty_amount?: number;
  /** Percentage penalty rate (if penalty_type is PERCENTAGE) */
  penalty_rate?: number;
  /** Jurisdiction code (e.g., "IE", "UK") */
  jurisdictionCode: string;
  /** ID of administering authority */
  administering_authority?: string;
  pref_label?: string;
  alt_labels?: string[];
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Threshold - Quantitative limit that determines eligibility or triggers requirements
 *
 * Use cases:
 * - "What's the VAT registration threshold in Ireland?"
 * - "Compare CGT exemption thresholds across jurisdictions"
 * - "When did the audit exemption threshold change?"
 */
export interface Threshold {
  id: string;
  label: string;
  /** The numeric threshold value */
  value: number;
  /** Currency code for monetary thresholds */
  currency?: 'EUR' | 'GBP' | 'USD';
  /** Unit of measurement */
  unit?: 'CURRENCY' | 'DAYS' | 'WEEKS' | 'YEARS' | 'PERCENTAGE' | 'COUNT';
  /** Time period the threshold applies to */
  period?: 'ANNUAL' | 'LIFETIME' | 'PER_TRANSACTION' | 'ROLLING_12_MONTH' | 'TAX_YEAR';
  /** Direction of comparison */
  direction: 'ABOVE' | 'BELOW' | 'EQUAL' | 'AT_OR_ABOVE' | 'AT_OR_BELOW';
  /** When this threshold became effective */
  effective_from?: Date;
  /** When this threshold was superseded (null = still active) */
  effective_to?: Date;
  /** Whether threshold is adjusted for inflation */
  inflation_indexed?: boolean;
  /** Reference index for inflation adjustment */
  index_reference?: string;
  jurisdictionCode: string;
  source_url?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Rate - Tax rate, contribution rate, or benefit rate
 *
 * Use cases:
 * - "What's the corporation tax rate in Ireland?"
 * - "Compare income tax rates across jurisdictions"
 * - "What's the PRSI rate for self-employed?"
 */
export interface Rate {
  id: string;
  label: string;
  /** The rate as a decimal (e.g., 0.125 for 12.5%) */
  percentage: number;
  /** Type of rate */
  rate_type: 'FLAT' | 'MARGINAL' | 'EFFECTIVE' | 'REDUCED' | 'STANDARD';
  /** What the rate applies to */
  base?: 'GROSS_INCOME' | 'TAXABLE_INCOME' | 'CAPITAL_GAIN' | 'TURNOVER' | 'VALUE_ADDED';
  /** Lower bound for marginal rates */
  band_min?: number;
  /** Upper bound for marginal rates (null = unlimited) */
  band_max?: number;
  /** Currency for band values */
  currency?: 'EUR' | 'GBP' | 'USD';
  effective_from?: Date;
  effective_to?: Date;
  jurisdictionCode: string;
  source_url?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Authority - Regulatory body or government agency
 *
 * Use cases:
 * - "Who administers Jobseeker's Benefit?"
 * - "What's the appeal path from Revenue?"
 * - "Where do I file my VAT return?"
 */
export interface Authority {
  id: string;
  name: string;
  short_name?: string;
  jurisdictionCode: string;
  /** Areas of responsibility */
  domains: string[];
  website?: string;
  contact_url?: string;
  parent_authority_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Form - Official form or return
 *
 * Use cases:
 * - "What form do I need to file my self-assessment?"
 * - "Can I file Form 11 electronically?"
 * - "Where can I get the CT1 form?"
 */
export interface Form {
  id: string;
  name: string;
  form_code?: string;
  description?: string;
  form_type: 'TAX_RETURN' | 'APPLICATION' | 'NOTIFICATION' | 'CLAIM' | 'REGISTRATION' | 'REPORT';
  electronic_available: boolean;
  paper_available?: boolean;
  source_url?: string;
  jurisdictionCode: string;
  administering_authority_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Contribution - PRSI, pension, or other contribution
 *
 * Use cases:
 * - "What PRSI class am I in as a self-employed person?"
 * - "How do my contributions count towards Jobseeker's Benefit?"
 * - "Can I make voluntary PRSI contributions?"
 */
export interface Contribution {
  id: string;
  label: string;
  description?: string;
  contribution_type: 'MANDATORY' | 'VOLUNTARY' | 'CREDITED' | 'EMPLOYER' | 'EMPLOYEE';
  category: 'PRSI' | 'PENSION' | 'LEVY' | 'USC' | 'SOCIAL_INSURANCE';
  class_code?: string;
  jurisdictionCode: string;
  administering_authority_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Disqualification - Event that prevents access to benefits/reliefs
 *
 * Use cases:
 * - "What would disqualify me from director benefits?"
 * - "How long does a disqualification last?"
 * - "What triggers benefit fraud disqualification?"
 */
export interface Disqualification {
  id: string;
  label: string;
  description?: string;
  category: 'OFFICE_HOLDER' | 'BENEFIT' | 'RELIEF' | 'LICENSE' | 'PROFESSION';
  trigger_type?: 'CONVICTION' | 'NON_COMPLIANCE' | 'FRAUD' | 'INSOLVENCY' | 'CONDUCT';
  duration_min_months?: number;
  duration_max_months?: number;
  jurisdictionCode: string;
  created_at?: Date;
  updated_at?: Date;
}

// ============================================================================
// v0.7 Relationship Provenance
// ============================================================================

/**
 * Provenance metadata for relationships
 * Add these properties to relationship objects when creating edges
 */
export interface RelationshipProvenance {
  /** Source of the information */
  source_type?: 'LEGISLATION' | 'CASE_LAW' | 'GUIDANCE' | 'LLM_INFERRED' | 'HUMAN_VERIFIED';
  /** ID of the source node */
  source_id?: string;
  /** Direct URL to source */
  source_url?: string;
  /** Confidence level (0.0 - 1.0) */
  confidence?: number;
  /** Verifier identifier */
  verified_by?: string;
  /** Verification timestamp */
  verified_at?: Date;
  /** How the relationship was extracted */
  extraction_method?: 'MCP_TOOL' | 'MANUAL' | 'LLM_EXTRACTION' | 'STATUTORY_REFERENCE';
  /** When the relationship was extracted */
  extraction_date?: Date;
}

// ============================================================================
// v0.7 Relationship Types (for type checking)
// ============================================================================

export type V07RelationshipType =
  | 'SUBJECT_TO'
  | 'TRIGGERS_OBLIGATION'
  | 'SATISFIED_BY'
  | 'ADMINISTERED_BY'
  | 'PENALTY_DEFINED_BY'
  | 'HAS_THRESHOLD'
  | 'HAS_RATE'
  | 'SUPERSEDES'
  | 'TRIGGERS'
  | 'UNLOCKS'
  | 'COUNTS_TOWARDS'
  | 'SATISFIES'
  | 'STACKS_WITH'
  | 'REDUCES'
  | 'OFFSETS'
  | 'ISSUED_BY'
  | 'DECIDED_BY'
  | 'APPEALS_TO'
  | 'ADMINISTERS'
  | 'CLAIMED_VIA'
  | 'SUBMITTED_TO'
  | 'CAN_TRIGGER'
  | 'DISQUALIFIES_FROM'
  | 'DURATION'
  | 'GRANDFATHERED_BY';
```

---

### Task 2: Update Graph Ingress Guard

**File**: `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Action**: Add new node labels and relationship types to the whitelist.

```typescript
// Find the ALLOWED_NODE_LABELS constant and add:
const ALLOWED_NODE_LABELS = [
  // ... existing labels ...

  // v0.7 additions
  'Obligation',
  'Threshold',
  'Rate',
  'Authority',
  'Form',
  'Contribution',
  'Disqualification',
];

// Find the ALLOWED_RELATIONSHIP_TYPES constant and add:
const ALLOWED_RELATIONSHIP_TYPES = [
  // ... existing relationships ...

  // v0.7 additions
  'SUBJECT_TO',
  'TRIGGERS_OBLIGATION',
  'SATISFIED_BY',
  'ADMINISTERED_BY',
  'PENALTY_DEFINED_BY',
  'HAS_THRESHOLD',
  'HAS_RATE',
  'SUPERSEDES',
  'TRIGGERS',
  'UNLOCKS',
  'COUNTS_TOWARDS',
  'SATISFIES',
  'STACKS_WITH',
  'REDUCES',
  'OFFSETS',
  'ISSUED_BY',
  'DECIDED_BY',
  'APPEALS_TO',
  'ADMINISTERS',
  'CLAIMED_VIA',
  'SUBMITTED_TO',
  'CAN_TRIGGER',
  'DISQUALIFIES_FROM',
  'DURATION',
  'GRANDFATHERED_BY',
];

// Find or add PROPERTY_WHITELISTS and add:
const PROPERTY_WHITELISTS: Record<string, string[]> = {
  // ... existing whitelists ...

  Obligation: [
    'id', 'label', 'description', 'category', 'frequency',
    'penalty_type', 'penalty_amount', 'penalty_rate',
    'jurisdictionCode', 'administering_authority',
    'pref_label', 'alt_labels', 'created_at', 'updated_at'
  ],
  Threshold: [
    'id', 'label', 'value', 'currency', 'unit', 'period', 'direction',
    'effective_from', 'effective_to', 'inflation_indexed', 'index_reference',
    'jurisdictionCode', 'source_url', 'created_at', 'updated_at'
  ],
  Rate: [
    'id', 'label', 'percentage', 'rate_type', 'base',
    'band_min', 'band_max', 'currency',
    'effective_from', 'effective_to',
    'jurisdictionCode', 'source_url', 'created_at', 'updated_at'
  ],
  Authority: [
    'id', 'name', 'short_name', 'jurisdictionCode', 'domains',
    'website', 'contact_url', 'parent_authority_id',
    'created_at', 'updated_at'
  ],
  Form: [
    'id', 'name', 'form_code', 'description', 'form_type',
    'electronic_available', 'paper_available', 'source_url',
    'jurisdictionCode', 'administering_authority_id',
    'created_at', 'updated_at'
  ],
  Contribution: [
    'id', 'label', 'description', 'contribution_type', 'category',
    'class_code', 'jurisdictionCode', 'administering_authority_id',
    'created_at', 'updated_at'
  ],
  Disqualification: [
    'id', 'label', 'description', 'category', 'trigger_type',
    'duration_min_months', 'duration_max_months', 'jurisdictionCode',
    'created_at', 'updated_at'
  ],
};
```

---

### Task 3: Add GraphWriteService Methods

**File**: `packages/reg-intel-graph/src/graphWriteService.ts`

**Action**: Add upsert methods for each new node type.

```typescript
import type {
  Obligation, Threshold, Rate, Authority, Form, Contribution, Disqualification,
  RelationshipProvenance
} from './types';

// Add these methods to the GraphWriteService class:

/**
 * Upsert an Obligation node
 */
async upsertObligation(obligation: Obligation): Promise<void> {
  const now = new Date().toISOString();
  const query = `
    MERGE (o:Obligation {id: $id})
    SET o.label = $label,
        o.description = $description,
        o.category = $category,
        o.frequency = $frequency,
        o.penalty_type = $penalty_type,
        o.penalty_amount = $penalty_amount,
        o.penalty_rate = $penalty_rate,
        o.jurisdictionCode = $jurisdictionCode,
        o.administering_authority = $administering_authority,
        o.pref_label = $pref_label,
        o.alt_labels = $alt_labels,
        o.updated_at = localdatetime($now)
    ON CREATE SET o.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    ...obligation,
    now,
  });
}

/**
 * Upsert a Threshold node
 */
async upsertThreshold(threshold: Threshold): Promise<void> {
  const now = new Date().toISOString();
  const query = `
    MERGE (t:Threshold {id: $id})
    SET t.label = $label,
        t.value = $value,
        t.currency = $currency,
        t.unit = $unit,
        t.period = $period,
        t.direction = $direction,
        t.effective_from = $effective_from,
        t.effective_to = $effective_to,
        t.inflation_indexed = $inflation_indexed,
        t.index_reference = $index_reference,
        t.jurisdictionCode = $jurisdictionCode,
        t.source_url = $source_url,
        t.updated_at = localdatetime($now)
    ON CREATE SET t.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    ...threshold,
    now,
    effective_from: threshold.effective_from?.toISOString() ?? null,
    effective_to: threshold.effective_to?.toISOString() ?? null,
  });
}

/**
 * Upsert a Rate node
 */
async upsertRate(rate: Rate): Promise<void> {
  const now = new Date().toISOString();
  const query = `
    MERGE (r:Rate {id: $id})
    SET r.label = $label,
        r.percentage = $percentage,
        r.rate_type = $rate_type,
        r.base = $base,
        r.band_min = $band_min,
        r.band_max = $band_max,
        r.currency = $currency,
        r.effective_from = $effective_from,
        r.effective_to = $effective_to,
        r.jurisdictionCode = $jurisdictionCode,
        r.source_url = $source_url,
        r.updated_at = localdatetime($now)
    ON CREATE SET r.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    ...rate,
    now,
    effective_from: rate.effective_from?.toISOString() ?? null,
    effective_to: rate.effective_to?.toISOString() ?? null,
  });
}

/**
 * Upsert an Authority node
 */
async upsertAuthority(authority: Authority): Promise<void> {
  const now = new Date().toISOString();
  const query = `
    MERGE (a:Authority {id: $id})
    SET a.name = $name,
        a.short_name = $short_name,
        a.jurisdictionCode = $jurisdictionCode,
        a.domains = $domains,
        a.website = $website,
        a.contact_url = $contact_url,
        a.parent_authority_id = $parent_authority_id,
        a.updated_at = localdatetime($now)
    ON CREATE SET a.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    ...authority,
    now,
  });
}

/**
 * Upsert a Form node
 */
async upsertForm(form: Form): Promise<void> {
  const now = new Date().toISOString();
  const query = `
    MERGE (f:Form {id: $id})
    SET f.name = $name,
        f.form_code = $form_code,
        f.description = $description,
        f.form_type = $form_type,
        f.electronic_available = $electronic_available,
        f.paper_available = $paper_available,
        f.source_url = $source_url,
        f.jurisdictionCode = $jurisdictionCode,
        f.administering_authority_id = $administering_authority_id,
        f.updated_at = localdatetime($now)
    ON CREATE SET f.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    ...form,
    now,
  });
}

/**
 * Upsert a Contribution node
 */
async upsertContribution(contribution: Contribution): Promise<void> {
  const now = new Date().toISOString();
  const query = `
    MERGE (c:Contribution {id: $id})
    SET c.label = $label,
        c.description = $description,
        c.contribution_type = $contribution_type,
        c.category = $category,
        c.class_code = $class_code,
        c.jurisdictionCode = $jurisdictionCode,
        c.administering_authority_id = $administering_authority_id,
        c.updated_at = localdatetime($now)
    ON CREATE SET c.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    ...contribution,
    now,
  });
}

/**
 * Create a SUPERSEDES relationship between two nodes
 */
async createSupersedesRelationship(
  newNodeId: string,
  oldNodeId: string,
  nodeLabel: string,
  metadata?: { effective_from?: Date; reason?: string } & Partial<RelationshipProvenance>
): Promise<void> {
  const query = `
    MATCH (new:${nodeLabel} {id: $newNodeId})
    MATCH (old:${nodeLabel} {id: $oldNodeId})
    MERGE (new)-[r:SUPERSEDES]->(old)
    SET r.effective_from = $effective_from,
        r.reason = $reason,
        r.source_type = $source_type,
        r.confidence = $confidence,
        r.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    newNodeId,
    oldNodeId,
    effective_from: metadata?.effective_from?.toISOString() ?? null,
    reason: metadata?.reason ?? null,
    source_type: metadata?.source_type ?? null,
    confidence: metadata?.confidence ?? null,
    now: new Date().toISOString(),
  });
}

/**
 * Link a ProfileTag to an Obligation via SUBJECT_TO
 */
async linkProfileToObligation(
  profileTagId: string,
  obligationId: string,
  provenance?: Partial<RelationshipProvenance>
): Promise<void> {
  const query = `
    MATCH (p:ProfileTag {id: $profileTagId})
    MATCH (o:Obligation {id: $obligationId})
    MERGE (p)-[r:SUBJECT_TO]->(o)
    SET r.source_type = $source_type,
        r.confidence = $confidence,
        r.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    profileTagId,
    obligationId,
    source_type: provenance?.source_type ?? null,
    confidence: provenance?.confidence ?? 0.8,
    now: new Date().toISOString(),
  });
}

/**
 * Link a Condition to a Threshold via HAS_THRESHOLD
 */
async linkConditionToThreshold(
  conditionId: string,
  thresholdId: string,
  provenance?: Partial<RelationshipProvenance>
): Promise<void> {
  const query = `
    MATCH (c:Condition {id: $conditionId})
    MATCH (t:Threshold {id: $thresholdId})
    MERGE (c)-[r:HAS_THRESHOLD]->(t)
    SET r.source_type = $source_type,
        r.confidence = $confidence,
        r.created_at = localdatetime($now)
  `;

  await this.executeWithGuard(query, {
    conditionId,
    thresholdId,
    source_type: provenance?.source_type ?? null,
    confidence: provenance?.confidence ?? 0.8,
    now: new Date().toISOString(),
  });
}
```

---

### Task 4: Add GraphClient Query Methods

**File**: `packages/reg-intel-core/src/graph/graphClient.ts`

**Action**: Add query methods for the new node types.

```typescript
/**
 * Get obligations for a profile in a jurisdiction
 */
async getObligationsForProfile(
  profileId: string,
  jurisdictionId: string
): Promise<{
  obligations: Obligation[];
  forms: Form[];
  deadlines: Timeline[];
}> {
  const query = `
    MATCH (p:ProfileTag {id: $profileId})
    MATCH (p)-[:SUBJECT_TO]->(o:Obligation)
    WHERE o.jurisdictionCode = $jurisdictionId
    OPTIONAL MATCH (o)-[:SATISFIED_BY]->(f:Form)
    OPTIONAL MATCH (o)-[:FILING_DEADLINE]->(t:Timeline)
    RETURN o, collect(DISTINCT f) AS forms, collect(DISTINCT t) AS deadlines
  `;

  const result = await this.executeCypher(query, { profileId, jurisdictionId });
  // Transform result to typed objects
  return this.transformObligationResult(result);
}

/**
 * Compare thresholds across jurisdictions
 */
async compareThresholds(
  thresholdType: string,
  jurisdictions: string[]
): Promise<Threshold[]> {
  const query = `
    MATCH (t:Threshold)
    WHERE t.label CONTAINS $thresholdType
    AND t.jurisdictionCode IN $jurisdictions
    AND t.effective_to IS NULL
    RETURN t
    ORDER BY t.value DESC
  `;

  const result = await this.executeCypher(query, { thresholdType, jurisdictions });
  return this.transformThresholdResult(result);
}

/**
 * Get rate history with SUPERSEDES chain
 */
async getRateHistory(rateId: string): Promise<Rate[]> {
  const query = `
    MATCH (current:Rate {id: $rateId})
    OPTIONAL MATCH path = (current)-[:SUPERSEDES*]->(historical:Rate)
    WITH current, [n IN nodes(path) | n] AS history
    RETURN current, history
  `;

  const result = await this.executeCypher(query, { rateId });
  return this.transformRateHistoryResult(result);
}

/**
 * Get what claiming a benefit unlocks
 */
async getUnlockedByBenefit(benefitId: string): Promise<{
  unlockedBenefits: GraphNode[];
  triggeredObligations: Obligation[];
}> {
  const query = `
    MATCH (b:Benefit {id: $benefitId})
    OPTIONAL MATCH (b)-[r:UNLOCKS|TRIGGERS]->(unlocked:Benefit)
    OPTIONAL MATCH (b)-[:TRIGGERS_OBLIGATION]->(o:Obligation)
    RETURN b,
           collect(DISTINCT {node: unlocked, relationship: type(r), condition: r.condition}) AS unlocked,
           collect(DISTINCT o) AS obligations
  `;

  const result = await this.executeCypher(query, { benefitId });
  return this.transformUnlockedResult(result);
}

/**
 * Get benefits that stack with a given benefit
 */
async getStackableBenefits(benefitId: string): Promise<GraphNode[]> {
  const query = `
    MATCH (b:Benefit {id: $benefitId})
    MATCH (b)-[:STACKS_WITH]-(stackable:Benefit)
    RETURN stackable
  `;

  const result = await this.executeCypher(query, { benefitId });
  return this.transformNodeResult(result);
}
```

---

## 4. Seed Data Examples

### Irish Authorities Seed

**File**: `scripts/seed/seed_v0_7_authorities.ts`

```typescript
import { GraphWriteService } from '@reg-copilot/reg-intel-graph';

const IE_AUTHORITIES: Authority[] = [
  {
    id: 'IE_REVENUE',
    name: 'Office of the Revenue Commissioners',
    short_name: 'Revenue',
    jurisdictionCode: 'IE',
    domains: ['TAX', 'CUSTOMS', 'VAT', 'CORPORATION_TAX', 'INCOME_TAX', 'CGT'],
    website: 'https://www.revenue.ie',
    contact_url: 'https://www.revenue.ie/en/contact-us/index.aspx',
  },
  {
    id: 'IE_DSP',
    name: 'Department of Social Protection',
    short_name: 'DSP',
    jurisdictionCode: 'IE',
    domains: ['SOCIAL_WELFARE', 'PRSI', 'PENSIONS'],
    website: 'https://www.gov.ie/en/organisation/department-of-social-protection/',
  },
  {
    id: 'IE_CRO',
    name: 'Companies Registration Office',
    short_name: 'CRO',
    jurisdictionCode: 'IE',
    domains: ['COMPANY_LAW', 'REGISTRATION'],
    website: 'https://www.cro.ie',
  },
  {
    id: 'IE_PENSIONS_AUTHORITY',
    name: 'The Pensions Authority',
    short_name: 'Pensions Authority',
    jurisdictionCode: 'IE',
    domains: ['PENSIONS', 'OCCUPATIONAL_PENSIONS'],
    website: 'https://www.pensionsauthority.ie',
  },
];

export async function seedAuthorities(writeService: GraphWriteService): Promise<void> {
  for (const authority of IE_AUTHORITIES) {
    await writeService.upsertAuthority(authority);
    console.log(`Seeded authority: ${authority.id}`);
  }
}
```

### Irish Thresholds Seed

**File**: `scripts/seed/seed_v0_7_thresholds.ts`

```typescript
const IE_THRESHOLDS: Threshold[] = [
  {
    id: 'IE_VAT_THRESHOLD_SERVICES_2024',
    label: 'VAT Registration Threshold (Services)',
    value: 37500,
    currency: 'EUR',
    period: 'ANNUAL',
    direction: 'AT_OR_ABOVE',
    effective_from: new Date('2024-01-01'),
    jurisdictionCode: 'IE',
    source_url: 'https://www.revenue.ie/en/vat/vat-registration/index.aspx',
  },
  {
    id: 'IE_VAT_THRESHOLD_GOODS_2024',
    label: 'VAT Registration Threshold (Goods)',
    value: 80000,
    currency: 'EUR',
    period: 'ANNUAL',
    direction: 'AT_OR_ABOVE',
    effective_from: new Date('2024-01-01'),
    jurisdictionCode: 'IE',
    source_url: 'https://www.revenue.ie/en/vat/vat-registration/index.aspx',
  },
  {
    id: 'IE_CGT_ANNUAL_EXEMPTION_2024',
    label: 'CGT Annual Exemption',
    value: 1270,
    currency: 'EUR',
    period: 'TAX_YEAR',
    direction: 'BELOW',
    effective_from: new Date('2024-01-01'),
    jurisdictionCode: 'IE',
  },
  {
    id: 'IE_PRSI_MIN_CONTRIBUTIONS_JOBSEEKERS',
    label: 'Minimum PRSI Contributions for Jobseeker\'s Benefit',
    value: 104,
    unit: 'COUNT',
    period: 'LIFETIME',
    direction: 'AT_OR_ABOVE',
    jurisdictionCode: 'IE',
  },
];
```

---

## 5. Testing Requirements

### Unit Tests for New Node Types

**File**: `packages/reg-intel-graph/src/__tests__/v0_7_nodes.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphWriteService } from '../graphWriteService';
import { MockGraphClient } from '../__mocks__/mockGraphClient';

describe('v0.7 Node Types', () => {
  let writeService: GraphWriteService;
  let mockClient: MockGraphClient;

  beforeEach(() => {
    mockClient = new MockGraphClient();
    writeService = new GraphWriteService(mockClient);
  });

  describe('Obligation', () => {
    it('should upsert an obligation with all required fields', async () => {
      const obligation = {
        id: 'IE_TEST_OBLIGATION',
        label: 'Test Obligation',
        category: 'FILING' as const,
        jurisdictionCode: 'IE',
      };

      await writeService.upsertObligation(obligation);

      expect(mockClient.lastQuery).toContain('MERGE (o:Obligation {id: $id})');
      expect(mockClient.lastParams.id).toBe('IE_TEST_OBLIGATION');
    });

    it('should reject obligations with invalid category', async () => {
      const obligation = {
        id: 'IE_TEST_OBLIGATION',
        label: 'Test Obligation',
        category: 'INVALID' as any,
        jurisdictionCode: 'IE',
      };

      await expect(writeService.upsertObligation(obligation)).rejects.toThrow();
    });
  });

  describe('Threshold', () => {
    it('should upsert a threshold with numeric value', async () => {
      const threshold = {
        id: 'IE_TEST_THRESHOLD',
        label: 'Test Threshold',
        value: 50000,
        currency: 'EUR' as const,
        direction: 'AT_OR_ABOVE' as const,
        jurisdictionCode: 'IE',
      };

      await writeService.upsertThreshold(threshold);

      expect(mockClient.lastParams.value).toBe(50000);
    });
  });

  describe('Rate', () => {
    it('should store percentage as decimal', async () => {
      const rate = {
        id: 'IE_TEST_RATE',
        label: 'Test Rate',
        percentage: 0.125, // 12.5%
        rate_type: 'STANDARD' as const,
        jurisdictionCode: 'IE',
      };

      await writeService.upsertRate(rate);

      expect(mockClient.lastParams.percentage).toBe(0.125);
    });
  });

  describe('SUPERSEDES relationship', () => {
    it('should create supersedes chain between rates', async () => {
      await writeService.createSupersedesRelationship(
        'IE_RATE_2024',
        'IE_RATE_2023',
        'Rate',
        { effective_from: new Date('2024-01-01'), reason: 'Budget 2024' }
      );

      expect(mockClient.lastQuery).toContain('MERGE (new)-[r:SUPERSEDES]->(old)');
    });
  });
});
```

---

## 6. Common Patterns

### Pattern: Creating a Complete Obligation with Relationships

```typescript
// 1. Create the obligation
await writeService.upsertObligation({
  id: 'IE_FORM_11_FILING',
  label: 'Form 11 Annual Self-Assessment',
  category: 'FILING',
  frequency: 'ANNUAL',
  penalty_type: 'SURCHARGE',
  penalty_rate: 0.05,
  jurisdictionCode: 'IE',
  administering_authority: 'IE_REVENUE',
});

// 2. Create the form
await writeService.upsertForm({
  id: 'IE_FORM_11',
  name: 'Form 11 (Self-Assessment Income Tax Return)',
  form_code: 'Form 11',
  form_type: 'TAX_RETURN',
  electronic_available: true,
  jurisdictionCode: 'IE',
  administering_authority_id: 'IE_REVENUE',
});

// 3. Link obligation to form
await writeService.createRelationship(
  'IE_FORM_11_FILING',
  'IE_FORM_11',
  'SATISFIED_BY',
  { source_type: 'LEGISLATION', confidence: 0.95 }
);

// 4. Link to profile
await writeService.linkProfileToObligation(
  'PROFILE_SELF_EMPLOYED_IE',
  'IE_FORM_11_FILING',
  { source_type: 'LEGISLATION', confidence: 0.95 }
);

// 5. Add deadline
await writeService.createRelationship(
  'IE_FORM_11_FILING',
  'IE_FORM_11_DEADLINE',
  'FILING_DEADLINE',
  { source_type: 'LEGISLATION', confidence: 1.0 }
);
```

### Pattern: Tracking Rate Changes Over Time

```typescript
// 1. Create new rate
await writeService.upsertRate({
  id: 'IE_CORPORATION_TAX_2024',
  label: 'Corporation Tax Rate 2024',
  percentage: 0.15,
  rate_type: 'STANDARD',
  effective_from: new Date('2024-01-01'),
  jurisdictionCode: 'IE',
});

// 2. Create supersedes relationship to old rate
await writeService.createSupersedesRelationship(
  'IE_CORPORATION_TAX_2024',
  'IE_CORPORATION_TAX_2023',
  'Rate',
  {
    effective_from: new Date('2024-01-01'),
    reason: 'OECD Pillar 2 implementation',
    source_type: 'LEGISLATION',
    confidence: 1.0,
  }
);
```

---

## 7. Checklist for Implementation

### Phase 1: Core Infrastructure
- [ ] Add TypeScript interfaces to `types.ts`
- [ ] Update Graph Ingress Guard whitelists
- [ ] Add basic upsert methods to GraphWriteService
- [ ] Write unit tests for new node types

### Phase 2: High Priority Nodes
- [ ] Implement `:Obligation` with full relationship support
- [ ] Implement `:Threshold` with comparison queries
- [ ] Implement `:Rate` with history tracking
- [ ] Implement `SUPERSEDES` relationship

### Phase 3: Medium Priority Nodes
- [ ] Implement `:Authority`
- [ ] Implement `:Form`
- [ ] Implement `:Contribution`
- [ ] Add GraphClient query methods

### Phase 4: Relationships & Queries
- [ ] Implement `TRIGGERS`, `UNLOCKS`, `STACKS_WITH`
- [ ] Implement `COUNTS_TOWARDS`, `SATISFIES`
- [ ] Implement `REDUCES`, `OFFSETS`
- [ ] Add provenance to all relationship creation methods

### Phase 5: Seed Data & Integration
- [ ] Create seed scripts for Irish authorities
- [ ] Create seed scripts for common thresholds
- [ ] Create seed scripts for standard rates
- [ ] Integration tests with full graph queries

---

**End of Implementation Guide**
