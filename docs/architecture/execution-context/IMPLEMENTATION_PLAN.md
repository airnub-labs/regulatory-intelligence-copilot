# E2B Per-Path Execution Context - Implementation Plan v0.7

## Overview

This document provides a complete implementation plan for the E2B per-path execution context architecture as specified in:
- `docs/architecture/architecture_v_0_7.md`
- `docs/architecture/execution-context/spec_v_0_1.md`
- `docs/architecture/architecture_diagrams_v_0_7.md`

**Goal**: Enable each conversation path to have its own isolated E2B sandbox for code execution, with lazy creation, TTL-based lifecycle, and proper cleanup.

**Target**: Any coding agent should be able to use this plan to implement the feature incrementally, validate progress, and maintain state.

---

## Implementation State Tracking

### State File Location
`docs/architecture/execution-context/IMPLEMENTATION_STATE.json`

### State Schema
```json
{
  "version": "0.7.0",
  "lastUpdated": "2025-12-09T00:00:00Z",
  "phases": {
    "phase1": {
      "name": "Foundation - Execution Context Store",
      "status": "not_started | in_progress | completed",
      "completedTasks": [],
      "currentTask": null,
      "blockers": []
    }
  },
  "overallProgress": "0%",
  "notes": []
}
```

### Status Values
- `not_started` - Phase not begun
- `in_progress` - Currently working on this phase
- `completed` - All tasks completed and validated
- `blocked` - Cannot proceed due to dependencies

---

## Implementation Phases

### Phase 1: Foundation - Execution Context Store
**Duration Estimate**: 8-12 hours
**Dependencies**: None (foundational)

#### 1.1 Create Database Schema
**File**: `supabase/migrations/20251210000000_execution_contexts.sql`

**Tasks**:
- [ ] **Task 1.1.1**: Create `execution_contexts` table
  ```sql
  CREATE TABLE IF NOT EXISTS copilot_internal.execution_contexts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL REFERENCES copilot_internal.conversations(id) ON DELETE CASCADE,
    path_id uuid NOT NULL REFERENCES copilot_internal.conversation_paths(id) ON DELETE CASCADE,

    -- E2B sandbox details
    sandbox_id text NOT NULL,
    sandbox_status text NOT NULL CHECK (sandbox_status IN ('creating', 'ready', 'error', 'terminated')),

    -- Lifecycle
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    terminated_at timestamptz,

    -- Metadata
    error_message text,
    resource_usage jsonb,

    -- Unique constraint: one context per path
    UNIQUE(tenant_id, conversation_id, path_id)
  );
  ```

- [ ] **Task 1.1.2**: Create indexes
  ```sql
  CREATE INDEX idx_execution_contexts_tenant ON copilot_internal.execution_contexts(tenant_id);
  CREATE INDEX idx_execution_contexts_path ON copilot_internal.execution_contexts(path_id);
  CREATE INDEX idx_execution_contexts_expires ON copilot_internal.execution_contexts(expires_at)
    WHERE terminated_at IS NULL;
  CREATE INDEX idx_execution_contexts_sandbox ON copilot_internal.execution_contexts(sandbox_id);
  ```

- [ ] **Task 1.1.3**: Enable RLS policies
  ```sql
  ALTER TABLE copilot_internal.execution_contexts ENABLE ROW LEVEL SECURITY;

  CREATE POLICY execution_contexts_service_role ON copilot_internal.execution_contexts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  CREATE POLICY execution_contexts_tenant_read ON copilot_internal.execution_contexts
    FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
  ```

- [ ] **Task 1.1.4**: Grant permissions
  ```sql
  GRANT ALL PRIVILEGES ON TABLE copilot_internal.execution_contexts TO service_role;
  GRANT SELECT ON TABLE copilot_internal.execution_contexts TO authenticated;
  ```

**Validation**:
```bash
# Run migration
pnpm supabase migration run

# Verify table exists
psql -c "\d copilot_internal.execution_contexts"

# Verify indexes
psql -c "\di copilot_internal.idx_execution_contexts*"

# Test RLS
psql -c "SELECT * FROM copilot_internal.execution_contexts;" # Should work as service_role
```

**Acceptance Criteria**:
- ✅ Migration runs without errors
- ✅ Table has correct columns and constraints
- ✅ All indexes created
- ✅ RLS policies active
- ✅ Permissions granted

---

#### 1.2 Create ExecutionContextStore Interface
**File**: `packages/reg-intel-conversations/src/executionContextStores.ts`

**Tasks**:
- [ ] **Task 1.2.1**: Define TypeScript types
  ```typescript
  export interface ExecutionContext {
    id: string;
    tenantId: string;
    conversationId: string;
    pathId: string;
    sandboxId: string;
    sandboxStatus: 'creating' | 'ready' | 'error' | 'terminated';
    createdAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
    terminatedAt?: Date | null;
    errorMessage?: string | null;
    resourceUsage?: Record<string, unknown>;
  }

  export interface CreateExecutionContextInput {
    tenantId: string;
    conversationId: string;
    pathId: string;
    sandboxId: string;
    ttlMinutes?: number; // Default 30
  }

  export interface ExecutionContextStore {
    // Create new execution context for a path
    createContext(input: CreateExecutionContextInput): Promise<ExecutionContext>;

    // Get execution context by path
    getContextByPath(input: {
      tenantId: string;
      conversationId: string;
      pathId: string;
    }): Promise<ExecutionContext | null>;

    // Update last used timestamp (extends TTL)
    touchContext(contextId: string): Promise<void>;

    // Update sandbox status
    updateStatus(contextId: string, status: ExecutionContext['sandboxStatus'], errorMessage?: string): Promise<void>;

    // Terminate context (soft delete)
    terminateContext(contextId: string): Promise<void>;

    // Get expired contexts for cleanup
    getExpiredContexts(limit?: number): Promise<ExecutionContext[]>;

    // Health check
    isReady(): Promise<boolean>;
  }
  ```

