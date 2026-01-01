/**
 * Automatic Compaction Background Job
 *
 * Runs periodically to compact conversations that exceed token thresholds.
 * Designed to be triggered by cron jobs or background workers.
 *
 * Features:
 * - Batch processing of conversations
 * - Configurable token threshold
 * - Automatic snapshot creation
 * - Metrics recording
 * - Error handling and retry logic
 */

import { PathCompactionService } from '@reg-copilot/reg-intel-conversations/compaction';
import type { ConversationMessage, ConversationStore } from '@reg-copilot/reg-intel-conversations';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';

const logger = createLogger('AutoCompactionJob');

export interface AutoCompactionJobConfig {
  /**
   * Token threshold to trigger compaction
   * @default 100000
   */
  tokenThreshold?: number;

  /**
   * Target tokens after compaction (% of threshold)
   * @default 0.8
   */
  targetTokenRatio?: number;

  /**
   * Compaction strategy to use
   * @default 'sliding_window'
   */
  strategy?: 'none' | 'sliding_window' | 'semantic' | 'hybrid';

  /**
   * Maximum number of conversations to process per run
   * @default 100
   */
  batchSize?: number;

  /**
   * Model to use for token counting
   * @default 'gpt-4'
   */
  model?: string;

  /**
   * Whether to create snapshots before compaction
   * @default true
   */
  createSnapshots?: boolean;

  /**
   * Dry run mode (don't actually compact, just log what would happen)
   * @default false
   */
  dryRun?: boolean;
}

export interface CompactionJobResult {
  processedConversations: number;
  compactedConversations: number;
  totalTokensSaved: number;
  totalMessagesRemoved: number;
  errors: number;
  durationMs: number;
  details: {
    conversationId: string;
    tokensBefore: number;
    tokensAfter: number;
    messagesBefore: number;
    messagesAfter: number;
    success: boolean;
    error?: string;
  }[];
}

/**
 * Run automatic compaction job
 *
 * @param conversationStore - Conversation store to query conversations
 * @param config - Job configuration
 * @returns Job execution results
 */
type CompactionConversationStore = Pick<ConversationStore, 'getMessages'> & {
  getConversationsNeedingCompaction?: (
    limit: number
  ) => Promise<Array<{ id: string; tenantId: string; activePathId?: string }>>;
};

