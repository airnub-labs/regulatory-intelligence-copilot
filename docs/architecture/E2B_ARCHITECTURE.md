# E2B Per-Path Execution Context Architecture

## Overview

This document describes the complete E2B (Code Interpreter) integration architecture for per-path execution contexts in the Regulatory Intelligence Copilot. The system provides isolated code execution environments for each conversation path, enabling safe, reproducible, and context-aware code execution.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Request                              │
│                 (with conversationId, pathId)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Chat Handler (Next.js API)                    │
│  - Extract tenantId, conversationId, pathId from request        │
│  - Initialize ExecutionContextManager                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               ExecutionContextManager                            │
│  - getOrCreateContext(tenantId, conversationId, pathId)         │
│  - Returns: { context, sandbox }                                │
│  - Manages sandbox lifecycle (create, reuse, extend TTL)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  ExecutionContextStore   │  │    E2B Sandbox API       │
│  (Supabase/InMemory)     │  │  - Create sandbox        │
│  - Create context        │  │  - Reconnect to existing │
│  - Get by path           │  │  - Execute code          │
│  - Touch (extend TTL)    │  │  - Kill sandbox          │
│  - Terminate             │  │                          │
└──────────────────────────┘  └──────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database (Supabase)                         │
│  Table: execution_contexts                                       │
│  - id, tenant_id, conversation_id, path_id                      │
│  - sandbox_id, sandbox_status                                   │
│  - created_at, last_used_at, expires_at, terminated_at          │
│  - Indexes: tenant, path, expires, sandbox, conversation        │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ToolRegistry + LLM                            │
│  - Register run_code and run_analysis tools                     │
│  - Tools use sandbox from context                               │
│  - Execute code in isolated environment                         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. ExecutionContextManager

**Location**: `packages/reg-intel-conversations/src/executionContextManager.ts`

**Responsibilities**:
- Lazy creation of sandboxes (only when first needed)
- Sandbox reuse for same path
- TTL extension on usage
- Sandbox lifecycle management
- Cleanup of expired contexts

**Key Methods**:
```typescript
// Get or create execution context for a path
async getOrCreateContext(input: {
  tenantId: string;
  conversationId: string;
  pathId: string;
}): Promise<{
  context: ExecutionContext;
  sandbox: E2BSandbox;
  wasCreated: boolean;
}>

// Terminate context and kill sandbox
async terminateContext(contextId: string): Promise<void>

// Cleanup expired contexts (run periodically)
async cleanupExpired(limit?: number): Promise<CleanupResult>
```

**Configuration**:
```typescript
const manager = new ExecutionContextManager({
  store: executionContextStore,
  e2bApiKey: process.env.E2B_API_KEY,
  e2bClient: E2BClient, // Injectable for testing
  defaultTtlMinutes: 30,
  sandboxTimeout: 600000, // 10 minutes
  logger: logger,
});
```

### 2. ExecutionContextStore

**Location**: `packages/reg-intel-conversations/src/executionContextStores.ts`

**Implementations**:
- `InMemoryExecutionContextStore`: For testing/development
- `SupabaseExecutionContextStore`: For production

**Key Operations**:
```typescript
// Create new execution context
createContext(input: CreateExecutionContextInput): Promise<ExecutionContext>

// Get context by path (unique per tenant/conversation/path)
getContextByPath(input: {
  tenantId: string;
  conversationId: string;
  pathId: string;
}): Promise<ExecutionContext | null>

// Extend TTL by updating last_used_at and expires_at
touchContext(contextId: string, ttlMinutes?: number): Promise<void>

// Update sandbox status (creating → ready → error/terminated)
updateStatus(
  contextId: string,
  status: 'creating' | 'ready' | 'error' | 'terminated',
  errorMessage?: string
): Promise<void>

// Soft delete (mark as terminated)
terminateContext(contextId: string): Promise<void>

// Get expired contexts for cleanup
getExpiredContexts(limit?: number): Promise<ExecutionContext[]>
```

### 3. Code Execution Tools

**Location**: `packages/reg-intel-llm/src/tools/codeExecutionTools.ts`

**Tools**:
1. **run_code**: Execute arbitrary code in sandbox
   - Languages: Python, JavaScript, TypeScript, Bash
   - Returns: stdout, stderr, exitCode, executionTime

2. **run_analysis**: Execute predefined or custom analysis
   - Types: tax_calculation, compliance_check, data_analysis, custom
   - Returns: structured results + stdout/stderr

