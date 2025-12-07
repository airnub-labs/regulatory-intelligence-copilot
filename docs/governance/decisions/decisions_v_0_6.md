# Architecture Decision Records (v0.6)

**Project:** Regulatory Intelligence Copilot  
**Scope:** Engine, graph, UI shell, and integrations  
**Status:** Draft v0.6 – supersedes v0.5 as the latest decisions summary (v0.4 + v0.5 still normative for earlier layers)

This document captures key architectural and product decisions for the Regulatory Intelligence Copilot as of **architecture v0.6**.

- v0.4 – Core engine, graph, MCP/egress, and privacy boundaries.
- v0.5 – UI stack (Tailwind v4, Radix, shadcn/ui, AI-elements-style chat) and frontend best practices.
- v0.6 – **New decisions** around:
  - SKOS-style concept capture from the *main chat* call (no separate entity-extraction task).
  - Self-populating rules graph based on conversation metadata.
  - Backend-owned conversation context (Supabase) vs PII-free Memgraph.
  - `referencedNodes` semantics and evidence wiring.
  - Adoption of graph change detection enhancements.

All decisions from **v0.4** and **v0.5** remain in force unless explicitly superseded here.

---

## 1. Relationship to v0.4 and v0.5

### D-030 – Decision numbering and layering

- **Keep** v0.4 and v0.5 decision IDs (`D-001`–`D-029`) as-is; they remain valid and referenced.
- **Start** new decisions in this document at `D-030` to avoid renumbering and keep a clear chronology.
- **Layering:**
  - v0.4 – Core engine, graph, MCP, ingress/egress, privacy.
  - v0.5 – UI architecture and design system.
  - v0.6 – Concept capture, self-population, conversation context, and change detection refinements.

---

## 2. Concept Capture from Main Chat (SKOS-Style)

### D-031 – Single main-chat task with concept capture (no separate entity-extraction task)

**Decision:**

- We **remove** the idea of a separate "entity extraction" LLM task for each user message.
- Instead, we **always** call a single **main chat task** that:
  - Streams natural language answer text to the UI, and
  - **Also emits structured concept metadata** via a tool call.

**Implementation constraints:**

- The main chat call is made via the **LLM Router** using the **OpenAI Responses API** (through the Vercel AI SDK v5, per v0.4).
- A single tool, tentatively named `capture_concepts`, is configured with a **SKOS-inspired JSON schema**, including:
  - `domain`: e.g. `"TAX"`, `"VEHICLE_REG"`.
  - `kind`: e.g. `"VAT"`, `"VRT"`, `"IMPORT_DUTY"`.
  - `jurisdiction`: e.g. `"IE"`, `"EU"`.
  - `prefLabel`: canonical human-readable label.
  - `altLabels[]`: synonyms/aliases, including user phrasing.
  - `definition`: short textual definition.
  - `sourceUrls[]`: optional authoritative URLs (Revenue, gov.ie, etc.).

**Rationale:**

- Keeps **one LLM call per message**, reducing cost and complexity.
- Ensures the **same reasoning context** is used for both the answer and the concept metadata.
- Avoids brittle "JSON at the bottom of the answer" patterns which break streaming.

**Scope & limitations:**

- Concept capture via tools is **mandatory only** for providers that support tools/structured outputs (OpenAI Responses path).
- Other providers may:
  - Run in **answer-only** mode (no concept capture), or
  - Use a separate, slower path for metadata (optional, future).

---

### D-032 – LlmProvider streaming shape: text + tool chunks

**Decision:**

- The `LlmProvider` streaming interface is extended from a text-only stream to a **tagged union** of chunk types:

```ts
// Conceptual contract
export type LlmStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; argsJson: unknown }
  | { type: 'error'; error: Error };
```

- The Compliance Engine and API adapter must:
  - Forward `type: 'text'` chunks directly to the UI SSE stream.
  - Intercept `type: 'tool'` chunks (not shown to the UI) and pass their payload into the concept/graph pipeline.
  - Handle `type: 'error'` by terminating the stream and returning an error state.

**Rationale:**

- Preserves the **streaming UX** (answer text arrives progressively).
- Cleanly separates **user-visible content** (text) from **machine metadata** (tools), enabling concept capture and other hidden side-channels.
- Keeps the public API simple: the UI still thinks in terms of "streaming text" plus a summary meta payload at the end.

---

## 3. Self-Populating Rules Graph

