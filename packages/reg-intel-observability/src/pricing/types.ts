/**
 * Model Pricing Types
 *
 * Type definitions for LLM model pricing and cost calculation.
 */

/**
 * Pricing for a specific model
 */
export interface ModelPricing {
  /** Provider identifier (e.g., 'openai', 'anthropic', 'groq') */
  provider: string;

  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  model: string;

  /** Input token cost per million tokens (USD) */
  inputPricePerMillion: number;

  /** Output token cost per million tokens (USD) */
  outputPricePerMillion: number;

  /** When this pricing became effective */
  effectiveDate: string;

  /** Optional: When this pricing expires (null if current) */
  expiresAt?: string | null;

  /** Optional: Notes about this pricing */
  notes?: string;
}

/**
 * Cost calculation result
 */
export interface CostCalculation {
  /** Input token cost in USD */
  inputCostUsd: number;

  /** Output token cost in USD */
  outputCostUsd: number;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Pricing information used */
  pricing: ModelPricing;

  /** Whether pricing is estimated (if exact pricing unavailable) */
  isEstimated: boolean;
}

/**
 * Cost estimate request
 */
export interface CostEstimateRequest {
  /** Provider identifier */
  provider: string;

  /** Model identifier */
  model: string;

  /** Number of input tokens */
  inputTokens: number;

  /** Number of output tokens */
  outputTokens: number;

  /** Optional: specific pricing date to use */
  pricingDate?: Date;
}

/**
 * Enhanced LLM request metrics with cost tracking
 */
export interface LlmCostMetrics {
  // Existing metrics
  provider: string;
  model: string;
  tokenType: 'input' | 'output' | 'total';
  tokens: number;
  durationMs?: number;
  success: boolean;
  streaming?: boolean;
  cached?: boolean;

  // NEW: Cost tracking
  costUsd?: number;
  inputCostUsd?: number;
  outputCostUsd?: number;

  // NEW: Attribution
  tenantId?: string;
  userId?: string;
  organizationId?: string;

  // NEW: Touchpoint identification
  task?: string;
  endpoint?: string;
  service?: string;

  // NEW: Context
  conversationId?: string;
  requestId?: string;

  // Timestamp
  timestamp?: Date;
}
