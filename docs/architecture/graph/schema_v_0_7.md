# Graph Schema Spec v0.7 – Regulatory Intelligence Copilot

> **Status:** Draft v0.7
> **Supersedes:** `docs/architecture/graph/schema_v_0_6.md`
> **Scope:** Enhanced Memgraph rules graph with comprehensive regulatory modelling including obligations, thresholds, rates, authorities, and improved relationship semantics

This document is the **single source of truth** for how regulatory rules, benefits, obligations, and related entities are represented in **Memgraph**.

---

## Document History

| Version | Date | Summary |
|---------|------|---------|
| v0.7 | 2025-12-28 | Added Obligation, Threshold, Rate, Form, Authority, Contribution, Disqualification nodes; Added SUPERSEDES, TRIGGERS, STACKS_WITH, REDUCES relationships; Enhanced provenance tracking |
| v0.6 | 2025-12-15 | Added Concept layer and SKOS-style labels |
| v0.4 | 2025-11-01 | Graph Ingress Guard integration |
| v0.3 | 2025-10-01 | Timeline alignment and cross-jurisdiction support |

---

## Normative References

This schema spec must be read together with:

- `docs/architecture/architecture_v_0_7.md` (overall system architecture)
- `docs/architecture/graph/schema_changelog_v_0_7.md` (detailed changelog and migration notes)
- `docs/architecture/graph/schema_v_0_7_implementation_guide.md` (coding agent implementation guide)
- `docs/architecture/data_privacy_and_architecture_boundaries_v_0_1.md` (PII boundaries)
- `docs/architecture/guards/graph_ingress_v_0_1.md` (write-side validation)
- `docs/architecture/graph/special_jurisdictions_modelling_v_0_1.md` (IE/UK/NI/EU/IM/CTA)
- `docs/architecture/graph/algorithms_v_0_1.md` (optional graph algorithms)

All writes to Memgraph **must** go through `GraphWriteService` and obey this schema.

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. **Answer "what must I do" questions**
   Explicitly model regulatory **obligations** (filing requirements, registration duties, reporting obligations) alongside benefits and reliefs.

2. **Enable quantitative comparisons**
   Model **thresholds** (VAT registration limits, CGT exemptions) and **rates** (tax rates, contribution rates) as first-class nodes for cross-jurisdiction comparison and historical tracking.

3. **Track regulatory evolution**
   Use `SUPERSEDES` relationships to show how rules, rates, and thresholds change over time.

4. **Model cascading eligibility**
   Use `TRIGGERS`, `UNLOCKS`, and `STACKS_WITH` relationships to show how claiming one benefit/relief affects eligibility for others.

5. **Capture administrative structure**
   Model **authorities** (Revenue, DSP, Pensions Authority) and **forms** to answer practical "how do I claim this" questions.

6. **Support pension and contribution modelling**
   Explicitly model **contributions** (PRSI, pension) and how they count towards eligibility.

7. **Track provenance and confidence**
   Enhance relationship metadata to track where information came from and how confident we are in it.

8. **Remain backwards compatible**
   All v0.6 queries should continue to work; new features are additive.

### 1.2 Non-Goals

- Not a full legal document store – only summaries/links, not full texts.
- Not a per-user scenario store – fact patterns live in Supabase.
- Not a generic knowledge graph – focused on regulatory compliance.
- Not a replacement for professional advice – always include disclaimers.

---

## 2. Node Labels

This section defines all node labels. Labels marked with **[NEW v0.7]** are additions in this version.

### 2.1 Core Jurisdictional Nodes

#### `:Jurisdiction`

Represents a country, supranational entity, or well-defined jurisdiction.

**Properties**
- `id: string` – canonical code, e.g. `"IE"`, `"UK"`, `"EU"`
- `name: string` – e.g. `"Ireland"`
- `kind?: string` – `"STATE" | "SUPRANATIONAL" | "DEPENDENCY" | "OVERSEAS_TERRITORY"`
- `notes?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

#### `:Region`

Sub-jurisdictions or geographic regions with specific rules.

**Properties**
- `id: string` – e.g. `"UK_NI"`
- `name: string`
- `jurisdictionCode: string` – parent jurisdiction code
- `notes?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

#### `:Agreement` / `:Treaty`

International agreements or coordination frameworks.

**Properties**
- `id: string`
- `name: string`
- `type?: string` – `"TREATY" | "COORDINATION_REGIME" | "BILATERAL" | "MULTILATERAL"`
- `citation?: string`
- `source_url?: string`
- `summary?: string`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`
- `created_at: localdatetime`
- `updated_at: localdatetime`

#### `:Regime`

A regulatory regime or sub-system within a jurisdiction.

**Properties**
- `id: string`
- `name: string`
- `jurisdictionCode: string`
- `kind?: string` – `"SOCIAL_SECURITY" | "VAT" | "INCOME_TAX" | "CORPORATION_TAX" | "CGT" | "CUSTOMS" | "PENSIONS"`
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

---

### 2.2 Legislative Structure Nodes

#### `:Statute`

An Act or primary legislation.

**Properties**
- `id: string` – e.g. `"IE_TCA_1997"`
- `name: string` – e.g. `"Taxes Consolidation Act 1997"`
- `citation?: string`
- `source_url?: string`
- `enacted_date?: localdatetime`
- `repealed_date?: localdatetime`
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

#### `:Section`

A section, subsection, or article within a statute.

**Properties**
- `id: string` – e.g. `"IE_TCA_1997_s766"`
- `label: string` – e.g. `"s.766 R&D tax credit"`
- `heading?: string`
- `text_excerpt?: string` – short summary, not full text
- `summary?: string`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`
- `version?: int` – version number for tracking amendments
- `uncertainty_level?: string` – `"SETTLED" | "GUIDANCE_BASED" | "CASE_PENDING" | "UNSETTLED"`
- `created_at: localdatetime`
- `updated_at: localdatetime`

---

