import { createServerClient, type SupabaseClient } from '@supabase/ssr';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('TenantScopedServiceClient');

export interface TenantScopedClientOptions {
  tenantId: string;
  userId: string;
  operation: string; // For logging/auditing
}

/**
 * List of tables that are tenant-scoped (have tenant_id column).
 * Queries on these tables will automatically have tenant_id filter injected.
 */
const TENANT_SCOPED_TABLES = [
  'conversations',
  'conversation_messages',
  'conversation_paths',
  'llm_cost_records',
  'e2b_cost_records',
  'cost_quotas',
  'execution_contexts',
  'compaction_operations',
] as const;

/**
 * Creates a Supabase service client that automatically enforces tenant isolation.
 *
 * SECURITY: This wrapper ensures all queries on tenant-scoped tables include tenant_id filter.
 * Use this instead of raw service role client whenever possible.
 *
 * The wrapper automatically injects tenant_id filters for SELECT, UPDATE, and DELETE operations
 * on tenant-scoped tables. For INSERT operations, you must explicitly provide tenant_id in your data.
 *
 * @param options - Configuration with tenantId, userId, and operation description
 * @param cookies - Next.js cookies object for SSR
 * @returns Proxied Supabase client with tenant filtering
 * @throws Error if tenantId not provided
 *
 * @example
 * ```typescript
 * const supabase = createTenantScopedServiceClient(
 *   { tenantId: 'abc123', userId: 'user456', operation: 'fetch-conversations' },
 *   cookies()
 * );
 *
 * // tenant_id filter automatically injected
 * const { data } = await supabase
 *   .from('conversations')
 *   .select('*')
 *   .eq('user_id', userId);
 * ```
 */
export function createTenantScopedServiceClient(
  options: TenantScopedClientOptions,
  cookies: any
): SupabaseClient {
  const { tenantId, userId, operation } = options;

  if (!tenantId) {
    logger.error({ userId, operation }, 'Attempted to create service client without tenantId');
    throw new Error('tenantId required for tenant-scoped service client');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration missing');
  }

  const client = createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookieList) {
        cookieList.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });

  // Return a proxy that intercepts query building
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'from') {
        return (tableName: string) => {
          const queryBuilder = target.from(tableName);

          // Log service role access
          logger.debug({
            tenantId,
            userId,
            operation,
            table: tableName,
          }, 'Service role query initiated');

          // Check if this table is tenant-scoped
          const isTenantScoped = TENANT_SCOPED_TABLES.includes(tableName as any);

          if (!isTenantScoped) {
            // Not a tenant-scoped table, return query builder as-is
            return queryBuilder;
          }

          // Return wrapped query builder that auto-injects tenant filter
          return new Proxy(queryBuilder, {
            get(qbTarget, qbProp) {
              const original = qbTarget[qbProp as keyof typeof qbTarget];

              if (typeof original === 'function') {
                return function(...args: any[]) {
                  const result = original.apply(qbTarget, args);

                  // Auto-inject tenant_id filter for SELECT/UPDATE/DELETE
                  if (['select', 'update', 'delete'].includes(qbProp as string)) {
                    logger.debug({
                      tenantId,
                      table: tableName,
                      operation: qbProp,
                    }, 'Auto-injecting tenant_id filter');

                    // Add tenant_id filter
                    return result.eq('tenant_id', tenantId);
                  }

                  // For INSERT/UPSERT, we can't auto-inject - developer must explicitly provide
                  // The data validation will happen at the database level via check constraints
                  if (['insert', 'upsert'].includes(qbProp as string)) {
                    logger.debug({
                      tenantId,
                      table: tableName,
                      operation: qbProp,
                    }, 'INSERT/UPSERT operation - tenant_id must be in data');
                  }

                  return result;
                };
              }

              return original;
            },
          });
        };
      }

      // Pass through other methods (rpc, auth, etc.)
      return target[prop as keyof typeof target];
    },
  }) as SupabaseClient;
}

/**
 * Use this for operations that genuinely need cross-tenant access.
 *
 * ⚠️ WARNING: This bypasses tenant isolation. Use with extreme caution.
 * All usage must be documented and code-reviewed.
 *
 * Valid use cases:
 * - Creating new tenants (no tenant_id exists yet)
 * - Admin operations across all tenants
 * - Background jobs with explicit tenant iteration
 * - Auth operations (auth.users table has no tenant_id)
 *
 * Invalid use cases:
 * - Querying tenant-scoped data without proper filtering
 * - Convenience when you're too lazy to pass tenantId
 *
 * @param reason - Required documentation of why cross-tenant access is needed
 * @param userId - User performing the operation (for audit)
 * @param cookies - Next.js cookies object for SSR
 * @returns Unrestricted Supabase service client
 *
 * @example
 * ```typescript
 * // VALID: Creating new tenant
 * const supabase = createUnrestrictedServiceClient(
 *   'Creating new tenant - no tenant_id exists yet',
 *   userId,
 *   cookies()
 * );
 * await supabase.from('tenants').insert({ name, slug, owner_id: userId });
 *
 * // INVALID: Lazy querying
 * const supabase = createUnrestrictedServiceClient(
 *   'Need to query conversations', // ❌ Wrong!
 *   userId,
 *   cookies()
 * );
 * ```
 */
export function createUnrestrictedServiceClient(
  reason: string,
  userId: string,
  cookies: any
): SupabaseClient {
  logger.warn({
    userId,
    reason,
  }, 'Creating UNRESTRICTED service client - bypasses tenant isolation');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration missing');
  }

  return createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookieList) {
        cookieList.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Helper to create a tenant-scoped service client from Next.js request context.
 *
 * This is a convenience wrapper that extracts tenant context from session
 * and creates the scoped client.
 *
 * @param session - NextAuth session object
 * @param operation - Description of operation for logging
 * @param cookies - Next.js cookies object
 * @returns Tenant-scoped service client
 * @throws Error if session invalid or missing tenant context
 *
 * @example
 * ```typescript
 * import { getServerSession } from 'next-auth/next';
 * import { authOptions } from '@/lib/auth/options';
 *
 * const session = await getServerSession(authOptions);
 * const supabase = await createTenantScopedServiceClientFromSession(
 *   session,
 *   'fetch-user-conversations',
 *   cookies()
 * );
 * ```
 */
export async function createTenantScopedServiceClientFromSession(
  session: any,
  operation: string,
  cookies: any
): Promise<SupabaseClient> {
  if (!session?.user?.id) {
    throw new Error('Valid session required');
  }

  const tenantId = session.user.currentTenantId;
  if (!tenantId) {
    throw new Error('No active tenant in session');
  }

  return createTenantScopedServiceClient(
    {
      tenantId,
      userId: session.user.id,
      operation,
    },
    cookies
  );
}
