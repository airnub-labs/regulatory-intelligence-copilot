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

import type { QuotaDetails } from './quotaErrors';
import {
  initCostTracking,
  SupabaseCostStorage,
  SupabaseQuotaProvider,
  LLM_TOUCHPOINTS,
  initNotificationServiceFromEnv,
  createCostAlert,
  type CostQuota,
  type NotificationService,
} from '@reg-copilot/reg-intel-observability';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const logger = createLogger('CostTracking');

/** Notification service instance (initialized lazily) */
let notificationService: NotificationService | null = null;

/**
 * Get or initialize the notification service
 *
 * Initializes from environment variables on first call.
 * Configure these env vars to enable notifications:
 * - COST_ALERT_CHANNELS: Comma-separated list of enabled channels (slack,email,pagerduty)
 * - COST_ALERT_SLACK_WEBHOOK_URL: Slack webhook URL
 * - COST_ALERT_EMAIL_SMTP_HOST: SMTP host for email
 * - COST_ALERT_PAGERDUTY_ROUTING_KEY: PagerDuty routing key
 */
function getNotificationService(): NotificationService {
  if (!notificationService) {
    notificationService = initNotificationServiceFromEnv();
  }
  return notificationService;
}

/**
 * Get Supabase credentials from environment
 *
 * Supabase is required in both local development and production.
 * For local development, use `supabase start` to run a local Supabase instance.
 *
 * @returns Credentials or null if not configured
 */
