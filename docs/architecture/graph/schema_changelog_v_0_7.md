# Graph Schema Changelog v0.7 – Regulatory Intelligence Copilot

> **Status:** Current
> **Supersedes:** `docs/architecture/graph/schema_changelog_v_0_6.md`
> **Primary Schema:** `docs/architecture/graph/schema_v_0_7.md`

---

## v0.7 – Comprehensive Regulatory Modelling (2025-12-28)

### Summary

v0.7 is a **major enhancement** to the regulatory graph schema, adding first-class support for:

- **Obligations** – What users MUST do (filing, registration, payment)
- **Thresholds** – Quantitative limits that trigger requirements or determine eligibility
- **Rates** – Tax rates, contribution rates, benefit rates
- **Authorities** – Regulatory bodies that administer rules
- **Forms** – Official forms needed to claim benefits or meet obligations
- **Contributions** – PRSI, pension contributions that count towards eligibility
- **Disqualifications** – Events that prevent access to benefits/reliefs

Additionally, v0.7 introduces new relationship types for:

- **Temporal evolution** – `SUPERSEDES` for tracking how rules change over time
- **Cascading eligibility** – `TRIGGERS`, `UNLOCKS`, `STACKS_WITH` for modelling dependencies
- **Means testing** – `REDUCES`, `OFFSETS` for income-based adjustments
- **Contribution tracking** – `COUNTS_TOWARDS`, `SATISFIES` for eligibility conditions
- **Enhanced provenance** – Source attribution and confidence on all relationships

### Motivation

The v0.6 schema effectively models what users CAN receive (benefits, reliefs) but has gaps in modelling:

1. **What users MUST do** – No explicit obligation modelling
2. **Quantitative comparisons** – Thresholds/rates embedded in text, not queryable
3. **Cascading effects** – No model for "if I claim X, what else can I claim?"
4. **Administrative reality** – Who administers what, what forms to file
5. **Historical tracking** – How rules evolve over time
6. **Trust/provenance** – Where did this information come from?

v0.7 addresses all these gaps while maintaining full backwards compatibility with v0.6.

---

## Detailed Changes

### 1. New Node Labels

#### 1.1 `:Obligation` (HIGH Priority)

**Purpose**: Represents something a person/entity MUST do – filing requirements, registration duties, reporting obligations, payment deadlines.

**Why High Value**:
- Completes the regulatory picture (MUST do + CAN get)
- Enables compliance checking and deadline tracking
- Models penalty/consequence of non-compliance
- Supports "what are my obligations as a single director?" queries

**Key Properties**:
```typescript
interface Obligation {
  id: string;                    // e.g., "IE_PAYE_MONTHLY_FILING"
  label: string;                 // Human-readable name
  category: string;              // FILING | REGISTRATION | REPORTING | PAYMENT | RECORD_KEEPING | NOTIFICATION
  frequency?: string;            // ONE_TIME | MONTHLY | QUARTERLY | ANNUAL | EVENT_TRIGGERED
  penalty_type?: string;         // FIXED | PERCENTAGE | INTEREST | SURCHARGE | CRIMINAL
  penalty_amount?: number;       // Fixed penalty amount
  penalty_rate?: number;         // Percentage penalty rate
  jurisdictionCode: string;
  administering_authority?: string;
}
```

**Example Queries Enabled**:
```cypher
// What must a single director file?
MATCH (p:ProfileTag {id: "PROFILE_SINGLE_DIRECTOR_IE"})-[:SUBJECT_TO]->(o:Obligation)
RETURN o.label, o.category, o.frequency
```

#### 1.2 `:Threshold` (HIGH Priority)

**Purpose**: Represents quantitative limits that determine eligibility, registration requirements, or benefit amounts.

**Why High Value**:
- Enables cross-jurisdiction threshold comparisons
- Tracks when thresholds change (Budget announcements)
- Supports inflation indexing queries
- Critical for eligibility determination