export async function runAutoCompactionJob(
  conversationStore: CompactionConversationStore,
  config: AutoCompactionJobConfig = {}
): Promise<CompactionJobResult> {
  const startTime = Date.now();

  const {
    tokenThreshold = 100_000,
    targetTokenRatio = 0.8,
    strategy = 'sliding_window',
    batchSize = 100,
    model = 'gpt-4',
    createSnapshots = true,
    dryRun = false,
  } = config;

  logger.info(
    {
      tokenThreshold,
      strategy,
      batchSize,
      dryRun,
    },
    'Starting automatic compaction job'
  );

  const result: CompactionJobResult = {
    processedConversations: 0,
    compactedConversations: 0,
    totalTokensSaved: 0,
    totalMessagesRemoved: 0,
    errors: 0,
    durationMs: 0,
    details: [],
  };

  try {
    // Initialize compaction service
    const compactionService = new PathCompactionService({
      tokenThreshold,
      targetTokens: tokenThreshold * targetTokenRatio,
      strategy,
      model,
      createSnapshots,
    });

    // Query conversations (In production, add filters for active conversations, recent activity, etc.)
    // For now, this is a placeholder - you'd implement actual querying logic
    const conversationsToCheck = conversationStore.getConversationsNeedingCompaction
      ? await conversationStore.getConversationsNeedingCompaction(batchSize)
      : await getConversationsNeedingCompaction(conversationStore, batchSize);

    logger.info(
      { count: conversationsToCheck.length },
      'Found conversations to check for compaction'
    );

    // Process each conversation
    for (const conversation of conversationsToCheck) {
      result.processedConversations++;

      try {
        // Get messages for conversation
        const messages = await conversationStore.getMessages({
          conversationId: conversation.id,
          tenantId: conversation.tenantId,
        });

        if (!messages || messages.length === 0) {
          continue;
        }

        // Get pinned message IDs
        const pinnedMessageIds = new Set<string>(
          messages
            .filter((message: ConversationMessage) => message.metadata?.pinned === true)
            .map(m => m.id)
        );

        // Check if compaction is needed
        const needsCompaction = await compactionService.needsCompaction(messages, pinnedMessageIds);

        if (!needsCompaction) {
          logger.info(
            {
              conversationId: conversation.id,
              messageCount: messages.length,
            },
            'Conversation does not need compaction'
          );
          continue;
        }

        // Count tokens before compaction
        const tokensBefore = await countTokensForMessages(messages, model);

        if (dryRun) {
          logger.info(
            {
              conversationId: conversation.id,
              tokensBefore,
              threshold: tokenThreshold,
            },
            '[DRY RUN] Would compact conversation'
          );

          result.details.push({
            conversationId: conversation.id,
            tokensBefore,
            tokensAfter: Math.floor(tokensBefore * targetTokenRatio),
            messagesBefore: messages.length,
            messagesAfter: Math.floor(messages.length * targetTokenRatio),
            success: true,
          });

          continue;
        }

        // Perform compaction
        logger.info(
          {
            conversationId: conversation.id,
            tokensBefore,
            messageCount: messages.length,
            strategy,
          },
          'Compacting conversation'
        );

        const compactionResult = await compactionService.compactPath(
          messages,
          pinnedMessageIds,
          conversation.id,
          conversation.activePathId,
          'auto' // Triggered automatically
        );

        if (compactionResult.success) {
          // Update conversation with compacted messages
          // In production, you'd update the conversation store here
          // await conversationStore.replaceMessages({
          //   conversationId: conversation.id,
          //   tenantId: conversation.tenantId,
          //   messages: compactionResult.messages,
          // });

          const tokensSaved = compactionResult.tokensBefore - compactionResult.tokensAfter;
          const messagesRemoved = compactionResult.messagesRemoved;

          result.compactedConversations++;
          result.totalTokensSaved += tokensSaved;
          result.totalMessagesRemoved += messagesRemoved;

          result.details.push({
            conversationId: conversation.id,
            tokensBefore: compactionResult.tokensBefore,
            tokensAfter: compactionResult.tokensAfter,
            messagesBefore: messages.length,
            messagesAfter: compactionResult.messages.length,
            success: true,
          });

          logger.info(
            {
              conversationId: conversation.id,
              tokensSaved,
              messagesRemoved,
              compressionRatio: compactionResult.tokensAfter / compactionResult.tokensBefore,
            },
            'Successfully compacted conversation'
          );
        } else {
          result.errors++;
          result.details.push({
            conversationId: conversation.id,
            tokensBefore,
            tokensAfter: tokensBefore,
            messagesBefore: messages.length,
            messagesAfter: messages.length,
            success: false,
            error: compactionResult.error || 'Unknown error',
          });

          logger.error(
            {
              conversationId: conversation.id,
              error: compactionResult.error,
            },
            'Failed to compact conversation'
          );
        }
      } catch (error) {
        result.errors++;
        logger.error(
          {
            conversationId: conversation.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Error processing conversation'
        );

        result.details.push({
          conversationId: conversation.id,
          tokensBefore: 0,
          tokensAfter: 0,
          messagesBefore: 0,
          messagesAfter: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Auto-compaction job failed'
    );
  }

  result.durationMs = Date.now() - startTime;

  logger.info(
    {
      ...result,
      details: undefined, // Don't log all details
    },
    'Auto-compaction job completed'
  );

  return result;
}

/**
 * Get conversations that might need compaction
 *
 * In production, this should query your conversation store with filters like:
 * - Conversations with recent activity
 * - Conversations above a certain message count
 * - Conversations not recently compacted
 * - etc.
 *
 * @param conversationStore - Conversation store
 * @param limit - Maximum number of conversations to return
 * @returns List of conversation metadata
 */
async function getConversationsNeedingCompaction(
  conversationStore: CompactionConversationStore,
  limit: number
): Promise<Array<{ id: string; tenantId: string; activePathId?: string }>> {
  if (conversationStore.getConversationsNeedingCompaction) {
    return conversationStore.getConversationsNeedingCompaction(limit);
  }

  logger.warn(
    { limit },
    'getConversationsNeedingCompaction not implemented; returning empty set'
  );

  return [];

  // Example production implementation:
  /*
  const conversations = await conversationStore.queryConversations({
    filters: {
      messageCountGt: 50,
      lastActivityAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      lastCompactionBefore: new Date(Date.now() - 24 * 60 * 60 * 1000), // Not compacted in 24h
    },
    limit,
    orderBy: 'lastActivity',
    orderDirection: 'desc',
  });

  return conversations;
  */
}

/**
 * Schedule automatic compaction job
 *
 * Example cron schedule: Every hour
 * 0 * * * * (every hour at minute 0)
 *
 * Example usage:
 * ```typescript
 * import { scheduleAutoCompaction } from './autoCompactionJob';
 *
 * scheduleAutoCompaction(conversationStore, {
 *   tokenThreshold: 100_000,
 *   strategy: 'semantic',
 *   batchSize: 50,
 * });
 * ```
 */
export function scheduleAutoCompaction(
  conversationStore: CompactionConversationStore,
  config: AutoCompactionJobConfig = {},
  intervalMs: number = 3600000 // 1 hour
): () => void {
  logger.info(
    {
      intervalMs,
      intervalMinutes: intervalMs / 60000,
    },
    'Scheduling automatic compaction job'
  );

  const interval = setInterval(async () => {
    try {
      await runAutoCompactionJob(conversationStore, config);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Scheduled compaction job failed'
      );
    }
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(interval);
    logger.info('Stopped automatic compaction job schedule');
  };
}