### 2.3 Benefit & Relief Nodes

#### `:Benefit`

A social welfare benefit, payment, or entitlement.

**Properties**
- `id: string` – e.g. `"IE_JOBSEEKERS_BENEFIT"`
- `label: string` – human-friendly name
- `description?: string`
- `category?: string` – `"UNEMPLOYMENT" | "SICKNESS" | "DISABILITY" | "PENSION" | "FAMILY" | "HOUSING" | "CARER"`
- `pref_label?: string` – SKOS prefLabel
- `alt_labels?: string[]` – SKOS altLabels
- `means_tested?: boolean`
- `contribution_based?: boolean`
- `taxable?: boolean`
- `created_at: localdatetime`
- `updated_at: localdatetime`

#### `:Relief`

A tax relief, credit, allowance, or exemption.

**Properties**
- `id: string` – e.g. `"IE_R_AND_D_TAX_CREDIT"`
- `label: string`
- `description?: string`
- `category?: string` – `"CORPORATION_TAX" | "INCOME_TAX" | "CGT" | "VAT" | "STAMP_DUTY" | "CAT"`
- `pref_label?: string`
- `alt_labels?: string[]`
- `refundable?: boolean` – whether the relief can result in a refund
- `carryforward_years?: int` – years unused relief can be carried forward
- `created_at: localdatetime`
- `updated_at: localdatetime`

---

### 2.4 **[NEW v0.7]** Obligation Node

#### `:Obligation`

**Purpose**: Represents something a person/entity MUST do – filing requirements, registration duties, reporting obligations, payment deadlines. This is critical because existing schema models what you CAN get (benefits, reliefs) but not what you MUST do.

**Why High Value**:
- Enables "what are my obligations as a single director?" queries
- Supports compliance checking and deadline tracking
- Models the penalty/consequence of non-compliance
- Essential for complete regulatory picture

**Properties**
- `id: string` – e.g. `"IE_PAYE_MONTHLY_FILING"`, `"IE_VAT_REGISTRATION"`
- `label: string` – e.g. `"Monthly PAYE Filing Requirement"`
- `description?: string`
- `category: string` – **Required**. One of:
  - `"FILING"` – tax returns, reports
  - `"REGISTRATION"` – registering for taxes, licenses
  - `"REPORTING"` – notifying authorities of changes
  - `"PAYMENT"` – paying taxes, contributions
  - `"RECORD_KEEPING"` – maintaining books/records
  - `"NOTIFICATION"` – informing of specific events
- `frequency?: string` – `"ONE_TIME" | "MONTHLY" | "QUARTERLY" | "ANNUAL" | "EVENT_TRIGGERED" | "CONTINUOUS"`
- `penalty_type?: string` – `"FIXED" | "PERCENTAGE" | "INTEREST" | "SURCHARGE" | "CRIMINAL" | "DISQUALIFICATION"`
- `penalty_amount?: number` – fixed penalty amount if applicable
- `penalty_rate?: number` – percentage penalty rate if applicable
- `jurisdictionCode: string`
- `administering_authority?: string` – e.g. `"REVENUE"`, `"DSP"`
- `pref_label?: string`
- `alt_labels?: string[]`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Example Obligations**:
```cypher
// VAT Registration Obligation
(:Obligation {
  id: "IE_VAT_REGISTRATION",
  label: "VAT Registration",
  category: "REGISTRATION",
  frequency: "ONE_TIME",
  penalty_type: "FIXED",
  jurisdictionCode: "IE",
  administering_authority: "REVENUE"
})

// Annual Tax Return
(:Obligation {
  id: "IE_FORM_11_FILING",
  label: "Form 11 Annual Self-Assessment",
  category: "FILING",
  frequency: "ANNUAL",
  penalty_type: "SURCHARGE",
  penalty_rate: 0.05,
  jurisdictionCode: "IE"
})
```

---

### 2.5 **[NEW v0.7]** Threshold Node

#### `:Threshold`

**Purpose**: Represents quantitative limits that determine eligibility, registration requirements, or benefit amounts. Currently embedded in `:Condition` nodes but lacks explicit modelling for comparison and tracking.

**Why High Value**:
- Enables "what's the VAT threshold in IE vs UK?" comparisons
- Tracks when thresholds change (Budget announcements)
- Supports inflation indexing queries
- Critical for eligibility determination

**Properties**
- `id: string` – e.g. `"IE_VAT_THRESHOLD_SERVICES_2024"`
- `label: string` – e.g. `"VAT Registration Threshold (Services)"`
- `value: float` – **Required**. The numeric threshold value
- `currency?: string` – `"EUR" | "GBP" | "USD"` (null for non-monetary)
- `unit?: string` – `"CURRENCY" | "DAYS" | "WEEKS" | "YEARS" | "PERCENTAGE" | "COUNT"`
- `period?: string` – `"ANNUAL" | "LIFETIME" | "PER_TRANSACTION" | "ROLLING_12_MONTH" | "TAX_YEAR"`
- `direction: string` – **Required**. `"ABOVE" | "BELOW" | "EQUAL" | "AT_OR_ABOVE" | "AT_OR_BELOW"`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`
- `inflation_indexed?: boolean`
- `index_reference?: string` – e.g. `"CPI"`, `"AVERAGE_EARNINGS"`
- `jurisdictionCode: string`
- `source_url?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Example Thresholds**:
```cypher
// VAT Registration Threshold
(:Threshold {
  id: "IE_VAT_THRESHOLD_SERVICES_2024",
  label: "VAT Registration Threshold (Services)",
  value: 37500,
  currency: "EUR",
  period: "ANNUAL",
  direction: "AT_OR_ABOVE",
  effective_from: datetime("2024-01-01"),
  jurisdictionCode: "IE"
})

// CGT Annual Exemption
(:Threshold {
  id: "IE_CGT_ANNUAL_EXEMPTION_2024",
  label: "CGT Annual Exemption",
  value: 1270,
  currency: "EUR",
  period: "TAX_YEAR",
  direction: "BELOW",
  jurisdictionCode: "IE"
})

// PRSI Contribution Weeks
(:Threshold {
  id: "IE_PRSI_MIN_CONTRIBUTIONS_JOBSEEKERS",
  label: "Minimum PRSI Contributions for Jobseeker's Benefit",
  value: 104,
  unit: "COUNT",
  period: "LIFETIME",
  direction: "AT_OR_ABOVE",
  jurisdictionCode: "IE"
})
```

