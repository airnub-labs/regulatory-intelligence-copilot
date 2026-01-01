/**
 * Moderate Merge Compaction Strategy
 *
 * Used when merging conversation branches to intelligently combine messages.
 *
 * Algorithm:
 * 1. Deduplicate identical messages across branches
 * 2. Merge consecutive messages from the same role
 * 3. Identify redundant exchanges (similar Q&A patterns)
 * 4. Summarize redundant exchanges using LLM
 * 5. Preserve pinned messages and key decisions
 * 6. Sort by timestamp to maintain chronological order
 *
 * Use cases:
 * - Branch merge operations
 * - Combining parallel conversation paths
 * - Deduplicating shared history
 * - Standard merge compression needs
 */

import type { ConversationMessage as Message } from '../../conversationStores.js';
import type {
  CompactionContext,
  CompactionResult,
  MessageCompactor,
  MergeCompactionConfig,
} from '../types.js';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';

interface MessageGroup {
  messages: Message[];
  startTime: Date;
  endTime: Date;
  isRedundant: boolean;
}

export class ModerateMergeCompactor implements MessageCompactor {
  private config: Required<MergeCompactionConfig>;

  constructor(config?: Partial<MergeCompactionConfig>) {
    this.config = {
      strategy: 'moderate',
      deduplicate: config?.deduplicate ?? true,
      mergeConsecutive: config?.mergeConsecutive ?? true,
      useLlm: config?.useLlm ?? true,
      model: config?.model ?? 'gpt-4o-mini',
    };
  }

