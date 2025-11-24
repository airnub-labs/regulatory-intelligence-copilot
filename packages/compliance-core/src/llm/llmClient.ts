/**
 * LLM Client for Regulatory Intelligence Copilot
 *
 * Provides LLM access via MCP (Groq) with proper system prompts
 * that enforce the non-advice stance.
 */

import type { LlmClient, LlmChatRequest, LlmChatResponse } from '../types.js';
import { callPerplexityMcp } from '../mcpClient.js';
import { DEFAULT_GROQ_MODEL, DEFAULT_LLM_TEMPERATURE, DEFAULT_MAX_TOKENS } from '../constants.js';
import { buildPromptWithAspects, type PromptContext } from '../aspects/promptAspects.js';

/**
 * Base system prompt for regulatory copilot (jurisdiction-neutral)
 */
export const REGULATORY_COPILOT_SYSTEM_PROMPT = `You are a regulatory research copilot that helps users understand tax, social welfare, pensions, CGT, and related rules in their jurisdiction.

IMPORTANT CONSTRAINTS:
- You are a RESEARCH TOOL, not a legal, tax, or welfare advisor
- NEVER give definitive advice like "you should do X" or "you must do Y"
- ALWAYS highlight uncertainties, edge cases, and conditions that may apply
- ALWAYS encourage users to confirm with qualified professionals in their jurisdiction
- When explaining rules, cite specific sections, benefits, or reliefs by name
- If the graph data is incomplete, say so explicitly
- Use hedging language: "appears to", "may apply", "based on this rule"
- Pay attention to the user's jurisdiction context when provided

When responding:
1. Explain the relevant rules from the provided graph context
2. Highlight any mutual exclusions, lookback windows, or lock-in periods
3. Note any uncertainties or conditions that require professional review
4. Reference specific node IDs/names from the graph
5. Consider cross-border implications when multiple jurisdictions are involved

Keep responses clear, structured, and focused on explaining what the rules say, not on prescribing actions.`;

/**
 * Build a jurisdiction-aware system prompt (legacy function, uses aspects internally)
 */
export function buildSystemPrompt(jurisdictions?: string[]): string {
  // Synchronous wrapper for backwards compatibility
  // For async usage, use buildPromptWithAspects directly
  if (!jurisdictions || jurisdictions.length === 0) {
    return REGULATORY_COPILOT_SYSTEM_PROMPT;
  }

  const jurisdictionContext = jurisdictions.length === 1
    ? `The user is primarily interested in rules from: ${jurisdictions[0]}`
    : `The user is interested in rules from multiple jurisdictions: ${jurisdictions.join(', ')}. Pay attention to cross-border interactions and coordination rules.`;

  return `${REGULATORY_COPILOT_SYSTEM_PROMPT}

Jurisdiction Context: ${jurisdictionContext}`;
}

/**
 * Build a system prompt using aspects (async, preferred method)
 */
export async function buildSystemPromptAsync(
  options: Omit<PromptContext, 'basePrompt'> = {}
): Promise<string> {
  return buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, options);
}

/**
 * Create an LLM client that uses Perplexity MCP
 */
export function createLlmClient(): LlmClient {
  return {
    async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
      // Build the query from messages
      const systemPrompt = request.messages.find(m => m.role === 'system')?.content || REGULATORY_COPILOT_SYSTEM_PROMPT;
      const userMessages = request.messages.filter(m => m.role === 'user');
      const assistantMessages = request.messages.filter(m => m.role === 'assistant');

      // Build context string
      let query = `System: ${systemPrompt}\n\n`;

      // Interleave conversation history
      const maxHistory = Math.min(userMessages.length, assistantMessages.length + 1);
      for (let i = 0; i < maxHistory; i++) {
        if (userMessages[i]) {
          query += `User: ${userMessages[i].content}\n\n`;
        }
        if (assistantMessages[i]) {
          query += `Assistant: ${assistantMessages[i].content}\n\n`;
        }
      }

      // Call Perplexity MCP
      const result = await callPerplexityMcp(query);

      return {
        content: typeof result === 'string' ? result : JSON.stringify(result),
      };
    },
  };
}

/**
 * Build a prompt for regulatory reasoning
 */
export function buildRegulatoryPrompt(
  question: string,
  graphContext: string,
  agentContext?: string
): string {
  return `${agentContext ? `Agent Context: ${agentContext}\n\n` : ''}Graph Context (relevant rules and relationships):
${graphContext}

User Question: ${question}

Please explain the relevant rules and their interactions based on the graph context above. Remember to:
- Highlight any mutual exclusions or time-based constraints
- Note uncertainties and recommend professional consultation
- Reference specific rules/benefits/sections by name`;
}