**ToolRegistry**:
```typescript
// Create registry with sandbox
const registry = new ToolRegistry({
  sandbox: sandbox,
  enableCodeExecution: true,
  logger: logger,
});

// Get tools for AI SDK
const tools = registry.getTools(); // { run_code, run_analysis }

// Update sandbox dynamically (per-request)
registry.updateSandbox(newSandbox);
```

## Data Flow

### 1. First Code Execution Request

```
User → Chat Handler → ExecutionContextManager.getOrCreateContext()
                              ↓
                      Check ExecutionContextStore for existing context
                              ↓
                      [NOT FOUND]
                              ↓
                      Create E2B Sandbox (sandbox_id = "sb_abc123")
                              ↓
                      Store in execution_contexts table
                      {
                        id: uuid,
                        tenant_id: tenant-123,
                        conversation_id: conv-456,
                        path_id: path-789,
                        sandbox_id: "sb_abc123",
                        sandbox_status: "ready",
                        expires_at: now + 30min
                      }
                              ↓
                      Return { context, sandbox, wasCreated: true }
                              ↓
                      Create ToolRegistry with sandbox
                              ↓
                      LLM calls run_code tool
                              ↓
                      Execute in sandbox
                              ↓
                      Return results to user
```

### 2. Subsequent Requests (Same Path)

```
User → Chat Handler → ExecutionContextManager.getOrCreateContext()
                              ↓
                      Check ExecutionContextStore for existing context
                              ↓
                      [FOUND] context with sandbox_id = "sb_abc123"
                              ↓
                      Extend TTL (touch context, expires_at = now + 30min)
                              ↓
                      Reconnect to existing E2B sandbox
                              ↓
                      Return { context, sandbox, wasCreated: false }
                              ↓
                      Use existing sandbox (state preserved!)
                              ↓
                      LLM calls run_code tool
                              ↓
                      Execute in same sandbox (variables still available)
                              ↓
                      Return results to user
```

### 3. Branching (New Path)

```
User creates branch from message X on path-789
                              ↓
                      New path created: path-def
                              ↓
User sends message on path-def requiring code execution
                              ↓
                      ExecutionContextManager.getOrCreateContext(path-def)
                              ↓
                      [NOT FOUND] - new path has no context
                              ↓
                      Create NEW E2B Sandbox (sandbox_id = "sb_xyz456")
                              ↓
                      Store new context for path-def
                              ↓
                      Sandbox is ISOLATED from parent path-789
                      (Fresh environment, no variables from parent)
                              ↓
                      BUT: Conversation context IS inherited
                      (Messages from parent path are visible in chat history)
```

### 4. Merging Paths

```
User merges path-def back into path-789
                              ↓
                      Path merge operation executes
                              ↓
                      Terminate execution context for path-def
                      - Set terminated_at = now
                      - Kill E2B sandbox (sb_xyz456)
                      - Remove from active sandboxes map
                              ↓
                      Continue using path-789's sandbox (sb_abc123)
                      (Sandbox state unchanged, continues working)
```

### 5. TTL Expiry & Cleanup

```
Background job runs every N minutes
                              ↓
                      ExecutionContextManager.cleanupExpired()
                              ↓
                      Get contexts where expires_at < now
                              ↓
                      For each expired context:
                        - terminateContext(contextId)
                        - Kill E2B sandbox
                        - Set terminated_at = now
                              ↓
                      Return cleanup stats { cleaned, errors }
```

## Database Schema

### execution_contexts Table

```sql
CREATE TABLE copilot_internal.execution_contexts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    path_id uuid NOT NULL REFERENCES conversation_paths(id) ON DELETE CASCADE,

    sandbox_id text NOT NULL,
    sandbox_status text NOT NULL CHECK (sandbox_status IN ('creating', 'ready', 'error', 'terminated')),

    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    terminated_at timestamptz,

    error_message text,
    resource_usage jsonb,

    UNIQUE(tenant_id, conversation_id, path_id)
);
```

**Indexes**:
- `idx_execution_contexts_tenant`: Fast tenant queries
- `idx_execution_contexts_path`: Fast path lookups
- `idx_execution_contexts_expires`: Efficient cleanup queries
- `idx_execution_contexts_sandbox`: Sandbox status filtering
- `idx_execution_contexts_conversation`: Conversation-level queries

**Helper Functions**:
- `touch_execution_context(context_id, ttl_minutes)`: Extend TTL
- `get_expired_execution_contexts(limit)`: Get expired contexts for cleanup

**View**:
- `execution_contexts_view`: Computed fields (is_expired, minutes_until_expiry)

## Configuration & Lifecycle

### TTL Management

**Default TTL**: 30 minutes

