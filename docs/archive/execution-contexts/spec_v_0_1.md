> **ARCHIVED (2025-01-04):** This document has been consolidated into [`docs/architecture/execution-contexts_e2b_v1.md`](../../architecture/execution-contexts_e2b_v1.md). Retained for historical reference.

---

# Execution Context Specification (v0.1)

> **Status:** v0.1 (design review) — SUPERSEDED
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
5. **Branch Sandbox Isolation**: When a user branches, the new path gets its own execution context.
6. **Edit Continuity**: When a user edits a message, the same path's execution context continues.
7. **Egress Guard Integration**: All sandbox egress must flow through EgressGuard.

---

*[Remainder of original specification content preserved for historical reference]*

---

**Note:** For the current authoritative documentation, see [`docs/architecture/execution-contexts_e2b_v1.md`](../../architecture/execution-contexts_e2b_v1.md).
