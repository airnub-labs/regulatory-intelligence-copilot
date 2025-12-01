import { describe, expect, it, vi } from 'vitest';

import { ComplianceEngine } from './complianceEngine.js';
import type {
  CanonicalConceptHandler,
  ComplianceRequest,
  ConversationContextStore,
  GraphClient,
  TimelineEngine,
  EgressGuard,
  LlmClient,
} from './complianceEngine.js';
import type { GraphWriteService } from '@reg-copilot/reg-intel-graph';
import type { LlmRouter, LlmStreamChunk } from '@reg-copilot/reg-intel-llm';
import type { ChatMessage } from '../types.js';

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
      .mockImplementation(async concepts => concepts.map(() => 'concept-node-1')),
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
    expect(referencedIds).toContain('concept-node-1');
    expect(referencedIds).toContain('rule-1');

    expect(conversationContextStore.mergeActiveNodeIds).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', conversationId: 'conversation-1' },
      expect.arrayContaining(['concept-node-1', 'rule-1'])
    );
  });
});
