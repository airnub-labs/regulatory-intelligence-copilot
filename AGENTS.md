# AGENTS – Regulatory Intelligence Copilot (v0.6)

> **Status:** Current  
> **Supersedes:** `AGENTS.md` (v0.4)  
> **Aligned with:**  
> - `docs/architecture/architecture_v_0_6.md`
> - `docs/specs/concept/regulatory_graph_copilot_concept_v_0_6.md`  
> - `docs/specs/graph-schema/graph_schema_v_0_6.md`  
> - `docs/specs/graph-schema/graph_schema_changelog_v_0_6.md`  
> - `docs/specs/graph_algorithms_v_0_1.md`  
> - `docs/specs/timeline-engine/timeline_engine_v_0_2.md`  
> - `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`  
> - `docs/specs/safety-guards/graph_ingress_guard_v_0_1.md`  
> - `docs/specs/safety-guards/egress_guard_v_0_3.md`
> - `docs/specs/conversation-context/concept_capture_from_main_chat_v_0_1.md`  
> - `docs/specs/conversation-context/conversation_context_spec_v_0_1.md`  
> - `docs/specs/scenario_engine_v_0_1.md`  
> - `docs/governance/decisions/decisions_v_0_6.md`
> - `docs/governance/roadmap/roadmap_v_0_6.md`

> **Purpose:** Define the *logical agents* in the Regulatory Intelligence Copilot and how they should behave under the v0.6 architecture. Implementation details (files, classes, wiring) must follow this specification.

v0.6 updates the v0.4 agent design by:

- Integrating the **concept capture from main chat** pipeline (SKOS‑like concepts via LLM tools) so the rules graph can self‑populate from normal conversations.
- Introducing a **server‑side Conversation Context** (per conversation, per tenant) that tracks which rule graph nodes are “active” and feeds that back into prompts via aspects.
- Clarifying how agents should set `referencedNodes` and how that connects to concept capture, graph enrichment, and the scenario engine.
- Making room for **scenario/what‑if agents** and **discovery/onboarding flows** without changing the core agent interface.

---

## 1. Agent Architecture Overview

**Repository rules:**

- Fix TypeScript and lint errors instead of masking them with `typescript.ignoreBuildErrors` (or similar) in `next.config.js`.
- When addressing TypeScript type errors, do not "fix" them by changing types to `any` unless a design decision explicitly requires `any`.
- Never use `// eslint-disable-next-line` or similar comments to suppress linting errors or warnings. Instead, refactor the code to address the underlying design or architecture issue causing the warning. If a pattern genuinely requires deviation from lint rules, it indicates a need to reconsider the design, improve type safety, or update the lint configuration appropriately.

**Package organization and open-source readiness:**

This repository is designed for eventual open-source release. All reusable code MUST be placed in appropriate packages, not in application-specific directories:

- **Reusable UI components** → `packages/reg-intel-ui/src/components/`
- **Reusable utilities and helpers** → `packages/reg-intel-ui/src/utils/`
- **Domain logic and business rules** → `packages/reg-intel-core/`
- **Graph operations** → `packages/reg-intel-graph/`
- **LLM integrations** → `packages/reg-intel-llm/`
- **Conversation path management** → `packages/reg-intel-conversations/`

**Guidelines for package placement:**

1. **Demo-web is NOT reusable** - `apps/demo-web/` should contain ONLY application-specific code:
   - Page components and layouts specific to the demo app
   - Demo-specific configuration and wiring
   - App-specific API routes that aren't generalizable

2. **Move utilities to packages** - When creating utilities that could be used by other applications:
   - ✅ **CORRECT**: Place in `packages/reg-intel-ui/src/utils/` and export from package
   - ❌ **INCORRECT**: Place in `apps/demo-web/src/lib/utils/`
   - Example: `scrollToMessage()` utilities are in `packages/reg-intel-ui/src/utils/scroll-to-message.ts`

3. **Package exports** - All reusable code must be properly exported:
   - Add exports to package `index.ts` with proper TypeScript types
   - Include JSDoc documentation with `@module` and `@packageDocumentation` tags
   - Provide usage examples in documentation

