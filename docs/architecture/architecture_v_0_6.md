# Regulatory Intelligence Copilot – Architecture (v0.6)

> **Goal:** A chat‑first, graph‑backed regulatory research copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal/tax advice or leaking sensitive data.
>
> **Scope of v0.6:** Extends v0.4/v0.5 by:
> - Keeping the **Node 24 / Next 16 / React 19 / Tailwind v4** baseline.
> - Preserving the **shared Memgraph rules graph** and strict privacy boundaries.
> - Incorporating the **v0.5 UI architecture** (Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK v5 on the frontend only).
> - Making the backend architecture **self‑contained** (no longer defers to `architecture_v_0_4.md`).
> - Adding explicit support for **self‑populating graph concepts** from main chat (SKOS‑style concepts + tools).
> - Introducing **conversation context** and **referenced node tracking** as first‑class architectural concerns.
> - Recognising future **Scenario Engine** and **What‑If simulations** as supported extension points.
> - **NEW:** Implementing **conversation path branching and merging** for advanced exploration workflows with path-aware navigation.
> - **NEW:** Adding **AI-powered merge summarization** to consolidate branch findings back to the main conversation.
> - **NEW:** Introducing a **reusable UI component library** (`@reg-copilot/reg-intel-ui`) for conversation path management.

---

## 0. Normative References

This architecture sits on top of, and must remain consistent with, the following specs:

### Core Graph & Engine Specs

