# Conversation Compaction & Merge Compression

> **Version**: 1.0
> **Status**: ✅ Implemented (Production Ready)
> **Last Updated**: 2026-01-03
> **Canonical Document**: This is the authoritative reference for conversation compaction and merge compression.

---

## 1. Status & Scope

### Implementation Status

| Capability | Status | Code Location |
|------------|--------|---------------|
| **Token Counting (tiktoken)** | ✅ Implemented | `packages/reg-intel-core/src/tokens/` |
| **Path Compaction Strategies** | ✅ Implemented | `packages/reg-intel-conversations/src/compaction/strategies/` |
| **Merge Compaction Strategies** | ✅ Implemented | `packages/reg-intel-conversations/src/compaction/strategies/` |
| **PathCompactionService** | ✅ Implemented | `packages/reg-intel-conversations/src/compaction/pathCompactionService.ts` |
| **Snapshot/Rollback System** | ✅ Implemented | `packages/reg-intel-conversations/src/compaction/snapshotService.ts` |
| **Compaction API Endpoints** | ✅ Implemented | `apps/demo-web/src/app/api/conversations/[conversationId]/compact/` |
| **UI Components** | ✅ Implemented | `apps/demo-web/src/components/compaction/` |
| **Auto-Compaction Job** | ✅ Implemented | `apps/demo-web/src/lib/jobs/autoCompactionJob.ts` |
| **OpenTelemetry Metrics** | ✅ Implemented | `packages/reg-intel-observability/src/compactionMetrics.ts` |
| **Database Persistence** | ✅ Implemented | `copilot_internal.compaction_operations` table |
| **Message Pinning** | ✅ Implemented | `is_pinned` field on `conversation_messages` |
| **Pinned Preservation in Compaction** | ✅ Implemented | All compactors respect `pinnedMessageIds` |

### What This Document Covers

- **Token counting infrastructure** - How conversation size is measured
- **Compaction strategies** - Algorithms for reducing context size
- **Path compaction** - Compressing active conversation paths
- **Merge compaction** - Compressing messages during branch merge
- **Pinned message preservation** - How compaction respects important messages
- **Configuration system** - Per-tenant/user strategy selection

---

## 2. Problem Statement

### Context Bloat in Conversational AI Systems

When users engage in long conversations or merge large branches, conversation context can grow unbounded, leading to:

- **Token limit exceeded errors** - LLM calls fail when context exceeds model limits (e.g., 128k tokens)
- **Degraded response quality** - Irrelevant historical context dilutes the signal
- **Increased API costs** - Larger contexts consume more tokens per request
- **Poor user experience** - Slow responses, failed merges, confusing errors

### The Solution

A **Unified Compaction System** with:

1. **Token Counting Infrastructure** - Accurate measurement using tiktoken
2. **8 Compaction Strategies** - Pluggable algorithms for different use cases
3. **Path Compaction** - Automatic compression of active conversation paths
4. **Merge Compaction** - Intelligent compression during branch merges
5. **Pinned Message Preservation** - Always preserve user-marked important content
6. **Configuration System** - Hierarchical (global/tenant/user) strategy selection

---

## 3. Definitions

| Term | Definition |
|------|------------|
| **Path Context** | All messages belonging to a conversation path (including inherited from parent) |
| **Conversation Context** | The full message history sent to an LLM for response generation |
| **Compaction** | The process of reducing message count/tokens while preserving meaning |
| **Merge Result** | The outcome of merging a branch back to its parent path |
| **Merge Summary** | An AI-generated summary of a branch's content (for `summary` merge mode) |
| **Pinned Message** | A message marked by the user as important (never removed during compaction) |
| **is_pinned** | Boolean database field marking a message as pinned |
| **Token** | Atomic unit for LLM context measurement (not characters) |

---

## 4. Current Implemented Behavior

### 4.1 Token Counting

**Location**: `packages/reg-intel-core/src/tokens/`

Token counting uses OpenAI's tiktoken library for accurate measurement:

```typescript
import { createTokenCounter, countTokensForMessages } from '@reg-copilot/reg-intel-core';

// Create a counter for specific model
const counter = createTokenCounter({ model: 'gpt-4' });

// Count tokens in text
const estimate = await counter.estimateTokens('Hello, world!');
// { tokens: 4, method: 'tiktoken', isExact: true }

// Count tokens for conversation messages
const tokens = await countTokensForMessages(messages, 'gpt-4');
```

