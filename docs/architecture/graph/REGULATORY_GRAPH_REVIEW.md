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

---

## 8. Detailed Recommendations

### 8.1 Recommendation: Add `:Obligation` Node Type

**Priority:** Critical
**Effort:** Medium
**Impact:** High - Enables compliance calendar and "what must I do" queries

**Why this matters:**
The graph currently answers "What can I get?" but not "What must I do?". For a regulatory copilot, obligations are equally important:
- A single-director company must file CT1, B1, annual returns
- A self-employed person must file Form 11, pay preliminary tax
- An employer must submit PAYE returns monthly

**Implementation approach:**
1. Add `Obligation` to schema and ingress guard
2. Create relationships: `HAS_OBLIGATION`, `CREATES_OBLIGATION`, `REQUIRES_FORM`
3. Add `getObligationsForProfile()` to GraphClient
4. Seed initial obligations for IE single-director and self-employed profiles

**Example data to seed:**
```cypher
// Corporation Tax Filing
CREATE (o:Obligation {
  id: 'IE_CT1_FILING',
  label: 'Corporation Tax Return (CT1)',
  category: 'FILING',
  frequency: 'ANNUAL',
  penalty_applies: true,
  description: 'Annual corporation tax return for Irish companies'
})
CREATE (o)-[:IN_JURISDICTION]->(:Jurisdiction {id: 'IE'})
CREATE (o)-[:FILING_DEADLINE]->(:Timeline {
  id: 'IE_CT1_DEADLINE',
  label: '9 months after accounting period end',
  window_months: 9,
  kind: 'DEADLINE'
})
CREATE (:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})-[:HAS_OBLIGATION]->(o)
```

---

### 8.2 Recommendation: Add `:Threshold` Node Type

**Priority:** Critical
**Effort:** Medium
**Impact:** High - Enables numeric scenario comparisons

**Why this matters:**
Many eligibility decisions depend on numeric thresholds:
- "Is my income below €X for this relief?"
- "Do I have enough PRSI contributions?"
- "Am I near the CGT exemption limit?"

Currently these are buried in text descriptions. Structured thresholds enable the Scenario Engine to make quantitative comparisons.

**Implementation approach:**
1. Add `Threshold` to schema and ingress guard
2. Create relationships: `HAS_THRESHOLD`, `LIMITED_BY_THRESHOLD`, `CHANGES_THRESHOLD`
3. Extract thresholds from existing Condition descriptions
4. Add `getThresholdsNearValue(value, tolerance)` to GraphClient

**Example data to seed:**
```cypher
// CGT Annual Exemption
CREATE (t:Threshold {
  id: 'IE_CGT_ANNUAL_EXEMPTION_2024',
  label: 'CGT Annual Exemption',
  value: 1270,
  unit: 'EUR',
  direction: 'BELOW',
  effective_from: datetime('2024-01-01'),
  category: 'CGT'
})
CREATE (t)-[:IN_JURISDICTION]->(:Jurisdiction {id: 'IE'})

// Link to relief
MATCH (r:Relief {id: 'IE_CGT_EXEMPTION'})
CREATE (r)-[:LIMITED_BY_THRESHOLD]->(t)
```

---

### 8.3 Recommendation: Add `:Rate` Node Type

**Priority:** High
**Effort:** Medium
**Impact:** High - Enables amount estimation in scenarios

**Why this matters:**
The Scenario Engine currently returns boolean eligibility. With structured rates, it can estimate:
- "Your tax at the higher rate would be €X"
- "PRSI contributions at Class S rate = €Y"
- "VAT on this transaction = €Z"

**Implementation approach:**
1. Add `Rate` to schema and ingress guard
2. Create relationships: `HAS_RATE`, `SUBJECT_TO_RATE`, `APPLIES_RATE`
3. Seed tax rates, PRSI rates, VAT rates for IE
4. Add `getRatesForCategory(category, jurisdiction)` to GraphClient

**Example data to seed:**
```cypher
// Income Tax Standard Rate
CREATE (r:Rate {
  id: 'IE_INCOME_TAX_STANDARD_2024',
  label: 'Standard Rate Income Tax',
  percentage: 20,
  band_lower: 0,
  band_upper: 42000,
  currency: 'EUR',
  category: 'INCOME_TAX',
  effective_from: datetime('2024-01-01')
})

// Income Tax Higher Rate
CREATE (r:Rate {
  id: 'IE_INCOME_TAX_HIGHER_2024',
  label: 'Higher Rate Income Tax',
  percentage: 40,
  band_lower: 42000,
  currency: 'EUR',
  category: 'INCOME_TAX',
  effective_from: datetime('2024-01-01')
})
```

