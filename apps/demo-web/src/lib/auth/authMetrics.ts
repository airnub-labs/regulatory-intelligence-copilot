/**
 * Authentication Metrics Collector
 *
 * Tracks authentication events for monitoring, cost optimization, and performance analysis.
 * Provides insights into login patterns, validation frequency, cache effectiveness, and database usage.
 *
 * See: ../metrics/types.ts for type definitions
 * See: docs/METRICS_SPECIFICATION.md for complete documentation
 */

import { createLogger } from '@reg-copilot/reg-intel-observability'
import type {
  AuthenticationMetrics,
  AuthenticationMetricsCollector,
  SecurityMetrics,
} from '../metrics/types'

const logger = createLogger('AuthMetrics')

interface SecurityEvent {
  timestamp: number
  eventType: string
  userId?: string
  details: string
}

interface AuthMetrics {
  // Login tracking
  totalLogins: number
  loginsByHour: Record<string, number>
  lastLoginTimestamp: number | null

  // Session validation
  totalValidations: number
  validationCacheHits: number
  validationCacheMisses: number
  validationDatabaseQueries: number
  validationFailures: number

  // Performance
  averageValidationTimeMs: number
  validationTimeSamples: number[]

  // User activity
  activeUsers: Set<string>
  deletedUsersDetected: number
  bannedUsersDetected: number

  // Security events
  securityEvents: SecurityEvent[]
  unauthorizedAttempts: number
  invalidTokens: number

  // Cost tracking
  estimatedDatabaseCost: number // Based on query count

  // Timestamps
  metricsStartTime: number
  lastResetTime: number
}

class AuthMetricsCollectorImpl implements AuthenticationMetricsCollector {
  private metrics: AuthMetrics = {
    totalLogins: 0,
    loginsByHour: {},
    lastLoginTimestamp: null,

    totalValidations: 0,
    validationCacheHits: 0,
    validationCacheMisses: 0,
    validationDatabaseQueries: 0,
    validationFailures: 0,

    averageValidationTimeMs: 0,
    validationTimeSamples: [],

    activeUsers: new Set(),
    deletedUsersDetected: 0,
    bannedUsersDetected: 0,

    securityEvents: [],
    unauthorizedAttempts: 0,
    invalidTokens: 0,

    estimatedDatabaseCost: 0,

    metricsStartTime: Date.now(),
    lastResetTime: Date.now(),
  }

  // Cost per database query (Supabase Pro pricing estimate)
  private readonly COST_PER_1000_QUERIES = 0.01 // $0.01 per 1000 queries

  /**
   * Record a successful login
   */
  recordLogin(userId: string): void {
    this.metrics.totalLogins++
    this.metrics.lastLoginTimestamp = Date.now()
    this.metrics.activeUsers.add(userId)

    // Track logins by hour for pattern analysis
    const hourKey = new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH
    this.metrics.loginsByHour[hourKey] = (this.metrics.loginsByHour[hourKey] || 0) + 1

    logger.debug({ userId, totalLogins: this.metrics.totalLogins }, 'Login recorded')
  }

  /**
   * Record a validation cache hit (no database query)
   */
  recordCacheHit(userId: string): void {
    this.metrics.totalValidations++
    this.metrics.validationCacheHits++
    this.metrics.activeUsers.add(userId)

    logger.debug({
      userId,
      cacheHitRate: this.getCacheHitRate()
    }, 'Validation cache hit')
  }

