/**
 * Conversation Store Compaction Adapter
 *
 * Wraps getMessages calls to add automatic compaction capabilities.
 *
 * Usage:
 * ```typescript
 * import { wrapWithCompaction } from '@reg-copilot/reg-intel-conversations/compaction';
 *
 * const baseStore = createSupabaseConversationStore(...);
 * const getMessagesWithCompaction = wrapWithCompaction(
 *   baseStore.getMessages.bind(baseStore),
 *   {
 *     enabled: true,
 *     strategy: 'sliding_window',
 *     tokenThreshold: 100_000,
 *   }
 * );
 *
 * // Now use the wrapped function
 * const messages = await getMessagesWithCompaction({ tenantId, conversationId });
 * ```
 */

import type { ConversationMessage } from '../conversationStores.js';
import type { PathCompactionStrategy, SlidingWindowConfig, SemanticConfig } from './types.js';
import {
  PathCompactionService,
  type PathCompactionServiceConfig,
} from './pathCompactionService.js';

/**
 * Configuration for message compaction wrapper
 */
export interface CompactionWrapperConfig {
  /** Whether auto-compaction is enabled */
  enabled: boolean;

  /** Compaction strategy to use */
  strategy?: PathCompactionStrategy;

  /** Token threshold to trigger compaction */
  tokenThreshold?: number;

  /** Strategy-specific configuration */
  strategyConfig?: SlidingWindowConfig | SemanticConfig;

  /** Model for token counting */
  model?: string;

  /** LLM client for semantic strategies */
  llmClient?: any;
}

/**
 * Input type for getMessages
 */
interface GetMessagesInput {
  tenantId: string;
  conversationId: string;
  userId?: string | null;
  limit?: number;
}

/**
 * Wrap getMessages with automatic compaction
 */
export function wrapWithCompaction(
  getMessages: (input: GetMessagesInput) => Promise<ConversationMessage[]>,
  config: CompactionWrapperConfig
): (input: GetMessagesInput) => Promise<ConversationMessage[]> {
  if (!config.enabled) {
    return getMessages;
  }

  const serviceConfig: PathCompactionServiceConfig = {
    tokenThreshold: config.tokenThreshold ?? 100_000,
    strategy: config.strategy ?? 'sliding_window',
    strategyConfig: config.strategyConfig as SlidingWindowConfig,
    model: config.model ?? 'gpt-4',
    autoCompact: false,
    llmClient: config.llmClient,
  };

  const compactionService = new PathCompactionService(serviceConfig);

  return async (input: GetMessagesInput): Promise<ConversationMessage[]> => {
    const messages = await getMessages(input);

    if (messages.length === 0) {
      return messages;
    }

    try {
      const pinnedIds = new Set<string>();
      const needsCompaction = await compactionService.needsCompaction(messages, pinnedIds);

      if (!needsCompaction) {
        return messages;
      }

      const result = await compactionService.compactPath(
        messages,
        pinnedIds,
        input.conversationId
      );

      if (result.success) {
        console.info('Auto-compacted messages', {
          conversationId: input.conversationId,
          messagesBefore: messages.length,
          messagesAfter: result.messages.length,
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          strategy: result.strategy,
        });

        return result.messages;
      }

      return messages;
    } catch (error) {
      console.error('Auto-compaction failed, returning original messages:', error);
      return messages;
    }
  };
}

/**
 * Helper to manually compact messages
 */
export async function compactMessages(
  messages: ConversationMessage[],
  config: CompactionWrapperConfig
): Promise<ConversationMessage[]> {
  if (!config.enabled || messages.length === 0) {
    return messages;
  }

  const serviceConfig: PathCompactionServiceConfig = {
    tokenThreshold: config.tokenThreshold ?? 100_000,
    strategy: config.strategy ?? 'sliding_window',
    strategyConfig: config.strategyConfig as SlidingWindowConfig,
    model: config.model ?? 'gpt-4',
    autoCompact: false,
    llmClient: config.llmClient,
  };

  const compactionService = new PathCompactionService(serviceConfig);
  const pinnedIds = new Set<string>();

  const result = await compactionService.compactPath(messages, pinnedIds);

  return result.success ? result.messages : messages;
}

/**
 * Check if messages need compaction
 */
export async function needsCompaction(
  messages: ConversationMessage[],
  config: CompactionWrapperConfig
): Promise<boolean> {
  if (!config.enabled || messages.length === 0) {
    return false;
  }

  const serviceConfig: PathCompactionServiceConfig = {
    tokenThreshold: config.tokenThreshold ?? 100_000,
    strategy: config.strategy ?? 'sliding_window',
    strategyConfig: config.strategyConfig as SlidingWindowConfig,
    model: config.model ?? 'gpt-4',
    autoCompact: false,
    llmClient: config.llmClient,
  };

  const compactionService = new PathCompactionService(serviceConfig);
  const pinnedIds = new Set<string>();

  return compactionService.needsCompaction(messages, pinnedIds);
}
