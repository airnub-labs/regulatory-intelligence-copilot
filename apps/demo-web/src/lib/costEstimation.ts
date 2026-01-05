/**
 * Cost Estimation Service Initialization
 *
 * Initializes the cost estimation service for database-backed cost estimates
 * used in quota checks BEFORE operations (E2B sandbox creation, LLM requests).
 *
 * IMPORTANT: This replaces all hardcoded cost estimates with database lookups.
 */

import { createClient } from '@supabase/supabase-js';
import {
  SupabaseCostEstimationService,
  initCostEstimationService,
  createLogger,
  type CostEstimationService,
} from '@reg-copilot/reg-intel-observability';

const logger = createLogger('CostEstimation');

let costEstimationService: SupabaseCostEstimationService | null = null;

/**
 * Initialize cost estimation service with Supabase backend
 *
 * This should be called at application startup to enable database-backed
 * cost estimates for quota checks.
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
        'Quota checks will be skipped when cost estimates unavailable. ' +
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

    // Create and initialize service
    costEstimationService = new SupabaseCostEstimationService(client, {
      cacheTtlSeconds: 3600, // 1 hour cache TTL
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
