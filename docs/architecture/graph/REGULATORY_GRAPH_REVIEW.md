# Regulatory Graph Review: Gaps and Proposed Enhancements

> **Status:** Review Document
> **Date:** 2025-12-28
> **Reviewed Version:** Schema v0.6
> **Purpose:** Identify gaps in concept types and relationships, propose high-value additions

---

## Executive Summary

The current regulatory graph (v0.6) provides a solid foundation for Irish/UK/EU regulatory intelligence, covering tax, social welfare, and cross-border coordination. However, several **concept types and relationships** are missing that would significantly enhance the system's reasoning capabilities.

This review identifies:
- **12 missing high-value concept types**
- **18 missing relationship types**
- **Key structural patterns** not yet modelled
- **Priority recommendations** for v0.7

---

## 1. Missing Concept Types (Node Labels)

### 1.1 High Priority - Immediate Value

#### `:Obligation`
**Gap:** The graph models Benefits (what you receive) and Reliefs (what you save), but not **Obligations** (what you must do/pay).

**Rationale:**
- Filing obligations (CT1, Form 11, VAT returns, PAYE submissions)
- Reporting obligations (beneficial ownership, anti-money laundering)
- Payment obligations (preliminary tax, PAYE deadlines)
- Without obligations, the graph cannot answer: "What must I file by [date]?" or "What are my compliance requirements?"

**Proposed Properties:**
```typescript
interface Obligation {
  id: string;           // e.g., "IE_CT1_FILING"
  label: string;        // "Corporation Tax Return (CT1)"
  category: string;     // "FILING" | "REPORTING" | "PAYMENT" | "REGISTRATION"
  frequency?: string;   // "ANNUAL" | "QUARTERLY" | "MONTHLY" | "ONE_TIME"
  penalty_applies?: boolean;
  description?: string;
}
```

**Relationships to support:**
- `(:ProfileTag)-[:HAS_OBLIGATION]->(:Obligation)`
- `(:Obligation)-[:FILING_DEADLINE]->(:Timeline)`
- `(:Statute|:Section)-[:CREATES_OBLIGATION]->(:Obligation)`

---

#### `:Threshold`
**Gap:** Many rules depend on numeric thresholds (income limits, contribution counts, asset values) that are currently embedded in `:Condition` text rather than structured.

**Rationale:**
- CGT annual exemption (€1,270 IE / £3,000 UK)
- PRSI contribution thresholds
- Small benefit exemption limits
- Means test thresholds for benefits
- Structured thresholds enable: "Show me rules where I'm near a threshold" or scenario comparisons

**Proposed Properties:**
```typescript
interface Threshold {
  id: string;           // e.g., "IE_CGT_ANNUAL_EXEMPTION_2024"
  label: string;        // "CGT Annual Exemption"
  value: number;        // 1270
  unit: string;         // "EUR" | "GBP" | "WEEKS" | "DAYS" | "COUNT"
  direction: string;    // "ABOVE" | "BELOW" | "BETWEEN"
  upper_bound?: number; // For bands
  effective_from?: Date;
  effective_to?: Date;
}
```

**Relationships to support:**
- `(:Condition)-[:HAS_THRESHOLD]->(:Threshold)`
- `(:Benefit|:Relief)-[:LIMITED_BY_THRESHOLD]->(:Threshold)`
- `(:Update)-[:CHANGES_THRESHOLD]->(:Threshold)`

---

#### `:Rate`
**Gap:** Tax rates, benefit rates, and contribution rates are critical for numerical reasoning but not explicitly modelled.

**Rationale:**
- Income tax rates and bands (20%, 40%)
- PRSI rates by class (A, S, B, etc.)
- VAT rates (standard, reduced, zero)
- USC rates
- Enables: "What rate applies to me?" and scenario modelling with amounts

**Proposed Properties:**
```typescript
interface Rate {
  id: string;           // e.g., "IE_INCOME_TAX_HIGHER_2024"
  label: string;        // "Higher Rate Income Tax"
  percentage?: number;  // 40
  flat_amount?: number; // For flat-rate amounts
  currency?: string;    // "EUR"
  band_lower?: number;
  band_upper?: number;
  effective_from?: Date;
  effective_to?: Date;
  category: string;     // "INCOME_TAX" | "PRSI" | "VAT" | "CGT" | "USC"
}
```

**Relationships to support:**
- `(:Relief|:Benefit|:Section)-[:HAS_RATE]->(:Rate)`
- `(:ProfileTag)-[:SUBJECT_TO_RATE]->(:Rate)`
- `(:Regime)-[:APPLIES_RATE]->(:Rate)`

