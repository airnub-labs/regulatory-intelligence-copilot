/**
 * E2B Cost Tracking Initialization
 *
 * Sets up the E2B cost tracking system with Supabase storage and quota management.
 * Integrates with the execution context lifecycle for automatic cost recording.
 *
 * Usage:
 * Import this module at app startup to initialize E2B cost tracking:
 * ```typescript
 * import './lib/e2bCostTracking';
 * ```
 */

import {
  SupabaseE2BPricingService,
  SupabaseE2BCostTrackingService,
  createLogger,
  type NotificationService,
  initNotificationServiceFromEnv,
  createCostAlert,
} from '@reg-copilot/reg-intel-observability';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const logger = createLogger('E2BCostTracking');

/** Global E2B cost tracking services */
let e2bPricingService: SupabaseE2BPricingService | null = null;
let e2bCostTrackingService: SupabaseE2BCostTrackingService | null = null;
let notificationService: NotificationService | null = null;

/** Quota enforcement configuration */
let enforceE2BQuotas = true; // Default: enforce quotas

/**
 * Get or initialize the notification service
 */
function getNotificationService(): NotificationService {
  if (!notificationService) {
    notificationService = initNotificationServiceFromEnv();
  }
  return notificationService;
}

/**
 * Get Supabase credentials from environment
 */
function getSupabaseCredentials(): { supabaseUrl: string; supabaseKey: string } | null {
  // Avoid initializing in browser
  if (typeof window !== 'undefined') {
    throw new Error('E2B cost tracking must be initialized on the server');
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn(
      'Supabase credentials required for E2B cost tracking. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
    return null;
  }

  return { supabaseUrl, supabaseKey };
}

/**
 * Initialize E2B cost tracking services
 */
export const initializeE2BCostTracking = (): void => {
  try {
    // Check if already initialized
    if (e2bCostTrackingService) {
      logger.info('E2B cost tracking already initialized');
      return;
    }

    // Get Supabase credentials
    const credentials = getSupabaseCredentials();
    if (!credentials) {
      logger.warn('Skipping E2B cost tracking initialization due to missing Supabase credentials');
      return;
    }

    // Create Supabase client
    const client = createClient(credentials.supabaseUrl, credentials.supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'copilot_internal' },
    }) as unknown as SupabaseClient;

    logger.info(
      { supabaseUrl: credentials.supabaseUrl },
      'Using Supabase for E2B cost tracking storage'
    );

    // Initialize services
    e2bPricingService = new SupabaseE2BPricingService(client);
    e2bCostTrackingService = new SupabaseE2BCostTrackingService(client, e2bPricingService);

    // Configure quota enforcement from environment
    enforceE2BQuotas = process.env.ENFORCE_E2B_QUOTAS !== 'false'; // Default: true

    // Log enabled notification channels
    const enabledChannels = process.env.COST_ALERT_CHANNELS ?? '';
    const channels = enabledChannels.split(',').filter(c => c.trim());

    logger.info({
      storage: 'supabase',
      enforceQuotas: enforceE2BQuotas,
      notificationChannels: channels.length > 0 ? channels : ['none configured'],
    }, 'E2B cost tracking initialized successfully');

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to initialize E2B cost tracking');
  }
};

/**
 * Get E2B pricing service
 *
 * @throws Error if E2B cost tracking not initialized
 */
export const getE2BPricingService = (): SupabaseE2BPricingService => {
  if (!e2bPricingService) {
    throw new Error('E2B cost tracking not initialized. Call initializeE2BCostTracking() first.');
  }
  return e2bPricingService;
};

/**
 * Get E2B cost tracking service
 *
 * @throws Error if E2B cost tracking not initialized
 */
export const getE2BCostTrackingService = (): SupabaseE2BCostTrackingService => {
  if (!e2bCostTrackingService) {
    throw new Error('E2B cost tracking not initialized. Call initializeE2BCostTracking() first.');
  }
  return e2bCostTrackingService;
};

/**
 * Get E2B services if initialized, otherwise null
 */
export const getE2BServicesIfInitialized = (): {
  pricing: SupabaseE2BPricingService | null;
  costTracking: SupabaseE2BCostTrackingService | null;
} => {
  return {
    pricing: e2bPricingService,
    costTracking: e2bCostTrackingService,
  };
};

/**
 * Check if E2B quota enforcement is enabled
 */
export const isE2BQuotaEnforcementEnabled = (): boolean => {
  return enforceE2BQuotas && e2bCostTrackingService !== null;
};

/**
 * Check E2B quota before creating sandbox
 *
 * This function should be called BEFORE creating an E2B sandbox to ensure
 * the tenant has sufficient quota.
 *
 * @param tenantId - Tenant ID to check quota for
 * @param estimatedCostUsd - Estimated cost of the sandbox operation
 * @returns Quota check result with allowed/denied status
 * @throws Error if cost tracking not initialized
 */
