# Regulatory Intelligence Copilot – Architecture (v0.7)

> **Goal:** A chat‑first, graph‑backed regulatory research copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal/tax advice or leaking sensitive data.
>
> **Scope of v0.7:** Extends v0.6 by:
> - Adding **E2B Code Execution Contexts** as a first-class architectural concern for conversation paths.
> - Introducing **LLM-callable code execution tools** (`run_code`, `run_analysis`) that enable dynamic computation within sandboxed E2B environments.
> - Defining **execution context lifecycle management** keyed by `(tenantId, conversationId, pathId)`.
> - Ensuring all sandbox egress flows through **EgressGuard** for privacy and compliance.
> - Maintaining full backward compatibility with v0.6 features: conversation branching, message editing, concept capture, and timeline reasoning.

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

### v0.6 Specs (Incorporated)

- `docs/specs/conversation-context/concept_capture_from_main_chat_v_0_1.md`
- `docs/specs/conversation-context/conversation_context_spec_v_0_1.md`
- `docs/specs/scenario_engine_v_0_1.md`

### New / Refined Specs Introduced by v0.7

- `docs/specs/execution-context/execution_context_spec_v_0_1.md` (E2B sandbox per conversation path)
- `docs/specs/code-execution/code_execution_tools_v_0_1.md` (LLM-callable execution tools)

### Project‑Level Docs

- `docs/architecture_v_0_6.md` (superseded by this document as the canonical architecture summary)
- `docs/governance/decisions/decisions_v_0_6.md`
- `docs/governance/roadmap/roadmap_v_0_6.md`
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
     - Chat interface for regulatory questions with **branching and message editing support**.
     - Live regulatory graph view (Memgraph‑backed).

2. **Compliance Engine** (reusable packages)
   - Core logic in `packages/reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`.
   - Implements the regulatory copilot behaviour:
     - Agent selection and orchestration.
     - LLM routing and guardrails.
     - Graph queries and self‑population.
     - Timeline reasoning.
     - **Code execution orchestration** (v0.7).
   - Designed to be reused by other Next.js/Supabase SaaS apps via a thin adapter.

3. **Shared Rules Graph (Memgraph)**
   - Memgraph Community + MAGE as a **single global regulatory knowledge graph**.
   - Stores public rules, relationships, timelines, jurisdictions, case law, guidance, and their interactions.
   - **Never stores tenant/user‑specific PII**; it is a shared, anonymous rules graph.

4. **LLM + Tooling Layer**
   - `LlmRouter` with pluggable providers (OpenAI Responses, Groq, local/OSS models).
   - Uses OpenAI Responses API (incl. GPT‑OSS models) as a primary reference implementation.
   - All outbound calls (LLM, MCP, HTTP) go through `EgressClient` and the **Egress Guard**.
   - Egress Guard supports `enforce` / `report-only` / `off` modes.
   - Main‑chat calls can emit **streamed text** for the UI and **structured tool output** for concept capture, code execution, and other metadata.
   - **v0.7 adds**: `run_code` and `run_analysis` tools for LLM-invoked code execution.

5. **Graph Ingress & Ingestion**
   - `GraphClient` for read queries.
   - `GraphWriteService` for all writes, wrapped in **Graph Ingress Guard** aspects.
   - Ingestion agents (e.g. MCP/E2B‑based) must upsert rules exclusively via `GraphWriteService`.

6. **E2B Execution Environment** (v0.7 Enhanced)
   - E2B sandboxes for running code, simulations, and heavier computations.
   - **New in v0.7**: Per-path execution contexts with lifecycle management.
   - MCP gateway used for:
     - Memgraph read‑only access.
     - External regulatory content (e.g. Revenue, TAC, EU regs) via HTTP.
   - All egress from sandboxes flows through the **Egress Guard**.

