/**
 * Model Pricing Seed Data
 *
 * ⚠️ WARNING: This file is for TEST SEEDING and MIGRATIONS ONLY.
 * ⚠️ DO NOT use this data at runtime - it becomes stale as soon as deployed.
 * ⚠️ All runtime pricing MUST come from SupabasePricingService.
 *
 * This static pricing data is intentionally NOT exported from index.ts.
 * It should only be imported directly by:
 * - Test files (for seeding test databases)
 * - Migration scripts (for initial Supabase seeding)
 *
 * Pricing snapshot as of December 2024.
 *
 * Sources:
 * - OpenAI: https://openai.com/pricing
 * - Anthropic: https://www.anthropic.com/pricing
 * - Google: https://ai.google.dev/pricing
 * - Groq: https://groq.com/pricing
 */

import type { ModelPricing } from './types.js';

/**
 * OpenAI model pricing (December 2024)
 */
export const OPENAI_PRICING: ModelPricing[] = [
  // GPT-4 Turbo
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
    effectiveDate: '2024-01-01',
    notes: 'GPT-4 Turbo with 128k context',
  },
  {
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
    effectiveDate: '2024-01-01',
  },
  {
    provider: 'openai',
    model: 'gpt-4-turbo-2024-04-09',
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
    effectiveDate: '2024-04-09',
  },

  // GPT-4 (original)
  {
    provider: 'openai',
    model: 'gpt-4',
    inputPricePerMillion: 30.0,
    outputPricePerMillion: 60.0,
    effectiveDate: '2023-03-01',
    notes: 'GPT-4 8k context',
  },
  {
    provider: 'openai',
    model: 'gpt-4-0613',
    inputPricePerMillion: 30.0,
    outputPricePerMillion: 60.0,
    effectiveDate: '2023-06-13',
  },

  // GPT-4 32k
  {
    provider: 'openai',
    model: 'gpt-4-32k',
    inputPricePerMillion: 60.0,
    outputPricePerMillion: 120.0,
    effectiveDate: '2023-03-01',
  },

  // GPT-3.5 Turbo
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
    effectiveDate: '2024-01-01',
    notes: 'GPT-3.5 Turbo with 16k context',
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-0125',
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
    effectiveDate: '2024-01-25',
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-1106',
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 2.0,
    effectiveDate: '2023-11-06',
  },

  // GPT-3.5 Turbo 16k
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-16k',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 4.0,
    effectiveDate: '2023-06-01',
  },

  // o1 models (reasoning)
  {
    provider: 'openai',
    model: 'o1-preview',
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 60.0,
    effectiveDate: '2024-09-01',
    notes: 'Reasoning model with enhanced capabilities',
  },
  {
    provider: 'openai',
    model: 'o1-mini',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 12.0,
    effectiveDate: '2024-09-01',
    notes: 'Smaller reasoning model',
  },
];

/**
 * Anthropic Claude pricing (December 2024)
 */
export const ANTHROPIC_PRICING: ModelPricing[] = [
  // Claude 3.5 Sonnet
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    effectiveDate: '2024-10-22',
    notes: 'Latest Claude 3.5 Sonnet',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20240620',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    effectiveDate: '2024-06-20',
  },

  // Claude 3 Opus
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    effectiveDate: '2024-02-29',
    notes: 'Most capable Claude 3 model',
  },

  // Claude 3 Sonnet
  {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    effectiveDate: '2024-02-29',
  },

  // Claude 3 Haiku
  {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    effectiveDate: '2024-03-07',
    notes: 'Fastest and most compact Claude 3 model',
  },

  // Claude 2
  {
    provider: 'anthropic',
    model: 'claude-2.1',
    inputPricePerMillion: 8.0,
    outputPricePerMillion: 24.0,
    effectiveDate: '2023-11-01',
  },
  {
    provider: 'anthropic',
    model: 'claude-2.0',
    inputPricePerMillion: 8.0,
    outputPricePerMillion: 24.0,
    effectiveDate: '2023-07-01',
  },
];

/**
 * Google Gemini pricing (December 2024)
 */
