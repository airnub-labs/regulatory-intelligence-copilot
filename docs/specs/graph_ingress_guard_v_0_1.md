# Graph Ingress Guard – v0.1

> **Status:** Current draft, but **normative** once adopted.
>
> This spec defines how **all writes to the global Memgraph instance** must be
> routed and validated, to ensure that only public regulatory knowledge is
> persisted and that no user/tenant data or PII ever enters the shared graph.

## 1. Purpose & Context

The platform already enforces an **egress guard** pattern for MCP calls:

- All MCP clients are routed through the **E2B MCP gateway**.
- An egress guard sits at this boundary to strip or redact PII and other
  sensitive content before it leaves the system.

This document introduces the mirror pattern for Memgraph:

> A **Graph Ingress Guard** that sits in front of all writes to the global
> Memgraph database and prevents any sensitive or tenant-specific data from
> being upserted into the shared regulatory graph.

This is directly aligned with:

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
  - Global graph is **public & rule-only**.
- `docs/specs/graph_schema_v_0_3.md`
  - Defines allowed node/edge types.
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
  - All complex IE/UK/NI/IM/GI/AD cases are still **public regulatory
    structure**.

The Graph Ingress Guard provides **defense in depth** and a **single audit
point** for future SOC 2 and GDPR work.

---

## 2. Scope

This spec applies to **every code path** that writes to the global Memgraph
instance, including but not limited to:

- Ingestion pipelines for statutes, guidance, case law, and treaties.
- Live ingestion triggered from agent/chat sessions (e.g. when discovering a
  new public document while answering a question).
- Background jobs that update regimes, timelines, or derived rules.

It does **not** govern:

- Tenant-private storage (Supabase/Postgres, S3, tenant-specific vector
  indices).
- In-memory session state.
- E2B sandbox internals (they are governed by the MCP/egress guard and
  privacy specs).

---

## 3. High-Level Design

### 3.1 GraphWriteService as the Only Writer

All writes to Memgraph must go through a dedicated **GraphWriteService** (or
library), implemented in the core backend (e.g. `compliance-core`).

**Rule:**

> No other part of the codebase may execute direct Cypher writes to Memgraph.

The GraphWriteService:

- Exposes **domain-level methods**, e.g.:
  - `upsertJurisdiction(dto)`
  - `upsertRegion(dto)`
  - `upsertAgreement(dto)`
  - `upsertRegime(dto)`
  - `upsertRule(dto)`
  - `linkRuleToDocument(ruleId, docSectionId)`
- Implements **schema-level and privacy checks** before emitting any Cypher.

This creates a single **Graph Ingress Guard** layer where all write-time
validation lives.

### 3.2 Flow Overview

1. Upstream service (ingestor, agent, background job) constructs a **public
   DTO** describing the desired node/relationship.
2. It calls the appropriate GraphWriteService method.
3. The GraphWriteService:
   - Validates node/edge types against the schema.
   - Applies property whitelists.
   - Runs PII and tenant-data checks.
   - Optionally calls a small, local model for fuzzy classification.
4. If all checks pass, it composes Cypher and executes the write.
5. If checks fail, it **rejects** the write and logs a structured warning or
   error (without storing PII in logs).

---

## 4. Allowed vs Disallowed Content

### 4.1 Allowed Node & Edge Types

The Graph Ingress Guard must enforce that only **schema-approved** node and
edge types are persisted. Allowed labels (as per `graph_schema_v_0_3.md`):

- Nodes (non-exhaustive, but illustrative):
  - `Jurisdiction`
  - `Region`
  - `Agreement`
  - `Regime`
  - `Rule`
  - `Benefit`
  - `Obligation`
  - `Timeline`
  - `Document`
  - `DocumentSection`

- Relationships (examples):
  - `PART_OF`
  - `PARTY_TO`
  - `SUBJECT_TO_REGIME`
  - `ESTABLISHES_REGIME`
  - `COORDINATED_WITH`
  - `AVAILABLE_VIA_REGIME`
  - `DERIVED_FROM`
  - `BASED_ON`
  - `EFFECTIVE_FROM`

Node labels or relationship types **outside this set** must be rejected unless
and until they are added to the schema spec and this guard.

### 4.2 Property Whitelists

Each node/edge type has a **whitelist of allowed properties**, e.g.:

- Common properties:
  - `code`
  - `name`
  - `domain`
  - `kind`
  - `source_ids`
  - `source_type`
  - `official_citation`
  - `confidence`
  - `status`

Any property not on the whitelist for that type must be rejected.

This significantly reduces the surface area where user/tenant data could
accidentally be stored.

### 4.3 Disallowed Data Classes

The following must **never** appear as values in properties written to the
graph:

- Direct identifiers:
  - User names, emails, phone numbers.
  - PPSNs, national IDs, account numbers, IBANs.
  - Tenant IDs or account IDs.
- Uploaded document contents or excerpts from user-private files.
- Free-text scenario descriptions (even if semi-anonymised), such as:
  - "I run a small company in Galway and pay myself €X per month".