- `docs/specs/graph-schema/versions/graph_schema_v_0_4.md`
- `docs/specs/graph-schema/versions/graph_schema_changelog_v_0_4.md`
- `docs/specs/graph_algorithms_v_0_1.md`
- `docs/specs/timeline-engine/timeline_engine_v_0_2.md`
- `docs/specs/concept/versions/regulatory_graph_copilot_concept_v_0_4.md`
- `docs/specs/special_jurisdictions_modelling_v_0_1.md`
- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/specs/safety-guards/graph_ingress_guard_v_0_1.md`
- `docs/specs/safety-guards/egress_guard_v_0_3.md`

### New / Refined Specs Introduced by v0.6

- `docs/specs/conversation-context/concept_capture_from_main_chat_v_0_1.md`
  (SKOS‑inspired concept capture via LLM tools and self‑population of the rules graph.)
- `docs/specs/conversation-context/conversation_context_spec_v_0_1.md`
  (Conversation‑level context, active graph node IDs, and how they are persisted and applied.)
- `docs/specs/scenario_engine_v_0_1.md`
  (Initial design for a Scenario / What‑If Engine built on top of the rules graph + timeline.)
- `docs/architecture/conversation-branching-and-merging.md`
  (Conversation path branching, merging, and path-aware navigation architecture.)
- `docs/architecture/IMPLEMENTATION-PLAN.md`
  (Implementation tracking for conversation branching features.)

### Project‑Level Docs

- `docs/architecture_v_0_4.md` (historic, now superseded by this document as the canonical architecture summary)
- `docs/architecture/versions/architecture_v_0_5.md` (UI‑focused extension, now folded into v0.6)
- `docs/governance/decisions/decisions_v_0_5.md`
- `docs/governance/roadmap/roadmap_v_0_4.md`
- `docs/node_24_lts_rationale.md`
- `AGENTS.md` (agent landscape)
- `PROMPTS.md` (coding‑agent prompts and implementation guidance)

Where there is ambiguity, **specs and decision docs take precedence** over this document.

---

## 1. High‑Level Architecture

### 1.1 System Overview

The system consists of:

1. **Web app** (`apps/demo-web`)
   - Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, Radix UI.
   - Vercel AI SDK v5 used **only** in the UI layer to talk to backend LLM endpoints.
   - Primary UX:
     - Chat interface for regulatory questions.
     - Live regulatory graph view (Memgraph‑backed).

2. **Compliance Engine** (reusable packages)
   - Core logic in `packages/reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`.
   - Implements the regulatory copilot behaviour:
     - Agent selection and orchestration.
     - LLM routing and guardrails.
     - Graph queries and self‑population.
     - Timeline reasoning.
   - Designed to be reused by other Next.js/Supabase SaaS apps via a thin adapter.

3. **Shared Rules Graph (Memgraph)**
   - Memgraph Community + MAGE as a **single global regulatory knowledge graph**.
   - Stores public rules, relationships, timelines, jurisdictions, case law, guidance, and their interactions.
   - **Never stores tenant/user‑specific PII**; it is a shared, anonymous rules graph.

4. **LLM + Tooling Layer**
   - `LlmRouter` with pluggable providers (OpenAI Responses, Groq, local/OSS models).
   - Uses OpenAI Responses API (incl. GPT‑OSS models) as a primary reference implementation.
   - All outbound calls (LLM, MCP, HTTP) go through `EgressClient` and the **Egress Guard**.
   - Egress Guard supports `enforce` / `report-only` / `off` modes; production wiring uses **enforce** with optional report-only rollout in non-prod. Per-tenant/per-user preferences resolve to a requested and **effective** mode in `LlmRouter`, execution payloads remain sanitised in enforce/report-only, and provider allowlisting still runs in every mode (rejecting disallowed providers even when effective mode is `off`).
   - Main‑chat calls can emit **streamed text** for the UI and **structured tool output** for concept capture and other metadata.

5. **Graph Ingress & Ingestion**
   - `GraphClient` for read queries.
   - `GraphWriteService` for all writes, wrapped in **Graph Ingress Guard** aspects:
     - Schema validation.
     - Property whitelisting.
     - PII stripping.
   - Ingestion agents (e.g. MCP/E2B‑based) must upsert rules exclusively via `GraphWriteService`.

6. **Optional E2B + MCP Gateway**
   - E2B sandbox to run heavier or untrusted work.
   - MCP gateway used for:
     - Memgraph read‑only access.
     - External regulatory content (e.g. Revenue, TAC, EU regs) via HTTP.
   - All egress from sandboxes still flows through the **Egress Guard**.

   7. **Storage Layer (Host App)**
     - Supabase (or similar Postgres) provides multi‑tenant application storage:
       - Tenants, users, auth.
       - Conversations and messages.
       - Conversation‑level context (active node IDs, flags, scenario state).
       - Access envelopes for conversations that combine `share_audience` (private/tenant/public) and `tenant_access` (view/edit) with `authorization_model` + `authorization_spec` so Supabase RLS and external ReBAC engines (e.g., OpenFGA) can be swapped without reshaping the table later; when an external ReBAC engine is unavailable, the effective audience falls back to **private/owner-only**.
       - Demo shell authentication uses **NextAuth credentials** backed by Supabase; the seed script (`supabase/seed/demo_seed.sql`) provisions a Supabase auth user with generated IDs and emits them for `.env.local` to avoid regressions back to hardcoded demo headers.
     - May store references to graph node IDs, but the graph never stores tenant/user identifiers.
     - A ConversationStore + ConversationContextStore abstraction sits between the web app and the Compliance Engine:
       - Supabase/Postgres is the production target with read-only public views for safe exposure.
      - An in-memory fallback keeps dev-mode working without external services.
      - The shared package `@reg-copilot/reg-intel-conversations` owns the stores, share/authorisation envelope, and SSE event hub so other host shells (non-Next.js) can reuse the same logic without forking the adapter.
    - SSE streams are keyed per `(tenantId, conversationId)` so multiple authorised viewers can consume the same live answer; the baseline implementation assumes a single instance, with Redis/pub-sub recommended for horizontal fan-out.

### 1.2 Privacy & Data Boundaries (Summary)

From `data_privacy_and_architecture_boundaries_v_0_1.md`:

- **Memgraph (Rules Graph)**
  - Stores only *public regulatory knowledge*:
    - Jurisdictions, regions, treaties, regimes, rules, benefits, timelines, case law, guidance, and their relationships.
  - **MUST NOT** store:
    - User PII, tenant PII, personal financial data, individual scenarios, or uploaded file contents.

- **Supabase / App DB**
  - Multi‑tenant application data: accounts, subscriptions, settings, saved scenarios.
  - Stores **conversations and conversation context** (e.g. active graph node IDs).
  - May hold references to graph node IDs (e.g. `Rule:VAT_IE`), but there is no back‑reference from the graph to app‑level IDs.

- **E2B Sandboxes**
  - Transient execution environments for code and document processing.
  - User documents are processed here and deleted with the sandbox unless the user explicitly opts into persistent storage.

- **Egress Guard**
  - All outbound calls (LLM, MCP, HTTP) pass through `EgressClient` → egress aspect pipeline.
  - Responsible for:
    - PII / sensitive‑data stripping.
    - Enforcing provider / jurisdiction policies.
    - Optional AI‑based egress review in higher tiers.

---

## 2. Engine Packages & Boundaries

The engine is implemented as a set of reusable packages:

- `reg-intel-core`
  - `ComplianceEngine` (central orchestration entrypoint).
  - Agent registry and selection.
  - Conversation context handling.
  - Integration with timeline engine and scenario engine (where present).

- `reg-intel-graph`
  - `GraphClient` for Memgraph queries.
  - `GraphWriteService` for upserts.
  - `GraphIngressGuard` aspect pipeline for all writes.
  - `GraphChangeDetector` and patch streaming for graph UI.

- `reg-intel-llm`
  - `LlmRouter` and `LlmProvider` abstractions.
  - Provider implementations (OpenAI, Groq, local HTTP models).
  - `EgressClient` + egress aspects.
  - Streaming interface emitting both **text** and **tool** chunks.

- `reg-intel-prompts`
  - Prompt aspect system (jurisdiction, agent, persona, disclaimers, additional context).
  - Standardised system prompts and guardrails.

- `reg-intel-conversations`
  - `ConversationStore` and `ConversationContextStore` abstractions.
  - `ConversationPathStore` for path branching and merging.
  - SSE event types and payload definitions.
  - Share/authorisation envelope types.
  - In-memory and Supabase implementations.

- `reg-intel-ui`
  - Reusable React components for conversation path management.
  - `ConversationPathProvider` context and hooks.
  - `PathSelector`, `BranchDialog`, `MergeDialog`, `VersionNavigator` components.
  - Tailwind-compatible styling with CSS variables for theming.
  - Designed for consumption by any Next.js host application.

- `reg-intel-next-adapter`
  - Thin Next.js adapter for wiring routes to engine.
  - Path-aware chat handler integration.
  - SSE endpoint helpers.

The **demo web app** depends on these packages but does **not** contain core business logic. This makes it easy to embed the engine in other hosts (Next.js apps, CLI, future SaaS shells).

---

## 3. LLM Routing, Streaming & Concept Capture

### 3.1 LLM Routing & Providers

- The `LlmRouter` decides which provider/model to use based on:
  - Tenant configuration and policies.
  - Task type (main chat vs guard vs ingestion vs PII sanitizer).
- Providers implement a common streaming interface, conceptually:

```ts
interface LlmProviderStreamChunk {
  type: 'text' | 'tool' | 'error';
  delta?: string;            // for type === 'text'
  name?: string;             // for type === 'tool'
  argsJson?: unknown;        // for type === 'tool'
  error?: Error;             // for type === 'error'
}
```

- OpenAI Responses API is wrapped so that:
  - Text deltas become `type: 'text', delta` chunks.
  - Tool/structured output becomes `type: 'tool', name, argsJson` chunks.
  - Errors become `type: 'error', error` chunks.

### 3.2 Main‑Chat + SKOS‑Style Concept Capture

v0.6 makes **concept capture from main chat** a first‑class concern:

- Instead of a separate "entity extraction" task, main chat is responsible for both:
  - Answering the user’s question.
  - Emitting **SKOS‑inspired concept metadata** via a dedicated tool.

- A canonical tool (defined in `concept_capture_from_main_chat_v_0_1.md`) is
  available to the main chat model, e.g. `capture_concepts`:
  - Captures **domain**, **kind**, **jurisdiction**, **prefLabel**, **altLabels**, **definition**, **sourceUrls**.
  - Follows a SKOS‑like structure (prefLabel, altLabels, definition).

- The Compliance Engine:
  - Always registers the `capture_concepts` tool on main chat calls.
  - Uses prompt aspects to instruct the model:
    - "In addition to answering the user, call `capture_concepts` once with any tax/benefit/regulatory concepts you detect."

### 3.3 Streaming Behaviour

The streaming model in v0.6 is:

- **Text chunks (`type: 'text'`)**
  - Passed straight through to the `/api/chat` SSE stream.
  - UI renders them as they arrive (typing effect).

- **Tool chunks (`type: 'tool'`)**
  - Never forwarded to the UI.
  - Interpreted inside `ComplianceEngine`:
    - Tool `name` identifies `capture_concepts` or other tools.
    - `argsJson` contains structured payload (e.g. SKOS concepts) and is the primary source for parsing concept metadata.
  - Trigger self‑population, concept resolution, scenario updates, etc.

- **Error chunks (`type: 'error'`)**
  - Abort the stream and emit a safe error message to the UI.

- **Done chunks (`type: 'done'`)**
  - Router end-of-stream marker; Compliance Engine uses this to emit its own final `done` chunk with merged referenced nodes, disclaimer, and follow-ups.

This ensures:

- Streaming UX is preserved.
- Metadata (concepts, references, scenarios) flows through a **server‑side side channel**, not in the user‑visible text.

---

## 4. Self‑Populating Rules Graph (Concept Pipeline)

v0.6 formalises the **self‑populating graph** pattern:

1. **User asks a question** (e.g. "What is the VAT rate in Ireland?").
2. The main chat model:
   - Streams back an answer.
   - Calls `capture_concepts` with SKOS‑like concept payloads, e.g. `VAT_IE`, `VRT_IE`, `IMPORT_VEHICLE_TO_IE`.
3. `ComplianceEngine` receives `capture_concepts` tool output and calls a **Canonical Concept Resolver** in `reg-intel-graph`:

   - Normalises labels and jurisdiction.
   - Checks Memgraph via `GraphClient` for an existing concept node matching `(domain, kind, jurisdiction)`.
   - If exists:
     - Returns its node ID.
     - Optionally enriches altLabels or source references via `GraphWriteService`.
   - If not exists:
     - Creates a new concept node via `GraphWriteService` + `GraphIngressGuard`.
     - Assigns a stable canonical ID (e.g. `tax:ie:vat`).

4. After resolution, `ComplianceEngine` decides whether to trigger **auto‑ingestion**:

   - If the graph already contains rich detail for this concept (rates, timelines, links to legislation), no ingestion is needed.
   - If the concept is missing or sparse:
     - Enqueues an ingestion job (MCP/E2B‑based) that fetches primary sources (e.g. Revenue manuals, TAC decisions) and upserts rule/timeline nodes via `GraphWriteService`.

5. `GraphChangeDetector` watches Memgraph and emits **patches** over the graph streaming endpoint:

   - Graph UI updates with newly created or enriched nodes/edges.
   - Chat UI can show updated referenced nodes or evidence lists.

This pipeline supports the desired behaviour where:

- Each Q&A gradually **enriches** the global rules graph.
- Future questions about VAT, VRT, or imports benefit from the pre‑populated graph rather than ad‑hoc web search alone.

---

## 5. Conversation Context & Referenced Nodes

### 5.1 Chat Response Shape (Conceptual)

The architecture assumes a `ChatResponse` shape similar to:

```ts
interface ChatResponse {
  answer: string;                 // Final answer text (can be streamed)
  referencedNodes: string[];      // Memgraph node IDs used as evidence
  jurisdictions: string[];        // Jurisdictions considered in this answer
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;          // Which stock disclaimer to show
}
```

- `referencedNodes` is now explicitly populated via the concept pipeline and graph queries:
  - Includes IDs of rules/benefits/sections/concepts (e.g. `Rule:VAT_IE`, `Rule:VRT_IE`).
  - Intended for **UI evidence chips** and for syncing with the graph view.
- When streamed over SSE, the non‑advice disclaimer is emitted as its own `disclaimer` event (in addition to `message`,
  `metadata`, and `done`) so UIs can render it consistently without polluting the token stream; the underlying aspect still
  guarantees its presence unless explicitly disabled.

### 5.2 Conversation Context (Backend‑Owned)

v0.6 introduces a backend‑owned **Conversation Context**, defined in `conversation_context_spec_v_0_1.md`:

```ts
interface ConversationContext {
  activeNodeIds: string[];   // Graph node IDs currently in play for this conversation
  // Future: activeScenarios, flags, selected jurisdictions, etc.
}
```

- `ConversationContext` is **not** stored in Memgraph.
- It is persisted in Supabase or an equivalent app DB, keyed by `(tenantId, conversationId)`.

Flow per chat turn:

1. `/api/chat` receives a request for `(tenantId, userId, conversationId)`.
2. `ComplianceEngine` loads `ConversationContext` from a `ConversationContextStore` abstraction.
3. A **prompt aspect** (e.g. `conversationContextAspect`) resolves `activeNodeIds` to short summaries via `GraphClient` and injects them into the system prompt, so the model knows which concepts are already in play.
4. During the LLM call, concept tools and graph queries may identify additional relevant nodes.
5. At the end of the turn, `ComplianceEngine`:
   - Builds `referencedNodes` from resolved concept IDs and other graph lookups.
   - Updates `ConversationContext.activeNodeIds` (union + pruning if needed).
   - Persists the updated context via `ConversationContextStore`.
6. `ChatResponse` is sent back to the UI (streamed answer + final metadata). The frontend remains **dumb** and does not need to round‑trip context explicitly.

This design ensures:

- The engine, not the UI, owns conversation memory.
- Graph concepts recognised in previous turns are automatically available to later turns.
- Multiple UIs can reuse the same engine without bespoke context wiring.

---

## 6. Conversation Paths, Branching & Merging

v0.6 introduces a comprehensive **conversation path system** that enables users to branch conversations for exploratory research, navigate through conversation history with full path awareness, and merge findings back to the main conversation.

### 6.1 Core Concepts

**Conversation Paths** represent distinct exploration threads within a single conversation:

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Path                                                       │
│  ─────────●────●────●────●                                      │
│                │    ╰─●──●──● (Edit creates implicit path)       │
│                ╰─●──●  (Branch: "PRSI Analysis")                 │
│                   ╰─●──●──● (Nested branch: "Cross-border")      │
└─────────────────────────────────────────────────────────────────┘
```

