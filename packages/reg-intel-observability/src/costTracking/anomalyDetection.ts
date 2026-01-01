/**
 * Cost Anomaly Detection Service
 *
 * Detects unusual spending patterns and triggers alerts:
 * - Spending spikes (sudden increase above baseline)
 * - Rate anomalies (unusually high request rates)
 * - Pattern changes (shifts in model/touchpoint usage)
 *
 * Uses statistical methods:
 * - Moving average for baseline calculation
 * - Standard deviation for spike detection
 * - Z-score for anomaly scoring
 *
 * @module anomalyDetection
 */

import type { CostStorageProvider, LlmCostRecord } from './types.js';
import type { CostAlert, NotificationService } from './notifications.js';
import { createCostAlert } from './notifications.js';

/**
 * Anomaly detection configuration
 */
export interface AnomalyDetectionConfig {
  /** Number of data points for moving average (default: 24 for hourly data = 1 day) */
  windowSize: number;
  /** Z-score threshold for spike detection (default: 2.5) */
  spikeThreshold: number;
  /** Z-score threshold for rate anomaly (default: 3.0) */
  rateThreshold: number;
  /** Minimum data points before detection starts (default: 12) */
  minDataPoints: number;
  /** Detection interval in milliseconds (default: 5 minutes) */
  checkIntervalMs: number;
  /** Scopes to monitor (default: ['platform', 'tenant']) */
  monitoredScopes: ('platform' | 'tenant' | 'user')[];
  /** Enable pattern change detection (default: true) */
  detectPatternChanges: boolean;
}

/**
 * Time bucket for aggregating costs
 */
interface TimeBucket {
  timestamp: Date;
  totalCostUsd: number;
  requestCount: number;
  byModel: Map<string, number>;
  byTouchpoint: Map<string, number>;
}

/**
 * Anomaly detection result
 */
export interface AnomalyResult {
  detected: boolean;
  type: 'spike' | 'rate' | 'pattern' | 'none';
  severity: 'info' | 'warning' | 'critical';
  zScore: number;
  currentValue: number;
  expectedValue: number;
  stdDev: number;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Historical data store for a specific scope
 */
interface ScopeHistory {
  scope: string;
  scopeId?: string;
  buckets: TimeBucket[];
  lastChecked: Date;
}

/**
 * Anomaly Detection Service
 *
 * Monitors cost data for unusual patterns and triggers alerts.
 */
export class AnomalyDetectionService {
  private config: AnomalyDetectionConfig;
  private storage: CostStorageProvider;
  private notificationService?: NotificationService;
  private historyCache: Map<string, ScopeHistory> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    storage: CostStorageProvider,
    config?: Partial<AnomalyDetectionConfig>,
    notificationService?: NotificationService
  ) {
    this.storage = storage;
    this.notificationService = notificationService;
    this.config = {
      windowSize: config?.windowSize ?? 24,
      spikeThreshold: config?.spikeThreshold ?? 2.5,
      rateThreshold: config?.rateThreshold ?? 3.0,
      minDataPoints: config?.minDataPoints ?? 12,
      checkIntervalMs: config?.checkIntervalMs ?? 5 * 60 * 1000, // 5 minutes
      monitoredScopes: config?.monitoredScopes ?? ['platform', 'tenant'],
      detectPatternChanges: config?.detectPatternChanges ?? true,
    };
  }

  /**
   * Start automatic anomaly detection
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }

    // Run initial check
    this.runDetection().catch(err => {
      console.error('[AnomalyDetection] Initial check failed:', err);
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runDetection().catch(err => {
        console.error('[AnomalyDetection] Periodic check failed:', err);
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop automatic anomaly detection
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Run anomaly detection for all monitored scopes
   */
  async runDetection(): Promise<AnomalyResult[]> {
    const results: AnomalyResult[] = [];

    // Check platform-wide costs
    if (this.config.monitoredScopes.includes('platform')) {
      const result = await this.checkScope('platform');
      if (result.detected) {
        results.push(result);
        await this.sendAlert(result, 'platform');
      }
    }

    // Check tenant-specific costs
    if (this.config.monitoredScopes.includes('tenant')) {
      const tenants = await this.getActiveTenants();
      for (const tenantId of tenants) {
        const result = await this.checkScope('tenant', tenantId);
        if (result.detected) {
          results.push(result);
          await this.sendAlert(result, 'tenant', tenantId);
        }
      }
    }

    return results;
  }

