import { sanitizeObjectForEgress } from './egressGuard.js';
import { LlmError } from './errors.js';
import { createLogger, withSpan } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('EgressClient');

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
  task?: string;
  metadata?: Record<string, unknown>;

  /** Optional mode requested by the caller before policy resolution. */
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

function areRequestsEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (a === null || b === null) {
    return a === b;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => areRequestsEqual(item, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aEntries = Object.entries(a as Record<string, unknown>);
    const bEntries = Object.entries(b as Record<string, unknown>);

    if (aEntries.length !== bEntries.length) {
      return false;
    }

    return aEntries.every(([key, value]) =>
      Object.prototype.hasOwnProperty.call(b as Record<string, unknown>, key)
        ? areRequestsEqual(value, (b as Record<string, unknown>)[key])
        : false
    );
  }

  return false;
}

function providerAllowlistAspect(
  allowed: string[] | undefined
): EgressAspect {
  return async (ctx, next) => {
    if (!allowed || allowed.length === 0) {
      logger.debug({
        providerId: ctx.providerId,
        tenantId: ctx.tenantId,
        task: ctx.task,
      }, 'No provider allowlist configured, skipping check');
      return next(ctx);
    }

    const isAllowed = allowed.includes(ctx.providerId);

    logger.debug({
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
      task: ctx.task,
      allowedProviders: allowed,
      isAllowed,
    }, 'Checking provider against allowlist');

    if (!isAllowed) {
      logger.warn(
        { providerId: ctx.providerId, tenantId: ctx.tenantId, task: ctx.task },
        'Disallowed provider used'
      );

      throw new LlmError(
        `Provider ${ctx.providerId} is not allowed by the current egress policy`
      );
    }

    logger.debug({
      providerId: ctx.providerId,
    }, 'Provider allowed by allowlist');

    return next(ctx);
  };
}

function sanitizeRequestAspect(
  defaultMode: EgressMode,
  options: { preserveOriginalRequest?: boolean } = {}
): EgressAspect {
  return async (ctx, next) => {
    const mode = ctx.effectiveMode ?? defaultMode;

    logger.debug({
      target: ctx.target,
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
      task: ctx.task,
      mode,
      defaultMode,
    }, 'Applying request sanitization');

    if (mode === 'off') {
      logger.debug({
        tenantId: ctx.tenantId,
        task: ctx.task,
      }, 'Sanitization mode is OFF, skipping');
      return next({ ...ctx, effectiveMode: mode });
    }

    const originalRequest = ctx.request;
    const sanitizedRequest = sanitizeObjectForEgress(originalRequest);
    const redactionApplied = !areRequestsEqual(originalRequest, sanitizedRequest);

    logger.debug({
      tenantId: ctx.tenantId,
      task: ctx.task,
      mode,
      redactionApplied,
    }, 'Sanitized egress request');

    const metadata = {
      ...ctx.metadata,
      redactionApplied,
      redactionReportOnly: mode === 'report-only',
    };

    const baseCtx: EgressGuardContext = {
      ...ctx,
      sanitizedRequest,
      metadata,
      effectiveMode: mode,
    };

    if (mode === 'enforce') {
      logger.debug({
        tenantId: ctx.tenantId,
        task: ctx.task,
        redactionApplied,
      }, 'Egress mode ENFORCE: using sanitized request');

      baseCtx.request = sanitizedRequest;
      if (options.preserveOriginalRequest) {
        baseCtx.originalRequest = originalRequest;
      }
    } else {
      logger.debug({
        tenantId: ctx.tenantId,
        task: ctx.task,
        redactionApplied,
      }, 'Egress mode REPORT-ONLY: using original request');

      baseCtx.request = originalRequest;
      if (options.preserveOriginalRequest) {
        baseCtx.originalRequest = originalRequest;
      }

      if (redactionApplied) {
        logger.warn(
          { tenantId: ctx.tenantId, task: ctx.task, mode: 'report-only' },
          'PII sanitiser changed payload'
        );
      }
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

    const providerAspect = providerAllowlistAspect(config?.allowedProviders);

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
    const effectiveMode = ctx.effectiveMode ?? this.defaultMode;
    const mode = ctx.mode ?? effectiveMode;

    logger.debug({
      target: ctx.target,
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
      task: ctx.task,
      mode,
      effectiveMode,
    }, 'Guarding egress request');

    const result = await this.pipeline({ ...ctx, effectiveMode, mode });

    logger.debug({
      target: ctx.target,
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
      task: ctx.task,
      redactionApplied: result.metadata?.redactionApplied,
    }, 'Egress request guarded');

    return result;
  }

  async guardAndExecute<T>(
    ctx: EgressGuardContext,
    execute: (ctx: EgressGuardContext) => Promise<T>
  ): Promise<T> {
    logger.debug({
      target: ctx.target,
      providerId: ctx.providerId,
      endpointId: ctx.endpointId,
      tenantId: ctx.tenantId,
      task: ctx.task,
    }, 'Starting guardAndExecute');

    const guarded = await this.guard(ctx);
    const effectiveMode = guarded.effectiveMode ?? this.defaultMode;

    const executionCtx: EgressGuardContext = { ...guarded, effectiveMode };

    if (effectiveMode === 'enforce') {
      executionCtx.request = guarded.sanitizedRequest ?? guarded.request;
      logger.debug({
        tenantId: ctx.tenantId,
        task: ctx.task,
      }, 'Executing with sanitized request');
    } else {
      executionCtx.request = guarded.request;
      logger.debug({
        tenantId: ctx.tenantId,
        task: ctx.task,
      }, 'Executing with original request');
    }

    const result = await execute(executionCtx);

    logger.debug({
      target: ctx.target,
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
      task: ctx.task,
    }, 'guardAndExecute completed');

    return result;
  }
}
