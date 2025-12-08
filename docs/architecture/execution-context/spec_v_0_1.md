# Execution Context Specification (v0.1)

> **Status:** v0.1 (design review)
>
> **Purpose:** Define the architecture for E2B sandbox execution contexts keyed by conversation path, enabling LLM-callable code execution tools in the Regulatory Intelligence Copilot.
>
> **Aligned with:**
> - `architecture_v_0_7.md`
> - `conversation-context/spec_v_0_1.md`
> - `egress_guard_v_0_3.md`
> - `data_privacy_and_architecture_boundaries_v_0_1.md`

---

## 1. Problem Statement

### 1.1 Current State

Prior to v0.7, E2B integration existed but was not wired into the main chat flow:

1. **Single global sandbox per process** via `sandboxManager.ts`.
2. Used only for MCP gateway access to Perplexity and Memgraph tools.
3. **No per-conversation or per-path sandbox management**.
4. **No LLM-callable code execution tools** (`run_code`, `run_analysis`).
5. Chat flows (original, branch, edited message) had no concept of execution context.

### 1.2 Requirements

To support LLM-driven code execution and analysis:

1. **Per-Path Isolation**: Each conversation path should be able to have its own sandboxed execution environment.
2. **Lazy Creation**: Sandboxes should only be created when actually needed (first tool call).
3. **Sandbox Reuse**: Subsequent tool calls on the same path should reuse the existing sandbox for continuity.
4. **TTL-Based Lifecycle**: Sandboxes should expire after a period of inactivity to manage resources.
5. **Branch Isolation**: When a user branches, the new path gets its own execution context (not inherited).
6. **Edit Continuity**: When a user edits a message, the same path's execution context continues.
7. **Egress Guard Integration**: All sandbox egress must flow through EgressGuard.

---

## 2. Data Model

### 2.1 Execution Context Identity

An execution context is uniquely identified by the tuple `(tenantId, conversationId, pathId)`:

```ts
/**
 * Identity tuple for execution contexts.
 * Each conversation path can have at most one active execution context.
 */
export interface ExecutionContextIdentity {
  /** Tenant owning the conversation */
  tenantId: string;

  /** Conversation containing the path */
  conversationId: string;

  /** Path within the conversation (may be primary or branch) */
  pathId: string;
}
```

### 2.2 Execution Context

```ts
/**
 * Status of an execution context.
 */
export type ExecutionContextStatus = 'active' | 'expired' | 'error' | 'terminated';

/**
 * Execution context representing a sandboxed environment for a conversation path.
 */
export interface ExecutionContext {
  // =========================================================================
  // Sandbox Identification
  // =========================================================================

  /** E2B sandbox identifier */
  sandboxId: string;

  /** MCP gateway URL for this sandbox */
  mcpUrl: string;

  /** MCP gateway authentication token */
  mcpToken: string;

  // =========================================================================
  // Lifecycle Timestamps
  // =========================================================================

  /** When this context was created */
  createdAt: Date;

  /** When this context was last used for execution */
  lastUsedAt: Date;

  /** When this context will expire if not used */
  expiresAt: Date;

  // =========================================================================
  // Usage Metrics
  // =========================================================================

  /** Number of code executions performed in this context */
  executionCount: number;

  /** Total execution time in milliseconds across all executions */
  totalExecutionTimeMs: number;

  // =========================================================================
  // State
  // =========================================================================

  /** Current status of the execution context */
  status: ExecutionContextStatus;

  /** Last error message if status is 'error' */
  lastError?: string | null;
}
```

### 2.3 Empty Context

When no execution context exists for a path:

```ts
/**
 * Sentinel value indicating no execution context exists.
 */
export const NO_EXECUTION_CONTEXT: null = null;
```

---

## 3. Execution Context Store Interface

### 3.1 Store Interface

