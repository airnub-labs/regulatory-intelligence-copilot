/**
 * Aggressive Merge Compaction Strategy
 *
 * Maximum compression strategy for merging conversation branches.
 * Prioritizes space efficiency over preserving original messages.
 *
 * Algorithm:
 * 1. Aggressive deduplication (lower similarity threshold)
 * 2. Merge all consecutive same-role messages
 * 3. Remove redundant exchanges entirely (no summarization fallback)
 * 4. Summarize remaining content to minimum viable context
 * 5. Only preserve pinned messages and critical decisions
 * 6. Limit total message count to configurable maximum
 *
 * Use cases:
 * - Large branch merges where context is getting too long
 * - Recovery from runaway token usage
 * - Archival/cleanup of old conversations
 * - Maximum compression for long-running sessions
 */

import type { ConversationMessage as Message } from '../../conversationStores.js';
import type {
  CompactionContext,
  CompactionResult,
  MessageCompactor,
  MergeCompactionConfig,
} from '../types.js';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';

interface AggressiveConfig extends Required<MergeCompactionConfig> {
  /** Maximum messages to keep after compaction (default: 20) */
  maxMessages: number;
  /** Similarity threshold for deduplication (default: 0.4, more aggressive) */
  similarityThreshold: number;
  /** Minimum exchanges before summarization (default: 2) */
  minExchangesForSummary: number;
  /** Target token count (default: 4000) */
  targetTokens: number;
}

export class AggressiveMergeCompactor implements MessageCompactor {
  private config: AggressiveConfig;

  constructor(config?: Partial<AggressiveConfig>) {
    this.config = {
      strategy: 'aggressive',
      deduplicate: config?.deduplicate ?? true,
      mergeConsecutive: config?.mergeConsecutive ?? true,
      useLlm: config?.useLlm ?? true,
      model: config?.model ?? 'gpt-4o-mini',
      maxMessages: config?.maxMessages ?? 20,
      similarityThreshold: config?.similarityThreshold ?? 0.4,
      minExchangesForSummary: config?.minExchangesForSummary ?? 2,
      targetTokens: config?.targetTokens ?? 4000,
    };
  }

  getStrategy(): string {
    return 'aggressive';
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    const startTime = Date.now();
    const { messages, pinnedMessageIds, currentTokens } = context;

    let processedMessages = [...messages];
    let summaryMessages: Message[] = [];
    let messagesSummarized = 0;
    let usedLlm = false;

    // Step 1: Separate pinned and system messages
    const pinnedMessages = processedMessages.filter(m => pinnedMessageIds.has(m.id));
    const systemMessages = processedMessages.filter(m => m.role === 'system' && !pinnedMessageIds.has(m.id));
    let regularMessages = processedMessages.filter(
      m => !pinnedMessageIds.has(m.id) && m.role !== 'system'
    );

    // Step 2: Aggressive deduplication with lower similarity threshold
    if (this.config.deduplicate) {
      regularMessages = this.aggressiveDeduplication(regularMessages);
    }

    // Step 3: Merge all consecutive same-role messages
    if (this.config.mergeConsecutive) {
      regularMessages = this.mergeAllConsecutive(regularMessages);
    }

    // Step 4: Remove similar messages (soft duplicates)
    regularMessages = this.removeSimilarMessages(regularMessages);

    // Step 5: If we have LLM and too many messages, create a comprehensive summary
    const currentMessageCount = regularMessages.length + pinnedMessages.length + systemMessages.length;
    if (this.config.useLlm && context.llmClient && currentMessageCount > this.config.maxMessages) {
      try {
        // Split into older (to summarize) and recent (to keep)
        const recentCount = Math.floor(this.config.maxMessages * 0.6);
        const olderMessages = regularMessages.slice(0, -recentCount);
        const recentMessages = regularMessages.slice(-recentCount);

        if (olderMessages.length >= this.config.minExchangesForSummary * 2) {
          const summary = await this.createComprehensiveSummary(olderMessages, context);
          if (summary) {
            regularMessages = [summary, ...recentMessages];
            summaryMessages.push(summary);
            messagesSummarized = olderMessages.length;
            usedLlm = true;
          }
        }
      } catch (error) {
        console.warn('[AggressiveMerge] Failed to create summary:', error);
        // Fall back to simple truncation
        regularMessages = regularMessages.slice(-this.config.maxMessages);
      }
    }

    // Step 6: Enforce maximum message count
    if (regularMessages.length > this.config.maxMessages) {
      const excess = regularMessages.length - this.config.maxMessages;
      regularMessages = regularMessages.slice(excess);
    }

    // Combine all messages back together
    processedMessages = [
      ...systemMessages,
      ...pinnedMessages,
      ...regularMessages,
    ];

    // Sort by timestamp
    processedMessages.sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    // Count tokens after compaction
    const tokensAfter = await countTokensForMessages(processedMessages, context.model ?? 'gpt-4');
    const messagesRemoved = messages.length - processedMessages.length;

    return {
      messages: processedMessages,
      tokensBefore: currentTokens,
      tokensAfter,
      messagesRemoved,
      messagesSummarized,
      pinnedPreserved: processedMessages.filter(m => pinnedMessageIds.has(m.id)).length,
      strategy: this.getStrategy(),
      success: true,
      summaryMessages,
      metadata: {
        durationMs: Date.now() - startTime,
        usedLlm,
        deduplicationEnabled: this.config.deduplicate,
        mergeConsecutiveEnabled: this.config.mergeConsecutive,
        maxMessages: this.config.maxMessages,
        targetTokens: this.config.targetTokens,
        aggressiveMode: true,
      },
    };
  }

