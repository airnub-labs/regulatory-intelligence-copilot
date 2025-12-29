# Regulatory Graph Review: Phase 6 Gap Analysis and Recommendations

> **Status:** Review Document
> **Date:** 2025-12-29
> **Reviewed Version:** Schema v0.6 (Post Phase 1-5 Implementation)
> **Purpose:** Identify remaining gaps in concept types and relationships, propose high-value additions for Phase 6+

---

## Executive Summary

With Phases 1-5 complete, the regulatory graph now includes:
- **27 node types** (including Obligation, Threshold, Rate, Form, PRSIClass, LifeEvent)
- **44+ relationship types** (including SKOS hierarchy, PRSI entitlements, life event triggers)
- **16 GraphClient methods** for querying obligations, thresholds, rates, forms, PRSI classes, and life events

However, several **high-value concept types and relationships** are still missing that would significantly enhance the system's reasoning capabilities for:
- Risk assessment and penalty calculations
- Entity-type specific rule filtering
- Complex tax credit interactions
- Sector-specific rules
- Advanced means testing and contribution requirements

This review identifies:
- **12 missing high-value concept types**
- **14 missing relationship types**
- **5 structural patterns** not yet modelled
- **Priority recommendations** for Phase 6+

---

## 1. Current Implementation Status (Phases 1-5)

### 1.1 Implemented Node Types (27)

| Phase | Node Type | Purpose |
|-------|-----------|---------|
| Core | Jurisdiction, Region, Statute, Section, Benefit, Relief, Condition, Timeline | Core regulatory structure |
| Core | ProfileTag, Case, Guidance, EURegulation, EUDirective | Personas and interpretive sources |
| Core | Update, ChangeEvent, Concept, Label, Agreement, Treaty, Regime, Community | Change tracking and classification |
| Phase 1 | **Obligation** | Compliance requirements (filing, reporting, payment) |
| Phase 2 | **Threshold** | Numeric limits and boundaries |
| Phase 2 | **Rate** | Tax rates, contribution rates, benefit rates |
| Phase 3 | **Form** | Regulatory forms and documents |
| Phase 4 | **PRSIClass** | Irish social insurance classifications |
| Phase 4 | **LifeEvent** | Life events triggering regulatory changes |

### 1.2 Implemented Relationship Types (44+)

All relationships from the original review have been implemented, including:
- Structural: `PART_OF`, `IN_JURISDICTION`, `SUBSECTION_OF`
- Eligibility: `REQUIRES`, `LIMITED_BY`, `HAS_THRESHOLD`, `LIMITED_BY_THRESHOLD`
- Exclusions: `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`
- Timelines: `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`
- Cross-border: `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`
- Obligations: `HAS_OBLIGATION`, `CREATES_OBLIGATION`, `REQUIRES_FORM`
- Rates/Thresholds: `HAS_RATE`, `SUBJECT_TO_RATE`, `CHANGES_THRESHOLD`
- SKOS: `BROADER`, `NARROWER`, `RELATED`
- PRSI: `ENTITLES_TO`, `HAS_PRSI_CLASS`, `CONTRIBUTION_RATE`
- Life Events: `TRIGGERS`, `STARTS_TIMELINE`, `ENDS_TIMELINE`, `TRIGGERED_BY`

### 1.3 Implemented GraphClient Methods (16)

```typescript
// Core queries
getRulesForProfileAndJurisdiction(profileId, jurisdictionId, keyword?)
getNeighbourhood(nodeId)
getMutualExclusions(nodeId)
getTimelines(nodeId)
getCrossBorderSlice(jurisdictionIds)

// Phase 1: Obligations
getObligationsForProfile(profileId, jurisdictionId)

// Phase 2: Numeric reasoning
getThresholdsForCondition(conditionId)
getRatesForCategory(category, jurisdictionId)
getThresholdsNearValue(value, unit, tolerancePercent)

// Phase 3: Forms & SKOS
getFormForObligation(obligationId)
getConceptHierarchy(conceptId)

// Phase 4: PRSI & Life Events
getPRSIClassById(prsiClassId)
getBenefitsForPRSIClass(prsiClassId, jurisdictionId)
getLifeEventsForNode(nodeId)
getTriggeredByLifeEvent(lifeEventId, jurisdictionId)

// Utility
executeCypher(query, params?)
```

---

## 2. Missing Concept Types (Phase 6 Candidates)

### 2.1 Tier 1: High Priority - Immediate Value