**Features**:
- LRU cache for repeated content (60-80% hit rate)
- Character-based fallback for unsupported models
- Message role overhead calculation
- Conversation formatting overhead

### 4.2 Path Compaction Strategies

**Location**: `packages/reg-intel-conversations/src/compaction/strategies/`

Four path compaction strategies are implemented:

| Strategy | Class | Description |
|----------|-------|-------------|
| `none` | `NoneCompactor` | No compression (passthrough) |
| `sliding_window` | `SlidingWindowCompactor` | Keep last N messages + pinned |
| `semantic` | `SemanticCompactor` | LLM-based importance scoring |
| `hybrid` | `HybridCompactor` | Sliding window + semantic for old messages |

**Usage**:
```typescript
import { getPathCompactor } from '@reg-copilot/reg-intel-conversations/compaction';

const compactor = getPathCompactor('sliding_window', {
  windowSize: 50,
  summarizeOld: true,
});

const result = await compactor.compact({
  messages,
  pinnedMessageIds: new Set(pinnedIds),
  currentTokens,
  model: 'gpt-4',
});
```

### 4.3 Merge Compaction Strategies

**Location**: `packages/reg-intel-conversations/src/compaction/strategies/`

Three merge compaction strategies are implemented:

| Strategy | Class | Description |
|----------|-------|-------------|
| `minimal` | (via `ModerateMergeCompactor`) | Deduplication only |
| `moderate` | `ModerateMergeCompactor` | Summarize redundant exchanges |
| `aggressive` | `AggressiveMergeCompactor` | Extract outcomes only |

**Note**: The `none` strategy for merge is implicit (no compaction applied).

### 4.4 Merge Operation Flow

**Location**: `apps/demo-web/src/app/api/conversations/[conversationId]/paths/[pathId]/merge/route.ts`

Three merge modes are supported:

| Mode | Description | Compaction |
|------|-------------|------------|
| **Summary** | AI generates a concise summary | Single message appended to parent |
| **Full** | All branch messages copied | Compaction can be applied |
| **Selective** | User picks specific messages | No compaction (user curated) |

**Merge Result Storage**:
- Summary mode: Creates a message with `message_type: 'merge_summary'` on parent path
- Full mode: Messages copied with sequence numbers adjusted
- Source path marked with `merged_to_path_id` and `merged_at`

### 4.5 Pinned Message Behavior

**Database Fields** (on `conversation_messages`):
```sql
is_pinned      boolean NOT NULL DEFAULT false
pinned_at      timestamptz
pinned_by      uuid
```

**API Operations**:
```typescript
// Pin a message
await pathStore.pinMessage({ tenantId, conversationId, messageId, userId });

// Unpin a message
await pathStore.unpinMessage({ tenantId, conversationId, messageId });

// Get pinned messages
const pinned = await pathStore.getPinnedMessages({ tenantId, conversationId, pathId });
```

**Compaction Behavior**:
- All compaction strategies receive `pinnedMessageIds: Set<string>`
- Pinned messages are **never removed** during compaction
- Pinned messages are **never summarized** (preserved verbatim)
- Each compactor validates pinned preservation before returning result

### 4.6 PathCompactionService

**Location**: `packages/reg-intel-conversations/src/compaction/pathCompactionService.ts`

The service orchestrates compaction operations:

```typescript
const service = new PathCompactionService({
  tokenThreshold: 100_000,    // Trigger at 100k tokens
  targetTokens: 80_000,       // Compact to 80k tokens
  strategy: 'sliding_window',
  model: 'gpt-4',
  autoCompact: false,
  createSnapshots: true,      // Enable rollback support
});

// Check if compaction needed
const needed = await service.needsCompaction(messages, pinnedMessageIds);

// Compact a path
const result = await service.compactPath(messages, pinnedMessageIds, conversationId, pathId);
```

### 4.7 Snapshot/Rollback System

**Location**: `packages/reg-intel-conversations/src/compaction/snapshotService.ts`

Before each compaction, a snapshot is created for rollback:

```typescript
// Initialize snapshot service
initSnapshotService({ ttlHours: 24 });

// Snapshots created automatically during compaction
const result = await service.compactPath(messages, pinnedIds, convId, pathId);
console.log(result.snapshotId); // Snapshot ID for rollback

// Rollback to snapshot
const snapshotService = getSnapshotService();
await snapshotService.restore(snapshotId);
```

---

## 5. Compaction Strategy Interface

### 5.1 Core Interface