```ts
/**
 * Storage interface for execution contexts.
 * Implemented by Supabase/Postgres in production and in-memory for testing.
 */
export interface ExecutionContextStore {
  /**
   * Load an execution context for a path.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   * @returns The execution context if it exists, null otherwise
   */
  load(identity: ExecutionContextIdentity): Promise<ExecutionContext | null>;

  /**
   * Save or update an execution context.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   * @param ctx - The execution context to save
   */
  save(identity: ExecutionContextIdentity, ctx: ExecutionContext): Promise<void>;

  /**
   * Record an execution and update metrics.
   * Also updates lastUsedAt and extends expiresAt.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   * @param executionTimeMs - Duration of the execution in milliseconds
   */
  recordExecution(
    identity: ExecutionContextIdentity,
    executionTimeMs: number
  ): Promise<void>;

  /**
   * Mark an execution context as terminated.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   * @param reason - Why the context was terminated
   */
  terminate(
    identity: ExecutionContextIdentity,
    reason: 'expired' | 'error' | 'manual' | 'merged'
  ): Promise<void>;

  /**
   * List execution contexts that have expired and are ready for cleanup.
   *
   * @param cutoffTime - Contexts with expiresAt before this time are considered expired
   * @returns List of identity tuples for expired contexts
   */
  listExpired(cutoffTime: Date): Promise<ExecutionContextIdentity[]>;

  /**
   * List all active contexts for a tenant (for resource limiting).
   *
   * @param tenantId - The tenant to query
   * @returns List of active execution contexts
   */
  listActiveForTenant(tenantId: string): Promise<ExecutionContextIdentity[]>;
}
```

### 3.2 Behavioral Rules

1. **`load`**:
   - Returns `null` when no context exists.
   - Returns the context even if status is 'expired' or 'error' (caller decides what to do).

2. **`save`**:
   - Upserts based on identity tuple.
   - Updates `updatedAt` timestamp in storage.

3. **`recordExecution`**:
   - Atomically increments `executionCount`.
   - Adds to `totalExecutionTimeMs`.
   - Updates `lastUsedAt` to now.
   - Extends `expiresAt` by TTL from now.

4. **`terminate`**:
   - Sets `status` to 'terminated'.
   - Does NOT delete the record (for audit trail).

5. **`listExpired`**:
   - Only returns contexts with `status = 'active'` and `expiresAt < cutoffTime`.

---

## 4. Database Schema

### 4.1 Table Definition

```sql
-- Execution contexts for conversation paths
CREATE TABLE execution_contexts (
  -- Identity (composite primary key)
  tenant_id        uuid        NOT NULL,
  conversation_id  uuid        NOT NULL,
  path_id          uuid        NOT NULL,

  -- Sandbox credentials
  sandbox_id       text        NOT NULL,
  mcp_url          text        NOT NULL,
  mcp_token        text        NOT NULL,

  -- Lifecycle timestamps
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Usage metrics
  execution_count  integer     NOT NULL DEFAULT 0,
  total_execution_time_ms bigint NOT NULL DEFAULT 0,

  -- State
  status           text        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'expired', 'error', 'terminated')),
  last_error       text,

  PRIMARY KEY (tenant_id, conversation_id, path_id)
);

-- Index for cleanup queries
CREATE INDEX idx_execution_contexts_expires
  ON execution_contexts(expires_at)
  WHERE status = 'active';

-- Index for per-tenant resource limiting
CREATE INDEX idx_execution_contexts_tenant_active
  ON execution_contexts(tenant_id)
  WHERE status = 'active';

-- Foreign key to conversation paths
ALTER TABLE execution_contexts
  ADD CONSTRAINT fk_execution_contexts_path
  FOREIGN KEY (tenant_id, conversation_id, path_id)
  REFERENCES conversation_paths(tenant_id, conversation_id, id)
  ON DELETE CASCADE;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_execution_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_contexts_updated_at
  BEFORE UPDATE ON execution_contexts
  FOR EACH ROW
  EXECUTE FUNCTION update_execution_context_timestamp();
```

### 4.2 Row Level Security

```sql
-- RLS for execution_contexts
ALTER TABLE execution_contexts ENABLE ROW LEVEL SECURITY;

-- Users can only access their tenant's execution contexts
CREATE POLICY "Users can access their tenant's execution contexts"
  ON execution_contexts
  FOR ALL
  USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

---

## 5. Execution Context Manager

### 5.1 Manager Interface

```ts
/**
 * Configuration for ExecutionContextManager.
 */
export interface ExecutionContextManagerConfig {
  /** Default TTL for sandboxes in milliseconds (default: 30 minutes) */
  sandboxTtlMs?: number;

  /** Maximum executions per context before forced rotation (default: 100) */
  maxExecutionsPerContext?: number;