export const checkE2BQuotaBeforeOperation = async (
  tenantId: string,
  estimatedCostUsd: number
): Promise<{
  allowed: boolean;
  reason?: string;
  limitUsd?: number;
  currentSpendUsd?: number;
  remainingUsd?: number;
}> => {
  const service = getE2BCostTrackingService();

  const result = await service.checkQuota(tenantId, estimatedCostUsd);

  // Trigger warning callback if threshold reached
  if (result.warningThresholdReached && result.allowed) {
    logger.warn({
      tenantId,
      utilizationPercent: result.utilizationPercent.toFixed(1),
      currentSpend: result.currentSpendUsd.toFixed(4),
      limit: result.limitUsd.toFixed(4),
    }, 'E2B quota warning threshold exceeded');

    // Send notification
    try {
      const notifier = getNotificationService();
      const alert = createCostAlert('quota_warning', {
        id: 'e2b-quota-warning',
        scope: 'tenant',
        scopeId: tenantId,
        limitUsd: result.limitUsd,
        currentSpendUsd: result.currentSpendUsd,
        period: 'day',
        periodStart: new Date(),
        periodEnd: new Date(),
        isExceeded: false,
        warningThreshold: 0.8,
        warningExceeded: true,
      });

      const results = await notifier.sendAlert(alert);
      for (const notifResult of results) {
        if (notifResult.success) {
          logger.info({ channel: notifResult.channel }, 'E2B quota warning sent');
        } else {
          logger.error({ channel: notifResult.channel, error: notifResult.error }, 'Failed to send E2B quota warning');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to send E2B quota warning notifications');
    }
  }

  // Trigger exceeded callback if quota exceeded
  if (!result.allowed) {
    logger.error({
      tenantId,
      currentSpend: result.currentSpendUsd.toFixed(4),
      limit: result.limitUsd.toFixed(4),
      estimatedCost: estimatedCostUsd.toFixed(4),
    }, 'E2B quota exceeded');

    // Send notification
    try {
      const notifier = getNotificationService();
      const alert = createCostAlert('quota_exceeded', {
        id: 'e2b-quota-exceeded',
        scope: 'tenant',
        scopeId: tenantId,
        limitUsd: result.limitUsd,
        currentSpendUsd: result.currentSpendUsd,
        period: 'day',
        periodStart: new Date(),
        periodEnd: new Date(),
        isExceeded: true,
      });

      const results = await notifier.sendAlert(alert);
      for (const notifResult of results) {
        if (notifResult.success) {
          logger.info({ channel: notifResult.channel }, 'E2B quota exceeded alert sent');
        } else {
          logger.error({ channel: notifResult.channel, error: notifResult.error }, 'Failed to send E2B quota exceeded alert');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to send E2B quota exceeded notifications');
    }

    // If enforcement is enabled, throw error to prevent operation
    if (enforceE2BQuotas) {
      throw new Error(result.denialReason || 'E2B quota exceeded');
    }
  }

  return {
    allowed: result.allowed,
    reason: result.denialReason,
    limitUsd: result.limitUsd,
    currentSpendUsd: result.currentSpendUsd,
    remainingUsd: result.remainingUsd,
  };
};

/**
 * E2B Cost Tracking Configuration Notes
 *
 * This module provides E2B cost tracking similar to LLM cost tracking.
 *
 * ## Integration Points
 *
 * Call `checkE2BQuotaBeforeOperation()` in:
 * - ExecutionContextManager.getOrCreateContext() - Before creating sandbox
 * - Any manual sandbox creation code
 *
 * Example usage in execution context manager:
 * ```typescript
 * import { checkE2BQuotaBeforeOperation, getE2BCostTrackingService } from './lib/e2bCostTracking';
 *
 * async getOrCreateContext(input: GetOrCreateContextInput) {
 *   // 1. Check quota BEFORE creating expensive sandbox
 *   if (isE2BQuotaEnforcementEnabled()) {
 *     const estimatedCost = 0.03; // ~5 min at $0.0001/sec
 *     await checkE2BQuotaBeforeOperation(input.tenantId, estimatedCost);
 *   }
 *
 *   // 2. Create sandbox (safe to proceed)
 *   const sandbox = await createSandbox();
 *
 *   // 3. Record cost on termination
 *   const costTracking = getE2BCostTrackingService();
 *   await costTracking.recordCost({ ... });
 * }
 * ```
 *
 * ## Environment Variables
 *
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for server-side operations
 * - ENFORCE_E2B_QUOTAS: Set to 'false' to disable quota enforcement (default: true)
 *
 * ## Notification Configuration
 *
 * Configure these env vars to enable E2B cost alerts:
 * - COST_ALERT_CHANNELS: Comma-separated list (slack,email,pagerduty)
 * - COST_ALERT_SLACK_WEBHOOK_URL: Slack webhook URL
 * - COST_ALERT_EMAIL_SMTP_HOST: SMTP host
 * - COST_ALERT_PAGERDUTY_ROUTING_KEY: PagerDuty routing key
 */
