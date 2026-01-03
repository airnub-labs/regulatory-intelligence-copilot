> **ARCHIVED (2026-01-03)**: Superseded by [`docs/architecture/conversation-path-system.md`](../../architecture/conversation-path-system.md). Retained for historical reference.

---

# Full Path System Implementation Plan

## Executive Summary

This document outlines the implementation plan to fully integrate the conversation path system with branching, merging, and path-aware navigation as defined in `docs/architecture/conversation-branching-and-merging.md`.

**Current State**: Basic message editing with implicit branching via soft-delete
**Target State**: Full path-aware system with explicit branching, merging, and UI controls

---

## Phase 1: Backend Foundation

### 1.1 Database Schema ✅ (Already Implemented)

**Status**: The `conversation_paths` table and related migrations exist
**Location**: `supabase/migrations/20241207000001_add_conversation_paths.sql`

Verified components:
- ✅ `conversation_paths` table with path lineage
- ✅ `path_id` column on `conversation_messages`
- ✅ Indexes for efficient path queries
- ✅ RLS policies for path access control
- ✅ Views for safe path data exposure

**Action Required**: Verify permissions are working correctly after recent fixes

### 1.2 ConversationPathStore Implementation

**Status**: Partially implemented
**Location**: `packages/reg-intel-conversations/src/pathStores.ts`

**Existing Methods** (need verification):
- ✅ `createPath`
- ✅ `getPath`
- ✅ `listPaths`
- ✅ `resolvePathMessages`
- ✅ `branchFromMessage`
- ✅ `mergePath`

**Todo**:
1. Review and test all existing path store methods
2. Ensure `branchFromMessage` creates proper parent-child relationships
3. Verify `resolvePathMessages` correctly composes inherited messages
4. Test merge summarization logic
5. Add unit tests for path resolution algorithms

### 1.3 Path-Aware Message Operations

**Status**: In progress
**Location**: `packages/reg-intel-next-adapter/src/index.ts`

**Recent Changes**:
- ✅ Message editing now creates implicit branches
- ✅ Soft-deletes subsequent messages when editing

**Todo**:
1. Update `appendMessage` to accept optional `pathId` parameter
2. When `pathId` is provided, append to that specific path
3. Update message retrieval to filter by active path
4. Add path tracking to conversation metadata

**Implementation**:
```typescript
// In chat handler, accept optional pathId
const pathId = body.pathId ?? conversationRecord.activePathId;

// When appending messages, use the specified path
await conversationStore.appendMessage({
  tenantId,
  conversationId,
  pathId, // Use explicit path
  role: 'user',
  content: incomingMessageContent,
  userId,
});
```

---

## Phase 2: API Endpoints

### 2.1 Path Management Endpoints

**Location**: Create `apps/demo-web/app/api/conversations/[conversationId]/paths/route.ts`

**Endpoints to implement**:

```typescript
// List all paths for a conversation
GET /api/conversations/:conversationId/paths
Response: { paths: ConversationPath[] }

// Create a new path (for explicit branching)
POST /api/conversations/:conversationId/paths
Body: { parentPathId?, branchPointMessageId?, name? }
Response: { pathId: string }

// Get specific path details
GET /api/conversations/:conversationId/paths/:pathId
Response: { path: ConversationPath, messages: ConversationMessage[] }

// Update path metadata
PATCH /api/conversations/:conversationId/paths/:pathId
Body: { name?, isActive? }
Response: { path: ConversationPath }

// Delete/archive path
DELETE /api/conversations/:conversationId/paths/:pathId
Response: { success: boolean }
```

### 2.2 Branching Endpoint

**Location**: Create `apps/demo-web/app/api/conversations/[conversationId]/branch/route.ts`

```typescript
POST /api/conversations/:conversationId/branch
Body: {
  sourceMessageId: string
  branchName?: string
  openInNewTab?: boolean
}
Response: {
  pathId: string
  conversationId: string
  branchUrl: string
}
```

**Implementation**:
1. Call `conversationPathStore.branchFromMessage()`
2. Update conversation's active path
3. Return new path ID and URL for navigation
4. Broadcast SSE event `path:created`

### 2.3 Merging Endpoint

**Location**: Create `apps/demo-web/app/api/conversations/[conversationId]/paths/[pathId]/merge/route.ts`

```typescript
POST /api/conversations/:conversationId/paths/:pathId/merge
Body: {
  targetPathId: string
  mergeMode: 'summary' | 'full' | 'selective'
  selectedMessageIds?: string[]
  summaryPrompt?: string
}
Response: {
  success: boolean
  summaryMessageId?: string
  mergedMessageIds?: string[]
}
```

