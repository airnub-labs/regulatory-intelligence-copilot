/**
 * Cost Estimation Module
 *
 * Provides database-backed cost estimates for quota checks BEFORE operations.
 * Falls back to manually-updateable ENUM constants when database unavailable.
 */

export type {
  ConfidenceLevel,
  LLMOperationType,
  E2BOperationType,
  LLMCostEstimateParams,
  E2BCostEstimateParams,
  LLMCostEstimate,
  E2BCostEstimate,
} from './types.js';

export {
  type CostEstimationService,
  SupabaseCostEstimationService,
  initCostEstimationService,
  getCostEstimationService,
  getCostEstimationServiceIfInitialized,
} from './service.js';

export {
  FALLBACK_LLM_COST_ESTIMATES,
  FALLBACK_E2B_COST_ESTIMATES,
  DEFAULT_LLM_COST_ESTIMATE,
  DEFAULT_E2B_COST_ESTIMATE,
  getLLMCostEstimateFallback,
  getE2BCostEstimateFallback,
} from './fallbacks.js';
