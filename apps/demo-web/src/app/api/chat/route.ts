/**
 * Chat API endpoint for Regulatory Intelligence Copilot
 *
 * Handles conversational queries about tax, welfare, pensions, and regulatory compliance.
 * Uses provider-agnostic LLM Router with streaming support.
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
  createLlmRouter,
  type UserProfile,
  type ChatMessage,
  type LlmStreamChunk,
} from '@reg-copilot/reg-intel-core';

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

/**
 * Convert LlmStreamChunk to AI SDK data stream format
 */
function convertToDataStream(chunk: LlmStreamChunk): string {
  if (chunk.type === 'text' && chunk.delta) {
    return `0:${JSON.stringify(chunk.delta)}\n`;
  }
  if (chunk.type === 'error') {
    return `3:${JSON.stringify(chunk.error?.message || 'Unknown error')}\n`;
  }
  return ''; // Skip 'done' chunks
}

export async function POST(request: Request) {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!groqApiKey && !openaiApiKey) {
      const message = 'No LLM API keys configured. Set GROQ_API_KEY or OPENAI_API_KEY.';
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

    // For normal chat, use provider-agnostic LLM Router with streaming
    console.log('[API] Processing chat request with profile:', profile?.personaType, profile?.jurisdictions);

    // Determine jurisdictions
    const jurisdictions = profile?.jurisdictions || ['IE'];

    // Build system prompt using aspects (ensures consistency across all entry points)
    const systemPrompt = await buildSystemPrompt(jurisdictions, profile);

    // Sanitize user input before processing
    const sanitizedMessages: ChatMessage[] = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.role === 'user' ? sanitizeTextForEgress(m.content) : m.content,
    }));

    // Create LLM router with available providers
    const llmRouter = createLlmRouter({
      openaiApiKey,
      groqApiKey,
      defaultProvider: groqApiKey ? 'groq' : 'openai',
      defaultModel: groqApiKey ? 'llama-3.1-70b-versatile' : 'gpt-4',
    });

    // Add system prompt as first message
    const allMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...sanitizedMessages,
    ];

    // Stream response using LlmRouter
    console.log('[API] Streaming response via LlmRouter');

    // Create a ReadableStream that converts LlmStreamChunk to AI SDK format
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (!llmRouter.streamChat) {
            controller.enqueue(encoder.encode('3:"Streaming not supported"\n'));
            controller.close();
            return;
          }

          for await (const chunk of llmRouter.streamChat(allMessages, {
            temperature: 0.3,
            maxTokens: 2048,
            tenantId: 'default',
            task: 'main-chat',
          })) {
            const data = convertToDataStream(chunk);
            if (data) {
              controller.enqueue(encoder.encode(data));
            }

            if (chunk.type === 'error') {
              console.error('[API] Stream error:', chunk.error);
              controller.close();
              return;
            }

            if (chunk.type === 'done') {
              controller.close();
              return;
            }
          }
        } catch (error) {
          console.error('[API] Stream error:', error);
          controller.enqueue(
            encoder.encode(`3:${JSON.stringify(error instanceof Error ? error.message : 'Unknown error')}\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      },
    });
  } catch (error) {
    console.error('[API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