#### `:Penalty`
**Gap:** The graph models obligations but not the consequences of non-compliance.

**Rationale:**
- Late filing surcharges (CT1: 5% at 2 months, 10% at 6 months)
- Interest on late payments (0.0219% per day)
- Fixed penalties (failure to file)
- Prosecution thresholds (repeated non-compliance)
- Critical for risk assessment: "What happens if I miss this deadline?"

**Proposed Properties:**
```typescript
interface Penalty {
  id: string;           // e.g., "IE_LATE_CT1_SURCHARGE"
  label: string;        // "Late Filing Surcharge"
  penalty_type: 'SURCHARGE' | 'INTEREST' | 'FIXED' | 'PROSECUTION';
  rate?: number;        // For percentage-based penalties
  flat_amount?: number; // For fixed penalties
  currency?: string;
  max_amount?: number;
  applies_after_days?: number; // Days after deadline
  escalates?: boolean;  // Does penalty increase over time?
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:Obligation)-[:HAS_PENALTY]->(:Penalty)`
- `(:Penalty)-[:WAIVED_IF]->(:Condition)`
- `(:Penalty)-[:ESCALATES_TO]->(:Penalty)` (for tiered penalties)
- `(:Update)-[:CHANGES_PENALTY]->(:Penalty)`

**Example queries enabled:**
- "What are the penalties for late CT1 filing?"
- "How much interest would I owe on late preliminary tax?"
- "Can any penalties be waived?"

---

#### `:LegalEntity` or `:EntityType`
**Gap:** The graph models ProfileTags (personas) but not the underlying legal structures.

**Rationale:**
- Companies: LTD, PLC, DAC, unlimited
- Partnerships: general, limited (LP), limited liability (LLP)
- Sole traders
- Trusts (discretionary, bare, etc.)
- Non-profits: CLG, charities, CICs
- Different rules apply to different entity types

**Proposed Properties:**
```typescript
interface LegalEntity {
  id: string;           // e.g., "IE_ENTITY_DAC"
  label: string;        // "Designated Activity Company"
  abbreviation?: string; // "DAC"
  jurisdiction: string;
  category: 'COMPANY' | 'PARTNERSHIP' | 'SOLE_TRADER' | 'TRUST' | 'NON_PROFIT';
  sub_category?: string; // e.g., "LIMITED", "UNLIMITED", "CHARITABLE"
  can_trade?: boolean;
  can_hold_property?: boolean;
  limited_liability?: boolean;
  min_directors?: number;
  requires_audit?: boolean;
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:Section|:Relief|:Benefit|:Obligation)-[:APPLIES_TO_ENTITY]->(:LegalEntity)`
- `(:ProfileTag)-[:HAS_ENTITY_TYPE]->(:LegalEntity)`
- `(:LegalEntity)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:LegalEntity)-[:CONVERTS_TO]->(:LegalEntity)` (for entity conversions)

**Example queries enabled:**
- "What obligations apply to a DAC vs an LTD?"
- "Can a sole trader claim this relief?"
- "What are the requirements for a charitable company?"

---

#### `:TaxCredit`
**Gap:** Tax credits are conflated with reliefs but have fundamentally different mechanics.

**Rationale:**
- **Credits** reduce tax liability directly (€ for €)
  - Personal credit (€1,875)
  - Employee credit (€1,875)
  - Earned Income credit (€1,875)
  - Home Carer credit (€1,700)
- **Reliefs** reduce taxable income (indirect, rate-dependent)
- Credits can't exceed liability; reliefs can create losses
- Credits often non-transferable; some reliefs are transferable

**Proposed Properties:**
```typescript
interface TaxCredit {
  id: string;           // e.g., "IE_PERSONAL_TAX_CREDIT_2024"
  label: string;        // "Personal Tax Credit"
  amount: number;       // 1875
  currency: string;     // "EUR"
  tax_year: number;     // 2024
  refundable: boolean;  // Can excess be refunded?
  transferable: boolean; // Can it be transferred to spouse?
  partial_claim: boolean; // Can it be partially claimed?
  applies_per: 'INDIVIDUAL' | 'COUPLE' | 'HOUSEHOLD';
  category?: string;    // "PERSONAL" | "EMPLOYMENT" | "CARE" | "HOUSING"
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:TaxCredit)-[:APPLIES_TO]->(:ProfileTag)`
- `(:TaxCredit)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:TaxCredit)-[:REQUIRES]->(:Condition)`
- `(:TaxCredit)-[:STACKS_WITH]->(:TaxCredit)` (credits that combine)
- `(:TaxCredit)-[:REPLACES]->(:TaxCredit)` (year-on-year changes)
- `(:Update)-[:CHANGES_CREDIT]->(:TaxCredit)`

