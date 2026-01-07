/**
 * Middleware Service Client
 *
 * SECURITY: This client is for Next.js middleware/proxy operations ONLY.
 * - Session validation in middleware context
 * - JWT/database consistency checking
 * - Request routing decisions
 *
 * This client is used in middleware where the standard cookie() helper
 * is not available in the same way as API routes. It performs read-only
 * validation operations and does NOT access tenant-scoped data tables directly.
 *
 * All operations using this client should be:
 * - Read-only validation queries
 * - RPC function calls for session/tenant verification
 * - Logged for audit purposes
 *
 * DO NOT use this for:
 * - User-initiated requests (use createTenantScopedServiceClient)
 * - Infrastructure initialization (use createInfrastructureServiceClient)
 * - Cross-tenant admin operations (use createUnrestrictedServiceClient)
 *
 * @see /docs/architecture/multi-tenant/README.md
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('MiddlewareServiceClient');

/**
 * Creates a service role client for middleware validation operations.
 *
 * This function is explicitly allowed by the tenant-security ESLint rules
 * because it's used only in Next.js middleware for session validation and
 * consistency checking, where standard cookie helpers are not available.
 *
 * @param operation - Description of the middleware operation (e.g., "session-validation", "consistency-check")
 * @returns SupabaseClient with service role permissions
 * @throws Error if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set
 *
 * @example
 * ```typescript
 * // In middleware/proxy
 * const supabase = createMiddlewareServiceClient('session-validation');
 * const { data } = await supabase.rpc('verify_session_consistency', { ... });
 * ```
 */
export function createMiddlewareServiceClient(
  operation: string
): ReturnType<typeof createClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      '[MiddlewareServiceClient] NEXT_PUBLIC_SUPABASE_URL is not set'
    );
  }

  if (!supabaseServiceKey) {
    throw new Error(
      '[MiddlewareServiceClient] SUPABASE_SERVICE_ROLE_KEY is not set'
    );
  }

  logger.debug(
    { operation, timestamp: new Date().toISOString() },
    `Creating middleware service client for ${operation}`
  );

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
