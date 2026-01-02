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
 * - Snapshot creation for rollback support
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
import { getSnapshotServiceIfInitialized } from './snapshotService.js';

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

  /** Whether to create snapshots before compaction (default: true) */
  createSnapshots?: boolean;
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
      createSnapshots: config?.createSnapshots ?? true,
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
    pathId?: string,
    triggeredBy: 'auto' | 'manual' = 'auto'
  ): Promise<CompactionResult & { snapshotId?: string }> {
    // Count current tokens
    const currentTokens = await countTokensForMessages(messages, this.config.model);

    // Create snapshot before compaction (if enabled)
    let snapshotId: string | undefined;
    if (this.config.createSnapshots && conversationId) {
      const snapshotService = getSnapshotServiceIfInitialized();
      if (snapshotService) {
        try {
          const snapshot = await snapshotService.createSnapshot(
            conversationId,
            messages,
            pinnedMessageIds,
            currentTokens,
            this.config.strategy,
            pathId
          );
          snapshotId = snapshot.id;
        } catch (error) {
          console.warn('Failed to create compaction snapshot:', error);
          // Continue with compaction even if snapshot fails
        }
      }
    }

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

    // Update snapshot with result (if we created one)
    if (snapshotId && conversationId) {
      const snapshotService = getSnapshotServiceIfInitialized();
      if (snapshotService) {
        try {
          await snapshotService.updateWithResult(snapshotId, result);
        } catch (error) {
          console.warn('Failed to update snapshot with result:', error);
        }
      }
    }

    // Record metrics for successful compaction (includes database persistence)
    if (result.success) {
      try {
        const { recordCompactionOperation } = await import('@reg-copilot/reg-intel-observability');
        recordCompactionOperation({
          strategy: result.strategy,
          conversationId,
          pathId,
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          messagesBefore: messages.length,
          messagesAfter: result.messages.length,
          messagesSummarized: result.messagesSummarized ?? 0,
          pinnedPreserved: result.pinnedPreserved ?? 0,
          success: true,
          durationMs: result.metadata?.durationMs ?? 0,
          triggeredBy,
          usedLlm: result.metadata?.usedLlm ?? false,
          costUsd: result.metadata?.costUsd as number | undefined,
        });
      } catch (error) {
        // Don't fail compaction if metrics recording fails
        console.warn('Failed to record compaction metrics:', error);
      }
    } else {
      try {
        const { recordCompactionFailure } = await import('@reg-copilot/reg-intel-observability');
        recordCompactionFailure({
          strategy: this.config.strategy,
          conversationId,
          pathId,
          error: result.error || 'Unknown error',
        });
      } catch (error) {
        console.warn('Failed to record compaction failure:', error);
      }
    }

    return { ...result, snapshotId };
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