---

### 8.4 Recommendation: Align types.ts with Schema

**Priority:** High
**Effort:** Low
**Impact:** Medium - Reduces technical debt, improves type safety

**Why this matters:**
The TypeScript types in `reg-intel-graph/src/types.ts` only include 13 node types, but the schema and ingress guard define 21. This means:
- TypeScript won't catch errors when using `Region`, `Concept`, etc.
- IDE autocomplete is incomplete
- Runtime errors may occur for valid graph operations

**Implementation approach:**
1. Update `GraphNode.type` union to include all allowed node labels
2. Ensure ingress guard and types.ts stay in sync
3. Consider generating types from a single source of truth

---

### 8.5 Recommendation: Add SKOS Hierarchy Relationships

**Priority:** Medium
**Effort:** Low
**Impact:** Medium - Enables concept navigation and taxonomy queries

**Why this matters:**
SKOS (Simple Knowledge Organization System) uses `broader`, `narrower`, and `related` to create concept hierarchies. This enables:
- "Show me all tax-related concepts" (narrower than TAX)
- "What concepts are related to CGT?"
- Faceted navigation in the UI

**Implementation approach:**
1. Add `BROADER`, `NARROWER`, `RELATED` to ingress guard
2. Create hierarchy for existing Concept nodes
3. Add `getConceptHierarchy(conceptId)` to GraphClient

---

### 8.6 Recommendation: Add `:Form` Node Type

**Priority:** Medium
**Effort:** Medium
**Impact:** Medium - Completes compliance workflow

**Why this matters:**
Users need to know not just *what* to do, but *how* to do it. Forms are the mechanism:
- "How do I claim this relief?" → "File Form X"
- "What form do I need for CT filing?" → "CT1"

**Implementation approach:**
1. Add `Form` to schema and ingress guard
2. Create relationships: `REQUIRES_FORM`, `CLAIMED_VIA`
3. Seed Revenue and DSP forms for common scenarios
4. Include `source_url` for direct links

---

### 8.7 Recommendation: Add `:PRSIClass` Node Type

**Priority:** Medium (High for Irish social welfare)
**Effort:** Medium
**Impact:** High for benefit eligibility - PRSI class determines most welfare entitlements