**Key Properties**:
```typescript
interface Threshold {
  id: string;                    // e.g., "IE_VAT_THRESHOLD_SERVICES_2024"
  label: string;
  value: number;                 // The numeric threshold
  currency?: string;             // EUR | GBP | USD
  unit?: string;                 // CURRENCY | DAYS | WEEKS | YEARS | PERCENTAGE | COUNT
  period?: string;               // ANNUAL | LIFETIME | PER_TRANSACTION | ROLLING_12_MONTH
  direction: string;             // ABOVE | BELOW | AT_OR_ABOVE | AT_OR_BELOW
  effective_from?: Date;
  effective_to?: Date;
  inflation_indexed?: boolean;
  jurisdictionCode: string;
}
```

**Example Queries Enabled**:
```cypher
// Compare VAT thresholds across jurisdictions
MATCH (t:Threshold)
WHERE t.label CONTAINS "VAT" AND t.effective_to IS NULL
RETURN t.jurisdictionCode, t.value, t.currency
ORDER BY t.value DESC
```

#### 1.3 `:Rate` (HIGH Priority)

**Purpose**: Represents percentage rates for taxes, contributions, benefits.

**Why High Value**:
- Enables "what's the corp tax rate in IE vs MT?" queries
- Tracks rate changes over time
- Supports marginal rate calculations
- Essential for tax planning scenarios

**Key Properties**:
```typescript
interface Rate {
  id: string;                    // e.g., "IE_CORPORATION_TAX_STANDARD_2024"
  label: string;
  percentage: number;            // Decimal (0.125 for 12.5%)
  rate_type: string;             // FLAT | MARGINAL | EFFECTIVE | REDUCED | STANDARD
  base?: string;                 // GROSS_INCOME | TAXABLE_INCOME | CAPITAL_GAIN | TURNOVER
  band_min?: number;             // Lower bound for marginal rates
  band_max?: number;             // Upper bound (null = unlimited)
  effective_from?: Date;
  effective_to?: Date;
  jurisdictionCode: string;
}
```

#### 1.4 `:Authority` (MEDIUM Priority)

**Purpose**: Represents regulatory bodies, government agencies, and administrative authorities.

**Why High Value**:
- Enables "who administers this benefit?" queries
- Models appeal paths and jurisdictional responsibilities
- Links guidance/cases to authoritative sources

**Key Properties**:
```typescript
interface Authority {
  id: string;                    // e.g., "IE_REVENUE"
  name: string;                  // Full official name
  short_name?: string;           // Common abbreviation
  jurisdictionCode: string;
  domains: string[];             // ["TAX", "CUSTOMS"], ["SOCIAL_WELFARE"]
  website?: string;
  contact_url?: string;
}
```

#### 1.5 `:Form` (MEDIUM Priority)

**Purpose**: Represents official forms, returns, and applications.

**Why High Value**:
- Answers "what form do I need?" questions
- Links obligations to concrete actions
- Supports practical compliance guidance

**Key Properties**:
```typescript
interface Form {
  id: string;                    // e.g., "IE_FORM_11"
  name: string;
  form_code?: string;            // Official form number
  form_type: string;             // TAX_RETURN | APPLICATION | NOTIFICATION | CLAIM | REGISTRATION
  electronic_available: boolean;
  source_url?: string;
  jurisdictionCode: string;
  administering_authority_id?: string;
}
```

#### 1.6 `:Contribution` (MEDIUM Priority)

**Purpose**: Represents contributions (PRSI, pension, levy) that count towards eligibility.

**Why High Value**:
- Models how contributions unlock benefits
- Supports "how many contributions do I need?" queries
- Essential for pension and social welfare reasoning

**Key Properties**:
```typescript
interface Contribution {
  id: string;                    // e.g., "IE_PRSI_CLASS_S"
  label: string;
  contribution_type: string;     // MANDATORY | VOLUNTARY | CREDITED | EMPLOYER | EMPLOYEE
  category: string;              // PRSI | PENSION | LEVY | USC | SOCIAL_INSURANCE
  class_code?: string;           // e.g., "S", "A", "B" for PRSI
  jurisdictionCode: string;
}
```

#### 1.7 `:Disqualification` (MEDIUM Priority)

**Purpose**: Represents events or conditions that disqualify someone from benefits/reliefs.

**Why High Value**:
- Models negative consequences of actions
- Supports "what would disqualify me?" queries
- Essential for compliance risk assessment

