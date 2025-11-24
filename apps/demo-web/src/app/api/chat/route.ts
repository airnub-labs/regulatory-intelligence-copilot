/**
 * Chat API endpoint for Regulatory Intelligence Copilot
 *
 * Handles conversational queries about tax, welfare, pensions, and regulatory compliance.
 * Uses provider-agnostic LLM Router and prompt aspects for consistent behavior.
 */

import {
  buildPromptWithAspects,
  sanitizeTextForEgress,
  NON_ADVICE_DISCLAIMER,
  REGULATORY_COPILOT_SYSTEM_PROMPT,
  getOrCreateActiveSandbox,
  hasActiveSandbox,
  callMemgraphMcp,
  configureMcpGateway,
  type UserProfile,
  type ChatMessage,
} from '@reg-copilot/compliance-core';

// For streaming, we still use AI SDK temporarily
// TODO: Implement streaming in LlmRouter for full provider-agnostic streaming
import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';

/**
 * Build system prompt using aspects
 */
async function buildSystemPrompt(
  jurisdictions: string[],
  profile?: UserProfile
): Promise<string> {
  return buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, {
    jurisdictions,
    profile,
    includeDisclaimer: true,
  });
}

export async function POST(request: Request) {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      const message = 'GROQ_API_KEY is missing. Add it to apps/web/.env.local or export it in your shell.';
      console.error(`[API] ${message}`);
      return new Response(message, {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const body = await request.json();
    const { messages, profile } = body as {
      messages: Array<{ role: string; content: string }>;
      profile?: UserProfile;
    };

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];

    // Check if user wants to query the graph directly
    const graphKeywords = ['query graph', 'show graph', 'cypher:', 'graph schema'];
    const lastContent = lastMessage.content.toLowerCase();
    const isGraphQuery = graphKeywords.some(kw => lastContent.includes(kw));

    if (isGraphQuery) {
      if (!hasActiveSandbox()) {
        // Initialize sandbox for graph queries
        try {
          const sandbox = await getOrCreateActiveSandbox();
          configureMcpGateway(sandbox.mcpUrl, sandbox.mcpToken);
        } catch (error) {
          console.error('[API] Failed to initialize sandbox:', error);
          const message = 'Graph is unavailable. Please try again later.';
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`0:${JSON.stringify(message)}\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      }

      try {
        let graphResult;

        if (lastContent.includes('cypher:')) {
          const cypherQuery = lastContent.split('cypher:')[1].trim();
          graphResult = await callMemgraphMcp(cypherQuery);
        } else {
          // Default: get summary of graph contents
          graphResult = await callMemgraphMcp(
            'MATCH (n) RETURN labels(n)[0] as type, count(n) as count ORDER BY count DESC LIMIT 10'
          );
        }

        const resultSummary = JSON.stringify(graphResult, null, 2);
        const graphResponseText = `Graph query results:\n\n\`\`\`json\n${resultSummary}\n\`\`\`\n\n${NON_ADVICE_DISCLAIMER}`;

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`0:${JSON.stringify(graphResponseText)}\n`));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      } catch (error) {
        console.error('[API] Graph query error:', error);
        return new Response(
          `Error querying graph: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { status: 500 }
        );
      }
    }

    // For normal chat, use provider-agnostic approach with prompt aspects
    console.log('[API] Processing chat request with profile:', profile?.personaType, profile?.jurisdictions);

    // Determine jurisdictions
    const jurisdictions = profile?.jurisdictions || ['IE'];

    // Build system prompt using aspects (ensures consistency across all entry points)
    const systemPrompt = await buildSystemPrompt(jurisdictions, profile);

    // Sanitize user input before processing
    const sanitizedMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'user' ? sanitizeTextForEgress(m.content) : m.content,
    }));

    // Use AI SDK with Groq for streaming responses
    // Note: Using Groq directly here for streaming. Full LlmRouter streaming support coming in future PR.
    const groq = createGroq({ apiKey: groqApiKey });

    const result = await streamText({
      model: groq('llama-3.1-70b-versatile'), // Use consistent model
      system: systemPrompt, // Use aspect-built prompt instead of hardcoded
      messages: sanitizedMessages,
      temperature: 0.3,
      maxTokens: 2048,
    });

    // Log the request for debugging
    console.log('[API] Chat request processed, streaming response');

    // Return the stream response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
