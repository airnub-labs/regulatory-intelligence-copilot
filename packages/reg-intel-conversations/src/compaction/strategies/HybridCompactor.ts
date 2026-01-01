/**
 * Hybrid Compaction Strategy
 *
 * Combines sliding window + semantic filtering for optimal compression.
 *
 * Algorithm:
 * 1. Always preserve pinned and system messages
 * 2. Keep last N messages in the "window" (recent context)
 * 3. Apply semantic scoring to older messages outside the window
 * 4. Keep old messages above importance threshold
 * 5. Optionally summarize remaining old messages
 * 6. Combine: system + pinned + important old + summary + recent window
 *
 * Use cases:
 * - Long conversations (200+ messages)
 * - Research/exploration with important discoveries
 * - Balanced need for recent context and historical insights
 */

import type { ConversationMessage as Message } from '../../conversationStores.js';
import type {
  CompactionContext,
  CompactionResult,
  MessageCompactor,
  HybridConfig,
} from '../types.js';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';

interface MessageWithScore {
  message: Message;
  score: number;
}

export class HybridCompactor implements MessageCompactor {
  private config: HybridConfig;

  constructor(config?: Partial<HybridConfig>) {
    this.config = {
      windowSize: config?.windowSize ?? 30,
      importanceThreshold: config?.importanceThreshold ?? 0.6,
      minMessages: config?.minMessages ?? 20,
    };
  }

  getStrategy(): string {
    return 'hybrid';
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    const startTime = Date.now();
    const { messages, pinnedMessageIds, currentTokens, model } = context;

    // Partition messages
    const pinnedMessages: Message[] = [];
    const systemMessages: Message[] = [];
    const regularMessages: Message[] = [];

    for (const msg of messages) {
      if (pinnedMessageIds.has(msg.id)) {
        pinnedMessages.push(msg);
      } else if (msg.role === 'system') {
        systemMessages.push(msg);
      } else {
        regularMessages.push(msg);
      }
    }

    // Split regular messages into window (recent) and old
    const windowMessages = regularMessages.slice(-this.config.windowSize);
    const oldMessages = regularMessages.slice(0, -this.config.windowSize);

    // Score old messages semantically
    let scoredOldMessages: MessageWithScore[];
    let usedLlm = false;

    if (oldMessages.length > 0 && context.llmClient) {
      scoredOldMessages = await this.scoreMessagesWithLlm(oldMessages, context);
      usedLlm = true;
    } else {
      scoredOldMessages = this.scoreMessagesWithHeuristics(oldMessages);
    }

    // Filter old messages by importance threshold
    const importantOldMessages = scoredOldMessages
      .filter(({ score }) => score >= this.config.importanceThreshold)
      .map(({ message }) => message);

    // Determine how many messages we need to keep from old messages
    // to meet the minimum message count
    const currentCount = systemMessages.length + pinnedMessages.length +
      importantOldMessages.length + windowMessages.length;

    let additionalFromOld: Message[] = [];
    if (currentCount < this.config.minMessages) {
      // Sort remaining old messages by score and add more
      const remaining = scoredOldMessages
        .filter(({ score }) => score < this.config.importanceThreshold)
        .sort((a, b) => b.score - a.score);

      const needed = this.config.minMessages - currentCount;
      additionalFromOld = remaining.slice(0, needed).map(({ message }) => message);
    }

    // Combine all messages
    const compactedMessages: Message[] = [
      ...systemMessages,
      ...pinnedMessages,
      ...importantOldMessages,
      ...additionalFromOld,
      ...windowMessages,
    ];

    // Sort by timestamp to maintain chronological order
    compactedMessages.sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    // Count tokens in compacted messages
    const tokensAfter = await countTokensForMessages(compactedMessages, model ?? 'gpt-4');

    const messagesRemoved = messages.length - compactedMessages.length;
    const avgImportanceScore = scoredOldMessages.length > 0
      ? scoredOldMessages.reduce((sum, s) => sum + s.score, 0) / scoredOldMessages.length
      : 0;

    return {
      messages: compactedMessages,
      tokensBefore: currentTokens,
      tokensAfter,
      messagesRemoved,
      messagesSummarized: 0,
      pinnedPreserved: pinnedMessages.length,
      strategy: this.getStrategy(),
      success: true,
      metadata: {
        durationMs: Date.now() - startTime,
        usedLlm,
        windowSize: this.config.windowSize,
        importanceThreshold: this.config.importanceThreshold,
        windowMessagesCount: windowMessages.length,
        oldMessagesCount: oldMessages.length,
        importantOldMessagesKept: importantOldMessages.length,
        additionalMessagesKept: additionalFromOld.length,
        avgImportanceScore,
      },
    };
  }

