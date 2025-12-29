# Graph Schema Spec v0.6 – Regulatory Intelligence Copilot

> **Status:** Draft v0.6  
> **Supersedes:** `docs/architecture/graph/archive/schema_v_0_4.md` (internally still labelled v0.3)  
> **Scope:** Core Memgraph rules graph for the Regulatory Intelligence Copilot (IE / UK / EU focus, extensible to other domains)

This document is the **single source of truth** for how regulatory rules, benefits, and related entities are represented in **Memgraph**.

It is aligned with:

- `architecture_v_0_6.md` (overall system architecture)
- `data_privacy_and_architecture_boundaries_v_0_1.md` (what must *never* go into Memgraph)
- `graph_ingress_v_0_1.md` (write‑side validation and safety)
- `architecture/graph/change_detection_v_0_6.md` and the archived v0.3 docs (patch/streaming behaviour)
- `algorithms_v_0_1.md` (optional derived metadata)
- `special_jurisdictions_modelling_v_0_1.md` (NI/UK/IE/EU/IM/CTA and similar)
- `concept_capture_v_0_1.md` (SKOS‑inspired concept capture and self‑population)

All writes to Memgraph **must** go through `GraphWriteService` and obey this schema.

---

## 1. Goals & Non‑Goals

### 1.1 Goals

1. **Represent primary rule structure clearly**  
   Capture statutes, sections, benefits, reliefs, conditions, timelines, and guidance in a way that supports precise querying and explanation.

2. **Support profile‑ and jurisdiction‑aware reasoning**  
   Make it easy to answer questions for specific personas (e.g. single‑director IE company) and jurisdictions (IE, UK, NI, EU, IM, etc.).

3. **Express timelines and mutual exclusions explicitly**  
   Represent lookbacks, lock‑ins, deadlines, and mutual exclusions as first‑class graph structures that the Timeline Engine and agents can reason over.

4. **Model cross‑border coordination**  
   Allow explicit representation of CTA, EU coordination rules, treaties, and equivalent rules across jurisdictions.

5. **Support change tracking**  
   Represent Finance Acts, guidance updates, TAC decisions, EU rulings, etc., and connect them to the rules they affect.

6. **Remain PII‑free and tenant‑agnostic**  
   Memgraph stores only **public/regulatory knowledge**, never user or tenant data. Scenarios and conversations live elsewhere.

7. **Support a living graph**  
   Enable incremental enrichment over time via ingestion jobs and MCP‑driven upserts, with idempotent patterns.

8. **Treat algorithm metadata as hints**  
   Allow derived properties and helper nodes (communities, centrality, etc.) while keeping the core schema independent of any particular algorithm.

9. **Make concepts SKOS‑friendly**  
   Support SKOS‑style concepts and labels (prefLabel, altLabels, definitions) so that concept capture from main chat can resolve to stable graph nodes.

10. **Be compatible with change‑patch streaming**  
    All nodes and edges should support `created_at` / `updated_at` timestamps and stable IDs so that change detectors can emit clean, incremental patches.

### 1.2 Non‑Goals

- Not a full legal document store – **only summaries/links**, not full texts.
- Not a per‑user scenario store – concrete fact patterns live in Supabase or other app DBs.
- Not a generic knowledge graph – focused on **regulatory compliance** (tax, social welfare, pensions, etc.).

---

## 2. Node Labels

This section defines the **core node labels** and their properties. Many rules can be represented using a subset of these; you should not invent new labels without updating this document and the ingress guard.

### 2.1 `:Jurisdiction`

Represents a country, supranational entity, or well‑defined jurisdiction.

**Examples**
- `IE` (Ireland)
- `UK` (United Kingdom)
- `EU` (European Union)
- `NI` (Northern Ireland – usually combined with `:Region`)
- `IM` (Isle of Man), `MT` (Malta), `GI` (Gibraltar), `AD` (Andorra)

**Properties**
- `id: string` – canonical code, e.g. `"IE"`, `"UK"`, `"EU"`.
- `name: string` – e.g. `"Ireland"`.
- `kind?: string` – e.g. `"STATE"`, `"SUPRANATIONAL"`, `"DEPENDENCY"`.
- `notes?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.2 `:Region`

Sub‑jurisdictions or geographic regions that have specific rules.

**Examples**
- `NI` as a region under `UK` for goods regimes.

**Properties**
- `id: string` – e.g. `"UK_NI"`.
- `name: string`
- `jurisdictionCode: string` – e.g. `"UK"`.
- `notes?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.3 `:Agreement` / `:Treaty`