**Implementation**:
1. Call `conversationPathStore.mergePath()`
2. For 'summary' mode, use ComplianceEngine to generate summary
3. Append summary/messages to target path
4. Mark source path as merged
5. Broadcast SSE event `path:merged`

### 2.4 Active Path Endpoint

**Location**: Create `apps/demo-web/app/api/conversations/[conversationId]/active-path/route.ts`

```typescript
GET /api/conversations/:conversationId/active-path
Response: { pathId: string, path: ConversationPath }

PUT /api/conversations/:conversationId/active-path
Body: { pathId: string }
Response: { success: boolean }
```

---

## Phase 3: Frontend State Management

### 3.1 Create useConversationPaths Hook

**Location**: Create `apps/demo-web/src/hooks/useConversationPaths.ts`

**State to manage**:
```typescript
interface ConversationPathState {
  paths: ConversationPath[]
  activePathId: string | null
  activePath: ConversationPath | null
  messages: ConversationMessage[]
  isLoadingPaths: boolean
  isLoadingMessages: boolean
  isBranching: boolean
  isMerging: boolean
}
```

**Actions to implement**:
```typescript
interface ConversationPathActions {
  loadPaths: () => Promise<void>
  loadPathMessages: (pathId: string) => Promise<void>
  setActivePath: (pathId: string) => void
  branchFromMessage: (messageId: string, name?: string) => Promise<string>
  mergePath: (sourcePathId: string, mode: MergeMode, options?) => Promise<void>
  renamePath: (pathId: string, name: string) => Promise<void>
  deletePath: (pathId: string) => Promise<void>
}
```

**Implementation notes**:
1. Use React Query or SWR for caching
2. Subscribe to SSE path events
3. Optimistically update UI on actions
4. Handle loading and error states
5. Integrate with existing `useConversation` hook

### 3.2 Update useConversation Hook

**Location**: `apps/demo-web/src/hooks/useConversation.ts`

**Changes needed**:
1. Accept optional `pathId` parameter
2. Filter messages by active path
3. Track current path in state
4. Expose path-switching functionality

---

## Phase 4: UI Components

### 4.1 Update Message Component

**Location**: `apps/demo-web/src/components/chat/Message.tsx` (or similar)

**Current state**: Only last message has "Edit" button
**Target state**: Every user message has edit and branch icons

**Changes**:
```typescript
// Add icons to every user message
{message.role === 'user' && (
  <div className="message-actions">
    <button onClick={() => onEdit(message.id)} title="Edit message">
      <EditIcon />
    </button>
    <button onClick={() => onBranch(message.id)} title="Branch from here">
      <BranchIcon />
    </button>
  </div>
)}
```

**Styling**:
- Show icons on hover
- Position near message timestamp
- Use consistent icon library (Lucide React recommended)

### 4.2 Create Path Selector Component

**Location**: Create `apps/demo-web/src/components/paths/PathSelector.tsx`

**UI Design** (from architecture doc):
```
┌─────────────────────────────────────────────────────────────────┐
│  Path: main  [▼]                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📍 main (current)                         Primary       │   │
│  │     12 messages • Last active 2 min ago                  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  🌿 PRSI deep dive                                       │   │
│  │     Branched from: "Directors have several..."          │   │
│  │     5 messages • Created Dec 5                           │   │
│  │     [View] [Merge to main] [Delete]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface PathSelectorProps {
  conversationId: string
  paths: ConversationPath[]
  activePathId: string
  onPathSelect: (pathId: string) => void
  onMergePath: (pathId: string) => void
  onDeletePath: (pathId: string) => void
}
```

**Features**:
1. Dropdown showing all paths
2. Visual indicator for primary path
3. Show branch point context
4. Quick actions: View, Merge, Delete
5. Show path metadata (message count, last active)

### 4.3 Create Branch Dialog Component

**Location**: Create `apps/demo-web/src/components/paths/BranchDialog.tsx`

**UI Design**:
```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           🌿 Create Branch                               │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  Branch from this message to explore a different         │   │
│  │  direction without affecting the main conversation.      │   │
│  │                                                          │   │
│  │  Branch name (optional):                                 │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ [Input field]                                   │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │  ○ Continue in current view                              │   │
│  │  ● Open in new tab                                       │   │
│  │                                                          │   │
│  │                      [Cancel]  [Create Branch]           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface BranchDialogProps {
  open: boolean
  onClose: () => void
  messageId: string
  messageContent: string // For context
  onBranch: (name?: string, openInNewTab?: boolean) => Promise<void>
}
```

