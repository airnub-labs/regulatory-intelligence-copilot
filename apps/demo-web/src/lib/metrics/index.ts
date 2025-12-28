/**
 * Metrics Module - Central Export
 *
 * Exports all metric collectors and types for use throughout the application.
 * Metrics are organized into three categories:
 * - System: Infrastructure and performance metrics
 * - Authentication: User authentication and session validation
 * - Business: Feature usage and business intelligence
 *
 * See: docs/METRICS_SPECIFICATION.md for complete documentation
 */

// Export all types
export * from './types'

// Export metric collectors
export { systemMetrics } from './systemMetrics'
export { businessMetrics } from './businessMetrics'

// Authentication metrics are exported from auth module
// Import with: import { authMetrics } from '@/lib/auth/authMetrics'
