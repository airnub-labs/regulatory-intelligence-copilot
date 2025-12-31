/**
 * System Metrics Collector
 *
 * Tracks system-level infrastructure and performance metrics:
 * - Application uptime and availability
 * - Memory usage and heap statistics
 * - HTTP request patterns
 * - Error tracking and monitoring
 * - Cache performance
 *
 * See: docs/METRICS_SPECIFICATION.md for complete documentation
 */

import { createLogger } from '@reg-copilot/reg-intel-observability'
import type {
  SystemMetrics,
  SystemMetricsCollector,
  UptimeMetrics,
  MemoryMetrics,
  RequestMetrics,
  ErrorMetrics,
  CacheMetrics,
} from './types'

const logger = createLogger('SystemMetrics')

// Constants to prevent unbounded growth and memory leaks
const MAX_HOUR_KEYS = 168 // Keep last 7 days (24 hours × 7 days)
const MAX_ENDPOINT_ENTRIES = 500 // Limit number of unique endpoints tracked
const MAX_ERROR_TYPE_ENTRIES = 100 // Limit number of unique error types tracked

interface RequestCount {
  total: number
  byEndpoint: Record<string, number>
  byHour: Record<string, number>
}

interface ErrorRecord {
  timestamp: number
  message: string
  type: string
}

interface CacheStats {
  hits: number
  misses: number
}

class SystemMetricsCollectorImpl implements SystemMetricsCollector {
  private startTime: number = Date.now()
  private requests: RequestCount = {
    total: 0,
    byEndpoint: {},
    byHour: {},
  }
  private errors: ErrorRecord[] = []
  private errorsByType: Record<string, number> = {}
  private cache: CacheStats = {
    hits: 0,
    misses: 0,
  }

  /**
   * Prune old hour keys to prevent unbounded growth
   */
  private pruneHourKeys(hourMap: Record<string, number>): void {
    const hours = Object.keys(hourMap).sort()
    if (hours.length > MAX_HOUR_KEYS) {
      const toDelete = hours.slice(0, hours.length - MAX_HOUR_KEYS)
      toDelete.forEach(h => delete hourMap[h])
      logger.debug({ prunedCount: toDelete.length }, 'Pruned old hour keys')
    }
  }

  /**
   * Prune least-used endpoints to prevent unbounded growth
   */
  private pruneEndpoints(): void {
    const endpointCount = Object.keys(this.requests.byEndpoint).length
    if (endpointCount > MAX_ENDPOINT_ENTRIES) {
      // Sort by request count and remove least-used endpoints
      const sortedEndpoints = Object.entries(this.requests.byEndpoint)
        .sort((a, b) => a[1] - b[1])

      const toDelete = sortedEndpoints.slice(0, endpointCount - MAX_ENDPOINT_ENTRIES)
      toDelete.forEach(([endpoint]) => delete this.requests.byEndpoint[endpoint])

      logger.debug({ prunedCount: toDelete.length }, 'Pruned least-used endpoints')
    }
  }

  /**
   * Prune least-common error types to prevent unbounded growth
   */
  private pruneErrorTypes(): void {
    const errorTypeCount = Object.keys(this.errorsByType).length
    if (errorTypeCount > MAX_ERROR_TYPE_ENTRIES) {
      // Sort by count and remove least-common error types
      const sortedTypes = Object.entries(this.errorsByType)
        .sort((a, b) => a[1] - b[1])

      const toDelete = sortedTypes.slice(0, errorTypeCount - MAX_ERROR_TYPE_ENTRIES)
      toDelete.forEach(([type]) => delete this.errorsByType[type])

      logger.debug({ prunedCount: toDelete.length }, 'Pruned least-common error types')
    }
  }

  /**
   * Record an HTTP request
   */
  recordRequest(endpoint: string): void {
    this.requests.total++
    this.requests.byEndpoint[endpoint] = (this.requests.byEndpoint[endpoint] || 0) + 1

    // Prune endpoints periodically (every 1000 requests)
    if (this.requests.total % 1000 === 0) {
      this.pruneEndpoints()
    }

    // Track requests by hour for pattern analysis
    const hourKey = new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH
    this.requests.byHour[hourKey] = (this.requests.byHour[hourKey] || 0) + 1

    // Prune old hour keys
    this.pruneHourKeys(this.requests.byHour)

    logger.debug({ endpoint, total: this.requests.total }, 'Request recorded')
  }

