/**
 * Token Counting Types
 *
 * Provides accurate token counting for LLM requests using tiktoken.
 * Powers both conversation compaction and cost tracking.
 */

/**
 * Token counting configuration
 */
export interface TokenCounterConfig {
  /** Model identifier for tokenizer selection (e.g., 'gpt-4', 'claude-3-5-sonnet') */
  model: string;

  /** Enable caching of token counts (default: true) */
  enableCache?: boolean;

  /** Fallback to character estimation if tokenizer unavailable (default: true) */
  enableFallback?: boolean;

  /** Custom cache size limit (default: 1000 entries) */
  cacheSize?: number;

  /** Custom TTL for cache entries in ms (default: 1 hour) */
  cacheTtlMs?: number;
}

/**
 * Token estimation result
 */
export interface TokenEstimate {
  /** Estimated token count */
  tokens: number;

  /** Method used for estimation */
  method: 'tiktoken' | 'character-estimate' | 'cached';

  /** Whether this is an exact count or estimate */
  isExact: boolean;

  /** Model used for counting */
  model?: string;
}

/**
 * Token counter interface
 */
export interface TokenCounter {
  /**
   * Estimate tokens for a single text string
   */
  estimateTokens(text: string): Promise<TokenEstimate>;

  /**
   * Estimate tokens for a conversation message
   * Includes overhead for role formatting
   */
  estimateMessageTokens(message: { role: string; content: string }): Promise<TokenEstimate>;

  /**
   * Estimate total tokens for multiple messages (includes formatting overhead)
   */
  estimateContextTokens(
    messages: Array<{ role: string; content: string }>
  ): Promise<TokenEstimate>;

  /**
   * Clear token count cache
   */
  clearCache(): void;

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * Cache entry for token counts
 */
export interface TokenCacheEntry {
  tokens: number;
  timestamp: number;
  model: string;
}