4. **Import from packages** - Applications should import from packages, not local utilities:
   - ✅ **CORRECT**: `import { scrollToMessage } from '@reg-copilot/reg-intel-ui'`
   - ❌ **INCORRECT**: `import { scrollToMessage } from '@/lib/utils'`

5. **Testing in packages** - Tests for package code must be in the package:
   - ✅ **CORRECT**: `packages/reg-intel-ui/src/utils/__tests__/scroll-to-message.test.ts`
   - ❌ **INCORRECT**: `apps/demo-web/src/lib/utils/__tests__/scroll-to-message.test.ts`

**Enforcement:**

- **CRITICAL:** Never regress by moving package code back into `apps/demo-web/`
- During code reviews, verify utilities are in appropriate packages
- When creating new utilities, always consider: "Could another app use this?"
- If yes → Package. If no → Verify it's truly app-specific before placing in `apps/`

**Required quality checks before pushing commits:**

After making any code changes, you MUST run the following commands and fix all issues before pushing:

1. **`pnpm lint`** – Run the linter to identify and fix all linting errors and warnings.
2. **`pnpm build`** – Run the build to catch TypeScript errors, type mismatches, and build failures.
3. **`pnpm dev`** – Start the development server to verify the application runs correctly without runtime errors.

All issues identified by these commands must be resolved before committing and pushing changes. Do not push code that fails any of these checks. If errors are found, fix them iteratively and re-run the checks until all pass successfully.

**Environment configuration:**

- This repository uses **separate `.env` files** for different purposes:
  - **Root `.env`** - For repository scripts (graph seeding, migrations). See `.env.example`.
  - **`apps/demo-web/.env.local`** - For the Next.js web application. See `apps/demo-web/.env.local.example`.
- Complete setup guide: [`ENV_SETUP.md`](./ENV_SETUP.md)
- Never mix or combine these files. Each has a specific scope and required variables.
- When adding new environment variables, update the appropriate `.env.example` file with documentation.

**Logging and observability:**

- All logging uses **Pino** via `@reg-copilot/reg-intel-observability`.
- **CRITICAL:** Pino logger API signature is `logger.info(object, message)` - object FIRST, message SECOND.
  ```typescript
  // CORRECT
  logger.info({ userId, tenantId }, 'User logged in');

  // INCORRECT - DO NOT USE
  logger.info('User logged in', { userId, tenantId });
  ```
- The same applies to all log levels: `debug()`, `info()`, `warn()`, `error()`.
- Never regress to incorrect argument order - this breaks structured logging.
- Use `logger.child()` to create contextual loggers with persistent fields.
- OpenTelemetry configuration is optional but available via environment variables (see `ENV_SETUP.md`).
- Observability exports are configured in `packages/reg-intel-observability` - do not create ad-hoc logging implementations.

**Client telemetry (browser → server):**

- **CRITICAL:** Client telemetry uses a production-ready batching and scalability architecture - **never regress these features**.
- All client-side telemetry **MUST** use the batching queue in `apps/demo-web/src/lib/clientTelemetry.ts`:
  - Events are automatically batched (default: 20 events or 2 seconds, whichever comes first).
  - Page unload and visibility change handlers ensure reliable event delivery.
  - `navigator.sendBeacon()` is used for non-blocking transmission with `fetch()` fallback.
  - Configuration via environment variables (`NEXT_PUBLIC_CLIENT_TELEMETRY_*`).
- **DO NOT** regress to sending individual events per `fetch()` call - this creates excessive HTTP requests.
- The server endpoint (`/api/client-telemetry`) **MUST** maintain:
  - Support for both single events (legacy) and batched events (new format).
  - IP-based rate limiting (configurable via `CLIENT_TELEMETRY_RATE_LIMIT_*` env vars).
  - Optional OpenTelemetry Collector forwarding via `OTEL_COLLECTOR_ENDPOINT`.
  - Non-blocking async forwarding (OTEL forwarding must not block the response).
- Full documentation: `docs/client-telemetry/README.md` and `docs/client-telemetry/QUICKSTART.md`.
- **Testing requirement:** Any changes to client telemetry must verify:
  - Batching still works (events are grouped, not sent individually).
  - Rate limiting is functional (returns 429 when exceeded).
  - OTEL forwarding works when configured (check logs for forwarding success/failure).
  - Page unload events are captured (use `beforeunload` + `visibilitychange` handlers).

