/**
 * Infrastructure Service Client
 *
 * SECURITY: This client is for infrastructure initialization ONLY.
 * - Conversation store initialization
 * - LLM policy store initialization
 * - Event hub setup
 *
 * This client is NOT tenant-scoped because it runs at module load time
 * before any user context exists. The stores themselves enforce tenant
 * isolation through RLS policies and query-time tenant filtering.
 *
 * DO NOT use this for:
 * - User-initiated requests (use createTenantScopedServiceClient)
 * - Cross-tenant admin operations (use createUnrestrictedServiceClient)
 *
 * @see /docs/architecture/multi-tenant/README.md
 */

import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/supabase';

/**
 * Creates a service role client for infrastructure component initialization.
 *
 * This function is explicitly allowed by the tenant-security ESLint rules
 * because it's used only for initializing shared infrastructure components
 * like conversation stores and policy stores that run at module load time.
 *
 * @param component - Name of the infrastructure component being initialized
 * @param options - Optional Supabase client configuration (merged with defaults)
 * @returns SupabaseClient with service role permissions
 * @throws Error if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set
 *
 * @example
 * ```typescript
 * // In conversation store initialization
 * const supabase = createInfrastructureServiceClient('ConversationStore', {
 *   db: { schema: 'copilot_internal' }
 * });
 * ```
 */
export function createInfrastructureServiceClient(
  component: string,
  options?: SupabaseClientOptions<'public'>
): ReturnType<typeof createClient<Database>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      '[InfrastructureServiceClient] NEXT_PUBLIC_SUPABASE_URL is not set'
    );
  }

  if (!supabaseServiceKey) {
    throw new Error(
      '[InfrastructureServiceClient] SUPABASE_SERVICE_ROLE_KEY is not set'
    );
  }

  logger.info(
    { component, timestamp: new Date().toISOString() },
    `Initializing infrastructure service client for ${component}`
  );

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...options,
  });
}
