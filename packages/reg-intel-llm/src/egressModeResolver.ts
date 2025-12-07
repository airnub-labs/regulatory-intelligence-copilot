import type { EgressMode } from './egressClient.js';
import type { LlmCompletionOptions, TenantLlmPolicy } from './llmRouter.js';

export interface EgressModeResolution {
  requestedMode?: EgressMode;
  effectiveMode: EgressMode;
}

/**
 * Resolve requested vs effective egress modes with priority:
 * base default → tenant policy → per-user policy → per-call override.
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

  const tenantAllowOff = tenantPolicy?.allowOffMode ?? false;
  const userAllowOff = userPolicy?.allowOffMode ?? tenantAllowOff;

  let requestedMode: EgressMode | undefined;
  let effectiveMode: EgressMode | undefined;

  const applyCandidate = (candidate?: EgressMode, allowOff = true) => {
    if (!candidate) return;

    requestedMode = candidate;

    if (candidate === 'off' && !allowOff) {
      return;
    }

    effectiveMode = candidate;
  };

  applyCandidate(baseMode, true);
  applyCandidate(tenantPolicy?.egressMode, tenantAllowOff);
  applyCandidate(userPolicy?.egressMode, userAllowOff);
  applyCandidate(options?.egressModeOverride, userAllowOff);

  return { requestedMode, effectiveMode: effectiveMode ?? baseMode };
}