**Location**: `packages/reg-intel-conversations/src/compaction/types.ts`

```typescript
interface MessageCompactor {
  /**
   * Compact a set of messages
   */
  compact(context: CompactionContext): Promise<CompactionResult>;

  /**
   * Get the strategy name
   */
  getStrategy(): string;

  /**
   * Estimate tokens that would be saved by compaction
   */
  estimateSavings(context: CompactionContext): Promise<number>;
}
```

### 5.2 CompactionContext

```typescript
interface CompactionContext {
  /** Messages to compact */
  messages: ConversationMessage[];

  /** IDs of pinned messages (must never be removed) */
  pinnedMessageIds: Set<string>;

  /** Current total tokens in the conversation */
  currentTokens: number;

  /** Target token count after compaction */
  targetTokens?: number;

  /** Model being used (for token counting) */
  model?: string;

  /** LLM client (for semantic/LLM-based strategies) */
  llmClient?: LlmRouter;

  /** Additional configuration options */
  options?: SlidingWindowConfig | SemanticConfig | HybridConfig;
}
```

### 5.3 CompactionResult

```typescript
interface CompactionResult {
  /** Messages after compaction */
  messages: ConversationMessage[];

  /** Token count before compaction */
  tokensBefore: number;

  /** Token count after compaction */
  tokensAfter: number;

  /** Number of messages removed */
  messagesRemoved: number;

  /** Number of messages summarized */
  messagesSummarized: number;

  /** Number of pinned messages preserved */
  pinnedPreserved: number;

  /** Strategy used for compaction */
  strategy: string;

  /** Whether compaction succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Metadata about the operation */
  metadata?: {
    durationMs?: number;
    usedLlm?: boolean;
    costUsd?: number;
  };
}
```

---

## 6. Strategies Catalogue

### 6.1 Path Compaction Strategies

#### None (`none`)

**Purpose**: No compression, preserve all messages.

**Implementation**: `NoneCompactor.ts`

**Algorithm**: Returns all messages unchanged.

**When to use**:
- Short conversations
- Compliance scenarios requiring full audit trail
- Testing/debugging

**Characteristics**:
- Zero token reduction
- Zero message loss
- O(1) time complexity

---

#### Sliding Window (`sliding_window`)

**Purpose**: Keep recent N messages + all pinned messages.

**Implementation**: `SlidingWindowCompactor.ts`

**Algorithm**:
1. Partition messages into pinned and unpinned
2. Take last N unpinned messages (the "window")
3. Optionally summarize old unpinned messages
4. Combine: pinned + (optional summary) + recent unpinned
5. Validate pinned preservation

**Configuration**:
```typescript
interface SlidingWindowConfig {
  windowSize: number;           // Default: 50
  summarizeOld: boolean;        // Default: true
  keepSystemMessages: boolean;  // Default: true
}
```

**When to use**:
- Standard conversations
- When recent context is most important
- Predictable, consistent behavior needed

**Characteristics**:
- Moderate token reduction (30-50%)
- Preserves recent context
- O(n) time complexity

---

#### Semantic (`semantic`)

**Purpose**: Use LLM to score message importance, keep highest-scoring.

**Implementation**: `SemanticCompactor.ts`

**Algorithm**:
1. Partition messages into pinned and unpinned
2. Score each unpinned message for importance (0.0-1.0) using LLM
3. Batch processing (10 messages per LLM call)
4. Keep messages with score >= threshold
5. Apply token budget if specified
6. Validate pinned preservation

**Configuration**:
```typescript
interface SemanticConfig {
  importanceThreshold: number;  // Default: 0.5
  minMessages: number;          // Default: 10
  useLlm: boolean;              // Default: true
  model?: string;
}
```

**When to use**:
- Long conversations with varying importance
- When quality matters more than recency
- Research or analysis scenarios

**Characteristics**:
- High token reduction (40-70%)
- Preserves most important content
- Higher compute cost (LLM calls)
- Heuristic fallback when LLM unavailable

---

#### Hybrid (`hybrid`)

**Purpose**: Combine sliding window + semantic scoring.

**Implementation**: `HybridCompactor.ts`

**Algorithm**:
1. Partition messages into pinned and unpinned
2. Split unpinned into: recent (last N) and old (rest)
3. Keep ALL recent messages (sliding window)
4. Apply semantic scoring to old messages only
5. Keep high-scoring old messages
6. Combine: pinned + high-scoring old + recent
7. Validate pinned preservation

