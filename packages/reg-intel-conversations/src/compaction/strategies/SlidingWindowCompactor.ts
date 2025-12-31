/**
 * Sliding Window Compaction Strategy
 *
 * Keeps recent N messages + all pinned messages.
 * Optionally summarizes older messages.
 *
 * Algorithm:
 * 1. Partition messages into pinned and unpinned
 * 2. Take last N unpinned messages (the "window")
 * 3. Optionally summarize old unpinned messages (outside window)
 * 4. Combine: pinned + (optional summary) + recent unpinned
 * 5. Validate pinned preservation
 *
 * Use cases:
 * - Standard conversations (50-200 messages)
 * - Balancing context retention with token limits
 * - Keeping recent context fresh
 */

import type { ConversationMessage as Message } from '../../conversationStores.js';
import type {
  CompactionContext,
  CompactionResult,
  MessageCompactor,
  SlidingWindowConfig,
} from '../types.js';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';

export class SlidingWindowCompactor implements MessageCompactor {
  private config: SlidingWindowConfig;

  constructor(config?: Partial<SlidingWindowConfig>) {
    this.config = {
      windowSize: config?.windowSize ?? 50,
      summarizeOld: config?.summarizeOld ?? false,
      keepSystemMessages: config?.keepSystemMessages ?? true,
    };
  }

  getStrategy(): string {
    return 'sliding_window';
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    const startTime = Date.now();
    const { messages, pinnedMessageIds, currentTokens, model } = context;

    // Partition messages into pinned, system, and regular
    const pinnedMessages: Message[] = [];
    const systemMessages: Message[] = [];
    const regularMessages: Message[] = [];

    for (const msg of messages) {
      if (pinnedMessageIds.has(msg.id)) {
        pinnedMessages.push(msg);
      } else if (this.config.keepSystemMessages && msg.role === 'system') {
        systemMessages.push(msg);
      } else {
        regularMessages.push(msg);
      }
    }

    // Take last N regular messages (the sliding window)
    const windowMessages = regularMessages.slice(-this.config.windowSize);
    const oldMessages = regularMessages.slice(0, -this.config.windowSize);

    // Build final message list
    const compactedMessages: Message[] = [];
    const summaryMessages: Message[] = [];

    // Add system messages first
    compactedMessages.push(...systemMessages);

    // Add pinned messages (in original order)
    compactedMessages.push(...pinnedMessages);

    // Optionally add summary of old messages
    if (this.config.summarizeOld && oldMessages.length > 0 && context.llmClient) {
      try {
        const summary = await this.summarizeMessages(oldMessages, context);
        if (summary) {
          summaryMessages.push(summary);
          compactedMessages.push(summary);
        }
      } catch (error) {
        // If summarization fails, just skip the old messages
        console.warn('Failed to summarize old messages:', error);
      }
    }

    // Add recent messages in window
    compactedMessages.push(...windowMessages);

    // Sort by timestamp to maintain chronological order
    compactedMessages.sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    // Count tokens in compacted messages
    const tokensAfter = await countTokensForMessages(compactedMessages, model ?? 'gpt-4');

    return {
      messages: compactedMessages,
      tokensBefore: currentTokens,
      tokensAfter,
      messagesRemoved: messages.length - compactedMessages.length + (summaryMessages.length > 0 ? oldMessages.length : 0),
      messagesSummarized: summaryMessages.length > 0 ? oldMessages.length : 0,
      pinnedPreserved: pinnedMessages.length,
      strategy: this.getStrategy(),
      success: true,
      summaryMessages,
      metadata: {
        durationMs: Date.now() - startTime,
        usedLlm: this.config.summarizeOld && summaryMessages.length > 0,
        windowSize: this.config.windowSize,
        oldMessagesCount: oldMessages.length,
        windowMessagesCount: windowMessages.length,
      },
    };
  }

  async estimateSavings(context: CompactionContext): Promise<number> {
    const { messages, pinnedMessageIds } = context;

    // Count messages that would be removed
    const regularMessages = messages.filter(msg => !pinnedMessageIds.has(msg.id));
    const oldMessages = regularMessages.slice(0, -this.config.windowSize);

    if (oldMessages.length === 0) {
      return 0;
    }

    // Estimate tokens in old messages
    const oldTokens = await countTokensForMessages(oldMessages, context.model ?? 'gpt-4');

    // If summarizing, estimate summary would be ~10% of original
    if (this.config.summarizeOld) {
      return Math.floor(oldTokens * 0.9);
    }

    // Otherwise, all old message tokens are saved
    return oldTokens;
  }

  private async summarizeMessages(messages: Message[], context: CompactionContext): Promise<Message | null> {
    if (!context.llmClient) {
      return null;
    }

    // Build prompt for summarization
    const messageSummary = messages
      .map((msg, idx) => `[${idx + 1}] ${msg.role}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`)
      .join('\n');

    const prompt = `You are summarizing older messages in a conversation to save context space.

The following ${messages.length} messages occurred earlier in the conversation:

${messageSummary}

Create a concise summary (2-3 paragraphs) that captures:
1. Key decisions or conclusions reached
2. Important facts or information discovered
3. Any open questions or action items

Keep the summary factual and objective. Aim for maximum information density.`;

    try {
      const summaryText = await context.llmClient.chat(
        [{ role: 'user', content: prompt }],
        context.model ?? 'gpt-4o-mini', // Use cheaper model for summarization
        { temperature: 0.3, maxTokens: 500 }
      );

      // Create a system message with the summary
      const summaryMessage: Message = {
        id: `summary-${Date.now()}`,
        role: 'system',
        content: `[Context Summary: Previous ${messages.length} messages summarized]\n\n${summaryText}`,
        createdAt: new Date(),
      };

      return summaryMessage;
    } catch (error) {
      console.error('Failed to create summary:', error);
      return null;
    }
  }
}