- Any PII or tenant-specific attributes as defined in the privacy spec.

The GraphWriteService must implement checks that:

- Forbid property names like `tenant_id`, `user_id`, `email`, etc.
- Apply basic PII pattern detection (emails, PPSNs, IBANs, etc.).

If suspicious content is detected, the write must be aborted.

---

## 5. Phase 1: Static & Rules-Based Guard

The initial implementation of the Graph Ingress Guard should be:

- **Deterministic**
- **Low overhead**
- **Fully auditable**

### 5.1 Schema Validation

- Validate node labels and relationship types against
  `graph_schema_v_0_3.md`.
- Reject any node/edge with unknown or disallowed labels/types.

### 5.2 Property Whitelist Enforcement

- For each node/edge type, maintain a local whitelist of allowed property
  names.
- Reject any write that includes properties not on the whitelist.

### 5.3 PII & Tenant Checks

- Basic regex and heuristic checks for:
  - Email addresses (`/\S+@\S+\.\S+/`).
  - National ID / PPSN patterns.
  - IBAN / card formats (where applicable).
  - URIs that look like user-specific resources.
- Explicitly forbid property values that:
  - Equal or contain known tenant IDs or user IDs.

### 5.4 Failure Behaviour

On validation failure:

- **Reject the write** (no Memgraph update).
- Log a structured warning/error event with:
  - Type of violation (e.g. `UNKNOWN_PROPERTY`, `PII_DETECTED`).
  - Node/edge type involved.
  - Redacted snippet of offending value if needed.

Logs must follow the privacy spec (no full PII leaks into logs).

---

## 6. Phase 2: Intelligent Guard (Small Local Model)

In future, the Graph Ingress Guard may be extended with a **small, local
model** to catch more subtle issues that static rules miss.

### 6.1 Constraints

Any intelligent component used in the guard must:

- Run **locally or within the platform's controlled infra** (e.g. GPT-OSS or
  another OSS model), *not* an external API like OpenAI/Anthropic.
- Reuse the same privacy principles as the LLM egress guard:
  - No raw user documents or full scenarios are sent outside the platform.

The model should be **second-line**, not first-line:

1. Static/schema checks run first.
2. Only residual or ambiguous cases go to the local model.

### 6.2 Example Use Cases

A small model could be used to:

- Classify short text as `PUBLIC_REGULATORY_DESCRIPTION` vs
  `POTENTIAL_USER_SCENARIO`.
- Spot subtle PII-like content missed by regexes.
- Suggest normalisations (e.g. "this looks like a specific taxpayer's
  situation, not a general rule") and block such writes.

### 6.3 Failure Behaviour

If the model flags content as **unsafe for global graph**:

- The write is rejected.
- An audit event is recorded (without full content), e.g.:
  - `GRAPH_INGRESS_MODEL_BLOCKED: category=POTENTIAL_USER_SCENARIO`.

The system must never auto-correct such content into the graph; any override
requires explicit code changes and spec updates.

---

## 7. Integration with Existing Specs

The Graph Ingress Guard is a **mechanical enforcement** of decisions made in:

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
  - Global graph is public & rule-only.
  - No user/tenant data in Memgraph.
- `docs/specs/graph_schema_v_0_3.md`
  - Defines allowed node/edge types and properties.
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
  - Complex IE/UK/NI/IM/GI/AD and CTA modelling is still purely public law.

Any change to the set of allowed node/edge types or properties must:

1. Update the relevant schema and modelling specs.
2. Update the GraphWriteService and its whitelists.

---

## 8. Testing & Code Review Guidelines

To keep the guard effective:

- **No direct Memgraph writes**:
  - Code review must reject any PR that issues raw Cypher `CREATE`/`MERGE`
    statements outside the GraphWriteService.

- **Unit tests**:
  - Cover representative allowed writes (public rules, agreements, regimes).
  - Cover representative disallowed writes (PII, tenant IDs, scenario text).

- **Integration tests**:
  - Ensure ingestion pipelines that parse public docs can still upsert
    successfully.
  - Ensure uploads and scenario flows never cause graph writes directly.

- **Security/regression tests**:
  - Periodically attempt to insert synthetic PII through various paths to
    verify that the guard blocks them.

---

## 9. Non-Goals

The Graph Ingress Guard is **not** responsible for:

- Validating legal correctness of rules or regimes.
- Ensuring that all public documents have been ingested.
- Deciding which public documents to ingest (that is the responsibility of
  ingestion pipelines and agents).

Its sole responsibility is:

> To ensure that whatever is written to the global Memgraph instance conforms
> to the schema and privacy boundaries: **public, rule-only, and free of
> tenant/user-specific data.**

---

## 10. Normative References

Implementers of the GraphWriteService / Graph Ingress Guard must consult:

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/graph_schema_v_0_3.md`
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- `docs/architecture_v_0_3.md`
- `docs/decisions_v_0_3.md`

before making changes that affect Memgraph writes.

