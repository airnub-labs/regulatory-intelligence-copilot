import 'server-only';

import {
  createDefaultLlmRouter,
  createPolicyStore,
  type LlmPolicyStore,
} from '@reg-copilot/reg-intel-llm';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

const logger = createLogger('LlmRouterWiring');

// ============================================================================
// Global Cache Control
// ============================================================================

/**
 * Global flag to enable/disable all Redis caching.
 * Set ENABLE_REDIS_CACHING=false to disable all caching (e.g., during debugging).
 * Defaults to true if Redis credentials are available.
 */
const ENABLE_REDIS_CACHING = process.env.ENABLE_REDIS_CACHING !== 'false';

// ============================================================================
// Supabase Setup
// ============================================================================

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const supabaseInternalClient =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'copilot_internal' },
      })
    : null;

// ============================================================================
// Redis Setup
// ============================================================================

const upstashRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redisClient =
  ENABLE_REDIS_CACHING && upstashRedisUrl && upstashRedisToken
    ? new Redis({
        url: upstashRedisUrl,
        token: upstashRedisToken,
      })
    : null;

// ============================================================================
// Policy Store Configuration
// ============================================================================

export const policyStore: LlmPolicyStore = createPolicyStore({
  supabase: supabaseInternalClient ?? undefined,
  redis: redisClient ?? undefined,
  cacheTtlSeconds: 300, // 5 minutes
  schema: 'copilot_internal',
});

// Log which store implementation is being used
if (supabaseInternalClient) {
  if (redisClient) {
    logger.info(
      { supabaseUrl, hasRedis: true, cacheTtl: 300, globalCachingEnabled: ENABLE_REDIS_CACHING },
      'Using CachingPolicyStore (Supabase + Redis)'
    );
  } else {
    const reason = !ENABLE_REDIS_CACHING
      ? 'global caching disabled via ENABLE_REDIS_CACHING=false'
      : 'Redis credentials not configured';
    logger.info({ supabaseUrl, hasRedis: false, reason }, 'Using SupabasePolicyStore (no caching)');
  }
} else {
  logger.warn(
    'No Supabase credentials found; using InMemoryPolicyStore (not suitable for production)'
  );
}

// ============================================================================
// LLM Router
// ============================================================================

/**
 * Create a default LLM router with the configured policy store.
 *
 * This is a lazy factory function to avoid errors during module initialization
 * if LLM provider API keys are not configured.
 */
export function createLlmRouter() {
  try {
    return createDefaultLlmRouter({ policyStore });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create LLM router');
    throw error;
  }
}

/**
 * Singleton LLM router instance.
 * Lazily initialized on first access.
 */
let routerInstance: ReturnType<typeof createDefaultLlmRouter> | null = null;

/**
 * Get the singleton LLM router instance.
 * Creates the instance on first access.
 */
export function getLlmRouter() {
  if (!routerInstance) {
    routerInstance = createLlmRouter();
  }
  return routerInstance;
}

/**
 * Check if LLM router is available (i.e., at least one provider is configured)
 */
export function isLlmRouterAvailable(): boolean {
  try {
    getLlmRouter();
    return true;
  } catch {
    return false;
  }
}