**Example queries enabled:**
- "What tax credits am I entitled to as a single earner?"
- "Can I transfer my employee credit to my spouse?"
- "What's the total credit value for a married couple?"

---

#### `:RegulatoryBody`
**Gap:** Regulatory authorities are mentioned in properties but not as first-class nodes.

**Rationale:**
- Ireland: Revenue, DSP, CRO, Pensions Authority, Central Bank, FSAI
- UK: HMRC, DWP, Companies House, FCA
- Enables: "Show all Revenue obligations" or "What forms does DSP require?"

**Proposed Properties:**
```typescript
interface RegulatoryBody {
  id: string;           // e.g., "IE_REVENUE"
  label: string;        // "Revenue Commissioners"
  abbreviation: string; // "Revenue"
  jurisdiction: string;
  category: 'TAX' | 'SOCIAL_WELFARE' | 'COMPANY' | 'PENSION' | 'FINANCIAL';
  website_url?: string;
  contact_url?: string;
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:Obligation|:Benefit)-[:ADMINISTERED_BY]->(:RegulatoryBody)`
- `(:Form)-[:ISSUED_BY]->(:RegulatoryBody)`
- `(:Guidance)-[:PUBLISHED_BY]->(:RegulatoryBody)`
- `(:RegulatoryBody)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:RegulatoryBody)-[:COOPERATES_WITH]->(:RegulatoryBody)` (cross-border cooperation)

**Example queries enabled:**
- "What are all my Revenue obligations?"
- "Which body administers State Pension?"
- "Show all DSP forms I might need"

---

### 2.2 Tier 2: Medium Priority - Enhanced Reasoning

#### `:AssetClass`
**Gap:** CGT and investment rules depend on asset classification not currently modelled.

**Rationale:**
- Shares (listed, unlisted, family company)
- Property (residential, commercial, agricultural, development)
- Crypto assets
- Business assets (goodwill, intellectual property)
- Different CGT rates, reliefs, and exemptions apply

**Proposed Properties:**
```typescript
interface AssetClass {
  id: string;           // e.g., "ASSET_RESIDENTIAL_PROPERTY"
  label: string;        // "Residential Property"
  category: 'SHARES' | 'PROPERTY' | 'CRYPTO' | 'BUSINESS' | 'OTHER';
  sub_category?: string; // e.g., "LISTED", "UNLISTED", "AGRICULTURAL"
  cgt_rate_category?: string; // Which CGT rate applies
  stamp_duty_applicable?: boolean;
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:Relief)-[:APPLIES_TO_ASSET]->(:AssetClass)`
- `(:Rate)-[:APPLIES_TO_ASSET]->(:AssetClass)` (CGT rates by asset)
- `(:Condition)-[:REQUIRES_ASSET_TYPE]->(:AssetClass)`
- `(:AssetClass)-[:IN_JURISDICTION]->(:Jurisdiction)`

---

#### `:Sector` or `:Industry`
**Gap:** Many rules are sector-specific but this isn't modelled.

**Rationale:**
- Construction: RCT scheme, specific PRSI rules
- Farming: Agricultural relief, income averaging, stock relief
- Film/Creative: Section 481, artist's exemption
- Financial services: Different regulatory framework
- Healthcare: Specific VAT exemptions
- Technology: R&D credits, SARP (Special Assignee Relief Programme)

**Proposed Properties:**
```typescript
interface Sector {
  id: string;           // e.g., "SECTOR_CONSTRUCTION"
  label: string;        // "Construction"
  nace_codes?: string[]; // EU NACE classification codes
  sic_codes?: string[];  // UK SIC codes
  special_regimes?: string[]; // e.g., ["RCT", "PAYE_CONSTRUCTION"]
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:Relief|:Benefit|:Obligation)-[:SECTOR_SPECIFIC]->(:Sector)`
- `(:ProfileTag)-[:OPERATES_IN]->(:Sector)`
- `(:Regime)-[:APPLIES_TO_SECTOR]->(:Sector)`

---

#### `:MeansTest`
**Gap:** Social welfare benefits often have complex means tests not currently structured.

