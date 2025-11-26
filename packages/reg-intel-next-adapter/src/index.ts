import {
  NON_ADVICE_DISCLAIMER,
  REGULATORY_COPILOT_SYSTEM_PROMPT,
  buildPromptWithAspects,
  callMemgraphMcp,
  configureMcpGateway,
  createComplianceEngine,
  createDefaultLlmRouter,
  createGraphClient,
  createTimelineEngine,
  getOrCreateActiveSandbox,
  hasActiveSandbox,
  sanitizeObjectForEgress,
  sanitizeTextForEgress,
  type ChatMessage,
  type ComplianceEngine,
  type EgressGuard,
  type RedactedPayload,
  type UserProfile,
} from '@reg-copilot/reg-intel-core';

const DEFAULT_DISCLAIMER_KEY = 'non_advice_research_tool';

class BasicEgressGuard implements EgressGuard {
  redact(input: unknown): RedactedPayload {
    return {
      content: sanitizeObjectForEgress(input),
      redactionCount: 0,
      redactedTypes: [],
    };
  }

  redactText(text: string): string {
    return sanitizeTextForEgress(text);
  }
}

function sanitizeMessages(messages: Array<{ role: string; content: string }>): ChatMessage[] {
  return messages.map(message => ({
    role: message.role as ChatMessage['role'],
    content: message.role === 'user' ? sanitizeTextForEgress(message.content) : message.content,
  }));
}

function* chunkText(answer: string, chunkSize = 400): Generator<string> {
  for (let i = 0; i < answer.length; i += chunkSize) {
    yield answer.slice(i, i + chunkSize);
  }
}

function buildMetadataChunk(args: {
  agentId: string;
  jurisdictions: string[];
  uncertaintyLevel?: 'low' | 'medium' | 'high';
  disclaimerKey?: string;
  referencedNodes: Array<{ id: string } | string>;
}) {
  return {
    agentId: args.agentId,
    jurisdictions: args.jurisdictions,
    uncertaintyLevel: args.uncertaintyLevel ?? 'medium',
    disclaimerKey: args.disclaimerKey ?? DEFAULT_DISCLAIMER_KEY,
    referencedNodes: args.referencedNodes.map(node => (typeof node === 'string' ? node : node.id)),
  };
}

async function handleGraphQuery(lastContent: string) {
  if (!hasActiveSandbox()) {
    const sandbox = await getOrCreateActiveSandbox();
    configureMcpGateway(sandbox.mcpUrl, sandbox.mcpToken);
  }

  let graphResult;
  if (lastContent.includes('cypher:')) {
    const cypherQuery = lastContent.split('cypher:')[1].trim();
    graphResult = await callMemgraphMcp(cypherQuery);
  } else {
    graphResult = await callMemgraphMcp(
      "MATCH (n) RETURN labels(n)[0] as type, count(n) as count ORDER BY count DESC LIMIT 10"
    );
  }

  const resultSummary = JSON.stringify(graphResult, null, 2);
  const graphResponseText = `Graph query results:\n\n\`\`\`json\n${resultSummary}\n\`\`\`\n\n${NON_ADVICE_DISCLAIMER}`;
  const metadata = buildMetadataChunk({
    agentId: 'graph_query_helper',
    jurisdictions: ['IE'],
    uncertaintyLevel: 'medium',
    disclaimerKey: DEFAULT_DISCLAIMER_KEY,
    referencedNodes: [],
  });

  return { graphResponseText, metadata };
}

export interface ChatRouteHandlerOptions {
  tenantId?: string;
}

export function createChatRouteHandler(options?: ChatRouteHandlerOptions) {
  const llmRouter = createDefaultLlmRouter();
  const complianceEngine: ComplianceEngine = createComplianceEngine({
    llmClient: llmRouter,
    graphClient: createGraphClient(),
    timelineEngine: createTimelineEngine(),
    egressGuard: new BasicEgressGuard(),
  });

  return async function POST(request: Request) {
    try {
      const body = await request.json();
      const { messages, profile } = body as {
        messages: Array<{ role: string; content: string }>;
        profile?: UserProfile;
      };

      if (!messages || messages.length === 0) {
        return new Response('No messages provided', { status: 400 });
      }

      const lastMessage = messages[messages.length - 1];
      const graphKeywords = ['query graph', 'show graph', 'cypher:', 'graph schema'];
      const lastContent = lastMessage.content.toLowerCase();
      const isGraphQuery = graphKeywords.some(kw => lastContent.includes(kw));

      const encoder = new TextEncoder();

      if (isGraphQuery) {
        try {
          const { graphResponseText, metadata } = await handleGraphQuery(lastContent);
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`1:${JSON.stringify(metadata)}\n`));
              controller.enqueue(encoder.encode(`0:${JSON.stringify(graphResponseText)}\n`));
              controller.close();
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'X-Vercel-AI-Data-Stream': 'v1',
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`3:${JSON.stringify(message)}\n`));
              controller.close();
            },
          });

          return new Response(stream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            status: 500,
          });
        }
      }

      const sanitizedMessages = sanitizeMessages(messages);
      const jurisdictions = profile?.jurisdictions || ['IE'];

      const complianceResult = await complianceEngine.handleChat({
        messages: [
          {
            role: 'system',
            content: await buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, {
              jurisdictions,
              profile,
              includeDisclaimer: true,
            }),
          },
          ...sanitizedMessages,
        ],
        profile,
        tenantId: options?.tenantId ?? 'default',
      });

      const metadata = buildMetadataChunk({
        agentId: complianceResult.agentUsed,
        jurisdictions,
        uncertaintyLevel: complianceResult.uncertaintyLevel,
        disclaimerKey: DEFAULT_DISCLAIMER_KEY,
        referencedNodes: complianceResult.referencedNodes,
      });

      const answerWithDisclaimer = `${complianceResult.answer}\n\n${NON_ADVICE_DISCLAIMER}`;

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`1:${JSON.stringify(metadata)}\n`));
          for (const delta of chunkText(answerWithDisclaimer)) {
            controller.enqueue(encoder.encode(`0:${JSON.stringify(delta)}\n`));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Vercel-AI-Data-Stream': 'v1',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(`Error: ${message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  };
}