### D-033 – Self-population pipeline from `capture_concepts` tool

**Decision:**

- The `capture_concepts` tool output is the **only source of concept metadata** for self-population in v0.6.
- For each concept emitted by the tool, the Compliance Engine runs a **self-population pipeline**:

1. **Parse SKOS-like concept:**
   - Read `domain`, `kind`, `jurisdiction`, `prefLabel`, `altLabels[]`, `definition`, `sourceUrls[]`.
2. **Normalise aliases:**
   - Lowercase/trim/strip punctuation for comparison.
3. **Resolve canonical concept:**
   - Use a `CanonicalConceptResolver` that queries Memgraph (via `GraphClient`) to see if a concept node already exists.
   - Matching is initially keyed on `(domain, kind, jurisdiction)` with room to add additional heuristics later.
4. **Upsert into Memgraph:**
   - If **existing**, reuse the canonical node ID and optionally enrich labels/links.
   - If **missing**, call `GraphWriteService` to create a new concept/rule node and associated label/alias nodes.
   - All writes go through the **Graph Ingress Guard**, preserving PII and schema constraints.

**Rationale:**

- Aligns with the **"living graph"** goal from v0.4/v0.5: conversations and MCP runs gradually enrich a shared rules graph.
- Ensures all graph writes pass through existing **safety and normalisation** layers.
- Keeps concept resolution **centralised** and testable.

---

### D-034 – Auto-ingestion only when concepts are missing or clearly sparse

**Decision:**

- The rules graph is **not** automatically flooded with ingestion jobs for every mentioned concept.
- After resolving a concept, the Compliance Engine checks whether the canonical node is:
  - **Missing** (no node), or
  - **Clearly sparse** (e.g. no edges to rules/sections/rates, or missing key properties like VAT rate bands).
- Only in those cases will it **enqueue an ingestion job**, e.g. via MCP:
  - Use Revenue.ie / gov.ie / EU sources.
  - Parse documents with LLM extraction.
  - Upsert new nodes/edges via `GraphWriteService`.

**Rationale:**

- Avoids **bloat** and noise in Memgraph from casual mentions.
- Keeps expensive MCP-based ingestion as an **on-demand enrichment** mechanism, not a default for every concept.
- Maintains a PII-free, **high-signal shared knowledge graph**.

---

## 4. Conversation Context & Evidence

### D-035 – Backend-owned conversation context (not UI, not Memgraph)

**Decision:**

- Conversation context is **owned by the engine + host app**, *not* by the UI and *not* stored in Memgraph.
- Introduce an internal `ConversationContext` shape, e.g.:

```ts
interface ConversationContext {
  activeNodeIds: string[];  // Graph node IDs relevant to this conversation
  // Future: activeScenarios, flags, lastJurisdictions, etc.
}
```

- Introduce a `ConversationContextStore` interface:

```ts
interface ConversationContextStore {
  load(tenantId: string, conversationId: string): Promise<ConversationContext | null>;
  save(tenantId: string, conversationId: string, ctx: ConversationContext): Promise<void>;
}
```

- The host app (Next.js + Supabase) provides the concrete implementation.
- The **Compliance Engine**:
  - Loads `ConversationContext` at the start of each `/api/chat` call.
  - Updates it based on resolved concept IDs and graph queries.
  - Saves it back at the end of the request.

**Rationale:**

- Keeps the UI **"dumb"**: any frontend that can call `/api/chat` and stream text can use the engine correctly without remembering to round-trip custom metadata.
- Ensures all conversation-level state is **tenant- and user-scoped** in Supabase/Postgres.
- Preserves the invariant that Memgraph remains a **global, PII-free rules graph**.

---

### D-036 – `referencedNodes` as the evidence bridge between engine and UI

**Decision:**

- The existing `ChatResponse.referencedNodes: string[]` field is formally defined as:

> The set of Memgraph node IDs (rules, sections, benefits, reliefs, concepts, timelines, etc.) that the engine considers central to the answer it just returned.

- The Compliance Engine must:
  - Populate `referencedNodes` using the canonical node IDs resolved from concept capture and graph queries.
  - Include both pre-existing nodes (e.g. `Rule:VAT_IE`, `Rule:VRT_IE`) and newly created concept nodes when available.

### D-037 – Router-centric egress guard + `capture_concepts` wiring

**Decision:**

