import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { createClient } from '@supabase/supabase-js'

/**
 * Middleware: Session/DB Consistency Monitor
 *
 * Detects cases where JWT currentTenantId doesn't match database current_tenant_id.
 * This can happen when session updates fail during workspace switching.
 *
 * Auto-healing:
 * - Logs mismatch to database for monitoring
 * - Sets header to trigger client-side session refresh
 */
export async function middleware(request: NextRequest) {
  // Only check authenticated API routes and pages
  const path = request.nextUrl.pathname

  // Skip static files, auth endpoints, and health checks
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api/auth') ||
    path.includes('/favicon.ico') ||
    path.match(/\.(svg|png|jpg|jpeg|gif|webp)$/)
  ) {
    return NextResponse.next()
  }

  try {
    // Get JWT token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    })

    if (!token?.sub || !token?.currentTenantId) {
      return NextResponse.next()
    }

    const userId = token.sub as string
    const jwtTenantId = token.currentTenantId as string

    // Check database for current tenant
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.next()
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: dbTenantId, error } = await supabase
      .rpc('get_current_tenant_id', { p_user_id: userId })
      .single()

    if (error) {
      console.error('Failed to check current tenant ID:', error)
      return NextResponse.next()
    }

    // Detect mismatch
    if (dbTenantId && dbTenantId !== jwtTenantId) {
      console.warn('Session/DB tenant mismatch detected', {
        userId,
        jwtTenantId,
        dbTenantId,
        path,
      })

      // Log to database for monitoring
      await supabase.rpc('log_session_mismatch', {
        p_user_id: userId,
        p_expected_tenant_id: dbTenantId,
        p_actual_tenant_id: jwtTenantId,
        p_request_path: path,
      })

      // Set header to trigger auto-heal on client
      const response = NextResponse.next()
      response.headers.set('X-Session-Refresh-Required', 'true')
      return response
    }

    return NextResponse.next()

  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
