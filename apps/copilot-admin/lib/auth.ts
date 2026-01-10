import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // Create Supabase client for auth
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error || !data.user || !data.session) {
          return null;
        }

        // Extract session ID from JWT access token
        let sessionId: string | undefined;
        try {
          // JWT is base64url encoded: header.payload.signature
          const payloadBase64 = data.session.access_token.split('.')[1];
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
          sessionId = payload.session_id;
        } catch {
          console.warn("Could not extract session_id from Supabase JWT");
        }

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email,
          // Store session ID for session management protection
          sessionId,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = request.nextUrl.pathname.startsWith("/login");
      const isOnApiAuth = request.nextUrl.pathname.startsWith("/api/auth");

      // Always allow access to login page and auth API routes
      if (isOnLoginPage || isOnApiAuth) {
        return true;
      }

      // Protect all other routes
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Store session ID in the JWT token
        token.sessionId = (user as { sessionId?: string }).sessionId;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        // Expose session ID in the session
        (session as { sessionId?: string }).sessionId = token.sessionId as string | undefined;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  trustHost: true,
});
