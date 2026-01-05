/**
 * Cost Estimation Module
 *
 * Provides database-backed cost estimates for quota checks BEFORE operations.
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