The system is **chat‑first**, **engine‑centric**, and **agent‑orchestrated**:

- A single **Global Regulatory Copilot Agent** is the *primary entry point* for user conversations.
- It delegates to **domain/jurisdiction expert agents** and, where relevant, **scenario/what‑if agents**, then reconciles their results.
- Agents are:
  - **Jurisdiction‑aware but jurisdiction‑neutral** by default (they accept one or more jurisdictions as context; code is not hard‑wired to Ireland only except where explicitly intended for a specialist lens).
  - Consumers of the **Memgraph Regulatory Rules Graph** (no writes) using `GraphClient` with `graph_schema_v_0_6.md`.
  - Users of the **Timeline Engine v0.2** for any time‑based logic.
  - Callers of LLMs through a **provider‑agnostic LLM router** (no direct calls to OpenAI/Groq/etc.).
  - Subject to **egress guard aspects** before anything leaves the platform.
  - Beneficiaries of an **implicit concept capture tool** and **Conversation Context** managed by the Compliance Engine – agents do not perform separate entity‑extraction calls.

Agents are identified by **stable agent IDs** (strings) used in prompts, routing, tenant policies, and logging.

### 1.1 Agent Interfaces (Logical)

All chat‑facing agents operate over a shared logical interface (TS types may differ but should follow this shape):

```ts
interface UserProfileContext {
  tenantId: string;
  persona: string;               // e.g. 'single-director', 'advisor', 'individual-investor'
  jurisdictions: string[];       // e.g. ['IE'], ['IE','EU'], ['MT','EU'], ['IE','UK','NI']
  locale?: string;               // e.g. 'en-IE'
}

interface AgentChatRequest {
  messages: ChatTurn[];          // conversation history
  profile: UserProfileContext;
  // ConversationContext is managed server-side by the Compliance Engine and
  // injected into prompts via aspects; it is *not* a required field here.
}

interface AgentChatResponse {
  answer: string;

  // Graph node IDs referenced in reasoning (rules, benefits, timelines, etc.).
  // These are used to:
  // - populate ChatResponse.referencedNodes,
  // - update per-conversation ConversationContext.activeNodeIds,
  // - drive graph highlighting/evidence in the UI.
  referencedNodes: string[];

  // Jurisdictions actually considered for this answer (may be narrower than
  // profile.jurisdictions if the agent focuses on a subset).
  jurisdictions: string[];

  // Coarse confidence signal for downstream UX and safety messaging.
  uncertaintyLevel: 'low' | 'medium' | 'high';

  // Key for standardised disclaimer text (e.g. 'research_only_tax',
  // 'research_only_welfare').
  disclaimerKey: string;

  // Which agent produced this answer.
  agentId: string;
}
```

All agents **MUST**:

- Use the **GraphClient** (read‑only) instead of hard‑coding rules.
- Use the **Timeline Engine** for time logic; never hard‑code statutory durations.
- Use the **prompt aspect system** to build system prompts.
- Call the **LLM router** with an appropriate `task` (e.g. `"main-chat"`) and rely on tenant/task policies to select model and provider.
- Respect **ingress/egress guardrails** and never introduce user PII into Memgraph or external calls.
- Populate `referencedNodes` with the Memgraph IDs of rules/benefits/sections/timelines actually used, so that:
  - `ChatResponse.referencedNodes` can be set accurately.
  - `ConversationContext.activeNodeIds` can be updated (see `conversation_context_spec_v_0_1.md`).
- Treat **concept capture** as an engine capability:
  - Agents do *not* call a separate entity‑extraction task.
  - The Compliance Engine attaches a `capture_concepts` tool (see `concept_capture_from_main_chat_v_0_1.md`) to main‑chat LLM calls and processes its output behind the scenes.

### 1.2 Non‑Chat / Utility Agents

Some agents are not directly exposed to the user but are part of the agent layer conceptually:

