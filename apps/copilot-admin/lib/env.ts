import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   * These are only available on the server.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Supabase (required for admin operations)
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    // NextAuth.js
    AUTH_SECRET: z.string().min(32),
  },

  /**
   * Client-side environment variables schema.
   * These are exposed to the browser via the NEXT_PUBLIC_ prefix.
   */
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  },

  /**
   * Runtime environment variables.
   * Destructure all variables from `process.env` to ensure they are included in the bundle.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },

  /**
   * Skip validation in certain environments.
   * Set SKIP_ENV_VALIDATION=1 to skip validation (useful for Docker builds).
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined.
   * This allows optional env vars to work correctly.
   */
  emptyStringAsUndefined: true,
});
