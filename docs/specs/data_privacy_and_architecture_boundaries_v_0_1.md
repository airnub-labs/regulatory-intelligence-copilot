# Data Privacy & Architecture Boundaries – v0.1

> **Status:** Current. Normative for architecture, storage, and processing
> decisions. Designed to make future SOC 2 and GDPR compliance easier, not as a
> replacement for legal review.

## 1. Purpose & Scope

This document defines **hard architectural boundaries** for:

- What data may and may not enter the **global regulatory graph**.
- How **documents** are ingested, stored, and linked to the graph.
- How **sensitive user uploads** (e.g. trade files, statements) are processed
  via **E2B sandboxes**.
- How to structure the system so that **multi-tenant SaaS**, **SOC 2**, and
  **GDPR** compliance are easier to achieve later.

It applies to:

- All services in the **regulatory intelligence copilot** platform.
- All future forks/derivatives that share the same core architecture.

---

## 2. Data Classification & Trust Boundaries

We distinguish three major data classes:

1. **Public Regulatory Data**
   - Laws, regulations, directives, protocols, agreements.
   - Official guidance (e.g. Revenue manuals, gov.ie, gov.uk, EU docs).
   - Public case law / tribunal decisions.
   - Public treaties and frameworks (CTA, NI Protocol, Windsor, etc.).

2. **User Scenario Data (Personal Context)**
   - User profile details (residence, work, company jurisdictions, etc.).
   - Scenario-specific inputs ("I live in X, work in Y, my turnover is Z").
   - Potentially personal data / special category data under GDPR.

3. **User Private Documents**
   - Uploaded trade files, statements, contracts, custom policies.
   - Any file/content the user uploads for analysis.

**Trust Boundary:**

- The **Global Regulatory Graph** can only contain **Class 1** data.
- **Class 2 and Class 3 data MUST NEVER be persisted into the shared graph.**

---

## 3. The Global Regulatory Graph – Public, Rule-Only

### 3.1 Allowed Content

The global graph (Memgraph) is the **shared, multi-tenant knowledge base**. It
may only store:

- `Jurisdiction` nodes (IE, UK, EU, IM, GI, AD, etc.).
- `Region` nodes (e.g. NI) and their structural relations (`PART_OF`).
- `Agreement` nodes (CTA, NI_PROTOCOL, WINDSOR_FRAMEWORK, etc.).
- `Regime` nodes (CTA_MOBILITY_RIGHTS, NI_EU_GOODS_REGIME, etc.).
- `Rule`, `Benefit`, `Obligation`, `Condition` nodes derived from public law.
- `Timeline` nodes representing effective dates and transitions.
- Edges between these nodes (`PARTY_TO`, `SUBJECT_TO_REGIME`,
  `COORDINATED_WITH`, `AVAILABLE_VIA_REGIME`, `DERIVED_FROM`, etc.).

Metadata that **may** be stored on nodes/edges (non-sensitive):

- Stable IDs (e.g. `code`, `external_id`).
- High-level labels (`domain`, `scope`, `kind`).
- **Source references** to public documents (see section 4).
- Confidence / status flags (`confidence: 'high'|'medium'`, `status:
  'draft'|'active'|'deprecated'`).

### 3.2 Disallowed Content

The graph must **never** contain:

- User identifiers: name, email, IP, account ID, company registration number
  (where it can identify the tenant), PPSN, etc.
- Free-text scenario descriptions.
- Uploaded document contents, trade lines, account numbers, addresses.
- Any per-tenant custom rules or settings.

If a pipeline step sees content that cannot be clearly classified as **public
regulatory text**, it **must not** be upserted into the graph.

### 3.3 Growth Model

The graph grows over time by:

- Ingesting **new public documents** (laws, directives, guidance, case-law).
- Deriving new `Rule` / `Benefit` / `Regime` nodes and relationships.
- Adding/adjusting `Timeline` nodes as law changes.

User activity (questions, scenarios) may **trigger** this ingestion, but the
only persistent result is **more public knowledge**, never user-specific data.

---

## 4. Document Handling & Linkage

### 4.1 Two-Layer Model: Graph vs Document Store

The system uses a **two-layer model**:

1. **Graph Layer (Memgraph)**
   - Stores structured regulatory knowledge (nodes and edges).
   - Holds **references** to source documents, but not the full text.

2. **Document Layer** (DB / S3 / Vector Index)
   - Stores **canonical copies** of public documents and their sections.
   - Provides APIs to fetch sections by ID/citation.
   - May expose an embedding/vector index for LLM retrieval.

### 4.2 Linking Graph Nodes to Documents

Graph nodes/edges can hold properties like:

- `source_ids: [ 'DOC_IE_REVENUE_IT70_2024#s4_3', 'EU_883_2004#art_11' ]`
- `source_type: 'statute' | 'guidance' | 'case_law'`
- `official_citation: 'TCA 1997 s.766(1)'`

Optionally, model explicit document nodes:

- `(:Document {doc_id, jurisdiction, doc_type, citation, official_url})`
- `(:DocumentSection {section_id, doc_id, range, title})`

With edges such as:

- `(:Rule)-[:DERIVED_FROM]->(:DocumentSection)`
- `(:Regime)-[:BASED_ON]->(:Document)`

### 4.3 LLM Deep Research Flow

Typical agent flow:

1. Query graph to find relevant `Rule`/`Regime`/`Benefit` nodes.
2. Collect `source_ids` or follow `DERIVED_FROM` edges to `DocumentSection`s.
3. Fetch document sections via a **document service**, not from Memgraph.
4. Provide to LLM:
   - Graph context (which rules/regimes are relevant).
   - Canonical document snippets.
   - A **sanitised** user scenario.

LLMs can then perform deep reasoning with citations, without ever needing raw
user uploads or full corpus dumps.

---

## 5. User Profile & Scenario Data

### 5.1 Where User Data Lives

User profile and per-session scenario context are stored **outside** the graph,
for example in:

- Supabase/Postgres (user tables, profiles, preferences).
- In-memory session state / Redis / per-request context.

Profiles may include:

- Jurisdictional attributes (residence, work, company jurisdictions).
- Persona type (single director, self-employed, etc.).
- Subscription tier, feature flags.

All of this is **per-tenant** and must **never** be persisted into Memgraph.

### 5.2 How Agents Use Profile Data

Agents and prompt-aspect builders:

- Read profile data into **in-memory context**.
- Use it to:
  - Filter/prioritise graph queries.
  - Populate system prompts (jurisdiction context, persona, etc.).
- Do **not** write profile data into graph nodes/properties.

If agents derive **new public knowledge** during reasoning (e.g. discover an
un-ingested public Revenue manual section), they may trigger **public
ingestion** of that document, but must not attach any private context to it.

---

## 6. Sensitive User Documents & E2B Sandboxes

### 6.1 Default Handling: Ephemeral, Sandbox-Only

For **user private documents** (trade files, statements, contracts, etc.):

1. User uploads via the web app.
2. Backend transfers the file **directly into an E2B sandbox** or a short-lived
   staging area whose only purpose is to feed the sandbox.
3. All parsing, enrichment, and analysis happens **inside the sandbox**:
   - PII detection and redaction.
   - Normalisation to an abstract schema (e.g. trade events, timelines).
   - Scenario metrics (totals, flags, anomaly scores) computed locally.
4. The sandbox returns **only**:
   - Abstracted features (e.g. "X trades across IE/UK, Y % in asset class Z").
   - High-level metrics (no raw identifiers or line items).
5. When the job completes:
   - Sandbox is destroyed.
   - Any temporary storage is wiped.
   - No raw user document is persisted by default.

**Critical:** Under this default flow, **no data from user uploads is ever
upserted into the global graph**.

### 6.2 Optional Tenant-Scoped Storage

If users explicitly opt-in to **store documents** (for monitoring, audits,
recurring analysis):

- Documents are stored in a **tenant-scoped storage layer**, e.g.:
  - Supabase schema keyed by tenant ID, or
  - S3 bucket/prefix per tenant.
- Data is **encrypted at rest**, with strict access controls.
- If vector indexing is used, it must be **tenant-specific**, not global.
- Graph must not contain direct identifiers for these documents; at most opaque
  tenant-local IDs used within the tenant’s own context.

This maintains a clear separation between:

- **Global public knowledge** (graph + public document store), and
- **Private per-tenant workspace** (user uploads and scenario artefacts).

---

## 7. LLM Providers, Egress Control & GDPR

### 7.1 Provider-Agnostic LLM Router

The LLM layer must:

- Use a **provider-agnostic router** (OpenAI Responses API, GPT-OSS, Groq,
  local/OSS models, etc.).
- Allow **per-tenant and per-function** configuration of:
  - Provider (OpenAI, Anthropic, Groq, local, etc.).
  - Model (e.g. small local model for PII sanitisation vs large remote model
    for complex regulatory reasoning).

This enables:

- EU tenants to use **EU-hosted or self-hosted models** where required.
- Separation of concerns (e.g. a small PII sanitiser model that never leaves
  the platform, even if the main reasoning model is remote).

### 7.2 Egress Guard & Data Minimisation

For SOC 2/GDPR alignment, the architecture must:

- Have a clear **egress boundary**: all outbound calls to LLM providers or MCPs
  go through well-defined clients.
- Apply **PII sanitisation** and **policy checks** before sending any content
  to external LLMs/MCPs.
- Avoid sending:
  - Raw user uploads.
  - Direct identifiers (names, emails, account numbers, PPSNs, etc.) unless
    absolutely necessary and explicitly consented to.

Where possible:

- Use **local/OSS models** in a controlled environment for PII stripping and
  classification.
- Send only the **minimal necessary data** to external providers (data
  minimisation principle).

### 7.3 Logging & Observability

For SOC 2 and GDPR:

- Application logs must avoid storing PII by default.
- If debug logs temporarily require sensitive info, they must be:
  - Opt-in and scoped.
  - Redacted at source where possible.
  - Subject to strict retention limits.

Central observability should focus on:

- Request IDs, tenant IDs (pseudonymised where possible), error types, timing,
  and aggregate metrics.

---

## 8. Data Retention & Subject Rights (GDPR Alignment)

While full GDPR implementation requires legal input, the architecture should
support:

- **Per-tenant data separation**, so that:
  - Tenant data can be exported on request (data portability).
  - Tenant data can be deleted without affecting others (right to erasure).

- Avoid mixing tenant data into the global graph, so that:
  - The graph does not need to be retroactively purged when a user leaves.

- Clear retention policies:
  - Session-level data (chat transcripts, ephemeral context) with configurable
    retention windows.
  - Uploads stored only while needed, unless user opts into persistent storage.

---

## 9. Architectural Guardrails Summary

To make future SOC 2 / GDPR compliance easier, **the following guardrails are
mandatory**:

1. **Global Regulatory Graph = Public & Rule-Only**
   - Only public regulatory data; never PII or tenant-specific content.

2. **Two-Layer Document Handling**
   - Graph stores references and metadata.
   - Canonical documents live in a separate store with clear APIs.

3. **User Profile / Scenario Data is Separate**
   - Stored in per-tenant DB tables / session state.
   - Only used in-memory for queries and prompting; never written to the graph.

4. **User Uploads Processed in E2B Sandboxes**
   - Default: ephemeral, sandbox-only analysis; no persistent storage.
   - Optional: explicit tenant-scoped storage with encryption and isolation.

5. **Provider-Agnostic, Privacy-Aware LLM Router**
   - Supports EU-friendly/self-hosted models.
   - Allows per-tenant, per-function model selection.

6. **Egress Guard & Data Minimisation**
   - All outbound LLM/MCP calls pass through controlled clients.
   - PII sanitisation before external calls where applicable.

7. **Logs & Telemetry Avoid PII by Default**
   - Focus on operational metrics, not content.

8. **Docs & Specs are Normative**
   - Any change to these boundaries must update this document and the
     architecture/decisions specs.

---

## 10. Normative References

Implementers must also consult:

- `docs/architecture_v_0_3.md` (or latest)
- `docs/decisions_v_0_3.md` (or latest)
- `docs/specs/graph_schema_v_0_3.md` (or latest)
- `docs/specs/timeline_engine_v_0_2.md` (or latest)
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- `docs/specs/node_24_lts_rationale.md` (runtime & security baselines)

Before making changes that affect storage, processing, or routing of data.