Represents international agreements or coordination frameworks.

**Examples**
- Common Travel Area (CTA).
- Bilateral social security agreements.

**Properties**
- `id: string`
- `name: string`
- `type?: string` – e.g. `"TREATY"`, `"COORDINATION_REGIME"`.
- `citation?: string`
- `source_url?: string`
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.4 `:Regime`

Represents a regime or sub‑system within a jurisdiction (e.g. social security coordination regime, VAT regime).

**Properties**
- `id: string`
- `name: string`
- `jurisdictionCode: string`
- `kind?: string` – e.g. `"SOCIAL_SECURITY"`, `"VAT"`, `"GOODS_MOVEMENT"`.
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.5 `:Statute`

Represents an Act or primary legislation.

**Properties**
- `id: string` – e.g. `"IE_TCA_1997"`.
- `name: string` – e.g. `"Taxes Consolidation Act 1997"`.
- `citation?: string`
- `source_url?: string`
- `enacted_date?: localdatetime`
- `repealed_date?: localdatetime`
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.6 `:Section`

A section, subsection, or article within a statute or similar instrument.

**Properties**
- `id: string` – stable reference, e.g. `"IE_TCA_1997_s766"`.
- `label: string` – e.g. `"s.766 R&D tax credit"`.
- `heading?: string`
- `text_excerpt?: string` – short summary, not full text.
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.7 `:Benefit`

A social welfare benefit, payment, or entitlement.

**Properties**
- `id: string` – e.g. `"IE_JOBSEEKERS_BENEFIT"`.
- `label: string` – human‑friendly name.
- `description?: string`
- `category?: string` – e.g. `"UNEMPLOYMENT"`, `"SICKNESS"`.
- `pref_label?: string` – SKOS `prefLabel` (often same as `label`).
- `alt_labels?: string[]` – SKOS `altLabels` (synonyms, common names).
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.8 `:Relief`

A tax relief, credit, allowance, or exemption.

**Properties**
- `id: string` – e.g. `"IE_R_AND_D_TAX_CREDIT"`.
- `label: string`
- `description?: string`
- `category?: string` – e.g. `"CORPORATION_TAX"`, `"INCOME_TAX"`, `"CGT"`.
- `pref_label?: string`
- `alt_labels?: string[]`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.9 `:Condition`

Named condition or eligibility test that can be reused across rules.

**Properties**
- `id: string`
- `label: string` – e.g. `"Minimum PRSI Contributions"`.
- `description: string`
- `category?: string` – e.g. `"PRSI"`, `"INCOME"`, `"RESIDENCE"`, `"CGT_TIMING"`.
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.10 `:Timeline`

Reusable time construct (lookback, lock‑in, deadlines, effective windows, usage frequency). This corresponds to the `TimelineNode` type in the Timeline Engine.

**Properties**
- `id: string`
- `label: string` – e.g. `"12‑month Lookback"`, `"4‑year Lock‑in"`.
- `window_days?: int`
- `window_months?: int`
- `window_years?: int`
- `kind?: string` – `"LOOKBACK" | "LOCK_IN" | "DEADLINE" | "EFFECTIVE_WINDOW" | "USAGE_FREQUENCY" | "OTHER"`.
- `jurisdictionCode?: string` – optional hint (`"IE"`, `"MT"`, etc.).
- `notes?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.11 `:Case`

Court or tribunal decision (Tax Appeals Commission, domestic courts, CJEU, etc.).

**Properties**
- `id: string` – e.g. `"IE_TAC_2024_123"`.
- `name: string`
- `decision_date?: localdatetime`
- `citation?: string`
- `source_url?: string`
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.12 `:Guidance`

Non‑binding but important guidance (Revenue manuals, eBriefs, DSP guidelines, Pensions Authority notes, etc.).

**Properties**
- `id: string`
- `title: string`
- `issued_by: string` – e.g. `"Revenue"`, `"DSP"`, `"Pensions Authority"`.
- `publication_date?: localdatetime`
- `source_url?: string`
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.13 `:EURegulation` / `:EUDirective`

EU instruments that affect domestic rules.

**Properties**
- `id: string` – e.g. `"EU_REG_883_2004"`.
- `name: string`
- `type: string` – `"REGULATION" | "DIRECTIVE"`.
- `citation?: string`
- `source_url?: string`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.14 `:ProfileTag`

Represents a persona or profile segment, used to filter rules (e.g. single director, self‑employed contractor, cross‑border worker).

**Properties**
- `id: string` – e.g. `"PROFILE_SINGLE_DIRECTOR_IE"`.
- `label: string` – e.g. `"Single director, Irish LTD"`.
- `description?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

