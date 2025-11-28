# Graph Schema Changelog – Regulatory Intelligence Copilot

This document tracks **backwards-incompatible and significant additive changes** to the Memgraph schema used by the Regulatory Intelligence Copilot.

Each entry should describe:
- What changed (nodes, relationships, properties)
- Why it changed (design/feature motivation)
- Any migration considerations

---

## v0.2 – Cross-Jurisdiction Support & Relationship Refinement

**Spec:** `graph_schema_v0_2.md`  
**Previous:** `graph_schema_v0_1.md`  
**Status:** Draft / In implementation

### Summary of Changes

1. **Introduced explicit `:Jurisdiction` nodes**
   - New label: `:Jurisdiction`
   - Properties:
     - `id: string` – e.g. `"IE"`, `"MT"`, `"IM"`, `"EU"`
     - `name: string`
     - `type: string` – `"COUNTRY" | "SUPRANATIONAL" | "CROWN_DEPENDENCY"`
     - `notes?: string`

2. **Standardised `IN_JURISDICTION` relationships**
   - New relationship: `(:X)-[:IN_JURISDICTION]->(:Jurisdiction)` where `:X` ∈ {`Statute`, `Section`, `Benefit`, `Relief`, `Guidance`, `Case`, `EURegulation`, `EUDirective`}.
   - Replaces or formalises any previous ad-hoc `jurisdiction` string property as the *primary* way to associate rules with a jurisdiction.

3. **Added cross-border relationship types**
   - `COORDINATED_WITH` – for social security coordination and similar mechanisms:
     - `(:Section|:Benefit|:Relief)-[:COORDINATED_WITH { basis: string }]->(:Section|:Benefit|:Relief)`
   - `TREATY_LINKED_TO` – for double tax treaties, social security treaties:
     - `(:Section|:Relief)-[:TREATY_LINKED_TO { treaty_id?: string, description?: string }]->(:Section|:Relief)`
     - `(:Statute)-[:TREATY_LINKED_TO]->(:Statute)`
   - `EQUIVALENT_TO` – for analogue benefits/reliefs across jurisdictions:
     - `(:Benefit|:Relief)-[:EQUIVALENT_TO { confidence?: float }]->(:Benefit|:Relief)`
   - `OVERRIDES` – for EU instruments directly overriding local rules:
     - `(:EURegulation|:EUDirective)-[:OVERRIDES { scope?: string, notes?: string }]->(:Section)`

4. **Clarified cross-jurisdiction usage of existing relationship types**
   - `EXCLUDES` and `MUTUALLY_EXCLUSIVE_WITH` remain, but are now explicitly allowed *across* jurisdictions:
     - `(:Benefit)-[:EXCLUDES]->(:Benefit)` (IE ↔ MT, IE ↔ IM, etc.)
     - `(:Relief)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Relief)` across countries or regimes.
   - Relationship properties may now include:
     - `reason?: string` – e.g. `"COORDINATION_RULE"`
     - `basis?: string` – e.g. `"TREATY"`, `"EU883/2004"`, `"DOMESTIC_STATUTE"`.

5. **Minor clarifications and additions**
   - Documented `:Update` nodes more clearly as the place for representing change events (Finance Acts, eBriefs, decisions).
   - Re-emphasised that **user data does not belong in the graph** – only rules and relationships.

### Motivation

- Support **multi-jurisdiction reasoning** (Ireland, other EU states, Isle of Man, Malta, etc.) without hardcoding “Ireland as primary”.
- Cleanly express cross-border interactions:
  - Social security coordination (e.g. EC 883/2004).
  - Double taxation agreements.
  - Cross-country benefit/relief conflicts and exclusions.
  - EU law implementation and override of national law.
- Give agents clear structural signals instead of relying on the LLM to guess cross-border relationships from text.

### Migration Considerations

1. **Jurisdiction modelling**
   - For any existing v0.1 data where nodes have a `jurisdiction` *property*:
     - Create corresponding `:Jurisdiction` nodes (if not already present).
     - Add `(:X)-[:IN_JURISDICTION]->(:Jurisdiction)` edges based on that property.
     - Optionally keep the original `jurisdiction` property for logging/legacy, but new queries should rely on the relationship.

2. **Backfilling `:Jurisdiction` nodes**
   - At minimum, create:
     - `(:Jurisdiction {id: "IE", name: "Ireland", type: "COUNTRY"})`
     - `(:Jurisdiction {id: "EU", name: "European Union", type: "SUPRANATIONAL"})`
   - As cross-border rules are ingested, add `MT`, `IM`, and other relevant jurisdictions.

3. **Introducing cross-border edges incrementally**
   - It is **not** necessary to retrofit the entire corpus at once.
   - Start with high-value interactions (e.g. social security coordination, specific IE–MT/IE–IM treaty areas) and add `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO` edges where explicitly known.
   - Agents must be robust to partial coverage and surface uncertainty when links are missing.

4. **Query updates**
   - Any queries that previously filtered on `n.jurisdiction = 'IE'` should be updated to:

     ```cypher
     MATCH (j:Jurisdiction {id: $jurisdictionId})
     MATCH (n)-[:IN_JURISDICTION]->(j)
     ```

   - Cross-border queries should use the new `COORDINATED_WITH`, `TREATY_LINKED_TO`, etc., as described in `graph_schema_v0_2.md`.

5. **Visualisation and tooling**
   - Graph visualisation tools should be updated to:
     - Display `:Jurisdiction` nodes and `IN_JURISDICTION` edges.
     - Highlight cross-border edges (`COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`, `OVERRIDES`).

---

## v0.1 – Initial Regulatory Graph Schema

**Spec:** `graph_schema_v0_1.md`  
**Status:** Baseline (deprecated but historically important)

### Summary of Features

- Node labels:
  - `:Statute`, `:Section`, `:Benefit`, `:Relief`, `:Condition`, `:Timeline`, `:Case`, `:Guidance`, `:EURegulation`, `:EUDirective`, `:ProfileTag`.
- Relationships:
  - Structural: `PART_OF`, `SUBSECTION_OF`.
  - Applicability: `APPLIES_TO` (→ `ProfileTag`).
  - Cross‑references: `CITES`, `INTERPRETS`, `APPLIES_TO` (from Case to rules).
  - Eligibility & limits: `REQUIRES`, `LIMITED_BY`.
  - Conflicts: `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`.
  - Timelines: `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`.

### Limitations Addressed in v0.2

- Jurisdiction was implicit or stored as a simple string property (no `:Jurisdiction` nodes).
- Cross-border relationships were not formally modelled.
- EU implementation and override relationships were less explicit.

---

## Guidelines for Future Schema Versions

When evolving the graph schema beyond v0.2:

1. **Version every spec**  
   - Add `graph_schema_v0_3.md`, `v0_4.md`, etc. rather than editing old versions in place.

2. **Update this changelog**  
   - For each version, document:
     - New or changed labels/relationships.
     - Reason for changes.
     - Migration steps.

3. **Keep agents and ingestion in sync**  
   - Any change here should trigger:
     - A review of ingestion jobs.
     - A review of agent query patterns.
     - At least minimal migration scripts or notes.

4. **Avoid user-data leakage into the graph**  
   - Even if future versions add more user/persona concepts, keep *individual* user data out of Memgraph. Use `ProfileTag` and sandbox-local context instead.

5. **Prefer additive changes over destructive ones**  
   - When possible, introduce new labels/edges alongside old ones and migrate gradually.
   - Deprecate old patterns in documentation before removing them from the graph.

This changelog should be treated as the **single source of truth** for how the graph schema has evolved over time.