**Implementation**:
1. Use shadcn/ui Dialog component
2. Show truncated message content for context
3. Optional name input
4. Radio buttons for navigation choice
5. Handle branch creation and navigation

### 4.4 Create Merge Dialog Component

**Location**: Create `apps/demo-web/src/components/paths/MergeDialog.tsx`

**UI Design**:
```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           🔀 Merge Branch                                │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  Merge "PRSI deep dive" → "main"                        │   │
│  │                                                          │   │
│  │  Merge mode:                                             │   │
│  │  ● Summary (recommended) - AI summarizes key findings    │   │
│  │  ○ Full merge - All messages appended                    │   │
│  │  ○ Selective - Choose specific messages                  │   │
│  │                                                          │   │
│  │  ☑ Archive branch after merge                            │   │
│  │                                                          │   │
│  │                      [Cancel]  [Merge]                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface MergeDialogProps {
  open: boolean
  onClose: () => void
  sourcePath: ConversationPath
  targetPath: ConversationPath
  onMerge: (mode: MergeMode, options: MergeOptions) => Promise<void>
}
```

### 4.5 Update Conversation Page

**Location**: `apps/demo-web/src/app/(app)/conversations/[id]/page.tsx`

**Changes needed**:
1. Add path selector at top of conversation
2. Wire up branch dialog trigger from message actions
3. Wire up merge dialog from path selector
4. Show path indicator in header
5. Handle path switching navigation
6. Update document title to include path name

**Example structure**:
```tsx
<div className="conversation-container">
  <ConversationHeader>
    <PathSelector
      conversationId={conversationId}
      paths={paths}
      activePathId={activePathId}
      onPathSelect={setActivePath}
      onMergePath={handleMerge}
      onDeletePath={handleDelete}
    />
  </ConversationHeader>

  <MessageList>
    {messages.map(message => (
      <Message
        key={message.id}
        message={message}
        onEdit={handleEdit}
        onBranch={handleBranch}
      />
    ))}
  </MessageList>

  <BranchDialog
    open={branchDialogOpen}
    messageId={branchMessageId}
    onClose={() => setBranchDialogOpen(false)}
    onBranch={handleBranchCreate}
  />

  <MergeDialog
    open={mergeDialogOpen}
    sourcePath={mergeSourcePath}
    targetPath={mergeTargetPath}
    onClose={() => setMergeDialogOpen(false)}
    onMerge={handleMergeSubmit}
  />
</div>
```

---

## Phase 5: SSE Events Integration

### 5.1 New Event Types

**Location**: `packages/reg-intel-conversations/src/types.ts`

**Add path event types**:
```typescript
export type ConversationPathEventType =
  | 'path:created'
  | 'path:updated'
  | 'path:deleted'
  | 'path:merged'
  | 'path:active'

export interface PathEventPayloads {
  'path:created': {
    path: ConversationPath
    branchPointMessage: ConversationMessage
  }
  'path:updated': {
    pathId: string
    changes: Partial<ConversationPath>
  }
  'path:deleted': {
    pathId: string
    reason: 'deleted' | 'archived'
  }
  'path:merged': {
    sourcePathId: string
    targetPathId: string
    summaryMessageId?: string
  }
  'path:active': {
    pathId: string
  }
}
```

### 5.2 Broadcast Path Events

**Location**: Update path API endpoints to broadcast events

**When to broadcast**:
- `path:created` - After successful branch creation
- `path:updated` - After path rename or metadata change
- `path:deleted` - After path deletion
- `path:merged` - After successful merge
- `path:active` - After active path change

**Implementation**:
```typescript
// In branch endpoint
const { pathId } = await conversationPathStore.branchFromMessage({...})
eventHub.broadcast(tenantId, conversationId, 'path:created', {
  path: await conversationPathStore.getPath({ tenantId, pathId }),
  branchPointMessage: message,
})
```

### 5.3 Subscribe to Path Events

**Location**: `apps/demo-web/src/hooks/useConversationPaths.ts`

**Update hook to listen for events**:
```typescript
useEffect(() => {
  const handlePathEvent = (event: ConversationPathEventType, data: unknown) => {
    switch (event) {
      case 'path:created':
        // Add new path to list
        break
      case 'path:updated':
        // Update path metadata
        break
      case 'path:deleted':
        // Remove path from list
        break
      case 'path:merged':
        // Mark path as merged, refresh messages
        break
      case 'path:active':
        // Update active path indicator
        break
    }
  }

  // Subscribe via SSE connection
  const unsubscribe = subscribeToConversation(conversationId, handlePathEvent)
  return () => unsubscribe()
}, [conversationId])
```

