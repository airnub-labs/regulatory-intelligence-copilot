/**
 * Cost Tracking Module
 *
 * Provides comprehensive LLM cost tracking and management:
 * - Detailed cost storage and historical analysis
 * - Multi-dimensional cost aggregation
 * - Quota management and enforcement
 * - Integration with OpenTelemetry metrics
 *
 * Usage:
 * ```typescript
 * import { initCostTracking, SupabaseCostStorage, SupabaseQuotaProvider } from '@reg-copilot/reg-intel-observability';
 * import { createClient } from '@supabase/supabase-js';
 *
 * const supabase = createClient(url, key);
 *
 * // Initialize cost tracking with Supabase providers (required for all environments)
 * initCostTracking({
 *   storage: new SupabaseCostStorage(supabase),
 *   quotas: new SupabaseQuotaProvider(supabase),
 *   enforceQuotas: true,
 *   onQuotaExceeded: (quota) => {
 *     console.warn(`Quota exceeded for ${quota.scope}:${quota.scopeId}`);
 *   },
 * });
 * ```
 */

// Types
export type {
  LlmCostRecord,
  CostAggregate,
  CostAggregateQuery,
  CostQuota,
  QuotaCheckRequest,
  QuotaCheckResult,
  CostStorageProvider,
  QuotaProvider,
} from './types.js';

// Service
export {
  CostTrackingService,
  initCostTracking,
  getCostTrackingService,
  getCostTrackingServiceIfInitialized,
  type CostTrackingOptions,
  type RecordCostRequest,
} from './costTrackingService.js';

// In-memory providers (for unit testing only - NOT for local dev or production)
export { InMemoryCostStorage, InMemoryQuotaProvider } from './inMemoryProviders.js';

// Supabase providers (required for local development and production)
export { SupabaseCostStorage, SupabaseQuotaProvider } from './supabaseProviders.js';

// Touchpoint constants
export {
  LLM_TOUCHPOINTS,
  TOUCHPOINT_PRIORITY,
  TOUCHPOINT_DESCRIPTIONS,
  ALL_TOUCHPOINTS,
  isValidTouchpoint,
  type LlmTouchpoint,
} from './touchpoints.js';

// Notification service (for cost alerts)
export {
  DefaultNotificationService,
  createNotificationService,
  createCostAlert,
  getNotificationService,
  initNotificationServiceFromEnv,
  type NotificationService,
  type NotificationConfig,
  type NotificationChannel,
  type NotificationResult,
  type CostAlert,
  type AlertSeverity,
  type SlackConfig,
  type EmailConfig,
  type PagerDutyConfig,
} from './notifications.js';
