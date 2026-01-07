/**
 * Next.js Proxy for session validation and consistency monitoring
 *
 * Next.js 16 Migration: This file was created by merging middleware.ts and proxy.ts.
 * The 'middleware' export was renamed to 'proxy' in Next.js 16.
 *
 * SECURITY: This proxy runs on every request to validate user sessions.
 * It ensures that deleted or banned users cannot access protected routes.
 *
 * Session/DB Consistency:
 * Detects cases where JWT currentTenantId doesn't match database current_tenant_id.
 * This can happen when session updates fail during workspace switching.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { createMiddlewareServiceClient } from '@/lib/supabase/middlewareServiceClient'

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/api/auth', // NextAuth API routes
]

// API routes that require authentication
const PROTECTED_API_ROUTES = [
  '/api/conversations',
  '/api/graph',
  '/api/chat',
  '/api/observability',
  '/api/client-telemetry',
  '/api/workspaces',
  '/api/invitations',
  '/api/costs',
  '/api/compaction',
  '/api/cron',
]

/**
 * Check if a route is public (doesn't require authentication)
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
}

/**
 * Check if a route is a protected API route
 */
function isProtectedApiRoute(pathname: string): boolean {
  return PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route))
}

/**
 * Check if route should skip all proxy processing
 */
function shouldSkipProxy(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('/favicon.ico') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$/) !== null
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow static files and Next.js internals
  if (shouldSkipProxy(pathname)) {
    return NextResponse.next()
  }

  // Allow public routes without authentication
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  try {
    // Get the session token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    })

    // SECURITY: Check if user has a valid session
    if (!token || !token.sub) {
      // For API routes, return 401 Unauthorized
      if (isProtectedApiRoute(pathname) || pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // For page routes, redirect to login
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // SECURITY: Additional check for empty or invalid user ID
    // This catches cases where the JWT callback returned an empty token
    if (typeof token.sub !== 'string' || token.sub === '') {
      // Clear the session cookie to force re-login
      const response = isProtectedApiRoute(pathname) || pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Session invalid' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url))

      // Clear all NextAuth cookies
      response.cookies.delete('next-auth.session-token')
      response.cookies.delete('__Secure-next-auth.session-token')
      response.cookies.delete('next-auth.csrf-token')
      response.cookies.delete('__Secure-next-auth.csrf-token')

      return response
    }

    // Session/DB Consistency Check
    // Check if JWT tenant matches database tenant for workspace switching consistency
    const userId = token.sub as string
    const jwtTenantId = token.currentTenantId as string | undefined

    if (jwtTenantId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createMiddlewareServiceClient('session-consistency-check')

        const { data: dbTenantId, error } = await supabase
          .rpc('get_current_tenant_id', { p_user_id: userId })
          .single()

        if (!error && dbTenantId && dbTenantId !== jwtTenantId) {
          console.warn('Session/DB tenant mismatch detected', {
            userId,
            jwtTenantId,
            dbTenantId,
            path: pathname,
          })

          // Log to database for monitoring (non-blocking)
          void (async () => {
            try {
              await supabase.rpc('log_session_mismatch', {
                p_user_id: userId,
                p_expected_tenant_id: dbTenantId,
                p_actual_tenant_id: jwtTenantId,
                p_request_path: pathname,
              })
            } catch (err) {
              console.error('Failed to log session mismatch:', err)
            }
          })()

          // Set header to trigger auto-heal on client
          const response = NextResponse.next()
          response.headers.set('X-Session-Refresh-Required', 'true')
          return response
        }
      }
    }

    // Session is valid, allow the request
    return NextResponse.next()
  } catch (error) {
    console.error('Proxy error:', error)
    return NextResponse.next()
  }
}

// Configure which routes to run proxy on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /_next (Next.js internals)
     * 2. /static (static files)
     * 3. /favicon.ico, /robots.txt (static files)
     * 4. Static file extensions
     */
    '/((?!_next|static|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
