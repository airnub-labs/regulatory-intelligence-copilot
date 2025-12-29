# Regulatory Graph Future Enhancements

> **Status:** Review Document
> **Date:** 2025-12-29
> **Reviewed Version:** Schema v0.6 (fully implemented)
> **Purpose:** Identify future high-value additions beyond the completed implementation

---

## Executive Summary

The regulatory graph review (PR #218) is **fully complete**, with all 5 phases implemented:

| Phase | Content | Status |
|-------|---------|--------|
| Phase 1 | Types alignment + `:Obligation` | ✅ Complete |
| Phase 2 | `:Threshold` + `:Rate` | ✅ Complete |
| Phase 3 | `:Form` + SKOS hierarchy | ✅ Complete |
| Phase 4 | `:PRSIClass` + `:LifeEvent` | ✅ Complete |
| Phase 5 | Testing & Validation | ✅ Complete |

**Current graph capabilities:**
- 27 node types fully whitelisted in ingress guard
- 44 relationship types supported
- Seed data for all 6 new concept types
- GraphClient methods for obligations, rates, thresholds, forms, PRSI classes, and life events

This document identifies **future enhancements** - additional concept types and relationships that would further expand the copilot's capabilities beyond the current implementation.

---

## 1. Critical Missing Concept Types

### 1.1 `:Penalty` (Priority: Critical)

**Gap:** The graph models obligations but not the consequences of non-compliance.

**Why this matters:**
- Users need to understand **risk** - "What happens if I miss this deadline?"
- Late filing surcharges (5%/10% for CT1, Form 11)
- Interest on late payments (0.0219% per day)
- Fixed penalties for certain failures
- Prosecution thresholds for serious non-compliance

**Proposed Properties:**
```typescript
interface Penalty {
  id: string;           // e.g., "IE_LATE_CT1_SURCHARGE"
  label: string;        // "Late Filing Surcharge"
  penalty_type: 'SURCHARGE' | 'INTEREST' | 'FIXED' | 'PROSECUTION' | 'RESTRICTION';
  rate?: number;        // Percentage rate (5, 10)
  daily_rate?: number;  // For interest calculations (0.0219)
  flat_amount?: number; // For fixed penalties
  currency?: string;
  max_amount?: number;  // Cap on penalty
  applies_after_days?: number; // Days after deadline
  applies_after_months?: number;
  description?: string;
}
```

**Required Relationships:**
- `(:Obligation)-[:HAS_PENALTY]->(:Penalty)` - Primary link
- `(:Penalty)-[:WAIVED_IF]->(:Condition)` - Penalty exemptions
- `(:Penalty)-[:SCALES_WITH]->(:Threshold)` - Progressive penalties
- `(:Penalty)-[:IN_JURISDICTION]->(:Jurisdiction)`

**Seed Data Examples:**
```cypher
// Late CT1 Filing Surcharge - First tier
MERGE (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5'})
SET p.label = 'Late CT1 Filing Surcharge (5%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 5,
    p.applies_after_days = 1,
    p.description = '5% surcharge on tax due if CT1 filed within 2 months after deadline'

// Late Payment Interest
MERGE (p:Penalty {id: 'IE_LATE_PAYMENT_INTEREST'})
SET p.label = 'Late Payment Interest',
    p.penalty_type = 'INTEREST',
    p.daily_rate = 0.0219,
    p.description = 'Interest charged at 0.0219% per day on overdue tax'

// Link to obligations
MATCH (o:Obligation {id: 'IE_CT1_FILING'}), (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5'})
MERGE (o)-[:HAS_PENALTY]->(p);
```

---

### 1.2 `:LegalEntity` / `:EntityType` (Priority: High)

**Gap:** Rules vary by entity type, but `ProfileTag` conflates individual profiles with legal structures.

**Why this matters:**
- LTD vs DAC vs PLC have different obligations
- Partnerships have pass-through taxation
- Sole traders are taxed as individuals
- Trusts have special CGT rules
- Charities (CLG) have exemptions

**Proposed Properties:**
```typescript
interface LegalEntity {
  id: string;           // e.g., "IE_ENTITY_LTD"
  label: string;        // "Private Company Limited by Shares (LTD)"
  abbreviation?: string; // "LTD"
  jurisdiction: string;
  category: 'COMPANY' | 'PARTNERSHIP' | 'SOLE_TRADER' | 'TRUST' | 'CHARITY' | 'FUND';
  sub_category?: string; // "PRIVATE", "PUBLIC", "DESIGNATED_ACTIVITY"
  has_separate_legal_personality: boolean;
  limited_liability: boolean;
  can_trade: boolean;
  can_hold_property: boolean;
  tax_transparent?: boolean; // For partnerships, trusts
}
```

**Required Relationships:**
- `(:LegalEntity)-[:HAS_OBLIGATION]->(:Obligation)`
- `(:LegalEntity)-[:SUBJECT_TO_RATE]->(:Rate)`
- `(:Relief|:Benefit)-[:AVAILABLE_TO]->(:LegalEntity)`
- `(:Section)-[:APPLIES_TO_ENTITY]->(:LegalEntity)`
- `(:LegalEntity)-[:IN_JURISDICTION]->(:Jurisdiction)`

---

### 1.3 `:TaxCredit` (Priority: High)

**Gap:** Tax credits are conflated with `:Relief` but operate differently.

**Why this matters:**
- **Tax Credits** reduce tax liability directly (€ for €)
- **Tax Reliefs** reduce taxable income (value depends on marginal rate)
- Credits typically cannot exceed liability
- Credits may be refundable or non-refundable
- Some credits are transferable between spouses

**Proposed Properties:**
```typescript
interface TaxCredit {
  id: string;           // e.g., "IE_PERSONAL_TAX_CREDIT_2024"
  label: string;        // "Personal Tax Credit"
  amount: number;       // 1875
  currency: string;
  tax_year: number;
  refundable: boolean;
  transferable: boolean;
  restricted_to_marginal?: boolean; // SARP, etc.
  category: 'PERSONAL' | 'EMPLOYMENT' | 'FAMILY' | 'HEALTH' | 'HOUSING' | 'OTHER';
}
```

**Required Relationships:**
- `(:TaxCredit)-[:REQUIRES]->(:Condition)` - Eligibility
- `(:ProfileTag)-[:ENTITLED_TO]->(:TaxCredit)` - Profile entitlements
- `(:TaxCredit)-[:CAPPED_BY]->(:Threshold)` - Maximum limits
- `(:TaxCredit)-[:IN_TAX_YEAR]->(:TaxYear)` - Temporal scope

---

### 1.4 `:RegulatoryBody` (Priority: Medium)

**Gap:** Regulatory authorities are mentioned in text but not as first-class nodes.

**Why this matters:**
- Users ask "Who administers this benefit?"
- Links obligations to the correct authority
- Enables "Show all Revenue obligations" queries
- Cross-border scenarios involve multiple authorities

**Proposed Properties:**
```typescript
interface RegulatoryBody {
  id: string;           // e.g., "IE_REVENUE"
  label: string;        // "Irish Revenue Commissioners"
  abbreviation?: string; // "Revenue"
  jurisdiction: string;
  domain: 'TAX' | 'SOCIAL_WELFARE' | 'COMPANY' | 'PENSIONS' | 'EMPLOYMENT' | 'HEALTH';
  website?: string;
  contact_info?: string;
}
```

**Required Relationships:**
- `(:Obligation)-[:ADMINISTERED_BY]->(:RegulatoryBody)`
- `(:Benefit)-[:ADMINISTERED_BY]->(:RegulatoryBody)`
- `(:Form)-[:ISSUED_BY]->(:RegulatoryBody)`
- `(:Guidance)-[:ISSUED_BY]->(:RegulatoryBody)`

---

### 1.5 `:AssetClass` (Priority: Medium)

**Gap:** CGT, stamp duty, and investment rules depend on asset classification.

**Why this matters:**
- Different CGT rules for shares, property, crypto
- Agricultural relief applies to specific asset types
- Entrepreneur relief has qualifying asset criteria
- Stamp duty rates vary by asset type

**Proposed Properties:**
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
}
```

**Required Relationships:**
- `(:Relief)-[:APPLIES_TO_ASSET]->(:AssetClass)`
- `(:AssetClass)-[:HAS_CGT_RATE]->(:Rate)`
- `(:AssetClass)-[:HAS_STAMP_DUTY_RATE]->(:Rate)`
- `(:Threshold)-[:APPLIES_TO_ASSET]->(:AssetClass)`

---

### 1.6 `:MeansTest` (Priority: Medium)

**Gap:** Many benefits are means-tested with complex income assessment rules.

**Why this matters:**
- Jobseeker's Allowance vs Benefit (means-tested vs contributory)
- Different income disregards for different benefits
- Capital assessment rules
- Spousal income aggregation

**Proposed Properties:**
```typescript
interface MeansTest {
  id: string;           // e.g., "IE_JOBSEEKERS_ALLOWANCE_MEANS_TEST"
  label: string;        // "Jobseeker's Allowance Means Test"
  income_disregard?: number; // Amount of income ignored
  capital_threshold?: number; // Capital below which ignored
  capital_weekly_assessment?: number; // Rate of capital-to-income conversion
  spouse_income_assessed: boolean;
  maintenance_assessed: boolean;
  categories: string[]; // Income types assessed
}
```

**Required Relationships:**
- `(:Benefit)-[:HAS_MEANS_TEST]->(:MeansTest)`
- `(:MeansTest)-[:HAS_THRESHOLD]->(:Threshold)`
- `(:MeansTest)-[:DISREGARDS]->(:IncomeType)` (new node if needed)

---

### 1.7 `:ContributionRecord` (Priority: Medium)

**Gap:** Benefits eligibility often depends on contribution history patterns.

**Why this matters:**
- "104 weeks of PRSI in last 3 years"
- "39 weeks in relevant tax year"
- Different requirements for different benefits
- Averaging rules for State Pension

**Proposed Properties:**
```typescript
interface ContributionRequirement {
  id: string;           // e.g., "IE_JOBSEEKERS_PRSI_REQUIREMENT"
  label: string;        // "Jobseeker's Benefit PRSI Requirement"
  minimum_contributions: number; // 104
  unit: 'WEEKS' | 'CONTRIBUTIONS';
  lookback_period_years: number;
  relevant_tax_year_contributions?: number; // 39
  recent_contributions?: number; // 13 in last 26 weeks
  recent_period_weeks?: number;
  contribution_classes: string[]; // ['A', 'H']
}
```

**Required Relationships:**
- `(:Benefit)-[:REQUIRES_CONTRIBUTIONS]->(:ContributionRequirement)`
- `(:ContributionRequirement)-[:SATISFIED_BY]->(:PRSIClass)`

---

## 2. Missing Relationship Types

### 2.1 Penalty & Compliance Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_PENALTY` | Obligation | Penalty | Penalty for non-compliance |
| `WAIVED_IF` | Penalty | Condition | Circumstances where penalty waived |
| `SCALES_WITH` | Penalty | Threshold | Progressive penalty thresholds |
| `ADMINISTERED_BY` | Obligation, Benefit | RegulatoryBody | Which authority handles this |