  getStrategy(): string {
    return 'moderate';
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    const startTime = Date.now();
    const { messages, pinnedMessageIds, currentTokens } = context;

    let processedMessages = [...messages];
    let summaryMessages: Message[] = [];
    let messagesSummarized = 0;
    let usedLlm = false;

    // Step 1: Deduplicate identical messages
    if (this.config.deduplicate) {
      processedMessages = this.deduplicateMessages(processedMessages, pinnedMessageIds);
    }

    // Step 2: Merge consecutive messages from same role
    if (this.config.mergeConsecutive) {
      processedMessages = this.mergeConsecutiveMessages(processedMessages, pinnedMessageIds);
    }

    // Step 3: Identify and summarize redundant exchanges (if LLM available)
    if (this.config.useLlm && context.llmClient) {
      const redundantGroups = this.identifyRedundantGroups(processedMessages, pinnedMessageIds);

      for (const group of redundantGroups) {
        if (group.isRedundant && group.messages.length >= 4) {
          try {
            const summary = await this.summarizeExchange(group.messages, context);
            if (summary) {
              // Replace redundant messages with summary
              processedMessages = processedMessages.filter(
                msg => !group.messages.some(gm => gm.id === msg.id)
              );
              processedMessages.push(summary);
              summaryMessages.push(summary);
              messagesSummarized += group.messages.length;
              usedLlm = true;
            }
          } catch (error) {
            console.warn('Failed to summarize redundant group:', error);
            // Keep original messages if summarization fails
          }
        }
      }
    }

    // Sort by timestamp to maintain chronological order
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
      },
    };
  }

  async estimateSavings(context: CompactionContext): Promise<number> {
    const { messages, currentTokens } = context;

    // Rough estimate: moderate merge typically saves 30-50% of tokens
    // Deduplication: ~10%
    // Consecutive merging: ~15%
    // Redundant exchange summarization: ~20%
    const estimatedSavingsRatio = 0.35;

    return Math.floor(currentTokens * estimatedSavingsRatio);
  }

  /**
   * Remove duplicate messages (same content, role, and timestamp within 1 second)
   */
  private deduplicateMessages(messages: Message[], pinnedIds: Set<string>): Message[] {
    const seen = new Map<string, Message>();
    const deduplicated: Message[] = [];

    for (const msg of messages) {
      // Always keep pinned messages
      if (pinnedIds.has(msg.id)) {
        deduplicated.push(msg);
        continue;
      }

      // Create dedup key from content + role + approximate timestamp
      const timestamp = msg.createdAt instanceof Date ? msg.createdAt.getTime() : new Date(msg.createdAt).getTime();
      const roundedTimestamp = Math.floor(timestamp / 1000); // Round to nearest second
      const key = `${msg.role}:${roundedTimestamp}:${msg.content.substring(0, 100)}`;

      if (!seen.has(key)) {
        seen.set(key, msg);
        deduplicated.push(msg);
      }
      // else: skip duplicate
    }

    return deduplicated;
  }

  /**
   * Merge consecutive messages from the same role into single messages
   */
  private mergeConsecutiveMessages(messages: Message[], pinnedIds: Set<string>): Message[] {
    const merged: Message[] = [];
    let currentGroup: Message[] = [];
    let currentRole: string | null = null;

    for (const msg of messages) {
      // Always keep pinned messages separate
      if (pinnedIds.has(msg.id)) {
        // Flush current group
        if (currentGroup.length > 0) {
          merged.push(this.mergeSingleGroup(currentGroup));
          currentGroup = [];
          currentRole = null;
        }
        merged.push(msg);
        continue;
      }

      // Start new group or continue current
      if (msg.role === currentRole) {
        currentGroup.push(msg);
      } else {
        // Flush previous group
        if (currentGroup.length > 0) {
          merged.push(this.mergeSingleGroup(currentGroup));
        }
        currentGroup = [msg];
        currentRole = msg.role;
      }
    }

    // Flush final group
    if (currentGroup.length > 0) {
      merged.push(this.mergeSingleGroup(currentGroup));
    }

    return merged;
  }

  /**
   * Merge a group of consecutive messages into one
   */
  private mergeSingleGroup(messages: Message[]): Message {
    if (messages.length === 1) {
      return messages[0];
    }

    // Combine content with separators
    const combinedContent = messages.map(m => m.content).join('\n\n---\n\n');

    return {
      ...messages[0],
      id: `merged-${messages[0].id}-${messages[messages.length - 1].id}`,
      content: combinedContent,
      createdAt: messages[0].createdAt,
      metadata: {
        ...messages[0].metadata,
        mergedFrom: messages.map(m => m.id),
        mergedCount: messages.length,
      },
    };
  }

  /**
   * Identify groups of messages that are redundant (repeated Q&A patterns)
   */
  private identifyRedundantGroups(messages: Message[], pinnedIds: Set<string>): MessageGroup[] {
    const groups: MessageGroup[] = [];
    const unpinnedMessages = messages.filter(m => !pinnedIds.has(m.id));

    // Look for groups of 4+ messages that might be redundant
    for (let i = 0; i < unpinnedMessages.length - 3; i++) {
      const group = unpinnedMessages.slice(i, i + 6); // Look at groups of 4-6 messages

      // Check if this looks like a redundant exchange
      const isRedundant = this.isRedundantExchange(group);

      if (isRedundant) {
        const startTime = group[0].createdAt instanceof Date
          ? group[0].createdAt
          : new Date(group[0].createdAt);
        const endTime = group[group.length - 1].createdAt instanceof Date
          ? group[group.length - 1].createdAt
          : new Date(group[group.length - 1].createdAt);

        groups.push({
          messages: group,
          startTime,
          endTime,
          isRedundant: true,
        });

        // Skip ahead to avoid overlapping groups
        i += group.length - 1;
      }
    }

    return groups;
  }

  /**
   * Heuristic check for redundant exchanges
   */
  private isRedundantExchange(messages: Message[]): boolean {
    if (messages.length < 4) return false;

    // Look for repeated patterns:
    // - Multiple clarification questions
    // - Multiple similar responses
    // - Back-and-forth without progress

    const contents = messages.map(m => m.content.toLowerCase());

    // Check for repeated keywords suggesting clarification loops
    const clarificationWords = ['what', 'clarify', 'mean', 'explain', 'understand', 'confused'];
    const clarificationCount = contents.filter(c =>
      clarificationWords.some(word => c.includes(word))
    ).length;

    if (clarificationCount >= messages.length / 2) {
      return true;
    }

    // Check for very similar message content (potential duplicates)
    for (let i = 0; i < messages.length - 1; i++) {
      for (let j = i + 1; j < messages.length; j++) {
        const similarity = this.calculateSimilarity(contents[i], contents[j]);
        if (similarity > 0.7) {
          return true; // High similarity suggests redundancy
        }
      }
    }

    return false;
  }

  /**
   * Calculate text similarity (0-1) using simple word overlap
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Summarize a redundant exchange using LLM
   */
  private async summarizeExchange(messages: Message[], context: CompactionContext): Promise<Message | null> {
    if (!context.llmClient) {
      return null;
    }

    const conversation = messages.map((msg, idx) =>
      `[${idx + 1}] ${msg.role}: ${msg.content}`
    ).join('\n\n');

    const prompt = `You are summarizing a redundant exchange in a conversation to save space while preserving key information.

The following ${messages.length} messages contain redundant back-and-forth:

${conversation}

Create a concise summary (1-2 paragraphs) that captures:
1. What question or issue was being discussed
2. What conclusion or answer was reached
3. Any important details mentioned

Focus on outcomes rather than the discussion process. Be factual and concise.`;

    try {
      const summaryText = await context.llmClient.chat(
        [{ role: 'user', content: prompt }],
        this.config.model,
        { temperature: 0.3, maxTokens: 400 }
      );

      return {
        id: `merge-summary-${Date.now()}`,
        role: 'system',
        content: `[Merge Summary: ${messages.length} redundant messages summarized]\n\n${summaryText}`,
        createdAt: messages[0].createdAt,
        metadata: {
          summarizedMessageIds: messages.map(m => m.id),
          summarizedCount: messages.length,
        },
      };
    } catch (error) {
      console.error('Failed to create merge summary:', error);
      return null;
    }
  }
}