  /**
   * Record a validation cache miss (database query required)
   */
  recordCacheMiss(userId: string, durationMs: number, wasSuccessful: boolean): void {
    this.metrics.totalValidations++
    this.metrics.validationCacheMisses++
    this.metrics.validationDatabaseQueries++

    if (!wasSuccessful) {
      this.metrics.validationFailures++
    } else {
      this.metrics.activeUsers.add(userId)
    }

    // Update average validation time
    this.metrics.validationTimeSamples.push(durationMs)
    if (this.metrics.validationTimeSamples.length > 100) {
      this.metrics.validationTimeSamples.shift() // Keep last 100 samples
    }
    this.metrics.averageValidationTimeMs =
      this.metrics.validationTimeSamples.reduce((a, b) => a + b, 0) / this.metrics.validationTimeSamples.length

    // Update cost estimate
    this.metrics.estimatedDatabaseCost =
      (this.metrics.validationDatabaseQueries * this.COST_PER_1000_QUERIES) / 1000

    logger.debug({
      userId,
      durationMs,
      wasSuccessful,
      cacheHitRate: this.getCacheHitRate(),
      dbQueries: this.metrics.validationDatabaseQueries
    }, 'Validation cache miss')
  }

  /**
   * Record detection of a deleted user
   */
  recordDeletedUser(userId: string): void {
    this.metrics.deletedUsersDetected++
    this.metrics.activeUsers.delete(userId)

    // Record as security event
    this.recordSecurityEvent('deleted_user_detected', userId, 'User attempted access after deletion')

    logger.info({
      userId,
      totalDeleted: this.metrics.deletedUsersDetected
    }, 'Deleted user detected')
  }

  /**
   * Record detection of a banned user
   */
  recordBannedUser(userId: string): void {
    this.metrics.bannedUsersDetected++
    this.metrics.activeUsers.delete(userId)

    // Record as security event
    this.recordSecurityEvent('banned_user_detected', userId, 'User attempted access while banned')

    logger.info({
      userId,
      totalBanned: this.metrics.bannedUsersDetected
    }, 'Banned user detected')
  }

  /**
   * Record a security event
   */
  recordSecurityEvent(eventType: string, userId?: string, details: string = ''): void {
    const event: SecurityEvent = {
      timestamp: Date.now(),
      eventType,
      userId,
      details,
    }

    this.metrics.securityEvents.push(event)

    // Track specific event types
    if (eventType === 'unauthorized_attempt') {
      this.metrics.unauthorizedAttempts++
    } else if (eventType === 'invalid_token') {
      this.metrics.invalidTokens++
    }

    // Keep only last 100 security events
    if (this.metrics.securityEvents.length > 100) {
      this.metrics.securityEvents.shift()
    }

    logger.warn({
      eventType,
      userId,
      details,
      totalEvents: this.metrics.securityEvents.length
    }, 'Security event recorded')
  }

  /**
   * Generic record method for MetricCollector interface
   */
  record(event: unknown): void {
    logger.debug({ event }, 'Generic auth metric event recorded')
  }

  /**
   * Get current cache hit rate
   */
  getCacheHitRate(): number {
    if (this.metrics.totalValidations === 0) return 0
    return (this.metrics.validationCacheHits / this.metrics.totalValidations) * 100
  }

