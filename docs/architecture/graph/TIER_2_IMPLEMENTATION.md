# Tier 2 Enhancement Implementation: Entity & Tax Credit Differentiation

> **Status:** Implemented
> **Date:** 2025-12-29
> **Version:** 1.0
> **Related:** FUTURE_ENHANCEMENTS_IMPLEMENTATION_PLAN.md

---

## Overview

Tier 2 enhances the regulatory graph with entity-specific rules and accurate tax credit modeling. This enables the system to answer critical questions like:

- **"What obligations apply to an LTD vs a DAC vs a Sole Trader?"**
- **"Which tax credits can I claim as a PAYE employee?"**
- **"Can I stack the Personal Tax Credit with the Employee Tax Credit?"**
- **"What's the difference between tax-transparent and non-tax-transparent entities?"**

## Problems Solved

### Problem 1: Entity Type Ambiguity

**Before Tier 2:**
- The system couldn't distinguish between different legal entity types
- Obligations were generic and not entity-specific
- Users received irrelevant compliance advice (e.g., CT1 filing shown to sole traders)

**After Tier 2:**
- 8 Irish entity types modeled with detailed characteristics
- Entity-specific obligations clearly linked
- Accurate compliance workflows for each entity type

**Real-world Example:**
```
User: "I'm a sole trader, what are my filing obligations?"

Before: System shows both CT1 (companies) and Form 11 (individuals) obligations

After: System correctly shows only Form 11 filing obligation, as sole traders
       are tax-transparent and file as individuals
```

### Problem 2: Tax Credit Calculation Errors

**Before Tier 2:**
- No distinction between tax reliefs (reduce taxable income) and tax credits (reduce tax liability)
- Couldn't model which credits stack vs mutually exclusive
- No understanding of transferable vs non-transferable credits

**After Tier 2:**
- 8 tax credits modeled with precise amounts for 2024
- Stacking relationships prevent double-counting
- Mutual exclusivity prevents invalid combinations

**Real-world Example:**
```
User: "Can I claim both Employee Tax Credit and Earned Income Tax Credit?"

Before: System might incorrectly allow both, leading to €3,750 total credits

After: System correctly identifies MUTUALLY_EXCLUSIVE_WITH relationship and
       explains that only one can be claimed (not both)
```

### Problem 3: Limited Liability vs Unlimited Liability

**Before Tier 2:**
- No way to distinguish limited liability structures from unlimited
- Couldn't advise on risk exposure
- Missing critical characteristic for entity selection

**After Tier 2:**
- `limited_liability` property on all entities
- Clear distinction between LTD (limited) and Partnership (unlimited)
- Enables risk-aware recommendations

**Real-world Example:**
```
User: "Should I set up as a sole trader or LTD?"

Before: System provides generic tax comparison

After: System highlights that LTD provides limited liability protection
       (personal assets protected), while sole trader has unlimited liability
       (personal assets at risk for business debts)
```

### Problem 4: Tax Transparency Modeling

**Before Tier 2:**
- No concept of tax-transparent entities
- Couldn't explain why partnerships don't file CT1
- Missing critical tax treatment information

**After Tier 2:**
- `tax_transparent` property distinguishes flow-through entities
- Clear explanation of tax treatment differences
- Proper obligation routing for transparent entities

**Real-world Example:**
```
User: "Why doesn't my partnership need to file CT1?"

Before: No clear answer

After: System explains that partnerships are tax-transparent entities where
       profits are taxed at the partner level (via Form 11), not at the
       entity level (CT1)
```

## Implementation Details

### New Node Types

#### `:LegalEntity`

Represents types of legal structures with detailed characteristics:

```cypher
CREATE (:LegalEntity {
  id: 'IE_ENTITY_LTD',
  label: 'Private Company Limited by Shares',
  abbreviation: 'LTD',
  jurisdiction: 'IE',
  category: 'COMPANY',
  sub_category: 'PRIVATE',
  has_separate_legal_personality: true,
  limited_liability: true,
  can_trade: true,
  can_hold_property: true,
  tax_transparent: false,
  description: 'Most common company type in Ireland'
})
```