- **Primary Path**: Every conversation has exactly one primary path (the "main" thread).
- **Branch Paths**: Created from any message point for independent exploration.
- **Path Hierarchy**: Branches can have sub-branches, forming a tree structure.
- **Path Resolution**: Messages are resolved by walking the path chain from root to current path.

### 6.2 Data Model

The path system is implemented via a dedicated `conversation_paths` table and path-aware message columns:

```sql
-- Conversation paths table
CREATE TABLE conversation_paths (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,

    -- Lineage
    parent_path_id uuid REFERENCES conversation_paths(id),
    branch_point_message_id uuid REFERENCES conversation_messages(id),

    -- Metadata
    name text,                    -- Optional branch name
    is_primary boolean NOT NULL,  -- Exactly one per conversation
    is_active boolean NOT NULL,   -- Currently visible/active

    -- Merge tracking
    merged_to_path_id uuid,
    merged_at timestamptz,
    merge_summary_message_id uuid,

    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

-- Messages are path-aware
ALTER TABLE conversation_messages ADD COLUMN
    path_id uuid NOT NULL REFERENCES conversation_paths(id),
    sequence_in_path integer NOT NULL,
    is_branch_point boolean NOT NULL DEFAULT false,
    branched_to_paths uuid[] DEFAULT '{}';
```

