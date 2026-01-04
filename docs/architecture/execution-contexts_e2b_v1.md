# Execution Contexts & E2B Integration (v1)

> **Status:** Implemented and Production-Ready
> **Last Updated:** 2025-12-10
> **Canonical Location:** This document is the single authoritative reference for E2B execution contexts in the Regulatory Intelligence Copilot.

---

## 1. Status & Scope

### 1.1 Implementation Status

| Component | Status | Test Coverage | Notes |
|-----------|--------|---------------|-------|
| Database Schema | ✅ Complete | N/A | `execution_contexts` table with RLS |
| ExecutionContextStore | ✅ Complete | 19 tests | In-memory + Supabase implementations |
| ExecutionContextManager | ✅ Complete | 23 tests | Lifecycle management, cleanup |
| Code Execution Tools | ✅ Complete | 22 tests | `run_code`, `run_analysis` |
| ToolRegistry Integration | ✅ Complete | 23 tests | Dynamic sandbox binding |
| Chat Handler Wiring | ✅ Complete | Integration tests | Path-aware sandbox routing |
| UI Buttons | ✅ Complete | UI tests | Run Code / Run Analysis buttons |
| EgressGuard Integration | ✅ Complete | N/A | PII sanitization on all output |
| OpenTelemetry Spans | ✅ Complete | N/A | All operations traced |

### 1.2 What This Document Covers

1. **Execution Context lifecycle** — per-path sandbox management
2. **E2B sandbox integration** — boundaries and security model
3. **Tooling surface** — `run_code` and `run_analysis` tools
4. **Persistence model** — Supabase tables and metadata
5. **Operational behavior** — timeouts, cleanup, error handling, observability

---

## 2. Why Execution Contexts Exist

### 2.1 Per-Path Isolation

Each conversation path in the copilot can have its own isolated execution environment. This enables:

- **Branch Isolation**: When a user branches a conversation, the new path gets a fresh sandbox. Variables, files, and state from the parent path are NOT inherited, ensuring clean exploration of alternatives.
- **Deterministic Replay**: Each path's execution history is isolated, making it easier to understand what happened in a specific exploration branch.
- **Resource Management**: Sandboxes are scoped to paths, allowing fine-grained cleanup and resource tracking.

### 2.2 Safety Boundaries

E2B sandboxes provide:

- **Container Isolation**: Each sandbox runs in an isolated container
- **Network Restrictions**: No unrestricted internet access from sandboxes
- **Ephemeral Storage**: All data cleared on sandbox termination
- **Execution Timeouts**: 10-minute maximum execution time

### 2.3 Why E2B vs Local Execution

| Concern | Local Execution | E2B Sandbox |
|---------|-----------------|-------------|
| Security | Risky — direct host access | Isolated container |
| Multi-tenancy | Complex to isolate | Built-in isolation |
| Resource limits | Manual enforcement | Platform-enforced |
| Cleanup | Manual | Automatic on termination |
| Scaling | Host-constrained | Cloud-native |

---

## 3. Conceptual Model

### 3.1 Execution Context Definition

