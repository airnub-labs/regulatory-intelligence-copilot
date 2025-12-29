# Store Implementation Plan: PolicyStore & ConfigStore

## Overview

This document provides a detailed implementation plan for:
1. **SupabasePolicyStore** - New implementation with Redis caching
2. **ConversationConfigStore wiring** - Connect existing implementation with Redis caching

Both stores are critical for multi-instance cloud deployments where state must be shared across application instances.

---

## Part 1: SupabasePolicyStore Implementation

### 1.1 Current State

The `LlmPolicyStore` interface exists with only an in-memory implementation:

```typescript
// packages/reg-intel-llm/src/llmRouter.ts
export interface LlmPolicyStore {
  getPolicy(tenantId: string): Promise<TenantLlmPolicy | null>;
  setPolicy(policy: TenantLlmPolicy): Promise<void>;
}

export class InMemoryPolicyStore implements LlmPolicyStore {
  private policies = new Map<string, TenantLlmPolicy>();
  // ... used in production with no alternative
}
```

### 1.2 TenantLlmPolicy Schema

```typescript
export interface TenantLlmPolicy {
  tenantId: string;
  defaultModel: string;
  defaultProvider: string;
  allowRemoteEgress: boolean;
  tasks: LlmTaskPolicy[];
  egressMode?: EgressMode;
  allowOffMode?: boolean;
  userPolicies?: Record<string, { egressMode?: EgressMode; allowOffMode?: boolean }>;
}

export interface LlmTaskPolicy {
  task: string;        // e.g. "main-chat", "egress-guard"
  model: string;       // e.g. "gpt-4", "llama-3-70b"
  provider: string;    // e.g. "openai", "groq", "local"
  temperature?: number;
  maxTokens?: number;
}
```

### 1.3 Database Migration

**File:** `supabase/migrations/YYYYMMDDHHMMSS_tenant_llm_policies.sql`

```sql
-- ========================================
-- Tenant LLM Policies
-- ========================================
-- Stores LLM routing policies per tenant for multi-instance deployments.
-- Policies control which providers/models are used for different tasks.

-- Create tenant_llm_policies table
CREATE TABLE IF NOT EXISTS copilot_internal.tenant_llm_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE,

    -- Default routing
    default_model text NOT NULL,
    default_provider text NOT NULL,

    -- Egress controls
    allow_remote_egress boolean NOT NULL DEFAULT true,
    egress_mode text CHECK (egress_mode IN ('off', 'audit', 'enforce')),
    allow_off_mode boolean DEFAULT false,

    -- Task-specific overrides (JSONB array)
    tasks jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Per-user overrides (JSONB object keyed by userId)
    user_policies jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Metadata
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,

    -- Constraints
    CONSTRAINT valid_tasks CHECK (jsonb_typeof(tasks) = 'array'),
    CONSTRAINT valid_user_policies CHECK (jsonb_typeof(user_policies) = 'object')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_llm_policies_tenant
    ON copilot_internal.tenant_llm_policies(tenant_id);

-- Updated_at trigger
CREATE TRIGGER update_tenant_llm_policies_timestamp
    BEFORE UPDATE ON copilot_internal.tenant_llm_policies
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_conversation_config_timestamp();

-- ========================================
-- Row Level Security
-- ========================================

ALTER TABLE copilot_internal.tenant_llm_policies ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY tenant_llm_policies_service_role_all
    ON copilot_internal.tenant_llm_policies
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read their tenant's policy
CREATE POLICY tenant_llm_policies_select
    ON copilot_internal.tenant_llm_policies
    FOR SELECT
    TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Grant permissions
GRANT SELECT ON copilot_internal.tenant_llm_policies TO authenticated;

COMMENT ON TABLE copilot_internal.tenant_llm_policies IS 'LLM routing policies per tenant';
COMMENT ON COLUMN copilot_internal.tenant_llm_policies.tasks IS 'Array of task-specific model/provider overrides';
COMMENT ON COLUMN copilot_internal.tenant_llm_policies.user_policies IS 'Per-user egress mode overrides';
```

### 1.4 SupabasePolicyStore Implementation

**File:** `packages/reg-intel-llm/src/policyStores.ts` (NEW)