  /** Maximum concurrent active contexts per tenant (default: 10) */
  maxConcurrentContextsPerTenant?: number;

  /** E2B sandbox template/configuration */
  sandboxTemplate?: string;

  /** Sandbox timeout for creation in milliseconds (default: 60000) */
  sandboxCreationTimeoutMs?: number;
}

/**
 * Dependencies for ExecutionContextManager.
 */
export interface ExecutionContextManagerDeps {
  /** Store for execution contexts */
  executionContextStore: ExecutionContextStore;

  /** Egress guard for sandbox egress */
  egressGuard: EgressGuard;

  /** Logger for observability */
  logger: Logger;

  /** Configuration options */
  config?: ExecutionContextManagerConfig;
}

/**
 * Result of code execution.
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Output from execution (stdout or return value) */
  output?: string;

  /** Error message if execution failed */
  error?: string;

  /** Execution duration in milliseconds */
  executionTimeMs: number;

  /** Type of output returned */
  outputType: 'text' | 'json' | 'table' | 'error';

  /** Whether output was truncated due to size limits */
  truncated?: boolean;
}

/**
 * Manager for execution context lifecycle and code execution.
 */
export interface ExecutionContextManager {
  /**
   * Get or create an execution context for a path.
   * Creates a new E2B sandbox if needed.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   * @returns The active execution context
   * @throws Error if resource limits exceeded or sandbox creation fails
   */
  getOrCreateContext(identity: ExecutionContextIdentity): Promise<ExecutionContext>;

  /**
   * Execute code in a path's sandbox.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   * @param code - The code to execute
   * @param language - Programming language ('javascript' | 'python')
   * @returns Execution result
   */
  executeCode(
    identity: ExecutionContextIdentity,
    code: string,
    language: 'javascript' | 'python'
  ): Promise<ExecutionResult>;

  /**
   * Terminate a path's execution context.
   * Kills the E2B sandbox and marks context as terminated.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   */
  terminateContext(identity: ExecutionContextIdentity): Promise<void>;

  /**
   * Cleanup expired contexts. Called by background job.
   *
   * @returns Number of contexts cleaned up
   */
  cleanupExpiredContexts(): Promise<number>;

  /**
   * Check if a path has an active execution context.
   *
   * @param identity - The (tenantId, conversationId, pathId) tuple
   * @returns true if an active context exists
   */
  hasActiveContext(identity: ExecutionContextIdentity): Promise<boolean>;
}
```

### 5.2 Implementation Sketch

```ts
import { Sandbox } from '@e2b/code-interpreter';

export class DefaultExecutionContextManager implements ExecutionContextManager {
  private readonly store: ExecutionContextStore;
  private readonly egressGuard: EgressGuard;
  private readonly logger: Logger;
  private readonly config: Required<ExecutionContextManagerConfig>;

  // In-memory cache of active sandbox connections
  private readonly activeSandboxes = new Map<string, Sandbox>();

  constructor(deps: ExecutionContextManagerDeps) {
    this.store = deps.executionContextStore;
    this.egressGuard = deps.egressGuard;
    this.logger = deps.logger;
    this.config = {
      sandboxTtlMs: deps.config?.sandboxTtlMs ?? 30 * 60 * 1000, // 30 min
      maxExecutionsPerContext: deps.config?.maxExecutionsPerContext ?? 100,
      maxConcurrentContextsPerTenant: deps.config?.maxConcurrentContextsPerTenant ?? 10,
      sandboxTemplate: deps.config?.sandboxTemplate ?? 'base',
      sandboxCreationTimeoutMs: deps.config?.sandboxCreationTimeoutMs ?? 60000,
    };
  }

