/**
 * Cost Tracking Initialization
 *
 * Sets up the cost tracking system with Supabase storage and quota management.
 * Supabase is required in both local development and production environments.
 *
 * Usage:
 * Import this module at app startup to initialize cost tracking:
 * ```typescript
 * import './lib/costTracking';
 * ```
 */

import {
  initCostTracking,
  SupabaseCostStorage,
  SupabaseQuotaProvider,
  LLM_TOUCHPOINTS,
  type CostQuota,
} from '@reg-copilot/reg-intel-observability';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('CostTracking');

/**
 * Get Supabase credentials from environment
 *
 * Supabase is required in both local development and production.
 * For local development, use `supabase start` to run a local Supabase instance.
 *
 * @throws Error if Supabase credentials are not configured
 */
function getSupabaseCredentials(): { supabaseUrl: string; supabaseKey: string } {
  // Avoid initializing in browser
  if (typeof window !== 'undefined') {
    throw new Error('Cost tracking must be initialized on the server');
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase credentials required for cost tracking. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
        'For local development, run `supabase start` to start a local Supabase instance.'
    );
  }

  return { supabaseUrl, supabaseKey };
}

/**
 * Create cost tracking providers using Supabase
 *
 * Supabase is the only supported storage backend for cost tracking.
 * This ensures consistent behavior across local development and production.
 */
function createCostTrackingProviders(): {
  storage: SupabaseCostStorage;
  quotas: SupabaseQuotaProvider;
} {
  const credentials = getSupabaseCredentials();

  const client = createClient(credentials.supabaseUrl, credentials.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'copilot_internal' },
  });

  logger.info(
    { supabaseUrl: credentials.supabaseUrl },
    'Using Supabase for cost tracking storage'
  );

  return {
    storage: new SupabaseCostStorage(client),
    quotas: new SupabaseQuotaProvider(client),
  };
}

/**
 * Initialize cost tracking system
 *
 * Uses Supabase for storage in both local development and production.
 * For local development, ensure you have a local Supabase instance running.
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for server-side operations
 */
export const initializeCostTracking = (): void => {
  try {
    // Check if already initialized
    const { getCostTrackingServiceIfInitialized } = require('@reg-copilot/reg-intel-observability');
    if (getCostTrackingServiceIfInitialized()) {
      logger.info('Cost tracking already initialized');
      return;
    }

    // Create Supabase-backed providers
    const { storage, quotas } = createCostTrackingProviders();

    // Initialize cost tracking
    const costService = initCostTracking({
      storage,
      quotas,

      // Quota enforcement - set true to block requests that would exceed quotas
      enforceQuotas: false, // Set to true in production if you want hard limits

      // Callback when quota warning threshold is exceeded
      onQuotaWarning: (quota: CostQuota) => {
        const percentUsed = ((quota.currentSpendUsd / quota.limitUsd) * 100).toFixed(1);
        logger.warn({
          scope: quota.scope,
          scopeId: quota.scopeId,
          currentSpend: quota.currentSpendUsd.toFixed(4),
          limit: quota.limitUsd.toFixed(4),
          percentUsed,
          period: quota.period,
        }, 'Quota warning threshold exceeded');
      },

      // Callback when quota is exceeded
      onQuotaExceeded: (quota: CostQuota) => {
        logger.error({
          scope: quota.scope,
          scopeId: quota.scopeId,
          currentSpend: quota.currentSpendUsd.toFixed(4),
          limit: quota.limitUsd.toFixed(4),
          period: quota.period,
        }, 'Quota exceeded');
      },
    });

    logger.info({
      storage: 'supabase',
      hasStorage: costService.hasStorage(),
      hasQuotas: costService.hasQuotas(),
      enforcing: costService.isEnforcingQuotas(),
      touchpoints: Object.values(LLM_TOUCHPOINTS),
    }, 'Cost tracking initialized successfully');

    // Optionally set default quotas
    // Example: Platform-wide monthly quota
    // costService.setQuota('platform', undefined, 10_000, 'month', 0.8);
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to initialize cost tracking');
  }
};

/**
 * Get cost tracking service
 *
 * Returns the initialized cost tracking service, or null if not initialized.
 */
export const getCostTracking = () => {
  const { getCostTrackingServiceIfInitialized } = require('@reg-copilot/reg-intel-observability');
  return getCostTrackingServiceIfInitialized();
};

/**
 * Cost Tracking Configuration Notes
 *
 * This module uses Supabase for cost storage and quota management in both
 * local development and production environments. There is no in-memory fallback.
 *
 * ## Local Development Setup
 *
 * 1. Start local Supabase: `supabase start`
 * 2. Ensure environment variables are set:
 *    - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *    - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 *
 * ## Production Considerations
 *
 * 1. **Quota Enforcement**
 *    Set enforceQuotas: true to block requests that exceed quotas
 *    This prevents runaway costs but may impact UX
 *    Consider soft limits + alerting instead
 *
 * 2. **Alert Integration**
 *    Implement onQuotaWarning and onQuotaExceeded callbacks to:
 *    - Send Slack notifications
 *    - Trigger PagerDuty incidents
 *    - Email billing admins
 *    - Update status dashboards
 *
 * 3. **Default Quotas**
 *    Set sensible default quotas based on your pricing:
 *    - Platform-wide: Prevent catastrophic overspend
 *    - Per-tenant: Based on subscription tier
 *    - Per-user: Prevent abuse
 *
 * Example quota setup:
 * ```typescript
 * // Set tier-based quotas
 * await costService.setQuota('platform', undefined, 10_000, 'month', 0.8);
 * await costService.setQuota('tenant', 'tenant-123', 100, 'month', 0.8);
 * await costService.setQuota('user', 'user-456', 10, 'month', 0.8);
 * ```
 */