```typescript
/**
 * Policy Stores - LLM Routing Policy Persistence
 *
 * Provides Supabase-backed storage for tenant LLM policies with optional
 * Redis caching for multi-instance deployments.
 */

import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { LlmPolicyStore, TenantLlmPolicy, LlmTaskPolicy, EgressMode } from './llmRouter.js';

const logger = createLogger('PolicyStore');

// ============================================================================
// Types
// ============================================================================

export interface SupabaseLikeClient {
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): {
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    upsert(
      values: Record<string, unknown>,
      options?: { onConflict?: string }
    ): Promise<{ error: { message: string } | null }>;
    delete(): {
      eq(column: string, value: unknown): Promise<{ error: { message: string } | null }>;
    };
  };
}

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

interface PolicyRow {
  id: string;
  tenant_id: string;
  default_model: string;
  default_provider: string;
  allow_remote_egress: boolean;
  egress_mode: EgressMode | null;
  allow_off_mode: boolean | null;
  tasks: LlmTaskPolicy[];
  user_policies: Record<string, { egressMode?: EgressMode; allowOffMode?: boolean }>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Supabase Implementation
// ============================================================================

export class SupabasePolicyStore implements LlmPolicyStore {
  private readonly tableName = 'tenant_llm_policies';

  constructor(
    private readonly supabase: SupabaseLikeClient,
    private readonly schema: 'public' | 'copilot_internal' = 'copilot_internal'
  ) {}

  private get table() {
    // Use schema-qualified table name if using copilot_internal
    return this.schema === 'copilot_internal'
      ? `${this.schema}.${this.tableName}`
      : this.tableName;
  }

  async getPolicy(tenantId: string): Promise<TenantLlmPolicy | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      // PGRST116 = no rows found, not an error
      if (error.message.includes('PGRST116')) {
        return null;
      }
      logger.error({ tenantId, error: error.message }, 'Failed to get policy');
      throw new Error(`Failed to get policy: ${error.message}`);
    }

    return data ? this.mapRowToPolicy(data as PolicyRow) : null;
  }

  async setPolicy(policy: TenantLlmPolicy): Promise<void> {
    const row = this.mapPolicyToRow(policy);

    const { error } = await this.supabase
      .from(this.table)
      .upsert(row, { onConflict: 'tenant_id' });

    if (error) {
      logger.error({ tenantId: policy.tenantId, error: error.message }, 'Failed to set policy');
      throw new Error(`Failed to set policy: ${error.message}`);
    }

    logger.info({ tenantId: policy.tenantId }, 'Policy saved to Supabase');
  }

  async deletePolicy(tenantId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error({ tenantId, error: error.message }, 'Failed to delete policy');
      throw new Error(`Failed to delete policy: ${error.message}`);
    }
  }

  private mapRowToPolicy(row: PolicyRow): TenantLlmPolicy {
    return {
      tenantId: row.tenant_id,
      defaultModel: row.default_model,
      defaultProvider: row.default_provider,
      allowRemoteEgress: row.allow_remote_egress,
      egressMode: row.egress_mode ?? undefined,
      allowOffMode: row.allow_off_mode ?? undefined,
      tasks: row.tasks ?? [],
      userPolicies: row.user_policies ?? undefined,
    };
  }

  private mapPolicyToRow(policy: TenantLlmPolicy): Record<string, unknown> {
    return {
      tenant_id: policy.tenantId,
      default_model: policy.defaultModel,
      default_provider: policy.defaultProvider,
      allow_remote_egress: policy.allowRemoteEgress,
      egress_mode: policy.egressMode ?? null,
      allow_off_mode: policy.allowOffMode ?? null,
      tasks: policy.tasks ?? [],
      user_policies: policy.userPolicies ?? {},
    };
  }
}

// ============================================================================
// Caching Layer
// ============================================================================

export interface CachingPolicyStoreOptions {
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
  /** Key prefix (default: 'llm:policy') */
  keyPrefix?: string;
}

export class CachingPolicyStore implements LlmPolicyStore {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly backing: LlmPolicyStore,
    private readonly redis: RedisLikeClient,
    options: CachingPolicyStoreOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 300;
    this.keyPrefix = options.keyPrefix ?? 'llm:policy';
  }

  private cacheKey(tenantId: string): string {
    return `${this.keyPrefix}:${tenantId}`;
  }

  async getPolicy(tenantId: string): Promise<TenantLlmPolicy | null> {
    const key = this.cacheKey(tenantId);

    // Try cache first
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        logger.debug({ tenantId }, 'Policy cache hit');
        return JSON.parse(cached) as TenantLlmPolicy;
      }
    } catch (err) {
      logger.warn({ tenantId, error: err }, 'Redis cache read failed, falling back to backing store');
    }

    // Cache miss - fetch from backing store
    const policy = await this.backing.getPolicy(tenantId);

    if (policy) {
      try {
        await this.redis.setex(key, this.ttlSeconds, JSON.stringify(policy));
        logger.debug({ tenantId, ttl: this.ttlSeconds }, 'Policy cached');
      } catch (err) {
        logger.warn({ tenantId, error: err }, 'Redis cache write failed');
      }
    }

    return policy;
  }

  async setPolicy(policy: TenantLlmPolicy): Promise<void> {
    // Write to backing store first
    await this.backing.setPolicy(policy);

    // Invalidate cache
    try {
      await this.redis.del(this.cacheKey(policy.tenantId));
      logger.debug({ tenantId: policy.tenantId }, 'Policy cache invalidated');
    } catch (err) {
      logger.warn({ tenantId: policy.tenantId, error: err }, 'Redis cache invalidation failed');
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export interface PolicyStoreConfig {
  supabase?: SupabaseLikeClient;
  redis?: RedisLikeClient;
  cacheTtlSeconds?: number;
  schema?: 'public' | 'copilot_internal';
}

/**
 * Create the appropriate policy store based on available configuration.
 *
 * Priority:
 * 1. Supabase + Redis = CachingPolicyStore(SupabasePolicyStore)
 * 2. Supabase only = SupabasePolicyStore
 * 3. Neither = InMemoryPolicyStore (dev/test only)
 */
export function createPolicyStore(config: PolicyStoreConfig): LlmPolicyStore {
  const { InMemoryPolicyStore } = require('./llmRouter.js');

  if (!config.supabase) {
    logger.warn('No Supabase client provided, using InMemoryPolicyStore (not suitable for production)');
    return new InMemoryPolicyStore();
  }

  const supabaseStore = new SupabasePolicyStore(config.supabase, config.schema);

  if (config.redis) {
    logger.info({ ttl: config.cacheTtlSeconds ?? 300 }, 'Using CachingPolicyStore with Redis');
    return new CachingPolicyStore(supabaseStore, config.redis, {
      ttlSeconds: config.cacheTtlSeconds,
    });
  }

  logger.info('Using SupabasePolicyStore without caching');
  return supabaseStore;
}
```

