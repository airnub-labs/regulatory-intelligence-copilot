/**
 * Compliance Engine - Main orchestrator for regulatory intelligence queries
 *
 * Coordinates between:
 * - User requests (chat messages + profile context)
 * - Domain agents (via GlobalRegulatoryComplianceAgent)
 * - Infrastructure (LLM router, graph client, timeline engine, egress guard)
 *
 * This is the primary entry point for the regulatory intelligence copilot.
 */

import type {
  ChatMessage,
  UserProfile,
  AgentContext,
  AgentInput,
  GraphClient,
  TimelineEngine,
  EgressGuard,
  LlmClient,
  LlmStreamChunk,
  LlmChatRequest,
} from '../types.js';
import { GlobalRegulatoryComplianceAgent } from '../agents/GlobalRegulatoryComplianceAgent.js';
import { NON_ADVICE_DISCLAIMER } from '../constants.js';
import { ComplianceError } from '../errors.js';
import type { GraphWriteService } from '@reg-copilot/reg-intel-graph';
import type { LlmRouter, LlmStreamChunk as RouterStreamChunk, LlmCompletionOptions } from '@reg-copilot/reg-intel-llm';
import {
  agentContextAspect,
  createPromptBuilder,
  disclaimerAspect,
  jurisdictionAspect,
  profileContextAspect,
  conversationContextAspect,
} from '@reg-copilot/reg-intel-prompts';
import { REGULATORY_COPILOT_SYSTEM_PROMPT } from '../llm/llmClient.js';
import {
  createLogger,
  requestContext,
  withSpan,
} from '@reg-copilot/reg-intel-observability';
import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';

export type {
  GraphClient,
  TimelineEngine,
  EgressGuard,
  LlmClient,
  ChatMessage,
  UserProfile,
  AgentContext,
  AgentInput,
  LlmStreamChunk,
  LlmChatRequest,
} from '../types.js';

/**
 * Request to the compliance engine
 */
export interface ComplianceRequest {
  messages: ChatMessage[];
  profile?: UserProfile;
  tenantId?: string;
  conversationId?: string;
}

/**
 * Response from the compliance engine
 */
export interface ComplianceResponse {
  answer: string;
  referencedNodes: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  agentUsed: string;
  jurisdictions: string[];
  warnings?: string[];
  uncertaintyLevel?: 'low' | 'medium' | 'high';
  followUps?: string[];
  disclaimer: string;
}

/**
 * Streaming chunk from compliance engine
 */
export interface ComplianceStreamChunk {
  type: 'metadata' | 'text' | 'done' | 'error' | 'warning';
  // Metadata (sent first)
  metadata?: {
    agentUsed: string;
    jurisdictions: string[];
    uncertaintyLevel?: 'low' | 'medium' | 'high';
    referencedNodes: Array<{
      id: string;
      label: string;
      type: string;
    }>;
  };
  // Text delta (streamed during response)
  delta?: string;
  warnings?: string[];
  // Final data (sent at end)
  followUps?: string[];
  disclaimer?: string;
  referencedNodes?: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  // Error
  error?: string;
}

/**
 * Dependencies for ComplianceEngine
 */
export interface ComplianceEngineDeps {
  llmRouter: LlmRouter;
  graphWriteService?: GraphWriteService;
  canonicalConceptHandler?: CanonicalConceptHandler;
  conceptCaptureWarning?: string;
  conversationContextStore?: ConversationContextStore;
  llmClient: LlmClient;
  graphClient: GraphClient;
  timelineEngine: TimelineEngine;
  egressGuard: EgressGuard;
}

/**
 * Canonical concept handler used to resolve and upsert captured concepts
 */
export interface CanonicalConceptHandler {
  resolveAndUpsert(
    concepts: CapturedConcept[],
    graphWriteService: GraphWriteService
  ): Promise<string[]>;
}

/**
 * Minimal representation of a captured concept
 */
