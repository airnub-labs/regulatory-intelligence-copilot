# Regulatory Graph — Proposals for v0.7+ Enhancements

> **Status:** Proposals / Not Yet Implemented
> **Last Updated:** 2026-01-04
> **Purpose:** Capture forward-looking schema evolution proposals for future releases.

This document consolidates **proposed enhancements** for the regulatory graph schema beyond v0.6. These are ideas identified during reviews but **not yet implemented**.

For the **current implemented specification**, see [`regulatory-graph_current_v0.6.md`](./regulatory-graph_current_v0.6.md).

---

## Table of Contents

1. [Status Summary](#1-status-summary)
2. [Motivation & Gaps](#2-motivation--gaps)
3. [Proposed Node Types](#3-proposed-node-types)
4. [Proposed Relationship Types](#4-proposed-relationship-types)
5. [Structural Patterns](#5-structural-patterns)
6. [UK/EU Extension Gaps](#6-ukeu-extension-gaps)
7. [Migration Path](#7-migration-path)
8. [Open Questions](#8-open-questions)
9. [References](#9-references)

---

## 1. Status Summary

### 1.1 What's Implemented (v0.6)

The following were identified in reviews and have been **fully implemented**:

| Node Type | Status | Implementation |
|-----------|--------|----------------|
| `:Obligation` | ✅ Implemented | PR #218 |
| `:Threshold` | ✅ Implemented | PR #218 |
| `:Rate` | ✅ Implemented | PR #218 |
| `:Form` | ✅ Implemented | PR #218 |
| `:PRSIClass` | ✅ Implemented | PR #218 |
| `:LifeEvent` | ✅ Implemented | PR #218 |
| `:LegalEntity` | ✅ Implemented | PR #221 |
| `:TaxCredit` | ✅ Implemented | PR #221 |
| `:Penalty` | ✅ Implemented | PR #220 |

### 1.2 What's Proposed (v0.7+)

The following remain as **proposals for future implementation**:

| Proposal | Priority | Effort | Target |
|----------|----------|--------|--------|
| `:RegulatoryBody` | Medium | Low | v0.7 |
| `:AssetClass` | Medium | Medium | v0.7 |
| `:MeansTest` | Medium | High | v0.7 |
| `:TaxYear` | Medium | Low | v0.7 |
| `:ContributionRequirement` | Lower | Medium | v0.8 |
| `:IncomeType` | Lower | Medium | v0.8 |
| UK/EU extensions | Lower | High | v0.8+ |

---

## 2. Motivation & Gaps

### 2.1 Current Capabilities

The v0.6 graph enables:
- Answering "What can I claim/receive?" (Benefits, Reliefs, Tax Credits)
- Answering "What must I do?" (Obligations)
- Understanding "What happens if I miss a deadline?" (Penalties)
- Numeric scenario evaluation (Thresholds, Rates)
- Event-driven guidance (LifeEvents)
- Entity-specific rules (LegalEntity)
- PRSI-based eligibility (PRSIClass)
- Form requirements (Form)

### 2.2 Remaining Gaps

| Gap | Impact | Proposal |
|-----|--------|----------|
| No explicit regulatory authority nodes | Cannot query "Show all Revenue obligations" | `:RegulatoryBody` |
| Asset types not structured | CGT/stamp duty rules lack asset classification | `:AssetClass` |
| Means testing logic in text | Cannot model income assessment rules | `:MeansTest` |
| No temporal scoping node | Point-in-time queries require property filters | `:TaxYear` |
| PRSI contribution patterns in text | Cannot structure "104 weeks in 3 years" | `:ContributionRequirement` |
| Income types not classified | Cannot model "employment income assessed, rental disregarded" | `:IncomeType` |

---

## 3. Proposed Node Types

### 3.1 `:RegulatoryBody`

**Priority:** Medium
**Effort:** Low
**Rationale:** Users ask "Who administers this?" and we need to link obligations to authorities.

```typescript
interface RegulatoryBody {
  id: string;           // e.g., "IE_REVENUE"
  label: string;        // "Irish Revenue Commissioners"
  abbreviation?: string; // "Revenue"
  jurisdiction: string;
  domain: 'TAX' | 'SOCIAL_WELFARE' | 'COMPANY' | 'PENSIONS' | 'EMPLOYMENT' | 'HEALTH';
  website?: string;
  contact_info?: string;
  created_at: datetime;
  updated_at: datetime;
}
```

**Relationships:**
- `(:Obligation)-[:ADMINISTERED_BY]->(:RegulatoryBody)`
- `(:Benefit)-[:ADMINISTERED_BY]->(:RegulatoryBody)`
- `(:Form)-[:ISSUED_BY]->(:RegulatoryBody)`
- `(:Guidance)-[:ISSUED_BY]->(:RegulatoryBody)`

**Example Data:**
```cypher
MERGE (rb:RegulatoryBody {id: 'IE_REVENUE'})
SET rb.label = 'Irish Revenue Commissioners',
    rb.abbreviation = 'Revenue',
    rb.jurisdiction = 'IE',
    rb.domain = 'TAX',
    rb.website = 'https://www.revenue.ie'
```

---

### 3.2 `:AssetClass`

**Priority:** Medium
**Effort:** Medium
**Rationale:** CGT, stamp duty, and investment rules depend on asset classification.

```typescript
interface AssetClass {
  id: string;           // e.g., "IE_ASSET_RESIDENTIAL_PROPERTY"
  label: string;        // "Residential Property"
  category: 'SHARES' | 'PROPERTY' | 'CRYPTO' | 'BUSINESS' | 'AGRICULTURAL' | 'PERSONAL' | 'FINANCIAL';
  sub_category?: string; // "RESIDENTIAL", "COMMERCIAL", "DEVELOPMENT"
  tangible: boolean;
  cgt_applicable: boolean;
  cat_applicable: boolean;
  stamp_duty_applicable: boolean;
  created_at: datetime;
  updated_at: datetime;
}
```

**Relationships:**
- `(:Relief)-[:APPLIES_TO_ASSET]->(:AssetClass)`
- `(:AssetClass)-[:HAS_CGT_RATE]->(:Rate)`
- `(:AssetClass)-[:HAS_STAMP_DUTY_RATE]->(:Rate)`
- `(:Threshold)-[:APPLIES_TO_ASSET]->(:AssetClass)`

**Example Query:**
```cypher
// What CGT reliefs apply to agricultural land?
MATCH (r:Relief)-[:APPLIES_TO_ASSET]->(a:AssetClass {category: 'AGRICULTURAL'})
RETURN r.label
```

---

### 3.3 `:MeansTest`

**Priority:** Medium
**Effort:** High
**Rationale:** Many benefits are means-tested with complex income assessment rules.

```typescript
interface MeansTest {
  id: string;           // e.g., "IE_JOBSEEKERS_ALLOWANCE_MEANS_TEST"
  label: string;        // "Jobseeker's Allowance Means Test"
  income_disregard?: number;      // Amount of income ignored
  capital_threshold?: number;     // Capital below which ignored
  capital_weekly_assessment?: number; // Rate of capital-to-income conversion
  spouse_income_assessed: boolean;
  maintenance_assessed: boolean;
  categories: string[];           // Income types assessed
  created_at: datetime;
  updated_at: datetime;
}
```

**Relationships:**
- `(:Benefit)-[:HAS_MEANS_TEST]->(:MeansTest)`
- `(:MeansTest)-[:HAS_THRESHOLD]->(:Threshold)`
- `(:MeansTest)-[:DISREGARDS]->(:IncomeType)`

---

### 3.4 `:TaxYear`

**Priority:** Medium
**Effort:** Low
**Rationale:** Many rules, rates, and thresholds are year-specific.

```typescript
interface TaxYear {
  id: string;           // e.g., "IE_TAX_YEAR_2024"
  year: number;         // 2024
  start_date: date;     // 2024-01-01
  end_date: date;       // 2024-12-31
  jurisdiction: string;
  created_at: datetime;
  updated_at: datetime;
}
```

**Relationships:**
- `(:Rate)-[:APPLIES_IN_YEAR]->(:TaxYear)`
- `(:Threshold)-[:APPLIES_IN_YEAR]->(:TaxYear)`
- `(:TaxCredit)-[:APPLIES_IN_YEAR]->(:TaxYear)`

**Example Query:**
```cypher
// What were the income tax rates in 2023?
MATCH (ty:TaxYear {year: 2023})<-[:APPLIES_IN_YEAR]-(r:Rate)
WHERE r.category = 'INCOME_TAX'
RETURN r.label, r.percentage, r.band_lower, r.band_upper
```

---

### 3.5 `:ContributionRequirement`

**Priority:** Lower
**Effort:** Medium
**Rationale:** Benefits eligibility often depends on contribution history patterns.

```typescript
interface ContributionRequirement {
  id: string;           // e.g., "IE_JOBSEEKERS_PRSI_REQUIREMENT"
  label: string;        // "Jobseeker's Benefit PRSI Requirement"
  minimum_contributions: number;  // 104
  unit: 'WEEKS' | 'CONTRIBUTIONS';
  lookback_period_years: number;
  relevant_tax_year_contributions?: number; // 39
  recent_contributions?: number;  // 13 in last 26 weeks
  recent_period_weeks?: number;
  contribution_classes: string[]; // ['A', 'H']
  created_at: datetime;
  updated_at: datetime;
}
```

**Relationships:**
- `(:Benefit)-[:REQUIRES_CONTRIBUTIONS]->(:ContributionRequirement)`
- `(:ContributionRequirement)-[:SATISFIED_BY]->(:PRSIClass)`

---

### 3.6 `:IncomeType`

**Priority:** Lower
**Effort:** Medium
**Rationale:** Means tests and reliefs apply differently to different income types.

```typescript
interface IncomeType {
  id: string;           // e.g., "INCOME_EMPLOYMENT"
  label: string;        // "Employment Income"
  category: 'EMPLOYMENT' | 'SELF_EMPLOYMENT' | 'RENTAL' | 'INVESTMENT' | 'PENSION' | 'SOCIAL_WELFARE' | 'OTHER';
  taxable: boolean;
  prsi_applicable: boolean;
  usc_applicable: boolean;
  created_at: datetime;
  updated_at: datetime;
}
```

**Relationships:**
- `(:MeansTest)-[:ASSESSES]->(:IncomeType)`
- `(:MeansTest)-[:DISREGARDS]->(:IncomeType)`
- `(:Rate)-[:APPLIES_TO_INCOME]->(:IncomeType)`

---

## 4. Proposed Relationship Types

### 4.1 Administration & Authority

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `ADMINISTERED_BY` | Obligation, Benefit | RegulatoryBody | Which authority handles this |
| `ISSUED_BY` | Form, Guidance | RegulatoryBody | Issuing authority |

### 4.2 Asset & Property Rules

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `APPLIES_TO_ASSET` | Relief, Rate | AssetClass | Asset-specific rules |
| `HAS_CGT_RATE` | AssetClass | Rate | CGT rate for asset type |
| `HAS_STAMP_DUTY_RATE` | AssetClass | Rate | Stamp duty for asset type |

### 4.3 Means Testing

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_MEANS_TEST` | Benefit | MeansTest | Means test requirements |
| `ASSESSES` | MeansTest | IncomeType | Income types assessed |
| `DISREGARDS` | MeansTest | IncomeType | Income types ignored |

### 4.4 Contribution Requirements

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `REQUIRES_CONTRIBUTIONS` | Benefit | ContributionRequirement | PRSI contribution requirements |
| `SATISFIED_BY` | ContributionRequirement | PRSIClass | Which PRSI classes qualify |

### 4.5 Temporal Scoping

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `APPLIES_IN_YEAR` | Rate, Threshold, TaxCredit | TaxYear | Year-specific values |

### 4.6 Enhanced Interactions

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `SUPERSEDES` | Section, Update | Section | Version succession |
| `REPLACES` | Benefit, Relief | Benefit, Relief | Scheme succession |

---

## 5. Structural Patterns

### 5.1 Rule Versioning & History

**Gap:** The graph stores current rules but doesn't clearly track historical versions.

**Proposal:**
- Standardize `effective_from`/`effective_to` on ALL rate-like and threshold-like nodes
- Add `SUPERSEDES` relationship for rule succession
- Consider `:HistoricalSnapshot` pattern for point-in-time queries

### 5.2 Evidence & Confidence Scoring

**Gap:** All rule assertions are treated equally, but some are more authoritative.

**Proposal:** Add evidence tracking:

```typescript
interface Evidence {
  source_type: 'LEGISLATION' | 'REVENUE_GUIDANCE' | 'CASE_LAW' | 'EXPERT_OPINION';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  last_verified: Date;
  source_url?: string;
}
```

Could be properties on edges or a separate `:Evidence` node linked via `SUPPORTED_BY`.

### 5.3 Circular Dependency Prevention

**Gap:** No explicit mechanism to prevent circular relationships.

**Proposal:**
- Add `symmetric: true` property to relationships like `MUTUALLY_EXCLUSIVE_WITH`
- Query validation in GraphClient to detect cycles
- Ingress guard check for duplicate symmetric edges

---

## 6. UK/EU Extension Gaps

### 6.1 UK-Specific Types

For UK coverage parity with Ireland:

| Type | Irish Equivalent | UK Implementation |
|------|-----------------|-------------------|
| `:NIClass` | `:PRSIClass` | UK National Insurance classes (1, 2, 3, 4) |
| `:BenefitCap` | N/A | Universal Credit benefit cap rules |
| `:TaperRate` | N/A | UC taper rate reductions |
| `:PIPComponent` | N/A | Personal Independence Payment (daily living/mobility) |

### 6.2 EU Social Security Coordination

**Gap:** EU Regulation 883/2004 coordination rules are referenced but not fully modelled.

**Need:**
- `:CoordinationRule` — Which country's rules apply when
- `:PostingCertificate` — A1/E101 certificate requirements
- `:AggregationPeriod` — How contributions from multiple states combine

### 6.3 Northern Ireland Specific

**Gap:** NI has different social welfare rules from rest of UK.

**Need:**
- NI-specific `:Benefit` nodes where rules differ from GB
- Windsor Framework impacts on goods movement modelling

---

## 7. Migration Path

### 7.1 v0.7 (Next Release)

**Target:** Add RegulatoryBody, AssetClass, MeansTest, TaxYear

1. Update schema documentation
2. Add to ingress guard whitelist
3. Add TypeScript interfaces
4. Create seed data
5. Add GraphClient methods

### 7.2 v0.8 (Future)

**Target:** Add ContributionRequirement, IncomeType, UK extensions

### 7.3 Backward Compatibility

- All changes should be **additive** — no breaking changes
- Existing nodes and relationships continue to work
- New nodes can be gradually populated via ingestion jobs

---

## 8. Open Questions

### 8.1 Unresolved Design Questions

1. **TaxYear vs. effective_from/to:**
   Should we use explicit `:TaxYear` nodes or rely on date properties?

2. **MeansTest complexity:**
   Is `:MeansTest` over-engineered? Could simpler `:Condition` nodes suffice?

3. **AssetClass hierarchy:**
   Should asset classes have a SKOS-style `BROADER`/`NARROWER` hierarchy?

4. **Evidence provenance:**
   Should evidence be properties on edges or separate `:Evidence` nodes?

5. **UK/EU parity timeline:**
   When should UK-specific types be prioritized vs. deepening IE coverage?

---

## 9. References

### 9.1 Source Documents

The proposals in this document were extracted from:

- `REGULATORY_GRAPH_REVIEW.md` (2025-12-28) — Original gap analysis
- `REGULATORY_GRAPH_FUTURE_ENHANCEMENTS.md` (2025-12-29) — Post-implementation review

These documents are retained in the active directory for historical reference of the review process.

### 9.2 Related Documentation

| Document | Purpose |
|----------|---------|
| [`regulatory-graph_current_v0.6.md`](./regulatory-graph_current_v0.6.md) | Current implemented specification |
| [`schema_v_0_6.md`](./schema_v_0_6.md) | Complete v0.6 schema details |
| [`schema_changelog_v_0_6.md`](./schema_changelog_v_0_6.md) | Schema evolution history |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-04 | Created consolidated proposals document |
| 2025-12-29 | Original REGULATORY_GRAPH_FUTURE_ENHANCEMENTS.md created |
| 2025-12-28 | Original REGULATORY_GRAPH_REVIEW.md gap analysis |

---

**End of v0.7+ Proposals Document**