**Key Characteristics:**
- **Separate Legal Personality:** Can entity own assets independently?
- **Limited Liability:** Are owners' personal assets protected?
- **Tax Transparent:** Is entity taxed or do profits flow through to owners?
- **Trading Capability:** Can entity engage in commercial activities?

**Entities Modeled:**
1. Private Company (LTD)
2. Designated Activity Company (DAC)
3. Public Limited Company (PLC)
4. General Partnership
5. Limited Partnership (LP)
6. Sole Trader
7. Company Limited by Guarantee (CLG)
8. Discretionary Trust

#### `:TaxCredit`

Represents direct reductions in tax liability:

```cypher
CREATE (:TaxCredit {
  id: 'IE_EMPLOYEE_TAX_CREDIT_2024',
  label: 'Employee Tax Credit',
  amount: 1875,
  currency: 'EUR',
  tax_year: 2024,
  refundable: false,
  transferable: false,
  category: 'EMPLOYMENT',
  description: 'Tax credit for PAYE employees'
})
```

**Key Characteristics:**
- **Amount:** Exact credit value in local currency
- **Refundable:** Can excess credit be refunded?
- **Transferable:** Can credit transfer to spouse/partner?
- **Stacking:** Which credits can be claimed together?

**Credits Modeled (2024):**
1. Personal Tax Credit (Single): €1,875
2. Personal Tax Credit (Married): €3,750 (transferable)
3. Employee Tax Credit: €1,875
4. Earned Income Tax Credit: €1,875
5. Home Carer Tax Credit: €1,800
6. Single Person Child Carer Credit: €1,750
7. Age Tax Credit: €245
8. Incapacitated Child Tax Credit: €3,500

### New Relationships

#### Entity-Related Relationships

```cypher
// Link obligations to entity types
(:Obligation)-[:APPLIES_TO_ENTITY]->(:LegalEntity)

// Link entity to jurisdiction
(:LegalEntity)-[:IN_JURISDICTION]->(:Jurisdiction)

// Link benefits to entity types
(:Benefit)-[:AVAILABLE_TO]->(:LegalEntity)

// Link profile to entity type
(:ProfileTag)-[:REGISTERED_AS]->(:LegalEntity)
```

#### Tax Credit Relationships

```cypher
// Credits that stack (can be claimed together)
(:TaxCredit)-[:STACKS_WITH]->(:TaxCredit)

// Credits that don't stack (mutually exclusive)
(:TaxCredit)-[:MUTUALLY_EXCLUSIVE_WITH]->(:TaxCredit)

// Profile entitlement
(:ProfileTag)-[:ENTITLED_TO]->(:TaxCredit)

// Jurisdiction link
(:TaxCredit)-[:IN_JURISDICTION]->(:Jurisdiction)

// Credit caps
(:TaxCredit)-[:CAPPED_BY]->(:Threshold)

// Transfer rules
(:TaxCredit)-[:TRANSFERS_TO]->(:ProfileTag)

// Reduction factors
(:Relief|:Benefit)-[:REDUCES]->(:TaxCredit)
```

### New GraphClient Methods

```typescript
// Get all entity types for a jurisdiction
getLegalEntitiesForJurisdiction(jurisdictionId: string): Promise<LegalEntity[]>

// Get entity-specific obligations
getObligationsForEntityType(entityTypeId: string): Promise<Obligation[]>

// Get tax credits for a profile and year
getTaxCreditsForProfile(
  profileId: string,
  taxYear: number,
  jurisdictionId: string
): Promise<TaxCredit[]>

// Get credits that can stack
getStackingOptions(nodeId: string): Promise<GraphNode[]>

// Get factors that reduce a benefit/credit
getReducingFactors(nodeId: string): Promise<GraphNode[]>
```

## Real-World Integration Scenarios

### Scenario 1: LTD vs Sole Trader Comparison

**Query:** "What are the compliance differences between operating as an LTD vs a sole trader in Ireland?"

**System Response (powered by Tier 2):**

