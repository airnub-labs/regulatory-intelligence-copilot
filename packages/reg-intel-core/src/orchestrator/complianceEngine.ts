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
 * Execution tool definition for code execution
 */
export interface ExecutionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ExecutionToolResult>;
}

/**
 * Result from executing a code execution tool
 */
export interface ExecutionToolResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  result?: unknown;
  executionTimeMs?: number;
}

/**
 * Request to the compliance engine
 */
export interface ComplianceRequest {
  messages: ChatMessage[];
  profile?: UserProfile;
  tenantId?: string;
  conversationId?: string;
  traceContext?: TraceContextPayload;
  /** Optional execution tools (run_code, run_analysis) to make available to the LLM */
  executionTools?: ExecutionTool[];
  /** Force a specific tool to be called (for UI-triggered execution) */
  forceTool?: {
    name: string;
    args: Record<string, unknown>;
  };
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
  type: 'metadata' | 'text' | 'done' | 'error' | 'warning' | 'tool_call' | 'tool_result';
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
  // Tool call (when LLM invokes a tool)
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  // Tool result (after execution)
  toolResult?: ExecutionToolResult;
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
  rootSpanName?: string | null;
  rootSpanId?: string | null;
}

export const EMPTY_CONVERSATION_CONTEXT: ConversationContext = {
  activeNodeIds: [],
  traceId: undefined,
  rootSpanId: undefined,
  rootSpanName: undefined,
};

export interface ConversationContextStore {
  load(identity: ConversationIdentity): Promise<ConversationContext | null>;
  save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void>;
  mergeActiveNodeIds?(
    identity: ConversationIdentity,
    nodeIds: string[],
    options?: { traceId?: string | null; rootSpanName?: string | null; rootSpanId?: string | null }
  ): Promise<void>;
}

