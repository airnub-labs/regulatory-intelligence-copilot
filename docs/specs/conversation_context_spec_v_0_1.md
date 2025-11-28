# Conversation Context Specification (v0.1)

**Status:** v0.1 (stable for implementation)

This document specifies how **conversation context** is represented, stored, and used by the Regulatory Intelligence Copilot.

Conversation context is the engine’s internal view of “what is already in play” for a given conversation (e.g. which graph nodes have been referenced so far). It is **owned by the backend**, lives in **Supabase/Postgres**, and is **never stored in Memgraph**.

This spec is aligned with:

- `architecture_v_0_6.md`
- `decisions_v_0_6.md`
- `concept_capture_from_main_chat_v_0_1.md`
- `data_privacy_and_architecture_boundaries_v_0_1.md`

---

## 1. Purpose & Non‑Goals

### 1.1 Purpose

Conversation context exists to:

1. Keep track of which **rules/benefits/concepts** (graph nodes) have been referenced in a conversation.
2. Provide a **lightweight, engine‑owned memory** that makes later answers more grounded and consistent.
3. Allow the Compliance Engine to inject a concise description of “active concepts” into the LLM system prompt via a prompt aspect, **without** involving the frontend.

### 1.2 Non‑Goals

Conversation context is **not**:

- A second knowledge graph.
- A place to store full scenarios or user PII.
- A long‑term archive of everything the user ever asked (that is the job of the conversation/message tables).

Conversation context is a **compact, derived state** that can be recomputed from conversations + graph if needed.

---

## 2. Data Model

### 2.1 `ConversationIdentity`

Each context entry is uniquely identified by the `(tenantId, conversationId)` pair (userId is optional but useful for auditing):

```ts
export interface ConversationIdentity {
  tenantId: string;
  conversationId: string;
  userId?: string | null; // for auditing/ownership; not required for identity
}
```

### 2.2 `ConversationContext`

`ConversationContext` is a small, JSON‑serialisable structure that contains only what the engine needs to prime future turns.

```ts
export interface ConversationContext {
  /**
   * Graph node IDs that have been referenced in this conversation and
   * are still considered relevant. These are Memgraph IDs for rules,
   * benefits, concepts, timelines, etc.
   */
  activeNodeIds: string[];

  // v0.1 intentionally minimal. Future fields may include:
  // - activeScenarios: string[];
  // - activeProfileTags: string[];
  // - flags: { [key: string]: boolean };
}
```

An empty context is represented as:

```ts
export const EMPTY_CONTEXT: ConversationContext = {
  activeNodeIds: [],
};
```

### 2.3 `ConversationContextStore`

The engine interacts with context through an abstract store interface. The concrete implementation (Supabase/Postgres) is provided by the host app.

```ts
export interface ConversationContextStore {
  load(identity: ConversationIdentity): Promise<ConversationContext | null>;
  save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void>;
}
```

**Behavioural rules:**

- `load`:
  - Returns `null` when there is no stored context yet.
  - On failure, the engine should treat this as `EMPTY_CONTEXT` and continue (see §4).
- `save`:
  - Persists the full context snapshot.
  - On failure, the engine **must not** fail the user’s chat; it should log and proceed.

---

## 3. Storage in Supabase/Postgres

### 3.1 Table schema (example)

A minimal Postgres table to store context as JSON:

```sql
CREATE TABLE conversation_context (
  tenant_id        uuid      NOT NULL,
  conversation_id  uuid      NOT NULL,
  context_json     jsonb     NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, conversation_id)
);
```

Notes:

- `context_json` stores the serialised `ConversationContext`.
- `user_id` is deliberately omitted from the primary key so multiple users in a tenant can share a conversation.
- Additional fields (e.g. `user_id`, `created_at`) may be added by the host app as needed.

### 3.2 Retention & lifecycle

Implementations should apply a **retention policy** to avoid unbounded growth, for example:

- Soft‑delete or archive contexts after **N days of inactivity**.
- Optionally purge contexts when their parent conversations are deleted.

The engine must tolerate missing context and treat it as `EMPTY_CONTEXT`.

---

## 4. Engine Integration

### 4.1 `ComplianceEngine.handleChat` signature

The Compliance Engine needs access to conversation identity and the context store.

Conceptual signature:

```ts
export interface HandleChatParams {
  messages: ChatTurn[];
  profile: UserProfileContext;
  identity: ConversationIdentity;              // tenant + conversation (+ user)
  contextStore: ConversationContextStore;      // injected by host app
}

export interface ChatResponse {
  answer: string;
  referencedNodes: string[];                   // Memgraph node IDs
  jurisdictions: string[];
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;
  // ...other meta fields
}

export interface ComplianceEngine {
  handleChat(params: HandleChatParams): Promise<ChatResponse>;
}
```

This is a conceptual interface; the concrete wiring in `reg-intel-next-adapter` may add streaming and other details.

### 4.2 Request‑time flow

On each `/api/chat` request, the engine should:

1. **Load context**
   - Call `contextStore.load(identity)`.
   - If it returns `null` or throws, fall back to `EMPTY_CONTEXT`.

2. **Build prompts with aspects**
   - Construct system prompt using existing aspects:
     - Jurisdiction aspect.
     - Agent/domain aspect.
     - Profile/persona aspect.
     - Disclaimers.
     - Additional context.
   - Include the **conversation context aspect** (see §5) so that `activeNodeIds` are reflected in the system prompt.

3. **Call main chat LLM**
   - Use `LlmRouter.stream(...)` with tools enabled (including `capture_concepts`).
   - Stream `text` chunks to the UI.
   - Capture the `capture_concepts` tool output and pass it to the concept handler.