export interface CapturedConcept {
  label: string;
  type?: string;
  jurisdiction?: string;
  domain?: string;
  kind?: string;
  prefLabel?: string;
  altLabels?: string[];
  definition?: string;
  sourceUrls?: string[];
  canonicalId?: string;
  nodeId?: string;
}

/**
 * Conversation context store for active node tracking
 */
export interface ConversationIdentity {
  tenantId: string;
  conversationId: string;
  userId?: string | null;
}

export interface ConversationContext {
  activeNodeIds: string[];
  traceId?: string | null;
}

export const EMPTY_CONVERSATION_CONTEXT: ConversationContext = { activeNodeIds: [] };

export interface ConversationContextStore {
  load(identity: ConversationIdentity): Promise<ConversationContext | null>;
  save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void>;
  mergeActiveNodeIds?(
    identity: ConversationIdentity,
    nodeIds: string[],
    options?: { traceId?: string | null }
  ): Promise<void>;
}

/**
 * LLM tool stream chunk (from router providers)
 */
type ToolStreamChunk = Extract<RouterStreamChunk, { type: 'tool' }> & {
  argsJson: unknown;
  /** Legacy fields kept for defensive parsing of older provider shapes. */
  toolName?: string;
  arguments?: unknown;
  payload?: unknown;
};

type RouterChunk = RouterStreamChunk | ToolStreamChunk;

interface ResolvedNodeMeta {
  id: string;
  label: string;
  type: string;
}

interface ToolAwareCompletionOptions extends LlmCompletionOptions {
  tools?: Array<Record<string, unknown>>;
  toolChoice?: 'auto' | 'required' | { type: string; function: { name: string } };
}

const CAPTURE_CONCEPTS_TOOL = {
  type: 'function',
  name: 'capture_concepts',
  description:
    'Capture canonical regulatory concepts referenced in the assistant answer for graph enrichment',
  parameters: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        description: 'List of canonical or candidate concepts referenced in the answer',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            type: { type: 'string' },
            jurisdiction: { type: 'string' },
            domain: { type: 'string' },
            kind: { type: 'string' },
            prefLabel: { type: 'string' },
            altLabels: {
              type: 'array',
              items: { type: 'string' },
            },
            definition: { type: 'string' },
            sourceUrls: {
              type: 'array',
              items: { type: 'string' },
            },
            canonicalId: { type: 'string' },
            nodeId: { type: 'string' },
          },
          required: ['label'],
        },
      },
    },
    required: ['concepts'],
  },
};

/**
 * ComplianceEngine orchestrates regulatory intelligence queries
 */
export class ComplianceEngine {
  private deps: ComplianceEngineDeps;
  private conceptCaptureEnabled: boolean;
  private conceptCaptureWarning?: string;
  private conceptWarningLogged = false;
  private logger = createLogger('ComplianceEngine');
  private instrumentedGraphClient: GraphClient;
  private instrumentedTimelineEngine: TimelineEngine;
  private instrumentedEgressGuard: EgressGuard;

  constructor(deps: ComplianceEngineDeps) {
    this.deps = deps;
    this.conceptCaptureEnabled = Boolean(
      deps.canonicalConceptHandler && deps.graphWriteService
    );
    this.conceptCaptureWarning = deps.conceptCaptureWarning;
    this.instrumentedGraphClient = this.instrumentAsyncWithSpan(
      'compliance.graph.query',
      deps.graphClient
    );
    this.instrumentedTimelineEngine = this.instrumentSyncWithSpan(
      'compliance.timeline.evaluate',
      deps.timelineEngine
    );
    this.instrumentedEgressGuard = this.instrumentSyncWithSpan(
      'compliance.egress.guard',
      deps.egressGuard
    );
  }

  private getActiveTraceId() {
    const spanContext = trace.getActiveSpan()?.spanContext();

    if (!spanContext || !trace.isSpanContextValid(spanContext)) {
      return undefined;
    }

    return spanContext.traceId;
  }