**Rationale:**
- Assessable income (which income sources count)
- Disregards (amounts ignored in calculation)
- Taper rates (how benefits reduce as income increases)
- Capital assessment (how savings are valued)
- Household composition effects

**Proposed Properties:**
```typescript
interface MeansTest {
  id: string;           // e.g., "IE_JOBSEEKERS_ALLOWANCE_MEANS"
  label: string;        // "Jobseeker's Allowance Means Test"
  income_types_assessed: string[]; // e.g., ["EMPLOYMENT", "SELF_EMPLOYMENT", "RENTAL"]
  income_disregard?: number; // Amount of income ignored
  capital_disregard?: number; // Capital threshold before assessment
  capital_assessment_rate?: number; // How capital is converted to notional income
  taper_rate?: number;  // Rate at which benefit reduces
  household_based: boolean;
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:Benefit)-[:HAS_MEANS_TEST]->(:MeansTest)`
- `(:MeansTest)-[:HAS_THRESHOLD]->(:Threshold)`
- `(:MeansTest)-[:IN_JURISDICTION]->(:Jurisdiction)`

---

#### `:ContributionRequirement`
**Gap:** Benefit eligibility often depends on contribution history that's currently unstructured.

**Rationale:**
- "104 weeks of PRSI contributions since first starting work"
- "39 weeks paid in relevant tax year"
- "13 weeks paid in the 52 weeks before job loss"
- Complex lookback windows with specific contribution types

**Proposed Properties:**
```typescript
interface ContributionRequirement {
  id: string;           // e.g., "IE_JOBSEEKERS_BENEFIT_CONTRIB_REQ"
  label: string;        // "Jobseeker's Benefit Contribution Requirement"
  contribution_type: 'PRSI' | 'NI' | 'OTHER';
  class_required?: string[]; // e.g., ["A", "H", "P"]
  weeks_required: number;
  weeks_in_period: number;  // The lookback period in weeks
  alternative_requirements?: string; // Text describing alternatives
  description?: string;
  created_at: localdatetime;
  updated_at: localdatetime;
}
```

**Relationships to support:**
- `(:Benefit)-[:HAS_CONTRIBUTION_REQUIREMENT]->(:ContributionRequirement)`
- `(:ContributionRequirement)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:ContributionRequirement)-[:ACCEPTS_CLASS]->(:PRSIClass)`

---

### 2.3 Tier 3: Lower Priority - Future Expansion

#### `:TaxYear` or `:FiscalPeriod`
**Purpose:** Explicit temporal buckets for tax calculations.

**Value:**
- Irish tax year (1 Jan - 31 Dec)
- UK tax year (6 Apr - 5 Apr)
- Enables year-specific queries and rate lookups
- Supports split-year treatment scenarios

---

#### `:Exemption`
**Purpose:** Full exemptions distinct from partial reliefs.

**Value:**
- Artist's exemption (up to €50,000)
- Retirement relief (full CGT exemption under thresholds)
- Small benefit exemption (€1,000)
- Categorical rather than graduated

---

#### `:Document` or `:Publication`
**Purpose:** More specific than Guidance for official publications.

**Value:**
- Revenue Tax and Duty Manuals
- eBriefs (numbered, dated)
- DSP Operational Guidelines
- Links to specific PDF/web resources

---

#### `:Deduction` or `:Allowance`
**Purpose:** Distinguish from reliefs and credits.

**Value:**
- Capital allowances (wear and tear, industrial buildings)
- Trading deductions
- Different timing and calculation rules

---

## 3. Missing Relationship Types (Phase 6 Candidates)

### 3.1 Penalty & Risk Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_PENALTY` | Obligation | Penalty | Links obligation to non-compliance consequence |
| `WAIVED_IF` | Penalty | Condition | Conditions under which penalty is waived |
| `ESCALATES_TO` | Penalty | Penalty | Tiered penalty progression |
| `CHANGES_PENALTY` | Update | Penalty | Penalty amount/rule changes |

### 3.2 Entity & Sector Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `APPLIES_TO_ENTITY` | Section, Relief, Benefit, Obligation | LegalEntity | Entity-type specific rules |
| `HAS_ENTITY_TYPE` | ProfileTag | LegalEntity | Profile's underlying legal structure |
| `SECTOR_SPECIFIC` | Relief, Benefit, Obligation | Sector | Industry-specific rules |
| `OPERATES_IN` | ProfileTag | Sector | Profile's business sector |
| `ADMINISTERED_BY` | Obligation, Benefit | RegulatoryBody | Which body handles this |

