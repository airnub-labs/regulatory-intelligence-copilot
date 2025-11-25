# Graph Schema Spec v0.3 – Regulatory Intelligence Copilot

> **Status:** Draft v0.3  
> **Scope:** Core regulatory graph model with **cross‑jurisdiction support** (Ireland, other EU states, Isle of Man, Malta, etc.) and explicit alignment with the Timeline Engine v0.2.  
> **Supersedes:** `graph_schema_v_0_2.md` (adds richer `:Timeline` modelling, more timeline‑related edges, and clarifies the "living graph" behaviour).

This document defines the **Memgraph graph schema** for the Regulatory Intelligence Copilot. It is the contract between:

- Ingestion jobs (that create/update nodes & edges),
- Agent runtime (that queries and reasons over the graph),
- Timeline Engine,
- Any visualisation / debugging tools.

The schema is designed to:

- Capture **rules and their interactions**, not free‑form text.
- Support **multi‑domain** reasoning (tax, welfare, pensions, CGT, EU law).
- Support **multi‑jurisdiction** reasoning (Ireland, other EU countries, Isle of Man, Malta, etc.), without assuming any single "primary" country.
- Support **time‑based reasoning** (lookbacks, lock‑ins, deadlines, usage frequency) through `:Timeline` nodes and edges consumed by the Timeline Engine.
- Act as a **living, incrementally enriched graph** as new rules, guidance, and case law are discovered via MCP and conversation.

### Normative References

This schema spec must be read together with:

- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- `docs/specs/timeline_engine_v_0_2.md`
- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/graph_ingress_guard_v_0_1.md`

---

## 1. Design Goals

1. **Explain interactions, not just find documents**  
   The graph must let us answer:
   - “If I claim X, what happens to Y?”
   - “Which rules interact with this section?”
   - “What changes if I delay until next year?”
   - “How do rules in country A coordinate or conflict with rules in country B?”
   - “How long does this decision constrain my future options?”

2. **Jurisdiction‑neutral**  
   The schema works no matter which jurisdiction is home/primary; cross‑border links are first‑class edges.

3. **Time‑aware**  
   `:Timeline` nodes plus timeline edges express lookbacks, lock‑ins, deadlines, effective windows, and usage frequency in a way that the Timeline Engine v0.2 can consume.

4. **Agent‑friendly**  
   Agents should be able to:
   - Fetch a **small subgraph** relevant to a question.
   - See relationships like `EXCLUDES`, `REQUIRES`, `COORDINATED_WITH`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD` clearly.
   - Pass a summarised subgraph into an LLM.

5. **Evolvable & living**  
   Schema must allow:
   - Adding new node labels and edge types without breaking existing logic.
   - Incremental upserts as MCP tools and LLM‑assisted ingestion discover new rules, cases, and relationships.

6. **User‑agnostic**
   The graph never stores personal user data or specific scenarios. Personas/use cases are modelled via `:ProfileTag` and inputs passed at query time.

---

## 1.1 Privacy & Data Classification