- **Graph ingestion agents** – orchestrate MCP calls + LLM extraction to turn source documents into graph upserts (always via `GraphWriteService` + Graph Ingress Guard).
- **Change detection / impact analysis agents** – reason over `:Update`/`:ChangeEvent` nodes and affected rules to summarise impacts.
- **Scenario/what‑if agents** – built on `scenario_engine_v_0_1.md`, they evaluate alternative paths and explain trade‑offs.
- **Egress guard helper agents** – small LLM/deterministic helpers that inspect outbound payloads (to LLMs/MCPs) for PII / risky content.

These follow the same safety and graph‑access rules but may have narrower interfaces (batch jobs, ingestion pipelines, etc.).

---

## 2. Global Regulatory Copilot Agent

**Agent ID (canonical):** `global_regulatory_copilot`  
**Role:** Primary orchestrator and generalist, chat entry point.

### 2.1 Scope

- First contact for *all* user questions.
- Works across domains:
  - Tax (income, corporation, CGT).  
  - Social welfare and benefits.  
  - Pensions.  
  - Company/director obligations.  
  - EU‑level rules affecting any of the above.  
  - Cross‑border interactions (e.g. IE–UK–NI–IM–MT–EU).
- Coordinates with **scenario/what‑if agents** for explicit “what if I do X vs Y?” questions (see `scenario_engine_v_0_1.md`).

### 2.2 Responsibilities

1. **Conversation orchestration**
   - Interpret the user’s question, persona/profile tags, and jurisdiction context.
   - Decide whether to:
     - Answer directly using **global graph queries** + Timeline Engine, or
     - Delegate to one or more **expert agents** and merge results, or
     - Invoke scenario/what‑if evaluation via the Scenario Engine.
   - Record which agents and rule clusters contributed to the answer.

2. **Graph‑first reasoning**
   - Use `GraphClient` to query the rules graph for:
     - Relevant statutes/sections, benefits, reliefs, guidance, case law, EU instruments, treaties, special regimes.
     - Conditions, timelines, mutual exclusions, cross‑jurisdiction links.
   - Pull a **local neighbourhood subgraph** relevant to the query based on persona and jurisdictions.
   - Optionally use graph algorithms (as per `graph_algorithms_v_0_1.md`) to:
     - Identify important nodes/communities in that neighbourhood.
     - Provide better retrieval and explanation hints to the LLM.
   - Ensure all nodes actually used in reasoning are included in `referencedNodes`.

3. **Timeline reasoning via Timeline Engine**
   - When a question involves dates or periods, call the Timeline Engine to:
     - Compute lookback windows.
     - Evaluate lock‑ins and cooling‑off periods.
     - Identify filing deadlines and effective windows.
   - Never hard‑code time rules; always derive them from `:Timeline` nodes in the graph.

4. **Jurisdiction neutrality + expert routing**
   - Treat the user’s jurisdictions as **context**, not as hard‑coded `if/else` logic.
   - Use prompt aspects (jurisdiction + persona) and Conversation Context (active node IDs) to frame the LLM’s view of the subgraph.
   - Where a specific expert exists (e.g. IE single‑director social safety net), call that expert agent with a well‑formed sub‑task.
   - For unsupported jurisdictions, remain helpful using EU principles, graph data, and clear limitations.

5. **Concept capture + Conversation Context integration**
   - Rely on the Compliance Engine to:
     - Attach the `capture_concepts` tool to the main‑chat LLM call.
     - Process tool output into SKOS‑like concept objects.
     - Resolve/upssert concepts in Memgraph and update `referencedNodes` / Conversation Context.
   - Ensure that answers are phrased in a way that makes it easy for the concept capture tool to recognise key regulatory concepts (clear names, jurisdictions, basic definitions).

6. **Safety, disclaimers, and tone**
   - Always set an appropriate `uncertaintyLevel` and `disclaimerKey`.
   - Clearly signal that responses are **research assistance**, not binding advice.
   - Highlight gaps, missing graph coverage, or ambiguous areas rather than guessing.

---

## 3. Domain & Jurisdiction Expert Agents

Expert agents provide **focused lenses** over subsets of the rules graph. They share the same interface but narrower scope.

Examples (non‑exhaustive):

