import {
  NON_ADVICE_DISCLAIMER,
  createCanonicalConceptHandler,
  createComplianceEngine,
  createDefaultLlmRouter,
  createGraphClient,
  createGraphWriteService,
  createTimelineEngine,
  normalizeProfileType,
  sanitizeObjectForEgress,
  sanitizeTextForEgress,
  type ChatMessage,
  type CanonicalConceptHandler,
  type ComplianceEngine,
  type EgressGuard,
  type ExecutionTool,
  type GraphWriteService,
  type LlmClient,
  type LlmChatRequest,
  type LlmChatResponse,
  type LlmStreamChunk,
  type RedactedPayload,
} from '@reg-copilot/reg-intel-core';
import type {
  LlmRouter,
  LlmCompletionOptions,
  LlmPolicyStore,
} from '@reg-copilot/reg-intel-llm';
import {
  ToolRegistry,
  type E2BSandbox,
} from '@reg-copilot/reg-intel-llm';
import type { ConversationContextStore } from '@reg-copilot/reg-intel-core';
import {
  ConversationEventHub,
  ConversationListEventHub,
  SupabaseConversationContextStore,
  SupabaseConversationStore,
  presentConversation,
  presentConversationMetadata,
  type ConversationEventType,
  type ConversationListEventType,
  type ConversationRecord,
  type SseSubscriber,
  type AuthorizationModel,
  type AuthorizationSpec,
  type ConversationStore,
  type ShareAudience,
  type TenantAccess,
  ExecutionContextManager,
  SupabaseExecutionContextStore,
  type ExecutionContextStore,
  type E2BClient,
} from '@reg-copilot/reg-intel-conversations';
import { createClient } from '@supabase/supabase-js';
import neo4j, { type Driver } from 'neo4j-driver';
import { createLogger, createTracingFetch, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { trace } from '@opentelemetry/api';

const DEFAULT_DISCLAIMER_KEY = 'non_advice_research_tool';
const adapterLogger = createLogger('NextAdapter');

export interface ChatRouteHandlerOptions {
  tenantId?: string;
  includeDisclaimer?: boolean;
  conversationStore?: ConversationStore;
  conversationContextStore?: ConversationContextStore;
  eventHub?: ConversationEventHub;
  conversationListEventHub?: ConversationListEventHub;
  executionContextManager?: ExecutionContextManager;
  llmRouter?: LlmRouter;
  policyStore?: LlmPolicyStore;
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

type TraceContextPayload = {
  traceId?: string | null;
  rootSpanId?: string | null;
  rootSpanName?: string | null;
};

function normalizeTraceContext(raw: unknown): TraceContextPayload {
  if (!raw || typeof raw !== 'object') return {};
  const candidate = raw as Record<string, unknown>;

  return {
    traceId: typeof candidate.traceId === 'string' ? candidate.traceId : undefined,
    rootSpanId: typeof candidate.rootSpanId === 'string' ? candidate.rootSpanId : undefined,
    rootSpanName: typeof candidate.rootSpanName === 'string' ? candidate.rootSpanName : undefined,
  } satisfies TraceContextPayload;
}

function getActiveTraceContext(): TraceContextPayload {
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();

  if (!spanContext || !trace.isSpanContextValid(spanContext)) {
    return {};
  }

  const spanName = 'name' in (span ?? {}) ? (span as { name?: string }).name : undefined;

  return {
    traceId: spanContext.traceId,
    rootSpanId: spanContext.spanId,
    rootSpanName: spanName,
  } satisfies TraceContextPayload;
}

function resolveTraceContext(bodyValue: unknown): TraceContextPayload {
  const provided = normalizeTraceContext(bodyValue);
  const active = getActiveTraceContext();

  return {
    traceId: provided.traceId ?? active.traceId,
    rootSpanId: provided.rootSpanId ?? active.rootSpanId,
    rootSpanName: provided.rootSpanName ?? active.rootSpanName,
  } satisfies TraceContextPayload;
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
  conversationContextSummary?: string;
  priorTurnNodes?: Array<{ id: string; label: string; type: string }>;
}) {
  return {
    agentId: args.agentId,
    jurisdictions: args.jurisdictions,
    uncertaintyLevel: args.uncertaintyLevel ?? 'medium',
    disclaimerKey: args.disclaimerKey ?? DEFAULT_DISCLAIMER_KEY,
    referencedNodes: args.referencedNodes.map(node => (typeof node === 'string' ? node : node.id)),
    conversationId: args.conversationId,
    warnings: args.warnings,
    conversationContextSummary: args.conversationContextSummary,
    priorTurnNodes: args.priorTurnNodes,
  };
}

type ConversationStoreResolution = Required<
  Pick<ChatRouteHandlerOptions, 'conversationStore' | 'conversationContextStore'>
> & {
  mode: 'memory' | 'supabase' | 'provided';
  warnings?: string[];
  readinessCheck?: () => Promise<void>;
};

function resolveSupabaseCredentials() {
  // Service-role credentials must never be initialized in a browser bundle.
  if (typeof window !== 'undefined') return null;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return { supabaseUrl, supabaseKey };
}

function resolveGraphWriteMode(): 'auto' | 'memgraph' | 'memory' {
  const envValue =
    process.env.COPILOT_GRAPH_WRITE_MODE ?? process.env.COPILOT_GRAPH_WRITES_MODE ?? 'auto';
  const normalized = envValue.trim().toLowerCase();

  if (['memory', 'inmemory', 'in-memory'].includes(normalized)) return 'memory';
  if (['memgraph', 'neo4j', 'graph'].includes(normalized)) return 'memgraph';
  return 'auto';
}

const conversationStoreLogger = adapterLogger.child({ component: 'conversation-store' });
const graphLogger = adapterLogger.child({ component: 'graph-write' });
const chatRouteLogger = adapterLogger.child({ route: 'chat' });
const toolRegistryLogger = adapterLogger.child({ component: 'tool-registry' });

  function logConversationStore(mode: string, message: string, payload?: Record<string, unknown>) {
    conversationStoreLogger.info({ mode, ...(payload ?? {}) }, message);
  }

async function validateSupabaseHealth(client: ReturnType<typeof createClient>) {
  const { data, error } = await client.rpc('conversation_store_healthcheck');
  if (error) {
    throw new Error(`Supabase conversation healthcheck failed: ${error.message}`);
  }

  const rows = (data as Array<{ table_name: string; rls_enabled: boolean; policy_count: number }>) ?? [];
  const tables = new Map(rows.map(row => [row.table_name, row]));
  const missingTables = ['conversations', 'conversation_messages'].filter(table => !tables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Supabase is missing required tables: ${missingTables.join(', ')}`);
  }

  const rlsIssues = rows.filter(row => !row.rls_enabled || row.policy_count === 0);
  if (rlsIssues.length > 0) {
    const detail = rlsIssues
      .map(row => `${row.table_name} (rls: ${row.rls_enabled}, policies: ${row.policy_count})`)
      .join('; ');
    throw new Error(`Supabase RLS misconfigured for: ${detail}`);
  }
}

function resolveConversationStores(options?: ChatRouteHandlerOptions): ConversationStoreResolution {
  const providedConversationStore = options?.conversationStore;
  const providedContextStore = options?.conversationContextStore;

  if (providedConversationStore || providedContextStore) {
    if (!providedConversationStore || !providedContextStore) {
      throw new Error('Both conversationStore and conversationContextStore must be provided together.');
    }

    logConversationStore('provided', 'Using caller-supplied conversation store implementations');
    return {
      mode: 'provided',
      conversationStore: providedConversationStore,
      conversationContextStore: providedContextStore,
    };
  }

  const credentials = resolveSupabaseCredentials();
  if (!credentials) {
    throw new Error('Supabase credentials missing; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use the Supabase conversation store');
  }

  const tracingFetch = createTracingFetch();
  const client = createClient(credentials.supabaseUrl, credentials.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: tracingFetch },
  });
  const internalClient = createClient(credentials.supabaseUrl, credentials.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'copilot_core' },
    global: { fetch: tracingFetch },
  });

  logConversationStore('supabase', 'Using SupabaseConversationStore', { supabaseUrl: credentials.supabaseUrl });
  return {
    mode: 'supabase',
    conversationStore: new SupabaseConversationStore(client, internalClient),
    conversationContextStore: new SupabaseConversationContextStore(client, internalClient),
  };
}

type GraphWriteDependencies = {
  driver: Driver;
  graphWriteService: GraphWriteService;
  canonicalConceptHandler: CanonicalConceptHandler;
};

function resolveGraphWriteDependencies(tenantId?: string): GraphWriteDependencies | null {
  const graphWriteMode = resolveGraphWriteMode();
  if (graphWriteMode === 'memory') {
    graphLogger.info(
      'Graph write path disabled: COPILOT_GRAPH_WRITE_MODE is set to memory. Concept capture will use in-memory fallbacks only.',
    );
    return null;
  }

  const uri =
    process.env.MEMGRAPH_URI ??
    process.env.MEMGRAPH_URL ??
    process.env.NEO4J_URI ??
    process.env.NEO4J_URL;
  if (!uri) {
    const hint =
      graphWriteMode === 'memgraph'
        ? 'Graph write mode is set to memgraph but MEMGRAPH_URI/MEMGRAPH_URL is missing.'
        : 'MEMGRAPH_URI (or MEMGRAPH_URL) is not configured. Set MEMGRAPH_URI, MEMGRAPH_USERNAME, and MEMGRAPH_PASSWORD in your deployment to enable concept capture.';
    graphLogger.warn(`Graph write path disabled: ${hint}`);
    return null;
  }

  const username = process.env.MEMGRAPH_USERNAME ?? process.env.NEO4J_USERNAME;
  const password = process.env.MEMGRAPH_PASSWORD ?? process.env.NEO4J_PASSWORD;
  const auth = username && password ? neo4j.auth.basic(username, password) : undefined;

  const driver = neo4j.driver(uri, auth);
  driver
    .verifyConnectivity()
    .then(() => {
        graphLogger.info({ uri }, 'Graph write dependencies verified');
      })
    .catch(error => {
      graphLogger.warn(
        { error },
        'Graph write connectivity check failed; concept capture will be disabled unless configuration is fixed.'
      );
    });
  const graphWriteService = createGraphWriteService({
    driver,
    tenantId,
    defaultSource: 'agent',
  });

  return {
    driver,
    graphWriteService,
    canonicalConceptHandler: createCanonicalConceptHandler({ driver }),
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
  send(event: ConversationEventType, data: unknown) {
    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      const chunk = `event: ${event}\n` + `data: ${payload}\n\n`;
      this.controller.enqueue(this.encoder.encode(chunk));
    } catch (error) {
      // Controller may be closed or in error state
      // Don't propagate error - just log it
      console.warn(`Failed to send SSE event '${event}':`, error);
    }
  }

  /**
   * Close the SSE stream
   */
  close() {
    try {
      this.controller.close();
    } catch (error) {
      // Controller may already be closed (non-critical)
      console.debug('Failed to close SSE controller (non-critical):', error);
    }
  }
}

/**
 * Convert ToolRegistry tools to ExecutionTool format for ComplianceEngine
 */
function convertToolRegistryToExecutionTools(toolRegistry: ToolRegistry): ExecutionTool[] {
  const toolNames = toolRegistry.getToolNames();
  const executionTools: ExecutionTool[] = [];

  for (const name of toolNames) {
    const tool = toolRegistry.getTool(name);
    if (!tool) continue;

    // Convert Zod schema to JSON schema format if needed
    const parameters = tool.schema._def?.typeName === 'ZodObject'
      ? {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.schema.shape || {}).map(([key, value]) => {
              const zodType = value as { _def?: { typeName?: string; description?: string } };
              return [key, {
                type: zodType._def?.typeName?.replace('Zod', '').toLowerCase() || 'string',
                description: zodType._def?.description || key,
              }];
            })
          ),
        }
      : { type: 'object', properties: {} };

    executionTools.push({
      name: tool.name,
      description: tool.description,
      parameters,
      execute: async (args: Record<string, unknown>) => {
        return tool.execute(args);
      },
    });
  }

  return executionTools;
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
  const {
    conversationStore,
    conversationContextStore,
    warnings: conversationStoreWarnings,
    readinessCheck,
  } = resolveConversationStores(options);
  const conversationStoreReady = readinessCheck?.();
  const eventHub = options?.eventHub ?? new ConversationEventHub();
  const conversationListHub = options?.conversationListEventHub ?? new ConversationListEventHub();
    const graphDeps = (() => {
      try {
        return resolveGraphWriteDependencies(options?.tenantId);
      } catch (error) {
        graphLogger.warn({ error }, 'Graph write service unavailable; falling back to read-only mode');
        return null;
      }
    })();
  const graphWarning = graphDeps
    ? undefined
    : 'Concept capture is disabled: configure MEMGRAPH_URI, MEMGRAPH_USERNAME, and MEMGRAPH_PASSWORD to persist captured concepts to Memgraph.';

  const generateConversationTitle = (text: string) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'New conversation';
    const truncated = cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
    const words = truncated.split(' ');
    return words.slice(0, 12).join(' ');
  };

  const notifyListSubscribers = (
    tenantId: string,
    event: ConversationListEventType,
    record: ConversationRecord
  ) => {
    conversationListHub.broadcast(tenantId, event, {
      conversation: presentConversation(record),
    });
  };

  const getOrCreateEngine = () => {
    if (!complianceEngine) {
      // Use provided llmRouter or create one with policyStore
      llmRouter = options?.llmRouter ?? createDefaultLlmRouter({ policyStore: options?.policyStore });
      const llmClient = new LlmRouterClientAdapter(llmRouter);
      complianceEngine = createComplianceEngine({
        llmRouter,
        llmClient: llmClient,
        graphClient: createGraphClient(),
        timelineEngine: createTimelineEngine(),
        egressGuard: new BasicEgressGuard(),
        graphWriteService: graphDeps?.graphWriteService,
        canonicalConceptHandler: graphDeps?.canonicalConceptHandler,
        conceptCaptureWarning: graphWarning,
        conversationContextStore,
      });
    }
    return { llmRouter: llmRouter!, complianceEngine };
  };

  return async function POST(request: Request) {
    if (conversationStoreReady) {
      await conversationStoreReady;
    }
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
        traceContext: incomingTraceContext,
        shareAudience,
        tenantAccess,
        authorizationModel,
        authorizationSpec,
        title,
        replaceMessageId,
        forceTool,
      } = body;

      const headerUserId = request.headers.get('x-user-id') ?? undefined;
      const userId = headerUserId ?? (typeof bodyUserId === 'string' ? bodyUserId : undefined);
      if (!userId) {
        return new Response('userId required', { status: 400 });
      }

      const normalizedProfile = profile
        ? { ...profile, personaType: normalizeProfileType(profile.personaType) }
        : undefined;

      const traceContext = resolveTraceContext(incomingTraceContext);

      // Validate profile if provided
        if (profile !== undefined && (typeof profile !== 'object' || profile === null)) {
          return new Response('Invalid profile format', { status: 400 });
        }

        const tenantId = body.tenantId ?? options?.tenantId ?? 'default';
        const routeLogger = chatRouteLogger.child({ tenantId, userId });

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

        return requestContext.run(
          { tenantId, userId, conversationId: requestConversationId as string | undefined },
          async () => {
            routeLogger.info({
              conversationId: requestConversationId,
            }, 'Handling chat request');

            let conversationId = requestConversationId as string | undefined;
            if (!conversationId) {
              const created = await conversationStore.createConversation({
                tenantId,
                userId,
                traceId: traceContext.traceId,
                rootSpanId: traceContext.rootSpanId,
                rootSpanName: traceContext.rootSpanName,
                personaId: normalizedProfile?.personaType,
                jurisdictions: normalizedProfile?.jurisdictions,
                title: typeof title === 'string' ? title : undefined,
                shareAudience: shareAudience as ShareAudience | undefined,
                tenantAccess: tenantAccess as TenantAccess | undefined,
                authorizationModel: authorizationModel as AuthorizationModel | undefined,
                authorizationSpec: authorizationSpec as AuthorizationSpec | undefined,
              });
              conversationId = created.conversationId;
              requestContext.set({ tenantId, userId, conversationId });
              routeLogger.info({ conversationId }, 'Created new conversation');
            }

            if (conversationId) {
              requestContext.set({ tenantId, userId, conversationId });
              routeLogger.info({ conversationId }, 'Conversation resolved');
            }

            const conversationRecord = await conversationStore.getConversation({
              tenantId,
              conversationId,
              userId,
            });

            if (!conversationRecord) {
              return new Response('Conversation not found or access denied', { status: 404 });
            }

            // Get or create execution context for this path (if ExecutionContextManager configured)
            let toolRegistry: ToolRegistry | undefined;

            if (options?.executionContextManager && conversationRecord.activePathId) {
              try {
                const contextResult = await options.executionContextManager.getOrCreateContext({
                  tenantId,
                  conversationId,
                  pathId: conversationRecord.activePathId,
                });

                // Cast sandbox to llm package's E2BSandbox type for compatibility
                const sandbox = contextResult.sandbox as unknown as E2BSandbox;

                // Create tool registry with the sandbox
                toolRegistry = new ToolRegistry({
                  sandbox,
                  logger: {
                    info: (msg: string, meta?: unknown) =>
                      toolRegistryLogger.info(meta as Record<string, unknown> | undefined ?? {}, msg),
                    error: (msg: string, meta?: unknown) =>
                      toolRegistryLogger.error(meta as Record<string, unknown> | undefined ?? {}, msg),
                  },
                });

                chatRouteLogger.info({
                  pathId: conversationRecord.activePathId,
                  sandboxId: sandbox.sandboxId,
                  wasCreated: contextResult.wasCreated,
                  toolsRegistered: toolRegistry.getToolNames(),
                }, 'Execution context ready');
              } catch (error) {
                chatRouteLogger.error({ error }, 'Failed to setup execution context');
                // Continue without code execution tools if setup fails
              }
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

            // Validate replaceMessageId if provided
            let editIndex = -1;
            if (replaceMessageId) {
              editIndex = activeMessages.findIndex(msg => msg.id === replaceMessageId);
              const messageToReplace = activeMessages[editIndex];
              if (!messageToReplace) {
                return new Response('Message to replace not found', { status: 404 });
              }
              if (messageToReplace.role !== 'user') {
                return new Response('Only user messages can be replaced', { status: 400 });
              }
            }

            // Build message history for LLM:
            // - If editing (replaceMessageId exists): include only messages BEFORE the edited message
            // - If not editing: include all active messages
            // This creates a branch effect when editing mid-conversation
            const messagesToInclude = editIndex >= 0
              ? activeMessages.slice(0, editIndex)
              : activeMessages;

            const sanitizedMessages = [
              ...messagesToInclude.map(msg => ({ role: msg.role, content: msg.content } as ChatMessage)),
              { role: 'user', content: incomingMessageContent } as ChatMessage,
            ];
            const { messageId: appendedMessageId } = await conversationStore.appendMessage({
              tenantId,
              conversationId,
              role: 'user',
              content: incomingMessageContent,
              userId,
              traceId: traceContext.traceId,
              rootSpanId: traceContext.rootSpanId,
              rootSpanName: traceContext.rootSpanName,
              metadata: normalizedProfile ? { profile: normalizedProfile } : undefined,
            });

            const conversationAfterUser = await conversationStore.getConversation({
              tenantId,
              conversationId,
              userId,
            });

            if (conversationAfterUser && !conversationAfterUser.title) {
              const generatedTitle = generateConversationTitle(incomingMessageContent);
              await conversationStore.updateSharing({
                tenantId,
                conversationId,
                userId,
                title: generatedTitle,
              });
            }

            const refreshedConversation = await conversationStore.getConversation({
              tenantId,
              conversationId,
              userId,
            });

            if (refreshedConversation) {
              notifyListSubscribers(tenantId, 'upsert', refreshedConversation);
            }

      // When editing a message, soft-delete the edited message and all subsequent messages
      // NOTE: This legacy code path is no longer used - UI now creates branches instead
      // Keeping for backward compatibility with older API clients
      if (replaceMessageId && editIndex >= 0) {
        // Soft-delete the edited message
        await conversationStore.softDeleteMessage({
          tenantId,
          conversationId,
          messageId: replaceMessageId,
          userId,
        });

        // Soft-delete all messages after the edited one
        const messagesToDelete = activeMessages.slice(editIndex + 1);
        for (const msg of messagesToDelete) {
          await conversationStore.softDeleteMessage({
            tenantId,
            conversationId,
            messageId: msg.id,
            userId,
          });
        }
      }
      const shouldIncludeDisclaimer = options?.includeDisclaimer ?? true;
      const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
      const normalizedStandardDisclaimer = normalizeText(NON_ADVICE_DISCLAIMER);
      let streamedTextBuffer = '';
      let disclaimerAlreadyPresent = false;
      let lastMetadata: Record<string, unknown> | null = null;
      let accumulatedWarnings: string[] = [
        ...(conversationStoreWarnings ?? []),
        ...(graphWarning ? [graphWarning] : []),
      ];

        const subscriber: SseSubscriber<ConversationEventType> = {
          send: (_event: ConversationEventType, _data: unknown) => {
            // placeholder replaced when writer is created
          },
        };
        const unsubscribe = eventHub.subscribe(tenantId, conversationId, subscriber);
      const conversationMetadata = presentConversationMetadata(conversationRecord);
      const isShared = conversationMetadata.isShared;

      const stream = new ReadableStream({
        async start(controller) {
          const writer = new SseStreamWriter(controller);
            subscriber.send = (event: ConversationEventType, data: unknown) => writer.send(event, data);

          // Set up abort signal handler to interrupt async iteration on request cancellation
          let aborted = false;
          const abortHandler = () => {
            aborted = true;
            unsubscribe();
            try {
              controller.close();
            } catch (error) {
              // Controller may already be closed (non-critical)
              console.debug('Failed to close controller on abort (non-critical):', error);
            }
          };
          request.signal.addEventListener('abort', abortHandler);

          // ensure every subscriber for this conversation knows the identifier and sharing flag before streaming starts
          eventHub.broadcast(tenantId, conversationId, 'metadata', {
            conversationId,
            shareAudience: conversationMetadata.shareAudience,
            tenantAccess: conversationMetadata.tenantAccess,
            title: conversationMetadata.title,
            jurisdictions: conversationMetadata.jurisdictions,
            archivedAt: conversationMetadata.archivedAt ?? undefined,
            lastMessageAt: conversationMetadata.lastMessageAt ?? undefined,
            isShared,
          });

          try {
            // Convert ToolRegistry to ExecutionTools if available
            const executionTools = toolRegistry
              ? convertToolRegistryToExecutionTools(toolRegistry)
              : undefined;

            // Validate forceTool if provided
            const validatedForceTool = forceTool && typeof forceTool === 'object' && typeof (forceTool as Record<string, unknown>).name === 'string'
              ? {
                  name: (forceTool as Record<string, unknown>).name as string,
                  args: ((forceTool as Record<string, unknown>).args as Record<string, unknown>) ?? {},
                }
              : undefined;

            // Use ComplianceEngine to handle chat with streaming
            // This ensures proper agent routing and graph querying
            for await (const chunk of complianceEngine.handleChatStream({
              messages: sanitizedMessages,
              profile: normalizedProfile,
              tenantId,
              conversationId,
              traceContext,
              executionTools,
              forceTool: validatedForceTool,
            })) {
              // Break out of async iteration if request was aborted
              if (aborted) {
                break;
              }

              if (chunk.type === 'metadata') {
                // Send metadata with agent info, jurisdictions, and referenced nodes
                requestContext.set({ agentId: chunk.metadata!.agentUsed });
                const metadata = buildMetadataChunk({
                  agentId: chunk.metadata!.agentUsed,
                  jurisdictions: chunk.metadata!.jurisdictions,
                  uncertaintyLevel: chunk.metadata!.uncertaintyLevel,
                  disclaimerKey: DEFAULT_DISCLAIMER_KEY,
                  referencedNodes: chunk.metadata!.referencedNodes,
                  conversationId,
                  warnings: accumulatedWarnings,
                  conversationContextSummary: chunk.metadata!.conversationContextSummary,
                  priorTurnNodes: chunk.metadata!.priorTurnNodes,
                });
                lastMetadata = metadata;
                eventHub.broadcast(tenantId, conversationId, 'metadata', {
                  ...metadata,
                  conversationId,
                  shareAudience: conversationMetadata.shareAudience,
                  tenantAccess: conversationMetadata.tenantAccess,
                  title: conversationMetadata.title,
                  jurisdictions: conversationMetadata.jurisdictions,
                  archivedAt: conversationMetadata.archivedAt ?? undefined,
                  lastMessageAt: conversationMetadata.lastMessageAt ?? undefined,
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
                  traceId: traceContext.traceId,
                  rootSpanId: traceContext.rootSpanId,
                  rootSpanName: traceContext.rootSpanName,
                  role: 'assistant',
                  content: streamedTextBuffer,
                  metadata: lastMetadata
                    ? { ...lastMetadata, warnings: accumulatedWarnings }
                    : accumulatedWarnings.length
                      ? { warnings: accumulatedWarnings }
                      : undefined,
                });
                const postAssistantConversation = await conversationStore.getConversation({
                  tenantId,
                  conversationId,
                  userId,
                });
                if (postAssistantConversation) {
                  notifyListSubscribers(tenantId, 'upsert', postAssistantConversation);
                }
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
          }
        );
    } catch (error) {
      chatRouteLogger.error({ error }, 'Chat route failed');
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
  ConversationEventHub,
  type ConversationStore,
  type ShareAudience,
  type TenantAccess,
  type AuthorizationModel,
  type AuthorizationSpec,
};

// Execution Context Helpers
export {
  createExecutionContextManager,
  initializeExecutionContextManager,
  getExecutionContextManager,
  getExecutionContextManagerSafe,
  isExecutionContextManagerInitialized,
  shutdownExecutionContextManager,
  E2BSandboxClient,
  type ExecutionContextConfig,
} from './executionContext.js';
