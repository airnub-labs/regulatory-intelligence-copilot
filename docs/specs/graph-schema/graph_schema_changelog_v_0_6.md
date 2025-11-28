# Graph Schema Changelog v0.6 – Regulatory Intelligence Copilot

> Tracks changes to the Memgraph schema for architecture alignment.
>
> **Status:** Current  
> **Supersedes:** `docs/specs/graph-schema/versions/graph_schema_changelog_v_0_4.md`

---

## v0.6 – Concept Layer & Self‑Populating Graph

**Status:** Current  
**Aligned with:** `architecture_v_0_6.md`, `decisions_v_0_6.md`  
**Primary schema:** `graph_schema_v_0_6.md`  
**Companion specs:**

- `concept_capture_from_main_chat_v_0_1.md`
- `conversation_context_spec_v_0_1.md`
- `graph_ingress_guard_v_0_1.md`
- `graph_algorithms_v_0_1.md`
- `data_privacy_and_architecture_boundaries_v_0_1.md`

### 1. Summary

v0.6 keeps the v0.3/v0.4 rule graph intact but introduces a **concept layer** on top so the system can:

- Capture canonical regulatory concepts (e.g. `VAT_IE`, `VRT_IE`, `IMPORT_VEHICLE_TO_IE`) directly from main chat via the `capture_concepts` tool.
- Self‑populate the rules graph in the background (MCP + ingestion) when a concept is new or under‑specified.
- Provide stable, SKOS‑like anchors that link:
  - User questions and conversation context,
  - Ingestion jobs,
  - Rule nodes (sections, benefits, cases, guidance, timelines).

Memgraph remains a **shared, PII‑free rules graph**; all per‑conversation/user state is still held in Supabase/Postgres.

### 2. Schema Changes

#### 2.1 New Node Labels

##### `(:Concept)` – Canonical Regulatory Concept

Canonical, SKOS‑inspired concept representing a real‑world regulatory idea that may span multiple rules, sections, or benefits.

Required properties:

- `id: string`  
  Stable, opaque canonical ID (e.g. `"tax:ie:vat"`, `"vehicle:ie:vrt"`, `"import:ie:vehicle:japan"`).
- `domain: string`  
  High‑level domain, e.g. `"TAX"`, `"WELFARE"`, `"PENSIONS"`, `"CGT"`, `"VEHICLE_REG"`.
- `kind: string`  
  Concept type within the domain, e.g. `"VAT"`, `"VRT"`, `"IMPORT_DUTY"`, `"UNIVERSAL_CREDIT"`.
- `jurisdiction: string`  
  Primary jurisdiction or regime, e.g. `"IE"`, `"UK"`, `"EU"`, `"NI"`, `"IM"`.

Optional but recommended:

- `prefLabel: string`  
  Human‑friendly label, e.g. `"Irish VAT (Value‑Added Tax)"`.
- `definition: string`  
  Short descriptive definition (safe, non‑user‑specific).
- `source_system: string`  
  E.g. `"REVENUE_IE"`, `"DSP_IE"`, `"TAXES_CONSOLIDATION_ACT_1997"`, `"EU_DIRECTIVE"`.
- `ingestion_status: string`  
  `"NEW" | "PARTIAL" | "COMPLETE" | "STALE"` – used by ingestion pipeline.
- `created_at: datetime`, `updated_at: datetime`  
  Timestamps for change tracking.
- `last_verified_at: datetime`  
  Last time this concept’s mapping to specific rules was verified/refreshed.

Constraints (non‑exhaustive):

- Unique constraint on `(:Concept { id })`.
- Soft uniqueness on `(domain, kind, jurisdiction)` enforced by `GraphWriteService` (i.e. new data merges into existing concept if those three match).

##### `(:Label)` – SKOS‑Style Alternative Label

Represents a single alternate name or synonym for a concept (SKOS‑style `altLabel`).

Required properties:

- `value: string`  
  The label text, e.g. `"sales tax in Ireland"`, `"Irish VAT"`.

Optional:

- `locale: string`  
  BCP‑47 style locale if relevant, e.g. `"en-IE"`.
- `kind: string`  
  E.g. `"COMMON_NAME"`, `"ABBREVIATION"`, `"FORMAL_NAME"`.

Constraints:

- It is valid for multiple `:Concept` nodes to reuse the same `:Label` (no global uniqueness enforced at label level).

#### 2.2 New Relationships

**Concept ↔ Labels**

- `(:Concept)-[:HAS_ALT_LABEL]->(:Label)`

  Connects canonical concept to its alternate labels/synonyms. Created/merged by `GraphWriteService` from SKOS `altLabels` in the tool payload.

**Concept ↔ Rules / Benefits / Cases / Guidance**

Non‑exhaustive but core pattern:

- `(:Concept)-[:ALIGNS_WITH]->(:Section | :Benefit | :Relief | :Timeline | :Case | :Guidance | :EURegulation | :EUDirective | :Regime | :Agreement)`