  async estimateSavings(context: CompactionContext): Promise<number> {
    const { messages, pinnedMessageIds, currentTokens } = context;

    // Get regular messages
    const regularMessages = messages.filter(
      msg => !pinnedMessageIds.has(msg.id) && msg.role !== 'system'
    );

    if (regularMessages.length <= this.config.windowSize) {
      return 0; // Nothing to compact
    }

    const oldMessages = regularMessages.slice(0, -this.config.windowSize);

    // Estimate that (1 - threshold) of old messages will be removed
    const estimatedRemovalRate = 1 - this.config.importanceThreshold;
    const estimatedRemovedCount = Math.floor(oldMessages.length * estimatedRemovalRate);

    if (estimatedRemovedCount === 0) {
      return 0;
    }

    // Estimate tokens per message
    const avgTokensPerMessage = currentTokens / messages.length;
    return Math.floor(estimatedRemovedCount * avgTokensPerMessage);
  }

  /**
   * Score messages using LLM
   */
  private async scoreMessagesWithLlm(
    messages: Message[],
    context: CompactionContext
  ): Promise<MessageWithScore[]> {
    if (!context.llmClient || messages.length === 0) {
      return this.scoreMessagesWithHeuristics(messages);
    }

    // Batch messages into groups of 10 for efficient scoring
    const batchSize = 10;
    const batches: Message[][] = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }

    const scoredMessages: MessageWithScore[] = [];

    for (const batch of batches) {
      try {
        const scores = await this.scoreBatchWithLlm(batch, context);
        for (let i = 0; i < batch.length; i++) {
          scoredMessages.push({
            message: batch[i],
            score: scores[i] ?? 0.5,
          });
        }
      } catch (error) {
        console.warn('Failed to score batch with LLM, falling back to heuristics:', error);
        const heuristicScores = this.scoreMessagesWithHeuristics(batch);
        scoredMessages.push(...heuristicScores);
      }
    }

    return scoredMessages;
  }

  /**
   * Score a batch of messages using LLM
   */
  private async scoreBatchWithLlm(
    messages: Message[],
    context: CompactionContext
  ): Promise<number[]> {
    const messageSummaries = messages.map((msg, idx) => {
      const preview = msg.content.substring(0, 300);
      return `[${idx + 1}] ${msg.role}: ${preview}${msg.content.length > 300 ? '...' : ''}`;
    }).join('\n\n');

    const prompt = `You are analyzing older messages in a conversation to determine which should be preserved.
These are messages OUTSIDE the recent context window, so only truly important ones should be kept.

Score each message from 0.0 to 1.0:
- 1.0: Critical (decisions, conclusions, key discoveries, essential facts)
- 0.8: Very important (significant insights, important context)
- 0.6: Moderately important (useful details, clarifications)
- 0.4: Low importance (tangential, routine exchanges)
- 0.2: Minimal value (simple acknowledgments)
- 0.0: No value (filler, redundant)

Messages to score:
${messageSummaries}

Respond with ONLY a JSON array of scores. Example: [0.8, 0.3, 0.9]`;

    const response = await context.llmClient.chat(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { temperature: 0.1, maxTokens: 200 }
    );

    try {
      const scores = JSON.parse(response.trim());
      if (Array.isArray(scores) && scores.length === messages.length) {
        return scores.map(s => Math.max(0, Math.min(1, Number(s) || 0.5)));
      }
    } catch {
      console.warn('Failed to parse LLM scoring response');
    }

    return messages.map(() => 0.5);
  }

  /**
   * Score messages using simple heuristics (no LLM)
   */
  private scoreMessagesWithHeuristics(messages: Message[]): MessageWithScore[] {
    return messages.map(message => {
      let score = 0.5;

      const length = message.content.length;
      if (length > 500) score += 0.2;
      else if (length > 200) score += 0.1;
      else if (length < 50) score -= 0.2;

      if (message.role === 'assistant') score += 0.1;

      const content = message.content.toLowerCase();

      // High importance indicators
      if (content.includes('important') || content.includes('critical')) score += 0.2;
      if (content.includes('decision') || content.includes('conclude')) score += 0.2;
      if (content.includes('summary') || content.includes('in summary')) score += 0.15;
      if (message.content.includes('```')) score += 0.15;

      // Low importance indicators
      if (content.includes('?') && message.role === 'user') score -= 0.1;
      if (content.match(/^(ok|okay|yes|no|thanks|thank you)[\.\!]?$/i)) score -= 0.3;

      return {
        message,
        score: Math.max(0, Math.min(1, score)),
      };
    });
  }
}