7. **Storage Layer (Host App)**
   - Supabase (or similar Postgres) provides multi‑tenant application storage:
     - Tenants, users, auth.
     - Conversations, messages, and **conversation paths** (branching).
     - Conversation‑level context (active node IDs, flags, scenario state).
     - **Execution contexts** keyed by `(tenantId, conversationId, pathId)` (v0.7).
     - Access envelopes for conversations with `share_audience` and `tenant_access`.
   - A ConversationStore + ConversationContextStore + **ConversationPathStore** abstraction sits between the web app and the Compliance Engine.

### 1.2 Privacy & Data Boundaries (Summary)

From `data_privacy_and_architecture_boundaries_v_0_1.md`:

- **Memgraph (Rules Graph)**
  - Stores only *public regulatory knowledge*.
  - **MUST NOT** store: User PII, tenant PII, personal financial data, individual scenarios, or uploaded file contents.

- **Supabase / App DB**
  - Multi‑tenant application data: accounts, subscriptions, settings, saved scenarios.
  - Stores **conversations, conversation context, conversation paths**, and **execution contexts**.
  - May hold references to graph node IDs, but there is no back‑reference from the graph to app‑level IDs.

- **E2B Sandboxes**
  - Transient execution environments for code and document processing.
  - User documents are processed here and deleted with the sandbox unless the user explicitly opts into persistent storage.
  - **v0.7**: Sandboxes are now keyed per `(tenantId, conversationId, pathId)` for reuse across tool calls on the same path.

- **Egress Guard**
  - All outbound calls (LLM, MCP, HTTP, **sandbox egress**) pass through `EgressClient` → egress aspect pipeline.
  - Responsible for PII / sensitive‑data stripping and enforcing provider / jurisdiction policies.

---

## 2. Engine Packages & Boundaries

The engine is implemented as a set of reusable packages:

- `reg-intel-core`
  - `ComplianceEngine` (central orchestration entrypoint).
  - Agent registry and selection.
  - Conversation context handling.
  - **ExecutionContextManager** (v0.7) for sandbox lifecycle.
  - Integration with timeline engine, scenario engine, and **code execution tools**.

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
  - **Tool definitions** including `capture_concepts`, `run_code`, `run_analysis` (v0.7).

- `reg-intel-prompts`
  - Prompt aspect system (jurisdiction, agent, persona, disclaimers, additional context).
  - Standardised system prompts and guardrails.

- `reg-intel-conversations`
  - `ConversationStore` and `ConversationContextStore` interfaces.
  - **`ConversationPathStore`** for branching and merging.
  - **`ExecutionContextStore`** for per-path sandbox state (v0.7).

The **demo web app** depends on these packages but does **not** contain core business logic.

---

## 3. E2B Execution Contexts (v0.7)

### 3.1 Current State Analysis

Prior to v0.7, E2B integration was:

- A **single global sandbox per process** via `sandboxManager.ts`.
- Used only for MCP gateway access to Perplexity and Memgraph tools.
- **Not wired into the main chat flow**.
- **No per-conversation or per-path sandbox management**.
- **No LLM-callable code execution tools**.

### 3.2 v0.7 Architecture: Per-Path Execution Contexts

