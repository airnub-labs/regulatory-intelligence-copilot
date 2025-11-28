# Concept Capture from Main Chat (v0.1)

**Status:** v0.1 (stable for implementation)

This document specifies how the **main chat task** in the Regulatory Intelligence Copilot captures regulatory concepts (VAT, VRT, benefits, rules, etc.) as **SKOS‑style metadata** and uses them to **self‑populate the shared rules graph** and **inform conversation context**, without breaking streaming UX.

It assumes the architecture in `architecture_v_0_6.md` and the decisions in `docs/governance/decisions/decisions_v_0_6.md`.

---

## 1. Purpose & Scope

### 1.1 Purpose

Instead of a separate entity‑extraction LLM call, the system uses a **single main chat call** that:

1. Streams natural‑language answer text back to the UI.
2. Emits **structured concept metadata** via a dedicated tool call (`capture_concepts`).

That metadata is used to:

- Resolve or create concept nodes in **Memgraph** (via `GraphWriteService` + `Graph Ingress Guard`).
- Update **`referencedNodes`** for the current answer.
- Update per‑conversation **`activeNodeIds`** in `ConversationContext` (stored in Supabase/Postgres).

### 1.2 Non‑Goals

This spec does **not** cover:

- Full ingestion pipelines for legislative/guidance documents (see graph ingestion specs).
- Scenario modelling and what‑if simulation (see `docs/governance/product/scenario-engine/scenario_engine_v_0_1.md`).
- Eligibility Explorer logic (see `eligibility_explorer_spec_v_0_1.md`).

---

## 2. High‑Level Design

### 2.1 Single main‑chat call with side‑channel metadata

For each user message, the Compliance Engine:

1. Builds a system prompt via prompt aspects (jurisdiction, agent, profile, disclaimers, conversation context).
2. Calls `LlmRouter.stream(...)` for the **main chat task**.
3. Registers the `capture_concepts` tool for this call.

The model:

- Streams answer text in chunks (`type: 'text'`).
- Calls `capture_concepts` once, returning a **SKOS‑inspired concept array** as a `type: 'tool'` chunk.

The UI sees only streamed text + a final meta event. Tool output is consumed by the engine only.

### 2.2 Provider capabilities & fallbacks

- v0.1 requires concept capture **only** for providers that support tools/structured outputs (e.g. OpenAI Responses).
- For other providers, it is acceptable to:
  - Run in **answer‑only** mode with no concept capture, or
  - Add a separate, slower metadata path in a future version.

Implementations should default to: **if tools available → enable concept capture; otherwise → answer‑only**.

---

## 3. LLM Streaming Contract

### 3.1 `LlmStreamChunk` shape

All LLM providers used by the engine must implement a **tagged union** stream type:

```ts
export type LlmStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; argsJson: unknown }
  | { type: 'error'; error: Error };
```

Semantics:

- `type: 'text'`  
  Append `delta` to the current answer string; forward directly to the UI SSE stream.

- `type: 'tool'`  
  A tool result (e.g. `capture_concepts`). **Never** forwarded to the UI. Parsed and dispatched inside the Compliance Engine.

- `type: 'error'`  
  Provider‑level failure. The engine must stop streaming and surface a safe error to the user.

### 3.2 Provider responsibilities

Each `LlmProvider` implementation (OpenAI, Groq, local HTTP) must:

- Map underlying SDK/HTTP streaming events into `LlmStreamChunk`.
- Emit tool results as a **single `type: 'tool'` chunk per tool invocation**, with the **final parsed JSON** in `argsJson`.
- Never mix tool JSON into the text stream.

---

## 4. `capture_concepts` Tool

### 4.1 Purpose

The `capture_concepts` tool is the **only source of concept metadata** from the main chat task in v0.1.

It is used to:

- Identify **regulatory concepts** that appeared in the user’s question and/or the assistant’s answer.
- Provide a **SKOS‑like description** of each concept.
- Allow the engine to **resolve or create** Memgraph nodes for these concepts.

### 4.2 JSON Schema

The tool is defined using an OpenAPI/JSON‑Schema‑style `parameters` object.

Conceptual shape:

```jsonc
{
  "name": "capture_concepts",
  "description": "Capture SKOS-like regulatory concepts mentioned in this turn.",
  "parameters": {
    "type": "object",
    "properties": {
      "concepts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "domain": { "type": "string" },        // e.g. "TAX", "SOCIAL_WELFARE", "VEHICLE_REG"
            "kind": { "type": "string" },          // e.g. "VAT", "VRT", "IMPORT_DUTY"
            "jurisdiction": { "type": "string" },  // e.g. "IE", "UK", "EU"
            "prefLabel": { "type": "string" },
            "altLabels": {
              "type": "array",
              "items": { "type": "string" }
            },
            "definition": { "type": "string" },
            "sourceUrls": {
              "type": "array",
              "items": { "type": "string", "format": "uri" }
            }
          },
          "required": ["domain", "kind", "jurisdiction", "prefLabel"]
        }
      }
    },
    "required": ["concepts"]
  }
}
```

