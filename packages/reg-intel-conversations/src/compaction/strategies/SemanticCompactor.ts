/**
 * Semantic Compaction Strategy
 *
 * Uses LLM to score message importance and keeps messages above threshold.
 *
 * Algorithm:
 * 1. Always preserve pinned and system messages
 * 2. Score unpinned messages using LLM (0-1 importance scale)
 * 3. Keep messages above importance threshold
 * 4. Ensure minimum message count is maintained
 * 5. Sort by timestamp to maintain chronological order
 *
 * Use cases:
 * - Research/exploration conversations
 * - Preserving important insights
 * - Context-aware compression
 * - Long conversations with mixed importance
 */

import type { ConversationMessage as Message } from '../../conversationStores.js';
import type {
  CompactionContext,
  CompactionResult,
  MessageCompactor,
  SemanticConfig,
} from '../types.js';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';

interface MessageWithScore {
  message: Message;
  score: number;
}

export class SemanticCompactor implements MessageCompactor {
  private config: SemanticConfig;

  constructor(config?: Partial<SemanticConfig>) {
    this.config = {
      importanceThreshold: config?.importanceThreshold ?? 0.6,
      minMessages: config?.minMessages ?? 10,
      useLlm: config?.useLlm ?? true,
      model: config?.model ?? 'gpt-4o-mini', // Use cheaper model for scoring
    };
  }

  getStrategy(): string {
    return 'semantic';
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    const startTime = Date.now();
    const { messages, pinnedMessageIds, currentTokens } = context;

    // Separate pinned/system messages from regular messages
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

    // If we don't have an LLM client or useLlm is false, fall back to simple heuristics
    let scoredMessages: MessageWithScore[];
    let usedLlm = false;

    if (this.config.useLlm && context.llmClient) {
      scoredMessages = await this.scoreMessagesWithLlm(regularMessages, context);
      usedLlm = true;
    } else {
      scoredMessages = this.scoreMessagesWithHeuristics(regularMessages);
      usedLlm = false;
    }

    // Sort by score descending, then filter by threshold
    scoredMessages.sort((a, b) => b.score - a.score);

    // Keep messages above threshold or until we reach minimum count
    const keptMessages: Message[] = [];
    for (let i = 0; i < scoredMessages.length; i++) {
      const { message, score } = scoredMessages[i];

      // Always keep if above threshold OR we're below minimum message count
      if (score >= this.config.importanceThreshold || keptMessages.length < this.config.minMessages) {
        keptMessages.push(message);
      }
    }

    // Combine all messages: system + pinned + important regular
    const compactedMessages: Message[] = [
      ...systemMessages,
      ...pinnedMessages,
      ...keptMessages,
    ];

    // Sort by timestamp to maintain chronological order
    compactedMessages.sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    // Count tokens in compacted messages
    const tokensAfter = await countTokensForMessages(compactedMessages, context.model ?? 'gpt-4');

    const messagesRemoved = messages.length - compactedMessages.length;

    return {
      messages: compactedMessages,
      tokensBefore: currentTokens,
      tokensAfter,
      messagesRemoved,
      messagesSummarized: 0, // Semantic doesn't summarize, it filters
      pinnedPreserved: pinnedMessages.length,
      strategy: this.getStrategy(),
      success: true,
      metadata: {
        durationMs: Date.now() - startTime,
        usedLlm,
        importanceThreshold: this.config.importanceThreshold,
        minMessages: this.config.minMessages,
        avgImportanceScore: scoredMessages.length > 0
          ? scoredMessages.reduce((sum, s) => sum + s.score, 0) / scoredMessages.length
          : 0,
      },
    };
  }

  async estimateSavings(context: CompactionContext): Promise<number> {
    const { messages, pinnedMessageIds } = context;

    // Estimate that we'll remove messages below threshold
    // Rough estimate: ~40% of messages are low importance
    const regularMessages = messages.filter(
      msg => !pinnedMessageIds.has(msg.id) && msg.role !== 'system'
    );

    const estimatedRemovalRate = 1 - this.config.importanceThreshold; // e.g., 0.4 for threshold 0.6
    const estimatedRemovedCount = Math.floor(regularMessages.length * estimatedRemovalRate);

    if (estimatedRemovedCount === 0) {
      return 0;
    }

    // Estimate tokens in removed messages (assume average message size)
    const avgTokensPerMessage = context.currentTokens / messages.length;
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
            score: scores[i] ?? 0.5, // Default to medium importance if scoring fails
          });
        }
      } catch (error) {
        console.warn('Failed to score batch with LLM, falling back to heuristics:', error);
        // Fall back to heuristics for this batch
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
    // Build prompt for importance scoring
    const messageSummaries = messages.map((msg, idx) => {
      const preview = msg.content.substring(0, 300);
      return `[${idx + 1}] ${msg.role}: ${preview}${msg.content.length > 300 ? '...' : ''}`;
    }).join('\n\n');

    const prompt = `You are analyzing messages in a conversation to determine which are most important to preserve when compressing the conversation history.

Score each message from 0.0 to 1.0 based on importance:
- 1.0: Critical information (decisions, conclusions, key facts, breakthroughs)
- 0.8: Important context (significant details, important questions)
- 0.6: Useful information (relevant examples, clarifications)
- 0.4: Minor details (tangential information, routine confirmations)
- 0.2: Low value (simple acknowledgments, minor clarifications)
- 0.0: No value (pure filler, off-topic)

Messages to score:
${messageSummaries}

Respond with ONLY a JSON array of scores, one number per message, in order. Example: [0.8, 0.3, 0.9, 0.5]`;

    const response = await context.llmClient.chat(
      [{ role: 'user', content: prompt }],
      this.config.model,
      { temperature: 0.1, maxTokens: 200 }
    );

    // Parse JSON response
    try {
      const scores = JSON.parse(response.trim());
      if (Array.isArray(scores) && scores.length === messages.length) {
        return scores.map(s => Math.max(0, Math.min(1, Number(s) || 0.5)));
      }
    } catch (error) {
      console.warn('Failed to parse LLM scoring response:', error);
    }

    // If parsing fails, return default scores
    return messages.map(() => 0.5);
  }

  /**
   * Score messages using simple heuristics (no LLM)
   */
  private scoreMessagesWithHeuristics(messages: Message[]): MessageWithScore[] {
    return messages.map(message => {
      let score = 0.5; // Base score

      // Longer messages tend to be more important
      const length = message.content.length;
      if (length > 500) score += 0.2;
      else if (length > 200) score += 0.1;
      else if (length < 50) score -= 0.2;

      // Assistant messages tend to be more important than user questions
      if (message.role === 'assistant') score += 0.1;

      // Check for importance indicators in content
      const content = message.content.toLowerCase();

      // High importance indicators
      if (content.includes('important') || content.includes('critical')) score += 0.2;
      if (content.includes('decision') || content.includes('conclude')) score += 0.2;
      if (content.includes('summary') || content.includes('in summary')) score += 0.15;

      // Code blocks suggest important technical content
      if (message.content.includes('```')) score += 0.15;

      // Questions tend to be less important than answers
      if (content.includes('?') && message.role === 'user') score -= 0.1;

      // Low importance indicators
      if (content.match(/^(ok|okay|yes|no|thanks|thank you)[\.\!]?$/i)) score -= 0.3;

      // Clamp to 0-1 range
      return {
        message,
        score: Math.max(0, Math.min(1, score)),
      };
    });
  }
}
