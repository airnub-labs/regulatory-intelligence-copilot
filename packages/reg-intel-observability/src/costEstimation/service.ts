/**
 * Cost Estimation Service
 *
 * Provides database-backed cost estimates for quota checks BEFORE operations.
 * Uses in-memory caching with TTL to reduce database queries.
 *
 * IMPORTANT: Returns null when estimates unavailable - no data is better than inaccurate data.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../logger.js';
import type {
  LLMCostEstimateParams,
  E2BCostEstimateParams,
  ConfidenceLevel,
} from './types.js';

const logger = createLogger('CostEstimationService');

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL
 */
class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Cost estimation service interface
 */
export interface CostEstimationService {
  /**
   * Get LLM cost estimate from database with caching
   * @returns Estimated cost in USD, or null if unavailable
   */
  getLLMCostEstimate(params: LLMCostEstimateParams): Promise<number | null>;

  /**
   * Get E2B cost estimate from database with caching
   * @returns Estimated cost in USD, or null if unavailable
   */
  getE2BCostEstimate(params: E2BCostEstimateParams): Promise<number | null>;

  /**
   * Clear all cached estimates
   */
  clearCache(): void;
}

/**
 * Database row from llm_cost_estimates table
 */
interface LLMCostEstimateRow {
  estimated_cost_usd: number;
}

/**
 * Database row from e2b_cost_estimates table
 */
interface E2BCostEstimateRow {
  estimated_cost_usd: number;
}

/**
 * Supabase-backed cost estimation service
 */
export class SupabaseCostEstimationService implements CostEstimationService {
  private readonly client: SupabaseClient<any, any, any>;
  private readonly llmCache: MemoryCache<number | null>;
  private readonly e2bCache: MemoryCache<number | null>;

  constructor(client: SupabaseClient<any, any, any>, options?: { cacheTtlSeconds?: number }) {
    this.client = client;
    const ttl = options?.cacheTtlSeconds ?? 3600; // Default 1 hour
    this.llmCache = new MemoryCache<number | null>(ttl);
    this.e2bCache = new MemoryCache<number | null>(ttl);
  }

  async getLLMCostEstimate(params: LLMCostEstimateParams): Promise<number | null> {
    const operationType = params.operationType ?? 'chat';
    const confidenceLevel = params.confidenceLevel ?? 'conservative';

    // Build cache key
    const cacheKey = `${params.provider}:${params.model}:${operationType}:${confidenceLevel}`;

    // Check cache
    const cached = this.llmCache.get(cacheKey);
    if (cached !== undefined) {
      logger.debug({ cacheKey, estimate: cached }, 'LLM cost estimate cache hit');
      return cached;
    }

    // Query database
    logger.debug({ params }, 'Querying LLM cost estimate from database');

    try {
      const { data, error } = await this.client
        .from('copilot_internal.llm_cost_estimates')
        .select('estimated_cost_usd')
        .eq('provider', params.provider.toLowerCase())
        .eq('model', params.model.toLowerCase())
        .eq('operation_type', operationType)
        .eq('confidence_level', confidenceLevel)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error({ error, params }, 'Failed to query LLM cost estimate');
        // Cache null to avoid repeated failed queries
        this.llmCache.set(cacheKey, null);
        return null;
      }

      const estimate = data?.estimated_cost_usd ? Number(data.estimated_cost_usd) : null;

      // Cache result (even if null)
      this.llmCache.set(cacheKey, estimate);

      if (estimate === null) {
        logger.warn(
          { params },
          'LLM cost estimate not found in database - quota check will be skipped'
        );
      } else {
        logger.debug({ params, estimate }, 'LLM cost estimate retrieved from database');
      }

      return estimate;
    } catch (error) {
      logger.error({ error, params }, 'Exception while querying LLM cost estimate');
      this.llmCache.set(cacheKey, null);
      return null;
    }
  }

  async getE2BCostEstimate(params: E2BCostEstimateParams): Promise<number | null> {
    const region = params.region ?? 'us-east-1';
    const operationType = params.operationType ?? 'standard_session';
    const confidenceLevel = params.confidenceLevel ?? 'conservative';

    // Build cache key
    const cacheKey = `${params.tier}:${region}:${operationType}:${confidenceLevel}`;

    // Check cache
    const cached = this.e2bCache.get(cacheKey);
    if (cached !== undefined) {
      logger.debug({ cacheKey, estimate: cached }, 'E2B cost estimate cache hit');
      return cached;
    }

    // Query database
    logger.debug({ params }, 'Querying E2B cost estimate from database');

    try {
      const { data, error } = await this.client
        .from('copilot_internal.e2b_cost_estimates')
        .select('estimated_cost_usd')
        .eq('tier', params.tier.toLowerCase())
        .eq('region', region.toLowerCase())
        .eq('operation_type', operationType)
        .eq('confidence_level', confidenceLevel)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error({ error, params }, 'Failed to query E2B cost estimate');
        // Cache null to avoid repeated failed queries
        this.e2bCache.set(cacheKey, null);
        return null;
      }

      const estimate = data?.estimated_cost_usd ? Number(data.estimated_cost_usd) : null;

      // Cache result (even if null)
      this.e2bCache.set(cacheKey, estimate);

      if (estimate === null) {
        logger.warn(
          { params },
          'E2B cost estimate not found in database - quota check will be skipped'
        );
      } else {
        logger.debug({ params, estimate }, 'E2B cost estimate retrieved from database');
      }

      return estimate;
    } catch (error) {
      logger.error({ error, params }, 'Exception while querying E2B cost estimate');
      this.e2bCache.set(cacheKey, null);
      return null;
    }
  }

  clearCache(): void {
    this.llmCache.clear();
    this.e2bCache.clear();
    logger.info('Cost estimate caches cleared');
  }
}

/**
 * Global service instance
 */
let globalCostEstimationService: CostEstimationService | null = null;

/**
 * Initialize the global cost estimation service
 */
export function initCostEstimationService(service: CostEstimationService): void {
  globalCostEstimationService = service;
  logger.info('Cost estimation service initialized');
}

/**
 * Get the global cost estimation service
 * @throws Error if service not initialized
 */
export function getCostEstimationService(): CostEstimationService {
  if (!globalCostEstimationService) {
    throw new Error(
      'Cost estimation service not initialized. Call initCostEstimationService() first.'
    );
  }
  return globalCostEstimationService;
}

/**
 * Get the global cost estimation service if initialized
 * @returns Service instance or null if not initialized
 */
export function getCostEstimationServiceIfInitialized(): CostEstimationService | null {
  return globalCostEstimationService;
}