### 6.3 Path Resolution Algorithm

When viewing messages for a path, the system resolves the complete message list by walking the path hierarchy:

```typescript
async function resolvePathMessages(pathId: string): Promise<Message[]> {
  const path = await getPath(pathId);

  if (!path.parentPathId) {
    // Root path - return all messages for this path
    return getMessagesForPath(pathId);
  }

  // Child path - compose from parent
  const parentMessages = await resolvePathMessages(path.parentPathId);

  // Find branch point in parent messages
  const branchPointIndex = parentMessages.findIndex(
    m => m.id === path.branchPointMessageId
  );

  // Take parent messages up to and including branch point
  const inherited = parentMessages.slice(0, branchPointIndex + 1);

  // Get this path's own messages
  const own = await getMessagesForPath(pathId);

  return [...inherited, ...own];
}
```

This ensures:
- Path-aware navigation shows the correct conversation history at any point.
- Branches inherit context from their parent path.
- Users see a coherent conversation regardless of which path they're viewing.

### 6.4 Branching Operations

Users can create branches from any message in a conversation:

1. **Branch Creation**: Creates a new `conversation_path` record with:
   - `parent_path_id` pointing to the source path.
   - `branch_point_message_id` pointing to the branching message.
   - Optional `name` for identification.

2. **Branch Navigation**: Users can switch between paths via path selector UI.

