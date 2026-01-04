# Regulatory Graph — Current Specification (v0.6)

> **Status:** Current / v0.6
> **Last Updated:** 2026-01-04
> **Scope:** Authoritative entry point for the current graph schema, change detection, and modeling conventions.

This document consolidates the **implemented** graph schema (v0.6), change detection system, and modeling conventions for the Regulatory Intelligence Copilot.

For **future proposals and enhancements** (v0.7+), see [`regulatory-graph_proposals_v0.7+.md`](./regulatory-graph_proposals_v0.7+.md).

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Graph Schema (Implemented)](#2-graph-schema-implemented)
3. [Modeling Conventions](#3-modeling-conventions)
4. [Special Jurisdictions](#4-special-jurisdictions)
5. [Change Detection & Streaming](#5-change-detection--streaming)
6. [Operational Considerations](#6-operational-considerations)
7. [Code References](#7-code-references)

---

## 1. System Overview

### 1.1 Purpose

The regulatory rules graph is a **shared, PII-free knowledge graph** stored in Memgraph that represents:

- Statutes, sections, and legislative structure (IE/UK/EU focus)
- Social welfare benefits and eligibility conditions
- Tax reliefs, credits, and obligations
- Timelines (lookbacks, lock-ins, deadlines)
- Cross-border coordination rules (CTA, EU, treaties)
- Guidance, cases, and change events

### 1.2 Key Invariants

1. **PII-free:** Memgraph stores only public regulatory knowledge, never user or tenant data.
2. **Write-only via GraphWriteService:** All writes must go through `GraphWriteService` + `GraphIngressGuard`.
3. **Read-only for agents:** LLM/MCP tools query but never write directly.
4. **Timestamps on all nodes:** All nodes have `created_at` / `updated_at` for change detection.
5. **Stable IDs:** Node IDs are stable across sessions (e.g., `"IE_TCA_1997_s766"`).

### 1.3 Integration Points

| Component | Role |
|-----------|------|
| `GraphWriteService` | Validated writes to Memgraph |
| `GraphIngressGuard` | Schema validation, property whitelisting |
| `GraphChangeDetector` | Polling-based change detection |
| `/api/graph/stream` | SSE endpoint for real-time patches |
| `GraphClient` | Read-only queries from agents/engines |

---

## 2. Graph Schema (Implemented)

### 2.1 Node Types Summary

The following node labels are implemented and whitelisted in the ingress guard:

| Node Label | Purpose |
|------------|---------|
| `Jurisdiction` | Countries, supranational entities (IE, UK, EU) |
| `Region` | Sub-jurisdictions (NI as part of UK) |
| `Agreement` / `Treaty` | International agreements (CTA, protocols) |
| `Regime` | Rule-sets within jurisdictions (goods, social security) |
| `Statute` | Primary legislation (Acts) |
| `Section` | Sections/articles within statutes |
| `Benefit` | Social welfare benefits/payments |
| `Relief` | Tax reliefs, credits, allowances |
| `Condition` | Named eligibility tests |
| `Timeline` | Time constructs (lookbacks, lock-ins, deadlines) |
| `Case` | Court/tribunal decisions |
| `Guidance` | Non-binding guidance (Revenue manuals, eBriefs) |
| `EURegulation` / `EUDirective` | EU instruments |
| `ProfileTag` | Persona/profile segments |
| `Update` / `ChangeEvent` | Change events (Finance Acts, updates) |
| `Concept` | SKOS-style regulatory concepts |
| `Label` | Alternative labels/synonyms for concepts |
| `Obligation` | Compliance requirements (filing, payment) |
| `Threshold` | Numeric limits and boundaries |
| `Rate` | Tax/contribution rates |
| `Form` | Regulatory forms/documents |
| `PRSIClass` | Irish PRSI classifications |
| `LifeEvent` | Significant life events triggering rules |
| `LegalEntity` | Legal structure types (LTD, DAC, etc.) |
| `TaxCredit` | Direct tax liability reductions |
| `Penalty` | Consequences of non-compliance |

### 2.2 Required Properties

All nodes must include:

```typescript
{
  id: string;          // Stable unique identifier
  created_at: datetime;
  updated_at: datetime;
}
```

Additional required properties vary by node type. See [`schema_v_0_6.md`](./schema_v_0_6.md) for complete property definitions.

### 2.3 Core Relationship Types

**Structural:**
- `(:Section)-[:PART_OF]->(:Statute)`
- `(:Region)-[:PART_OF]->(:Jurisdiction)`
- `(:X)-[:IN_JURISDICTION]->(:Jurisdiction)`

**Eligibility & Conditions:**
- `(:Benefit|:Relief)-[:REQUIRES]->(:Condition)`
- `(:Benefit|:Relief)-[:LIMITED_BY]->(:Condition)`
- `(:Condition)-[:HAS_THRESHOLD]->(:Threshold)`

**Mutual Exclusions:**
- `(:X)-[:EXCLUDES]->(:X)`
- `(:X)-[:MUTUALLY_EXCLUSIVE_WITH]->(:X)`

**Timelines:**
- `(:X)-[:LOOKBACK_WINDOW]->(:Timeline)`
- `(:X)-[:LOCKS_IN_FOR_PERIOD]->(:Timeline)`
- `(:X)-[:FILING_DEADLINE]->(:Timeline)`
- `(:X)-[:EFFECTIVE_WINDOW]->(:Timeline)`

**Cross-Border:**
- `(:Regime)-[:COORDINATED_WITH]->(:Regime)`
- `(:X)-[:TREATY_LINKED_TO]->(:Agreement)`
- `(:X)-[:EQUIVALENT_TO]->(:X)`

**Obligations & Penalties:**
- `(:ProfileTag)-[:HAS_OBLIGATION]->(:Obligation)`
- `(:Obligation)-[:HAS_PENALTY]->(:Penalty)`
- `(:Obligation)-[:REQUIRES_FORM]->(:Form)`

**Life Events:**
- `(:LifeEvent)-[:TRIGGERS]->(:Benefit|:Obligation)`
- `(:LifeEvent)-[:STARTS_TIMELINE]->(:Timeline)`

**SKOS/Concepts:**
- `(:Concept)-[:HAS_ALT_LABEL]->(:Label)`
- `(:Concept)-[:ALIGNS_WITH]->(:Section|:Benefit|:Relief|...)`

See [`schema_v_0_6.md`](./schema_v_0_6.md) Section 3 for complete relationship definitions.

---

## 3. Modeling Conventions

### 3.1 Jurisdiction & Region Modeling

- **Jurisdictions** are state-level or supranational authorities: `IE`, `UK`, `EU`, `IM`, `GI`, `AD`
- **Regions** are parts of jurisdictions with special rules: `NI` as `(:Region)-[:PART_OF]->(:Jurisdiction {code:'UK'})`
- Every rule-like node should have exactly one `IN_JURISDICTION` edge

### 3.2 Regulations & Sections

- Use stable IDs that won't change if text moves: `"IE_TCA_1997_s766"`
- Store summaries, not full texts; link to `source_url`
- Use `(:Section)-[:PART_OF]->(:Statute)` for structure
- Use `(:Section)-[:SUBSECTION_OF]->(:Section)` for nested sections

### 3.3 Benefits, Reliefs & Conditions

- **Benefits** = social welfare payments (`:Benefit`)
- **Reliefs** = tax reliefs that reduce taxable income (`:Relief`)
- **Tax Credits** = direct liability reductions (`:TaxCredit`)
- **Conditions** = named, reusable eligibility tests (`:Condition`)

Link via:
- `(:Benefit)-[:REQUIRES]->(:Condition)` for prerequisites
- `(:Benefit)-[:LIMITED_BY]->(:Condition)` for caps/thresholds

### 3.4 Time-Based Rules

Use `:Timeline` nodes with explicit types:
- `kind: "LOOKBACK"` — period before an event to assess eligibility
- `kind: "LOCK_IN"` — period after an event during which constraints apply
- `kind: "DEADLINE"` — date by which action must be taken
- `kind: "EFFECTIVE_WINDOW"` — period during which a rule is in effect
- `kind: "USAGE_FREQUENCY"` — how often a benefit/relief can be used

### 3.5 SKOS-Style Concepts

`:Concept` nodes are SKOS-inspired anchors for regulatory ideas:

```cypher
(:Concept {
  id: "TAX:IE:VAT",
  domain: "TAX",
  kind: "VAT",
  jurisdiction: "IE",
  pref_label: "Value-Added Tax"
})
```

Link to rule nodes via `(:Concept)-[:ALIGNS_WITH]->(:Section|:Benefit|:Relief|...)`.

---

## 4. Special Jurisdictions

### 4.1 Northern Ireland

**Modeled as:** Region, not independent jurisdiction

```cypher
(:Region {code:'NI'})-[:PART_OF]->(:Jurisdiction {code:'UK'})
```

NI's special EU goods regime is represented via:

```cypher
(:Agreement {code:'NI_PROTOCOL'})-[:ESTABLISHES_REGIME]->(:Regime {code:'NI_EU_GOODS_REGIME'})
(:Regime {code:'NI_EU_GOODS_REGIME'})-[:COORDINATED_WITH]->(:Jurisdiction {code:'EU'})
(:Region {code:'NI'})-[:SUBJECT_TO_REGIME]->(:Regime {code:'NI_EU_GOODS_REGIME'})
```

### 4.2 Common Travel Area (CTA)

```cypher
(:Agreement {code:'CTA'})-[:ESTABLISHES_REGIME]->(:Regime {code:'CTA_MOBILITY_RIGHTS'})
(:Jurisdiction {code:'IE'})-[:PARTY_TO]->(:Agreement {code:'CTA'})
(:Jurisdiction {code:'UK'})-[:PARTY_TO]->(:Agreement {code:'CTA'})
(:Jurisdiction {code:'IM'})-[:PARTY_TO]->(:Agreement {code:'CTA'})
```

### 4.3 Other Special Cases

- **Isle of Man (IM):** Crown dependency, CTA member, own tax regime
- **Gibraltar (GI):** British Overseas Territory, bespoke EU agreement
- **Andorra (AD):** Independent state, EU customs union for industrial products

See [`special_jurisdictions_modelling_v_0_1.md`](./special_jurisdictions_modelling_v_0_1.md) for full guidance.

---

## 5. Change Detection & Streaming

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SSE Clients                          │
│                  (GraphVisualization UI)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │  SSE connection (GraphPatch events)
┌─────────────────────▼───────────────────────────────────────┐
│           GET /api/graph/stream (Next.js API)               │
│  - Parses query params → ChangeFilter                       │
│  - Subscribes to GraphChangeDetector                        │
│  - Streams events to client                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ subscribe(filter, callback)
┌─────────────────────▼───────────────────────────────────────┐
│         GraphChangeDetector (process-wide singleton)        │
│  - Maintains snapshots per filter                           │
│  - Polls Memgraph periodically                              │
│  - Uses timestamp queries when available                    │
│  - Computes diffs → GraphPatch                              │
│  - Batches patches before emitting                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ queryGraphByFilter / timestampQueryFn
┌─────────────────────▼───────────────────────────────────────┐
│                     Memgraph                                │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 GraphPatch Format

**Actual format used in code** (nested structure):

```typescript
interface GraphPatch {
  type: 'graph_patch';
  timestamp: string;         // ISO8601
  nodes: {
    added: GraphNode[];
    updated: GraphNode[];
    removed: string[];       // node IDs
  };
  edges: {
    added: GraphEdge[];
    updated: GraphEdge[];
    removed: GraphEdge[];
  };
  meta: {
    nodeChanges: number;
    edgeChanges: number;
    totalChanges: number;
    truncated?: boolean;
    truncationReason?: string;
  };
}
```

### 5.3 ChangeFilter

```typescript
interface ChangeFilter {
  jurisdictions?: string[];   // e.g., ["IE", "UK"]
  profileType?: string;       // e.g., "single-director"
  keyword?: string;           // Optional keyword filter
}
```

### 5.4 Configuration

```typescript
interface GraphChangeDetectorConfig {
  pollIntervalMs?: number;      // default: 5000
  pollTimeoutMs?: number;       // default: 60000
  useTimestamps?: boolean;      // default: true
  batchWindowMs?: number;       // default: 1000
  enableBatching?: boolean;     // default: true
  maxNodesPerPatch?: number;    // default: 500
  maxEdgesPerPatch?: number;    // default: 1000
  maxTotalChanges?: number;     // default: 1200
}
```

### 5.5 SSE Endpoint

**Endpoint:** `GET /api/graph/stream`

**Query Parameters:**
- `jurisdictions` — comma-separated jurisdiction codes (default: `IE`)
- `profileType` — profile identifier (e.g., `single-director`)
- `keyword` — optional keyword filter

**Event Types:**

1. **Connection confirmation:**
```json
{
  "type": "connected",
  "timestamp": "2026-01-04T12:00:00Z",
  "message": "Graph stream connected"
}
```

2. **Graph patch:**
```json
{
  "type": "graph_patch",
  "timestamp": "2026-01-04T12:00:05Z",
  "nodes": { "added": [...], "updated": [...], "removed": ["id1"] },
  "edges": { "added": [...], "updated": [...], "removed": [...] },
  "meta": { "nodeChanges": 5, "edgeChanges": 3, "totalChanges": 8 }
}
```

3. **Keep-alive:** `: keepalive\n\n` (every 30s)

### 5.6 Diff Semantics

- **Node added:** ID in new snapshot but not old
- **Node updated:** ID in both but properties differ
- **Node removed:** ID in old snapshot but not new
- **Edge added/updated/removed:** Same logic, keyed by `source:type:target`

---

## 6. Operational Considerations

### 6.1 Polling & Performance

| Interval | Responsiveness | Load |
|----------|----------------|------|
| 1-2s | High | Higher CPU/IO |
| 5s (default) | Balanced | Moderate |
| 10-15s | Lower | Minimal |

### 6.2 Snapshot Memory

- Small subgraph (~20 nodes): 5-10 KB per filter
- Medium (~100 nodes): 25-50 KB
- Large (~500 nodes): 125-250 KB
- Typical: 5-10 active filters → 125-250 KB total

### 6.3 Batching Trade-offs

- **Latency:** Adds up to `batchWindowMs` (default 1s) delay
- **Performance:** 10-100× fewer SSE messages under heavy writes
- **UI:** Much smoother rendering

### 6.4 Recommended Indexes

```cypher
CREATE INDEX ON :Benefit(updated_at);
CREATE INDEX ON :Relief(updated_at);
CREATE INDEX ON :Section(updated_at);
CREATE INDEX ON :Obligation(updated_at);
// ...other high-churn node labels
```

---

## 7. Code References

### 7.1 Core Modules

| Module | Location | Purpose |
|--------|----------|---------|
| `GraphChangeDetector` | `packages/reg-intel-graph/src/graphChangeDetector.ts` | Change detection logic |
| `GraphClient` | `packages/reg-intel-graph/src/boltGraphClient.ts` | Read queries |
| `GraphWriteService` | `packages/reg-intel-graph/src/graphWriteService.ts` | Write operations |
| `GraphIngressGuard` | `packages/reg-intel-graph/src/graphIngressGuard.ts` | Schema validation |

### 7.2 API Endpoints

| Endpoint | Location | Purpose |
|----------|----------|---------|
| `GET /api/graph` | `apps/demo-web/src/app/api/graph/route.ts` | Initial graph snapshot |
| `GET /api/graph/stream` | `apps/demo-web/src/app/api/graph/stream/route.ts` | SSE streaming |

### 7.3 Related Documentation

| Document | Purpose |
|----------|---------|
| [`schema_v_0_6.md`](./schema_v_0_6.md) | Complete node/edge property definitions |
| [`schema_changelog_v_0_6.md`](./schema_changelog_v_0_6.md) | Schema evolution history |
| [`change_detection_v_0_6.md`](./change_detection_v_0_6.md) | Detailed change detection spec |
| [`algorithms_v_0_1.md`](./algorithms_v_0_1.md) | Optional graph algorithms |
| [`special_jurisdictions_modelling_v_0_1.md`](./special_jurisdictions_modelling_v_0_1.md) | NI/CTA/IM modeling |
| [`regulatory-graph_proposals_v0.7+.md`](./regulatory-graph_proposals_v0.7+.md) | Future enhancements |

### 7.4 Archived Documentation

Historical versions are preserved in [`archive/`](./archive/):
- `schema_v_0_1.md` through `schema_v_0_4.md`
- `change_detection_v_0_3.md` and enhancements

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-04 | Created consolidated v0.6 specification |
| 2025-12-29 | Added Obligation, Threshold, Rate, Form, PRSIClass, LifeEvent, LegalEntity, TaxCredit, Penalty nodes |
| 2025-12-25 | Initial v0.6 schema with Concept layer |

---

**End of v0.6 Current Specification**
