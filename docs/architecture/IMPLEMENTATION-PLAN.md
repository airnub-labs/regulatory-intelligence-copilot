# Conversation Branching & Merging - Implementation Plan

> **Last Updated**: 2024-12-07
> **Status**: In Progress
> **Branch**: `claude/fix-message-edit-path-01Nf1gUtB14N42q8f1QWMSH9`

## Overview

This document tracks the implementation progress of the conversation branching and merging architecture. It is designed to allow work to be resumed at any point.

## Design Principles

1. **No Backward Compatibility**: Old patterns are deprecated and removed, not maintained alongside new code
2. **Reusable Components**: All UI components are built as a standalone package consumable by any Next.js application
3. **Type-First**: All interfaces defined before implementation
4. **Incremental Commits**: Each phase committed independently for easy rollback

---

## Phase Summary

| Phase | Description | Status | Started | Completed |
|-------|-------------|--------|---------|-----------|
| 1 | Database Schema | ✅ Complete | 2024-12-07 | 2024-12-07 |
| 2 | Backend Stores | ✅ Complete | 2024-12-07 | 2024-12-07 |
| 3 | API Routes | ✅ Complete | 2024-12-07 | 2024-12-07 |
| 4 | Reusable UI Components | ✅ Complete | 2024-12-07 | 2024-12-07 |
| 5 | Demo App Integration | ⏳ Pending | - | - |
| 6 | AI Merge Summarization | ⏳ Pending | - | - |

---

## Phase 1: Database Schema

### Objective
Create the `conversation_paths` table and update `conversation_messages` with path support. Remove deprecated `supersededBy` pattern in favor of explicit paths.

### Tasks

- [x] Create migration `20241207000001_add_conversation_paths.sql`
  - [x] Create `conversation_paths` table
  - [x] Add `path_id`, `sequence_in_path` columns to messages
  - [x] Add `is_branch_point`, `branched_to_paths` columns
  - [x] Create indexes for efficient path queries
  - [x] Add RLS policies for paths
  - [x] Create `conversation_paths_view`

- [x] Create migration `20241207000002_migrate_existing_conversations.sql`
  - [x] Create primary path for each existing conversation
  - [x] Assign all existing messages to primary paths
  - [x] Calculate sequence numbers based on created_at
  - [x] Mark messages with supersededBy as deprecated (log warning)

- [x] Create migration `20241207000003_enforce_path_constraints.sql`
  - [x] Make `path_id` NOT NULL
  - [x] Add foreign key constraints
  - [x] Remove deprecated `supersededBy` from active use (keep in metadata for audit)

### Files to Create/Modify
```
supabase/migrations/
├── 20241207000001_add_conversation_paths.sql      [NEW]
├── 20241207000002_migrate_existing_conversations.sql [NEW]
└── 20241207000003_enforce_path_constraints.sql    [NEW]
```

### Verification
- [ ] Run migrations locally
- [ ] Verify existing conversations have primary paths
- [ ] Verify all messages have path_id assigned
- [ ] Test RLS policies work correctly

---

## Phase 2: Backend Stores

### Objective
Implement `ConversationPathStore` interface and update existing stores to use paths.

### Tasks

- [x] Define TypeScript interfaces in `packages/reg-intel-conversations/src/types/`
  - [x] `ConversationPath` interface
  - [x] `BranchPoint` interface
  - [x] `MergeRequest` / `MergeResult` interfaces
  - [x] `PathResolution` interface

- [x] Implement `ConversationPathStore` interface
  - [x] `createPath()` - Create new path (primary or branch)
  - [x] `getPath()` - Get single path
  - [x] `listPaths()` - List all paths for conversation
  - [x] `updatePath()` - Update path metadata
  - [x] `deletePath()` - Delete/archive path
  - [x] `resolvePathMessages()` - Get messages for path with inheritance
  - [x] `branchFromMessage()` - Create branch from message
  - [x] `mergePath()` - Merge path into another
  - [x] `getActivePath()` - Get currently active path
  - [x] `setActivePath()` - Set active path
  - [x] `getBranchPointsForPath()` - Get available branch points

- [x] Implement `InMemoryConversationPathStore`
  - [x] All interface methods
  - [x] Path resolution logic
  - [x] Branch/merge logic

- [x] Implement `SupabaseConversationPathStore`
  - [x] All interface methods
  - [x] Efficient SQL queries for path resolution
  - [x] Transaction support for branching/merging

- [ ] Update `ConversationStore` interface
  - [ ] Deprecate `softDeleteMessage()` in favor of path-based versioning
  - [ ] Add path awareness to `appendMessage()`
  - [ ] Update `getMessages()` to be path-aware