- All outbound LLM calls run through **LlmRouter → EgressClient** as the single choke point. Agents never talk to providers directly.
- `LlmRouter` resolves a requested vs **effective egress mode** (global defaults → tenant → optional user → per-call override) and always enforces provider allowlisting, even when `effectiveMode === 'off'`.
- **Mode semantics:**
  - `enforce` executes the **sanitised** payload.
  - `report-only` executes the **original** payload but records sanitisation deltas in `metadata` for audit/telemetry.
  - `off` skips sanitisation but still rejects disallowed providers (test-only wiring).
- Main-chat calls attach a `capture_concepts` tool; the Compliance Engine ingests `type: 'tool'` chunks (`name: 'capture_concepts'`, `argsJson`) off-stream, resolves/upsserts canonical concepts, and merges returned node IDs into `referencedNodes` + **Conversation Context** before returning results.

**Trade-offs / rationale:**

- Centralising egress guarantees consistent sanitisation + allowlisting across providers and future MCP/http targets while keeping per-tenant policy resolution visible via `EgressGuardContext` (tenant/user/mode metadata).
- Executing originals in `report-only` keeps behaviour faithful to caller intent while still surfacing redaction signals for gradual rollouts.
- Streaming concept capture via `capture_concepts` keeps the UI text-only while letting the engine self-populate graph context for subsequent turns.

**UI responsibilities:**

- The UI **may**:
  - Render these as chips, lists, or clickable items.
  - Use them to **focus/highlight** nodes in the graph visualisation via `/api/graph`.
- The UI is **not required** to send `referencedNodes` back to the engine; they are recomputed each turn.

**Rationale:**

- Makes answers **grounded and inspectable** without exposing internal SKOS JSON.

### D-037 – Conversation persistence and SSE fan-out

**Decision:**

- Conversations/messages are persisted in Supabase/Postgres via a `ConversationStore`, with a dev-mode in-memory fallback to keep local demos running without external services.
- Conversation context remains on the backend through `ConversationContextStore`; the Compliance Engine always reads/writes it, keeping the UI stateless.
- SSE transport is **per conversation**: a hub broadcasts each streamed chunk to all subscribers for the same `(tenantId, conversationId)`.

**Status:**

- Schema and seed data added; production Supabase wiring and RLS are pending.
- Event hub implemented as an in-process map suitable for single-instance dev. Production fan-out will require Redis/pub-sub or a managed equivalent.
- Provides the basis for a "show your workings" experience in the graph view.
- Sharing is modelled via `share_audience` (private/tenant/public) and `tenant_access` (view/edit); `isShared` is derived in application code instead of being stored or exposed as a column to avoid redundant state.
  - An `authorization_model` + `authorization_spec` envelope sits beside these columns so we can plug in OpenFGA (or similar Zanzibar-style ReBAC) later while keeping Supabase as the system of record and the UI/API contracts stable. When `authorization_model = 'openfga'` but the external service is unavailable, the effective audience **falls back to private/owner-only** until ReBAC checks succeed again.

### D-040 – ReBAC trajectory (OpenFGA-ready)

**Decision (future-facing):**

- Use `authorization_model = 'openfga'` plus `authorization_spec` to carry principal/resource tuples so we can mirror conversation sharing into OpenFGA without rewriting persistence.
- Keep Supabase/RLS as the enforcement source of truth; OpenFGA provides discovery (`ListObjects`, `ListUsers`) and caching for server-side filtering.

**Status:**

- Planning. Schema and API surfaces already include `authorization_model`/`authorization_spec` to avoid future breaking changes.

**Next steps (tracked on the roadmap):**

- Define the OpenFGA model (users, conversations, tenant membership, roles, public-read delegation).
- Synchronise tuple writes alongside Supabase updates when `authorization_model = 'openfga'` is enabled for a tenant.
- Gate authz in the chat/conversation APIs via OpenFGA checks before RLS queries.

### D-041 – Shared conversation/authorisation package

**Decision:**

- Extract the conversation store/context interfaces, sharing/authorisation envelope, and per-conversation SSE event hub into a reusable package `@reg-copilot/reg-intel-conversations` so host shells beyond Next.js can consume the same logic without divergence.
- Keep `@reg-copilot/reg-intel-next-adapter` thin: it re-exports these primitives but no longer owns their implementations.

**Status:**

- Implemented in v0.6; Next.js wiring now depends on the shared package while remaining API-compatible for callers.

**Rationale:**

