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

  it('passes original payload when mode is off but still runs allowlist', async () => {
    const client = new EgressClient({ allowedProviders: ['openai'] });

    const result = await client.guardAndExecute(
      {
        ...baseContext,
        providerId: 'groq',
        request: { message: 'Email me at test@example.com' },
        effectiveMode: 'off',
      },
      async ctx => {
        expect(ctx.request).toEqual({ message: 'Email me at test@example.com' });
        expect(ctx.sanitizedRequest).toBeUndefined();
        expect(ctx.metadata?.egressPolicyViolation).toBe(true);
        return 'ok';
      }
    );

    expect(result).toBe('ok');
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
        expect(ctx.request).not.toBe('Reach me at 085-123-4567');
        expect(ctx.sanitizedRequest).not.toBe('Reach me at 085-123-4567');
        expect(ctx.metadata?.redactionApplied).toBe(true);
        return 'ok';
      }
    );

    expect(result).toBe('ok');
  });
});
