import { Writable } from 'node:stream';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const capturedLogs: Array<Record<string, unknown>> = [];

vi.mock('@reg-copilot/reg-intel-observability', async () => {
  const actual = await vi.importActual<typeof import('@reg-copilot/reg-intel-observability')>(
    '@reg-copilot/reg-intel-observability'
  );
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      try {
        capturedLogs.push(JSON.parse(chunk.toString()));
      } catch (error) {
        // Ignore non-JSON logs
      }
      callback();
    },
  });

  return {
    ...actual,
    createLogger: (scope: string, bindings?: Record<string, unknown>) =>
      actual.createLogger(scope, { ...bindings, destination }),
  };
});

vi.mock('@reg-copilot/reg-intel-prompts', () => ({
  buildPromptWithAspects: vi.fn(() => 'mocked-global-prompt'),
}));

vi.mock('../llm/llmClient.js', () => ({
  REGULATORY_COPILOT_SYSTEM_PROMPT: 'mock-global-system-prompt',
}));

import { requestContext } from '@reg-copilot/reg-intel-observability';
import type { AgentContext, AgentInput } from '../types.js';
import { GlobalRegulatoryComplianceAgent } from './GlobalRegulatoryComplianceAgent.js';

type MockedAgentContext = AgentContext & { llmClient: Required<AgentContext['llmClient']> };

let provider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;
let exporter: InMemorySpanExporter;

describe('GlobalRegulatoryComplianceAgent logging', () => {
  beforeEach(() => {
    capturedLogs.length = 0;
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    contextManager = new AsyncLocalStorageContextManager().enable();
    provider.register({ contextManager });
  });

  afterEach(async () => {
    await provider.shutdown();
    contextManager.disable();
    exporter.reset();
  });

  it('enriches logs with trace and request context metadata', async () => {
    const input: AgentInput = {
      question: 'What should I know about compliance?',
      profile: { personaType: 'self-employed', jurisdictions: ['IE'] },
    };

    const ctx: MockedAgentContext = {
      graphClient: {
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
        getNeighbourhood: vi.fn(),
        getTimelines: vi.fn().mockResolvedValue([]),
      } as unknown as AgentContext['graphClient'],
      timeline: {} as AgentContext['timeline'],
      egressGuard: {} as AgentContext['egressGuard'],
      llmClient: {
        chat: vi.fn().mockResolvedValue({ content: 'response' }),
        streamChat: undefined,
      },
      now: new Date(),
      profile: input.profile,
    };

    const tracer = trace.getTracer('global-agent-log-test');

    await tracer.startActiveSpan('global-agent-span', async (span) => {
      await requestContext.run({ tenantId: 'tenant-global', conversationId: 'conversation-global' }, async () => {
        await GlobalRegulatoryComplianceAgent.handle(input, ctx);
      });
      span.end();
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedLogs.length).toBeGreaterThan(0);
    const logEntry = capturedLogs.find(entry => entry.scope === 'GlobalRegulatoryComplianceAgent');

    expect(logEntry?.trace_id).toBeDefined();
    expect(logEntry?.span_id).toBeDefined();
    expect(logEntry?.tenantId).toBe('tenant-global');
    expect(logEntry?.conversationId).toBe('conversation-global');
  });
});