- `SingleDirector_IE_SocialSafetyNet_Agent`
- `IE_SelfEmployed_TaxAgent`
- `IE_CGT_Investor_Agent`
- `IE_RnD_TaxCredit_Agent`
- `EU_CrossBorder_Coordinator_Agent`
- Future: `UK_CrossBorder_Agent`, `IM_TaxAndWelfare_Agent`, etc.

### 3.1 Common Responsibilities

All expert agents:

- **Scope:**
  - Focus on a domain (e.g. social welfare, CGT, pensions) and a set of jurisdictions.
  - Make their scope explicit in prompts, logs, and documentation.

- **Graph usage:**
  - Query Memgraph via `GraphClient` using the schema in `graph_schema_v_0_6.md`.
  - Prefer fetching a small, relevant subgraph plus timeline info rather than raw documents.
  - Populate `referencedNodes` with the IDs of rules/benefits/sections/timelines actually used.

- **Timeline usage:**
  - Call Timeline Engine whenever time‑based reasoning is involved.

- **Conversation Context awareness:**
  - Benefit from Conversation Context automatically applied via prompt aspects (e.g. “The user’s conversation so far involves VAT (IE) and VRT (IE)”).
  - Do not attempt to manage or persist context themselves.

- **Concept capture friendliness:**
  - Use clear, canonical labels for concepts and link them to jurisdictions (e.g. “Irish Value‑Added Tax (VAT)”, “Vehicle Registration Tax (VRT) in Ireland”).
  - Let the Compliance Engine handle the SKOS‑style concept capture and graph enrichment.

### 3.2 Delegation from Global Agent

The Global Regulatory Copilot Agent may delegate to expert agents when:

- A question clearly falls into a specialist domain (e.g. IE CGT calculations for an investor).
- A cross‑border question requires a coordinating agent (e.g. IE–UK self‑employed tax and social security).
- A scenario/what‑if question needs domain‑specific calculation before scenario comparison.

Expert agents return an `AgentChatResponse` which the global agent then merges into a single answer, preserving:

- `referencedNodes` (union of all unique node IDs).
- Combined jurisdictions.
- A conservative `uncertaintyLevel` (max of contributing agents).

---

## 4. Scenario & What‑If Agents (v0.6)

Scenario/what‑if agents sit on top of the **Scenario Engine** (`scenario_engine_v_0_1.md`) and help users explore alternative paths (e.g. “import car now vs next year”, “claim benefit A vs benefit B”).

### 4.1 Roles

- Interpret scenario definitions (baseline plus one or more alternatives).
- Call domain/jurisdiction expert agents as needed to:
  - Evaluate each scenario against the rules graph and timelines.
  - Estimate high‑level impacts (eligibility, tax payable, risk indicators, lock‑ins).
- Produce a comparison answer that:
  - Clearly describes each scenario.
  - Surfaces key trade‑offs and constraints.
  - Stays within the research‑only safety boundary.

### 4.2 Interaction with Conversation Context & Concept Capture

- Scenario agents receive prompts that already include:
  - Relevant `ConversationContext` (activeNodeIds summarised as natural language), and
  - Any SKOS concepts captured so far in the conversation.
- They:
  - Continue to populate `referencedNodes` with the rules used in scenario evaluation.
  - Benefit from concept capture but do not manage it directly.

Scenario agents **do not** store scenario data in Memgraph. Scenario definitions and user‑specific inputs live in Supabase/Postgres as per `conversation_context_spec_v_0_1.md` and scenario engine docs.

---

## 5. Shared Behaviour, Safety & Guards

### 5.1 Graph Access

- All agents use **read‑only** `GraphClient` to query Memgraph.
- Any writes (concept upserts, rule updates, ingestion) are done via **GraphWriteService + Graph Ingress Guard**, not by agents directly.
- Memgraph remains **PII‑free** and **tenant‑agnostic**; agents must not attempt to store user‑ or tenant‑specific data as nodes/edges.

### 5.2 Timeline Engine

- Agents must route all non‑trivial time reasoning through the Timeline Engine.
- Time rules are stored as `:Timeline` nodes and edges in Memgraph and interpreted by the engine.

### 5.3 LLM Router & Provider Policies

