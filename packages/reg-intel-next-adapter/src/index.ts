import {
  NON_ADVICE_DISCLAIMER,
  REGULATORY_COPILOT_SYSTEM_PROMPT,
  buildPromptWithAspects,
  createComplianceEngine,
  createDefaultLlmRouter,
  createGraphClient,
  createTimelineEngine,
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

export interface ChatRouteHandlerOptions {
  tenantId?: string;
}

class SseStreamWriter {
  private controller: ReadableStreamDefaultController;
  private encoder = new TextEncoder();

  constructor(controller: ReadableStreamDefaultController) {
    this.controller = controller;
  }

  send(event: 'message' | 'metadata' | 'error' | 'done', data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const chunk = `event: ${event}\n` + `data: ${payload}\n\n`;
    this.controller.enqueue(this.encoder.encode(chunk));
  }

  close() {
    this.controller.close();
  }
}

function* chunkText(answer: string, chunkSize = 400): Generator<string> {
  for (let i = 0; i < answer.length; i += chunkSize) {
    yield answer.slice(i, i + chunkSize);
  }
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
          const writer = new SseStreamWriter(controller);
          writer.send('metadata', metadata);
          for (const delta of chunkText(answerWithDisclaimer)) {
            writer.send('message', { text: delta });
          }
          writer.send('done', { status: 'ok' });
          writer.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stream = new ReadableStream({
        start(controller) {
          const writer = new SseStreamWriter(controller);
          writer.send('error', { message });
          writer.send('done', { status: 'error' });
          writer.close();
        },
      });

      return new Response(stream, {
        status: 500,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }
  };
}
