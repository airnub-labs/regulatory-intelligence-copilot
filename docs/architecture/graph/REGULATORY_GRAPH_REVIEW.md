# Regulatory Graph Review: Gap Analysis and Proposals

**Date:** 2025-12-28
**Status:** Review Document
**Scope:** Analysis of current schema v0.6 with gap identification and high-value proposals

---

## Executive Summary

This document provides a comprehensive review of the regulatory graph schema, identifying gaps in concept types (node labels), relationship types, and domain coverage. It proposes high-value additions that would enhance the system's ability to model complex regulatory scenarios.

The current schema (v0.6) provides a solid foundation with 19 node labels and 40+ relationship types, covering tax, social welfare, pensions, and cross-border coordination. However, several important regulatory concepts are missing or underrepresented.

---

## 1. Current Schema Overview

### 1.1 Existing Node Labels (19)

| Category | Labels |
|----------|--------|
| **Jurisdictional** | `Jurisdiction`, `Region` |
| **Legislative** | `Statute`, `Section` |
| **Benefits & Reliefs** | `Benefit`, `Relief`, `Condition` |
| **Temporal** | `Timeline` |
| **Cross-border** | `Agreement`, `Treaty`, `Regime` |
| **EU Instruments** | `EURegulation`, `EUDirective` |
| **Administrative** | `Guidance`, `Case`, `ProfileTag` |
| **Change Tracking** | `Update`, `ChangeEvent` |
| **SKOS Concepts** | `Concept`, `Label` |
| **Algorithm Support** | `Community` |

### 1.2 Existing Relationship Types (40+)

**Structural:** `PART_OF`, `SUBSECTION_OF`, `IN_JURISDICTION`, `CONTAINS`

**Applicability:** `APPLIES_TO`, `APPLIES_TO_PROFILE`, `APPLIES_IN`, `APPLIES_BETWEEN`

**Cross-references:** `CITES`, `REFERENCES`, `INTERPRETS`, `ALIGNS_WITH`, `DERIVED_FROM`

**Eligibility:** `REQUIRES`, `LIMITED_BY`, `HAS_ALT_LABEL`

**Exclusions:** `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`

**Timeline:** `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`

**Cross-border:** `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`

**Change Impact:** `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`, `AMENDED_BY`

**Governance:** `PART_OF_REGIME`, `SUBJECT_TO_REGIME`, `AVAILABLE_VIA_REGIME`, `ESTABLISHES_REGIME`, `OVERRIDES`, `HAS_SOURCE`, `PARTY_TO`

---

## 2. Gap Analysis: Missing Node Types

### 2.1 HIGH PRIORITY - Obligations & Duties

**Gap:** The current schema focuses heavily on benefits and reliefs but lacks explicit representation of **obligations** and **duties**.

**Missing Nodes:**

| Label | Purpose | Example |
|-------|---------|---------|
| `:Obligation` | Mandatory compliance requirement | "File annual CT1 return", "Register for VAT if threshold exceeded" |
| `:Duty` | Ongoing responsibility | "Director's duty to maintain proper books", "Employer PAYE obligations" |

**Rationale:** Most regulatory questions involve understanding what users **must** do, not just what they can claim. Obligations are the mirror image of benefits in regulatory modelling.

