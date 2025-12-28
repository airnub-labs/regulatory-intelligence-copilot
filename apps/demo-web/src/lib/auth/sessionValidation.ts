/**
 * Session validation utilities
 *
 * SECURITY: Validates that user sessions correspond to active users in the database.
 * This prevents deleted users from accessing the system with stale JWT tokens.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createLogger } from '@reg-copilot/reg-intel-observability'

const logger = createLogger('SessionValidation')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

interface ValidateUserResult {
  isValid: boolean
  user?: {
    id: string
    email?: string | null
    tenantId?: string
  }
  error?: string
}

/**
 * Validates that a user with the given ID still exists in Supabase Auth.
 *
 * CRITICAL: This function MUST be called on every session validation to ensure
 * deleted users cannot access the system with stale JWT tokens.
 *
 * @param userId - The user ID from the JWT token
 * @returns ValidateUserResult indicating if user is valid and their current data
 */
export async function validateUserExists(userId: string): Promise<ValidateUserResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error('Supabase URL or anon key missing - cannot validate user')
    return {
      isValid: false,
      error: 'Authentication service unavailable',
    }
  }

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    })

    // Use Supabase Admin API to check if user exists
    // Note: We use the service role key for this check to bypass RLS
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
      // Fallback: Try to get user from auth.users table via RPC or direct query
      // This requires a database function or RLS policy that allows checking user existence
      logger.warn('Service role key not configured - using limited validation')

      // Check if user exists by trying to query their profile
      // This assumes you have a public.profiles table or similar
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, tenant_id')
        .eq('id', userId)
        .single()

      if (error) {
        logger.warn({ userId, error: error.message }, 'User validation failed - user may not exist')
        return {
          isValid: false,
          error: 'User not found',
        }
      }

      return {
        isValid: true,
        user: {
          id: data.id,
          email: data.email,
          tenantId: data.tenant_id,
        },
      }
    }

    // Use service role client for admin operations
    const adminSupabase = createServerClient(supabaseUrl, serviceRoleKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    })

    // Check if user exists in auth.users
    const { data, error } = await adminSupabase.auth.admin.getUserById(userId)

    if (error) {
      logger.warn({ userId, error: error.message }, 'User validation failed')
      return {
        isValid: false,
        error: 'User not found',
      }
    }

    if (!data.user) {
      logger.warn({ userId }, 'User not found in database')
      return {
        isValid: false,
        error: 'User not found',
      }
    }

    // Check if user is banned or deleted
    if (data.user.banned_until || data.user.deleted_at) {
      logger.warn({ userId, banned: !!data.user.banned_until, deleted: !!data.user.deleted_at }, 'User is banned or deleted')
      return {
        isValid: false,
        error: 'User account is no longer active',
      }
    }

    // User is valid
    return {
      isValid: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        tenantId: (data.user.user_metadata?.tenant_id ?? data.user.app_metadata?.tenant_id) as string | undefined,
      },
    }
  } catch (error) {
    logger.error({ userId, error }, 'Unexpected error validating user')
    return {
      isValid: false,
      error: 'Validation failed',
    }
  }
}
