/**
 * Session validation utilities
 *
 * SECURITY: Validates that user sessions correspond to active users in the database.
 * This prevents deleted users from accessing the system with stale JWT tokens.
 *
 * PERFORMANCE: Uses in-memory LRU cache to reduce database queries.
 * Cache TTL is 2 minutes, balancing security (deleted users locked out quickly)
 * with performance (reduced database load).
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createLogger } from '@reg-copilot/reg-intel-observability'
import { validationCache } from './validationCache'

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
 * PERFORMANCE: Results are cached for 2 minutes to reduce database queries.
 * With 1000 concurrent users, this reduces queries from ~200/sec to ~8/sec.
 *
 * @param userId - The user ID from the JWT token
 * @returns ValidateUserResult indicating if user is valid and their current data
 */
export async function validateUserExists(userId: string): Promise<ValidateUserResult> {
  // Check cache first
  const cached = validationCache.get(userId)
  if (cached !== null) {
    logger.debug({ userId, isValid: cached.isValid }, 'Using cached validation result')
    return {
      isValid: cached.isValid,
      user: cached.isValid
        ? {
            id: userId,
            tenantId: cached.tenantId,
          }
        : undefined,
      error: cached.isValid ? undefined : 'User not found (cached)',
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error('Supabase URL or anon key missing - cannot validate user')
    return {
      isValid: false,
      error: 'Authentication service unavailable',
    }
  }

  logger.debug({ userId }, 'Cache miss - validating user against database')

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
        // Cache the failure
        validationCache.set(userId, false)
        return {
          isValid: false,
          error: 'User not found',
        }
      }

      // Cache the success
      validationCache.set(userId, true, data.tenant_id)

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
      // Cache the failure
      validationCache.set(userId, false)
      return {
        isValid: false,
        error: 'User not found',
      }
    }

    if (!data.user) {
      logger.warn({ userId }, 'User not found in database')
      // Cache the failure
      validationCache.set(userId, false)
      return {
        isValid: false,
        error: 'User not found',
      }
    }

    // Check if user is banned or deleted
    if (data.user.banned_until || data.user.deleted_at) {
      logger.warn({ userId, banned: !!data.user.banned_until, deleted: !!data.user.deleted_at }, 'User is banned or deleted')
      // Cache the failure (user is banned/deleted)
      validationCache.set(userId, false)
      return {
        isValid: false,
        error: 'User account is no longer active',
      }
    }

    // User is valid - cache the success
    const tenantId = (data.user.user_metadata?.tenant_id ?? data.user.app_metadata?.tenant_id) as string | undefined
    validationCache.set(userId, true, tenantId)

    return {
      isValid: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        tenantId,
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
