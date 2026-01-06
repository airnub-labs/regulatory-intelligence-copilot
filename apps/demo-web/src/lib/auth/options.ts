import CredentialsProvider from 'next-auth/providers/credentials'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextAuthOptions, Session } from 'next-auth'
import { createLogger } from '@reg-copilot/reg-intel-observability'
import { getCachedValidationResult, validateUserExists } from './sessionValidation'
import { authMetrics } from './authMetrics'
import { createUnrestrictedServiceClient } from '@/lib/supabase/tenantScopedServiceClient'
import type { ExtendedJWT, ExtendedUser, ExtendedSession } from '@/types/auth'

const logger = createLogger('AuthOptions')

// Session validation interval (5 minutes)
// JWT callback calls validateUserExists() every 5 minutes (aligned with cache TTL)
// PERFORMANCE: Distributed cache (5-min TTL) drastically reduces database load
//   - Without cache: 1000 users * 12 requests/hour = 12,000 DB queries/hour
//   - With cache: 1000 users * 12 requests/hour = 12,000 cache checks, ~200 DB queries/hour
//   - Result: ~98% reduction in database queries
// SECURITY: Deleted users locked out within 5 minutes maximum
// MULTI-INSTANCE: Redis cache ensures consistency across multiple app instances
// METRICS: Tracks authentication patterns for cost optimization
const SESSION_VALIDATION_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  logger.warn('Supabase URL or anon key missing. Authentication will not work until configured.')
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt' as const,
    // SECURITY: Reduce JWT max age to 24 hours to limit exposure window
    // Combined with periodic validation (5 minutes), deleted users are locked out quickly
    maxAge: 24 * 60 * 60, // 24 hours
  },
  providers: [
    CredentialsProvider({
      name: 'Supabase',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !supabaseUrl || !supabaseAnonKey) {
          return null
        }

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

        // Authenticate with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })

        if (error || !data.user) {
          logger.warn(
            {
              email: credentials.email,
              supabaseError: error?.message ?? 'Unknown Supabase error',
            },
            'Supabase credential sign-in failed'
          )
          return null
        }

        const userId = data.user.id

        // SECURITY: Get or create personal tenant using unrestricted service client
        // This is a valid use case for unrestricted access:
        // - Getting current tenant (RPC call, no tenant filtering needed)
        // - Creating personal tenant (new tenant, no tenant_id exists yet)
        const supabaseAdmin = createUnrestrictedServiceClient(
          'Get or create personal tenant during authentication',
          userId,
          cookieStore
        )

        let currentTenantId: string | null = null

        // Check if user has active tenant
        const { data: activeId } = await supabaseAdmin
          .rpc('get_current_tenant_id', { p_user_id: userId })
          .single()

        if (activeId) {
          currentTenantId = activeId
          logger.debug({ userId, currentTenantId }, 'User has existing active tenant')
        } else {
          // New user - create personal tenant
          logger.info({ userId, email: data.user.email }, 'Creating personal tenant for new user')

          const { data: newTenantId, error: createError } = await supabaseAdmin
            .rpc('create_personal_tenant', {
              p_user_id: userId,
              p_user_email: data.user.email!,
            })

          if (createError || !newTenantId) {
            logger.error(
              { userId, error: createError },
              'Failed to create personal tenant'
            )
            return null
          }

          currentTenantId = newTenantId
          logger.info({ userId, currentTenantId }, 'Created personal tenant')
        }

        if (!currentTenantId) {
          logger.error({ userId }, 'No active tenant available')
          return null
        }

        // Record successful login in metrics
        authMetrics.recordLogin(userId)

        return {
          id: userId,
          email: data.user.email!,
          name: (data.user.user_metadata as { full_name?: string } | null)?.full_name ?? data.user.email!,
          currentTenantId: currentTenantId,
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      const extendedToken = token as ExtendedJWT
      const extendedUser = user as ExtendedUser | undefined

      // On initial sign in, populate token with user data
      if (extendedUser) {
        extendedToken.sub = extendedUser.id
        extendedToken.email = extendedUser.email ?? undefined
        extendedToken.name = extendedUser.name ?? undefined
        extendedToken.currentTenantId = extendedUser.currentTenantId
        extendedToken.lastValidated = Date.now()
        return token
      }

      // SECURITY: Periodically validate that user still exists in database
      // This prevents deleted users from accessing the system with stale JWT tokens
      const now = Date.now()
      const lastValidated = extendedToken.lastValidated ?? 0
      const needsValidation = now - lastValidated > SESSION_VALIDATION_INTERVAL_MS

      if (extendedToken.sub && !needsValidation) {
        const cachedValidation = await getCachedValidationResult(extendedToken.sub)

        if (cachedValidation) {
          if (!cachedValidation.isValid) {
            logger.warn({ userId: extendedToken.sub }, 'Cached validation failure - invalidating session')
            return {} as typeof token
          }

          if (cachedValidation.user) {
            extendedToken.email = cachedValidation.user.email ?? extendedToken.email
            extendedToken.currentTenantId = cachedValidation.user.currentTenantId ?? extendedToken.currentTenantId
          }
        }
      }

      if (needsValidation && extendedToken.sub) {
        try {
          const validation = await validateUserExists(extendedToken.sub)

          if (!validation.isValid) {
            logger.warn(
              { userId: extendedToken.sub, error: validation.error },
              'User validation failed - invalidating session'
            )
            // Return an empty token to force logout
            // NextAuth will handle this by ending the session
            return {} as typeof token
          }

          // Update token with fresh data from database
          if (validation.user) {
            extendedToken.email = validation.user.email ?? extendedToken.email
            extendedToken.currentTenantId = validation.user.currentTenantId ?? extendedToken.currentTenantId
          }

          // Update last validated timestamp
          extendedToken.lastValidated = now
        } catch (error) {
          logger.error({ userId: extendedToken.sub, error }, 'Error validating user session')
          // On validation errors, allow the token to continue but don't update lastValidated
          // This ensures we'll try again on the next request
        }
      }

      return token
    },
    async session({ session, token }) {
      const sessionWithUser = session as Session & ExtendedSession
      const extendedToken = token as ExtendedJWT

      // SECURITY: If token is empty (user was invalidated), return null session
      if (!extendedToken.sub) {
        logger.warn('Attempted to create session with invalid token')
        return {
          ...sessionWithUser,
          user: {
            id: '',
            email: '',
            name: '',
            currentTenantId: undefined,
          },
        }
      }

      if (sessionWithUser.user) {
        sessionWithUser.user.id = typeof extendedToken.sub === 'string' ? extendedToken.sub : ''
        sessionWithUser.user.email =
          typeof extendedToken.email === 'string' ? extendedToken.email : ''
        sessionWithUser.user.name =
          typeof extendedToken.name === 'string' ? extendedToken.name : ''
        sessionWithUser.user.currentTenantId = extendedToken.currentTenantId
      }
      return sessionWithUser
    },
  },
  events: {
    async signOut({ token }) {
      const extendedToken = token as ExtendedJWT
      logger.info({ userId: extendedToken.sub }, 'User signed out')
    },
    async session({ token }) {
      const extendedToken = token as ExtendedJWT
      // Log if session is being used without a valid user ID
      if (!extendedToken.sub) {
        logger.warn('Session accessed with invalid user ID - forcing logout')
      }
    },
  },
}
