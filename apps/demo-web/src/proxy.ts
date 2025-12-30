/**
 * Next.js Proxy for session validation
 *
 * SECURITY: This proxy runs on every request to validate user sessions.
 * It ensures that deleted or banned users cannot access protected routes.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes without authentication
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // Files with extensions (images, fonts, etc.)
  ) {
    return NextResponse.next()
  }

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

  // Session is valid, allow the request
  return NextResponse.next()
}

// Configure which routes to run proxy on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /_next (Next.js internals)
     * 2. /static (static files)
     * 3. /favicon.ico, /robots.txt (static files)
     */
    '/((?!_next|static|favicon.ico|robots.txt).*)',
  ],
}
