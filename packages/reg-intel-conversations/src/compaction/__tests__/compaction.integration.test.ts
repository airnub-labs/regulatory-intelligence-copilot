/**
 * Compaction Integration Tests
 *
 * Comprehensive tests for the conversation compaction system including:
 * - Path compaction strategies (sliding window, semantic, hybrid)
 * - Merge compaction strategies (minimal, moderate)
 * - Utility functions (deduplication, hashing, merging)
 * - Factory functions
 * - Pinned message preservation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ConversationMessage as Message } from '../../conversationStores.js';
import type { CompactionContext, CompactionResult } from '../types.js';

// Strategies
import { NoneCompactor } from '../strategies/NoneCompactor.js';
import { SlidingWindowCompactor } from '../strategies/SlidingWindowCompactor.js';
import { SemanticCompactor } from '../strategies/SemanticCompactor.js';
import { HybridCompactor } from '../strategies/HybridCompactor.js';
import { ModerateMergeCompactor } from '../strategies/ModerateMergeCompactor.js';

// Factory
import { getPathCompactor, getMergeCompactor } from '../compactionFactory.js';

// Utilities
import {
  hashMessage,
  shortHash,
  deduplicateMessages,
  findDuplicates,
  mergeMessageLists,
  sortMessagesByTimestamp,
  calculateReduction,
  calculateCompressionRatio,
  groupConsecutiveByRole,
  mergeConsecutiveSameRole,
  partitionMessages,
  calculateSimilarity,
  findSimilarMessages,
  estimateTokensQuick,
  estimateTotalTokensQuick,
} from '../utils.js';

// Test Helpers
function createMessage(
  id: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  timestamp?: Date
): Message {
  return {
    id,
    role,
    content,
    createdAt: timestamp ?? new Date(),
  };
}

function createMessageSequence(count: number, startDate = new Date()): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    const timestamp = new Date(startDate.getTime() + i * 60000); // 1 minute apart
    messages.push(createMessage(`msg-${i}`, role, `Message ${i} content`, timestamp));
  }
  return messages;
}

function createContext(
  messages: Message[],
  pinnedIds: string[] = [],
  tokens?: number
): CompactionContext {
  return {
    messages,
    pinnedMessageIds: new Set(pinnedIds),
    currentTokens: tokens ?? estimateTotalTokensQuick(messages),
    model: 'gpt-4',
  };
}

describe('Compaction Utilities', () => {
  describe('hashMessage', () => {
    it('should generate consistent hashes for same content', () => {
      const msg1 = createMessage('1', 'user', 'Hello world');
      const msg2 = createMessage('2', 'user', 'Hello world');

      expect(hashMessage(msg1)).toBe(hashMessage(msg2));
    });

    it('should generate different hashes for different content', () => {
      const msg1 = createMessage('1', 'user', 'Hello world');
      const msg2 = createMessage('2', 'user', 'Goodbye world');

      expect(hashMessage(msg1)).not.toBe(hashMessage(msg2));
    });

    it('should include role in hash by default', () => {
      const user = createMessage('1', 'user', 'Hello');
      const assistant = createMessage('2', 'assistant', 'Hello');

      expect(hashMessage(user)).not.toBe(hashMessage(assistant));
    });

    it('should normalize whitespace when configured', () => {
      const msg1 = createMessage('1', 'user', 'Hello   world');
      const msg2 = createMessage('2', 'user', 'Hello world');

      expect(hashMessage(msg1, { normalizeWhitespace: true })).toBe(
        hashMessage(msg2, { normalizeWhitespace: true })
      );
    });

    it('should be case-sensitive by default', () => {
      const msg1 = createMessage('1', 'user', 'Hello');
      const msg2 = createMessage('2', 'user', 'hello');

      expect(hashMessage(msg1)).not.toBe(hashMessage(msg2));
    });

    it('should ignore case when configured', () => {
      const msg1 = createMessage('1', 'user', 'Hello');
      const msg2 = createMessage('2', 'user', 'hello');

      expect(hashMessage(msg1, { caseSensitive: false })).toBe(
        hashMessage(msg2, { caseSensitive: false })
      );
    });
  });

  describe('shortHash', () => {
    it('should return hash of specified length', () => {
      const msg = createMessage('1', 'user', 'Hello');
      const hash = shortHash(msg, 12);

      expect(hash.length).toBe(12);
    });
  });

  describe('deduplicateMessages', () => {
    it('should remove duplicate messages', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi'),
        createMessage('3', 'user', 'Hello'), // Duplicate
      ];

      const result = deduplicateMessages(messages);

      expect(result.unique.length).toBe(2);
      expect(result.removed.length).toBe(1);
      expect(result.removed[0].id).toBe('3');
    });

    it('should keep first occurrence on duplicate', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'user', 'Hello'),
      ];

      const result = deduplicateMessages(messages);

      expect(result.unique[0].id).toBe('1');
    });

    it('should handle empty array', () => {
      const result = deduplicateMessages([]);

      expect(result.unique.length).toBe(0);
      expect(result.removed.length).toBe(0);
    });
  });

  describe('findDuplicates', () => {
    it('should find duplicate pairs', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'user', 'Hello'),
        createMessage('3', 'user', 'Hello'),
      ];

      const duplicates = findDuplicates(messages);

      expect(duplicates.length).toBe(2);
      expect(duplicates[0].original.id).toBe('1');
      expect(duplicates[0].duplicate.id).toBe('2');
    });
  });

  describe('mergeMessageLists', () => {
    it('should merge multiple lists', () => {
      const list1 = [createMessage('1', 'user', 'Hello')];
      const list2 = [createMessage('2', 'assistant', 'Hi')];
      const list3 = [createMessage('3', 'user', 'How are you?')];

      const merged = mergeMessageLists([list1, list2, list3]);

      expect(merged.length).toBe(3);
    });

    it('should deduplicate by default', () => {
      const list1 = [createMessage('1', 'user', 'Hello')];
      const list2 = [createMessage('2', 'user', 'Hello')]; // Duplicate content

      const merged = mergeMessageLists([list1, list2]);

      expect(merged.length).toBe(1);
    });

    it('should not deduplicate when disabled', () => {
      const list1 = [createMessage('1', 'user', 'Hello')];
      const list2 = [createMessage('2', 'user', 'Hello')];

      const merged = mergeMessageLists([list1, list2], { deduplicate: false });

      expect(merged.length).toBe(2);
    });
  });

  describe('sortMessagesByTimestamp', () => {
    it('should sort messages in ascending order by default', () => {
      const now = Date.now();
      const messages = [
        createMessage('2', 'user', 'Second', new Date(now + 1000)),
        createMessage('1', 'user', 'First', new Date(now)),
        createMessage('3', 'user', 'Third', new Date(now + 2000)),
      ];

      const sorted = sortMessagesByTimestamp(messages);

      expect(sorted[0].id).toBe('1');
      expect(sorted[1].id).toBe('2');
      expect(sorted[2].id).toBe('3');
    });

    it('should sort in descending order when specified', () => {
      const now = Date.now();
      const messages = [
        createMessage('2', 'user', 'Second', new Date(now + 1000)),
        createMessage('1', 'user', 'First', new Date(now)),
      ];

      const sorted = sortMessagesByTimestamp(messages, false);

      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('1');
    });
  });

  describe('calculateReduction', () => {
    it('should calculate correct reduction percentage', () => {
      expect(calculateReduction(100, 75)).toBe(25);
      expect(calculateReduction(100, 50)).toBe(50);
      expect(calculateReduction(100, 0)).toBe(100);
    });

    it('should handle zero before value', () => {
      expect(calculateReduction(0, 0)).toBe(0);
    });
  });

  describe('calculateCompressionRatio', () => {
    it('should calculate correct compression ratio', () => {
      expect(calculateCompressionRatio(100, 50)).toBe(0.5);
      expect(calculateCompressionRatio(100, 25)).toBe(0.25);
    });

    it('should handle zero before value', () => {
      expect(calculateCompressionRatio(0, 0)).toBe(1);
    });
  });

  describe('groupConsecutiveByRole', () => {
    it('should group consecutive same-role messages', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'user', 'How are you?'),
        createMessage('3', 'assistant', 'Hi there!'),
        createMessage('4', 'assistant', 'I am fine'),
        createMessage('5', 'user', 'Great'),
      ];

      const groups = groupConsecutiveByRole(messages);

      expect(groups.length).toBe(3);
      expect(groups[0].length).toBe(2); // 2 user messages
      expect(groups[1].length).toBe(2); // 2 assistant messages
      expect(groups[2].length).toBe(1); // 1 user message
    });

    it('should handle empty array', () => {
      const groups = groupConsecutiveByRole([]);
      expect(groups.length).toBe(0);
    });
  });

  describe('mergeConsecutiveSameRole', () => {
    it('should merge consecutive messages from same role', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'user', 'How are you?'),
        createMessage('3', 'assistant', 'Hi there!'),
      ];

      const merged = mergeConsecutiveSameRole(messages);

      expect(merged.length).toBe(2);
      expect(merged[0].content).toBe('Hello\n\nHow are you?');
      expect(merged[1].content).toBe('Hi there!');
    });
  });

  describe('partitionMessages', () => {
    it('should partition messages correctly', () => {
      const messages = [
        createMessage('sys-1', 'system', 'System prompt'),
        createMessage('user-1', 'user', 'Hello'),
        createMessage('pinned-1', 'assistant', 'Important answer'),
        createMessage('user-2', 'user', 'Follow up'),
      ];

      const pinned = new Set(['pinned-1']);
      const result = partitionMessages(messages, pinned);

      expect(result.system.length).toBe(1);
      expect(result.pinned.length).toBe(1);
      expect(result.regular.length).toBe(2);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical messages', () => {
      const msg1 = createMessage('1', 'user', 'Hello world');
      const msg2 = createMessage('2', 'user', 'Hello world');

      expect(calculateSimilarity(msg1, msg2)).toBe(1);
    });

    it('should return 0 for completely different messages', () => {
      const msg1 = createMessage('1', 'user', 'Hello world');
      const msg2 = createMessage('2', 'user', 'Goodbye universe');

      expect(calculateSimilarity(msg1, msg2)).toBe(0);
    });

    it('should return partial similarity for overlapping content', () => {
      const msg1 = createMessage('1', 'user', 'Hello world foo');
      const msg2 = createMessage('2', 'user', 'Hello world bar');

      const similarity = calculateSimilarity(msg1, msg2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('findSimilarMessages', () => {
    it('should find similar messages above threshold', () => {
      const messages = [
        createMessage('1', 'user', 'Hello world foo bar'),
        createMessage('2', 'user', 'Hello world foo baz'),
        createMessage('3', 'user', 'Completely different'),
      ];

      const similar = findSimilarMessages(messages, 0.5);

      expect(similar.length).toBe(1);
      expect(similar[0].a.id).toBe('1');
      expect(similar[0].b.id).toBe('2');
    });
  });

  describe('estimateTokensQuick', () => {
    it('should estimate tokens based on character count', () => {
      const msg = createMessage('1', 'user', 'Hello world'); // 11 chars

      const tokens = estimateTokensQuick(msg);

      expect(tokens).toBe(3); // ceil(11 / 4)
    });
  });
});

describe('Path Compaction Strategies', () => {
  describe('NoneCompactor', () => {
    it('should return messages unchanged', async () => {
      const compactor = new NoneCompactor();
      const messages = createMessageSequence(10);
      const context = createContext(messages);

      const result = await compactor.compact(context);

      expect(result.messages.length).toBe(10);
      expect(result.messagesRemoved).toBe(0);
      expect(result.strategy).toBe('none');
      expect(result.success).toBe(true);
    });
  });

  describe('SlidingWindowCompactor', () => {
    it('should keep only recent messages within window', async () => {
      const compactor = new SlidingWindowCompactor({ windowSize: 5 });
      const messages = createMessageSequence(20);
      const context = createContext(messages);

      const result = await compactor.compact(context);

      expect(result.messages.length).toBe(5);
      expect(result.messagesRemoved).toBe(15);
      expect(result.strategy).toBe('sliding_window');
    });

    it('should preserve pinned messages even outside window', async () => {
      const compactor = new SlidingWindowCompactor({ windowSize: 5 });
      const messages = createMessageSequence(20);
      const pinnedIds = ['msg-0', 'msg-2']; // Pinned messages at start
      const context = createContext(messages, pinnedIds);

      const result = await compactor.compact(context);

      expect(result.pinnedPreserved).toBe(2);
      // Should have window messages + pinned messages
      expect(result.messages.some(m => m.id === 'msg-0')).toBe(true);
      expect(result.messages.some(m => m.id === 'msg-2')).toBe(true);
    });

    it('should preserve system messages by default', async () => {
      const compactor = new SlidingWindowCompactor({
        windowSize: 3,
        keepSystemMessages: true,
      });
      const messages = [
        createMessage('sys-1', 'system', 'You are a helpful assistant'),
        ...createMessageSequence(10),
      ];
      const context = createContext(messages);

      const result = await compactor.compact(context);

      expect(result.messages.some(m => m.role === 'system')).toBe(true);
    });

    it('should estimate savings correctly', async () => {
      const compactor = new SlidingWindowCompactor({ windowSize: 5 });
      const messages = createMessageSequence(20);
      const context = createContext(messages);

      const savings = await compactor.estimateSavings(context);

      expect(savings).toBeGreaterThan(0);
    });
  });

  describe('SemanticCompactor', () => {
    it('should use heuristics when LLM is not available', async () => {
      const compactor = new SemanticCompactor({
        importanceThreshold: 0.6,
        minMessages: 5,
        useLlm: false,
      });
      const messages = createMessageSequence(20);
      const context = createContext(messages);

      const result = await compactor.compact(context);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('semantic');
      expect(result.metadata?.usedLlm).toBe(false);
    });

    it('should preserve pinned messages regardless of score', async () => {
      const compactor = new SemanticCompactor({
        importanceThreshold: 0.9, // High threshold
        minMessages: 1,
        useLlm: false,
      });
      const messages = createMessageSequence(10);
      const pinnedIds = ['msg-0'];
      const context = createContext(messages, pinnedIds);

      const result = await compactor.compact(context);

      expect(result.messages.some(m => m.id === 'msg-0')).toBe(true);
      expect(result.pinnedPreserved).toBe(1);
    });

    it('should keep minimum number of messages', async () => {
      const compactor = new SemanticCompactor({
        importanceThreshold: 1.0, // Impossible threshold
        minMessages: 5,
        useLlm: false,
      });
      const messages = createMessageSequence(20);
      const context = createContext(messages);

      const result = await compactor.compact(context);

      // Should have at least minMessages regular messages
      expect(result.messages.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('HybridCompactor', () => {
    it('should combine window and semantic strategies', async () => {
      const compactor = new HybridCompactor({
        windowSize: 5,
        importanceThreshold: 0.5,
        minMessages: 3,
      });
      const messages = createMessageSequence(30);
      const context = createContext(messages);

      const result = await compactor.compact(context);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('hybrid');
      // Should have window messages + some important older messages
      expect(result.messages.length).toBeGreaterThanOrEqual(5);
    });

    it('should preserve pinned messages', async () => {
      const compactor = new HybridCompactor({
        windowSize: 3,
        importanceThreshold: 0.9,
        minMessages: 1,
      });
      const messages = createMessageSequence(20);
      const pinnedIds = ['msg-5', 'msg-10']; // Pinned in middle
      const context = createContext(messages, pinnedIds);

      const result = await compactor.compact(context);

      expect(result.messages.some(m => m.id === 'msg-5')).toBe(true);
      expect(result.messages.some(m => m.id === 'msg-10')).toBe(true);
    });
  });
});

describe('Merge Compaction Strategies', () => {
  describe('ModerateMergeCompactor', () => {
    it('should deduplicate messages', async () => {
      const compactor = new ModerateMergeCompactor({
        strategy: 'minimal',
        deduplicate: true,
        mergeConsecutive: false,
        useLlm: false,
      });
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi'),
        createMessage('3', 'user', 'Hello'), // Duplicate
      ];
      const context = createContext(messages);

      const result = await compactor.compact(context);

      expect(result.messages.length).toBe(2);
    });

    it('should merge consecutive same-role messages', async () => {
      const compactor = new ModerateMergeCompactor({
        strategy: 'moderate',
        deduplicate: true,
        mergeConsecutive: true,
        useLlm: false,
      });
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'user', 'How are you?'),
        createMessage('3', 'assistant', 'Hi there!'),
      ];
      const context = createContext(messages);

      const result = await compactor.compact(context);

      expect(result.messages.length).toBe(2);
    });

    it('should preserve pinned messages', async () => {
      const compactor = new ModerateMergeCompactor({
        strategy: 'moderate',
        deduplicate: true,
        mergeConsecutive: true,
        useLlm: false,
      });
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'user', 'Hello'), // Would be deduplicated
        createMessage('3', 'assistant', 'Hi'),
      ];
      const pinnedIds = ['2']; // Pin the duplicate
      const context = createContext(messages, pinnedIds);

      const result = await compactor.compact(context);

      // Pinned message should be preserved even if it would be deduplicated
      expect(result.messages.some(m => m.id === '2')).toBe(true);
    });
  });
});

describe('Factory Functions', () => {
  describe('getPathCompactor', () => {
    it('should return NoneCompactor for "none" strategy', () => {
      const compactor = getPathCompactor('none');
      expect(compactor.getStrategy()).toBe('none');
    });

    it('should return SlidingWindowCompactor for "sliding_window" strategy', () => {
      const compactor = getPathCompactor('sliding_window', { windowSize: 10 });
      expect(compactor.getStrategy()).toBe('sliding_window');
    });

    it('should return SemanticCompactor for "semantic" strategy', () => {
      const compactor = getPathCompactor('semantic');
      expect(compactor.getStrategy()).toBe('semantic');
    });

    it('should return HybridCompactor for "hybrid" strategy', () => {
      const compactor = getPathCompactor('hybrid');
      expect(compactor.getStrategy()).toBe('hybrid');
    });
  });

  describe('getMergeCompactor', () => {
    it('should return appropriate compactor for each strategy', () => {
      const none = getMergeCompactor('none');
      const minimal = getMergeCompactor('minimal');
      const moderate = getMergeCompactor('moderate');
      const aggressive = getMergeCompactor('aggressive');

      expect(none.getStrategy()).toBe('none');
      expect(minimal.getStrategy()).toBe('minimal');
      expect(moderate.getStrategy()).toBe('moderate');
      expect(aggressive.getStrategy()).toBe('aggressive');
    });
  });
});

describe('Integration Scenarios', () => {
  describe('Long Conversation Compaction', () => {
    it('should effectively compact a long conversation', async () => {
      const messages = createMessageSequence(100);
      const pinnedIds = ['msg-25', 'msg-50', 'msg-75'];
      const context = createContext(messages, pinnedIds);

      const compactor = getPathCompactor('sliding_window', { windowSize: 20 });
      const result = await compactor.compact(context);

      // Should have reduced message count
      expect(result.messages.length).toBeLessThan(100);

      // Pinned messages should be preserved
      expect(result.messages.some(m => m.id === 'msg-25')).toBe(true);
      expect(result.messages.some(m => m.id === 'msg-50')).toBe(true);
      expect(result.messages.some(m => m.id === 'msg-75')).toBe(true);

      // Token count should be reduced
      expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
    });
  });

  describe('Merge Compaction Flow', () => {
    it('should handle branch merge compaction', async () => {
      // Simulate two branches with overlapping content
      const branch1 = [
        createMessage('b1-1', 'user', 'Question about topic A'),
        createMessage('b1-2', 'assistant', 'Answer about topic A'),
        createMessage('b1-3', 'user', 'Follow up on A'),
      ];

      const branch2 = [
        createMessage('b2-1', 'user', 'Question about topic A'), // Duplicate
        createMessage('b2-2', 'assistant', 'Different answer about A'),
        createMessage('b2-3', 'user', 'Question about topic B'),
        createMessage('b2-4', 'assistant', 'Answer about topic B'),
      ];

      // Merge and compact
      const allMessages = [...branch1, ...branch2];
      const context = createContext(allMessages);
      const compactor = getMergeCompactor('moderate');

      const result = await compactor.compact(context);

      // Should have removed duplicate
      expect(result.messages.length).toBeLessThan(allMessages.length);
      expect(result.success).toBe(true);
    });
  });

  describe('Pinned Message Preservation', () => {
    it('should never remove pinned messages under any strategy', async () => {
      const messages = createMessageSequence(50);
      const pinnedIds = ['msg-0', 'msg-10', 'msg-20', 'msg-30', 'msg-40'];

      const strategies: Array<{ name: string; compactor: ReturnType<typeof getPathCompactor> }> = [
        { name: 'none', compactor: getPathCompactor('none') },
        { name: 'sliding_window', compactor: getPathCompactor('sliding_window', { windowSize: 5 }) },
        { name: 'semantic', compactor: getPathCompactor('semantic', { useLlm: false }) },
        { name: 'hybrid', compactor: getPathCompactor('hybrid', { windowSize: 5 }) },
      ];

      for (const { name, compactor } of strategies) {
        const context = createContext(messages, pinnedIds);
        const result = await compactor.compact(context);

        for (const pinnedId of pinnedIds) {
          const preserved = result.messages.some(m => m.id === pinnedId);
          expect(preserved).toBe(true);
        }
      }
    });
  });

  describe('Chronological Order Preservation', () => {
    it('should maintain chronological order after compaction', async () => {
      const messages = createMessageSequence(20);
      const context = createContext(messages, ['msg-5']);

      const compactor = getPathCompactor('sliding_window', { windowSize: 10 });
      const result = await compactor.compact(context);

      // Check that messages are in chronological order
      for (let i = 1; i < result.messages.length; i++) {
        const prevTime = result.messages[i - 1].createdAt instanceof Date
          ? result.messages[i - 1].createdAt.getTime()
          : new Date(result.messages[i - 1].createdAt).getTime();
        const currTime = result.messages[i].createdAt instanceof Date
          ? result.messages[i].createdAt.getTime()
          : new Date(result.messages[i].createdAt).getTime();

        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });
});