### 3.3 Interaction Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `STACKS_WITH` | Benefit, Relief, TaxCredit | Benefit, Relief, TaxCredit | Can be claimed together |
| `PARTIALLY_OVERLAPS` | Benefit, Relief | Benefit, Relief | Limited combination allowed |
| `REDUCES` | Benefit, Income | Benefit | One reduces another |
| `OFFSETS_AGAINST` | TaxCredit, Relief | TaxCredit, Relief | Offsetting mechanism |
| `SUPERSEDES` | Section, Benefit, Relief | Section, Benefit, Relief | Version succession |

### 3.4 Assessment & Requirement Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_MEANS_TEST` | Benefit | MeansTest | Links benefit to means assessment |
| `HAS_CONTRIBUTION_REQUIREMENT` | Benefit | ContributionRequirement | Links benefit to contribution history |
| `APPLIES_TO_ASSET` | Relief, Rate | AssetClass | Asset-type specific rules |

---

## 4. Structural Patterns Not Yet Modelled

### 4.1 Rule Versioning and History
**Gap:** The graph stores current rules but doesn't clearly track historical versions.

**Current State:**
- `effective_from` and `effective_to` exist on some nodes
- `Update`/`ChangeEvent` nodes track changes
- But no clear versioning chain for the same rule over time

**Recommendation:**
- Ensure ALL rule nodes have `effective_from`/`effective_to` populated
- Add `SUPERSEDES` relationship for year-on-year changes
- Consider version suffix in IDs (e.g., `IE_PERSONAL_TAX_CREDIT_2024`, `IE_PERSONAL_TAX_CREDIT_2025`)

### 4.2 Requirement Levels
**Gap:** No distinction between statutory requirements and administrative practices.

**Current State:**
- Obligations don't indicate their authority level
- All rules appear equal in weight

**Recommendation:**
Add `requirement_level` property to Obligation and Section:
- `STATUTORY` - Required by law
- `REGULATORY` - Required by regulation
- `ADMINISTRATIVE` - Required by practice/guidance
- `BEST_PRACTICE` - Recommended but not required

### 4.3 Claim Windows and Back-Dating
**Gap:** When can you apply for a benefit after a life event?

**Current State:**
- LifeEvent triggers benefits/obligations
- But timing of claims not modelled

**Recommendation:**
- Add `CLAIMABLE_WITHIN` relationship from Benefit to Timeline
- Add `BACKDATABLE_BY` relationship for back-dating rules
- Properties: `max_days_before`, `max_days_after`

### 4.4 Residency Rules
**Gap:** Complex residence conditions not explicitly modelled.

**Current State:**
- Conditions can describe residence requirements
- But 183-day rule, ordinary residence, domicile not structured

**Recommendation:**
- Add `:ResidencyRule` node type or structured Condition properties
- Model: day counting, split-year treatment, deemed residence
- Link to specific statutes (TCA 1997 s.819-825)

### 4.5 Aggregation Rules
**Gap:** When values combine across household or related parties.

**Current State:**
- Means tests assume individual assessment
- No modelling of spousal aggregation, connected parties

**Recommendation:**
- Add `aggregation_basis` property: `INDIVIDUAL`, `COUPLE`, `HOUSEHOLD`, `CONNECTED_PARTIES`
- Model aggregation rules for means tests and thresholds

---

## 5. GraphClient Method Gaps

### 5.1 Proposed New Methods for Phase 6

```typescript
// Penalty queries
getPenaltiesForObligation(obligationId: string): Promise<Penalty[]>;
getPenaltyEstimate(obligationId: string, daysLate: number): Promise<PenaltyEstimate>;

// Entity-specific queries
getRulesForEntityType(entityTypeId: string, jurisdictionId: string): Promise<GraphContext>;
getEntityTypesForProfile(profileId: string): Promise<LegalEntity[]>;

// Tax credit queries
getTaxCreditsForProfile(profileId: string, jurisdictionId: string, taxYear: number): Promise<TaxCredit[]>;
getCreditInteractions(creditId: string): Promise<CreditInteraction[]>;

// Sector-specific queries
getRulesForSector(sectorId: string, jurisdictionId: string): Promise<GraphContext>;

// Regulatory body queries
getObligationsByRegulator(regulatoryBodyId: string, profileId: string): Promise<Obligation[]>;
getFormsForRegulator(regulatoryBodyId: string): Promise<Form[]>;

// Means test queries
getMeansTestForBenefit(benefitId: string): Promise<MeansTest | null>;
assessMeansTest(meansTestId: string, income: number, capital: number): Promise<MeansTestResult>;

// Contribution queries
getContributionRequirements(benefitId: string): Promise<ContributionRequirement[]>;

// Asset-based queries
getReliefsForAssetClass(assetClassId: string, jurisdictionId: string): Promise<GraphNode[]>;
getCGTRateForAsset(assetClassId: string, jurisdictionId: string): Promise<Rate | null>;

// Rule versioning
getRuleHistory(ruleId: string): Promise<GraphNode[]>;
getRuleAsOf(ruleId: string, asOfDate: Date): Promise<GraphNode | null>;
```

