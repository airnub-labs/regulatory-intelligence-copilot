/**
 * Comprehensive Metrics Type Definitions
 *
 * This file defines all metric types organized into three categories:
 * 1. System Metrics - Infrastructure and application performance
 * 2. Authentication Metrics - User authentication and session validation
 * 3. Business Metrics - Feature usage and business intelligence
 *
 * See: docs/METRICS_SPECIFICATION.md for complete documentation
 */

// ============================================================================
// SYSTEM METRICS
// ============================================================================

/**
 * Application uptime and availability metrics
 */
export interface UptimeMetrics {
  /** Milliseconds since application start */
  milliseconds: number
  /** Hours since application start */
  hours: number
  /** ISO timestamp when metrics collection started */
  startTime: string
}

/**
 * Memory usage and Node.js heap statistics
 */
export interface MemoryMetrics {
  /** Total heap size allocated by V8 (bytes) */
  heapTotal: number
  /** Amount of heap currently in use (bytes) */
  heapUsed: number
  /** Percentage of heap used (0-100) */
  heapUsedPercentage: number
  /** Total memory allocated by the process (bytes) */
  rss: number
  /** Memory used by V8's external C++ objects (bytes) */
  external: number
}

/**
 * HTTP request statistics
 */
export interface RequestMetrics {
  /** Total number of requests processed */
  total: number
  /** Requests processed in last hour */
  lastHour: number
  /** Average requests per hour */
  averagePerHour: number
  /** Requests by endpoint path */
  byEndpoint: Record<string, number>
}

/**
 * Error tracking and monitoring
 */
export interface ErrorMetrics {
  /** Total errors encountered */
  total: number
  /** Errors in last hour */
  lastHour: number
  /** Errors grouped by type/category */
  byType: Record<string, number>
  /** Recent error messages (last 10) */
  recent: Array<{
    timestamp: string
    message: string
    type: string
  }>
}

/**
 * Cache performance statistics
 */
export interface CacheMetrics {
  /** Total cache operations (hits + misses) */
  total: number
  /** Successful cache retrievals */
  hits: number
  /** Failed cache retrievals requiring fallback */
  misses: number
  /** Cache hit rate percentage (0-100) */
  hitRate: number
  /** Cache implementation type (redis, memory, etc.) */
  type: string
  /** Number of entries currently in cache */
  size: number
}

/**
 * Aggregated system-level metrics
 */
export interface SystemMetrics {
  uptime: UptimeMetrics
  memory: MemoryMetrics
  requests: RequestMetrics
  errors: ErrorMetrics
  cache: CacheMetrics
}

// ============================================================================
// AUTHENTICATION METRICS
// ============================================================================

/**
 * User login pattern tracking
 */
export interface LoginMetrics {
  /** Total successful logins */
  total: number
  /** Logins by hour for last 24 hours */
  last24Hours: Record<string, number>
  /** ISO timestamp of most recent login */
  lastLoginTimestamp: string | null
  /** Average logins per hour */
  averagePerHour: number
}

/**
 * Session validation and cache performance
 */
export interface ValidationMetrics {
  /** Total validation operations */
  total: number
  /** Cache hits (no database query) */
  cacheHits: number
  /** Cache misses (database query required) */
  cacheMisses: number
  /** Cache hit rate percentage (0-100) */
  cacheHitRate: number
  /** Database queries executed for validation */
  databaseQueries: number
  /** Failed validations (deleted/banned users) */
  failures: number
  /** Average validation time in milliseconds */
  averageTimeMs: number
  /** Average validations per hour */
  averagePerHour: number
}

/**
 * User activity and security monitoring
 */
export interface UserMetrics {
  /** Number of unique active users */
  activeCount: number
  /** Deleted users detected attempting access */
  deletedDetected: number
  /** Banned users detected attempting access */
  bannedDetected: number
}

/**
 * Cost tracking and optimization
 */
export interface CostMetrics {
  /** Actual database query cost with caching */
  estimatedDatabaseCost: string
  /** Hypothetical cost without caching */
  costWithoutCache: string
  /** Cost savings from caching */
  savings: string
  /** Percentage of costs saved */
  savingsPercentage: string
  /** Database queries per hour */
  queriesPerHour: number
}

/**
 * Security event monitoring
 */
export interface SecurityMetrics {
  /** Total security events detected */
  totalEvents: number
  /** Unauthorized access attempts blocked */
  unauthorizedAttempts: number
  /** Invalid token detections */
  invalidTokens: number
  /** Recent security events (last 10) */
  recentEvents: Array<{
    timestamp: string
    eventType: string
    userId?: string
    details: string
  }>
}

