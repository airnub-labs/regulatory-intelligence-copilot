# Regulatory Graph Extensibility & Compliance Framework Support

**Version:** 1.0
**Date:** 2025-12-31
**Status:** Strategic Analysis & Roadmap
**Author:** Architecture Review

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Mission & Vision Clarification](#mission--vision-clarification)
3. [Current Implementation Status](#current-implementation-status)
4. [Original Gap Analysis Review](#original-gap-analysis-review)
5. [High-Value Schema Enhancements](#high-value-schema-enhancements)
6. [Concept Capture & Auto-Population Enhancements](#concept-capture--auto-population-enhancements)
7. [GDPR & SOC 2 Compatibility Analysis](#gdpr--soc-2-compatibility-analysis)
8. [Cross-Framework Mapping: The Killer Feature](#cross-framework-mapping-the-killer-feature)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Use Cases Enabled](#use-cases-enabled)
11. [Appendix: Complete Schema Additions](#appendix-complete-schema-additions)

---

## Executive Summary

This document captures a comprehensive strategic analysis of the Regulatory Intelligence Copilot's graph schema, evaluating its current capabilities, identifying gaps, and proposing enhancements to support:

1. **Multi-domain regulatory compliance** (tax, welfare, pensions, data protection, security)
2. **Multi-framework support** (GDPR, SOC 2, ISO 27001, industry-specific regulations)
3. **Cross-framework mapping** (showing how different compliance requirements overlap)
4. **Automated graph population** from regulatory sources

### Key Findings

| Aspect | Status | Assessment |
|--------|--------|------------|
| **Core schema maturity** | ✅ Excellent | 32 node types, 83+ relationship types implemented |
| **Tax/Welfare domain** | ✅ Complete | Fully supports IE/UK/EU tax and social welfare |
| **Original Tier 1 proposals** | ✅ Implemented | Obligation, Threshold, Rate, Form, Authority all done |
| **Auto-population mechanism** | ⚠️ Partial | Concept capture works; enrichment pipeline not built |
| **GDPR/SOC 2 support** | ⚠️ Gaps exist | Strong foundations but 8-12 new node types needed |
| **Cross-framework mapping** | ❌ Not implemented | Highest-value opportunity identified |

### Strategic Recommendation

The regulatory graph is **well-positioned to become an industry-leading compliance intelligence platform** by:

1. Completing the auto-population pipeline (critical infrastructure)
2. Adding compliance framework node types (GDPR, SOC 2 support)
3. Implementing cross-framework mapping (killer differentiator)
4. Expanding to additional regulatory domains (employment law, company law, financial services)

---

## Mission & Vision Clarification

### Original Mission Statement

> **"A chat-first, graph-backed regulatory research copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal/tax advice or leaking sensitive data."**

### Clarified Vision: Extensible Regulatory Compliance Graph

The system is:

- **Regulatory-domain-specific** (not "any industry") - focused on compliance obligations
- **Jurisdiction-extensible** - can add countries beyond IE/UK/NI/EU/IM/Malta
- **Domain-extensible** - can add regulatory domains (data protection, employment law, company law, financial services, environmental)
- **Framework-extensible** - can model compliance standards (GDPR, SOC 2, ISO 27001, PCI-DSS, HIPAA)

### What It Is NOT

- Not a generic knowledge graph for arbitrary information
- Not a replacement for legal/tax advisors
- Not a document repository (links to sources, doesn't store full texts)
- Not a PII storage system (user data stays in Supabase, not Memgraph)

### Architectural Principles

1. **Research, not advice** - Explain rules and interactions; direct users to professionals
2. **Explain interactions** - Help users understand how multiple rules interact, conflict, or exclude
3. **Support profiles/personas** - ProfileTags reflect persona-specific concerns without PII
4. **Handle time explicitly** - Timeline Engine makes lookbacks, deadlines, lock-ins queryable
5. **Handle cross-border complexity** - Model IE/UK/NI/EU and similar jurisdictions
6. **Self-populate regulatory concepts** - Capture concepts from chat; drive ingestion
7. **Remain PII-free at graph level** - Memgraph is shared regulatory knowledge only
8. **Be explainable and auditable** - Every answer traces back to concrete nodes

---

## Current Implementation Status

### Implemented Node Types (32 Total)

**Core Regulatory Structure:**
- `Jurisdiction` - Countries, supranational entities, regions
- `Region` - Sub-jurisdictions within a jurisdiction
- `Statute` - Acts and primary legislation
- `Section` - Sections/subsections within statutes
- `Guidance` - Non-binding guidance (Revenue manuals, DSP guidelines)
- `Case` - Court/tribunal decisions
- `EURegulation` - EU instruments (regulations)
- `EUDirective` - EU instruments (directives)

**Benefits & Reliefs:**
- `Benefit` - Social welfare benefits and entitlements
- `Relief` - Tax reliefs, credits, allowances, exemptions
- `Condition` - Eligibility tests and conditions
- `LifeEvent` - Life events that trigger rule changes

**Compliance & Obligations:**
- `Obligation` - Compliance requirements (FILING, REPORTING, PAYMENT, REGISTRATION)
- `Penalty` - Non-compliance consequences
- `Form` - Regulatory forms and documents
- `Threshold` - Numeric limits and boundaries
- `Rate` - Tax rates, contribution rates, benefit rates

**Temporal & Structural:**
- `Timeline` - Reusable time constructs
- `Update` / `ChangeEvent` - Change events (Finance Acts, guidance updates)

**Domain Models:**
- `PRSIClass` - Irish PRSI classifications
- `NIClass` - UK National Insurance classifications
- `LegalEntity` - Entity types (COMPANY, PARTNERSHIP, SOLE_TRADER)
- `TaxCredit` - Direct reductions in tax liability
- `TaxYear` - Fiscal years
- `AssetClass` - Asset categories for tax purposes
- `MeansTest` - Benefit eligibility criteria
- `BenefitCap` - Maximum benefit amounts
- `RegulatoryBody` - Government bodies and regulators
- `CoordinationRule` - EU/bilateral social security coordination

**Metadata & Concepts:**
- `ProfileTag` - User personas
- `Concept` - SKOS-inspired regulatory concepts
- `Label` - Alternative labels/synonyms
- `Agreement` / `Treaty` - International agreements
- `Regime` - Sub-systems within jurisdictions
- `Community` - Community detection groupings

### Implemented Relationship Types (83+ Total)

**Structural:** `IN_JURISDICTION`, `PART_OF`, `SUBSECTION_OF`, `APPLIES_IN`, `CONTAINS`

**Applicability:** `APPLIES_TO`, `APPLIES_TO_PROFILE`, `HAS_PROFILE_TAG`

**Cross-References:** `CITES`, `REFERENCES`, `INTERPRETS`, `IMPLEMENTS`, `DERIVED_FROM`, `HAS_SOURCE`

**Eligibility:** `REQUIRES`, `LIMITED_BY`

**Exclusions:** `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`

**Timeline:** `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`

**Cross-Border:** `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`

**Change Impact:** `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`

**Compliance:** `HAS_OBLIGATION`, `CREATES_OBLIGATION`, `REQUIRES_FORM`, `HAS_PENALTY`, `WAIVED_IF`, `SCALES_WITH`, `ADMINISTERED_BY`

**Thresholds & Rates:** `HAS_THRESHOLD`, `LIMITED_BY_THRESHOLD`, `CHANGES_THRESHOLD`, `HAS_RATE`, `APPLIES_RATE`, `SUBJECT_TO_RATE`

**Tax Credits & Benefits:** `ENTITLED_TO`, `STACKS_WITH`, `CAPPED_BY`, `TRANSFERS_TO`, `REDUCES`, `OFFSETS_AGAINST`

---

## Original Gap Analysis Review

### Tier 1 Proposals - Implementation Status

| Original Proposal | Status | Implementation Details |
|-------------------|--------|------------------------|
| **Obligation node** | ✅ Implemented | Full node with category (FILING\|REPORTING\|PAYMENT\|REGISTRATION), frequency, penalty_applies |
| **Threshold node** | ✅ Implemented | Full node with value, unit, direction, effective_from/to |
| **Rate node** | ✅ Implemented | Full node with percentage, flat_amount, bands, currency |
| **Form node** | ✅ Implemented | Full node with issuing_body, form_number, source_url, category |
| **Authority node** | ✅ Implemented | As `RegulatoryBody` with abbreviation, domain, website |
| **STACKS_WITH** | ✅ Implemented | `TaxCredit`-[:STACKS_WITH]→`TaxCredit` |
| **REDUCES** | ✅ Implemented | `Relief\|Benefit`-[:REDUCES]→`TaxCredit` |
| **TRIGGERS** | ✅ Implemented | `LifeEvent`-[:TRIGGERS]→`Benefit\|Relief\|Obligation` |
| **Provenance tracking** | ⚠️ Partial | Has `DERIVED_FROM`, `HAS_SOURCE`, `source_url`; no confidence scores on relationships |
| **SUPERSEDES** | ⚠️ Partial | Change tracking via `Update`; no direct rule-to-rule supersession |
| **Temporal versioning** | ⚠️ Partial | Has `effective_from/to`, `created_at/updated_at`; no explicit version chain |

### Remaining High-Value Gaps (Not Yet Implemented)

| Proposal | Type | Value | Status |
|----------|------|-------|--------|
| **APPEALS_TO** | Relationship | High | ❌ Not implemented |
| **GRANDFATHERED_BY** | Relationship | High | ❌ Not implemented |
| **Disqualification** | Node | Medium-High | ❌ Not implemented |
| **UNLOCKS** | Relationship | Medium-High | ❌ Not implemented |
| **Confidence/uncertainty modeling** | Property | Medium | ❌ Not implemented |
| **Enhanced provenance on relationships** | Property | Medium | ❌ Not implemented |
| **Explicit RuleVersion chain** | Pattern | Medium | ❌ Not implemented |

---

## High-Value Schema Enhancements

### Tier 0 - Transformative Additions

#### 1. RuleInteraction Node ⭐⭐⭐

**Gap:** Goal #2 is "Explain interactions, not just single rules" - but interactions are implicit, not explicitly modeled.

```typescript
interface RuleInteraction {
  id: string;                    // "IE_PRSI_JOBSEEKERS_INTERACTION"
  interaction_type: 'STACKS' | 'EXCLUDES' | 'REDUCES' | 'UNLOCKS' | 'REQUIRES' | 'OFFSETS';
  description: string;           // "PRSI Class S contributions count toward Jobseeker's eligibility"
  precedence?: number;           // For conflict resolution
  effective_from?: datetime;
  effective_to?: datetime;
  source_type: 'LEGISLATION' | 'CASE_LAW' | 'GUIDANCE' | 'INFERRED';
}
```

**Relationships:**
```cypher
(:RuleInteraction)-[:INVOLVES]->(:Benefit|Relief|Obligation)
(:RuleInteraction)-[:BASED_ON]->(:Section|Case|Guidance)
(:RuleInteraction)-[:APPLIES_TO_PROFILE]->(:ProfileTag)
```

**Why transformative:** Explicit interaction modeling enables:
- Query "show me all interactions for my profile"
- Track when interactions change (Finance Acts)
- Explain the source of interaction logic
- Support Scenario Engine with explicit interaction metadata

#### 2. DecisionPoint / EligibilityPath Node ⭐⭐⭐

**Gap:** No explicit modeling of decision trees for eligibility determination.

```typescript
interface DecisionPoint {
  id: string;                    // "IE_STATE_PENSION_ELIGIBILITY_PATH"
  question: string;              // "Are you over 66?"
  decision_type: 'BOOLEAN' | 'THRESHOLD' | 'MULTI_CHOICE';
  order: number;                 // Sequence in decision path
}

interface EligibilityPath {
  id: string;                    // "IE_STATE_PENSION_PATH_STANDARD"
  name: string;                  // "Standard Contributory Path"
  outcome: 'ELIGIBLE' | 'INELIGIBLE' | 'CONDITIONAL' | 'NEEDS_REVIEW';
}
```

**Relationships:**
```cypher
(:Benefit)-[:HAS_ELIGIBILITY_PATH]->(:EligibilityPath)
(:EligibilityPath)-[:DECISION_STEP { order: int }]->(:DecisionPoint)
(:DecisionPoint)-[:YES_LEADS_TO|NO_LEADS_TO]->(:DecisionPoint|EligibilityPath)
(:DecisionPoint)-[:EVALUATES]->(:Condition|Threshold)
```

**Why transformative:** Directly supports Scenario Engine (Use Case 2). Enables:
- Deterministic eligibility checking
- Explainable "why am I ineligible?" answers
- Visual decision tree rendering
- What-if scenario branching

#### 3. CrossBorderScenario Node ⭐⭐⭐

**Gap:** Goal #5 is "Handle cross-border complexity" but no explicit scenario-level modeling.

```typescript
interface CrossBorderScenario {
  id: string;                    // "IE_UK_REMOTE_WORKER"
  name: string;                  // "Irish Resident Working Remotely for UK Employer"
  jurisdictions: string[];       // ["IE", "UK"]
  key_considerations: string[];  // ["Double tax treaty", "Social security coordination", "PE risk"]
  common_profile: string;        // Reference to ProfileTag
}
```

**Relationships:**
```cypher
(:CrossBorderScenario)-[:INVOLVES_JURISDICTION]->(:Jurisdiction)
(:CrossBorderScenario)-[:TRIGGERS_ANALYSIS_OF]->(:CoordinationRule|Treaty)
(:CrossBorderScenario)-[:COMMON_FOR]->(:ProfileTag)
(:CrossBorderScenario)-[:KEY_RISK]->(:Obligation|Penalty)
```

### Tier 1 - High Value Additions

#### 4. ComplianceRisk Node ⭐⭐

```typescript
interface ComplianceRisk {
  id: string;                    // "IE_VAT_LATE_FILING_RISK"
  name: string;                  // "VAT Late Filing Risk"
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_type: 'FINANCIAL' | 'LEGAL' | 'REPUTATIONAL' | 'OPERATIONAL';
  likelihood_factors: string[];  // ["No reminder system", "Complex calculation"]
}
```

**Relationships:**
```cypher
(:Obligation)-[:HAS_RISK]->(:ComplianceRisk)
(:ComplianceRisk)-[:MITIGATED_BY]->(:Form|Guidance)
(:ComplianceRisk)-[:LEADS_TO]->(:Penalty|Disqualification)
(:ProfileTag)-[:EXPOSED_TO]->(:ComplianceRisk)
```

#### 5. Amendment / ChangeSet Node ⭐⭐

```typescript
interface Amendment {
  id: string;                    // "IE_FINANCE_ACT_2024_CGT_CHANGES"
  name: string;                  // "CGT Rate Changes - Finance Act 2024"
  parent_update: string;         // Reference to Update node
  change_type: 'RATE_CHANGE' | 'THRESHOLD_CHANGE' | 'NEW_RULE' | 'REPEAL' | 'CLARIFICATION';
  summary: string;
}
```

#### 6. Exemption Node ⭐⭐

```typescript
interface Exemption {
  id: string;                    // "IE_CGT_PRINCIPAL_RESIDENCE_EXEMPTION"
  name: string;                  // "Principal Private Residence Relief"
  exemption_type: 'FULL' | 'PARTIAL' | 'CONDITIONAL';
  scope: 'AUTOMATIC' | 'CLAIM_REQUIRED';
  cap?: number;
}
```

#### 7. SafeHarbour Node ⭐⭐

```typescript
interface SafeHarbour {
  id: string;                    // "IE_TRANSFER_PRICING_SAFE_HARBOUR"
  name: string;                  // "SME Transfer Pricing Safe Harbour"
  description: string;
  qualifying_criteria: string[];
  protection_scope: string;
}
```

### Tier 1 - Relationship Additions

| Relationship | Purpose | Priority |
|--------------|---------|----------|
| **APPEALS_TO** | Model appeal paths for tax/welfare decisions | P1 |
| **GRANDFATHERED_BY** | Model transitional provisions for cohorts | P1 |
| **CONFLICTS_WITH** | Model rule conflicts with resolution details | P2 |
| **AGGREGATES_WITH** | Model income/contribution aggregation rules | P2 |

---

## Concept Capture & Auto-Population Enhancements

### Current State Assessment

| Feature | Status | Completeness |
|---------|--------|--------------|
| Concept capture (tool) | ✅ Complete | 100% |
| Concept resolution (create/deduplicate) | ✅ Complete | 100% |
| Graph write guardrails (privacy/schema) | ✅ Complete | 100% |
| Conversation context tracking | ✅ Complete | 100% |
| **Auto-enrichment triggering** | ❌ Spec only | 0% |
| **Background ingestion jobs** | ❌ Not started | 0% |
| **Document fetching pipeline** | ❌ Not started | 0% |
| **Sparse data detection** | ❌ Not started | 0% |
| **Scheduled periodic updates** | ❌ Not started | 0% |

### Critical Enhancement: Sparse Concept Detection

```typescript
interface ConceptEnrichmentState {
  conceptId: string;
  enrichment_score: number;      // 0.0 - 1.0 (0 = stub, 1 = fully enriched)
  missing_edges: string[];       // ["HAS_RATE", "REQUIRES", "HAS_THRESHOLD"]
  missing_properties: string[];  // ["definition", "source_urls"]
  last_enrichment_attempt?: Date;
  enrichment_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
}

async function graphHasUsefulDetail(conceptId: string): Promise<{
  score: number;
  missing: string[];
  shouldEnqueue: boolean;
}> {
  // Query graph for:
  // 1. Number of outbound edges (to rules, rates, thresholds)
  // 2. Presence of key properties (definition, source_urls)
  // 3. Freshness (updated_at vs stale threshold)
}
```

### Critical Enhancement: Background Ingestion Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Ingestion Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Concept Capture] ──► [Enrichment Queue] ──► [Job Worker]  │
│         │                     │                    │         │
│         ▼                     ▼                    ▼         │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │ Stub Concept │    │ Redis/BullMQ  │    │ LLM Parser   │  │
│  │ in Memgraph  │    │ Priority Queue│    │ + Validators │  │
│  └──────────────┘    └───────────────┘    └──────────────┘  │
│                              │                    │          │
│                              ▼                    ▼          │
│                      ┌───────────────┐    ┌──────────────┐  │
│                      │ Job Types:    │    │ Output:      │  │
│                      │ - FETCH_DOC   │───►│ - Rates      │  │
│                      │ - PARSE_RULES │    │ - Thresholds │  │
│                      │ - LINK_STATUTE│    │ - Conditions │  │
│                      │ - EXTRACT_RATE│    │ - Edges      │  │
│                      └───────────────┘    └──────────────┘  │
│                                                   │          │
│                                                   ▼          │
│                                          [GraphWriteService] │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Source Registry Pattern

```typescript
const IE_TAX_SOURCES: SourceRegistry = {
  domain: 'TAX',
  jurisdiction: 'IE',
  sources: [
    {
      id: 'IE_REVENUE_TDM',
      name: 'Revenue Tax and Duty Manual',
      base_url: 'https://www.revenue.ie/en/tax-professionals/tdm/',
      update_frequency: 'WEEKLY',
      content_type: 'HTML',
      concepts_covered: ['VAT', 'PAYE', 'CGT', 'CAT', 'STAMP_DUTY', 'CORPORATION_TAX']
    },
    {
      id: 'IE_REVENUE_EBRIEFS',
      name: 'Revenue eBriefs',
      base_url: 'https://www.revenue.ie/en/tax-professionals/ebrief/',
      update_frequency: 'ON_CHANGE',
      content_type: 'HTML',
      concepts_covered: ['*']
    }
  ]
};
```

### Feedback Loop Enhancement

```typescript
const ENRICHMENT_FEEDBACK_TOOL = {
  name: 'report_missing_data',
  description: 'Report when graph is missing data needed to answer a query',
  parameters: {
    concept_id: { type: 'string' },
    missing_data_type: { type: 'string', enum: ['RATE', 'THRESHOLD', 'CONDITION', 'TIMELINE', 'EXEMPTION'] },
    query_context: { type: 'string' }
  }
};
```

---

## GDPR & SOC 2 Compatibility Analysis

### Executive Assessment

| Aspect | Current State | GDPR/SOC 2 Readiness |
|--------|---------------|---------------------|
| **Hierarchical Requirements** | ✅ Strong | Can model Articles → Sub-articles |
| **Obligations & Conditions** | ✅ Strong | Can model compliance requirements |
| **Timelines & Deadlines** | ✅ Strong | Can model notification windows |
| **Penalties** | ✅ Strong | Can model tiered GDPR fines |
| **Data Processing Concepts** | ❌ Missing | Cannot model purpose, lawful basis, data categories |
| **Security Controls** | ❌ Missing | Cannot model technical/organizational measures |
| **Data Subject Rights** | ❌ Missing | Cannot model GDPR Chapter III rights |
| **Control Satisfaction** | ❌ Missing | Cannot model "control X satisfies requirement Y" |
| **Evidence/Accountability** | ⚠️ Weak | Basic Form nodes, no evidence tracking |
| **Role-Based Obligations** | ⚠️ Weak | No Controller/Processor/DPO modeling |

**Verdict:** Strong foundations, but **8-12 new node types** and **15-20 new relationship types** needed for comprehensive GDPR/SOC 2 support.

### Mission Alignment

**GDPR is EU law** - it falls squarely within existing EU regulatory scope.

**SOC 2** is a framework/standard (not legislation), but:
- Maps to legal requirements (GDPR Article 32, Irish Data Protection Act)
- Organizations need both GDPR compliance AND SOC 2 attestation
- Graph can model "SOC 2 CC6.1 satisfies GDPR Article 32(1)(a)" relationships

✅ **Supporting GDPR/SOC 2 aligns with and extends the mission.**

### Understanding GDPR Structure

GDPR comprises 99 Articles organized into 11 Chapters:

```
GDPR
├── Chapter I: General provisions (Art. 1-4)
├── Chapter II: Principles (Art. 5-11)
│   ├── Art. 5: Data processing principles
│   ├── Art. 6: Lawful bases (6 options)
│   └── Art. 9: Special categories of data
├── Chapter III: Rights of the data subject (Art. 12-23)
│   ├── Art. 15: Right of access
│   ├── Art. 17: Right to erasure
│   └── Art. 20: Right to portability
├── Chapter IV: Controller and processor (Art. 24-43)
│   ├── Art. 28: Processor obligations
│   ├── Art. 30: Records of processing
│   ├── Art. 32: Security of processing ← Key for controls
│   ├── Art. 33: Breach notification (72 hours)
│   └── Art. 35: Data Protection Impact Assessment
├── Chapter V: International transfers (Art. 44-50)
└── Chapters VI-XI: Enforcement, remedies, delegated acts
```

### Understanding SOC 2 Structure

SOC 2 Trust Service Criteria (per AICPA):

```
SOC 2 Framework
├── Security (CC Series) - MANDATORY
│   ├── CC1: Control Environment
│   ├── CC2: Communication and Information
│   ├── CC3: Risk Assessment
│   ├── CC4: Monitoring Activities
│   ├── CC5: Control Activities
│   ├── CC6: Logical and Physical Access Controls
│   ├── CC7: System Operations
│   ├── CC8: Change Management
│   └── CC9: Risk Mitigation
├── Availability (A Series) - Optional
├── Processing Integrity (PI Series) - Optional
├── Confidentiality (C Series) - Optional
└── Privacy (P Series) - Optional (P1-P10)
```

### Critical Gap 1: Data Processing Fundamentals

**Problem:** GDPR requirements depend on *what* you're processing, *why*, and *on what basis*. Current schema models "rules about what you must do" but not processing context.

**Required Nodes:**

```typescript
interface ProcessingActivity {
  id: string;                    // "PROC:PAYROLL_IE"
  label: string;                 // "Employee Payroll Processing"
  description: string;
  data_subjects: string[];       // ["EMPLOYEES", "CONTRACTORS"]
  processing_operations: string[]; // ["COLLECTION", "STORAGE", "TRANSFER"]
}

interface LawfulBasis {
  id: string;                    // "BASIS:GDPR_6_1_B"
  label: string;                 // "Contract Performance"
  article: string;               // "GDPR Article 6(1)(b)"
  requires_consent_record: boolean;
  requires_lia: boolean;         // Legitimate Interest Assessment
  requires_dpia_consideration: boolean;
}

interface PersonalDataCategory {
  id: string;                    // "DATA:SPECIAL_HEALTH"
  label: string;                 // "Health Data"
  gdpr_article: string;          // "Article 9"
  sensitivity: 'STANDARD' | 'SPECIAL' | 'CRIMINAL';
  heightened_protection: boolean;
}

interface ProcessingPurpose {
  id: string;                    // "PURPOSE:HR_MANAGEMENT"
  label: string;                 // "Human Resources Management"
  category: string;              // "EMPLOYMENT" | "MARKETING" | "LEGAL" | "RESEARCH"
  legitimate_interest_applicable: boolean;
}
```

**Required Relationships:**
```cypher
(:ProcessingActivity)-[:HAS_PURPOSE]->(:ProcessingPurpose)
(:ProcessingActivity)-[:HAS_LAWFUL_BASIS]->(:LawfulBasis)
(:ProcessingActivity)-[:PROCESSES_CATEGORY]->(:PersonalDataCategory)
(:PersonalDataCategory)-[:REQUIRES_SAFEGUARD]->(:SecurityControl)
(:LawfulBasis)-[:DEFINED_IN]->(:Section)
```

### Critical Gap 2: Security Controls

**Problem:** GDPR Article 32 and SOC 2 CC series require specific technical/organizational measures. Cannot model controls or satisfaction relationships.

**Required Nodes:**

```typescript
interface SecurityControl {
  id: string;                    // "CTRL:ENCRYPTION_AT_REST"
  label: string;                 // "Encryption at Rest"
  control_type: 'TECHNICAL' | 'ORGANIZATIONAL' | 'PHYSICAL';
  category: string;              // "CRYPTOGRAPHY" | "ACCESS" | "MONITORING" | "RECOVERY"
  description: string;
  implementation_guidance?: string;
  evidence_types: string[];      // ["POLICY", "CONFIG_REVIEW", "AUDIT_LOG"]
}

interface ControlObjective {
  id: string;                    // "OBJ:GDPR_32_1_A"
  label: string;                 // "Pseudonymization and Encryption"
  parent_article: string;        // "GDPR Article 32(1)(a)"
  requirement_level: 'MUST' | 'SHOULD' | 'MAY';
  description: string;
}

interface TrustServiceCriteria {
  id: string;                    // "TSC:CC6_1"
  label: string;                 // "Logical Access Security"
  category: 'SECURITY' | 'AVAILABILITY' | 'PROCESSING_INTEGRITY' | 'CONFIDENTIALITY' | 'PRIVACY';
  points_of_focus: string[];
  mandatory: boolean;
}
```

**Required Relationships:**
```cypher
(:SecurityControl)-[:SATISFIES]->(:ControlObjective)
(:SecurityControl)-[:SATISFIES]->(:TrustServiceCriteria)
(:TrustServiceCriteria)-[:MAPS_TO]->(:ControlObjective)  // Cross-framework!
(:SecurityControl)-[:DEPENDS_ON]->(:SecurityControl)
(:SecurityControl)-[:CONFLICTS_WITH]->(:DataSubjectRight)
(:ControlObjective)-[:DERIVED_FROM]->(:Section)
```

### Critical Gap 3: Data Subject Rights

**Problem:** GDPR Chapter III defines 8 data subject rights with timelines and exceptions. No way to model these.

**Required Nodes:**

```typescript
interface DataSubjectRight {
  id: string;                    // "RIGHT:ACCESS"
  label: string;                 // "Right of Access"
  gdpr_article: string;          // "Article 15"
  description: string;
  response_deadline_days: number; // 30 (extendable to 90)
  format_requirements?: string[];
}

interface RightException {
  id: string;                    // "EXCEPTION:ERASURE_LEGAL_OBLIGATION"
  label: string;                 // "Legal Obligation Exception"
  applies_to_right: string;      // "RIGHT:ERASURE"
  legal_basis: string;           // "Article 17(3)(b)"
  description: string;
}
```

### Additional Compliance Gaps

| Gap | GDPR Relevance | Current Schema | Severity |
|-----|----------------|----------------|----------|
| Processing Purpose | Article 5(1)(b) | None | **CRITICAL** |
| Lawful Basis | Article 6 | None | **CRITICAL** |
| Personal Data Category | Articles 4(1), 9, 10 | None | **CRITICAL** |
| Security Control | Article 32 | Minimal | **CRITICAL** |
| Data Subject Right | Chapter III | None | **CRITICAL** |
| Role/Stakeholder | Articles 4(7)(8), 37-39 | Weak | **HIGH** |
| Control Objective | Article 32 structure | Flat sections | **HIGH** |
| Legitimate Interest Assessment | Article 6(1)(f) | None | **HIGH** |
| Data Processing Agreement | Article 28 | Generic Agreement | **HIGH** |
| Risk Assessment (DPIA) | Articles 33-35 | None | **HIGH** |
| Accountability/Evidence | Article 5(2) | Weak | **MEDIUM** |

---

## Cross-Framework Mapping: The Killer Feature

### Why This Is Transformative

Organizations often need to demonstrate compliance with **multiple frameworks simultaneously**:

- GDPR + Irish Data Protection Act 2018
- GDPR + SOC 2 (for SaaS providers)
- GDPR + ISO 27001 (for security certification)
- SOC 2 + PCI-DSS (for payment processing)
- GDPR + HIPAA (for health data)

Currently, organizations maintain **separate compliance programs** that don't recognize overlaps. This creates:

- Duplicated effort (implementing same control multiple times)
- Inconsistent evidence (different documentation for same control)
- Audit fatigue (separate audits for each framework)
- Gap blindness (not recognizing where one framework covers another)

### Cross-Framework Mapping in the Graph

```cypher
// Example: Show how SOC 2 and GDPR requirements align
(:TrustServiceCriteria {id: 'TSC:CC6_6'})-[:MAPS_TO]->(:ControlObjective {id: 'OBJ:GDPR_32_1_A'})

// Example: Find controls that satisfy both frameworks
MATCH (ctrl:SecurityControl)-[:SATISFIES]->(tsc:TrustServiceCriteria),
      (ctrl)-[:SATISFIES]->(obj:ControlObjective)
WHERE tsc.category = 'SECURITY' AND obj.parent_article STARTS WITH 'GDPR Article 32'
RETURN ctrl.label, tsc.id, obj.id

// Example: Gap analysis - what GDPR requirements aren't covered by SOC 2?
MATCH (obj:ControlObjective)
WHERE obj.parent_article STARTS WITH 'GDPR'
AND NOT EXISTS {
  MATCH (tsc:TrustServiceCriteria)-[:MAPS_TO]->(obj)
}
RETURN obj.label, obj.parent_article
```

### Cross-Framework Mapping Enables

1. **"I'm already SOC 2 compliant - what GDPR gaps do I have?"**
2. **"Which controls satisfy both GDPR Article 32 and SOC 2 CC6?"**
3. **"Generate a unified control matrix across all my compliance obligations"**
4. **"If I implement encryption, which requirements does that satisfy?"**
5. **"Show me all frameworks where breach notification is required"**

### ComplianceFramework Container Node

```typescript
interface ComplianceFramework {
  id: string;                    // "FRAMEWORK:GDPR"
  label: string;                 // "General Data Protection Regulation"
  framework_type: 'REGULATION' | 'STANDARD' | 'FRAMEWORK' | 'CERTIFICATION';
  issuing_body: string;          // "European Union" | "AICPA"
  version: string;
  effective_date: datetime;
  jurisdiction_scope: string[];  // ["EU", "EEA"]
}
```

**Relationships:**
```cypher
(:Section|ControlObjective|TrustServiceCriteria)-[:PART_OF_FRAMEWORK]->(:ComplianceFramework)
(:ComplianceFramework)-[:SUPERSEDES]->(:ComplianceFramework)
(:ComplianceFramework)-[:MAPS_TO]->(:ComplianceFramework)
```

---

## Implementation Roadmap

### Phase 1: Core Compliance Schema (8-10 weeks)

**Week 1-2: Data Processing Fundamentals**
- Add `ProcessingActivity`, `LawfulBasis`, `PersonalDataCategory`, `ProcessingPurpose` nodes
- Add `HAS_PURPOSE`, `HAS_LAWFUL_BASIS`, `PROCESSES_CATEGORY` relationships
- Update Graph Ingress Guard whitelist

**Week 3-4: Security Controls**
- Add `SecurityControl`, `ControlObjective` nodes
- Add `SATISFIES`, `DEPENDS_ON` relationships
- Seed with common controls (encryption, access control, logging)

**Week 5-6: Data Subject Rights**
- Add `DataSubjectRight`, `RightException` nodes
- Add `HAS_EXCEPTION`, `TRIGGERS_OBLIGATION` relationships
- Seed GDPR Chapter III rights

**Week 7-8: Compliance Roles & Frameworks**
- Add `ComplianceRole`, `ComplianceFramework` nodes
- Add `APPLIES_TO_ROLE`, `PART_OF_FRAMEWORK` relationships
- Create framework containers for GDPR, SOC 2

**Week 9-10: Evidence & Assessment**
- Add `EvidenceRequirement`, `RiskAssessmentType` nodes
- Add `REQUIRES_EVIDENCE`, `REQUIRES_ASSESSMENT` relationships

### Phase 2: Cross-Framework Mapping (4-6 weeks)

**Week 11-12: SOC 2 Trust Service Criteria**
- Add `TrustServiceCriteria` nodes (CC1-CC9, A, PI, C, P series)
- Seed with AICPA criteria structure

**Week 13-14: Framework Mapping Relationships**
- Add `MAPS_TO` relationships between GDPR and SOC 2
- Create common control library that satisfies both

**Week 15-16: Irish/EU Integration**
- Link GDPR to Irish Data Protection Act 2018
- Add DPC as RegulatoryBody with jurisdiction
- Model interaction with existing EU law nodes

### Phase 3: Auto-Population for Compliance (6-8 weeks)

**Week 17-18: Compliance Source Registry**
- Add GDPR, DPC, EDPB sources
- Add SOC 2/AICPA sources
- Implement document fetchers

**Week 19-20: Compliance Extraction Pipeline**
- Build LLM extraction prompts for compliance concepts
- Implement control objective extraction
- Implement cross-reference detection

**Week 21-24: Change Detection & Updates**
- Monitor regulatory sources for updates
- Track guidance changes from DPC/EDPB
- Flag affected nodes for re-assessment

### Phase 4: High-Value Schema Enhancements (4-6 weeks)

**Week 25-26: RuleInteraction & DecisionPoint**
- Implement RuleInteraction node for explicit interaction modeling
- Implement DecisionPoint/EligibilityPath for Scenario Engine support

**Week 27-28: Remaining Relationships**
- Add APPEALS_TO, GRANDFATHERED_BY relationships
- Add ComplianceRisk node

**Week 29-30: Domain Expansion Preparation**
- Add Employment Law foundation nodes
- Add Company Law foundation nodes

---

## Use Cases Enabled

### Tax & Welfare (Current)

1. **"What PRSI contributions do I need for State Pension?"**
2. **"If I claim R&D credit, what obligations does that create?"**
3. **"Can I stack entrepreneur relief with CGT exemption?"**
4. **"What changed in Finance Act 2024?"**

### Compliance Frameworks (With Enhancements)

5. **"We process employee health data in Ireland - what do we need to comply with?"**
   - Returns: GDPR Article 9 requirements, DPA 2018 sections, required controls, DPC guidance

6. **"We're already SOC 2 Type II certified - what GDPR gaps might we have?"**
   - Returns: SOC 2 controls that map to GDPR, gaps where no mapping exists

7. **"Generate a compliance work plan for our SaaS platform"**
   - Returns: Required controls, evidence needed, timeline obligations, role assignments

8. **"What happens if we have a data breach?"**
   - Returns: 72-hour notification timeline, DPC notification requirements, data subject notification conditions, penalties

9. **"What rights do our customers have under GDPR?"**
   - Returns: All Chapter III rights, response timelines, exceptions, required processes

10. **"Which security controls satisfy both GDPR Article 32 and SOC 2 CC6?"**
    - Returns: Mapped controls with evidence requirements for both frameworks

### Cross-Border Complexity

11. **"We transfer data from Ireland to the US - what do we need?"**
    - Returns: Chapter V requirements, SCCs, adequacy decisions, supplementary measures

12. **"How do Irish DPA rules interact with GDPR?"**
    - Returns: DPA 2018 sections that implement GDPR, Irish-specific derogations

---

## Appendix: Complete Schema Additions

### New Node Types Summary

| Node Type | Domain | Purpose | Priority |
|-----------|--------|---------|----------|
| `RuleInteraction` | Core | Explicit rule interaction modeling | P0 |
| `DecisionPoint` | Core | Decision tree nodes | P0 |
| `EligibilityPath` | Core | Decision tree outcomes | P0 |
| `CrossBorderScenario` | Core | Pre-computed cross-border analysis | P0 |
| `ProcessingActivity` | GDPR | Data processing context | P0 |
| `LawfulBasis` | GDPR | Legal justification for processing | P0 |
| `PersonalDataCategory` | GDPR | Data sensitivity classification | P0 |
| `ProcessingPurpose` | GDPR | Why data is being processed | P0 |
| `SecurityControl` | Compliance | Technical/organizational measures | P0 |
| `ControlObjective` | Compliance | Sub-requirements of articles | P0 |
| `DataSubjectRight` | GDPR | GDPR Chapter III rights | P0 |
| `TrustServiceCriteria` | SOC 2 | SOC 2 CC/A/PI/C/P criteria | P1 |
| `ComplianceFramework` | Compliance | Framework container/grouping | P1 |
| `ComplianceRole` | GDPR | Controller/Processor/DPO roles | P1 |
| `EvidenceRequirement` | Compliance | Accountability documentation | P1 |
| `RiskAssessmentType` | GDPR | DPIA/assessment requirements | P2 |
| `RightException` | GDPR | Exceptions to data subject rights | P2 |
| `ComplianceRisk` | Core | Risk modeling for obligations | P2 |
| `Amendment` | Core | Grouped changes within Updates | P2 |
| `Exemption` | Core | Explicit exemption modeling | P2 |
| `SafeHarbour` | Core | Safe harbour provisions | P2 |

### New Relationship Types Summary

| Relationship | Source | Target | Purpose | Priority |
|--------------|--------|--------|---------|----------|
| `SATISFIES` | SecurityControl | ControlObjective\|TSC | Control satisfaction | P0 |
| `HAS_LAWFUL_BASIS` | ProcessingActivity | LawfulBasis | Processing justification | P0 |
| `PROCESSES_CATEGORY` | ProcessingActivity | PersonalDataCategory | Data types processed | P0 |
| `HAS_PURPOSE` | ProcessingActivity | ProcessingPurpose | Why processing occurs | P0 |
| `REQUIRES_SAFEGUARD` | PersonalDataCategory | SecurityControl | Required protections | P0 |
| `MAPS_TO` | TSC\|Framework | ControlObjective\|Framework | Cross-framework mapping | P1 |
| `APPLIES_TO_ROLE` | Obligation | ComplianceRole | Role-based scoping | P1 |
| `PART_OF_FRAMEWORK` | Section\|ControlObjective | ComplianceFramework | Framework grouping | P1 |
| `REQUIRES_EVIDENCE` | Obligation | EvidenceRequirement | Accountability | P1 |
| `DEMONSTRATED_BY` | SecurityControl | EvidenceRequirement | Control evidence | P1 |
| `HAS_EXCEPTION` | DataSubjectRight | RightException | Right exceptions | P2 |
| `REQUIRES_ASSESSMENT` | ProcessingActivity | RiskAssessmentType | DPIA triggers | P2 |
| `APPEALS_TO` | Case\|RegulatoryBody | Case\|RegulatoryBody | Appeal paths | P2 |
| `GRANDFATHERED_BY` | Section\|Benefit | Update\|Section | Transitional provisions | P2 |
| `CONFLICTS_WITH` | Section\|SecurityControl | Section\|DataSubjectRight | Rule conflicts | P2 |
| `DEPENDS_ON` | SecurityControl | SecurityControl | Control dependencies | P2 |
| `INVOLVES` | RuleInteraction | Benefit\|Relief\|Obligation | Interaction parties | P2 |

### Compliance Source Registry

```typescript
const COMPLIANCE_SOURCES: SourceRegistry[] = [
  {
    domain: 'DATA_PROTECTION',
    jurisdiction: 'EU',
    sources: [
      {
        id: 'EU_GDPR_TEXT',
        name: 'GDPR Full Text',
        base_url: 'https://gdpr-info.eu/',
        update_frequency: 'ON_CHANGE',
        content_type: 'HTML'
      },
      {
        id: 'EDPB_GUIDELINES',
        name: 'European Data Protection Board Guidelines',
        base_url: 'https://edpb.europa.eu/our-work-tools/general-guidance/',
        update_frequency: 'MONTHLY',
        content_type: 'PDF'
      }
    ]
  },
  {
    domain: 'DATA_PROTECTION',
    jurisdiction: 'IE',
    sources: [
      {
        id: 'IE_DPC_GUIDANCE',
        name: 'Irish Data Protection Commission Guidance',
        base_url: 'https://www.dataprotection.ie/en/guidance-landing',
        update_frequency: 'MONTHLY',
        content_type: 'HTML'
      },
      {
        id: 'IE_DPA_2018',
        name: 'Data Protection Act 2018',
        base_url: 'https://www.irishstatutebook.ie/eli/2018/act/7/',
        update_frequency: 'ON_CHANGE',
        content_type: 'HTML'
      }
    ]
  },
  {
    domain: 'SECURITY',
    jurisdiction: 'INTERNATIONAL',
    sources: [
      {
        id: 'AICPA_SOC2',
        name: 'AICPA Trust Services Criteria',
        base_url: 'https://www.aicpa.org/resources/article/soc-2-trust-services-criteria',
        update_frequency: 'YEARLY',
        content_type: 'PDF'
      }
    ]
  }
];
```

---

## Final Assessment

### Can the Regulatory Graph Support GDPR/SOC 2?

| Aspect | Answer |
|--------|--------|
| **Mission alignment** | ✅ Yes - GDPR is EU law, SOC 2 maps to legal requirements |
| **Foundational patterns** | ✅ Strong - Obligations, conditions, timelines, penalties all work |
| **Current capability** | ⚠️ Partial - Can model articles/sections but not data processing context |
| **Required enhancements** | 12 new node types, 15+ new relationships |
| **Effort estimate** | 18-24 weeks for full implementation |
| **Strategic value** | ⭐⭐⭐ Very High - Massive market need |

### The Killer Feature

**Cross-framework mapping** is the transformative capability. Organizations spend enormous effort maintaining separate compliance programs. A graph that shows:

- How GDPR maps to SOC 2
- How Irish DPA implements GDPR
- Which controls satisfy multiple frameworks
- Where gaps exist across frameworks

...would be **uniquely valuable in the market**.

### Why LLM-Powered Approach Is Ideal

1. **Regulations are complex and interconnected** - LLMs can navigate nuance
2. **Guidance evolves constantly** - Auto-population keeps graph current
3. **Organizations need plain-language explanations** - Chat interface is natural
4. **Cross-framework analysis requires deep understanding** - LLMs can synthesize

### Strategic Recommendation

The regulatory graph is **well-positioned to become an industry-leading compliance intelligence platform** by:

1. ✅ **Completing the auto-population pipeline** (critical infrastructure)
2. ✅ **Adding compliance framework node types** (GDPR, SOC 2 support)
3. ✅ **Implementing cross-framework mapping** (killer differentiator)
4. ✅ **Expanding to additional regulatory domains** (employment law, company law, financial services)

---

## References

- [GDPR Compliance Framework 2025](https://auditboard.com/blog/gdpr-compliance-framework)
- [SOC 2 Trust Services Criteria](https://secureframe.com/hub/soc-2/trust-services-criteria)
- [GDPR Article 32 - Security of Processing](https://gdpr-info.eu/art-32-gdpr/)
- [AICPA SOC 2 Controls List 2025](https://cybersierra.co/blog/aicpa-soc-2-controls-2025/)
- [The 5 SOC 2 Trust Services Criteria Explained](https://cloudsecurityalliance.org/blog/2023/10/05/the-5-soc-2-trust-services-criteria-explained)
- [GDPR Compliance Requirements](https://secureframe.com/hub/gdpr/compliance-requirements)

---

*Document generated from comprehensive architecture review session, December 2025.*