The graph schema is constrained by the data privacy boundaries defined in:

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`

**In summary:**

- Graph nodes and relationships are **public and rule-only**: they may represent jurisdictions, regions, agreements, regimes, rules, benefits, obligations, timelines and document metadata derived from public sources.
- Graph properties must **never include**:
  - User identifiers (names, emails, account IDs)
  - Tenant identifiers (organization names, tenant keys)
  - Uploaded document contents or line-level text
  - Free-text scenario descriptions containing user-specific details
  - PII (personal identifiable information) of any kind
- If new node or edge types are introduced, they **must** be classified according to the privacy spec before being persisted in Memgraph.
- User profile and scenario context is passed to agents during queries but never stored in the graph.

This ensures the graph remains a **shared, multi-tenant knowledge base** that can be freely queried and visualized without privacy concerns.

> **Implementation note:**
> The constraints in this schema are enforced in code by the
> aspect-based Graph Ingress Guard described in
> `docs/specs/graph_ingress_guard_v_0_1.md`, which is applied by the
> `GraphWriteService` before any Cypher is executed against Memgraph.
> Any new node/relationship types or properties introduced by future
> schema revisions must be added both here and to the ingress guard
> configuration before they can be written.

---

## 2. Core Node Labels

### 2.1 `:Jurisdiction`

Represents a country or supranational legal order (Ireland, EU, Malta, Isle of Man, etc.).

**Properties**
- `id: string` – e.g. `"IE"`, `"MT"`, `"IM"`, `"EU"`.
- `name: string` – human label.
- `type: string` – e.g. `"COUNTRY" | "SUPRANATIONAL" | "CROWN_DEPENDENCY"`.
- `notes?: string` – optional extra info.

### 2.2 `:Statute`

Primary or secondary legislation (Acts, Social Welfare Acts, Finance Acts, etc.).

**Properties**
- `id: string` – e.g. `"IE_TCA_1997"`.
- `name: string` – e.g. `"Taxes Consolidation Act 1997"`.
- `citation?: string` – official citation.
- `source_url?: string` – canonical online source.
- `type: string` – e.g. `"PRIMARY" | "SECONDARY"`.

**Relationships**
- `(:Statute)-[:IN_JURISDICTION]->(:Jurisdiction)`

### 2.3 `:Section`

Specific section/subsection of a statute.

**Properties**
- `id: string` – e.g. `"IE_TCA_1997_s766"`.
- `label: string` – e.g. `"s.766"`.
- `title: string` – heading.
- `text_excerpt?: string` – short excerpt/summary (not full text).
- `effective_from?: localdatetime`
- `effective_to?: localdatetime` (null = still in force).

**Relationships**
- `(:Section)-[:PART_OF]->(:Statute)`
- `(:Section)-[:SUBSECTION_OF]->(:Section)` (optional nesting)
- `(:Section)-[:IN_JURISDICTION]->(:Jurisdiction)`

### 2.4 `:Benefit`

Welfare or social benefit (Jobseeker’s, Illness Benefit, etc.).

**Properties**
- `id: string` – e.g. `"IE_BENEFIT_JOBSEEKERS_BENEFIT_SE"`.
- `name: string`
- `category: string` – e.g. `"UNEMPLOYMENT"`, `"ILLNESS"`, `"PENSION"`.
- `short_summary?: string`

**Relationships**
- `(:Benefit)-[:IN_JURISDICTION]->(:Jurisdiction)`

### 2.5 `:Relief`

Tax relief/credit (R&D credit, CGT relief, etc.).

**Properties**
- `id: string` – e.g. `"IE_RELIEF_RND_CREDIT"`.
- `name: string`
- `tax_type: string` – e.g. `"CORPORATION_TAX"`, `"CGT"`.
- `short_summary?: string`

**Relationships**
- `(:Relief)-[:IN_JURISDICTION]->(:Jurisdiction)`

### 2.6 `:Condition`

Reusable eligibility or application condition.

**Properties**
- `id: string`
- `label: string` – e.g. `"Minimum PRSI Contributions"`.
- `description: string`
- `category?: string` – e.g. `"PRSI"`, `"INCOME"`, `"RESIDENCE"`, `"CGT_TIMING"`.

### 2.7 `:Timeline`

Reusable time construct (lookback, lock‑in, deadlines, effective windows, usage frequency). This is the graph counterpart to the `TimelineNode` type in the Timeline Engine v0.2.

**Properties**
- `id: string`
- `label: string` – e.g. `"12‑month Lookback"`, `"4‑year Lock‑in"`.
- `window_days?: int`
- `window_months?: int`
- `window_years?: int`
- `kind?: string` – one of:
  - `"LOOKBACK"`
  - `"LOCK_IN"`
  - `"DEADLINE"`
  - `"EFFECTIVE_WINDOW"`
  - `"USAGE_FREQUENCY"`
  - `"OTHER"`
- `jurisdictionCode?: string` – optional hint (`"IE"`, `"MT"`, etc.), useful where calendars differ.
- `notes?: string`

### 2.8 `:Case`

Court or tribunal decision (Tax Appeals Commission, domestic courts, CJEU, etc.).

**Properties**
- `id: string` – e.g. `"IE_TAC_2024_123"`.
- `name: string`
- `decision_date?: localdatetime`
- `citation?: string`
- `source_url?: string`
- `summary?: string`

**Relationships**
- `(:Case)-[:IN_JURISDICTION]->(:Jurisdiction)`

### 2.9 `:Guidance`

Non‑binding but important guidance (Revenue manuals, eBriefs, DSP guidelines, Pensions Authority notes, etc.).

**Properties**
- `id: string`
- `title: string`
- `issued_by: string` – `"Revenue"`, `"DSP"`, `"Pensions Authority"`, etc.
- `publication_date?: localdatetime`
- `source_url?: string`
- `summary?: string`

**Relationships**
- `(:Guidance)-[:IN_JURISDICTION]->(:Jurisdiction)`

### 2.10 `:EURegulation` / `:EUDirective`

EU instruments that affect domestic rules.

**Properties**
- `id: string` – e.g. `"EU_REG_883_2004"`.
- `name: string`
- `type: string` – `"REGULATION" | "DIRECTIVE"`.
- `citation?: string`
- `source_url?: string`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`

