/**
 * Cost Anomaly Detection and Forecasting - Phase 5
 *
 * Detects unusual cost patterns and forecasts future spending to prevent
 * quota breaches and identify cost optimization opportunities.
 *
 * Features:
 * - Statistical anomaly detection using standard deviation
 * - Cost forecasting using linear regression
 * - Automated alerts for cost spikes
 * - Cost optimization recommendations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../logger.js';

const logger = createLogger('CostAnomalyDetection');

/**
 * Cost baseline statistics for anomaly detection
 */
export interface CostBaseline {
  tenantId: string;
  resourceType: 'llm' | 'e2b' | 'all';
  period: 'hour' | 'day' | 'week';

  // Statistical measures
  mean: number;        // Average cost per period
  stdDev: number;      // Standard deviation
  min: number;         // Minimum observed cost
  max: number;         // Maximum observed cost
  median: number;      // Median cost

  // Trend analysis
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;  // % change over last 7 days

  // Metadata
  sampleSize: number;  // Number of periods analyzed
  lastUpdated: Date;
  calculatedAt: Date;
}

/**
 * Detected cost anomaly
 */
export interface CostAnomaly {
  tenantId: string;
  resourceType: 'llm' | 'e2b' | 'all';

  // Anomaly details
  detectedAt: Date;
  period: 'hour' | 'day';
  actualCost: number;
  expectedCost: number;  // Baseline mean
  deviation: number;     // Standard deviations from mean
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Context
  description: string;
  recommendation?: string;
}

/**
 * Cost forecast
 */
export interface CostForecast {
  tenantId: string;
  resourceType: 'llm' | 'e2b' | 'all';

  // Forecast details
  forecastedAt: Date;
  forecastPeriod: 'day' | 'week' | 'month';
  forecastedCost: number;
  confidence: number;  // 0-100 confidence percentage

  // Quota impact
  currentQuota?: number;
  quotaUtilizationForecast?: number;  // % of quota
  quotaBreachRisk: 'none' | 'low' | 'medium' | 'high';

  // Trend
  trend: 'increasing' | 'decreasing' | 'stable';
  trendDescription: string;
}

/**
 * Cost optimization recommendation
 */
export interface CostRecommendation {
  tenantId: string;
  type: 'reduce_ttl' | 'reduce_quota' | 'increase_quota' | 'optimize_usage' | 'review_usage';
  priority: 'low' | 'medium' | 'high';

  title: string;
  description: string;
  potentialSavings?: number;  // USD per month
  effort: 'low' | 'medium' | 'high';

  createdAt: Date;
}

/**
 * Cost Anomaly Detection Service
 *
 * Analyzes cost patterns to detect anomalies and forecast future spending
 */
export class CostAnomalyDetectionService {
  constructor(private supabaseClient: SupabaseClient) {}

