/**
 * Pricing Service Initialization
 *
 * Sets up the dynamic pricing service with Supabase storage and Redis/Upstash caching.
 * Supabase is required in both local development and production environments.
 * Redis/Upstash caching is optional but highly recommended for performance.
 *
 * Usage:
 * Import this module at app startup to initialize pricing:
 * ```typescript
 * import './lib/pricingInit';
 * ```
 */

import {
  initPricingService,
  SupabasePricingService,
  createLogger,
} from '@reg-copilot/reg-intel-observability';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createKeyValueClient,
  resolveRedisBackend,
  createTransparentCache,
  type TransparentCache,
} from '@reg-copilot/reg-intel-cache';

const logger = createLogger('PricingInit');

/**
 * Get Supabase credentials from environment
 *
 * Supabase is required in both local development and production.
 * For local development, use `supabase start` to run a local Supabase instance.
 *
 * @returns Credentials or null if not configured
 */
function getSupabaseCredentials(): { supabaseUrl: string; supabaseKey: string } | null {
  // Avoid initializing in browser
  if (typeof window !== 'undefined') {
    throw new Error('Pricing service must be initialized on the server');
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn(
      'Supabase credentials required for dynamic pricing. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
        'For local development, run `supabase start` to start a local Supabase instance.'
    );
    return null;
  }

  return { supabaseUrl, supabaseKey };
}

/**
 * Initialize pricing service
 *
 * Uses Supabase for dynamic pricing in both local development and production.
 * Uses Redis/Upstash for caching when available.
 * For local development, ensure you have a local Supabase instance running.
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for server-side operations
 * - REDIS_URL or UPSTASH_REDIS_REST_URL: Redis/Upstash for caching (optional)
 */
export const initializePricingService = (): void => {
  try {
    // Check if already initialized
    const { getPricingServiceIfInitialized } = require('@reg-copilot/reg-intel-observability');
    if (getPricingServiceIfInitialized()) {
      logger.info('Pricing service already initialized');
      return;
    }

    // Get credentials
    const credentials = getSupabaseCredentials();

    if (!credentials) {
      logger.warn('Skipping pricing service initialization due to missing Supabase credentials');
      return;
    }

    // Create Supabase client
    const client = createClient(credentials.supabaseUrl, credentials.supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'copilot_internal' },
    }) as unknown as SupabaseClient;

    // Set up Redis/Upstash caching for pricing data
    const redisBackend = resolveRedisBackend('cache');
    const redisClient = createKeyValueClient(redisBackend);

    let cache: TransparentCache<any> | undefined;

    if (redisClient && redisBackend) {
      // Redis is available - pass client directly to TransparentCache
      cache = createTransparentCache(
        redisClient,
        redisBackend.backend,
        { defaultTtlSeconds: 3600 } // 1 hour TTL
      );

      logger.info(
        { backend: redisBackend.backend, ttl: 3600 },
        'LLM pricing service will use Redis/Upstash caching'
      );
    } else {
      logger.warn(
        'Redis/Upstash not configured - pricing service will query database on every request. ' +
        'Configure REDIS_URL or UPSTASH_REDIS_REST_URL for optimal performance.'
      );
    }

    // Initialize pricing service with Supabase backend and optional Redis cache
    const pricingService = new SupabasePricingService(client, {
      cache,
      cacheTtlSeconds: 3600, // 1 hour TTL
    });
    initPricingService(pricingService);

    logger.info(
      {
        supabaseUrl: credentials.supabaseUrl,
        backend: 'supabase',
        table: 'copilot_internal.model_pricing',
        caching: cache ? 'enabled' : 'disabled',
      },
      'Dynamic pricing service initialized successfully with Supabase'
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to initialize pricing service'
    );
  }
};

/**
 * Get pricing service
 *
 * Returns the initialized pricing service, or null if not initialized.
 */
export const getPricing = () => {
  const { getPricingServiceIfInitialized } = require('@reg-copilot/reg-intel-observability');
  return getPricingServiceIfInitialized();
};