  /**
   * Record an error
   */
  recordError(error: Error, type: string = 'UnknownError'): void {
    const errorRecord: ErrorRecord = {
      timestamp: Date.now(),
      message: error.message,
      type,
    }

    this.errors.push(errorRecord)
    this.errorsByType[type] = (this.errorsByType[type] || 0) + 1

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors.shift()
    }

    // Prune error types periodically (every 100 errors)
    if (this.errors.length % 100 === 0) {
      this.pruneErrorTypes()
    }

    logger.warn({ type, message: error.message }, 'Error recorded')
  }

  /**
   * Record a cache operation
   */
  recordCacheOperation(hit: boolean): void {
    if (hit) {
      this.cache.hits++
    } else {
      this.cache.misses++
    }

    logger.debug({
      hit,
      hitRate: this.getCacheHitRate(),
    }, 'Cache operation recorded')
  }

  /**
   * Generic record method for MetricCollector interface
   */
  record(event: unknown): void {
    logger.debug({ event }, 'Generic metric event recorded')
  }

  /**
   * Get current cache hit rate
   */
  private getCacheHitRate(): number {
    const total = this.cache.hits + this.cache.misses
    if (total === 0) return 0
    return (this.cache.hits / total) * 100
  }

  /**
   * Get uptime metrics
   */
  private getUptimeMetrics(): UptimeMetrics {
    const uptime = Date.now() - this.startTime
    return {
      milliseconds: uptime,
      hours: uptime / (1000 * 60 * 60),
      startTime: new Date(this.startTime).toISOString(),
    }
  }

  /**
   * Get memory metrics
   */
  private getMemoryMetrics(): MemoryMetrics {
    const memUsage = process.memoryUsage()
    return {
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      heapUsedPercentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      rss: memUsage.rss,
      external: memUsage.external,
    }
  }

  /**
   * Get request metrics
   */
  private getRequestMetrics(): RequestMetrics {
    const uptime = this.getUptimeMetrics()
    const uptimeHours = uptime.hours

    // Calculate requests in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 13)
    const currentHour = new Date().toISOString().slice(0, 13)
    const lastHour = Object.entries(this.requests.byHour)
      .filter(([hour]) => hour >= oneHourAgo && hour <= currentHour)
      .reduce((sum, [, count]) => sum + count, 0)

    return {
      total: this.requests.total,
      lastHour,
      averagePerHour: uptimeHours > 0 ? this.requests.total / uptimeHours : 0,
      byEndpoint: { ...this.requests.byEndpoint },
    }
  }

  /**
   * Get error metrics
   */
  private getErrorMetrics(): ErrorMetrics {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    const errorsLastHour = this.errors.filter((e) => e.timestamp >= oneHourAgo).length

    // Get last 10 errors
    const recent = this.errors
      .slice(-10)
      .map((e) => ({
        timestamp: new Date(e.timestamp).toISOString(),
        message: e.message,
        type: e.type,
      }))

    return {
      total: this.errors.length,
      lastHour: errorsLastHour,
      byType: { ...this.errorsByType },
      recent,
    }
  }

  /**
   * Get cache metrics
   */
  private getCacheMetrics(): CacheMetrics {
    const total = this.cache.hits + this.cache.misses
    const hitRate = this.getCacheHitRate()

    return {
      total,
      hits: this.cache.hits,
      misses: this.cache.misses,
      hitRate,
      type: 'system', // Can be extended to track different cache types
      size: 0, // To be implemented based on actual cache
    }
  }

  /**
   * Get comprehensive system metrics
   */
  getMetrics(): SystemMetrics {
    return {
      uptime: this.getUptimeMetrics(),
      memory: this.getMemoryMetrics(),
      requests: this.getRequestMetrics(),
      errors: this.getErrorMetrics(),
      cache: this.getCacheMetrics(),
    }
  }

  /**
   * Reset metrics (for testing or periodic resets)
   */
  reset(): void {
    const previousMetrics = this.getMetrics()
    logger.info(previousMetrics, 'Resetting system metrics')

    this.startTime = Date.now()
    this.requests = {
      total: 0,
      byEndpoint: {},
      byHour: {},
    }
    this.errors = []
    this.errorsByType = {}
    this.cache = {
      hits: 0,
      misses: 0,
    }
  }
}

// Singleton instance
export const systemMetrics = new SystemMetricsCollectorImpl()

// Log metrics summary every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const metrics = systemMetrics.getMetrics()
    logger.info(metrics, 'Hourly system metrics summary')
  }, 60 * 60 * 1000) // Every hour
}