  private instrumentAsyncWithSpan<T extends object>(
    name: string,
    target: T
  ): T {
    return new Proxy(target, {
      get: (obj, prop: string, receiver) => {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof value !== 'function') return value;

        return async (...args: unknown[]) =>
          this.runWithTracing(
            name,
            { method: prop },
            async () => value.apply(obj, args)
          );
      },
    });
  }

  private instrumentSyncWithSpan<T extends object>(
    name: string,
    target: T
  ): T {
    return new Proxy(target, {
      get: (obj, prop: string, receiver) => {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof value !== 'function') return value;

        return (...args: unknown[]) =>
          this.runWithTracingSync(
            name,
            { method: prop },
            () => (value as (...fnArgs: unknown[]) => unknown).apply(obj, args)
          );
      },
    });
  }

  private async buildPromptMetadata(
    profile?: UserProfile,
    conversationContext?: { summary?: string; nodes: ResolvedNodeMeta[] }
  ) {
    const builder = createPromptBuilder([
      jurisdictionAspect,
      agentContextAspect,
      profileContextAspect,
      conversationContextAspect,
      disclaimerAspect,
    ]);

    const prompt = await builder({
      basePrompt: REGULATORY_COPILOT_SYSTEM_PROMPT,
      jurisdictions: profile?.jurisdictions,
      profile,
      agentId: 'ComplianceEngine',
      includeDisclaimer: true,
      conversationContextSummary: conversationContext?.summary,
      conversationContextNodes: conversationContext?.nodes,
    });

    const jurisdictions =
      prompt.context.jurisdictions || prompt.context.profile?.jurisdictions || [];

    return {
      systemPrompt: prompt.systemPrompt,
      jurisdictions,
      disclaimer: prompt.context.includeDisclaimer ? NON_ADVICE_DISCLAIMER : '',
    };
  }

  private parseCapturedConcepts(payload: unknown): CapturedConcept[] {
    if (!payload) {
      return [];
    }

    if (typeof payload === 'string') {
      try {
        return this.parseCapturedConcepts(JSON.parse(payload));
      } catch (error) {
        console.warn('Failed to parse capture_concepts payload', error);
        return [];
      }
    }

    if (
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as { concepts?: CapturedConcept[] }).concepts)
    ) {
      return (payload as { concepts: CapturedConcept[] }).concepts;
    }

    if (Array.isArray(payload)) {
      return payload as CapturedConcept[];
    }

    console.warn('Unrecognized capture_concepts payload shape', { payload });
    return [];
  }

  private async handleConceptChunk(chunk: ToolStreamChunk): Promise<string[]> {
    const toolName = chunk.name ?? chunk.toolName;
    return this.runWithTracing(
      'compliance.concepts.handle',
      { toolName },
      async () => {
        if (!this.conceptCaptureEnabled || !this.deps.canonicalConceptHandler || !this.deps.graphWriteService) {
          if (!this.conceptWarningLogged) {
            console.warn(
              this.conceptCaptureWarning ||
                'Concept capture skipped: Graph write dependencies are not available.'
            );
            this.conceptWarningLogged = true;
          }
          return [];
        }

        const payload =
          chunk.argsJson !== undefined
            ? chunk.argsJson
            : chunk.arguments ?? chunk.payload;
        const concepts = this.parseCapturedConcepts(payload);
        const isConceptPayload = concepts.length > 0;
        if (toolName !== 'capture_concepts' && !isConceptPayload) {
          return [];
        }
        if (!concepts.length) {
          return [];
        }

        try {
          return await this.deps.canonicalConceptHandler.resolveAndUpsert(
            concepts,
            this.deps.graphWriteService
          );
        } catch (error) {
          console.warn('Failed to resolve and upsert captured concepts', error);
          return [];
        }
      }
    );
  }

  private wrapRouterError(error?: Error) {
    const message = error?.message?.trim();
    const friendlyMessage = message
      ? `LLM/tool call failed: ${message}`
      : 'LLM/tool call failed with an unknown error';

    return new ComplianceError(
      friendlyMessage,
      error ? { cause: error } : undefined
    );
  }

  private async *routeThroughRouter(
    request: LlmChatRequest,
    conceptNodeIds: Set<string>,
    options: ToolAwareCompletionOptions
  ): AsyncIterable<LlmStreamChunk> {
    const { messages, max_tokens, ...requestOptions } = request;
    const mergedOptions: ToolAwareCompletionOptions = { ...options };

    for (const [key, value] of Object.entries(requestOptions)) {
      if (value !== undefined) {
        (mergedOptions as Record<string, unknown>)[key] = value;
      }
    }

    if (max_tokens !== undefined) {
      mergedOptions.maxTokens = max_tokens;
    }

    const streamSpanAttributes = {
      task: mergedOptions.task ?? 'main-chat',
      requestedModel: mergedOptions.model,
      tenantId: mergedOptions.tenantId,
      egressMode: mergedOptions.egressModeOverride ?? 'default',
    };

    const stream = await this.runWithTracing(
      'compliance.llm.stream',
      streamSpanAttributes,
      async () => this.deps.llmRouter.streamChat(messages, mergedOptions as LlmCompletionOptions)
    );

    for await (const chunk of stream as AsyncIterable<RouterChunk>) {
      if (chunk.type === 'tool') {
        const resolvedIds = await this.handleConceptChunk(chunk as ToolStreamChunk);
        resolvedIds.forEach(id => conceptNodeIds.add(id));
        continue;
      }

      if (chunk.type === 'text') {
        yield { type: 'text', delta: chunk.delta };
      } else if (chunk.type === 'error') {
        const wrappedError = this.wrapRouterError(chunk.error);
        yield { type: 'error', error: wrappedError };
      } else if (chunk.type === 'done') {
        yield { type: 'done' };
      }
    }
  }

  private createConceptAwareLlmClient(
    conceptNodeIds: Set<string>,
    tenantId?: string
  ): LlmClient {
    const tools = this.conceptCaptureEnabled ? [CAPTURE_CONCEPTS_TOOL] : [];
    const options: ToolAwareCompletionOptions = {
      task: 'main-chat',
      tenantId,
      tools: tools.length ? tools : undefined,
      toolChoice: tools.length ? 'auto' : undefined,
    };

    return {
      chat: async (request: LlmChatRequest) => {
        const chunks = this.routeThroughRouter(request, conceptNodeIds, options);
        let content = '';
        for await (const chunk of chunks) {
          if (chunk.type === 'text') {
            content += chunk.delta ?? '';
          } else if (chunk.type === 'error') {
            const wrappedError = this.wrapRouterError(chunk.error);
            throw wrappedError;
          }
        }
        return { content };
      },
      streamChat: (request: LlmChatRequest) =>
        this.routeThroughRouter(request, conceptNodeIds, options),
    };
  }

  private mergeReferencedNodes(
    agentNodes: Array<{ id: string; label: string; type: string }>,
    conceptNodeIds: Set<string>
  ) {
    const merged = new Map<string, { id: string; label: string; type: string }>();

    agentNodes.forEach(node => {
      merged.set(node.id, node);
    });

    conceptNodeIds.forEach(id => {
      if (!merged.has(id)) {
        merged.set(id, { id, label: 'Captured concept', type: 'Concept' });
      }
    });

    return Array.from(merged.values());
  }

  private async resolveActiveNodes(nodeIds: string[]): Promise<ResolvedNodeMeta[]> {
    if (!nodeIds.length) {
      return [];
    }

    const escapedIds = nodeIds.map(id =>
      id.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    );
    const query = `
      MATCH (n)
      WHERE n.id IN ['${escapedIds.join("','")}']
      RETURN n.id AS id, coalesce(n.label, n.name, n.title) AS label, head(labels(n)) AS type
    `;

    try {
      return await this.runWithTracing(
        'compliance.conversation.nodes',
        { query },
        async () => {
          const result = await this.instrumentedGraphClient.executeCypher(query);
          if (!Array.isArray(result)) {
            return [];
          }

          return (
            result
              .map(raw => {
                const row = raw as Record<string, unknown>;
                const id =
                  typeof row.id === 'string'
                    ? row.id
                    : row.id !== undefined
                      ? String(row.id)
                      : undefined;
                if (!id) {
                  return null;
                }

                const labelCandidate =
                  typeof row.label === 'string'
                    ? row.label
                    : typeof (row as Record<string, unknown>).name === 'string'
                      ? ((row as Record<string, unknown>).name as string)
                      : typeof (row as Record<string, unknown>).title === 'string'
                        ? ((row as Record<string, unknown>).title as string)
                        : 'Unknown';

                const labels = (row as { labels?: unknown }).labels;
                const typeCandidate =
                  typeof row.type === 'string'
                    ? row.type
                    : Array.isArray(labels) && typeof labels[0] === 'string'
                      ? (labels[0] as string)
                      : 'Concept';

                return {
                  id,
                  label: labelCandidate,
                  type: typeCandidate,
                } satisfies ResolvedNodeMeta;
              })
              .filter(Boolean) as ResolvedNodeMeta[]
          );
        }
      );
    } catch (error) {
      console.warn('Failed to resolve conversation context nodes', error);
      return [];
    }
  }

  private buildConversationContextSummary(nodes: ResolvedNodeMeta[]) {
    if (!nodes.length) {
      return undefined;
    }

    const nodeText = nodes
      .map(node => `${node.label}${node.type ? ` (${node.type})` : ''}`)
      .join(', ');

    return `Previous turns referenced: ${nodeText}. Keep follow-up answers consistent with these concepts and their related rules.`;
  }

  private async loadConversationContext(
    identity?: ConversationIdentity
  ): Promise<{
    context: ConversationContext;
    nodes: ResolvedNodeMeta[];
    summary?: string;
  }> {
    if (!identity || !this.deps.conversationContextStore) {
      return { context: EMPTY_CONVERSATION_CONTEXT, nodes: [] };
    }

    try {
      return await this.runWithTracing(
        'compliance.conversation.load',
        { tenantId: identity.tenantId, conversationId: identity.conversationId },
        async () => {
          const stored =
            (await this.deps.conversationContextStore!.load(identity)) ||
            EMPTY_CONVERSATION_CONTEXT;
          const nodes = await this.resolveActiveNodes(stored.activeNodeIds);

          return {
            context: stored,
            nodes,
            summary: this.buildConversationContextSummary(nodes),
          };
        }
      );
    } catch (error) {
      console.warn('Failed to load conversation context', error);
      return { context: EMPTY_CONVERSATION_CONTEXT, nodes: [] };
    }
  }

  private async updateConversationContext(
    identity: ConversationIdentity | undefined,
    nodeIds: string[]
  ) {
    if (!identity || !this.deps.conversationContextStore) {
      return;
    }

    const activeTraceId = this.getActiveTraceId();

    try {
      await this.runWithTracing(
        'compliance.conversation.save',
        { tenantId: identity.tenantId, conversationId: identity.conversationId },
        async () => {
          if (this.deps.conversationContextStore!.mergeActiveNodeIds) {
            await this.deps.conversationContextStore!.mergeActiveNodeIds(
              identity,
              nodeIds,
              { traceId: activeTraceId }
            );
            return;
          }

          const existingContext =
            (await this.deps.conversationContextStore!.load(identity)) ||
            EMPTY_CONVERSATION_CONTEXT;
          const mergedIds = Array.from(
            new Set([...existingContext.activeNodeIds, ...nodeIds])
          );

          await this.deps.conversationContextStore!.save(identity, {
            activeNodeIds: mergedIds,
            traceId: activeTraceId ?? existingContext.traceId,
          });
        }
      );
    } catch (error) {
      console.warn('Failed to persist conversation context', error);
    }
  }

  /**
   * Handle a chat request and return a compliance response
   */
  async handleChat(request: ComplianceRequest): Promise<ComplianceResponse> {
    const { messages, profile, tenantId, conversationId } = request;

    return requestContext.run(
      { tenantId, conversationId },
      () =>
        this.runWithTracing(
          'compliance.route',
          { tenantId, conversationId, streaming: false },
          async () => {
            if (!messages || messages.length === 0) {
              throw new ComplianceError('No messages provided');
            }

            // Get the last user message as the question
            const lastMessage = messages.filter(m => m.role === 'user').pop();
            if (!lastMessage) {
              throw new ComplianceError('No user message found');
            }

            // Build agent input
            const agentInput: AgentInput = {
              question: lastMessage.content,
              profile,
              conversationHistory: messages.slice(0, -1), // All messages except the last
              now: new Date(),
            };

            const conversationIdentity =
              tenantId && conversationId
                ? { tenantId, conversationId }
                : undefined;
            const conversationContext = await this.loadConversationContext(
              conversationIdentity
            );
            const promptMetadata = await this.buildPromptMetadata(profile, {
              summary: conversationContext.summary,
              nodes: conversationContext.nodes,
            });
            const conceptNodeIds = new Set<string>();
            const conceptAwareClient = this.createConceptAwareLlmClient(
              conceptNodeIds,
              tenantId
            );

            // Build agent context
            const agentContext: AgentContext = {
              graphClient: this.instrumentedGraphClient,
              timeline: this.instrumentedTimelineEngine,
              egressGuard: this.instrumentedEgressGuard,
              llmClient: conceptAwareClient,
              now: new Date(),
              profile,
            };

            // Use GlobalRegulatoryComplianceAgent to handle the request
            // It will route to specialized agents as needed
            const agentResult = await this.runWithTracing(
              'compliance.agent',
              { agent: 'GlobalRegulatoryComplianceAgent' },
              async () =>
                GlobalRegulatoryComplianceAgent.handle(agentInput, agentContext)
            );

            const referencedNodes = this.mergeReferencedNodes(
              agentResult.referencedNodes,
              conceptNodeIds
            );
            await this.updateConversationContext(
              conversationIdentity,
              referencedNodes.map(node => node.id)
            );

            return {
              answer: agentResult.answer,
              referencedNodes,
              agentUsed: agentResult.agentId,
              jurisdictions: promptMetadata.jurisdictions,
              warnings: agentResult.warnings,
              uncertaintyLevel: agentResult.uncertaintyLevel,
              followUps: agentResult.followUps,
              disclaimer: promptMetadata.disclaimer,
            };
          }
        )
    );
  }

  /**
   * Handle a chat request with streaming response
   *
   * This method provides the same agent routing and graph querying as handleChat(),
   * but streams the LLM response in real-time for better UX.
   */
  async *handleChatStream(request: ComplianceRequest): AsyncGenerator<ComplianceStreamChunk> {
    const { tenantId, conversationId } = request;

    const stream = await requestContext.run(
      { tenantId, conversationId },
      () =>
        this.runWithTracing(
          'compliance.route',
          { tenantId, conversationId, streaming: true },
          async () => this.handleChatStreamInternal(request)
        )
    );

    for await (const chunk of stream) {
      yield chunk;
    }
  }

  private async *handleChatStreamInternal(
    request: ComplianceRequest
  ): AsyncGenerator<ComplianceStreamChunk> {
    const { messages, profile, tenantId, conversationId } = request;

    if (!messages || messages.length === 0) {
      yield { type: 'error', error: 'No messages provided' };
      return;
    }

    const lastMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastMessage) {
      yield { type: 'error', error: 'No user message found' };
      return;
    }

    try {
      const conversationIdentity =
        tenantId && conversationId
          ? { tenantId, conversationId }
          : undefined;
      const conversationContext = await this.loadConversationContext(
        conversationIdentity
      );
      const promptMetadata = await this.buildPromptMetadata(profile, {
        summary: conversationContext.summary,
        nodes: conversationContext.nodes,
      });
      const conceptNodeIds = new Set<string>();
      const conceptAwareClient = this.createConceptAwareLlmClient(
        conceptNodeIds,
        tenantId
      );

      const agentInput: AgentInput = {
        question: lastMessage.content,
        profile,
        conversationHistory: messages.slice(0, -1),
        now: new Date(),
      };

      const agentContext: AgentContext = {
        graphClient: this.instrumentedGraphClient,
        timeline: this.instrumentedTimelineEngine,
        egressGuard: this.instrumentedEgressGuard,
        llmClient: conceptAwareClient,
        now: new Date(),
        profile,
      };

      const handleStream = GlobalRegulatoryComplianceAgent.handleStream;
      if (!handleStream) {
        throw new ComplianceError('Agent does not support streaming');
      }
      const agentResult = await this.runWithTracing(
        'compliance.agent',
        { agent: 'GlobalRegulatoryComplianceAgent' },
        async () => handleStream(agentInput, agentContext)
      );

      const warnings = agentResult.warnings ?? [];

      const streamIterator = agentResult.stream[Symbol.asyncIterator]();
      const firstChunkResult = await streamIterator.next();

      const metadataReferencedNodes = this.mergeReferencedNodes(
        agentResult.referencedNodes,
        conceptNodeIds
      );

      yield {
        type: 'metadata',
        metadata: {
          agentUsed: agentResult.agentId,
          jurisdictions: promptMetadata.jurisdictions,
          uncertaintyLevel: agentResult.uncertaintyLevel,
          referencedNodes: metadataReferencedNodes,
        },
      };

      if (warnings.length) {
        yield { type: 'warning', warnings };
      }

      let currentResult: IteratorResult<LlmStreamChunk> | undefined =
        firstChunkResult;

      while (currentResult && !currentResult.done) {
        const chunk = currentResult.value;
        if (chunk.type === 'text' && chunk.delta) {
          yield { type: 'text', delta: chunk.delta };
        } else if (chunk.type === 'error') {
          yield { type: 'error', error: chunk.error?.message || 'Unknown error' };
          break;
        }

        currentResult = await streamIterator.next();
      }

      const finalReferencedNodes = this.mergeReferencedNodes(
        agentResult.referencedNodes,
        conceptNodeIds
      );

      await this.updateConversationContext(
        conversationIdentity,
        finalReferencedNodes.map(node => node.id)
      );

      yield {
        type: 'done',
        followUps: agentResult.followUps,
        referencedNodes: finalReferencedNodes,
        warnings: warnings.length ? warnings : undefined,
        disclaimer: promptMetadata.disclaimer,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', error: message };
    }
  }

  private async runWithTracing<T>(
    name: string,
    attributes: Attributes,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return withSpan(name, attributes, async () => {
      this.logger.info({ span: name, event: 'start', attributes }, 'Span started');
      try {
        const result = await fn();
        this.logger.info({ span: name, event: 'finish' }, 'Span finished');
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error({ span: name, event: 'error', error: message }, 'Span failed');
        throw error;
      }
    });
  }

  private runWithTracingSync<T>(
    name: string,
    attributes: Attributes,
    fn: () => T
  ): T {
    const tracer = trace.getTracer('reg-intel-observability');
    return tracer.startActiveSpan(name, { attributes }, (span) => {
      requestContext.applyToSpan(span);
      this.logger.info({ span: name, event: 'start', attributes }, 'Span started');

      try {
        const result = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        this.logger.info({ span: name, event: 'finish' }, 'Span finished');
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error({ span: name, event: 'error', error: message }, 'Span failed');
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

/**
 * Create a ComplianceEngine instance
 */
export function createComplianceEngine(deps: ComplianceEngineDeps): ComplianceEngine {
  return new ComplianceEngine(deps);
}