### 2.15 `:Update` / `:ChangeEvent`

Represents a change event (new Act, guidance, case, EU judgment, etc.).

**Properties**
- `id: string`
- `kind: string` – e.g. `"FINANCE_ACT"`, `"GUIDANCE_UPDATE"`, `"COURT_DECISION"`, `"EU_JUDGMENT"`.
- `title: string`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`
- `source_url?: string`
- `summary?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

You may use a single label `:Update` or dual labels `:Update:ChangeEvent` for clarity.

### 2.16 Special Jurisdictions & Regimes

Northern Ireland, CTA, Isle of Man, Gibraltar, Andorra and similar edge cases are modelled using the `:Jurisdiction` / `:Region` / `:Agreement` / `:Regime` pattern defined in `special_jurisdictions_modelling_v_0_1.md`. Schema changes **must remain compatible** with that document.

### 2.17 Algorithm‑Derived Helper Nodes (Optional)

Graph algorithms may introduce **derived metadata** to support GraphRAG and explanation, for example:

- Properties like `alg_community_id`, `alg_centrality_score`, `alg_rank` on core nodes, or
- Helper labels such as `:CommunitySummary` with summary text and links to representative nodes.

Rules:

- These **do not change** the semantics of core node labels and relationships above.
- They are **optional and ephemeral** – they can be recalculated or removed without breaking queries that rely only on core schema.
- Ingestion and guards must treat them as **derived**, not as sources of truth for rules.
- Any such properties/labels must be documented in `algorithms_v_0_1.md` and whitelisted in the Graph Ingress Guard configuration before writes.

### 2.18 `:Concept` (SKOS‑Inspired)

Represents a **regulatory concept** captured via the `capture_concepts` tool (e.g. VAT, VRT, import duty), used as a stable anchor for self‑population.

**Properties**
- `id: string` – canonical ID, typically `"<domain>:<jurisdiction>:<kind>"`, e.g. `"TAX:IE:VAT"`, `"VEHICLE_TAX:IE:VRT"`.
- `domain: string` – e.g. `"TAX"`, `"SOCIAL_WELFARE"`, `"VEHICLE_TAX"`.
- `kind: string` – e.g. `"VAT"`, `"VRT"`, `"IMPORT_DUTY"`.
- `jurisdiction: string` – e.g. `"IE"`, `"EU"`.
- `pref_label: string` – SKOS `prefLabel`, e.g. `"Value‑Added Tax"`.
- `definition?: string` – short description.
- `source_urls?: string[]` – authoritative sources used when the concept was created/enriched.
- `created_at: localdatetime`
- `updated_at: localdatetime`
- `last_verified_at?: localdatetime` – last time an ingestion/enrichment pass confirmed the concept and its rules.

Specialisations (optional):

- Implementations may use sub‑labels like `:Concept:TaxConcept` when helpful, but must remain compatible with this base shape.

### 2.19 `:Label`

Represents a SKOS‑style alternative label or synonym for a `:Concept`.

**Properties**
- `id: string` – internal ID.
- `value: string` – the label text, e.g. `"sales tax in Ireland"`.
- `language?: string` – e.g. `"en"`.
- `kind?: string` – e.g. `"ALT_LABEL"`, `"ABBREVIATION"`.
- `created_at: localdatetime`
- `updated_at: localdatetime`

> **Note:** For many use cases, it is sufficient to use `:Concept.pref_label` + `:Concept.alt_labels[]`. `:Label` nodes are used when you want richer graph‑level semantics around synonyms.

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

**Examples**
- CT1 filing for Irish companies
- Form 11 filing for self-employed individuals
- Preliminary tax payments
- CRO annual returns

