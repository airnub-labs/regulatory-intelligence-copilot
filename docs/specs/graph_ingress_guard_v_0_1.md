# Graph Ingress Guard – v0_1 (Consolidated + AI Policy Agent)

> **Status:** Current and **normative** once adopted.
>
> This spec defines **how all writes to the global Memgraph instance must be
> routed and validated**, using an **aspect-based Graph Ingress Guard**. It
> replaces the earlier non‑aspect design.

- The global graph is **public & rule‑only**.
- All writes go through a **GraphWriteService**.
- The GraphWriteService always runs a chain of **ingress aspects** that enforce
  schema + privacy guarantees and allow safe extensibility.
- Custom ingress aspects may themselves be **AI policy agents**, as long as
  they do not weaken the baseline guarantees.

Referenced specs:

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/graph_schema_v_0_3.md`
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`

---

## 1. Purpose & Context

We already enforce an **egress guard** pattern for MCP and LLM calls via the
E2B MCP gateway. That egress guard:

- Centralises outbound calls,
- Applies aspects/middleware (PII stripping, disclaimers, context),
- Allows forks to customise behaviour without touching call sites.

This document introduces the mirror pattern for **Memgraph writes**:

> A **Graph Ingress Guard**, implemented as an aspect chain around a
> GraphWriteService, that prevents any sensitive or tenant‑specific data from
> being written to the shared regulatory graph.

The goal is to:

- Enforce **non‑negotiable privacy + schema guarantees** for the global graph.
- Provide a **flexible extension mechanism** for forks and future features.
- Support future SOC 2 / GDPR work with a clear, auditable boundary.
- Allow **intelligent policy agents** to participate in guarding writes,
  without ever becoming the sole or overriding authority.

---

## 2. Scope

The Graph Ingress Guard applies to **every code path** that writes to the
**global Memgraph instance**, including:

- Ingestion pipelines for statutes, guidance, case law, treaties.
- Live ingestion triggered from agent/chat sessions.
- Background jobs that update regimes, timelines, or derived rules.

It does **not** govern:

- Tenant‑private storage (Supabase/Postgres, S3, tenant‑scoped vector indices).
- In‑memory session state.
- E2B sandbox internals (governed by the MCP/egress guard & privacy spec).

---

## 3. Core Pattern: GraphWriteService + Ingress Aspects

### 3.1 GraphWriteService as the Only Writer

All writes to Memgraph must go through a **GraphWriteService** (or equivalent
repository) in the core backend.

**Rule:**

> No other part of the codebase may execute direct Cypher writes to Memgraph.

The GraphWriteService exposes domain‑level methods, e.g.:

- `upsertJurisdiction(dto)`
- `upsertRegion(dto)`
- `upsertAgreement(dto)`
- `upsertRegime(dto)`
- `upsertRule(dto)`
- `linkRuleToDocument(ruleId, docSectionId)`

Internally, each method:

1. Builds a **GraphWriteContext**.
2. Passes it through an ordered chain of **GraphIngressAspect** functions.
3. The final step (“terminal”) translates the validated context into Cypher and
   executes the write.

### 3.2 Context & Aspect Types

```ts
export interface GraphWriteContext {
  operation: 'create' | 'merge' | 'update' | 'delete';
  nodeLabel?: string;
  relType?: string;
  properties: Record<string, unknown>;
  tenantId?: string;   // for logging / audit only, never persisted
  source: 'ingestion' | 'agent' | 'background_job';
  metadata?: Record<string, unknown>;
}

export type GraphIngressAspect = (
  ctx: GraphWriteContext,
  next: (ctx: GraphWriteContext) => Promise<GraphWriteContext>
) => Promise<GraphWriteContext>;
```

### 3.3 Aspect Composition

```ts
export function composeIngressAspects(
  aspects: GraphIngressAspect[],
  terminal: (ctx: GraphWriteContext) => Promise<GraphWriteContext>
): (ctx: GraphWriteContext) => Promise<GraphWriteContext> {
  return aspects.reduceRight(
    (next, aspect) => (ctx) => aspect(ctx, next),
    terminal,
  );
}
```

The **terminal** function is the only place that:

- Turns the final `GraphWriteContext` into Cypher.
- Executes the write against Memgraph.

---

## 4. Baseline vs Custom Aspects

We distinguish between:

1. **Baseline (non‑removable) aspects** – enforce critical invariants from
   privacy + schema specs.
2. **Custom (configurable) aspects** – can be added/removed/reordered via
   configuration, for forks and future features. Some of these custom aspects
   may themselves be **AI policy agents**.

### 4.1 Baseline Aspects (must always run)

Baseline aspects are hard‑wired into the GraphWriteService and **cannot be
removed by configuration**. They encode the guarantees from
`data_privacy_and_architecture_boundaries_v_0_1.md` and this spec.

