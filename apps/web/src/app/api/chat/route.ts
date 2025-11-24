import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';
import {
  getOrCreateActiveSandbox,
  hasActiveSandbox,
  callMemgraphMcp,
  configureMcpGateway,
  createGraphClient,
  createTimelineEngine,
  createLlmClient,
  GlobalRegulatoryComplianceAgent,
  NON_ADVICE_DISCLAIMER,
  REGULATORY_COPILOT_SYSTEM_PROMPT,
  sanitizeTextForEgress,
  type AgentContext,
  type AgentInput,
  type UserProfile,
  type ChatMessage,
} from '@reg-copilot/compliance-core';

// System prompt for the regulatory copilot (jurisdiction-neutral)
const SYSTEM_PROMPT = `You are a regulatory research copilot that helps users understand tax, social welfare, pensions, CGT, and related rules in their jurisdiction.

IMPORTANT CONSTRAINTS:
- You are a RESEARCH TOOL, not a legal, tax, or welfare advisor
- NEVER give definitive advice like "you should do X" or "you must do Y"
- ALWAYS highlight uncertainties, edge cases, and conditions that may apply
- ALWAYS encourage users to confirm with qualified professionals in their jurisdiction
- When explaining rules, cite specific sections, benefits, or reliefs by name
- Use hedging language: "appears to", "may apply", "based on this rule"
- Pay attention to the user's jurisdiction when they mention it

Key topics you can help with:
- Tax law (Corporation Tax, CGT, VAT, income tax, R&D credits)
- Social welfare benefits and social security
- Pension systems (State, occupational, personal)
- Cross-border coordination and EU regulations

When responding:
1. Explain the relevant rules from available sources
2. Highlight any mutual exclusions, lookback windows, or lock-in periods
3. Note uncertainties that require professional review
4. Keep responses clear and structured
5. Consider cross-border implications when relevant

Always end with a reminder that this is for research purposes only.`;

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

    const groq = createGroq({ apiKey: groqApiKey });

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

    // For normal chat, use the compliance orchestrator with Groq streaming
    // Sanitize user input before processing
    const sanitizedQuestion = sanitizeTextForEgress(lastMessage.content);

    // Use AI SDK with Groq for streaming responses
    const result = await streamText({
      model: groq('compound-beta'),
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'user' ? sanitizeTextForEgress(m.content) : m.content,
      })),
      temperature: 0.3,
      maxTokens: 2048,
    });

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
