# Concept Capture from Main Chat Spec v0.1

> **Status**: Draft
> **Scope**: v0.5 architecture — entity capture, self-populating rules graph, and conversation context integration
> **Audience**: `reg-intel-core`, `reg-intel-llm`, `reg-intel-graph`, demo-web implementers

This spec captures the agreed design for **automatic regulatory concept capture** from the **main chat LLM call**, and how that drives **self-population of the Memgraph rules graph** and **conversation context**.

It replaces the earlier idea of a **separate entity-extraction task** with a single **main-chat call** that returns:

1. **Streamed natural-language answer** (for the UI), and
2. A **structured SKOS-inspired concept payload** via a tool/structured-output side-channel (for the Compliance Engine only).

All of this remains aligned with the v0.4/v0.5 architecture invariants:

- Memgraph is a **shared, PII-free, bloat-free rules graph**.
- Supabase/Postgres holds **conversations, messages, and conversation context** (tenant/user scoped).
- All graph writes go through **GraphWriteService + Graph Ingress Guard**.

---

## 1. Design Overview

### 1.1 Removal of separate entity-extraction task

Instead of two LLM tasks:

- **Task A**: `entity-extraction` → SKOS JSON
- **Task B**: `main-chat` → natural-language answer

We now use a **single task**:

- **Task**: `main-chat`
  - Produces **streamed answer text** for the UI.
  - Emits a **tool/structured-output payload** (`capture_concepts`) with SKOS-like metadata on the regulatory concepts mentioned.

The **entity extraction is embedded** into the main chat call as a tool, not a separate request. The UI does not see this payload; only the Compliance Engine does.

### 1.2 Key properties

- ✅ One LLM call per user message → simpler orchestration and lower cost.
- ✅ Concept extraction is **always in sync** with the final answer (same messages, same reasoning path).
- ✅ **Streaming UX preserved**: text is streamed as usual; concept metadata arrives as a tool result alongside.
- ✅ Existing abstractions (`LlmRouter`, `LlmProvider`, `GraphWriteService`, prompt aspects) remain valid.

---

## 2. LLM Layer Changes (`reg-intel-llm`)

### 2.1 Extended stream chunk type

We extend the streaming type returned by providers to model **tool output chunks**:

```ts
type LlmStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; argsJson: unknown }
  | { type: 'error'; error: Error };

export interface LlmProvider {
  stream(
    messages: LlmMessage[],
    options: LlmCompletionOptions & { tenantId: string }
  ): AsyncIterable<LlmStreamChunk>;
}
```

**Provider behaviour**:

- When the underlying model emits answer tokens → provider yields `{ type: 'text', delta }`.
- When the underlying model completes a tool call → provider yields `{ type: 'tool', name, argsJson }`.
- On provider error → provider yields `{ type: 'error', error }`.

This keeps the `LlmRouter` / `LlmClient` shape intact, while enabling a **side-channel** for structured concept metadata.

### 2.2 `capture_concepts` tool schema (SKOS-inspired)

We define a **single tool** for concept capture, inspired by SKOS concepts and labels. This tool is attached to the **main-chat** task.