### Files to Create/Modify
```
packages/reg-intel-conversations/src/
├── types/
│   ├── index.ts                    [MODIFY - export new types]
│   └── paths.ts                    [NEW]
├── pathStores.ts                   [NEW]
├── conversationStores.ts           [MODIFY - add path support]
└── index.ts                        [MODIFY - export path stores]
```

### Verification
- [ ] Unit tests for InMemoryConversationPathStore
- [ ] Unit tests for SupabaseConversationPathStore
- [ ] Integration tests for branching scenarios
- [ ] Integration tests for merging scenarios

---

## Phase 3: API Routes

### Objective
Create REST API endpoints and SSE events for path management.

### Tasks

- [x] Path Management Endpoints
  - [x] `GET /api/conversations/:id/paths` - List paths
  - [x] `POST /api/conversations/:id/paths` - Create path
  - [x] `GET /api/conversations/:id/paths/:pathId` - Get path
  - [x] `PATCH /api/conversations/:id/paths/:pathId` - Update path
  - [x] `DELETE /api/conversations/:id/paths/:pathId` - Delete path

- [x] Path Messages Endpoint
  - [x] `GET /api/conversations/:id/paths/:pathId/messages` - Get resolved messages

- [x] Branching Endpoint
  - [x] `POST /api/conversations/:id/branch` - Create branch from message

- [x] Merging Endpoints
  - [x] `POST /api/conversations/:id/paths/:pathId/merge` - Merge to target
  - [x] `POST /api/conversations/:id/paths/:pathId/merge/preview` - Preview merge

- [x] Active Path Endpoints
  - [x] `GET /api/conversations/:id/active-path` - Get active path
  - [x] `PUT /api/conversations/:id/active-path` - Set active path

- [x] SSE Event Types
  - [x] `path:created` - New branch created
  - [x] `path:updated` - Path metadata changed
  - [x] `path:deleted` - Path deleted/archived
  - [x] `path:merged` - Path merged to another
  - [x] `path:active` - Active path changed

- [ ] Update existing chat endpoint
  - [ ] Accept `pathId` parameter
  - [ ] Create messages in specified path
  - [ ] Auto-increment sequence_in_path

### Files to Create/Modify
```
apps/demo-web/src/app/api/conversations/[id]/
├── paths/
│   ├── route.ts                    [NEW]
│   └── [pathId]/
│       ├── route.ts                [NEW]
│       ├── messages/route.ts       [NEW]
│       └── merge/
│           ├── route.ts            [NEW]
│           └── preview/route.ts    [NEW]
├── branch/route.ts                 [NEW]
├── active-path/route.ts            [NEW]
└── stream/route.ts                 [MODIFY - add path events]

packages/reg-intel-conversations/src/
└── sseTypes.ts                     [MODIFY - add path event types]

packages/reg-intel-next-adapter/src/
└── index.ts                        [MODIFY - path-aware chat handler]
```

### Verification
- [ ] API endpoint tests for all routes
- [ ] SSE event delivery tests
- [ ] Authorization tests (tenant isolation, ownership)

---

## Phase 4: Reusable UI Components

### Objective
Create a standalone UI component library for conversation paths that can be consumed by any Next.js application.

### Package Structure
```
packages/reg-intel-ui/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main exports
│   ├── components/
│   │   ├── conversation/
│   │   │   ├── index.ts
│   │   │   ├── ConversationPathProvider.tsx
│   │   │   ├── PathSelector.tsx
│   │   │   ├── PathIndicator.tsx
│   │   │   ├── BranchButton.tsx
│   │   │   ├── BranchDialog.tsx
│   │   │   ├── MergeDialog.tsx
│   │   │   ├── MergePreview.tsx
│   │   │   ├── VersionNavigator.tsx
│   │   │   └── PathAwareMessageList.tsx
│   │   └── primitives/
│   │       ├── index.ts
│   │       ├── Dialog.tsx
│   │       ├── DropdownMenu.tsx
│   │       └── Button.tsx
│   ├── hooks/
│   │   ├── index.ts
│   │   ├── useConversationPaths.ts
│   │   ├── usePathResolution.ts
│   │   ├── useBranching.ts
│   │   └── useMerging.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── index.ts
│       └── pathResolution.ts
└── README.md
```

### Tasks

- [x] Initialize `packages/reg-intel-ui` package
  - [x] package.json with peer dependencies
  - [x] tsconfig.json extending base config
  - [x] Build configuration (tsup or similar)

- [x] Create Context Provider
  - [x] `ConversationPathProvider` - Provides path state to tree
  - [x] Path loading and caching
  - [x] Real-time updates via SSE