```markdown
**Private Company Limited by Shares (LTD):**

Structure:
- Separate legal personality: Yes
- Limited liability: Yes (personal assets protected)
- Tax treatment: Non-transparent (company pays corporation tax)

Obligations:
- CT1 Filing (Annual corporation tax return)
- CRO Annual Return (B1 form)
- Preliminary tax payment

**Sole Trader:**

Structure:
- Separate legal personality: No
- Limited liability: No (personal assets at risk)
- Tax treatment: Tax-transparent (you pay income tax on profits)

Obligations:
- Form 11 Filing (Annual income tax return)
- Preliminary tax payment

**Key Differences:**
1. Liability: LTD protects personal assets; Sole Trader does not
2. Tax: LTD pays 12.5% corporation tax; Sole Trader pays income tax (20%-40%)
3. Compliance: LTD has more filing requirements (CT1 + CRO)
4. Costs: LTD has higher setup/maintenance costs
```

### Scenario 2: Tax Credit Optimization

**Query:** "I'm a PAYE employee in Ireland. What tax credits can I claim for 2024?"

**System Response (powered by Tier 2):**

```markdown
**Available Tax Credits for PAYE Employee (2024):**

**Definitely Available:**
1. Personal Tax Credit (Single): €1,875
2. Employee Tax Credit (PAYE): €1,875
   - These STACK together
   - Total: €3,750

**Potentially Available (if eligible):**
3. Home Carer Tax Credit: €1,800
   - If spouse/partner cares for dependents at home

4. Single Person Child Carer Credit: €1,750
   - If you're a single parent

5. Age Tax Credit: €245
   - If you're aged 65 or over

**Cannot Claim:**
- Earned Income Tax Credit: €1,875
  - MUTUALLY EXCLUSIVE with Employee Tax Credit
  - This is for self-employed/proprietary directors only

**Estimated Total Tax Credits:** €3,750 - €7,595
(depending on your personal circumstances)
```

### Scenario 3: Entity Selection for Startup

**Query:** "I'm starting a business. Should I be a sole trader or set up a company?"

**System Response (powered by Tier 2):**

```markdown
**Decision Factors:**

**Choose Sole Trader if:**
- Low-risk business
- Starting out / testing idea
- Want simplest setup
- Comfortable with unlimited liability
- Lower compliance costs

Profile characteristics:
- Tax transparent: Yes (profits taxed as income)
- Limited liability: No
- Setup cost: Low (business name registration only)
- Annual costs: ~€200-500
- Obligations: Form 11 filing only

**Choose LTD if:**
- Higher-risk business
- Want to protect personal assets
- Planning to scale/raise investment
- Want corporate tax rate (12.5%)
- Professional appearance important

Profile characteristics:
- Tax transparent: No (company pays corporation tax)
- Limited liability: Yes (personal protection)
- Setup cost: ~€500-1,000
- Annual costs: ~€1,500-3,000
- Obligations: CT1 + CRO filing

**Recommendation:**
For most startups with potential liability exposure, an LTD provides
better protection and flexibility, despite higher costs.
```

### Scenario 4: Partnership Tax Treatment

**Query:** "We're setting up a partnership. How does tax work for partnerships?"

**System Response (powered by Tier 2):**

```markdown
**Partnership Tax Treatment (Ireland):**

**Entity Characteristics:**
- Tax transparent: Yes
- Legal personality: No (not separate from partners)
- Limited liability: No (partners jointly liable)

**How Partnership Taxation Works:**

1. **Partnership Level:**
   - Partnership itself doesn't pay tax
   - No CT1 filing required
   - Partnership is "transparent" for tax purposes

2. **Partner Level:**
   - Each partner reports their share of profits
   - Each partner files individual Form 11
   - Profits taxed at each partner's marginal income tax rate

3. **Tax Credits Available to Partners:**
   - Personal Tax Credit: €1,875
   - Earned Income Tax Credit: €1,875 (for active partners)
   - These STACK together

4. **Mutual Exclusions:**
   - Cannot claim Employee Tax Credit (PAYE)
   - Employee and Earned Income credits are mutually exclusive

**Example:**
Partnership profit: €100,000
Partner A (50%): Reports €50,000 on Form 11, pays income tax
Partner B (50%): Reports €50,000 on Form 11, pays income tax
Partnership: Files information return but pays no tax
```