**Why this matters:**
PRSI class is the primary determinant of Irish social welfare eligibility:
- Class A: Employees - entitled to most benefits
- Class S: Self-employed - limited benefits (no Jobseeker's Benefit)
- Class B: Civil servants pre-1995 - modified entitlements

**Implementation approach:**
1. Add `PRSIClass` to schema and ingress guard
2. Create relationships: `ENTITLES_TO`, `HAS_PRSI_CLASS`, `CONTRIBUTION_RATE`
3. Seed all PRSI classes with their benefit entitlements
4. Link ProfileTags to default PRSI classes

---

## 9. Phased Implementation Plan

This section provides a detailed, actionable implementation plan for a coding agent.

### Phase 1: Foundation (Types Alignment & Obligation)

**Goal:** Fix technical debt and add the most critical missing node type

**Duration:** 1 sprint

#### Task 1.1: Align types.ts with schema

**File:** `packages/reg-intel-graph/src/types.ts`

**Current state (line 25):**
```typescript
type: 'Statute' | 'Section' | 'Benefit' | 'Relief' | 'Condition' | 'Timeline' | 'Case' | 'Guidance' | 'EURegulation' | 'EUDirective' | 'ProfileTag' | 'Jurisdiction' | 'Update';
```

**Target state:**
```typescript
type:
  | 'Statute'
  | 'Section'
  | 'Benefit'
  | 'Relief'
  | 'Condition'
  | 'Timeline'
  | 'Case'
  | 'Guidance'
  | 'EURegulation'
  | 'EUDirective'
  | 'ProfileTag'
  | 'Jurisdiction'
  | 'Update'
  | 'Concept'
  | 'Label'
  | 'Region'
  | 'Agreement'
  | 'Treaty'
  | 'Regime'
  | 'Community'
  | 'ChangeEvent'
  | 'Obligation'
  | 'Threshold'
  | 'Rate'
  | 'Form';
```

**Validation:** Run `pnpm typecheck` - should pass

---

#### Task 1.2: Add Obligation to ingress guard

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels` array (line 54-76):**
```typescript
'Obligation',
```

**Add to `allowedRelTypes` array (line 78-118):**
```typescript
'HAS_OBLIGATION',
'CREATES_OBLIGATION',
'REQUIRES_FORM',
```

**Add to `nodePropertyWhitelist` object (line 231-283):**
```typescript
Obligation: [
  'id',
  'label',
  'category',
  'frequency',
  'penalty_applies',
  'description',
  'created_at',
  'updated_at',
],
```

---

#### Task 1.3: Add Obligation interfaces to types.ts

**File:** `packages/reg-intel-graph/src/types.ts`

**Add after Timeline interface (around line 17):**
```typescript
/**
 * Obligation representing a compliance requirement
 */
export interface Obligation {
  id: string;
  label: string;
  category: 'FILING' | 'REPORTING' | 'PAYMENT' | 'REGISTRATION';
  frequency?: 'ANNUAL' | 'QUARTERLY' | 'MONTHLY' | 'ONE_TIME';
  penalty_applies?: boolean;
  description?: string;
}
```

---

#### Task 1.4: Add GraphClient method for obligations

**File:** `packages/reg-intel-graph/src/types.ts`

**Add to GraphClient interface (around line 86):**
```typescript
/**
 * Get obligations for a profile and jurisdiction
 */
getObligationsForProfile(
  profileId: string,
  jurisdictionId: string
): Promise<Obligation[]>;
```

---

#### Task 1.5: Implement getObligationsForProfile in MemgraphClient

**File:** `packages/reg-intel-graph/src/memgraphClient.ts`

**Add implementation:**
```typescript
async getObligationsForProfile(
  profileId: string,
  jurisdictionId: string
): Promise<Obligation[]> {
  const query = `
    MATCH (p:ProfileTag {id: $profileId})
    MATCH (j:Jurisdiction {id: $jurisdictionId})
    MATCH (p)-[:HAS_OBLIGATION]->(o:Obligation)-[:IN_JURISDICTION]->(j)
    RETURN o
  `;
  const result = await this.executeCypher(query, { profileId, jurisdictionId });
  return this.mapToObligations(result);
}

private mapToObligations(result: unknown): Obligation[] {
  // Implementation to map Cypher result to Obligation[]
  // ...
}
```

---

#### Task 1.6: Update schema documentation

**File:** `docs/architecture/graph/schema_v_0_6.md`

**Add new section after 2.15 (`:Update`):**
```markdown
### 2.20 `:Obligation`

Represents a compliance requirement (filing, reporting, payment, registration).

**Properties**
- `id: string` – e.g. `"IE_CT1_FILING"`.
- `label: string` – e.g. `"Corporation Tax Return (CT1)"`.
- `category: string` – `"FILING" | "REPORTING" | "PAYMENT" | "REGISTRATION"`.
- `frequency?: string` – `"ANNUAL" | "QUARTERLY" | "MONTHLY" | "ONE_TIME"`.
- `penalty_applies?: boolean`
- `description?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`
```

**Add to Section 3 (Relationships):**
```markdown
### 3.11 Obligations

- `(:ProfileTag)-[:HAS_OBLIGATION]->(:Obligation)`
- `(:Statute|:Section)-[:CREATES_OBLIGATION]->(:Obligation)`
- `(:Obligation)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:Obligation)-[:FILING_DEADLINE]->(:Timeline)`
- `(:Obligation)-[:REQUIRES_FORM]->(:Form)`
```

---

#### Task 1.7: Create seed data for obligations

**File:** `packages/reg-intel-graph/src/seeds/obligations.cypher` (new file)

```cypher
// Irish Corporation Tax Filing Obligation
MERGE (o:Obligation {id: 'IE_CT1_FILING'})
SET o.label = 'Corporation Tax Return (CT1)',
    o.category = 'FILING',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Annual corporation tax return required for all Irish companies',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j)

WITH o
MERGE (t:Timeline {id: 'IE_CT1_DEADLINE'})
SET t.label = '9 months after accounting period end',
    t.window_months = 9,
    t.kind = 'DEADLINE'
MERGE (o)-[:FILING_DEADLINE]->(t)

WITH o
MATCH (p:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})
MERGE (p)-[:HAS_OBLIGATION]->(o);

