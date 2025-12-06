# Graph Schema Changelog – Regulatory Intelligence Copilot

> Tracks **backwards‑incompatible** and **notable additive** changes to the Memgraph schema used by the Regulatory Intelligence Copilot.
>
> This file describes the evolution from the original RFC‑focused graph to the current **multi‑jurisdiction regulatory graph**.

---

## v0.3 – Cross‑Jurisdiction + Timeline Alignment (CURRENT)

**Status:** Draft, active design  
**Supersedes:** `schema_v_0_2.md`

### Summary

Aligns the graph schema with:

- The **Timeline Engine v0.2** (lookbacks, lock‑ins, deadlines, usage frequency).
- The **cross‑jurisdiction design** (Ireland + other EU states + Isle of Man + Malta, etc.).
- The concept of a **living graph** that is incrementally enriched via MCP + chat‑driven ingestion.

### Node/Property Changes

- **`:Timeline` nodes** extended to match the `TimelineNode` interface:
  - Added `kind` property (`"LOOKBACK" | "LOCK_IN" | "DEADLINE" | "EFFECTIVE_WINDOW" | "USAGE_FREQUENCY" | "OTHER"`).
  - Added `jurisdictionCode?: string` so that time rules can be tied to specific jurisdictions when needed.
  - Clarified that `window_days/window_months/window_years` represent **durations**, not absolute dates.

- **`:Update` / `:ChangeEvent`** clarified as the canonical way to represent change events (Finance Acts, guidance updates, court decisions, EU judgments) with:
  - `kind` (e.g. `"FINANCE_ACT"`, `"GUIDANCE_UPDATE"`, `"COURT_DECISION"`, `"EU_JUDGMENT"`).
  - `effective_from` / `effective_to` where known.

### Relationship Changes

- Added/standardised **timeline‑related edges**:
  - `(:Benefit|:Relief|:Condition)-[:LOOKBACK_WINDOW]->(:Timeline)`
  - `(:Benefit|:Relief)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`
  - `(:Section|:Relief|:Benefit)-[:FILING_DEADLINE]->(:Timeline)`
  - `(:Update|:ChangeEvent|:Section|:Guidance)-[:EFFECTIVE_WINDOW]->(:Timeline)`
  - `(:Relief|:Benefit)-[:USAGE_FREQUENCY]->(:Timeline)`

- Clarified **change‑impact relationships**:
  - `(:Update|:ChangeEvent)-[:AFFECTS]->(:Section|:Benefit|:Relief|:Guidance)`
  - `(:Case)-[:CHANGES_INTERPRETATION_OF]->(:Section)`
  - `(:Guidance)-[:UPDATES]->(:Guidance)`
  - `(:Section)-[:AMENDED_BY]->(:Section)`

- Reaffirmed and expanded **cross‑border edges** (from v0.2):
  - `(:Section|:Benefit|:Relief)-[:COORDINATED_WITH { basis }]->(:Section|:Benefit|:Relief)`
  - `(:Section|:Relief)-[:TREATY_LINKED_TO { treaty_id?, description? }]->(:Section|:Relief)`
  - `(:Benefit|:Relief)-[:EQUIVALENT_TO { confidence? }]->(:Benefit|:Relief)`

### Behavioural / Conceptual Changes

- **Living graph explicitly defined**:
  - Ingestion and MCP jobs are expected to **upsert** (`MERGE`) nodes/edges.
  - It is acceptable for early graphs to be sparse; relationships are enriched over time via:
    - Batch ingestion of legislation/guidance.
    - MCP‑driven discovery of new cases/updates.
    - Chat‑driven enrichment (agent proposes new edges, then writes them via a controlled path).

- **User‑agnostic graph** reaffirmed:
  - No user‑specific scenarios are stored in Memgraph.
  - Personas remain in `:ProfileTag`; concrete scenarios are held in transient data structures and never persisted.

- **Alignment with Timeline Engine v0.2**:
  - Graph is now the single source for temporal rules; code that previously hard‑coded time windows should instead:
    - Query `:Timeline` nodes.
    - Adapt them into `TimelineNode` and pass them to the Timeline Engine.

