import CredentialsProvider from 'next-auth/providers/credentials'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Define extended types for our auth callbacks
interface ExtendedJWT {
  sub?: string
  email?: string | null
  name?: string | null
  tenantId?: string
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
  console.warn('Supabase URL or anon key missing. Authentication will not work until configured.')
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt' as const,
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
    jwt({ token, user }: { token: unknown; user?: unknown }) {
      const extendedToken = token as ExtendedJWT
      const extendedUser = user as ExtendedUser | undefined

      if (extendedUser) {
        extendedToken.sub = extendedUser.id
        extendedToken.email = extendedUser.email ?? undefined
        extendedToken.name = extendedUser.name ?? undefined
        extendedToken.tenantId = extendedUser.tenantId ?? fallbackTenantId
      }
      return token
    },
    session({ session, token }: { session: unknown; token: unknown }) {
      const extendedSession = session as ExtendedSession
      const extendedToken = token as ExtendedJWT

      if (extendedSession.user) {
        extendedSession.user.id = typeof extendedToken.sub === 'string' ? extendedToken.sub : ''
        extendedSession.user.email = typeof extendedToken.email === 'string' ? extendedToken.email : extendedSession.user.email
        extendedSession.user.name = typeof extendedToken.name === 'string' ? extendedToken.name : extendedSession.user.name
        extendedSession.user.tenantId = extendedToken.tenantId ?? fallbackTenantId
      }
      return session
    },
  },
}
