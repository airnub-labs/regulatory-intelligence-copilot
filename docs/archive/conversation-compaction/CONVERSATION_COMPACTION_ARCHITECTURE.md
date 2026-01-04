> **ARCHIVED (2026-01-03):** This document has been consolidated into [`docs/architecture/conversation-compaction-and-merge-compression_v1.md`](../../architecture/conversation-compaction-and-merge-compression_v1.md). Retained for historical reference.
>
> **Key Updates in Consolidated Spec:**
> - Status changed from "Planned" to "Implemented" (all strategies are now implemented)
> - Token counting infrastructure is now implemented (was marked as gap)
> - All 8 compaction strategies are implemented
> - Merge compaction is fully wired
> - Auto-compaction and path compaction are operational

---

# Conversation Compaction Architecture (ARCHIVED)

> **Version**: 1.0
> **Status**: 🔵 Planned (Implementation Ready)
> **Created**: 2025-12-30
> **Related Documents**:
> - `MESSAGE_PINNING.md` (Phase 3 - Compaction Strategies)
> - `conversation-branching-and-merging.md` (Merge Operations)
> - `conversationConfig.ts` (Configuration System)
> - Implementation Plan: `docs/development/implementation-plans/COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md`

---

## Executive Summary

This document describes the **Conversation Compaction System** - a comprehensive architecture for managing conversation context size through intelligent message compression and summarization strategies.

### The Problem

**Context Bloat in Conversational AI Systems**:

When users engage in long conversations or merge large branches, the conversation context can grow unbounded, leading to:

- **Token limit exceeded errors** - LLM calls fail when context exceeds model limits (e.g., 128k tokens)
- **Degraded response quality** - Irrelevant historical context dilutes the signal
- **Increased API costs** - Larger contexts consume more tokens per request
- **Poor user experience** - Slow responses, failed merges, confusing errors

**Current Gap**:

The Regulatory Intelligence Copilot has:
- Configuration framework for compaction strategies (`conversationConfig.ts`)
- Message pinning to mark important content
- AI-powered merge summarization (for `summary` merge mode)
- **No implementation of documented compaction algorithms**
- **No token counting infrastructure**
- **Full merge copies ALL messages verbatim** (no compression)
- **Paths can grow unbounded** (no automatic compaction)

### The Solution

**A Unified Compaction System** with:

1. **Token Counting Infrastructure** - Accurate measurement of context size using tiktoken
2. **8 Compaction Strategies** - Pluggable algorithms for different use cases
3. **Path Compaction** - Automatic compression of active conversation paths
4. **Merge Compaction** - Intelligent compression during branch merges
5. **Pinned Message Preservation** - Always preserve user-marked important content
6. **Configuration System** - Hierarchical (global/tenant/user) strategy selection

---

*[Rest of original document preserved for historical reference...]*

*The full original content of this document has been preserved in the git history. The consolidated canonical specification contains all relevant information from this document plus updated implementation status.*

---

**Document Version**: 1.0
**Last Updated**: 2025-12-30
**Archive Date**: 2026-01-03
**Reason**: Consolidated into conversation-compaction-and-merge-compression_v1.md