  /**
   * Get metrics for last N hours
   */
  getLoginsByHourRange(hours: number = 24): Record<string, number> {
    const now = new Date()
    const hourlyData: Record<string, number> = {}

    for (let i = 0; i < hours; i++) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000)
      const hourKey = hour.toISOString().slice(0, 13)
      hourlyData[hourKey] = this.metrics.loginsByHour[hourKey] || 0
    }

    return hourlyData
  }

  /**
   * Get cost savings from caching
   */
  getCostSavings(): {
    actualCost: number
    costWithoutCache: number
    savings: number
    savingsPercentage: number
  } {
    const actualCost = this.metrics.estimatedDatabaseCost
    const costWithoutCache = (this.metrics.totalValidations * this.COST_PER_1000_QUERIES) / 1000
    const savings = costWithoutCache - actualCost
    const savingsPercentage = costWithoutCache > 0 ? (savings / costWithoutCache) * 100 : 0

    return {
      actualCost,
      costWithoutCache,
      savings,
      savingsPercentage,
    }
  }

  /**
   * Get comprehensive metrics summary
   */
  getMetrics(): AuthenticationMetrics {
    const uptime = Date.now() - this.metrics.metricsStartTime
    const uptimeHours = uptime / (1000 * 60 * 60)
    const cacheHitRate = this.getCacheHitRate()
    const costSavings = this.getCostSavings()

    // Get recent security events
    const recentSecurityEvents = this.metrics.securityEvents
      .slice(-10)
      .map((event) => ({
        timestamp: new Date(event.timestamp).toISOString(),
        eventType: event.eventType,
        userId: event.userId,
        details: event.details,
      }))

    const security: SecurityMetrics = {
      totalEvents: this.metrics.securityEvents.length,
      unauthorizedAttempts: this.metrics.unauthorizedAttempts,
      invalidTokens: this.metrics.invalidTokens,
      recentEvents: recentSecurityEvents,
    }

    return {
      // Login metrics
      logins: {
        total: this.metrics.totalLogins,
        last24Hours: this.getLoginsByHourRange(24),
        lastLoginTimestamp: this.metrics.lastLoginTimestamp
          ? new Date(this.metrics.lastLoginTimestamp).toISOString()
          : null,
        averagePerHour: uptimeHours > 0 ? this.metrics.totalLogins / uptimeHours : 0,
      },

      // Validation metrics
      validations: {
        total: this.metrics.totalValidations,
        cacheHits: this.metrics.validationCacheHits,
        cacheMisses: this.metrics.validationCacheMisses,
        cacheHitRate: cacheHitRate,
        databaseQueries: this.metrics.validationDatabaseQueries,
        failures: this.metrics.validationFailures,
        averageTimeMs: Math.round(this.metrics.averageValidationTimeMs),
        averagePerHour: uptimeHours > 0 ? this.metrics.totalValidations / uptimeHours : 0,
      },

      // User activity
      users: {
        activeCount: this.metrics.activeUsers.size,
        deletedDetected: this.metrics.deletedUsersDetected,
        bannedDetected: this.metrics.bannedUsersDetected,
      },

      // Cost analysis
      costs: {
        estimatedDatabaseCost: costSavings.actualCost.toFixed(4),
        costWithoutCache: costSavings.costWithoutCache.toFixed(4),
        savings: costSavings.savings.toFixed(4),
        savingsPercentage: costSavings.savingsPercentage.toFixed(2),
        queriesPerHour: uptimeHours > 0 ? Math.round(this.metrics.validationDatabaseQueries / uptimeHours) : 0,
      },

      // Security events
      security,

      // Performance insights
      performance: {
        cacheEffectiveness: cacheHitRate > 95 ? 'Excellent' : cacheHitRate > 90 ? 'Good' : cacheHitRate > 80 ? 'Fair' : 'Poor',
        recommendedCacheTTL: cacheHitRate < 90 ? 'Consider increasing cache TTL' : 'Current TTL is optimal',
        avgValidationTime: this.metrics.averageValidationTimeMs < 10 ? 'Excellent' : this.metrics.averageValidationTimeMs < 50 ? 'Good' : 'Needs optimization',
      },
    }
  }

  /**
   * Reset metrics (for testing or periodic resets)
   */
  reset(): void {
    const previousMetrics = this.getMetrics()
    logger.info(previousMetrics, 'Resetting auth metrics')

    this.metrics = {
      totalLogins: 0,
      loginsByHour: {},
      lastLoginTimestamp: null,

      totalValidations: 0,
      validationCacheHits: 0,
      validationCacheMisses: 0,
      validationDatabaseQueries: 0,
      validationFailures: 0,

      averageValidationTimeMs: 0,
      validationTimeSamples: [],

      activeUsers: new Set(),
      deletedUsersDetected: 0,
      bannedUsersDetected: 0,

      securityEvents: [],
      unauthorizedAttempts: 0,
      invalidTokens: 0,

      estimatedDatabaseCost: 0,

      metricsStartTime: Date.now(),
      lastResetTime: Date.now(),
    }
  }
}

// Singleton instance
export const authMetrics = new AuthMetricsCollectorImpl()

// Log metrics summary every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const metrics = authMetrics.getMetrics()
    logger.info(metrics, 'Hourly auth metrics summary')
  }, 60 * 60 * 1000) // Every hour
}