---

## Phase 6: AI Merge Summarization

### 6.1 Merge Summarizer Service

**Location**: Create `packages/reg-intel-core/src/orchestrator/mergeSummarizer.ts`

**Interface**:
```typescript
export interface MergeSummaryInput {
  branchMessages: ConversationMessage[]
  branchPointMessage: ConversationMessage
  mainConversationContext: ConversationMessage[]
  customPrompt?: string
}

export async function generateMergeSummary(
  input: MergeSummaryInput,
  llmClient: LlmClient
): Promise<string>
```

**System Prompt**:
```typescript
const MERGE_SUMMARY_SYSTEM_PROMPT = `
You are a conversation summarizer for a regulatory compliance copilot.

Your task is to create a concise summary of a branched conversation thread
to merge back into the main conversation.

Guidelines:
1. Capture KEY FINDINGS and CONCLUSIONS from the branch
2. Include specific regulatory references or citations discovered
3. Note any action items or recommendations
4. Keep the summary focused and actionable (2-3 paragraphs max)
5. Use the same tone and style as the main conversation
6. Do NOT use bullet points - format as coherent prose

Focus on what the user learned or discovered in the branch that should be
brought back to the main conversation.
`
```

### 6.2 Integrate with Merge Endpoint

**Location**: `apps/demo-web/app/api/conversations/[conversationId]/paths/[pathId]/merge/route.ts`

**Implementation**:
```typescript
if (mergeMode === 'summary') {
  const branchMessages = await pathStore.resolvePathMessages({
    tenantId,
    pathId: sourcePathId
  })

  const summary = await generateMergeSummary({
    branchMessages,
    branchPointMessage,
    mainConversationContext: recentMainMessages,
    customPrompt: summaryPrompt,
  }, llmClient)

  // Append summary as system message
  const { messageId } = await conversationStore.appendMessage({
    tenantId,
    conversationId,
    pathId: targetPathId,
    role: 'system',
    content: summary,
    metadata: {
      type: 'merge_summary',
      sourcePathId,
      sourcePathName: sourcePath.name,
      mergedMessageCount: branchMessages.length,
    },
  })

  return { success: true, summaryMessageId: messageId }
}
```

---

## Phase 7: Testing & Validation

### 7.1 Unit Tests

**Files to create**:
- `packages/reg-intel-conversations/src/__tests__/pathStores.test.ts`
- `packages/reg-intel-core/src/__tests__/mergeSummarizer.test.ts`

**Test cases**:
1. Path creation and lineage
2. Path message resolution with inheritance
3. Branch from message creates correct structure
4. Merge modes (summary, full, selective)
5. Soft-delete behavior with paths
6. RLS policy enforcement

### 7.2 Integration Tests

**Files to create**:
- `apps/demo-web/tests/api/paths.test.ts`
- `apps/demo-web/tests/api/branch.test.ts`
- `apps/demo-web/tests/api/merge.test.ts`

**Test scenarios**:
1. Create conversation → branch → merge cycle
2. Multiple branches from same message
3. Nested branching (branch from branch)
4. Path switching and message visibility
5. Concurrent path updates
6. SSE event broadcasting

### 7.3 E2E Tests

**Files to create**:
- `apps/demo-web/tests/e2e/conversation-branching.spec.ts`

**Test flows**:
1. User creates branch from message
2. User switches between paths
3. User merges branch with summary
4. User renames and deletes paths
5. Path selector displays correctly
6. Multi-user path viewing (if applicable)

---

## Phase 8: Documentation

### 8.1 User Documentation

**Location**: Create `docs/user-guides/conversation-paths.md`

**Contents**:
1. What are conversation paths?
2. How to branch a conversation
3. How to switch between paths
4. How to merge branches
5. When to use branching
6. Best practices for branch management

### 8.2 Developer Documentation

**Location**: Update `docs/architecture/conversation-branching-and-merging.md`

**Add sections**:
1. Implementation status
2. API usage examples
3. Frontend integration guide
4. Troubleshooting common issues

### 8.3 API Documentation

**Location**: Create `docs/api/conversation-paths.md`

**Contents**:
1. All path API endpoints
2. Request/response schemas
3. SSE event types
4. Error codes and handling
5. Rate limiting and permissions