Notes:

- The model **does not** set any graph/node IDs here.
- `domain/kind/jurisdiction` are used later for canonical resolution.
- `altLabels` should include both canonical synonyms and user phrasing (e.g. "sales tax in Ireland" for VAT_IE).

### 4.3 Prompting guidelines

System prompts for the main chat task must include instructions such as:

- "In addition to answering the user, you **must call** the `capture_concepts` tool once per turn with any important tax, welfare, pension, or regulatory concepts you detect."
- "Prefer a **small number of important concepts** (usually 1–5 per turn). Do *not* list every noun phrase."
- "Use short, human‑readable `prefLabel` values and reasonable `definition` texts."

The engine must not rely on any **specific ordering** of tool vs text events; the model is allowed to call the tool before, during or after emitting all text.

---

## 5. Compliance Engine Integration

### 5.1 Canonical concept types

The engine treats `capture_concepts` as input to a **Canonical Concept Resolver** in the graph layer.

```ts
export interface CanonicalConceptInput {
  domain: string;
  kind: string;
  jurisdiction: string;
  prefLabel: string;
  altLabels: string[];
  definition?: string;
  sourceUrls?: string[];
}

export interface CanonicalConceptResult {
  id: string;        // Memgraph node ID (internal identifier)
  labels: string[];  // e.g. ['Concept', 'TaxConcept']
}

export interface CanonicalConceptResolver {
  resolveOrCreateFromGraph(
    input: CanonicalConceptInput,
  ): Promise<CanonicalConceptResult>;
}
```

Implementation notes:

- `CanonicalConceptResolver` lives in `reg-intel-graph`.
- It must use `GraphClient` for reads and `GraphWriteService` for any writes.
- All writes must be subject to `Graph Ingress Guard` aspects.

### 5.2 `handleConceptMetadataFromMainChat` flow

Within `reg-intel-core`, the Compliance Engine defines a handler for tool payloads:

```ts
async function handleConceptMetadataFromMainChat(
  argsJson: unknown,
  opts: {
    tenantId: string;
    conversationId: string;
    graph: CanonicalConceptResolver;
    enqueueIngestionJob: (input: { conceptId: string; domain: string; kind: string; jurisdiction: string; sourceUrls?: string[] }) => Promise<void>;
  },
): Promise<{ referencedNodeIds: string[] }> {
  // Implementation sketch; see textual description below.
}
```

Conceptual steps:

1. **Parse & validate `argsJson`:**
   - Ensure it matches the expected `concepts[]` shape.
   - On validation failure: log & return `{ referencedNodeIds: [] }` (do **not** fail the chat).

2. **Normalise each concept:**
   - Trim/normalise whitespace.
   - Lowercase for comparison where appropriate.
   - Clean up obvious formatting issues.

3. **Resolve or create concept nodes:**
   - For each concept, call `CanonicalConceptResolver.resolveOrCreateFromGraph(...)`.
   - Collect `id` values into a `referencedNodeIds` array.

4. **Decide on ingestion:**
   - For each resolved concept, call a helper like `graphHasUsefulDetail(conceptId)`.
   - If missing/sparse:
     - Call `enqueueIngestionJob(...)` to trigger MCP‑based enrichment.

5. **Return `referencedNodeIds`:**
   - The Compliance Engine uses these IDs to:
     - Populate `ChatResponse.referencedNodes`.
     - Update `ConversationContext.activeNodeIds`.

### 5.3 Error handling and resilience

- **Malformed tool output:**
  - If `argsJson` cannot be parsed/validated, the engine must:
    - Log the error (including minimal context for debugging).
    - Skip concept capture for this turn.
    - Still return a normal answer to the user.

- **Graph errors:**
  - If `CanonicalConceptResolver` throws for a single concept, the engine should:
    - Log the error.
    - Continue processing other concepts where possible.

- **Ingestion errors:**
  - If `enqueueIngestionJob` fails, the engine should:
    - Log the failure.
    - Not block the user response.

Concept capture is **additive**: failures should not break chat.

---

## 6. Self‑Population & Ingestion Gating

### 6.1 When to create concept nodes

For each `CanonicalConceptInput`, the resolver must:

1. Query Memgraph (via `GraphClient`) for an existing concept node matching at least `(domain, kind, jurisdiction)`.
2. If such a node exists:
   - Reuse its `id`.
   - Optionally enrich label/alias nodes via `GraphWriteService` if new `altLabels` are useful.
