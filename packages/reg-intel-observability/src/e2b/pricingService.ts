/**
 * E2B Pricing Service
 *
 * Service for looking up E2B sandbox pricing and calculating costs.
 * Mirrors the LLM pricing service architecture for consistency.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  E2BPricing,
  E2BCostCalculation,
  E2BCostEstimateRequest,
  E2BResourceUsage,
} from './types.js';

/**
 * Pricing service interface
 */
export interface E2BPricingService {
  /**
   * Get pricing for a specific tier and region
   */
  getPricing(tier: string, region?: string, date?: Date): Promise<E2BPricing | null>;

  /**
   * Calculate cost for a sandbox execution
   */
  calculateCost(request: E2BCostEstimateRequest): Promise<E2BCostCalculation>;

  /**
   * Get all pricing for a tier
   */
  getTierPricing(tier: string): Promise<E2BPricing[]>;

  /**
   * Update pricing (for admin use)
   */
  updatePricing(pricing: E2BPricing): Promise<void>;
}

interface PricingRow {
  tier: string;
  region: string;
  price_per_second: number;
  price_per_cpu_core_hour?: number | null;
  price_per_gb_memory_hour?: number | null;
  price_per_gb_disk_io?: number | null;
  effective_date: string;
  expires_at?: string | null;
  notes?: string | null;
}

function selectPricingByDate(pricingList: E2BPricing[], date?: Date): E2BPricing | null {
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

function mapRowToPricing(row: PricingRow): E2BPricing {
  return {
    tier: row.tier,
    region: row.region,
    pricePerSecond: Number(row.price_per_second),
    pricePerCpuCoreHour: row.price_per_cpu_core_hour ? Number(row.price_per_cpu_core_hour) : undefined,
    pricePerGbMemoryHour: row.price_per_gb_memory_hour ? Number(row.price_per_gb_memory_hour) : undefined,
    pricePerGbDiskIO: row.price_per_gb_disk_io ? Number(row.price_per_gb_disk_io) : undefined,
    effectiveDate: row.effective_date,
    expiresAt: row.expires_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

/**
 * Default fallback pricing when database pricing is unavailable
 * Conservative estimates to avoid undercharging
 */
const FALLBACK_PRICING: Record<string, number> = {
  'standard': 0.0001,      // $0.0001/sec = $0.36/hour
  'gpu': 0.001,            // $0.001/sec = $3.60/hour
  'high-memory': 0.0005,   // $0.0005/sec = $1.80/hour
  'high-cpu': 0.0003,      // $0.0003/sec = $1.08/hour
};

export class SupabaseE2BPricingService implements E2BPricingService {
  private readonly client: SupabaseClient;
  private readonly tableName: string;

  constructor(client: SupabaseClient, tableName = 'copilot_internal.e2b_pricing') {
    this.client = client;
    this.tableName = tableName;
  }

  async getPricing(tier: string, region: string = 'us-east-1', date?: Date): Promise<E2BPricing | null> {
    const tierLower = tier.toLowerCase();
    const regionLower = region.toLowerCase();

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('tier', tierLower)
      .eq('region', regionLower);

    if (error) {
      throw new Error(`Failed to fetch pricing for ${tier}/${region}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const pricingList = (data as PricingRow[]).map(mapRowToPricing);
    return selectPricingByDate(pricingList, date);
  }

  async calculateCost(request: E2BCostEstimateRequest): Promise<E2BCostCalculation> {
    const pricing = await this.getPricing(
      request.tier,
      request.region || 'us-east-1',
      request.pricingDate
    );

    const usage = request.resourceUsage;

    if (!pricing) {
      // Use fallback pricing
      const fallbackPrice = FALLBACK_PRICING[request.tier.toLowerCase()] || FALLBACK_PRICING['standard'];
      const executionCost = usage.executionTimeSeconds * fallbackPrice;

      return {
        executionCostUsd: executionCost,
        resourceCostUsd: 0,
        totalCostUsd: executionCost,
        pricing: {
          tier: request.tier,
          region: request.region || 'us-east-1',
          pricePerSecond: fallbackPrice,
          effectiveDate: new Date().toISOString(),
        },
        isEstimated: true,
      };
    }

    // Calculate execution cost
    const executionCost = usage.executionTimeSeconds * pricing.pricePerSecond;

    // Calculate resource costs
    let resourceCost = 0;

    if (usage.cpuCoreSeconds && pricing.pricePerCpuCoreHour) {
      // Convert core-seconds to core-hours
      resourceCost += (usage.cpuCoreSeconds / 3600) * pricing.pricePerCpuCoreHour;
    }

    if (usage.memoryGbSeconds && pricing.pricePerGbMemoryHour) {
      // Convert GB-seconds to GB-hours
      resourceCost += (usage.memoryGbSeconds / 3600) * pricing.pricePerGbMemoryHour;
    }

    if (usage.diskIoGb && pricing.pricePerGbDiskIO) {
      resourceCost += usage.diskIoGb * pricing.pricePerGbDiskIO;
    }

    return {
      executionCostUsd: executionCost,
      resourceCostUsd: resourceCost,
      totalCostUsd: executionCost + resourceCost,
      pricing,
      isEstimated: false,
    };
  }

  async getTierPricing(tier: string): Promise<E2BPricing[]> {
    const tierLower = tier.toLowerCase();

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('tier', tierLower)
      .order('effective_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pricing for tier ${tier}: ${error.message}`);
    }

    return (data as PricingRow[]).map(mapRowToPricing);
  }

  async updatePricing(pricing: E2BPricing): Promise<void> {
    const { error } = await this.client.from(this.tableName).insert({
      tier: pricing.tier.toLowerCase(),
      region: pricing.region.toLowerCase(),
      price_per_second: pricing.pricePerSecond,
      price_per_cpu_core_hour: pricing.pricePerCpuCoreHour,
      price_per_gb_memory_hour: pricing.pricePerGbMemoryHour,
      price_per_gb_disk_io: pricing.pricePerGbDiskIO,
      effective_date: pricing.effectiveDate,
      expires_at: pricing.expiresAt,
      notes: pricing.notes,
    });

    if (error) {
      throw new Error(`Failed to update pricing: ${error.message}`);
    }
  }
}

/**
 * Estimate cost before execution (conservative estimate)
 */
export function estimateE2BCost(tier: string, estimatedDurationSeconds: number = 300): number {
  // Default to 5 minutes (300 seconds) if not specified
  const pricePerSecond = FALLBACK_PRICING[tier.toLowerCase()] || FALLBACK_PRICING['standard'];
  return estimatedDurationSeconds * pricePerSecond;
}