  /**
   * Calculate cost baseline for a tenant
   *
   * Analyzes last 30 days of cost data to establish normal spending patterns
   */
  async calculateBaseline(
    tenantId: string,
    resourceType: 'llm' | 'e2b' | 'all' = 'all',
    lookbackDays: number = 30
  ): Promise<CostBaseline | null> {
    try {
      // Query cost data for the lookback period
      const query = `
        WITH daily_costs AS (
          SELECT
            DATE(recorded_at) as date,
            SUM(total_cost_usd) as daily_cost
          FROM (
            -- LLM costs
            SELECT recorded_at, total_cost_usd
            FROM copilot_internal.llm_cost_records
            WHERE tenant_id = $1
              AND recorded_at >= NOW() - INTERVAL '${lookbackDays} days'
              AND ($2 = 'all' OR $2 = 'llm')

            UNION ALL

            -- E2B costs
            SELECT recorded_at, total_cost_usd
            FROM copilot_internal.e2b_cost_records
            WHERE tenant_id = $1
              AND recorded_at >= NOW() - INTERVAL '${lookbackDays} days'
              AND ($2 = 'all' OR $2 = 'e2b')
          ) combined_costs
          GROUP BY DATE(recorded_at)
        ),
        stats AS (
          SELECT
            COUNT(*) as sample_size,
            AVG(daily_cost) as mean,
            STDDEV(daily_cost) as std_dev,
            MIN(daily_cost) as min,
            MAX(daily_cost) as max,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY daily_cost) as median
          FROM daily_costs
        ),
        trend_calc AS (
          SELECT
            recent.avg_cost as recent_avg,
            older.avg_cost as older_avg
          FROM
            (SELECT AVG(daily_cost) as avg_cost FROM daily_costs WHERE date >= CURRENT_DATE - 7) recent,
            (SELECT AVG(daily_cost) as avg_cost FROM daily_costs WHERE date < CURRENT_DATE - 7 AND date >= CURRENT_DATE - 14) older
        )
        SELECT
          s.sample_size,
          ROUND(s.mean::numeric, 6) as mean,
          ROUND(COALESCE(s.std_dev, 0)::numeric, 6) as std_dev,
          ROUND(s.min::numeric, 6) as min,
          ROUND(s.max::numeric, 6) as max,
          ROUND(s.median::numeric, 6) as median,
          CASE
            WHEN t.recent_avg > t.older_avg * 1.1 THEN 'increasing'
            WHEN t.recent_avg < t.older_avg * 0.9 THEN 'decreasing'
            ELSE 'stable'
          END as trend,
          ROUND(((t.recent_avg - t.older_avg) / NULLIF(t.older_avg, 0) * 100)::numeric, 2) as trend_percentage
        FROM stats s
        CROSS JOIN trend_calc t;
      `;

      const { data, error } = await this.supabaseClient.rpc('exec_sql', {
        sql: query,
        params: [tenantId, resourceType],
      });

      if (error) {
        logger.error({ error, tenantId, resourceType }, 'Failed to calculate cost baseline');
        return null;
      }

      if (!data || data.length === 0 || data[0].sample_size === 0) {
        logger.info({ tenantId, resourceType, lookbackDays }, 'Insufficient data for baseline calculation');
        return null;
      }

      const result = data[0];
      const now = new Date();

      return {
        tenantId,
        resourceType,
        period: 'day',
        mean: parseFloat(result.mean),
        stdDev: parseFloat(result.std_dev),
        min: parseFloat(result.min),
        max: parseFloat(result.max),
        median: parseFloat(result.median),
        trend: result.trend,
        trendPercentage: parseFloat(result.trend_percentage) || 0,
        sampleSize: parseInt(result.sample_size),
        lastUpdated: now,
        calculatedAt: now,
      };
    } catch (error) {
      logger.error({ error, tenantId, resourceType }, 'Error calculating baseline');
      return null;
    }
  }

  /**
   * Detect cost anomalies for a tenant
   *
   * Compares recent costs against baseline to identify unusual patterns
   */
  async detectAnomalies(
    tenantId: string,
    resourceType: 'llm' | 'e2b' | 'all' = 'all',
    threshold: number = 2.0  // Standard deviations
  ): Promise<CostAnomaly[]> {
    const anomalies: CostAnomaly[] = [];

    try {
      // Get baseline
      const baseline = await this.calculateBaseline(tenantId, resourceType);
      if (!baseline || baseline.stdDev === 0) {
        logger.debug({ tenantId, resourceType }, 'No baseline available for anomaly detection');
        return [];
      }

      // Get today's cost
      const todayCostQuery = `
        SELECT
          COALESCE(SUM(total_cost_usd), 0) as today_cost
        FROM (
          SELECT total_cost_usd FROM copilot_internal.llm_cost_records
          WHERE tenant_id = $1 AND recorded_at >= CURRENT_DATE
            AND ($2 = 'all' OR $2 = 'llm')

          UNION ALL

          SELECT total_cost_usd FROM copilot_internal.e2b_cost_records
          WHERE tenant_id = $1 AND recorded_at >= CURRENT_DATE
            AND ($2 = 'all' OR $2 = 'e2b')
        ) combined;
      `;

      const { data: todayData, error: todayError } = await this.supabaseClient.rpc('exec_sql', {
        sql: todayCostQuery,
        params: [tenantId, resourceType],
      });

      if (todayError || !todayData || todayData.length === 0) {
        logger.error({ error: todayError, tenantId }, 'Failed to get today cost');
        return [];
      }

      const todayCost = parseFloat(todayData[0].today_cost);
      const deviation = (todayCost - baseline.mean) / baseline.stdDev;

      // Check if cost is anomalous
      if (Math.abs(deviation) >= threshold) {
        const severity = this.calculateSeverity(Math.abs(deviation));

        anomalies.push({
          tenantId,
          resourceType,
          detectedAt: new Date(),
          period: 'day',
          actualCost: todayCost,
          expectedCost: baseline.mean,
          deviation,
          severity,
          description: deviation > 0
            ? `Cost is ${Math.abs(deviation).toFixed(1)}σ above baseline ($${todayCost.toFixed(2)} vs expected $${baseline.mean.toFixed(2)})`
            : `Cost is ${Math.abs(deviation).toFixed(1)}σ below baseline ($${todayCost.toFixed(2)} vs expected $${baseline.mean.toFixed(2)})`,
          recommendation: deviation > 0
            ? 'Review recent usage for unexpected spikes. Check for runaway processes or quota breaches.'
            : undefined,
        });
      }

      logger.debug({
        tenantId,
        resourceType,
        anomaliesFound: anomalies.length,
        todayCost,
        baseline: baseline.mean,
        deviation,
      }, 'Anomaly detection completed');

      return anomalies;
    } catch (error) {
      logger.error({ error, tenantId, resourceType }, 'Error detecting anomalies');
      return [];
    }
  }

