/**
 * Model Pricing Service
 *
 * Service for looking up model pricing and calculating costs.
 */

import type {
  ModelPricing,
  CostCalculation,
  CostEstimateRequest,
} from './types.js';
import { ALL_PRICING, DEFAULT_PRICING } from './pricingData.js';

/**
 * Pricing service interface
 */
export interface PricingService {
  /**
   * Get pricing for a specific model
   */
  getPricing(provider: string, model: string, date?: Date): Promise<ModelPricing | null>;

  /**
   * Calculate cost for a request
   */
  calculateCost(request: CostEstimateRequest): Promise<CostCalculation>;

  /**
   * Get all pricing for a provider
   */
  getProviderPricing(provider: string): Promise<ModelPricing[]>;

  /**
   * Update pricing (for admin use)
   */
  updatePricing(pricing: ModelPricing): Promise<void>;
}

/**
 * In-memory pricing service
 *
 * Uses static pricing data. For production, use database-backed service.
 */
export class InMemoryPricingService implements PricingService {
  private pricingMap: Map<string, ModelPricing[]>;

  constructor(pricingData: ModelPricing[] = ALL_PRICING) {
    this.pricingMap = new Map();

    // Group pricing by provider:model key
    for (const pricing of pricingData) {
      const key = this.createKey(pricing.provider, pricing.model);
      const existing = this.pricingMap.get(key) || [];
      existing.push(pricing);
      this.pricingMap.set(key, existing);
    }
  }

  /**
   * Create lookup key from provider and model
   */
  private createKey(provider: string, model: string): string {
    return `${provider.toLowerCase()}:${model.toLowerCase()}`;
  }

  /**
   * Normalize model name to match pricing keys
   */
  private normalizeModel(provider: string, model: string): string {
    const providerLower = provider.toLowerCase();
    const modelLower = model.toLowerCase();

    // Handle common model name variations
    if (providerLower === 'openai') {
      // gpt-4-0314 -> gpt-4
      if (modelLower.startsWith('gpt-4-0') || modelLower === 'gpt-4-32k-0314') {
        return modelLower.split('-').slice(0, 2).join('-'); // gpt-4 or gpt-4-32k
      }
      // gpt-3.5-turbo-0301 -> gpt-3.5-turbo
      if (modelLower.startsWith('gpt-3.5-turbo-0')) {
        return 'gpt-3.5-turbo';
      }
    }

    if (providerLower === 'anthropic') {
      // claude-3-opus -> claude-3-opus-20240229
      if (modelLower === 'claude-3-opus') {
        return 'claude-3-opus-20240229';
      }
      if (modelLower === 'claude-3-sonnet') {
        return 'claude-3-sonnet-20240229';
      }
      if (modelLower === 'claude-3-haiku') {
        return 'claude-3-haiku-20240307';
      }
    }

    return modelLower;
  }

  /**
   * Get pricing for a specific model
   */
  async getPricing(
    provider: string,
    model: string,
    date?: Date
  ): Promise<ModelPricing | null> {
    const normalizedModel = this.normalizeModel(provider, model);
    const key = this.createKey(provider, normalizedModel);
    const pricingList = this.pricingMap.get(key);

    if (!pricingList || pricingList.length === 0) {
      // Try original model name as fallback
      const originalKey = this.createKey(provider, model);
      const originalList = this.pricingMap.get(originalKey);
      if (!originalList || originalList.length === 0) {
        return null;
      }
      return this.selectPricingByDate(originalList, date);
    }

    return this.selectPricingByDate(pricingList, date);
  }

  /**
   * Select appropriate pricing based on date
   */
  private selectPricingByDate(
    pricingList: ModelPricing[],
    date?: Date
  ): ModelPricing {
    const targetDate = date || new Date();

    // Sort by effective date (newest first)
    const sorted = [...pricingList].sort((a, b) => {
      return new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime();
    });

    // Find first pricing that is effective before target date
    for (const pricing of sorted) {
      const effectiveDate = new Date(pricing.effectiveDate);
      if (effectiveDate <= targetDate) {
        // Check if expired
        if (pricing.expiresAt) {
          const expiresDate = new Date(pricing.expiresAt);
          if (expiresDate < targetDate) {
            continue;
          }
        }
        return pricing;
      }
    }

    // Fallback to oldest pricing if none match
    return sorted[sorted.length - 1] || sorted[0];
  }

  /**
   * Calculate cost for a request
   */
  async calculateCost(request: CostEstimateRequest): Promise<CostCalculation> {
    const pricing = await this.getPricing(
      request.provider,
      request.model,
      request.pricingDate
    );

    const effectivePricing = pricing || DEFAULT_PRICING;
    const isEstimated = !pricing;

    // Calculate costs
    const inputCostUsd =
      (request.inputTokens / 1_000_000) * effectivePricing.inputPricePerMillion;
    const outputCostUsd =
      (request.outputTokens / 1_000_000) * effectivePricing.outputPricePerMillion;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    return {
      inputCostUsd: Math.round(inputCostUsd * 1_000_000) / 1_000_000, // Round to 6 decimals
      outputCostUsd: Math.round(outputCostUsd * 1_000_000) / 1_000_000,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      pricing: effectivePricing,
      isEstimated,
    };
  }

  /**
   * Get all pricing for a provider
   */
  async getProviderPricing(provider: string): Promise<ModelPricing[]> {
    const providerLower = provider.toLowerCase();
    const result: ModelPricing[] = [];

    for (const [key, pricingList] of this.pricingMap.entries()) {
      if (key.startsWith(`${providerLower}:`)) {
        result.push(...pricingList);
      }
    }

    return result;
  }

  /**
   * Update pricing (for in-memory service, just adds to map)
   */
  async updatePricing(pricing: ModelPricing): Promise<void> {
    const key = this.createKey(pricing.provider, pricing.model);
    const existing = this.pricingMap.get(key) || [];
    existing.push(pricing);
    this.pricingMap.set(key, existing);
  }
}

/**
 * Create a pricing service instance
 */
export function createPricingService(
  pricingData?: ModelPricing[]
): PricingService {
  return new InMemoryPricingService(pricingData);
}

/**
 * Singleton pricing service for convenience
 */
let defaultPricingService: PricingService | null = null;

/**
 * Get default pricing service instance
 */
export function getDefaultPricingService(): PricingService {
  if (!defaultPricingService) {
    defaultPricingService = createPricingService();
  }
  return defaultPricingService;
}

/**
 * Quick cost calculation helper
 */
export async function calculateLlmCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<CostCalculation> {
  const service = getDefaultPricingService();
  return service.calculateCost({
    provider,
    model,
    inputTokens,
    outputTokens,
  });
}
