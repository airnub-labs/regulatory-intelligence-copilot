// apps/demo-web/src/lib/auth/tenantContext.ts
// Tenant context verification and extraction

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { Session } from 'next-auth';

const logger = createLogger('TenantContext');

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

interface TenantAccessResult {
  has_access: boolean;
  role: TenantContext['role'];
}

/**
 * Validates and extracts tenant context from session
 *
 * SECURITY: This function enforces tenant membership via RLS-protected query.
 * Users must be active members of the tenant they're trying to access.
 *
 * This is a critical security function that:
 * 1. Extracts user ID and currentTenantId from NextAuth session
 * 2. Verifies membership using RLS-protected database query
 * 3. Returns verified { userId, tenantId, role } context
 * 4. Throws error if user is not authenticated or not a member
 *
 * @param session - NextAuth session with user and currentTenantId
 * @returns TenantContext with verified userId, tenantId, and role
 * @throws {Error} If user is not authenticated or not a member of active tenant
 */
export async function getTenantContext(
  session: Session | null
): Promise<TenantContext> {
  const userId = session?.user?.id;
  const currentTenantId = session?.user?.currentTenantId;

  if (!userId) {
    logger.error('Missing user ID in session');
    throw new Error('Unauthorized: No user ID in session');
  }

  if (!currentTenantId) {
    logger.error({ userId }, 'Missing active tenant ID in session');
    throw new Error('No active tenant selected - please select a workspace');
  }

  // Verify membership using RLS-protected query
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error('Supabase configuration missing');
    throw new Error('Supabase configuration missing');
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  // Call verify_tenant_access function
  // This function is RLS-protected and will only return data if user has access
  const { data: access, error } = await supabase
    .rpc('verify_tenant_access', {
      p_user_id: userId,
      p_tenant_id: currentTenantId,
    })
    .single<TenantAccessResult>();

  if (error || !access?.has_access) {
    logger.error(
      { userId, currentTenantId, error },
      'Tenant access verification failed'
    );
    throw new Error('Access denied: Not a member of this workspace');
  }

  logger.debug(
    { userId, tenantId: currentTenantId, role: access.role },
    'Tenant context verified'
  );

  return {
    userId,
    tenantId: currentTenantId,
    role: access.role,
  };
}
