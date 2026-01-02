import 'server-only';

import {
  createDefaultLlmRouter,
  createPolicyStore,
} from '@reg-copilot/reg-intel-llm';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createClient } from '@supabase/supabase-js';
import { createKeyValueClient, resolveRedisBackend, summarizeBackend } from '@reg-copilot/reg-intel-cache';

const logger = createLogger('LlmRouterWiring');

// ============================================================================
// Global Cache Control
// ============================================================================

/**
 * Global kill switch to disable ALL Redis caching across the application.
 * Set ENABLE_REDIS_CACHING=false to disable all caching (e.g., during debugging/disaster recovery).
 * Defaults to true.
 *
 * Individual cache flags must ALSO be enabled for caching to work.
 * Both conditions must be true: ENABLE_REDIS_CACHING=true AND individual flag enabled.
 */
const ENABLE_REDIS_CACHING = process.env.ENABLE_REDIS_CACHING !== 'false';

/**
 * Individual flag to enable/disable LLM policy caching specifically.
 * Set ENABLE_LLM_POLICY_CACHE=false to disable this cache.
 * Defaults to true.
 *
 * Requires ENABLE_REDIS_CACHING=true to have any effect.
 */
const ENABLE_LLM_POLICY_CACHE = process.env.ENABLE_LLM_POLICY_CACHE !== 'false';

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

const cacheBackend = ENABLE_REDIS_CACHING && ENABLE_LLM_POLICY_CACHE ? resolveRedisBackend('cache') : null;
const redisClient = ENABLE_REDIS_CACHING && ENABLE_LLM_POLICY_CACHE
  ? createKeyValueClient(cacheBackend)
  : null;

// ============================================================================
// Policy Store Configuration
// ============================================================================

// Type assertion to work around "Type instantiation is excessively deep" error
export const policyStore = createPolicyStore({
  supabase: supabaseInternalClient ?? undefined,
  redis: redisClient ?? undefined,
  cacheTtlSeconds: 300, // 5 minutes
  schema: 'copilot_internal',
} as Parameters<typeof createPolicyStore>[0]);

// Log which store implementation is being used
if (supabaseInternalClient) {
  if (redisClient) {
    logger.info(
      {
        supabaseUrl,
        hasRedis: true,
        cacheTtl: 300,
        globalCachingEnabled: ENABLE_REDIS_CACHING,
        llmPolicyCacheEnabled: ENABLE_LLM_POLICY_CACHE,
        backend: summarizeBackend(cacheBackend)
      },
      'Using CachingPolicyStore (Supabase + Redis)'
    );
  } else {
    const reason = !ENABLE_REDIS_CACHING
      ? 'global caching disabled via ENABLE_REDIS_CACHING=false'
      : !ENABLE_LLM_POLICY_CACHE
      ? 'LLM policy cache disabled via ENABLE_LLM_POLICY_CACHE=false'
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
