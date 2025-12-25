import 'server-only';

import { createDefaultLlmRouter } from '@reg-copilot/reg-intel-core';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { PathAwareMessage, ConversationPath } from '@reg-copilot/reg-intel-conversations';

const logger = createLogger('MergeSummarizer');

/**
 * Chat message for LLM interaction
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Input for generating a merge summary
 */
export interface GenerateMergeSummaryInput {
  /** Messages from the branch to be merged */
  branchMessages: PathAwareMessage[];
  /** The source branch path */
  sourcePath: ConversationPath;
  /** The target path being merged into */
  targetPath: ConversationPath;
  /** Optional user-provided summarization instructions */
  customPrompt?: string;
  /** Tenant ID for LLM policy routing */
  tenantId: string;
}

/**
 * Result of merge summary generation
 */
export interface GenerateMergeSummaryResult {
  /** The generated summary text */
  summary: string;
  /** Whether AI generation was used (vs fallback) */
  aiGenerated: boolean;
  /** Error message if AI generation failed */
  error?: string;
}

const SYSTEM_PROMPT = `You are an expert regulatory intelligence assistant. Your task is to create a concise summary of a conversation branch to merge back into the main conversation.

Guidelines:
1. Capture KEY FINDINGS and CONCLUSIONS from the branch conversation
2. Include specific regulatory references, citations, or requirements mentioned
3. Note any action items or recommendations discussed
4. Keep the summary focused and actionable (2-3 paragraphs maximum)
5. Use a professional tone consistent with regulatory compliance discussions
6. Format as a coherent narrative, not bullet points
7. Start directly with the content - no preamble like "Here is a summary..."

The summary will be added to the main conversation as a single message, so it should flow naturally.`;

/**
 * Format branch messages for the LLM prompt
 */
function formatMessagesForPrompt(messages: PathAwareMessage[]): string {
  return messages
    .map(m => {
      const role = m.role === 'user' ? 'USER' : m.role === 'assistant' ? 'ASSISTANT' : 'SYSTEM';
      // Truncate very long messages to avoid token limits
      const content = m.content.length > 2000
        ? m.content.slice(0, 2000) + '... [truncated]'
        : m.content;
      return `[${role}]: ${content}`;
    })
    .join('\n\n');
}

/**
 * Generate a fallback summary when AI is unavailable
 */
function generateFallbackSummary(input: GenerateMergeSummaryInput): string {
  const { branchMessages, sourcePath } = input;
  const branchName = sourcePath.name ?? 'Branch';
  const messageCount = branchMessages.length;

  // Get first user message as context
  const firstUserMessage = branchMessages.find(m => m.role === 'user');
  const preview = firstUserMessage
    ? firstUserMessage.content.slice(0, 150) + (firstUserMessage.content.length > 150 ? '...' : '')
    : 'No content preview available';

  return `[Merged from "${branchName}" - ${messageCount} message${messageCount !== 1 ? 's' : ''}]\n\nBranch topic: ${preview}\n\n(AI summary generation was unavailable. Please review the original branch for full details.)`;
}

/**
 * Generate an AI-powered summary for merging a conversation branch
 *
 * Falls back to a basic summary if LLM is unavailable or fails.
 */
export async function generateMergeSummary(
  input: GenerateMergeSummaryInput
): Promise<GenerateMergeSummaryResult> {
  const { branchMessages, sourcePath, targetPath, customPrompt, tenantId } = input;

  // Early return if no messages to summarize
  if (branchMessages.length === 0) {
    return {
      summary: `[Merged from "${sourcePath.name ?? 'Branch'}"] - No messages to merge.`,
      aiGenerated: false,
    };
  }

  // Try to create LLM router - may fail if no API keys configured
  let router;
  try {
    router = createDefaultLlmRouter();
  } catch (error) {
    logger.warn({ err: error }, 'LLM router not available');
    return {
      summary: generateFallbackSummary(input),
      aiGenerated: false,
      error: 'LLM not configured',
    };
  }

  // Build the user prompt
  const branchContent = formatMessagesForPrompt(branchMessages);
  const branchName = sourcePath.name ?? 'Unnamed Branch';
  const targetName = targetPath.name ?? (targetPath.isPrimary ? 'Main Conversation' : 'Target Branch');

  let userPrompt = `Please summarize the following conversation branch for merging into "${targetName}".

Branch: "${branchName}" (${branchMessages.length} messages)

--- Branch Conversation Start ---
${branchContent}
--- Branch Conversation End ---`;

  // Add custom instructions if provided
  if (customPrompt && customPrompt.trim()) {
    userPrompt += `\n\nAdditional summarization instructions from user:\n${customPrompt.trim()}`;
  }

  userPrompt += '\n\nProvide a concise summary suitable for adding to the main conversation:';

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  try {
    const summary = await router.chat(messages, {
      task: 'merge-summarizer',
      tenantId,
      temperature: 0.3,
      maxTokens: 600,
    });

    // Clean up the response
    const cleanedSummary = summary
      .trim()
      // Remove common preambles
      .replace(/^(Here is |Here's |The following is |This is )?(a |the )?summary:?\s*/i, '')
      .trim();

    return {
      summary: cleanedSummary,
      aiGenerated: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error }, 'AI generation failed');

    return {
      summary: generateFallbackSummary(input),
      aiGenerated: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if LLM is available for merge summarization
 */
export function isMergeSummarizerAvailable(): boolean {
  try {
    createDefaultLlmRouter();
    return true;
  } catch {
    return false;
  }
}
