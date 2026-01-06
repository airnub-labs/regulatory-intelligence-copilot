/**
 * Session validation utilities - Industry Standard Transparent Failover
 *
 * SECURITY: Validates that user sessions correspond to active users in the database.
 * This prevents deleted users from accessing the system with stale JWT tokens.
 *
 * PERFORMANCE: Uses distributed cache (Redis) to reduce database queries.
 * Cache TTL is 5 minutes, balancing security (deleted users locked out quickly)
 * with performance (reduced database load).
 *
 * MULTI-INSTANCE: Uses Redis for distributed caching across multiple app instances.
 * WITHOUT REDIS: PassThroughCache (transparent fail-through) - cache.get() returns null,
 *                cache.set() is no-op. Application code works identically.
 *
 * CRITICAL: Cache NEVER returns null - follows industry-standard transparent failover pattern.
 *
 * METRICS: Tracks authentication patterns, cache effectiveness, and cost optimization.
 *
 * Reference: CachingConversationStore (packages/reg-intel-conversations/src/conversationStores.ts:1013)
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createLogger } from '@reg-copilot/reg-intel-observability'
import { getValidationCache } from './distributedValidationCache'
import { authMetrics } from './authMetrics'

const logger = createLogger('SessionValidation')

const validationCache = getValidationCache()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

interface ValidateUserResult {
  isValid: boolean
  user?: {
    id: string
    email?: string | null
    currentTenantId?: string
  }
  error?: string
}

/**
 * Validates that a user with the given ID still exists in Supabase Auth.
 *
 * CRITICAL: This function MUST be called on every session validation to ensure
 * deleted users cannot access the system with stale JWT tokens.
 *
 * PERFORMANCE: Results are cached for 5 minutes to reduce database queries.
 * Uses distributed cache (Redis) for multi-instance deployments.
 *
 * METRICS: Tracks cache hit/miss rates, validation times, and database query patterns.
 *
 * @param userId - The user ID from the JWT token
 * @returns ValidateUserResult indicating if user is valid and their current data
 */
export async function validateUserExists(userId: string): Promise<ValidateUserResult> {
  // ✅ No null check - cache ALWAYS exists (transparent failover)
  const cached = await validationCache.get(userId)
  if (cached !== null) {
    authMetrics.recordCacheHit(userId)
    logger.debug({ userId, isValid: cached.isValid }, 'Using cached validation result')
    return {
      isValid: cached.isValid,
      user: cached.isValid
        ? {
            id: userId,
            currentTenantId: cached.tenantId,
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

  // Start timing for metrics
  const validationStartTime = Date.now()

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

      const validationDuration = Date.now() - validationStartTime

      if (error) {
        logger.warn({ userId, error: error.message }, 'User validation failed - user may not exist')
        // ✅ No null check - cache.set() is no-op if Redis down
        await validationCache.set(userId, false)
        authMetrics.recordCacheMiss(userId, validationDuration, false)
        return {
          isValid: false,
          error: 'User not found',
        }
      }

      // ✅ No null check - cache.set() is no-op if Redis down
      await validationCache.set(userId, true, data.tenant_id)
      authMetrics.recordCacheMiss(userId, validationDuration, true)

      return {
        isValid: true,
        user: {
          id: data.id,
          email: data.email,
          currentTenantId: data.tenant_id,
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

    const validationDuration = Date.now() - validationStartTime

    if (error) {
      logger.warn({ userId, error: error.message }, 'User validation failed')
      // ✅ No null check - cache.set() is no-op if Redis down
      await validationCache.set(userId, false)
      authMetrics.recordCacheMiss(userId, validationDuration, false)
      return {
        isValid: false,
        error: 'User not found',
      }
    }

    if (!data.user) {
      logger.warn({ userId }, 'User not found in database')
      // ✅ No null check - cache.set() is no-op if Redis down
      await validationCache.set(userId, false)
      authMetrics.recordCacheMiss(userId, validationDuration, false)
      return {
        isValid: false,
        error: 'User not found',
      }
    }

    // Check if user is banned or deleted
    // Note: These fields may be in user_metadata if they exist
    const userMetadata = data.user.user_metadata as { banned_until?: string; deleted_at?: string } | undefined
    const bannedUntil = userMetadata?.banned_until
    const deletedAt = userMetadata?.deleted_at

    if (bannedUntil || deletedAt) {
      logger.warn({ userId, banned: !!bannedUntil, deleted: !!deletedAt }, 'User is banned or deleted')
      // ✅ No null check - cache.set() is no-op if Redis down
      await validationCache.set(userId, false)
      authMetrics.recordCacheMiss(userId, validationDuration, false)

      // Track specific metrics for deleted/banned users
      if (deletedAt) {
        authMetrics.recordDeletedUser(userId)
      }
      if (bannedUntil) {
        authMetrics.recordBannedUser(userId)
      }

      return {
        isValid: false,
        error: 'User account is no longer active',
      }
    }

    // User is valid - get current tenant ID from database
    // ✅ No null check - cache.set() is no-op if Redis down
    const { data: currentTenantId } = await adminSupabase
      .rpc('get_current_tenant_id', { p_user_id: userId })
      .single()

    await validationCache.set(userId, true, currentTenantId)
    authMetrics.recordCacheMiss(userId, validationDuration, true)

    return {
      isValid: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        currentTenantId,
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

export async function getCachedValidationResult(userId: string): Promise<ValidateUserResult | null> {
  // ✅ No null check - cache ALWAYS exists (transparent failover)
  const cached = await validationCache.get(userId)
  if (cached === null) {
    return null
  }

  authMetrics.recordCacheHit(userId)
  logger.debug({ userId, isValid: cached.isValid }, 'Using cached validation result')

  return {
    isValid: cached.isValid,
    user: cached.isValid
      ? {
          id: userId,
          currentTenantId: cached.tenantId,
        }
      : undefined,
    error: cached.isValid ? undefined : 'User not found (cached)',
  }
}