// Irish Form 11 Filing Obligation (Self-employed)
MERGE (o:Obligation {id: 'IE_FORM_11_FILING'})
SET o.label = 'Income Tax Return (Form 11)',
    o.category = 'FILING',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Annual income tax return for self-employed individuals',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j)

WITH o
MATCH (p:ProfileTag {id: 'PROFILE_SELF_EMPLOYED_IE'})
MERGE (p)-[:HAS_OBLIGATION]->(o);

// Irish Annual Return (CRO) Obligation
MERGE (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
SET o.label = 'Annual Return (B1)',
    o.category = 'FILING',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Annual return to Companies Registration Office',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j)

WITH o
MATCH (p:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})
MERGE (p)-[:HAS_OBLIGATION]->(o);

// Preliminary Tax Payment Obligation
MERGE (o:Obligation {id: 'IE_PRELIMINARY_TAX'})
SET o.label = 'Preliminary Tax Payment',
    o.category = 'PAYMENT',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Advance payment of income/corporation tax',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j);
```

---

### Phase 2: Numeric Structures (Threshold & Rate)

**Goal:** Enable quantitative reasoning in scenarios

**Duration:** 1 sprint

#### Task 2.1: Add Threshold to ingress guard and types

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'Threshold',
```

**Add to `allowedRelTypes`:**
```typescript
'HAS_THRESHOLD',
'LIMITED_BY_THRESHOLD',
'CHANGES_THRESHOLD',
```

**Add to `nodePropertyWhitelist`:**
```typescript
Threshold: [
  'id',
  'label',
  'value',
  'unit',
  'direction',
  'upper_bound',
  'effective_from',
  'effective_to',
  'category',
  'created_at',
  'updated_at',
],
```

---

#### Task 2.2: Add Threshold interface

**File:** `packages/reg-intel-graph/src/types.ts`

```typescript
/**
 * Threshold representing a numeric limit or boundary
 */
export interface Threshold {
  id: string;
  label: string;
  value: number;
  unit: 'EUR' | 'GBP' | 'WEEKS' | 'DAYS' | 'COUNT' | 'PERCENT';
  direction: 'ABOVE' | 'BELOW' | 'BETWEEN';
  upper_bound?: number;
  effective_from?: string;
  effective_to?: string;
  category?: string;
}
```

---

#### Task 2.3: Add Rate to ingress guard and types

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'Rate',
```

**Add to `allowedRelTypes`:**
```typescript
'HAS_RATE',
'SUBJECT_TO_RATE',
'APPLIES_RATE',
```

**Add to `nodePropertyWhitelist`:**
```typescript
Rate: [
  'id',
  'label',
  'percentage',
  'flat_amount',
  'currency',
  'band_lower',
  'band_upper',
  'effective_from',
  'effective_to',
  'category',
  'created_at',
  'updated_at',
],
```

---

#### Task 2.4: Add Rate interface

**File:** `packages/reg-intel-graph/src/types.ts`

```typescript
/**
 * Rate representing a tax rate, contribution rate, or benefit rate
 */
export interface Rate {
  id: string;
  label: string;
  percentage?: number;
  flat_amount?: number;
  currency?: string;
  band_lower?: number;
  band_upper?: number;
  effective_from?: string;
  effective_to?: string;
  category: string;
}
```

---

#### Task 2.5: Add GraphClient methods

**File:** `packages/reg-intel-graph/src/types.ts`

```typescript
/**
 * Get thresholds for a condition
 */
getThresholdsForCondition(conditionId: string): Promise<Threshold[]>;

/**
 * Get rates for a category and jurisdiction
 */
getRatesForCategory(
  category: string,
  jurisdictionId: string
): Promise<Rate[]>;

/**
 * Check if a value is near any threshold (within tolerance)
 */
getThresholdsNearValue(
  value: number,
  unit: string,
  tolerancePercent: number
): Promise<Threshold[]>;
```

---

#### Task 2.6: Create seed data for thresholds and rates

**File:** `packages/reg-intel-graph/src/seeds/thresholds_rates.cypher` (new file)

```cypher
// === THRESHOLDS ===