v0.7 introduces **Execution Contexts** keyed by `(tenantId, conversationId, pathId)`:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Conversation (tenantId, conversationId)        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Primary Path (pathId: "main")                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  ExecutionContext                                       │  │  │
│  │  │  - sandboxId: "sbx_abc123"                              │  │  │
│  │  │  - mcpUrl, mcpToken                                     │  │  │
│  │  │  - createdAt, lastUsedAt, expiresAt                     │  │  │
│  │  │  - executionCount: 5                                    │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │  Messages: [M1, M2, M3, M4, M5]                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                           │                                         │
│                           │ Branch at M3                            │
│                           ▼                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Branch Path (pathId: "branch_001")                           │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  ExecutionContext                                       │  │  │
│  │  │  - sandboxId: "sbx_def456"  (separate sandbox)          │  │  │
│  │  │  - mcpUrl, mcpToken                                     │  │  │
│  │  │  - createdAt, lastUsedAt, expiresAt                     │  │  │
│  │  │  - executionCount: 2                                    │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │  Inherits: [M1, M2, M3]                                       │  │
│  │  Own: [M3', M4', M5']  (edited message flow)                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Execution Context Data Model

```ts
export interface ExecutionContextIdentity {
  tenantId: string;
  conversationId: string;
  pathId: string;
}

export interface ExecutionContext {
  /** E2B sandbox ID */
  sandboxId: string;

  /** MCP gateway credentials */
  mcpUrl: string;
  mcpToken: string;

  /** Lifecycle timestamps */
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;

  /** Usage metrics */
  executionCount: number;
  totalExecutionTimeMs: number;

  /** State */
  status: 'active' | 'expired' | 'error' | 'terminated';
  lastError?: string | null;
}

export interface ExecutionContextStore {
  /** Load existing context for a path */
  load(identity: ExecutionContextIdentity): Promise<ExecutionContext | null>;

  /** Save/update context */
  save(identity: ExecutionContextIdentity, ctx: ExecutionContext): Promise<void>;

  /** Record an execution */
  recordExecution(
    identity: ExecutionContextIdentity,
    executionTimeMs: number
  ): Promise<void>;

  /** Mark context as expired/terminated */
  terminate(identity: ExecutionContextIdentity, reason: 'expired' | 'error' | 'manual'): Promise<void>;

  /** List active contexts for cleanup */
  listExpired(cutoffTime: Date): Promise<ExecutionContextIdentity[]>;
}
```

### 3.4 Execution Context Manager

The `ExecutionContextManager` is responsible for sandbox lifecycle:

```ts
export interface ExecutionContextManagerDeps {
  executionContextStore: ExecutionContextStore;
  egressGuard: EgressGuard;
  sandboxTtlMs?: number;       // Default: 30 minutes
  maxExecutionsPerContext?: number;  // Default: 100
  maxConcurrentContextsPerTenant?: number;  // Default: 10
}

export class ExecutionContextManager {
  /**
   * Get or lazily create an execution context for a path.
   * Reuses existing active sandbox if valid; creates new one otherwise.
   */
  async getOrCreateContext(
    identity: ExecutionContextIdentity
  ): Promise<ExecutionContext>;

  /**
   * Execute code in the sandbox for a path.
   * All egress from sandbox goes through EgressGuard.
   */
  async executeCode(
    identity: ExecutionContextIdentity,
    code: string,
    language: 'javascript' | 'python'
  ): Promise<ExecutionResult>;

  /**
   * Terminate a specific context (e.g., when path is archived).
   */
  async terminateContext(identity: ExecutionContextIdentity): Promise<void>;

  /**
   * Cleanup expired contexts (called by background job).
   */
  async cleanupExpiredContexts(): Promise<number>;
}
```

### 3.5 Lazy Creation and Reuse Strategy

1. **On first tool call** (`run_code`, `run_analysis`) for a path:
   - Check `ExecutionContextStore` for existing active context.
   - If found and not expired: reuse sandbox.
   - If not found or expired: create new E2B sandbox, store credentials.

2. **Subsequent tool calls** on same path:
   - Reuse existing sandbox for continuity (e.g., previously defined variables, loaded data).
   - Update `lastUsedAt` timestamp.
   - Increment `executionCount`.

3. **TTL and Resource Limits**:
   - Default TTL: 30 minutes from last use.
   - Max executions per context: 100 (configurable).
   - Max concurrent contexts per tenant: 10 (configurable).
   - Background job cleans up expired contexts.

4. **Branch/Edit Scenarios**:
   - When a new branch is created from a message, the branch gets its **own** execution context.
   - Edited message flows (re-runs from a point) continue using the same path's context.
   - Merged paths do not inherit source path's execution context.

---

## 4. LLM Code Execution Tools (v0.7)

### 4.1 Tool Definitions

v0.7 adds two LLM-callable tools for code execution:

#### `run_code` Tool

```ts
const RUN_CODE_TOOL = {
  type: 'function',
  name: 'run_code',
  description: `Execute code in a sandboxed E2B environment to perform calculations,
data analysis, or verify regulatory computations. Use this when you need to:
- Calculate tax amounts, benefits eligibility, or timeline dates
- Process and analyze data the user has provided
- Verify complex regulatory logic programmatically
- Generate visualizations or reports

The sandbox has access to standard libraries but no network access except through approved channels.`,
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The code to execute (JavaScript or Python)'
      },
      language: {
        type: 'string',
        enum: ['javascript', 'python'],
        description: 'Programming language'
      },
      purpose: {
        type: 'string',
        description: 'Brief description of what this code calculates/analyzes'
      }
    },
    required: ['code', 'language', 'purpose']
  }
};
```

#### `run_analysis` Tool

```ts
const RUN_ANALYSIS_TOOL = {
  type: 'function',
  name: 'run_analysis',
  description: `Run a structured regulatory analysis computation. Use for:
- What-if scenario comparisons
- Eligibility calculations across multiple rules
- Timeline constraint evaluation
- Cross-jurisdiction comparisons

Results are returned as structured JSON for further reasoning.`,
  parameters: {
    type: 'object',
    properties: {
      analysisType: {
        type: 'string',
        enum: ['eligibility', 'timeline', 'comparison', 'scenario'],
        description: 'Type of analysis to perform'
      },
      parameters: {
        type: 'object',
        description: 'Analysis-specific parameters'
      },
      outputFormat: {
        type: 'string',
        enum: ['json', 'table', 'summary'],
        description: 'How to format the results'
      }
    },
    required: ['analysisType', 'parameters']
  }
};
```

### 4.2 Tool Registration in ComplianceEngine

```ts
// In ComplianceEngine constructor
private codeExecutionEnabled: boolean;
private executionContextManager?: ExecutionContextManager;

// Tool registration for LLM calls
private getToolsForMainChat(): Array<Record<string, unknown>> {
  const tools: Array<Record<string, unknown>> = [];

  // Always include concept capture
  if (this.conceptCaptureEnabled) {
    tools.push(CAPTURE_CONCEPTS_TOOL);
  }

  // Include code execution tools if enabled
  if (this.codeExecutionEnabled && this.executionContextManager) {
    tools.push(RUN_CODE_TOOL);
    tools.push(RUN_ANALYSIS_TOOL);
  }

  return tools;
}
```

### 4.3 Tool Chunk Handling

When the LLM calls a code execution tool:

```ts
private async handleToolChunk(
  chunk: ToolStreamChunk,
  identity: ExecutionContextIdentity
): Promise<void> {
  const toolName = chunk.name ?? chunk.toolName;

  switch (toolName) {
    case 'capture_concepts':
      await this.handleConceptChunk(chunk);
      break;

    case 'run_code':
      await this.handleRunCodeChunk(chunk, identity);
      break;

    case 'run_analysis':
      await this.handleRunAnalysisChunk(chunk, identity);
      break;

    default:
      console.warn(`Unknown tool: ${toolName}`);
  }
}

private async handleRunCodeChunk(
  chunk: ToolStreamChunk,
  identity: ExecutionContextIdentity
): Promise<ExecutionResult> {
  const { code, language, purpose } = this.parseCodeExecutionPayload(chunk);

  // Get or create sandbox for this path
  const context = await this.executionContextManager!.getOrCreateContext(identity);

  // Execute with egress guard
  const result = await this.executionContextManager!.executeCode(
    identity,
    code,
    language
  );

  // Log execution for observability
  this.logger.info({
    tool: 'run_code',
    pathId: identity.pathId,
    purpose,
    executionTimeMs: result.executionTimeMs,
    success: result.success
  });

  return result;
}
```

### 4.4 Execution Result Format

```ts
export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTimeMs: number;
  outputType: 'text' | 'json' | 'table' | 'error';
  truncated?: boolean;
}
```

---

## 5. Conversation Paths and Execution Context Integration

### 5.1 Path-Aware Chat Flow

The chat flow in v0.7 must account for the active path:

1. **Request arrives** at `/api/chat` with `(tenantId, conversationId, pathId)`.
2. **Load conversation context** for the path (active node IDs, etc.).
3. **Build LLM request** with tools including `run_code` if enabled.
4. **Stream LLM response**:
   - `text` chunks → UI
   - `tool` chunks → handle per tool type
     - `capture_concepts` → update graph + conversation context
     - `run_code` / `run_analysis` → execute in path's sandbox, return result to LLM
5. **Update state**:
   - Conversation context with new referenced nodes
   - Execution context with usage metrics

### 5.2 Branching Behavior

When a user branches from a message, **conversation state is inherited but sandbox state is not**:

#### What IS Inherited (Conversation Continuity)

1. **Message history** up to the branch point — the branch sees messages M1, M2, M3.
2. **ConversationContext** (`activeNodeIds`) — copied/snapshotted at branch point so the branch knows what concepts are in play.
3. The branch **continues the conversation as if it never branched** from a knowledge perspective.

#### What is NOT Inherited (Sandbox Isolation)

1. **ExecutionContext** (E2B sandbox) — the branch starts with **no sandbox**.
2. **On first `run_code` call** in the branch, a **new sandbox is lazily created** for that path.
3. **Runtime state isolation** — variables, files, and state from parent's sandbox don't carry over.

#### Rationale

The distinction exists because:

- **Conversation context** represents "what regulatory concepts are we discussing" — this should carry over so the branch can continue intelligently.
- **Execution context** represents "what code has been run and what state exists" — this should NOT carry over because:
  - The branch may want to explore different calculation paths.
  - The parent's `total = 42000` shouldn't constrain the branch's exploration.
  - Sandbox state can be large (loaded data, files) and expensive to clone.

```
┌─────────────────────────────────────────────────────────────────┐
│  Parent Path (Main)                                             │
│  Messages: [M1, M2, M3, M4, M5]                                 │
│  ConversationContext: {activeNodeIds: ["VAT", "CGT"]}           │
│  ExecutionContext: {sandbox: sbx_001, state: {total: 42000}}    │
└─────────────────────────────────────────────────────────────────┘
                     │
                     │ Branch at M3
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Branch Path                                                    │
│  Messages: [M1, M2, M3] ← INHERITED                             │
│  ConversationContext: {activeNodeIds: ["VAT", "CGT"]} ← COPIED  │
│  ExecutionContext: null ← NOT INHERITED (lazy creation)        │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Message Editing Behavior

When a user edits a previous message:

1. Messages after the edit point are **soft-deleted** (superseded).
2. New messages are appended to the **same path**.
3. **Execution context is reused** — the sandbox continues from its current state.
4. If the sandbox has expired, a **new one is created** transparently.

### 5.4 Path Merging Behavior

When a branch is merged back to parent:

1. Messages are copied/summarized per `MergeMode`.
2. **Execution context is NOT merged** — source path's sandbox is terminated.
3. Target path continues with its own execution context.

---

## 6. LLM Routing, Streaming & Tool Handling

### 6.1 LLM Routing & Providers (unchanged from v0.6)

The `LlmRouter` decides which provider/model to use based on tenant configuration and task type.

### 6.2 Streaming Behaviour (extended for v0.7)

- **Text chunks (`type: 'text'`)** — Passed to UI stream.
- **Tool chunks (`type: 'tool'`)** — Never forwarded to UI, handled by ComplianceEngine:
  - `capture_concepts` → graph enrichment
  - `run_code` → sandbox execution (v0.7)
  - `run_analysis` → structured analysis (v0.7)
- **Tool result chunks (`type: 'tool_result'`)** — Fed back to LLM for continued reasoning.
- **Error chunks (`type: 'error'`)** — Abort stream, emit safe error to UI.
- **Done chunks (`type: 'done'`)** — Finalize response with metadata.

### 6.3 Multi-Turn Tool Calls

When the LLM calls `run_code`, the flow is:

```
LLM → tool call: run_code → ComplianceEngine → ExecutionContextManager → E2B Sandbox
                                                                              ↓
                                                                         Execute code
                                                                              ↓
LLM ← tool result ← ComplianceEngine ← ExecutionContextManager ← E2B result
```

The LLM can then:
- Interpret the result and stream text to the user.
- Call another tool based on the result.
- Ask for clarification if execution failed.

---

## 7. Egress Guard Integration for Sandboxes

### 7.1 All Sandbox Egress Through EgressGuard

Every outbound call from an E2B sandbox **must** flow through EgressGuard:

```ts
async executeCode(
  identity: ExecutionContextIdentity,
  code: string,
  language: 'javascript' | 'python'
): Promise<ExecutionResult> {
  const context = await this.getOrCreateContext(identity);

  // Wrap sandbox execution with egress guard
  return this.withEgressGuard(identity, async () => {
    const result = await runInSandbox(context, code);
    return result;
  });
}

private async withEgressGuard<T>(
  identity: ExecutionContextIdentity,
  fn: () => Promise<T>
): Promise<T> {
  // Apply egress policies
  const effectiveMode = this.egressGuard.resolveEffectiveMode({
    tenantId: identity.tenantId,
    taskType: 'sandbox-execution'
  });

  if (effectiveMode === 'enforce') {
    // Sandbox network is already restricted by E2B
    // Additional PII scrubbing on output
  }

  try {
    const result = await fn();
    return this.sanitizeExecutionResult(result);
  } catch (error) {
    this.logger.error({ identity, error }, 'Sandbox execution failed');
    throw error;
  }
}
```

### 7.2 Sandbox Network Restrictions

E2B sandboxes are configured with:

- **No direct internet access** (except through MCP gateway).
- **Allowlisted domains** only for regulatory data sources.
- **All HTTP calls** logged and subject to egress policies.

---

## 8. Conversation Context & Referenced Nodes (unchanged from v0.6)

The `ConversationContext` structure remains the same:

```ts
interface ConversationContext {
  activeNodeIds: string[];
  traceId?: string | null;
}
```

v0.7 adds **execution state** as a separate concern via `ExecutionContext`, not inside `ConversationContext`.

**Trace persistence contract:** The conversation-facing stores must keep `trace_id`, `root_span_id`, and `root_span_name` populated on conversations, messages, and conversation context rows. Values come from the **root span** created at `/api/chat` (or any future entrypoint) so operators can pivot from any row back to the originating trace. Background jobs must thread the same context instead of generating new trace IDs. See the observability runbook for the regression checklist.

---

## 9. Self‑Populating Rules Graph (unchanged from v0.6)

The concept capture pipeline remains unchanged. `capture_concepts` tool output is handled the same way.

---

## 10. Timeline Engine & Scenario Engine (unchanged from v0.6)

Both engines remain as described in v0.6, now with the option to use `run_code` / `run_analysis` tools for complex computations.

---

## 11. Agents & Prompt Aspects

### 11.1 Updated Prompt Aspects (v0.7)

A new aspect is added for code execution awareness:

```ts
const codeExecutionAspect: PromptAspect = {
  name: 'codeExecutionAspect',
  apply: (context) => {
    if (!context.codeExecutionEnabled) return null;

    return `You have access to code execution tools:
- run_code: Execute JavaScript or Python for calculations and data processing
- run_analysis: Run structured regulatory analysis computations

Use these tools when:
- The user asks for specific calculations (tax amounts, eligibility, timelines)
- You need to verify complex regulatory logic
- Data analysis would help answer the question
- Multiple scenarios need to be compared programmatically

Always explain what the code will do before executing it.`;
  }
};
```

---

## 12. UI Architecture (unchanged from v0.6)

The UI architecture remains the same. The frontend is **unaware** of sandbox execution — it only receives streamed text and metadata.

---

## 13. Technology Stack Summary

- **Runtime:** Node.js 24 LTS.
- **Frontend:** Next.js 16, React 19, Tailwind v4, shadcn/ui, Radix UI, Vercel AI SDK v5.
- **Backend engine:** TypeScript packages (`reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`, `reg-intel-conversations`).
- **Graph:** Memgraph Community + MAGE.
- **Storage:** Supabase/Postgres for multi‑tenant app data, conversation context, and **execution contexts**.
- **Sandboxing:** E2B Code Interpreter with MCP gateway.

---

## 14. Non‑Goals (v0.7)

To keep scope sane, v0.7 explicitly does **not** attempt to:

- Implement persistent sandbox state across server restarts (sandboxes are transient).
- Support arbitrary user-uploaded code execution (only LLM-generated code).
- Provide real-time collaborative editing of code in sandboxes.
- Implement a full notebook/REPL interface (chat-first UX remains primary).

---

## 15. Summary of Changes in v0.7

### Added

- ✅ **E2B Execution Contexts** keyed by `(tenantId, conversationId, pathId)`.
- ✅ **LLM-callable tools**: `run_code` and `run_analysis` for dynamic computation.
- ✅ **ExecutionContextManager** for sandbox lifecycle management.
- ✅ **ExecutionContextStore** interface and implementations.
- ✅ **Per-path sandbox reuse** with TTL and resource limits.
- ✅ **Egress Guard integration** for all sandbox egress.
- ✅ **Prompt aspect** for code execution awareness.

### Key Branching Behavior (Clarification)

When a conversation branches:

| What | Inherited? | Notes |
|------|------------|-------|
| **Message history** (up to branch point) | ✅ YES | Branch sees all prior messages |
| **ConversationContext** (`activeNodeIds`) | ✅ YES | Copied at branch point |
| **ExecutionContext** (E2B sandbox) | ❌ NO | Branch gets fresh sandbox when needed |

**The branch continues the conversation as if it never branched** — only the sandbox runtime state is isolated so branches can explore different calculation paths independently.

### Carried Forward (Unchanged in Spirit)

- ✅ All v0.6 features: conversation branching, message editing, concept capture, timeline reasoning.
- ✅ Node 24 LTS baseline and TS/Next/React/Tailwind versions.
- ✅ Memgraph as a shared, PII-free rules graph.
- ✅ Egress Guard and Graph Ingress Guard invariants.
- ✅ LlmRouter and provider-agnostic LLM routing.
- ✅ Timeline Engine and special jurisdictions modelling.
- ✅ UI architecture from v0.5/v0.6.

---

## 16. Implementation Plan

### Phase 1: Foundation

1. Create `ExecutionContextStore` interface and in-memory implementation.
2. Create `ExecutionContextManager` with lazy sandbox creation.
3. Add Supabase migration for `execution_contexts` table.

### Phase 2: Tool Integration

1. Define `run_code` and `run_analysis` tool schemas.
2. Register tools in `ComplianceEngine` when code execution is enabled.
3. Implement tool chunk handlers with sandbox execution.

### Phase 3: Path Integration

1. Wire `pathId` through chat flow to `ExecutionContextManager`.
2. Ensure branch/merge/edit scenarios handle execution contexts correctly.
3. Add cleanup logic for terminated paths.

### Phase 4: Observability & Guards

1. Add OpenTelemetry spans for sandbox operations.
2. Integrate Egress Guard for sandbox egress.
3. Add metrics for sandbox usage, TTL, and errors.

---

## Appendix A: Migration Notes

### A.1 Database Schema Addition

```sql
CREATE TABLE execution_contexts (
  tenant_id        uuid        NOT NULL,
  conversation_id  uuid        NOT NULL,
  path_id          uuid        NOT NULL,
  sandbox_id       text        NOT NULL,
  mcp_url          text        NOT NULL,
  mcp_token        text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  execution_count  integer     NOT NULL DEFAULT 0,
  total_execution_time_ms bigint NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'active',
  last_error       text,

  PRIMARY KEY (tenant_id, conversation_id, path_id)
);

CREATE INDEX idx_execution_contexts_expires
  ON execution_contexts(expires_at)
  WHERE status = 'active';
```

### A.2 Feature Flag

Code execution should be behind a feature flag initially:

```ts
const CODE_EXECUTION_ENABLED = process.env.FEATURE_CODE_EXECUTION === 'true';
```

---

v0.7 is now the **canonical architecture document** for the Regulatory Intelligence Copilot and should be treated as the primary reference for future work on code execution, sandbox management, and the existing engine, UI, and roadmap features.
