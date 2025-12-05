import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(canonicalConceptHandler.resolveAndUpsert).toHaveBeenCalledWith(
      conceptPayload.concepts,
      graphWriteService
    );

    const doneChunk = chunks[chunks.length - 1];
    const referencedIds = (doneChunk.referencedNodes || []).map((n: any) => n.id);
    expect(referencedIds).toEqual(
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1'])
    );
    expect(referencedIds).toContain('rule-1');

    expect(conversationContextStore.mergeActiveNodeIds).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', conversationId: 'conversation-1' },
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1'])
    );
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
      expect.arrayContaining(['concept-node-1', 'concept-node-2'])
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
      expect.arrayContaining(['concept-node-1', 'concept-node-2', 'rule-1'])
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
});
