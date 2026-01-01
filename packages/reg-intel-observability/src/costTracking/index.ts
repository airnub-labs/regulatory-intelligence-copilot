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
 * import { initCostTracking, InMemoryCostStorage, InMemoryQuotaProvider } from '@reg-copilot/reg-intel-observability';
 *
 * // Initialize cost tracking with in-memory providers
 * initCostTracking({
 *   storage: new InMemoryCostStorage(),
 *   quotas: new InMemoryQuotaProvider(),
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

// In-memory providers (for development/testing)
export { InMemoryCostStorage, InMemoryQuotaProvider } from './inMemoryProviders.js';

// Supabase providers (for production)
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