### 2.21 `:Threshold`

Represents a numeric limit or boundary used in eligibility rules.

**Properties**
- `id: string` – e.g. `"IE_CGT_ANNUAL_EXEMPTION_2024"`.
- `label: string` – e.g. `"CGT Annual Exemption"`.
- `value: number` – the threshold value, e.g. `1270`.
- `unit: string` – `"EUR" | "GBP" | "WEEKS" | "DAYS" | "COUNT" | "PERCENT"`.
- `direction: string` – `"ABOVE" | "BELOW" | "BETWEEN"`.
- `upper_bound?: number` – for bands/ranges.
- `effective_from?: datetime`
- `effective_to?: datetime`
- `category?: string` – e.g. `"CGT"`, `"PRSI"`, `"BIK"`.
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Examples**
- CGT annual exemption (€1,270 in IE)
- Small benefit exemption (€1,000 in IE)
- PRSI contribution thresholds

### 2.22 `:Rate`

Represents a tax rate, contribution rate, or benefit rate.

**Properties**
- `id: string` – e.g. `"IE_INCOME_TAX_HIGHER_2024"`.
- `label: string` – e.g. `"Higher Rate Income Tax"`.
- `percentage?: number` – rate as percentage, e.g. `40`.
- `flat_amount?: number` – for flat-rate amounts.
- `currency?: string` – `"EUR" | "GBP"`.
- `band_lower?: number` – lower bound of income band.
- `band_upper?: number` – upper bound of income band.
- `effective_from?: datetime`
- `effective_to?: datetime`
- `category: string` – `"INCOME_TAX" | "PRSI" | "VAT" | "CGT" | "USC"`.
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Examples**
- Income tax rates (20%, 40%)
- PRSI rates by class
- VAT rates (standard, reduced, zero)

### 2.23 `:Form`

Represents a regulatory form or document required for compliance or claiming benefits.

**Properties**
- `id: string` – e.g. `"IE_REVENUE_FORM_CT1"`.
- `label: string` – e.g. `"Corporation Tax Return (CT1)"`.
- `issuing_body: string` – `"Revenue" | "DSP" | "CRO"`.
- `form_number?: string` – e.g. `"CT1"`, `"Form 11"`.
- `source_url?: string` – link to form or guidance.
- `category: string` – `"TAX" | "SOCIAL_WELFARE" | "COMPANY"`.
- `online_only?: boolean`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Examples**
- Revenue forms (CT1, Form 11, RCT30)
- DSP claim forms (UP1, PRSI history)
- CRO forms (B1, B10)

### 2.24 `:PRSIClass`

Represents an Irish PRSI (Pay Related Social Insurance) classification.

**Properties**
- `id: string` – e.g. `"IE_PRSI_CLASS_A"`.
- `label: string` – e.g. `"Class A"`.
- `description: string` – Description of who this class applies to.
- `eligible_benefits?: string[]` – High-level list of benefit categories.
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Examples**
- Class A: Employees in industrial, commercial, and service employment
- Class S: Self-employed individuals
- Class B: Civil servants recruited before 1995

### 2.25 `:LifeEvent`

Represents significant life events that trigger regulatory changes, benefits, or obligations.