### 2.2 Entity & Asset Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `AVAILABLE_TO` | Relief, Benefit | LegalEntity | Entity-specific availability |
| `APPLIES_TO_ENTITY` | Section, Obligation | LegalEntity | Entity-specific rules |
| `APPLIES_TO_ASSET` | Relief, Rate | AssetClass | Asset-specific rules |
| `HAS_CGT_RATE` | AssetClass | Rate | CGT rate for asset type |
| `HAS_STAMP_DUTY_RATE` | AssetClass | Rate | Stamp duty for asset type |

### 2.3 Means Testing Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_MEANS_TEST` | Benefit | MeansTest | Means test requirements |
| `DISREGARDS` | MeansTest | Threshold | Income disregard amounts |
| `REQUIRES_CONTRIBUTIONS` | Benefit | ContributionRequirement | PRSI contribution requirements |
| `SATISFIED_BY` | ContributionRequirement | PRSIClass | Which PRSI classes qualify |

### 2.4 Interaction & Stacking Relationships

| Relationship | From | To | Properties |
|-------------|------|-----|------------|
| `STACKS_WITH` | Relief, Benefit | Relief, Benefit | Can claim both |
| `REDUCES` | Benefit, Income | Benefit | One reduces another |
| `OFFSETS_AGAINST` | Relief, Loss | Relief, Gain | Can use one against another |
| `SUPERSEDES` | Section, Update | Section | Version succession |
| `REPLACES` | Benefit, Relief | Benefit, Relief | Scheme succession |

