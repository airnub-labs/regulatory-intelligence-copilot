import type { EgressMode } from './egressClient.js';
import type { LlmCompletionOptions, TenantLlmPolicy } from './llmRouter.js';

export interface EgressModeResolution {
  requestedMode?: EgressMode;
  effectiveMode: EgressMode;
}

/**
 * Resolve requested vs effective egress modes with priority:
 * per-user override (including allowOffMode) → tenant policy → global default.
 * Returns both requested and effective values for observability/logging.
 */
export function resolveEffectiveEgressMode(
  baseMode: EgressMode,
  tenantPolicy: TenantLlmPolicy | null,
  options?: LlmCompletionOptions
): EgressModeResolution {
  const userPolicy = options?.userId
    ? tenantPolicy?.userPolicies?.[options.userId]
    : undefined;

  const allowOff =
    userPolicy?.allowOffMode ?? tenantPolicy?.allowOffMode ?? false;

  let requestedMode: EgressMode | undefined;
  let effectiveMode: EgressMode = baseMode;

  const applyCandidate = (candidate?: EgressMode) => {
    if (!candidate) return;

    requestedMode = candidate;

    if (candidate === 'off' && !allowOff) {
      return;
    }

    effectiveMode = candidate;
  };

  applyCandidate(tenantPolicy?.egressMode);
  applyCandidate(userPolicy?.egressMode);
  applyCandidate(options?.egressModeOverride);

  return { requestedMode, effectiveMode };
}
