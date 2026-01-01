/**
 * Path Compaction Service
 *
 * Manages automatic compaction of conversation paths when they exceed token thresholds.
 *
 * Features:
 * - Automatic triggering based on token thresholds
 * - Integration with conversation store
 * - Pinned message preservation
 * - Configurable compaction strategies
 * - Cost tracking for compaction operations
 */

import type { ConversationMessage as Message } from '../conversationStores.js';
import type {
  CompactionContext,
  CompactionResult,
  PathCompactionStrategy,
  SlidingWindowConfig,
} from './types.js';
import { getPathCompactor, DEFAULT_PATH_COMPACTION_CONFIG } from './compactionFactory.js';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';

/**
 * Configuration for path compaction service
 */
export interface PathCompactionServiceConfig {
  /** Token threshold to trigger compaction */
  tokenThreshold: number;

  /** Target tokens after compaction (defaults to 80% of threshold) */
  targetTokens?: number;

  /** Compaction strategy to use */
  strategy: PathCompactionStrategy;

  /** Strategy-specific configuration */
  strategyConfig?: SlidingWindowConfig;

  /** Model to use for token counting */
  model?: string;

  /** Whether to auto-compact on every message add */
  autoCompact?: boolean;

  /** LLM client for summarization (required for semantic strategies) */
  llmClient?: any;
}

/**
 * Service for managing path compaction
 */
export class PathCompactionService {
  private config: PathCompactionServiceConfig;

  constructor(config?: Partial<PathCompactionServiceConfig>) {
    this.config = {
      tokenThreshold: config?.tokenThreshold ?? 100_000, // Default 100k tokens
      targetTokens: config?.targetTokens ?? (config?.tokenThreshold ?? 100_000) * 0.8,
      strategy: config?.strategy ?? 'sliding_window',
      strategyConfig: config?.strategyConfig ?? DEFAULT_PATH_COMPACTION_CONFIG,
      model: config?.model ?? 'gpt-4',
      autoCompact: config?.autoCompact ?? false,
      llmClient: config?.llmClient,
    };
  }

  /**
   * Check if a conversation needs compaction
   */
  async needsCompaction(messages: Message[], pinnedMessageIds: Set<string>): Promise<boolean> {
    const tokenCount = await countTokensForMessages(messages, this.config.model);
    return tokenCount > this.config.tokenThreshold;
  }

  /**
   * Compact a conversation path
   */
  async compactPath(
    messages: Message[],
    pinnedMessageIds: Set<string>,
    conversationId?: string,
    pathId?: string
  ): Promise<CompactionResult> {
    // Count current tokens
    const currentTokens = await countTokensForMessages(messages, this.config.model);

    // Build compaction context
    const context: CompactionContext = {
      messages,
      pinnedMessageIds,
      currentTokens,
      targetTokens: this.config.targetTokens,
      model: this.config.model,
      conversationId,
      pathId,
      llmClient: this.config.llmClient,
      options: this.config.strategyConfig,
    };

    // Get compactor and run compaction
    const compactor = getPathCompactor(this.config.strategy, this.config.strategyConfig);
    const result = await compactor.compact(context);

    return result;
  }

  /**
   * Estimate how many tokens would be saved by compaction
   */
  async estimateSavings(messages: Message[], pinnedMessageIds: Set<string>): Promise<number> {
    const currentTokens = await countTokensForMessages(messages, this.config.model);

    const context: CompactionContext = {
      messages,
      pinnedMessageIds,
      currentTokens,
      model: this.config.model,
      llmClient: this.config.llmClient,
    };

    const compactor = getPathCompactor(this.config.strategy, this.config.strategyConfig);
    return compactor.estimateSavings(context);
  }

  /**
   * Auto-compact if needed
   *
   * Checks if compaction is needed and performs it if threshold is exceeded.
   * Returns null if compaction was not needed.
   */
  async autoCompactIfNeeded(
    messages: Message[],
    pinnedMessageIds: Set<string>,
    conversationId?: string,
    pathId?: string
  ): Promise<CompactionResult | null> {
    if (!this.config.autoCompact) {
      return null;
    }

    const needed = await this.needsCompaction(messages, pinnedMessageIds);
    if (!needed) {
      return null;
    }

    return this.compactPath(messages, pinnedMessageIds, conversationId, pathId);
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<PathCompactionServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): PathCompactionServiceConfig {
    return { ...this.config };
  }
}

/**
 * Global path compaction service instance
 */
let globalPathCompactionService: PathCompactionService | null = null;

/**
 * Initialize the global path compaction service
 */
export const initPathCompaction = (config?: Partial<PathCompactionServiceConfig>): PathCompactionService => {
  globalPathCompactionService = new PathCompactionService(config);
  return globalPathCompactionService;
};

/**
 * Get the global path compaction service
 * @throws Error if not initialized
 */
export const getPathCompactionService = (): PathCompactionService => {
  if (!globalPathCompactionService) {
    throw new Error('Path compaction service not initialized. Call initPathCompaction() first.');
  }
  return globalPathCompactionService;
};

/**
 * Get the global path compaction service if initialized, otherwise null
 */
export const getPathCompactionServiceIfInitialized = (): PathCompactionService | null => {
  return globalPathCompactionService;
};
