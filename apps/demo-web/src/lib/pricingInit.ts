/**
 * Pricing Service Initialization
 *
 * Sets up the dynamic pricing service with Supabase storage.
 * Supabase is required in both local development and production environments.
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
 * For local development, ensure you have a local Supabase instance running.
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for server-side operations
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

    // Initialize pricing service with Supabase backend
    const pricingService = new SupabasePricingService(client);
    initPricingService(pricingService);

    logger.info(
      {
        supabaseUrl: credentials.supabaseUrl,
        backend: 'supabase',
        table: 'copilot_internal.model_pricing',
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