---

### 2.6 **[NEW v0.7]** Rate Node

#### `:Rate`

**Purpose**: Represents percentage rates for taxes, contributions, benefits. Currently implicit in conditions/descriptions but not queryable.

**Why High Value**:
- Enables "what's the corporation tax rate in IE vs MT?" queries
- Tracks rate changes over time (Budget/Finance Act)
- Supports marginal rate calculations
- Essential for tax planning scenarios

**Properties**
- `id: string` – e.g. `"IE_CORPORATION_TAX_STANDARD_2024"`
- `label: string` – e.g. `"Standard Corporation Tax Rate"`
- `percentage: float` – **Required**. The rate as a decimal (e.g. 0.125 for 12.5%)
- `rate_type: string` – **Required**. One of:
  - `"FLAT"` – single rate applies
  - `"MARGINAL"` – rate applies to income above threshold
  - `"EFFECTIVE"` – blended/average rate
  - `"REDUCED"` – preferential rate for certain categories
  - `"STANDARD"` – default rate
- `base?: string` – what the rate applies to: `"GROSS_INCOME" | "TAXABLE_INCOME" | "CAPITAL_GAIN" | "TURNOVER" | "VALUE_ADDED"`
- `band_min?: float` – lower bound if marginal rate
- `band_max?: float` – upper bound if marginal rate (null = unlimited)
- `currency?: string` – currency for band values
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`
- `jurisdictionCode: string`
- `source_url?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Example Rates**:
```cypher
// Irish Corporation Tax
(:Rate {
  id: "IE_CORPORATION_TAX_STANDARD_2024",
  label: "Standard Corporation Tax Rate",
  percentage: 0.125,
  rate_type: "STANDARD",
  base: "TAXABLE_INCOME",
  jurisdictionCode: "IE"
})

// Irish Higher Income Tax Rate
(:Rate {
  id: "IE_INCOME_TAX_HIGHER_2024",
  label: "Higher Rate Income Tax",
  percentage: 0.40,
  rate_type: "MARGINAL",
  base: "TAXABLE_INCOME",
  band_min: 42000,
  currency: "EUR",
  jurisdictionCode: "IE"
})

// PRSI Class S Rate
(:Rate {
  id: "IE_PRSI_CLASS_S_2024",
  label: "PRSI Class S Rate",
  percentage: 0.04,
  rate_type: "FLAT",
  base: "GROSS_INCOME",
  jurisdictionCode: "IE"
})
```

---

### 2.7 **[NEW v0.7]** Authority Node

#### `:Authority`

**Purpose**: Represents regulatory bodies, government agencies, and administrative authorities. Currently `issued_by` is a string on `:Guidance` but lacks graph structure.

**Why High Value**:
- Enables "who administers this benefit?" queries
- Models appeal paths and jurisdictional responsibilities
- Supports practical "where do I go?" guidance
- Links guidance/cases to authoritative sources

**Properties**
- `id: string` – e.g. `"IE_REVENUE"`, `"IE_DSP"`, `"UK_HMRC"`
- `name: string` – e.g. `"Office of the Revenue Commissioners"`
- `short_name?: string` – e.g. `"Revenue"`
- `jurisdictionCode: string`
- `domains: string[]` – areas of responsibility: `["TAX", "CUSTOMS"]`, `["SOCIAL_WELFARE"]`
- `website?: string`
- `contact_url?: string` – URL for contact/help
- `parent_authority_id?: string` – for hierarchical authorities
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Example Authorities**:
```cypher
(:Authority {
  id: "IE_REVENUE",
  name: "Office of the Revenue Commissioners",
  short_name: "Revenue",
  jurisdictionCode: "IE",
  domains: ["TAX", "CUSTOMS", "VAT"],
  website: "https://www.revenue.ie"
})

(:Authority {
  id: "IE_DSP",
  name: "Department of Social Protection",
  short_name: "DSP",
  jurisdictionCode: "IE",
  domains: ["SOCIAL_WELFARE", "PENSIONS"],
  website: "https://www.gov.ie/dsp"
})
```

---

### 2.8 **[NEW v0.7]** Form Node

#### `:Form`

**Purpose**: Represents official forms, returns, and applications required to claim benefits, reliefs, or meet obligations.

**Why High Value**:
- Answers "what form do I need to file?" questions
- Links obligations to concrete actions
- Supports deadline tracking
- Practical guidance for compliance

**Properties**
- `id: string` – e.g. `"IE_FORM_11"`, `"IE_FORM_CT1"`
- `name: string` – e.g. `"Form 11 (Self-Assessment)"`
- `form_code?: string` – official form number
- `description?: string`
- `form_type: string` – `"TAX_RETURN" | "APPLICATION" | "NOTIFICATION" | "CLAIM" | "REGISTRATION" | "REPORT"`
- `electronic_available: boolean`
- `paper_available?: boolean`
- `source_url?: string` – where to get/file the form
- `jurisdictionCode: string`
- `administering_authority_id?: string` – reference to `:Authority`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Example Forms**:
```cypher
(:Form {
  id: "IE_FORM_11",
  name: "Form 11 (Self-Assessment Income Tax Return)",
  form_code: "Form 11",
  form_type: "TAX_RETURN",
  electronic_available: true,
  paper_available: true,
  source_url: "https://www.revenue.ie/en/self-assessment-and-self-employment/filing-your-tax-return/index.aspx",
  jurisdictionCode: "IE",
  administering_authority_id: "IE_REVENUE"
})
```

