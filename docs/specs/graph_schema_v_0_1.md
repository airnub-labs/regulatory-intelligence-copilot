# Graph Schema Spec v0.1 – Regulatory Intelligence Copilot

> **Status:** Draft v0.1  
> **Scope:** Core graph model for Irish tax, welfare, pensions, CGT & EU regulatory relationships.

This document defines the **Memgraph graph schema** for the Regulatory Intelligence Copilot. It is the contract between:

- Ingestion jobs (that create/update nodes & edges),
- Agent runtime (that queries and reasons over the graph), and
- Any visualisation / debugging tools.

The schema is intentionally **pragmatic** rather than academically pure: we model the parts of law and guidance that are most relevant to reasoning about **eligibility**, **interactions**, **mutual exclusions**, and **timelines**.

---

## 1. Design Goals

1. **Explain interactions, not just find documents**  
   The graph must let us answer:
   - “If I claim X, what happens to Y?”
   - “Which rules interact with this section?”
   - “What changes if I delay until next year?”

2. **Support multiple domains**  
   Same schema must handle: tax, welfare, pensions, CGT, EU regulations, case law.

3. **Agent-friendly**  
   Agents should be able to:
   - Fetch a **small subgraph** relevant to a question.
   - See relationships like `EXCLUDES`, `REQUIRES`, `LOOKBACK_WINDOW` clearly.
   - Pass a summarised subgraph into an LLM.

4. **Evolvable**  
   Schema must allow:
   - Adding new node labels (e.g. sector-specific rules).
   - Adding new edge types (e.g. `OVERRIDDEN_BY`) without breaking existing logic.

---

## 2. Core Node Labels

### 2.1 `:Statute`

Represents primary or secondary legislation (Acts, Social Welfare Acts, Finance Acts, etc.).

**Properties**
- `id: string` – internal ID (e.g. `IE_TCA_1997`).
- `name: string` – human name (e.g. `"Taxes Consolidation Act 1997"`).
- `jurisdiction: string` – e.g. `"IE"`, `"EU"`.
- `citation: string` – official citation if applicable.
- `source_url?: string` – canonical online source.
- `type: string` – e.g. `"PRIMARY" | "SECONDARY"`.

### 2.2 `:Section`

Represents a specific section/subsection of a statute.

**Properties**
- `id: string` – unique (e.g. `IE_TCA_1997_s766`).
- `label: string` – display label (e.g. `"s.766"`).
- `title: string` – short title / heading.
- `text_excerpt?: string` – short excerpt or summary (not full text).
- `jurisdiction: string` – typically aligns with statute.
- `effective_from?: localdatetime`
- `effective_to?: localdatetime` (null = still in force).

**Relationships**
- `(:Section)-[:PART_OF]->(:Statute)`

### 2.3 `:Benefit`

Represents a welfare or social benefit (e.g. Jobseeker’s Benefit, Illness Benefit).

**Properties**
- `id: string` – e.g. `IE_BENEFIT_JOBSEEKERS_BENEFIT`.
- `name: string`
- `jurisdiction: string`
- `category: string` – e.g. `"UNEMPLOYMENT"`, `"ILLNESS"`, `"PENSION"`.
- `short_summary?: string`

### 2.4 `:Relief`

Represents a tax relief/credit (e.g. R&D credit, CGT reliefs).

**Properties**
- `id: string` – e.g. `IE_RELIEF_RND_CREDIT`.
- `name: string`
- `jurisdiction: string`
- `tax_type: string` – e.g. `"CORPORATION_TAX"`, `"CGT"`.
- `short_summary?: string`

### 2.5 `:Condition`

Represents an eligibility or application condition that is shared or reused.

**Properties**
- `id: string`
- `label: string` – short label (e.g. `"Min PRSI Contributions"`).
- `description: string` – human-readable description.
- `category?: string` – e.g. `"PRSI"`, `"INCOME"`, `"RESIDENCE"`.

### 2.6 `:Timeline`

Represents a reusable timeline concept (e.g. lookback window, lock-in, deadlines).

