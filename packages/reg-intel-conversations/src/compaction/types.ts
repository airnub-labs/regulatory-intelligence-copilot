/**
 * Conversation Compaction Types
 *
 * Core types and interfaces for the conversation compaction system.
 * Compaction reduces conversation context size through intelligent
 * message compression and summarization strategies.
 */

import type { ConversationMessage as Message } from '../conversationStores.js';

/**
 * Compaction strategy types
 */
export type PathCompactionStrategy = 'none' | 'sliding_window' | 'semantic' | 'hybrid';
export type MergeCompactionStrategy = 'none' | 'minimal' | 'moderate' | 'aggressive';

/**
 * Context passed to compaction strategies
 */
export interface CompactionContext {
  /** Messages to compact */
  messages: Message[];

  /** IDs of pinned messages (must never be removed) */
  pinnedMessageIds: Set<string>;

  /** Current total tokens in the conversation */
  currentTokens: number;

  /** Target token count after compaction */
  targetTokens?: number;

  /** Model being used (for token counting) */
  model?: string;

  /** Conversation ID (for logging/debugging) */
  conversationId?: string;

  /** Path ID (for logging/debugging) */
  pathId?: string;

  /** LLM client (for semantic/LLM-based strategies) */
  llmClient?: any;

  /** Additional configuration options */
  options?: any;
}

/**
 * Result from compaction operation
 */
export interface CompactionResult {
  /** Messages after compaction */
  messages: Message[];

  /** Token count before compaction */
  tokensBefore: number;

  /** Token count after compaction */
  tokensAfter: number;

  /** Number of messages removed */
  messagesRemoved: number;

  /** Number of messages summarized (replaced with summary) */
  messagesSummarized: number;

  /** Number of pinned messages preserved */
  pinnedPreserved: number;

  /** Strategy used for compaction */
  strategy: string;

  /** Whether compaction succeeded */
  success: boolean;

  /** Error message if compaction failed */
  error?: string;

  /** Summary message(s) created during compaction */
  summaryMessages?: Message[];

  /** Metadata about the compaction operation */
  metadata?: {
    /** How long compaction took (ms) */
    durationMs?: number;

    /** Whether LLM was used */
    usedLlm?: boolean;

    /** Cost of compaction operation (USD) */
    costUsd?: number;

    /** Additional debug info */
    [key: string]: unknown;
  };
}

/**
 * Base interface for message compactors
 */
export interface MessageCompactor {
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

/**
 * Configuration for sliding window strategy
 */
export interface SlidingWindowConfig {
  /** Number of recent messages to keep */
  windowSize: number;

  /** Whether to summarize messages outside the window */
  summarizeOld: boolean;

  /** Whether to always keep system messages */
  keepSystemMessages: boolean;
}

/**
 * Configuration for semantic strategy
 */
export interface SemanticConfig {
  /** Importance threshold (0-1) - messages below this are candidates for removal */
  importanceThreshold: number;

  /** Minimum number of messages to keep */
  minMessages: number;

  /** Whether to use LLM for importance scoring */
  useLlm: boolean;

  /** Model to use for importance scoring */
  model?: string;
}

/**
 * Configuration for hybrid strategy
 */
export interface HybridConfig {
  /** Sliding window for recent messages */
  windowSize: number;

  /** Semantic analysis for old messages */
  importanceThreshold: number;

  /** Minimum total messages to keep */
  minMessages: number;
}

/**
 * Configuration for merge compaction strategies
 */
export interface MergeCompactionConfig {
  /** Strategy to use */
  strategy: MergeCompactionStrategy;

  /** Whether to deduplicate identical messages */
  deduplicate: boolean;

  /** Whether to merge consecutive messages from same role */
  mergeConsecutive: boolean;

  /** For moderate/aggressive: whether to use LLM for summarization */
  useLlm?: boolean;

  /** Model to use for summarization */
  model?: string;
}

/**
 * Compaction statistics for monitoring
 */
export interface CompactionStats {
  /** Total number of compactions performed */
  totalCompactions: number;

  /** Total tokens saved */
  tokensSaved: number;

  /** Total messages removed */
  messagesRemoved: number;

  /** Total messages summarized */
  messagesSummarized: number;

  /** Average compaction ratio (tokens after / tokens before) */
  avgCompressionRatio: number;

  /** Strategy usage breakdown */
  strategyUsage: Record<string, number>;

  /** Total cost of compaction operations (USD) */
  totalCostUsd: number;
}