// CGT Annual Exemption
MERGE (t:Threshold {id: 'IE_CGT_ANNUAL_EXEMPTION_2024'})
SET t.label = 'CGT Annual Exemption',
    t.value = 1270,
    t.unit = 'EUR',
    t.direction = 'BELOW',
    t.category = 'CGT',
    t.effective_from = datetime('2024-01-01'),
    t.created_at = localdatetime(),
    t.updated_at = localdatetime()

WITH t
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (t)-[:IN_JURISDICTION]->(j);

// Small Benefit Exemption
MERGE (t:Threshold {id: 'IE_SMALL_BENEFIT_EXEMPTION_2024'})
SET t.label = 'Small Benefit Exemption',
    t.value = 1000,
    t.unit = 'EUR',
    t.direction = 'BELOW',
    t.category = 'BIK',
    t.effective_from = datetime('2024-01-01'),
    t.created_at = localdatetime(),
    t.updated_at = localdatetime()

WITH t
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (t)-[:IN_JURISDICTION]->(j);

// PRSI Contribution Threshold for Jobseeker's Benefit
MERGE (t:Threshold {id: 'IE_PRSI_JOBSEEKERS_CONTRIB_THRESHOLD'})
SET t.label = 'PRSI Contributions for Jobseeker\'s Benefit',
    t.value = 104,
    t.unit = 'WEEKS',
    t.direction = 'ABOVE',
    t.category = 'PRSI',
    t.created_at = localdatetime(),
    t.updated_at = localdatetime()

WITH t
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (t)-[:IN_JURISDICTION]->(j);

// === RATES ===

// Income Tax Standard Rate
MERGE (r:Rate {id: 'IE_INCOME_TAX_STANDARD_2024'})
SET r.label = 'Standard Rate Income Tax',
    r.percentage = 20,
    r.band_lower = 0,
    r.band_upper = 42000,
    r.currency = 'EUR',
    r.category = 'INCOME_TAX',
    r.effective_from = datetime('2024-01-01'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// Income Tax Higher Rate
MERGE (r:Rate {id: 'IE_INCOME_TAX_HIGHER_2024'})
SET r.label = 'Higher Rate Income Tax',
    r.percentage = 40,
    r.band_lower = 42000,
    r.currency = 'EUR',
    r.category = 'INCOME_TAX',
    r.effective_from = datetime('2024-01-01'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// CGT Rate
MERGE (r:Rate {id: 'IE_CGT_RATE_2024'})
SET r.label = 'Capital Gains Tax Rate',
    r.percentage = 33,
    r.currency = 'EUR',
    r.category = 'CGT',
    r.effective_from = datetime('2024-01-01'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// PRSI Class S Rate
MERGE (r:Rate {id: 'IE_PRSI_CLASS_S_2024'})
SET r.label = 'PRSI Class S Rate',
    r.percentage = 4,
    r.currency = 'EUR',
    r.category = 'PRSI',
    r.effective_from = datetime('2024-01-01'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// VAT Standard Rate
MERGE (r:Rate {id: 'IE_VAT_STANDARD_2024'})
SET r.label = 'VAT Standard Rate',
    r.percentage = 23,
    r.currency = 'EUR',
    r.category = 'VAT',
    r.effective_from = datetime('2024-01-01'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// VAT Reduced Rate
MERGE (r:Rate {id: 'IE_VAT_REDUCED_2024'})
SET r.label = 'VAT Reduced Rate',
    r.percentage = 13.5,
    r.currency = 'EUR',
    r.category = 'VAT',
    r.effective_from = datetime('2024-01-01'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);
```

---

### Phase 3: Forms & SKOS Hierarchy

**Goal:** Complete compliance workflow and enable concept navigation

**Duration:** 1 sprint

#### Task 3.1: Add Form node type

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'Form',
```

**Add to `allowedRelTypes`:**
```typescript
'CLAIMED_VIA',
```

**Add to `nodePropertyWhitelist`:**
```typescript
Form: [
  'id',
  'label',
  'issuing_body',
  'form_number',
  'source_url',
  'category',
  'online_only',
  'created_at',
  'updated_at',
],
```

---

#### Task 3.2: Add SKOS hierarchy relationships

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedRelTypes`:**
```typescript
'BROADER',
'NARROWER',
'RELATED',
```

---

#### Task 3.3: Add GraphClient methods for forms and concepts

**File:** `packages/reg-intel-graph/src/types.ts`

```typescript
/**
 * Form representing a regulatory form or document
 */
export interface Form {
  id: string;
  label: string;
  issuing_body: string;
  form_number?: string;
  source_url?: string;
  category: string;
  online_only?: boolean;
}

// Add to GraphClient interface:
/**
 * Get form required for an obligation or benefit
 */
getFormForObligation(obligationId: string): Promise<Form | null>;

/**
 * Get concept hierarchy (broader/narrower concepts)
 */
getConceptHierarchy(conceptId: string): Promise<{
  broader: GraphNode[];
  narrower: GraphNode[];
  related: GraphNode[];
}>;
```

---

#### Task 3.4: Create seed data for forms

**File:** `packages/reg-intel-graph/src/seeds/forms.cypher` (new file)

```cypher
// Revenue Forms
MERGE (f:Form {id: 'IE_REVENUE_FORM_CT1'})
SET f.label = 'Corporation Tax Return (CT1)',
    f.issuing_body = 'Revenue',
    f.form_number = 'CT1',
    f.source_url = 'https://www.revenue.ie/en/companies-and-charities/corporation-tax-for-companies/index.aspx',
    f.category = 'TAX',
    f.online_only = true,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j)

WITH f
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:REQUIRES_FORM]->(f);

MERGE (f:Form {id: 'IE_REVENUE_FORM_11'})
SET f.label = 'Income Tax Return (Form 11)',
    f.issuing_body = 'Revenue',
    f.form_number = 'Form 11',
    f.source_url = 'https://www.revenue.ie/en/self-assessment-and-self-employment/filing-your-tax-return/index.aspx',
    f.category = 'TAX',
    f.online_only = true,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j)

WITH f
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:REQUIRES_FORM]->(f);

// CRO Forms
MERGE (f:Form {id: 'IE_CRO_FORM_B1'})
SET f.label = 'Annual Return (B1)',
    f.issuing_body = 'CRO',
    f.form_number = 'B1',
    f.source_url = 'https://www.cro.ie/Annual-Return',
    f.category = 'COMPANY',
    f.online_only = true,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j)

