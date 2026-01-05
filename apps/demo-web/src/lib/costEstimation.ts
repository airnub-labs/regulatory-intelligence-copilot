/**
 * Cost Estimation Service Initialization
 *
 * Initializes the cost estimation service for database-backed cost estimates
 * used in quota checks BEFORE operations (E2B sandbox creation, LLM requests).
 *
 * IMPORTANT: This replaces all hardcoded cost estimates with database lookups.
 * Uses Redis/Upstash caching when available for optimal performance.
 */

import { createClient } from '@supabase/supabase-js';
import {
  SupabaseCostEstimationService,
  initCostEstimationService,
  createLogger,
  type CostEstimationService,
} from '@reg-copilot/reg-intel-observability';
import {
  createKeyValueClient,
  resolveRedisBackend,
  createRedisCacheBackend,
  createTransparentCache,
  type TransparentCache,
} from '@reg-copilot/reg-intel-cache';

const logger = createLogger('CostEstimation');

let costEstimationService: SupabaseCostEstimationService | null = null;

/**
 * Initialize cost estimation service with Supabase backend and Redis caching
 *
 * This should be called at application startup to enable database-backed
 * cost estimates for quota checks with Redis caching for performance.
 */
export const initializeCostEstimation = (): void => {
  try {
    if (costEstimationService) {
      logger.info('Cost estimation already initialized');
      return;
    }

    // Get Supabase credentials
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      logger.warn(
        'Supabase credentials not available, skipping cost estimation initialization. ' +
        'Quota checks will use fallback ENUM constants. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
      return;
    }

    // Create Supabase client
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'copilot_internal',
      },
    });

    // Set up Redis/Upstash caching for cost estimates
    const redisBackend = resolveRedisBackend('cache');
    const redisClient = createKeyValueClient(redisBackend);

    let llmCache: TransparentCache<number> | undefined;
    let e2bCache: TransparentCache<number> | undefined;

    if (redisClient && redisBackend) {
      // Redis is available - create caches with adapter
      const cacheBackend = createRedisCacheBackend(redisClient);

      llmCache = createTransparentCache(
        cacheBackend,
        redisBackend.backend,
        { defaultTtlSeconds: 3600 } // 1 hour TTL
      );

      e2bCache = createTransparentCache(
        cacheBackend,
        redisBackend.backend,
        { defaultTtlSeconds: 3600 } // 1 hour TTL
      );

      logger.info(
        { backend: redisBackend.backend, ttl: 3600 },
        'Cost estimation service will use Redis/Upstash caching'
      );
    } else {
      logger.warn(
        'Redis/Upstash not configured - cost estimation will query database on every request. ' +
        'Configure REDIS_URL or UPSTASH_REDIS_REST_URL for optimal performance.'
      );
    }

    // Create and initialize service
    costEstimationService = new SupabaseCostEstimationService(client, {
      cacheTtlSeconds: 3600, // 1 hour cache TTL
      llmCache,
      e2bCache,
    });

    initCostEstimationService(costEstimationService);

    logger.info('Cost estimation service initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize cost estimation service');
  }
};

/**
 * Get the cost estimation service instance
 * @returns Service instance or null if not initialized
 */
export const getCostEstimationService = (): CostEstimationService | null => {
  return costEstimationService;
};

// Auto-initialize on module load
// This ensures the service is available for quota checks
initializeCostEstimation();