Indicates that this concept is materially represented or operationalised by the target node(s). Example: VAT_IE → aligns with multiple TCA sections + Revenue manuals.

Granularity is intentionally loose in v0.6; future versions may introduce more specific relationship types such as:

- `:PRIMARY_SECTION_FOR`
- `:DEFINED_BY`
- `:IMPLEMENTED_BY`

but those are not required in v0.6.

**Concept ↔ Source / Change Tracking**

To tie concepts to change events and documents using the existing change model:

- `(:Concept)-[:DERIVED_FROM]->(:Update)`  
  When a new concept is created because of a specific update/Finance Act/case.

- `(:Concept)-[:HAS_SOURCE]->(:Guidance | :Case | :EURegulation | :EUDirective | :Agreement)`  
  Optional anchoring to authoritative sources, when known.

#### 2.3 Optional Properties on Existing Nodes

Existing “rules” nodes may be enriched (optionally) to facilitate concept‑driven queries and graph algorithms:

- `community_id: string | int`  
  Community/cluster ID.
- `centrality_score: float`  
  Optional centrality metric for ranking.
- `concept_ids: string[]` (optional)  
  Denormalised list of concept `id` values that align with this rule node.

These are additive and non‑breaking; queries must not rely on their presence.

---

### 3. Behavioural Changes & Engine Integration

v0.6 does not require any direct schema changes in client code that only reads by labels/relationships; instead, it adds new nodes/edges so that higher‑level features can be implemented cleanly.

#### 3.1 Concept Capture from Main Chat

- The **main chat call** now includes a `capture_concepts` tool (SKOS‑like JSON schema).
- The LLM:
  - Streams answer tokens to the UI as before.
  - Emits a tool result containing concept payloads (`domain`, `kind`, `jurisdiction`, `prefLabel`, `altLabels`, `definition`, `sourceUrls`).
- The Compliance Engine:
  - Calls a `canonicalConceptResolver` which:
    - Normalises the concept,
    - Checks if a matching `:Concept` already exists (by `{ domain, kind, jurisdiction }` or `id`),
    - Uses `GraphWriteService` (via Graph Ingress Guard) to upsert `:Concept` + `:Label` nodes and their relationships.
  - Populates `ChatResponse.referencedNodes` with the resulting concept‑aligned node IDs (both `:Concept` and any `ALIGNS_WITH` rule nodes, as appropriate).

#### 3.2 Self‑Populating Ingestion Flow

After concept resolution/upsert:

- If the concept is missing or under‑specified (e.g. `ingestion_status != 'COMPLETE'` or no `ALIGNS_WITH` edges), the engine enqueues an ingestion job keyed by `Concept.id`.
- Ingestion jobs (MCP + LLM extractors) are responsible for:
  - Fetching external docs (e.g. Revenue VAT pages, VRT calculators, TAC decisions),
  - Extracting structured rule/timeline/condition nodes, and
  - Writing them via `GraphWriteService` into Memgraph, then linking them to the `:Concept` via `:ALIGNS_WITH` / `:HAS_SOURCE`.
- This happens in the background and is not required for the current answer to render.

#### 3.3 Conversation Context & Concept Anchors

- Conversation context (stored in Supabase/Postgres, not Memgraph) tracks a list of active concept node IDs (`activeNodeIds`) for each conversation.
- After each chat turn:
  - Newly resolved `:Concept` IDs (and optionally their key `ALIGNS_WITH` rules) are added to `ConversationContext.activeNodeIds`.
  - These IDs are also returned in `ChatResponse.referencedNodes` for UI evidence chips.
- On the next turn, a prompt aspect (`conversationContextAspect`) uses those IDs to:
  - Look up concept names/briefs from `:Concept` nodes, and
  - Inject a short summary of “concepts in play” into the system prompt.

Memgraph itself remains PII‑free; only canonical rule and concept nodes live there. All per‑conversation state stays in the app DB.

---

### 4. Ingress Guard & Privacy Implications

The Graph Ingress Guard is extended to support the new labels while preserving strict rules:

- Allowed labels & relationships:
  - `:Concept`, `:Label`, `:HAS_ALT_LABEL`, `:ALIGNS_WITH`, `:HAS_SOURCE`, `:DERIVED_FROM` are added to the whitelisted schema.
- Property whitelists:
  - For `:Concept` and `:Label`, only SKOS‑like, non‑PII properties are allowed (`prefLabel`, `definition`, etc.).
  - User‑supplied free‑text that could be PII must not be written directly as a property on `:Concept` or `:Label`.
- Source annotation:
  - Ingestion jobs may attach sources (URLs, citations) to `:Guidance`, `:Case`, `:Update`, etc., but these nodes must remain rule/authority‑oriented, not scenario‑oriented.
- MCP / LLM tooling:
  - Memgraph remains read‑only from direct LLM/MCP tools; all writes still go through `GraphWriteService`.