function getSupabaseCredentials(): { supabaseUrl: string; supabaseKey: string } | null {
  // Avoid initializing in browser
  if (typeof window !== 'undefined') {
    throw new Error('Cost tracking must be initialized on the server');
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn(
      'Supabase credentials required for cost tracking. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
        'For local development, run `supabase start` to start a local Supabase instance.'
    );
    return null;
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

  if (!credentials) {
    return { storage: null, quotas: null } as unknown as {
      storage: SupabaseCostStorage;
      quotas: SupabaseQuotaProvider;
    };
  }

  const client = createClient(credentials.supabaseUrl, credentials.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'copilot_internal' },
  }) as unknown as SupabaseClient;

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
 *
 * Notification environment variables (optional):
 * - COST_ALERT_CHANNELS: Comma-separated list (slack,email,pagerduty)
 * - COST_ALERT_SLACK_WEBHOOK_URL: Slack webhook URL
 * - COST_ALERT_SLACK_CHANNEL: Slack channel (optional)
 * - COST_ALERT_EMAIL_SMTP_HOST: SMTP host
 * - COST_ALERT_EMAIL_SMTP_PORT: SMTP port (default: 587)
 * - COST_ALERT_EMAIL_SMTP_USER: SMTP username
 * - COST_ALERT_EMAIL_SMTP_PASSWORD: SMTP password
 * - COST_ALERT_EMAIL_FROM: From address
 * - COST_ALERT_EMAIL_TO: Comma-separated recipient addresses
 * - COST_ALERT_PAGERDUTY_ROUTING_KEY: PagerDuty routing key
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

    if (!storage || !quotas) {
      logger.warn('Skipping cost tracking initialization due to missing Supabase credentials');
      return;
    }

    // Initialize cost tracking
    const costService = initCostTracking({
      storage,
      quotas,

      // Quota enforcement - ENABLED for Phase 2
      // Blocks LLM requests that would exceed configured quotas
      // Configure quotas in Supabase: copilot_internal.cost_quotas table
      enforceQuotas: process.env.ENFORCE_COST_QUOTAS !== 'false', // Default: true (disable with ENFORCE_COST_QUOTAS=false)

      // Callback when quota warning threshold is exceeded
      onQuotaWarning: async (quota: CostQuota) => {
        const percentUsed = ((quota.currentSpendUsd / quota.limitUsd) * 100).toFixed(1);

        // Log the warning
        logger.warn({
          scope: quota.scope,
          scopeId: quota.scopeId,
          currentSpend: quota.currentSpendUsd.toFixed(4),
          limit: quota.limitUsd.toFixed(4),
          percentUsed,
          period: quota.period,
        }, 'Quota warning threshold exceeded');

        // Send notifications to configured channels
        try {
          const notifier = getNotificationService();
          const alert = createCostAlert('quota_warning', quota);
          const results = await notifier.sendAlert(alert);

          // Log notification results
          for (const result of results) {
            if (result.success) {
              logger.info({ channel: result.channel, messageId: result.messageId }, 'Alert sent');
            } else {
              logger.error({ channel: result.channel, error: result.error }, 'Failed to send alert');
            }
          }
        } catch (error) {
          logger.error({ error }, 'Failed to send quota warning notifications');
        }
      },

      // Callback when quota is exceeded
      onQuotaExceeded: async (quota: CostQuota) => {
        // Log the error
        logger.error({
          scope: quota.scope,
          scopeId: quota.scopeId,
          currentSpend: quota.currentSpendUsd.toFixed(4),
          limit: quota.limitUsd.toFixed(4),
          period: quota.period,
        }, 'Quota exceeded');

        // Send notifications to configured channels
        try {
          const notifier = getNotificationService();
          const alert = createCostAlert('quota_exceeded', quota);
          const results = await notifier.sendAlert(alert);

          // Log notification results
          for (const result of results) {
            if (result.success) {
              logger.info({ channel: result.channel, messageId: result.messageId }, 'Alert sent');
            } else {
              logger.error({ channel: result.channel, error: result.error }, 'Failed to send alert');
            }
          }
        } catch (error) {
          logger.error({ error }, 'Failed to send quota exceeded notifications');
        }
      },
    });

    // Log enabled notification channels
    const enabledChannels = process.env.COST_ALERT_CHANNELS ?? '';
    const channels = enabledChannels.split(',').filter(c => c.trim());

    logger.info({
      storage: 'supabase',
      hasStorage: costService.hasStorage(),
      hasQuotas: costService.hasQuotas(),
      enforcing: costService.isEnforcingQuotas(),
      touchpoints: Object.values(LLM_TOUCHPOINTS),
      notificationChannels: channels.length > 0 ? channels : ['none configured'],
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
 * Check LLM quota before processing chat request (Phase 3)
 *
 * Performs a pre-request quota check to fail fast if quota would be exceeded.
 * This provides better UX by rejecting the request immediately with HTTP 429
 * instead of starting the stream and failing mid-response.
 *
 * @param tenantId - Tenant ID to check quota for
 * @param estimatedCostUsd - Estimated cost of the LLM request (from database or fallback ENUM)
 * @returns Quota check result with allowed status and optional reason
 */
export const checkLLMQuotaBeforeRequest = async (
  tenantId: string,
  estimatedCostUsd: number
): Promise<{ allowed: boolean; reason?: string; quotaDetails?: QuotaDetails }> => {
  try {
    // Get cost tracking service
    const costService = getCostTracking();

    if (!costService) {
      // Cost tracking not initialized - allow request
      logger.debug('Cost tracking not initialized, allowing request');
      return { allowed: true };
    }

    // Check if quota enforcement is enabled
    if (!costService.isEnforcingQuotas()) {
      logger.debug('Quota enforcement disabled, allowing request');
      return { allowed: true };
    }

    // Get quota provider
    const quotaProvider = costService.getQuotaProvider();
    if (!quotaProvider) {
      logger.debug('Quota provider not available, allowing request');
      return { allowed: true };
    }

    // Check tenant quota
    const quotaCheck = await quotaProvider.checkQuota({
      scope: 'tenant',
      scopeId: tenantId,
      estimatedCostUsd,
    });

    if (!quotaCheck.allowed) {
      logger.warn({
        tenantId,
        estimatedCostUsd,
        currentSpend: quotaCheck.currentSpendUsd,
        limit: quotaCheck.limitUsd,
      }, 'LLM quota check failed');

      return {
        allowed: false,
        reason: quotaCheck.denialReason || 'LLM quota exceeded',
        quotaDetails: {
          scope: 'tenant',
          scopeId: tenantId,
          resourceType: 'llm',
          limitUsd: quotaCheck.limitUsd,
          currentSpendUsd: quotaCheck.currentSpendUsd,
          estimatedCostUsd,
          remainingUsd: quotaCheck.remainingUsd,
          period: quotaCheck.period || 'day',
          utilizationPercent: quotaCheck.utilizationPercent,
        },
      };
    }

    logger.debug({
      tenantId,
      estimatedCostUsd,
      quotaCheckPassed: true,
    }, 'LLM quota check passed');

    return { allowed: true };
  } catch (error) {
    // On error, log and allow request (fail open)
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      tenantId,
    }, 'Error checking LLM quota, allowing request');

    return { allowed: true };
  }
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
 *    Set enforceQuotas: true to block requests that would exceed quotas
 *    This prevents runaway costs but may impact UX
 *    Consider soft limits + alerting instead
 *
 * 2. **Alert Integration**
 *    Configure notification channels via environment variables:
 *
 *    ### Slack
 *    - COST_ALERT_CHANNELS=slack
 *    - COST_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
 *    - COST_ALERT_SLACK_CHANNEL=#cost-alerts (optional)
 *
 *    ### Email
 *    - COST_ALERT_CHANNELS=email
 *    - COST_ALERT_EMAIL_SMTP_HOST=smtp.example.com
 *    - COST_ALERT_EMAIL_SMTP_PORT=587
 *    - COST_ALERT_EMAIL_SMTP_USER=user
 *    - COST_ALERT_EMAIL_SMTP_PASSWORD=pass
 *    - COST_ALERT_EMAIL_FROM=alerts@example.com
 *    - COST_ALERT_EMAIL_TO=admin@example.com,finance@example.com
 *
 *    ### PagerDuty
 *    - COST_ALERT_CHANNELS=pagerduty
 *    - COST_ALERT_PAGERDUTY_ROUTING_KEY=your-routing-key
 *
 *    ### Multiple Channels
 *    - COST_ALERT_CHANNELS=slack,email,pagerduty
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
 *
 * ## View Cost Dashboard
 *
 * Access the cost analytics dashboard at: /analytics/costs
 */