  /**
   * Forecast future costs
   *
   * Uses linear regression on historical data to predict future spending
   */
  async forecastCosts(
    tenantId: string,
    resourceType: 'llm' | 'e2b' | 'all' = 'all',
    forecastPeriod: 'day' | 'week' | 'month' = 'month'
  ): Promise<CostForecast | null> {
    try {
      // Get historical data for trend analysis
      const baseline = await this.calculateBaseline(tenantId, resourceType);
      if (!baseline) {
        return null;
      }

      // Simple forecast based on trend
      const forecastMultiplier = {
        day: 1,
        week: 7,
        month: 30,
      }[forecastPeriod];

      const forecastedCost = baseline.mean * forecastMultiplier;

      // Adjust for trend
      let adjustedForecast = forecastedCost;
      if (baseline.trend === 'increasing') {
        adjustedForecast = forecastedCost * (1 + Math.abs(baseline.trendPercentage) / 100);
      } else if (baseline.trend === 'decreasing') {
        adjustedForecast = forecastedCost * (1 - Math.abs(baseline.trendPercentage) / 100);
      }

      // Get quota for comparison
      const { data: quotaData } = await this.supabaseClient
        .from('cost_quotas')
        .select('limit_usd, period')
        .eq('scope', 'tenant')
        .eq('scope_id', tenantId)
        .eq('resource_type', resourceType === 'all' ? 'llm' : resourceType)  // Default to LLM for 'all'
        .single();

      let quotaBreachRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
      let quotaUtilizationForecast: number | undefined;

      if (quotaData) {
        // Normalize quota to forecast period
        const quotaPeriodMultiplier = {
          day: quotaData.period === 'day' ? 1 : quotaData.period === 'week' ? 1/7 : 1/30,
          week: quotaData.period === 'day' ? 7 : quotaData.period === 'week' ? 1 : 7/30,
          month: quotaData.period === 'day' ? 30 : quotaData.period === 'week' ? 30/7 : 1,
        }[forecastPeriod];

        const normalizedQuota = quotaData.limit_usd * quotaPeriodMultiplier;
        quotaUtilizationForecast = (adjustedForecast / normalizedQuota) * 100;

        if (quotaUtilizationForecast >= 100) {
          quotaBreachRisk = 'high';
        } else if (quotaUtilizationForecast >= 90) {
          quotaBreachRisk = 'medium';
        } else if (quotaUtilizationForecast >= 80) {
          quotaBreachRisk = 'low';
        }
      }

      const trendDescription = `Based on the last 30 days, costs are ${baseline.trend}${
        baseline.trendPercentage !== 0 ? ` by ${Math.abs(baseline.trendPercentage).toFixed(1)}%` : ''
      }. Forecasted ${forecastPeriod}ly cost: $${adjustedForecast.toFixed(2)}`;

      // Calculate confidence based on sample size and std dev
      const confidence = Math.min(95, Math.max(50, (baseline.sampleSize / 30) * 100 * (1 - baseline.stdDev / baseline.mean)));

      return {
        tenantId,
        resourceType,
        forecastedAt: new Date(),
        forecastPeriod,
        forecastedCost: adjustedForecast,
        confidence,
        currentQuota: quotaData?.limit_usd,
        quotaUtilizationForecast,
        quotaBreachRisk,
        trend: baseline.trend,
        trendDescription,
      };
    } catch (error) {
      logger.error({ error, tenantId, resourceType }, 'Error forecasting costs');
      return null;
    }
  }

