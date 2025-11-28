# Graph Schema Changelog v0.4 – Regulatory Intelligence Copilot

> Tracks changes to the Memgraph schema for v0.4 architecture alignment.
>
> **Status:** Current
> **Supersedes:** `graph_schema_changelog_v_0_3.md`

---

## v0.4 – Architecture Alignment & Ingress Guard Integration

**Status:** Current
**Aligned with:** `docs/architecture/versions/architecture_v_0_4.md`, `docs/governance/decisions/versions/decisions_v_0_4.md`
**Primary schema:** `graph_schema_v_0_4.md` (based on v0.3 with clarifications)

### Summary

v0.4 represents an **architecture and implementation alignment** rather than a schema redesign. The core graph schema from v0.3 remains unchanged, but v0.4 introduces:

- **Strict ingress/egress guard discipline** for all graph operations.
- **Formalised graph algorithm support** (Leiden community detection, centrality) as optional, non-breaking enhancements.
- **Explicit "rules-only, no PII" enforcement** through the Graph Ingress Guard.
- **Enhanced documentation** of special jurisdiction modelling (NI, CTA, IM, MT, GI, AD).

### Schema Changes

**No breaking changes to core node labels or relationships.**

The v0.3 schema remains the authoritative structure. All node labels (`:Jurisdiction`, `:Statute`, `:Section`, `:Benefit`, `:Relief`, `:Condition`, `:Timeline`, `:ProfileTag`, `:Regime`, `:Region`, `:Agreement`, `:Treaty`, `:EURegulation`, `:EUDirective`, `:Guidance`, `:Case`, `:Update`, `:Community`) and relationships continue to be valid.

### Implementation & Enforcement Changes

#### 1. Graph Ingress Guard (Mandatory)

Per `docs/safety/safety-guards/graph_ingress_guard_v_0_1.md` and decision D-026:

- **All writes** to Memgraph must pass through `GraphWriteService`.
- `GraphWriteService` applies an aspect-based **Graph Ingress Guard** pipeline before executing any Cypher.
- Baseline aspects enforce:
  - **Schema validation**: nodes/edges match documented types.
  - **Property whitelisting**: only approved properties are written.
  - **PII/tenant blocking**: no user identifiers, tenant keys, or personal data.
- Custom aspects (e.g. source annotation, audit tagging) may be added via configuration but must not weaken baseline guarantees.

**Consequence:**
Direct Cypher `CREATE`/`MERGE` statements from agents, tools, or scripts are **prohibited**. Only `GraphWriteService` may write to the graph.

#### 2. Graph Algorithms as Optional Add-Ons

Per `docs/graph/graph_algorithms_v_0_1.md` and decision D-030:

- **Leiden community detection** (via Memgraph MAGE) may be run on static snapshots to assign `community_id` properties to nodes and create optional `:Community` nodes.
- **Centrality metrics** (PageRank, betweenness) may be computed within communities to identify anchor rules.
- **Bounded traversals** for impact analysis are supported.
- These algorithms are **optional**:
  - Core reasoning (explicit edges, Cypher path queries) works without them.
  - Algorithms may be disabled without breaking functionality.
  - Used primarily for GraphRAG retrieval optimisation and context selection.

**Schema impact:**
Optional properties may be added to existing nodes:

- `community_id?: string` on `:Section`, `:Benefit`, `:Relief`, `:Regime`, etc.
- `centrality_score?: float` on nodes within communities.

Optional node label:

- `:Community` with properties `id`, `label?`, `size?`, `representative_nodes?: [string]`.

Optional relationship:

- `(:Community)-[:CONTAINS]->(:Section|:Benefit|:Relief|:Regime)` to link community nodes to members.

**These additions are non-breaking:**
Queries and agents that do not use algorithms continue to work. The schema does not depend on these properties existing.

#### 3. Enhanced Special Jurisdiction Modelling

Per `docs/graph/special_jurisdictions_modelling_v_0_1.md`:

- **Northern Ireland (NI)** is modelled as a `:Region` under the `UK` `:Jurisdiction`, with special EU-linked goods rules expressed via `:Regime` nodes (not by making NI a separate jurisdiction).
- **Common Travel Area (CTA)** is represented as an `:Agreement` node with `(:Jurisdiction)-[:PARTY_TO]->(:Agreement)` edges.
- **Isle of Man (IM)**, **Malta (MT)**, **Gibraltar (GI)**, **Andorra (AD)** and their treaty/coordination relationships are first-class entities in the schema.
- Cross-border interactions are modelled via:
  - `(:Section|:Benefit|:Relief)-[:COORDINATED_WITH]->(:Section|:Benefit|:Relief)` for social security coordination.
  - `(:Section|:Relief)-[:TREATY_LINKED_TO]->(:Section|:Relief)` for bilateral/multilateral tax treaties.
  - `(:Benefit|:Relief)-[:EQUIVALENT_TO]->(:Benefit|:Relief)` for functionally similar provisions across jurisdictions.

**No schema changes**, but clarified modelling patterns and documented seed examples (e.g. `special_jurisdictions_graph_seed_ni_uk_ie_eu.cypher`).

#### 4. Read-Only Memgraph MCP

Per decision D-028:

- **Memgraph MCP** is explicitly **read-only**.
- It may be used by LLM tools for inspecting the graph and running read-only Cypher.
- **No writes** via MCP. All writes go through `GraphWriteService`.

