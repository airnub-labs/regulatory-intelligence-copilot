import {
  NON_ADVICE_DISCLAIMER,
  createComplianceEngine,
  createDefaultLlmRouter,
  createGraphClient,
  createTimelineEngine,
  normalizeProfileType,
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
import type { ConversationContextStore } from '@reg-copilot/reg-intel-core';
import {
  ConversationEventHub,
  InMemoryConversationContextStore,
  InMemoryConversationStore,
  SupabaseConversationStore,
  deriveIsShared,
  type ConversationEventType,
  type SseSubscriber,
  type AuthorizationModel,
  type AuthorizationSpec,
  type ConversationStore,
  type ShareAudience,
  type TenantAccess,
} from '@reg-copilot/reg-intel-conversations';

const DEFAULT_DISCLAIMER_KEY = 'non_advice_research_tool';

export interface ChatRouteHandlerOptions {
  tenantId?: string;
  includeDisclaimer?: boolean;
  conversationStore?: ConversationStore;
  conversationContextStore?: ConversationContextStore;
  eventHub?: ConversationEventHub;
  useSupabaseConversationStore?: boolean;
}

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
  conversationId?: string;
  warnings?: string[];
}) {
  return {
    agentId: args.agentId,
    jurisdictions: args.jurisdictions,
    uncertaintyLevel: args.uncertaintyLevel ?? 'medium',
    disclaimerKey: args.disclaimerKey ?? DEFAULT_DISCLAIMER_KEY,
    referencedNodes: args.referencedNodes.map(node => (typeof node === 'string' ? node : node.id)),
    conversationId: args.conversationId,
    warnings: args.warnings,
  };
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
  send(event: 'message' | 'metadata' | 'error' | 'done' | 'disclaimer' | 'warning', data: unknown) {
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
  const conversationStore =
    options?.conversationStore ??
    ((options?.useSupabaseConversationStore ?? true) ? SupabaseConversationStore.fromEnv() : null) ??
    new InMemoryConversationStore();
  const conversationContextStore =
    options?.conversationContextStore ?? new InMemoryConversationContextStore();
  const eventHub = options?.eventHub ?? new ConversationEventHub();

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
        conversationContextStore,
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

      const {
        messages,
        message,
        profile,
        conversationId: requestConversationId,
        userId: bodyUserId,
        shareAudience,
        tenantAccess,
        authorizationModel,
        authorizationSpec,
        title,
        replaceMessageId,
      } = body;

      const headerUserId = request.headers.get('x-user-id') ?? undefined;
      const userId = headerUserId ?? (typeof bodyUserId === 'string' ? bodyUserId : undefined);
      if (!userId) {
        return new Response('userId required', { status: 400 });
      }

      const normalizedProfile = profile
        ? { ...profile, personaType: normalizeProfileType(profile.personaType) }
        : undefined;

      // Validate profile if provided
      if (profile !== undefined && (typeof profile !== 'object' || profile === null)) {
        return new Response('Invalid profile format', { status: 400 });
      }

      const tenantId = body.tenantId ?? options?.tenantId ?? 'default';

      const sanitizeIncomingMessages = Array.isArray(messages)
        ? sanitizeMessages(messages as Array<{ role: string; content: string }>)
        : [];
      const incomingMessageContent =
        typeof message === 'string'
          ? message
          : sanitizeIncomingMessages.filter(m => m.role === 'user').pop()?.content;
      if (!incomingMessageContent) {
        return new Response('No message provided', { status: 400 });
      }

      let conversationId = requestConversationId as string | undefined;
      if (!conversationId) {
        const created = await conversationStore.createConversation({
          tenantId,
          userId,
          personaId: normalizedProfile?.personaType,
          jurisdictions: normalizedProfile?.jurisdictions,
          title: typeof title === 'string' ? title : undefined,
          shareAudience: shareAudience as ShareAudience | undefined,
          tenantAccess: tenantAccess as TenantAccess | undefined,
          authorizationModel: authorizationModel as AuthorizationModel | undefined,
          authorizationSpec: authorizationSpec as AuthorizationSpec | undefined,
        });
        conversationId = created.conversationId;
      }

      const conversationRecord = await conversationStore.getConversation({
        tenantId,
        conversationId,
        userId,
      });

      if (!conversationRecord) {
        return new Response('Conversation not found or access denied', { status: 404 });
      }

      const existingMessages = await conversationStore.getMessages({
        tenantId,
        conversationId,
        userId,
        limit: 50,
      });

      const activeMessages = existingMessages.filter(msg => {
        const metadataDeleted = Boolean((msg.metadata as { deletedAt?: unknown } | undefined)?.deletedAt);
        return !msg.deletedAt && !metadataDeleted;
      });

      if (replaceMessageId) {
        const lastUserMessage = [...activeMessages]
          .reverse()
          .find(msg => msg.role === 'user');
        if (!lastUserMessage || lastUserMessage.id !== replaceMessageId) {
          return new Response('Only the last user message can be replaced', { status: 400 });
        }
      }

      const sanitizedMessages = [
        ...activeMessages
          .filter(msg => msg.id !== replaceMessageId)
          .map(msg => ({ role: msg.role, content: msg.content } as ChatMessage)),
        { role: 'user', content: incomingMessageContent } as ChatMessage,
      ];
      const { messageId: appendedMessageId } = await conversationStore.appendMessage({
        tenantId,
        conversationId,
        role: 'user',
        content: incomingMessageContent,
        userId,
        metadata: normalizedProfile ? { profile: normalizedProfile } : undefined,
      });

      if (replaceMessageId) {
        await conversationStore.softDeleteMessage({
          tenantId,
          conversationId,
          messageId: replaceMessageId,
          userId,
          supersededBy: appendedMessageId,
        });
      }
      const shouldIncludeDisclaimer = options?.includeDisclaimer ?? true;
      const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
      const normalizedStandardDisclaimer = normalizeText(NON_ADVICE_DISCLAIMER);
      let streamedTextBuffer = '';
      let disclaimerAlreadyPresent = false;
      let lastMetadata: Record<string, unknown> | null = null;
      let accumulatedWarnings: string[] = [];

      const subscriber: SseSubscriber = {
        send: (_event: ConversationEventType, _data: unknown) => {
          // placeholder replaced when writer is created
        },
      };
      const unsubscribe = eventHub.subscribe(tenantId, conversationId, subscriber);
      const isShared = deriveIsShared(conversationRecord);

      const stream = new ReadableStream({
        async start(controller) {
          const writer = new SseStreamWriter(controller);
          subscriber.send = (event: ConversationEventType, data: unknown) => writer.send(event, data);

          // ensure every subscriber for this conversation knows the identifier and sharing flag before streaming starts
          eventHub.broadcast(tenantId, conversationId, 'metadata', {
            conversationId,
            shareAudience: conversationRecord.shareAudience,
            tenantAccess: conversationRecord.tenantAccess,
            isShared,
            authorizationModel: conversationRecord.authorizationModel,
            authorizationSpec: conversationRecord.authorizationSpec,
          });

          try {
            // Use ComplianceEngine to handle chat with streaming
            // This ensures proper agent routing and graph querying
            for await (const chunk of complianceEngine.handleChatStream({
              messages: sanitizedMessages,
              profile: normalizedProfile,
              tenantId,
              conversationId,
            })) {
              if (chunk.type === 'metadata') {
                // Send metadata with agent info, jurisdictions, and referenced nodes
                const metadata = buildMetadataChunk({
                  agentId: chunk.metadata!.agentUsed,
                  jurisdictions: chunk.metadata!.jurisdictions,
                  uncertaintyLevel: chunk.metadata!.uncertaintyLevel,
                  disclaimerKey: DEFAULT_DISCLAIMER_KEY,
                  referencedNodes: chunk.metadata!.referencedNodes,
                  conversationId,
                  warnings: accumulatedWarnings,
                });
                lastMetadata = metadata;
                eventHub.broadcast(tenantId, conversationId, 'metadata', {
                  ...metadata,
                  authorizationModel: conversationRecord.authorizationModel,
                  authorizationSpec: conversationRecord.authorizationSpec,
                  shareAudience: conversationRecord.shareAudience,
                  tenantAccess: conversationRecord.tenantAccess,
                  isShared,
                });
              } else if (chunk.type === 'warning' && chunk.warnings?.length) {
                accumulatedWarnings = chunk.warnings;
                if (lastMetadata) {
                  lastMetadata = { ...lastMetadata, warnings: accumulatedWarnings };
                }
                eventHub.broadcast(tenantId, conversationId, 'warning', {
                  warnings: accumulatedWarnings,
                });
              } else if (chunk.type === 'text' && chunk.delta) {
                streamedTextBuffer += chunk.delta;
                if (!disclaimerAlreadyPresent && normalizeText(streamedTextBuffer).includes(normalizedStandardDisclaimer)) {
                  disclaimerAlreadyPresent = true;
                }
                eventHub.broadcast(tenantId, conversationId, 'message', { text: chunk.delta });
              } else if (chunk.type === 'error') {
                eventHub.broadcast(tenantId, conversationId, 'error', { message: chunk.error || 'Unknown error' });
                writer.close();
                unsubscribe();
                return;
              } else if (chunk.type === 'done') {
                await conversationStore.appendMessage({
                  tenantId,
                  conversationId,
                  userId: conversationRecord.userId ?? userId,
                  role: 'assistant',
                  content: streamedTextBuffer,
                  metadata: lastMetadata
                    ? { ...lastMetadata, warnings: accumulatedWarnings }
                    : accumulatedWarnings.length
                      ? { warnings: accumulatedWarnings }
                      : undefined,
                });
                // Send disclaimer after response (if configured)
                if (
                  shouldIncludeDisclaimer &&
                  chunk.disclaimer &&
                  !disclaimerAlreadyPresent &&
                  !normalizeText(streamedTextBuffer).includes(normalizeText(chunk.disclaimer))
                ) {
                  eventHub.broadcast(tenantId, conversationId, 'disclaimer', { text: chunk.disclaimer });
                }
                eventHub.broadcast(tenantId, conversationId, 'done', { status: 'ok' });
                writer.close();
                unsubscribe();
                return;
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            eventHub.broadcast(tenantId, conversationId, 'error', { message });
            eventHub.broadcast(tenantId, conversationId, 'done', { status: 'error' });
            writer.close();
            unsubscribe();
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

export {
  InMemoryConversationStore,
  InMemoryConversationContextStore,
  ConversationEventHub,
  SupabaseConversationStore,
  type ConversationStore,
  type ShareAudience,
  type TenantAccess,
  type AuthorizationModel,
  type AuthorizationSpec,
};
