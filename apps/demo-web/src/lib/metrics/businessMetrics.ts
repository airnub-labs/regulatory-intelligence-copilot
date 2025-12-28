/**
 * Business Metrics Collector
 *
 * Tracks business intelligence and feature usage metrics:
 * - API endpoint usage and performance
 * - Feature adoption and engagement
 * - User activity patterns and trends
 *
 * See: docs/METRICS_SPECIFICATION.md for complete documentation
 */

import { createLogger } from '@reg-copilot/reg-intel-observability'
import type {
  BusinessMetrics,
  BusinessMetricsCollector,
  ApiMetrics,
  FeatureMetrics,
  UsageMetrics,
} from './types'

const logger = createLogger('BusinessMetrics')

interface ApiCallRecord {
  calls: number
  totalResponseTime: number
  errors: number
}

interface UserActivity {
  userId: string
  lastSeen: number
  actions: string[]
}

class BusinessMetricsCollectorImpl implements BusinessMetricsCollector {
  private apiCalls: Record<string, ApiCallRecord> = {}
  private totalApiCalls: number = 0
  private apiCallsByHour: Record<string, number> = {}

  private featureUsage: Record<string, number> = {
    conversationsCreated: 0,
    graphNodesCreated: 0,
    messagesSent: 0,
  }
  private featureUsageByType: Record<string, number> = {}

  private userActivity: Map<string, UserActivity> = new Map()
  private peakHours: Record<string, number> = {}

  /**
   * Record an API call with response time
   */
  recordApiCall(endpoint: string, responseTime: number, success: boolean): void {
    this.totalApiCalls++

    // Track by endpoint
    if (!this.apiCalls[endpoint]) {
      this.apiCalls[endpoint] = {
        calls: 0,
        totalResponseTime: 0,
        errors: 0,
      }
    }

    const record = this.apiCalls[endpoint]
    record.calls++
    record.totalResponseTime += responseTime
    if (!success) {
      record.errors++
    }

    // Track by hour
    const hourKey = new Date().toISOString().slice(0, 13)
    this.apiCallsByHour[hourKey] = (this.apiCallsByHour[hourKey] || 0) + 1

    logger.debug({
      endpoint,
      responseTime,
      success,
      totalCalls: this.totalApiCalls,
    }, 'API call recorded')
  }

  /**
   * Record feature usage
   */
  recordFeatureUsage(feature: string): void {
    // Update specific feature counters
    if (feature === 'conversation_created') {
      this.featureUsage.conversationsCreated++
    } else if (feature === 'graph_node_created') {
      this.featureUsage.graphNodesCreated++
    } else if (feature === 'message_sent') {
      this.featureUsage.messagesSent++
    }

    // Track general feature usage
    this.featureUsageByType[feature] = (this.featureUsageByType[feature] || 0) + 1

    logger.debug({ feature }, 'Feature usage recorded')
  }

  /**
   * Record user activity
   */
  recordUserActivity(userId: string, action: string): void {
    const now = Date.now()
    const activity = this.userActivity.get(userId) || {
      userId,
      lastSeen: now,
      actions: [],
    }

    activity.lastSeen = now
    activity.actions.push(action)

    // Keep only last 100 actions per user
    if (activity.actions.length > 100) {
      activity.actions.shift()
    }

    this.userActivity.set(userId, activity)

    // Track peak hours
    const hourKey = new Date().toISOString().slice(0, 13)
    this.peakHours[hourKey] = (this.peakHours[hourKey] || 0) + 1

    logger.debug({ userId, action }, 'User activity recorded')
  }

  /**
   * Generic record method for MetricCollector interface
   */
  record(event: unknown): void {
    logger.debug({ event }, 'Generic business metric event recorded')
  }

  /**
   * Get API metrics
   */
  private getApiMetrics(): ApiMetrics {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 13)
    const currentHour = new Date().toISOString().slice(0, 13)
    const lastHour = Object.entries(this.apiCallsByHour)
      .filter(([hour]) => hour >= oneHourAgo && hour <= currentHour)
      .reduce((sum, [, count]) => sum + count, 0)

