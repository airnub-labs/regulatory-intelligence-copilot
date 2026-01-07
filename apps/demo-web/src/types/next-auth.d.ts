import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      currentTenantId?: string
    }
  }

  interface User {
    id: string
    email: string
    name?: string
    currentTenantId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub: string
    email: string
    name?: string
    currentTenantId?: string
    lastValidated?: number
  }
}