**Properties**
- `id: string`
- `label: string` – e.g. `"12-month Lookback"`, `"4-year Lock-in"`.
- `window_days?: int`
- `window_months?: int`
- `window_years?: int`
- `notes?: string`

### 2.7 `:Case`

Represents a court or tribunal decision.

**Properties**
- `id: string` – e.g. `IE_TAC_2024_123`.
- `name: string` – case name or reference.
- `jurisdiction: string` – `"IE_TAC"`, `"IE_COURT"`, `"EU_CJEU"`, etc.
- `decision_date?: localdatetime`
- `citation?: string`
- `source_url?: string`
- `summary?: string`

### 2.8 `:Guidance`

Represents non-binding but important guidance (Revenue manuals, eBriefs, DSP guidelines).

**Properties**
- `id: string`
- `title: string`
- `jurisdiction: string`
- `issued_by: string` – e.g. `"Revenue"`, `"DSP"`, `"Pensions Authority"`.
- `publication_date?: localdatetime`
- `source_url?: string`
- `summary?: string`

### 2.9 `:EURegulation` / `:EUDirective`

Represents EU instruments that affect domestic rules.

**Properties**
- `id: string` – e.g. `EU_REG_883_2004`.
- `name: string`
- `type: string` – `"REGULATION" | "DIRECTIVE"`.
- `citation?: string`
- `source_url?: string`
- `effective_from?: localdatetime`
- `effective_to?: localdatetime`

### 2.10 `:ProfileTag`

Represents a user/profiling tag that helps narrow applicability.

**Properties**
- `id: string` – e.g. `PROFILE_SINGLE_DIRECTOR_IE`.
- `label: string` – e.g. `"Single director, Irish LTD"`.
- `description?: string`

---

## 3. Core Relationship Types

### 3.1 Structural Relationships

- `(:Section)-[:PART_OF]->(:Statute)`
- `(:Section)-[:SUBSECTION_OF]->(:Section)` (optional, for nested sections)

### 3.2 Applicability & Tagging

- `(:Benefit)-[:APPLIES_TO]->(:ProfileTag)`
- `(:Relief)-[:APPLIES_TO]->(:ProfileTag)`
- `(:Section)-[:APPLIES_TO]->(:ProfileTag)`

These allow agents to quickly filter rules relevant to a given user type.

### 3.3 Cross-References

- `(:Section)-[:CITES]->(:Section)`
- `(:Section)-[:CITES]->(:EURegulation)`
- `(:Section)-[:CITES]->(:Guidance)`
- `(:Guidance)-[:INTERPRETS]->(:Section)`
- `(:Case)-[:INTERPRETS]->(:Section)`
- `(:Case)-[:APPLIES_TO]->(:Benefit)` / `(:Relief)`

### 3.4 Eligibility & Conditions

- `(:Benefit)-[:REQUIRES]->(:Condition)`
- `(:Relief)-[:REQUIRES]->(:Condition)`
- `(:Section)-[:REQUIRES]->(:Condition)`

### 3.5 Limitations & Thresholds

- `(:Benefit)-[:LIMITED_BY]->(:Condition)`
- `(:Relief)-[:LIMITED_BY]->(:Condition)`

Conditions might encode income limits, contribution minima, etc.

### 3.6 Mutual Exclusions & Conflicts

- `(:Benefit)-[:EXCLUDES]->(:Benefit)`
- `(:Relief)-[:EXCLUDES]->(:Relief)`
- `(:Relief)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Relief)`
- `(:Benefit)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Relief)`

Directionality:
- `EXCLUDES` can be directional (“claiming A excludes B”).
- `MUTUALLY_EXCLUSIVE_WITH` should be created in both directions or treated as symmetric.

### 3.7 Timelines & Windows

- `(:Benefit)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:Relief)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:Condition)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:Benefit)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`
- `(:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`

These edges allow the timeline engine to compute concrete date windows.

### 3.8 EU Implementation Links