- [ ] **Task 1.2.2**: Implement InMemoryExecutionContextStore
  ```typescript
  export class InMemoryExecutionContextStore implements ExecutionContextStore {
    private contexts = new Map<string, ExecutionContext>();
    private pathIndex = new Map<string, string>(); // pathId -> contextId

    async createContext(input: CreateExecutionContextInput): Promise<ExecutionContext> {
      const id = crypto.randomUUID();
      const now = new Date();
      const ttl = input.ttlMinutes ?? 30;

      const context: ExecutionContext = {
        id,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pathId: input.pathId,
        sandboxId: input.sandboxId,
        sandboxStatus: 'creating',
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + ttl * 60 * 1000),
      };

      this.contexts.set(id, context);
      this.pathIndex.set(input.pathId, id);

      return context;
    }

    // ... implement remaining methods
  }
  ```

- [ ] **Task 1.2.3**: Implement SupabaseExecutionContextStore
  ```typescript
  export class SupabaseExecutionContextStore implements ExecutionContextStore {
    constructor(
      private supabase: SupabaseClient,
      private logger?: Logger
    ) {}

    async createContext(input: CreateExecutionContextInput): Promise<ExecutionContext> {
      const ttl = input.ttlMinutes ?? 30;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 60 * 1000);

      const { data, error } = await this.supabase
        .from('execution_contexts')
        .insert({
          tenant_id: input.tenantId,
          conversation_id: input.conversationId,
          path_id: input.pathId,
          sandbox_id: input.sandboxId,
          sandbox_status: 'creating',
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create execution context: ${error.message}`);

      return this.mapRow(data);
    }

    private mapRow(row: any): ExecutionContext {
      return {
        id: row.id,
        tenantId: row.tenant_id,
        conversationId: row.conversation_id,
        pathId: row.path_id,
        sandboxId: row.sandbox_id,
        sandboxStatus: row.sandbox_status,
        createdAt: new Date(row.created_at),
        lastUsedAt: new Date(row.last_used_at),
        expiresAt: new Date(row.expires_at),
        terminatedAt: row.terminated_at ? new Date(row.terminated_at) : null,
        errorMessage: row.error_message,
        resourceUsage: row.resource_usage,
      };
    }

    // ... implement remaining methods
  }
  ```

**Validation**:
```typescript
// Test file: packages/reg-intel-conversations/src/__tests__/executionContextStores.test.ts
describe('ExecutionContextStore', () => {
  it('should create context with default TTL', async () => {
    const store = new InMemoryExecutionContextStore();
    const context = await store.createContext({
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      pathId: 'path-1',
      sandboxId: 'sb_123',
    });

    expect(context.sandboxStatus).toBe('creating');
    expect(context.expiresAt.getTime() - context.createdAt.getTime())
      .toBeCloseTo(30 * 60 * 1000, -2);
  });

  it('should retrieve context by path', async () => {
    const store = new InMemoryExecutionContextStore();
    const created = await store.createContext({
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      pathId: 'path-1',
      sandboxId: 'sb_123',
    });

    const retrieved = await store.getContextByPath({
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      pathId: 'path-1',
    });

    expect(retrieved?.id).toBe(created.id);
  });

  // Add tests for touchContext, updateStatus, terminateContext, getExpiredContexts
});
```

**Acceptance Criteria**:
- ✅ TypeScript types defined and exported
- ✅ InMemoryExecutionContextStore fully implemented
- ✅ SupabaseExecutionContextStore fully implemented
- ✅ All methods have error handling
- ✅ Unit tests pass (>80% coverage)
- ✅ `pnpm build` succeeds

---

#### 1.3 Create ExecutionContextManager
**File**: `packages/reg-intel-conversations/src/executionContextManager.ts`

**Tasks**:
- [ ] **Task 1.3.1**: Implement ExecutionContextManager class
  ```typescript
  import { Sandbox } from '@e2b/code-interpreter';
  import type { ExecutionContextStore, ExecutionContext } from './executionContextStores.js';
  import type { Logger } from './types.js';

  export interface ExecutionContextManagerConfig {
    store: ExecutionContextStore;
    e2bApiKey: string;
    defaultTtlMinutes?: number;
    logger?: Logger;
  }

  export class ExecutionContextManager {
    private activeSandboxes = new Map<string, Sandbox>(); // contextId -> Sandbox

    constructor(private config: ExecutionContextManagerConfig) {}

    /**
     * Get or create execution context for a path.
     * Returns existing context if found, creates new one if not.
     */
    async getOrCreateContext(input: {
      tenantId: string;
      conversationId: string;
      pathId: string;
    }): Promise<{ context: ExecutionContext; sandbox: Sandbox }> {
      // Try to get existing context
      let context = await this.config.store.getContextByPath(input);

      if (context && context.terminatedAt) {
        // Context was terminated, create new one
        context = null;
      }

      if (context) {
        // Extend TTL by touching
        await this.config.store.touchContext(context.id);

        // Get or create sandbox
        let sandbox = this.activeSandboxes.get(context.id);
        if (!sandbox) {
          // Reconnect to existing sandbox
          sandbox = await Sandbox.reconnect(context.sandboxId);
          this.activeSandboxes.set(context.id, sandbox);
        }

        return { context, sandbox };
      }

      // Create new sandbox
      const sandbox = await Sandbox.create({
        apiKey: this.config.e2bApiKey,
        timeout: 600_000, // 10 minutes
      });

      // Create execution context
      context = await this.config.store.createContext({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pathId: input.pathId,
        sandboxId: sandbox.sandboxId,
        ttlMinutes: this.config.defaultTtlMinutes,
      });

      // Mark as ready
      await this.config.store.updateStatus(context.id, 'ready');
      context.sandboxStatus = 'ready';

      // Cache sandbox
      this.activeSandboxes.set(context.id, sandbox);

      this.config.logger?.info('[ExecutionContextManager] Created new context', {
        contextId: context.id,
        pathId: input.pathId,
        sandboxId: sandbox.sandboxId,
      });

      return { context, sandbox };
    }

    /**
     * Terminate execution context and kill sandbox
     */
    async terminateContext(contextId: string): Promise<void> {
      const sandbox = this.activeSandboxes.get(contextId);
      if (sandbox) {
        await sandbox.kill();
        this.activeSandboxes.delete(contextId);
      }

      await this.config.store.terminateContext(contextId);

      this.config.logger?.info('[ExecutionContextManager] Terminated context', { contextId });
    }

    /**
     * Cleanup expired contexts (run periodically)
     */
    async cleanupExpired(): Promise<number> {
      const expired = await this.config.store.getExpiredContexts(50);

      for (const context of expired) {
        try {
          await this.terminateContext(context.id);
        } catch (error) {
          this.config.logger?.error('[ExecutionContextManager] Failed to cleanup context', {
            contextId: context.id,
            error,
          });
        }
      }

      return expired.length;
    }
  }
  ```

**Validation**:
```typescript
// Test file: packages/reg-intel-conversations/src/__tests__/executionContextManager.test.ts
describe('ExecutionContextManager', () => {
  it('should create new context on first call', async () => {
    const mockStore = createMockStore();
    const manager = new ExecutionContextManager({
      store: mockStore,
      e2bApiKey: 'test-key',
    });

    const { context, sandbox } = await manager.getOrCreateContext({
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      pathId: 'path-1',
    });

    expect(context.sandboxStatus).toBe('ready');
    expect(sandbox).toBeDefined();
    expect(mockStore.createContext).toHaveBeenCalledTimes(1);
  });

  it('should reuse existing context on second call', async () => {
    const mockStore = createMockStore();
    const manager = new ExecutionContextManager({
      store: mockStore,
      e2bApiKey: 'test-key',
    });

    const first = await manager.getOrCreateContext({
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      pathId: 'path-1',
    });

    const second = await manager.getOrCreateContext({
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      pathId: 'path-1',
    });

    expect(first.context.id).toBe(second.context.id);
    expect(mockStore.createContext).toHaveBeenCalledTimes(1);
    expect(mockStore.touchContext).toHaveBeenCalled();
  });

  it('should cleanup expired contexts', async () => {
    // Test cleanup logic
  });
});
```

**Acceptance Criteria**:
- ✅ ExecutionContextManager implemented
- ✅ Lazy sandbox creation works
- ✅ Sandbox reuse works
- ✅ TTL extension on touch works
- ✅ Cleanup method works
- ✅ Unit tests pass
- ✅ `pnpm build` succeeds

---

### Phase 2: Tool Integration - Code Execution Tools
**Duration Estimate**: 6-10 hours
**Dependencies**: Phase 1 completed

#### 2.1 Create Code Execution Tools
**File**: `packages/reg-intel-llm/src/tools/codeExecutionTools.ts`

**Tasks**:
- [ ] **Task 2.1.1**: Define `run_code` tool
  ```typescript
  import { z } from 'zod';
  import type { Sandbox } from '@e2b/code-interpreter';

  export const runCodeToolSchema = z.object({
    language: z.enum(['python', 'javascript', 'typescript', 'bash']).describe('Programming language'),
    code: z.string().describe('Code to execute in the sandbox'),
    description: z.string().optional().describe('Optional description of what this code does'),
  });

  export type RunCodeInput = z.infer<typeof runCodeToolSchema>;

  export async function executeCode(
    input: RunCodeInput,
    sandbox: Sandbox
  ): Promise<{ stdout: string; stderr: string; exitCode: number; error?: string }> {
    try {
      const result = await sandbox.runCode(input.code, {
        language: input.language,
      });

      return {
        stdout: result.logs.stdout.join('\n'),
        stderr: result.logs.stderr.join('\n'),
        exitCode: result.exitCode ?? 0,
      };
    } catch (error) {
      return {
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  ```

- [ ] **Task 2.1.2**: Define `run_analysis` tool
  ```typescript
  export const runAnalysisToolSchema = z.object({
    analysisType: z.enum(['tax_calculation', 'compliance_check', 'data_analysis']).describe('Type of analysis'),
    parameters: z.record(z.unknown()).describe('Analysis parameters'),
    code: z.string().optional().describe('Optional custom code to run'),
  });

  export type RunAnalysisInput = z.infer<typeof runAnalysisToolSchema>;

  export async function executeAnalysis(
    input: RunAnalysisInput,
    sandbox: Sandbox
  ): Promise<{ result: unknown; stdout: string; stderr: string }> {
    // Generate Python code based on analysis type
    const code = input.code ?? generateAnalysisCode(input.analysisType, input.parameters);

    const result = await sandbox.runCode(code, { language: 'python' });

    return {
      result: result.results,
      stdout: result.logs.stdout.join('\n'),
      stderr: result.logs.stderr.join('\n'),
    };
  }

  function generateAnalysisCode(type: string, params: Record<string, unknown>): string {
    // Generate analysis code based on type
    switch (type) {
      case 'tax_calculation':
        return `
import json
params = ${JSON.stringify(params)}
# Perform tax calculation
result = calculate_tax(params)
print(json.dumps(result))
`;
      // ... other types
    }
  }
  ```

**Validation**:
```typescript
// Test file: packages/reg-intel-llm/src/tools/__tests__/codeExecutionTools.test.ts
describe('Code Execution Tools', () => {
  it('should execute Python code', async () => {
    const mockSandbox = createMockSandbox();
    const result = await executeCode({
      language: 'python',
      code: 'print("Hello World")',
    }, mockSandbox);

    expect(result.stdout).toContain('Hello World');
    expect(result.exitCode).toBe(0);
  });

  it('should handle execution errors', async () => {
    const mockSandbox = createMockSandbox();
    const result = await executeCode({
      language: 'python',
      code: 'raise ValueError("test error")',
    }, mockSandbox);

    expect(result.stderr).toContain('ValueError');
    expect(result.exitCode).not.toBe(0);
  });
});
```

**Acceptance Criteria**:
- ✅ Both tools defined with Zod schemas
- ✅ Tools execute code in E2B sandbox
- ✅ Error handling implemented
- ✅ Unit tests pass
- ✅ `pnpm build` succeeds

---

#### 2.2 Register Tools in ComplianceEngine
**File**: `packages/reg-intel-llm/src/complianceEngine.ts`

**Tasks**:
- [ ] **Task 2.2.1**: Import code execution tools
  ```typescript
  import { runCodeToolSchema, executeCode } from './tools/codeExecutionTools.js';
  import { runAnalysisToolSchema, executeAnalysis } from './tools/codeExecutionTools.js';
  ```

- [ ] **Task 2.2.2**: Add sandbox to engine context
  ```typescript
  export interface ComplianceEngineContext {
    // ... existing fields
    executionSandbox?: Sandbox; // Optional E2B sandbox for code execution
  }
  ```

- [ ] **Task 2.2.3**: Register tools conditionally
  ```typescript
  async initializeTools(context: ComplianceEngineContext): Promise<void> {
    // ... existing tools registration

    // Register code execution tools if sandbox available
    if (context.executionSandbox) {
      this.tools.set('run_code', {
        schema: runCodeToolSchema,
        execute: async (input: RunCodeInput) => {
          return executeCode(input, context.executionSandbox!);
        },
      });

      this.tools.set('run_analysis', {
        schema: runAnalysisToolSchema,
        execute: async (input: RunAnalysisInput) => {
          return executeAnalysis(input, context.executionSandbox!);
        },
      });

      this.logger.info('[ComplianceEngine] Code execution tools registered');
    }
  }
  ```

**Validation**:
```typescript
// Test file: packages/reg-intel-llm/src/__tests__/complianceEngine.test.ts
describe('ComplianceEngine with Execution Tools', () => {
  it('should register code execution tools when sandbox provided', async () => {
    const mockSandbox = createMockSandbox();
    const engine = new ComplianceEngine({
      // ... config
    });

    await engine.initializeTools({
      executionSandbox: mockSandbox,
    });

    expect(engine.hasTools('run_code')).toBe(true);
    expect(engine.hasTools('run_analysis')).toBe(true);
  });

  it('should NOT register code tools when sandbox not provided', async () => {
    const engine = new ComplianceEngine({
      // ... config
    });

    await engine.initializeTools({});

    expect(engine.hasTools('run_code')).toBe(false);
    expect(engine.hasTools('run_analysis')).toBe(false);
  });
});
```

**Acceptance Criteria**:
- ✅ Tools registered when sandbox available
- ✅ Tools NOT registered when sandbox unavailable
- ✅ Engine context updated with sandbox field
- ✅ Unit tests pass
- ✅ `pnpm build` succeeds

---

### Phase 3: Path Integration - Wire pathId Through Chat Flow
**Duration Estimate**: 10-14 hours
**Dependencies**: Phase 1 & 2 completed

#### 3.1 Update Chat Handler to Use ExecutionContextManager
**File**: `packages/reg-intel-next-adapter/src/index.ts`

**Tasks**:
- [ ] **Task 3.1.1**: Import ExecutionContextManager
  ```typescript
  import { ExecutionContextManager } from '@reg-copilot/reg-intel-conversations';
  ```

- [ ] **Task 3.1.2**: Add manager to handler config
  ```typescript
  export interface ChatHandlerConfig {
    // ... existing config
    executionContextManager?: ExecutionContextManager;
  }
  ```

- [ ] **Task 3.1.3**: Get pathId from conversation
  ```typescript
  export async function handleChatRequest(
    request: Request,
    config: ChatHandlerConfig
  ): Promise<Response> {
    // ... existing logic to get conversationId

    // Get active pathId
    const conversation = await config.conversationStore.getConversation({
      tenantId,
      conversationId,
    });

    const pathId = conversation?.activePathId;
    if (!pathId) {
      return new Response('No active path found', { status: 400 });
    }

    // ... continue
  }
  ```

- [ ] **Task 3.1.4**: Get or create execution context
  ```typescript
  // Get execution context if manager available
  let executionSandbox: Sandbox | undefined;

  if (config.executionContextManager && pathId) {
    try {
      const { sandbox } = await config.executionContextManager.getOrCreateContext({
        tenantId,
        conversationId,
        pathId,
      });
      executionSandbox = sandbox;

      logger.info('[chat-handler] Using execution context', { pathId, sandboxId: sandbox.sandboxId });
    } catch (error) {
      logger.error('[chat-handler] Failed to get execution context', { error });
      // Continue without sandbox - code tools won't be available
    }
  }
  ```

- [ ] **Task 3.1.5**: Pass sandbox to ComplianceEngine
  ```typescript
  const engine = new ComplianceEngine({
    // ... existing config
  });

  await engine.initializeTools({
    // ... existing context
    executionSandbox,
  });
  ```

**Validation**:
```typescript
// Integration test
describe('Chat Handler with Execution Context', () => {
  it('should create execution context on first message with code', async () => {
    const mockManager = createMockManager();
    const handler = createChatHandler({
      executionContextManager: mockManager,
    });

    const response = await handler(createMockRequest({
      message: 'Calculate VAT: print(0.23 * 1000)',
    }));

    expect(mockManager.getOrCreateContext).toHaveBeenCalledWith({
      tenantId: expect.any(String),
      conversationId: expect.any(String),
      pathId: expect.any(String),
    });
  });

  it('should reuse execution context on subsequent messages', async () => {
    const mockManager = createMockManager();
    const handler = createChatHandler({
      executionContextManager: mockManager,
    });

    // First message
    await handler(createMockRequest({ message: 'msg 1' }));

    // Second message
    await handler(createMockRequest({ message: 'msg 2' }));

    expect(mockManager.getOrCreateContext).toHaveBeenCalledTimes(2);
    // Should return same context both times
  });
});
```

**Acceptance Criteria**:
- ✅ pathId extracted from conversation
- ✅ ExecutionContextManager called with correct pathId
- ✅ Sandbox passed to ComplianceEngine
- ✅ Error handling for manager failures
- ✅ Integration tests pass
- ✅ `pnpm build` succeeds

---

#### 3.2 Update API Route to Initialize Manager
**File**: `apps/demo-web/src/app/api/chat/route.ts`

**Tasks**:
- [ ] **Task 3.2.1**: Create ExecutionContextManager singleton
  ```typescript
  import { ExecutionContextManager } from '@reg-copilot/reg-intel-conversations';
  import { getExecutionContextStore } from '@/lib/executionContextStore';

  let executionContextManager: ExecutionContextManager | undefined;

  function getExecutionContextManager(): ExecutionContextManager | undefined {
    if (!process.env.E2B_API_KEY) {
      console.warn('[chat/route] E2B_API_KEY not configured - code execution disabled');
      return undefined;
    }

    if (!executionContextManager) {
      const store = getExecutionContextStore();
      executionContextManager = new ExecutionContextManager({
        store,
        e2bApiKey: process.env.E2B_API_KEY,
        defaultTtlMinutes: 30,
      });

      console.info('[chat/route] ExecutionContextManager initialized');
    }

    return executionContextManager;
  }
  ```

- [ ] **Task 3.2.2**: Create helper to get execution store
  **File**: `apps/demo-web/src/lib/executionContextStore.ts`
  ```typescript
  import {
    ExecutionContextStore,
    InMemoryExecutionContextStore,
    SupabaseExecutionContextStore
  } from '@reg-copilot/reg-intel-conversations';
  import { getSupabaseClient } from './supabase';

  let store: ExecutionContextStore | undefined;

  export function getExecutionContextStore(): ExecutionContextStore {
    if (store) return store;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = getSupabaseClient();
      store = new SupabaseExecutionContextStore(supabase);
      console.info('[execution-store:auto] Using SupabaseExecutionContextStore');
    } else {
      store = new InMemoryExecutionContextStore();
      console.info('[execution-store:auto] Using InMemoryExecutionContextStore');
    }

    return store;
  }
  ```

- [ ] **Task 3.2.3**: Pass manager to chat handler
  ```typescript
  export async function POST(request: Request) {
    const manager = getExecutionContextManager();

    return handleChatRequest(request, {
      // ... existing config
      executionContextManager: manager,
    });
  }
  ```

**Validation**:
```bash
# Test API route
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Calculate 0.23 * 1000 using Python",
    "conversationId": "test-conv-id"
  }'

# Should see in logs:
# [ExecutionContextManager] Created new context
# [chat-handler] Using execution context
```

**Acceptance Criteria**:
- ✅ Manager singleton created
- ✅ Store helper implemented
- ✅ Manager passed to handler
- ✅ E2B_API_KEY check works
- ✅ Manual API test succeeds
- ✅ `pnpm build` succeeds

---

#### 3.3 Handle Path Lifecycle Events
**File**: `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/merge/route.ts`

**Tasks**:
- [ ] **Task 3.3.1**: Terminate source path context on merge
  ```typescript
  export async function POST(request: Request, { params }: RouteParams) {
    const { id: conversationId, pathId: sourcePathId } = params;

    // ... existing merge logic

    // After merge completes, terminate source path's execution context
    const manager = getExecutionContextManager();
    if (manager) {
      try {
        const context = await manager.config.store.getContextByPath({
          tenantId,
          conversationId,
          pathId: sourcePathId,
        });

        if (context) {
          await manager.terminateContext(context.id);
          console.info('[merge] Terminated source path execution context', {
            pathId: sourcePathId,
            contextId: context.id,
          });
        }
      } catch (error) {
        console.error('[merge] Failed to terminate execution context', { error });
        // Don't fail merge if cleanup fails
      }
    }

    return Response.json({ success: true });
  }
  ```

**Validation**:
```bash
# Test merge cleanup
curl -X POST http://localhost:3000/api/conversations/conv-1/paths/path-1/merge \
  -H "Content-Type: application/json" \
  -d '{
    "targetPathId": "main",
    "mode": "summary"
  }'