---

#### `:Form`
**Gap:** Regulatory compliance often requires specific forms, which are not currently modelled.

**Rationale:**
- Revenue forms (CT1, Form 11, RCT30, etc.)
- DSP claim forms (UP1, PRSI contributions history)
- CRO forms (B1, B10, etc.)
- Links obligations to their fulfilment mechanism

**Proposed Properties:**
```typescript
interface Form {
  id: string;           // e.g., "IE_REVENUE_FORM_CT1"
  label: string;        // "Corporation Tax Return (CT1)"
  issuing_body: string; // "Revenue" | "DSP" | "CRO"
  form_number?: string; // "CT1"
  source_url?: string;
  category: string;     // "TAX" | "SOCIAL_WELFARE" | "COMPANY"
  online_only?: boolean;
}
```

**Relationships to support:**
- `(:Obligation)-[:REQUIRES_FORM]->(:Form)`
- `(:Benefit)-[:CLAIMED_VIA]->(:Form)`
- `(:Form)-[:IN_JURISDICTION]->(:Jurisdiction)`

---

### 1.2 Medium Priority - Enhanced Reasoning

#### `:Entity` or `:LegalEntity`
**Gap:** The graph models rules but not the types of legal entities they apply to.

**Rationale:**
- Companies (LTD, PLC, DAC)
- Partnerships (general, limited)
- Sole traders
- Trusts
- Non-profits (CLG, charities)
- Enables: "What rules apply to a DAC vs an LTD?"

**Proposed Properties:**
```typescript
interface LegalEntity {
  id: string;           // e.g., "IE_ENTITY_DAC"
  label: string;        // "Designated Activity Company"
  jurisdiction: string;
  abbreviation?: string; // "DAC"
  category: string;     // "COMPANY" | "PARTNERSHIP" | "TRUST" | "INDIVIDUAL"
  can_trade?: boolean;
  can_hold_property?: boolean;
}
```

---

#### `:Penalty`
**Gap:** Consequences of non-compliance are not modelled.

**Rationale:**
- Late filing surcharges
- Interest on late payments
- Fixed penalties
- Prosecution thresholds
- Critical for risk assessment: "What happens if I miss this deadline?"

**Proposed Properties:**
```typescript
interface Penalty {
  id: string;           // e.g., "IE_LATE_CT1_SURCHARGE"
  label: string;        // "Late Filing Surcharge"
  penalty_type: string; // "SURCHARGE" | "INTEREST" | "FIXED" | "PROSECUTION"
  rate?: number;        // For percentages
  flat_amount?: number;
  currency?: string;
  max_amount?: number;
  applies_after?: number; // Days after deadline
}
```

**Relationships to support:**
- `(:Obligation)-[:HAS_PENALTY]->(:Penalty)`
- `(:Penalty)-[:WAIVED_IF]->(:Condition)`

---

#### `:PRSIClass`
**Gap:** PRSI classes are fundamental to Irish social welfare but not explicitly modelled.

**Rationale:**
- Class A (employees), Class S (self-employed), Class B (civil servants), etc.
- Each class has different benefits eligibility
- Contribution rates vary by class
- Essential for: "Which benefits can I claim based on my PRSI class?"

**Proposed Properties:**
```typescript
interface PRSIClass {
  id: string;           // e.g., "IE_PRSI_CLASS_A"
  label: string;        // "Class A"
  description: string;
  eligible_benefits: string[];  // High-level categorisation
  contribution_rate?: number;
}
```

**Relationships to support:**
- `(:PRSIClass)-[:ENTITLES_TO]->(:Benefit)`
- `(:ProfileTag)-[:HAS_PRSI_CLASS]->(:PRSIClass)`
- `(:PRSIClass)-[:CONTRIBUTION_RATE]->(:Rate)`

---

#### `:TaxCredit`
**Gap:** Tax credits are distinct from reliefs but conflated in current modelling.