---

### 2. New Relationship Types

#### 2.1 `SUPERSEDES` (HIGH Priority)

**Purpose**: Tracks when one rule, rate, threshold, or benefit replaces another.

**Pattern**:
```cypher
(:Rate)-[:SUPERSEDES { effective_from: datetime, reason?: string }]->(:Rate)
(:Threshold)-[:SUPERSEDES]->(:Threshold)
(:Section)-[:SUPERSEDES]->(:Section)
```

**Why High Value**: Enables historical queries and change tracking.

#### 2.2 `TRIGGERS` / `UNLOCKS` (HIGH Priority)

**Purpose**: Models cascading eligibility where claiming one thing affects eligibility for others.

**Pattern**:
```cypher
(:Benefit)-[:UNLOCKS { condition?: string }]->(:Benefit)
(:Benefit)-[:TRIGGERS]->(:Obligation)
(:Relief)-[:TRIGGERS_OBLIGATION]->(:Obligation)
```

**Why High Value**: Answers "if I claim X, what else becomes available/required?"

#### 2.3 `STACKS_WITH` (HIGH Priority)

**Purpose**: Explicitly models benefits/reliefs that CAN be combined.

**Pattern**:
```cypher
(:Benefit)-[:STACKS_WITH { max_combined_value?: float }]->(:Benefit)
```

**Why High Value**: Complement to MUTUALLY_EXCLUSIVE_WITH - shows what CAN be combined.

#### 2.4 `COUNTS_TOWARDS` / `SATISFIES` (MEDIUM Priority)

**Purpose**: Models how contributions count towards eligibility conditions.

**Pattern**:
```cypher
(:Contribution)-[:COUNTS_TOWARDS]->(:Condition)
(:Section)-[:SATISFIES]->(:Condition)
```

#### 2.5 `HAS_THRESHOLD` / `HAS_RATE` (HIGH Priority)

**Purpose**: Links conditions and rules to their quantitative values.

**Pattern**:
```cypher
(:Condition)-[:HAS_THRESHOLD]->(:Threshold)
(:Benefit)-[:HAS_RATE]->(:Rate)
(:Contribution)-[:HAS_RATE]->(:Rate)
```

#### 2.6 `REDUCES` / `OFFSETS` (MEDIUM Priority)

**Purpose**: Models means testing and offsetting.

**Pattern**:
```cypher
(:Condition)-[:REDUCES { rate?: float }]->(:Benefit)
(:Relief)-[:OFFSETS]->(:Obligation)
```

#### 2.7 `ADMINISTERED_BY` / `CLAIMED_VIA` (MEDIUM Priority)

**Purpose**: Links to administrative structure.

**Pattern**:
```cypher
(:Authority)-[:ADMINISTERS]->(:Benefit)
(:Benefit)-[:CLAIMED_VIA]->(:Form)
(:Obligation)-[:SATISFIED_BY]->(:Form)
```

#### 2.8 `GRANDFATHERED_BY` (MEDIUM Priority)

**Purpose**: Models transitional provisions.

**Pattern**:
```cypher
(:Section)-[:GRANDFATHERED_BY { cohort?: string, until?: datetime }]->(:Update)
```

---

### 3. Enhanced Provenance Metadata

All relationships can now include optional provenance properties:

```typescript
interface RelationshipProvenance {
  source_type?: 'LEGISLATION' | 'CASE_LAW' | 'GUIDANCE' | 'LLM_INFERRED' | 'HUMAN_VERIFIED';
  source_id?: string;
  source_url?: string;
  confidence?: number;           // 0.0 - 1.0
  verified_by?: string;
  verified_at?: Date;
  extraction_method?: 'MCP_TOOL' | 'MANUAL' | 'LLM_EXTRACTION' | 'STATUTORY_REFERENCE';
}
```

**Why High Value**: Enables trust assessment and identification of low-confidence relationships.

---

## Migration Guide

### Step 1: Update Graph Ingress Guard

Add new node labels and relationship types to the whitelist:

