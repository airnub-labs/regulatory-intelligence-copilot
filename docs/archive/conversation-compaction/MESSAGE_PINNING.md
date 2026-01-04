> **ARCHIVED (2026-01-03):** This document has been consolidated into [`docs/architecture/conversation-compaction-and-merge-compression_v1.md`](../../architecture/conversation-compaction-and-merge-compression_v1.md). Retained for historical reference.
>
> **Key Updates in Consolidated Spec:**
> - Pinning is fully implemented (database, API, UI)
> - Compaction strategies all respect pinned messages
> - SSE events for pin/unpin are wired
> - UI components for pinning are complete

---

# Message Pinning & Compaction Control (ARCHIVED)

## Overview

Message pinning allows users to mark important messages that should be preserved during conversation path compaction and merge operations. This document describes how pinned messages interact with different compaction strategies.

## Pinning Messages

### User Interface
Users can pin/unpin messages through:
- **Pin action**: Mark a message as important
- **Unpin action**: Remove the pin from a message

### Database Fields
- `is_pinned` (boolean): Whether the message is pinned
- `pinned_at` (timestamp): When the message was pinned
- `pinned_by` (UUID): User who pinned the message

### API Operations
```typescript
// Pin a message
await pathStore.pinMessage({
  tenantId: 'tenant-123',
  conversationId: 'conv-456',
  messageId: 'msg-789',
  userId: 'user-abc'
});

// Unpin a message
await pathStore.unpinMessage({
  tenantId: 'tenant-123',
  conversationId: 'conv-456',
  messageId: 'msg-789'
});

// Get all pinned messages
const pinned = await pathStore.getPinnedMessages({
  tenantId: 'tenant-123',
  conversationId: 'conv-456',
  pathId: 'path-def' // Optional: filter by path
});
```

## Compaction Strategies & Pinned Messages

### Path Compaction

When a conversation path grows too large, the system applies compaction based on the configured `pathCompressionStrategy`.

#### 1. None Strategy
- **Behavior**: No compaction applied
- **Pinned messages**: No special handling needed (all messages retained)

#### 2. Sliding Window Strategy
- **Behavior**: Keeps last N messages, summarizes or removes older messages
- **Pinned messages**: **ALWAYS RETAINED** regardless of sliding window position

#### 3. Semantic Strategy
- **Behavior**: Groups semantically similar messages and summarizes clusters
- **Pinned messages**: **EXCLUDED FROM CLUSTERING** - retained verbatim

#### 4. Hybrid Strategy
- **Behavior**: Combines sliding window + semantic clustering
- **Pinned messages**: **ALWAYS RETAINED** + excluded from semantic clustering

### Branch Merge Compaction

When merging a branch back to its parent path, the system respects the `mergeCompressionStrategy` configuration.

#### Merge Strategies with Pinned Messages

##### 1. None
- **Behavior**: All messages transferred verbatim
- **Pinned messages**: No special handling needed

##### 2. Minimal
- **Behavior**: Remove duplicate messages, keep rest
- **Pinned messages**: **NEVER REMOVED** during deduplication

##### 3. Moderate (Default)
- **Behavior**: Summarize redundant exchanges, keep key decisions
- **Pinned messages**: **MINIMAL SUMMARIZATION** - preserved with full context

##### 4. Aggressive
- **Behavior**: Keep only outcomes and final decisions
- **Pinned messages**: **PRESERVED** but surrounding context may be heavily summarized

## Implementation Status

- Database schema (pinned fields + indexes)
- TypeScript types (PathAwareMessage with pinning)
- Store operations (pin/unpin/getPinned)
- Configuration system (mergePreservePinned setting)
- Compaction logic (implemented)
- UI components (pin/unpin buttons)
- SSE events (message:pinned, message:unpinned)

---

**Document Version**: 1.0
**Archive Date**: 2026-01-03
**Reason**: Consolidated into conversation-compaction-and-merge-compression_v1.md