- Avoids duplicated sharing/auth logic as ReBAC (OpenFGA) lands.
- Simplifies adoption in other runtimes (CLI, different web shells) while keeping a single derivation for `share_audience` + `tenant_access` resolution and SSE fan-out semantics.

### D-042 – Tenant-scoped SSE stream for conversation lists

**Decision:**

- Add a **tenant-scoped SSE endpoint** (tentatively `/api/conversations/stream`) that emits conversation list changes so UIs stay in sync across tabs/devices without manual refreshes.
- Events cover creation, rename, archive/restore, and sharing/authorisation changes and include enough metadata (IDs, titles, share envelope) for clients to merge updates into cached lists without re-fetching entire histories.
- The stream reuses the conversation event hub that already powers per-conversation chat SSE; production deployments should fan out via Redis/pub-sub when horizontally scaled.

**Rationale:**

- Keeps conversation pickers and sidebars **live** when users collaborate or switch devices.
- Avoids **polling loops** and reduces Supabase query load for simple list updates.
- Aligns web and non-Next.js shells on a single streaming contract for conversation discovery.

---

### D-037 – ConversationContext aspect for prompts (implicit, engine-side)

**Decision:**

- The engine uses a dedicated **prompt aspect** (or reuses `additionalContextAspect`) that:
  - Looks up `ConversationContext.activeNodeIds` for the current `(tenantId, conversationId)`.
  - Resolves those node IDs to short, SKOS-like descriptions via `GraphClient`.
  - Injects a concise "active concepts" summary into the **system prompt** for the main chat call, e.g.:

> "In this conversation, the following concepts are already in scope: VAT (IE) – Rule:VAT_IE, Vehicle Registration Tax (IE) – Rule:VRT_IE, Importing vehicles from Japan to IE – Concept:IMPORT_VEHICLE_TO_IE. Prefer grounded explanations that reuse these where relevant."

- This aspect is applied **server-side only**; the UI does not need to be aware of it.

**Rationale:**

- Ensures the LLM can **reuse prior concepts** without re-discovery on every turn.
- Keeps prompts grounded in actual graph nodes, improving consistency.
- Preserves frontend simplicity: conversation context is entirely engine-managed.

---

## 5. Data Separation: Supabase vs Memgraph

### D-038 – Supabase for conversations and context; Memgraph for public rules only

**Decision (refinement of v0.4 privacy boundaries):**

- **Supabase/Postgres** stores:
  - Tenants (`tenantId`).
  - Users (`userId`, scoped to a tenant).
  - Conversations (`conversationId`, `tenantId`, `createdByUserId`, title, timestamps).
  - Messages (per conversation, role + content).
  - `ConversationContext` (including `activeNodeIds` and any future flags/scenarios).
- **Memgraph** stores **only**:
  - Public/shared regulatory knowledge and metadata:
    - `:Jurisdiction`, `:Regime`, `:Rule`, `:Section`, `:Benefit`, `:Relief`, `:TimelineConstraint`, `:Case`, `:Guidance`, `:Update`, etc.
    - Concept nodes (VAT, VRT, import duties, etc.) created via self-population.
    - Algorithmic helper nodes (communities, anchors) where used.
  - **No PII**, no per-user scenarios, no raw chat text.

**Rationale:**

- Reinforces data protection for multi-tenant SaaS usage.
- Allows Memgraph to be shared across tenants (within the same deployment) without leaking user context.
- Keeps the rules graph focused and performant: it stores rules, not conversations.

---

## 6. Graph Change Detection Enhancements

### D-039 – Adopt timestamp-based queries and batching as the default graph change detector configuration

**Decision:**

- The project adopts the **v0.3.1 Graph Change Detection Enhancements** as the default behaviour:
  - **Timestamp-based queries**: `useTimestamps: true` where Memgraph schema includes `created_at` / `updated_at` on relevant node labels.
  - **Change batching**: short `batchWindowMs` (e.g. 500–1000 ms) to group rapid changes into a single SSE patch.

**Rationale:**

- Reduces Memgraph query load and network chatter by **80–95%** in typical workloads.
- Improves UI performance by avoiding thrashing from many tiny patches.
- Fully backwards compatible; can be tuned or disabled per deployment if required.

**Constraints:**

- Seeding scripts and `GraphWriteService` **must** maintain `created_at` and `updated_at` semantics:
  - `created_at` set on first creation.
  - `updated_at` updated on every logical change.

---

## 7. Future-Facing Decisions & Use Cases

### D-040 – Scenario engine and curated expert collections as first-class but optional layers