  /**
   * Check for anomalies in a specific scope
   */
  async checkScope(scope: string, scopeId?: string): Promise<AnomalyResult> {
    const cacheKey = `${scope}:${scopeId ?? 'global'}`;
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get or initialize history
    let history = this.historyCache.get(cacheKey);
    if (!history) {
      history = {
        scope,
        scopeId,
        buckets: [],
        lastChecked: new Date(0),
      };
      this.historyCache.set(cacheKey, history);
    }

    // Fetch recent cost records
    const records = await this.fetchRecentRecords(scope, scopeId, hourAgo, now);

    // Create time bucket for current hour
    const currentBucket = this.createBucket(records, now);
    history.buckets.push(currentBucket);

    // Trim old buckets
    while (history.buckets.length > this.config.windowSize * 2) {
      history.buckets.shift();
    }

    history.lastChecked = now;

    // Not enough data yet
    if (history.buckets.length < this.config.minDataPoints) {
      return {
        detected: false,
        type: 'none',
        severity: 'info',
        zScore: 0,
        currentValue: currentBucket.totalCostUsd,
        expectedValue: 0,
        stdDev: 0,
        message: `Collecting baseline data (${history.buckets.length}/${this.config.minDataPoints} points)`,
      };
    }

    // Check for spending spike
    const spikeResult = this.detectSpike(history.buckets, currentBucket);
    if (spikeResult.detected) {
      return spikeResult;
    }

    // Check for rate anomaly
    const rateResult = this.detectRateAnomaly(history.buckets, currentBucket);
    if (rateResult.detected) {
      return rateResult;
    }

    // Check for pattern changes
    if (this.config.detectPatternChanges) {
      const patternResult = this.detectPatternChange(history.buckets, currentBucket);
      if (patternResult.detected) {
        return patternResult;
      }
    }

    return {
      detected: false,
      type: 'none',
      severity: 'info',
      zScore: 0,
      currentValue: currentBucket.totalCostUsd,
      expectedValue: this.calculateMean(history.buckets.slice(-this.config.windowSize)),
      stdDev: this.calculateStdDev(history.buckets.slice(-this.config.windowSize)),
      message: 'No anomalies detected',
    };
  }

  /**
   * Detect spending spikes using Z-score
   */
  private detectSpike(buckets: TimeBucket[], current: TimeBucket): AnomalyResult {
    const recentBuckets = buckets.slice(-this.config.windowSize);
    const mean = this.calculateMean(recentBuckets);
    const stdDev = this.calculateStdDev(recentBuckets, mean);

    // Avoid division by zero for flat spending
    if (stdDev < 0.01) {
      return {
        detected: false,
        type: 'spike',
        severity: 'info',
        zScore: 0,
        currentValue: current.totalCostUsd,
        expectedValue: mean,
        stdDev,
        message: 'Spending too stable to detect spikes',
      };
    }

    const zScore = (current.totalCostUsd - mean) / stdDev;

    if (zScore >= this.config.spikeThreshold) {
      const percentAbove = ((current.totalCostUsd - mean) / mean) * 100;
      const severity = zScore >= 4 ? 'critical' : zScore >= 3 ? 'warning' : 'info';

      return {
        detected: true,
        type: 'spike',
        severity,
        zScore,
        currentValue: current.totalCostUsd,
        expectedValue: mean,
        stdDev,
        message: `Spending spike detected: $${current.totalCostUsd.toFixed(2)} is ${percentAbove.toFixed(0)}% above average ($${mean.toFixed(2)})`,
        details: {
          percentAbove,
          zScore,
          requestCount: current.requestCount,
        },
      };
    }

    return {
      detected: false,
      type: 'spike',
      severity: 'info',
      zScore,
      currentValue: current.totalCostUsd,
      expectedValue: mean,
      stdDev,
      message: 'No spending spike detected',
    };
  }

