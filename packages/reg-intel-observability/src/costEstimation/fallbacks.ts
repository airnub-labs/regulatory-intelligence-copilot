/**
 * Fallback Cost Estimate Constants
 *
 * Manually updateable fallback constants for quota estimation when database is unavailable.
 * These MUST be kept in sync with database seeded values in migration 20260105000002_cost_estimates.sql
 *
 * IMPORTANT: These are ONLY for pre-request quota estimation, NOT for actual cost recording.
 * Actual cost recording (businessMetrics.ts) must use database-backed pricing, not these fallbacks.
 *
 * Update these values when vendor pricing changes.
 */

import type {
  LLMOperationType,
  E2BOperationType,
  ConfidenceLevel,
} from './types.js';

/**
 * LLM Cost Estimate Fallbacks
 * Organized by provider -> model -> operation -> confidence level
 */
export const FALLBACK_LLM_COST_ESTIMATES: Record<
  string, // provider
  Record<
    string, // model
    Record<
      LLMOperationType,
      Record<ConfidenceLevel, number>
    >
  >
> = {
  anthropic: {
    'claude-3-sonnet-20240229': {
      chat: {
        conservative: 0.05,
        typical: 0.03,
        optimistic: 0.02,
      },
      completion: {
        conservative: 0.05,
        typical: 0.03,
        optimistic: 0.02,
      },
      tool_use: {
        conservative: 0.08,
        typical: 0.05,
        optimistic: 0.03,
      },
      embedding: {
        conservative: 0.01,
        typical: 0.008,
        optimistic: 0.005,
      },
    },
    'claude-3-5-sonnet-20240620': {
      chat: {
        conservative: 0.05,
        typical: 0.03,
        optimistic: 0.02,
      },
      completion: {
        conservative: 0.05,
        typical: 0.03,
        optimistic: 0.02,
      },
      tool_use: {
        conservative: 0.08,
        typical: 0.05,
        optimistic: 0.03,
      },
      embedding: {
        conservative: 0.01,
        typical: 0.008,
        optimistic: 0.005,
      },
    },
    'claude-3-opus-20240229': {
      chat: {
        conservative: 0.12,
        typical: 0.08,
        optimistic: 0.05,
      },
      completion: {
        conservative: 0.12,
        typical: 0.08,
        optimistic: 0.05,
      },
      tool_use: {
        conservative: 0.15,
        typical: 0.10,
        optimistic: 0.07,
      },
      embedding: {
        conservative: 0.02,
        typical: 0.015,
        optimistic: 0.01,
      },
    },
    'claude-3-haiku-20240307': {
      chat: {
        conservative: 0.01,
        typical: 0.007,
        optimistic: 0.005,
      },
      completion: {
        conservative: 0.01,
        typical: 0.007,
        optimistic: 0.005,
      },
      tool_use: {
        conservative: 0.015,
        typical: 0.01,
        optimistic: 0.007,
      },
      embedding: {
        conservative: 0.003,
        typical: 0.002,
        optimistic: 0.001,
      },
    },
  },
  openai: {
    'gpt-4-turbo': {
      chat: {
        conservative: 0.04,
        typical: 0.025,
        optimistic: 0.015,
      },
      completion: {
        conservative: 0.04,
        typical: 0.025,
        optimistic: 0.015,
      },
      tool_use: {
        conservative: 0.06,
        typical: 0.04,
        optimistic: 0.025,
      },
      embedding: {
        conservative: 0.008,
        typical: 0.005,
        optimistic: 0.003,
      },
    },
    'gpt-4o': {
      chat: {
        conservative: 0.03,
        typical: 0.02,
        optimistic: 0.012,
      },
      completion: {
        conservative: 0.03,
        typical: 0.02,
        optimistic: 0.012,
      },
      tool_use: {
        conservative: 0.045,
        typical: 0.03,
        optimistic: 0.018,
      },
      embedding: {
        conservative: 0.006,
        typical: 0.004,
        optimistic: 0.002,
      },
    },
    'gpt-4o-mini': {
      chat: {
        conservative: 0.005,
        typical: 0.003,
        optimistic: 0.002,
      },
      completion: {
        conservative: 0.005,
        typical: 0.003,
        optimistic: 0.002,
      },
      tool_use: {
        conservative: 0.008,
        typical: 0.005,
        optimistic: 0.003,
      },
      embedding: {
        conservative: 0.001,
        typical: 0.0007,
        optimistic: 0.0005,
      },
    },
    'gpt-3.5-turbo': {
      chat: {
        conservative: 0.003,
        typical: 0.002,
        optimistic: 0.001,
      },
      completion: {
        conservative: 0.003,
        typical: 0.002,
        optimistic: 0.001,
      },
      tool_use: {
        conservative: 0.005,
        typical: 0.003,
        optimistic: 0.002,
      },
      embedding: {
        conservative: 0.0008,
        typical: 0.0005,
        optimistic: 0.0003,
      },
    },
  },
};