---

### 2.9 **[NEW v0.7]** Contribution Node

#### `:Contribution`

**Purpose**: Represents contributions (PRSI, pension, levy) that count towards eligibility for benefits.

**Why High Value**:
- Models how contributions unlock benefits
- Supports "how many contributions do I need?" queries
- Tracks voluntary vs mandatory contributions
- Essential for pension and social welfare reasoning

**Properties**
- `id: string` – e.g. `"IE_PRSI_CLASS_S"`, `"IE_PRSA_CONTRIBUTION"`
- `label: string` – e.g. `"Class S PRSI Contribution"`
- `description?: string`
- `contribution_type: string` – `"MANDATORY" | "VOLUNTARY" | "CREDITED" | "EMPLOYER" | "EMPLOYEE"`
- `category: string` – `"PRSI" | "PENSION" | "LEVY" | "USC" | "SOCIAL_INSURANCE"`
- `class_code?: string` – e.g. `"S"`, `"A"`, `"B"` for PRSI
- `jurisdictionCode: string`
- `administering_authority_id?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Example Contributions**:
```cypher
(:Contribution {
  id: "IE_PRSI_CLASS_S",
  label: "Class S PRSI Contribution",
  description: "Social insurance for self-employed persons",
  contribution_type: "MANDATORY",
  category: "PRSI",
  class_code: "S",
  jurisdictionCode: "IE",
  administering_authority_id: "IE_REVENUE"
})
```

---

### 2.10 **[NEW v0.7]** Disqualification Node

#### `:Disqualification`

**Purpose**: Represents events or conditions that disqualify someone from benefits, reliefs, or holding certain positions.

**Why High Value**:
- Models negative consequences of actions
- Supports "what would disqualify me?" queries
- Essential for compliance risk assessment
- Links to director disqualification, benefit fraud, etc.

**Properties**
- `id: string` – e.g. `"IE_DIRECTOR_DISQUALIFICATION"`, `"IE_BENEFIT_DISQUALIFICATION_FRAUD"`
- `label: string` – e.g. `"Company Director Disqualification"`
- `description?: string`
- `category: string` – `"OFFICE_HOLDER" | "BENEFIT" | "RELIEF" | "LICENSE" | "PROFESSION"`
- `trigger_type?: string` – what causes it: `"CONVICTION" | "NON_COMPLIANCE" | "FRAUD" | "INSOLVENCY" | "CONDUCT"`
- `duration_min_months?: int` – minimum disqualification period
- `duration_max_months?: int` – maximum disqualification period (null = permanent)
- `jurisdictionCode: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

---

### 2.11 Existing Nodes (Unchanged from v0.6)

The following nodes are unchanged from v0.6:

- `:Condition` – eligibility conditions
- `:Timeline` – time constructs (lookbacks, lock-ins, deadlines)
- `:Case` – court/tribunal decisions
- `:Guidance` – non-binding guidance documents
- `:EURegulation` / `:EUDirective` – EU instruments
- `:ProfileTag` – user personas
- `:Update` / `:ChangeEvent` – regulatory change events
- `:Concept` – SKOS-style regulatory concepts
- `:Label` – alternative labels for concepts

See v0.6 schema for full property definitions.

---

## 3. Relationship Types

### 3.1 Structural Relationships (Existing)

```cypher
(:Section)-[:PART_OF]->(:Statute)
(:Section)-[:SUBSECTION_OF]->(:Section)
(:X)-[:IN_JURISDICTION]->(:Jurisdiction)
(:Region)-[:PART_OF]->(:Jurisdiction)
(:Regime)-[:APPLIES_IN]->(:Jurisdiction)
(:Agreement)-[:COVERS]->(:Jurisdiction|:Region)
```

### 3.2 Applicability & Tagging (Existing)

```cypher
(:Benefit)-[:APPLIES_TO]->(:ProfileTag)
(:Relief)-[:APPLIES_TO]->(:ProfileTag)
(:Section)-[:APPLIES_TO]->(:ProfileTag)
```

**[NEW v0.7]** Extended to new node types:
```cypher
(:Obligation)-[:APPLIES_TO]->(:ProfileTag)
(:Contribution)-[:APPLIES_TO]->(:ProfileTag)
```

### 3.3 **[NEW v0.7]** Obligation Relationships

```cypher
// What profile must fulfill this obligation
(:ProfileTag)-[:SUBJECT_TO]->(:Obligation)

// Claiming a benefit/relief triggers an obligation
(:Benefit)-[:TRIGGERS_OBLIGATION]->(:Obligation)
(:Relief)-[:TRIGGERS_OBLIGATION]->(:Obligation)

// Obligation satisfied by filing a form
(:Obligation)-[:SATISFIED_BY]->(:Form)

// Obligation has a deadline
(:Obligation)-[:FILING_DEADLINE]->(:Timeline)

// Obligation administered by authority
(:Obligation)-[:ADMINISTERED_BY]->(:Authority)

// Penalty for breaching obligation
(:Obligation)-[:PENALTY_DEFINED_BY]->(:Section)
```

**Why High Value**: These relationships enable complete compliance modelling - from "what must I do" through "how do I do it" to "what happens if I don't".

### 3.4 **[NEW v0.7]** Threshold & Rate Relationships

```cypher
// Condition uses a specific threshold
(:Condition)-[:HAS_THRESHOLD]->(:Threshold)

// Obligation triggered when threshold crossed
(:Threshold)-[:TRIGGERS]->(:Obligation)

// Benefit/Relief/Obligation uses a specific rate
(:Benefit)-[:HAS_RATE]->(:Rate)
(:Relief)-[:HAS_RATE]->(:Rate)
(:Obligation)-[:HAS_RATE]->(:Rate)
(:Contribution)-[:HAS_RATE]->(:Rate)

// Cross-jurisdiction threshold comparison
(:Threshold)-[:EQUIVALENT_TO { confidence: float }]->(:Threshold)
(:Rate)-[:EQUIVALENT_TO { confidence: float }]->(:Rate)
```