- Agents never call providers directly; they always go through the **LLM router**.
- Tenant and task policies determine which models/providers are used and whether remote egress is allowed.
- AI SDK v5, Responses API, and other provider specifics are implementation details behind the `LlmProvider` abstraction.
- The router resolves requested vs effective egress modes **in strict order**: global defaults → tenant policy → optional per-user policy → per-call override. Each scope runs its own `allowOff` check; if a scope disallows `off`, later candidates cannot resurrect it. `requestedMode` and `effectiveMode` must both be set on the context with the base default as the fallback, and provider allowlisting is always enforced (even when sanitisation mode is `off`).

### 5.4 Egress Guard

- All outbound calls (LLMs, MCP, HTTP) are wrapped by the **Egress Guard**.
- Egress Guard applies:
  - Static/deterministic checks (PII patterns, domain allowlists, etc.).
  - Optional LLM‑powered inspectors (egress guard helper agents).
- Agents must be written assuming that egress may be **blocked, redacted, or downgraded** depending on tenant policy.
- `LlmRouter` resolves requested + effective mode per call (global defaults → tenant policy → optional per-user policy → per-call override). `enforce` executes the sanitised payload, `report-only` logs redactions but executes the original request, and provider allowlisting runs in every mode (rejecting disallowed providers even when effective mode is `off`). `off` is a deliberate, test-only wiring. `EgressGuardContext` carries tenant/user IDs, the requested `mode`, and the resolved `effectiveMode` for observability. **Do not regress the ordering or `allowOff` scoping**; user-level `off` must only be honoured when explicitly allowed even if the tenant forbids it.

### 5.5 Concept Capture & Self‑Populating Graph

- The Compliance Engine attaches the `capture_concepts` tool to main‑chat LLM calls.
- Tool output is parsed into SKOS‑like concept objects and processed by:
  - A **canonical concept resolver** (graph‑only in v0.1), and
  - **GraphWriteService** for new or incomplete concepts.
- Tool chunks arrive as `type: 'tool'` with `name: 'capture_concepts'` and structured args in `argsJson`; other tool names are ignored for concept capture.
- Agents:
  - Must not implement their own concept extraction pipelines.
  - Should use clear terminology and cite jurisdictions to help concept capture.
  - Rely on updated graph content and Conversation Context in subsequent turns.
- Canonicalised concept node IDs are merged into `referencedNodes` and persisted to the Conversation Context so subsequent turns inherit captured concepts automatically.

### 5.6 Conversation Context

- Conversation Context is stored in Supabase/Postgres (per tenant, per conversation) and managed by the Compliance Engine.
- It typically includes:
  - `activeNodeIds` (graph nodes recently referenced in answers).
  - Scenario/what‑if metadata (where relevant).
- Agents do not read or write Conversation Context directly; they benefit from it via prompt aspects that summarise the active concepts and nodes. The Compliance Engine merges agent `referencedNodes` with captured concept node IDs before persisting `activeNodeIds`.

### 5.7 Privacy, Redaction, and Non‑Advice Line

- Agents run inside controlled backends and/or E2B sandboxes.
- PII and sensitive business information must be handled according to `data_privacy_and_architecture_boundaries_v_0_1.md`.
- All responses must:
  - Respect the **research‑only** positioning.
  - Use `disclaimerKey` to signal the correct standard disclaimer.
  - Avoid definitive claims about entitlement, liability, or compliance status.

---

## 6. Extending the Agent Set – Checklist (v0.6)

When adding or modifying an agent, ensure:

1. **Documented Identity & Scope**  
   - Add/update the agent’s entry in `AGENTS.md` with an ID, scope, responsibilities, and jurisdictions.

2. **Engine‑Aligned Implementation**  
   - Use `ComplianceEngine` / `GraphClient` / Timeline Engine / LLM router.  
   - No direct provider calls or direct Memgraph writes.

3. **Prompt Aspects, Concept Capture & Guards**  
   - Use prompt aspects (jurisdiction, persona, agent context, disclaimers, Conversation Context) to build system prompts.  
   - Ensure all outbound calls flow through the Egress Guard.  
   - Do **not** build your own entity‑extraction pipeline; rely on the shared `capture_concepts` tool and concept capture spec.  
   - Ensure any proposed graph changes go via Graph Ingress Guard.

