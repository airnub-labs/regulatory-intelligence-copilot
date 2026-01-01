/**
 * Cost Tracking Initialization
 *
 * Sets up the cost tracking system with storage and quota management.
 * Automatically selects Supabase for production or in-memory for development.
 *
 * Usage:
 * Import this module at app startup to initialize cost tracking:
 * ```typescript
 * import './lib/costTracking';
 * ```
 */

import {
  initCostTracking,
  InMemoryCostStorage,
  InMemoryQuotaProvider,
  SupabaseCostStorage,
  SupabaseQuotaProvider,
  LLM_TOUCHPOINTS,
  type CostQuota,
  type CostStorageProvider,
  type QuotaProvider,
} from '@reg-copilot/reg-intel-observability';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('CostTracking');

/**
 * Get Supabase credentials from environment
 */
function resolveSupabaseCredentials(): { supabaseUrl: string; supabaseKey: string } | null {
  // Avoid initializing in browser
  if (typeof window !== 'undefined') return null;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;
  return { supabaseUrl, supabaseKey };
}

/**
 * Create cost tracking providers based on environment
 */
function createCostTrackingProviders(): {
  storage: CostStorageProvider;
  quotas: QuotaProvider;
  mode: 'supabase' | 'memory';
} {
  const credentials = resolveSupabaseCredentials();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const forceCostTrackingMode = process.env.COPILOT_COST_TRACKING_MODE;

  // Check if we should use Supabase
  const useSupabase =
    forceCostTrackingMode === 'supabase' ||
    (isProduction && credentials && forceCostTrackingMode !== 'memory');

  if (useSupabase && credentials) {
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
      mode: 'supabase',
    };
  }

  // Fall back to in-memory
  if (isProduction && !credentials) {
    logger.warn(
      'Supabase credentials not found; using in-memory cost tracking (not suitable for production)'
    );
  }

  return {
    storage: new InMemoryCostStorage({ maxRecords: 100_000 }),
    quotas: new InMemoryQuotaProvider(),
    mode: 'memory',
  };
}

/**
 * Initialize cost tracking system
 *
 * Automatically selects:
 * - Supabase providers in production (if credentials available)
 * - In-memory providers for development/testing
 *
 * Environment variables:
 * - COPILOT_COST_TRACKING_MODE: Force 'supabase' or 'memory' mode
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

    // Create providers based on environment
    const { storage, quotas, mode } = createCostTrackingProviders();

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
      mode,
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
 * Production Configuration Notes
 *
 * For production deployments, consider:
 *
 * 1. **Database-backed Storage**
 *    Replace InMemoryCostStorage with a database provider:
 *    - PostgreSQL: For relational queries and complex aggregations
 *    - ClickHouse: For high-volume time-series analytics
 *    - TimescaleDB: For time-series with PostgreSQL compatibility
 *
 * 2. **Redis-backed Quotas**
 *    Replace InMemoryQuotaProvider with Redis for:
 *    - Multi-instance deployments
 *    - Atomic quota updates
 *    - Distributed quota enforcement
 *
 * 3. **Quota Enforcement**
 *    Set enforceQuotas: true to block requests that exceed quotas
 *    This prevents runaway costs but may impact UX
 *    Consider soft limits + alerting instead
 *
 * 4. **Alert Integration**
 *    Implement onQuotaWarning and onQuotaExceeded callbacks to:
 *    - Send Slack notifications
 *    - Trigger PagerDuty incidents
 *    - Email billing admins
 *    - Update status dashboards
 *
 * 5. **Default Quotas**
 *    Set sensible default quotas based on your pricing:
 *    - Platform-wide: Prevent catastrophic overspend
 *    - Per-tenant: Based on subscription tier
 *    - Per-user: Prevent abuse
 *
 * Example production setup:
 * ```typescript
 * import { PostgresCostStorage, RedisQuotaProvider } from './providers';
 *
 * initCostTracking({
 *   storage: new PostgresCostStorage({
 *     connectionString: process.env.DATABASE_URL,
 *   }),
 *   quotas: new RedisQuotaProvider({
 *     url: process.env.REDIS_URL,
 *   }),
 *   enforceQuotas: true,
 *   onQuotaWarning: async (quota) => {
 *     await sendSlackAlert(...);
 *   },
 *   onQuotaExceeded: async (quota) => {
 *     await sendPagerDutyAlert(...);
 *     await disableTenant(quota.scopeId);
 *   },
 * });
 *
 * // Set tier-based quotas
 * await setQuotasForTier('free', 10);      // $10/month
 * await setQuotasForTier('pro', 100);      // $100/month
 * await setQuotasForTier('enterprise', 1000); // $1000/month
 * ```
 */