```typescript
// In graphIngressGuard.ts
const ALLOWED_LABELS = [
  ...EXISTING_LABELS,
  'Obligation', 'Threshold', 'Rate', 'Authority', 'Form', 'Contribution', 'Disqualification'
];

const ALLOWED_RELATIONSHIPS = [
  ...EXISTING_RELATIONSHIPS,
  'SUBJECT_TO', 'TRIGGERS_OBLIGATION', 'SATISFIED_BY', 'ADMINISTERED_BY',
  'HAS_THRESHOLD', 'HAS_RATE', 'SUPERSEDES', 'TRIGGERS', 'UNLOCKS',
  'COUNTS_TOWARDS', 'STACKS_WITH', 'REDUCES', 'OFFSETS', 'CLAIMED_VIA',
  'GRANDFATHERED_BY', 'CAN_TRIGGER', 'DISQUALIFIES_FROM'
];
```

### Step 2: Update GraphWriteService

Add upsert methods for new node types:

```typescript
// New methods needed
upsertObligation(obligation: ObligationInput): Promise<void>
upsertThreshold(threshold: ThresholdInput): Promise<void>
upsertRate(rate: RateInput): Promise<void>
upsertAuthority(authority: AuthorityInput): Promise<void>
upsertForm(form: FormInput): Promise<void>
upsertContribution(contribution: ContributionInput): Promise<void>
upsertDisqualification(disqualification: DisqualificationInput): Promise<void>
```

### Step 3: Seed Core Data

Create seed scripts for fundamental data:

1. **Authorities**: IE_REVENUE, IE_DSP, UK_HMRC, etc.
2. **Common Thresholds**: VAT registration, audit exemption, CGT exemption
3. **Standard Rates**: Corporation tax, income tax bands, PRSI rates
4. **Core Forms**: Form 11, CT1, P35, etc.

### Step 4: Backfill Relationships

For existing data:
1. Add `SUPERSEDES` chains where historical data exists
2. Add `HAS_THRESHOLD` and `HAS_RATE` links to existing conditions
3. Add provenance metadata to existing relationships (set confidence = 0.7 for LLM-derived)

---

## Backwards Compatibility

**All v0.6 queries continue to work unchanged.**

- No existing node labels or properties are modified
- No existing relationship types are removed or changed
- New features are purely additive
- Queries that don't use new node types will return the same results

---

## Implementation Priority

### Phase 1: Core Infrastructure (Week 1)
- Update Graph Ingress Guard whitelists
- Add TypeScript interfaces for new node types
- Implement upsert methods in GraphWriteService

### Phase 2: High Priority Nodes (Week 2)
- `:Obligation` with SUBJECT_TO, TRIGGERS_OBLIGATION relationships
- `:Threshold` with HAS_THRESHOLD relationship
- `:Rate` with HAS_RATE relationship
- `SUPERSEDES` relationship

### Phase 3: Medium Priority Nodes (Week 3)
- `:Authority` with ADMINISTERED_BY relationship
- `:Form` with CLAIMED_VIA, SATISFIED_BY relationships
- `:Contribution` with COUNTS_TOWARDS relationship

### Phase 4: Advanced Relationships (Week 4)
- TRIGGERS, UNLOCKS, STACKS_WITH
- REDUCES, OFFSETS
- GRANDFATHERED_BY
- Enhanced provenance metadata

### Phase 5: Seed Data & Testing (Week 5)
- Seed core authorities, thresholds, rates
- Integration tests for new query patterns
- Agent updates to leverage new nodes

---

## Related Documentation

- `schema_v_0_7.md` – Full schema specification
- `schema_v_0_7_implementation_guide.md` – Detailed implementation guide for coding agents
- `graph_ingress_v_0_1.md` – Ingress guard specification (needs update)
- `algorithms_v_0_1.md` – Graph algorithms (unchanged)

---

## Previous Versions

### v0.6 – Concept Layer & Self-Populating Graph
Added `:Concept` and `:Label` nodes for SKOS-style concept capture.

### v0.5 – UI-Only Release
No schema changes.

### v0.4 – Architecture Alignment
Graph Ingress Guard integration, optional algorithms.

### v0.3 – Timeline & Cross-Jurisdiction
Timeline alignment, cross-border relationships.

---

**End of Changelog v0.7**
