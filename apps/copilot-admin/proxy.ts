import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Named export for Next.js 16+ proxy convention
// Note: next-intl is configured via i18n/request.ts without URL-based locale routing
export const proxy = auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Public paths that don't require authentication
  const isPublicPath =
    nextUrl.pathname.startsWith("/login") ||
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname.startsWith("/favicon") ||
    nextUrl.pathname === "/favicon.ico";

  // API routes (except auth) require authentication
  const isApiRoute =
    nextUrl.pathname.startsWith("/api") &&
    !nextUrl.pathname.startsWith("/api/auth");

  // If it's an API route and user is not logged in, return 401
  if (isApiRoute && !isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If not logged in and trying to access protected route, redirect to login
  if (!isLoggedIn && !isPublicPath) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If logged in and trying to access login page, redirect to home
  if (isLoggedIn && nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