3. **Branch Lifecycle**: Paths can be:
   - **Active**: Visible and available for new messages.
   - **Archived**: Hidden but preserved (e.g., after merge).
   - **Deleted**: Soft-deleted with cascade to messages.

### 6.5 Merging Operations

Branches can be merged back to their parent (or any ancestor) path:

**Merge Modes**:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Summary** | AI generates a concise summary of branch findings | Default for most merges |
| **Full** | All branch messages appended to target | When full context needed |
| **Selective** | User selects specific messages to include | Fine-grained control |

**AI-Powered Merge Summarization**:

The system uses LLM to generate merge summaries via the `generateMergeSummary()` function:

```typescript
interface GenerateMergeSummaryInput {
  branchMessages: PathAwareMessage[];
  sourcePath: ConversationPath;
  targetPath: ConversationPath;
  customPrompt?: string;      // User-provided summarization guidance
  tenantId: string;
}

interface GenerateMergeSummaryResult {
  summary: string;
  aiGenerated: boolean;       // true if LLM was used
  error?: string;             // Populated on failure
}
```

The summarizer:
- Uses a regulatory-focused system prompt for consistent summaries.
- Captures key findings, regulatory references, and action items.
- Falls back gracefully when LLM is unavailable.
- Supports custom user prompts for guided summarization.