### 1.5 Export Updates

**File:** `packages/reg-intel-llm/src/index.ts`

Add export:
```typescript
export * from './policyStores.js';
```

### 1.6 Wire Up in Application

**File:** `apps/demo-web/src/lib/server/llm.ts` (NEW or existing LLM setup file)

```typescript
import { createLlmRouter, type LlmPolicyStore } from '@reg-copilot/reg-intel-llm';
import { createPolicyStore, SupabasePolicyStore, CachingPolicyStore } from '@reg-copilot/reg-intel-llm';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const redisUrl = process.env.REDIS_URL;

// Create Supabase client for copilot_internal schema
const supabaseInternalClient = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'copilot_internal' },
    })
  : null;

// Create Redis client
const redisClient = redisUrl
  ? new Redis(redisUrl)
  : null;

// Create policy store with appropriate backing
export const policyStore = createPolicyStore({
  supabase: supabaseInternalClient ?? undefined,
  redis: redisClient ?? undefined,
  cacheTtlSeconds: 300, // 5 minutes
  schema: 'copilot_internal',
});

// Create LLM router with policy store
export const llmRouter = createLlmRouter({
  policyStore,
  // ... other config
});
```

---

## Part 2: ConversationConfigStore Wiring

### 2.1 Current State

The implementation exists but is **never instantiated**:
- `InMemoryConversationConfigStore` - exists
- `SupabaseConversationConfigStore` - exists
- Database migration - exists (`20251210000001_conversation_configs.sql`)
- **App wiring - MISSING**

