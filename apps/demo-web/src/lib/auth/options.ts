import CredentialsProvider from 'next-auth/providers/credentials'
import type { NextAuthOptions } from 'next-auth'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const fallbackTenantId = process.env.SUPABASE_DEMO_TENANT_ID ?? 'default'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or anon key missing. Authentication will not work until configured.')
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
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

        // Use a stateless client so credential verification never depends on
        // cookie persistence. NextAuth executes this call on the server, where
        // Supabase's browser session helpers are not available; disabling
        // session persistence avoids 401s caused by missing/expired cookies and
        // lets us validate the raw email/password pair deterministically.
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
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
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.email = user.email
        token.name = user.name
        token.tenantId = (user as { tenantId?: string }).tenantId ?? fallbackTenantId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.sub === 'string' ? token.sub : ''
        session.user.email = typeof token.email === 'string' ? token.email : session.user.email
        session.user.name = typeof token.name === 'string' ? token.name : session.user.name
        session.user.tenantId = (token as { tenantId?: string }).tenantId ?? fallbackTenantId
      }
      return session
    },
  },
}