export const GOOGLE_PRICING: ModelPricing[] = [
  // Gemini 1.5 Pro
  {
    provider: 'google',
    model: 'gemini-1.5-pro',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.0,
    effectiveDate: '2024-12-01',
    notes: '2M context window, multimodal',
  },
  {
    provider: 'google',
    model: 'gemini-1.5-pro-latest',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.0,
    effectiveDate: '2024-12-01',
  },

  // Gemini 1.5 Flash
  {
    provider: 'google',
    model: 'gemini-1.5-flash',
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    effectiveDate: '2024-12-01',
    notes: 'Faster, lower cost',
  },
  {
    provider: 'google',
    model: 'gemini-1.5-flash-latest',
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    effectiveDate: '2024-12-01',
  },

  // Gemini 1.0 Pro
  {
    provider: 'google',
    model: 'gemini-1.0-pro',
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
    effectiveDate: '2024-02-01',
  },
];

/**
 * Groq pricing (December 2024)
 *
 * Note: Groq offers free tier and usage-based pricing.
 * These are approximate costs for paid tier.
 */
export const GROQ_PRICING: ModelPricing[] = [
  // Llama 3.3
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    inputPricePerMillion: 0.59,
    outputPricePerMillion: 0.79,
    effectiveDate: '2024-10-01',
    notes: 'Llama 3.3 70B on Groq',
  },

  // Llama 3.1
  {
    provider: 'groq',
    model: 'llama-3.1-70b-versatile',
    inputPricePerMillion: 0.59,
    outputPricePerMillion: 0.79,
    effectiveDate: '2024-07-01',
  },
  {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.08,
    effectiveDate: '2024-07-01',
  },

  // Llama 3
  {
    provider: 'groq',
    model: 'llama3-70b-8192',
    inputPricePerMillion: 0.59,
    outputPricePerMillion: 0.79,
    effectiveDate: '2024-04-01',
  },
  {
    provider: 'groq',
    model: 'llama3-8b-8192',
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.08,
    effectiveDate: '2024-04-01',
  },

  // Mixtral
  {
    provider: 'groq',
    model: 'mixtral-8x7b-32768',
    inputPricePerMillion: 0.24,
    outputPricePerMillion: 0.24,
    effectiveDate: '2024-01-01',
  },

  // Gemma
  {
    provider: 'groq',
    model: 'gemma-7b-it',
    inputPricePerMillion: 0.07,
    outputPricePerMillion: 0.07,
    effectiveDate: '2024-02-01',
  },
  {
    provider: 'groq',
    model: 'gemma2-9b-it',
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 0.2,
    effectiveDate: '2024-06-01',
  },
];

/**
 * Local model pricing (self-hosted)
 *
 * Local models have no API costs, but have infrastructure costs.
 * We set pricing to $0 for API cost tracking purposes.
 */
export const LOCAL_PRICING: ModelPricing[] = [
  {
    provider: 'local',
    model: 'llama-3-70b',
    inputPricePerMillion: 0.0,
    outputPricePerMillion: 0.0,
    effectiveDate: '2024-01-01',
    notes: 'Self-hosted, no API costs (infrastructure costs separate)',
  },
  {
    provider: 'local',
    model: 'llama-3-8b',
    inputPricePerMillion: 0.0,
    outputPricePerMillion: 0.0,
    effectiveDate: '2024-01-01',
    notes: 'Self-hosted, no API costs',
  },
  {
    provider: 'local',
    model: 'mistral-7b',
    inputPricePerMillion: 0.0,
    outputPricePerMillion: 0.0,
    effectiveDate: '2024-01-01',
    notes: 'Self-hosted, no API costs',
  },
];

/**
 * All pricing data combined
 */
export const ALL_PRICING: ModelPricing[] = [
  ...OPENAI_PRICING,
  ...ANTHROPIC_PRICING,
  ...GOOGLE_PRICING,
  ...GROQ_PRICING,
  ...LOCAL_PRICING,
];

/**
 * Default pricing for unknown models (fallback)
 *
 * Uses GPT-3.5 Turbo pricing as a reasonable default.
 */
export const DEFAULT_PRICING: ModelPricing = {
  provider: 'unknown',
  model: 'unknown',
  inputPricePerMillion: 0.5,
  outputPricePerMillion: 1.5,
  effectiveDate: '2024-01-01',
  notes: 'Default fallback pricing (GPT-3.5 Turbo equivalent)',
};