**Properties**
- `id: string` – e.g. `"LIFE_EVENT_CHILD_BIRTH"`.
- `label: string` – e.g. `"Birth of Child"`.
- `category: string` – `"FAMILY" | "EMPLOYMENT" | "HEALTH" | "RESIDENCY"`.
- `triggers_timeline?: boolean` – Whether this event starts/ends a timeline.
- `description?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Examples**
- Birth of child
- Marriage or civil partnership
- Job loss or retirement
- Moving to/from Ireland
- Starting a business

### 2.26 `:Penalty`

Represents consequences of non-compliance with obligations.

**Properties**
- `id: string` – e.g. `"IE_LATE_CT1_SURCHARGE_5"`.
- `label: string` – e.g. `"Late CT1 Filing Surcharge (5%)"`.
- `penalty_type: string` – `"SURCHARGE" | "INTEREST" | "FIXED" | "PROSECUTION" | "RESTRICTION"`.
- `rate?: number` – Percentage for surcharges (e.g., 5, 10).
- `daily_rate?: number` – Daily rate for interest (e.g., 0.0219).
- `flat_amount?: number` – Fixed amount in currency.
- `currency?: string` – `"EUR" | "GBP"`.
- `max_amount?: number` – Maximum penalty cap.
- `applies_after_days?: number` – Days after deadline when penalty applies.
- `applies_after_months?: number` – Months after deadline.
- `description?: string`
- `created_at: localdatetime`
- `updated_at: localdatetime`

**Examples**
- 5% surcharge for late CT1 filing (within 2 months)
- 10% surcharge for late CT1 filing (after 2 months)
- 0.0219% daily interest on late payment
- Fixed €100 CRO late filing fee
- Loss of audit exemption (restriction)

---

## 3. Core Relationship Types

### 3.1 Structural

- `(:Section)-[:PART_OF]->(:Statute)`
- `(:Section)-[:SUBSECTION_OF]->(:Section)`
- `(:X)-[:IN_JURISDICTION]->(:Jurisdiction)` for all rule‑like nodes (`Statute`, `Section`, `Benefit`, `Relief`, `Guidance`, `Case`, `EURegulation`, `EUDirective`).
- `(:Region)-[:PART_OF]->(:Jurisdiction)`
- `(:Regime)-[:APPLIES_IN]->(:Jurisdiction)`
- `(:Agreement|:Treaty)-[:COVERS]->(:Jurisdiction|:Region)`

### 3.2 Applicability & Tagging

- `(:Benefit)-[:APPLIES_TO]->(:ProfileTag)`
- `(:Relief)-[:APPLIES_TO]->(:ProfileTag)`
- `(:Section)-[:APPLIES_TO]->(:ProfileTag)`

These enable fast filtering for specific personas.

### 3.3 Cross‑References & Interpretation

- `(:Section)-[:CITES]->(:Section)`
- `(:Section)-[:CITES]->(:EURegulation|:EUDirective)`
- `(:Section)-[:CITES]->(:Guidance)`
- `(:Guidance)-[:INTERPRETS]->(:Section)`
- `(:Case)-[:INTERPRETS]->(:Section)`
- `(:Case)-[:APPLIES_TO]->(:Benefit|:Relief)`

### 3.4 Eligibility & Conditions

- `(:Benefit)-[:REQUIRES]->(:Condition)`
- `(:Relief)-[:REQUIRES]->(:Condition)`
- `(:Section)-[:REQUIRES]->(:Condition)`

### 3.5 Limitations & Thresholds

- `(:Benefit)-[:LIMITED_BY]->(:Condition)`
- `(:Relief)-[:LIMITED_BY]->(:Condition)`

Conditions here typically encode thresholds (income, contributions, CGT limits, etc.).

### 3.6 Mutual Exclusions & Conflicts

- `(:Benefit)-[:EXCLUDES { reason?: string, basis?: string }]->(:Benefit)`
- `(:Relief)-[:EXCLUDES { reason?: string, basis?: string }]->(:Relief)`
- `(:Benefit)-[:MUTUALLY_EXCLUSIVE_WITH { scope?: string, basis?: string }]->(:Benefit)`
- `(:Relief)-[:MUTUALLY_EXCLUSIVE_WITH { scope?: string, basis?: string }]->(:Relief)`
- `(:Benefit)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Relief)` (and vice versa)

Usage:

- `EXCLUDES` is usually directional ("claiming A excludes B").
- `MUTUALLY_EXCLUSIVE_WITH` should be treated as symmetric in logic, even if represented as two directed edges.
- For cross‑jurisdiction cases, `basis` might be `"COORDINATION_RULE"` or `"TREATY"`.

### 3.7 Timelines & Windows

These edges connect rules/conditions to `:Timeline` nodes and are the main input to the Timeline Engine.

- Lookbacks:
  - `(:Benefit)-[:LOOKBACK_WINDOW]->(:Timeline)`
  - `(:Relief)-[:LOOKBACK_WINDOW]->(:Timeline)`
  - `(:Condition)-[:LOOKBACK_WINDOW]->(:Timeline)`

- Lock‑ins:
  - `(:Benefit)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`
  - `(:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`

- Deadlines:
  - `(:Section|:Relief|:Benefit)-[:FILING_DEADLINE]->(:Timeline)`

- Effective windows:
  - `(:Update|:ChangeEvent|:Section|:Guidance)-[:EFFECTIVE_WINDOW]->(:Timeline)`

- Usage frequency:
  - `(:Benefit|:Relief)-[:USAGE_FREQUENCY]->(:Timeline)`

### 3.8 Cross‑Border & Coordination

- `(:Regime)-[:COORDINATED_WITH]->(:Regime)` – e.g. social security coordination between IE and UK.
- `(:Section|:Benefit|:Relief)-[:TREATY_LINKED_TO]->(:Agreement|:Treaty)`
- `(:Section|:Benefit|:Relief)-[:EQUIVALENT_TO]->(:Section|:Benefit|:Relief)` – for near‑equivalent rules across jurisdictions.

### 3.9 Change Events & Impact

- `(:Update|:ChangeEvent)-[:AFFECTS]->(:Section|:Benefit|:Relief|:Condition)`
- `(:Update|:ChangeEvent)-[:CHANGES_INTERPRETATION_OF]->(:Section)`
- `(:Update|:ChangeEvent)-[:UPDATES]->(:Guidance)`

These edges allow queries like "what changed for a given benefit since year X?".

### 3.10 Concept & Label Relationships (SKOS‑Inspired)

These relationships support the SKOS‑like concept capture pipeline.

- `(:Concept)-[:HAS_ALT_LABEL]->(:Label)`
- `(:Concept)-[:ALIGNS_WITH]->(:Section|:Benefit|:Relief|:Condition|:Timeline)` – optional alignment edge when a concept maps to one or more existing rule nodes.
- `(:Concept)-[:DERIVED_FROM]->(:Guidance|:EURegulation|:EUDirective|:Case|:Update)` – provenance of how the concept was created/enriched.

> **Note:** `:Concept` nodes are primarily anchors for concept capture and ingestion. The **authoritative logic** lives in the rule graph (Sections, Benefits, Reliefs, Conditions, Timelines). Whenever possible, ingestion should:
>
> 1. Link `:Concept` to specific rule nodes via `ALIGNS_WITH`, and
> 2. Enrich those rule nodes, rather than embedding all logic directly in `:Concept`.

### 3.11 Obligations, Rates, Thresholds, and Forms

These relationships support compliance workflows and numeric reasoning.

**Obligations:**
- `(:ProfileTag)-[:HAS_OBLIGATION]->(:Obligation)` – Links personas to their compliance duties.
- `(:Statute|:Section)-[:CREATES_OBLIGATION]->(:Obligation)` – Legislative source of obligation.
- `(:Obligation)-[:IN_JURISDICTION]->(:Jurisdiction)` – Jurisdiction where obligation applies.
- `(:Obligation)-[:FILING_DEADLINE]->(:Timeline)` – Deadline for fulfilling obligation.
- `(:Obligation)-[:REQUIRES_FORM]->(:Form)` – Form needed for compliance.

**Penalties:**
- `(:Obligation)-[:HAS_PENALTY]->(:Penalty)` – Penalty for non-compliance with obligation.
- `(:Penalty)-[:WAIVED_IF]->(:Condition)` – Conditions under which penalty may be waived.
- `(:Penalty)-[:SCALES_WITH]->(:Threshold)` – Progressive penalty thresholds.
- `(:Penalty)-[:IN_JURISDICTION]->(:Jurisdiction)` – Jurisdiction where penalty applies.

**Forms:**
- `(:Benefit)-[:CLAIMED_VIA]->(:Form)` – How to claim a benefit.
- `(:Form)-[:IN_JURISDICTION]->(:Jurisdiction)` – Jurisdiction where form is used.

**Thresholds:**
- `(:Condition)-[:HAS_THRESHOLD]->(:Threshold)` – Numeric condition for eligibility.
- `(:Benefit|:Relief)-[:LIMITED_BY_THRESHOLD]->(:Threshold)` – Upper/lower bounds on benefit/relief.
- `(:Update)-[:CHANGES_THRESHOLD]->(:Threshold)` – Threshold adjustments over time.

**Rates:**
- `(:Relief|:Benefit|:Section)-[:HAS_RATE]->(:Rate)` – Applicable rate for calculation.
- `(:ProfileTag)-[:SUBJECT_TO_RATE]->(:Rate)` – Rate applicability by profile.
- `(:Regime)-[:APPLIES_RATE]->(:Rate)` – Rate within a specific regime.

**SKOS Hierarchy (for Concepts):**
- `(:Concept)-[:BROADER]->(:Concept)` – Parent concept in taxonomy.
- `(:Concept)-[:NARROWER]->(:Concept)` – Child concept in taxonomy.
- `(:Concept)-[:RELATED]->(:Concept)` – Semantically related concepts.

**PRSI Classes:**
- `(:PRSIClass)-[:ENTITLES_TO]->(:Benefit)` – Benefits available to this PRSI class.
- `(:ProfileTag)-[:HAS_PRSI_CLASS]->(:PRSIClass)` – Profile's PRSI classification.
- `(:PRSIClass)-[:CONTRIBUTION_RATE]->(:Rate)` – Contribution rate for this class.

**Life Events:**
- `(:LifeEvent)-[:TRIGGERS]->(:Benefit|:Relief|:Obligation)` – Benefits/obligations triggered by event.
- `(:LifeEvent)-[:STARTS_TIMELINE]->(:Timeline)` – Event starts a time window.
- `(:LifeEvent)-[:ENDS_TIMELINE]->(:Timeline)` – Event ends a time window.
- `(:Benefit|:Relief|:Obligation)-[:TRIGGERED_BY]->(:LifeEvent)` – Reverse relationship (optional).

---

## 4. Modelling Scenarios & Examples (Non‑Exhaustive)

These are illustrative examples; they do not introduce new schema elements beyond those defined above.

### 4.1 VAT in Ireland (TAX:IE:VAT)

- `(:Concept { id: "TAX:IE:VAT", domain: "TAX", kind: "VAT", jurisdiction: "IE" })`
- Alt labels:
  - `(:Concept)-[:HAS_ALT_LABEL]->(:Label { value: "VAT", kind: "ABBREVIATION" })`
  - `(:Concept)-[:HAS_ALT_LABEL]->(:Label { value: "sales tax in Ireland", kind: "ALT_LABEL" })`
- Alignment:
  - `(:Concept)-[:ALIGNS_WITH]->(:Section { id: "IE_VAT_ACT_sX" })`
  - `(:Concept)-[:ALIGNS_WITH]->(:Relief { id: "IE_VAT_REDUCED_RATE" })`

Timelines, conditions, and rates are represented through `:Section`, `:Relief`, `:Timeline`, and `:Condition` nodes plus their edges; `:Concept` simply anchors the idea "VAT in Ireland" for capture and ingestion.

### 4.2 VRT in Ireland (VEHICLE_TAX:IE:VRT)

- `(:Concept { id: "VEHICLE_TAX:IE:VRT", domain: "VEHICLE_TAX", kind: "VRT", jurisdiction: "IE" })`
- Alt labels such as `"Vehicle Registration Tax"` and `"VRT"` as `:Label` nodes.
- Alignment to relevant sections/reliefs in the VRT legislation and Revenue guidance via `ALIGNS_WITH`.

### 4.3 Importing a Car from Japan to Ireland

The conversation may introduce a concept like `"Japanese vehicle import duty to Ireland"`. In v0.6:

1. `capture_concepts` produces a concept payload.
2. `canonicalConceptResolver` either resolves an existing `:Concept` or creates a new one, e.g. `"VEHICLE_TAX:IE:IMPORT_VEHICLE_JP"`.
3. Ingestion jobs use that `:Concept` as a seed to:
   - Fetch VRT, customs duty, and VAT rules via MCP.
   - Create/enrich `:Section`, `:Relief`, `:Condition`, `:Timeline` nodes and edges.
   - Add `(:Concept)-[:ALIGNS_WITH]->` edges to those rule nodes.

Subsequent questions about VRT/import duties can then be answered using both the `:Concept` and the enriched rule subgraph.

---

## 5. Ingestion Guidelines

1. **Use `:Jurisdiction` consistently**  
   Every rule‑like node (`Statute`, `Section`, `Benefit`, `Relief`, `Guidance`, `Case`, EU instruments) should have exactly one `IN_JURISDICTION` edge.

2. **Prefer stable IDs**  
   Use IDs that won’t change if text moves (e.g. `"IE_TCA_1997_s766"` instead of position‑based IDs).

3. **Store summaries, not full texts**  
   Keep `text_excerpt` / `summary` short and link to `source_url`. Full text should live in external systems or MCP‑fetched documents.

4. **Encode relationships, not narrative**  
   Focus ingestion on:
   - Conditions (`REQUIRES`, `LIMITED_BY`).
   - Mutual exclusions (`EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`).
   - Timelines (`LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`).
   - Cross‑border links (`COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`).
   - Change impact (`AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`).
   - Concept alignments (`ALIGNS_WITH`) when appropriate.

5. **Keep the graph user‑agnostic**  
   Do **not** store user data or concrete scenarios in Memgraph. Personas are modelled via `:ProfileTag` only; scenarios live in ephemeral, per‑request structures or Supabase tables, not in Memgraph.

6. **Be explicit about cross‑border links**  
   When a rule clearly interacts with another jurisdiction (EU regulation, treaty, coordination rule), add an appropriate edge instead of hoping the LLM infers it.

7. **Support a living graph**  
   Ingestion jobs and MCP‑driven upserts should:
   - Prefer idempotent operations (upsert patterns).
   - Attach `:Update` / `:ChangeEvent` nodes when new documents are detected.
   - Add relationships gradually; it’s acceptable for some regions of the graph to be sparse initially and enriched over time.

8. **Treat algorithm metadata as hints**  
   Algorithm‑derived properties and helper nodes:
   - Must be clearly identified (e.g. `alg_*` property names, `:CommunitySummary` label).
   - Are best‑effort hints for retrieval and explanation, not primary sources of truth.
   - May be regenerated or dropped at any time without breaking ingestion.

9. **Use `:Concept` nodes sparingly and meaningfully**  
   - Only create `:Concept` nodes for **regulatory concepts** that recur across conversations or documents (e.g. VAT, VRT, specific reliefs/benefits), not for one‑off phrases.
   - Always attempt to align them to rule graph nodes via `ALIGNS_WITH` as enrichment improves.
   - Avoid duplicating full rule logic inside `:Concept`; keep it as an anchor + label set + provenance.

10. **Maintain timestamps**  
    - Ensure `created_at` and `updated_at` are set/updated consistently on all nodes and relationships to support change detection and patch streaming.

---

## 6. Versioning & Evolution

- This is **v0.6** of the graph schema.
- Changes from the previous published schema (`docs/architecture/graph/archive/schema_v_0_4.md`, internally v0.3):
  - Added `pref_label` and `alt_labels` properties on `:Benefit` and `:Relief` to support SKOS‑style labels.
  - Introduced `:Concept` and `:Label` node labels, plus `HAS_ALT_LABEL`, `ALIGNS_WITH`, and `DERIVED_FROM` relationships, to integrate with `concept_capture_v_0_1.md`.
  - Clarified that **conversation context** and scenarios live in Supabase, not in Memgraph, consistent with `spec_v_0_1.md`.
  - Added explicit `created_at` / `updated_at` (and optional `last_verified_at` on `:Concept`) to support graph change detection and patch streaming.
  - Reconciled special jurisdictions and regimes with `special_jurisdictions_modelling_v_0_1.md` and `architecture_v_0_6.md`.
- Further changes should be recorded in `schema_changelog_v_0_6+.md` with migration notes where needed.

---

## 7. Scope of v0.6

This schema is sufficient for:

- Single‑director company and self‑employed scenarios in Ireland.
- Social welfare entitlements and constraints (incl. mutual exclusions and time windows).
- Tax reliefs and credits (incl. R&D) with cross‑references and time‑based conditions.
- CGT timing and loss‑relief interactions at a rule‑interaction level.
- EU–Irish law mapping and cross‑border scenarios involving other EU states, Isle of Man, Gibraltar, Andorra, etc.
- Capturing change events (Finance Acts, guidance updates, cases) and relating them to existing rules and timelines.
- Basic SKOS‑style concept capture and self‑population of the rules graph via `:Concept` nodes.
- Integration with conversation context (via `ConversationContext.activeNodeIds` and `ChatResponse.referencedNodes`) without storing any PII in Memgraph.

Agents and ingestion jobs should treat this document as the **authoritative specification** for how they structure and query the regulatory graph in v0.6.