**Relationships**
- `(:EURegulation|:EUDirective)-[:IN_JURISDICTION]->(:Jurisdiction {id: "EU"})`

### 2.11 `:ProfileTag`

Represents a persona or profile segment, used to filter rules (e.g. single director, self‑employed contractor, cross‑border worker).

**Properties**
- `id: string` – e.g. `"PROFILE_SINGLE_DIRECTOR_IE"` or dynamically constructed equivalents.
- `label: string` – e.g. `"Single director, Irish LTD"`.
- `description?: string`

### 2.12 `:Update` / `:ChangeEvent`

Represents a change event (new Act, guidance, case, EU judgment, etc.).

**Properties**
- `id: string`
- `kind: string` – e.g. `"FINANCE_ACT"`, `"GUIDANCE_UPDATE"`, `"COURT_DECISION"`, `"EU_JUDGMENT"`.
- `title: string`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`
- `source_url?: string`
- `summary?: string`

You may use a single label `:Update` or dual labels `:Update:ChangeEvent` for clarity.

### 2.13 Special Jurisdictions & Regimes

Northern Ireland, CTA, Isle of Man, Gibraltar, Andorra and similar edge cases are modelled using the `:Jurisdiction` / `:Region` / `:Agreement` / `:Regime` pattern defined in:

- `docs/specs/special_jurisdictions_modelling_v_0_1.md`

Schema changes **must remain compatible** with that document.

---

## 3. Core Relationship Types

### 3.1 Structural

- `(:Section)-[:PART_OF]->(:Statute)`
- `(:Section)-[:SUBSECTION_OF]->(:Section)`
- `(:X)-[:IN_JURISDICTION]->(:Jurisdiction)` for all rule‑like nodes (`Statute`, `Section`, `Benefit`, `Relief`, `Guidance`, `Case`, `EURegulation`, `EUDirective`).

### 3.2 Applicability & Tagging

- `(:Benefit)-[:APPLIES_TO]->(:ProfileTag)`
- `(:Relief)-[:APPLIES_TO]->(:ProfileTag)`
- `(:Section)-[:APPLIES_TO]->(:ProfileTag)`

These enable fast filtering for specific personas (e.g. single‑director company vs PAYE employee).

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
- `EXCLUDES` is usually directional (“claiming A excludes B”).
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

- Effective windows (e.g. a temporary measure or transitional provision):
  - `(:Update|:ChangeEvent|:Section|:Guidance)-[:EFFECTIVE_WINDOW]->(:Timeline)`

- Usage frequency / once‑per‑period constraints:
  - `(:Relief|:Benefit)-[:USAGE_FREQUENCY]->(:Timeline)`

The Timeline Engine converts these `:Timeline` nodes to concrete date ranges given a scenario context.

### 3.8 EU Implementation & Supremacy

- `(:EURegulation|:EUDirective)-[:IMPLEMENTED_BY]->(:Section)`
- `(:EURegulation|:EUDirective)-[:OVERRIDES { scope?: string, notes?: string }]->(:Section)`

Examples:
- A directive implemented by specific Irish sections and corresponding Maltese sections.
- A regulation whose direct effect overrides conflicting local rules.

### 3.9 Cross‑Jurisdiction Coordination & Treaties

For social security coordination (e.g. EC 883/2004) and bilateral treaties:

- `(:Section|:Benefit|:Relief)-[:COORDINATED_WITH { basis: string }]->(:Section|:Benefit|:Relief)`
  - `basis` examples: `"EU883/2004"`, `"IE_MT_SOCIAL_SECURITY_AGREEMENT"`.

- `(:Section|:Relief)-[:TREATY_LINKED_TO { treaty_id?: string, description?: string }]->(:Section|:Relief)`
- `(:Statute)-[:TREATY_LINKED_TO]->(:Statute)` (higher‑level links).

These edges allow agents to explain cross‑border coordination and treaty‑driven interactions.

### 3.10 Cross‑Jurisdiction Equivalence

To help with analogies between systems:

- `(:Benefit|:Relief)-[:EQUIVALENT_TO { confidence?: float }]->(:Benefit|:Relief)`

Example:
- An Irish benefit that is functionally similar to a Maltese benefit, with differences noted in guidance.

### 3.11 Update & Change Tracking

- `(:Update|:ChangeEvent)-[:AFFECTS]->(:Section|:Benefit|:Relief|:Guidance)`
- `(:Guidance)-[:UPDATES]->(:Guidance)`
- `(:Section)-[:AMENDED_BY]->(:Section)`
- `(:Case)-[:CHANGES_INTERPRETATION_OF]->(:Section)`

Optionally, connect updates to timelines via `:EFFECTIVE_WINDOW` to drive time‑based notifications.

---

## 4. Query Patterns for Agents

### 4.1 Fetch Rules by Profile & Topic (Single Jurisdiction)

Given keywords and a profile tag:

```cypher
MATCH (p:ProfileTag {id: $profileId})
MATCH (j:Jurisdiction {id: $jurisdictionId})
MATCH (n)-[:IN_JURISDICTION]->(j)
WHERE (n:Benefit OR n:Relief OR n:Section)
  AND (n.name CONTAINS $keyword OR n.title CONTAINS $keyword)