  async estimateSavings(context: CompactionContext): Promise<number> {
    const { currentTokens } = context;

    // Aggressive merge typically saves 50-70% of tokens
    const estimatedSavingsRatio = 0.60;
    return Math.floor(currentTokens * estimatedSavingsRatio);
  }

  /**
   * Aggressive deduplication with content normalization
   */
  private aggressiveDeduplication(messages: Message[]): Message[] {
    const seen = new Map<string, Message>();
    const deduplicated: Message[] = [];

    for (const msg of messages) {
      // Normalize content: lowercase, remove extra whitespace, remove punctuation
      const normalizedContent = msg.content
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim()
        .substring(0, 200); // Compare first 200 chars

      const key = `${msg.role}:${normalizedContent}`;

      if (!seen.has(key)) {
        seen.set(key, msg);
        deduplicated.push(msg);
      }
    }

    return deduplicated;
  }

  /**
   * Merge all consecutive messages from same role
   */
  private mergeAllConsecutive(messages: Message[]): Message[] {
    if (messages.length <= 1) return messages;

    const merged: Message[] = [];
    let currentGroup: Message[] = [messages[0]];

    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === currentGroup[0].role) {
        currentGroup.push(msg);
      } else {
        merged.push(this.mergeGroup(currentGroup));
        currentGroup = [msg];
      }
    }

    // Flush final group
    merged.push(this.mergeGroup(currentGroup));

    return merged;
  }

  /**
   * Merge a group of messages into one
   */
  private mergeGroup(messages: Message[]): Message {
    if (messages.length === 1) return messages[0];

    // For aggressive merge, use minimal separator
    const combinedContent = messages.map(m => m.content).join('\n\n');

    return {
      ...messages[0],
      id: `aggressive-merge-${messages[0].id}`,
      content: combinedContent,
      createdAt: messages[0].createdAt,
      metadata: {
        ...messages[0].metadata,
        aggressiveMergedFrom: messages.map(m => m.id),
        aggressiveMergedCount: messages.length,
      },
    };
  }

  /**
   * Remove messages that are too similar to others
   */
  private removeSimilarMessages(messages: Message[]): Message[] {
    if (messages.length <= 2) return messages;

    const filtered: Message[] = [messages[0]];

    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const isTooSimilar = filtered.some(existing =>
        this.calculateSimilarity(current.content, existing.content) > this.config.similarityThreshold
      );

      if (!isTooSimilar) {
        filtered.push(current);
      }
    }

    return filtered;
  }

  /**
   * Calculate text similarity using Jaccard index
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Create a comprehensive summary of older messages
   */
  private async createComprehensiveSummary(
    messages: Message[],
    context: CompactionContext
  ): Promise<Message | null> {
    if (!context.llmClient) return null;

    const conversation = messages.map((msg, idx) =>
      `[${idx + 1}/${messages.length}] ${msg.role.toUpperCase()}: ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`
    ).join('\n\n');

    const prompt = `You are performing aggressive conversation compaction to reduce context length.

The following ${messages.length} messages represent the older portion of a conversation that needs to be condensed into a brief summary:

${conversation}

Create a CONCISE summary (maximum 3-4 sentences) capturing ONLY:
1. The main topic(s) discussed
2. Key decisions or conclusions reached
3. Any important information needed for future context

Be extremely concise. Omit conversational niceties, repeated information, and details that aren't critical for understanding the current state of the conversation.`;

    try {
      const summaryText = await context.llmClient.chat(
        [{ role: 'user', content: prompt }],
        this.config.model,
        { temperature: 0.2, maxTokens: 300 }
      );

      return {
        id: `aggressive-summary-${Date.now()}`,
        role: 'system',
        content: `[Conversation History Summary - ${messages.length} messages condensed]\n\n${summaryText}`,
        createdAt: messages[0].createdAt,
        metadata: {
          summarizedMessageIds: messages.map(m => m.id),
          summarizedCount: messages.length,
          compactionType: 'aggressive',
        },
      };
    } catch (error) {
      console.error('[AggressiveMerge] Failed to create summary:', error);
      return null;
    }
  }
}
