/**
 * Cost Analysis and Alerting Script - Phase 5
 *
 * Runs periodic cost analysis including:
 * - Anomaly detection (cost spikes)
 * - Cost forecasting (future spending predictions)
 * - Optimization recommendations
 * - Automated alerts via Slack/Email/PagerDuty
 *
 * Usage:
 *   npx tsx scripts/run-cost-analysis.ts
 *
 * Schedule with cron:
 *   0 */6 * * * cd /app && npm run cost:analyze  # Every 6 hours
 */

import { createClient } from '@supabase/supabase-js';
import {
  CostAnomalyDetectionService,
  initNotificationServiceFromEnv,
  createCostAlert,
} from '../packages/reg-intel-observability/src/costTracking/index.js';
import { createLogger } from '../packages/reg-intel-observability/src/logging.js';

const logger = createLogger('CostAnalysis');

/**
 * Get Supabase client from environment
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase credentials required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'copilot_billing' },
  });
}

/**
 * Get list of all active tenants
 */
async function getActiveTenants(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  // Get unique tenant IDs from cost quotas
  const { data, error } = await supabase
    .from('cost_quotas')
    .select('scope_id')
    .eq('scope', 'tenant')
    .not('scope_id', 'is', null);

  if (error) {
    logger.error('Failed to get active tenants', { error });
    return [];
  }

  const tenantIds = [...new Set(data.map(row => row.scope_id as string))];
  logger.info(`Found ${tenantIds.length} active tenants`);

  return tenantIds;
}

/**
 * Run cost analysis for a single tenant
 */
async function analyzeTenant(
  tenantId: string,
  anomalyService: CostAnomalyDetectionService,
  notificationService: ReturnType<typeof initNotificationServiceFromEnv>
): Promise<void> {
  logger.info(`Analyzing costs for tenant: ${tenantId}`);

  try {
    // 1. Detect anomalies
    const anomalies = await anomalyService.detectAnomalies(tenantId, 'all');

    if (anomalies.length > 0) {
      logger.warn(`Found ${anomalies.length} cost anomalies for tenant ${tenantId}`);

      for (const anomaly of anomalies) {
        // Send alert for each anomaly
        const alert = createCostAlert('quota_warning', {
          scope: 'tenant',
          scopeId: tenantId,
          resourceType: anomaly.resourceType,
          limitUsd: anomaly.expectedCost,
          currentSpendUsd: anomaly.actualCost,
          period: 'day',
          warningThreshold: 0.8,
        });

        // Customize alert message for anomaly
        alert.title = `Cost Anomaly Detected: ${tenantId}`;
        alert.message = anomaly.description;
        alert.severity = anomaly.severity === 'critical' ? 'critical' : 'warning';

        await notificationService.sendAlert(alert);
      }
    } else {
      logger.debug(`No anomalies detected for tenant ${tenantId}`);
    }

    // 2. Generate forecast
    const llmForecast = await anomalyService.forecastCosts(tenantId, 'llm', 'month');
    const e2bForecast = await anomalyService.forecastCosts(tenantId, 'e2b', 'month');

    if (llmForecast) {
      logger.info(`LLM forecast for ${tenantId}`, {
        forecastedCost: llmForecast.forecastedCost,
        quotaRisk: llmForecast.quotaBreachRisk,
        trend: llmForecast.trend,
      });

      // Alert if high risk of quota breach
      if (llmForecast.quotaBreachRisk === 'high' || llmForecast.quotaBreachRisk === 'medium') {
        const alert = createCostAlert('quota_warning', {
          scope: 'tenant',
          scopeId: tenantId,
          resourceType: 'llm',
          limitUsd: llmForecast.currentQuota || 0,
          currentSpendUsd: llmForecast.forecastedCost * 0.7, // Approximate current from forecast
          period: 'month',
          warningThreshold: 0.8,
        });

        alert.title = `LLM Quota Breach Risk: ${tenantId}`;
        alert.message = llmForecast.trendDescription;
        alert.severity = llmForecast.quotaBreachRisk === 'high' ? 'critical' : 'warning';

        await notificationService.sendAlert(alert);
      }
    }

    if (e2bForecast) {
      logger.info(`E2B forecast for ${tenantId}`, {
        forecastedCost: e2bForecast.forecastedCost,
        quotaRisk: e2bForecast.quotaBreachRisk,
        trend: e2bForecast.trend,
      });

      // Alert if high risk of quota breach
      if (e2bForecast.quotaBreachRisk === 'high' || e2bForecast.quotaBreachRisk === 'medium') {
        const alert = createCostAlert('quota_warning', {
          scope: 'tenant',
          scopeId: tenantId,
          resourceType: 'e2b',
          limitUsd: e2bForecast.currentQuota || 0,
          currentSpendUsd: e2bForecast.forecastedCost * 0.7,
          period: 'month',
          warningThreshold: 0.8,
        });

        alert.title = `E2B Quota Breach Risk: ${tenantId}`;
        alert.message = e2bForecast.trendDescription;
        alert.severity = e2bForecast.quotaBreachRisk === 'high' ? 'critical' : 'warning';

        await notificationService.sendAlert(alert);
      }
    }

    // 3. Generate recommendations
    const recommendations = await anomalyService.generateRecommendations(tenantId);

    if (recommendations.length > 0) {
      logger.info(`Generated ${recommendations.length} recommendations for tenant ${tenantId}`);

      // Log high-priority recommendations
      const highPriority = recommendations.filter(r => r.priority === 'high');
      if (highPriority.length > 0) {
        logger.warn(`High-priority recommendations for ${tenantId}:`, {
          recommendations: highPriority.map(r => r.title),
        });

        // Send alert for high-priority recommendations
        for (const rec of highPriority) {
          const alert = {
            severity: 'info' as const,
            title: `Cost Optimization: ${rec.title}`,
            message: rec.description,
            timestamp: new Date(),
            metadata: {
              tenantId,
              type: rec.type,
              potentialSavings: rec.potentialSavings,
              effort: rec.effort,
            },
          };

          await notificationService.sendAlert(alert);
        }
      }
    }

    logger.info(`Cost analysis completed for tenant ${tenantId}`);
  } catch (error) {
    logger.error(`Error analyzing tenant ${tenantId}`, { error });
  }
}

/**
 * Main execution
 */
async function main() {
  logger.info('Starting cost analysis job');

  try {
    // Initialize services
    const supabase = getSupabaseClient();
    const anomalyService = new CostAnomalyDetectionService(supabase);
    const notificationService = initNotificationServiceFromEnv();

    // Get active tenants
    const tenants = await getActiveTenants(supabase);

    if (tenants.length === 0) {
      logger.warn('No active tenants found');
      return;
    }

    // Analyze each tenant
    logger.info(`Analyzing ${tenants.length} tenants`);

    for (const tenantId of tenants) {
      await analyzeTenant(tenantId, anomalyService, notificationService);
    }

    logger.info('Cost analysis job completed successfully');
  } catch (error) {
    logger.error('Cost analysis job failed', { error });
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
