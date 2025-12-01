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

  it('defaults to the client mode when no effective mode is provided', async () => {
    const client = new EgressClient({ mode: 'enforce' });
    const execute = vi.fn(async ctx => ctx.request);

    const result = await client.guardAndExecute(
      {
        target: 'llm',
        providerId: 'openai',
        request: { message: 'Email me at test@example.com' },
      },
      async ctx => execute(ctx)
    );

    const executedCtx = execute.mock.calls[0][0];
    expect(executedCtx.effectiveMode).toBe('enforce');
    expect(JSON.stringify(executedCtx.request)).not.toContain('test@example.com');
    expect(result).not.toEqual({ message: 'Email me at test@example.com' });
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

  it('does not flag metadata or warnings when payload is unchanged in report-only', async () => {
    const client = new EgressClient({ mode: 'enforce' });
    const execute = vi.fn(async ctx => ctx.request);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const original = { message: 'Hello world' };

    try {
      await client.guardAndExecute(
        {
          target: 'llm',
          providerId: 'openai',
          request: original,
          effectiveMode: 'report-only',
        },
        async ctx => execute(ctx)
      );

      const executedCtx = execute.mock.calls[0][0];
      expect(executedCtx.metadata?.redactionApplied).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(executedCtx.sanitizedRequest).toEqual(original);
    } finally {
      warnSpy.mockRestore();
    }
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

  it('handles nested unchanged structures without marking redactions', async () => {
    const client = new EgressClient({ mode: 'enforce' });
    const execute = vi.fn(async ctx => ctx.request);

    const original = { nested: { value: 'safe' }, list: [1, { note: 'still safe' }] };

    const result = await client.guardAndExecute(
      {
        target: 'llm',
        providerId: 'openai',
        request: original,
        effectiveMode: 'enforce',
      },
      async ctx => execute(ctx)
    );

    const executedCtx = execute.mock.calls[0][0];
    expect(executedCtx.metadata?.redactionApplied).toBe(false);
    expect(executedCtx.request).toEqual(original);
    expect(executedCtx.sanitizedRequest).toEqual(original);
    expect(result).toEqual(original);
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