### 2.2 Add Redis Caching Layer

**File:** `packages/reg-intel-conversations/src/conversationConfig.ts`

Add after existing implementations:

```typescript
// ============================================================================
// Caching Layer
// ============================================================================

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

export interface CachingConfigStoreOptions {
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
  /** Key prefix (default: 'conv:config') */
  keyPrefix?: string;
}

export class CachingConversationConfigStore implements ConversationConfigStore {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly backing: ConversationConfigStore,
    private readonly redis: RedisLikeClient,
    options: CachingConfigStoreOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 300;
    this.keyPrefix = options.keyPrefix ?? 'conv:config';
  }

  private cacheKey(tenantId: string, userId?: string | null): string {
    return userId
      ? `${this.keyPrefix}:${tenantId}:${userId}`
      : `${this.keyPrefix}:${tenantId}`;
  }

  async getConfig(input: GetConfigInput): Promise<ConversationConfig> {
    const key = this.cacheKey(input.tenantId, input.userId);

    // Try cache first
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Restore Date object
        parsed.updatedAt = new Date(parsed.updatedAt);
        return parsed as ConversationConfig;
      }
    } catch {
      // Cache miss or error, continue to backing store
    }

    // Fetch from backing store
    const config = await this.backing.getConfig(input);

    // Cache result
    try {
      await this.redis.setex(key, this.ttlSeconds, JSON.stringify(config));
    } catch {
      // Ignore cache write errors
    }

    return config;
  }

  async setGlobalConfig(
    config: Partial<Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt' | 'updatedBy'>>,
    updatedBy?: string
  ): Promise<void> {
    await this.backing.setGlobalConfig(config, updatedBy);
    // Invalidate all cached configs (global affects everyone)
    // In production, you'd use Redis SCAN or pub/sub for cache invalidation
  }

  async setTenantConfig(input: SetConfigInput): Promise<void> {
    await this.backing.setTenantConfig(input);
    // Invalidate tenant's cached configs
    try {
      await this.redis.del(this.cacheKey(input.tenantId));
    } catch {
      // Ignore
    }
  }

  async setUserConfig(input: SetConfigInput): Promise<void> {
    await this.backing.setUserConfig(input);
    // Invalidate user's cached config
    if (input.userId) {
      try {
        await this.redis.del(this.cacheKey(input.tenantId, input.userId));
      } catch {
        // Ignore
      }
    }
  }

  async deleteTenantConfig(tenantId: string): Promise<void> {
    await this.backing.deleteTenantConfig(tenantId);
    try {
      await this.redis.del(this.cacheKey(tenantId));
    } catch {
      // Ignore
    }
  }

  async deleteUserConfig(input: { tenantId: string; userId: string }): Promise<void> {
    await this.backing.deleteUserConfig(input);
    try {
      await this.redis.del(this.cacheKey(input.tenantId, input.userId));
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export interface ConfigStoreFactoryOptions {
  supabase?: SupabaseLikeClient;
  redis?: RedisLikeClient;
  cacheTtlSeconds?: number;
}

export function createConversationConfigStore(
  options: ConfigStoreFactoryOptions
): ConversationConfigStore {
  if (!options.supabase) {
    return new InMemoryConversationConfigStore();
  }

  const supabaseStore = new SupabaseConversationConfigStore(options.supabase);

  if (options.redis) {
    return new CachingConversationConfigStore(supabaseStore, options.redis, {
      ttlSeconds: options.cacheTtlSeconds,
    });
  }

  return supabaseStore;
}
```

### 2.3 Wire Up in Application

**File:** `apps/demo-web/src/lib/server/conversations.ts`

Add after existing store exports:

```typescript
import {
  // ... existing imports
  SupabaseConversationConfigStore,
  InMemoryConversationConfigStore,
  CachingConversationConfigStore,
  createConversationConfigStore,
} from '@reg-copilot/reg-intel-conversations';
import { Redis } from 'ioredis';

// ... existing code ...

// Create Redis client for caching (reuse if already exists)
const redisClient = (() => {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    return new Redis(url);
  } catch (err) {
    logger.warn({ error: err }, 'Failed to create Redis client for config caching');
    return null;
  }
})();

// Create conversation config store with caching
export const conversationConfigStore = createConversationConfigStore({
  supabase: supabaseInternalClient ?? undefined,
  redis: redisClient ?? undefined,
  cacheTtlSeconds: 300, // 5 minutes
});

if (supabaseInternalClient) {
  if (redisClient) {
    logger.info('Using CachingConversationConfigStore with Redis');
  } else {
    logger.info('Using SupabaseConversationConfigStore without caching');
  }
} else {
  logger.info('Using InMemoryConversationConfigStore (dev mode)');
}
```

