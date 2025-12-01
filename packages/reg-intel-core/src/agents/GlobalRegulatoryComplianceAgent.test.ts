import { describe, expect, it, vi } from 'vitest';

import { GlobalRegulatoryComplianceAgent } from './GlobalRegulatoryComplianceAgent.js';
import type {
  AgentContext,
  AgentInput,
  GraphClient,
  TimelineEngine,
  EgressGuard,
  LlmClient,
} from '../types.js';

const baseGraphContext = { nodes: [], edges: [] };

const graphClient: GraphClient = {
  getRulesForProfileAndJurisdiction: vi
    .fn()
    .mockResolvedValue(baseGraphContext),
  getNeighbourhood: vi.fn().mockResolvedValue(baseGraphContext),
  getMutualExclusions: vi.fn().mockResolvedValue([]),
  getTimelines: vi.fn().mockResolvedValue([]),
  getCrossBorderSlice: vi.fn().mockResolvedValue(baseGraphContext),
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

describe('GlobalRegulatoryComplianceAgent.handleStream', () => {
  it('wraps non-streaming agents into an async iterable', async () => {
    const llmClient: LlmClient = {
      chat: vi.fn().mockResolvedValue({ content: 'Full answer' }),
    };

    const ctx: AgentContext = {
      graphClient,
      timeline: timelineEngine,
      egressGuard,
      llmClient,
      now: new Date(),
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
    };

    const input: AgentInput = {
      question: 'Test question',
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
    };

    const result = await GlobalRegulatoryComplianceAgent.handleStream(input, ctx);

    const streamedChunks = [] as Array<{ type: string; delta?: string }>;
    for await (const chunk of result.stream) {
      streamedChunks.push(chunk as { type: string; delta?: string });
    }

    expect(result.agentId).toBe('GlobalRegulatoryComplianceAgent');
    expect(streamedChunks).toEqual([
      { type: 'text', delta: 'Full answer' },
      { type: 'done' },
    ]);
  });
});
