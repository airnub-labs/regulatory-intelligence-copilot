import 'server-only';

import {
  createDefaultLlmRouter,
  createPolicyStore,
  type LlmPolicyStore,
} from '@reg-copilot/reg-intel-llm';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createInfrastructureServiceClient } from '@/lib/supabase/infrastructureServiceClient';
import { createKeyValueClient, describeRedisBackendSelection, resolveRedisBackend } from '@reg-copilot/reg-intel-cache';
import { env } from '@/env';

const logger = createLogger('LlmRouterWiring');

/**
 * Individual flag to enable/disable LLM policy caching specifically.
 * Set ENABLE_LLM_POLICY_CACHE=false to disable this cache.
 * Defaults to true.
 */
const ENABLE_LLM_POLICY_CACHE = process.env.ENABLE_LLM_POLICY_CACHE !== 'false';

// ============================================================================
// Supabase Setup
// ============================================================================

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseInternalClient = createInfrastructureServiceClient('LlmPolicyStore', {
  db: { schema: 'copilot_core' },
});

// ============================================================================
// Redis Setup
// ============================================================================

const cacheBackend = ENABLE_LLM_POLICY_CACHE ? resolveRedisBackend('cache') : null;
const redisClient = cacheBackend ? createKeyValueClient(cacheBackend) : null;

// ============================================================================
// Policy Store Configuration
// ============================================================================

let policyStoreInstance: LlmPolicyStore | null = null;

/**
 * Get or create the policy store instance.
 * Lazily initialized to handle Next.js worker processes.
 */
function getPolicyStore(): LlmPolicyStore {
  if (policyStoreInstance) {
    return policyStoreInstance;
  }

  try {
    // Type assertion to work around "Type instantiation is excessively deep" error
    // NOTE: Do NOT pass schema parameter - supabaseInternalClient is already configured with schema: 'copilot_core'
    policyStoreInstance = createPolicyStore({
      supabase: supabaseInternalClient as unknown as Parameters<typeof createPolicyStore>[0]['supabase'],
      redis: redisClient ?? undefined,
      cacheTtlSeconds: 300, // 5 minutes
    } as Parameters<typeof createPolicyStore>[0]);

    // Log which store implementation is being used
    if (redisClient) {
      logger.info(
        {
          supabaseUrl,
          hasRedis: true,
          cacheTtl: 300,
          llmPolicyCacheEnabled: ENABLE_LLM_POLICY_CACHE,
          backend: describeRedisBackendSelection(cacheBackend)
        },
        'Using CachingPolicyStore (Supabase + Redis)'
      );
    } else {
      const reason = !ENABLE_LLM_POLICY_CACHE
        ? 'LLM policy cache disabled via ENABLE_LLM_POLICY_CACHE=false'
        : 'Redis credentials not configured';
      logger.info({ supabaseUrl, hasRedis: false, reason }, 'Using SupabasePolicyStore (no caching)');
    }

    return policyStoreInstance;
  } catch (error) {
    logger.error({ err: error }, 'Failed to create policy store');
    throw error;
  }
}

// Export for backward compatibility
export const policyStore: LlmPolicyStore = getPolicyStore();

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
    const store = getPolicyStore();
    return createDefaultLlmRouter({ policyStore: store });
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
