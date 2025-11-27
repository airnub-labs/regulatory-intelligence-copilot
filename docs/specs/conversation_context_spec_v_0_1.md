# Conversation Context Spec v0.1

> **Status**: Draft
> **Scope**: v0.5 architecture, minimal viable implementation for prototype
> **Audience**: `reg-intel-core` / `reg-intel-llm` implementers, demo-web integrators

This spec defines how **conversation context** is represented, stored, and used inside the **Regulatory Intelligence Copilot**. It formalises the idea that:

- Conversations (chat history, access control, and per-conversation state) live in **Supabase/Postgres** (or an equivalent store in other shells).
- The **Memgraph rules graph** remains **PII-free** and **bloat-free**, shared across tenants.
- Conversation context is a **thin, tenant-scoped projection** of "what is relevant for this chat" (e.g. active rule nodes), not a second knowledge graph.

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. **Per-conversation state**
   - Track which graph nodes (rules, benefits, tax concepts, etc.) have been referenced in a conversation so far.
   - Make these nodes immediately available as context for subsequent turns.

2. **Backend-owned context**
   - Ensure the **Compliance Engine** owns and manages conversation context; frontends remain as dumb as possible.
   - Frontends only send chat messages + profile info and receive answers + metadata.

3. **Safe separation from Memgraph**
   - Keep conversation context (tenant/user scoped) out of Memgraph, preserving the PII-free, shared rules graph invariant.

4. **Prompt integration via aspects**
   - Provide a clean way for prompt aspect builders to inject a short summary of the active concepts into the LLM system prompt.

### 1.2 Non-Goals

- Not a full-featured CRM/notes system.
- Not a replacement for chat history storage (that remains in Supabase or host app DB).
- Not a generic session store for all kinds of UI state; this spec is focused on **LLM + graph orchestration**.

---

## 2. Conceptual Model

### 2.1 Core idea

**Conversation Context** is a small, tenant-scoped record capturing **what the engine knows is relevant so far** for a particular conversation. For v0.1, this focuses on **graph node IDs** the engine has used or recognised as important.

Later versions can extend this with:

- Active scenarios / what-if comparisons.
- Active profile tags / archetypes.
- Risk flags or uncertainty markers.

### 2.2 Lifetime

- The context is **created** when a new conversation starts.
- It is **updated** after each successful `handleChat` call.
- It is **read** before each new `handleChat` call.
- It can be **archived or deleted** when the conversation is closed, according to tenant retention policies.

---

## 3. Data Structures

### 3.1 In-memory TypeScript shapes

In `reg-intel-core`:

```ts
/**
 * Minimal v0.1 conversation context.
 *
 * Per-conversation, per-tenant, PII-free.
 */
export interface ConversationContext {
  /**
   * Memgraph node IDs for rules/benefits/etc. that have been
   * referenced or recognised as relevant in this conversation so far.
   *
   * These are the same IDs that can appear in ChatResponse.referencedNodes.
   */
  activeNodeIds: string[];

  /**
   * Reserved for future use (scenarios, profile tags, etc.).
   */
  // activeScenarioIds?: string[];
  // activeProfileTags?: string[];
}

/**
 * Extended parameters passed internally to the Compliance Engine.
 *
 * Note: tenantId, userId, conversationId are not exposed in the public
 * ChatRequest interface, but are available on the server side.
 */
export interface ConversationIdentity {
  tenantId: string;
  userId: string;
  conversationId: string;
}
```

### 3.2 ConversationContextStore interface

The **engine** depends on an abstract store; the host app (Next.js/Supabase, CLI, etc.) provides the implementation.

```ts
/**
 * Abstraction for loading and saving conversation context.
 *
 * Implemented by the host app (e.g. using Supabase/Postgres), injected
 * into reg-intel-core.
 */
export interface ConversationContextStore {
  load(identity: ConversationIdentity): Promise<ConversationContext | null>;

  save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void>;
}
```

### 3.3 Default initial context

If no context exists for a conversation, the engine should use:

```ts
const EMPTY_CONTEXT: ConversationContext = {
  activeNodeIds: [],
};
```

---

## 4. Integration with Chat Flow

### 4.1 Public ChatRequest & ChatResponse (unchanged)

The public surface remains:

```ts
export interface ChatRequest {
  messages: ChatTurn[];
  profile: UserProfileContext;
}

export interface ChatResponse {
  answer: string;
  referencedNodes: string[];    // graph node IDs for this turn
  jurisdictions: string[];
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;
}
```

Frontends:

- **Do not** need to know about ConversationContext.
- Can optionally display `referencedNodes` as evidence chips, focus the graph view, etc.

### 4.2 Extended internal call signature

Inside `reg-intel-core`, the Compliance Engine gets extra identity parameters:

```ts
export interface HandleChatParams {
  request: ChatRequest;
  identity: ConversationIdentity;
}

export interface ComplianceEngine {
  handleChat(params: HandleChatParams): Promise<ChatResponse>;
}
```

These extra fields are passed from the API route / host app and are **not** required in the public TS types used by the frontend.

