/* eslint-disable tenant-security/no-unsafe-service-role */
// This file defines environment validation - direct process.env access is required here
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Auth (always required)
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url().optional(),

    // Supabase (required for core functionality)
    // Using SUPABASE_SERVICE_ROLE_KEY as the canonical name
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    // LLM Providers (at least one required)
    GROQ_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),

    // Graph Database
    MEMGRAPH_URI: z.string().default('bolt://localhost:7687'),

    // Redis (optional - graceful degradation to no-cache)
    REDIS_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Feature flags (explicit opt-in/out)
    COST_TRACKING_ENABLED: z.coerce.boolean().default(true),
    E2B_ENABLED: z.coerce.boolean().default(false),
    REDIS_CACHING_ENABLED: z.coerce.boolean().default(true),

    // E2B (required only if E2B_ENABLED=true)
    E2B_API_KEY: z.string().optional(),

    // OpenFGA (optional authorization backend)
    OPENFGA_API_URL: z.string().url().optional(),
    OPENFGA_STORE_ID: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },

  // Allow skipping validation for CI builds without credentials
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  // Fail build if client vars reference server vars
  emptyStringAsUndefined: true,

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    MEMGRAPH_URI: process.env.MEMGRAPH_URI,
    REDIS_URL: process.env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    COST_TRACKING_ENABLED: process.env.COST_TRACKING_ENABLED,
    E2B_ENABLED: process.env.E2B_ENABLED,
    REDIS_CACHING_ENABLED: process.env.REDIS_CACHING_ENABLED,
    E2B_API_KEY: process.env.E2B_API_KEY,
    OPENFGA_API_URL: process.env.OPENFGA_API_URL,
    OPENFGA_STORE_ID: process.env.OPENFGA_STORE_ID,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});

// Type for feature flags
export type FeatureFlags = {
  costTracking: boolean;
  e2b: boolean;
  redisCaching: boolean;
};

export function getFeatureFlags(): FeatureFlags {
  return {
    costTracking: env.COST_TRACKING_ENABLED,
    e2b: env.E2B_ENABLED && !!env.E2B_API_KEY,
    redisCaching:
      env.REDIS_CACHING_ENABLED && !!(env.REDIS_URL || env.UPSTASH_REDIS_REST_URL),
  };
}
