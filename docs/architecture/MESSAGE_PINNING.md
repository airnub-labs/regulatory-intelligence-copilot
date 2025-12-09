# Message Pinning & Compaction Control

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

// Get pinned message count
const count = await pathStore.getPinnedMessageCount({
  tenantId: 'tenant-123',
  conversationId: 'conv-456'
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
- **Implementation**:
  ```typescript
  // Pseudocode for sliding window with pinning
  const messages = await getAllMessagesForPath(pathId);
  const windowSize = config.pathSlidingWindowSize || 50;

  // Get the last N messages
  const recentMessages = messages.slice(-windowSize);

  // Get pinned messages outside the window
  const pinnedOutsideWindow = messages
    .slice(0, -windowSize)
    .filter(m => m.isPinned);

  // Combine: pinned + recent messages
  const retained = [...pinnedOutsideWindow, ...recentMessages];

  // Compact/summarize the rest
  const toCompact = messages
    .slice(0, -windowSize)
    .filter(m => !m.isPinned);
  ```

#### 3. Semantic Strategy
- **Behavior**: Groups semantically similar messages and summarizes clusters
- **Pinned messages**: **EXCLUDED FROM CLUSTERING** - retained verbatim
- **Implementation**:
  ```typescript
  const messages = await getAllMessagesForPath(pathId);
  const pinned = messages.filter(m => m.isPinned);
  const unpinned = messages.filter(m => !m.isPinned);

  // Apply semantic clustering only to unpinned
  const clusters = await semanticCluster(unpinned, threshold);
  const summarized = await summarizeClusters(clusters);

  // Combine: pinned (original) + summarized (unpinned)
  const result = [...pinned, ...summarized];
  ```

#### 4. Hybrid Strategy
- **Behavior**: Combines sliding window + semantic clustering
- **Pinned messages**: **ALWAYS RETAINED** + excluded from semantic clustering
- **Implementation**:
  ```typescript
  const messages = await getAllMessagesForPath(pathId);
  const pinned = messages.filter(m => m.isPinned);

  // Apply sliding window to unpinned
  const unpinned = messages.filter(m => !m.isPinned);
  const windowSize = config.pathSlidingWindowSize || 50;
  const recent = unpinned.slice(-windowSize);
  const old = unpinned.slice(0, -windowSize);

  // Apply semantic clustering to old unpinned
  const oldClusters = await semanticCluster(old, threshold);
  const summarizedOld = await summarizeClusters(oldClusters);

  // Combine: pinned + summarized old + recent
  const result = [...pinned, ...summarizedOld, ...recent];
  ```

### Branch Merge Compaction

When merging a branch back to its parent path, the system respects the `mergeCompressionStrategy` configuration.

#### Configuration
```typescript
const config = {
  mergeCompressionStrategy: 'moderate',  // none | minimal | moderate | aggressive
  mergeMaxMessages: 100,                 // Max messages to retain after merge
  mergePreservePinned: true              // Always respect pinned messages
};
```

#### Merge Strategies with Pinned Messages

##### 1. None
- **Behavior**: All messages transferred verbatim
- **Pinned messages**: No special handling needed

##### 2. Minimal
- **Behavior**: Remove duplicate messages, keep rest
- **Pinned messages**: **NEVER REMOVED** during deduplication
- **Implementation**:
  ```typescript
  const branchMessages = await getMessagesForPath(sourcePath);
  const pinned = branchMessages.filter(m => m.isPinned);
  const unpinned = branchMessages.filter(m => !m.isPinned);

  // Deduplicate only unpinned
  const deduplicated = removeDuplicates(unpinned);

  // Combine
  const toMerge = [...pinned, ...deduplicated];
  ```

##### 3. Moderate (Default)
- **Behavior**: Summarize redundant exchanges, keep key decisions
- **Pinned messages**: **MINIMAL SUMMARIZATION** - preserved with full context
- **Implementation**:
  ```typescript
  const branchMessages = await getMessagesForPath(sourcePath);
  const pinned = branchMessages.filter(m => m.isPinned);
  const unpinned = branchMessages.filter(m => !m.isPinned);

  // Moderate summarization of unpinned
  const summarized = await moderateSummarize(unpinned);

  // For pinned: keep message + immediate context (1 before, 1 after)
  const pinnedWithContext = pinned.map(p => ({
    ...p,
    contextBefore: findPreviousMessage(branchMessages, p),
    contextAfter: findNextMessage(branchMessages, p)
  }));

  // Combine
  const toMerge = [...pinnedWithContext, ...summarized];
  ```

##### 4. Aggressive
- **Behavior**: Keep only outcomes and final decisions
- **Pinned messages**: **PRESERVED** but surrounding context may be heavily summarized
- **Implementation**:
  ```typescript
  const branchMessages = await getMessagesForPath(sourcePath);
  const pinned = branchMessages.filter(m => m.isPinned);
  const unpinned = branchMessages.filter(m => !m.isPinned);

  // Aggressive summarization: keep only outcomes
  const outcomes = await extractOutcomes(unpinned);

  // Pinned messages always included in full
  const toMerge = [...pinned, ...outcomes];
  ```

#### Respecting mergePreservePinned

When `mergePreservePinned: true` (default):
- Pinned messages are ALWAYS transferred in full
- Surrounding context of pinned messages gets special treatment
- If a pinned message references other messages, those are preserved

When `mergePreservePinned: false` (rare):
- Pinned status is advisory only
- Pinned messages may still be summarized based on strategy
- Useful for very aggressive space optimization

## Use Cases

### 1. Regulatory Compliance Analysis
```typescript
// User pins key compliance findings
await pathStore.pinMessage({
  messageId: 'finding-prsi-2024',
  // ... will be preserved through all compaction
});
```

### 2. Code Review Branch
```typescript
// Pin critical review comments before merging
await pathStore.pinMessage({
  messageId: 'security-concern-123',
  // ... preserved when merging back to main discussion
});
```

### 3. Long Research Sessions
```typescript
// Sliding window keeps last 50 messages
// But pinned research findings from message 1 are retained
const config = {
  pathCompressionStrategy: 'sliding_window',
  pathSlidingWindowSize: 50,
  // Pinned messages outside window are kept
};
```

## Best Practices

### When to Pin
✅ **Pin these:**
- Final decisions or outcomes
- Critical compliance findings
- Security concerns
- Key data points or metrics
- Important references or citations
- Instructions that need to be followed

❌ **Don't pin these:**
- Casual conversation
- Exploratory questions (unless outcome is important)
- Temporary working notes
- Duplicate information

### Performance Considerations

- **Pinned message limit**: Consider implementing a soft limit (e.g., 20% of total messages)
- **Index usage**: Pinned messages are indexed for efficient filtering
- **Compaction performance**: More pinned messages = less compression = larger storage

### Configuration Recommendations

#### High-Compliance Environments
```typescript
{
  mergeCompressionStrategy: 'minimal',
  mergePreservePinned: true,
  pathCompressionStrategy: 'sliding_window',
  pathSlidingWindowSize: 100,
}
```

#### Research & Development
```typescript
{
  mergeCompressionStrategy: 'moderate',
  mergePreservePinned: true,
  pathCompressionStrategy: 'hybrid',
  pathSlidingWindowSize: 75,
  pathCompressionThreshold: 0.85,
}
```

#### Space-Optimized
```typescript
{
  mergeCompressionStrategy: 'aggressive',
  mergePreservePinned: true, // Still respect pins
  pathCompressionStrategy: 'semantic',
  pathMaxMessages: 150,
  pathCompressionThreshold: 0.80,
}
```

## Implementation Status

- ✅ Database schema (pinned fields + indexes)
- ✅ TypeScript types (PathAwareMessage with pinning)
- ✅ Store operations (pin/unpin/getPinned)
- ✅ Configuration system (mergePreservePinned setting)
- 🔄 Compaction logic (to be implemented in Phase 3)
- 🔄 UI components (pin/unpin buttons)
- 🔄 SSE events (message:pinned, message:unpinned)

## Future Enhancements

### Collaborative Pinning
- Track who pinned which messages
- Show pin history and audit trail
- Allow team-wide vs personal pins

### Smart Pinning
- AI-suggested pins based on importance
- Auto-pin based on keywords or patterns
- Bulk pin operations

### Pin Categories
- Pin with labels: "decision", "concern", "reference", "todo"
- Color-coded pins in UI
- Filter pinned by category