    // Calculate average response time across all endpoints
    let totalResponseTime = 0
    let totalCalls = 0

    const byEndpoint: Record<string, { calls: number; averageResponseTime: number; errorRate: number }> = {}

    for (const [endpoint, record] of Object.entries(this.apiCalls)) {
      const avgResponseTime = record.calls > 0 ? record.totalResponseTime / record.calls : 0
      const errorRate = record.calls > 0 ? (record.errors / record.calls) * 100 : 0

      byEndpoint[endpoint] = {
        calls: record.calls,
        averageResponseTime: avgResponseTime,
        errorRate,
      }

      totalResponseTime += record.totalResponseTime
      totalCalls += record.calls
    }

    const averageResponseTime = totalCalls > 0 ? totalResponseTime / totalCalls : 0

    return {
      totalCalls: this.totalApiCalls,
      lastHour,
      byEndpoint,
      averageResponseTime,
    }
  }

  /**
   * Get feature metrics
   */
  private getFeatureMetrics(): FeatureMetrics {
    const activeFeatures = Object.keys(this.featureUsageByType).filter(
      (feature) => this.featureUsageByType[feature] > 0
    )

    return {
      conversationsCreated: this.featureUsage.conversationsCreated,
      graphNodesCreated: this.featureUsage.graphNodesCreated,
      messagesSent: this.featureUsage.messagesSent,
      activeFeatures,
      byFeature: { ...this.featureUsageByType },
    }
  }

  /**
   * Get usage metrics
   */
  private getUsageMetrics(): UsageMetrics {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const oneWeek = 7 * oneDay
    const oneMonth = 30 * oneDay

    let dailyActiveUsers = 0
    let weeklyActiveUsers = 0
    let monthlyActiveUsers = 0
    let totalSessionDuration = 0
    let sessionCount = 0

    for (const activity of this.userActivity.values()) {
      const timeSinceLastSeen = now - activity.lastSeen

      if (timeSinceLastSeen <= oneDay) dailyActiveUsers++
      if (timeSinceLastSeen <= oneWeek) weeklyActiveUsers++
      if (timeSinceLastSeen <= oneMonth) monthlyActiveUsers++

      // Estimate session duration based on action timestamps
      if (activity.actions.length > 1) {
        sessionCount++
        // Simple estimation - time between first and last action
        totalSessionDuration += activity.lastSeen - (activity.lastSeen - activity.actions.length * 60000)
      }
    }

    const averageSessionDuration = sessionCount > 0
      ? (totalSessionDuration / sessionCount) / (1000 * 60) // Convert to minutes
      : 0

    return {
      dailyActiveUsers,
      weeklyActiveUsers,
      monthlyActiveUsers,
      averageSessionDuration,
      peakHours: { ...this.peakHours },
    }
  }

  /**
   * Get comprehensive business metrics
   */
  getMetrics(): BusinessMetrics {
    return {
      api: this.getApiMetrics(),
      features: this.getFeatureMetrics(),
      usage: this.getUsageMetrics(),
    }
  }

  /**
   * Reset metrics (for testing or periodic resets)
   */
  reset(): void {
    const previousMetrics = this.getMetrics()
    logger.info(previousMetrics, 'Resetting business metrics')

    this.apiCalls = {}
    this.totalApiCalls = 0
    this.apiCallsByHour = {}

    this.featureUsage = {
      conversationsCreated: 0,
      graphNodesCreated: 0,
      messagesSent: 0,
    }
    this.featureUsageByType = {}

    this.userActivity.clear()
    this.peakHours = {}
  }
}

// Singleton instance
export const businessMetrics = new BusinessMetricsCollectorImpl()

// Log metrics summary every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const metrics = businessMetrics.getMetrics()
    logger.info(metrics, 'Hourly business metrics summary')
  }, 60 * 60 * 1000) // Every hour
}
