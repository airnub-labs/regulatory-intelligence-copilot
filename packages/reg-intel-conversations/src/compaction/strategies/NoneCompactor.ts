/**
 * None Compaction Strategy
 *
 * Pass-through strategy that performs no compaction.
 * Returns all messages unchanged.
 *
 * Use cases:
 * - Short conversations
 * - Compliance scenarios requiring full audit trail
 * - Testing/debugging
 */

import type {
  CompactionContext,
  CompactionResult,
  MessageCompactor,
} from '../types.js';

export class NoneCompactor implements MessageCompactor {
  getStrategy(): string {
    return 'none';
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    const startTime = Date.now();

    return {
      messages: context.messages,
      tokensBefore: context.currentTokens,
      tokensAfter: context.currentTokens,
      messagesRemoved: 0,
      messagesSummarized: 0,
      pinnedPreserved: context.pinnedMessageIds.size,
      strategy: this.getStrategy(),
      success: true,
      metadata: {
        durationMs: Date.now() - startTime,
        usedLlm: false,
      },
    };
  }

  async estimateSavings(context: CompactionContext): Promise<number> {
    return 0; // No savings from this strategy
  }
}