### 3.5 **[NEW v0.7]** SUPERSEDES Relationship

**Purpose**: Tracks when one rule, rate, threshold, or benefit replaces another over time.

```cypher
(:Section)-[:SUPERSEDES { effective_from: datetime, reason?: string }]->(:Section)
(:Rate)-[:SUPERSEDES]->(:Rate)
(:Threshold)-[:SUPERSEDES]->(:Threshold)
(:Benefit)-[:SUPERSEDES]->(:Benefit)
(:Relief)-[:SUPERSEDES]->(:Relief)
(:Guidance)-[:SUPERSEDES]->(:Guidance)
```

**Why High Value**: Enables historical queries ("what was the rule before?") and change tracking ("how has this evolved?").

**Example**:
```cypher
// 2024 VAT threshold supersedes 2023 threshold
(:Threshold { id: "IE_VAT_THRESHOLD_2024" })-[:SUPERSEDES {
  effective_from: datetime("2024-01-01"),
  reason: "Budget 2024 increase"
}]->(:Threshold { id: "IE_VAT_THRESHOLD_2023" })
```

### 3.6 **[NEW v0.7]** TRIGGERS / UNLOCKS Relationships

**Purpose**: Models cascading eligibility where claiming one benefit/relief affects eligibility for others.

```cypher
// Claiming A unlocks eligibility for B
(:Benefit)-[:UNLOCKS { condition?: string }]->(:Benefit)
(:Relief)-[:UNLOCKS]->(:Relief)
(:Benefit)-[:UNLOCKS]->(:Relief)

// Receiving A triggers automatic enrollment/eligibility for B
(:Benefit)-[:TRIGGERS]->(:Benefit)

// A contribution type counts towards a condition
(:Contribution)-[:COUNTS_TOWARDS]->(:Condition)

// Employment/activity satisfies a condition
(:Section)-[:SATISFIES]->(:Condition)
```

**Why High Value**: Answers "if I claim X, what else becomes available?" and "how do my contributions help me?"

**Example**:
```cypher
// Getting Illness Benefit unlocks Invalidity Pension after 12 months
(:Benefit { id: "IE_ILLNESS_BENEFIT" })-[:UNLOCKS {
  condition: "After 12 months continuous claim"
}]->(:Benefit { id: "IE_INVALIDITY_PENSION" })

// PRSI contributions count towards Jobseeker's eligibility
(:Contribution { id: "IE_PRSI_CLASS_S" })-[:COUNTS_TOWARDS]->(:Condition { id: "IE_PRSI_104_WEEKS" })
```

### 3.7 **[NEW v0.7]** STACKS_WITH Relationship

**Purpose**: Explicitly models benefits/reliefs that CAN be combined (complement to MUTUALLY_EXCLUSIVE_WITH).

```cypher
(:Benefit)-[:STACKS_WITH {
  max_combined_value?: float,
  conditions?: string
}]->(:Benefit)

(:Relief)-[:STACKS_WITH]->(:Relief)
```

**Why High Value**: Answers "which benefits can I claim together?" - the positive complement to mutual exclusion queries.

**Example**:
```cypher
// Fuel Allowance can be claimed with State Pension
(:Benefit { id: "IE_FUEL_ALLOWANCE" })-[:STACKS_WITH]->(:Benefit { id: "IE_STATE_PENSION_CONTRIBUTORY" })
```

### 3.8 **[NEW v0.7]** REDUCES / OFFSETS Relationships

**Purpose**: Models where one factor reduces another (means testing, offsets).

```cypher
// Income above threshold reduces benefit amount
(:Condition)-[:REDUCES { rate?: float, formula?: string }]->(:Benefit)

// One relief offsets liability for another
(:Relief)-[:OFFSETS]->(:Obligation)

// Foreign tax credit offsets Irish tax
(:Relief)-[:OFFSETS { basis?: string }]->(:Relief)
```

**Why High Value**: Essential for means-tested benefits and understanding effective rates.

### 3.9 **[NEW v0.7]** Authority Relationships

```cypher
// Authority administers benefit/relief/obligation
(:Authority)-[:ADMINISTERS]->(:Benefit)
(:Authority)-[:ADMINISTERS]->(:Relief)
(:Authority)-[:ADMINISTERS]->(:Obligation)

// Guidance issued by authority
(:Guidance)-[:ISSUED_BY]->(:Authority)
(:Case)-[:DECIDED_BY]->(:Authority)

// Appeal path between authorities
(:Authority)-[:APPEALS_TO]->(:Authority)

// Authority in jurisdiction
(:Authority)-[:IN_JURISDICTION]->(:Jurisdiction)
```

### 3.10 **[NEW v0.7]** Form Relationships

```cypher
// Benefit/Relief claimed via form
(:Benefit)-[:CLAIMED_VIA]->(:Form)
(:Relief)-[:CLAIMED_VIA]->(:Form)

// Form has deadline
(:Form)-[:FILING_DEADLINE]->(:Timeline)

// Form submitted to authority
(:Form)-[:SUBMITTED_TO]->(:Authority)
```

### 3.11 **[NEW v0.7]** Disqualification Relationships

```cypher
// Section can trigger disqualification
(:Section)-[:CAN_TRIGGER]->(:Disqualification)

// Disqualification prevents access to benefit/relief
(:Disqualification)-[:DISQUALIFIES_FROM]->(:Benefit)
(:Disqualification)-[:DISQUALIFIES_FROM]->(:Relief)
(:Disqualification)-[:DISQUALIFIES_FROM]->(:ProfileTag)

// Disqualification has duration
(:Disqualification)-[:DURATION]->(:Timeline)
```

### 3.12 **[NEW v0.7]** GRANDFATHERED_BY Relationship

**Purpose**: Models transitional provisions where old rules continue to apply to certain cohorts.