### 2.5 Tax Credit Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `ENTITLED_TO` | ProfileTag | TaxCredit | Profile-based credit entitlements |
| `CAPPED_BY` | TaxCredit | Threshold | Maximum credit amount |
| `TRANSFERS_TO` | TaxCredit | ProfileTag | Credit transferability |
| `IN_TAX_YEAR` | TaxCredit, Rate, Threshold | TaxYear | Temporal scope |

---

## 3. Structural Patterns Not Adequately Addressed

### 3.1 Tax Year Modelling

**Gap:** Many rules, rates, and thresholds are year-specific but there's no `:TaxYear` node.

**Impact:** Queries like "What were the CGT rates in 2023?" require filtering by properties instead of graph traversal.

**Proposal:** Add `:TaxYear` node:
```typescript
interface TaxYear {
  id: string;           // e.g., "IE_TAX_YEAR_2024"
  year: number;         // 2024
  start_date: Date;     // 2024-01-01
  end_date: Date;       // 2024-12-31
  jurisdiction: string;
}
```

With relationships:
- `(:Rate)-[:APPLIES_IN_YEAR]->(:TaxYear)`
- `(:Threshold)-[:APPLIES_IN_YEAR]->(:TaxYear)`
- `(:TaxCredit)-[:APPLIES_IN_YEAR]->(:TaxYear)`