# Check logs for:
# [merge] Terminated source path execution context
```

**Acceptance Criteria**:
- ✅ Source context terminated on merge
- ✅ Merge still succeeds if cleanup fails
- ✅ Logs show termination
- ✅ Integration test passes
- ✅ `pnpm build` succeeds

---

### Phase 4: Observability & Production Readiness
**Duration Estimate**: 6-8 hours
**Dependencies**: Phase 3 completed

#### 4.1 Add OpenTelemetry Spans
**File**: `packages/reg-intel-conversations/src/executionContextManager.ts`

**Tasks**:
- [ ] **Task 4.1.1**: Add spans to getOrCreateContext
  ```typescript
  import { trace } from '@opentelemetry/api';

  async getOrCreateContext(input: GetContextInput): Promise<GetContextResult> {
    const tracer = trace.getTracer('execution-context-manager');

    return tracer.startActiveSpan('getOrCreateContext', async (span) => {
      span.setAttributes({
        'path.id': input.pathId,
        'conversation.id': input.conversationId,
        'tenant.id': input.tenantId,
      });

      try {
        // ... existing logic

        span.setAttributes({
          'context.id': context.id,
          'context.created': !existingContext,
          'sandbox.id': sandbox.sandboxId,
        });

        return { context, sandbox };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  ```

- [ ] **Task 4.1.2**: Add spans to tool executions
  ```typescript
  // In codeExecutionTools.ts
  export async function executeCode(input: RunCodeInput, sandbox: Sandbox) {
    const tracer = trace.getTracer('code-execution-tools');

    return tracer.startActiveSpan('executeCode', async (span) => {
      span.setAttributes({
        'code.language': input.language,
        'code.length': input.code.length,
      });

      try {
        const result = await sandbox.runCode(input.code, {
          language: input.language,
        });

        span.setAttributes({
          'execution.exitCode': result.exitCode ?? 0,
          'execution.stdout.length': result.logs.stdout.join('').length,
          'execution.stderr.length': result.logs.stderr.join('').length,
        });

        return {
          stdout: result.logs.stdout.join('\n'),
          stderr: result.logs.stderr.join('\n'),
          exitCode: result.exitCode ?? 0,
        };
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
  ```

**Validation**:
```bash
# Run with observability enabled
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm dev

# Execute code in chat
# Check traces in Jaeger/your observability backend
```

**Acceptance Criteria**:
- ✅ Spans added to all major operations
- ✅ Attributes include relevant context
- ✅ Errors recorded as exceptions
- ✅ Traces visible in observability backend
- ✅ `pnpm build` succeeds

---

#### 4.2 Add Metrics
**File**: `packages/reg-intel-conversations/src/executionContextManager.ts`

**Tasks**:
- [ ] **Task 4.2.1**: Add metrics collection
  ```typescript
  import { metrics } from '@opentelemetry/api';

  export class ExecutionContextManager {
    private meter = metrics.getMeter('execution-context-manager');

    // Metrics
    private contextCreationCounter = this.meter.createCounter('execution_context.created', {
      description: 'Number of execution contexts created',
    });

    private contextTerminationCounter = this.meter.createCounter('execution_context.terminated', {
      description: 'Number of execution contexts terminated',
    });

    private activeSandboxGauge = this.meter.createObservableGauge('execution_context.active_sandboxes', {
      description: 'Number of active sandboxes',
    });

    private codeExecutionCounter = this.meter.createCounter('code_execution.total', {
      description: 'Total code executions',
    });

    private codeExecutionDuration = this.meter.createHistogram('code_execution.duration_ms', {
      description: 'Code execution duration in milliseconds',
    });

    constructor(config: ExecutionContextManagerConfig) {
      super(config);

      // Register gauge callback
      this.activeSandboxGauge.addCallback((result) => {
        result.observe(this.activeSandboxes.size);
      });
    }

    async getOrCreateContext(input: GetContextInput): Promise<GetContextResult> {
      const isNew = !existingContext;

      // ... logic

      if (isNew) {
        this.contextCreationCounter.add(1, {
          'tenant.id': input.tenantId,
        });
      }

      return { context, sandbox };
    }
  }
  ```

**Validation**:
```bash
# Check Prometheus metrics endpoint
curl http://localhost:3000/metrics | grep execution_context

# Should see:
# execution_context_created_total{tenant_id="..."} 5
# execution_context_active_sandboxes 3
# code_execution_total{language="python"} 12
```

**Acceptance Criteria**:
- ✅ Counters for creation/termination
- ✅ Gauge for active sandboxes
- ✅ Histogram for execution duration
- ✅ Metrics visible in /metrics endpoint
- ✅ `pnpm build` succeeds

---

#### 4.3 Add Cleanup Job
**File**: `apps/demo-web/src/lib/jobs/cleanupExecutionContexts.ts`

**Tasks**:
- [ ] **Task 4.3.1**: Create cleanup job
  ```typescript
  import { ExecutionContextManager } from '@reg-copilot/reg-intel-conversations';

  export async function cleanupExecutionContexts(
    manager: ExecutionContextManager
  ): Promise<{ cleaned: number; errors: number }> {
    console.info('[cleanup-job] Starting execution context cleanup');

    try {
      const cleaned = await manager.cleanupExpired();

      console.info('[cleanup-job] Cleanup completed', { cleaned });

      return { cleaned, errors: 0 };
    } catch (error) {
      console.error('[cleanup-job] Cleanup failed', { error });
      return { cleaned: 0, errors: 1 };
    }
  }
  ```

- [ ] **Task 4.3.2**: Schedule job (using node-cron or Vercel Cron)
  **File**: `apps/demo-web/src/app/api/cron/cleanup-contexts/route.ts`
  ```typescript
  import { cleanupExecutionContexts } from '@/lib/jobs/cleanupExecutionContexts';
  import { getExecutionContextManager } from '@/lib/executionContextManager';

  export async function GET(request: Request) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const manager = getExecutionContextManager();
    if (!manager) {
      return Response.json({ error: 'Manager not available' }, { status: 503 });
    }

    const result = await cleanupExecutionContexts(manager);

    return Response.json(result);
  }
  ```

- [ ] **Task 4.3.3**: Configure Vercel Cron
  **File**: `vercel.json`
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/cleanup-contexts",
        "schedule": "*/15 * * * *"
      }
    ]
  }
  ```

**Validation**:
```bash
# Test cleanup endpoint
curl http://localhost:3000/api/cron/cleanup-contexts \
  -H "Authorization: Bearer ${CRON_SECRET}"

# Should return:
# {"cleaned": 3, "errors": 0}
```

**Acceptance Criteria**:
- ✅ Cleanup job implemented
- ✅ Cron endpoint secured
- ✅ Vercel cron configured
- ✅ Manual test succeeds
- ✅ `pnpm build` succeeds

---

#### 4.4 Add Error Handling & EgressGuard Integration
**File**: `packages/reg-intel-llm/src/tools/codeExecutionTools.ts`

**Tasks**:
- [ ] **Task 4.4.1**: Integrate EgressGuard for sandbox output
  ```typescript
  import { EgressGuard } from '../egressGuard.js';

  export async function executeCode(
    input: RunCodeInput,
    sandbox: Sandbox,
    egressGuard?: EgressGuard
  ): Promise<ExecutionResult> {
    const result = await sandbox.runCode(input.code, {
      language: input.language,
    });

    const stdout = result.logs.stdout.join('\n');
    const stderr = result.logs.stderr.join('\n');

    // Filter output through EgressGuard if available
    if (egressGuard) {
      const filtered = await egressGuard.filter({
        content: stdout,
        type: 'code_output',
      });

      if (filtered.blocked) {
        return {
          stdout: '[OUTPUT BLOCKED BY EGRESS GUARD]',
          stderr,
          exitCode: result.exitCode ?? 0,
          warnings: filtered.warnings,
        };
      }

      return {
        stdout: filtered.content,
        stderr,
        exitCode: result.exitCode ?? 0,
        warnings: filtered.warnings,
      };
    }

    return { stdout, stderr, exitCode: result.exitCode ?? 0 };
  }
  ```

- [ ] **Task 4.4.2**: Add comprehensive error handling
  ```typescript
  export async function executeCode(
    input: RunCodeInput,
    sandbox: Sandbox,
    egressGuard?: EgressGuard
  ): Promise<ExecutionResult> {
    try {
      // Validate input
      if (!input.code || input.code.trim().length === 0) {
        throw new Error('Code cannot be empty');
      }

      if (input.code.length > 100_000) {
        throw new Error('Code exceeds maximum length (100KB)');
      }

      // Execute with timeout
      const result = await Promise.race([
        sandbox.runCode(input.code, { language: input.language }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')), 60_000)
        ),
      ]);

      // ... rest of logic
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          return {
            stdout: '',
            stderr: 'Error: Code execution timed out (60s limit)',
            exitCode: 124,
            error: 'timeout',
          };
        }

        return {
          stdout: '',
          stderr: `Error: ${error.message}`,
          exitCode: 1,
          error: error.message,
        };
      }

      return {
        stdout: '',
        stderr: 'Unknown error occurred',
        exitCode: 1,
        error: 'unknown',
      };
    }
  }
  ```

**Validation**:
```typescript
// Test file
describe('Code Execution with EgressGuard', () => {
  it('should block sensitive output', async () => {
    const mockGuard = createMockEgressGuard({
      blocked: true,
      warnings: ['PII detected'],
    });

    const result = await executeCode({
      language: 'python',
      code: 'print("SSN: 123-45-6789")',
    }, mockSandbox, mockGuard);

    expect(result.stdout).toBe('[OUTPUT BLOCKED BY EGRESS GUARD]');
    expect(result.warnings).toContain('PII detected');
  });

  it('should handle timeouts', async () => {
    const mockSandbox = createMockSandbox({ delay: 70_000 });

    const result = await executeCode({
      language: 'python',
      code: 'while True: pass',
    }, mockSandbox);

    expect(result.stderr).toContain('timeout');
    expect(result.exitCode).toBe(124);
  });
});
```

**Acceptance Criteria**:
- ✅ EgressGuard integration complete
- ✅ Input validation implemented
- ✅ Timeout handling works
- ✅ Error messages are clear
- ✅ Unit tests pass
- ✅ `pnpm build` succeeds

---

## Validation Checklist

### End-to-End Validation

Run these tests to validate the complete implementation:

#### Test 1: Basic Code Execution
```bash
# Start conversation
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Calculate VAT on 1000 euros at 23%: print(1000 * 0.23)"
  }'

# Expected:
# - Execution context created
# - Code executed in sandbox
# - Result: "230.0"
```

#### Test 2: Context Reuse
```bash
# First message
curl -X POST http://localhost:3000/api/chat \
  -d '{"message": "x = 100", "conversationId": "test-1"}'

# Second message (should reuse sandbox)
curl -X POST http://localhost:3000/api/chat \
  -d '{"message": "print(x * 2)", "conversationId": "test-1"}'

# Expected:
# - Same sandbox used
# - Result: "200"
```

#### Test 3: Branch Isolation
```bash
# Create branch
curl -X POST http://localhost:3000/api/conversations/test-1/paths \
  -d '{"sourceMessageId": "msg-3", "name": "Branch A"}'

# Execute code in branch
curl -X POST http://localhost:3000/api/chat \
  -d '{"message": "y = 50", "conversationId": "test-1", "pathId": "branch-a"}'

# Switch to main path - should NOT have y variable
curl -X POST http://localhost:3000/api/chat \
  -d '{"message": "print(y)", "conversationId": "test-1", "pathId": "main"}'

# Expected:
# - Branch gets new sandbox
# - Main path unaffected
# - Error: "NameError: name 'y' is not defined"
```

#### Test 4: TTL and Cleanup
```bash
# Create context
curl -X POST http://localhost:3000/api/chat \
  -d '{"message": "x = 1"}'

# Wait 31 minutes (or set short TTL for testing)
sleep 1860

# Run cleanup job
curl http://localhost:3000/api/cron/cleanup-contexts \
  -H "Authorization: Bearer ${CRON_SECRET}"

# Expected:
# - Cleanup job returns cleaned: 1
# - Sandbox terminated
```

#### Test 5: Merge Cleanup
```bash
# Create branch
curl -X POST http://localhost:3000/api/conversations/test-1/paths \
  -d '{"sourceMessageId": "msg-3", "name": "Feature Branch"}'

# Use branch (creates context)
curl -X POST http://localhost:3000/api/chat \
  -d '{"pathId": "feature-branch", "message": "x = 100"}'

# Merge branch
curl -X POST http://localhost:3000/api/conversations/test-1/paths/feature-branch/merge \
  -d '{"targetPathId": "main", "mode": "summary"}'

# Expected:
# - Merge succeeds
# - Source branch context terminated
# - Logs show: "Terminated source path execution context"
```

---

## Progress Tracking

### How to Update Implementation State

After completing each task, update the state file:

```typescript
// Example script: scripts/update-implementation-state.ts
import fs from 'fs';

const state = JSON.parse(fs.readFileSync('docs/architecture/execution-context/IMPLEMENTATION_STATE.json', 'utf-8'));

// Mark task as completed
state.phases.phase1.completedTasks.push('1.1.1');
state.phases.phase1.currentTask = '1.1.2';
state.lastUpdated = new Date().toISOString();

// Calculate overall progress
const totalTasks = calculateTotalTasks(state);
const completedTasks = calculateCompletedTasks(state);
state.overallProgress = `${Math.round((completedTasks / totalTasks) * 100)}%`;

fs.writeFileSync('docs/architecture/execution-context/IMPLEMENTATION_STATE.json', JSON.stringify(state, null, 2));
```

### Automated Progress Tracking

Create a pre-commit hook to update progress:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run tests
pnpm test

# Update implementation state based on test results
node scripts/update-implementation-state.ts

# Add state file to commit
git add docs/architecture/execution-context/IMPLEMENTATION_STATE.json
```

---

## Rollback Plan

If implementation needs to be rolled back:

### Phase 4 Rollback
```bash
# Remove observability code
git revert <phase-4-commits>

# Remove cleanup job
rm apps/demo-web/src/app/api/cron/cleanup-contexts/route.ts
rm apps/demo-web/src/lib/jobs/cleanupExecutionContexts.ts
```

### Phase 3 Rollback
```bash
# Revert chat handler changes
git revert <phase-3-commits>

# Remove execution context manager integration
# Restore previous chat handler version
```

### Phase 2 Rollback
```bash
# Remove tools from ComplianceEngine
git revert <phase-2-commits>

# Remove code execution tools
rm packages/reg-intel-llm/src/tools/codeExecutionTools.ts
```

### Phase 1 Rollback
```bash
# Drop database table
psql -c "DROP TABLE IF EXISTS copilot_internal.execution_contexts CASCADE;"

# Remove migration
rm supabase/migrations/20251210000000_execution_contexts.sql

# Remove code
rm packages/reg-intel-conversations/src/executionContextStores.ts
rm packages/reg-intel-conversations/src/executionContextManager.ts
```

---

## Success Criteria

The implementation is considered complete when:

### Functional Criteria
- ✅ All phases completed and validated
- ✅ All unit tests pass (>80% coverage)
- ✅ All integration tests pass
- ✅ All E2E validation tests pass
- ✅ `pnpm lint` passes with no errors
- ✅ `pnpm build` succeeds for all packages

### Performance Criteria
- ✅ Sandbox creation < 3 seconds
- ✅ Code execution < 10 seconds (for typical workloads)
- ✅ Context lookup < 100ms
- ✅ Cleanup job completes in < 5 minutes

### Observability Criteria
- ✅ All operations emit traces
- ✅ All metrics visible in /metrics
- ✅ Error rates < 1% in production
- ✅ Cleanup job runs successfully every 15 minutes

### Documentation Criteria
- ✅ All code has TSDoc comments
- ✅ README updated with E2B setup instructions
- ✅ Architecture docs updated
- ✅ API documentation includes code execution endpoints

---

## Timeline

**Total Estimated Duration**: 30-44 hours (4-6 days for single developer)

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Foundation | 8-12 hours | None |
| Phase 2: Tool Integration | 6-10 hours | Phase 1 |
| Phase 3: Path Integration | 10-14 hours | Phases 1 & 2 |
| Phase 4: Production Ready | 6-8 hours | Phase 3 |

**Recommended Schedule**:
- **Day 1-2**: Phase 1 (Foundation)
- **Day 2-3**: Phase 2 (Tools)
- **Day 3-5**: Phase 3 (Integration)
- **Day 5-6**: Phase 4 (Production)

---

## Risk Mitigation

### Risk 1: E2B API Rate Limits
**Mitigation**: Implement exponential backoff and request queuing

### Risk 2: Sandbox Creation Failures
**Mitigation**: Fallback to no-sandbox mode (tools disabled but chat works)

### Risk 3: Memory Leaks from Long-Running Sandboxes
**Mitigation**: Aggressive TTL (default 30 min), resource monitoring, automatic cleanup

### Risk 4: Cost Overruns from Unused Sandboxes
**Mitigation**: Cleanup job runs every 15 minutes, metrics dashboard for cost tracking

---

## Support & Resources

- **Architecture Docs**: `docs/architecture/architecture_v_0_7.md`
- **Spec**: `docs/architecture/execution-context/spec_v_0_1.md`
- **Diagrams**: `docs/architecture/architecture_diagrams_v_0_7.md`
- **E2B Docs**: https://e2b.dev/docs
- **OpenTelemetry**: https://opentelemetry.io/docs/

---

**Document Version**: 1.0
**Last Updated**: 2025-12-09
**Author**: Claude Code
**Status**: Ready for Implementation