---

## 6. Priority Recommendations for Phase 6

### Tier 1: Immediate (1 sprint)

| # | Item | Type | Impact | Effort |
|---|------|------|--------|--------|
| 1 | `:Penalty` node type | Concept | High - Risk assessment | Medium |
| 2 | `HAS_PENALTY` relationship | Relationship | High - Compliance workflows | Low |
| 3 | `WAIVED_IF` relationship | Relationship | Medium - Penalty exemptions | Low |
| 4 | `getPenaltiesForObligation()` method | Method | High - User-facing | Medium |

### Tier 2: Near-term (1-2 sprints)

| # | Item | Type | Impact | Effort |
|---|------|------|--------|--------|
| 5 | `:LegalEntity` node type | Concept | High - Entity-specific rules | Medium |
| 6 | `APPLIES_TO_ENTITY` relationship | Relationship | High - Rule filtering | Low |
| 7 | `:TaxCredit` node type | Concept | High - Distinct from Relief | Medium |
| 8 | `STACKS_WITH` relationship | Relationship | Medium - Combination rules | Low |
| 9 | `:RegulatoryBody` node type | Concept | Medium - Regulator queries | Low |
| 10 | `ADMINISTERED_BY` relationship | Relationship | Medium - Regulator links | Low |

### Tier 3: Medium-term (2-3 sprints)

| # | Item | Type | Impact | Effort |
|---|------|------|--------|--------|
| 11 | `:AssetClass` node type | Concept | Medium - CGT reasoning | Medium |
| 12 | `:Sector` node type | Concept | Medium - Industry rules | Medium |
| 13 | `:MeansTest` node type | Concept | High for welfare - Complex | High |
| 14 | `:ContributionRequirement` node type | Concept | High for welfare - Complex | High |
| 15 | Rule versioning pattern | Structural | Medium - Historical queries | High |

---

## 7. Implementation Plan for Phase 6

### 7.1 Phase 6A: Penalties and Risk (1 sprint)

#### Task 6A.1: Add Penalty to types.ts

```typescript
/**
 * Penalty representing consequences of non-compliance
 */
export interface Penalty {
  id: string;
  label: string;
  penalty_type: 'SURCHARGE' | 'INTEREST' | 'FIXED' | 'PROSECUTION';
  rate?: number;
  flat_amount?: number;
  currency?: string;
  max_amount?: number;
  applies_after_days?: number;
  escalates?: boolean;
  description?: string;
}
```

#### Task 6A.2: Add to GraphNode.type union

```typescript
type:
  | ... // existing types
  | 'Penalty';
```

#### Task 6A.3: Add to ingress guard

**allowedNodeLabels:**
```typescript
'Penalty',
```

**allowedRelTypes:**
```typescript
'HAS_PENALTY',
'WAIVED_IF',
'ESCALATES_TO',
'CHANGES_PENALTY',
```

**nodePropertyWhitelist:**
```typescript
Penalty: [
  'id',
  'label',
  'penalty_type',
  'rate',
  'flat_amount',
  'currency',
  'max_amount',
  'applies_after_days',
  'escalates',
  'description',
  'created_at',
  'updated_at',
],
```

#### Task 6A.4: Add GraphClient methods

```typescript
/**
 * Get penalties for an obligation
 */
getPenaltiesForObligation(obligationId: string): Promise<Penalty[]>;

/**
 * Estimate penalty for late compliance
 */
getPenaltyEstimate(
  obligationId: string,
  daysLate: number
): Promise<{ penalties: Penalty[]; estimatedAmount: number; currency: string }>;
```

#### Task 6A.5: Create seed data

