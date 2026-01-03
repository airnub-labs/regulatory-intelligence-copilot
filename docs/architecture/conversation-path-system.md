# Conversation Path System

> **Status**: Fully Implemented (Production Ready)
> **Version**: 2.0 (Path-Based Versioning)
> **Last Updated**: 2026-01-03
> **Canonical Document**: This is the authoritative reference for the conversation path system.

## Table of Contents

1. [Overview](#1-overview)
2. [Conceptual Model](#2-conceptual-model)
3. [Data Model](#3-data-model)
4. [Core Operations](#4-core-operations)
5. [API Surface](#5-api-surface)
6. [UI/UX Behavior](#6-uiux-behavior)
7. [Developer Guide](#7-developer-guide)
8. [Invariants & Guarantees](#8-invariants--guarantees)
9. [Edge Cases & Pitfalls](#9-edge-cases--pitfalls)
10. [Future Work](#10-future-work)
11. [References](#11-references)

---

## 1. Overview

The Conversation Path System provides **branching, merging, and path-aware navigation** for conversations. It replaces the legacy `supersededBy` pattern (removed December 2024) with a tree-based path model where every version of a conversation exists on its own explicit path.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Path-Aware Navigation** | When viewing previous message versions, the entire conversation history updates to show the true conversation state at that point |
| **Conversation Branching** | Create independent conversation timelines from any message point |
| **Conversation Merging** | Merge results from branched conversations back to the parent with AI-powered summarization |
| **Version Control** | Every edit creates a new branch, preserving complete history |

### Architecture Diagram

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

---

## 2. Conceptual Model

### What is a Path?

A **path** represents a complete, independent conversation timeline within a conversation. Paths form a tree structure:

- **Primary Path**: The original/main conversation timeline, created automatically when a conversation starts
- **Branch Paths**: Derived timelines that diverge from a specific message (the "branch point")

### Key Principles

1. **Every message belongs to exactly one path**
2. **Paths can branch from any message**
3. **Messages are never modified in-place** (editing creates a branch)
4. **Paths can be merged** to consolidate insights
5. **No supersededBy chains** — all versioning is path-based

### Path Inheritance

Child paths **inherit** messages from their parent path up to (and including) the branch point message. This means:

```
Primary Path: [M1, M2, M3, M4]
                    ↑ branch point
Branch Path:  [M1, M2, M3] + [M5, M6]  (inherits M1-M3, adds M5-M6)
```

### When Branching Happens

| Action | Result |
|--------|--------|
| User edits a message | New branch created automatically |
| User clicks "Branch" button | New branch created explicitly |
| Branch point: the message where edit/branch occurred | Referenced by child path |

---

## 3. Data Model

### Database Schema

The path system uses two main tables in the `copilot_internal` schema:

#### `conversation_paths` Table

```sql
CREATE TABLE copilot_internal.conversation_paths (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL,

    -- Path lineage
    parent_path_id uuid REFERENCES conversation_paths(id) ON DELETE SET NULL,
    branch_point_message_id uuid,  -- Message where this path branched

    -- Metadata
    name text,                     -- Optional user-defined name
    description text,              -- Optional description
    is_primary boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,

    -- Merge tracking
    merged_to_path_id uuid REFERENCES conversation_paths(id),
    merged_at timestamptz,
    merge_summary_message_id uuid,
    merge_mode text CHECK (merge_mode IN ('summary', 'full', 'selective')),

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### Message Path Columns

```sql
ALTER TABLE copilot_internal.conversation_messages ADD COLUMN
    path_id uuid NOT NULL REFERENCES conversation_paths(id),
    sequence_in_path integer NOT NULL,
    is_branch_point boolean NOT NULL DEFAULT false,
    branched_to_paths uuid[] DEFAULT '{}',
    message_type text NOT NULL DEFAULT 'standard'
        CHECK (message_type IN ('standard', 'merge_summary', 'branch_point', 'system'));
```

#### Conversations Active Path

```sql
ALTER TABLE copilot_internal.conversations ADD COLUMN
    active_path_id uuid REFERENCES conversation_paths(id);
```

### TypeScript Interfaces

```typescript
// packages/reg-intel-conversations/src/types/paths.ts

interface ConversationPath {
  id: string;
  conversationId: string;
  tenantId: string;
  parentPathId: string | null;
  branchPointMessageId: string | null;
  name: string | null;
  description: string | null;
  isPrimary: boolean;
  isActive: boolean;
  mergedToPathId: string | null;
  mergedAt: Date | null;
  mergeSummaryMessageId: string | null;
  mergeMode: 'summary' | 'full' | 'selective' | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount?: number;
  branchCount?: number;
}

interface PathAwareMessage {
  id: string;
  conversationId: string;
  pathId: string;
  tenantId: string;
  userId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  sequenceInPath: number;
  isBranchPoint: boolean;
  branchedToPaths: string[];
  messageType: 'standard' | 'merge_summary' | 'branch_point' | 'system';
  isPinned: boolean;
  pinnedAt: Date | null;
  pinnedBy: string | null;
  createdAt: Date;
  effectiveSequence?: number;
}
```

### Indexes

```sql
-- Primary path uniqueness (one primary per conversation)
CREATE UNIQUE INDEX idx_conversation_paths_primary
    ON conversation_paths(conversation_id) WHERE is_primary = true;

-- Efficient path queries
CREATE INDEX idx_paths_conversation ON conversation_paths(conversation_id, is_active);
CREATE INDEX idx_paths_parent ON conversation_paths(parent_path_id) WHERE parent_path_id IS NOT NULL;
CREATE INDEX idx_messages_path_sequence ON conversation_messages(path_id, sequence_in_path);
CREATE INDEX idx_messages_branch_points ON conversation_messages(conversation_id, is_branch_point) WHERE is_branch_point = true;
```

---

## 4. Core Operations

### Path Store Interface

```typescript
// packages/reg-intel-conversations/src/pathStores.ts

interface ConversationPathStore {
  // Path CRUD
  createPath(input: CreatePathInput): Promise<{ pathId: string }>;
  getPath(input: GetPathInput): Promise<ConversationPath | null>;
  listPaths(input: ListPathsInput): Promise<ConversationPath[]>;
  updatePath(input: UpdatePathInput): Promise<void>;
  deletePath(input: DeletePathInput): Promise<void>;

  // Path Resolution
  resolvePathMessages(input: ResolvePathMessagesInput): Promise<PathAwareMessage[]>;
  getFullPathResolution(input: ResolvePathMessagesInput): Promise<PathResolution>;

  // Active Path Management
  getActivePath(input: GetActivePathInput): Promise<ConversationPath | null>;
  setActivePath(input: SetActivePathInput): Promise<void>;

  // Branching
  branchFromMessage(input: BranchInput): Promise<BranchResult>;
  getBranchPointsForPath(input: GetPathInput): Promise<BranchPoint[]>;

  // Merging
  mergePath(input: MergeInput): Promise<MergeResult>;
  previewMerge(input: Omit<MergeInput, 'userId' | 'archiveSource'>): Promise<MergePreview>;

  // Utilities
  getPrimaryPath(input): Promise<ConversationPath | null>;
  ensurePrimaryPath(input): Promise<ConversationPath>;
}
```

### Path Resolution Algorithm

When resolving messages for a path, the system composes inherited messages from parent paths:

```typescript
async function resolvePathMessages(pathId: string): Promise<PathAwareMessage[]> {
  const path = await getPath(pathId);

  if (!path.parentPathId) {
    // Primary path - return all messages directly
    return getMessagesForPath(pathId);
  }

  // Child path - inherit from parent
  const parentMessages = await resolvePathMessages(path.parentPathId);

  // Find branch point in parent messages
  const branchPointIndex = parentMessages.findIndex(
    m => m.id === path.branchPointMessageId
  );

  // Take parent messages up to and including branch point
  const inheritedMessages = parentMessages.slice(0, branchPointIndex + 1);

  // Get this path's own messages
  const ownMessages = await getMessagesForPath(pathId);

  return [...inheritedMessages, ...ownMessages];
}
```

### Branch Creation

```typescript
async function branchFromMessage(input: BranchInput): Promise<BranchResult> {
  const { tenantId, conversationId, sourceMessageId, name } = input;

  // 1. Create new path record
  const { pathId } = await createPath({
    tenantId,
    conversationId,
    parentPathId: sourceMessage.pathId,
    branchPointMessageId: sourceMessageId,
    name,
    isPrimary: false,
  });

  // 2. Mark source message as branch point
  await markAsBranchPoint(sourceMessageId, pathId);

  // 3. Set new path as active
  await setActivePath({ tenantId, conversationId, pathId });

  return { pathId, branchPointMessage: sourceMessage };
}
```

### Merge Behavior

Three merge modes are supported:

| Mode | Description |
|------|-------------|
| **Summary** | AI generates a concise summary of the branch, appended as a single message |
| **Full** | All messages from the branch are appended to the target path |
| **Selective** | User selects specific messages to include |

```typescript
async function mergePath(input: MergeInput): Promise<MergeResult> {
  const { sourcePathId, targetPathId, mergeMode, summaryContent } = input;

  if (mergeMode === 'summary') {
    // Create merge summary message
    const summaryMessage = await createMergeSummaryMessage({
      pathId: targetPathId,
      content: summaryContent,
      metadata: {
        type: 'merge_summary',
        sourcePathId,
        mergedMessageCount,
      }
    });
  }

  // Mark source path as merged
  await updatePath({
    pathId: sourcePathId,
    mergedToPathId: targetPathId,
    mergedAt: new Date(),
    isActive: input.archiveSource ? false : true,
  });

  return { success: true, summaryMessageId };
}
```

---

## 5. API Surface

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/conversations/:id/paths` | List all paths for a conversation |
| `POST` | `/api/conversations/:id/paths` | Create a new path |
| `GET` | `/api/conversations/:id/paths/:pathId` | Get path details |
| `PATCH` | `/api/conversations/:id/paths/:pathId` | Update path metadata |
| `DELETE` | `/api/conversations/:id/paths/:pathId` | Delete/archive path |
| `GET` | `/api/conversations/:id/paths/:pathId/messages` | Get resolved messages for path |
| `POST` | `/api/conversations/:id/branch` | Create branch from message |
| `POST` | `/api/conversations/:id/paths/:pathId/merge` | Merge path to target |
| `GET` | `/api/conversations/:id/paths/:pathId/merge/preview` | Preview merge result |
| `GET` | `/api/conversations/:id/active-path` | Get currently active path |
| `PUT` | `/api/conversations/:id/active-path` | Set active path |

### Request/Response Examples

**Create Branch**
```typescript
POST /api/conversations/:id/branch
Body: {
  sourceMessageId: string,
  name?: string,
  description?: string
}
Response: {
  path: ConversationPath,
  branchPointMessage: PathAwareMessage
}
```

**Merge Path**
```typescript
POST /api/conversations/:id/paths/:pathId/merge
Body: {
  targetPathId: string,
  mergeMode: 'summary' | 'full' | 'selective',
  summaryPrompt?: string,
  selectedMessageIds?: string[],
  archiveSource?: boolean
}
Response: {
  success: boolean,
  summaryMessageId?: string,
  mergedMessageIds?: string[]
}
```

---

## 6. UI/UX Behavior

### UI Components

The path system includes these UI components in `@reg-copilot/reg-intel-ui`:

| Component | Purpose |
|-----------|---------|
| `PathSelector` | Dropdown showing all paths with metadata, quick actions |
| `BranchButton` | Icon button to trigger branch creation |
| `BranchDialog` | Modal for branch configuration (name, description) |
| `MergeDialog` | Modal for merge configuration with mode selection |
| `VersionNavigator` | Left/right arrows for version navigation |
| `PathBreadcrumbs` | Horizontal navigation showing path hierarchy with jump-to-message |

### Integration Components (demo-web)

| Component | Location | Purpose |
|-----------|----------|---------|
| `ConditionalPathProvider` | `components/chat/` | Context provider wrapper |
| `PathToolbar` | `components/chat/` | Path selector with merge controls |
| `PathAwareMessageList` | `components/chat/` | Message list respecting active path |
| `PathBreadcrumbNav` | `components/chat/` | Breadcrumb navigation integration |

### Path Selector Display

```
┌─────────────────────────────────────────────────────────────────┐
│  Path: Primary  [▼]                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📍 Primary (current)                                    │   │
│  │     12 messages • Last active 2 min ago                  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  └─ PRSI deep dive                                       │   │
│  │     Branched from: "Directors have several..."          │   │
│  │     5 messages • Created Dec 5                           │   │
│  │     [View] [Merge to main] [Delete]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Breadcrumb Navigation

```
Path: Primary > Alternative Scenario 💬 > Edit: What about France?
               ↑ Icon indicates branch point     ↑ Active path (bold)
```

**Behavior:**
- Click parent path → Switch to that path + scroll to branch point message
- 2-second highlight animation on branch point
- Tooltips show branch point message preview (first 80 characters)

### Labeling Conventions

| Path Type | Label |
|-----------|-------|
| Primary path | "Primary" (not "Main") |
| Named branch | User-provided name |
| Unnamed branch | "Branch {short-id}" |
| Merged path | "✓ {name} (merged)" |

### Branch Point Indicators

Messages that have branches show a visual indicator:

```typescript
{message.isBranchPoint && (
  <Badge>
    <GitBranch /> {message.branchedToPaths.length} branches
  </Badge>
)}
```

---

## 7. Developer Guide

### Creating a Conversation with Paths

Paths are created automatically when the first message is appended:

```typescript
// Primary path created automatically
const { messageId } = await conversationStore.appendMessage({
  tenantId,
  conversationId,
  role: 'user',
  content: 'Hello',
  // pathId is optional - uses active path by default
});
```

### Branching from a Message

```typescript
// Create branch explicitly
const result = await fetch('/api/conversations/conv-123/branch', {
  method: 'POST',
  body: JSON.stringify({
    sourceMessageId: 'msg-456',
    name: 'Alternative approach',
  }),
});

const { path, branchPointMessage } = await result.json();
```

### Switching Active Path

```typescript
// Via API
await fetch('/api/conversations/conv-123/active-path', {
  method: 'PUT',
  body: JSON.stringify({ pathId: 'path-789' }),
});

// Via hook
const { switchPath } = useConversationPaths();
await switchPath('path-789');
```

### Querying Messages for a Path

Always use path-aware queries:

```typescript
// ✅ CORRECT: Get messages for specific path (with inheritance)
const messages = await pathStore.resolvePathMessages({
  tenantId,
  conversationId,
  pathId: activePathId,
});

// ❌ WRONG: Don't get all messages and filter manually
const allMessages = await conversationStore.getMessages({...});
// This doesn't respect path boundaries
```

### Best Practices

1. **Always pass pathId to context-dependent operations**
2. **Update URL with path info** for shareable links: `?conversationId=abc&pathId=xyz`
3. **Show visual branch indicators** so users know branches exist
4. **Reload messages when path changes**

---

## 8. Invariants & Guarantees

### System Invariants

1. **No in-place editing**: Messages are never modified; editing creates a branch
2. **Branch creation is the only way to "edit" history**: Original messages remain unchanged
3. **Paths form a tree**: Every path except the primary has exactly one parent
4. **Merge does not destroy origin branch history**: Source path remains viewable
5. **One primary path per conversation**: Enforced by unique partial index
6. **All messages belong to a path**: `path_id` is NOT NULL on messages
7. **Sequential ordering within paths**: `sequence_in_path` determines order

### Multi-Tenant Security

Row-Level Security (RLS) policies enforce tenant isolation:

```sql
CREATE POLICY conversation_paths_tenant_read
    ON conversation_paths FOR SELECT TO authenticated
    USING (tenant_id = public.current_tenant_id());

CREATE POLICY conversation_paths_tenant_write
    ON conversation_paths FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.current_tenant_id());
```

---

## 9. Edge Cases & Pitfalls

### Nested Branching

Branches can be created from branches, forming arbitrarily deep trees:

```
Primary
└── Scenario A (branch from Primary)
    └── Option 1 (branch from Scenario A)
        └── Edit: Revised question (branch from Option 1)
```

**Resolution**: Path resolution recursively inherits from all ancestors.

### Stale UI State After Editing

**Problem**: After creating a branch from edit, UI might show stale paths.

**Solution**: Use `pathReloadKey` to force provider remount:
```typescript
setPathReloadKey(prev => prev + 1);  // Forces path list refresh
```

### Switching Paths Quickly

**Problem**: Race conditions when switching paths rapidly.

**Solution**:
- Provider manages loading states (`isLoadingMessages`, `isSwitchingPath`)
- UI disables path selector during transitions
- Error handling with graceful fallbacks

### Branch Points on Deleted Messages

**Problem**: What if the branch point message is soft-deleted?

**Solution**: Branch point reference remains valid; deleted messages still appear in path resolution with `deletedAt` set.

### Deep Path Hierarchies

**Problem**: Very deep branch trees may impact resolution performance.

**Solution**:
- Path resolution is recursive but efficient (typically 2-3 levels)
- Consider adding path depth caching if needed for extremely deep trees

---

## 10. Future Work

> **Note**: Items below are validated as not currently implemented in the codebase.

### Path Comparison View

Side-by-side view of two paths showing divergence points:

```
┌────────────────────────┬────────────────────────┐
│      Main Path         │    PRSI Branch         │
├────────────────────────┼────────────────────────┤
│ Q: Tax obligations?    │ Q: Tax obligations?    │ ← Common
│ A: Directors have...   │ A: Directors have...   │ ← Common
├────────────────────────┼────────────────────────┤
│ Q: Tell me about USC   │ Q: More about PRSI?    │ ← Divergence
│ A: USC is charged...   │ A: PRSI Class S...     │
└────────────────────────┴────────────────────────┘
```

### Path Templates

Pre-defined branching patterns for common workflows:
- **Deep Dive**: Branch for detailed exploration, auto-summarize back
- **Alternative Analysis**: Compare two approaches side-by-side
- **Verification**: Branch to fact-check, merge findings
- **Scenario Planning**: Branch for each scenario, compare outcomes

### Collaborative Paths

Multiple users working on different branches simultaneously:
- Real-time presence indicators on paths
- Lock/unlock paths for exclusive editing
- Notification when paths are merged
- Conflict resolution for concurrent edits

### Path Analytics

Track which paths lead to best outcomes:
- Path usage metrics
- Merge frequency analysis
- Branch abandonment rates

### Path Export

Export specific paths as standalone conversations for sharing or archival.

### Additional Merge Modes

- **Diff merge**: Show differences between paths before merging
- **Interactive merge**: Step-by-step message selection with preview

---

## 11. References

### Code Locations

| Component | Location |
|-----------|----------|
| Path Store Interface & Implementations | `packages/reg-intel-conversations/src/pathStores.ts` |
| Path TypeScript Types | `packages/reg-intel-conversations/src/types/paths.ts` |
| Message Store (with path support) | `packages/reg-intel-conversations/src/conversationStores.ts` |
| UI Component Library | `packages/reg-intel-ui/src/components/` |
| Path Hooks | `packages/reg-intel-ui/src/hooks/useConversationPaths.tsx` |
| API Routes | `apps/demo-web/src/app/api/conversations/[id]/paths/` |
| Integration Components | `apps/demo-web/src/components/chat/` |
| Path API Client | `apps/demo-web/src/lib/pathApiClient.ts` |
| Merge Summarizer | `apps/demo-web/src/lib/server/mergeSummarizer.ts` |

### Database Migrations

- `supabase/migrations/20241207000000_conversation_paths_consolidated.sql` - Complete path system schema

### Related Documentation

- [Architecture v0.6](./architecture_v_0_6.md) - Overall system architecture
- [Conversation Compaction](./CONVERSATION_COMPACTION_ARCHITECTURE.md) - Message compaction system
- [Message Pinning](./MESSAGE_PINNING.md) - Pin messages across compaction

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-03 | Consolidated from multiple docs; reflects fully implemented system |
| 1.0 | 2024-12-07 | Initial path system implementation |
| N/A | 2024-12-27 | Legacy `supersededBy` pattern fully removed |

---

**Document Status**: Canonical
**Supersedes**: All prior path-system documentation (now archived)
**Maintenance**: Update when path system changes