**Decision:**

- The **Scenario Engine** (`spec_v_0_1.md`) and **Use Case 1 (expert/collection-based profiles)** are treated as **optional layers** on top of the core engine:
  - They may persist scenario definitions and collections in Supabase.
  - They must consume the **same graph and concept capture mechanisms** as the main chat flow.
  - They must not introduce PII into Memgraph.

**Rationale:**

- Allows advanced features like what-if comparisons and curated expert profiles to be built without changing the core engine/graph contracts.
- Ensures the architecture remains **extensible** while preserving the invariants defined in v0.4–v0.6.

### D-041 – Egress guard modes and safe sanitisation

**Context:**

- Egress policy enforcement and PII redaction need staged rollout controls without allowing accidental bypass of the sanitiser.

**Decision:**

- `EgressClient` exposes three modes: `enforce`, `report-only`, and `off`.
- In `enforce`, the execution payload is the sanitised request. In `report-only`, sanitisation still runs and is recorded in metadata, but the original payload executes for observability and parity with caller intent.
- `originalRequest` can be preserved explicitly for debugging/telemetry in non-production wiring when needed.
- `off` disables sanitisation but still runs provider allowlisting (and will throw on disallowed providers); it is reserved for explicit test/benchmark clients.
- Sanitisation runs before other aspects; provider allowlisting is **always enforced**.

**Consequences:**

- Production wiring uses `mode: 'enforce'` by default; staged environments may temporarily use `report-only` while still running with sanitised execution payloads.
- `mode: 'off'` must be treated as a deliberate, non-default testing override and avoided in normal app wiring.

---

### D-042 – Per-tenant/per-user egress mode resolution (safe by default)

**Context:**

- Tenants may need to stage egress policy changes or enable report-only telemetry without weakening protections for others.
- Per-user experimentation must not bypass sanitisation for unrelated tenants.

**Decision:**

- `LlmRouter` resolves an `effectiveMode` per call using global defaults, tenant policy (`egressMode`, `allowOffMode`), optional per-user policies, and optional per-call overrides (e.g. `egressModeOverride`).
- Optional per-user policies (when present on a tenant policy) can narrow the mode further but cannot escalate beyond tenant-level `allowOffMode`; per-call overrides follow the same constraint and will not downgrade below tenant defaults.
- `EgressGuardContext` carries the requested mode and the resolved `effectiveMode` along with tenant/user IDs; `EgressClient` falls back to its configured default when it is absent.
- In `enforce`, execution uses the sanitised payload. In `report-only`, execution uses the original payload while surfacing sanitisation deltas in metadata. `off` disables sanitisation but still enforces provider allowlisting and is only for explicitly configured test/benchmark wiring.

**Consequences:**

- Production wiring and default SaaS tenants continue to run in `enforce`; opt-in `report-only` or `off` require explicit tenant policy.
- Coding agents must assume all outbound provider calls flow through `LlmRouter` + `EgressClient`, with per-call effective mode resolution rather than ad-hoc bypasses.

---

### D-043 – Supabase-backed authentication with seeded demo credentials

**Context:**

- The demo Next.js shell now relies on **NextAuth credentials** wired to Supabase.
- Previous hardcoded demo headers risked regression when authentication was not configured or when database ID sequences advanced.

**Decision:**

- Keep the demo login flow anchored to Supabase via NextAuth using a seeded email/password account.
- The seed script must generate IDs for the demo tenant/user/identity (respecting UUID defaults) and emit them so `.env.local` can be populated without overriding database sequences.
- Documentation and environment examples should instruct developers to read the seeded IDs from Supabase after `supabase db reset` rather than relying on fixed constants.

**Consequences:**

- Local authentication remains reproducible without polluting UUID/sequence generators.
- Future changes to the demo shell or seed data must preserve the NextAuth + Supabase contract and keep documentation updated to prevent regression to unauthenticated or hardcoded flows.

---

### D-044 – Type-safe SSE event contracts for real-time streams

**Context:**

- The conversation list and individual conversation streams use Server-Sent Events (SSE) to push real-time updates to connected clients.
- Previously, event type strings (e.g. `'updated'`, `'upsert'`) and payload structures were defined separately in server and client code.
- This led to a production bug where the client listened for `'updated'` events while the server broadcast `'upsert'` events, causing UI updates to fail despite events being received.
- The mismatch was only discoverable at runtime, not during type-checking or build.

**Decision:**

