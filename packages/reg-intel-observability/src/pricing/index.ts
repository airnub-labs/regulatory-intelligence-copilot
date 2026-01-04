/**
 * Model Pricing Module
 *
 * Provides pricing information and cost calculation for LLM models.
 */

export type {
  ModelPricing,
  CostCalculation,
  CostEstimateRequest,
  LlmCostMetrics,
} from './types.js';

export type { PricingService } from './pricingService.js';

export {
  SupabasePricingService,
  initPricingService,
  getPricingService,
  getPricingServiceIfInitialized,
  calculateLlmCost,
} from './pricingService.js';

// Note: Static pricing constants (OPENAI_PRICING, ANTHROPIC_PRICING, etc.) are
// intentionally NOT exported to prevent runtime usage of stale pricing data.
// The pricingData.ts file is kept only for:
// - Test data seeding (tests can import directly from pricingData.js)
// - Supabase migration scripts (can import directly from pricingData.js)
// All runtime pricing lookups MUST use SupabasePricingService for current data.

