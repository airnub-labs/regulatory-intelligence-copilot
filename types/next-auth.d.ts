import type React from 'react';

declare module 'next-auth' {
  export type NextAuthOptions = Record<string, unknown>;
  export type NextAuthSession = { user?: { id?: string; tenantId?: string; email?: string } } | null;
  export default function NextAuth(options?: NextAuthOptions): (req?: unknown, res?: unknown) => unknown;
  export function getServerSession(...args: unknown[]): Promise<NextAuthSession>;
}

declare module 'next-auth/react' {
  export function useSession(): { data: import('next-auth').NextAuthSession; status: 'authenticated' | 'unauthenticated' | 'loading' };
  export function signIn(...args: unknown[]): Promise<void>;
  export function signOut(...args: unknown[]): Promise<void>;
  export function SessionProvider(props: { children: React.ReactNode }): React.ReactNode;
}

declare module 'next-auth/providers/credentials' {
  export default function CredentialsProvider(config?: Record<string, unknown>): Record<string, unknown>;
}

declare module '@supabase/ssr' {
  export function createServerClient(...args: any[]): any;
}