  async getOrCreateContext(identity: ExecutionContextIdentity): Promise<ExecutionContext> {
    // 1. Check for existing active context
    const existing = await this.store.load(identity);

    if (existing && this.isContextUsable(existing)) {
      this.logger.debug({ identity }, 'Reusing existing execution context');
      return existing;
    }

    // 2. Check tenant resource limits
    const activeCount = await this.store.listActiveForTenant(identity.tenantId);
    if (activeCount.length >= this.config.maxConcurrentContextsPerTenant) {
      throw new Error(
        `Tenant ${identity.tenantId} has reached max concurrent contexts ` +
        `(${this.config.maxConcurrentContextsPerTenant})`
      );
    }

    // 3. Terminate old context if exists
    if (existing) {
      await this.terminateContext(identity);
    }

    // 4. Create new E2B sandbox
    this.logger.info({ identity }, 'Creating new execution context');

    const sandbox = await Sandbox.create({
      timeoutMs: this.config.sandboxCreationTimeoutMs,
      envs: {
        TENANT_ID: identity.tenantId,
        CONVERSATION_ID: identity.conversationId,
        PATH_ID: identity.pathId,
      },
    });

    const mcpUrl = sandbox.getMcpUrl();
    const mcpToken = sandbox.getMcpToken();

    // 5. Create context record
    const now = new Date();
    const context: ExecutionContext = {
      sandboxId: sandbox.sandboxId,
      mcpUrl,
      mcpToken,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + this.config.sandboxTtlMs),
      executionCount: 0,
      totalExecutionTimeMs: 0,
      status: 'active',
    };

    await this.store.save(identity, context);

    // 6. Cache sandbox connection
    this.activeSandboxes.set(this.cacheKey(identity), sandbox);

