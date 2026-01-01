/**
 * Token Counting Utilities
 *
 * Convenience functions for common token counting tasks.
 */

import { TiktokenCounter } from './tiktoken.js';

// Global token counter instance (lazily initialized)
let globalCounter: TiktokenCounter | null = null;

/**
 * Get or create the global token counter
 */
const getGlobalCounter = (model?: string): TiktokenCounter => {
  if (!globalCounter || (model && globalCounter['config'].model !== model)) {
    globalCounter = new TiktokenCounter({
      model: model ?? 'gpt-4',
      enableCache: true,
      enableFallback: true,
    });
  }
  return globalCounter;
};

/**
 * Count tokens for an array of messages
 *
 * Convenience function that uses a shared token counter instance.
 */
export const countTokensForMessages = async (
  messages: Array<{ role: string; content: string }>,
  model?: string
): Promise<number> => {
  const counter = getGlobalCounter(model);
  const estimate = await counter.estimateContextTokens(messages);
  return estimate.tokens;
};

/**
 * Count tokens for a single text string
 */
export const countTokensForText = async (text: string, model?: string): Promise<number> => {
  const counter = getGlobalCounter(model);
  const estimate = await counter.estimateTokens(text);
  return estimate.tokens;
};

/**
 * Clear the global token counter cache
 */
export const clearTokenCountCache = (): void => {
  if (globalCounter) {
    globalCounter.clearCache();
  }
};