**Merge Result**:

After merge, a system message is created in the target path containing:
- Summary of branch findings (AI-generated or user-provided).
- Metadata tracking source path, message count, and merge timestamp.
- Branch is optionally archived post-merge.

### 6.6 API Endpoints

Path management is exposed via REST endpoints:

```
# Path Management
GET    /api/conversations/:id/paths                    # List all paths
POST   /api/conversations/:id/paths                    # Create new path
GET    /api/conversations/:id/paths/:pathId            # Get path details
PATCH  /api/conversations/:id/paths/:pathId            # Update path
DELETE /api/conversations/:id/paths/:pathId            # Delete/archive path

# Path Messages
GET    /api/conversations/:id/paths/:pathId/messages   # Get resolved messages

# Branching
POST   /api/conversations/:id/branch                   # Create branch
       Body: { sourceMessageId, branchName? }

# Merging
POST   /api/conversations/:id/paths/:pathId/merge/preview  # Preview merge
       Body: { targetPathId, mergeMode, summaryPrompt? }
POST   /api/conversations/:id/paths/:pathId/merge          # Execute merge
       Body: { targetPathId, mergeMode, summaryContent?, archiveSource? }

# Active Path
GET    /api/conversations/:id/active-path              # Get active path
PUT    /api/conversations/:id/active-path              # Set active path
```

### 6.7 SSE Events

Real-time path updates are delivered via SSE:

```typescript
type PathEventType =
  | 'path:created'     // New branch created
  | 'path:updated'     // Path metadata changed
  | 'path:deleted'     // Path deleted/archived
  | 'path:merged'      // Path merged to another
  | 'path:active';     // Active path changed

interface PathEventPayloadMap {
  'path:created': { path: ConversationPath; branchPointMessage?: PathAwareMessage };
  'path:updated': { pathId: string; conversationId: string; changes: Partial<ConversationPath> };
  'path:deleted': { pathId: string; conversationId: string; reason: 'deleted' | 'archived' };
  'path:merged': { sourcePathId: string; targetPathId: string; conversationId: string; summaryMessageId?: string; mergeMode: MergeMode };
  'path:active': { pathId: string; conversationId: string; previousPathId?: string };
}
```

### 6.8 Reusable UI Component Library

The `@reg-copilot/reg-intel-ui` package provides reusable components for path management:

**Components**:
- `ConversationPathProvider`: React context for path state management.
- `PathSelector`: Dropdown for switching between paths.
- `BranchButton` / `BranchDialog`: UI for creating branches.
- `MergeDialog` / `MergePreview`: UI for merge configuration and preview.
- `VersionNavigator`: Navigation through message version history.

**Hooks**:
- `useConversationPaths()`: Main hook for path state and actions.
- `usePathResolution()`: Resolve messages for a given path.
- `useBranching()`: Branch creation logic.
- `useMerging()`: Merge operations and preview.

The library is designed to be consumed by any Next.js application via:
```json
{
  "dependencies": {
    "@reg-copilot/reg-intel-ui": "workspace:*"
  }
}
```

### 6.9 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Path-based versioning over `supersededBy` | Explicit paths provide clearer navigation and merge semantics |
| AI summarization as default merge mode | Prevents conversation bloat while preserving insights |
| Graceful LLM fallback | Ensures merge works even without LLM availability |
| Reusable UI package | Enables adoption by other host applications |
| SSE for real-time updates | Consistent with existing conversation streaming |

---

## 7. Graph Layer & Streaming

### 7.1 Graph Client & Writes

- `GraphClient` encapsulates Memgraph connections and Cypher queries.
- `GraphWriteService` is the **only** path for writes to Memgraph:
  - Enforces schema through the `GraphIngressGuard` aspect pipeline.
  - Rejects any write that attempts to introduce PII or unapproved properties.
  - Provides higher‑level upsert operations (e.g. `upsertConcept`, `upsertRule`, `upsertTimelineConstraint`).