    return context;
  }

  async executeCode(
    identity: ExecutionContextIdentity,
    code: string,
    language: 'javascript' | 'python'
  ): Promise<ExecutionResult> {
    const context = await this.getOrCreateContext(identity);
    const startTime = Date.now();

    try {
      // Get or reconnect to sandbox
      const sandbox = await this.getSandbox(identity, context);

      // Execute code
      const result = await sandbox.runCode(code, { language });

      const executionTimeMs = Date.now() - startTime;

      // Record execution
      await this.store.recordExecution(identity, executionTimeMs);

      // Check if context needs rotation
      const updatedContext = await this.store.load(identity);
      if (
        updatedContext &&
        updatedContext.executionCount >= this.config.maxExecutionsPerContext
      ) {
        this.logger.info({ identity }, 'Context reached max executions, will rotate on next call');
        await this.terminateContext(identity);
      }

      return {
        success: true,
        output: this.sanitizeOutput(result.logs.join('\n')),
        executionTimeMs,
        outputType: this.detectOutputType(result),
        truncated: result.logs.join('').length > 50000,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error({ identity, error: errorMessage }, 'Code execution failed');

      // Mark context as error
      await this.store.save(identity, {
        ...context,
        status: 'error',
        lastError: errorMessage,
      });

      return {
        success: false,
        error: this.sanitizeErrorMessage(errorMessage),
        executionTimeMs,
        outputType: 'error',
      };
    }
  }

  async terminateContext(identity: ExecutionContextIdentity): Promise<void> {
    const context = await this.store.load(identity);
    if (!context) return;

    try {
      // Kill sandbox
      const sandbox = this.activeSandboxes.get(this.cacheKey(identity));
      if (sandbox) {
        await sandbox.kill();
        this.activeSandboxes.delete(this.cacheKey(identity));
      } else {
        // Try to kill by sandbox ID
        await Sandbox.kill(context.sandboxId);
      }
    } catch (error) {
      this.logger.warn({ identity, error }, 'Failed to kill sandbox');
    }

    await this.store.terminate(identity, 'manual');
  }

  async cleanupExpiredContexts(): Promise<number> {
    const now = new Date();
    const expired = await this.store.listExpired(now);

    let cleanedCount = 0;
    for (const identity of expired) {
      try {
        await this.terminateContext(identity);
        cleanedCount++;
      } catch (error) {
        this.logger.warn({ identity, error }, 'Failed to cleanup expired context');
      }
    }

    this.logger.info({ cleanedCount }, 'Expired contexts cleanup completed');
    return cleanedCount;
  }

  async hasActiveContext(identity: ExecutionContextIdentity): Promise<boolean> {
    const context = await this.store.load(identity);
    return context !== null && this.isContextUsable(context);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private cacheKey(identity: ExecutionContextIdentity): string {
    return `${identity.tenantId}:${identity.conversationId}:${identity.pathId}`;
  }

  private isContextUsable(context: ExecutionContext): boolean {
    if (context.status !== 'active') return false;
    if (context.expiresAt < new Date()) return false;
    if (context.executionCount >= this.config.maxExecutionsPerContext) return false;
    return true;
  }

  private async getSandbox(
    identity: ExecutionContextIdentity,
    context: ExecutionContext
  ): Promise<Sandbox> {
    const cached = this.activeSandboxes.get(this.cacheKey(identity));
    if (cached) return cached;

    // Reconnect to existing sandbox
    const sandbox = await Sandbox.connect(context.sandboxId);
    this.activeSandboxes.set(this.cacheKey(identity), sandbox);
    return sandbox;
  }

  private sanitizeOutput(output: string): string {
    // Apply egress guard sanitization
    return this.egressGuard.sanitize(output);
  }

  private sanitizeErrorMessage(error: string): string {
    // Remove sensitive paths and internal details
    return error
      .replace(/\/home\/[^\/]+/g, '/home/sandbox')
      .replace(/at .+\(.+:\d+:\d+\)/g, 'at [internal]');
  }

  private detectOutputType(result: { logs: string[] }): ExecutionResult['outputType'] {
    const output = result.logs.join('');
    try {
      JSON.parse(output);
      return 'json';
    } catch {
      if (output.includes('|') && output.split('\n').length > 1) {
        return 'table';
      }
      return 'text';
    }
  }
}
```

---

## 6. Integration with Conversation Paths

### 6.1 Path Lifecycle Events

The execution context must respond to path lifecycle events:

| Event | Execution Context Behavior |
|-------|---------------------------|
| **Path created (branch)** | No context created (lazy) |
| **Message appended** | No change |
| **Message edited (same path)** | Reuse existing context |
| **Path merged** | Terminate source path's context |
| **Path deleted** | Terminate context |
| **Path archived** | Terminate context |

### 6.2 Branch Isolation

When a user branches from a message:

```ts
// In ConversationPathStore.branchFromMessage()
async branchFromMessage(input: BranchInput): Promise<BranchResult> {
  // ... create new path ...

  // NOTE: No execution context is created here.
  // The branch will get its own context lazily on first run_code call.
  // This ensures branches are isolated from parent path's sandbox state.

  return result;
}
```

### 6.3 Edit Continuity

When a user edits a message:

```ts
// In chat route handler
async handleChat(req: ChatRequest): Promise<Response> {
  const identity: ExecutionContextIdentity = {
    tenantId: req.tenantId,
    conversationId: req.conversationId,
    pathId: req.pathId, // Same path as before edit
  };

  // Any run_code calls will use the same path's execution context
  // This provides continuity (e.g., previously defined variables)
  // If the sandbox has expired, a new one is created transparently
}
```

### 6.4 Merge Cleanup

When a path is merged:

```ts
// In ConversationPathStore.mergePath()
async mergePath(input: MergeInput): Promise<MergeResult> {
  // ... merge logic ...

  // Cleanup source path's execution context
  if (this.executionContextManager) {
    await this.executionContextManager.terminateContext({
      tenantId: input.tenantId,
      conversationId: sourcePath.conversationId,
      pathId: input.sourcePathId,
    });
  }

  return result;
}
```

---

## 7. Egress Guard Integration

### 7.1 All Sandbox Egress Through Guard

```ts
// In ExecutionContextManager.executeCode()
private async withEgressGuard<T>(
  identity: ExecutionContextIdentity,
  fn: () => Promise<T>
): Promise<T> {
  const effectiveMode = this.egressGuard.resolveEffectiveMode({
    tenantId: identity.tenantId,
    taskType: 'sandbox-execution',
  });

  if (effectiveMode === 'enforce') {
    // E2B sandbox has network restrictions built in
    // We additionally sanitize output
  }

  const result = await fn();

  // Sanitize any output before returning
  if (typeof result === 'string') {
    return this.egressGuard.sanitize(result) as T;
  }

  return result;
}
```

### 7.2 Sandbox Network Configuration

E2B sandboxes are configured with restricted networking:

```ts
const sandbox = await Sandbox.create({
  // ... other config ...
  envs: {
    // Network restrictions
    HTTP_PROXY: '', // No proxy
    HTTPS_PROXY: '',
    NO_PROXY: '*', // Block all external
  },
  // MCP gateway is the only allowed external access
  allowedHosts: ['mcp-gateway.internal'],
});
```

---

## 8. Observability

### 8.1 OpenTelemetry Spans

```ts
import { withSpan } from '@reg-copilot/reg-intel-observability';

async getOrCreateContext(identity: ExecutionContextIdentity): Promise<ExecutionContext> {
  return withSpan(
    'execution_context.get_or_create',
    {
      'app.tenant.id': identity.tenantId,
      'app.conversation.id': identity.conversationId,
      'app.path.id': identity.pathId,
    },
    async () => {
      // ... implementation ...
    }
  );
}

async executeCode(/* ... */): Promise<ExecutionResult> {
  return withSpan(
    'execution_context.execute_code',
    {
      'app.tenant.id': identity.tenantId,
      'app.conversation.id': identity.conversationId,
      'app.path.id': identity.pathId,
      'code.language': language,
    },
    async () => {
      // ... implementation ...
    }
  );
}
```

### 8.2 Metrics

```ts
// Metrics to track
const METRICS = {
  contextsCreated: 'execution_context.created.total',
  contextsTerminated: 'execution_context.terminated.total',
  executionsTotal: 'execution_context.executions.total',
  executionDurationMs: 'execution_context.execution.duration_ms',
  executionErrors: 'execution_context.execution.errors.total',
  activeContextsGauge: 'execution_context.active.count',
};
```

---

## 9. Error Handling

### 9.1 Error Categories

| Error Type | Handling |
|------------|----------|
| **Sandbox creation failed** | Throw, let caller retry or report to user |
| **Sandbox connection lost** | Recreate context transparently |
| **Code execution timeout** | Return error result, keep context active |
| **Code execution error** | Return error result, mark context as error |
| **Resource limits exceeded** | Throw, require tenant to wait or cleanup |
| **Store operation failed** | Log and proceed (context is in-memory cache) |

### 9.2 Graceful Degradation

```ts
async executeCode(/* ... */): Promise<ExecutionResult> {
  try {
    const context = await this.getOrCreateContext(identity);
    // ... execution ...
  } catch (error) {
    if (error.message.includes('resource limit')) {
      // User-facing error
      return {
        success: false,
        error: 'Too many active analysis sessions. Please wait a moment.',
        executionTimeMs: 0,
        outputType: 'error',
      };
    }

    // Internal error - log and return generic message
    this.logger.error({ identity, error }, 'Execution context error');
    return {
      success: false,
      error: 'Code execution temporarily unavailable.',
      executionTimeMs: 0,
      outputType: 'error',
    };
  }
}
```

---

## 10. Security Considerations

### 10.1 Sandbox Isolation

- Each sandbox runs in an isolated E2B container.
- No filesystem persistence across sandbox restarts.
- Network restricted to allowlisted hosts only.

### 10.2 Code Execution Risks

| Risk | Mitigation |
|------|------------|
| Infinite loops | E2B execution timeout (30s default) |
| Memory exhaustion | E2B memory limits |
| Malicious code | LLM generates code, not user; sandbox isolation |
| Data exfiltration | Network restrictions + egress guard |
| Sensitive output | Output sanitization |

### 10.3 Credential Protection

- `mcpToken` is stored encrypted at rest in Supabase.
- Tokens are never logged.
- Tokens are never sent to LLM (only used for sandbox communication).

---

## 11. Future Considerations

### 11.1 v0.2 Potential Enhancements

1. **Sandbox state persistence**: Save/restore sandbox state for resumption.
2. **Pre-warmed sandbox pools**: Reduce cold start latency.
3. **Custom sandbox images**: Domain-specific tools pre-installed.
4. **Collaborative sandboxes**: Multiple users sharing execution context.

### 11.2 Non-Goals (v0.1)

- User-uploaded code execution (only LLM-generated code).
- Real-time sandbox streaming (batch results only).
- Sandbox customization per user (tenant-level config only).

---

## 12. Summary

The Execution Context specification defines:

1. **Data Model**: `ExecutionContext` keyed by `(tenantId, conversationId, pathId)`.
2. **Store Interface**: CRUD operations for execution contexts.
3. **Manager**: Lifecycle management with lazy creation and reuse.
4. **Path Integration**: Branch isolation, edit continuity, merge cleanup.
5. **Security**: Sandbox isolation, egress guard, output sanitization.
6. **Observability**: Spans, metrics, and error handling.

This enables LLM-callable code execution tools while maintaining the privacy and security invariants of the Regulatory Intelligence Copilot.
