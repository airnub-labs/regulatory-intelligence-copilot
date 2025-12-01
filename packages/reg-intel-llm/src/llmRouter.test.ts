import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from './types.js';
import { LlmRouter, type LlmProviderRegistry, type TenantLlmPolicy } from './llmRouter.js';
import type { EgressMode } from './egressClient.js';

class MockPolicyStore {
  constructor(private policy: TenantLlmPolicy | null) {}

  async getPolicy(_tenantId: string): Promise<TenantLlmPolicy | null> {
    return this.policy;
  }

  async setPolicy(): Promise<void> {}
}

class MockEgressClient {
  private readonly mode: EgressMode;
  public guardAndExecute = vi.fn(async (ctx: any, execute: any) => execute(ctx));

  constructor(mode: EgressMode = 'enforce') {
    this.mode = mode;
  }

  getDefaultMode(): EgressMode {
    return this.mode;
  }
}

const mockStream = async function* (): AsyncIterable<any> {
  yield { type: 'text', delta: 'hello' };
  yield { type: 'done' };
};

describe('LlmRouter egress resolution', () => {
  const providers: LlmProviderRegistry = {
    mock: {
      chat: vi.fn().mockResolvedValue('ok'),
      streamChat: vi.fn().mockImplementation(() => mockStream()),
    },
  } as any;

  const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];

  it('honours per-call override to report-only while propagating IDs', async () => {
    const policy: TenantLlmPolicy = {
      tenantId: 'tenant-1',
      defaultModel: 'model-a',
      defaultProvider: 'mock',
      allowRemoteEgress: true,
      tasks: [],
      egressMode: 'enforce',
      allowOffMode: false,
    };
    const egressClient = new MockEgressClient('enforce');
    const router = new LlmRouter(
      providers,
      new MockPolicyStore(policy) as any,
      'mock',
      'model-a',
      egressClient as any
    );

    const stream = router.streamChat(messages, {
      tenantId: 'tenant-1',
      userId: 'user-1',
      egressModeOverride: 'report-only',
    });

    const chunks: any[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.some(chunk => chunk.type === 'text')).toBe(true);
    expect(egressClient.guardAndExecute).toHaveBeenCalledTimes(1);
    const ctx = egressClient.guardAndExecute.mock.calls[0][0];
    expect(ctx.mode).toBe('report-only');
    expect(ctx.effectiveMode).toBe('report-only');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.userId).toBe('user-1');
  });

  it('does not allow off mode when tenant forbids it', async () => {
    const policy: TenantLlmPolicy = {
      tenantId: 'tenant-1',
      defaultModel: 'model-a',
      defaultProvider: 'mock',
      allowRemoteEgress: true,
      tasks: [],
      egressMode: 'enforce',
      allowOffMode: false,
    };
    const egressClient = new MockEgressClient('enforce');
    const router = new LlmRouter(
      providers,
      new MockPolicyStore(policy) as any,
      'mock',
      'model-a',
      egressClient as any
    );

    const stream = router.streamChat(messages, {
      tenantId: 'tenant-1',
      egressModeOverride: 'off',
    });

    for await (const _chunk of stream) {
      // consume
    }

    const ctx = egressClient.guardAndExecute.mock.calls[0][0];
    expect(ctx.mode).toBe('off');
    expect(ctx.effectiveMode).toBe('enforce');
  });
});
