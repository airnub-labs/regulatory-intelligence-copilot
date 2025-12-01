import {
  NON_ADVICE_DISCLAIMER,
  createComplianceEngine,
  createDefaultLlmRouter,
  createGraphClient,
  createTimelineEngine,
  sanitizeObjectForEgress,
  sanitizeTextForEgress,
  type ChatMessage,
  type ComplianceEngine,
  type EgressGuard,
  type LlmClient,
  type LlmChatRequest,
  type LlmChatResponse,
  type LlmStreamChunk,
  type RedactedPayload,
} from '@reg-copilot/reg-intel-core';
import type {
  LlmRouter,
  LlmCompletionOptions,
} from '@reg-copilot/reg-intel-llm';

const DEFAULT_DISCLAIMER_KEY = 'non_advice_research_tool';

/**
 * Adapter that wraps LlmRouter to match the LlmClient interface
 * expected by ComplianceEngine
 */
class LlmRouterClientAdapter implements LlmClient {
  constructor(private router: LlmRouter) {}

  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const options: LlmCompletionOptions = {
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      tenantId: 'default',
      task: 'main-chat',
    };

    const result = await this.router.chat(request.messages, options);

    return {
      content: result,
      usage: undefined, // LlmRouter doesn't return usage stats
    };
  }

  streamChat(request: LlmChatRequest): AsyncIterable<LlmStreamChunk> {
    const options: LlmCompletionOptions = {
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      tenantId: 'default',
      task: 'main-chat',
    };

    const routerStream = this.router.streamChat(request.messages, options) as AsyncIterable<unknown>;

    const normalizeStream: AsyncIterable<LlmStreamChunk> = (async function* (): AsyncGenerator<
      LlmStreamChunk,
      void,
      undefined
    > {
      for await (const chunk of routerStream) {
        const routerChunk = chunk as { type?: string; delta?: string; error?: unknown };

        if (routerChunk.type === 'tool') {
          continue;
        }

        if (routerChunk.type === 'text') {
          yield { type: 'text', delta: routerChunk.delta ?? '' } satisfies LlmStreamChunk;
          continue;
        }

        if (routerChunk.type === 'done') {
          yield { type: 'done' } satisfies LlmStreamChunk;
          continue;
        }

        const error =
          routerChunk.error instanceof Error
            ? routerChunk.error
            : new Error(String(routerChunk.error));
        yield { type: 'error', error } satisfies LlmStreamChunk;
      }
    })();

    return normalizeStream;
  }
}

/**
 * Basic egress guard implementation that sanitizes data before sending to external LLM providers.
 * Removes sensitive information and ensures compliance with data protection requirements.
 */
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

/**
 * Sanitizes and validates incoming chat messages from the client.
 * - Normalizes role to valid ChatMessage roles (user, assistant, system)
 * - Sanitizes user message content to prevent PII/sensitive data egress
 * - Preserves assistant and system messages as-is
 *
 * @param messages - Raw messages from the API request
 * @returns Sanitized and typed ChatMessage array
 */
function sanitizeMessages(messages: Array<{ role: string; content: string }>): ChatMessage[] {
  return messages.map(message => {
    const role: ChatMessage['role'] =
      message.role === 'assistant' || message.role === 'system' ? message.role : 'user';

    return {
      role,
      content: role === 'user' ? sanitizeTextForEgress(message.content) : message.content,
    } satisfies ChatMessage;
  });
}

/**
 * Builds metadata object for chat response SSE stream.
 * Includes agent information, jurisdiction context, confidence level, and referenced knowledge graph nodes.
 *
 * @param args - Metadata parameters
 * @param args.agentId - Identifier of the compliance agent that handled the query
 * @param args.jurisdictions - List of jurisdiction codes (e.g., ['IE', 'UK'])
 * @param args.uncertaintyLevel - Confidence level of the response (default: 'medium')
 * @param args.disclaimerKey - Key for the disclaimer to display (default: 'non_advice_research_tool')
 * @param args.referencedNodes - Graph nodes referenced in the response
 * @returns Formatted metadata object for SSE transmission
 */
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

/**
 * Configuration options for the chat route handler
 */
export interface ChatRouteHandlerOptions {
  /** Tenant identifier for multi-tenant deployments (default: 'default') */
  tenantId?: string;
  /** Whether to include disclaimer in system prompt and response (default: true) */
  includeDisclaimer?: boolean;
}

/**
 * Helper class for writing Server-Sent Events (SSE) to a ReadableStream.
 * Follows the standard SSE format with event names and data payloads.
 *
 * @example
 * ```typescript
 * const writer = new SseStreamWriter(controller);
 * writer.send('message', { text: 'Hello' });
 * writer.send('done', { status: 'ok' });
 * writer.close();
 * ```
 */
class SseStreamWriter {
  private controller: ReadableStreamDefaultController;
  private encoder = new TextEncoder();

  constructor(controller: ReadableStreamDefaultController) {
    this.controller = controller;
  }