Baseline aspects:

1. **SchemaValidationAspect**
   - Validates `nodeLabel` and `relType` against
     `graph_schema_v_0_3.md`.
   - Rejects writes with unknown labels/types.

2. **PropertyWhitelistAspect**
   - Enforces per‑type property whitelists.
   - Rejects any properties not allowed for that node/edge type.

3. **StaticPIIAndTenantCheckAspect**
   - Runs deterministic checks for PII and tenant IDs, including:
     - Email patterns, PPSN/national ID patterns, IBAN/card formats (where
       relevant).
     - Disallowed keys like `tenant_id`, `user_id`, `email`.
   - Rejects values that look like user/tenant data or free‑text scenarios.

These aspects ensure:

- Only **schema‑approved node/edge types** are written.
- Only **whitelisted properties** for those types are used.
- No obvious PII or tenant‑specific data is persisted.

Under no circumstances may a custom aspect (including AI agents) bypass or
weaken these baseline guarantees.

### 4.2 Custom Aspects (pluggable)

Above the baseline stack, we support a configurable chain of **custom
GraphIngressAspect**s, for example:

- `AuditTaggingAspect` – add audit metadata into `metadata` and/or central
  logging.
- `SourceAnnotationAspect` – tag context with ingestion source, batch ID,
  document version, etc.
- `LLMClassificationAspect` (Phase 2) – uses a small local model to classify
  ambiguous text as safe/unsafe for the global graph.
- `FeatureFlagAspect` – allow experimental schema fields for specific
  environments.
- `AiPolicyAgentAspect` – delegates a decision to an internal AI policy agent,
  which can further inspect a **minimised summary** of the write and decide to
  allow or block it.

These are wired via configuration, e.g.:

```yaml
graphIngress:
  customAspects:
    - audit-tagging
    - source-annotation
    # - ai-policy-agent   # opt-in, disabled by default
    # - llm-classifier    # opt-in, disabled by default
```

A simple registry resolves IDs to implementations:

```ts
const REGISTRY: Record<string, GraphIngressAspect> = {
  'audit-tagging': auditTaggingAspect,
  'source-annotation': sourceAnnotationAspect,
  'ai-policy-agent': aiPolicyAgentAspect,
  'llm-classifier': llmClassificationAspect,
};

export function resolveAspectsFromConfig(ids: string[]): GraphIngressAspect[] {
  return ids.map((id) => {
    const aspect = REGISTRY[id];
    if (!aspect) throw new Error(`Unknown ingress aspect: ${id}`);
    return aspect;
  });
}
```

Fork maintainers and SaaS operators can customise **custom** aspects by editing
config, without touching the GraphWriteService API or call sites.

---

## 5. AI Policy Agent Aspects

### 5.1 Concept

A **Graph Ingress AI Policy Agent** is a custom aspect that:

- Receives a minimal summary of the pending write (never raw user documents).
- Applies additional policy checks (e.g. domain‑specific heuristics, advanced
  text classification, anomaly detection).
- Decides whether to:
  - **Allow** the write to proceed (`return next(ctx)`), and optionally
    annotate it with extra metadata; or
  - **Block** the write by throwing an error and emitting an audit event.

This agent can be implemented using:

- A small local LLM (e.g. GPT‑OSS) running inside controlled infra; or
- An internal policy microservice that may itself use multiple tools/models.

### 5.2 Constraints

AI policy agent aspects must:

- Run **after** the baseline aspects (schema + whitelist + static PII), not
  before.
- Never attempt to relax or override baseline checks.
- Respect the same privacy rules as the rest of the system:
  - Prefer local / self‑hosted models.
  - If calling external APIs, route through the established egress guard and
    send only **minimised, non‑sensitive summaries**.

### 5.3 Example Shape (Illustrative)

```ts
export const aiPolicyAgentAspect: GraphIngressAspect = async (ctx, next) => {
  // Build a minimal summary that avoids PII and raw user content
  const summary = buildMinimalPublicSummary(ctx); // e.g. labels, property keys,
                                                  // high-level descriptions

  const decision = await policyAgent.decide({
    kind: 'graph_ingress',
    summary,
  });

  if (decision.action === 'block') {
    await auditLog.write({
      type: 'GRAPH_INGRESS_AGENT_BLOCKED',
      reason: decision.reason,
      nodeLabel: ctx.nodeLabel,
      relType: ctx.relType,
    });
    throw new Error('Graph ingress blocked by AI policy agent');
  }

  if (decision.patch) {
    ctx = { ...ctx, properties: { ...ctx.properties, ...decision.patch } };
  }

  return next(ctx);
};
```

