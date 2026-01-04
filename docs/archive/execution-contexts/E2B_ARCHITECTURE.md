> **ARCHIVED (2025-01-04):** This document has been consolidated into [`docs/architecture/execution-contexts_e2b_v1.md`](../../architecture/execution-contexts_e2b_v1.md). Retained for historical reference.

---

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

*[Remainder of original document content preserved for historical reference]*

---

**Note:** For the current authoritative documentation, see [`docs/architecture/execution-contexts_e2b_v1.md`](../../architecture/execution-contexts_e2b_v1.md).