4. **Jurisdiction, Persona & Scenario Awareness**  
   - Respect profile personas and jurisdictions; don’t hard‑code countries unless the agent is intentionally specific (e.g. IE‑only lens).  
   - When relevant, integrate with the Scenario Engine through the global agent rather than duplicating scenario logic.

5. **Safety & Non‑Advice**  
   - Maintain the research‑only stance; never claim to provide definitive legal/tax/welfare advice.  
   - Set `uncertaintyLevel` conservatively and choose an appropriate `disclaimerKey`.

Following this spec keeps the agent layer consistent with the v0.6 architecture and allows the entire system to be reused in other host apps (e.g. separate Next.js/Supabase SaaS products) without rewriting core logic.


### 5.8 Web app / shell responsibilities

- The chat surface must call `/api/chat` with a `conversationId` once the first SSE metadata payload provides one, ensuring the backend `ConversationStore`/`ConversationContextStore` maintains continuity.
- Conversation SSE streams are keyed per `(tenantId, conversationId)`; authorised users on the same tenant may subscribe concurrently to the same stream in single-instance deployments.
- Dev mode may rely on in-memory stores; production shells should wire Supabase/Postgres-backed stores with RLS.

---

## 7. Conversation Path System – Critical Invariants & Testing

The conversation path system enables "time travel" – users can edit any message in a conversation to explore alternative directions while preserving the complete original conversation history. This is a **core differentiator** and must never regress.

### 7.1 Critical Invariants

These invariants **MUST NEVER** be violated. Any violation represents a severe regression that breaks the core value proposition:

#### Invariant 1: Original Path Preservation
**When editing message N in a conversation of M messages (where N < M), the original path MUST preserve ALL M messages, including messages N+1 through M.**

```typescript
// CRITICAL: Editing Q3 when Q5 exists → Original path keeps Q4, Q5
const originalMessages = getMessages(conversationId, 'path-main');
expect(originalMessages).toHaveLength(10); // All 5 Q&A pairs preserved

// Even after creating branch from message 3
await createBranch(conversationId, message3Id);
const afterBranchMessages = getMessages(conversationId, 'path-main');
expect(afterBranchMessages).toHaveLength(10); // MUST still be 10
expect(afterBranchMessages.find(m => m.content === 'Q4')).toBeDefined();
expect(afterBranchMessages.find(m => m.content === 'Q5')).toBeDefined();
```

#### Invariant 2: Path Isolation
**Switching paths must return ONLY messages from the active path. No cross-contamination between paths.**

```typescript
// Main path and branch path must remain completely isolated
setActivePath(conversationId, 'path-main');
const mainMessages = await loadConversation(conversationId);
expect(mainMessages.every(m => m.pathId === 'path-main')).toBe(true);

setActivePath(conversationId, branchPathId);
const branchMessages = await loadConversation(conversationId);
expect(branchMessages.every(m => m.pathId === branchPathId)).toBe(true);
expect(branchMessages.find(m => m.pathId === 'path-main')).toBeUndefined();
```

#### Invariant 3: No Message Loss on Branching
**Creating a branch NEVER deletes or moves messages from the original path.**

```typescript
const beforeCount = getMessages(conversationId, 'path-main').length;
await createBranch(conversationId, sourceMessageId);
const afterCount = getMessages(conversationId, 'path-main').length;

// CRITICAL: Count must not decrease
expect(afterCount).toBe(beforeCount);
```

#### Invariant 4: Complete History on Path Switch
**When switching back to a path, the UI MUST show the complete conversation history for that path, including all messages that came after any branch points.**

```typescript
// User creates conversation: Q1, Q2, Q3, Q4, Q5
// User edits Q3 (creates branch)
// User works on branch
// User switches back to main

const mainPathMessages = await loadConversation(conversationId); // main is active
expect(mainPathMessages.find(m => m.content === 'Q4')).toBeDefined();
expect(mainPathMessages.find(m => m.content === 'Q5')).toBeDefined();
// UI shows complete original conversation
```

### 7.2 Required Test Coverage

Any changes touching the path system, conversation management, message handling, or UI state MUST maintain the following test coverage:

#### Test Suite 1: Basic Two-Question Flow
**File:** `apps/demo-web/src/app/__tests__/two-question-flow.test.tsx`

