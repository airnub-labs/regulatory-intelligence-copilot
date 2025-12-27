# Path-Based Versioning Guide

> **Status**: Active (Dec 2024)
> **Version**: 1.0
> **Author**: System Documentation

## Executive Summary

The Regulatory Intelligence Copilot uses **100% path-based versioning** for all message and conversation operations. This guide explains how the system works and how to develop features that align with this architecture.

**Important**: The legacy `supersededBy` pattern has been **completely removed** from the codebase (Dec 2024). All message versioning now uses the conversation path system.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [How It Works](#how-it-works)
3. [Developer Guidelines](#developer-guidelines)
4. [Migration History](#migration-history)
5. [Common Patterns](#common-patterns)
6. [Troubleshooting](#troubleshooting)

---

## Core Concepts

### What is Path-Based Versioning?

Path-based versioning treats every conversation as a **tree of paths** rather than a linear sequence of messages. Each path represents a complete, independent conversation timeline.

```
Main Path (Primary)
├── Message 1: "What are tax rules for Ireland?"
├── Message 2: (AI Response)
├── Message 3: "What about France?"
└── Message 4: (AI Response)

Branch Path 1 (from Message 1)
├── (Inherits Message 1)
├── Message 1': "What are tax rules for France?" (edited)
├── Message 5: (AI Response to edited question)
└── Message 6: "Tell me more"

Branch Path 2 (from Message 3)
├── (Inherits Messages 1-3)
├── Message 7: "Actually, what about Germany?"
└── Message 8: (AI Response)
```

### Key Principles

1. **Every message belongs to exactly one path**
2. **Paths can branch from any message**
3. **Messages are never modified in-place**
4. **Paths can be merged to consolidate insights**
5. **No supersededBy chains or implicit versioning**

---

## How It Works

### Database Schema

```sql
-- Path table: represents conversation timelines
CREATE TABLE copilot_internal.conversation_paths (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    parent_path_id uuid,              -- NULL for primary path
    branch_point_message_id uuid,      -- Message where this path branched
    name text,                         -- Optional user-defined name
    is_primary boolean DEFAULT false,  -- True for the main path
    is_active boolean DEFAULT true,    -- False for merged/archived paths
    merged_to_path_id uuid,           -- If this path was merged
    merged_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
);

-- Message table: all messages belong to a path
CREATE TABLE copilot_internal.conversation_messages (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL,
    path_id uuid NOT NULL,            -- Every message belongs to a path
    sequence_in_path integer NOT NULL, -- Position within the path
    role text CHECK (role IN ('user', 'assistant', 'system')),
    content text,
    metadata jsonb,
    created_at timestamptz,
    deleted_at timestamptz,            -- Soft delete
    -- Note: NO supersededBy field
);
```

### TypeScript Interfaces

```typescript
// packages/reg-intel-conversations/src/types/paths.ts

export interface ConversationPath {
  id: string;
  conversationId: string;
  tenantId: string;
  parentPathId: string | null;
  branchPointMessageId: string | null;
  name: string | null;
  isPrimary: boolean;
  isActive: boolean;
  mergedToPathId: string | null;
  mergedAt: Date | null;
  mergeSummaryMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PathAwareMessage {
  id: string;
  conversationId: string;
  pathId: string;
  sequenceInPath: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  deletedAt?: Date | null;
  // Branch indicators
  isBranchPoint: boolean;
  branchedToPaths: string[];
}
```

---

## Developer Guidelines

### ✅ DO: Creating Branches for Edits

When a user edits a message, **always create a new branch**:

```typescript
// ✅ CORRECT: Create a branch for the edited message
async function handleMessageEdit(
  conversationId: string,
  messageId: string,
  newContent: string
) {
  // 1. Create a new branch from the edited message
  const newPath = await pathStore.createBranch({
    tenantId,
    conversationId,
    branchPointMessageId: messageId,
    name: 'Edit: ' + newContent.substring(0, 30),
  });

  // 2. Set the new branch as active
  await pathStore.setActivePath({
    tenantId,
    conversationId,
    pathId: newPath.id,
  });

  // 3. Add the edited message to the new path
  await conversationStore.appendMessage({
    tenantId,
    conversationId,
    role: 'user',
    content: newContent,
    metadata: { editedFrom: messageId },
  });

  // Original message remains unchanged on original path
}
```

### ❌ DON'T: Use supersededBy

```typescript
// ❌ WRONG: Do not use supersededBy (removed from codebase)
await conversationStore.softDeleteMessage({
  tenantId,
  conversationId,
  messageId,
  supersededBy: newMessageId, // ← This parameter doesn't exist anymore
});
```

### ✅ DO: Querying Messages for a Path

Always query messages with path context:

```typescript
// ✅ CORRECT: Get messages for a specific path
const messages = await pathStore.resolvePathMessages({
  tenantId,
  conversationId,
  pathId: activePathId,
});
// Returns messages in correct order for this path
```

### ❌ DON'T: Query All Messages and Filter

```typescript
// ❌ WRONG: Don't get all messages and filter manually
const allMessages = await conversationStore.getMessages({
  tenantId,
  conversationId,
});
// This doesn't respect path boundaries
const filtered = allMessages.filter(m => /* some logic */);
```

### ✅ DO: Track Active Path in UI

```typescript
// ✅ CORRECT: Track which path the user is viewing
const [activePathId, setActivePathId] = useState<string>(primaryPathId);

// Update URL when path changes
useEffect(() => {
  updateUrl(conversationId, activePathId);
}, [conversationId, activePathId]);

// Use PathToolbar for path switching
<PathToolbar
  onPathSwitch={(path) => {
    setActivePathId(path.id);
    loadMessagesForPath(path.id);
  }}
/>
```

### ✅ DO: Show Branch Indicators

```typescript
// ✅ CORRECT: Show when a message has branches
<Message
  {...messageProps}
  isBranchPoint={message.isBranchPoint}
  branchedPaths={message.branchedToPaths}
  onViewBranch={(pathId) => switchToPath(pathId)}
/>
```

---

## Migration History

### Timeline

| Date | Event | Details |
|------|-------|---------|
| **Dec 7, 2024** | Path system implemented | Database migration, backend stores, API routes |
| **Dec 7, 2024** | UI components released | `@reg-copilot/reg-intel-ui` with PathToolbar, BranchDialog |
| **Dec 7, 2024** | Demo app integrated | Full path support in demo-web |
| **Dec 27, 2024** | Legacy code removed | `supersededBy` completely removed from codebase |
| **Dec 27, 2024** | UI improvements complete | Persistent branch indicators, URL tracking |

### What Was Removed

The following patterns/code have been **completely removed**:

1. ✅ `supersededBy` field from ConversationMessage interface
2. ✅ `supersededBy` parameter from `softDeleteMessage()` method
3. ✅ `supersededBy` extraction in `mapMessageRow()`
4. ✅ `supersededBy` handling in InMemoryConversationStore
5. ✅ `supersededBy` handling in SupabaseConversationStore
6. ✅ `supersededBy` usage in reg-intel-next-adapter

### Database Migration

The database migration (`20241207000000_conversation_paths_consolidated.sql`) handled the transition:

```sql
-- Migrated existing supersededBy chains to deprecated metadata
UPDATE copilot_internal.conversation_messages m
SET metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'deprecated_versioning', jsonb_build_object(
        'note', 'This message was part of supersededBy chain, now deprecated',
        'migrated_at', now()::text,
        'original_superseded_by', m.metadata->>'supersededBy'
    )
)
WHERE m.metadata->>'supersededBy' IS NOT NULL;
```

**Important**: The `supersededBy` data is preserved in metadata for audit purposes only. It is **not used** by any active code.

---

## Common Patterns

### Pattern 1: Creating a Conversation

```typescript
// Create conversation with primary path automatically
const { conversationId } = await conversationStore.createConversation({
  tenantId,
  userId,
  personaId: 'tax-advisor',
  jurisdictions: ['IE', 'FR'],
  title: 'Cross-border tax planning',
});

// Primary path is created automatically by database trigger
```

### Pattern 2: Branching from a Message

```typescript
// User wants to explore alternative scenario
async function branchFromMessage(messageId: string, branchName: string) {
  const newPath = await pathStore.createBranch({
    tenantId,
    conversationId,
    branchPointMessageId: messageId,
    name: branchName,
  });

  // Switch to new branch
  await pathStore.setActivePath({
    tenantId,
    conversationId,
    pathId: newPath.id,
  });

  return newPath;
}
```

### Pattern 3: Merging Paths

```typescript
// Bring insights from branch back to main path
async function mergeBranchToMain(branchPathId: string) {
  const result = await pathStore.mergePaths({
    tenantId,
    conversationId,
    sourcePathId: branchPathId,
    targetPathId: primaryPathId,
    strategy: 'ai-summary', // or 'full-history'
  });

  // Summary message is added to target path
  console.log('Merge summary:', result.mergeSummaryMessageId);
}
```

### Pattern 4: Switching Between Paths

```typescript
// Let user navigate between different conversation timelines
function PathSelector() {
  const { paths, activePath, switchPath } = useConversationPaths();

  return (
    <select
      value={activePath?.id}
      onChange={(e) => switchPath(e.target.value)}
    >
      {paths.map(path => (
        <option key={path.id} value={path.id}>
          {path.isPrimary ? 'Main' : path.name || `Branch ${path.id.slice(0,6)}`}
        </option>
      ))}
    </select>
  );
}
```

---

## Troubleshooting

### Issue: Messages appearing in wrong order

**Cause**: Not respecting `sequence_in_path` order.

**Solution**: Always order by `sequence_in_path` when querying:

```typescript
// ✅ CORRECT
const messages = await db
  .from('conversation_messages')
  .select('*')
  .eq('path_id', pathId)
  .order('sequence_in_path', { ascending: true });
```

### Issue: Missing messages after branch creation

**Cause**: Not inheriting parent path messages.

**Solution**: Use `resolvePathMessages()` which handles inheritance:

```typescript
// ✅ CORRECT: Automatically inherits parent messages
const messages = await pathStore.resolvePathMessages({
  tenantId,
  conversationId,
  pathId: branchPathId,
});
```

### Issue: Can't find supersededBy field

**Cause**: Code trying to use removed field.

**Solution**: Use path-based branching instead:

```typescript
// ❌ OLD (removed):
message.supersededBy

// ✅ NEW (use paths):
message.isBranchPoint
message.branchedToPaths
```

---

## Best Practices

### 1. Always Use Path Context

```typescript
// ✅ GOOD: Pass pathId everywhere
<MessageList pathId={activePathId} />

// ❌ BAD: Assume single path
<MessageList />  // Which path?
```

### 2. Update URL with Path Info

```typescript
// ✅ GOOD: Shareable URLs
updateUrl(conversationId, activePathId);
// Result: /?conversationId=abc&pathId=xyz

// ❌ BAD: No path in URL
updateUrl(conversationId);
// Result: /?conversationId=abc  (which path?)
```

### 3. Show Visual Branch Indicators

```typescript
// ✅ GOOD: User can see branches exist
{message.isBranchPoint && (
  <Badge>
    <GitBranch /> {message.branchedToPaths.length} branches
  </Badge>
)}

// ❌ BAD: Branches hidden
// (No visual indication)
```

### 4. Handle Path Switching Gracefully

```typescript
// ✅ GOOD: Reload messages when path changes
useEffect(() => {
  if (activePathId) {
    loadMessagesForPath(activePathId);
  }
}, [activePathId]);

// ❌ BAD: Keep stale messages
// (Don't reload on path change)
```

---

## API Reference

### ConversationPathStore Methods

```typescript
interface ConversationPathStore {
  // Create a new branch from a message
  createBranch(params: {
    tenantId: string;
    conversationId: string;
    branchPointMessageId: string;
    name?: string;
  }): Promise<ConversationPath>;

  // Get all paths for a conversation
  getPaths(params: {
    tenantId: string;
    conversationId: string;
  }): Promise<ConversationPath[]>;

  // Set which path is currently active
  setActivePath(params: {
    tenantId: string;
    conversationId: string;
    pathId: string;
  }): Promise<void>;

  // Get messages for a path (with inheritance)
  resolvePathMessages(params: {
    tenantId: string;
    conversationId: string;
    pathId: string;
  }): Promise<PathAwareMessage[]>;

  // Merge one path into another
  mergePaths(params: {
    tenantId: string;
    conversationId: string;
    sourcePathId: string;
    targetPathId: string;
    strategy: 'ai-summary' | 'full-history';
  }): Promise<MergeResult>;
}
```

---

## Additional Resources

- [Conversation Branching & Merging Architecture](../architecture/conversation-branching-and-merging.md)
- [Implementation Plan](../architecture/IMPLEMENTATION-PLAN.md)
- [Outstanding Work](../architecture/OUTSTANDING_WORK.md)
- [Path System Status](./PATH_SYSTEM_STATUS.md)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-27 | Initial guide created after supersededBy removal |

**Document Status**: Active
**Maintenance**: Update this guide when path system changes