  /**
   * Detect request rate anomalies
   */
  private detectRateAnomaly(buckets: TimeBucket[], current: TimeBucket): AnomalyResult {
    const recentBuckets = buckets.slice(-this.config.windowSize);
    const rates = recentBuckets.map(b => b.requestCount);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const stdDev = Math.sqrt(
      rates.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rates.length
    );

    if (stdDev < 1) {
      return {
        detected: false,
        type: 'rate',
        severity: 'info',
        zScore: 0,
        currentValue: current.requestCount,
        expectedValue: mean,
        stdDev,
        message: 'Request rate too stable to detect anomalies',
      };
    }

    const zScore = (current.requestCount - mean) / stdDev;

    if (zScore >= this.config.rateThreshold) {
      const percentAbove = ((current.requestCount - mean) / mean) * 100;
      const severity = zScore >= 4 ? 'critical' : 'warning';

      return {
        detected: true,
        type: 'rate',
        severity,
        zScore,
        currentValue: current.requestCount,
        expectedValue: mean,
        stdDev,
        message: `Request rate anomaly: ${current.requestCount} requests is ${percentAbove.toFixed(0)}% above average (${mean.toFixed(0)} requests)`,
        details: {
          percentAbove,
          totalCost: current.totalCostUsd,
        },
      };
    }

    return {
      detected: false,
      type: 'rate',
      severity: 'info',
      zScore,
      currentValue: current.requestCount,
      expectedValue: mean,
      stdDev,
      message: 'No rate anomaly detected',
    };
  }

  /**
   * Detect pattern changes (shift in model/touchpoint distribution)
   */
  private detectPatternChange(buckets: TimeBucket[], current: TimeBucket): AnomalyResult {
    const recentBuckets = buckets.slice(-this.config.windowSize);

    // Calculate average model distribution
    const modelTotals = new Map<string, number>();
    let totalCost = 0;

    for (const bucket of recentBuckets) {
      for (const [model, cost] of bucket.byModel) {
        modelTotals.set(model, (modelTotals.get(model) ?? 0) + cost);
        totalCost += cost;
      }
    }

    if (totalCost < 0.01 || current.totalCostUsd < 0.01) {
      return {
        detected: false,
        type: 'pattern',
        severity: 'info',
        zScore: 0,
        currentValue: 0,
        expectedValue: 0,
        stdDev: 0,
        message: 'Insufficient data for pattern analysis',
      };
    }

    // Calculate expected vs actual distribution
    const avgDistribution = new Map<string, number>();
    for (const [model, cost] of modelTotals) {
      avgDistribution.set(model, cost / totalCost);
    }

    // Compare current distribution
    let maxDeviation = 0;
    let deviatingModel = '';
    let actualShare = 0;
    let expectedShare = 0;

    for (const [model, cost] of current.byModel) {
      const currentShare = cost / current.totalCostUsd;
      const expectedShareVal = avgDistribution.get(model) ?? 0;
      const deviation = Math.abs(currentShare - expectedShareVal);

      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        deviatingModel = model;
        actualShare = currentShare;
        expectedShare = expectedShareVal;
      }
    }

    // Also check for new models appearing
    for (const model of current.byModel.keys()) {
      if (!avgDistribution.has(model)) {
        const cost = current.byModel.get(model) ?? 0;
        const share = cost / current.totalCostUsd;
        if (share > 0.2) { // New model taking >20% of spend
          return {
            detected: true,
            type: 'pattern',
            severity: 'warning',
            zScore: share * 10,
            currentValue: share,
            expectedValue: 0,
            stdDev: 0,
            message: `New spending pattern: Model "${model}" appeared with ${(share * 100).toFixed(0)}% of current spend`,
            details: {
              model,
              costUsd: cost,
              sharePercent: share * 100,
            },
          };
        }
      }
    }

    // Significant shift in existing model
    if (maxDeviation > 0.25) { // 25% shift in distribution
      return {
        detected: true,
        type: 'pattern',
        severity: 'info',
        zScore: maxDeviation * 4,
        currentValue: actualShare,
        expectedValue: expectedShare,
        stdDev: maxDeviation,
        message: `Usage pattern shift: Model "${deviatingModel}" changed from ${(expectedShare * 100).toFixed(0)}% to ${(actualShare * 100).toFixed(0)}% of spend`,
        details: {
          model: deviatingModel,
          previousShare: expectedShare,
          currentShare: actualShare,
          shiftPercent: (actualShare - expectedShare) * 100,
        },
      };
    }