**No schema impact**, but operational discipline is formalised.

### Behavioural Changes

#### Living Graph Enrichment

The v0.4 architecture explicitly supports:

- **On-demand enrichment**: agents and ingestion jobs discover new rules/cases/guidance via MCP and upsert them into the graph.
- **Change tracking**: `:Update` / `:ChangeEvent` nodes represent Finance Acts, guidance updates, court decisions, EU judgments and their impact on existing rules.
- **Incremental growth**: the graph starts sparse and grows richer over time through use.

All writes still pass through `GraphWriteService` + Graph Ingress Guard, ensuring privacy and schema compliance.

#### Provider-Agnostic LLM Layer

Per decisions D-016, D-023, D-029:

- LLM usage (for explaining graph queries, ranking results, generating natural language) is routed via `LlmRouter`.
- Agents call logical tasks (e.g. `"main-chat"`, `"egress-guard"`), not specific models.
- **Vercel AI SDK v5** is the **primary implementation layer** for ALL LLM provider clients:
  - `OpenAiProviderClient` (OpenAI, GPT-OSS, and local OpenAI-compatible endpoints via custom baseURL)
  - `GroqProviderClient`, `AnthropicProviderClient`, `GeminiProviderClient`
  - Local/OSS providers (vLLM, Ollama) use OpenAI client with custom `baseURL`
- **Egress Guard** applies PII redaction and policy enforcement before any external LLM call.

**No schema impact**, but query/reasoning patterns are now decoupled from LLM provider details.

#### Jurisdiction-Neutral Prompts with Prompt Aspects

Per decisions D-014, D-015:

- Base system prompts are **jurisdiction-neutral**.
- Jurisdiction, persona, agent context, and disclaimers are injected via **prompt aspects** (`jurisdictionAspect`, `agentContextAspect`, `profileContextAspect`, `disclaimerAspect`).
- No hard-coded country logic in core agents; jurisdictions are passed as context.

**No schema impact**, but agents are now more reusable across jurisdictions.

---

## Migration Notes

### From v0.3 to v0.4

**No data migration required.**

The v0.3 schema is fully compatible with v0.4. Existing nodes and relationships remain valid.

**Action items for implementers:**

1. **Ensure all writes use `GraphWriteService`.**
   Audit codebase for direct Bolt/HTTP Cypher writes outside `GraphWriteService` and refactor them to use the service.

2. **Configure Graph Ingress Guard aspects.**
   Baseline aspects (schema validation, PII blocking) should be active in production. Custom aspects (if any) should be added via config, not inline code changes.

3. **Update Memgraph MCP configuration to read-only.**
   If Memgraph MCP is exposed to LLM tools, ensure it cannot execute `CREATE`, `MERGE`, `SET`, `DELETE` statements.

4. **Optional: Enable graph algorithms.**
   If using Leiden/centrality for GraphRAG:
   - Run community detection as a batch job.
   - Store `community_id` and `centrality_score` properties on relevant nodes.
   - Create `:Community` nodes if desired.
   - Ensure queries gracefully handle missing algorithm metadata.

5. **Verify special jurisdiction seeds.**
   If working with NI/UK/IE/IM/MT/GI/AD scenarios, ensure seed scripts follow `special_jurisdictions_modelling_v_0_1.md` patterns.

---

## v0.3 – Cross-Jurisdiction + Timeline Alignment

**Status:** Historical, still compatible
**Detailed changelog:** `graph_schema_changelog_v_0_3.md`

### Summary

Aligned graph schema with:

- Timeline Engine v0.2 (lookbacks, lock-ins, deadlines, effective windows, usage frequency).
- Cross-jurisdiction design (Ireland + EU + IM + MT, etc.).
- Living graph concept (incremental enrichment via MCP).

Key additions:

- Extended `:Timeline` nodes with `kind` property.
- Timeline-related edges: `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `FILING_DEADLINE`, `EFFECTIVE_WINDOW`, `USAGE_FREQUENCY`.
- Change-impact relationships: `AFFECTS`, `CHANGES_INTERPRETATION_OF`, `UPDATES`, `AMENDED_BY`.
- Cross-border edges: `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EQUIVALENT_TO`.

---

## v0.2 – Cross-Jurisdiction & Regulatory Pivot

**Status:** Historical
**Detailed changelog:** `graph_schema_changelog_v_0_3.md`

Pivoted from HTTP/RFC/OWASP to regulatory compliance. Introduced jurisdiction-aware modelling, EU regulations/directives, mutual exclusions, profile tags, and initial change tracking.

---

## v0.1 – Initial RFC / OWASP Graph (Legacy)

**Status:** Legacy, superseded
**Detailed changelog:** `graph_schema_changelog_v_0_3.md`

Original schema for HTTP/RFC/OWASP auditing. No longer used by the regulatory copilot.

---

## How to Use This Changelog

- **Current schema:** v0.4 (based on v0.3 structure with v0.4 implementation discipline).
- **Ingestion jobs:** Target v0.4 patterns and use `GraphWriteService` for all writes.
- **Agents:** Use graph queries consistent with v0.3/v0.4 schema; rely on `GraphClient` and `TimelineEngine`.
- **Future changes:** Add new sections (v0.5, etc.) with clear descriptions of what changed and why.

---

**End of v0.4 Changelog**