```cypher
(:Section)-[:GRANDFATHERED_BY {
  cohort?: string,
  until?: datetime,
  condition?: string
}]->(:Update)

(:Benefit)-[:GRANDFATHERED_BY]->(:Update)
```

**Example**:
```cypher
// Old pension age rules grandfathered for those born before 1961
(:Section { id: "IE_OLD_PENSION_AGE" })-[:GRANDFATHERED_BY {
  cohort: "Born before 1961",
  condition: "Contributions made before 2012"
}]->(:Update { id: "PENSIONS_ACT_2011" })
```

### 3.13 **[NEW v0.7]** Enhanced Provenance Properties

All relationships can now include optional provenance metadata:

```typescript
interface RelationshipProvenance {
  // Source of the information
  source_type?: 'LEGISLATION' | 'CASE_LAW' | 'GUIDANCE' | 'LLM_INFERRED' | 'HUMAN_VERIFIED';
  source_id?: string;       // ID of source node (Section, Case, Guidance)
  source_url?: string;      // Direct URL to source

  // Confidence and verification
  confidence?: float;       // 0.0 - 1.0, how confident we are
  verified_by?: string;     // Verifier identifier (not PII)
  verified_at?: datetime;

  // Extraction metadata
  extraction_method?: 'MCP_TOOL' | 'MANUAL' | 'LLM_EXTRACTION' | 'STATUTORY_REFERENCE';
  extraction_date?: datetime;

  // Standard timestamps
  created_at?: datetime;
  updated_at?: datetime;
}
```

**Why High Value**: Enables trust assessment, source attribution, and identification of low-confidence relationships that need verification.

**Example**:
```cypher
(:Benefit)-[:EXCLUDES {
  reason: "Cannot claim both simultaneously",
  basis: "DSP Guidelines",
  source_type: "GUIDANCE",
  source_id: "IE_DSP_GUIDELINES_2024",
  confidence: 0.95,
  verified_by: "ingestion_pipeline_v2",
  verified_at: datetime("2024-12-01")
}]->(:Benefit)
```

### 3.14 Existing Relationships (Unchanged)

All v0.6 relationships remain valid:

- `REQUIRES`, `LIMITED_BY` – eligibility conditions
- `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH` – conflicts
- `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY` – timelines
- `CITES`, `INTERPRETS`, `APPLIES_TO` – cross-references
- `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO` – cross-border
- `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES` – change tracking
- `HAS_ALT_LABEL`, `ALIGNS_WITH`, `DERIVED_FROM` – concept layer

---

## 4. Query Patterns

### 4.1 Obligation Queries

```cypher
// What obligations does a single director in Ireland have?
MATCH (p:ProfileTag {id: "PROFILE_SINGLE_DIRECTOR_IE"})
MATCH (p)-[:SUBJECT_TO]->(o:Obligation)
WHERE o.jurisdictionCode = "IE"
OPTIONAL MATCH (o)-[:FILING_DEADLINE]->(t:Timeline)
OPTIONAL MATCH (o)-[:SATISFIED_BY]->(f:Form)
RETURN o, t, f
ORDER BY o.frequency, o.label
```

```cypher
// What happens if I claim R&D credit? (triggered obligations)
MATCH (r:Relief {id: "IE_R_AND_D_TAX_CREDIT"})
OPTIONAL MATCH (r)-[:TRIGGERS_OBLIGATION]->(o:Obligation)
OPTIONAL MATCH (o)-[:SATISFIED_BY]->(f:Form)
OPTIONAL MATCH (o)-[:FILING_DEADLINE]->(t:Timeline)
RETURN r, collect({obligation: o, form: f, deadline: t}) AS triggered_obligations
```

### 4.2 Threshold Comparison Queries

```cypher
// Compare VAT registration thresholds across jurisdictions
MATCH (t:Threshold)
WHERE t.label CONTAINS "VAT" AND t.label CONTAINS "Registration"
AND t.effective_to IS NULL  // Current thresholds only
RETURN t.jurisdictionCode AS jurisdiction, t.value AS threshold, t.currency
ORDER BY t.value DESC
```

```cypher
// Track threshold changes over time
MATCH (current:Threshold {id: "IE_VAT_THRESHOLD_SERVICES_2024"})
MATCH path = (current)-[:SUPERSEDES*]->(historical:Threshold)
RETURN [n IN nodes(path) | {
  id: n.id,
  value: n.value,
  effective_from: n.effective_from
}] AS threshold_history
```

### 4.3 Rate Comparison Queries

```cypher
// Compare corporation tax rates: Ireland vs Malta
MATCH (r:Rate)
WHERE r.label CONTAINS "Corporation Tax"
AND r.rate_type = "STANDARD"
AND r.jurisdictionCode IN ["IE", "MT"]
AND r.effective_to IS NULL
RETURN r.jurisdictionCode, r.percentage, r.effective_from
```

### 4.4 Cascading Eligibility Queries

```cypher
// What benefits does claiming Illness Benefit unlock?
MATCH (b:Benefit {id: "IE_ILLNESS_BENEFIT"})
OPTIONAL MATCH (b)-[r:UNLOCKS|TRIGGERS]->(unlocked)
RETURN b.label AS claimed_benefit,
       type(r) AS relationship,
       r.condition AS condition,
       unlocked.label AS unlocked_benefit
```

```cypher
// What benefits can be stacked with State Pension?
MATCH (p:Benefit {id: "IE_STATE_PENSION_CONTRIBUTORY"})
MATCH (p)-[:STACKS_WITH]-(stackable:Benefit)
RETURN stackable.label, stackable.category
```

### 4.5 Contribution Tracking Queries

```cypher
// How do my PRSI contributions help me?
MATCH (c:Contribution {id: "IE_PRSI_CLASS_S"})
MATCH (c)-[:COUNTS_TOWARDS]->(cond:Condition)
MATCH (b:Benefit)-[:REQUIRES]->(cond)
RETURN c.label AS contribution_type,
       cond.label AS condition,
       b.label AS unlocks_benefit
```