An **Execution Context** represents a sandboxed code execution environment tied to a specific conversation path.

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
```

### 3.2 Keying: tenantId, conversationId, pathId

Execution contexts are uniquely identified by a three-part composite key:

```typescript
export interface ExecutionContextIdentity {
  tenantId: string;       // Tenant owning the conversation
  conversationId: string; // Conversation containing the path
  pathId: string;         // Specific path (may be primary or branch)
}
```

**Invariant**: At most one active execution context exists per `(tenantId, conversationId, pathId)` tuple.

### 3.3 Relationship to Conversation Paths

```
┌─────────────────────────────────────────────────────────────────────┐
│                Conversation (tenantId, conversationId)               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Primary Path (pathId: "main")                                 │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  ExecutionContext                                        │  │ │
│  │  │  - sandboxId: "sbx_abc123"                               │  │ │
│  │  │  - status: "ready"                                       │  │ │
│  │  │  - expiresAt: now + 30min                                │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  │  Messages: [M1, M2, M3, M4, M5]                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                            │                                         │
│                            │ Branch at M3                            │
│                            ▼                                         │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Branch Path (pathId: "branch_001")                            │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  ExecutionContext (SEPARATE)                             │  │ │
│  │  │  - sandboxId: "sbx_def456"                               │  │ │
│  │  │  - status: "ready"                                       │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  │  Inherits: [M1, M2, M3]                                        │ │
│  │  Own: [M3', M4', M5']                                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principle**:
- **Conversation Context IS inherited** (messages, concepts)
- **Execution Context IS NOT inherited** (sandbox state, variables)

---

## 4. Lifecycle (Implemented)

### 4.1 Create/Reuse Logic

```
User Request → Chat Handler → ExecutionContextManager.getOrCreateContext()
                                      ↓
                              Check ExecutionContextStore for existing
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    ↓ [FOUND & Valid]                    ↓ [NOT FOUND or Expired]
            Touch (extend TTL)                    Create E2B Sandbox
            Reconnect to sandbox                  Store context
            Return existing                       Return new
```

### 4.2 Sandbox States

```
creating → ready → terminated
    ↓
  error
```

| State | Description |
|-------|-------------|
| `creating` | Sandbox being initialized |
| `ready` | Sandbox available for code execution |
| `error` | Sandbox creation/execution failed |
| `terminated` | Sandbox cleaned up (soft delete) |

### 4.3 TTL Extension on Usage

Every call to `getOrCreateContext()` for an existing context:
1. Updates `lastUsedAt` to now
2. Extends `expiresAt` to now + TTL (default 30 minutes)

### 4.4 Termination / Cleanup

Contexts are terminated:
- **On merge**: Source path's context is terminated when merged
- **On expiry**: Background cleanup job terminates expired contexts
- **Manually**: Via direct API call

```typescript
// ExecutionContextManager.terminateContext()
async terminateContext(contextId: string): Promise<void> {
  // 1. Kill E2B sandbox
  // 2. Mark context as terminated in store
  // 3. Remove from in-memory cache
}
```

### 4.5 Cleanup Job

```typescript
// Runs periodically (every 15 minutes recommended)
async cleanupExpired(limit = 50): Promise<CleanupResult> {
  const expired = await store.getExpiredContexts(limit);
  for (const context of expired) {
    await this.terminateContext(context.id);
  }
  return { cleaned: expired.length, errors: 0 };
}
```

---

## 5. Persistence Model (Implemented)

### 5.1 Database Schema

**Table**: `copilot_internal.execution_contexts`

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

### 5.2 Indexes

| Index | Purpose |
|-------|---------|
| `idx_execution_contexts_tenant` | Fast tenant queries |
| `idx_execution_contexts_path` | Fast path lookups |
| `idx_execution_contexts_expires` | Efficient cleanup queries |
| `idx_execution_contexts_sandbox` | Sandbox status filtering |
| `idx_execution_contexts_conversation` | Conversation-level queries |

### 5.3 Helper Functions

- `touch_execution_context(context_id, ttl_minutes)` — Extend TTL
- `get_expired_execution_contexts(limit)` — Get expired contexts for cleanup

### 5.4 What Is Stored vs Not Stored

| Stored | Not Stored |
|--------|------------|
| Sandbox ID | Sandbox secrets/tokens |
| Status and lifecycle timestamps | Actual sandbox state (variables, files) |
| Error messages (sanitized) | PII or sensitive user data |
| Resource usage metrics | Raw execution logs |

---

## 6. Tooling Integration (Implemented)

### 6.1 Tool Registry Entries

Two primary tools are registered when a sandbox is available:

#### `run_code`
```typescript
const runCodeToolSchema = z.object({
  language: z.enum(['python', 'javascript', 'typescript', 'bash', 'sh']),
  code: z.string().min(1),
  description: z.string().optional(),
  timeout: z.number().min(1000).max(600000).optional(),
});
```

**Returns**: `{ success, stdout, stderr, exitCode, executionTimeMs, sandboxId }`

#### `run_analysis`
```typescript
const runAnalysisToolSchema = z.object({
  analysisType: z.enum(['tax_calculation', 'compliance_check', 'data_analysis', 'custom']),
  parameters: z.record(z.unknown()),
  code: z.string().optional(),
  outputFormat: z.enum(['json', 'text', 'csv']).optional(),
});
```

**Returns**: `{ success, stdout, stderr, exitCode, result, parsedOutput }`

### 6.2 Call Flow

```
UI → API Route → Chat Handler → ExecutionContextManager.getOrCreateContext()
                                        ↓
                                   { context, sandbox }
                                        ↓
                               ToolRegistry.updateSandbox(sandbox)
                                        ↓
                               ComplianceEngine.handleChat()
                                        ↓
                               LLM calls run_code/run_analysis
                                        ↓
                               executeCode(input, sandbox)
                                        ↓
                               Sanitize output via EgressGuard
                                        ↓
                               Return results to user
```

### 6.3 Force Tool Support (UI Buttons)

The UI includes "Run Code" and "Run Analysis" buttons that bypass LLM decision-making:

```typescript
interface ComplianceRequest {
  messages: ChatMessage[];
  executionTools?: ExecutionTool[];
  forceTool?: { name: string; args: Record<string, unknown> };
}
```

When `forceTool` is provided, the engine directly executes the specified tool without LLM routing.

---

## 7. Security Model & Boundaries

### 7.1 Multi-Tenancy

- **Tenant Isolation**: Each context has `tenant_id`; RLS policies enforce tenant boundaries
- **Unique Constraint**: One active context per `(tenant_id, conversation_id, path_id)`
- **Resource Limits**: Max concurrent contexts per tenant (default: 10)

### 7.2 Sandbox Security

| Protection | Implementation |
|------------|----------------|
| Container Isolation | E2B provides container-level isolation |
| Network Restrictions | No unrestricted internet access |
| Ephemeral Storage | All data cleared on termination |
| Timeout Limits | 10-minute max execution time |
| Memory Limits | 2GB per sandbox (E2B default) |

### 7.3 PII Protection

All sandbox output is sanitized via EgressGuard before returning:

```typescript
// In executeCode() and executeAnalysis()
const stdout = sanitizeTextForEgress(rawStdout, sanitizationOpts);
const stderr = sanitizeTextForEgress(rawStderr, sanitizationOpts);
const parsedOutput = sanitizeObjectForEgress(parsed, sanitizationOpts);
```

**PII Types Detected**:
- Email addresses, phone numbers, SSNs, Irish PPSNs
- Credit card numbers, IBANs
- API keys, JWT tokens, AWS access keys
- Database connection URLs, IP addresses
- ML-powered detection for additional entity types

### 7.4 Audit Trail

- All context creation/termination is logged with OpenTelemetry spans
- Resource usage tracked per context
- Error messages sanitized before storage

---

## 8. Operational Considerations

### 8.1 Configuration

```env
# E2B Configuration
E2B_API_KEY=ek_***                    # E2B API key
E2B_DEFAULT_TTL_MINUTES=30            # Default sandbox TTL
E2B_SANDBOX_TIMEOUT=600000            # 10 minutes (ms)
E2B_CLEANUP_INTERVAL_MINUTES=15       # Cleanup frequency

# Supabase (for execution_contexts table)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=***
```

### 8.2 Timeouts

| Operation | Timeout |
|-----------|---------|
| Sandbox creation | 60 seconds |
| Code execution | 60 seconds (configurable up to 10 min) |
| Sandbox TTL | 30 minutes (extended on use) |

### 8.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Max concurrent sandboxes per tenant | 10 |
| Max sandboxes per conversation | 5 |
| Max execution time per request | 60 seconds |
| Memory per sandbox | 2GB |
| Code size limit | 100KB |

### 8.4 Observability

**OpenTelemetry Spans**:
- `execution_context.get_or_create` — Context lookup/creation
- `execution_context.terminate` — Context termination
- `compliance.tool.run_code` — Code execution
- `compliance.tool.run_analysis` — Analysis execution

**Span Attributes**:
```typescript
{
  'app.tenant.id': tenantId,
  'app.conversation.id': conversationId,
  'app.path.id': pathId,
  'sandbox.id': sandboxId,
  'tool.name': toolName,
  'tool.forced': boolean,
}
```

### 8.5 Error Handling

| Error Type | Handling |
|------------|----------|
| Sandbox creation failure | Return error, disable code tools for request |
| Execution timeout | Return timeout error, context remains active |
| Sandbox connection lost | Recreate sandbox transparently |
| Resource limits exceeded | Return user-friendly error message |

---

## 9. Edge Cases & Known Pitfalls

### 9.1 Orphaned Contexts

If the application crashes during sandbox creation:
- Context may remain in `creating` status
- Cleanup job will terminate after TTL expires
- No manual intervention required

### 9.2 Concurrent Tool Calls

Multiple `run_code` calls on the same path:
- All use the same sandbox (shared state)
- Execution is serialized (E2B handles)
- Variables persist across calls

### 9.3 Switching Paths Quickly

When user rapidly switches between paths:
- Each path maintains its own context
- Inactive contexts expire after TTL
- No cross-path state leakage

### 9.4 Sandbox Reuse vs Reset

- **Same path, same session**: Reuses sandbox (state preserved)
- **Same path, after TTL**: New sandbox (clean state)
- **New branch**: New sandbox (clean state)
- **After merge**: Source path sandbox terminated

### 9.5 Branch Isolation Behavior

| Context Type | Inherited on Branch? | Reason |
|--------------|---------------------|--------|
| ConversationContext (activeNodeIds) | ✅ YES | Branch needs conversation history |
| Message History | ✅ YES | Branch continues from that point |
| ExecutionContext (sandbox) | ❌ NO | Sandbox state should be isolated |

---

## 10. Future Work (Not Implemented)

The following items are planned but not yet implemented:

### 10.1 Deferred for Production Deployment

- **Metrics Collection** (Task 4.2.1): OpenTelemetry metrics for sandbox operations
- **Vercel Cron Job** (Tasks 4.3.2, 4.3.3): Scheduled cleanup via Vercel Cron

### 10.2 Advanced Features

- **Sandbox Templates**: Pre-loaded libraries for common analysis patterns
- **Persistent Storage**: File upload/download within sandboxes
- **Collaborative Sandboxes**: Multiple users sharing execution context
- **Sandbox Snapshots**: Save/restore sandbox state for replay
- **GPU-Accelerated Sandboxes**: ML workloads with GPU access
- **Per-Tenant Quotas**: Usage limits and cost tracking per tenant
- **Deterministic Replay**: Replay execution history for debugging

### 10.3 Non-Goals (v1)

- User-uploaded arbitrary code execution (only LLM-generated code)
- Real-time sandbox streaming (batch results only)
- Per-user sandbox customization (tenant-level config only)

---

## 11. References

### 11.1 Implementation Files

| Component | Location |
|-----------|----------|
| ExecutionContextManager | `packages/reg-intel-conversations/src/executionContextManager.ts` |
| ExecutionContextStore | `packages/reg-intel-conversations/src/executionContextStores.ts` |
| Code Execution Tools | `packages/reg-intel-llm/src/tools/codeExecutionTools.ts` |
| Tool Registry | `packages/reg-intel-llm/src/tools/toolRegistry.ts` |
| E2B Client | `packages/reg-intel-next-adapter/src/executionContext.ts` |
| EgressGuard | `packages/reg-intel-llm/src/egressGuard.ts` |

### 11.2 Database Migrations

- `supabase/migrations/20251210000000_execution_contexts.sql`

### 11.3 Test Files

| Test File | Coverage |
|-----------|----------|
| `executionContextManager.test.ts` | 23 tests |
| `executionContextStores.test.ts` | 19 tests |
| `codeExecutionTools.test.ts` | 22 tests |
| `toolRegistry.test.ts` | 23 tests |
| `executionContext.test.ts` (adapter) | 23 tests |

### 11.4 Related Architecture Documents

- [Architecture v0.7](./architecture_v_0_7.md) — Overall architecture (Section 3 covers E2B)
- [EgressGuard v0.3](./guards/egress_guard_v_0_3.md) — PII sanitization
- [Conversation Path System](./conversation-path-system.md) — Path branching/merging
- [Data Privacy Boundaries](./data_privacy_and_architecture_boundaries_v_0_1.md) — Privacy model

### 11.5 Archived Documents

The following documents have been superseded by this canonical doc:

- `docs/archive/execution-contexts/E2B_ARCHITECTURE.md` — Original E2B architecture
- `docs/archive/execution-contexts/spec_v_0_1.md` — Original specification
- `docs/archive/execution-contexts/IMPLEMENTATION_PLAN.md` — Implementation plan

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2025-01-04 | Initial consolidated document |

---

*This document consolidates content from the original E2B_ARCHITECTURE.md, spec_v_0_1.md, and IMPLEMENTATION_PLAN.md. All unique information has been preserved.*