## Testing Coverage

The Tier 2 implementation includes comprehensive integration tests covering:

### Seed Data Tests
- ✅ All 8 legal entity types present in graph
- ✅ All 8 tax credits present with correct amounts
- ✅ Tax-transparent entities correctly marked
- ✅ Stacking relationships exist
- ✅ Mutual exclusivity relationships exist

### GraphClient Method Tests
- ✅ `getLegalEntitiesForJurisdiction()` returns all Irish entities
- ✅ `getObligationsForEntityType()` returns entity-specific obligations
- ✅ `getTaxCreditsForProfile()` returns correct credits for PAYE employees
- ✅ `getTaxCreditsForProfile()` returns correct credits for self-employed
- ✅ `getStackingOptions()` identifies stackable credits
- ✅ `getReducingFactors()` identifies reducing factors

### Real-World Scenario Tests
- ✅ LTD has CT1 filing, Sole Trader has Form 11 filing
- ✅ Personal Credit stacks with Employee Credit
- ✅ Personal Credit stacks with Earned Income Credit
- ✅ Employee and Earned Income Credits are mutually exclusive
- ✅ Limited liability entities correctly identified
- ✅ Tax-transparent entities correctly identified
- ✅ PAYE employee receives Employee Tax Credit
- ✅ Self-employed receives Earned Income Tax Credit

## Benefits

### For Users
1. **Accurate Compliance Advice:** Get entity-specific obligations, not generic lists
2. **Tax Optimization:** Understand which credits you can claim and which stack
3. **Informed Decisions:** Compare entities based on liability, tax treatment, and obligations
4. **Error Prevention:** System prevents invalid credit combinations

### For the System
1. **Precision:** Entity-type aware queries reduce irrelevant results
2. **Scalability:** Pattern extends to other jurisdictions (UK, EU)
3. **Maintainability:** Tax credits versioned by year, easy to update
4. **Completeness:** Models real-world tax rules accurately

### For Development
1. **Clear Patterns:** Reusable relationship patterns for future enhancements
2. **Testability:** Comprehensive integration tests validate real-world scenarios
3. **Documentation:** Problems and solutions clearly documented
4. **Extensibility:** Foundation for Tier 3 (regulatory bodies, asset classes)

## Future Enhancements

Tier 2 provides the foundation for:

### Tier 3: Enhanced Queries & Temporal
- `:RegulatoryBody` (Revenue, DSP, CRO)
- `:AssetClass` (property, shares, crypto)
- `:MeansTest` for benefits
- `:TaxYear` for point-in-time queries

### Tier 4: UK/EU Extension
- `:NIClass` (UK National Insurance)
- `:BenefitCap`
- `:CoordinationRule` (EU social security coordination)

## Migration Notes

### Data Migration
- Existing seed data is preserved
- New seed files added: `legal_entities.cypher`, `tax_credits.cypher`
- Run seed files in any order (idempotent)

### API Compatibility
- All existing GraphClient methods unchanged
- Five new methods added (backward compatible)
- No breaking changes

### Schema Changes
- Two new node types added to ingress guard
- Eight new relationship types added
- Property whitelists updated
- Schema documentation updated

## Conclusion

Tier 2 transforms the regulatory graph from a generic rule repository into a precise, entity-aware compliance system. By modeling legal entity characteristics and tax credit mechanics, the system can now provide accurate, actionable advice for real-world scenarios.

The implementation solves four critical problems:
1. ✅ Entity type ambiguity
2. ✅ Tax credit calculation errors
3. ✅ Limited vs unlimited liability confusion
4. ✅ Tax transparency modeling

With comprehensive tests ensuring correctness and detailed documentation explaining the design, Tier 2 provides a solid foundation for future enhancements while immediately delivering value to users seeking entity-specific compliance guidance.
