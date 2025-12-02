declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string
      email?: string | null
      name?: string | null
      tenantId?: string
    }
  }

  interface User {
    tenantId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tenantId?: string
  }
}
