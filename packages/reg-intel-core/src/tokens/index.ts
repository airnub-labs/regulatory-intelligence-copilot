/**
 * Token Counting Infrastructure
 *
 * Accurate token counting using tiktoken with fallback estimation.
 * Powers both conversation compaction and LLM cost tracking.
 *
 * @example
 * ```typescript
 * // Create a token counter for GPT-4
 * const counter = createTokenCounter({ model: 'gpt-4' });
 *
 * // Count tokens in text
 * const estimate = await counter.estimateTokens('Hello, world!');
 * console.log(estimate.tokens); // 4
 *
 * // Count tokens in messages
 * const messages = [
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'What is the capital of France?' },
 * ];
 * const contextEstimate = await counter.estimateContextTokens(messages);
 * console.log(contextEstimate.tokens); // ~25
 * ```
 */

export type {
  TokenCounter,
  TokenCounterConfig,
  TokenEstimate,
  TokenCacheEntry,
} from './types.js';

export { TiktokenCounter } from './tiktoken.js';
export { TokenCache, createCacheKey } from './cache.js';
export {
  estimateTokensFromCharacters,
  estimateTokensFromWords,
  estimateTokensHybrid,
  estimateMessageOverhead,
  estimateConversationOverhead,
} from './estimators.js';
export {
  countTokensForMessages,
  countTokensForText,
  clearTokenCountCache,
} from './utils.js';

import type { TokenCounter, TokenCounterConfig } from './types.js';
import { TiktokenCounter } from './tiktoken.js';

/**
 * Create a token counter for a specific model
 *
 * @param config - Token counter configuration
 * @returns TokenCounter instance
 *
 * @example
 * ```typescript
 * const counter = createTokenCounter({ model: 'gpt-4' });
 * const estimate = await counter.estimateTokens('Hello!');
 * ```
 */
export function createTokenCounter(config: TokenCounterConfig): TokenCounter {
  return new TiktokenCounter(config);
}

/**
 * Create a token counter for a specific model (shorthand)
 *
 * @param model - Model name (e.g., 'gpt-4', 'gpt-3.5-turbo')
 * @returns TokenCounter instance
 *
 * @example
 * ```typescript
 * const counter = createTokenCounterForModel('gpt-4');
 * ```
 */
export function createTokenCounterForModel(model: string): TokenCounter {
  return createTokenCounter({ model });
}

/**
 * Quick token estimation without creating a counter instance
 *
 * Note: This creates a new counter each time, so for repeated calls
 * use createTokenCounter() instead.
 *
 * @param text - Text to estimate
 * @param model - Model name (default: 'gpt-3.5-turbo')
 * @returns Token estimate
 */
export async function quickEstimateTokens(
  text: string,
  model = 'gpt-3.5-turbo'
): Promise<number> {
  const counter = createTokenCounter({ model, enableCache: false });
  const estimate = await counter.estimateTokens(text);
  return estimate.tokens;
}