    return {
      detected: false,
      type: 'pattern',
      severity: 'info',
      zScore: maxDeviation * 4,
      currentValue: actualShare,
      expectedValue: expectedShare,
      stdDev: maxDeviation,
      message: 'No significant pattern changes detected',
    };
  }

  /**
   * Fetch recent cost records from storage
   */
  private async fetchRecentRecords(
    scope: string,
    scopeId: string | undefined,
    start: Date,
    end: Date
  ): Promise<LlmCostRecord[]> {
    const query: { startTime?: Date; endTime?: Date; tenantId?: string } = {
      startTime: start,
      endTime: end,
    };

    if (scope === 'tenant' && scopeId) {
      query.tenantId = scopeId;
    }

    try {
      return await this.storage.query(query);
    } catch (error) {
      console.error('[AnomalyDetection] Failed to fetch records:', error);
      return [];
    }
  }

  /**
   * Create a time bucket from cost records
   */
  private createBucket(records: LlmCostRecord[], timestamp: Date): TimeBucket {
    const bucket: TimeBucket = {
      timestamp,
      totalCostUsd: 0,
      requestCount: records.length,
      byModel: new Map(),
      byTouchpoint: new Map(),
    };

    for (const record of records) {
      bucket.totalCostUsd += record.totalCostUsd;

      const modelCost = bucket.byModel.get(record.model) ?? 0;
      bucket.byModel.set(record.model, modelCost + record.totalCostUsd);

      if (record.taskId) {
        const touchpointCost = bucket.byTouchpoint.get(record.taskId) ?? 0;
        bucket.byTouchpoint.set(record.taskId, touchpointCost + record.totalCostUsd);
      }
    }

    return bucket;
  }

  /**
   * Get list of active tenants to monitor
   */
  private async getActiveTenants(): Promise<string[]> {
    try {
      // Query recent records to find active tenants
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const records = await this.storage.query({ startTime: oneHourAgo });

      const tenants = new Set<string>();
      for (const record of records) {
        if (record.tenantId) {
          tenants.add(record.tenantId);
        }
      }

      return Array.from(tenants);
    } catch (error) {
      console.error('[AnomalyDetection] Failed to get active tenants:', error);
      return [];
    }
  }

  /**
   * Calculate mean of bucket costs
   */
  private calculateMean(buckets: TimeBucket[]): number {
    if (buckets.length === 0) return 0;
    const sum = buckets.reduce((acc, b) => acc + b.totalCostUsd, 0);
    return sum / buckets.length;
  }

  /**
   * Calculate standard deviation of bucket costs
   */
  private calculateStdDev(buckets: TimeBucket[], mean?: number): number {
    if (buckets.length === 0) return 0;
    const avg = mean ?? this.calculateMean(buckets);
    const squaredDiffs = buckets.map(b => Math.pow(b.totalCostUsd - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / buckets.length;
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Send alert via notification service
   */
  private async sendAlert(
    result: AnomalyResult,
    scope: string,
    scopeId?: string
  ): Promise<void> {
    if (!this.notificationService) {
      console.log('[AnomalyDetection] Alert (no notification service configured):', result);
      return;
    }

    const alertType = result.type === 'spike' ? 'spend_spike' : 'anomaly';
    const quota = {
      scope: scope as 'platform' | 'tenant' | 'user',
      scopeId,
      period: 'hourly' as const,
      limitUsd: result.expectedValue * 2, // Use double the expected as a pseudo-limit
      currentSpendUsd: result.currentValue,
      warningThreshold: 0.8,
    };

    const alert: CostAlert = createCostAlert(alertType, quota, result.severity, result.details);
    alert.message = result.message;

    try {
      const results = await this.notificationService.sendAlert(alert);
      const successful = results.filter(r => r.success).length;
      console.log(`[AnomalyDetection] Sent ${successful}/${results.length} notifications for ${result.type}`);
    } catch (error) {
      console.error('[AnomalyDetection] Failed to send notification:', error);
    }
  }

  /**
   * Manually analyze recent spending for anomalies
   *
   * Useful for ad-hoc analysis without starting the service.
   */
  async analyzeRecent(
    hoursBack: number = 24,
    scope: string = 'platform',
    scopeId?: string
  ): Promise<{
    buckets: Array<{
      timestamp: Date;
      costUsd: number;
      requestCount: number;
    }>;
    stats: {
      mean: number;
      stdDev: number;
      min: number;
      max: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    };
    anomalies: AnomalyResult[];
  }> {
    const now = new Date();
    const start = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    // Fetch all records in the time range
    const records = await this.fetchRecentRecords(scope, scopeId, start, now);

    // Group by hour
    const hourlyBuckets: Map<string, LlmCostRecord[]> = new Map();
    for (const record of records) {
      const hour = new Date(record.createdAt);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();

      const bucket = hourlyBuckets.get(key) ?? [];
      bucket.push(record);
      hourlyBuckets.set(key, bucket);
    }

    // Convert to time buckets
    const sortedHours = Array.from(hourlyBuckets.keys()).sort();
    const timeBuckets: TimeBucket[] = sortedHours.map(hourKey => {
      const hourRecords = hourlyBuckets.get(hourKey) ?? [];
      return this.createBucket(hourRecords, new Date(hourKey));
    });

    // Calculate stats
    const costs = timeBuckets.map(b => b.totalCostUsd);
    const mean = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
    const stdDev = this.calculateStdDev(timeBuckets);
    const min = costs.length > 0 ? Math.min(...costs) : 0;
    const max = costs.length > 0 ? Math.max(...costs) : 0;

    // Determine trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (timeBuckets.length >= 4) {
      const firstHalf = timeBuckets.slice(0, Math.floor(timeBuckets.length / 2));
      const secondHalf = timeBuckets.slice(Math.floor(timeBuckets.length / 2));
      const firstMean = this.calculateMean(firstHalf);
      const secondMean = this.calculateMean(secondHalf);

      if (secondMean > firstMean * 1.2) {
        trend = 'increasing';
      } else if (secondMean < firstMean * 0.8) {
        trend = 'decreasing';
      }
    }

    // Detect anomalies in each bucket
    const anomalies: AnomalyResult[] = [];
    for (let i = this.config.minDataPoints; i < timeBuckets.length; i++) {
      const windowBuckets = timeBuckets.slice(0, i);
      const current = timeBuckets[i];

      const spikeResult = this.detectSpike(windowBuckets, current);
      if (spikeResult.detected) {
        anomalies.push({
          ...spikeResult,
          details: {
            ...spikeResult.details,
            timestamp: current.timestamp.toISOString(),
          },
        });
      }
    }

    return {
      buckets: timeBuckets.map(b => ({
        timestamp: b.timestamp,
        costUsd: b.totalCostUsd,
        requestCount: b.requestCount,
      })),
      stats: { mean, stdDev, min, max, trend },
      anomalies,
    };
  }
}

/**
 * Create an anomaly detection service
 */
export function createAnomalyDetectionService(
  storage: CostStorageProvider,
  config?: Partial<AnomalyDetectionConfig>,
  notificationService?: NotificationService
): AnomalyDetectionService {
  return new AnomalyDetectionService(storage, config, notificationService);
}

/**
 * Singleton instance
 */
let anomalyDetectionService: AnomalyDetectionService | null = null;

/**
 * Initialize the global anomaly detection service
 */
export function initAnomalyDetection(
  storage: CostStorageProvider,
  config?: Partial<AnomalyDetectionConfig>,
  notificationService?: NotificationService
): AnomalyDetectionService {
  anomalyDetectionService = createAnomalyDetectionService(storage, config, notificationService);
  return anomalyDetectionService;
}

/**
 * Get the global anomaly detection service
 */
export function getAnomalyDetectionService(): AnomalyDetectionService {
  if (!anomalyDetectionService) {
    throw new Error(
      'Anomaly detection service not initialized. Call initAnomalyDetection() first.'
    );
  }
  return anomalyDetectionService;
}

/**
 * Get the global anomaly detection service if initialized
 */
export function getAnomalyDetectionServiceIfInitialized(): AnomalyDetectionService | null {
  return anomalyDetectionService;
}