**Rationale:**
- Personal credit, Employee credit, Earned Income credit, etc.
- Credits reduce tax liability directly (€ for €)
- Different from reliefs which reduce taxable income
- Different interaction patterns (credits can't exceed liability; reliefs create losses)

**Proposed Properties:**
```typescript
interface TaxCredit {
  id: string;           // e.g., "IE_PERSONAL_TAX_CREDIT_2024"
  label: string;        // "Personal Tax Credit"
  amount: number;       // 1875
  currency: string;
  tax_year: number;
  refundable?: boolean;
  transferable?: boolean;
}
```

---

#### `:LifeEvent`
**Gap:** Many regulatory interactions are triggered by life events not currently modelled.

**Rationale:**
- Birth of child
- Marriage/civil partnership
- Divorce/separation
- Retirement
- Disability onset
- Death (of self or dependent)
- Immigration/emigration
- Enables: "What do I need to do when [life event]?"

**Proposed Properties:**
```typescript
interface LifeEvent {
  id: string;           // e.g., "LIFE_EVENT_CHILD_BIRTH"
  label: string;        // "Birth of Child"
  category: string;     // "FAMILY" | "EMPLOYMENT" | "HEALTH" | "RESIDENCY"
  triggers_timeline?: boolean;
}
```

**Relationships to support:**
- `(:LifeEvent)-[:TRIGGERS]->(:Benefit|:Relief|:Obligation)`
- `(:LifeEvent)-[:STARTS_TIMELINE]->(:Timeline)`
- `(:LifeEvent)-[:ENDS_TIMELINE]->(:Timeline)`

---

### 1.3 Lower Priority - Future Expansion

#### `:RegulatoryBody`
**Gap:** Regulatory authorities are mentioned in properties but not as first-class nodes.

**Examples:** Revenue, DSP, CRO, Pensions Authority, Central Bank, HMRC, DWP

**Value:** Enables querying by regulator: "Show all Revenue obligations"

---

#### `:AssetClass`
**Gap:** CGT and investment rules depend on asset classification.

**Examples:** Shares, Property (residential/commercial), Crypto, Agricultural land, Business assets

**Value:** Enables: "What CGT rules apply to [asset type]?"

---

#### `:Industry` or `:Sector`
**Gap:** Many rules are sector-specific.

**Examples:** Construction (RCT), Farming (agricultural relief), Film (Section 481)

**Value:** Enables sector-specific advice

---

## 2. Missing Relationship Types

### 2.1 Eligibility & Conditions

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_OBLIGATION` | ProfileTag, LegalEntity | Obligation | Links personas to their duties |
| `CREATES_OBLIGATION` | Statute, Section | Obligation | Legislative source of obligation |
| `REQUIRES_FORM` | Obligation, Benefit | Form | Form needed for compliance/claim |
| `CLAIMED_VIA` | Benefit | Form | How to claim a benefit |
| `WAIVED_IF` | Penalty | Condition | Penalty exemptions |
| `TRIGGERED_BY` | Benefit, Obligation | LifeEvent | Event-based activation |

### 2.2 Rates & Thresholds

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_RATE` | Relief, Benefit, Section | Rate | Applicable rate |
| `HAS_THRESHOLD` | Condition | Threshold | Numeric condition |
| `LIMITED_BY_THRESHOLD` | Benefit, Relief | Threshold | Upper/lower bounds |
| `CHANGES_THRESHOLD` | Update | Threshold | Threshold adjustments |
| `SUBJECT_TO_RATE` | ProfileTag | Rate | Rate applicability |

### 2.3 Entity Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `APPLIES_TO_ENTITY` | Section, Relief, Benefit | LegalEntity | Entity-specific rules |
| `ENTITLES_TO` | PRSIClass | Benefit | Class-based entitlements |
| `HAS_PRSI_CLASS` | ProfileTag | PRSIClass | Profile classification |

### 2.4 Temporal & Causation

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `STARTS_TIMELINE` | LifeEvent | Timeline | Event triggers window |
| `ENDS_TIMELINE` | LifeEvent | Timeline | Event closes window |
| `SUPERSEDES` | Section, Update | Section, Guidance | Version succession |
| `REPEALED_BY` | Statute, Section | Update | Legislation removal |
| `REPLACES` | Benefit, Relief | Benefit, Relief | Scheme succession |

### 2.5 Hierarchical & Classification

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `BROADER` | Concept | Concept | SKOS broader (parent concept) |
| `NARROWER` | Concept | Concept | SKOS narrower (child concept) |
| `RELATED` | Concept | Concept | SKOS related (semantic link) |

---

## 3. Structural Patterns Not Adequately Addressed

### 3.1 Contribution History Modelling
**Gap:** Benefits eligibility often depends on contribution history (e.g., "104 weeks of PRSI in last 3 years") but the graph cannot express this without structured history.

**Proposal:** Either:
- Extend `:Condition` with structured contribution requirements
- Add `:ContributionRequirement` node type linking to Timeline

### 3.2 Income Bands and Means Testing
**Gap:** Many benefits are means-tested with complex income assessment rules.

**Proposal:** Add `:MeansTest` node with:
- Income bands
- Disregards (amounts ignored)
- Assessable income types

### 3.3 Rule Versioning and History
**Gap:** The graph stores current rules but doesn't clearly track historical versions.

**Proposal:** Enhance `SUPERSEDES` relationship and ensure all rule nodes have `effective_from`/`effective_to` dates populated.

### 3.4 Interaction Patterns Beyond Mutual Exclusion
**Current:** `EXCLUDES` and `MUTUALLY_EXCLUSIVE_WITH`

**Missing:**
- `STACKS_WITH` - benefits/reliefs that can be combined
- `PARTIALLY_OVERLAPS` - limited combination allowed
- `REDUCES` - one reduces another (e.g., other income reducing benefit)
- `OFFSETS_AGAINST` - can use one against another

### 3.5 Administrative vs Legal Requirements
**Gap:** Some rules are strict legal requirements; others are administrative practices.

**Proposal:** Add `requirement_level` property: `STATUTORY` | `REGULATORY` | `ADMINISTRATIVE` | `BEST_PRACTICE`

---

## 4. Types.ts Gaps vs Schema

The `types.ts` file in `reg-intel-graph` shows only 13 node types in `GraphNode.type`:
```typescript
'Statute' | 'Section' | 'Benefit' | 'Relief' | 'Condition' |
'Timeline' | 'Case' | 'Guidance' | 'EURegulation' | 'EUDirective' |
'ProfileTag' | 'Jurisdiction' | 'Update'
```

**Missing from types.ts (but in ingress guard):**
- `Concept`
- `Label`
- `Region`
- `Agreement`
- `Treaty`
- `Regime`
- `Community`
- `ChangeEvent`

**Recommendation:** Align `types.ts` with the full schema and ingress guard whitelist.

---

## 5. Priority Recommendations for v0.7

### Tier 1 (Immediate - High Impact)
1. **Add `:Obligation` node type** - Fundamental for compliance reasoning
2. **Add `:Threshold` node type** - Enables numeric scenario evaluation
3. **Add `HAS_OBLIGATION` relationship** - Connect profiles to duties
4. **Align `types.ts`** with full schema - Technical debt reduction

### Tier 2 (Near-term - Enhanced Reasoning)
5. **Add `:Rate` node type** - Enable amount estimation
6. **Add `:Form` node type** - Complete compliance workflow
7. **Add `:PRSIClass` node type** - Critical for Irish social welfare
8. **Add SKOS hierarchy** (`BROADER`/`NARROWER`/`RELATED`) - Better concept navigation

### Tier 3 (Medium-term - Advanced Features)
9. **Add `:LifeEvent` node type** - Event-driven reasoning
10. **Add `:Penalty` node type** - Risk assessment
11. **Add `:LegalEntity` node type** - Entity-specific rules
12. **Add interaction relationships** (`STACKS_WITH`, `REDUCES`) - Complex scenario modelling

### Tier 4 (Future - Specialisation)
13. **Add `:TaxCredit` as distinct from `:Relief`**
14. **Add `:RegulatoryBody` nodes**
15. **Add `:AssetClass` for CGT reasoning**
16. **Add `:MeansTest` for benefit assessment**

---

## 6. Implementation Considerations

### 6.1 Backwards Compatibility
- New node types should be additive (no breaking changes)
- Existing relationships should continue to work
- Ingress guard must be updated atomically with schema

### 6.2 Ingestion Priority
For new node types, prioritise ingestion in this order:
1. `:Obligation` - Extract from existing Revenue/DSP documentation
2. `:Threshold` - Extract from Finance Acts and benefit documentation
3. `:Rate` - Well-documented in Revenue tax tables

### 6.3 Query Impact
New relationships will require new query patterns in `GraphClient`:
- `getObligationsForProfile(profileId)`
- `getThresholdsForCondition(conditionId)`
- `getRatesForRelief(reliefId)`

---

## 7. Conclusion

The current regulatory graph provides a solid foundation but has significant gaps in modelling:
- **Obligations** (what must be done)
- **Numeric structures** (rates, thresholds, bands)
- **Forms and procedures** (how to comply)
- **Life events** (what triggers changes)

Addressing these gaps would transform the system from a "rules lookup" tool to a comprehensive "compliance guidance" platform capable of:
- Proactive compliance reminders
- Scenario modelling with estimated amounts
- Life-event triggered guidance
- Risk assessment for non-compliance

The priority is to add `:Obligation`, `:Threshold`, and `:Rate` in v0.7, with forms, life events, and entity types following in subsequent releases.