```jsonc
{
  "name": "capture_concepts",
  "description": "Capture SKOS-like regulatory concepts mentioned in the conversation.",
  "parameters": {
    "type": "object",
    "properties": {
      "concepts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "domain": { "type": "string" },       // e.g. "TAX", "WELFARE", "VEHICLE_REG"
            "kind": { "type": "string" },         // e.g. "VAT", "VRT", "IMPORT_DUTY"
            "jurisdiction": { "type": "string" }, // e.g. "IE", "UK", "EU"
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

- This is intentionally **SKOS-like**, not full RDF SKOS:
  - `prefLabel` ~ SKOS `prefLabel`.
  - `altLabels[]` ~ SKOS `altLabel`s.
  - `definition` ~ SKOS `definition`.
- There is **no ID** in the tool payload. IDs are assigned by the engine.

### 2.3 Prompt instructions

For the main chat task, the engine embeds a short instruction in the **system prompt** (via prompt aspects) along the lines of:

> "In addition to answering the user, you must **call the `capture_concepts` tool once** with any tax/benefit/regulatory concepts you detect in this conversation, using SKOS-style labels (`prefLabel`, `altLabels`, `definition`)."

The provider passes the `capture_concepts` tool definition to the model. The model then:

- Streams the answer text.
- Calls the tool once with its concept list.

For **providers without tools/structured outputs**, we can:

- Disable concept capture for that tenant, or
- (Later) fall back to a less robust “JSON in text” pattern for those providers only.

---

## 3. Compliance Engine Flow (`reg-intel-core`)

### 3.1 High-level `handleChat` pipeline

The Compliance Engine (`reg-intel-core`) owns:

- Conversation context (via `ConversationContextStore`).
- LLM orchestration via `LlmRouter`.
- Concept resolution and graph enrichment.
- Setting `ChatResponse.referencedNodes`.

High-level steps:

1. Load the **ConversationContext** for `(tenantId, conversationId)`.
2. Build the **system prompt** via prompt aspects:
   - Jurisdiction, agent, disclaimers, etc.
   - `conversationContextAspect` summarizes `activeNodeIds` (see conversation context spec).
3. Call `LlmRouter.stream(...)` with:
   - Messages + system prompt.
   - `capture_concepts` tool definition.
   - Instructions to call `capture_concepts` exactly once.
4. Process the stream:

   ```ts
   const referencedNodeIds: string[] = [];
   let finalAnswerText = '';

   for await (const chunk of llmStream) {
     if (chunk.type === 'text') {
       // Stream answer text to UI (SSE / HTTP chunked)
       uiStream.write(chunk.delta);
       finalAnswerText += chunk.delta;
     }

     if (chunk.type === 'tool' && chunk.name === 'capture_concepts') {
       await handleConceptMetadataFromMainChat(chunk.argsJson, referencedNodeIds, identity);
     }

     if (chunk.type === 'error') {
       // handle error / abort
     }
   }

   uiStream.end();
   ```

5. After streaming completes:
   - Merge `referencedNodeIds` into `ConversationContext.activeNodeIds` and save.
   - Build and return `ChatResponse` with `referencedNodes = referencedNodeIds`.

### 3.2 `handleConceptMetadataFromMainChat`

`handleConceptMetadataFromMainChat` is the core of the **self-population** pipeline.

Inputs:

- `argsJson`: the decoded tool payload (SKOS-like concepts).
- `referencedNodeIds`: a mutable array collecting graph node IDs for this turn.
- `identity`: `{ tenantId, userId, conversationId }` (for logging and provenance; graph writes remain tenant-neutral).

Steps per concept:

1. **Normalise** the concept description:
   - Lowercase + trim `prefLabel` and `altLabels` for matching.
   - Basic cleaning (punctuation, whitespace).

2. **Resolve or create concept node** via `canonicalConceptResolver.resolveOrCreateFromGraph`:

   ```ts
   const conceptNode = await canonicalConceptResolver.resolveOrCreateFromGraph({
     domain,
     kind,
     jurisdiction,
     prefLabel,
     altLabels,
     definition,
     sourceUrls,
   });
   ```

   Implementation details:

   - Uses `GraphClient` to check if a `:Concept` (or specific subtype, e.g. `:TaxConcept`) exists with matching `{ domain, kind, jurisdiction }`.
   - If found → returns that node (no new node).
   - If not found → calls `GraphWriteService.upsertConcept(...)` to create:
     - `(:Concept { id, domain, kind, jurisdiction, pref_label, definition })`
     - `(:Label { value: altLabel })` nodes linked by `:HAS_ALT_LABEL`.
   - All writes go through **Graph Ingress Guard**.

3. **Decide whether to trigger auto-ingestion**:

   After resolving/creating the concept node, call e.g. `graphHasUsefulDetail(conceptNode.id)`:

   ```ts
   if (!graphHasUsefulDetail(conceptNode.id)) {
     enqueueIngestionJob({
       conceptId: conceptNode.id,
       domain,
       kind,
       jurisdiction,
       sourceUrls,
     });
   }
   ```

   Where `graphHasUsefulDetail` checks for:

   - Presence of relevant rule subgraph (e.g. `:Rate` nodes for VAT, `:Band` nodes for VRT, `:Condition` nodes for benefits).
   - Optionally staleness (e.g. `last_verified_at` older than some threshold).

   Ingestion flows (MCP → web → parsing → LLM → GraphWriteService) are outside this spec but are queued here.

4. **Populate `referencedNodeIds` for this turn**:

   - Append `conceptNode.id` to `referencedNodeIds`.
   - De-duplicate at the end of the handler.

### 3.3 When does self-population trigger?

Self-population is triggered **as soon as the `capture_concepts` tool output arrives** in the stream:

- The answer text is still streaming to the UI.
- Tool output is parsed and used to:
  - Resolve/create concept nodes.
  - Optionally enqueue ingestion.
  - Collect `referencedNodeIds` for the current turn.

The **current answer** does *not* depend on the new nodes being present (they are mainly for **next turns** and for the graph UI). The rules graph "quietly" gets smarter in the background.

---

## 4. Conversation Context & `referencedNodes`

This spec is designed to work with **Conversation Context v0.1**.

### 4.1 Role of `referencedNodes`

From the v0.4/v0.5 architecture, `ChatResponse` includes:

```ts
interface ChatResponse {
  answer: string;
  referencedNodes: string[];    // IDs of rules/benefits/etc.
  jurisdictions: string[];
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;
}
```

`referencedNodes` are explicitly intended to be **graph node IDs** for the rules/benefits/sections/timelines/cases/etc. that the answer is hanging off.

In this design, they are populated from the **concept capture & resolution** pipeline:

- For each concept resolved to a graph node via `canonicalConceptResolver`, we add the node ID to `referencedNodeIds`.
- These IDs are returned in `ChatResponse.referencedNodes` and can be:
  - Rendered in the UI as “evidence chips”, and
  - Used to focus/highlight nodes in any graph view.

### 4.2 Conversation Context ownership

The **front-end remains dumb**:

- It only knows about `POST /api/chat` with `{ messages, profile }`.
- It receives streamed answers plus meta (`referencedNodes`, etc.).
- It is **not responsible** for managing conversation context.

Conversation context is managed **server-side** by `reg-intel-core`, via a `ConversationContextStore` implemented by the host app (e.g. Supabase/Postgres in the demo shell).

For each `(tenantId, conversationId)`:

- On `handleChat` **start**:
  - Load `ConversationContext` (or use an empty one).
  - Use `conversationContextAspect` to inject a short description of `activeNodeIds` into the system prompt.

- On `handleChat` **end**:
  - Merge `referencedNodeIds` from this turn into `ctx.activeNodeIds`.
  - Save `ConversationContext` back to the store.

This ensures that **existing concepts** become “immediately available” to the next question *without* any responsibility on the front-end.

---

## 5. Storage & Separation of Concerns

### 5.1 Conversations & context (Supabase/Postgres)

Supabase/Postgres (or equivalent) holds:

- `tenants` (tenantId).
- `users` (userId, belongs to tenantId).
- `conversations` (conversationId, tenantId, createdByUserId, etc.).
- `messages` (per conversation, roles + content).
- `conversation_context` (per-tenant, per-conversation `activeNodeIds` and future fields).

Access control is per-tenant/per-user. One or many users in a tenant may access a conversation, depending on later sharing rules.

### 5.2 Rules & concepts (Memgraph)

Memgraph remains a **shared, PII-free knowledge graph** containing:

- Regulatory structures:
  - `:Section`, `:Benefit`, `:Relief`, `:Condition`, `:TimelineConstraint`,
  - `:TaxConcept` / `:Concept` (VAT, VRT, import flows, etc.),
  - `:Guidance`, `:Case`, `:Treaty`, `:Jurisdiction`, etc.
- Minimal label metadata:
  - `pref_label` on concept nodes.
  - A small number of `:Label` nodes for alternative labels, via `:HAS_ALT_LABEL`.

Memgraph **never** stores:

- Conversation text.
- User or company identifiers.
- Per-user scenarios with PII.

All writes go through:

- `GraphWriteService` → `Graph Ingress Guard`, enforcing schema and PII-stripping.

### 5.3 Runtime connection

For each `/api/chat` call:

1. The API route (demo web app) resolves `tenantId`, `userId`, `conversationId` from Supabase auth/session.
2. It calls:

   ```ts
   complianceEngine.handleChat({
     request: { messages, profile },
     identity: { tenantId, userId, conversationId },
   });
   ```

3. Inside the engine:
   - Load `ConversationContext` from the store.
   - Build prompts (including context aspect).
   - Call `LlmRouter.stream(...)` with `capture_concepts` tool.
   - Stream answer text to the UI.
   - Process tool output for concept capture & graph enrichment.
   - Update `ConversationContext` and save.

4. The engine returns `ChatResponse` with:
   - `answer` (final text),
   - `referencedNodes` (Memgraph IDs of relevant rules/benefits/etc.),
   - `jurisdictions`, `uncertaintyLevel`, `disclaimerKey`.

The front-end **never** talks directly to Memgraph; it only calls `/api/chat` and graph read endpoints.

---

## 6. Future Considerations

### 6.1 Non-OpenAI providers

For providers that do not support tools/structured outputs:

- v0.1 implementation may simply **disable concept capture** for those tenants.
- v0.2 may introduce a fallback:
  - Ask the model to emit a small JSON block as part of the answer (with clear delimiters),
  - Parse it on the server side (more brittle, but still usable).

### 6.2 Extending the SKOS payload

Future versions may add fields to `capture_concepts` such as:

- `broaderConcept` / `narrowerConcept` hints.
- Explicit `sectionReferences` (e.g. TCA 1997 s.81B).
- Confidence scores.

The engine should treat the tool schema as versioned and **defensively parse** unknown fields.

### 6.3 Integration with scenarios and what-if engine

Once the **Scenario Engine** is introduced, `activeNodeIds` and concept capture can feed into:

- Scenario definitions (e.g. VAT + VRT + import duty as a combined scenario).
- What-if comparisons (changing jurisdiction, entity type, or timelines).

These will be layered on top of the same concept capture and conversation context primitives defined here.

---

## 7. Summary

- We remove the dedicated `entity-extraction` LLM task and embed **concept capture** into the **main chat** call via the `capture_concepts` tool.
- The LLM streaming pipeline now yields **text chunks** (to the UI) and **tool chunks** (to the Compliance Engine only).
- Tool output contains **SKOS-inspired concept descriptions** (`prefLabel`, `altLabels`, `definition`, etc.).
- The Compliance Engine:
  - Resolves/creates concept nodes in Memgraph via `canonicalConceptResolver` + `GraphWriteService`.
  - Decides whether to enqueue **auto-ingestion** tasks when the graph lacks detail.
  - Populates `ChatResponse.referencedNodes` with the relevant node IDs.
  - Updates **ConversationContext.activeNodeIds**, ensuring concepts are immediately available for the next turn.
- Supabase/Postgres holds conversations and per-conversation context (tenant/user scoped); Memgraph remains a shared, PII-free rules graph.

This spec, together with `conversation_context_spec_v_0_1.md`, defines the backbone for **self-populating, context-aware chat** in the Regulatory Intelligence Copilot.