### 3.2 Income Type Classification

**Gap:** Means tests and reliefs apply to different income types, but there's no structure for this.

**Impact:** Cannot model "Employment income is assessed, rental income is disregarded" patterns.

**Proposal:** Add `:IncomeType` node:
```typescript
interface IncomeType {
  id: string;           // e.g., "INCOME_EMPLOYMENT"
  label: string;        // "Employment Income"
  category: 'EMPLOYMENT' | 'SELF_EMPLOYMENT' | 'RENTAL' | 'INVESTMENT' | 'PENSION' | 'SOCIAL_WELFARE' | 'OTHER';
  taxable: boolean;
  prsi_applicable: boolean;
  usc_applicable: boolean;
}
```

### 3.3 Circular Dependency Prevention

**Gap:** No explicit mechanism to prevent circular relationships (e.g., A EXCLUDES B, B EXCLUDES A as separate edges creating ambiguity).

**Proposal:**
- Add `symmetric: true` property to relationships like `MUTUALLY_EXCLUSIVE_WITH`
- Query validation in GraphClient to detect cycles
- Ingress guard check for duplicate symmetric edges

### 3.4 Rule Versioning & History

**Gap:** The graph stores current rules but doesn't clearly track historical versions.

**Current:** `effective_from`/`effective_to` on some nodes, but no explicit versioning pattern.

**Proposal:**
- Standardize `effective_from`/`effective_to` on ALL rate-like and threshold-like nodes
- Add `SUPERSEDES` relationship for rule succession
- Consider `:HistoricalSnapshot` pattern for point-in-time queries

### 3.5 Evidence & Confidence Scoring

**Gap:** All rule assertions are treated equally, but some are more authoritative than others.

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

---

## 4. UK/EU Extension Gaps

### 4.1 UK-Specific Types Needed

For UK coverage parity with Ireland:

| Type | Irish Equivalent | UK Implementation |
|------|-----------------|-------------------|
| `:NIClass` | `:PRSIClass` | UK National Insurance classes (1, 2, 3, 4) |
| `:BenefitCap` | N/A | Universal Credit benefit cap rules |
| `:TaperRate` | N/A | UC taper rate reductions |
| `:PIPComponent` | N/A | Personal Independence Payment (daily living/mobility) |

