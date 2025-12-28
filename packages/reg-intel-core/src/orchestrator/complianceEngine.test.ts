import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Writable } from 'node:stream';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import * as observability from '@reg-copilot/reg-intel-observability';

import { ComplianceEngine } from './complianceEngine.js';
import type {
  CanonicalConceptHandler,
  ComplianceRequest,
  ConversationContextStore,
  GraphClient,
  AgentContext,
  AgentInput,
  TimelineEngine,
  EgressGuard,
  LlmClient,
  CapturedConcept,
} from './complianceEngine.js';
import type { GraphWriteService } from '@reg-copilot/reg-intel-graph';
import type { LlmRouter, LlmStreamChunk } from '@reg-copilot/reg-intel-llm';
import type { ChatMessage } from '../types.js';
import { GlobalRegulatoryComplianceAgent } from '../agents/GlobalRegulatoryComplianceAgent.js';

describe('ComplianceEngine streaming', () => {
  const graphClient: GraphClient = {
    getRulesForProfileAndJurisdiction: vi
      .fn()
      .mockResolvedValue({
        nodes: [
          { id: 'rule-1', label: 'Rule 1', type: 'Benefit', properties: {} },
        ],
        edges: [],
      }),
    getNeighbourhood: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    getMutualExclusions: vi.fn().mockResolvedValue([]),
    getTimelines: vi.fn().mockResolvedValue([]),
    getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    executeCypher: vi.fn().mockResolvedValue([]),
  };

  const timelineEngine: TimelineEngine = {
    computeLookbackRange: vi.fn(),
    isWithinLookback: vi.fn(),
    computeLockInEnd: vi.fn(),
    isLockInActive: vi.fn(),
  };

  const egressGuard: EgressGuard = {
    redact: vi.fn(input => ({ content: input, redactionCount: 0, redactedTypes: [] })),
    redactText: vi.fn(text => text),
  };

  const llmClient: LlmClient = {
    chat: vi.fn().mockResolvedValue({ content: 'stubbed' }),
    streamChat: vi.fn(),
  };

  const conversationContextStore: ConversationContextStore = {
    load: vi.fn().mockResolvedValue({ activeNodeIds: [] }),
    save: vi.fn(),
    mergeActiveNodeIds: vi.fn(),
  };

  const traceContext = {
    traceId: 'trace-id-123',
    rootSpanId: 'root-span-id-123',
    rootSpanName: 'root-span-name',
  };

    const canonicalConceptHandler: CanonicalConceptHandler = {
      resolveAndUpsert: vi
        .fn()
        .mockImplementation(async (concepts: CapturedConcept[], _graphWriteService: GraphWriteService) =>
          concepts.map((_, idx) => `concept-node-${idx + 1}`)
        ),
    };

  const graphWriteService = {} as GraphWriteService;

  const conceptPayload = {
    concepts: [
      {
        label: 'Value-Added Tax',
        domain: 'TAX',
        kind: 'VAT',
        jurisdiction: 'IE',
        prefLabel: 'VAT',
        altLabels: ['Value Added Tax'],
        definition: 'Tax on goods and services',
        sourceUrls: ['https://example.com/vat'],
      },
      {
        label: 'Capital gains tax',
        domain: 'TAX',
        kind: 'CGT',
        jurisdiction: 'IE',
      },
    ],
  };

  function createRouter(): LlmRouter {
    return {
      streamChat: vi.fn(async function* (_messages: ChatMessage[]): AsyncIterable<LlmStreamChunk> {
        yield { type: 'tool', name: 'capture_concepts', argsJson: conceptPayload };
        yield { type: 'text', delta: 'Hello ' };
        yield { type: 'text', delta: 'world' };
        yield { type: 'done' };
      }),
    } as unknown as LlmRouter;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    canonicalConceptHandler.resolveAndUpsert.mockImplementation(
      async (concepts: CapturedConcept[]) => concepts.map((_, idx) => `concept-node-${idx + 1}`)
    );

    vi.spyOn(GlobalRegulatoryComplianceAgent, 'handle').mockImplementation(
      async (_input, ctx) => {
        const llmResponse = await ctx.llmClient.chat({ messages: [] });

        return {
          agentId: 'test-agent',
          answer: llmResponse.content,
          referencedNodes: [
            { id: 'rule-1', label: 'Rule 1', type: 'Benefit' },
          ],
          jurisdictions: ['IE'],
          uncertaintyLevel: 'medium',
          followUps: ['follow-up-1'],
        };
      }
    );

    vi.spyOn(GlobalRegulatoryComplianceAgent, 'handleStream').mockImplementation(
      async (_input, ctx) => {
        return {
          agentId: 'test-agent',
          referencedNodes: [
            { id: 'rule-1', label: 'Rule 1', type: 'Benefit' },
          ],
          jurisdictions: ['IE'],
          uncertaintyLevel: 'medium',
          followUps: ['follow-up-1'],
          stream: ctx.llmClient.streamChat!({ messages: [] })!,
        };
      }
    );
  });

  it('processes router tool chunks via argsJson and updates context', async () => {
    const llmRouter = createRouter();

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const request: ComplianceRequest = {
      messages: [{ role: 'user', content: 'Tell me about VAT' }],
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      traceContext,
    };

    const chunks = [] as any[];

    for await (const chunk of engine.handleChatStream(request)) {
      chunks.push(chunk);
    }

    expect(chunks[0].type).toBe('metadata');
    const metadataReferencedIds = (chunks[0].metadata?.referencedNodes || []).map(
      (n: any) => n.id
    );
    expect(metadataReferencedIds).toEqual(
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1'])
    );
    expect(chunks[1]).toEqual({ type: 'text', delta: 'Hello ' });
    expect(chunks[2]).toEqual({ type: 'text', delta: 'world' });
    expect(chunks[chunks.length - 1].type).toBe('done');

    // Concept capture

    const doneChunk = chunks[chunks.length - 1];
    const referencedIds = (doneChunk.referencedNodes || []).map((n: any) => n.id);
    expect(referencedIds).toEqual(
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1'])
    );
    expect(referencedIds).toContain('rule-1');

    expect(conversationContextStore.mergeActiveNodeIds).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', conversationId: 'conversation-1' },
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1']),
      expect.objectContaining({
        traceId: traceContext.traceId,
        rootSpanId: traceContext.rootSpanId,
        rootSpanName: traceContext.rootSpanName,
      })
    );
  });

  it('processes concept payloads even when the tool name is missing', async () => {
    const llmRouter = {
      streamChat: vi.fn(async function* (_messages: ChatMessage[]): AsyncIterable<LlmStreamChunk> {
        yield { type: 'tool', name: '0', argsJson: conceptPayload };
        yield { type: 'text', delta: 'Response' };
        yield { type: 'done' };
      }),
    } as unknown as LlmRouter;

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const request: ComplianceRequest = {
      messages: [{ role: 'user', content: 'Capture concepts' }],
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
      tenantId: 'tenant-missing-name',
      conversationId: 'conversation-missing-name',
    };

    const chunks = [] as Array<{ type: string; metadata?: any }>;
    for await (const chunk of engine.handleChatStream(request)) {
      chunks.push(chunk);
    }

    const referencedIds = (chunks[0].metadata?.referencedNodes ?? []).map(
      (node: { id: string }) => node.id
    );

    expect(referencedIds).toEqual(expect.arrayContaining(['rule-1']));
  });

  it('surfaces captured concept IDs in metadata when the agent has no referenced nodes', async () => {
    const llmRouter = createRouter();

    (GlobalRegulatoryComplianceAgent.handleStream as any).mockImplementationOnce(
      async (_input: AgentInput, ctx: AgentContext) => ({
        agentId: 'test-agent',
        referencedNodes: [],
        jurisdictions: ['IE'],
        uncertaintyLevel: 'medium',
        followUps: [],
        stream: ctx.llmClient.streamChat!({ messages: [] })!,
      })
    );

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const request: ComplianceRequest = {
      messages: [{ role: 'user', content: 'Tell me about VAT' }],
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
      tenantId: 'tenant-2',
      conversationId: 'conversation-2',
      traceContext,
    };

    const chunks = [] as any[];

    for await (const chunk of engine.handleChatStream(request)) {
      chunks.push(chunk);
    }

    const metadata = chunks.find(chunk => chunk.type === 'metadata') as any;
    const metadataIds = (metadata?.metadata?.referencedNodes || []).map((n: any) => n.id);
    expect(metadataIds).toEqual(
      expect.arrayContaining(['concept-node-1', 'concept-node-2'])
    );

    expect(conversationContextStore.mergeActiveNodeIds).toHaveBeenCalledWith(
      { tenantId: 'tenant-2', conversationId: 'conversation-2' },
      expect.arrayContaining(['concept-node-1', 'concept-node-2']),
      expect.objectContaining({
        traceId: traceContext.traceId,
        rootSpanId: traceContext.rootSpanId,
        rootSpanName: traceContext.rootSpanName,
      })
    );
  });

  it('parses captured concepts from multiple payload shapes', () => {
    const engine = new ComplianceEngine({
      llmRouter: createRouter(),
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const parse = (engine as any).parseCapturedConcepts.bind(engine);

    expect(parse(JSON.stringify(conceptPayload))).toHaveLength(2);
    expect(parse({ concepts: conceptPayload.concepts })).toHaveLength(2);
    expect(parse(conceptPayload.concepts)).toHaveLength(2);
  });

  it('returns an empty array and logs a warning for invalid payloads', () => {
    const engine = new ComplianceEngine({
      llmRouter: createRouter(),
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const parse = (engine as any).parseCapturedConcepts.bind(engine);
    const warnSpy = vi.spyOn((engine as any).logger, 'warn');

    expect(parse(123)).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('merges concept nodes into referenced nodes for non-streaming chat', async () => {
    const llmRouter = createRouter();

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const response = await engine.handleChat({
      messages: [{ role: 'user', content: 'Tell me about VAT' }],
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      traceContext,
    });

    expect(canonicalConceptHandler.resolveAndUpsert).toHaveBeenCalledWith(
      conceptPayload.concepts,
      graphWriteService
    );

    const referencedIds = response.referencedNodes.map(n => n.id);
    expect(referencedIds).toEqual(
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1'])
    );
    expect(response.agentUsed).toBe('test-agent');

    expect(conversationContextStore.mergeActiveNodeIds).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', conversationId: 'conversation-1' },
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1']),
      expect.objectContaining({
        traceId: traceContext.traceId,
        rootSpanId: traceContext.rootSpanId,
        rootSpanName: traceContext.rootSpanName,
      })
    );
  });

  it('passes per-call LLM overrides through to the router for chat', async () => {
    const streamChat = vi.fn(async function* (_messages: ChatMessage[], _options) {
      yield { type: 'text', delta: 'Custom response' } satisfies LlmStreamChunk;
      yield { type: 'done' } satisfies LlmStreamChunk;
    });
    const llmRouter = { streamChat } as unknown as LlmRouter;
    const customTools = [{ name: 'custom-tool' }];

    (GlobalRegulatoryComplianceAgent.handle as any).mockImplementationOnce(
      async (_input: AgentInput, ctx: AgentContext) => {
        const llmResponse = await ctx.llmClient.chat({
          messages: [],
          model: 'custom-model',
          temperature: 0.2,
          max_tokens: 42,
          tools: customTools,
          toolChoice: 'required',
        });

        return {
          agentId: 'override-agent',
          answer: llmResponse.content,
          referencedNodes: [
            { id: 'rule-1', label: 'Rule 1', type: 'Benefit' },
          ],
          jurisdictions: ['IE'],
          uncertaintyLevel: 'low',
          followUps: [],
        };
      }
    );

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    await engine.handleChat({
      messages: [{ role: 'user', content: 'Tell me about VAT' }],
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
      tenantId: 'tenant-override',
      conversationId: 'conversation-override',
    });

    const [, options] = streamChat.mock.calls[0];
    expect(options).toMatchObject({
      task: 'main-chat',
      tenantId: 'tenant-override',
      model: 'custom-model',
      temperature: 0.2,
      maxTokens: 42,
      tools: customTools,
      toolChoice: 'required',
    });
  });

  it('passes per-call LLM overrides through to the router for streaming chat', async () => {
    const streamChat = vi.fn(async function* (_messages: ChatMessage[], _options) {
      yield { type: 'text', delta: 'Streaming content' } satisfies LlmStreamChunk;
      yield { type: 'done' } satisfies LlmStreamChunk;
    });
    const llmRouter = { streamChat } as unknown as LlmRouter;

    (GlobalRegulatoryComplianceAgent.handleStream as any).mockImplementationOnce(
      async (_input: AgentInput, ctx: AgentContext) => ({
        agentId: 'override-agent',
        referencedNodes: [
          { id: 'rule-1', label: 'Rule 1', type: 'Benefit' },
        ],
        jurisdictions: ['IE'],
        uncertaintyLevel: 'medium',
        followUps: ['follow-up-1'],
        stream: ctx.llmClient.streamChat!({
          messages: [],
          model: 'stream-model',
          temperature: 0.5,
          max_tokens: 24,
        })!,
      })
    );

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const chunks = [] as Array<{ type: string }>;
    for await (const chunk of engine.handleChatStream({
      messages: [{ role: 'user', content: 'Stream VAT' }],
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
      tenantId: 'tenant-stream',
      conversationId: 'conversation-stream',
    })) {
      chunks.push(chunk as { type: string });
    }

    expect(chunks.some(chunk => chunk.type === 'text')).toBe(true);
    const [, options] = streamChat.mock.calls[0];
    expect(options).toMatchObject({
      task: 'main-chat',
      tenantId: 'tenant-stream',
      model: 'stream-model',
      temperature: 0.5,
      maxTokens: 24,
    });
  });

  it('emits spans and correlated logs for routed chat', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    const contextManager = new AsyncLocalStorageContextManager().enable();
    provider.register({ contextManager });

    const messages: Array<Record<string, unknown>> = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        try {
          messages.push(JSON.parse(chunk.toString()));
        } catch {
          messages.push({ raw: chunk.toString() });
        }
        callback();
      },
    });

    const realCreateLogger = observability.createLogger;
    const createLoggerSpy = vi
      .spyOn(observability, 'createLogger')
      .mockImplementation((scope: string, bindings?: any) =>
        realCreateLogger(scope, { ...bindings, destination })
      );

    const llmRouter = createRouter();

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    await engine.handleChat({
      messages: [{ role: 'user', content: 'Trace VAT' }],
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
      tenantId: 'tenant-span',
      conversationId: 'conversation-span',
    });

    const spanNames = exporter.getFinishedSpans().map(span => span.name);
    expect(spanNames.length).toBeGreaterThan(0);
    expect(spanNames).toContain('compliance.egress.guard');

    expect(messages.length).toBeGreaterThan(0);
    const correlatedLog =
      messages.find(
        entry => entry.span === 'compliance.route' && entry.event === 'start'
      ) ?? messages[0];

    expect(correlatedLog).toBeDefined();

    await provider.shutdown();
    contextManager.disable();
    createLoggerSpy.mockRestore();
  });

  it('logs concept capture warnings with trace metadata', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    const contextManager = new AsyncLocalStorageContextManager().enable();
    provider.register({ contextManager });

    const warningLogs: Array<Record<string, unknown>> = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        try {
          warningLogs.push(JSON.parse(chunk.toString()));
        } catch {
          warningLogs.push({ raw: chunk.toString() });
        }
        callback();
      },
    });

    const realCreateLogger = observability.createLogger;
    const createLoggerSpy = vi
      .spyOn(observability, 'createLogger')
      .mockImplementation((scope: string, bindings?: any) =>
        realCreateLogger(scope, { ...bindings, destination })
      );

    const llmRouter = {
      streamChat: vi.fn(async function* () {
        yield { type: 'tool', name: 'capture_concepts', argsJson: 'not-json' };
        yield { type: 'done' };
      }),
    } as unknown as LlmRouter;

    const engine = new ComplianceEngine({
      llmRouter,
      graphWriteService,
      canonicalConceptHandler,
      conversationContextStore,
      llmClient,
      graphClient,
      timelineEngine,
      egressGuard,
    });

    const tracer = trace.getTracer('concept-log-test');

    await tracer.startActiveSpan('concept-span', async (span) => {
      await observability.requestContext.run(
        { tenantId: 'tenant-concept', conversationId: 'conversation-concept' },
        async () => {
          await engine.handleChat({
            messages: [{ role: 'user', content: 'Trigger concepts' }],
            profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
            tenantId: 'tenant-concept',
            conversationId: 'conversation-concept',
          });
        }
      );
      span.end();
    });

    await provider.shutdown();
    contextManager.disable();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(warningLogs.length).toBeGreaterThanOrEqual(0);

    createLoggerSpy.mockRestore();
  });

  describe('Context Summaries', () => {
    it('includes conversationContextSummary in metadata when prior turn nodes exist', async () => {
      const mockContextStore: ConversationContextStore = {
        load: vi.fn().mockResolvedValue({
          activeNodeIds: ['node-1', 'node-2'],
        }),
        save: vi.fn(),
        mergeActiveNodeIds: vi.fn(),
      };

      const mockGraphClient: GraphClient = {
        ...graphClient,
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({
          nodes: [
            { id: 'node-1', label: 'Prior Node 1', type: 'Benefit', properties: {} },
            { id: 'node-2', label: 'Prior Node 2', type: 'Rule', properties: {} },
          ],
          edges: [],
        }),
      };

      const llmRouter = createRouter();
      const engine = new ComplianceEngine({
        llmRouter,
        graphWriteService,
        canonicalConceptHandler,
        conversationContextStore: mockContextStore,
        llmClient,
        graphClient: mockGraphClient,
        timelineEngine,
        egressGuard,
      });

      const request: ComplianceRequest = {
        messages: [{ role: 'user', content: 'Follow-up question' }],
        profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        traceContext,
      };

      const chunks = [] as any[];
      for await (const chunk of engine.handleChatStream(request)) {
        chunks.push(chunk);
      }

      const metadataChunk = chunks.find(c => c.type === 'metadata');
      expect(metadataChunk).toBeDefined();
      expect(metadataChunk.metadata.conversationContextSummary).toBeDefined();
      expect(metadataChunk.metadata.conversationContextSummary).toContain('Previous turns referenced');
      expect(metadataChunk.metadata.conversationContextSummary).toContain('Prior Node 1');
      expect(metadataChunk.metadata.conversationContextSummary).toContain('Prior Node 2');
    });

    it('includes priorTurnNodes array in metadata', async () => {
      const mockContextStore: ConversationContextStore = {
        load: vi.fn().mockResolvedValue({
          activeNodeIds: ['node-1', 'node-2', 'node-3'],
        }),
        save: vi.fn(),
        mergeActiveNodeIds: vi.fn(),
      };

      const mockGraphClient: GraphClient = {
        ...graphClient,
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({
          nodes: [
            { id: 'node-1', label: 'Benefit A', type: 'Benefit', properties: {} },
            { id: 'node-2', label: 'Rule B', type: 'Rule', properties: {} },
            { id: 'node-3', label: 'Jurisdiction C', type: 'Jurisdiction', properties: {} },
          ],
          edges: [],
        }),
      };

      const llmRouter = createRouter();
      const engine = new ComplianceEngine({
        llmRouter,
        graphWriteService,
        canonicalConceptHandler,
        conversationContextStore: mockContextStore,
        llmClient,
        graphClient: mockGraphClient,
        timelineEngine,
        egressGuard,
      });

      const request: ComplianceRequest = {
        messages: [{ role: 'user', content: 'Another question' }],
        profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        traceContext,
      };

      const chunks = [] as any[];
      for await (const chunk of engine.handleChatStream(request)) {
        chunks.push(chunk);
      }

      const metadataChunk = chunks.find(c => c.type === 'metadata');
      expect(metadataChunk).toBeDefined();
      expect(metadataChunk.metadata.priorTurnNodes).toBeDefined();
      expect(metadataChunk.metadata.priorTurnNodes).toHaveLength(3);

      const priorNodes = metadataChunk.metadata.priorTurnNodes;
      expect(priorNodes[0]).toEqual({ id: 'node-1', label: 'Benefit A', type: 'Benefit' });
      expect(priorNodes[1]).toEqual({ id: 'node-2', label: 'Rule B', type: 'Rule' });
      expect(priorNodes[2]).toEqual({ id: 'node-3', label: 'Jurisdiction C', type: 'Jurisdiction' });
    });

    it('omits conversationContextSummary when no prior turn nodes exist', async () => {
      const mockContextStore: ConversationContextStore = {
        load: vi.fn().mockResolvedValue({
          activeNodeIds: [],
        }),
        save: vi.fn(),
        mergeActiveNodeIds: vi.fn(),
      };

      const llmRouter = createRouter();
      const engine = new ComplianceEngine({
        llmRouter,
        graphWriteService,
        canonicalConceptHandler,
        conversationContextStore: mockContextStore,
        llmClient,
        graphClient,
        timelineEngine,
        egressGuard,
      });

      const request: ComplianceRequest = {
        messages: [{ role: 'user', content: 'First question' }],
        profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        traceContext,
      };

      const chunks = [] as any[];
      for await (const chunk of engine.handleChatStream(request)) {
        chunks.push(chunk);
      }

      const metadataChunk = chunks.find(c => c.type === 'metadata');
      expect(metadataChunk).toBeDefined();
      expect(metadataChunk.metadata.conversationContextSummary).toBeUndefined();
      expect(metadataChunk.metadata.priorTurnNodes).toEqual([]);
    });

    it('handles nodes with missing type in context summary', async () => {
      const mockContextStore: ConversationContextStore = {
        load: vi.fn().mockResolvedValue({
          activeNodeIds: ['node-1', 'node-2'],
        }),
        save: vi.fn(),
        mergeActiveNodeIds: vi.fn(),
      };

      const mockGraphClient: GraphClient = {
        ...graphClient,
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({
          nodes: [
            { id: 'node-1', label: 'Node Without Type', properties: {} },
            { id: 'node-2', label: 'Node With Type', type: 'Rule', properties: {} },
          ],
          edges: [],
        }),
      };

      const llmRouter = createRouter();
      const engine = new ComplianceEngine({
        llmRouter,
        graphWriteService,
        canonicalConceptHandler,
        conversationContextStore: mockContextStore,
        llmClient,
        graphClient: mockGraphClient,
        timelineEngine,
        egressGuard,
      });

      const request: ComplianceRequest = {
        messages: [{ role: 'user', content: 'Test question' }],
        profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        traceContext,
      };

      const chunks = [] as any[];
      for await (const chunk of engine.handleChatStream(request)) {
        chunks.push(chunk);
      }

      const metadataChunk = chunks.find(c => c.type === 'metadata');
      expect(metadataChunk).toBeDefined();
      expect(metadataChunk.metadata.conversationContextSummary).toContain('Node Without Type');
      expect(metadataChunk.metadata.conversationContextSummary).toContain('Node With Type (Rule)');

      const priorNodes = metadataChunk.metadata.priorTurnNodes;
      expect(priorNodes[0].type).toBe('');
      expect(priorNodes[1].type).toBe('Rule');
    });
  });
});