WITH f
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:REQUIRES_FORM]->(f);

// DSP Forms
MERGE (f:Form {id: 'IE_DSP_FORM_UP1'})
SET f.label = 'Jobseeker\'s Benefit Application (UP1)',
    f.issuing_body = 'DSP',
    f.form_number = 'UP1',
    f.source_url = 'https://www.gov.ie/en/service/c71fc0-jobseekers-benefit/',
    f.category = 'SOCIAL_WELFARE',
    f.online_only = false,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j);
```

---

### Phase 4: PRSIClass & LifeEvent

**Goal:** Enable event-driven reasoning and Irish welfare eligibility

**Duration:** 1 sprint

#### Task 4.1: Add PRSIClass node type

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'PRSIClass',
```

**Add to `allowedRelTypes`:**
```typescript
'ENTITLES_TO',
'HAS_PRSI_CLASS',
'CONTRIBUTION_RATE',
```

**Add to `nodePropertyWhitelist`:**
```typescript
PRSIClass: [
  'id',
  'label',
  'description',
  'eligible_benefits',
  'created_at',
  'updated_at',
],
```

---

#### Task 4.2: Add LifeEvent node type

**File:** `packages/reg-intel-graph/src/graphIngressGuard.ts`

**Add to `allowedNodeLabels`:**
```typescript
'LifeEvent',
```

**Add to `allowedRelTypes`:**
```typescript
'TRIGGERS',
'STARTS_TIMELINE',
'ENDS_TIMELINE',
'TRIGGERED_BY',
```

**Add to `nodePropertyWhitelist`:**
```typescript
LifeEvent: [
  'id',
  'label',
  'category',
  'triggers_timeline',
  'description',
  'created_at',
  'updated_at',
],
```

---

#### Task 4.3: Create seed data for PRSI classes

**File:** `packages/reg-intel-graph/src/seeds/prsi_classes.cypher` (new file)