### 4.3 handleChat pipeline with context

High-level steps inside `handleChat`:

1. **Load context**

   ```ts
   const ctx = (await contextStore.load(identity)) ?? EMPTY_CONTEXT;
   ```

2. **Build prompts via aspects**, including a new `conversationContextAspect` that summarises `ctx.activeNodeIds` (see §5):

   - Resolve `ctx.activeNodeIds` to a small set of concepts/labels via GraphClient.
   - Inject a short neutral description into the system prompt, e.g.:

     > "In this conversation, the following regulatory concepts are already in scope: Value-Added Tax (VAT, Ireland), Vehicle Registration Tax (Ireland). Prefer reusing these where relevant."

3. **Invoke agent + LLM**

   - Call `LlmRouter.stream(...)` with tools enabled (e.g. `capture_concepts`) for SKOS-like concept metadata.
   - Stream `text` chunks directly to the client.
   - Capture `tool` chunks server-side.

4. **Resolve concepts & build referencedNodes**

   - From the tool output, resolve or create concept nodes in Memgraph via GraphClient + GraphWriteService.
   - Collect the concrete node IDs used/created during this turn into a `referencedNodes` array.

5. **Update and save context**

   - Merge `referencedNodes` into `ctx.activeNodeIds` (de-duplicated):

     ```ts
     ctx.activeNodeIds = unique([...ctx.activeNodeIds, ...referencedNodes]);
     await contextStore.save(identity, ctx);
     ```

6. **Return ChatResponse**

   ```ts
   return {
     answer: finalAnswerText,
     referencedNodes,
     jurisdictions,
     uncertaintyLevel,
     disclaimerKey,
   };
   ```

---

## 5. Conversation Context Prompt Aspect

Introduce a new prompt aspect in `reg-intel-prompts` (name is indicative):

```ts
export interface ConversationContextAspectInput {
  activeNodeIds: string[];
}
```

This aspect is responsible for:

1. Using `GraphClient` to fetch a **small, human-readable description** of the active nodes:
   - Prefer grouping by concept (e.g. VAT IE, VRT IE, specific welfare benefit).
   - Avoid dumping raw node IDs or low-level detail.

2. Emitting a short neutral paragraph that can be appended to the system prompt, such as:

   > "Context: In this conversation, we have already discussed the following regulatory items: \n" +
   > "- Value-Added Tax (VAT) in Ireland (VAT IE)\n" +
   > "- Vehicle Registration Tax (VRT) in Ireland (VRT IE)\n" +
   > "You may refer back to these where helpful, and avoid contradicting them unless you explicitly note a change in law or uncertainty."

3. Ensuring it remains **jurisdiction neutral** at the top level, while still naming specific jurisdictions in the list when appropriate.

This aspect is **optional**; if `activeNodeIds` is empty, it should emit nothing.

---

## 6. Storage & Privacy Considerations

### 6.1 Where context is stored

- In the **demo web app** and future SaaS shells, conversation context should be stored in **Supabase/Postgres**, in a table such as `conversation_context` keyed by `(tenant_id, conversation_id)`.
- For local prototypes, an in-memory map (per process) is acceptable.

Example table (conceptual):

```sql
CREATE TABLE conversation_context (
  tenant_id        uuid    NOT NULL,
  conversation_id  uuid    NOT NULL,
  active_node_ids  text[]  NOT NULL DEFAULT '{}',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, conversation_id)
);
```

### 6.2 PII and Memgraph

- Conversation context **must not** be stored in Memgraph.
- Memgraph remains a shared, PII-free rules graph.
- `activeNodeIds` are references to nodes already in Memgraph; they contain no user-specific data.
- Any per-user/per-tenant details (names, addresses, specific fact patterns) must remain in Supabase or ephemeral memory, never in the rules graph.

---

## 7. Future Extensions (v0.2+)

Potential extensions once v0.1 is stable:

1. **Scenarios & what-if context**
   - Add `activeScenarioIds` referencing scenario definitions stored in Supabase.
   - Prompt aspect can summarise current scenarios alongside active rules.

2. **Profile tag context**
   - Add `activeProfileTags` indicating archetypes (e.g. SINGLE_DIRECTOR_IE) applied in this conversation.

3. **Risk/uncertainty context**
   - Track per-conversation risk flags (e.g. "cross-border complexity", "unusual fact pattern").

4. **Cross-device continuation**
   - Ensure that context follows conversations when users move between devices, via consistent `(tenantId, conversationId)` handling in the host app.

---

## 8. Summary

- Conversation context is a **small, PII-free, per-conversation projection** of the shared rules graph into the chat engine.
- It is **owned by the Compliance Engine**, persisted by the host app (Supabase in the demo), and **never stored in Memgraph**.
- `activeNodeIds` from the context feed into:
  - Prompt aspects (better grounded answers), and
  - `ChatResponse.referencedNodes` for traceability and UX.
- This spec provides the minimum structure needed to implement self-populating, context-aware conversations without changing the public `/api/chat` contract.

