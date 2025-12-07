import { describe, expect, it } from 'vitest';

import { EgressClient, type EgressGuardContext } from './egressClient.js';

describe('EgressClient', () => {
  const baseContext: Omit<EgressGuardContext, 'request'> = {
    target: 'llm',
    providerId: 'openai',
  };

  it('sanitises payloads before execution in enforce mode', async () => {
    const client = new EgressClient({ allowedProviders: ['openai'] });

    const result = await client.guardAndExecute(
      {
        ...baseContext,
        request: { message: 'Email me at test@example.com' },
        effectiveMode: 'enforce',
      },
      async ctx => {
        expect(ctx.sanitizedRequest).not.toEqual({ message: 'Email me at test@example.com' });
        expect((ctx.request as any).message).not.toContain('test@example.com');
        expect(ctx.metadata?.redactionApplied).toBe(true);
        return 'ok';
      }
    );

    expect(result).toBe('ok');
  });

  it('enforces provider allowlist even when mode is off', async () => {
    const client = new EgressClient({ allowedProviders: ['openai'] });

    await expect(
      client.guardAndExecute(
        {
          ...baseContext,
          providerId: 'groq',
          request: { message: 'Email me at test@example.com' },
          effectiveMode: 'off',
        },
        async ctx => ctx
      )
    ).rejects.toThrow(/not allowed/);
  });

  it('records sanitisation without blocking in report-only', async () => {
    const client = new EgressClient({ allowedProviders: ['openai'] });

    const result = await client.guardAndExecute(
      {
        ...baseContext,
        request: 'Reach me at 085-123-4567',
        effectiveMode: 'report-only',
      },
      async ctx => {
        expect(ctx.request).toBe('Reach me at 085-123-4567');
        expect(ctx.sanitizedRequest).not.toBe('Reach me at 085-123-4567');
        expect(ctx.metadata?.redactionApplied).toBe(true);
        expect(ctx.metadata?.redactionReportOnly).toBe(true);
        return 'ok';
      }
    );

    expect(result).toBe('ok');
  });
});