```cypher
// PRSI Class A - Employees
MERGE (c:PRSIClass {id: 'IE_PRSI_CLASS_A'})
SET c.label = 'Class A',
    c.description = 'Employees under 66 in industrial, commercial and service employment',
    c.eligible_benefits = ['Jobseeker\'s Benefit', 'Illness Benefit', 'Maternity Benefit', 'Paternity Benefit', 'State Pension (Contributory)'],
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j)

WITH c
MATCH (b:Benefit) WHERE b.id IN ['IE_JOBSEEKERS_BENEFIT', 'IE_ILLNESS_BENEFIT', 'IE_MATERNITY_BENEFIT']
MERGE (c)-[:ENTITLES_TO]->(b);

// PRSI Class S - Self-employed
MERGE (c:PRSIClass {id: 'IE_PRSI_CLASS_S'})
SET c.label = 'Class S',
    c.description = 'Self-employed people including certain company directors',
    c.eligible_benefits = ['State Pension (Contributory)', 'Maternity Benefit', 'Paternity Benefit', 'Treatment Benefit'],
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j)

WITH c
MATCH (p:ProfileTag {id: 'PROFILE_SELF_EMPLOYED_IE'})
MERGE (p)-[:HAS_PRSI_CLASS]->(c);

// PRSI Class B - Civil Servants pre-1995
MERGE (c:PRSIClass {id: 'IE_PRSI_CLASS_B'})
SET c.label = 'Class B',
    c.description = 'Civil servants recruited before 6 April 1995',
    c.eligible_benefits = ['Limited State Pension (Contributory)'],
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);
```

---

#### Task 4.4: Create seed data for life events

**File:** `packages/reg-intel-graph/src/seeds/life_events.cypher` (new file)

```cypher
// Birth of Child
MERGE (e:LifeEvent {id: 'LIFE_EVENT_CHILD_BIRTH'})
SET e.label = 'Birth of Child',
    e.category = 'FAMILY',
    e.triggers_timeline = true,
    e.description = 'Birth or adoption of a child',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Marriage
MERGE (e:LifeEvent {id: 'LIFE_EVENT_MARRIAGE'})
SET e.label = 'Marriage or Civil Partnership',
    e.category = 'FAMILY',
    e.triggers_timeline = false,
    e.description = 'Marriage or registration of civil partnership',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Separation/Divorce
MERGE (e:LifeEvent {id: 'LIFE_EVENT_SEPARATION'})
SET e.label = 'Separation or Divorce',
    e.category = 'FAMILY',
    e.triggers_timeline = false,
    e.description = 'Legal separation or divorce',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Retirement
MERGE (e:LifeEvent {id: 'LIFE_EVENT_RETIREMENT'})
SET e.label = 'Retirement',
    e.category = 'EMPLOYMENT',
    e.triggers_timeline = true,
    e.description = 'Retirement from employment',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Job Loss
MERGE (e:LifeEvent {id: 'LIFE_EVENT_JOB_LOSS'})
SET e.label = 'Job Loss',
    e.category = 'EMPLOYMENT',
    e.triggers_timeline = true,
    e.description = 'Involuntary loss of employment',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Starting Business
MERGE (e:LifeEvent {id: 'LIFE_EVENT_START_BUSINESS'})
SET e.label = 'Starting a Business',
    e.category = 'EMPLOYMENT',
    e.triggers_timeline = true,
    e.description = 'Becoming self-employed or incorporating a company',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Moving to Ireland
MERGE (e:LifeEvent {id: 'LIFE_EVENT_MOVE_TO_IE'})
SET e.label = 'Moving to Ireland',
    e.category = 'RESIDENCY',
    e.triggers_timeline = true,
    e.description = 'Establishing tax residency in Ireland',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Leaving Ireland
MERGE (e:LifeEvent {id: 'LIFE_EVENT_LEAVE_IE'})
SET e.label = 'Leaving Ireland',
    e.category = 'RESIDENCY',
    e.triggers_timeline = true,
    e.description = 'Ceasing tax residency in Ireland',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime();

// Link life events to benefits/obligations
MATCH (e:LifeEvent {id: 'LIFE_EVENT_CHILD_BIRTH'})
MATCH (b:Benefit) WHERE b.id IN ['IE_MATERNITY_BENEFIT', 'IE_PATERNITY_BENEFIT', 'IE_CHILD_BENEFIT']
MERGE (e)-[:TRIGGERS]->(b);

MATCH (e:LifeEvent {id: 'LIFE_EVENT_JOB_LOSS'})
MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})
MERGE (e)-[:TRIGGERS]->(b);

MATCH (e:LifeEvent {id: 'LIFE_EVENT_START_BUSINESS'})
MATCH (o:Obligation) WHERE o.id IN ['IE_CT1_FILING', 'IE_FORM_11_FILING', 'IE_CRO_ANNUAL_RETURN']
MERGE (e)-[:TRIGGERS]->(o);
```

