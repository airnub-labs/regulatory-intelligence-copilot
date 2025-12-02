import { describe, expect, it } from 'vitest';

import type { EgressMode } from './egressClient.js';
import type { TenantLlmPolicy } from './llmRouter.js';
import { resolveEffectiveEgressMode } from './egressModeResolver.js';

const baseMode: EgressMode = 'enforce';

const defaultTenant: TenantLlmPolicy = {
  tenantId: 'tenant-1',
  defaultModel: 'model-a',
  defaultProvider: 'mock',
  allowRemoteEgress: true,
  tasks: [],
};

describe('resolveEffectiveEgressMode', () => {
  it('defaults to base mode when no policy is provided', () => {
    const resolution = resolveEffectiveEgressMode(baseMode, null);

    expect(resolution.requestedMode).toBe('enforce');
    expect(resolution.effectiveMode).toBe('enforce');
  });

  it('applies tenant egress mode when no overrides exist', () => {
    const policy: TenantLlmPolicy = {
      ...defaultTenant,
      egressMode: 'report-only',
      allowOffMode: false,
    };

    const resolution = resolveEffectiveEgressMode(baseMode, policy);

    expect(resolution.requestedMode).toBe('report-only');
    expect(resolution.effectiveMode).toBe('report-only');
  });

  it('ignores tenant off mode when tenant allowOffMode is false', () => {
    const policy: TenantLlmPolicy = {
      ...defaultTenant,
      egressMode: 'off',
      allowOffMode: false,
    };

    const resolution = resolveEffectiveEgressMode(baseMode, policy);

    expect(resolution.requestedMode).toBe('off');
    expect(resolution.effectiveMode).toBe('enforce');
  });

  it('prefers per-user mode even when tenant mode is set', () => {
    const policy: TenantLlmPolicy = {
      ...defaultTenant,
      egressMode: 'enforce',
      allowOffMode: false,
      userPolicies: {
        'user-1': { egressMode: 'report-only' },
      },
    };

    const resolution = resolveEffectiveEgressMode(baseMode, policy, { userId: 'user-1' });

    expect(resolution.requestedMode).toBe('report-only');
    expect(resolution.effectiveMode).toBe('report-only');
  });

  it('records requested user off mode but clamps to tenant effective when not allowed', () => {
    const policy: TenantLlmPolicy = {
      ...defaultTenant,
      egressMode: 'report-only',
      allowOffMode: false,
      userPolicies: {
        'user-1': { egressMode: 'off' },
      },
    };

    const resolution = resolveEffectiveEgressMode(baseMode, policy, { userId: 'user-1' });

    expect(resolution.requestedMode).toBe('off');
    expect(resolution.effectiveMode).toBe('report-only');
  });

  it('honours per-user allowOffMode above tenant restrictions', () => {
    const policy: TenantLlmPolicy = {
      ...defaultTenant,
      egressMode: 'enforce',
      allowOffMode: false,
      userPolicies: {
        'user-1': { egressMode: 'off', allowOffMode: true },
      },
    };

    const resolution = resolveEffectiveEgressMode(baseMode, policy, { userId: 'user-1' });

    expect(resolution.requestedMode).toBe('off');
    expect(resolution.effectiveMode).toBe('off');
  });

  it('keeps user mode when per-call override is not allowed', () => {
    const policy: TenantLlmPolicy = {
      ...defaultTenant,
      egressMode: 'report-only',
      allowOffMode: false,
      userPolicies: {
        'user-1': { egressMode: 'report-only' },
      },
    };

    const resolution = resolveEffectiveEgressMode(baseMode, policy, {
      userId: 'user-1',
      egressModeOverride: 'off',
    });

    expect(resolution.requestedMode).toBe('off');
    expect(resolution.effectiveMode).toBe('report-only');
  });

  it('lets per-call overrides win when allowed', () => {
    const policy: TenantLlmPolicy = {
      ...defaultTenant,
      egressMode: 'report-only',
      allowOffMode: true,
      userPolicies: {
        'user-1': { egressMode: 'enforce' },
      },
    };

    const resolution = resolveEffectiveEgressMode(baseMode, policy, {
      userId: 'user-1',
      egressModeOverride: 'off',
    });

    expect(resolution.requestedMode).toBe('off');
    expect(resolution.effectiveMode).toBe('off');
  });
});