---

### 5. Migration Notes (v0.4 → v0.6)

For an existing v0.4 deployment:

1. **Keep all v0.3/v0.4 node labels and relationships untouched.**  
   No existing data needs to be rewritten.

2. **Add new labels and relationships:**
   - Install constraints for `:Concept(id)` uniqueness.
   - Ensure indexes exist for `{ domain, kind, jurisdiction }` if used as lookup keys.

3. **Deploy updated Graph Ingress Guard config:**
   - Extend schema/whitelists to cover `:Concept`, `:Label`, and new relationships.

4. **Enable concept capture:**
   - Implement `capture_concepts` tool in the LLM layer as per `concept_capture_from_main_chat_v_0_1.md`.
   - Wire `canonicalConceptResolver` + `GraphWriteService` for SKOS payloads.

5. **Optional: Backfill key concepts:**
   - Create seed scripts that:
     - Define core concepts (e.g. VAT_IE, VRT_IE, Universal Credit, PRSI classes),
     - Link them to existing rule nodes.
   - This backfill is optional but recommended for better early behaviour.

6. **Update documentation & queries:**
   - Document usage of `:Concept` and `:Label` in `graph_schema_v_0_6.md`.
   - Add example queries for:
     - “Find all rules aligned with VAT in IE”,
     - “Find concepts aligned with this section”,
     - “List all concepts referenced in this conversation”.

---

## v0.5 – No Graph Schema Changes (UI‑Only Release)

**Status:** Historical, fully compatible  
**Aligned with:** `architecture_v_0_5.md`, `decisions_v_0_5.md`

v0.5 focused on the **UI layer**:

- Tailwind CSS v4 migration, shadcn/ui, Radix UI primitives.
- AI‑Elements‑style chat components and layered UI architecture.

There were **no schema‑level changes** to Memgraph in v0.5. The v0.4 graph schema and changelog remained the authoritative reference.

Implementation note:

- All v0.5 UI work assumes the v0.4/v0.6 graph schema is accessible via read‑only APIs (`/api/graph`, Memgraph queries via `GraphClient`).

---

## v0.4 – Architecture Alignment & Ingress Guard Integration (Unchanged)

**Status:** Historical, still compatible  
**Aligned with:** `architecture_v_0_4.md`, `decisions_v_0_4.md`

v0.4 was an alignment release that:

- Kept the v0.3 graph structure,  
- Introduced mandatory **Graph Ingress Guard** and `GraphWriteService` as the only write path,  
- Formalised optional graph algorithms (Leiden, centrality) as non‑breaking metadata,  
- Clarified “rules‑only, no PII” for the shared rules graph,  
- Documented special jurisdiction modelling (IE/UK/NI/IM/MT/GI/AD/CTA).

For full details, see `docs/specs/graph-schema/versions/graph_schema_changelog_v_0_4.md`.

---

## v0.3 – Cross‑Jurisdiction + Timeline Alignment

**Status:** Historical, still compatible  
**Detailed changelog:** `graph_schema_changelog_v_0_3.md`

Highlights:

- Tight alignment with `docs/specs/timeline-engine/timeline_engine_v_0_2.md`.
- Richer timeline modelling:
  - `LOOKBACK_WINDOW`
  - `LOCKS_IN_FOR_PERIOD`
  - `FILING_DEADLINE`
  - `EFFECTIVE_WINDOW`
  - `USAGE_FREQUENCY`
- Cross‑border edges for treaties, coordination, and equivalence.
- Initial change‑impact modelling via `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`, `AMENDED_BY`.

---

## v0.2 – Cross‑Jurisdiction & Regulatory Pivot

**Status:** Historical

Pivot from HTTP/RFC/OWASP graph to the current regulatory focus:

- Introduced jurisdiction‑aware modelling (IE, EU, IM, MT, UK, etc.).
- Added EU instruments (`:EURegulation`, `:EUDirective`), profile tags, mutual exclusions, and initial change tracking.

See `graph_schema_changelog_v_0_3.md` for legacy details.

---

## v0.1 – Initial RFC / OWASP Graph (Legacy)

**Status:** Legacy, superseded

Original schema for HTTP/RFC/OWASP auditing; no longer used by the Regulatory Intelligence Copilot.

---

## How to Use This Changelog

- **Current schema:** v0.6 (v0.3/v0.4 core + v0.6 concept layer).
- **Ingestion jobs:**
  - Continue to target v0.3/v0.4 rule nodes.
  - Use `:Concept` as a stable anchor when self‑populating from chat or external docs.
- **Agents & Compliance Engine:**
  - Use `GraphClient` / `TimelineEngine` as before.
  - Leverage `:Concept` + `:Label` when resolving entities and building conversation context.
- **Future changes:**
  - New versions (v0.7+) should extend this file with clear, incremental sections describing schema deltas and migration steps.

---

**End of v0.6 Changelog**