### 4.6 Authority and Form Queries

```cypher
// Who administers Jobseeker's Benefit and what form do I need?
MATCH (b:Benefit {id: "IE_JOBSEEKERS_BENEFIT"})
OPTIONAL MATCH (a:Authority)-[:ADMINISTERS]->(b)
OPTIONAL MATCH (b)-[:CLAIMED_VIA]->(f:Form)
RETURN b.label, a.name AS authority, a.website, f.name AS form, f.source_url
```

---

## 5. Example: Complete Single Director Graph Slice

This example shows how the new nodes and relationships work together for a single director in Ireland:

```cypher
// Profile
(:ProfileTag {id: "PROFILE_SINGLE_DIRECTOR_IE", label: "Single Director, Irish LTD"})

// Obligations they're subject to
-[:SUBJECT_TO]->(:Obligation {id: "IE_CORPORATION_TAX_FILING", category: "FILING"})
-[:SUBJECT_TO]->(:Obligation {id: "IE_ANNUAL_RETURN_CRO", category: "FILING"})
-[:SUBJECT_TO]->(:Obligation {id: "IE_PAYE_REGISTRATION", category: "REGISTRATION"})

// Thresholds that affect them
(:Threshold {id: "IE_AUDIT_EXEMPTION_TURNOVER", value: 12000000})
(:Threshold {id: "IE_VAT_THRESHOLD_GOODS", value: 80000})

// Rates that apply
(:Rate {id: "IE_CORPORATION_TAX_12_5", percentage: 0.125})
(:Rate {id: "IE_PRSI_CLASS_S", percentage: 0.04})

// Contributions they pay
(:Contribution {id: "IE_PRSI_CLASS_S"})-[:HAS_RATE]->(:Rate {id: "IE_PRSI_CLASS_S"})

// Benefits available (with conditions)
(:Benefit {id: "IE_JOBSEEKERS_BENEFIT_SE"})
  -[:REQUIRES]->(:Condition {id: "IE_PRSI_104_WEEKS"})
  -[:HAS_THRESHOLD]->(:Threshold {id: "IE_PRSI_MIN_CONTRIBUTIONS"})

// Forms needed
(:Obligation {id: "IE_CORPORATION_TAX_FILING"})-[:SATISFIED_BY]->(:Form {id: "IE_FORM_CT1"})

// Administering authority
(:Authority {id: "IE_REVENUE"})-[:ADMINISTERS]->(:Obligation {id: "IE_CORPORATION_TAX_FILING"})
```

---

## 6. Ingestion Guidelines

### 6.1 General Principles (Unchanged)

1. Use `:Jurisdiction` consistently on all rule-like nodes
2. Prefer stable IDs that won't change
3. Store summaries, not full texts
4. Encode relationships, not narrative
5. Keep the graph user-agnostic (no PII)
6. Support idempotent upsert patterns
7. Maintain `created_at`/`updated_at` timestamps

### 6.2 **[NEW v0.7]** Obligation Ingestion

When ingesting obligations:

1. **Identify the obligation category** – Is it FILING, REGISTRATION, PAYMENT, etc.?
2. **Link to ProfileTags** – Who is subject to this obligation?
3. **Link to Forms** – What form satisfies this obligation?
4. **Link to Timelines** – What's the deadline?
5. **Link to Authority** – Who administers it?
6. **Capture penalty information** – What happens on non-compliance?

### 6.3 **[NEW v0.7]** Threshold & Rate Ingestion

When ingesting thresholds and rates:

1. **Include effective dates** – Critical for historical queries
2. **Create SUPERSEDES chains** – Link new to old when values change
3. **Include source attribution** – Link to statutory source
4. **Use consistent units** – Always use decimal for percentages (0.125 not 12.5)
5. **Include currency codes** – For monetary thresholds

### 6.4 **[NEW v0.7]** Provenance Guidelines

For all relationships:

1. **Set source_type** – Where did this relationship come from?
2. **Set confidence** – How confident are we? (default 0.7 for LLM-extracted, 0.95 for statutory)
3. **Include source_id** – Reference the source node when available
4. **Update on verification** – Set verified_at when human-reviewed

---

## 7. Graph Ingress Guard Updates

The Graph Ingress Guard must be updated to whitelist the new node labels and relationships:

### 7.1 New Allowed Node Labels

```typescript
const ALLOWED_NODE_LABELS_V07 = [
  // Existing v0.6 labels
  'Jurisdiction', 'Region', 'Agreement', 'Treaty', 'Regime',
  'Statute', 'Section', 'Benefit', 'Relief', 'Condition', 'Timeline',
  'Case', 'Guidance', 'EURegulation', 'EUDirective',
  'ProfileTag', 'Update', 'ChangeEvent', 'Concept', 'Label',

  // NEW v0.7 labels
  'Obligation',
  'Threshold',
  'Rate',
  'Authority',
  'Form',
  'Contribution',
  'Disqualification'
];
```

### 7.2 New Allowed Relationship Types

