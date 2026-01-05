/**
 * E2B Cost Tracking & Resource Management
 *
 * Comprehensive cost tracking, pricing, and quota enforcement for E2B sandboxes.
 * Mirrors the LLM cost tracking architecture for consistency.
 *
 * @module @reg-copilot/reg-intel-observability/e2b
 */

// Types
export type {
  E2BPricing,
  E2BResourceUsage,
  E2BCostCalculation,
  E2BCostEstimateRequest,
  E2BCostRecord,
  E2BOperationMetrics,
  E2BQuotaCheckResult,
  E2BQuotaReservation,
} from './types.js';

// Pricing Service
export {
  SupabaseE2BPricingService,
  type E2BPricingService,
  estimateE2BCost,
} from './pricingService.js';

// Cost Tracking Service
export {
  SupabaseE2BCostTrackingService,
  type E2BCostTrackingService,
  calculateAndRecordE2BCost,
  initE2BCostTracking,
  getE2BPricingService,
  getE2BCostTrackingService,
  getE2BPricingServiceIfInitialized,
  getE2BCostTrackingServiceIfInitialized,
} from './costTracking.js';