4. **Resolve concepts & determine `referencedNodes`**
   - From the concept handler (`handleConceptMetadataFromMainChat`), obtain `referencedNodeIds[]` (see `concept_capture_from_main_chat_v_0_1.md`).
   - Agents may add more node IDs based on explicit graph queries.

5. **Update and save context**
   - Merge current `referencedNodeIds` into `ctx.activeNodeIds` (deduplicated, optionally pruned to a max size).
   - Call `contextStore.save(identity, ctx)`.
   - If `save` fails, log and continue.

6. **Return ChatResponse**
   - `answer` is the full text concatenation of streamed chunks.
   - `referencedNodes` is the final, deduplicated list of node IDs determined in step 4.

### 4.3 Failure behaviour

Context must **never** be a hard dependency for chat. Rules:

- If `contextStore.load` fails:
  - Log the error.
  - Proceed as if `EMPTY_CONTEXT` was loaded.

- If `contextStore.save` fails:
  - Log the error.
  - Still return a normal `ChatResponse`.

- If the conversation context aspect fails to resolve node descriptions:
  - Log the error.
  - Omit the "active concepts" paragraph for that turn.

---

## 5. Conversation Context Prompt Aspect

### 5.1 Purpose

The `conversationContextAspect` (or equivalent) is responsible for turning `activeNodeIds` into a **short, human‑readable summary** injected into the LLM system prompt.

This summary tells the model which concepts are already in scope for this conversation, improving consistency and grounding.

### 5.2 Aspect input

Aspect input type:

```ts
export interface ConversationContextAspectInput {
  activeNodeIds: string[];
}
```

The engine is responsible for providing this from the loaded `ConversationContext`.

### 5.3 Aspect behaviour

Pseudocode:

```ts
async function conversationContextAspect(
  input: ConversationContextAspectInput,
  deps: { graphClient: GraphClient },
): Promise<string | null> {
  const { activeNodeIds } = input;
  if (!activeNodeIds.length) return null;

  const nodes = await graphClient.getNodesByIds(activeNodeIds);

  if (!nodes.length) return null;

  // Build a short SKOS-like summary
  const lines = nodes.map(node => {
    const label = node.prefLabel ?? node.name ?? node.id;
    const jurisdiction = node.jurisdiction ?? '';
    const tag = jurisdiction ? `${label} (${jurisdiction})` : label;
    return `- ${tag} – ${node.shortDescription ?? ''}`;
  });

  return [
    'In this conversation, the following regulatory concepts are already in scope:',
    ...lines,
    'Where relevant, prefer grounded explanations that reuse these concepts.',
  ].join('\n');
}
```

This returned string becomes part of the system prompt alongside other aspects.

### 5.4 Prompt integration

The prompt builder should:

- Call `conversationContextAspect` with the current `activeNodeIds`.
- If the aspect returns `null`, omit this section.
- If it returns a string, append it as a distinct paragraph in the system prompt.

Example system prompt fragment:

> In this conversation, the following regulatory concepts are already in scope:
> - Value-Added Tax (VAT) (IE) – general indirect tax on goods and services in Ireland.
> - Vehicle Registration Tax (VRT) (IE) – tax levied on registration of vehicles in Ireland.
>
> Where relevant, prefer grounded explanations that reuse these concepts.

---

## 6. Interaction with Concept Capture & `referencedNodes`

Conversation context and concept capture are tightly coupled:

- `concept_capture_from_main_chat_v_0_1.md` defines how the main chat call emits SKOS‑style concept metadata via `capture_concepts`.
- The concept handler resolves or creates concept nodes in Memgraph and returns `referencedNodeIds`.
- `ConversationContext.activeNodeIds` is updated as the **union** of previous `activeNodeIds` and `referencedNodeIds` for this turn.
- `ChatResponse.referencedNodes` is populated with the node IDs that were central to this answer.

This means:

- The **current answer** is grounded by explicit node IDs (visible to the UI via `referencedNodes`).
- **Future answers** are primed via the conversation context aspect using the same node IDs.

---

## 7. Privacy & Data Separation

Conversation context must respect the global privacy and data‑separation rules:

- **Supabase/Postgres** holds:
  - Tenants, users, conversations, messages.
  - `ConversationContext` (including `activeNodeIds`).
- **Memgraph** holds:
  - Public/shared rules graph data: `:Rule`, `:Section`, `:Benefit`, `:Relief`, `:TimelineConstraint`, `:Case`, `:Guidance`, concept nodes, label/alias nodes, etc.
  - No user IDs, no conversation IDs, no raw chat text.

`activeNodeIds` refer only to Memgraph node IDs; they do not encode any PII.

The context table must **not** contain raw user prompts or answers; that belongs in the normal conversation/message tables.

---

## 8. Versioning & Future Extensions

### 8.1 v0.1 guarantees

v0.1 guarantees:

- A stable `ConversationContext` structure with `activeNodeIds: string[]`.
- A `ConversationContextStore` interface with `load/save` and resilient error handling.
- Engine‑side ownership of context (frontend remains dumb).
- A prompt aspect that surfaces active nodes as a human‑readable summary to the LLM.
- Integration with concept capture and `referencedNodes` to keep concepts in scope across turns.

### 8.2 Possible v0.2+ extensions (non‑binding)

Future versions may add:

- `activeScenarios: string[]` for scenario engine integration.
- Profile tags (e.g. `['IE_SINGLE_DIRECTOR', 'SELF_EMPLOYED']`).
- Additional flags (e.g. `hasCrossBorderActivity`, `highUncertaintySeen`).
- More complex summarisation logic (e.g. ranking nodes by recency or importance).

Any new fields must remain **JSON‑serialisable** and respect the same privacy boundaries.