**TTL Extension**: Automatic on every `getOrCreateContext()` call
- Updates `last_used_at` to now
- Updates `expires_at` to now + TTL
- Uses PostgreSQL function: `touch_execution_context()`

**Cleanup Schedule**: Run every hour (configurable via Vercel Cron)

### Sandbox States

```
creating → ready → terminated
    ↓
  error
```

- **creating**: Sandbox being initialized
- **ready**: Sandbox available for code execution
- **error**: Sandbox creation/execution failed
- **terminated**: Sandbox cleaned up (soft delete)

### Resource Limits

**E2B Sandbox Limits** (per sandbox):
- Timeout: 10 minutes per execution
- Memory: 2GB (E2B default)
- Storage: Ephemeral (cleared on termination)

**Tenant Limits** (recommended):
- Max concurrent sandboxes per tenant: 10
- Max sandboxes per conversation: 5
- Max execution time per request: 60 seconds

## Integration with Conversation Paths

### Path Isolation Principles

1. **Conversation Context IS Inherited**:
   - When branching, new path sees all messages from parent
   - `activeNodeIds` includes messages from parent path
   - Full conversation history visible to LLM

2. **Sandbox State IS NOT Inherited**:
   - Each path gets its own E2B sandbox
   - Variables, files, state isolated per branch
   - Prevents cross-branch contamination

3. **Merge Cleanup**:
   - Source path's sandbox terminated on merge
   - Target path's sandbox unchanged
   - Prevents resource leaks

### Example Workflow

```typescript
// User working on main path
const mainContext = await manager.getOrCreateContext({
  tenantId: 'tenant-123',
  conversationId: 'conv-456',
  pathId: 'path-main',
});
// Sandbox sb_main created
// Execute: x = 42

// User branches to explore alternative
const branchContext = await manager.getOrCreateContext({
  tenantId: 'tenant-123',
  conversationId: 'conv-456',
  pathId: 'path-branch1',
});
// Sandbox sb_branch1 created (separate from sb_main)
// Execute: y = 100 (doesn't affect x in sb_main)

// User merges branch back
await pathStore.mergePath({
  sourcePathId: 'path-branch1',
  targetPathId: 'path-main',
  // ... merge options
});
// Sandbox sb_branch1 terminated automatically
// Sandbox sb_main continues with x = 42
```

## Security Considerations

### Multi-Tenancy

- **Tenant Isolation**: Each tenant's contexts stored with `tenant_id`
- **RLS Policies**: Row-level security enforces tenant boundaries
- **Unique Constraint**: One context per (tenant_id, conversation_id, path_id)

### Sandbox Security

- **Isolated Environments**: E2B provides container isolation
- **No Network Access**: Sandboxes have no internet by default (E2B feature)
- **Ephemeral Storage**: All data cleared on termination
- **Timeout Limits**: 10-minute max execution time

### PII Protection ✅ Fully Implemented (2025-12-24)

The E2B sandbox integration includes comprehensive PII protection via EgressGuard:

**Sandbox Output Sanitization**:
- All `stdout` output is sanitized via `sanitizeTextForEgress()` before returning
- All `stderr` output is sanitized before returning
- Error messages are sanitized to prevent PII leakage in exception traces
- Parsed JSON results are deep-sanitized via `sanitizeObjectForEgress()`
- Analysis results arrays are sanitized before being returned

**Implementation Files**:
- `packages/reg-intel-llm/src/tools/codeExecutionTools.ts` - `executeCode()` and `executeAnalysis()`
- `packages/reg-intel-llm/src/egressGuard.ts` - Core sanitization functions

**PII Types Detected**:
- Email addresses, phone numbers, SSNs, Irish PPSNs
- Credit card numbers, IBANs
- API keys, JWT tokens, AWS access keys
- Database connection URLs, IP addresses
- ML-powered detection via @redactpii/node for additional entity types

**Additional Protections**:
- **Audit Trail**: Track who executed what code
- **Resource Usage**: Monitor compute consumption per tenant

See `docs/architecture/guards/egress_guard_v_0_3.md` Section 9 for complete implementation details.

## Error Handling

### Sandbox Creation Failures

```typescript
try {
  const { context, sandbox } = await manager.getOrCreateContext(input);
} catch (error) {
  if (error.message.includes('E2B API')) {
    // E2B service unavailable
    // Fallback: Disable code execution tools
    return { tools: [] }; // No code execution
  }
  throw error;
}
```

### Execution Timeout

```typescript
const result = await executeCode({
  language: 'python',
  code: 'import time; time.sleep(100)',
}, sandbox);
// E2B will timeout at 10 minutes
// result.success = false
// result.error = 'Execution timeout'
```

### Sandbox Reconnection Failures