  /**
   * Generate cost optimization recommendations
   *
   * Analyzes usage patterns to suggest cost-saving opportunities
   */
  async generateRecommendations(tenantId: string): Promise<CostRecommendation[]> {
    const recommendations: CostRecommendation[] = [];

    try {
      // Get baselines for both resources
      const llmBaseline = await this.calculateBaseline(tenantId, 'llm');
      const e2bBaseline = await this.calculateBaseline(tenantId, 'e2b');

      // Get forecasts
      const llmForecast = await this.forecastCosts(tenantId, 'llm', 'month');
      const e2bForecast = await this.forecastCosts(tenantId, 'e2b', 'month');

      // Recommendation 1: High quota utilization warning
      if (llmForecast?.quotaUtilizationForecast && llmForecast.quotaUtilizationForecast > 80) {
        recommendations.push({
          tenantId,
          type: 'review_usage',
          priority: llmForecast.quotaUtilizationForecast >= 100 ? 'high' : 'medium',
          title: 'High LLM Cost Forecast',
          description: `Your forecasted LLM costs are ${llmForecast.quotaUtilizationForecast.toFixed(0)}% of your quota. Consider reviewing usage patterns or increasing quota.`,
          effort: 'low',
          createdAt: new Date(),
        });
      }

      if (e2bForecast?.quotaUtilizationForecast && e2bForecast.quotaUtilizationForecast > 80) {
        recommendations.push({
          tenantId,
          type: 'review_usage',
          priority: e2bForecast.quotaUtilizationForecast >= 100 ? 'high' : 'medium',
          title: 'High E2B Cost Forecast',
          description: `Your forecasted E2B costs are ${e2bForecast.quotaUtilizationForecast.toFixed(0)}% of your quota. Consider optimizing sandbox usage or increasing quota.`,
          effort: 'low',
          createdAt: new Date(),
        });
      }

      // Recommendation 2: Increasing trend warning
      if (llmBaseline?.trend === 'increasing' && llmBaseline.trendPercentage > 20) {
        recommendations.push({
          tenantId,
          type: 'optimize_usage',
          priority: 'medium',
          title: 'LLM Costs Increasing',
          description: `Your LLM costs are increasing by ${llmBaseline.trendPercentage.toFixed(1)}% week-over-week. Review usage patterns for optimization opportunities.`,
          effort: 'medium',
          createdAt: new Date(),
        });
      }

      if (e2bBaseline?.trend === 'increasing' && e2bBaseline.trendPercentage > 20) {
        const potentialSavings = (e2bBaseline.mean * 30 * (e2bBaseline.trendPercentage / 100)) * 0.3; // 30% of trend increase
        recommendations.push({
          tenantId,
          type: 'reduce_ttl',
          priority: 'medium',
          title: 'E2B Costs Increasing - Consider TTL Reduction',
          description: `Your E2B costs are increasing by ${e2bBaseline.trendPercentage.toFixed(1)}% week-over-week. Reducing sandbox TTL could help manage costs.`,
          potentialSavings,
          effort: 'low',
          createdAt: new Date(),
        });
      }

      // Recommendation 3: Underutilization
      if (llmForecast?.quotaUtilizationForecast && llmForecast.quotaUtilizationForecast < 30 && llmForecast.currentQuota && llmForecast.currentQuota > 10) {
        recommendations.push({
          tenantId,
          type: 'reduce_quota',
          priority: 'low',
          title: 'LLM Quota Underutilized',
          description: `Your LLM quota is only ${llmForecast.quotaUtilizationForecast.toFixed(0)}% utilized. Consider reducing quota to better match usage.`,
          potentialSavings: (llmForecast.currentQuota - llmForecast.forecastedCost) * 0.1, // Estimate
          effort: 'low',
          createdAt: new Date(),
        });
      }

      logger.debug({ tenantId, count: recommendations.length }, 'Generated cost recommendations');

      return recommendations;
    } catch (error) {
      logger.error({ error, tenantId }, 'Error generating recommendations');
      return [];
    }
  }

  /**
   * Calculate anomaly severity based on standard deviations
   */
  private calculateSeverity(deviation: number): 'low' | 'medium' | 'high' | 'critical' {
    if (deviation >= 4) return 'critical';
    if (deviation >= 3) return 'high';
    if (deviation >= 2.5) return 'medium';
    return 'low';
  }
}