MATCH (n)-[:APPLIES_TO]->(p)
OPTIONAL MATCH (n)-[r:CITES|REQUIRES|LIMITED_BY|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD|FILING_DEADLINE|USAGE_FREQUENCY]->(m)
RETURN n, collect(r) AS rels, collect(m) AS neighbours
LIMIT 100;
```

### 4.2 Neighbourhood Expansion (Regulatory Mesh)

```cypher
MATCH (n {id: $nodeId})
OPTIONAL MATCH (n)-[r1]->(m1)
OPTIONAL MATCH (m1)-[r2]->(m2)
RETURN n,
       collect(DISTINCT r1) AS r1s,
       collect(DISTINCT m1) AS m1s,
       collect(DISTINCT r2) AS r2s,
       collect(DISTINCT m2) AS m2s
LIMIT 500;
```

### 4.3 Mutual Exclusions for a Candidate Rule

```cypher
MATCH (n {id: $nodeId})
OPTIONAL MATCH (n)-[r:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH]-(m)
RETURN n, collect(m) AS exclusions;
```

### 4.4 Timeline Constraints for a Rule

```cypher
MATCH (n {id: $nodeId})
OPTIONAL MATCH (n)-[r:LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD|FILING_DEADLINE|USAGE_FREQUENCY]->(t:Timeline)
RETURN n, collect({rel: r, timeline: t}) AS timelines;
```

Agents then adapt these `:Timeline` nodes to the `TimelineNode` interface and pass them into the Timeline Engine.

### 4.5 Cross‑Jurisdiction Slice (Local + Cross‑Border Links)

Given a set of jurisdictions (e.g. `IE`, `MT`, `IM`, `EU`):

```cypher
MATCH (j:Jurisdiction)
WHERE j.id IN $jurisdictions
MATCH (n)-[:IN_JURISDICTION]->(j)
WHERE n:Benefit OR n:Relief OR n:Section

OPTIONAL MATCH (n)-[r:COORDINATED_WITH|TREATY_LINKED_TO|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|EQUIVALENT_TO]->(m)
OPTIONAL MATCH (m)-[:IN_JURISDICTION]->(j2:Jurisdiction)
WHERE j2.id IN $jurisdictions