---

### Phase 5: Testing & Validation

**Goal:** Ensure all new types work correctly

**Duration:** 0.5 sprint

#### Task 5.1: Add unit tests for new GraphClient methods

**File:** `packages/reg-intel-graph/src/__tests__/graphClient.test.ts`

```typescript
describe('GraphClient - Obligations', () => {
  it('should return obligations for a profile and jurisdiction', async () => {
    const obligations = await client.getObligationsForProfile(
      'PROFILE_SINGLE_DIRECTOR_IE',
      'IE'
    );
    expect(obligations).toBeInstanceOf(Array);
    expect(obligations.length).toBeGreaterThan(0);
    expect(obligations[0]).toHaveProperty('id');
    expect(obligations[0]).toHaveProperty('category');
  });
});

describe('GraphClient - Thresholds', () => {
  it('should return thresholds for a condition', async () => {
    const thresholds = await client.getThresholdsForCondition('IE_CGT_CONDITION');
    expect(thresholds).toBeInstanceOf(Array);
  });

  it('should find thresholds near a value', async () => {
    const nearThresholds = await client.getThresholdsNearValue(1200, 'EUR', 10);
    expect(nearThresholds).toBeInstanceOf(Array);
    // Should find CGT exemption (€1270) when searching near €1200
  });
});

describe('GraphClient - Rates', () => {
  it('should return rates for a category and jurisdiction', async () => {
    const rates = await client.getRatesForCategory('INCOME_TAX', 'IE');
    expect(rates).toBeInstanceOf(Array);
    expect(rates.length).toBeGreaterThanOrEqual(2); // Standard and higher rates
  });
});
```

---

#### Task 5.2: Add integration tests for seed data

**File:** `packages/reg-intel-graph/src/__tests__/seeds.integration.test.ts`

```typescript
describe('Seed Data Integration', () => {
  it('should have obligations linked to profiles', async () => {
    const result = await client.executeCypher(`
      MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)
      RETURN count(o) as count
    `);
    expect(result[0].count).toBeGreaterThan(0);
  });

  it('should have thresholds linked to jurisdiction', async () => {
    const result = await client.executeCypher(`
      MATCH (t:Threshold)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
      RETURN count(t) as count
    `);
    expect(result[0].count).toBeGreaterThan(0);
  });

  it('should have forms linked to obligations', async () => {
    const result = await client.executeCypher(`
      MATCH (o:Obligation)-[:REQUIRES_FORM]->(f:Form)
      RETURN count(f) as count
    `);
    expect(result[0].count).toBeGreaterThan(0);
  });
});
```

---

## 10. Validation Checklist

After each phase, verify:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] New node types appear in ingress guard whitelist
- [ ] New relationships appear in ingress guard whitelist
- [ ] Property whitelist includes all new node properties
- [ ] Seed data loads without errors
- [ ] GraphClient methods return expected data
- [ ] Schema documentation is updated

---

## 11. Migration Notes

### For existing deployments:

1. **Schema changes are additive** - No existing data needs modification
2. **Run seed scripts** - New node types require seeding
3. **Update ingress guard first** - Before any writes with new types
4. **GraphClient is backwards compatible** - New methods don't affect existing ones

### Rollback procedure:

If issues arise:
1. New node types can be deleted: `MATCH (n:Obligation) DETACH DELETE n`
2. New relationships are isolated to new nodes
3. Ingress guard changes are code-only (no data migration)

---

## 12. Success Metrics

After full implementation, the system should be able to:

1. **Answer obligation queries:**
   - "What must a single-director company file by end of year?"
   - "What forms do I need to claim Jobseeker's Benefit?"

2. **Support numeric scenario comparisons:**
   - "Am I near any CGT threshold?"
   - "What's my marginal tax rate at €50,000 income?"

3. **Enable event-driven guidance:**
   - "I'm having a baby - what benefits can I claim?"
   - "I'm starting a business - what are my obligations?"

4. **Provide complete compliance workflows:**
   - Obligation → Deadline → Form → Penalty (if missed)
