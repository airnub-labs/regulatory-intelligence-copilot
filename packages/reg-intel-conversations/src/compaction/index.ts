/**
 * Conversation Compaction Module
 *
 * Provides intelligent message compression and summarization to manage
 * conversation context size.
 *
 * Features:
 * - Token-aware compaction (uses tiktoken for accurate counting)
 * - Multiple compaction strategies (none, sliding_window, semantic, hybrid)
 * - Pinned message preservation
 * - LLM-powered summarization
 * - Configurable per-tenant/user
 *
 * Usage:
 * ```typescript
 * import { getPathCompactor, type CompactionContext } from '@reg-copilot/reg-intel-conversations/compaction';
 *
 * const compactor = getPathCompactor('sliding_window', {
 *   windowSize: 50,
 *   summarizeOld: true,
 * });
 *
 * const result = await compactor.compact({
 *   messages,
 *   pinnedMessageIds: new Set(pinnedIds),
 *   currentTokens,
 *   model: 'gpt-4',
 * });
 *
 * console.log(`Reduced from ${result.tokensBefore} to ${result.tokensAfter} tokens`);
 * ```
 */

// Types
export type {
  PathCompactionStrategy,
  MergeCompactionStrategy,
  CompactionContext,
  CompactionResult,
  MessageCompactor,
  SlidingWindowConfig,
  SemanticConfig,
  HybridConfig,
  MergeCompactionConfig,
  CompactionStats,
} from './types.js';

// Strategies
export { NoneCompactor } from './strategies/NoneCompactor.js';
export { SlidingWindowCompactor } from './strategies/SlidingWindowCompactor.js';
export { SemanticCompactor } from './strategies/SemanticCompactor.js';
export { HybridCompactor } from './strategies/HybridCompactor.js';
export { ModerateMergeCompactor } from './strategies/ModerateMergeCompactor.js';
export { AggressiveMergeCompactor } from './strategies/AggressiveMergeCompactor.js';

// Factory
export {
  getPathCompactor,
  getMergeCompactor,
  DEFAULT_PATH_COMPACTION_CONFIG,
  DEFAULT_MERGE_COMPACTION_CONFIG,
} from './compactionFactory.js';

// Services
export {
  PathCompactionService,
  initPathCompaction,
  getPathCompactionService,
  getPathCompactionServiceIfInitialized,
  type PathCompactionServiceConfig,
} from './pathCompactionService.js';

// Conversation Store Integration
export {
  wrapWithCompaction,
  compactMessages,
  needsCompaction,
  type CompactionWrapperConfig,
} from './conversationStoreCompactionAdapter.js';

// Snapshot & Rollback
export {
  CompactionSnapshotService,
  initSnapshotService,
  getSnapshotService,
  getSnapshotServiceIfInitialized,
  type CompactionSnapshot,
  type SnapshotStorageProvider,
} from './snapshotService.js';
export { SupabaseSnapshotStorage } from './supabaseSnapshotStorage.js';

// Utilities
export {
  hashMessage,
  shortHash,
  deduplicateMessages,
  findDuplicates,
  mergeMessageLists,
  sortMessagesByTimestamp,
  calculateReduction,
  calculateCompressionRatio,
  groupConsecutiveByRole,
  mergeConsecutiveSameRole,
  partitionMessages,
  calculateSimilarity,
  findSimilarMessages,
  estimateTokensQuick,
  estimateTotalTokensQuick,
  type DeduplicationResult,
  type HashOptions,
  type MergeOptions,
} from './utils.js';
