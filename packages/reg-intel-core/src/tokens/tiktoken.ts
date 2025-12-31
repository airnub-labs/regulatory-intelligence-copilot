/**
 * Tiktoken Token Counter
 *
 * Accurate token counting using OpenAI's tiktoken library.
 * Supports GPT-4, GPT-3.5, and other OpenAI models.
 */

import type { Tiktoken, TiktokenModel } from '@dqbd/tiktoken';
import type {
  TokenCounter,
  TokenCounterConfig,
  TokenEstimate,
} from './types.js';
import { TokenCache, createCacheKey } from './cache.js';
import {
  estimateTokensFromCharacters,
  estimateMessageOverhead,
  estimateConversationOverhead,
} from './estimators.js';

/**
 * Tiktoken-based token counter with caching
 */
export class TiktokenCounter implements TokenCounter {
  private encoder: Tiktoken | null = null;
  private cache: TokenCache;
  private config: Required<TokenCounterConfig>;
  private encoderModel: string;

  constructor(config: TokenCounterConfig) {
    this.config = {
      model: config.model,
      enableCache: config.enableCache ?? true,
      enableFallback: config.enableFallback ?? true,
      cacheSize: config.cacheSize ?? 1000,
      cacheTtlMs: config.cacheTtlMs ?? 3600000, // 1 hour default
    };

    this.encoderModel = config.model;
    this.cache = new TokenCache(this.config.cacheSize, this.config.cacheTtlMs);
    this.initEncoder();
  }

  /**
   * Initialize the tiktoken encoder
   */
  private initEncoder(): void {
    try {
      // Dynamic import of tiktoken
      const { encoding_for_model } = require('@dqbd/tiktoken');

      // Map model names to tiktoken models
      const tiktokenModel = this.mapModelToTiktoken(this.config.model);
      this.encoder = encoding_for_model(tiktokenModel);
      this.encoderModel = tiktokenModel;
    } catch (error) {
      if (!this.config.enableFallback) {
        throw new Error(
          `Failed to initialize tiktoken for model ${this.config.model}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // Will fall back to character estimation
      this.encoder = null;
    }
  }

  /**
   * Map our model names to tiktoken model names
   */
  private mapModelToTiktoken(model: string): TiktokenModel {
    // Normalize model name
    const modelLower = model.toLowerCase();

    // GPT-4 models
    if (modelLower.includes('gpt-4')) {
      return 'gpt-4' as TiktokenModel;
    }

    // GPT-3.5 models
    if (modelLower.includes('gpt-3.5') || modelLower.includes('gpt-35')) {
      return 'gpt-3.5-turbo' as TiktokenModel;
    }

    // Text models
    if (modelLower.includes('text-davinci')) {
      return 'text-davinci-003' as TiktokenModel;
    }

    // Default to GPT-3.5 for unknown models
    // (most models use similar tokenization)
    if (this.config.enableFallback) {
      return 'gpt-3.5-turbo' as TiktokenModel;
    }

    throw new Error(`No tiktoken mapping for model: ${model}`);
  }

  /**
   * Estimate tokens for raw text
   */
  async estimateTokens(text: string): Promise<TokenEstimate> {
    if (!text || text.length === 0) {
      return {
        tokens: 0,
        method: 'tiktoken',
        isExact: true,
        model: this.encoderModel,
      };
    }

    // Check cache first
    if (this.config.enableCache) {
      const cacheKey = createCacheKey(text, this.encoderModel);
      const cached = this.cache.get(cacheKey);

      if (cached !== undefined) {
        return {
          tokens: cached,
          method: 'cached',
          isExact: true,
          model: this.encoderModel,
        };
      }
    }

    let tokens: number;
    let method: 'tiktoken' | 'character-estimate';
    let isExact: boolean;

    if (this.encoder) {
      // Use tiktoken for exact count
      try {
        const encoded = this.encoder.encode(text);
        tokens = encoded.length;
        method = 'tiktoken';
        isExact = true;
      } catch (error) {
        // Tiktoken failed, fall back to estimation
        if (!this.config.enableFallback) {
          throw error;
        }
        tokens = estimateTokensFromCharacters(text);
        method = 'character-estimate';
        isExact = false;
      }
    } else {
      // Fallback to character estimation
      tokens = estimateTokensFromCharacters(text);
      method = 'character-estimate';
      isExact = false;
    }

    // Cache result
    if (this.config.enableCache && method !== 'character-estimate') {
      const cacheKey = createCacheKey(text, this.encoderModel);
      this.cache.set(cacheKey, tokens, this.encoderModel);
    }

    return {
      tokens,
      method,
      isExact,
      model: this.encoderModel,
    };
  }

  /**
   * Estimate tokens for a conversation message
   */
  async estimateMessageTokens(message: {
    role: string;
    content: string;
  }): Promise<TokenEstimate> {
    // Format: <role>: <content>
    const formatted = `${message.role}: ${message.content}`;
    const result = await this.estimateTokens(formatted);

    // Add overhead for message formatting (role tags, metadata, etc.)
    const overhead = estimateMessageOverhead();

    return {
      ...result,
      tokens: result.tokens + overhead,
    };
  }

  /**
   * Estimate total tokens for multiple messages
   */
  async estimateContextTokens(
    messages: Array<{ role: string; content: string }>
  ): Promise<TokenEstimate> {
    if (messages.length === 0) {
      return {
        tokens: 0,
        method: 'tiktoken',
        isExact: true,
        model: this.encoderModel,
      };
    }

    // Estimate each message
    const estimates = await Promise.all(
      messages.map((m) => this.estimateMessageTokens(m))
    );

    const totalTokens = estimates.reduce((sum, est) => sum + est.tokens, 0);

    // Add overhead for conversation formatting
    const conversationOverhead = estimateConversationOverhead();

    // Determine method and exactness
    const allExact = estimates.every((e) => e.isExact);
    const method = estimates[0]?.method || 'character-estimate';

    return {
      tokens: totalTokens + conversationOverhead,
      method,
      isExact: allExact,
      model: this.encoderModel,
    };
  }

  /**
   * Clear token count cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    return this.cache.getStats();
  }

  /**
   * Free encoder resources
   */
  dispose(): void {
    if (this.encoder) {
      try {
        this.encoder.free();
      } catch {
        // Ignore errors during cleanup
      }
      this.encoder = null;
    }
    this.clearCache();
  }
}