- `(:EURegulation)-[:IMPLEMENTED_BY]->(:Section)`
- `(:EUDirective)-[:IMPLEMENTED_BY]->(:Section)`

Agents use these to understand when EU changes propagate into Irish law.

### 3.9 Update & Change Tracking

(optional but recommended for later phases)

- `(:Guidance)-[:UPDATES]->(:Guidance)`
- `(:Section)-[:AMENDED_BY]->(:Section)` (amending legislation)
- `(:Case)-[:CHANGES_INTERPRETATION_OF]->(:Section)`
- `(:Update)-[:AFFECTS]->(:Section|:Benefit|:Relief)`

`(:Update)` can be a small node type representing “change events” (Finance Act, new Guidance, court decision).

---

## 4. Query Patterns for Agents

This section defines **canonical query patterns** agents should use.

### 4.1 Fetch Rules by Profile & Topic

Given keywords and profile tags:

```cypher
MATCH (p:ProfileTag {id: $profileId})
MATCH (n)
WHERE n:Benefit OR n:Relief OR n:Section
  AND (n.name CONTAINS $keyword OR n.title CONTAINS $keyword)
MATCH (n)-[:APPLIES_TO]->(p)
OPTIONAL MATCH (n)-[r:CITES|REQUIRES|LIMITED_BY|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD]->(m)
RETURN n, collect(r), collect(m)
LIMIT 100;
```

### 4.2 Expand a Node’s Regulatory Neighbourhood

```cypher
MATCH (n {id: $nodeId})
OPTIONAL MATCH (n)-[r1]->(m1)
OPTIONAL MATCH (m1)-[r2]->(m2)
RETURN n, collect(distinct r1) AS r1s, collect(distinct m1) AS m1s,
       collect(distinct r2) AS r2s, collect(distinct m2) AS m2s
LIMIT 500;
```

Agents can compress the resulting subgraph into a JSON structure for the LLM.

### 4.3 Find Mutual Exclusions for a Candidate Rule

```cypher
MATCH (n {id: $nodeId})
OPTIONAL MATCH (n)-[:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH]-(m)
RETURN n, collect(m) AS exclusions;
```

### 4.4 Fetch Timeline Constraints

```cypher
MATCH (n {id: $nodeId})
OPTIONAL MATCH (n)-[:LOOKBACK_WINDOW|LOCKS_IN_FOR_PERIOD]->(t:Timeline)
RETURN n, collect(t) AS timelines;
```

Agent then passes `timelines` to the timeline engine.

---

## 5. Ingestion Guidelines

1. **Prefer stable IDs**  
   Use IDs that won’t change if text does (e.g. `IE_TCA_1997_s766`).

2. **Keep text excerpts short**  
   Don’t store full legislation text; store concise excerpts or summaries pointing back to `source_url`.

3. **Encode rules, not narrative**  
   Focus on conditions, exclusions, relationships, and timelines rather than commentary.

4. **Avoid user-specific data**  
   The graph is about rules, not individual users. All personalization happens at query time.

5. **Be explicit with `APPLIES_TO`**  
   Tag rules with appropriate `ProfileTag`s to keep agent queries efficient.

---

## 6. Versioning & Evolution

- This is **v0.1** of the schema.
- Changes should be documented in a `graph_schema_changelog.md` and, where necessary, migration scripts should be provided.
- New node/edge types can be added freely, but existing semantics (especially for `EXCLUDES`, `REQUIRES`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`) should remain stable or be evolved carefully.

---

## 7. Open Questions / Future Work

- How much case law detail to model vs. summarise?
- Whether to add explicit `:Threshold` nodes for numeric thresholds (income caps, contribution minima).
- Whether to represent some calculations (e.g. effective tax rate) as graph nodes or leave them purely to code in the sandbox.

For now, this v0.1 schema is sufficient for:

- Single-director company scenarios.
- Self-employed welfare entitlements.
- CGT timing and loss relief interactions.
- Basic EU–Irish law mapping.

Agents and ingestion jobs should treat this document as the **source of truth** for how they structure and query the regulatory graph.