- [x] Create Hooks
  - [x] `useConversationPaths()` - Main hook for path state and actions
  - [x] `usePathResolution()` - Integrated into useConversationPaths
  - [x] `useBranching()` - Integrated into useConversationPaths
  - [x] `useMerging()` - Integrated into useConversationPaths

- [x] Create Components
  - [x] `PathSelector` - Dropdown to select active path
  - [x] `BranchButton` - Button to trigger branch creation
  - [x] `BranchDialog` - Modal for branch configuration
  - [x] `MergeDialog` - Modal for merge configuration with preview
  - [x] `VersionNavigator` - Left/right arrows for version navigation

- [x] Component Styling
  - [x] Use CSS variables for theming
  - [x] Support both light and dark modes
  - [x] Minimal bundle size
  - [x] Tailwind-compatible class names

- [x] Documentation
  - [x] README with installation instructions
  - [x] Props documentation for each component
  - [ ] Usage examples

### Files to Create
```
packages/reg-intel-ui/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts
│   ├── components/conversation/*.tsx
│   ├── hooks/*.ts
│   ├── types/index.ts
│   └── utils/pathResolution.ts
└── README.md
```

### Verification
- [ ] Components render correctly in isolation
- [ ] Hooks work with mocked API
- [ ] Storybook stories (optional)
- [ ] TypeScript types exported correctly

---

## Phase 5: Demo App Integration

### Objective
Integrate the reusable UI components into the demo-web application.

### Tasks

- [ ] Install `@reg-copilot/reg-intel-ui` package
- [ ] Wrap app with `ConversationPathProvider`
- [ ] Replace existing message list with `PathAwareMessageList`
- [ ] Add `PathSelector` to conversation header
- [ ] Add `BranchButton` to message actions
- [ ] Integrate `BranchDialog` and `MergeDialog`
- [ ] Update `VersionNavigator` to be path-aware
- [ ] Remove deprecated version navigation code
- [ ] Update SSE subscription for path events

### Files to Modify
```
apps/demo-web/src/
├── app/page.tsx                    [MAJOR REFACTOR]
├── components/chat/
│   ├── message.tsx                 [MODIFY - add branch button]
│   ├── message-version-nav.tsx     [DEPRECATE - use reg-intel-ui]
│   └── chat-container.tsx          [MODIFY - use PathAwareMessageList]
└── package.json                    [ADD reg-intel-ui dependency]
```

### Verification
- [ ] Path switching works correctly
- [ ] Version navigation updates entire conversation
- [ ] Branch creation creates new path
- [ ] Merge summary appears in target path
- [ ] Real-time updates work across tabs

---

## Phase 6: AI Merge Summarization

### Objective
Implement AI-powered summarization for merge operations.

### Tasks

- [ ] Define summarization prompts
  - [ ] System prompt for merge summarization
  - [ ] Template for branch context
  - [ ] Template for main conversation context

- [ ] Implement `MergeSummarizer` service
  - [ ] `generateSummary()` method
  - [ ] Support for custom prompts
  - [ ] Streaming summary generation

- [ ] Integrate with merge endpoint
  - [ ] Call summarizer when mode is 'summary'
  - [ ] Create system message with summary
  - [ ] Include metadata about source branch

- [ ] Add to UI
  - [ ] Summary preview in MergeDialog
  - [ ] Custom prompt input
  - [ ] Loading state during summarization

### Files to Create/Modify
```
packages/reg-intel-core/src/
├── orchestrator/
│   └── mergeSummarizer.ts          [NEW]
└── index.ts                        [MODIFY - export summarizer]

apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/
└── merge/route.ts                  [MODIFY - integrate summarizer]
```

### Verification
- [ ] Summary generated correctly
- [ ] Custom prompts respected
- [ ] Metadata included in summary message
- [ ] Edge cases handled (empty branch, long branch)

---

## Deprecation Log

| Item | Deprecated In | Removed In | Replacement |
|------|---------------|------------|-------------|
| `supersededBy` field | Phase 1 | Phase 1 | Path-based versioning |
| `softDeleteMessage()` | Phase 2 | Phase 2 | Path versioning via new messages |
| `message-version-nav.tsx` | Phase 5 | Phase 5 | `@reg-copilot/reg-intel-ui` |
| `buildVersionedMessages()` | Phase 5 | Phase 5 | `usePathResolution()` hook |
| `activeVersionIndex` state | Phase 5 | Phase 5 | Path-based state in provider |

---

## Resume Instructions

To resume implementation:

1. Check the phase summary table for current status
2. Find the first incomplete task in the active phase
3. Review the files to create/modify section
4. Check the verification section for testing requirements
5. Commit with message referencing this plan

---

## Notes

- All migrations are idempotent where possible
- TypeScript strict mode enabled throughout
- ESLint/Prettier formatting applied before commits
- Each phase has its own verification before proceeding
