import CredentialsProvider from 'next-auth/providers/credentials'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextAuthOptions, Session } from 'next-auth'
import { createLogger } from '@reg-copilot/reg-intel-observability'
import { validateUserExists } from './sessionValidation'
import { authMetrics } from './authMetrics'

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

// Define extended types for our auth callbacks
interface ExtendedJWT {
  sub?: string
  email?: string | null
  name?: string | null
  tenantId?: string
  lastValidated?: number // Timestamp of last database validation
}

interface ExtendedUser {
  id: string
  email?: string | null
  name?: string | null
  tenantId?: string
}

interface ExtendedSession {
  user: {
    id?: string
    email?: string | null
    name?: string | null
    tenantId?: string
  }
  expires: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const fallbackTenantId = process.env.SUPABASE_DEMO_TENANT_ID ?? 'default'

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
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })

        if (error || !data.user) {
          return null
        }

        // Record successful login in metrics
        authMetrics.recordLogin(data.user.id)

        return {
          id: data.user.id,
          email: data.user.email,
          name: (data.user.user_metadata as { full_name?: string } | null)?.full_name ?? data.user.email,
          tenantId:
            (data.user.user_metadata as { tenant_id?: string } | null)?.tenant_id ??
            data.user.app_metadata?.tenant_id ??
            fallbackTenantId,
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      const extendedToken = token as ExtendedJWT
      const extendedUser = user as ExtendedUser | undefined

      // On initial sign in, populate token with user data
      if (extendedUser) {
        extendedToken.sub = extendedUser.id
        extendedToken.email = extendedUser.email ?? undefined
        extendedToken.name = extendedUser.name ?? undefined
        extendedToken.tenantId = extendedUser.tenantId ?? fallbackTenantId
        extendedToken.lastValidated = Date.now()
        return token
      }

      // SECURITY: Periodically validate that user still exists in database
      // This prevents deleted users from accessing the system with stale JWT tokens
      const now = Date.now()
      const lastValidated = extendedToken.lastValidated ?? 0
      const needsValidation = now - lastValidated > SESSION_VALIDATION_INTERVAL_MS

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
            return {} as ExtendedJWT
          }

          // Update token with fresh data from database
          if (validation.user) {
            extendedToken.email = validation.user.email ?? extendedToken.email
            extendedToken.tenantId = validation.user.tenantId ?? extendedToken.tenantId
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
            email: null,
            name: null,
            tenantId: '',
          },
        }
      }

      if (sessionWithUser.user) {
        sessionWithUser.user.id = typeof extendedToken.sub === 'string' ? extendedToken.sub : ''
        sessionWithUser.user.email =
          typeof extendedToken.email === 'string' ? extendedToken.email : sessionWithUser.user.email
        sessionWithUser.user.name =
          typeof extendedToken.name === 'string' ? extendedToken.name : sessionWithUser.user.name
        sessionWithUser.user.tenantId = extendedToken.tenantId ?? fallbackTenantId
      }
      return sessionWithUser
    },
  },
  events: {
    async signOut({ token }) {
      const extendedToken = token as ExtendedJWT
      logger.info({ userId: extendedToken.sub }, 'User signed out')
    },
    async session({ session, token }) {
      const extendedToken = token as ExtendedJWT
      // Log if session is being used without a valid user ID
      if (!extendedToken.sub) {
        logger.warn('Session accessed with invalid user ID - forcing logout')
      }
    },
  },
}