This is illustrative only; the concrete implementation will depend on the
chosen local model / agent framework.

---

## 6. Allowed vs Disallowed Content

### 6.1 Allowed Node & Edge Types

Allowed node labels and relationship types are defined in
`graph_schema_v_0_3.md` (e.g. `Jurisdiction`, `Region`, `Agreement`, `Regime`,
`Rule`, `Benefit`, `Timeline`, `Document`, `DocumentSection`, and relationships
like `PART_OF`, `PARTY_TO`, `SUBJECT_TO_REGIME`, `DERIVED_FROM`, etc.).

The **SchemaValidationAspect** must:

- Reject any write where `nodeLabel` / `relType` is not in the approved set.

### 6.2 Property Whitelists

Each node/edge type has a **whitelist of allowed property names**, e.g.:

- `code`
- `name`
- `domain`
- `kind`
- `source_ids`
- `source_type`
- `official_citation`
- `confidence`
- `status`

The **PropertyWhitelistAspect** must:

- Reject writes containing properties outside the whitelist for that type.

### 6.3 Disallowed Data Classes

The **StaticPIIAndTenantCheckAspect** must ensure that the following **never
appear** as values in properties written to the graph:

- User identifiers (names, emails, phone numbers).
- National IDs / PPSNs, account numbers, IBANs, card numbers.
- Tenant/account IDs.
- Free‑text scenario descriptions (e.g. "I run a small company in Galway...").
- Any direct excerpts from user‑private uploaded documents.

On detection, the aspect must:

- Reject the write (no Cypher executed).
- Emit a structured warning/error event (with redacted content) to logs.

AI policy agent aspects may provide *additional* blocking logic, but may not
allow content that the baseline aspects would reject.

---

## 7. Phase 1 vs Phase 2 Implementation

### 7.1 Phase 1 – Static & Deterministic

Phase 1 focuses on:

- Schema validation.
- Property whitelisting.
- Deterministic PII/tenant checks.

This is:

- Low overhead.
- Predictable and auditable.
- Sufficient to prevent most accidental leakage into the global graph.

Custom aspects in Phase 1 should be limited to non‑critical concerns (audit
annotation, source tagging) or very simple policy checks.

### 7.2 Phase 2 – Intelligent Guard (AI Policy Agent / Small Local Model)

In Phase 2, the system may add more advanced aspects such as:

- `LLMClassificationAspect` – a small local model that classifies ambiguous
  text properties.
- `AiPolicyAgentAspect` – a richer agent that uses local models + rules to
  decide allow/block.

Constraints:

- Models must run **locally or within controlled infra**, or if external,
  always behind the egress guard with minimal summaries.
- They act as a **second line of defense**, never replacing baseline checks.

Example behaviour:

- Inspect text properties after whitelist filtering.
- Classify them as `PUBLIC_REGULATORY_DESCRIPTION` vs
  `POTENTIAL_USER_SCENARIO`.
- If unsafe, reject the write and emit an audit event.

The aspect must never auto‑"fix" unsafe content into the graph; any override
requires intentional code + spec changes.

---

## 8. Testing & Code Review Guidelines

To keep the Graph Ingress Guard effective:

- **No direct Memgraph writes**
  - Code review must reject PRs with raw `CREATE`/`MERGE` statements outside
    GraphWriteService.

- **Unit tests**
  - Cover allowed writes (public rules, regimes, agreements) that pass
    baseline aspects.
  - Cover disallowed writes (PII, tenant IDs, scenario text) that get blocked.

- **Integration tests**
  - Verify ingestion pipelines still succeed when writing valid public data.
  - Verify that uploads/scenario flows never cause direct graph writes.

- **Security/regression tests**
  - Periodically attempt to inject synthetic PII through various paths to
    confirm the guard blocks them.

- **AI agent aspects**
  - Must have explicit tests for timeout/failure behaviour (e.g. fail closed vs
    bypass custom aspects while still enforcing baselines).
  - Must have clear observability (metrics, logs) for blocked writes and
    decisions.

---

## 9. Non‑Goals

The Graph Ingress Guard is **not** responsible for:

- Assessing legal correctness of rules/regimes.
- Ensuring all public documents are ingested.
- Deciding which public sources to ingest (that is ingestion/agent logic).

Its sole responsibility:

> Ensure that whatever is written to the global Memgraph instance conforms to
> the schema and privacy boundaries: **public, rule‑only, free of
> tenant/user‑specific data.**

---

## 10. Normative References

Implementers of the GraphWriteService and ingress aspects must consult:

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/graph_schema_v_0_3.md`
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- `docs/architecture_v_0_3.md`
- `docs/decisions_v_0_3.md`

before making changes that affect Memgraph writes or the ingress aspect chain.