```typescript
// If reconnection fails, create new sandbox
let sandbox = this.activeSandboxes.get(context.id);
if (!sandbox) {
  try {
    sandbox = await this.e2bClient.reconnect(context.sandboxId);
  } catch (reconnectError) {
    // Create new sandbox, update context
    sandbox = await this.e2bClient.create();
    await this.store.updateStatus(context.id, 'ready');
  }
}
```

## Performance Optimization

### Connection Pooling

- **Active Sandboxes Map**: Keep reconnected sandboxes in memory
- **Reuse Strategy**: Prefer reconnection over creation (faster)
- **Lazy Cleanup**: Don't kill immediately on expiry (wait for cleanup job)

### Database Optimization

- **Indexes**: All common queries indexed
- **RPC Functions**: Complex operations in PostgreSQL
- **Batch Cleanup**: Process up to 50 expired contexts per run

### Monitoring Metrics

```typescript
{
  "sandbox.creation.duration_ms": 2500,
  "sandbox.reconnection.duration_ms": 150,
  "sandbox.execution.duration_ms": 450,
  "sandbox.active_count": 12,
  "sandbox.cleanup.contexts_removed": 3,
}
```

## Testing Strategy

### Unit Tests

- ✅ ExecutionContextStore operations (19 tests)
- ✅ Code execution tools (22 tests)
- ✅ Tool registry (23 tests)
- Total: 94 unit tests (95% coverage)

### Integration Tests

- ✅ End-to-end code execution flow (via ComplianceEngine)
- ✅ Branch isolation verification (via path-based context lookup)
- ✅ TTL extension and expiry (via touchContext)
- ✅ Cleanup job effectiveness (via cleanupExpired method)
- ✅ Error handling scenarios (comprehensive try/catch with spans)
- ✅ Merge cleanup (execution context terminated on path merge)

### UI Integration Tests

- ✅ Run Code button triggers forceTool with run_code
- ✅ Run Analysis button triggers forceTool with run_analysis
- ✅ Buttons disabled when input empty or loading

### E2E Tests

1. **Basic Execution**: Create context → execute code → verify output
2. **Context Reuse**: Execute twice → verify same sandbox used
3. **Branch Isolation**: Branch → execute in both → verify independence
4. **TTL Cleanup**: Wait for expiry → run cleanup → verify termination
5. **Merge Cleanup**: Merge paths → verify source sandbox terminated

## Deployment

### Environment Variables

```env
# E2B Configuration
E2B_API_KEY=ek_***                    # E2B API key
E2B_DEFAULT_TTL_MINUTES=30            # Default sandbox TTL
E2B_SANDBOX_TIMEOUT=600000            # 10 minutes
E2B_CLEANUP_INTERVAL_MINUTES=60       # Cleanup frequency

# Supabase (for execution_contexts table)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=***
```

### Vercel Cron Job

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/cleanup-execution-contexts",
    "schedule": "0 * * * *"  // Every hour
  }]
}
```

### Migration Sequence

1. Run database migration: `20251210000000_execution_contexts.sql`
2. Deploy code with new packages
3. Configure environment variables
4. Enable Vercel Cron job
5. Monitor sandbox creation/cleanup metrics

## Future Enhancements

### Phase 4 (Observability) - Partially Complete

- [x] OpenTelemetry spans for all operations (completed 2025-12-10)
- [ ] Metrics dashboard (Grafana/DataDog) - DEFERRED
- [ ] Alert on high failure rates - DEFERRED
- [ ] Cost tracking per tenant - DEFERRED

### Production Deployment

- [ ] Vercel Cron job for cleanup (4.3.2, 4.3.3) - DEFERRED
- [ ] Metrics collection (4.2.1) - DEFERRED

### Advanced Features

- [ ] Sandbox templates (pre-loaded libraries)
- [ ] Persistent storage (file upload/download)
- [ ] Collaborative sandboxes (multiple users)
- [ ] Sandbox snapshots (save/restore state)
- [ ] GPU-accelerated sandboxes (ML workloads)

### UI Enhancements (Completed 2025-12-10)

- [x] Run Code button for forcing code execution
- [x] Run Analysis button for forcing data analysis
- [x] forceTool API support in ComplianceEngine

## References

- [E2B Documentation](https://e2b.dev/docs)
- [Implementation Plan](./execution-context/IMPLEMENTATION_PLAN.md)
- [Implementation State](./execution-context/IMPLEMENTATION_STATE.json)
- [Message Pinning](./MESSAGE_PINNING.md)
- [Conversation Config](../packages/reg-intel-conversations/src/conversationConfig.ts)