---

## v0.2 – Cross‑Jurisdiction & Regulatory Pivot

**Status:** Historical, still compatible but superseded  
**Primary doc:** `schema_v_0_2.md`

### Summary

This version pivoted the project from an HTTP/RFC/OWASP‑oriented graph to a **regulatory compliance graph** aimed at:

- Irish tax and social welfare rules.
- EU regulations/directives that influence domestic rules.
- Cross‑border coordination (e.g. social security coordination, treaties).

It introduced **jurisdiction‑aware modelling** and initial change‑tracking nodes.

### Key Additions

- New core labels:
  - `:Jurisdiction` to represent countries/supranational orders.
  - `:EURegulation` / `:EUDirective` for EU‑level instruments.
  - `:Update` / `:ChangeEvent` for legislative/guidance/case updates.

- Cross‑border and coordination relationships:
  - `(:EURegulation|:EUDirective)-[:IMPLEMENTED_BY]->(:Section)`.
  - `(:EURegulation|:EUDirective)-[:OVERRIDES]->(:Section)` for supremacy scenarios.
  - `(:Section|:Benefit|:Relief)-[:COORDINATED_WITH]->(:Section|:Benefit|:Relief)`.
  - `(:Section|:Relief)-[:TREATY_LINKED_TO]->(:Section|:Relief)` for bilateral or multilateral treaties.
  - `(:Benefit|:Relief)-[:EQUIVALENT_TO]->(:Benefit|:Relief)` for functional analogues across jurisdictions.

- Mutual exclusion and conflict modelling:
  - `(:Benefit|:Relief)-[:EXCLUDES]->(:Benefit|:Relief)`.
  - `(:Benefit|:Relief)-[:MUTUALLY_EXCLUSIVE_WITH]->(:Benefit|:Relief)`.

- First‑class **profile tags**:
  - `:ProfileTag` nodes (e.g. `PROFILE_SINGLE_DIRECTOR_IE`) and `:APPLIES_TO` edges allowed fast persona‑based filtering.

### Behavioural Notes

- v0.2 recognised:
  - The need to keep graph **persona‑centric, not user‑specific**.
  - That MCP is particularly valuable for:
    - Tax Appeals Commission decisions and other case law.
    - Revenue eBriefs and manuals.
    - EU judgments and coordination updates.

- Temporality was present but less structured; `:Timeline` existed but without `kind` and without tight alignment to a dedicated Timeline Engine.

---

## v0.1 – Initial RFC / OWASP Graph (Legacy)

**Status:** Legacy, no longer used by the regulatory copilot  
**Primary doc:** Previous `schema_v_0_1.md` (historical)

### Summary

The initial graph schema was designed for **HTTP/RFC/OWASP compliance auditing** (the `rfc-refactor` concept). It is useful as historical context but has been **superseded** by the regulatory‑graph design.

### Key Characteristics

- Focused on:
  - HTTP RFCs (e.g. 7230/7231/7807).
  - OWASP Top 10 vulnerabilities.
  - API endpoints, request/response headers.

- Core labels included:
  - Nodes for `:Endpoint`, `:Header`, `:Finding`, `:RfcSection`, etc.
  - Relationships mapping endpoints and headers to RFC/OWASP findings.

- Purpose:
  - Allow LLMs + MCP to analyse HTTP transcripts and classify spec/security compliance.

### Migration Notes

- The regulatory copilot **no longer uses** these HTTP/RFC/OWASP‑specific nodes/edges.
- Any remaining legacy data should either:
  - Be moved into a separate `legacy_` database or schema, or
  - Be removed entirely if not needed.

---

## How to Use This Changelog

- **Ingestion jobs** should target the **current schema version** (v0.3) and avoid inserting deprecated patterns.
- **Agents and Timeline Engine** should be written against v0.3 types and relationships, but remain tolerant of partially‑migrated data while the graph is evolving.
- Future schema changes should:
  - Add a new section (`v0.4`, etc.).
  - Clearly state what changed and why.
  - Include any migration notes for existing data where relevant.