/**
 * E2B Cost Estimate Fallbacks
 * Organized by tier -> region -> operation -> confidence level
 */
export const FALLBACK_E2B_COST_ESTIMATES: Record<
  string, // tier
  Record<
    string, // region
    Record<
      E2BOperationType,
      Record<ConfidenceLevel, number>
    >
  >
> = {
  standard: {
    'us-east-1': {
      quick_task: {
        conservative: 0.006,  // 1 minute at $0.0001/sec
        typical: 0.005,
        optimistic: 0.004,
      },
      standard_session: {
        conservative: 0.03,   // 5 minutes at $0.0001/sec
        typical: 0.025,
        optimistic: 0.02,
      },
      extended_session: {
        conservative: 0.09,   // 15 minutes at $0.0001/sec
        typical: 0.075,
        optimistic: 0.06,
      },
      long_running: {
        conservative: 0.18,   // 30 minutes at $0.0001/sec
        typical: 0.15,
        optimistic: 0.12,
      },
    },
  },
  gpu: {
    'us-east-1': {
      quick_task: {
        conservative: 0.06,   // 1 minute at $0.001/sec
        typical: 0.05,
        optimistic: 0.04,
      },
      standard_session: {
        conservative: 0.30,   // 5 minutes at $0.001/sec
        typical: 0.25,
        optimistic: 0.20,
      },
      extended_session: {
        conservative: 0.90,   // 15 minutes at $0.001/sec
        typical: 0.75,
        optimistic: 0.60,
      },
      long_running: {
        conservative: 1.80,   // 30 minutes at $0.001/sec
        typical: 1.50,
        optimistic: 1.20,
      },
    },
  },
  'high-memory': {
    'us-east-1': {
      quick_task: {
        conservative: 0.03,   // 1 minute at $0.0005/sec
        typical: 0.025,
        optimistic: 0.02,
      },
      standard_session: {
        conservative: 0.15,   // 5 minutes at $0.0005/sec
        typical: 0.125,
        optimistic: 0.10,
      },
      extended_session: {
        conservative: 0.45,   // 15 minutes at $0.0005/sec
        typical: 0.375,
        optimistic: 0.30,
      },
      long_running: {
        conservative: 0.90,   // 30 minutes at $0.0005/sec
        typical: 0.75,
        optimistic: 0.60,
      },
    },
  },
  'high-cpu': {
    'us-east-1': {
      quick_task: {
        conservative: 0.018,  // 1 minute at $0.0003/sec
        typical: 0.015,
        optimistic: 0.012,
      },
      standard_session: {
        conservative: 0.09,   // 5 minutes at $0.0003/sec
        typical: 0.075,
        optimistic: 0.06,
      },
      extended_session: {
        conservative: 0.27,   // 15 minutes at $0.0003/sec
        typical: 0.225,
        optimistic: 0.18,
      },
      long_running: {
        conservative: 0.54,   // 30 minutes at $0.0003/sec
        typical: 0.45,
        optimistic: 0.36,
      },
    },
  },
};

/**
 * Default fallback values when specific provider/model/tier not found
 */
export const DEFAULT_LLM_COST_ESTIMATE = 0.05; // Conservative default for typical LLM chat
export const DEFAULT_E2B_COST_ESTIMATE = 0.03; // Conservative default for 5-min standard session

/**
 * Get LLM cost estimate fallback
 */
export function getLLMCostEstimateFallback(
  provider: string,
  model: string,
  operationType: LLMOperationType = 'chat',
  confidenceLevel: ConfidenceLevel = 'conservative'
): number {
  const providerLower = provider.toLowerCase();
  const modelLower = model.toLowerCase();

  return (
    FALLBACK_LLM_COST_ESTIMATES[providerLower]?.[modelLower]?.[operationType]?.[confidenceLevel] ??
    DEFAULT_LLM_COST_ESTIMATE
  );
}

/**
 * Get E2B cost estimate fallback
 */
export function getE2BCostEstimateFallback(
  tier: string,
  region: string = 'us-east-1',
  operationType: E2BOperationType = 'standard_session',
  confidenceLevel: ConfidenceLevel = 'conservative'
): number {
  const tierLower = tier.toLowerCase();
  const regionLower = region.toLowerCase();

  return (
    FALLBACK_E2B_COST_ESTIMATES[tierLower]?.[regionLower]?.[operationType]?.[confidenceLevel] ??
    DEFAULT_E2B_COST_ESTIMATE
  );
}
