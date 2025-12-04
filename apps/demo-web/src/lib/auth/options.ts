import CredentialsProvider from 'next-auth/providers/credentials'
import type { NextAuthOptions } from 'next-auth'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
      async authorize(credentials: Record<string, unknown> | null) {
        if (!credentials?.email || !credentials?.password || !supabaseUrl || !supabaseAnonKey) {
          return null
        }

        const cookieStore = await cookies()
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return cookieStore.getAll()
            },
            setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]) {
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
    async jwt({ token, user }: { token: Record<string, unknown>; user?: Record<string, unknown> }) {
      if (user) {
        token.sub = user.id
        token.email = user.email
        token.name = user.name
        token.tenantId = (user as { tenantId?: string }).tenantId ?? fallbackTenantId
      }
      return token
    },
    async session({ session, token }: { session: any; token: Record<string, unknown> }) {
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