### 7.2 GraphChangeDetector & Streaming

- `GraphChangeDetector` monitors Memgraph for changes relevant to the current tenant’s view of the rules graph.
- When changes occur (e.g. ingestion creates new nodes/edges):
  - It computes a **patch** (nodes/edges added, removed, or updated).
  - Streams patches over a dedicated endpoint (e.g. `/api/graph/stream`) to subscribed clients.
- The graph UI renders patches incrementally instead of reloading the full graph.

---

## 8. Timeline Engine & Scenario Engine

### 8.1 Timeline Engine (Unchanged in Scope)

- The **Timeline Engine** (`docs/specs/timeline-engine/timeline_engine_v_0_2.md`) consumes time‑based graph edges such as `:LOOKBACK_WINDOW` and `:LOCKS_IN_FOR_PERIOD`.
- Given a scenario (sequence of events + dates), it can answer:
  - Whether a rule applies at a given date.
  - When lock‑in periods expire.
  - How lookbacks affect eligibility.
- `ComplianceEngine` integrates it for timing‑sensitive questions (CGT wash rules, PRSI contribution windows, etc.).

### 8.2 Scenario Engine (Future but Supported)

v0.6 recognises a future **Scenario Engine** (`scenario_engine_v_0_1.md`) as a first‑class extension point:

- Models structured "what‑if" scenarios (e.g. importing a car from Japan, changing residency, altering income).
- Uses:
  - Memgraph rules graph for structure and eligibility rules.
  - Timeline Engine for time‑based reasoning.
  - Conversation Context for linking scenarios to ongoing chat.
- The architecture provides hooks for:
  - Scenario definitions and IDs in ConversationContext.
  - Dedicated scenario‑oriented agents that can run simulations and report deltas.

No concrete implementation is mandated by v0.6, but the architecture is explicitly designed to support it without refactoring core layers.

---

## 9. Agents & Prompt Aspects

### 9.1 Engine‑First Agent Design

- `ComplianceEngine` hosts a registry of **specialist agents** and a **Global Regulatory Agent**.
- Agents are configured via:
  - Prompt aspects (jurisdiction, persona/profile, agent role, disclaimers, conversation context).
  - Tool selections (graph queries, timeline engine, concept capture, MCP fetchers).

### 9.2 Prompt Aspect System

- Prompt aspects compose into a single system prompt for each LLM call.
- Key aspects include:
  - **Jurisdiction aspect:** which jurisdictions are in scope.
  - **Agent aspect:** describes the agent’s role and domain.
  - **Persona/profile aspect:** user profile and constraints.
  - **Disclaimer aspect:** non‑advice framing.
  - **Conversation context aspect:** summarises active graph nodes and scenarios.
  - **Additional context aspect:** for ad‑hoc context (feature flags, environment markers).

This keeps prompts consistent, auditable, and easily extended.

---

## 10. UI Architecture (Incorporating v0.5)

v0.6 fully incorporates the UI architecture additions from v0.5.

### 10.1 Frontend Stack

- Next.js 16 (App Router, Turbopack).
- React 19.
- TypeScript 5.9+.
- Tailwind CSS v4 with PostCSS 8 (`@tailwindcss/postcss` plugin).
- shadcn/ui components (copy‑into‑repo model).
- Radix UI primitives for accessible foundations.
- lucide‑react for icons.
- Vercel AI SDK v5 (`ai`, `@ai-sdk/react`) for streaming chat UX on the frontend.
- class‑variance‑authority, `clsx`, and `tailwind-merge` for composable, type‑safe styling.

### 10.2 Chat & Graph Views

- `apps/demo-web/src/app/page.tsx`
  - Main chat interface.
  - Uses AI Elements‑inspired components for conversations (message bubbles, loading states, prompt input).
  - Subscribes to the `/api/chat` SSE endpoint for streamed answers.

- `apps/demo-web/src/app/graph/page.tsx`
  - Graph visualisation view.
  - Renders nodes/edges using ForceGraph (or similar) based on graph patches.

### 10.3 API Routes

- `/api/chat`
  - Thin adapter onto `ComplianceEngine.handleChat`.
  - Streams `text` chunks as SSE events.
  - Emits `disclaimer` SSE events for safety messaging so downstream clients can render them separately from streamed text.
  - Emits a final metadata event with `referencedNodes`, `jurisdictions`, `uncertaintyLevel`, `disclaimerKey`.

