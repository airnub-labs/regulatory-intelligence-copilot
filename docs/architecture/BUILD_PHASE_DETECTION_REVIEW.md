# Build Phase Detection Review

## Executive Summary

The current approach to handling missing credentials during build time has grown complex and inconsistent across the codebase. While the original intent was valid (allow builds on cloud coding agents without Supabase), the implementation has created:

1. **Multiple inconsistent patterns** across files
2. **Confusing conditional logic** that may accidentally disable features in production
3. **Deferred runtime errors** via Proxy objects that make debugging difficult
4. **Unclear separation** between truly optional and required services

**Recommendation:** Adopt an industry-standard approach using build-time environment validation with explicit feature flags and fail-fast initialization.

---

## Current Implementation Analysis

### Pattern 1: `PHASE_PRODUCTION_BUILD` Detection

**Files affected:**
- `src/lib/server/conversations.ts:24,74`
- `src/lib/server/llm.ts:11,38`

```typescript
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
const nextPhase = process.env.NEXT_PHASE;
const isProductionBuildPhase = nextPhase === PHASE_PRODUCTION_BUILD;

if (!supabaseUrl || !supabaseServiceKey) {
  if (isProductionBuildPhase) {
    logger.warn(...);  // Silent continue
  } else {
    throw new Error(...);  // Fail in dev
  }
}
```

**Issues:**
- `NEXT_PHASE` is an internal Next.js detail that may change
- Creates asymmetric behavior: builds silently succeed, runtime mysteriously fails
- Developers in CI/CD environments may not notice missing credentials

### Pattern 2: Proxy Placeholder Objects

**Files affected:**
- `src/lib/server/conversations.ts:183-187,209-213,217-221,231-235`
- `src/lib/server/llm.ts:67-71`

```typescript
export const conversationStore: ConversationStore = supabaseClient
  ? createConversationStore({...})
  : (new Proxy({} as ConversationStore, {
      get: () => {
        throw new Error('ConversationStore not initialized - Supabase credentials required');
      },
    }));
```

**Issues:**
- Defers errors to runtime, making debugging harder
- Error only surfaces when a method is called, not at startup
- Stack trace points to Proxy trap, not the root cause
- Type system lies - TypeScript thinks the store is valid

### Pattern 3: Graceful Null Returns

**Files affected:**
- `src/lib/costTracking.ts:58-78`
- `src/lib/pricingInit.ts:39-59`
- `src/lib/e2bCostTracking.ts:56-75`

```typescript
function getSupabaseCredentials(): { supabaseUrl: string; supabaseKey: string } | null {
  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Supabase credentials required...');
    return null;  // Graceful degradation
  }
  return { supabaseUrl, supabaseKey };
}
```

**Issues:**
- Services silently disabled without explicit opt-out
- Logs drowned in noise - warnings appear every startup
- No way to distinguish "intentionally disabled" from "misconfigured"

### Pattern 4: Environment Variable Fallbacks

**Multiple files use inconsistent fallbacks:**

```typescript
// Pattern A: Server key fallback
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

// Pattern B: URL fallback
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

// Pattern C: Anon key cascade
const supabaseRealtimeKey = supabaseServiceKey ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```

**Issues:**
- No single source of truth for which env var to use
- Fallback chains obscure configuration requirements
- Different files may resolve to different credentials

### Pattern 5: Combined `isDevLike` and `isProductionBuildPhase` Checks

```typescript
const isDevLike = process.env.NODE_ENV !== 'production';
const isProductionBuildPhase = nextPhase === PHASE_PRODUCTION_BUILD;

// Later...
if (isDevLike || isProductionBuildPhase) {
  logger.warn(...);
  // Create stub
} else {
  throw new Error(...);
}
```

**Issues:**
- Combines two orthogonal concepts (dev mode vs build phase)
- `isDevLike` in production build could mask issues
- Hard to reason about when errors will actually throw

---

## Risk Assessment

### Production Risks

| Risk | Severity | Likelihood | Current Mitigation |
|------|----------|------------|-------------------|
| Missing credentials in production | High | Medium | Proxy throws at runtime |
| Wrong credentials used via fallback | High | Low | None |
| Feature silently disabled | Medium | High | Warn logs (easily missed) |
| Build succeeds, runtime fails | Medium | High | None |

### Developer Experience Risks

| Issue | Impact |
|-------|--------|
| Unclear which env vars are required | High - wastes debugging time |
| Errors surface at runtime not build | Medium - delays feedback loop |
| Inconsistent patterns across files | Medium - cognitive overhead |
| Proxy traps obscure stack traces | High - debugging difficulty |

---

## Industry Standard Approaches

### Approach 1: t3-env (Recommended)

The T3 stack's `@t3-oss/env-nextjs` provides type-safe environment validation:

```typescript
// src/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Required in all environments
    NEXTAUTH_SECRET: z.string().min(1),

    // Required unless explicitly skipped
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    // Truly optional with defaults
    REDIS_URL: z.string().url().optional(),
    ENABLE_COST_TRACKING: z.enum(["true", "false"]).default("true"),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  // Only validate at runtime, not build
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  runtimeEnv: {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    // ... etc
  },
});
```

**Benefits:**
- Type-safe access: `env.SUPABASE_URL` instead of `process.env.SUPABASE_URL!`
- Fails fast at startup with clear error messages
- Single source of truth for all environment variables
- Build vs runtime validation can be controlled
- Explicit `skipValidation` for CI/CD builds without credentials

### Approach 2: Explicit Feature Flags

Replace credential-sniffing with explicit flags:

```typescript
// Current (implicit)
if (!supabaseUrl || !supabaseKey) {
  logger.warn('Skipping cost tracking...');
  return;
}

// Proposed (explicit)
if (env.COST_TRACKING_ENABLED === false) {
  logger.info('Cost tracking disabled via COST_TRACKING_ENABLED=false');
  return;
}
// Now credentials ARE required if feature is enabled
```

**Environment Variables:**
```bash
# Explicit opt-out
COST_TRACKING_ENABLED=false
REDIS_CACHING_ENABLED=false

# vs current implicit behavior based on missing credentials
```

### Approach 3: Lazy Factory with Fail-Fast

Replace top-level initialization with lazy factories:

```typescript
// Current: Runs at module load, creates Proxy if missing
export const conversationStore = supabaseClient
  ? createConversationStore(...)
  : proxyPlaceholder;

// Proposed: Factory that validates on first use
let _conversationStore: ConversationStore | null = null;

export function getConversationStore(): ConversationStore {
  if (!_conversationStore) {
    // Validate at first use, fail fast with clear message
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ConfigurationError(
        'ConversationStore requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        { required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] }
      );
    }
    _conversationStore = createConversationStore({...});
  }
  return _conversationStore;
}
```

**Benefits:**
- Clear error message with missing variables listed
- Stack trace points to actual caller
- No Proxy indirection
- Services only initialized when actually used

### Approach 4: Build vs Runtime Separation

```typescript
// next.config.js - Only PUBLIC vars are required at build
const requiredBuildVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

// Validate only in production builds
if (process.env.NODE_ENV === 'production') {
  for (const key of requiredBuildVars) {
    if (!process.env[key]) {
      throw new Error(`Missing required build-time env: ${key}`);
    }
  }
}

// Runtime vars validated at startup via t3-env
```

---

## Recommended Migration Plan

### Phase 1: Add t3-env Foundation

1. Install `@t3-oss/env-nextjs` and `zod`
2. Create `src/env.ts` with all environment variables
3. Add `SKIP_ENV_VALIDATION=true` to CI build environments
4. Update imports to use `env.VARIABLE` instead of `process.env.VARIABLE`

### Phase 2: Add Explicit Feature Flags

1. Add explicit enable/disable flags for optional features:
   - `COST_TRACKING_ENABLED`
   - `E2B_ENABLED`
   - `REDIS_CACHING_ENABLED`
   - `OPENFGA_ENABLED`

2. Update initialization code:
   ```typescript
   if (!env.COST_TRACKING_ENABLED) {
     logger.info('Cost tracking disabled');
     return;
   }
   // Now SUPABASE_* are required
   ```

### Phase 3: Remove Build Phase Detection

1. Remove all `PHASE_PRODUCTION_BUILD` imports and checks
2. Remove all `isProductionBuildPhase` conditionals
3. Remove all Proxy placeholder objects
4. Convert to lazy factory pattern

### Phase 4: Consolidate Environment Variables

1. Standardize on single variable names (no fallbacks):
   - `SUPABASE_URL` (server) vs `NEXT_PUBLIC_SUPABASE_URL` (client)
   - `SUPABASE_SERVICE_ROLE_KEY` (only name, no fallback)
   - Remove `SUPABASE_SERVICE_KEY` alias

2. Document all variables in `.env.example` with required/optional status

---

## Proposed File Structure

```
src/
├── env.ts                    # t3-env schema (single source of truth)
├── lib/
│   ├── services/
│   │   ├── supabase.ts       # Lazy factory for Supabase clients
│   │   ├── redis.ts          # Lazy factory for Redis client
│   │   └── index.ts          # Re-exports
│   ├── server/
│   │   ├── conversations.ts  # Uses getSupabaseClient()
│   │   └── llm.ts            # Uses getSupabaseClient()
│   └── features/
│       ├── costTracking.ts   # Checks env.COST_TRACKING_ENABLED
│       └── e2b.ts            # Checks env.E2B_ENABLED
```

---

## Example Implementation: src/env.ts

```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Auth (always required)
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url().optional(),

    // Supabase (required for core functionality)
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

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
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
    redisCaching: env.REDIS_CACHING_ENABLED && !!(env.REDIS_URL || env.UPSTASH_REDIS_REST_URL),
  };
}
```

---

## Example: Refactored Service Factory

```typescript
// src/lib/services/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';

let _serviceClient: SupabaseClient | null = null;
let _internalClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _serviceClient;
}

export function getSupabaseInternalClient(): SupabaseClient {
  if (!_internalClient) {
    _internalClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'copilot_internal' },
    });
  }
  return _internalClient;
}
```

---

## CI/CD Configuration

### GitHub Actions Example

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      # Skip runtime env validation during build
      SKIP_ENV_VALIDATION: true
      # Public vars still required for client bundle
      NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
      NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-key
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    # Real secrets injected at deploy time
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

---

## Summary

| Current Approach | Problem | Recommended Solution |
|-----------------|---------|---------------------|
| `PHASE_PRODUCTION_BUILD` | Internal API, unreliable | `SKIP_ENV_VALIDATION` flag |
| Proxy placeholders | Deferred errors, bad DX | Lazy factory with fail-fast |
| Credential-sniffing | Silent feature disable | Explicit feature flags |
| Variable fallbacks | Unclear requirements | Single source of truth (t3-env) |
| `isDevLike \|\| isProductionBuildPhase` | Confusing logic | Remove, use explicit flags |

**Next Steps:**
1. Review this document
2. Decide on migration timeline
3. Create implementation issues for each phase
4. Begin with Phase 1 (t3-env foundation)