/**
 * Performance analysis and recommendations
 */
export interface PerformanceMetrics {
  /** Cache effectiveness rating */
  cacheEffectiveness: 'Excellent' | 'Good' | 'Fair' | 'Poor'
  /** Recommended cache TTL adjustment */
  recommendedCacheTTL: string
  /** Average validation time rating */
  avgValidationTime: 'Excellent' | 'Good' | 'Needs optimization'
}

/**
 * Aggregated authentication metrics
 */
export interface AuthenticationMetrics {
  logins: LoginMetrics
  validations: ValidationMetrics
  users: UserMetrics
  costs: CostMetrics
  security?: SecurityMetrics
  performance: PerformanceMetrics
}

// ============================================================================
// BUSINESS METRICS
// ============================================================================

/**
 * API endpoint usage statistics
 */
export interface ApiMetrics {
  /** Total API calls across all endpoints */
  totalCalls: number
  /** API calls in last hour */
  lastHour: number
  /** API calls by endpoint */
  byEndpoint: Record<string, {
    calls: number
    averageResponseTime: number
    errorRate: number
  }>
  /** Average API response time (ms) */
  averageResponseTime: number
}

/**
 * Feature adoption and usage tracking
 */
export interface FeatureMetrics {
  /** Conversations created */
  conversationsCreated: number
  /** Graph nodes created */
  graphNodesCreated: number
  /** Messages sent */
  messagesSent: number
  /** Active features being used */
  activeFeatures: string[]
  /** Feature usage by type */
  byFeature: Record<string, number>
}

/**
 * Overall usage patterns and trends
 */
export interface UsageMetrics {
  /** Daily active users */
  dailyActiveUsers: number
  /** Weekly active users */
  weeklyActiveUsers: number
  /** Monthly active users */
  monthlyActiveUsers: number
  /** Average session duration (minutes) */
  averageSessionDuration: number
  /** Peak usage hours */
  peakHours: Record<string, number>
}

/**
 * Aggregated business intelligence metrics
 */
export interface BusinessMetrics {
  api: ApiMetrics
  features: FeatureMetrics
  usage: UsageMetrics
}

// ============================================================================
// AGGREGATED METRICS RESPONSE
// ============================================================================

/**
 * Complete metrics response with all categories
 *
 * This is the primary interface returned by the /api/observability endpoint
 */
export interface AggregatedMetrics {
  /** System-level infrastructure and performance metrics */
  system: SystemMetrics
  /** Authentication and security metrics */
  authentication: AuthenticationMetrics
  /** Business intelligence and feature usage metrics */
  business: BusinessMetrics
  /** ISO timestamp when metrics were collected */
  timestamp: string
  /** Application version or build number */
  version?: string
}

// ============================================================================
// COLLECTOR INTERFACES
// ============================================================================

/**
 * Interface for metric collectors
 * All metric collectors should implement record() and getMetrics() methods
 */
export interface MetricCollector<T> {
  /** Record a metric event */
  record(event: unknown): void
  /** Get current metrics snapshot */
  getMetrics(): T
  /** Reset metrics (optional, for testing) */
  reset?(): void
}

/**
 * System metrics collector interface
 */
export interface SystemMetricsCollector extends MetricCollector<SystemMetrics> {
  recordRequest(endpoint: string): void
  recordError(error: Error, type: string): void
  recordCacheOperation(hit: boolean): void
}

/**
 * Authentication metrics collector interface
 */
export interface AuthenticationMetricsCollector extends MetricCollector<AuthenticationMetrics> {
  recordLogin(userId: string): void
  recordCacheHit(userId: string): void
  recordCacheMiss(userId: string, durationMs: number, wasSuccessful: boolean): void
  recordDeletedUser(userId: string): void
  recordBannedUser(userId: string): void
  recordSecurityEvent(eventType: string, userId?: string, details?: string): void
}

/**
 * Business metrics collector interface
 */
export interface BusinessMetricsCollector extends MetricCollector<BusinessMetrics> {
  recordApiCall(endpoint: string, responseTime: number, success: boolean): void
  recordFeatureUsage(feature: string): void
  recordUserActivity(userId: string, action: string): void
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Options for metrics collection
 */
export interface MetricsOptions {
  /** Enable/disable metrics collection */
  enabled: boolean
  /** Sample rate for high-frequency events (0-1) */
  sampleRate?: number
  /** Retention period for historical data (hours) */
  retentionHours?: number
}

/**
 * Metrics export format
 */
export interface MetricsExport {
  format: 'json' | 'prometheus' | 'csv'
  data: AggregatedMetrics
  exportedAt: string
}
