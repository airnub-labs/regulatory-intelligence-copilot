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
  userId?: string;
  /** Optional mode requested by the caller before policy resolution. */
  task?: string;
  metadata?: Record<string, unknown>;

  mode?: EgressMode;

  /**
   * Per-call effective egress mode. Falls back to the client's default when undefined.
   */
  effectiveMode?: EgressMode;
}

export type EgressAspect = (
  ctx: EgressGuardContext,
  next: (ctx: EgressGuardContext) => Promise<EgressGuardContext>
) => Promise<EgressGuardContext>;

export function composeEgressAspects(
  aspects: EgressAspect[],
  terminal: (ctx: EgressGuardContext) => Promise<EgressGuardContext>
): (ctx: EgressGuardContext) => Promise<EgressGuardContext> {
  return aspects.reduceRight<(ctx: EgressGuardContext) => Promise<EgressGuardContext>>(
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

function providerAllowlistAspect(
  allowed: string[] | undefined,
  defaultMode: EgressMode
): EgressAspect {
  return async (ctx, next) => {
    const mode = ctx.effectiveMode ?? defaultMode;

    if (!allowed || allowed.length === 0) {
      return next(ctx);
    }

    const isAllowed = allowed.includes(ctx.providerId);

    if (!isAllowed && mode === 'enforce') {
      throw new LlmError(
        `Provider ${ctx.providerId} is not allowed by the current egress policy`
      );
    }

    if (!isAllowed && (mode === 'report-only' || mode === 'off')) {
      const metadata = {
        ...ctx.metadata,
        egressPolicyViolation: true,
        egressPolicyViolationReason: `Provider ${ctx.providerId} is not allowed by the current egress policy`,
      };

      console.warn('[Egress] Disallowed provider used', {
        providerId: ctx.providerId,
        tenantId: ctx.tenantId,
        task: ctx.task,
      });

      return next({ ...ctx, metadata });
    }

    return next(ctx);
  };
}

function sanitizeRequestAspect(
  defaultMode: EgressMode,
  options: { preserveOriginalRequest?: boolean } = {}
): EgressAspect {
  return async (ctx, next) => {
    const mode = ctx.effectiveMode ?? defaultMode;

    if (mode === 'off') {
      return next(ctx);
    }

    const originalRequest = ctx.request;
    const sanitizedRequest = sanitizeObjectForEgress(originalRequest);

    const metadata = {
      ...ctx.metadata,
      redactionApplied: sanitizedRequest !== originalRequest,
      redactionReportOnly: mode === 'report-only',
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

    if (mode === 'report-only' && sanitizedRequest !== originalRequest) {
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
  private readonly defaultMode: EgressMode;

  constructor(config?: EgressClientConfig) {
    this.defaultMode = config?.mode ?? 'enforce';

    const sanitizeAspect = sanitizeRequestAspect(this.defaultMode, {
      preserveOriginalRequest: config?.preserveOriginalRequest,
    });

    const providerAspect = providerAllowlistAspect(
      config?.allowedProviders,
      this.defaultMode
    );

    const baselineAspects: EgressAspect[] = [sanitizeAspect, providerAspect];

    const runPipeline = composeEgressAspects(
      [...baselineAspects, ...(config?.aspects ?? [])],
      async ctx => ctx
    );

    this.pipeline = runPipeline;
  }

  getDefaultMode(): EgressMode {
    return this.defaultMode;
  }

  async guard(ctx: EgressGuardContext) {
    return this.pipeline(ctx);
  }

  async guardAndExecute<T>(
    ctx: EgressGuardContext,
    execute: (ctx: EgressGuardContext) => Promise<T>
  ): Promise<T> {
    const guarded = await this.guard(ctx);
    const executionCtx: EgressGuardContext = {
      ...guarded,
      request: guarded.sanitizedRequest ?? guarded.request,
    };
    return execute(executionCtx);
  }
}