---

## Part 3: Implementation Checklist

### Phase 1: Database Migration (PolicyStore)

- [ ] Create `supabase/migrations/YYYYMMDDHHMMSS_tenant_llm_policies.sql`
- [ ] Run migration locally: `supabase db push` or `supabase migration up`
- [ ] Verify table created with RLS policies

### Phase 2: PolicyStore Implementation

- [ ] Create `packages/reg-intel-llm/src/policyStores.ts`
- [ ] Add `SupabasePolicyStore` class
- [ ] Add `CachingPolicyStore` class
- [ ] Add `createPolicyStore` factory function
- [ ] Export from `packages/reg-intel-llm/src/index.ts`
- [ ] Add unit tests in `packages/reg-intel-llm/src/policyStores.test.ts`

### Phase 3: PolicyStore Wiring

- [ ] Create/update LLM setup in `apps/demo-web/src/lib/server/llm.ts`
- [ ] Wire `policyStore` to `createLlmRouter()`
- [ ] Update `llmRouterFactory.ts` to accept external policy store

### Phase 4: ConfigStore Caching Layer

- [ ] Add `CachingConversationConfigStore` to `conversationConfig.ts`
- [ ] Add `createConversationConfigStore` factory function
- [ ] Export new classes from package index

### Phase 5: ConfigStore Wiring

- [ ] Add `conversationConfigStore` export to `conversations.ts`
- [ ] Wire Redis client for caching
- [ ] Add logging for store type being used

### Phase 6: Testing

- [ ] Unit tests for `SupabasePolicyStore`
- [ ] Unit tests for `CachingPolicyStore`
- [ ] Unit tests for `CachingConversationConfigStore`
- [ ] Integration tests with real Supabase
- [ ] Multi-instance simulation tests

### Phase 7: Documentation

- [ ] Update `ENV_SETUP.md` with new env vars
- [ ] Update `LOCAL_DEVELOPMENT.md` with caching setup
- [ ] Add architecture diagram for store layers

---

## Part 4: Environment Variables

### New Variables

```bash
# Redis for caching (optional but recommended for production)
REDIS_URL=redis://localhost:6379
# or for Upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Cache TTL (optional, defaults to 300 seconds)
POLICY_CACHE_TTL_SECONDS=300
CONFIG_CACHE_TTL_SECONDS=300
```

### Existing Variables (unchanged)

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Part 5: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐          ┌──────────────────┐             │
│  │   LlmRouter      │          │  ConversationSvc │             │
│  │                  │          │                  │             │
│  │  getPolicy()─────┼──────────┼──►getConfig()    │             │
│  └────────┬─────────┘          └────────┬─────────┘             │
│           │                             │                        │
│           ▼                             ▼                        │
│  ┌──────────────────┐          ┌──────────────────┐             │
│  │CachingPolicyStore│          │CachingConfigStore│             │
│  │                  │          │                  │             │
│  │  ┌─────────────┐ │          │  ┌─────────────┐ │             │
│  │  │    Redis    │ │          │  │    Redis    │ │             │
│  │  │  (5m TTL)   │ │          │  │  (5m TTL)   │ │             │
│  │  └──────┬──────┘ │          │  └──────┬──────┘ │             │
│  │         │miss    │          │         │miss    │             │
│  │         ▼        │          │         ▼        │             │
│  │  ┌─────────────┐ │          │  ┌─────────────┐ │             │
│  │  │  Supabase   │ │          │  │  Supabase   │ │             │
│  │  │PolicyStore  │ │          │  │ConfigStore  │ │             │
│  │  └─────────────┘ │          │  └─────────────┘ │             │
│  └──────────────────┘          └──────────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
│  ┌─────────────────────┐    ┌─────────────────────┐             │
│  │ tenant_llm_policies │    │ conversation_configs│             │
│  │ (copilot_internal)  │    │ (copilot_internal)  │             │
│  └─────────────────────┘    └─────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Cache Invalidation Strategy