- **All SSE event types and their payload structures must be defined as shared TypeScript types** in the `@reg-copilot/reg-intel-conversations` package.
- A central `ConversationListEventPayloadMap` type maps each event name to its exact payload structure.
- Both server-side broadcasters and client-side listeners must reference these shared types when sending or receiving events.
- Event payloads must be explicitly typed using the mapped type (e.g. `ConversationListEventPayloadMap['upsert']`) rather than inline object literals.

**Implementation:**

```typescript
// Shared package: packages/reg-intel-conversations/src/sseTypes.ts
export interface ConversationListUpsertPayload {
  conversation: ClientConversation
}

export type ConversationListEventPayloadMap = {
  snapshot: ConversationListSnapshotPayload
  upsert: ConversationListUpsertPayload
  deleted: ConversationListDeletedPayload
  // ... other events
}

// Server: apps/demo-web/src/app/api/conversations/[id]/route.ts
const payload: ConversationListEventPayloadMap['upsert'] = {
  conversation: toClientConversation(updatedConversation),
}
conversationListEventHub.broadcast(tenantId, 'upsert', payload)

// Client: apps/demo-web/src/app/page.tsx
import type { ConversationListEventPayloadMap } from '@reg-copilot/reg-intel-conversations'

const data = parsedData as unknown as ConversationListEventPayloadMap['upsert']
if (data.conversation) {
  // TypeScript knows the exact shape of data.conversation
}
```

**Rationale:**

- **Compile-time safety:** TypeScript catches event type and payload structure mismatches during build, not at runtime.
- **Single source of truth:** Event contracts are defined once in a shared package, preventing drift between client and server.
- **Self-documenting:** The type definitions serve as authoritative documentation for the SSE API.
- **Prevents regressions:** Future changes to event structures require updating the shared types, which forces updates to both producers and consumers.
- **Discoverable:** Developers can use IDE autocomplete to discover valid event types and their exact payload shapes.

**Consequences:**

- All new SSE streams must follow this pattern: define event types and payloads in a shared package before implementation.
- Existing SSE streams should be migrated to use shared types to prevent similar issues.
- The `eventHub.ts` event type unions (e.g. `ConversationListEventType`) remain as runtime enums, while `sseTypes.ts` provides compile-time payload contracts.
- Coding agents and developers must import and use `ConversationListEventPayloadMap` (or equivalent for other streams) when working with SSE events.

---

## 8. Summary of Changes in v0.6

### Added

- ✅ **Single main-chat task with SKOS-style concept capture** (`capture_concepts` tool).
- ✅ **Router-centric LLM egress** – all providers flow through `LlmRouter` + `EgressClient` with requested/effective mode and tenant/user IDs recorded per call.
- ✅ **Extended streaming contract** for `LlmProvider` (`text` + `tool` chunks).
- ✅ **Self-population pipeline** from concept metadata → Memgraph via `GraphWriteService`.
- ✅ **Auto-ingestion gating** to avoid graph bloat; ingestion only when concepts are missing or sparse.
- ✅ **Backend-owned `ConversationContext`** (Supabase) with an explicit `ConversationContextStore` contract.
- ✅ **Formal semantics for `referencedNodes`** as evidence node IDs.
- ✅ **Conversation-context prompt aspect** to surface active concepts to the LLM.
- ✅ **Clarified data separation**: Supabase (conversations, context) vs Memgraph (rules-only).
- ✅ **Adopted graph change detection enhancements** (timestamps + batching) as defaults.
- ✅ **Positioned Scenario Engine & expert collections** as optional but first-class extensions.
- ✅ **Type-safe SSE event contracts** – shared TypeScript types for all real-time event streams to prevent client-server mismatches.

### Unchanged from v0.4 / v0.5 (still authoritative)

- ✅ Core **Compliance Engine** and agent orchestration model.
- ✅ **Graph Ingress/Egress Guards** and privacy boundary.
- ✅ **Graph schema** for rules, benefits, timelines, and special jurisdictions.
- ✅ **Timeline Engine** responsibilities.
- ✅ **UI stack** (Tailwind v4, Radix, shadcn/ui, chat components) and best practices.

---

This v0.6 decisions document is now the **primary reference** for:

- How concept capture and self-population work.
- How conversation context is stored and used.
- How evidence (`referencedNodes`) is surfaced to the UI.
- How graph change detection is optimised.

Earlier decision docs (v0.4, v0.5) should be read alongside this as the canonical history of the architecture.