### 4.2 EU Social Security Coordination

**Gap:** EU Regulation 883/2004 coordination rules are referenced but not fully modelled.

**Need:**
- `:CoordinationRule` - Which country's rules apply when
- `:PostingCertificate` - A1/E101 certificate requirements
- `:AggregationPeriod` - How contributions from multiple states combine

### 4.3 Northern Ireland Specific

**Gap:** NI has different social welfare rules from rest of UK.

**Need:**
- Explicit `:Region` node for NI with `PART_OF` to UK
- NI-specific `:Benefit` nodes where rules differ
- Windsor Framework impacts on goods movement

---

## 5. Priority Recommendations for Future Work

### Tier 1 (Critical - Next Implementation Cycle)

| Item | Type | Effort | Impact | Rationale |
|------|------|--------|--------|-----------|
| `:Penalty` | Node | Medium | High | Completes obligation→consequence chain; enables risk assessment |
| `HAS_PENALTY` | Relationship | Low | High | Links obligations to penalties |
| `WAIVED_IF` | Relationship | Low | Medium | Models penalty exemptions |

### Tier 2 (High - Near-term)

| Item | Type | Effort | Impact | Rationale |
|------|------|--------|--------|-----------|
| `:LegalEntity` | Node | Medium | High | Entity-specific rules are fundamental |
| `:TaxCredit` | Node | Medium | High | Distinct from Relief; critical for tax calculation |
| `STACKS_WITH` | Relationship | Low | Medium | Benefit/relief combinations |
| `REDUCES` | Relationship | Low | Medium | Income→benefit reduction patterns |

### Tier 3 (Medium - Q2 2025)

| Item | Type | Effort | Impact | Rationale |
|------|------|--------|--------|-----------|
| `:RegulatoryBody` | Node | Low | Medium | Enables "administered by" queries |
| `:AssetClass` | Node | Medium | Medium | CGT/stamp duty asset-specific rules |
| `:MeansTest` | Node | High | Medium | Complex but critical for welfare |
| `:TaxYear` | Node | Low | Medium | Temporal structuring |

### Tier 4 (Future - H2 2025+)

| Item | Type | Effort | Impact | Rationale |
|------|------|--------|--------|-----------|
| `:ContributionRequirement` | Node | Medium | Medium | Detailed PRSI eligibility |
| `:IncomeType` | Node | Medium | Medium | Income classification |
| `:NIClass` | Node | Medium | Medium | UK coverage extension |
| `:CoordinationRule` | Node | High | Medium | EU social security |

---

## 6. Implementation Notes

### 6.1 For Each New Node Type

1. **Update schema documentation** (`schema_v_0_6.md` → `schema_v_0_7.md`)
2. **Add to ingress guard whitelist** (`graphIngressGuard.ts`)
3. **Add TypeScript interface** (`types.ts`)
4. **Add to GraphNode union type** (`types.ts`)
5. **Create seed data** (`seeds/*.cypher`)
6. **Add GraphClient methods** (if needed for common queries)
7. **Update tests**

### 6.2 For Each New Relationship Type

1. **Add to ingress guard `allowedRelTypes`**
2. **Document in schema under Section 3**
3. **Add seed data demonstrating usage**
4. **Consider if GraphClient method needed**

### 6.3 Backwards Compatibility

- All changes should be **additive** - no breaking changes
- Existing nodes and relationships continue to work
- New nodes can be gradually populated via ingestion jobs
- Consider migration script for restructuring existing data

---

## 7. Query Patterns to Enable

After Phase 2 implementation, the graph should support:

### 7.1 Risk Assessment Queries
```cypher
// What penalties apply if I miss the CT1 deadline?
MATCH (o:Obligation {id: 'IE_CT1_FILING'})-[:HAS_PENALTY]->(p:Penalty)
RETURN p.label, p.penalty_type, p.rate, p.applies_after_days

// What's the total penalty exposure for a single-director company?
MATCH (pt:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})-[:HAS_OBLIGATION]->(o:Obligation)
MATCH (o)-[:HAS_PENALTY]->(p:Penalty)
RETURN o.label, collect(p.label) as penalties
```