**Configuration**:
```typescript
interface HybridConfig {
  windowSize: number;           // Default: 50
  importanceThreshold: number;  // Default: 0.5
  minMessages: number;          // Default: 10
}
```

**When to use**:
- Long conversations requiring balance
- When both recency and importance matter
- Production default for most scenarios

**Characteristics**:
- Moderate-high token reduction (35-60%)
- Best of both worlds (recency + importance)
- Moderate compute cost

---

### 6.2 Merge Compaction Strategies

#### Minimal (Deduplication)

**Purpose**: Remove duplicate messages, keep everything else.

**Implementation**: Part of `ModerateMergeCompactor.ts` with minimal settings

**Algorithm**:
1. Partition messages into pinned and unpinned
2. Deduplicate unpinned by content hash
3. Pinned messages NEVER removed (even if duplicate)
4. Combine: pinned + deduplicated unpinned

**When to use**:
- Branches with repeated questions/answers
- Minimal compression needed
- Fast processing required

**Characteristics**:
- Low token reduction (5-15%)
- Removes only duplicates
- O(n) time complexity

---

#### Moderate (`moderate`)

**Purpose**: Summarize redundant exchanges, keep key decisions.

**Implementation**: `ModerateMergeCompactor.ts`

**Algorithm**:
1. Partition messages into pinned and unpinned
2. Deduplicate unpinned messages
3. Use LLM to identify redundant exchanges
4. Summarize redundant content into single message
5. Merge consecutive same-role messages
6. Validate pinned preservation

**When to use**:
- Medium-large branches (10-50 messages)
- Standard production use case
- Balance compression and preservation

**Characteristics**:
- Moderate token reduction (30-50%)
- Preserves key content
- Moderate compute cost
- **Recommended default**

---

#### Aggressive (`aggressive`)

**Purpose**: Extract only outcomes and final decisions.

**Implementation**: `AggressiveMergeCompactor.ts`

**Algorithm**:
1. Partition messages into pinned and unpinned
2. Use LLM to extract outcomes/conclusions from unpinned
3. Create summary message with extracted outcomes
4. Combine: pinned + outcomes summary
5. Validate pinned preservation

**When to use**:
- Large branches (50+ messages)
- Quick summaries needed
- Maximum compression required

**Characteristics**:
- High token reduction (60-90%)
- Preserves only outcomes
- High compute cost
- Potential information loss (non-outcome details)

---

## 7. Pinned Message Preservation

### 7.1 How Pinning Works

**UI Actions**:
- Pin icon on message hover
- Pin/unpin via message context menu

**Database Storage**:
```sql
-- Fields on conversation_messages
is_pinned boolean NOT NULL DEFAULT false,
pinned_at timestamptz,
pinned_by uuid
```

**REST API**:
```
POST /api/conversations/:id/messages/:messageId/pin   -- Pin message
DELETE /api/conversations/:id/messages/:messageId/pin -- Unpin message
```

### 7.2 Compaction Guarantees

**INVARIANT**: Pinned messages are NEVER removed or summarized during compaction.

**Implementation in each strategy**:

```typescript
abstract class BaseCompactor implements MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    // Step 1: Partition by pinned status
    const { pinned, unpinned } = this.partitionByPinned(context);

    // Step 2: Apply compaction ONLY to unpinned
    const compactedUnpinned = await this.compactUnpinned(unpinned, context);

    // Step 3: Merge pinned (untouched) + compacted unpinned
    const result = this.merge(pinned, compactedUnpinned);

    // Step 4: VALIDATE pinned preservation
    this.validatePinnedPreservation(context, result);

    return result;
  }

  protected validatePinnedPreservation(
    context: CompactionContext,
    result: CompactionResult
  ): void {
    const resultIds = new Set(result.messages.map(m => m.id));
    const missingPinned = Array.from(context.pinnedMessageIds)
      .filter(id => !resultIds.has(id));

    if (missingPinned.length > 0) {
      throw new Error(`Compaction violated pinned preservation: ${missingPinned.length} pinned messages missing`);
    }
  }
}
```

### 7.3 Strategy-Specific Behavior

| Strategy | Pinned Message Treatment |
|----------|-------------------------|
| None | All messages kept (trivially preserved) |
| Sliding Window | Pinned always retained, even if outside window |
| Semantic | Pinned excluded from scoring, always kept |
| Hybrid | Pinned excluded from both window and scoring |
| Minimal | Pinned never deduplicated |
| Moderate | Pinned get immediate context (1 before, 1 after) |
| Aggressive | Pinned preserved verbatim, surrounded by outcome summary |