type TraceContextPayload = {
  traceId?: string | null;
  rootSpanId?: string | null;
  rootSpanName?: string | null;
};

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

  private getActiveTraceContext(requestTraceContext?: TraceContextPayload): Required<TraceContextPayload> {
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();
    const activeSpanName = 'name' in (span ?? {}) ? (span as { name?: string }).name : undefined;
    const activeTraceContext: TraceContextPayload =
      spanContext && trace.isSpanContextValid(spanContext)
        ? {
            traceId: spanContext.traceId,
            rootSpanId: spanContext.spanId,
            rootSpanName: activeSpanName,
          }
        : {};

    return {
      traceId: requestTraceContext?.traceId ?? activeTraceContext.traceId ?? 'no-active-span',
      rootSpanId: requestTraceContext?.rootSpanId ?? activeTraceContext.rootSpanId ?? null,
      rootSpanName: requestTraceContext?.rootSpanName ?? activeTraceContext.rootSpanName ?? null,
    };
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
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to parse capture_concepts payload'
        );
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

    this.logger.warn({ payload }, 'Unrecognized capture_concepts payload shape');
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
            this.logger.warn(
              {
                event: 'concept.capture.skipped',
                reason:
                  this.conceptCaptureWarning ||
                  'Concept capture skipped: Graph write dependencies are not available.',
              },
              'Concept capture skipped: graph write dependencies unavailable'
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
          this.logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Failed to resolve and upsert captured concepts'
          );
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
    options: ToolAwareCompletionOptions,
    executionTools?: ExecutionTool[]
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

    // Build a map of execution tools for quick lookup
    const executionToolMap = new Map<string, ExecutionTool>();
    if (executionTools?.length) {
      for (const tool of executionTools) {
        executionToolMap.set(tool.name, tool);
      }
    }

    for await (const chunk of stream as AsyncIterable<RouterChunk>) {
      if (chunk.type === 'tool') {
        const toolChunk = chunk as ToolStreamChunk;
        const toolName = this.extractToolName(toolChunk);

        // Check if this is an execution tool
        const executionTool = executionToolMap.get(toolName);
        if (executionTool) {
          // Handle execution tool call
          const toolArgs = this.extractToolArgs(toolChunk);

          // Yield tool call event (for UI display)
          yield {
            type: 'text',
            delta: `\n\n**Executing ${toolName}...**\n`,
          };

          try {
            // Execute the tool with tracing
            const result = await this.runWithTracing(
              `compliance.tool.${toolName}`,
              { toolName, hasArgs: !!toolArgs },
              async () => executionTool.execute(toolArgs)
            );

            // Yield the execution result as text for the LLM context
            const resultText = this.formatToolResult(toolName, result);
            yield { type: 'text', delta: resultText };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error({ toolName, error: errorMessage }, 'Execution tool failed');
            yield {
              type: 'text',
              delta: `\n**Error executing ${toolName}:** ${errorMessage}\n`,
            };
          }
          continue;
        }

        // Handle concept capture tool (existing behavior)
        if (toolName === 'capture_concepts') {
          const resolvedIds = await this.handleConceptChunk(toolChunk);
          resolvedIds.forEach(id => conceptNodeIds.add(id));
          continue;
        }

        // Unknown tool - log warning
        this.logger.warn({ toolName }, 'Unknown tool called by LLM');
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

  /**
   * Extract tool name from various LLM provider formats
   */
  private extractToolName(chunk: ToolStreamChunk): string {
    // Try different property names used by different providers
    if ('toolName' in chunk && typeof chunk.toolName === 'string') {
      return chunk.toolName;
    }
    if ('name' in chunk && typeof (chunk as Record<string, unknown>).name === 'string') {
      return (chunk as Record<string, unknown>).name as string;
    }
    if ('function' in chunk && typeof (chunk as Record<string, unknown>).function === 'object') {
      const fn = (chunk as Record<string, unknown>).function as Record<string, unknown>;
      if (typeof fn.name === 'string') return fn.name;
    }
    return 'unknown';
  }

  /**
   * Extract tool arguments from various LLM provider formats
   */
  private extractToolArgs(chunk: ToolStreamChunk): Record<string, unknown> {
    // Try argsJson first (from our router normalization)
    if (chunk.argsJson && typeof chunk.argsJson === 'object') {
      return chunk.argsJson as Record<string, unknown>;
    }
    // Try arguments
    if (chunk.arguments && typeof chunk.arguments === 'object') {
      return chunk.arguments as Record<string, unknown>;
    }
    // Try payload
    if (chunk.payload && typeof chunk.payload === 'object') {
      return chunk.payload as Record<string, unknown>;
    }
    return {};
  }

  /**
   * Format tool execution result for display
   */
  private formatToolResult(toolName: string, result: ExecutionToolResult): string {
    const parts: string[] = [];

    if (result.success) {
      parts.push(`\n**${toolName} completed successfully**`);
    } else {
      parts.push(`\n**${toolName} failed**`);
    }

    if (result.stdout) {
      parts.push('\n```\n' + result.stdout + '\n```');
    }

    if (result.stderr) {
      parts.push('\n**stderr:**\n```\n' + result.stderr + '\n```');
    }

    if (result.error) {
      parts.push(`\n**Error:** ${result.error}`);
    }

    if (result.executionTimeMs !== undefined) {
      parts.push(`\n*Execution time: ${result.executionTimeMs}ms*`);
    }

    parts.push('\n');

    return parts.join('');
  }

  private createConceptAwareLlmClient(
    conceptNodeIds: Set<string>,
    tenantId?: string,
    executionTools?: ExecutionTool[]
  ): LlmClient {
    const tools: Array<Record<string, unknown>> = this.conceptCaptureEnabled ? [CAPTURE_CONCEPTS_TOOL] : [];

    // Add execution tools if provided
    if (executionTools?.length) {
      for (const tool of executionTools) {
        tools.push({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        });
      }
    }

    const options: ToolAwareCompletionOptions = {
      task: 'main-chat',
      tenantId,
      tools: tools.length ? tools : undefined,
      toolChoice: tools.length ? 'auto' : undefined,
    };

    return {
      chat: async (request: LlmChatRequest) => {
        const chunks = this.routeThroughRouter(request, conceptNodeIds, options, executionTools);
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
        this.routeThroughRouter(request, conceptNodeIds, options, executionTools),
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
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to resolve conversation context nodes'
      );
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
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to load conversation context'
      );
      return { context: EMPTY_CONVERSATION_CONTEXT, nodes: [] };
    }
  }

  private async updateConversationContext(
    identity: ConversationIdentity | undefined,
    nodeIds: string[],
    traceContext?: TraceContextPayload
  ) {
    if (!identity || !this.deps.conversationContextStore) {
      return;
    }

    const activeTraceContext = this.getActiveTraceContext(traceContext);

    try {
      await this.runWithTracing(
        'compliance.conversation.save',
        { tenantId: identity.tenantId, conversationId: identity.conversationId },
        async () => {
          if (this.deps.conversationContextStore!.mergeActiveNodeIds) {
            await this.deps.conversationContextStore!.mergeActiveNodeIds(
              identity,
              nodeIds,
              {
                traceId: activeTraceContext.traceId,
                rootSpanName: activeTraceContext.rootSpanName,
                rootSpanId: activeTraceContext.rootSpanId,
              }
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
            traceId: activeTraceContext.traceId ?? existingContext.traceId,
            rootSpanName:
              activeTraceContext.rootSpanName ?? existingContext.rootSpanName,
            rootSpanId: activeTraceContext.rootSpanId ?? existingContext.rootSpanId,
          });
        }
      );
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to persist conversation context'
      );
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
              tenantId,
              request.executionTools
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
              referencedNodes.map(node => node.id),
              request.traceContext
            );

            // Apply EgressGuard sanitization to agent output as defense-in-depth
            // This catches any PII that might have bypassed LLM-level sanitization
            const sanitizedAnswer = this.instrumentedEgressGuard.redactText(agentResult.answer);

            return {
              answer: sanitizedAnswer,
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
    const { messages, profile, tenantId, conversationId, executionTools, forceTool } = request;

    if (!messages || messages.length === 0) {
      yield { type: 'error', error: 'No messages provided' };
      return;
    }

    const lastMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastMessage) {
      yield { type: 'error', error: 'No user message found' };
      return;
    }

    // Handle forced tool execution (from UI buttons)
    if (forceTool && executionTools?.length) {
      const tool = executionTools.find(t => t.name === forceTool.name);
      if (tool) {
        yield {
          type: 'metadata',
          metadata: {
            agentUsed: 'direct-tool-execution',
            jurisdictions: profile?.jurisdictions ?? [],
            uncertaintyLevel: 'low',
            referencedNodes: [],
          },
        };

        yield {
          type: 'tool_call',
          toolCall: {
            name: forceTool.name,
            arguments: forceTool.args,
          },
        };

        try {
          const result = await this.runWithTracing(
            `compliance.tool.${forceTool.name}`,
            { toolName: forceTool.name, forced: true },
            async () => tool.execute(forceTool.args)
          );

          yield {
            type: 'tool_result',
            toolResult: result,
          };

          // Format result as text for display and apply EgressGuard sanitization
          const resultText = this.formatToolResult(forceTool.name, result);
          const sanitizedResultText = this.instrumentedEgressGuard.redactText(resultText);
          yield { type: 'text', delta: sanitizedResultText };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          yield {
            type: 'error',
            error: `Tool execution failed: ${errorMessage}`,
          };
        }

        yield {
          type: 'done',
          disclaimer: NON_ADVICE_DISCLAIMER,
        };
        return;
      } else {
        yield {
          type: 'error',
          error: `Tool '${forceTool.name}' not found. Available tools: ${executionTools.map(t => t.name).join(', ')}`,
        };
        return;
      }
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
        tenantId,
        executionTools
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
          // Apply EgressGuard sanitization to streaming text as defense-in-depth
          const sanitizedDelta = this.instrumentedEgressGuard.redactText(chunk.delta);
          yield { type: 'text', delta: sanitizedDelta };
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
        finalReferencedNodes.map(node => node.id),
        request.traceContext
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
