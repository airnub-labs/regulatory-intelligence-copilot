/**
 * Token Counter Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTokenCounter,
  createTokenCounterForModel,
  quickEstimateTokens,
  type TokenCounter,
} from '../index.js';
import {
  estimateTokensFromCharacters,
  estimateTokensFromWords,
  estimateTokensHybrid,
} from '../estimators.js';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = createTokenCounter({ model: 'gpt-4' });
  });

  afterEach(() => {
    counter.clearCache();
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for simple text', async () => {
      const result = await counter.estimateTokens('Hello, world!');

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toMatch(/tiktoken|character-estimate/);
      expect(result.model).toBeDefined();
    });

    it('should return 0 for empty string', async () => {
      const result = await counter.estimateTokens('');

      expect(result.tokens).toBe(0);
      expect(result.isExact).toBe(true);
    });

    it('should estimate tokens for longer text', async () => {
      const text =
        'This is a longer piece of text that should result in more tokens being counted. ' +
        'The token counter should accurately estimate the number of tokens required for this content.';

      const result = await counter.estimateTokens(text);

      expect(result.tokens).toBeGreaterThan(20);
      expect(result.tokens).toBeLessThan(100);
    });

    it('should cache repeated estimates', async () => {
      const text = 'Cache this text';

      // First call - miss
      await counter.estimateTokens(text);

      // Second call - should be cached
      const result = await counter.estimateTokens(text);

      const stats = counter.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(result.method).toBe('cached');
    });

    it('should handle special characters', async () => {
      const text = '你好世界! 🌍 Special chars: @#$%^&*()';

      const result = await counter.estimateTokens(text);

      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateMessageTokens', () => {
    it('should estimate tokens for a message', async () => {
      const message = {
        role: 'user',
        content: 'What is the capital of France?',
      };

      const result = await counter.estimateMessageTokens(message);

      expect(result.tokens).toBeGreaterThan(0);
      // Should include overhead for message formatting
    });

    it('should handle system messages', async () => {
      const message = {
        role: 'system',
        content: 'You are a helpful assistant.',
      };

      const result = await counter.estimateMessageTokens(message);

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle assistant messages', async () => {
      const message = {
        role: 'assistant',
        content: 'The capital of France is Paris.',
      };

      const result = await counter.estimateMessageTokens(message);

      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateContextTokens', () => {
    it('should estimate tokens for conversation context', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'Thank you!' },
      ];

      const result = await counter.estimateContextTokens(messages);

      expect(result.tokens).toBeGreaterThan(0);
      // Should include overhead for all messages + conversation
    });

    it('should return 0 for empty context', async () => {
      const result = await counter.estimateContextTokens([]);

      expect(result.tokens).toBe(0);
    });

    it('should handle single message context', async () => {
      const messages = [{ role: 'user', content: 'Hello!' }];

      const result = await counter.estimateContextTokens(messages);

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should estimate more tokens for longer conversations', async () => {
      const shortConversation = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ];

      const longConversation = [
        { role: 'system', content: 'You are a helpful regulatory assistant.' },
        {
          role: 'user',
          content: 'Can you explain the tax implications of capital gains?',
        },
        {
          role: 'assistant',
          content:
            'Capital gains tax applies when you sell an asset for more than you paid for it...',
        },
        {
          role: 'user',
          content: 'What about long-term vs short-term gains?',
        },
        {
          role: 'assistant',
          content:
            'Long-term capital gains (held >1 year) are taxed at preferential rates...',
        },
      ];

      const shortResult = await counter.estimateContextTokens(shortConversation);
      const longResult = await counter.estimateContextTokens(longConversation);

      expect(longResult.tokens).toBeGreaterThan(shortResult.tokens);
    });
  });

  describe('cache management', () => {
    it('should track cache hits and misses', async () => {
      const text = 'Test cache tracking';

      // First call - miss
      await counter.estimateTokens(text);
      let stats = counter.getCacheStats();
      const initialMisses = stats.misses;

      // Second call - hit
      await counter.estimateTokens(text);
      stats = counter.getCacheStats();

      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBe(initialMisses);
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    it('should clear cache', async () => {
      const text = 'Clear this';

      await counter.estimateTokens(text);
      counter.clearCache();

      const stats = counter.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('factory functions', () => {
    it('should create counter with createTokenCounterForModel', () => {
      const gpt4Counter = createTokenCounterForModel('gpt-4');
      const gpt35Counter = createTokenCounterForModel('gpt-3.5-turbo');

      expect(gpt4Counter).toBeDefined();
      expect(gpt35Counter).toBeDefined();
    });

    it('should create counter with custom config', () => {
      const customCounter = createTokenCounter({
        model: 'gpt-4',
        enableCache: false,
        enableFallback: true,
      });

      expect(customCounter).toBeDefined();
    });

    it('should estimate quickly without instance', async () => {
      const tokens = await quickEstimateTokens('Quick estimate', 'gpt-4');

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('different models', () => {
    it('should handle GPT-4', async () => {
      const gpt4 = createTokenCounterForModel('gpt-4');
      const result = await gpt4.estimateTokens('Test GPT-4');

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle GPT-3.5', async () => {
      const gpt35 = createTokenCounterForModel('gpt-3.5-turbo');
      const result = await gpt35.estimateTokens('Test GPT-3.5');

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle unknown models with fallback', async () => {
      const unknownModel = createTokenCounter({
        model: 'unknown-model',
        enableFallback: true,
      });

      const result = await unknownModel.estimateTokens('Test unknown model');

      expect(result.tokens).toBeGreaterThan(0);
    });
  });
});

describe('Fallback Estimators', () => {
  describe('estimateTokensFromCharacters', () => {
    it('should estimate based on character count', () => {
      const text = 'Hello, world!'; // 13 characters
      const tokens = estimateTokensFromCharacters(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokensFromCharacters('')).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(1000);
      const tokens = estimateTokensFromCharacters(longText);

      expect(tokens).toBeGreaterThan(200);
      expect(tokens).toBeLessThan(400);
    });
  });

  describe('estimateTokensFromWords', () => {
    it('should estimate based on word count', () => {
      const text = 'This is five words total';
      const tokens = estimateTokensFromWords(text);

      expect(tokens).toBeGreaterThan(4);
      expect(tokens).toBeLessThan(10);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokensFromWords('')).toBe(0);
      expect(estimateTokensFromWords('   ')).toBe(0);
    });

    it('should handle single word', () => {
      const tokens = estimateTokensFromWords('Hello');
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateTokensHybrid', () => {
    it('should combine character and word estimates', () => {
      const text = 'This is a test of hybrid estimation';
      const tokens = estimateTokensHybrid(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokensHybrid('')).toBe(0);
    });

    it('should provide reasonable estimate', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const tokens = estimateTokensHybrid(text);

      // ~9 words, ~44 characters → ~12 tokens expected
      expect(tokens).toBeGreaterThan(8);
      expect(tokens).toBeLessThan(20);
    });
  });
});
