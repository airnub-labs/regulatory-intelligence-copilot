/**
 * Model Pricing Service
 *
 * Service for looking up model pricing and calculating costs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ModelPricing,
  CostCalculation,
  CostEstimateRequest,
} from './types.js';
import { DEFAULT_PRICING } from './pricingData.js';

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

interface PricingRow {
  provider: string;
  model: string;
  input_price_per_million: number;
  output_price_per_million: number;
  effective_date: string;
  expires_at?: string | null;
  notes?: string | null;
}

function mapRowToPricing(row: PricingRow): ModelPricing {
  return {
    provider: row.provider,
    model: row.model,
    inputPricePerMillion: Number(row.input_price_per_million),
    outputPricePerMillion: Number(row.output_price_per_million),
    effectiveDate: row.effective_date,
    expiresAt: row.expires_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export class SupabasePricingService implements PricingService {
  private readonly client: SupabaseClient;
  private readonly tableName: string;

  constructor(client: SupabaseClient, tableName = 'copilot_internal.model_pricing') {
    this.client = client;
    this.tableName = tableName;
  }

  private normalizeModel(provider: string, model: string): string {
    const providerLower = provider.toLowerCase();
    const modelLower = model.toLowerCase();

    if (providerLower === 'openai') {
      if (modelLower.startsWith('gpt-4-0') || modelLower === 'gpt-4-32k-0314') {
        return modelLower.split('-').slice(0, 2).join('-');
      }
      if (modelLower.startsWith('gpt-3.5-turbo-0')) {
        return 'gpt-3.5-turbo';
      }
    }

    if (providerLower === 'anthropic') {
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

  private selectPricingByDate(pricingList: ModelPricing[], date?: Date): ModelPricing | null {
    if (pricingList.length === 0) {
      return null;
    }

    const targetDate = date || new Date();
    const sorted = [...pricingList].sort((a, b) => {
      return new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime();
    });

    for (const pricing of sorted) {
      const effectiveDate = new Date(pricing.effectiveDate);
      if (effectiveDate <= targetDate) {
        if (pricing.expiresAt) {
          const expiresDate = new Date(pricing.expiresAt);
          if (expiresDate < targetDate) {
            continue;
          }
        }
        return pricing;
      }
    }

    return sorted[sorted.length - 1] || null;
  }

  async getPricing(provider: string, model: string, date?: Date): Promise<ModelPricing | null> {
    const normalizedModel = this.normalizeModel(provider, model);
    const providerLower = provider.toLowerCase();

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('provider', providerLower)
      .eq('model', normalizedModel);

    if (error) {
      throw new Error(`Failed to fetch pricing for ${provider}/${model}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const pricingList = (data as PricingRow[]).map(mapRowToPricing);
    return this.selectPricingByDate(pricingList, date);
  }

  async calculateCost(request: CostEstimateRequest): Promise<CostCalculation> {
    const pricing = await this.getPricing(
      request.provider,
      request.model,
      request.pricingDate
    );

    const effectivePricing = pricing || DEFAULT_PRICING;
    const isEstimated = !pricing;

    const inputCostUsd =
      (request.inputTokens / 1_000_000) * effectivePricing.inputPricePerMillion;
    const outputCostUsd =
      (request.outputTokens / 1_000_000) * effectivePricing.outputPricePerMillion;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    return {
      inputCostUsd: Math.round(inputCostUsd * 1_000_000) / 1_000_000,
      outputCostUsd: Math.round(outputCostUsd * 1_000_000) / 1_000_000,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      pricing: effectivePricing,
      isEstimated,
    };
  }

  async getProviderPricing(provider: string): Promise<ModelPricing[]> {
    const providerLower = provider.toLowerCase();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('provider', providerLower);

    if (error) {
      throw new Error(`Failed to fetch provider pricing for ${provider}: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return (data as PricingRow[]).map(mapRowToPricing);
  }

  async updatePricing(pricing: ModelPricing): Promise<void> {
    const { error } = await this.client.from(this.tableName).insert({
      provider: pricing.provider.toLowerCase(),
      model: pricing.model.toLowerCase(),
      input_price_per_million: pricing.inputPricePerMillion,
      output_price_per_million: pricing.outputPricePerMillion,
      effective_date: pricing.effectiveDate,
      expires_at: pricing.expiresAt ?? null,
      notes: pricing.notes ?? null,
    });

    if (error) {
      throw new Error(`Failed to update pricing for ${pricing.provider}/${pricing.model}: ${error.message}`);
    }
  }
}

let pricingService: PricingService | null = null;

export function initPricingService(service: PricingService): void {
  pricingService = service;
}

export function getPricingService(): PricingService {
  if (!pricingService) {
    throw new Error('Pricing service has not been initialized. Provide a persistent pricing service.');
  }
  return pricingService;
}

export function getPricingServiceIfInitialized(): PricingService | null {
  return pricingService;
}

export async function calculateLlmCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<CostCalculation> {
  const service = getPricingService();
  return service.calculateCost({
    provider,
    model,
    inputTokens,
    outputTokens,
  });
}
