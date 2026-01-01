/**
 * Fallback Token Estimators
 *
 * Character-based token estimation for when tiktoken is unavailable
 * or for unsupported models.
 */

/**
 * Character-based token estimation
 *
 * Rule of thumb from OpenAI:
 * - English text: ~4 characters per token
 * - Code/technical: ~3 characters per token
 * - Mixed: ~3.5 characters per token (average)
 *
 * This is approximate but good enough for estimation when exact
 * counting isn't available.
 */
export function estimateTokensFromCharacters(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  const chars = text.length;
  const CHARS_PER_TOKEN = 3.5;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Word-based token estimation (more accurate for natural language)
 *
 * Rule of thumb:
 * - ~1.3 tokens per word on average for English
 * - Slightly higher for technical content
 */
export function estimateTokensFromWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  const words = text.trim().split(/\s+/).length;
  const TOKENS_PER_WORD = 1.3;
  return Math.ceil(words * TOKENS_PER_WORD);
}

/**
 * Hybrid estimation combining character and word counts
 *
 * Takes the average of both methods for better accuracy.
 */
export function estimateTokensHybrid(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  const charEstimate = estimateTokensFromCharacters(text);
  const wordEstimate = estimateTokensFromWords(text);

  // Average the two estimates
  return Math.ceil((charEstimate + wordEstimate) / 2);
}

/**
 * Estimate message overhead tokens
 *
 * Messages have additional tokens for role formatting and structure:
 * - Role name (e.g., "user", "assistant") ~1-2 tokens
 * - Formatting tags/delimiters ~2-3 tokens
 * - Total overhead: ~4 tokens per message
 */
export function estimateMessageOverhead(): number {
  return 4;
}

/**
 * Estimate conversation overhead tokens
 *
 * The conversation wrapper adds tokens for:
 * - System prompt wrapper
 * - Conversation structure
 * - Model-specific formatting
 *
 * Typical overhead: ~10 tokens
 */
export function estimateConversationOverhead(): number {
  return 10;
}