---

## Implementation Timeline

### Sprint 1 (1 week): Backend Foundation
- [ ] Review and test existing pathStore methods
- [ ] Update appendMessage to support pathId
- [ ] Create path management API endpoints
- [ ] Create branch API endpoint
- [ ] Add unit tests

### Sprint 2 (1 week): API & State Management
- [ ] Create merge API endpoint
- [ ] Implement merge summarization
- [ ] Create useConversationPaths hook
- [ ] Update useConversation for path support
- [ ] Add SSE path events

### Sprint 3 (1 week): UI Components
- [ ] Update Message component with edit/branch icons
- [ ] Create PathSelector component
- [ ] Create BranchDialog component
- [ ] Create MergeDialog component
- [ ] Update conversation page layout

### Sprint 4 (1 week): Integration & Testing
- [ ] Wire up all components
- [ ] Add integration tests
- [ ] Add E2E tests
- [ ] Fix bugs and polish UX

### Sprint 5 (1 week): Documentation & Polish
- [ ] Write user documentation
- [ ] Write developer documentation
- [ ] Update API documentation
- [ ] Final testing and bug fixes
- [ ] Deployment preparation

---

## Success Criteria

### Functional Requirements
- ✅ Users can branch from any message in a conversation
- ✅ Users can switch between paths seamlessly
- ✅ Users can merge branches with AI-generated summaries
- ✅ Message history updates based on active path
- ✅ All messages are preserved (soft-delete)
- ✅ Multiple users can view same conversation paths

### Non-Functional Requirements
- ✅ Path switching is instant (< 100ms)
- ✅ Branching creates path in < 500ms
- ✅ Merge summarization completes in < 10s
- ✅ SSE events broadcast reliably
- ✅ RLS policies enforce correct access
- ✅ UI is responsive and intuitive

### Technical Requirements
- ✅ Backward compatible with existing conversations
- ✅ Database queries are optimized with proper indexes
- ✅ No N+1 query problems in path resolution
- ✅ TypeScript types are complete and correct
- ✅ Test coverage > 80% for new code
- ✅ Documentation is comprehensive and accurate

---

## Migration Strategy

### Existing Conversations
All existing conversations will automatically have a primary path created on first access:

1. Check if conversation has any paths
2. If not, create primary path
3. Assign all existing messages to primary path
4. Set sequence_in_path based on created_at

This migration happens transparently via the appendMessage method which already creates paths as needed.

### Feature Flags
Consider adding feature flags for gradual rollout:
- `ENABLE_CONVERSATION_BRANCHING` - Enable branch creation
- `ENABLE_PATH_MERGING` - Enable merge functionality
- `ENABLE_PATH_SELECTOR_UI` - Show path selector in UI

### Rollback Plan
If issues arise:
1. Disable feature flags
2. All conversations fall back to primary path only
3. Existing branches remain in database but hidden
4. Can re-enable after fixes

---

## Risks & Mitigations

### Risk: Complex Path Resolution Performance
**Impact**: High
**Mitigation**:
- Proper database indexes
- Cache resolved paths in React Query
- Paginate long conversations
- Add performance monitoring

### Risk: User Confusion with Multiple Paths
**Impact**: Medium
**Mitigation**:
- Clear UI indicators for current path
- Contextual help text in dialogs
- User documentation and onboarding
- Limit initial rollout to power users

### Risk: Merge Summary Quality
**Impact**: Medium
**Mitigation**:
- Iterative prompt engineering
- User feedback mechanism
- Allow editing of generated summaries
- Provide preview before merge

### Risk: SSE Event Reliability
**Impact**: Medium
**Mitigation**:
- Implement reconnection logic
- Poll for updates as fallback
- Client-side state reconciliation
- Add event replay capability

---

## Future Enhancements

### Path Comparison View
Side-by-side view of two paths showing divergence points

### Path Templates
Pre-configured branching patterns for common workflows

### Collaborative Paths
Real-time presence indicators and collaborative editing

### Path Analytics
Track which paths lead to best outcomes

### Path Export
Export specific paths as standalone conversations

---

## Conclusion

This implementation plan provides a roadmap to fully implement the conversation path system as defined in the architecture. The phased approach allows for incremental delivery and testing while maintaining backward compatibility with existing conversations.

**Next Steps**:
1. Review and approve this plan with stakeholders
2. Create JIRA tickets for each sprint
3. Assign developers to sprints
4. Begin Sprint 1 implementation

**Questions or Feedback**: Contact the engineering team or file an issue in the project repository.
