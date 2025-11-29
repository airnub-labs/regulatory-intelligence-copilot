import { sanitizeObjectForEgress } from './egressGuard.js';
import { LlmError } from './errors.js';

export type EgressTarget = 'llm' | 'mcp' | 'http';

export interface EgressGuardContext {
  target: EgressTarget;
  providerId: string;
  endpointId?: string;
  request: unknown;
  sanitizedRequest?: unknown;
  originalRequest?: unknown;
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

export type EgressMode = 'enforce' | 'report-only' | 'off';

export interface EgressClientConfig {
  /**
   * Providers that are allowed to receive outbound traffic.
   * If undefined, all providers passed at runtime are allowed.
   */
  allowedProviders?: string[];
  aspects?: EgressAspect[];

  /**
   * Egress mode:
   * - 'enforce': apply policy, sanitisation, and blocking behaviour.
   * - 'report-only': detect and log/report policy and sanitisation results, but do not block.
   * - 'off': disable all guarding/sanitisation (only for explicit test wiring).
   */
  mode?: EgressMode;

  /**
   * When true, keep a copy of the original request payload on ctx.originalRequest.
   * This is intended for non-production debugging and should not be required for normal operation.
   */
  preserveOriginalRequest?: boolean;
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

function allowedProvidersReportOnlyAspect(allowed?: string[]): EgressAspect {
  return async (ctx, next) => {
    if (allowed && allowed.length > 0 && !allowed.includes(ctx.providerId)) {
      const metadata = {
        ...ctx.metadata,
        egressPolicyViolation: true,
        egressPolicyViolationReason: `Provider ${ctx.providerId} is not allowed by the current egress policy`,
      };

      console.warn('[Egress][report-only] Disallowed provider used', {
        providerId: ctx.providerId,
        tenantId: ctx.tenantId,
        task: ctx.task,
      });

      return next({ ...ctx, metadata });
    }

    return next(ctx);
  };
}

function sanitizeRequestAspect(options: {
  preserveOriginalRequest?: boolean;
  reportOnly?: boolean;
} = {}): EgressAspect {
  return async (ctx, next) => {
    const originalRequest = ctx.request;
    const sanitizedRequest = sanitizeObjectForEgress(originalRequest);

    const metadata = {
      ...ctx.metadata,
      redactionApplied: sanitizedRequest !== originalRequest,
      redactionReportOnly: !!options.reportOnly,
    };

    const baseCtx: EgressGuardContext = {
      ...ctx,
      request: sanitizedRequest,
      sanitizedRequest,
      metadata,
    };

    if (options.preserveOriginalRequest) {
      baseCtx.originalRequest = originalRequest;
    }

    if (options.reportOnly && sanitizedRequest !== originalRequest) {
      console.warn('[Egress][report-only] PII sanitiser changed payload', {
        tenantId: ctx.tenantId,
        task: ctx.task,
      });
    }

    return next(baseCtx);
  };
}

export class EgressClient {
  private readonly pipeline: (ctx: EgressGuardContext) => Promise<EgressGuardContext>;

  constructor(config?: EgressClientConfig) {
    const mode: EgressMode = config?.mode ?? 'enforce';

    if (mode === 'off') {
      this.pipeline = async ctx => ctx;
      return;
    }

    const providerAspect =
      mode === 'report-only'
        ? allowedProvidersReportOnlyAspect(config?.allowedProviders)
        : enforceAllowedProvidersAspect(config?.allowedProviders);

    const sanitizeAspect = sanitizeRequestAspect({
      preserveOriginalRequest: config?.preserveOriginalRequest,
      reportOnly: mode === 'report-only',
    });

    const baselineAspects: EgressAspect[] = [providerAspect, sanitizeAspect];

    const runPipeline = composeEgressAspects(
      [...baselineAspects, ...(config?.aspects ?? [])],
      async ctx => ctx
    );

    this.pipeline = runPipeline;
  }

  async guard(ctx: EgressGuardContext) {
    return this.pipeline(ctx);
  }

  async guardAndExecute<T>(
    ctx: EgressGuardContext,
    execute: (ctx: EgressGuardContext) => Promise<T>
  ): Promise<T> {
    const guarded = await this.guard(ctx);
    return execute(guarded);
  }
}