```cypher
// Late CT1 Filing Surcharge - First Tier
MERGE (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5_PERCENT'})
SET p.label = 'CT1 Late Filing Surcharge (5%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 5,
    p.applies_after_days = 1,
    p.max_amount = null,
    p.escalates = true,
    p.description = '5% surcharge on tax due if return filed within 2 months of deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// Late CT1 Filing Surcharge - Second Tier
MERGE (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_10_PERCENT'})
SET p.label = 'CT1 Late Filing Surcharge (10%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 10,
    p.applies_after_days = 61,
    p.max_amount = null,
    p.escalates = false,
    p.description = '10% surcharge on tax due if return filed more than 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (p1:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5_PERCENT'})
MERGE (p1)-[:ESCALATES_TO]->(p);

// Interest on Late Payment
MERGE (p:Penalty {id: 'IE_LATE_PAYMENT_INTEREST'})
SET p.label = 'Interest on Late Tax Payment',
    p.penalty_type = 'INTEREST',
    p.rate = 0.0219,
    p.applies_after_days = 1,
    p.description = 'Interest charged at 0.0219% per day (8% per annum) on late tax payments',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime();
```

---

### 7.2 Phase 6B: Legal Entities (1 sprint)

#### Task 6B.1: Add LegalEntity to types.ts

```typescript
/**
 * LegalEntity representing a type of legal structure
 */
export interface LegalEntity {
  id: string;
  label: string;
  abbreviation?: string;
  jurisdiction: string;
  category: 'COMPANY' | 'PARTNERSHIP' | 'SOLE_TRADER' | 'TRUST' | 'NON_PROFIT';
  sub_category?: string;
  can_trade?: boolean;
  limited_liability?: boolean;
  min_directors?: number;
  requires_audit?: boolean;
  description?: string;
}
```

#### Task 6B.2: Update ingress guard and types

Similar pattern to 6A.

#### Task 6B.3: Create seed data

```cypher
// Irish LTD Company
MERGE (e:LegalEntity {id: 'IE_ENTITY_LTD'})
SET e.label = 'Private Company Limited by Shares',
    e.abbreviation = 'LTD',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'LIMITED',
    e.can_trade = true,
    e.limited_liability = true,
    e.min_directors = 1,
    e.requires_audit = false,
    e.description = 'Standard Irish limited company with share capital',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Irish DAC
MERGE (e:LegalEntity {id: 'IE_ENTITY_DAC'})
SET e.label = 'Designated Activity Company',
    e.abbreviation = 'DAC',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'LIMITED',
    e.can_trade = true,
    e.limited_liability = true,
    e.min_directors = 2,
    e.requires_audit = true,
    e.description = 'Irish company with restricted objects clause',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Sole Trader
MERGE (e:LegalEntity {id: 'IE_ENTITY_SOLE_TRADER'})
SET e.label = 'Sole Trader',
    e.jurisdiction = 'IE',
    e.category = 'SOLE_TRADER',
    e.can_trade = true,
    e.limited_liability = false,
    e.description = 'Individual trading in their own name',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Link to ProfileTags
MATCH (p:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})
MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'})
MERGE (p)-[:HAS_ENTITY_TYPE]->(e);

MATCH (p:ProfileTag {id: 'PROFILE_SELF_EMPLOYED_IE'})
MATCH (e:LegalEntity {id: 'IE_ENTITY_SOLE_TRADER'})
MERGE (p)-[:HAS_ENTITY_TYPE]->(e);
```

---

### 7.3 Phase 6C: Tax Credits (1 sprint)

Implementation similar to above patterns.

---

### 7.4 Phase 6D: Regulatory Bodies (0.5 sprint)

Implementation similar to above patterns.

---

## 8. Success Metrics

After Phase 6 implementation, the system should be able to:

### 8.1 Penalty Queries
- "What are the penalties for late CT1 filing?"
- "How much interest would I owe on €10,000 preliminary tax paid 30 days late?"
- "What penalties can be waived for first-time non-compliance?"

### 8.2 Entity-Specific Queries
- "What obligations apply specifically to a DAC?"
- "Can a partnership claim R&D tax credits?"
- "What are the audit requirements for different company types?"

### 8.3 Tax Credit Queries
- "What tax credits am I entitled to as a PAYE worker?"
- "Can I transfer unused credits to my spouse?"
- "What's my total credit value for 2024?"