  /**
   * Send an SSE event with the specified type and data
   *
   * @param event - Event type name
   * @param data - Event payload (will be JSON stringified if not a string)
   */
  send(event: 'message' | 'metadata' | 'error' | 'done', data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const chunk = `event: ${event}\n` + `data: ${payload}\n\n`;
    this.controller.enqueue(this.encoder.encode(chunk));
  }

  /**
   * Close the SSE stream
   */
  close() {
    this.controller.close();
  }
}

/**
 * Creates a Next.js API route handler for the regulatory compliance chat endpoint.
 *
 * The handler:
 * - Validates and sanitizes incoming messages
 * - Streams responses using Server-Sent Events (SSE)
 * - Includes metadata about agent, jurisdictions, and confidence levels
 * - Applies egress guards to prevent sensitive data leakage
 * - Returns incremental LLM tokens for real-time user experience
 *
 * @param options - Configuration options for the handler
 * @returns Next.js route handler function that accepts POST requests
 *
 * @example
 * ```typescript
 * // app/api/chat/route.ts
 * import { createChatRouteHandler } from '@reg-copilot/reg-intel-next-adapter';
 * export const POST = createChatRouteHandler();
 * ```
 */
export function createChatRouteHandler(options?: ChatRouteHandlerOptions) {
  // Lazy initialization to avoid build-time errors
  let llmRouter: LlmRouter | null = null;
  let complianceEngine: ComplianceEngine | null = null;

  const getOrCreateEngine = () => {
    if (!complianceEngine) {
      llmRouter = createDefaultLlmRouter();
      const llmClient = new LlmRouterClientAdapter(llmRouter);
      complianceEngine = createComplianceEngine({
        llmRouter,
        llmClient: llmClient,
        graphClient: createGraphClient(),
        timelineEngine: createTimelineEngine(),
        egressGuard: new BasicEgressGuard(),
        graphWriteService: {} as never, // Graph writes not used in Next adapter baseline wiring
        canonicalConceptHandler: { resolveAndUpsert: async () => [] },
      });
    }
    return { llmRouter: llmRouter!, complianceEngine };
  };

  return async function POST(request: Request) {
    const { complianceEngine } = getOrCreateEngine();
    try {
      // Parse and validate request body
      const body = await request.json();

      if (!body || typeof body !== 'object') {
        return new Response('Invalid request body', { status: 400 });
      }

      const { messages, profile } = body;

      // Validate messages array
      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response('No messages provided', { status: 400 });
      }

      // Validate message structure
      for (const msg of messages) {
        if (!msg || typeof msg !== 'object' ||
            typeof msg.role !== 'string' ||
            typeof msg.content !== 'string') {
          return new Response('Invalid message format', { status: 400 });
        }
      }

      // Validate profile if provided
      if (profile !== undefined && (typeof profile !== 'object' || profile === null)) {
        return new Response('Invalid profile format', { status: 400 });
      }

      const sanitizedMessages = sanitizeMessages(messages as Array<{ role: string; content: string }>);
      const shouldIncludeDisclaimer = options?.includeDisclaimer ?? true;
      const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
      const normalizedStandardDisclaimer = normalizeText(NON_ADVICE_DISCLAIMER);
      let streamedTextBuffer = '';
      let disclaimerAlreadyPresent = false;

      const stream = new ReadableStream({
        async start(controller) {
          const writer = new SseStreamWriter(controller);

          try {
            // Use ComplianceEngine to handle chat with streaming
            // This ensures proper agent routing and graph querying
            for await (const chunk of complianceEngine.handleChatStream({
              messages: sanitizedMessages,
              profile,
              tenantId: options?.tenantId ?? 'default',
            })) {
              if (chunk.type === 'metadata') {
                // Send metadata with agent info, jurisdictions, and referenced nodes
                const metadata = buildMetadataChunk({
                  agentId: chunk.metadata!.agentUsed,
                  jurisdictions: chunk.metadata!.jurisdictions,
                  uncertaintyLevel: chunk.metadata!.uncertaintyLevel,
                  disclaimerKey: DEFAULT_DISCLAIMER_KEY,
                  referencedNodes: chunk.metadata!.referencedNodes,
                });
                writer.send('metadata', metadata);
              } else if (chunk.type === 'text' && chunk.delta) {
                streamedTextBuffer += chunk.delta;
                if (!disclaimerAlreadyPresent && normalizeText(streamedTextBuffer).includes(normalizedStandardDisclaimer)) {
                  disclaimerAlreadyPresent = true;
                }
                writer.send('message', { text: chunk.delta });
              } else if (chunk.type === 'error') {
                writer.send('error', { message: chunk.error || 'Unknown error' });
                writer.close();
                return;
              } else if (chunk.type === 'done') {
                // Send disclaimer after response (if configured)
                if (
                  shouldIncludeDisclaimer &&
                  chunk.disclaimer &&
                  !disclaimerAlreadyPresent &&
                  !normalizeText(streamedTextBuffer).includes(normalizeText(chunk.disclaimer))
                ) {
                  writer.send('message', { text: `\n\n${chunk.disclaimer}` });
                }
                writer.send('done', { status: 'ok' });
                writer.close();
                return;
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            writer.send('error', { message });
            writer.send('done', { status: 'error' });
            writer.close();
          }
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