### 7.4 Best Practices for Pinning

**Pin these:**
- Final decisions or outcomes
- Critical compliance findings
- Security concerns
- Key data points or metrics
- Important references or citations
- Instructions that need to be followed

**Don't pin these:**
- Casual conversation
- Exploratory questions (unless outcome is important)
- Temporary working notes
- Duplicate information

---

## 8. Data Model & Persistence

### 8.1 Database Tables

**Compaction Operations** (`copilot_internal.compaction_operations`):
```sql
CREATE TABLE copilot_internal.compaction_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    path_id uuid,
    strategy text NOT NULL,
    triggered_by text NOT NULL CHECK (triggered_by IN ('auto', 'manual')),
    tokens_before integer NOT NULL,
    tokens_after integer NOT NULL,
    tokens_saved integer GENERATED ALWAYS AS (tokens_before - tokens_after) STORED,
    messages_before integer NOT NULL,
    messages_after integer NOT NULL,
    messages_removed integer GENERATED ALWAYS AS (messages_before - messages_after) STORED,
    compression_ratio numeric GENERATED ALWAYS AS (
        CASE WHEN tokens_before > 0
        THEN ROUND(tokens_after::numeric / tokens_before, 4)
        ELSE 1 END
    ) STORED,
    messages_summarized integer DEFAULT 0,
    pinned_preserved integer DEFAULT 0,
    used_llm boolean DEFAULT false,
    duration_ms integer,
    cost_usd numeric(10, 6),
    success boolean NOT NULL,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

### 8.2 Message Pinning Fields

On `copilot_internal.conversation_messages`:
```sql
is_pinned boolean NOT NULL DEFAULT false,
pinned_at timestamptz,
pinned_by uuid
```

### 8.3 Compaction Metadata on Messages

Messages created by compaction have metadata:
```json
{
  "compactionSummary": {
    "type": "path_summary",
    "sourceMessageIds": ["msg-1", "msg-2", "msg-3"],
    "compactionStrategy": "sliding_window",
    "originalMessageCount": 3,
    "tokensBeforeCompaction": 2400,
    "tokensAfterCompaction": 450,
    "summarizedAt": "2026-01-03T12:34:56Z"
  }
}
```

---

## 9. Operational Controls

### 9.1 Environment Variables

```bash
# Feature flags
ENABLE_AUTO_COMPACTION=true
COMPACTION_TOKEN_THRESHOLD=100000

# Snapshot configuration
SNAPSHOT_TTL_HOURS=24

# Cron authentication
CRON_SECRET=your-production-secret
```

### 9.2 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/conversations/:id/compact` | Trigger manual compaction |
| `GET` | `/api/conversations/:id/compact/status` | Check if compaction needed |
| `GET` | `/api/conversations/:id/compact/history` | View compaction history |
| `GET` | `/api/conversations/:id/compact/snapshots` | List available snapshots |
| `POST` | `/api/conversations/:id/compact/rollback` | Rollback to snapshot |
| `GET` | `/api/conversations/:id/compact/snapshots/:snapshotId` | Get snapshot details |
| `GET` | `/api/compaction/metrics` | Fetch analytics data |
| `POST` | `/api/cron/auto-compact` | Scheduled auto-compaction (cron) |

### 9.3 OpenTelemetry Metrics

```typescript
// Metric names
compaction.operations            // Counter - Total operations
compaction.tokens.saved          // Counter - Tokens saved
compaction.messages.removed      // Counter - Messages removed
compaction.duration              // Histogram - Operation duration
compaction.compression.ratio     // Histogram - Compression ratio
```

### 9.4 Safe Defaults

```typescript
const DEFAULT_CONFIG = {
  tokenThreshold: 100_000,      // 100k tokens triggers compaction
  targetTokens: 80_000,         // Compact down to 80k
  strategy: 'sliding_window',   // Safe, predictable
  windowSize: 50,               // Keep last 50 messages
  createSnapshots: true,        // Enable rollback
  autoCompact: false,           // Opt-in for auto
};
```

---

## 10. Edge Cases & Failure Modes

### 10.1 Bad Token Counts

**Problem**: tiktoken may fail for unsupported models.

**Solution**: Character-based fallback estimation (~3.5 chars/token).

### 10.2 LLM Failures During Summarization

**Problem**: LLM call may fail during semantic/hybrid compaction.