### 8.4 Regulator Queries
- "Show all my Revenue obligations"
- "What DSP forms do I need to claim benefits?"
- "Which body administers pension compliance?"

---

## 9. Documentation Updates Required

After implementing Phase 6, update:

1. `schema_v_0_6.md` → `schema_v_0_7.md`
   - Add new node type definitions
   - Add new relationship types
   - Update examples

2. `REGULATORY_GRAPH_REVIEW.md`
   - Mark Phase 6 items as complete
   - Add new gaps identified during implementation

3. `graphIngressGuard.ts` inline comments
   - Document new whitelisted types

4. `boltGraphClient.test.ts`
   - Add tests for new methods

---

## 10. Appendix: Complete Node Type Summary (Post Phase 6)

| # | Node Type | Phase | Purpose |
|---|-----------|-------|---------|
| 1 | Jurisdiction | Core | Countries, supranational entities |
| 2 | Region | Core | Sub-jurisdictions |
| 3 | Statute | Core | Primary legislation |
| 4 | Section | Core | Sections within statutes |
| 5 | Benefit | Core | Social welfare entitlements |
| 6 | Relief | Core | Tax reliefs and allowances |
| 7 | Condition | Core | Eligibility conditions |
| 8 | Timeline | Core | Temporal constraints |
| 9 | Case | Core | Court/tribunal decisions |
| 10 | Guidance | Core | Non-binding guidance |
| 11 | EURegulation | Core | EU regulations |
| 12 | EUDirective | Core | EU directives |
| 13 | ProfileTag | Core | Personas/segments |
| 14 | Update | Core | Change events |
| 15 | ChangeEvent | Core | Change events (alias) |
| 16 | Concept | Core | SKOS-style concepts |
| 17 | Label | Core | Alternative labels |
| 18 | Agreement | Core | International agreements |
| 19 | Treaty | Core | International treaties |
| 20 | Regime | Core | Regulatory regimes |
| 21 | Community | Core | Algorithm-derived clusters |
| 22 | Obligation | Phase 1 | Compliance requirements |
| 23 | Threshold | Phase 2 | Numeric limits |
| 24 | Rate | Phase 2 | Tax/benefit rates |
| 25 | Form | Phase 3 | Regulatory forms |
| 26 | PRSIClass | Phase 4 | Irish PRSI classes |
| 27 | LifeEvent | Phase 4 | Life event triggers |
| 28 | **Penalty** | Phase 6A | Non-compliance consequences |
| 29 | **LegalEntity** | Phase 6B | Legal structure types |
| 30 | **TaxCredit** | Phase 6C | Direct tax credits |
| 31 | **RegulatoryBody** | Phase 6D | Regulatory authorities |
| 32 | AssetClass | Future | Asset classifications |
| 33 | Sector | Future | Industry sectors |
| 34 | MeansTest | Future | Means assessments |
| 35 | ContributionRequirement | Future | Contribution history |

---

## 11. Appendix: Complete Relationship Type Summary (Post Phase 6)

| # | Relationship | Phase | Purpose |
|---|-------------|-------|---------|
| 1-44 | (Existing 44 types) | Core-Phase 5 | See schema_v_0_6.md |
| 45 | **HAS_PENALTY** | Phase 6A | Obligation to penalty |
| 46 | **WAIVED_IF** | Phase 6A | Penalty exemption conditions |
| 47 | **ESCALATES_TO** | Phase 6A | Penalty progression |
| 48 | **CHANGES_PENALTY** | Phase 6A | Penalty updates |
| 49 | **APPLIES_TO_ENTITY** | Phase 6B | Entity-specific rules |
| 50 | **HAS_ENTITY_TYPE** | Phase 6B | Profile's legal structure |
| 51 | **STACKS_WITH** | Phase 6C | Credit/relief combination |
| 52 | **ADMINISTERED_BY** | Phase 6D | Regulatory body links |
| 53 | **ISSUED_BY** | Phase 6D | Form issuer |
| 54 | **PUBLISHED_BY** | Phase 6D | Guidance publisher |
| 55 | SECTOR_SPECIFIC | Future | Industry-specific rules |
| 56 | OPERATES_IN | Future | Profile's sector |
| 57 | HAS_MEANS_TEST | Future | Means test link |
| 58 | HAS_CONTRIBUTION_REQUIREMENT | Future | Contribution requirement |
| 59 | APPLIES_TO_ASSET | Future | Asset-specific rules |

---

*Document last updated: 2025-12-29*
