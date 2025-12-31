/**
 * Cost Tracking Initialization
 *
 * Sets up the cost tracking system with storage and quota management.
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
  type CostQuota,
} from '@reg-copilot/reg-intel-observability';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger({ module: 'CostTracking' });

/**
 * Initialize cost tracking system
 *
 * This should be called once at app startup.
 * Uses in-memory providers for development/testing.
 * For production, replace with database-backed providers.
 */
export const initializeCostTracking = (): void => {
  try {
    // Check if already initialized
    const { getCostTrackingServiceIfInitialized } = require('@reg-copilot/reg-intel-observability');
    if (getCostTrackingServiceIfInitialized()) {
      logger.info('Cost tracking already initialized');
      return;
    }

    // Initialize with in-memory providers
    const costService = initCostTracking({
      // Storage provider - stores up to 100K cost records in memory
      storage: new InMemoryCostStorage({
        maxRecords: 100_000,
      }),

      // Quota provider - manages quotas with automatic period resets
      quotas: new InMemoryQuotaProvider(),

      // Quota enforcement - set true to block requests that would exceed quotas
      enforceQuotas: false, // Set to true in production if you want hard limits

      // Callback when quota warning threshold is exceeded
      onQuotaWarning: (quota: CostQuota) => {
        const percentUsed = ((quota.currentSpendUsd / quota.limitUsd) * 100).toFixed(1);
        logger.warn('Quota warning threshold exceeded', {
          scope: quota.scope,
          scopeId: quota.scopeId,
          currentSpend: quota.currentSpendUsd.toFixed(4),
          limit: quota.limitUsd.toFixed(4),
          percentUsed,
          period: quota.period,
        });

        // TODO: Send alert via webhook, email, Slack, etc.
        // Example:
        // await sendSlackAlert({
        //   message: `⚠️ ${quota.scope}:${quota.scopeId} at ${percentUsed}% of quota ($${quota.currentSpendUsd.toFixed(2)}/$${quota.limitUsd.toFixed(2)})`,
        // });
      },

      // Callback when quota is exceeded
      onQuotaExceeded: (quota: CostQuota) => {
        logger.error('Quota exceeded', {
          scope: quota.scope,
          scopeId: quota.scopeId,
          currentSpend: quota.currentSpendUsd.toFixed(4),
          limit: quota.limitUsd.toFixed(4),
          period: quota.period,
        });

        // TODO: Send critical alert
        // Example:
        // await sendPagerDutyAlert({
        //   severity: 'critical',
        //   message: `🚨 ${quota.scope}:${quota.scopeId} quota exceeded`,
        // });
      },
    });

    logger.info('Cost tracking initialized successfully', {
      hasStorage: costService.hasStorage(),
      hasQuotas: costService.hasQuotas(),
      enforcing: costService.isEnforcingQuotas(),
    });

    // Optionally set default quotas
    // Example: Platform-wide monthly quota
    // costService.setQuota('platform', undefined, 10_000, 'month', 0.8);
  } catch (error) {
    logger.error('Failed to initialize cost tracking', {
      error: error instanceof Error ? error.message : String(error),
    });
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
