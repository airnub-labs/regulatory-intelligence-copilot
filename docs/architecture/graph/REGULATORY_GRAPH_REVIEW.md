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
```
- id: string
- label: string
- description: string
- category: string (e.g., "FILING", "REGISTRATION", "REPORTING", "PAYMENT")
- frequency: string (e.g., "ANNUAL", "QUARTERLY", "MONTHLY", "ONE_TIME", "ONGOING")
- jurisdiction: string
- authority: string (e.g., "Revenue", "CRO", "DSP")
- created_at, updated_at
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
```
- id: string
- label: string
- value: number
- unit: string (e.g., "EUR", "WEEKS", "MONTHS", "PERCENT")
- direction: string ("ABOVE", "BELOW", "AT_OR_ABOVE", "AT_OR_BELOW")
- effective_from: localdatetime
- effective_to: localdatetime
- jurisdiction: string
- notes: string
```

**Rationale:** Enables queries like "show me all thresholds that apply to my situation" and supports timeline engine calculations involving monetary/temporal boundaries.

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
```
- id: string
- label: string
- value: number
- unit: string ("PERCENT", "EUR", "GBP")
- category: string ("STANDARD", "REDUCED", "ZERO", "EXEMPT")
- effective_from: localdatetime
- effective_to: localdatetime
- jurisdiction: string
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
