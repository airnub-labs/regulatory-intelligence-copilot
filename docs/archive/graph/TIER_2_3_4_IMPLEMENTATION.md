# Tier 2, 3, and 4 Implementation: Enhanced Graph Capabilities

**Status:** ✅ COMPLETE
**Date:** 2025-12-29
**Implemented By:** Claude Code
**Graph Schema Version:** 0.6

---

## Table of Contents

1. [Overview](#overview)
2. [Tier 2: Entity & Tax Credit Differentiation](#tier-2-entity--tax-credit-differentiation)
3. [Tier 3: Enhanced Queries & Temporal](#tier-3-enhanced-queries--temporal)
4. [Tier 4: UK/EU Extension](#tier-4-ukeu-extension)
5. [Combined Impact](#combined-impact)
6. [Testing Coverage](#testing-coverage)
7. [Migration Guide](#migration-guide)

---

## Overview

This document describes the implementation of Tiers 2, 3, and 4 from the FUTURE_ENHANCEMENTS_IMPLEMENTATION_PLAN, which collectively transform the regulatory intelligence graph from a basic rules engine into a comprehensive, multi-jurisdictional regulatory knowledge system.

### Progression Summary

**Tier 2** adds entity-specific modeling and tax credit differentiation, solving the problem of "one-size-fits-all" advice.

**Tier 3** adds regulatory body mapping, asset-specific rules, and temporal queries, enabling contact resolution and point-in-time accuracy.

**Tier 4** extends to UK and EU contexts with National Insurance classes, benefit caps, and cross-border coordination rules.

Together, these tiers enable the system to:
- Distinguish between legal entity types (LTD vs Sole Trader)
- Model tax credits with stacking rules
- Route queries to the correct regulatory authority
- Apply asset-specific tax treatment
- Query historical and future tax regimes
- Handle UK National Insurance contributions
- Apply benefit caps with exemptions
- Coordinate social security across EU borders

---

## Tier 2: Entity & Tax Credit Differentiation

### Problems Solved

#### 1. Entity Type Ambiguity

**Before Tier 2:**
```
User: "Do I need to file CT1?"
System: "CT1 is a corporation tax return"
[System doesn't know if user is LTD, Sole Trader, or Partnership]
```

**After Tier 2:**
```
User: "Do I need to file CT1?" (user is LTD)
System: "Yes. LTDs must file CT1 annually. Deadline: 9 months after year-end."

User: "Do I need to file CT1?" (user is Sole Trader)
System: "No. Sole traders file Form 11 for income tax, not CT1."
```

**How it works:**
- 8 Irish legal entity types modeled: LTD, DAC, PLC, Partnership, LP, Sole Trader, CLG, Discretionary Trust
- Properties distinguish entities: `limited_liability`, `tax_transparent`, `has_separate_legal_personality`
- Obligations linked to entities via `APPLIES_TO_ENTITY` relationship

**Example Query:**
```cypher
MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'})<-[:APPLIES_TO_ENTITY]-(o:Obligation)
RETURN o.label
// Returns: CT1 Filing, Corporation Tax Payment, CRO Annual Return
```

#### 2. Tax Credit Calculation Errors

**Before Tier 2:**
```
User: "Can I claim Personal + Employee + Earned Income credits?"
System: "All three credits exist"
[Doesn't know Employee and Earned Income are mutually exclusive]
```

**After Tier 2:**
```
User: "Can I claim Personal + Employee + Earned Income credits?"
System: "No. Employee Tax Credit and Earned Income Tax Credit are mutually exclusive.
        You can claim Personal (€1,875) + Employee (€1,875) = €3,750"
```

**How it works:**
- 8 tax credits for 2024: Personal, Employee, Earned Income, Home Carer, etc.
- `STACKS_WITH` relationships show compatible credits
- `MUTUALLY_EXCLUSIVE_WITH` relationships prevent invalid combinations
- `refundable`, `transferable`, `restricted_to_marginal` properties control behavior

**Example Query:**
```cypher
MATCH (c1:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_SINGLE_2024'})-[:STACKS_WITH]->(c2:TaxCredit)
RETURN c2.label, c2.amount
// Returns: Employee Tax Credit (€1,875), Age Tax Credit (€245), etc.
```

#### 3. Limited Liability Confusion

**Before Tier 2:**
```
User: "Am I personally liable for company debts?"
System: [No way to compare entity types]
```

**After Tier 2:**
```
User: "Am I personally liable for debts?" (LTD director)
System: "No. LTD provides limited liability. Personal assets are protected."

User: "Am I personally liable for debts?" (Sole Trader)
System: "Yes. Sole traders have unlimited personal liability."
```

**How it works:**
```typescript
LTD.limited_liability = true;           // Protected
SoleTrader.limited_liability = false;   // At risk
```

#### 4. Tax Transparency Modeling

**Before Tier 2:**
```
User: "Why doesn't my partnership file CT1?"
System: [Can't explain flow-through taxation]
```

**After Tier 2:**
```
User: "Why doesn't my partnership file CT1?"
System: "Partnerships are tax transparent. Profits flow through to partners who pay tax via Form 11."
```

**How it works:**
```typescript
Partnership.tax_transparent = true;     // Profits taxed at partner level
LTD.tax_transparent = false;            // Entity pays corporation tax
```

### Implementation Details - Tier 2

#### New Node Types (2)
- **LegalEntity**: Company types, partnerships, sole traders, trusts
- **TaxCredit**: Direct tax liability reductions with stacking rules

#### New Relationships (9)
- `AVAILABLE_TO`: Which profiles can use an entity type
- `APPLIES_TO_ENTITY`: Obligations specific to entity type
- `REGISTERED_AS`: Profile registered as entity type
- `ENTITLED_TO`: Profile entitled to tax credit
- `CAPPED_BY`: Credit has maximum amount
- `TRANSFERS_TO`: Credit can transfer to spouse
- `STACKS_WITH`: Credits can be claimed together
- `REDUCES`: One credit reduces another
- `OFFSETS_AGAINST`: Credit offsets specific tax

#### Seed Data
- **legal_entities.cypher**: 8 Irish entity types with obligations
- **tax_credits.cypher**: 8 tax credits for 2024 with stacking rules

#### Tests
- **tier2.test.ts**: 60+ integration tests covering:
  - Seed data validation
  - GraphClient method behavior
  - Real-world scenarios (LTD vs Sole Trader, credit stacking, liability)

---

## Tier 3: Enhanced Queries & Temporal

### Problems Solved

#### 1. "Who Do I Contact?" Queries

**Before Tier 3:**
```
User: "Who do I contact about CT1 filing?"
System: [No regulatory body information]
```

**After Tier 3:**
```
User: "Who do I contact about CT1 filing?"
System: "Revenue Commissioners (Revenue)
        Domain: TAX
        Website: https://www.revenue.ie
        Phone: 1890 123 456"
```

**How it works:**
- 4 Irish regulatory bodies: Revenue, DSP, CRO, Pensions Authority
- `domain` property: TAX, SOCIAL_WELFARE, COMPANY, PENSIONS
- `ADMINISTERED_BY` links obligations/benefits to regulators
- `ISSUED_BY` links forms to issuing bodies

**Example Query:**
```cypher
MATCH (o:Obligation {id: 'IE_CT1_FILING'})-[:ADMINISTERED_BY]->(rb:RegulatoryBody)
RETURN rb.label, rb.website, rb.domain
// Returns: Revenue Commissioners, https://www.revenue.ie, TAX
```

#### 2. Asset-Specific Tax Treatment

**Before Tier 3:**
```
User: "What tax applies when I sell cryptocurrency?"
System: [Doesn't distinguish crypto from property or shares]
```

**After Tier 3:**
```
User: "What tax applies when I sell cryptocurrency?"
System: "Cryptocurrency disposal is subject to:
        - Capital Gains Tax: Yes (33%)
        - Capital Acquisitions Tax: Yes (if inherited)
        - Stamp Duty: No"
```

**How it works:**
- 6 Irish asset classes: Residential Property, Commercial Property, Quoted Shares, Unquoted Shares, Crypto, Agricultural Land
- Tax applicability flags: `cgt_applicable`, `cat_applicable`, `stamp_duty_applicable`
- `tangible` property distinguishes physical vs digital assets
- `HAS_CGT_RATE` links assets to applicable rates

**Example Query:**
```cypher
MATCH (ac:AssetClass {id: 'IE_ASSET_CRYPTO'})-[:HAS_CGT_RATE]->(r:Rate)
RETURN ac.tangible, ac.cgt_applicable, ac.stamp_duty_applicable, r.percentage
// Returns: false, true, false, 33
```

#### 3. Temporal Point-in-Time Queries

**Before Tier 3:**
```
User: "What were the tax credits for 2024?"
System: [Returns current data, but can't distinguish year]
```

**After Tier 3:**
```
User: "What were the tax credits for 2024?"
System: "2024 Tax Credits:
        - Personal Credit (Single): €1,875
        - Employee Tax Credit: €1,875
        - Earned Income Credit: €1,875
        - Home Carer Credit: €1,800"

User: "What will the credits be for 2025?"
System: [Returns 2025 data when available]
```

**How it works:**
- TaxYear nodes for 2023, 2024, 2025
- `APPLIES_IN_YEAR` links rates, thresholds, credits to specific years
- Enables temporal queries and year-over-year comparisons

**Example Query:**
```cypher
MATCH (c:TaxCredit)-[:APPLIES_IN_YEAR]->(ty:TaxYear {year: 2024})
MATCH (c)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
RETURN c.label, c.amount
ORDER BY c.amount DESC
```

#### 4. Regulatory Domain Mapping

**Before Tier 3:**
```
User: "Who regulates companies in Ireland?"
System: [No way to distinguish tax vs company vs social welfare regulators]
```

**After Tier 3:**
```
User: "Who regulates companies in Ireland?"
System: "Company Regulation:
        - Companies Registration Office (CRO)
        - Domain: COMPANY
        - Website: https://www.cro.ie"

User: "Who handles social welfare?"
System: "Social Welfare:
        - Department of Social Protection (DSP)
        - Domain: SOCIAL_WELFARE"
```

**How it works:**
```typescript
Revenue.domain = 'TAX';
DSP.domain = 'SOCIAL_WELFARE';
CRO.domain = 'COMPANY';
PensionsAuthority.domain = 'PENSIONS';
```

### Implementation Details - Tier 3

#### New Node Types (4)
- **RegulatoryBody**: Government authorities and regulators
- **AssetClass**: Categories of assets for tax purposes
- **MeansTest**: Income/capital eligibility tests for benefits
- **TaxYear**: Fiscal years for temporal queries

#### New Relationships (10)
- `ADMINISTERED_BY`: Body that administers obligation/benefit
- `ISSUED_BY`: Body that issues a form
- `REGULATED_BY`: Entity regulated by body
- `APPLIES_TO_ASSET`: Rule applies to asset class
- `HAS_CGT_RATE`: Asset has specific CGT rate
- `HAS_STAMP_DUTY_RATE`: Asset has stamp duty rate
- `HAS_CAT_RATE`: Asset has CAT rate
- `HAS_MEANS_TEST`: Benefit has means test
- `DISREGARDS`: Means test disregards certain income
- `APPLIES_IN_YEAR`: Rate/threshold/credit applies in year
- `EFFECTIVE_IN_YEAR`: Legislation effective in year

#### Seed Data
- **regulatory_bodies.cypher**: 4 Irish authorities with domains
- **asset_classes.cypher**: 6 asset types with tax flags
- **tax_years.cypher**: 3 years (2023-2025) with temporal links

#### Tests
- **tier3.test.ts**: 70+ integration tests covering:
  - Regulatory body resolution
  - Asset class tax treatment
  - Temporal queries
  - Real-world scenarios (contact info, crypto tax, point-in-time)

---

## Tier 4: UK/EU Extension

### Problems Solved

#### 1. UK National Insurance Complexity

**Before Tier 4:**
```
User: "What National Insurance do I pay as self-employed?"
System: [No UK NI modeling]
```

**After Tier 4:**
```
User: "What National Insurance do I pay as self-employed?"
System: "Self-employed pay TWO NI classes:
        - Class 2: £3.45/week (qualifies for State Pension)
        - Class 4: 9% on profits over £12,570 (no benefit entitlement)

        Why both? Class 2 builds State Pension. Class 4 is additional tax."
```

**How it works:**
- 4 UK NI classes: Class 1 (employees), Class 2 (self-employed low), Class 3 (voluntary), Class 4 (self-employed profits)
- `eligible_benefits` property shows what each class qualifies for
- `HAS_NI_CLASS` links profiles to applicable classes
- `QUALIFIES_FOR` links NI classes to benefits

**Example Query:**
```cypher
MATCH (ni:NIClass {id: 'UK_NI_CLASS_1'})-[:QUALIFIES_FOR]->(b:Benefit)
RETURN ni.rate, ni.threshold_annual, collect(b.label) as benefits
// Returns: 12.0%, £12,570, [State Pension, Unemployment Benefit, Maternity Allowance]
```

**Key Insight:**
```
Class 1 (Employees):    12% + qualifies for ALL benefits
Class 4 (Self-Employed): 9% + qualifies for NOTHING
```

This explains why self-employed need Class 2 for State Pension protection!

#### 2. Benefit Cap Application

**Before Tier 4:**
```
User: "What's the maximum benefits I can receive in London?"
System: [No benefit cap modeling]
```

**After Tier 4:**
```
User: "What's the maximum benefits I can receive in London?"
System: "Benefit Cap 2024 (Greater London):
        - Single: £19,342/year
        - Couple: £28,879/year
        - With children: £28,879/year

        Exemptions:
        - Working Tax Credit
        - Disability Living Allowance
        - Personal Independence Payment
        - Carer's Allowance"
```

**How it works:**
- 2 UK benefit caps: London vs Outside London
- Different amounts for single, couple, with children
- `exemptions` property lists excluded benefits
- `SUBJECT_TO_CAP` links capped benefits

**Example Query:**
```cypher
MATCH (cap:BenefitCap {id: 'UK_BENEFIT_CAP_2024_LONDON'})
MATCH (b:Benefit)-[:SUBJECT_TO_CAP]->(cap)
RETURN cap.amount_single, cap.exemptions, collect(b.label) as capped_benefits
```

**Geographic Difference:**
```
Greater London:      £19,342 (single)
Outside London:      £16,967 (single)
Difference:          £2,375 higher in London
```

#### 3. EU Cross-Border Social Security

**Before Tier 4:**
```
User: "If I'm posted to France for 18 months, which social security applies?"
System: [No EU coordination rules]
```

**After Tier 4:**
```
User: "If I'm posted to France for 18 months, which social security applies?"
System: "Under EC Regulation 883/2004, Article 12 (Posted Workers):
        - You remain on IRISH social security
        - Duration: Up to 24 months
        - Your posting: 18 months ✓ (within limit)
        - You continue paying Irish PRSI
        - You're covered by Irish social insurance benefits"
```

**How it works:**
- 6 EU coordination rules: Posted workers, multi-state, self-employed, family benefits
- `duration_months` property shows posting limits
- `home_jurisdiction` and `host_jurisdiction` identify countries
- `COORDINATED_UNDER` links benefits to rules

**Example Query:**
```cypher
MATCH (cr:CoordinationRule)
WHERE cr.home_jurisdiction = 'IE'
  AND cr.host_jurisdiction = 'FR'
  AND cr.applies_to = 'Posted Workers'
RETURN cr.regulation, cr.duration_months, cr.description
// Returns: EC 883/2004, 24, "Person posted by employer from Ireland to France..."
```

**Posting Duration Rules:**
```
0-24 months:   Home country social security applies
Beyond 24:     Host country social security applies
```

#### 4. Post-Brexit UK/IE Coordination

**Before Tier 4:**
```
User: "Do EU rules still apply between Ireland and UK?"
System: [No post-Brexit coordination modeling]
```

**After Tier 4:**
```
User: "Do EU rules still apply between Ireland and UK?"
System: "No. EU Regulation 883/2004 no longer applies.

        Instead: Trade and Cooperation Agreement (TCA)
        - Social Security Coordination Annex
        - Covers family benefits
        - Limited compared to EU rules

        Family benefits remain coordinated, but under TCA not EU law."
```

**How it works:**
```cypher
CoordinationRule {
  id: 'TCA_FAMILY_BENEFITS_IE_UK',
  regulation: 'Trade and Cooperation Agreement',
  applies_to: 'Family Benefits',
  home_jurisdiction: 'IE',
  host_jurisdiction: 'UK'
}
```

### Implementation Details - Tier 4

#### New Node Types (3)
- **NIClass**: UK National Insurance classifications
- **BenefitCap**: Maximum benefit amounts with exemptions
- **CoordinationRule**: EU/UK social security coordination

#### New Relationships (6)
- `HAS_NI_CLASS`: Profile has NI class
- `QUALIFIES_FOR`: NI class qualifies for benefits
- `SUBJECT_TO_CAP`: Benefit subject to cap
- `COORDINATED_UNDER`: Benefit coordinated by rule
- `AGGREGATES_WITH`: Benefits aggregate under rule
- `POSTED_TO`: Profile posted under rule

#### Seed Data
- **ni_classes.cypher**: 4 UK NI classes with benefit entitlements
- **benefit_caps.cypher**: 2 UK benefit caps (London vs Outside)
- **eu_coordination.cypher**: 6 coordination rules (IE to FR/DE/NL/UK)

#### Tests
- **tier4.test.ts**: 80+ integration tests covering:
  - NI class differentiation
  - Benefit cap application
  - EU coordination rules
  - Real-world scenarios (posted workers, benefit eligibility, cross-border)

---

## Combined Impact

### Before Tiers 2-4

```
User: "I'm a UK self-employed person. What should I be paying?"
System: [No entity types, no NI classes, no UK data]
Unable to answer.
```

### After Tiers 2-4

```
User: "I'm a UK self-employed person. What should I be paying?"
System: "As self-employed in UK:

        National Insurance:
        - Class 2: £3.45/week (if profits > £6,725/year)
        - Class 4: 9% on profits £12,570-£50,270, 2% above

        Benefits:
        - Class 2 qualifies for: State Pension
        - Class 4 qualifies for: Nothing

        Tax:
        - Income Tax via Self Assessment
        - Use SA100 form"
```

### Cross-Tier Scenarios

#### Scenario 1: Irish Director Posted to France

**Before:**
```
System can't answer:
- What entity type?
- What obligations?
- Which social security?
- Which regulator?
```

**After:**
```
Entity (Tier 2):
- Registered as: LTD
- Limited liability: Yes
- Obligations: CT1, CRO Annual Return

Social Security (Tier 4):
- Posted worker rule applies
- Remain on Irish PRSI for 24 months
- Benefits coordinated under EC 883/2004

Contact (Tier 3):
- Tax: Revenue Commissioners
- Company: Companies Registration Office
```

#### Scenario 2: UK Single Parent in London

**Before:**
```
System can't answer:
- What's the benefit cap?
- Are child benefits exempt?
- What NI class?
```

**After:**
```
Benefit Cap (Tier 4):
- Maximum: £28,879/year (with children, London)
- Child Benefit: SUBJECT TO CAP
- Exemptions: DLA, PIP, Carer's Allowance

National Insurance (Tier 4):
- If employed: Class 1 (12%)
- Qualifies for: Maternity Allowance, Unemployment

Tax Credits (Tier 2):
- Can claim: Working Tax Credit
- Effect: Removes benefit cap entirely!
```

#### Scenario 3: 2024 vs 2025 Tax Planning

**Before:**
```
System can't compare years or show changes
```

**After:**
```
2024 (Tier 3):
- Personal Credit: €1,875
- Employee Credit: €1,875
- Total: €3,750

2025 (Tier 3):
- [When seeded, can show increases/decreases]
- Enables year-over-year planning

Asset Planning (Tier 3):
- Crypto disposal in 2024: CGT 33%
- [Can query future rates when available]
```

---

## Testing Coverage

### Test Statistics

| Tier | Test File | Test Count | Coverage Areas |
|------|-----------|------------|----------------|
| Tier 2 | tier2.test.ts | 60+ tests | Entity types, tax credits, stacking, liability |
| Tier 3 | tier3.test.ts | 70+ tests | Regulatory bodies, assets, temporal queries |
| Tier 4 | tier4.test.ts | 80+ tests | NI classes, benefit caps, EU coordination |
| **Total** | | **210+ tests** | **Comprehensive integration testing** |

### Real-World Scenarios Tested

#### Tier 2 Scenarios
- ✅ LTD vs Sole Trader comparison
- ✅ Tax credit stacking (Personal + Employee)
- ✅ Mutual exclusivity (Employee vs Earned Income)
- ✅ Limited liability protection
- ✅ Tax transparency (Partnership vs LTD)
- ✅ Entity-specific obligations (CT1 for LTD, Form 11 for Sole Trader)

#### Tier 3 Scenarios
- ✅ Contact resolution (CT1 → Revenue)
- ✅ Crypto tax treatment (CGT applicable, stamp duty not)
- ✅ Property vs shares distinction
- ✅ Point-in-time queries (2024 tax credits)
- ✅ Regulatory domain routing (TAX vs SOCIAL_WELFARE vs COMPANY)
- ✅ Asset tangibility (property tangible, crypto intangible)

#### Tier 4 Scenarios
- ✅ NI class eligibility (Class 1 vs Class 4 benefits)
- ✅ Self-employed dual NI (Class 2 + Class 4)
- ✅ Benefit cap exemptions (DLA, PIP exempt)
- ✅ London vs outside London caps
- ✅ Posted worker duration (18 months < 24 month limit)
- ✅ EU coordination (IE to FR/DE/NL)
- ✅ Post-Brexit TCA (IE/UK family benefits)
- ✅ Cross-border scenarios

---

## Migration Guide

### For Existing Systems

If you have an existing regulatory intelligence graph, follow these steps to upgrade:

#### Step 1: Update Ingress Guard

Add new node types and relationships to `graphIngressGuard.ts`:

```typescript
// Tier 2
allowedNodeLabels: ['LegalEntity', 'TaxCredit', ...]
allowedRelTypes: ['APPLIES_TO_ENTITY', 'STACKS_WITH', ...]

// Tier 3
allowedNodeLabels: ['RegulatoryBody', 'AssetClass', 'TaxYear', ...]
allowedRelTypes: ['ADMINISTERED_BY', 'HAS_CGT_RATE', 'APPLIES_IN_YEAR', ...]

// Tier 4
allowedNodeLabels: ['NIClass', 'BenefitCap', 'CoordinationRule', ...]
allowedRelTypes: ['HAS_NI_CLASS', 'SUBJECT_TO_CAP', 'COORDINATED_UNDER', ...]
```

#### Step 2: Update Type Definitions

Add interfaces to `types.ts`:

```typescript
export interface LegalEntity { ... }
export interface TaxCredit { ... }
export interface RegulatoryBody { ... }
export interface AssetClass { ... }
export interface TaxYear { ... }
export interface NIClass { ... }
export interface BenefitCap { ... }
export interface CoordinationRule { ... }
```

Update GraphNode union type:

```typescript
type: ... | 'LegalEntity' | 'TaxCredit' | 'RegulatoryBody' | 'AssetClass'
     | 'TaxYear' | 'NIClass' | 'BenefitCap' | 'CoordinationRule'
```

#### Step 3: Implement GraphClient Methods

Add 17 new methods to your GraphClient implementation:

**Tier 2 Methods (5):**
- `getLegalEntitiesForJurisdiction()`
- `getObligationsForEntityType()`
- `getTaxCreditsForProfile()`
- `getStackingOptions()`
- `getReducingFactors()`

**Tier 3 Methods (6):**
- `getRegulatoryBodiesForJurisdiction()`
- `getAdministeringBody()`
- `getAssetClassesForJurisdiction()`
- `getCGTRateForAsset()`
- `getRatesForTaxYear()`
- `getMeansTestForBenefit()`

**Tier 4 Methods (6):**
- `getNIClassesForJurisdiction()`
- `getNIClassForEmploymentType()`
- `getBenefitCapsForJurisdiction()`
- `getBenefitsSubjectToCap()`
- `getCoordinationRules()`
- `getPostedWorkerRules()`

#### Step 4: Load Seed Data

Execute seed files in order:

```bash
# Tier 2
cypher-shell < legal_entities.cypher
cypher-shell < tax_credits.cypher

# Tier 3
cypher-shell < regulatory_bodies.cypher
cypher-shell < asset_classes.cypher
cypher-shell < tax_years.cypher

# Tier 4 (if supporting UK/EU)
cypher-shell < ni_classes.cypher
cypher-shell < benefit_caps.cypher
cypher-shell < eu_coordination.cypher
```

#### Step 5: Run Tests

```bash
pnpm test tier2.test.ts
pnpm test tier3.test.ts
pnpm test tier4.test.ts
```

All tests should pass, confirming successful integration.

---

## Summary

### What Was Implemented

**Tier 2: Entity & Tax Credit Differentiation**
- 2 node types, 9 relationships, 5 GraphClient methods
- 8 legal entities, 8 tax credits
- Solves: entity-specific rules, credit stacking, liability

**Tier 3: Enhanced Queries & Temporal**
- 4 node types, 10 relationships, 6 GraphClient methods
- 4 regulatory bodies, 6 asset classes, 3 tax years
- Solves: contact resolution, asset tax treatment, temporal queries

**Tier 4: UK/EU Extension**
- 3 node types, 6 relationships, 6 GraphClient methods
- 4 NI classes, 2 benefit caps, 6 coordination rules
- Solves: UK NI complexity, benefit caps, cross-border coordination

### Total Enhancements

- **9 new node types**
- **25 new relationships**
- **17 new GraphClient methods**
- **210+ integration tests**
- **Comprehensive real-world scenarios**

### Business Impact

The regulatory intelligence graph can now:

1. **Distinguish** between legal entity types and route obligations correctly
2. **Calculate** tax credits with stacking and mutual exclusivity rules
3. **Resolve** "Who do I contact?" queries to the correct regulatory authority
4. **Apply** asset-specific tax treatment (CGT, CAT, stamp duty)
5. **Query** point-in-time and historical tax regimes
6. **Model** UK National Insurance with benefit entitlements
7. **Apply** benefit caps with geographic and exemption rules
8. **Coordinate** social security across EU borders

This transforms the system from a basic Irish tax rules engine into a comprehensive, multi-jurisdictional regulatory intelligence platform capable of handling complex cross-border scenarios.

---

**Document Version:** 1.0
**Last Updated:** 2025-12-29
**Schema Version:** 0.6
**Status:** ✅ Production Ready
