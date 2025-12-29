# Future Enhancements Implementation Plan

> **Status:** Implementation Plan
> **Date:** 2025-12-29
> **Scope:** Tiers 1-4 from REGULATORY_GRAPH_FUTURE_ENHANCEMENTS.md
> **Estimated Effort:** 4 implementation cycles

---

## Overview

This document provides actionable implementation steps for all future enhancement tiers:

| Tier | Focus | New Node Types | New Relationships |
|------|-------|----------------|-------------------|
| Tier 1 | Penalty & Compliance Risk | `:Penalty` | 3 |
| Tier 2 | Entity & Tax Credit Differentiation | `:LegalEntity`, `:TaxCredit` | 5 |
| Tier 3 | Enhanced Queries & Temporal | `:RegulatoryBody`, `:AssetClass`, `:MeansTest`, `:TaxYear` | 8 |
| Tier 4 | UK/EU Extension | `:NIClass`, `:BenefitCap`, `:CoordinationRule` | 6 |

---

## Tier 1: Penalty & Compliance Risk

**Goal:** Complete the obligation→consequence chain to enable risk assessment

**Impact:** Users can understand "What happens if I miss this deadline?"

---

### Task 1.1: Add `:Penalty` to Ingress Guard

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels` (after line 81):**
```typescript
'Penalty',
```

**Add to `allowedRelTypes` (after line 143):**
```typescript
'HAS_PENALTY',
'WAIVED_IF',
'SCALES_WITH',
```

**Add to `nodePropertyWhitelist` (after line 373):**
```typescript
Penalty: [
  'id',
  'label',
  'penalty_type',
  'rate',
  'daily_rate',
  'flat_amount',
  'currency',
  'max_amount',
  'applies_after_days',
  'applies_after_months',
  'description',
  'created_at',
  'updated_at',
],
```

---

### Task 1.2: Add Penalty Interface

**File:** `packages/reg-intel-graph/src/types.ts`

**Add after LifeEvent interface (around line 94):**
```typescript
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
```

**Update GraphNode type union (add after 'LifeEvent'):**
```typescript
| 'Penalty'
```

---

### Task 1.3: Add GraphClient Methods

**File:** `packages/reg-intel-graph/src/types.ts`

**Add to GraphClient interface:**
```typescript
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
```

---

### Task 1.4: Implement GraphClient Methods

**File:** `packages/reg-intel-graph/src/boltGraphClient.ts`

**Add implementations:**
```typescript
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
```

---

### Task 1.5: Create Penalty Seed Data

**File:** `packages/reg-intel-graph/src/seeds/penalties.cypher` (new file)

```cypher
// ============================================================================
// PENALTIES FOR CT1 FILING
// ============================================================================

