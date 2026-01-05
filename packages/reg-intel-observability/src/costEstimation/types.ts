/**
 * Cost Estimation Types
 *
 * Types for pre-calculated cost estimates used for quota checks BEFORE operations.
 */

/**
 * Confidence level for cost estimates
 * - conservative: Over-estimate to avoid quota overruns
 * - typical: Typical/average usage pattern
 * - optimistic: Under-estimate (use with caution)
 */
export type ConfidenceLevel = 'conservative' | 'typical' | 'optimistic';

/**
 * LLM operation types
 */
export type LLMOperationType = 'chat' | 'completion' | 'embedding' | 'tool_use';

/**
 * E2B operation types
 */
export type E2BOperationType = 'standard_session' | 'extended_session' | 'quick_task' | 'long_running';

/**
 * Parameters for LLM cost estimate lookup
 */
export interface LLMCostEstimateParams {
  provider: string;
  model: string;
  operationType?: LLMOperationType;
  confidenceLevel?: ConfidenceLevel;
}

/**
 * Parameters for E2B cost estimate lookup
 */
export interface E2BCostEstimateParams {
  tier: string;
  region?: string;
  operationType?: E2BOperationType;
  confidenceLevel?: ConfidenceLevel;
}

/**
 * LLM cost estimate from database
 */
export interface LLMCostEstimate {
  provider: string;
  model: string;
  operationType: string;
  estimatedCostUsd: number;
  confidenceLevel: string;
  description?: string;
  assumptions?: string;
}

/**
 * E2B cost estimate from database
 */
export interface E2BCostEstimate {
  tier: string;
  region: string;
  operationType: string;
  expectedDurationSeconds: number;
  estimatedCostUsd: number;
  confidenceLevel: string;
  description?: string;
  assumptions?: string;
}
