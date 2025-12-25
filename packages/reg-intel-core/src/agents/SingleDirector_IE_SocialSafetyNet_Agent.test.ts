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

vi.mock('../llm/llmClient.js', () => ({
  REGULATORY_COPILOT_SYSTEM_PROMPT: 'mock-system-prompt',
}));
vi.mock('@reg-copilot/reg-intel-prompts', () => ({
  buildPromptWithAspects: vi.fn(() => 'mocked-prompt'),
}));

import { requestContext } from '@reg-copilot/reg-intel-observability';
import { SingleDirector_IE_SocialSafetyNet_Agent } from './SingleDirector_IE_SocialSafetyNet_Agent.js';
import type { AgentContext, AgentInput } from '../types.js';

let provider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;
let exporter: InMemorySpanExporter;

describe('SingleDirector_IE_SocialSafetyNet_Agent logging', () => {
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
      question: 'How do PRSI contributions affect my benefits?',
      profile: {
        personaType: 'single-director',
        hasCompany: true,
        jurisdictions: ['IE'],
        prsiClass: 'S',
      },
    };

    const ctx: AgentContext = {
      graphClient: {
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
        getNeighbourhood: vi.fn(),
        getTimelines: vi.fn().mockResolvedValue([]),
      } as unknown as AgentContext['graphClient'],
      timeline: {} as AgentContext['timeline'],
      egressGuard: {} as AgentContext['egressGuard'],
      llmClient: { chat: vi.fn().mockResolvedValue({ content: 'mock-response' }) } as AgentContext['llmClient'],
      now: new Date(),
      profile: input.profile,
    };

    const tracer = trace.getTracer('agent-log-test');
    await tracer.startActiveSpan('agent-log-span', async (span) => {
      await requestContext.run({ tenantId: 'tenant-agent', conversationId: 'conversation-agent' }, async () => {
        await SingleDirector_IE_SocialSafetyNet_Agent.handle(input, ctx);
      });
      span.end();
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedLogs.length).toBeGreaterThan(0);
    const logEntry = capturedLogs.find(entry => entry.scope === 'SingleDirector_IE_SocialSafetyNet_Agent');

    expect(logEntry?.trace_id).toBeDefined();
    expect(logEntry?.span_id).toBeDefined();
    expect(logEntry?.tenantId).toBe('tenant-agent');
    expect(logEntry?.conversationId).toBe('conversation-agent');
  });
});