// Late CT1 Filing Surcharge - First tier (5%)
MERGE (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5'})
SET p.label = 'Late CT1 Filing Surcharge (5%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 5,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = '5% surcharge on tax due if CT1 filed within 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// Late CT1 Filing Surcharge - Second tier (10%)
MERGE (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_10'})
SET p.label = 'Late CT1 Filing Surcharge (10%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 10,
    p.currency = 'EUR',
    p.applies_after_months = 2,
    p.description = '10% surcharge on tax due if CT1 filed more than 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// PENALTIES FOR FORM 11 FILING
// ============================================================================

// Late Form 11 Filing Surcharge - First tier (5%)
MERGE (p:Penalty {id: 'IE_LATE_FORM11_SURCHARGE_5'})
SET p.label = 'Late Form 11 Filing Surcharge (5%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 5,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = '5% surcharge on tax due if Form 11 filed within 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// Late Form 11 Filing Surcharge - Second tier (10%)
MERGE (p:Penalty {id: 'IE_LATE_FORM11_SURCHARGE_10'})
SET p.label = 'Late Form 11 Filing Surcharge (10%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 10,
    p.currency = 'EUR',
    p.applies_after_months = 2,
    p.description = '10% surcharge on tax due if Form 11 filed more than 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// LATE PAYMENT INTEREST
// ============================================================================

MERGE (p:Penalty {id: 'IE_LATE_PAYMENT_INTEREST'})
SET p.label = 'Late Payment Interest',
    p.penalty_type = 'INTEREST',
    p.daily_rate = 0.0219,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = 'Interest charged at 0.0219% per day (approx 8% per annum) on overdue tax',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_PRELIMINARY_TAX'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// CRO LATE FILING PENALTIES
// ============================================================================

MERGE (p:Penalty {id: 'IE_CRO_LATE_ANNUAL_RETURN'})
SET p.label = 'CRO Late Annual Return Penalty',
    p.penalty_type = 'FIXED',
    p.flat_amount = 100,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = 'Late filing fee plus potential loss of audit exemption for 2 years',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:HAS_PENALTY]->(p);

// Loss of Audit Exemption (consequential penalty)
MERGE (p:Penalty {id: 'IE_CRO_LOSS_AUDIT_EXEMPTION'})
SET p.label = 'Loss of Audit Exemption',
    p.penalty_type = 'RESTRICTION',
    p.applies_after_days = 1,
    p.description = 'Company loses audit exemption for current and following financial year',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// WAIVER CONDITIONS
// ============================================================================

// Create waiver condition for first-time offenders
MERGE (c:Condition {id: 'IE_FIRST_TIME_LATE_FILER'})
SET c.label = 'First-time late filer',
    c.description = 'Surcharge may be reduced or waived for taxpayers with good compliance history',
    c.category = 'COMPLIANCE_HISTORY',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5'})
MERGE (p)-[:WAIVED_IF]->(c);

// Reasonable excuse condition
MERGE (c:Condition {id: 'IE_REASONABLE_EXCUSE'})
SET c.label = 'Reasonable excuse',
    c.description = 'Penalty may be waived if taxpayer can demonstrate reasonable excuse for late filing',
    c.category = 'EXCUSE',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (p:Penalty) WHERE p.penalty_type = 'SURCHARGE'
MERGE (p)-[:WAIVED_IF]->(c);
```

---

### Task 1.6: Add Penalty Tests

**File:** `packages/reg-intel-graph/src/__tests__/penalties.test.ts` (new file)

```typescript
/**
 * Tests for Penalty seed data and GraphClient methods
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBoltGraphClient } from '../boltGraphClient.js';
import type { BoltGraphClient } from '../boltGraphClient.js';

const TEST_CONFIG = {
  uri: process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  username: process.env.MEMGRAPH_USERNAME || '',
  password: process.env.MEMGRAPH_PASSWORD || '',
  database: process.env.MEMGRAPH_DATABASE || 'memgraph',
};

describe('Seed Data - Penalties', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have CT1 late filing surcharges', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty) WHERE p.id CONTAINS 'CT1_SURCHARGE' RETURN count(p) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2);
  });

  it('should have Form 11 late filing surcharges', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty) WHERE p.id CONTAINS 'FORM11_SURCHARGE' RETURN count(p) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2);
  });

  it('should have late payment interest penalty', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty {id: 'IE_LATE_PAYMENT_INTEREST'}) RETURN p`,
      {}
    );
    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].p.properties.penalty_type).toBe('INTEREST');
    expect(records[0].p.properties.daily_rate).toBe(0.0219);
  });

  it('should have CRO late filing penalty', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty {id: 'IE_CRO_LATE_ANNUAL_RETURN'}) RETURN p`,
      {}
    );
    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].p.properties.penalty_type).toBe('FIXED');
  });

  it('should have penalties linked to obligations', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation)-[:HAS_PENALTY]->(p:Penalty) RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(4);
  });

  it('should have waiver conditions linked to penalties', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty)-[:WAIVED_IF]->(c:Condition) RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('GraphClient - Penalties', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get penalties for CT1 obligation', async () => {
    const penalties = await client.getPenaltiesForObligation('IE_CT1_FILING');
    expect(penalties.length).toBeGreaterThanOrEqual(2);
    expect(penalties.some(p => p.rate === 5)).toBe(true);
    expect(penalties.some(p => p.rate === 10)).toBe(true);
  });

  it('should get penalties for profile', async () => {
    const results = await client.getPenaltiesForProfile(
      'PROFILE_SINGLE_DIRECTOR_IE',
      'IE'
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.penalties.length > 0)).toBe(true);
  });

  it('should get waiver conditions for penalty', async () => {
    const conditions = await client.getPenaltyWaiverConditions('IE_LATE_CT1_SURCHARGE_5');
    expect(conditions.length).toBeGreaterThan(0);
  });
});
```

---

### Task 1.7: Update Schema Documentation

**File:** `docs/architecture/graph/schema_v_0_6.md`

**Add new section after 2.25 (`:LifeEvent`):**
```markdown
### 2.26 `:Penalty`

Represents consequences of non-compliance with obligations.

**Properties**
- `id: string` – e.g. `"IE_LATE_CT1_SURCHARGE_5"`.
- `label: string` – e.g. `"Late CT1 Filing Surcharge (5%)"`.
- `penalty_type: string` – `"SURCHARGE" | "INTEREST" | "FIXED" | "PROSECUTION" | "RESTRICTION"`.
- `rate?: number` – Percentage for surcharges (e.g., 5, 10).
- `daily_rate?: number` – Daily rate for interest (e.g., 0.0219).
- `flat_amount?: number` – Fixed amount in currency.
- `currency?: string` – `"EUR" | "GBP"`.
- `max_amount?: number` – Maximum penalty cap.
- `applies_after_days?: number` – Days after deadline when penalty applies.
- `applies_after_months?: number` – Months after deadline.
- `description?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Examples**
- 5% surcharge for late CT1 filing
- 0.0219% daily interest on late payment
- Fixed €100 CRO late filing fee
```

**Add to Section 3.11:**
```markdown
**Penalties:**
- `(:Obligation)-[:HAS_PENALTY]->(:Penalty)` – Penalty for non-compliance.
- `(:Penalty)-[:WAIVED_IF]->(:Condition)` – Conditions under which penalty may be waived.
- `(:Penalty)-[:SCALES_WITH]->(:Threshold)` – Progressive penalty thresholds.
- `(:Penalty)-[:IN_JURISDICTION]->(:Jurisdiction)` – Jurisdiction where penalty applies.
```

---

## Tier 2: Entity & Tax Credit Differentiation

**Goal:** Enable entity-specific rules and accurate tax credit modelling

**Impact:** "What applies to LTD vs DAC?" and proper tax calculation

---

### Task 2.1: Add `:LegalEntity` to Ingress Guard

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'LegalEntity',
```

**Add to `allowedRelTypes`:**
```typescript
'AVAILABLE_TO',
'APPLIES_TO_ENTITY',
'REGISTERED_AS',
```

**Add to `nodePropertyWhitelist`:**
```typescript
LegalEntity: [
  'id',
  'label',
  'abbreviation',
  'jurisdiction',
  'category',
  'sub_category',
  'has_separate_legal_personality',
  'limited_liability',
  'can_trade',
  'can_hold_property',
  'tax_transparent',
  'description',
  'created_at',
  'updated_at',
],
```

---

### Task 2.2: Add LegalEntity Interface

**File:** `packages/reg-intel-graph/src/types.ts`

```typescript
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
```

**Update GraphNode type union:**
```typescript
| 'LegalEntity'
```

---

### Task 2.3: Add `:TaxCredit` to Ingress Guard

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'TaxCredit',
```

**Add to `allowedRelTypes`:**
```typescript
'ENTITLED_TO',
'CAPPED_BY',
'TRANSFERS_TO',
```

**Add to `nodePropertyWhitelist`:**
```typescript
TaxCredit: [
  'id',
  'label',
  'amount',
  'currency',
  'tax_year',
  'refundable',
  'transferable',
  'restricted_to_marginal',
  'category',
  'description',
  'created_at',
  'updated_at',
],
```

---

### Task 2.4: Add TaxCredit Interface

**File:** `packages/reg-intel-graph/src/types.ts`

```typescript
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
```

**Update GraphNode type union:**
```typescript
| 'TaxCredit'
```

---

### Task 2.5: Add Stacking Relationships

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedRelTypes`:**
```typescript
'STACKS_WITH',
'REDUCES',
'OFFSETS_AGAINST',
```

---

### Task 2.6: Add GraphClient Methods

**File:** `packages/reg-intel-graph/src/types.ts`

```typescript
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
```

---

### Task 2.7: Create LegalEntity Seed Data

**File:** `packages/reg-intel-graph/src/seeds/legal_entities.cypher` (new file)

```cypher
// ============================================================================
// IRISH LEGAL ENTITIES
// ============================================================================

// Private Company Limited by Shares (LTD)
MERGE (e:LegalEntity {id: 'IE_ENTITY_LTD'})
SET e.label = 'Private Company Limited by Shares',
    e.abbreviation = 'LTD',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'PRIVATE',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Most common company type in Ireland',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Designated Activity Company (DAC)
MERGE (e:LegalEntity {id: 'IE_ENTITY_DAC'})
SET e.label = 'Designated Activity Company',
    e.abbreviation = 'DAC',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'DESIGNATED_ACTIVITY',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Company with objects clause limiting activities',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Public Limited Company (PLC)
MERGE (e:LegalEntity {id: 'IE_ENTITY_PLC'})
SET e.label = 'Public Limited Company',
    e.abbreviation = 'PLC',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'PUBLIC',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Company that can offer shares to public',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// General Partnership
MERGE (e:LegalEntity {id: 'IE_ENTITY_PARTNERSHIP'})
SET e.label = 'General Partnership',
    e.jurisdiction = 'IE',
    e.category = 'PARTNERSHIP',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = true,
    e.description = 'Partnership where all partners have unlimited liability',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Limited Partnership (LP)
MERGE (e:LegalEntity {id: 'IE_ENTITY_LP'})
SET e.label = 'Limited Partnership',
    e.abbreviation = 'LP',
    e.jurisdiction = 'IE',
    e.category = 'PARTNERSHIP',
    e.sub_category = 'LIMITED',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = true,
    e.description = 'Partnership with at least one general partner with unlimited liability',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Sole Trader
MERGE (e:LegalEntity {id: 'IE_ENTITY_SOLE_TRADER'})
SET e.label = 'Sole Trader',
    e.jurisdiction = 'IE',
    e.category = 'SOLE_TRADER',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = true,
    e.description = 'Individual trading in their own name',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Company Limited by Guarantee (CLG) - typically charities
MERGE (e:LegalEntity {id: 'IE_ENTITY_CLG'})
SET e.label = 'Company Limited by Guarantee',
    e.abbreviation = 'CLG',
    e.jurisdiction = 'IE',
    e.category = 'CHARITY',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = false,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Non-profit company, typically used for charities',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Discretionary Trust
MERGE (e:LegalEntity {id: 'IE_ENTITY_DISCRETIONARY_TRUST'})
SET e.label = 'Discretionary Trust',
    e.jurisdiction = 'IE',
    e.category = 'TRUST',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = false,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Trust where trustees have discretion over distributions',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// ============================================================================
// ENTITY-SPECIFIC OBLIGATIONS
// ============================================================================

// Link LTD to CT1 filing
MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'})
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link DAC to CT1 filing
MATCH (e:LegalEntity {id: 'IE_ENTITY_DAC'})
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link LTD to CRO annual return
MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'})
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link DAC to CRO annual return
MATCH (e:LegalEntity {id: 'IE_ENTITY_DAC'})
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link Sole Trader to Form 11
MATCH (e:LegalEntity {id: 'IE_ENTITY_SOLE_TRADER'})
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link Partnership to Form 11 (partners file individually)
MATCH (e:LegalEntity {id: 'IE_ENTITY_PARTNERSHIP'})
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);
```

---

### Task 2.8: Create TaxCredit Seed Data

**File:** `packages/reg-intel-graph/src/seeds/tax_credits.cypher` (new file)

```cypher
// ============================================================================
// IRISH TAX CREDITS 2024
// ============================================================================

// Personal Tax Credit (Single)
MERGE (c:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_SINGLE_2024'})
SET c.label = 'Personal Tax Credit (Single)',
    c.amount = 1875,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'PERSONAL',
    c.description = 'Basic tax credit for single individuals',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Personal Tax Credit (Married)
MERGE (c:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_MARRIED_2024'})
SET c.label = 'Personal Tax Credit (Married)',
    c.amount = 3750,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = true,
    c.category = 'PERSONAL',
    c.description = 'Basic tax credit for married couples/civil partners',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Employee Tax Credit (PAYE Credit)
MERGE (c:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
SET c.label = 'Employee Tax Credit',
    c.amount = 1875,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'EMPLOYMENT',
    c.description = 'Tax credit for PAYE employees',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j)

WITH c
MATCH (p:ProfileTag {id: 'PROFILE_PAYE_EMPLOYEE_IE'})
MERGE (p)-[:ENTITLED_TO]->(c);

// Earned Income Tax Credit (Self-employed)
MERGE (c:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
SET c.label = 'Earned Income Tax Credit',
    c.amount = 1875,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'EMPLOYMENT',
    c.description = 'Tax credit for self-employed and proprietary directors',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j)

WITH c
MATCH (p:ProfileTag) WHERE p.id IN ['PROFILE_SELF_EMPLOYED_IE', 'PROFILE_SINGLE_DIRECTOR_IE']
MERGE (p)-[:ENTITLED_TO]->(c);

// Home Carer Tax Credit
MERGE (c:TaxCredit {id: 'IE_HOME_CARER_TAX_CREDIT_2024'})
SET c.label = 'Home Carer Tax Credit',
    c.amount = 1800,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'FAMILY',
    c.description = 'Credit for spouse/civil partner caring for dependents at home',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Single Person Child Carer Credit
MERGE (c:TaxCredit {id: 'IE_SINGLE_PERSON_CHILD_CARER_2024'})
SET c.label = 'Single Person Child Carer Credit',
    c.amount = 1750,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'FAMILY',
    c.description = 'Credit for single parents with qualifying children',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Age Tax Credit (65+)
MERGE (c:TaxCredit {id: 'IE_AGE_TAX_CREDIT_SINGLE_2024'})
SET c.label = 'Age Tax Credit (Single)',
    c.amount = 245,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'PERSONAL',
    c.description = 'Additional credit for individuals aged 65 or over',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Incapacitated Child Tax Credit
MERGE (c:TaxCredit {id: 'IE_INCAPACITATED_CHILD_CREDIT_2024'})
SET c.label = 'Incapacitated Child Tax Credit',
    c.amount = 3500,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'FAMILY',
    c.description = 'Credit for parents of permanently incapacitated children',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// ============================================================================
// STACKING RELATIONSHIPS
// ============================================================================

// Personal credit stacks with Employee/Earned Income credit
MATCH (c1:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_SINGLE_2024'})
MATCH (c2:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
MERGE (c1)-[:STACKS_WITH]->(c2);

MATCH (c1:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_SINGLE_2024'})
MATCH (c2:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
MERGE (c1)-[:STACKS_WITH]->(c2);

// But Employee and Earned Income don't stack (mutually exclusive)
MATCH (c1:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
MATCH (c2:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
MERGE (c1)-[:MUTUALLY_EXCLUSIVE_WITH]->(c2);
```

---

### Task 2.9: Add Tier 2 Tests

**File:** `packages/reg-intel-graph/src/__tests__/tier2.test.ts` (new file)

```typescript
/**
 * Tests for Tier 2: LegalEntity and TaxCredit
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBoltGraphClient } from '../boltGraphClient.js';
import type { BoltGraphClient } from '../boltGraphClient.js';

const TEST_CONFIG = {
  uri: process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  username: process.env.MEMGRAPH_USERNAME || '',
  password: process.env.MEMGRAPH_PASSWORD || '',
  database: process.env.MEMGRAPH_DATABASE || 'memgraph',
};

describe('Seed Data - Legal Entities', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have Irish LTD entity', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'}) RETURN e`,
      {}
    );
    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].e.properties.abbreviation).toBe('LTD');
    expect(records[0].e.properties.limited_liability).toBe(true);
  });

  it('should have all main Irish entity types', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LegalEntity)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       RETURN count(e) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(7);
  });

  it('should have tax-transparent entities marked correctly', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LegalEntity) WHERE e.tax_transparent = true
       RETURN e.id as id`,
      {}
    );
    const records = result as Array<{ id: string }>;
    const ids = records.map(r => r.id);
    expect(ids).toContain('IE_ENTITY_PARTNERSHIP');
    expect(ids).toContain('IE_ENTITY_SOLE_TRADER');
  });

  it('should have obligations linked to entity types', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation)-[:APPLIES_TO_ENTITY]->(e:LegalEntity)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Tax Credits', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have personal tax credit', async () => {
    const result = await client.executeCypher(
      `MATCH (c:TaxCredit) WHERE c.id CONTAINS 'PERSONAL' RETURN count(c) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2);
  });

  it('should have employee tax credit', async () => {
    const result = await client.executeCypher(
      `MATCH (c:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'}) RETURN c`,
      {}
    );
    const records = result as Array<{ c: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].c.properties.amount).toBe(1875);
  });

  it('should have earned income tax credit', async () => {
    const result = await client.executeCypher(
      `MATCH (c:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'}) RETURN c`,
      {}
    );
    const records = result as Array<{ c: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have stacking relationships between credits', async () => {
    const result = await client.executeCypher(
      `MATCH (c1:TaxCredit)-[:STACKS_WITH]->(c2:TaxCredit)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have mutual exclusion between Employee and Earned Income credits', async () => {
    const result = await client.executeCypher(
      `MATCH (c1:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
             -[:MUTUALLY_EXCLUSIVE_WITH]-
             (c2:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBe(1);
  });

  it('should have profiles entitled to tax credits', async () => {
    const result = await client.executeCypher(
      `MATCH (p:ProfileTag)-[:ENTITLED_TO]->(c:TaxCredit)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});
```

---

## Tier 3: Enhanced Queries & Temporal

**Goal:** Enable regulatory body queries, asset-specific rules, and point-in-time queries

---

### Task 3.1: Add `:RegulatoryBody`

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'RegulatoryBody',
```

**Add to `allowedRelTypes`:**
```typescript
'ADMINISTERED_BY',
'ISSUED_BY',
'REGULATED_BY',
```

**Add to `nodePropertyWhitelist`:**
```typescript
RegulatoryBody: [
  'id',
  'label',
  'abbreviation',
  'jurisdiction',
  'domain',
  'website',
  'contact_info',
  'description',
  'created_at',
  'updated_at',
],
```

---

### Task 3.2: Add `:AssetClass`

**Add to `allowedNodeLabels`:**
```typescript
'AssetClass',
```

**Add to `allowedRelTypes`:**
```typescript
'APPLIES_TO_ASSET',
'HAS_CGT_RATE',
'HAS_STAMP_DUTY_RATE',
'HAS_CAT_RATE',
```

**Add to `nodePropertyWhitelist`:**
```typescript
AssetClass: [
  'id',
  'label',
  'category',
  'sub_category',
  'tangible',
  'cgt_applicable',
  'cat_applicable',
  'stamp_duty_applicable',
  'description',
  'created_at',
  'updated_at',
],
```

---

### Task 3.3: Add `:MeansTest`

**Add to `allowedNodeLabels`:**
```typescript
'MeansTest',
```

**Add to `allowedRelTypes`:**
```typescript
'HAS_MEANS_TEST',
'DISREGARDS',
```

**Add to `nodePropertyWhitelist`:**
```typescript
MeansTest: [
  'id',
  'label',
  'income_disregard',
  'capital_threshold',
  'capital_weekly_assessment',
  'spouse_income_assessed',
  'maintenance_assessed',
  'categories',
  'description',
  'created_at',
  'updated_at',
],
```

---

### Task 3.4: Add `:TaxYear`

**Add to `allowedNodeLabels`:**
```typescript
'TaxYear',
```

**Add to `allowedRelTypes`:**
```typescript
'APPLIES_IN_YEAR',
'EFFECTIVE_IN_YEAR',
```

**Add to `nodePropertyWhitelist`:**
```typescript
TaxYear: [
  'id',
  'year',
  'start_date',
  'end_date',
  'jurisdiction',
  'created_at',
  'updated_at',
],
```

---

### Task 3.5: Create Tier 3 Seed Data

**File:** `packages/reg-intel-graph/src/seeds/regulatory_bodies.cypher`

```cypher
// Irish Regulatory Bodies

MERGE (r:RegulatoryBody {id: 'IE_REVENUE'})
SET r.label = 'Revenue Commissioners',
    r.abbreviation = 'Revenue',
    r.jurisdiction = 'IE',
    r.domain = 'TAX',
    r.website = 'https://www.revenue.ie',
    r.description = 'Irish tax authority responsible for tax collection and customs',
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

MERGE (r:RegulatoryBody {id: 'IE_DSP'})
SET r.label = 'Department of Social Protection',
    r.abbreviation = 'DSP',
    r.jurisdiction = 'IE',
    r.domain = 'SOCIAL_WELFARE',
    r.website = 'https://www.gov.ie/en/organisation/department-of-social-protection/',
    r.description = 'Government department responsible for social welfare payments',
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

MERGE (r:RegulatoryBody {id: 'IE_CRO'})
SET r.label = 'Companies Registration Office',
    r.abbreviation = 'CRO',
    r.jurisdiction = 'IE',
    r.domain = 'COMPANY',
    r.website = 'https://www.cro.ie',
    r.description = 'Registrar of companies in Ireland',
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

MERGE (r:RegulatoryBody {id: 'IE_PENSIONS_AUTHORITY'})
SET r.label = 'Pensions Authority',
    r.jurisdiction = 'IE',
    r.domain = 'PENSIONS',
    r.website = 'https://www.pensionsauthority.ie',
    r.description = 'Regulator of occupational pensions in Ireland',
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// Link obligations to regulatory bodies
MATCH (o:Obligation {id: 'IE_CT1_FILING'}), (r:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (o)-[:ADMINISTERED_BY]->(r);

MATCH (o:Obligation {id: 'IE_FORM_11_FILING'}), (r:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (o)-[:ADMINISTERED_BY]->(r);

MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'}), (r:RegulatoryBody {id: 'IE_CRO'})
MERGE (o)-[:ADMINISTERED_BY]->(r);

// Link forms to issuing bodies
MATCH (f:Form {id: 'IE_REVENUE_FORM_CT1'}), (r:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (f)-[:ISSUED_BY]->(r);

MATCH (f:Form {id: 'IE_REVENUE_FORM_11'}), (r:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (f)-[:ISSUED_BY]->(r);

MATCH (f:Form {id: 'IE_CRO_FORM_B1'}), (r:RegulatoryBody {id: 'IE_CRO'})
MERGE (f)-[:ISSUED_BY]->(r);

MATCH (f:Form {id: 'IE_DSP_FORM_UP1'}), (r:RegulatoryBody {id: 'IE_DSP'})
MERGE (f)-[:ISSUED_BY]->(r);

// Link benefits to administering bodies
MATCH (b:Benefit)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
MATCH (r:RegulatoryBody {id: 'IE_DSP'})
MERGE (b)-[:ADMINISTERED_BY]->(r);
```

**File:** `packages/reg-intel-graph/src/seeds/asset_classes.cypher`

```cypher
// Asset Classes for CGT and Stamp Duty

MERGE (a:AssetClass {id: 'IE_ASSET_RESIDENTIAL_PROPERTY'})
SET a.label = 'Residential Property',
    a.category = 'PROPERTY',
    a.sub_category = 'RESIDENTIAL',
    a.tangible = true,
    a.cgt_applicable = true,
    a.cat_applicable = true,
    a.stamp_duty_applicable = true,
    a.description = 'Residential real estate including houses, apartments',
    a.created_at = localdatetime(),
    a.updated_at = localdatetime()

WITH a
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (a)-[:IN_JURISDICTION]->(j);

MERGE (a:AssetClass {id: 'IE_ASSET_COMMERCIAL_PROPERTY'})
SET a.label = 'Commercial Property',
    a.category = 'PROPERTY',
    a.sub_category = 'COMMERCIAL',
    a.tangible = true,
    a.cgt_applicable = true,
    a.cat_applicable = true,
    a.stamp_duty_applicable = true,
    a.description = 'Commercial real estate including offices, retail',
    a.created_at = localdatetime(),
    a.updated_at = localdatetime()

WITH a
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (a)-[:IN_JURISDICTION]->(j);

MERGE (a:AssetClass {id: 'IE_ASSET_SHARES_QUOTED'})
SET a.label = 'Quoted Shares',
    a.category = 'SHARES',
    a.sub_category = 'QUOTED',
    a.tangible = false,
    a.cgt_applicable = true,
    a.cat_applicable = true,
    a.stamp_duty_applicable = true,
    a.description = 'Shares listed on a stock exchange',
    a.created_at = localdatetime(),
    a.updated_at = localdatetime()

WITH a
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (a)-[:IN_JURISDICTION]->(j);

MERGE (a:AssetClass {id: 'IE_ASSET_SHARES_UNQUOTED'})
SET a.label = 'Unquoted Shares',
    a.category = 'SHARES',
    a.sub_category = 'UNQUOTED',
    a.tangible = false,
    a.cgt_applicable = true,
    a.cat_applicable = true,
    a.stamp_duty_applicable = true,
    a.description = 'Private company shares not listed on exchange',
    a.created_at = localdatetime(),
    a.updated_at = localdatetime()

WITH a
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (a)-[:IN_JURISDICTION]->(j);

MERGE (a:AssetClass {id: 'IE_ASSET_CRYPTO'})
SET a.label = 'Cryptocurrency',
    a.category = 'CRYPTO',
    a.tangible = false,
    a.cgt_applicable = true,
    a.cat_applicable = true,
    a.stamp_duty_applicable = false,
    a.description = 'Digital assets including Bitcoin, Ethereum',
    a.created_at = localdatetime(),
    a.updated_at = localdatetime()

WITH a
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (a)-[:IN_JURISDICTION]->(j);

MERGE (a:AssetClass {id: 'IE_ASSET_AGRICULTURAL_LAND'})
SET a.label = 'Agricultural Land',
    a.category = 'AGRICULTURAL',
    a.tangible = true,
    a.cgt_applicable = true,
    a.cat_applicable = true,
    a.stamp_duty_applicable = true,
    a.description = 'Farmland used for agricultural purposes',
    a.created_at = localdatetime(),
    a.updated_at = localdatetime()

WITH a
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (a)-[:IN_JURISDICTION]->(j);

// Link CGT rate to asset classes
MATCH (a:AssetClass)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
WHERE a.cgt_applicable = true
MATCH (r:Rate {id: 'IE_CGT_RATE_2024'})
MERGE (a)-[:HAS_CGT_RATE]->(r);
```

**File:** `packages/reg-intel-graph/src/seeds/tax_years.cypher`

```cypher
// Tax Years

MERGE (ty:TaxYear {id: 'IE_TAX_YEAR_2023'})
SET ty.year = 2023,
    ty.start_date = date('2023-01-01'),
    ty.end_date = date('2023-12-31'),
    ty.jurisdiction = 'IE',
    ty.created_at = localdatetime(),
    ty.updated_at = localdatetime()

WITH ty
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ty)-[:IN_JURISDICTION]->(j);

MERGE (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
SET ty.year = 2024,
    ty.start_date = date('2024-01-01'),
    ty.end_date = date('2024-12-31'),
    ty.jurisdiction = 'IE',
    ty.created_at = localdatetime(),
    ty.updated_at = localdatetime()

WITH ty
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ty)-[:IN_JURISDICTION]->(j);

MERGE (ty:TaxYear {id: 'IE_TAX_YEAR_2025'})
SET ty.year = 2025,
    ty.start_date = date('2025-01-01'),
    ty.end_date = date('2025-12-31'),
    ty.jurisdiction = 'IE',
    ty.created_at = localdatetime(),
    ty.updated_at = localdatetime()

WITH ty
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ty)-[:IN_JURISDICTION]->(j);

// Link rates to tax years
MATCH (r:Rate) WHERE r.id CONTAINS '2024'
MATCH (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
MERGE (r)-[:APPLIES_IN_YEAR]->(ty);

// Link thresholds to tax years
MATCH (t:Threshold) WHERE t.id CONTAINS '2024'
MATCH (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
MERGE (t)-[:APPLIES_IN_YEAR]->(ty);

// Link tax credits to tax years
MATCH (c:TaxCredit) WHERE c.id CONTAINS '2024'
MATCH (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
MERGE (c)-[:APPLIES_IN_YEAR]->(ty);
```

---

## Tier 4: UK/EU Extension

**Goal:** Enable UK coverage and EU social security coordination

---

### Task 4.1: Add `:NIClass` (UK National Insurance)

**Add to `allowedNodeLabels`:**
```typescript
'NIClass',
```

**Add to `nodePropertyWhitelist`:**
```typescript
NIClass: [
  'id',
  'label',
  'description',
  'rate',
  'threshold_weekly',
  'threshold_annual',
  'eligible_benefits',
  'created_at',
  'updated_at',
],
```

---

### Task 4.2: Add `:BenefitCap`

**Add to `allowedNodeLabels`:**
```typescript
'BenefitCap',
```

**Add to `nodePropertyWhitelist`:**
```typescript
BenefitCap: [
  'id',
  'label',
  'amount_single',
  'amount_couple',
  'amount_with_children',
  'currency',
  'frequency',
  'exemptions',
  'effective_from',
  'effective_to',
  'created_at',
  'updated_at',
],
```

---

### Task 4.3: Add `:CoordinationRule`

**Add to `allowedNodeLabels`:**
```typescript
'CoordinationRule',
```

**Add to `allowedRelTypes`:**
```typescript
'COORDINATED_UNDER',
'AGGREGATES_WITH',
'POSTED_TO',
```

**Add to `nodePropertyWhitelist`:**
```typescript
CoordinationRule: [
  'id',
  'label',
  'regulation',
  'article',
  'applies_to',
  'home_jurisdiction',
  'host_jurisdiction',
  'duration_months',
  'description',
  'created_at',
  'updated_at',
],
```

---

### Task 4.4: Create UK Seed Data

**File:** `packages/reg-intel-graph/src/seeds/uk/ni_classes.cypher`

```cypher
// UK National Insurance Classes

MERGE (c:NIClass {id: 'UK_NI_CLASS_1'})
SET c.label = 'Class 1',
    c.description = 'Paid by employees and employers on earnings',
    c.rate = 12,
    c.threshold_weekly = 242,
    c.eligible_benefits = ['State Pension', 'Jobseeker\'s Allowance', 'Employment and Support Allowance', 'Maternity Allowance'],
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (c)-[:IN_JURISDICTION]->(j);

MERGE (c:NIClass {id: 'UK_NI_CLASS_2'})
SET c.label = 'Class 2',
    c.description = 'Paid by self-employed with profits above threshold',
    c.rate = 3.45,
    c.threshold_annual = 12570,
    c.eligible_benefits = ['State Pension', 'Maternity Allowance', 'Bereavement Support Payment'],
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (c)-[:IN_JURISDICTION]->(j);

MERGE (c:NIClass {id: 'UK_NI_CLASS_3'})
SET c.label = 'Class 3',
    c.description = 'Voluntary contributions to fill gaps in NI record',
    c.rate = 17.45,
    c.eligible_benefits = ['State Pension'],
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (c)-[:IN_JURISDICTION]->(j);

MERGE (c:NIClass {id: 'UK_NI_CLASS_4'})
SET c.label = 'Class 4',
    c.description = 'Paid by self-employed on profits (no benefit entitlement)',
    c.rate = 9,
    c.threshold_annual = 12570,
    c.eligible_benefits = [],
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (c)-[:IN_JURISDICTION]->(j);
```

---

### Task 4.5: Create EU Coordination Seed Data

**File:** `packages/reg-intel-graph/src/seeds/eu_coordination.cypher`

```cypher
// EU Social Security Coordination Rules (Regulation 883/2004)

// Posting rule - A1 certificate
MERGE (cr:CoordinationRule {id: 'EU_POSTING_RULE_A1'})
SET cr.label = 'Posted Worker - A1 Certificate',
    cr.regulation = 'EU 883/2004',
    cr.article = 'Article 12',
    cr.applies_to = 'EMPLOYMENT',
    cr.duration_months = 24,
    cr.description = 'Worker posted to another EU state remains subject to home state social security for up to 24 months',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime()

WITH cr
MATCH (r:EURegulation {id: 'EU_REG_883_2004'})
MERGE (cr)-[:DERIVED_FROM]->(r);

// Multi-state worker rule
MERGE (cr:CoordinationRule {id: 'EU_MULTI_STATE_WORKER'})
SET cr.label = 'Multi-State Worker',
    cr.regulation = 'EU 883/2004',
    cr.article = 'Article 13',
    cr.applies_to = 'EMPLOYMENT',
    cr.description = 'Worker active in multiple EU states - legislation of state of residence applies if substantial activity there',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime()

WITH cr
MATCH (r:EURegulation {id: 'EU_REG_883_2004'})
MERGE (cr)-[:DERIVED_FROM]->(r);

// Aggregation rule
MERGE (cr:CoordinationRule {id: 'EU_AGGREGATION_RULE'})
SET cr.label = 'Aggregation of Periods',
    cr.regulation = 'EU 883/2004',
    cr.article = 'Article 6',
    cr.applies_to = 'BENEFIT_ELIGIBILITY',
    cr.description = 'Insurance periods from all EU states count towards benefit eligibility',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime()

WITH cr
MATCH (r:EURegulation {id: 'EU_REG_883_2004'})
MERGE (cr)-[:DERIVED_FROM]->(r);

// Link coordination rules to jurisdictions
MATCH (cr:CoordinationRule)
MATCH (j:Jurisdiction {id: 'EU'})
MERGE (cr)-[:IN_JURISDICTION]->(j);

// Create links between IE and UK coordination (post-Brexit)
MERGE (cr:CoordinationRule {id: 'IE_UK_SOCIAL_SECURITY_CONVENTION'})
SET cr.label = 'IE-UK Social Security Convention',
    cr.applies_to = 'SOCIAL_SECURITY',
    cr.home_jurisdiction = 'IE',
    cr.host_jurisdiction = 'UK',
    cr.description = 'Bilateral convention maintaining coordination after Brexit for workers moving between IE and UK',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime()

WITH cr
MATCH (ie:Jurisdiction {id: 'IE'}), (uk:Jurisdiction {id: 'UK'})
MERGE (cr)-[:COORDINATED_WITH]->(ie)
MERGE (cr)-[:COORDINATED_WITH]->(uk);
```

---

## Validation Checklist

After each tier implementation, verify:

### Code Verification
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] New node types in ingress guard whitelist
- [ ] New relationships in ingress guard whitelist
- [ ] Property whitelists complete for all new nodes
- [ ] TypeScript interfaces match schema
- [ ] GraphNode union type updated

### Data Verification
- [ ] Seed data loads without errors
- [ ] All new nodes linked to jurisdiction
- [ ] Relationships created between entities
- [ ] GraphClient methods return expected data

### Documentation Verification
- [ ] Schema documentation updated
- [ ] New node types documented with properties
- [ ] New relationships documented
- [ ] Examples provided

---

## Summary

| Tier | New Nodes | New Relationships | New Methods | Seed Files |
|------|-----------|-------------------|-------------|------------|
| 1 | `Penalty` | 3 | 3 | 1 |
| 2 | `LegalEntity`, `TaxCredit` | 5 | 5 | 2 |
| 3 | `RegulatoryBody`, `AssetClass`, `MeansTest`, `TaxYear` | 8 | 4 | 4 |
| 4 | `NIClass`, `BenefitCap`, `CoordinationRule` | 3 | 3 | 3 |
| **Total** | **10** | **19** | **15** | **10** |

This brings the regulatory graph to:
- **37 node types** (up from 27)
- **63 relationship types** (up from 44)
- Comprehensive coverage of IE, UK, and EU coordination