### PolicyStore

| Operation | Cache Action |
|-----------|--------------|
| `getPolicy(tenantId)` | Read from cache, fallback to DB |
| `setPolicy(policy)` | Write to DB, delete cache key |
| Policy admin update | Delete cache key via API |

### ConfigStore

| Operation | Cache Action |
|-----------|--------------|
| `getConfig(tenant, user)` | Read from cache, fallback to DB |
| `setGlobalConfig()` | Write to DB, invalidate ALL (use pub/sub in prod) |
| `setTenantConfig(tenant)` | Write to DB, delete tenant cache key |
| `setUserConfig(tenant, user)` | Write to DB, delete user cache key |

### Production Considerations

For true multi-instance cache invalidation, consider:

1. **Redis Pub/Sub** - Broadcast invalidation events
2. **Short TTL** - 5 minutes is usually acceptable for config
3. **Cache-aside with background refresh** - Proactively refresh before TTL

---

## Part 7: Testing Strategy

### Unit Tests

```typescript
describe('SupabasePolicyStore', () => {
  it('should get policy from database', async () => {
    const mockSupabase = createMockSupabase({ data: mockPolicyRow });
    const store = new SupabasePolicyStore(mockSupabase);

    const policy = await store.getPolicy('tenant-1');

    expect(policy).toEqual(expectedPolicy);
  });

  it('should return null for missing policy', async () => {
    const mockSupabase = createMockSupabase({ error: { message: 'PGRST116' } });
    const store = new SupabasePolicyStore(mockSupabase);

    const policy = await store.getPolicy('nonexistent');

    expect(policy).toBeNull();
  });
});

describe('CachingPolicyStore', () => {
  it('should return cached policy on hit', async () => {
    const mockRedis = { get: vi.fn().mockResolvedValue(JSON.stringify(mockPolicy)) };
    const mockBacking = { getPolicy: vi.fn() };
    const store = new CachingPolicyStore(mockBacking, mockRedis);

    const policy = await store.getPolicy('tenant-1');

    expect(policy).toEqual(mockPolicy);
    expect(mockBacking.getPolicy).not.toHaveBeenCalled();
  });

  it('should fetch from backing store on cache miss', async () => {
    const mockRedis = { get: vi.fn().mockResolvedValue(null), setex: vi.fn() };
    const mockBacking = { getPolicy: vi.fn().mockResolvedValue(mockPolicy) };
    const store = new CachingPolicyStore(mockBacking, mockRedis);

    const policy = await store.getPolicy('tenant-1');

    expect(mockBacking.getPolicy).toHaveBeenCalledWith('tenant-1');
    expect(mockRedis.setex).toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
describe('PolicyStore Integration', () => {
  let supabase: SupabaseClient;
  let redis: Redis;
  let store: LlmPolicyStore;

  beforeAll(async () => {
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    redis = new Redis(process.env.REDIS_URL!);
    store = createPolicyStore({ supabase, redis });
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('should persist and retrieve policy across instances', async () => {
    const policy: TenantLlmPolicy = {
      tenantId: 'test-tenant',
      defaultModel: 'gpt-4',
      defaultProvider: 'openai',
      allowRemoteEgress: true,
      tasks: [],
    };

    await store.setPolicy(policy);

    // Simulate second instance
    const store2 = createPolicyStore({ supabase, redis });
    const retrieved = await store2.getPolicy('test-tenant');

    expect(retrieved).toMatchObject(policy);
  });
});
```

---

## Summary

This plan provides:

1. **SupabasePolicyStore** - New production-ready implementation with Redis caching
2. **CachingPolicyStore** - Decorator pattern for cache layer
3. **CachingConversationConfigStore** - Cache layer for existing config store
4. **Factory functions** - Easy instantiation based on available services
5. **Database migration** - New `tenant_llm_policies` table
6. **Wiring code** - Integration into the application

Both stores follow the same pattern:
- Supabase for persistence (source of truth)
- Redis for caching (performance, reduced DB load)
- Graceful fallback to in-memory for dev/test