**Proposed Properties for `:Obligation`:**
```typescript
interface Obligation {
  id: string;                    // e.g., "IE_PAYE_FILING_OBLIGATION"
  name: string;                  // "PAYE Filing Requirement"
  label: string;                 // Short display label
  description: string;           // Detailed description
  category: string;              // "FILING" | "REGISTRATION" | "REPORTING" | "PAYMENT" | "RECORD_KEEPING"
  frequency?: string;            // "MONTHLY" | "QUARTERLY" | "ANNUAL" | "EVENT_TRIGGERED" | "ONGOING"
  penalty_type?: string;         // "FIXED" | "PERCENTAGE" | "INTEREST" | "CRIMINAL"
  jurisdictionCode: string;      // "IE", "UK", etc.
  authority?: string;            // "Revenue", "CRO", "DSP"
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Key Relationships for `:Obligation`:**
```cypher
(:ProfileTag)-[:SUBJECT_TO]->(:Obligation)
(:Obligation)-[:FILING_DEADLINE]->(:Timeline)
(:Benefit|Relief)-[:TRIGGERS_OBLIGATION]->(:Obligation)
(:Obligation)-[:PENALIZED_BY]->(:Penalty)
(:Obligation)-[:IN_JURISDICTION]->(:Jurisdiction)
(:Obligation)-[:ADMINISTERED_BY]->(:Authority)
```

---

### 2.2 HIGH PRIORITY - Thresholds & Limits

**Gap:** Conditions exist but don't explicitly model quantitative thresholds. Many regulatory rules pivot on crossing specific values.

**Missing Nodes:**

| Label | Purpose | Example |
|-------|---------|---------|
| `:Threshold` | Quantitative trigger point | VAT registration threshold (€40,000 services), PRSI contribution threshold |
| `:Limit` | Maximum/minimum constraint | Pension contribution limits, R&D credit caps |

**Proposed Properties for `:Threshold`:**
```typescript
interface Threshold {
  id: string;                    // e.g., "IE_VAT_REGISTRATION_THRESHOLD_SERVICES"
  name: string;                  // "VAT Registration Threshold (Services)"
  label: string;                 // Short display label
  value: number;                 // 37500
  currency?: string;             // "EUR" | "GBP" | null for non-monetary
  unit: string;                  // "EUR" | "WEEKS" | "MONTHS" | "PERCENT" | "COUNT"
  period?: string;               // "ANNUAL" | "LIFETIME" | "PER_TRANSACTION" | "ROLLING_12_MONTHS"
  direction: string;             // "ABOVE" | "BELOW" | "AT_OR_ABOVE" | "AT_OR_BELOW"
  inflation_indexed?: boolean;   // true if adjusted for inflation
  effective_from?: localdatetime;
  effective_to?: localdatetime;
  jurisdictionCode: string;
  notes?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Key Relationships for `:Threshold`:**
```cypher
(:Condition)-[:HAS_THRESHOLD]->(:Threshold)
(:Threshold)-[:TRIGGERS]->(:Obligation)              // Crossing threshold triggers obligation
(:Threshold)-[:EQUIVALENT_TO]->(:Threshold)          // Cross-jurisdiction comparison
(:Update|ChangeEvent)-[:CHANGES]->(:Threshold)       // Track threshold changes
(:Threshold)-[:SUPERSEDES]->(:Threshold)             // Historical chain
```

**Rationale:** Enables queries like "show me all thresholds that apply to my situation" and supports timeline engine calculations involving monetary/temporal boundaries. Critical for cross-jurisdiction comparisons ("What's the VAT threshold in IE vs UK?").

---

### 2.3 HIGH PRIORITY - Rates

**Gap:** Tax rates and benefit rates are currently embedded in properties or text. Explicit rate nodes would enable:
- Cross-jurisdiction rate comparisons
- Historical rate tracking
- Rate band modelling

**Missing Nodes:**

| Label | Purpose | Example |
|-------|---------|---------|
| `:Rate` | Generic rate value | Standard VAT rate 23%, Reduced rate 13.5% |
| `:RateBand` | Income/value bands with rates | Income tax bands (20%, 40%), CGT rates |

**Proposed Properties for `:Rate`:**
```typescript
interface Rate {
  id: string;                    // e.g., "IE_PRSI_CLASS_S_RATE_2024"
  name: string;                  // "Class S PRSI Rate"
  label: string;                 // Short display label
  percentage?: number;           // 4.0 (for percentage rates)
  fixed_amount?: number;         // For fixed-amount rates
  currency?: string;             // "EUR" | "GBP"
  base?: string;                 // "GROSS_INCOME" | "TAXABLE_INCOME" | "CAPITAL_GAIN" | "TURNOVER"
  category: string;              // "STANDARD" | "REDUCED" | "ZERO" | "EXEMPT" | "HIGHER"
  min_threshold?: number;        // Minimum income/value for rate to apply
  max_threshold?: number;        // Maximum income/value (for band rates)
  effective_from?: localdatetime;
  effective_to?: localdatetime;
  jurisdictionCode: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Key Relationships for `:Rate`:**
```cypher
(:Benefit|Relief|Obligation)-[:HAS_RATE]->(:Rate)
(:Contribution)-[:HAS_RATE]->(:Rate)
(:Rate)-[:SUPERSEDES]->(:Rate)                       // Rate history chain
(:Rate)-[:EQUIVALENT_TO]->(:Rate)                    // Cross-jurisdiction comparison
(:Rate)-[:APPLIES_IN_BAND]->(:RateBand)              // For progressive rate systems
```

---

### 2.4 MEDIUM PRIORITY - Administrative Nodes

**Gap:** Administrative entities like forms, authorities, and penalties are referenced in text but not modelled as first-class nodes.

**Missing Nodes:**

| Label | Purpose | Example |
|-------|---------|---------|
| `:Form` | Required administrative form | Form 11, CT1, Form A1 (EU), P35 |
| `:Authority` | Regulatory body | Revenue Commissioners, DSP, Pensions Authority, CRO |
| `:Penalty` | Non-compliance consequence | Late filing surcharge, interest on unpaid tax |
| `:Exemption` | Specific exemption from obligation | Artist exemption, small company audit exemption |

**Proposed Properties for `:Form`:**
```
- id: string
- name: string
- code: string (e.g., "CT1", "FORM_11")
- purpose: string
- filing_frequency: string
- authority: string
- source_url: string
- jurisdiction: string
```

**Proposed Properties for `:Authority`:**
```
- id: string
- name: string
- abbreviation: string (e.g., "DSP", "CRO")
- jurisdiction: string
- domain: string (e.g., "TAX", "SOCIAL_WELFARE", "COMPANIES")
- website_url: string
```

**Proposed Properties for `:Penalty`:**
```
- id: string
- label: string
- type: string ("SURCHARGE", "INTEREST", "FINE", "PROSECUTION")
- calculation_basis: string
- max_amount: number
- jurisdiction: string
```

---

### 2.5 MEDIUM PRIORITY - Tax-Specific Nodes

**Gap:** Tax reliefs are modelled, but related concepts need explicit representation.

**Missing Nodes:**

| Label | Purpose | Example |
|-------|---------|---------|
| `:Deduction` | Pre-tax deduction | Pension contribution deduction, trade deduction |
| `:Allowance` | Tax-free allowance | Personal tax credit, age credit, incapacitated child credit |
| `:Credit` | Post-tax credit (distinct from Relief) | PAYE credit, single person credit |

**Rationale:** Irish tax system distinguishes between deductions (reduce taxable income), reliefs (various mechanisms), and credits (reduce tax payable). Explicit modelling supports accurate calculation flows.

---

### 2.6 LOW PRIORITY - Future Expansion Nodes

| Label | Purpose | Use Case |
|-------|---------|----------|
| `:License` | Required license/permit | PSC license, bookmaker license |
| `:Registration` | Required registration | Employer registration, VAT registration |
| `:Return` | Periodic filing requirement | Annual return, VAT3, VIES |
| `:Ruling` | Tax ruling / advance opinion | Revenue opinions, comfort letters |

---

## 3. Gap Analysis: Missing Relationship Types

### 3.1 HIGH PRIORITY - Lifecycle Relationships

**Gap:** No explicit modelling of how rules evolve over time beyond `AMENDED_BY`.

| Relationship | Purpose | Example |
|--------------|---------|---------|
| `SUPERSEDES` | Replaces previous rule | Finance Act 2024 Section X supersedes TCA 1997 Section Y |
| `REPLACED_BY` | Inverse of SUPERSEDES | Older section replaced by newer |
| `REPEALED_BY` | Complete abolition | Section repealed by statute |
| `CONSOLIDATED_INTO` | Consolidation acts | Multiple sections into one |

---

### 3.2 HIGH PRIORITY - Causal Relationships

**Gap:** The graph shows what rules exist but not what **triggers** them or what they **result in**.

| Relationship | Purpose | Example |
|--------------|---------|---------|
| `TRIGGERS` | Event causes obligation | Exceeding VAT threshold TRIGGERS registration obligation |
| `RESULTS_IN` | Action leads to outcome | Making taxable supply RESULTS_IN VAT liability |
| `QUALIFIES_FOR` | Meeting conditions enables benefit | 52 weeks contributions QUALIFIES_FOR Jobseeker's Benefit |
| `DISQUALIFIES_FROM` | Event removes eligibility | Earning above threshold DISQUALIFIES_FROM benefit |
| `WAIVES` | Condition can be waived | Minister WAIVES contribution requirement |

---

### 3.3 MEDIUM PRIORITY - Administrative Relationships

| Relationship | Purpose | Example |
|--------------|---------|---------|
| `ADMINISTERED_BY` | Authority responsible | PAYE ADMINISTERED_BY Revenue |
| `DOCUMENTED_VIA` | Required form | CT obligation DOCUMENTED_VIA Form CT1 |
| `APPEALS_TO` | Appeal hierarchy | TAC decision APPEALS_TO High Court |
| `ENFORCED_BY` | Enforcement authority | DSP benefit ENFORCED_BY Social Welfare Inspector |
| `PENALIZED_BY` | Penalty for breach | Late filing PENALIZED_BY 5% surcharge |

---

### 3.4 MEDIUM PRIORITY - Calculation Relationships

| Relationship | Purpose | Example |
|--------------|---------|---------|
| `CALCULATED_FROM` | Value derived from another | Benefit amount CALCULATED_FROM average weekly earnings |
| `INDEXED_TO` | Inflation/CPI adjustment | Pension INDEXED_TO CPI |
| `CAPPED_BY` | Maximum limit applies | R&D credit CAPPED_BY 25% of corporation tax |
| `REDUCED_BY` | Reduction calculation | Benefit REDUCED_BY means test |
| `INCREASED_BY` | Increase calculation | Rate INCREASED_BY dependent supplement |

---

### 3.5 MEDIUM PRIORITY - Anti-Avoidance & Interaction

| Relationship | Purpose | Example |
|--------------|---------|---------|
| `ANTI_AVOIDANCE_FOR` | Targets specific schemes | Section 811 ANTI_AVOIDANCE_FOR tax schemes |
| `COUNTERACTS` | Designed to prevent abuse | Close company surcharge COUNTERACTS income retention |
| `INTERACTS_WITH` | Complex interaction | CGT loss relief INTERACTS_WITH income tax loss relief |
| `STACKS_WITH` | Benefits can combine | Child benefit STACKS_WITH working family payment |

---

### 3.6 LOW PRIORITY - Enhanced Timeline Relationships

| Relationship | Purpose | Example |
|--------------|---------|---------|
| `EXTENDED_BY` | Deadline extension | Filing deadline EXTENDED_BY 2 months |
| `DEFERRED_UNTIL` | Postponement | Liability DEFERRED_UNTIL sale of asset |
| `ACCELERATED_BY` | Earlier than normal | Payment ACCELERATED_BY large case status |
| `GRANDFATHERED_FOR` | Transitional protection | Old rules GRANDFATHERED_FOR existing participants |

---

## 4. Gap Analysis: Timeline Kind Gaps

**Current Timeline kinds:** `LOOKBACK`, `LOCK_IN`, `DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`, `OTHER`

**Missing Timeline kinds:**

| Kind | Purpose | Example |
|------|---------|---------|
| `GRACE_PERIOD` | Time after deadline before penalty | 14-day grace period for late filing |
| `APPEAL_WINDOW` | Time to appeal decision | 30 days to appeal TAC determination |
| `TRANSITION_PERIOD` | Changeover between old/new rules | 12-month transition for new PRSI class |
| `RENEWAL_PERIOD` | Time before expiry to renew | PSC license renewal window |
| `WAITING_PERIOD` | Time before benefit activates | 3-day waiting period for illness benefit |
| `VESTING_PERIOD` | Time before rights vest | 2-year vesting for share options |
| `CARRYFORWARD_PERIOD` | Time to use losses/credits | 4-year carryforward for unused credits |
| `CARRYBACK_PERIOD` | Time to apply to prior periods | 1-year carryback for trading losses |

---

## 5. Gap Analysis: Domain Coverage

### 5.1 Well-Covered Domains

- Tax (Income, Corporation, CGT, VAT)
- Social Welfare Benefits
- Pensions (Contributory)
- Cross-border Coordination (CTA, EU)

### 5.2 Underrepresented Domains

| Domain | Gap Level | Key Missing Concepts |
|--------|-----------|---------------------|
| **Employment Law** | HIGH | Notice periods, unfair dismissal, redundancy, TUPE, working time |
| **Company Law** | HIGH | Directors' duties, annual returns, company formations, share capital |
| **Property/Stamp Duty** | MEDIUM | Stamp duty rates, exemptions, anti-avoidance |
| **Inheritance/Gift Tax (CAT)** | MEDIUM | Group thresholds, agricultural relief, business relief |
| **AML/CFT** | MEDIUM | Customer due diligence, reporting obligations, designated persons |
| **Data Protection (GDPR)** | MEDIUM | Lawful bases, data subject rights, breach notification |
| **Health & Safety** | LOW | Safety statements, risk assessments, reporting obligations |
| **Environmental** | LOW | Waste licensing, emissions permits, environmental levies |

---

## 6. Gap Analysis: ProfileTag Coverage

### 6.1 Current Implied Profiles

Based on code analysis:
- `self-employed`
- `single-director`
- `paye-employee`
- `investor`
- `advisor`

### 6.2 Missing Profile Segments

| Profile | Priority | Use Cases |
|---------|----------|-----------|
| `non-resident` | HIGH | Non-resident directors, investors, landlords |
| `foreign-national` | HIGH | Immigration status effects on entitlements |
| `pensioner` | HIGH | State pension, occupational pension interactions |
| `landlord` | HIGH | Rental income, LPT, tenant deposit scheme |
| `employer` | HIGH | PAYE obligations, PRSI employer contributions |
| `company` | HIGH | Corporate entity (distinct from director) |
| `trust` | MEDIUM | Discretionary trusts, fixed trusts |
| `partnership` | MEDIUM | Partnership income, precedent partner |
| `charity` | MEDIUM | Charitable exemptions, CHY number |
| `farmer` | MEDIUM | Agricultural reliefs, income averaging |
| `cross-border-worker` | MEDIUM | CTA, EU coordination, A1 certificates |
| `artist` | LOW | Artists' exemption |
| `seafarer` | LOW | Seafarer's allowance, special PRSI |

### 6.3 Life Event Profiles

| Profile | Priority | Use Cases |
|---------|----------|-----------|
| `retiring` | HIGH | Pension access, ARF decisions, exit strategies |
| `emigrating` | HIGH | Departure procedures, continued entitlements |
| `returning` | HIGH | Re-establishment of residence, PRSI credits |
| `inheriting` | HIGH | CAT thresholds, reliefs, obligations |
| `separating` | MEDIUM | Division of assets, maintenance, pension splitting |
| `becoming-parent` | MEDIUM | Maternity/paternity benefits, child benefit |
| `becoming-incapacitated` | MEDIUM | Invalidity, carer's allowance |

---

## 7. Proposed Schema Changes

### 7.1 Phase 1 - High Priority Additions

**New Node Labels:**
1. `:Obligation` - Mandatory compliance requirements
2. `:Threshold` - Quantitative trigger points
3. `:Rate` - Tax and benefit rates
4. `:Authority` - Regulatory bodies

**New Relationship Types:**
1. `TRIGGERS` - Causal activation
2. `SUPERSEDES` / `REPLACED_BY` - Lifecycle
3. `QUALIFIES_FOR` / `DISQUALIFIES_FROM` - Eligibility causation
4. `ADMINISTERED_BY` - Authority links
5. `PENALIZED_BY` - Penalty links

**New Timeline Kinds:**
1. `GRACE_PERIOD`
2. `APPEAL_WINDOW`
3. `WAITING_PERIOD`

### 7.2 Phase 2 - Medium Priority Additions

**New Node Labels:**
1. `:Form` - Administrative forms
2. `:Penalty` - Non-compliance consequences
3. `:Exemption` - Specific exemptions
4. `:Deduction` - Tax deductions
5. `:Allowance` - Tax-free amounts

**New Relationship Types:**
1. `DOCUMENTED_VIA` - Form links
2. `CALCULATED_FROM` - Derivation
3. `CAPPED_BY` / `REDUCED_BY` / `INCREASED_BY` - Calculation modifiers
4. `ANTI_AVOIDANCE_FOR` - Anti-avoidance targeting
5. `STACKS_WITH` / `INTERACTS_WITH` - Combination rules

### 7.3 Phase 3 - Domain Expansion

1. Add Employment Law nodes and relationships
2. Add Company Law nodes and relationships
3. Expand ProfileTag coverage
4. Add CAT/Property concepts

---

## 8. Implementation Considerations

### 8.1 Graph Ingress Guard Updates

Each new node label requires:
1. Addition to `allowedNodeLabels` in `graphIngressGuard.ts`
2. Property whitelist definition in `nodePropertyWhitelist`
3. Test coverage in `graphIngressGuard.test.ts`

Each new relationship type requires:
1. Addition to `allowedRelTypes` in `graphIngressGuard.ts`
2. Test coverage

### 8.2 GraphWriteService Updates

For each new node type:
1. Add DTO interface (e.g., `UpsertObligationDTO`)
2. Add upsert method (e.g., `upsertObligation()`)
3. Add validation logic

### 8.3 Type Updates

Update `GraphNode.type` union in `types.ts` to include new labels.

### 8.4 Query Updates

Update Cypher queries in:
- `boltGraphClient.ts` - Add traversals for new relationship types
- `graphClient.ts` - Add methods for new query patterns

### 8.5 Concept Capture Updates

Update `capture_concepts` to recognize new domains and concept kinds.

---

## 9. Validation Queries

Once implemented, these queries should work:

```cypher
// Find all obligations for a given profile and jurisdiction
MATCH (p:ProfileTag {id: $profileId})
MATCH (o:Obligation)-[:APPLIES_TO]->(p)
MATCH (o)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
RETURN o

// Find what triggers an obligation
MATCH (t:Threshold)-[:TRIGGERS]->(o:Obligation)
WHERE o.id = $obligationId
RETURN t

// Find penalties for an obligation
MATCH (o:Obligation {id: $obligationId})-[:PENALIZED_BY]->(p:Penalty)
RETURN p

// Find forms required for an obligation
MATCH (o:Obligation {id: $obligationId})-[:DOCUMENTED_VIA]->(f:Form)
RETURN f

// Find supersession chain
MATCH path = (s1:Section)-[:SUPERSEDES*]->(s2:Section)
WHERE s1.id = $sectionId
RETURN path

// Find rate history for a threshold
MATCH (t:Threshold {id: $thresholdId})
OPTIONAL MATCH (t)<-[:REPLACED_BY*0..]-(older:Threshold)
RETURN t, older ORDER BY older.effective_from DESC
```

---

## 10. Summary

### 10.1 Key Gaps Identified

1. **Obligations** - The system models what you can get (benefits/reliefs) but not what you must do
2. **Thresholds/Rates** - Quantitative values are embedded in text, not queryable
3. **Administrative Context** - Forms, authorities, and penalties are mentioned but not modelled
4. **Causal Relationships** - No modelling of what triggers obligations or qualifies for benefits
5. **Lifecycle Relationships** - Limited ability to track rule evolution over time
6. **Domain Coverage** - Employment law, company law, and property largely absent

### 10.2 High-Value Quick Wins

1. Add `:Obligation` with `TRIGGERS` relationship - enables "what must I do" queries
2. Add `:Threshold` - enables threshold-based reasoning in timeline engine
3. Add `:Authority` - enables "who administers this" queries
4. Add `SUPERSEDES`/`REPLACED_BY` - enables historical tracking
5. Expand ProfileTag coverage - enables more persona-specific queries

### 10.3 Strategic Recommendations

1. **Phase 1 (Immediate):** Add Obligation, Threshold, Authority nodes and core causal relationships
2. **Phase 2 (Short-term):** Add administrative nodes (Form, Penalty) and calculation relationships
3. **Phase 3 (Medium-term):** Expand domain coverage to employment and company law
4. **Phase 4 (Long-term):** Full lifecycle modelling with comprehensive rate/threshold history

---

## 11. Cross-Cutting Enhancements (From External Review)

The following enhancements address cross-cutting concerns that would significantly improve graph quality and trustworthiness.

### 11.1 HIGH VALUE - Provenance & Evidence Tracking

**Gap:** Relationships lack systematic provenance tracking for how they were derived. The current `EQUIVALENT_TO` has a confidence property, but this isn't applied consistently.

**Proposal:** Add provenance properties to all relationships:

```typescript
interface RelationshipProvenance {
  source_type: 'LEGISLATION' | 'CASE_LAW' | 'GUIDANCE' | 'LLM_INFERRED' | 'HUMAN_VERIFIED';
  source_id?: string;        // reference to source node
  confidence: number;        // 0.0 - 1.0
  verified_by?: string;      // human verifier ID (not PII - internal role/ID only)
  verified_at?: datetime;
  extraction_method?: string; // 'MCP_TOOL' | 'MANUAL' | 'LLM_EXTRACTION'
}
```

**Priority Relationships for Provenance:**
- `EQUIVALENT_TO` (cross-jurisdiction equivalence claims)
- `EXCLUDES` / `MUTUALLY_EXCLUSIVE_WITH` (conflict claims)
- `REQUIRES` (eligibility requirements)
- `TRIGGERS` (causal claims)

**Rationale:** This enables trust-scoring of graph data. LLM-inferred relationships can be flagged for human review, while legislation-sourced relationships can be treated as authoritative.

---

### 11.2 HIGH VALUE - Temporal Versioning of Rules

**Gap:** Nodes have `effective_from`/`effective_to` but there's no explicit versioning chain showing how a rule evolved.

**Proposal:** Add `RuleVersion` pattern:

```cypher
(:Section)-[:HAS_VERSION]->(:SectionVersion {
  version: int,
  effective_from: datetime,
  effective_to: datetime,
  content_hash: string,
  change_summary: string
})

(:SectionVersion)-[:PREVIOUS_VERSION]->(:SectionVersion)
```

**Alternative (simpler):** Add `SUPERSEDES` chains between versioned section nodes:

```cypher
(:Section {id: 'IE_TCA_1997_s766_v2'})-[:SUPERSEDES]->(:Section {id: 'IE_TCA_1997_s766_v1'})
```

**Use Case:** "Show me how R&D credit rules changed from 2020 to 2024" / "What was the threshold before this Finance Act?"

---

### 11.3 MEDIUM VALUE - Confidence/Uncertainty Modelling

**Gap:** No explicit modelling of uncertainty in rule interpretation.

**Proposal:** Add `uncertainty_level` property to applicable nodes:

| Level | Meaning | Example |
|-------|---------|---------|
| `SETTLED` | Clear law, no dispute | Standard VAT rate |
| `GUIDANCE_BASED` | Relies on non-binding guidance | Revenue eBrief interpretation |
| `CASE_PENDING` | Active litigation on point | Pending TAC appeal |
| `UNSETTLED` | Conflicting interpretations | Novel cross-border scenario |
| `EVOLVING` | Expected legislative change | Budget announcement |

**Properties:**
```
- uncertainty_level: string
- uncertainty_notes: string
- last_assessed_at: datetime
```

**Rationale:** Enables agents to caveat responses appropriately. "Note: this interpretation is based on Revenue guidance; case law is pending."

---

### 11.4 MEDIUM VALUE - Contribution Nodes

**Gap:** PRSI contributions, pension contributions are implicit in conditions but not explicitly modelled.

**Missing Node: `:Contribution`**

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | e.g., `IE_PRSI_CLASS_S_CONTRIBUTION` |
| `name` | string | "Class S PRSI Contribution" |
| `contribution_type` | string | `MANDATORY` / `VOLUNTARY` / `CREDITED` |
| `category` | string | `PRSI` / `PENSION` / `LEVY` |
| `jurisdiction` | string | |

**Relationships:**
```cypher
(:ProfileTag)-[:PAYS]->(:Contribution)
(:Benefit)-[:REQUIRES_CONTRIBUTIONS]->(:Contribution)
(:Contribution)-[:HAS_RATE]->(:Rate)
(:Contribution)-[:LOOKBACK_WINDOW]->(:Timeline)
(:Contribution)-[:COUNTS_TOWARDS]->(:Condition)
```

**Use Case:** "How many Class S contributions do I need for Jobseeker's Benefit?" / "Do my voluntary contributions count towards state pension?"

---

### 11.5 MEDIUM VALUE - Disqualification Nodes

**Gap:** Distinct from Penalty - represents being barred from roles, benefits, or activities.

**Missing Node: `:Disqualification`**

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | e.g., `IE_DIRECTOR_DISQUALIFICATION` |
| `name` | string | "Company Director Disqualification" |
| `category` | string | `OFFICE_HOLDER` / `BENEFIT` / `RELIEF` / `LICENSE` |
| `duration_min` | number | Minimum period in months |
| `duration_max` | number | Maximum period in months |

**Relationships:**
```cypher
(:Section|Statute)-[:CAN_TRIGGER]->(:Disqualification)
(:Disqualification)-[:DISQUALIFIES_FROM]->(:Benefit|Relief|ProfileTag)
(:Disqualification)-[:DURATION]->(:Timeline)
```

**Use Case:** "What could disqualify me from being a company director?" / "If I'm disqualified, what benefits am I excluded from?"

---

### 11.6 LOW VALUE - Scenario Templates

**Gap:** No graph structure to persist reusable scenario templates for common fact patterns.

**Missing Node: `:ScenarioTemplate`**

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | e.g., `SCENARIO_DIRECTOR_RELOCATING_TO_MALTA` |
| `name` | string | "Irish Director Relocating to Malta" |
| `profile_constraints` | json | Profile requirements for scenario |
| `decision_points` | string[] | Key decisions in scenario |
| `common_questions` | string[] | Frequently asked in this scenario |

**Relationships:**
```cypher
(:ScenarioTemplate)-[:INVOLVES]->(:Benefit|Relief|Obligation)
(:ScenarioTemplate)-[:DECISION_POINT]->(:Section)
(:ScenarioTemplate)-[:APPLIES_TO_PROFILE]->(:ProfileTag)
```

**Rationale:** Enables "smart" scenario suggestions when user profile matches template. Supports Scenario Engine integration.

---

### 11.7 Additional Relationship Types from External Review

| Relationship | Priority | Purpose |
|--------------|----------|---------|
| `UNLOCKS` | HIGH | One benefit/relief unlocks eligibility for another |
| `COUNTS_TOWARDS` | HIGH | Contributions count towards eligibility condition |
| `SATISFIES` | MEDIUM | Action/condition satisfies requirement |
| `OFFSETS` | MEDIUM | One relief offsets an obligation |
| `GRANDFATHERED_BY` | MEDIUM | Transitional rule protects existing cohort |

**`UNLOCKS` Example:**
```cypher
(:Benefit {id: 'IE_ILLNESS_BENEFIT'})-[:UNLOCKS { condition: 'After 6 months' }]->(:Benefit {id: 'IE_INVALIDITY_PENSION'})
```

**`COUNTS_TOWARDS` Example:**
```cypher
(:Contribution {id: 'IE_PRSI_CLASS_S'})-[:COUNTS_TOWARDS]->(:Condition {id: 'IE_52_CONTRIBUTIONS_REQUIREMENT'})
```

---

### 11.8 Pensions Domain Expansion

**Gap:** Pensions are minimally modelled. A dedicated pension sub-schema is needed.

**Additional Pension Nodes:**

| Label | Purpose |
|-------|---------|
| `:PensionScheme` | Occupational pension, Personal pension, PRSA, State pension |
| `:PensionBenefit` | Lump sum, annuity, ARF drawdown |
| `:LifetimeAllowance` | Maximum pension pot (UK concept, may apply to some Irish schemes) |
| `:AnnualAllowance` | Maximum annual contribution |
| `:RetirementAge` | Normal retirement age, early retirement, state pension age |

**Key Pension Relationships:**
```cypher
(:PensionScheme)-[:TAX_TREATMENT]->(:Relief)
(:PensionScheme)-[:VESTING_PERIOD]->(:Timeline)
(:PensionScheme)-[:TRANSFERS_TO]->(:PensionScheme)
(:PensionScheme)-[:CONTRIBUTION_LIMIT]->(:Limit)
(:ProfileTag)-[:MEMBER_OF]->(:PensionScheme)
```

---

## 12. Updated Priority Summary

Incorporating insights from external review:

### Tier 1 - Immediate High Value

| Addition | Type | Impact |
|----------|------|--------|
| `:Obligation` | Node | Critical for "what must I do" queries |
| `:Threshold` | Node | Enables cross-jurisdiction comparisons |
| `:Rate` | Node | Essential for tax planning queries |
| `SUPERSEDES` | Relationship | Tracks regulatory evolution |
| `TRIGGERS` / `UNLOCKS` | Relationship | Models cascading eligibility |
| `STACKS_WITH` | Relationship | Complement to mutual exclusions |
| **Provenance on relationships** | Enhancement | **Trust & explainability** |
| **Temporal versioning** | Enhancement | **Historical queries** |

### Tier 2 - Medium Value Additions

| Addition | Type | Impact |
|----------|------|--------|
| `:Form` | Node | Practical action guidance |
| `:Authority` | Node | Better guidance attribution |
| `:Contribution` | Node | PRSI/pension modelling |
| `:Disqualification` | Node | Non-compliance consequences |
| `COUNTS_TOWARDS` | Relationship | Contribution counting |
| Pension domain expansion | Domain | Major user need |
| Confidence/uncertainty modelling | Enhancement | Risk-aware responses |

### Tier 3 - Future Considerations

| Addition | Type | Impact |
|----------|------|--------|
| `:ScenarioTemplate` | Node | Scenario Engine support |
| Employment law domain | Domain | Broader coverage |
| Company law domain | Domain | Director-focused coverage |
| Property domain | Domain | Common user questions |

---

## 13. Project Vision Alignment Analysis

This section validates each proposed enhancement against the project's core vision and architectural principles.

### 13.1 Core Project Vision (from architecture review)

The Regulatory Intelligence Copilot is a **chat-first, graph-backed research partner** with these key principles:

1. **Explicit semantic edges are the source of truth** - The LLM cannot hallucinate regulatory interactions; it explains what the graph explicitly represents
2. **Path-based queries are primary** - Core behavior uses bounded multi-hop traversals (2-4 hops), not free-form inference
3. **Profile-based filtering via ProfileTag** - Personas filter rules without storing user PII in the graph
4. **Timeline as first-class abstraction** - Time-based constraints are explicit and queryable by the Timeline Engine
5. **Self-population via concept capture** - Conversations enrich the graph through SKOS-style concept nodes
6. **LLM as explanation layer** - The graph provides structure; LLM explains in plain language with evidence
7. **Research, not advice** - Frame outputs as evidence-linked explanations, direct users to professionals
8. **Cross-border by design** - Jurisdictions, Regions, Agreements, and Regimes explicitly model coordination

### 13.2 Validation Matrix

| Proposed Enhancement | Explicit Edges | Multi-Hop | Profile Filter | Timeline | Self-Pop | Cross-Border | Verdict |
|---------------------|----------------|-----------|----------------|----------|----------|--------------|---------|
| `:Obligation` | ✅ SUBJECT_TO, TRIGGERS | ✅ Profile→Obligation→Penalty | ✅ Via ProfileTag | ✅ FILING_DEADLINE | ✅ Concept can align | ✅ IN_JURISDICTION | **HIGH VALUE** |
| `:Threshold` | ✅ HAS_THRESHOLD, TRIGGERS | ✅ Condition→Threshold→Obligation | ❌ Indirect | ✅ EFFECTIVE_FROM/TO | ✅ | ✅ EQUIVALENT_TO | **HIGH VALUE** |
| `:Rate` | ✅ HAS_RATE, SUPERSEDES | ✅ Benefit→Rate→History | ❌ Indirect | ✅ EFFECTIVE_FROM/TO | ✅ | ✅ EQUIVALENT_TO | **HIGH VALUE** |
| `:Authority` | ✅ ADMINISTERED_BY | ✅ Obligation→Authority→Jurisdiction | ❌ | ❌ | ✅ | ✅ | **MEDIUM VALUE** |
| `:Form` | ✅ DOCUMENTED_VIA | ✅ Obligation→Form→Authority | ❌ | ✅ FILING_DEADLINE | ✅ | ✅ | **MEDIUM VALUE** |
| `:Penalty` | ✅ PENALIZED_BY | ✅ Obligation→Penalty→Timeline | ❌ | ✅ Duration/Grace | ✅ | ✅ | **MEDIUM VALUE** |
| `:Contribution` | ✅ PAYS, COUNTS_TOWARDS | ✅ Profile→Contribution→Benefit | ✅ Direct via PAYS | ✅ LOOKBACK_WINDOW | ✅ | ✅ COORDINATED_WITH | **HIGH VALUE** |
| `TRIGGERS` | ✅ Core causal | ✅ Enables reasoning chains | ✅ | ✅ | ✅ | ✅ | **HIGH VALUE** |
| `UNLOCKS` | ✅ Cascading eligibility | ✅ Benefit→Benefit chains | ✅ | ✅ Conditional timing | ✅ | ✅ | **HIGH VALUE** |
| `SUPERSEDES` | ✅ Lifecycle | ✅ Historical chains | ❌ | ✅ Temporal | ✅ | ✅ | **HIGH VALUE** |
| `STACKS_WITH` | ✅ Complement to EXCLUDES | ✅ | ✅ | ❌ | ✅ | ✅ | **HIGH VALUE** |
| Provenance properties | ✅ Trust scoring | ✅ Filter by source | ❌ | ❌ | ✅ Source tracking | ✅ | **HIGH VALUE** |
| `:ScenarioTemplate` | ⚠️ Meta-level | ⚠️ Not traversable | ✅ | ❌ | ❌ | ⚠️ | **LOW VALUE** |
| `:Disqualification` | ✅ | ✅ | ✅ DISQUALIFIES_FROM | ✅ Duration | ✅ | ✅ | **MEDIUM VALUE** |

### 13.3 Alignment Concerns

**Fully Aligned (Proceed):**
- `:Obligation`, `:Threshold`, `:Rate`, `:Contribution` - These fill critical gaps while supporting all core principles
- `TRIGGERS`, `UNLOCKS`, `SUPERSEDES`, `STACKS_WITH` - Essential causal/lifecycle relationships for multi-hop reasoning
- Provenance properties - Enables trust-scoring without breaking edge semantics

**Mostly Aligned (Proceed with care):**
- `:Authority`, `:Form`, `:Penalty` - Administrative context is valuable but ensure edges are queryable, not just informational
- `:Disqualification` - Useful for negative eligibility chains

**Questionable Alignment (Reconsider):**
- `:ScenarioTemplate` - This is more of a **UI/orchestration concern** than a graph node. Scenarios are meant to live in Supabase per the architecture. Consider whether this belongs in the Scenario Engine code rather than Memgraph.
- `:PensionScheme`, `:LifetimeAllowance`, `:AnnualAllowance`, `:RetirementAge` - These might be better modeled as specializations of existing nodes (`:Benefit` with category, `:Threshold`, `:Condition`, `:Timeline`) rather than new labels.

---

## 14. GraphRAG Validation for Complex Reasoning

This section evaluates whether the proposed enhancements support **Microsoft GraphRAG-style** complex relationship loading for LLM reasoning.

### 14.1 GraphRAG Core Requirements

For effective GraphRAG, the graph must support:

1. **Rich semantic relationships** - Not just structural links, but meaning-bearing edges
2. **Multi-hop traversability** - Bounded depth (2-4 hops) for impact analysis
3. **Community structure** - Related nodes cluster for context loading
4. **Provenance & confidence** - Trust scoring for relationship claims
5. **Temporal awareness** - Time-based filtering and versioning
6. **Entity resolution** - Canonical identifiers for concept matching

### 14.2 Complex Query Patterns Enabled

The proposed enhancements enable these high-value query patterns:

**Pattern 1: "What must I do?" (Obligation Discovery)**
```cypher
// Find all obligations for a profile, with penalties and deadlines
MATCH (p:ProfileTag {id: $profileId})-[:SUBJECT_TO]->(o:Obligation)
MATCH (o)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
OPTIONAL MATCH (o)-[:FILING_DEADLINE]->(t:Timeline)
OPTIONAL MATCH (o)-[:PENALIZED_BY]->(pen:Penalty)
OPTIONAL MATCH (o)-[:DOCUMENTED_VIA]->(f:Form)
RETURN o, t, pen, f
```
*LLM receives: Structured list of obligations with deadlines, penalties, and forms*

**Pattern 2: Threshold-Triggered Reasoning**
```cypher
// Find what obligations are triggered by crossing thresholds
MATCH (c:Condition)-[:HAS_THRESHOLD]->(th:Threshold)
WHERE th.value <= $userValue AND th.direction = 'AT_OR_ABOVE'
MATCH (th)-[:TRIGGERS]->(o:Obligation)
MATCH (o)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
RETURN th, o, j
```
*LLM receives: "Crossing €40,000 turnover triggers VAT registration obligation"*

**Pattern 3: Cascading Eligibility (UNLOCKS chains)**
```cypher
// Find benefits unlocked by claiming a specific benefit
MATCH (b1:Benefit {id: $benefitId})-[:UNLOCKS*1..3]->(b2:Benefit)
MATCH (b2)-[:IN_JURISDICTION]->(j:Jurisdiction {id: $jurisdictionId})
OPTIONAL MATCH (b2)-[:REQUIRES]->(c:Condition)
RETURN b1, b2, c
```
*LLM receives: "Illness Benefit → unlocks → Invalidity Pension (after 12 months)"*

**Pattern 4: Cross-Jurisdiction Rate Comparison**
```cypher
// Compare rates across jurisdictions
MATCH (r1:Rate)-[:EQUIVALENT_TO]->(r2:Rate)
WHERE r1.jurisdictionCode = 'IE' AND r2.jurisdictionCode = 'UK'
OPTIONAL MATCH (r1)<-[:HAS_RATE]-(rule1)
OPTIONAL MATCH (r2)<-[:HAS_RATE]-(rule2)
RETURN r1, r2, rule1, rule2
```
*LLM receives: "IE Corporation Tax 12.5% equivalent to UK 25% (with caveats)"*

**Pattern 5: Contribution Counting for Eligibility**
```cypher
// Check if contributions satisfy benefit requirements
MATCH (p:ProfileTag {id: $profileId})-[:PAYS]->(c:Contribution)
MATCH (c)-[:COUNTS_TOWARDS]->(cond:Condition)
MATCH (b:Benefit)-[:REQUIRES]->(cond)
MATCH (c)-[:LOOKBACK_WINDOW]->(t:Timeline)
WHERE t.window_months >= 12
RETURN b, c, cond, t
```
*LLM receives: "52 Class S contributions in last 12 months satisfies Jobseeker's Benefit requirement"*

**Pattern 6: Historical Rule Evolution (SUPERSEDES chains)**
```cypher
// Trace how a rule evolved over time
MATCH path = (current:Section {id: $sectionId})-[:SUPERSEDES*0..5]->(older:Section)
OPTIONAL MATCH (older)-[:EFFECTIVE_WINDOW]->(t:Timeline)
RETURN path, collect(t) AS timelines
ORDER BY length(path) DESC
```
*LLM receives: Chronological chain of rule versions with effective dates*

**Pattern 7: Interaction Analysis (STACKS_WITH + EXCLUDES)**
```cypher
// Find what benefits can and cannot be combined
MATCH (b:Benefit {id: $benefitId})
OPTIONAL MATCH (b)-[:STACKS_WITH]->(stackable:Benefit)
OPTIONAL MATCH (b)-[:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH]->(excluded:Benefit)
RETURN b, collect(DISTINCT stackable) AS canCombine, collect(DISTINCT excluded) AS cannotCombine
```
*LLM receives: "Child Benefit STACKS_WITH Working Family Payment, EXCLUDES Jobseeker's Allowance"*

### 14.3 Community Detection Integration

The proposed nodes naturally form communities that can be detected by Leiden algorithm:

| Community Type | Anchor Nodes | High-Centrality Nodes |
|---------------|--------------|----------------------|
| **IE Tax Compliance** | `:Jurisdiction {id: 'IE'}` | CT1 Form, Corporation Tax Rate, R&D Credit |
| **Social Welfare Eligibility** | `:ProfileTag {id: 'self-employed'}` | PRSI Contributions, Jobseeker's Benefit, Illness Benefit |
| **Cross-Border Coordination** | `:Agreement {id: 'CTA'}` | CTA Mobility Rights, Social Security Coordination |
| **Pension Planning** | `:PensionScheme` nodes | Contribution Limits, Retirement Age, ARF Rules |

This enables **context-aware retrieval**: for a broad question, fetch the community summary + top-K central nodes.

### 14.4 Provenance for Trust-Weighted Reasoning

With provenance properties, the LLM can weight its explanations:

```cypher
// Get relationships with confidence scores
MATCH (b:Benefit)-[r:EXCLUDES]->(other:Benefit)
WHERE r.source_type = 'LEGISLATION' OR r.confidence > 0.8
RETURN b, r, other
ORDER BY r.confidence DESC
```

This enables responses like:
- "This exclusion is definitive (source: SWCA 2005)" vs
- "This interaction is inferred from Revenue guidance (confidence: 0.7)"

### 14.5 Multi-Regulatory-Body Reasoning

The `:Authority` and `ADMINISTERED_BY` relationships enable queries across regulatory bodies:

```cypher
// Find all obligations for a profile across different authorities
MATCH (p:ProfileTag {id: $profileId})-[:SUBJECT_TO]->(o:Obligation)
MATCH (o)-[:ADMINISTERED_BY]->(a:Authority)
RETURN a.name AS authority, collect(o.name) AS obligations
```

*LLM receives: "Revenue: [CT1 Filing, PAYE Reporting], DSP: [PRSI Contributions], CRO: [Annual Return]"*

### 14.6 Summary: GraphRAG Readiness

| Requirement | Current v0.6 | With Proposed Enhancements |
|-------------|--------------|---------------------------|
| Semantic relationships | Good (40+ types) | Excellent (60+ types with causal/lifecycle) |
| Multi-hop traversability | Good (2-4 hops) | Excellent (causal chains, eligibility cascades) |
| Community structure | Basic (optional Leiden) | Strong (natural clusters around obligations, contributions) |
| Provenance & confidence | Partial (EQUIVALENT_TO only) | Full (all critical relationships) |
| Temporal awareness | Good (Timeline nodes) | Excellent (versioning chains, historical rates) |
| Entity resolution | Good (SKOS concepts) | Good (no change needed) |
| Cross-jurisdiction | Good (EQUIVALENT_TO, COORDINATED_WITH) | Excellent (rate/threshold comparisons) |
| Profile-based reasoning | Good (ProfileTag) | Excellent (SUBJECT_TO obligations, PAYS contributions) |

**Verdict:** The proposed enhancements significantly improve GraphRAG readiness, particularly for:
1. **Causal reasoning** (TRIGGERS, UNLOCKS chains)
2. **Obligation discovery** (the biggest current gap)
3. **Historical analysis** (SUPERSEDES chains)
4. **Trust-weighted responses** (provenance properties)
5. **Cross-jurisdiction comparison** (rate/threshold equivalence)

---

## 15. Recommendations: Final Prioritization

After validation against project vision and GraphRAG requirements:

### 15.1 Tier 1 - Implement Immediately (Highest GraphRAG Value)

| Enhancement | Why It's Critical |
|-------------|-------------------|
| `:Obligation` + `SUBJECT_TO` | Fills the biggest semantic gap - "what must I do" |
| `:Threshold` + `TRIGGERS` | Enables quantitative reasoning chains |
| `:Contribution` + `COUNTS_TOWARDS` | Critical for PRSI/pension eligibility paths |
| `UNLOCKS` relationship | Enables cascading eligibility reasoning |
| `SUPERSEDES` relationship | Enables historical analysis |
| Provenance properties | Enables trust-weighted LLM responses |

### 15.2 Tier 2 - Implement Soon (Strong Value)

| Enhancement | Why It's Valuable |
|-------------|-------------------|
| `:Rate` + rate history | Cross-jurisdiction comparisons, historical rates |
| `:Authority` + `ADMINISTERED_BY` | Multi-regulatory-body reasoning |
| `STACKS_WITH` relationship | Complement to EXCLUDES for combination analysis |
| `:Form` + `DOCUMENTED_VIA` | Practical action guidance |
| `:Penalty` + `PENALIZED_BY` | Non-compliance consequences |

### 15.3 Tier 3 - Defer or Reconsider

| Enhancement | Recommendation |
|-------------|----------------|
| `:ScenarioTemplate` | **Defer** - Better suited for Scenario Engine code than graph |
| Pension sub-labels | **Reconsider** - May work better as specializations of existing labels |
| `:Disqualification` | **Defer** - Lower priority than core obligation/threshold gaps |
| Employment/Company law domains | **Defer** - Expand after core enhancements are stable |

### 15.4 Implementation Sequence

```
Phase 1 (Foundation):
  └── Add :Obligation, :Threshold, :Contribution nodes
  └── Add TRIGGERS, UNLOCKS, SUPERSEDES, COUNTS_TOWARDS relationships
  └── Add provenance properties to critical relationships
  └── Update GraphIngressGuard whitelists
  └── Update GraphWriteService with upsert methods

Phase 2 (Enrichment):
  └── Add :Rate with history chains
  └── Add :Authority with ADMINISTERED_BY
  └── Add STACKS_WITH relationship
  └── Add :Form, :Penalty administrative nodes
  └── Seed graph with example data

Phase 3 (Optimization):
  └── Validate community detection on enriched graph
  └── Test multi-hop query patterns
  └── Profile query performance
  └── Add concept capture support for new node types
```

---

## Appendix A: Comparison with Similar Systems

For reference, comparable regulatory knowledge graphs typically include:

| System | Notable Concepts We're Missing |
|--------|-------------------------------|
| EUR-Lex/ELI | Document lifecycle, consolidated versions |
| Akoma Ntoso | Document structure, temporal versioning |
| LKIF-Core | Norms, actions, agents, roles |
| Schema.org Legislation | Legislative events, amendments |

---

## Appendix B: Schema Change Checklist

For each new node type:
- [ ] Add to `allowedNodeLabels` in graphIngressGuard.ts
- [ ] Add property whitelist in graphIngressGuard.ts
- [ ] Add to `GraphNode.type` union in types.ts
- [ ] Add DTO in graphWriteService.ts
- [ ] Add upsert method in graphWriteService.ts
- [ ] Add tests in graphIngressGuard.test.ts
- [ ] Update schema_v_0_6.md (or create v0.7)
- [ ] Update seed-graph.ts with examples
- [ ] Update concept_capture_v_0_1.md if needed

For each new relationship type:
- [ ] Add to `allowedRelTypes` in graphIngressGuard.ts
- [ ] Add tests in graphIngressGuard.test.ts
- [ ] Update relevant Cypher queries
- [ ] Update schema documentation
