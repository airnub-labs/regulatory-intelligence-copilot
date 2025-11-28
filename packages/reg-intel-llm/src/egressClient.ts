import { sanitizeObjectForEgress } from './egressGuard.js';
import { LlmError } from './errors.js';

export type EgressTarget = 'llm' | 'mcp' | 'http';

export interface EgressGuardContext {
  target: EgressTarget;
  providerId: string;
  endpointId?: string;
  request: unknown;
  sanitizedRequest?: unknown;
  tenantId?: string;
  task?: string;
  metadata?: Record<string, unknown>;
}

export type EgressAspect = (
  ctx: EgressGuardContext,
  next: (ctx: EgressGuardContext) => Promise<EgressGuardContext>
) => Promise<EgressGuardContext>;

export function composeEgressAspects(
  aspects: EgressAspect[],
  terminal: (ctx: EgressGuardContext) => Promise<EgressGuardContext>
) {
  return aspects.reduceRight(
    (next, aspect) => async (ctx: EgressGuardContext) => aspect(ctx, next),
    terminal
  );
}

export interface EgressClientConfig {
  /**
   * Providers that are allowed to receive outbound traffic.
   * If undefined, all providers passed at runtime are allowed.
   */
  allowedProviders?: string[];
  aspects?: EgressAspect[];
}

function enforceAllowedProvidersAspect(allowed?: string[]): EgressAspect {
  return async (ctx, next) => {
    if (allowed && allowed.length > 0 && !allowed.includes(ctx.providerId)) {
      throw new LlmError(
        `Provider ${ctx.providerId} is not allowed by the current egress policy`
      );
    }

    return next(ctx);
  };
}

function sanitizeRequestAspect(): EgressAspect {
  return async (ctx, next) => {
    const sanitizedRequest = sanitizeObjectForEgress(ctx.request);
    return next({
      ...ctx,
      sanitizedRequest,
      metadata: {
        ...ctx.metadata,
        redactionApplied: sanitizedRequest !== ctx.request,
      },
    });
  };
}

export class EgressClient {
  private readonly pipeline: (ctx: EgressGuardContext) => Promise<EgressGuardContext>;

  constructor(config?: EgressClientConfig) {
    const baselineAspects: EgressAspect[] = [
      enforceAllowedProvidersAspect(config?.allowedProviders),
      sanitizeRequestAspect(),
    ];

    const runPipeline = composeEgressAspects(
      [...baselineAspects, ...(config?.aspects ?? [])],
      async ctx => ctx
    );

    this.pipeline = runPipeline;
  }

  async guard(ctx: EgressGuardContext) {
    return this.pipeline(ctx);
  }
}