3. If no node exists:
   - Create a new concept node (e.g. labelled `:Concept` and a more specific label like `:TaxConcept`).
   - Set canonical properties such as `domain`, `kind`, `jurisdiction`, `prefLabel`, `definition`.
   - Create and link `:Label`/alias nodes if the graph schema supports them.

All writes must go through `GraphWriteService` and be validated by `Graph Ingress Guard`.

### 6.2 When to trigger ingestion

The concept capture pipeline must **not** trigger ingestion for every concept blindly.

For each `CanonicalConceptResult` (`id`):

- Call a helper like `graphHasUsefulDetail(id)` that checks:
  - Are there edges to rules/sections/rates/benefits?
  - Are important properties (e.g. VAT rate bands) populated and not stale?

If **missing or clearly sparse**:

- Call `enqueueIngestionJob({ conceptId: id, domain, kind, jurisdiction, sourceUrls })`.
- This job will:
  - Use MCP (or similar) to fetch official documents (e.g. Revenue, gov.ie, EU regs).
  - Parse them with LLM tools.
  - Upsert richer rule/timeline nodes via `GraphWriteService`.

If **sufficiently enriched**:

- Do not enqueue ingestion; reuse existing graph detail.

### 6.3 Graph change detection integration

- When ingestion jobs write to Memgraph via `GraphWriteService`, they must maintain `created_at` / `updated_at` timestamps.
- `GraphChangeDetector` uses these timestamps to compute patches.
- The graph UI subscribes to `/api/graph/stream` to receive those patches and update visualisations.

Self‑population via `capture_concepts` therefore feeds into the live graph update loop without additional wiring.

---

## 7. Conversation Context & `referencedNodes`

### 7.1 `referencedNodes` semantics

`ChatResponse.referencedNodes: string[]` is defined as:

> The set of Memgraph node IDs (rules, sections, benefits, reliefs, concepts, timelines, etc.) that the engine considers central to the answer it just returned.

From this spec’s perspective:

- All `CanonicalConceptResult.id` values discovered via `capture_concepts` for this turn should be added to `referencedNodes`.
- Other graph lookups performed by the agent/engine (e.g. specific sections) may also add node IDs.

The UI may use `referencedNodes` to:

- Show evidence chips.
- Highlight nodes in the graph view.

The UI is **not required** to send them back on the next turn.

### 7.2 Conversation context update

The Compliance Engine uses `referencedNodes` to update `ConversationContext` (see `conversation_context_spec_v_0_1.md`):

1. Load `ConversationContext` for `(tenantId, conversationId)`.
2. Compute the new `activeNodeIds` as the union of existing `activeNodeIds` and `referencedNodes` for this turn (optionally pruned to a max size).
3. Save the updated context via `ConversationContextStore`.

On the **next** turn, the `conversationContextAspect`:

- Resolves `activeNodeIds` back to short SKOS‑style summaries via `GraphClient`.
- Injects a concise "concepts already in scope" paragraph into the system prompt.

This ensures that concepts learned in earlier turns (e.g. `Rule:VAT_IE`, `Rule:VRT_IE`) remain available and explicit to the model in later turns.

---

## 8. Storage & Privacy Boundaries

This spec respects the global data‑separation rules:

- **Supabase/Postgres** stores:
  - Tenants, users, conversations, messages.
  - `ConversationContext` (including `activeNodeIds`).
- **Memgraph** stores only:
  - Public regulatory graph data (rules, sections, benefits, timelines, concept nodes, label/alias nodes, etc.).
  - No user IDs, no conversation IDs, no raw chat text, no detailed scenario objects.

`capture_concepts` payloads must not contain user‑specific personal data; they describe **general regulatory concepts**, not individual situations.

---

## 9. Versioning & Future Extensions

### 9.1 v0.1 guarantees

v0.1 guarantees the following behaviour:

- Single main chat call per user message.
- SKOS‑style concept capture via `capture_concepts` tool for providers that support tools.
- Self‑population of concept nodes in Memgraph via `CanonicalConceptResolver`.
- `referencedNodes` populated based on resolved concept IDs.
- Conversation context updates with `activeNodeIds` per conversation, owned by the engine.
- Resilience: failures in concept capture **must not** break user‑visible chat.

### 9.2 Possible v0.2+ enhancements (non‑binding)

- Multi‑schema support for providers that do not support tools (e.g. JSON‑in‑text fallback).
- Richer SKOS fields (`notation`, `broader`, `narrower`, `related`).
- Domain‑specific schemas for tax, welfare, pensions, and other regimes.
- Deeper integration with the Scenario Engine for scenario‑scoped concept capture.

For now, v0.1 is intentionally minimal but sufficient to support VAT/VRT/import‑type flows and to validate self‑populating behaviour in the shared rules graph.