**Solutions**:
1. Heuristic fallback (score by message length, role, keywords)
2. Graceful degradation to sliding window
3. Retry with exponential backoff
4. Log failure, continue without compaction

### 10.3 Nested Branches and Merges

**Problem**: Deep branch hierarchies may impact merge compaction performance.

**Solution**: Path resolution is recursive but efficient (typically 2-3 levels). Compaction applies only to direct branch messages, not inherited.

### 10.4 Preserving Citations and Important Constraints

**Problem**: LLM summarization may lose important citations or constraints.

**Solutions**:
1. Users can pin messages with citations
2. Semantic scoring includes citation detection
3. Moderate strategy preserves context around pinned messages

### 10.5 Rollback Failures

**Problem**: Snapshot may be expired or corrupted.

**Solutions**:
1. Validate snapshot before restore
2. Return descriptive error if expired
3. Keep soft-deleted messages for 30 days as fallback

---

## 11. Future Work (Not Implemented)

> **Note**: The following items are validated as not currently present in the codebase.

### 11.1 Planned Enhancements

- [ ] **Persistent Snapshot Storage**: PostgreSQL/Redis-backed snapshots (currently in-memory)
- [ ] **HybridCompactor as dedicated class**: Separate implementation (currently composition)
- [ ] **Time-based importance decay**: Recent messages weighted higher in semantic scoring
- [ ] **User-defined importance rules**: Custom rules for auto-pinning
- [ ] **Topic-based compaction**: Group messages by topic before compacting
- [ ] **Multi-modal compaction**: Special handling for code blocks, images, tables
- [ ] **Collaborative pinning**: Team-wide vs personal pins
- [ ] **Smart pinning suggestions**: AI-suggested pins based on importance
- [ ] **Pin categories/labels**: Categorize pins (decision, concern, reference, todo)
- [ ] **Visual diff view**: Before/after comparison in UI
- [ ] **Batch compaction**: Compact multiple conversations at once
- [ ] **Adaptive thresholds**: Learn optimal thresholds per user/tenant
- [ ] **PII redaction before LLM calls**: Privacy enhancement for semantic strategies

### 11.2 Backlog from Original Architecture

The original architecture document proposed these additional strategies that remain unimplemented:
- Time-Aware Compactor (preserve recent N days)
- Topic-Based Compactor (group by topic)
- User-Guided Compactor (explicit importance marking)
- Collaborative Compactor (multi-user voting)

---

## 12. References

### Code Locations

| Component | Path |
|-----------|------|
| **Token Counting** | `packages/reg-intel-core/src/tokens/` |
| **Compaction Module** | `packages/reg-intel-conversations/src/compaction/` |
| **Compaction Strategies** | `packages/reg-intel-conversations/src/compaction/strategies/` |
| **PathCompactionService** | `packages/reg-intel-conversations/src/compaction/pathCompactionService.ts` |
| **Snapshot Service** | `packages/reg-intel-conversations/src/compaction/snapshotService.ts` |
| **Compaction Metrics** | `packages/reg-intel-observability/src/compactionMetrics.ts` |
| **API Endpoints** | `apps/demo-web/src/app/api/conversations/[conversationId]/compact/` |
| **UI Components** | `apps/demo-web/src/components/compaction/` |
| **Auto-Compaction Job** | `apps/demo-web/src/lib/jobs/autoCompactionJob.ts` |
| **Cron Endpoint** | `apps/demo-web/src/app/api/cron/auto-compact/` |
| **Initialization** | `apps/demo-web/src/lib/compactionInit.ts` |

### Database Migrations

- `supabase/migrations/20260102000000_compaction_operations.sql` - Compaction operations table

### Related Documentation

- [Conversation Path System](./conversation-path-system.md) - Path branching/merging (canonical)
- [Architecture v0.6](./architecture_v_0_6.md) - Overall system architecture

### Archived Historical Documents

The following documents have been consolidated into this spec and archived:
- `docs/archive/conversation-compaction/CONVERSATION_COMPACTION_ARCHITECTURE.md`
- `docs/archive/conversation-compaction/MESSAGE_PINNING.md`
- `docs/archive/conversation-compaction/COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-03 | Initial consolidated spec (merged architecture, implementation plan, and pinning docs) |

---

**Document Status**: Canonical
**Supersedes**: CONVERSATION_COMPACTION_ARCHITECTURE.md, MESSAGE_PINNING.md, COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md
**Maintenance**: Update when compaction system changes
