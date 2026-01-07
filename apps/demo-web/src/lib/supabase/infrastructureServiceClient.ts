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

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('InfrastructureServiceClient');

/** Options for infrastructure service client creation */
interface InfrastructureServiceClientOptions {
  db?: { schema?: string };
  global?: { fetch?: typeof fetch };
  auth?: { persistSession?: boolean; autoRefreshToken?: boolean };
}

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
  options?: InfrastructureServiceClientOptions
): ReturnType<typeof createClient> {
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

  // Merge options with defaults - using explicit construction to satisfy TypeScript
  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      ...options?.auth,
    },
    db: options?.db,
    global: options?.global,
  };

  // Use type assertion as Supabase's generics are complex with custom schemas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(supabaseUrl, supabaseServiceKey, clientOptions as any);
}