RETURN n, collect(DISTINCT r) AS rels, collect(DISTINCT m) AS neighbours;
```

### 4.6 Cross‑Border Mutual Exclusions (Country A vs Country B)

```cypher
MATCH (j1:Jurisdiction {id: $jurisA})
MATCH (j2:Jurisdiction {id: $jurisB})
MATCH (n)-[:IN_JURISDICTION]->(j1)
MATCH (m)-[:IN_JURISDICTION]->(j2)
MATCH (n)-[r:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH]->(m)
RETURN n, r, m;
```

### 4.7 Change Impact Queries

Basic pattern for determining impact of an update:

```cypher
MATCH (u:Update {id: $updateId})
OPTIONAL MATCH (u)-[:AFFECTS]->(n)
OPTIONAL MATCH (n)-[r:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|REQUIRES|LIMITED_BY|COORDINATED_WITH|TREATY_LINKED_TO]->(m)
RETURN u, collect(DISTINCT n) AS directlyAffected, collect(DISTINCT m) AS indirectlyLinked;
```

Optionally include timelines:

```cypher
OPTIONAL MATCH (u)-[:EFFECTIVE_WINDOW]->(t:Timeline)
RETURN u, t, directlyAffected, indirectlyLinked;
```

---

## 5. Ingestion Guidelines

1. **Use `:Jurisdiction` consistently**  
   Every rule‑like node (`Statute`, `Section`, `Benefit`, `Relief`, `Guidance`, `Case`, EU instruments) should have exactly one `IN_JURISDICTION` edge.

2. **Prefer stable IDs**  
   Use IDs that won’t change if text moves (e.g. `IE_TCA_1997_s766` instead of position‑based IDs).

3. **Store summaries, not full texts**  
   Keep `text_excerpt` / `summary` short and link to `source_url`. Full text should live in external systems or MCP‑fetched documents.

4. **Encode relationships, not narrative**  
   Focus ingestion on:
   - Conditions (`REQUIRES`, `LIMITED_BY`).
   - Mutual exclusions (`EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`).
   - Timelines (`LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`).
   - Cross‑border links (`COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`).
   - Change impact (`AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`).

5. **Keep the graph user‑agnostic**  
   Do **not** store user data or concrete scenarios in Memgraph. Personas are modelled via `:ProfileTag` only; scenarios live in ephemeral, per‑request structures.

6. **Be explicit about cross‑border links**  
   When a rule clearly interacts with another jurisdiction (EU regulation, treaty, coordination rule), add an appropriate edge instead of hoping the LLM infers it.

7. **Support a living graph**  
   Ingestion jobs and MCP‑driven upserts should:
   - Prefer idempotent operations (upsert patterns).
   - Attach `:Update` / `:ChangeEvent` nodes when new documents are detected.
   - Add relationships gradually; it’s acceptable for some regions of the graph to be sparse initially and enriched over time.

---

## 6. Versioning & Evolution

- This is **v0.3** of the graph schema.
- Changes from v0.2:
  - Added `kind` and `jurisdictionCode` properties on `:Timeline` to align with Timeline Engine v0.2.
  - Added timeline‑related relationships: `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`.
  - Clarified the role of `:Update`/`:ChangeEvent` nodes in combination with timelines and change‑impact queries.
  - Explicitly documented the "living graph" behaviour and incremental upsert expectations.
- Further changes should be recorded in `graph_schema_changelog.md` with migration notes where needed.

---

## 7. Scope of v0.3

This schema is sufficient for:

- Single‑director company and self‑employed scenarios in Ireland.
- Social welfare entitlements and constraints (incl. mutual exclusions and time windows).
- Tax reliefs and R&D credits with cross‑references and time‑based conditions.
- CGT timing and loss‑relief interactions at a rule‑interaction level.
- EU–Irish law mapping and initial cross‑border scenarios involving other EU states, Isle of Man, and Malta.
- Capturing change events (Finance Acts, guidance updates, cases) and relating them to existing rules and timelines.

Agents and ingestion jobs should treat this document as the **source of truth** for how they structure and query the regulatory graph in v0.3.

