import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from './types.js';
import {
  LlmRouter,
  type LlmCompletionOptions,
  type LlmProviderClient,
  type LlmPolicyStore,
  type LlmStreamChunk,
  type TenantLlmPolicy,
} from './llmRouter.js';
import type { EgressClient, EgressMode } from './egressClient.js';

class StubProvider implements LlmProviderClient {
  chat = vi.fn<
    [ChatMessage[], string, LlmCompletionOptions | undefined],
    Promise<string>
  >(async () => 'ok');

  streamChat = vi.fn<
    [ChatMessage[], string, LlmCompletionOptions | undefined],
    AsyncIterable<LlmStreamChunk>
  >(async function* () {
    yield { type: 'text', delta: 'hi' } as const;
    yield { type: 'done' } as const;
  });
}

class StubPolicyStore implements LlmPolicyStore {
  constructor(private policy: TenantLlmPolicy) {}
  async getPolicy() {
    return this.policy;
  }
  async setPolicy(policy: TenantLlmPolicy) {
    this.policy = policy;
  }
}

class StubEgressClient {
  defaultMode: EgressMode;
  guardAndExecute = vi.fn(async (ctx: any, execute: any) => execute(ctx));
  guard = vi.fn(async (ctx: any) => ctx);
  constructor(mode: EgressMode = 'enforce') {
    this.defaultMode = mode;
  }
  getDefaultMode() {
    return this.defaultMode;
  }
}

describe('LlmRouter egress resolution', () => {
  const provider = new StubProvider();
  const providers = { openai: provider } as Record<string, LlmProviderClient>;

  function createRouter(policy: TenantLlmPolicy, egressClient: EgressClient) {
    return new LlmRouter(
      providers,
      new StubPolicyStore(policy),
      'openai',
      'gpt-test',
      egressClient
    );
  }

  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

  it('honours per-call overrides within tenant policy', async () => {
    const egress = new StubEgressClient('enforce');
    const router = createRouter(
      {
        tenantId: 'tenant-1',
        defaultModel: 'gpt-test',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        egressMode: 'enforce',
        allowOffMode: false,
      },
      egress as unknown as EgressClient
    );

    await router.chat(messages, {
      tenantId: 'tenant-1',
      userId: 'user-1',
      egressModeOverride: 'report-only',
    });

    expect(egress.guardAndExecute).toHaveBeenCalled();
    const ctx = egress.guardAndExecute.mock.calls[0][0];
    expect(ctx.effectiveMode).toBe('report-only');
    expect(ctx.mode).toBe('report-only');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.userId).toBe('user-1');
  });

  it('retains tenant enforcement when off is disallowed', async () => {
    const egress = new StubEgressClient('enforce');
    const router = createRouter(
      {
        tenantId: 'tenant-1',
        defaultModel: 'gpt-test',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        egressMode: 'enforce',
        allowOffMode: false,
      },
      egress as unknown as EgressClient
    );

    await router.chat(messages, {
      tenantId: 'tenant-1',
      egressModeOverride: 'off',
    });

    const ctx = egress.guardAndExecute.mock.calls[0][0];
    expect(ctx.effectiveMode).toBe('enforce');
  });

  it('applies per-user egress policy when present', async () => {
    const egress = new StubEgressClient('enforce');
    const router = createRouter(
      {
        tenantId: 'tenant-1',
        defaultModel: 'gpt-test',
        defaultProvider: 'openai',
        allowRemoteEgress: true,
        tasks: [],
        egressMode: 'enforce',
        allowOffMode: false,
        userPolicies: {
          'user-123': { egressMode: 'report-only' },
        },
      },
      egress as unknown as EgressClient
    );

    await router.chat(messages, {
      tenantId: 'tenant-1',
      userId: 'user-123',
    });

    const ctx = egress.guardAndExecute.mock.calls[0][0];
    expect(ctx.effectiveMode).toBe('report-only');
    expect(ctx.mode).toBe('report-only');
  });
});
