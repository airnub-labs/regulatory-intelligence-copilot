import { describe, expect, it, vi } from 'vitest';

import { EgressClient } from './egressClient.js';

describe('EgressClient', () => {
  it('sanitises and executes on the sanitised payload in enforce mode', async () => {
    const client = new EgressClient({ mode: 'enforce' });
    const execute = vi.fn(async ctx => ctx.request);

    const result = await client.guardAndExecute(
      {
        target: 'llm',
        providerId: 'openai',
        request: { message: 'Reach me at test@example.com' },
        effectiveMode: 'enforce',
      },
      async ctx => execute(ctx)
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const executedCtx = execute.mock.calls[0][0];
    expect(JSON.stringify(executedCtx.request)).not.toContain('test@example.com');
    expect(executedCtx.sanitizedRequest).toBeDefined();
    expect(executedCtx.metadata?.redactionReportOnly).toBe(false);
    expect(executedCtx.request).toEqual(executedCtx.sanitizedRequest);
    expect(JSON.stringify(result)).not.toContain('test@example.com');
  });

  it('sanitises but executes original payload in report-only while recording metadata', async () => {
    const client = new EgressClient({ mode: 'enforce' });
    const execute = vi.fn(async ctx => ctx.request);

    const original = { message: 'Email me at test@example.com' };

    await client.guardAndExecute(
      {
        target: 'llm',
        providerId: 'openai',
        request: original,
        tenantId: 'tenant-1',
        effectiveMode: 'report-only',
      },
      async ctx => execute(ctx)
    );

    const executedCtx = execute.mock.calls[0][0];
    expect(executedCtx.request).toBe(original);
    expect(JSON.stringify(executedCtx.sanitizedRequest)).not.toContain(
      'test@example.com'
    );
    expect(executedCtx.metadata?.redactionReportOnly).toBe(true);
    expect(executedCtx.sanitizedRequest).toBeDefined();
    expect(executedCtx.metadata?.redactionApplied).toBe(true);
  });

  it('skips sanitisation when effective mode is off', async () => {
    const client = new EgressClient({ mode: 'enforce' });
    const execute = vi.fn(async ctx => ctx.request);

    const original = { message: 'Contact test@example.com' };
    const result = await client.guardAndExecute(
      {
        target: 'llm',
        providerId: 'openai',
        request: original,
        effectiveMode: 'off',
      },
      async ctx => execute(ctx)
    );

    const executedCtx = execute.mock.calls[0][0];
    expect(executedCtx.request).toBe(original);
    expect(executedCtx.sanitizedRequest).toBeUndefined();
    expect(executedCtx.metadata).toBeUndefined();
    expect(result).toBe(original);
  });

  it('throws when provider is not allowlisted regardless of mode', async () => {
    const client = new EgressClient({
      mode: 'off',
      allowedProviders: ['openai'],
    });

    await expect(
      client.guardAndExecute(
        {
          target: 'llm',
          providerId: 'groq',
          request: { message: 'Hello' },
          effectiveMode: 'off',
        },
        async ctx => ctx.request
      )
    ).rejects.toThrow(/not allowed/);
  });
});