- `/api/conversations/stream` (tenant-scoped SSE feed)
  - Streams conversation list changes (create/share/rename/archive) so the UI stays in sync across tabs/devices without manual refreshes.
  - Each event carries identifiers, titles, and the share/authorisation envelope so clients can merge updates into cached lists without re-fetching full histories.
  - Built on the same conversation event hub used for per-conversation SSE streams; production instances should fan out via Redis/pub-sub when horizontally scaled.

- `/api/graph/*`
  - Read‑only routes for fetching initial graph snapshots and streaming patches.

The UI is deliberately **thin and dumb**: it does not implement business logic, graph reasoning, or conversation context management.

---

## 11. Technology Stack Summary

- **Runtime:** Node.js 24 LTS.
- **Frontend:** Next.js 16, React 19, Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK v5.
- **Backend engine:** TypeScript packages (`reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`).
- **Graph:** Memgraph Community + MAGE.
- **Storage:** Supabase/Postgres for multi‑tenant app data and conversation context.
- **Sandboxing & tools:** E2B + MCP gateway (optional but supported).

---

## 12. Non‑Goals (v0.6)

To keep scope sane, v0.6 explicitly does **not** attempt to:

- Implement Memgraph‑level multi‑tenant isolation (single shared rules graph remains the model).
- Provide legal/tax/welfare advice; the system stays a **research and explanation tool**.
- Fully implement the Scenario Engine or advanced What‑If UI flows (they remain roadmap items).
- Optimise for ultra‑low latency at the expense of clarity or safety.

---

## 13. Summary of Changes in v0.6

### Added

- ✅ Self‑contained backend architecture description (no longer defers to v0.4).
- ✅ Streaming model that separates **text** vs **tool** chunks in `LlmProvider`.
- ✅ Main‑chat **SKOS‑style concept capture** tool and self‑populating graph pipeline.
- ✅ Backend‑owned **Conversation Context** and `referencedNodes` semantics.
- ✅ Hooks for future **Scenario Engine** and What‑If scenarios.
- ✅ Explicit alignment with `concept_capture_from_main_chat_v_0_1.md`, `conversation_context_spec_v_0_1.md`, and `scenario_engine_v_0_1.md`.
- ✅ **Conversation path branching and merging** system with:
  - `conversation_paths` database table and path-aware message columns.
  - `ConversationPathStore` interface with branching/merging operations.
  - Path resolution algorithm for composing messages from path hierarchy.
  - REST API endpoints for path CRUD, branching, and merging.
  - SSE events for real-time path updates (`path:created`, `path:updated`, `path:merged`, etc.).
- ✅ **AI-powered merge summarization** via `generateMergeSummary()`:
  - Regulatory-focused summarization prompts.
  - Support for custom user-provided summarization guidance.
  - Graceful fallback when LLM is unavailable.
- ✅ **Reusable UI component library** (`@reg-copilot/reg-intel-ui`):
  - `ConversationPathProvider` for path state management.
  - `PathSelector`, `BranchDialog`, `MergeDialog` components.
  - `useConversationPaths()` and related hooks.
  - Tailwind-compatible styling with light/dark mode support.

### Deprecated / Removed

- ❌ **`supersededBy` field for message versioning** - FULLY REMOVED Dec 2024 (replaced by path-based versioning).
  - Removed from ConversationMessage interface
  - Removed from all store implementations
  - Removed from softDeleteMessage method signature
  - System now uses 100% path-based versioning
- ❌ `softDeleteMessage()` supersededBy parameter - REMOVED Dec 2024 (no longer needed with path-based branching).
- ❌ `PathEventPayloads` interface (replaced by `PathEventPayloadMap` in sseTypes.ts).
- ❌ `AuditorError` and `isAuditorError` aliases (use `ComplianceError` and `isComplianceError`).

### Carried Forward (Unchanged in Spirit)

- ✅ Node 24 LTS baseline and TS/Next/React/Tailwind versions.
- ✅ Memgraph as a shared, PII‑free rules graph.
- ✅ Egress Guard and Graph Ingress Guard invariants.
- ✅ LlmRouter and provider‑agnostic LLM routing.
- ✅ Timeline Engine and special jurisdictions modelling.
- ✅ UI architecture from v0.5 (Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK).

v0.6 is now the **canonical architecture document** for the Regulatory Intelligence Copilot and should be treated as the primary reference for future work on the engine, UI, and roadmap.