- Verifies consecutive questions display correctly
- Ensures `isStreamingRef` flag management works
- Prevents regression of the "second question doesn't appear" bug

#### Test Suite 2: Path System Integration
**File:** `apps/demo-web/src/app/__tests__/path-system-integration.test.tsx`

- Multi-question conversations (5+ questions)
- Message editing and branching
- Path switching and navigation
- Complex branching (nested, parallel)
- UI state consistency
- Error handling

#### Test Suite 3: Edit Previous Message (MOST CRITICAL)
**File:** `apps/demo-web/src/app/__tests__/edit-previous-message.test.tsx`

This is the **most critical** test suite as it validates the core "time travel" feature:

**Critical Test Cases:**
1. ✅ Editing PREVIOUS message (not last) creates branch
2. ✅ Original path preserves ALL messages after branch point
3. ✅ Switching back to original shows complete history
4. ✅ Multiple edits maintain path integrity
5. ✅ Edge cases: edit first message, edit at various positions
6. ✅ Rapid path switching maintains isolation
7. ✅ Deep branch hierarchies preserve lineage
8. ✅ Parallel branches from same message

**Regression Tests (Critical Invariants):**
- CRITICAL: Original path must NEVER lose messages after branching
- CRITICAL: Messages after branch point must remain on original path
- CRITICAL: Switching paths must return ONLY messages from active path

### 7.3 Code Review Checklist for Path System Changes

Before merging any PR that touches:
- Conversation state management
- Message handling or storage
- Path creation, switching, or branching
- UI message display logic
- SSE streaming and conversation reload

**Reviewers MUST verify:**

1. ✅ All three test suites pass (`npm test` in `apps/demo-web`)
2. ✅ No changes to message filtering logic that could break path isolation
3. ✅ Branch creation doesn't modify original path messages
4. ✅ Path switching correctly filters messages by `pathId`
5. ✅ UI state updates reflect the active path's complete history
6. ✅ No hard-coded assumptions about message counts or sequences
7. ✅ Error handling doesn't corrupt conversation state

### 7.4 CI/CD Requirements

**Pre-commit checks:**
```bash
cd apps/demo-web
npm test -- edit-previous-message  # MUST pass
npm test -- path-system-integration # MUST pass
npm test -- two-question-flow       # MUST pass
```

**CI Pipeline (GitHub Actions or similar):**
```yaml
# Path System Integration Tests (REQUIRED)
- name: Run Path System Tests
  run: |
    cd apps/demo-web
    npm test -- --run edit-previous-message.test.tsx
    npm test -- --run path-system-integration.test.tsx
    npm test -- --run two-question-flow.test.tsx
```

**Status Checks:**
- Path system tests must be **required** status checks for PRs
- Cannot merge if any critical path system test fails
- Test failures in these suites require immediate investigation

### 7.5 User-Facing Value Proposition

The path system enables this user experience:

> "Edit any message in your conversation to explore a different direction. Your original conversation is completely preserved and you can switch back at any time to see the full original discussion, including all messages that came after the point where you branched."

**Real-world scenario:**
```
User asks 5 questions about tax regulations:
  Q1: What is PRSI?
  Q2: How does it apply to directors?
  Q3: What about multiple directorships?
  Q4: Are there exemptions?
  Q5: What about cross-border cases?

User realizes Q3 should have asked about sole traders instead:
  → User edits Q3 to: "What about sole traders instead?"
  → System creates new branch from Q3
  → Branch explores sole trader direction
  → Original path STILL has Q4, Q5 about directorships

Later, user switches back to original path:
  → UI shows complete original conversation
  → All 5 original Q&A pairs visible
  → User can reference the directorship discussion
```

This "time travel" feature distinguishes our system from linear chat interfaces (like ChatGPT) where editing loses subsequent messages. **Any regression to this functionality is considered critical.**

### 7.6 Documentation References

- **Test Documentation:** `docs/testing/PATH_SYSTEM_TESTING.md`
- **Bug Fix Analysis:** `docs/fixes/TWO_QUESTION_FLOW_FIX.md`
- **Architecture Status:** `docs/architecture/PATH_SYSTEM_STATUS.md`

---