### 7.2 Entity-Specific Queries
```cypher
// What obligations apply to a DAC vs an LTD?
MATCH (e:LegalEntity)-[:HAS_OBLIGATION]->(o:Obligation)
WHERE e.id IN ['IE_ENTITY_LTD', 'IE_ENTITY_DAC']
RETURN e.label, collect(o.label) as obligations
```

### 7.3 Stacking & Interaction Queries
```cypher
// Which reliefs can I combine?
MATCH (r1:Relief)-[:STACKS_WITH]->(r2:Relief)
RETURN r1.label, r2.label

// What reduces my Jobseeker's Benefit?
MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})<-[:REDUCES]-(x)
RETURN x.label, labels(x)
```

### 7.4 Point-in-Time Queries
```cypher
// What were the income tax rates in 2023?
MATCH (ty:TaxYear {year: 2023})<-[:APPLIES_IN_YEAR]-(r:Rate)
WHERE r.category = 'INCOME_TAX'
RETURN r.label, r.percentage, r.band_lower, r.band_upper
```

---

## 8. Metrics for Success

After implementing future enhancements:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Penalty coverage | 100% of IE obligations | Count of obligations with HAS_PENALTY edges |
| Entity type queries | Distinct results by entity | Query returns different obligations for LTD vs Partnership |
| Risk assessment | Quantified penalties | Scenario Engine returns penalty amounts |
| Temporal queries | Point-in-time rates | Query returns correct historical rates |
| Stacking queries | Combination guidance | Query returns valid relief combinations |

---

## 9. Appendix: Complete Node Type Summary

### Currently Implemented (v0.6)

| Node Type | Status | Seeded |
|-----------|--------|--------|
| Jurisdiction | ✅ | Yes |
| Region | ✅ | Partial |
| Agreement/Treaty | ✅ | Minimal |
| Regime | ✅ | Minimal |
| Statute | ✅ | Yes |
| Section | ✅ | Yes |
| Benefit | ✅ | Yes |
| Relief | ✅ | Yes |
| Condition | ✅ | Yes |
| Timeline | ✅ | Yes |
| Case | ✅ | Partial |
| Guidance | ✅ | Partial |
| EURegulation/EUDirective | ✅ | Minimal |
| ProfileTag | ✅ | Yes |
| Update/ChangeEvent | ✅ | Minimal |
| Concept | ✅ | Partial |
| Label | ✅ | Partial |
| **Obligation** | ✅ Complete | Yes |
| **Threshold** | ✅ Complete | Yes |
| **Rate** | ✅ Complete | Yes |
| **Form** | ✅ Complete | Yes |
| **PRSIClass** | ✅ Complete | Yes |
| **LifeEvent** | ✅ Complete | Yes |

### Proposed Future Additions

| Node Type | Priority | Estimated Effort |
|-----------|----------|-----------------|
| Penalty | Critical | Medium |
| LegalEntity | High | Medium |
| TaxCredit | High | Medium |
| RegulatoryBody | Medium | Low |
| AssetClass | Medium | Medium |
| MeansTest | Medium | High |
| TaxYear | Medium | Low |
| ContributionRequirement | Lower | Medium |
| IncomeType | Lower | Medium |

---

## 10. Conclusion

The completed implementation (Phases 1-5) has significantly improved the regulatory graph's capability to model:
- **Obligations** - What users must do
- **Numeric reasoning** - Thresholds, rates, calculations
- **Lifecycle events** - Event-driven guidance
- **Forms** - Compliance workflow completion
- **PRSI classification** - Irish welfare eligibility

Future enhancements should focus on:
1. **Penalties** - Completing the compliance risk picture
2. **Legal entities** - Entity-specific rule differentiation
3. **Tax credits** - Proper separation from reliefs
4. **Interaction patterns** - Stacking, reduction, and combination rules

This will transform the copilot from a "rules lookup" tool to a comprehensive "compliance planning and risk assessment" platform.