```typescript
const ALLOWED_RELATIONSHIP_TYPES_V07 = [
  // Existing v0.6 relationships
  'PART_OF', 'SUBSECTION_OF', 'IN_JURISDICTION', 'APPLIES_IN', 'COVERS',
  'APPLIES_TO', 'CITES', 'INTERPRETS', 'REQUIRES', 'LIMITED_BY',
  'EXCLUDES', 'MUTUALLY_EXCLUSIVE_WITH',
  'LOOKBACK_WINDOW', 'LOCKS_IN_FOR_PERIOD', 'FILING_DEADLINE',
  'EFFECTIVE_WINDOW', 'USAGE_FREQUENCY',
  'COORDINATED_WITH', 'TREATY_LINKED_TO', 'EQUIVALENT_TO',
  'AFFECTS', 'CHANGES_INTERPRETATION_OF', 'UPDATES',
  'HAS_ALT_LABEL', 'ALIGNS_WITH', 'DERIVED_FROM',

  // NEW v0.7 relationships
  'SUBJECT_TO',
  'TRIGGERS_OBLIGATION',
  'SATISFIED_BY',
  'ADMINISTERED_BY',
  'PENALTY_DEFINED_BY',
  'HAS_THRESHOLD',
  'HAS_RATE',
  'SUPERSEDES',
  'TRIGGERS',
  'UNLOCKS',
  'COUNTS_TOWARDS',
  'SATISFIES',
  'STACKS_WITH',
  'REDUCES',
  'OFFSETS',
  'ISSUED_BY',
  'DECIDED_BY',
  'APPEALS_TO',
  'ADMINISTERS',
  'CLAIMED_VIA',
  'SUBMITTED_TO',
  'CAN_TRIGGER',
  'DISQUALIFIES_FROM',
  'DURATION',
  'GRANDFATHERED_BY'
];
```

### 7.3 Property Whitelists

New property whitelists for v0.7 nodes:

```typescript
const PROPERTY_WHITELISTS_V07 = {
  Obligation: [
    'id', 'label', 'description', 'category', 'frequency',
    'penalty_type', 'penalty_amount', 'penalty_rate',
    'jurisdictionCode', 'administering_authority',
    'pref_label', 'alt_labels', 'created_at', 'updated_at'
  ],
  Threshold: [
    'id', 'label', 'value', 'currency', 'unit', 'period', 'direction',
    'effective_from', 'effective_to', 'inflation_indexed', 'index_reference',
    'jurisdictionCode', 'source_url', 'created_at', 'updated_at'
  ],
  Rate: [
    'id', 'label', 'percentage', 'rate_type', 'base',
    'band_min', 'band_max', 'currency',
    'effective_from', 'effective_to',
    'jurisdictionCode', 'source_url', 'created_at', 'updated_at'
  ],
  Authority: [
    'id', 'name', 'short_name', 'jurisdictionCode', 'domains',
    'website', 'contact_url', 'parent_authority_id',
    'created_at', 'updated_at'
  ],
  Form: [
    'id', 'name', 'form_code', 'description', 'form_type',
    'electronic_available', 'paper_available', 'source_url',
    'jurisdictionCode', 'administering_authority_id',
    'created_at', 'updated_at'
  ],
  Contribution: [
    'id', 'label', 'description', 'contribution_type', 'category',
    'class_code', 'jurisdictionCode', 'administering_authority_id',
    'created_at', 'updated_at'
  ],
  Disqualification: [
    'id', 'label', 'description', 'category', 'trigger_type',
    'duration_min_months', 'duration_max_months', 'jurisdictionCode',
    'created_at', 'updated_at'
  ]
};
```

---

## 8. Versioning & Migration

### 8.1 Migration from v0.6 to v0.7

1. **No breaking changes** – All v0.6 queries continue to work
2. **Additive only** – New nodes and relationships are optional
3. **Gradual adoption** – Ingest new node types as data becomes available

### 8.2 Recommended Migration Steps

1. Update Graph Ingress Guard with new whitelists
2. Deploy updated GraphWriteService with new node type support
3. Create seed data for core authorities (Revenue, DSP, HMRC)
4. Begin ingesting obligations, thresholds, rates as encountered
5. Backfill SUPERSEDES relationships for known historical changes
6. Add provenance metadata to existing relationships over time

---

## 9. Scope of v0.7

This schema is sufficient for:

- **Complete compliance modelling** – What must I do, not just what can I get
- **Quantitative analysis** – Threshold and rate comparisons across jurisdictions
- **Cascading eligibility** – How claiming one thing affects eligibility for others
- **Historical tracking** – How rules, rates, and thresholds have changed
- **Practical guidance** – Which forms to file and which authorities to contact
- **Trust and explainability** – Source attribution and confidence levels

Agents and ingestion jobs should treat this document as the **authoritative specification** for how they structure and query the regulatory graph in v0.7.

---

## Appendix A: Node Type Summary

| Node Label | Purpose | Priority | New in v0.7 |
|------------|---------|----------|-------------|
| `:Obligation` | Filing/registration/payment requirements | HIGH | Yes |
| `:Threshold` | Quantitative limits and eligibility thresholds | HIGH | Yes |
| `:Rate` | Tax/contribution rates | HIGH | Yes |
| `:Authority` | Regulatory bodies and agencies | MEDIUM | Yes |
| `:Form` | Official forms and returns | MEDIUM | Yes |
| `:Contribution` | PRSI/pension contributions | MEDIUM | Yes |
| `:Disqualification` | Disqualification events | MEDIUM | Yes |

## Appendix B: Relationship Type Summary

| Relationship | From | To | Purpose | New in v0.7 |
|--------------|------|-----|---------|-------------|
| `SUPERSEDES` | Any rule node | Same type | Historical tracking | Yes |
| `TRIGGERS` | Benefit/Relief | Benefit/Obligation | Cascading eligibility | Yes |
| `UNLOCKS` | Benefit/Relief | Benefit/Relief | Conditional eligibility | Yes |
| `STACKS_WITH` | Benefit/Relief | Benefit/Relief | Combinable items | Yes |
| `COUNTS_TOWARDS` | Contribution | Condition | Contribution tracking | Yes |
| `HAS_THRESHOLD` | Condition | Threshold | Threshold linking | Yes |
| `HAS_RATE` | Various | Rate | Rate linking | Yes |
| `ADMINISTERED_BY` | Various | Authority | Authority responsibility | Yes |
| `CLAIMED_VIA` | Benefit/Relief | Form | Claim mechanism | Yes |
| `REDUCES` | Condition | Benefit | Means testing | Yes |
| `GRANDFATHERED_BY` | Section/Benefit | Update | Transitional provisions | Yes |

---

**End of Schema Spec v0.7**
