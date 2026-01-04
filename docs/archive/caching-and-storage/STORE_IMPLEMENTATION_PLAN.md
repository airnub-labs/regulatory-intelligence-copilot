> **ARCHIVED (2026-01-04):** This implementation plan is **COMPLETE** and implemented in code.
> Consolidated into [`docs/architecture/caching-and-storage_failover_v1.md`](../../architecture/caching-and-storage_failover_v1.md).
> Retained for historical reference and detailed implementation specifications.

# Store Implementation Plan: PolicyStore & ConfigStore

## Overview

This document provides a detailed implementation plan for:
1. **SupabasePolicyStore** (P0) - New implementation with Redis caching
2. **ConversationConfigStore wiring** (P1) - Connect existing implementation with Redis caching
3. **ConversationStore caching** (P2) - Optional Redis caching for active conversations

These stores are critical for multi-instance cloud deployments where state must be shared across application instances.

> **Related:** See [REDIS_CACHING_CONVENTIONS.md](./REDIS_CACHING_CONVENTIONS.md) for caching standards that this implementation follows.

### Conventions Applied

| Convention | This Plan |
|------------|-----------|
| Redis client | `@upstash/redis` |
| Key format | `copilot:llm:policy:{tenantId}`, `copilot:conv:config:{tenantId}:{userId}`, `copilot:conv:conversation:{conversationId}` |
| TTL | 300s (policies/configs), 60s (conversations) |
| Error handling | Tier 2 (graceful degradation) |
| Pattern | Decorator wrapping Supabase store |
| Factory | `createPolicyStore()`, `createConversationConfigStore()`, `createConversationStore()` |

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
  /** Key prefix (default: 'copilot:llm:policy') */
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
    this.keyPrefix = options.keyPrefix ?? 'copilot:llm:policy';
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
  /** Key prefix (default: 'copilot:conv:config') */
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
    this.keyPrefix = options.keyPrefix ?? 'copilot:conv:config';
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

## Part 3: ConversationStore Caching (Optional - P2)

### 3.1 Current State

The `ConversationStore` is fully implemented with both in-memory and Supabase backends, and properly wired. However, `getConversation()` is called frequently for active conversations and could benefit from Redis caching.

```typescript
// packages/reg-intel-conversations/src/conversationStores.ts
export interface ConversationStore {
  getConversation(input: { tenantId: string; conversationId: string; userId?: string }): Promise<ConversationRecord | null>;
  listConversations(input: { tenantId: string; userId?: string; ... }): Promise<ConversationRecord[]>;
  // ... other methods
}
```

### 3.2 Caching Strategy

**Cache only `getConversation()`** - Other methods are either write operations or list operations that benefit less from caching.

**Invalidation triggers:**
- `appendMessage()` - Update `lastMessageAt`, `updatedAt`
- `updateSharing()` - Update sharing settings
- `setArchivedState()` - Update archive state
- `softDeleteMessage()` - May affect message count

### 3.3 CachingConversationStore Implementation

**File:** `packages/reg-intel-conversations/src/conversationStores.ts`

Add after existing implementations:

```typescript
// ============================================================================
// Caching Layer (Optional)
// ============================================================================

export interface CachingConversationStoreOptions {
  /** TTL in seconds (default: 60 = 1 minute for active conversations) */
  ttlSeconds?: number;
  /** Key prefix (default: 'copilot:conv:conversation') */
  keyPrefix?: string;
}

export class CachingConversationStore implements ConversationStore {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly backing: ConversationStore,
    private readonly redis: RedisLikeClient,
    options: CachingConversationStoreOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 60; // Shorter TTL for active data
    this.keyPrefix = options.keyPrefix ?? 'copilot:conv:conversation';
  }

  private cacheKey(conversationId: string): string {
    return `${this.keyPrefix}:${conversationId}`;
  }

  async getConversation(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
  }): Promise<ConversationRecord | null> {
    const key = this.cacheKey(input.conversationId);

    // Try cache first
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const record = JSON.parse(cached) as ConversationRecord;
        // Verify tenant matches (security check)
        if (record.tenantId === input.tenantId) {
          // Restore Date objects
          record.createdAt = new Date(record.createdAt);
          record.updatedAt = new Date(record.updatedAt);
          if (record.lastMessageAt) record.lastMessageAt = new Date(record.lastMessageAt);
          if (record.archivedAt) record.archivedAt = new Date(record.archivedAt);
          return record;
        }
        // Tenant mismatch - invalidate and fetch fresh
        await this.redis.del(key);
      }
    } catch {
      // Cache error - continue to backing store
    }

    // Fetch from backing store
    const record = await this.backing.getConversation(input);

    // Cache the result
    if (record) {
      try {
        await this.redis.setex(key, this.ttlSeconds, JSON.stringify(record));
      } catch {
        // Ignore cache write errors
      }
    }

    return record;
  }

  // Write-through methods - invalidate cache after write
  async appendMessage(input: Parameters<ConversationStore['appendMessage']>[0]): Promise<{ messageId: string }> {
    const result = await this.backing.appendMessage(input);
    await this.invalidate(input.conversationId);
    return result;
  }

  async updateSharing(input: Parameters<ConversationStore['updateSharing']>[0]): Promise<void> {
    await this.backing.updateSharing(input);
    await this.invalidate(input.conversationId);
  }

  async setArchivedState(input: Parameters<ConversationStore['setArchivedState']>[0]): Promise<void> {
    await this.backing.setArchivedState(input);
    await this.invalidate(input.conversationId);
  }

  async softDeleteMessage(input: Parameters<ConversationStore['softDeleteMessage']>[0]): Promise<void> {
    await this.backing.softDeleteMessage(input);
    await this.invalidate(input.conversationId);
  }

  // Pass-through methods (no caching benefit)
  async createConversation(input: Parameters<ConversationStore['createConversation']>[0]) {
    return this.backing.createConversation(input);
  }

  async getMessages(input: Parameters<ConversationStore['getMessages']>[0]) {
    return this.backing.getMessages(input);
  }

  async listConversations(input: Parameters<ConversationStore['listConversations']>[0]) {
    return this.backing.listConversations(input);
  }

  private async invalidate(conversationId: string): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(conversationId));
    } catch {
      // Ignore invalidation errors
    }
  }
}
```

### 3.4 Factory Function

```typescript
export interface ConversationStoreFactoryOptions {
  supabase?: SupabaseLikeClient;
  supabaseInternal?: SupabaseLikeClient;
  redis?: RedisLikeClient;
  cacheTtlSeconds?: number;
  enableCaching?: boolean; // Default: false (opt-in)
}

export function createConversationStore(
  options: ConversationStoreFactoryOptions
): ConversationStore {
  if (!options.supabase) {
    return new InMemoryConversationStore();
  }

  const supabaseStore = new SupabaseConversationStore(
    options.supabase,
    options.supabaseInternal
  );

  // Caching is opt-in for ConversationStore
  if (options.enableCaching && options.redis) {
    return new CachingConversationStore(supabaseStore, options.redis, {
      ttlSeconds: options.cacheTtlSeconds ?? 60,
    });
  }

  return supabaseStore;
}
```

### 3.5 Wire Up in Application (Optional)

**File:** `apps/demo-web/src/lib/server/conversations.ts`

```typescript
// Optional: Enable conversation caching for high-traffic scenarios
const ENABLE_CONVERSATION_CACHING = process.env.ENABLE_CONVERSATION_CACHING === 'true';

export const conversationStore = createConversationStore({
  supabase: supabaseClient ?? undefined,
  supabaseInternal: supabaseInternalClient ?? undefined,
  redis: ENABLE_CONVERSATION_CACHING ? redisClient ?? undefined : undefined,
  enableCaching: ENABLE_CONVERSATION_CACHING,
  cacheTtlSeconds: 60, // 1 minute for active conversations
});
```

### 3.6 When to Enable

| Scenario | Enable Caching? |
|----------|-----------------|
| Low traffic / development | No |
| High read volume on active conversations | Yes |
| Supabase latency is bottleneck | Yes |
| Write-heavy workload | No (invalidation overhead) |

---

## Part 4: Implementation Checklist

### Phase 1: Database Migration (PolicyStore) ✅ COMPLETE

- [x] Create `supabase/migrations/YYYYMMDDHHMMSS_tenant_llm_policies.sql`
- [x] Run migration locally: `supabase db push` or `supabase migration up`
- [x] Verify table created with RLS policies

### Phase 2: PolicyStore Implementation ✅ COMPLETE

- [x] Create `packages/reg-intel-llm/src/policyStores.ts`
- [x] Add `SupabasePolicyStore` class
- [x] Add `CachingPolicyStore` class
- [x] Add `createPolicyStore` factory function
- [x] Export from `packages/reg-intel-llm/src/index.ts`
- [x] Add unit tests in `packages/reg-intel-llm/src/policyStores.test.ts`

### Phase 3: PolicyStore Wiring ✅ COMPLETE

- [x] Create/update LLM setup in `apps/demo-web/src/lib/server/llm.ts`
- [x] Wire `policyStore` to `createLlmRouter()`
- [x] Update `llmRouterFactory.ts` to accept external policy store

### Phase 4: ConfigStore Caching Layer ✅ COMPLETE

- [x] Add `CachingConversationConfigStore` to `conversationConfig.ts`
- [x] Add `createConversationConfigStore` factory function
- [x] Export new classes from package index

### Phase 5: ConfigStore Wiring ✅ COMPLETE

- [x] Add `conversationConfigStore` export to `conversations.ts`
- [x] Wire Redis client for caching
- [x] Add logging for store type being used

### Phase 6: ConversationStore Caching (Optional - P2) ✅ COMPLETE

- [x] Add `CachingConversationStore` to `conversationStores.ts`
- [x] Add `createConversationStore` factory function
- [x] Add `ENABLE_CONVERSATION_CACHING` env var support
- [x] Unit tests for `CachingConversationStore`

### Phase 7: Testing ✅ COMPLETE

- [x] Unit tests for `SupabasePolicyStore` (16/16 tests passing)
- [x] Unit tests for `CachingPolicyStore` (includes Redis failure scenarios)
- [x] Unit tests for `CachingConversationConfigStore`
- [x] Unit tests for `CachingConversationStore` (with tenant security validation)
- [x] Integration tests with real Supabase
- [x] Multi-instance simulation tests (validated transparent Redis failures)

### Phase 8: Documentation ✅ COMPLETE

- [x] Create comprehensive `REDIS_CACHING_ARCHITECTURE.md` with ASCII diagrams
- [x] Document two-tier cache control system (global + individual flags)
- [x] Add architecture diagram for store layers
- [x] Document when to enable conversation caching
- [x] Document all 6 cache stores in the system
- [x] Document transparent Redis failure handling

---

## Part 5: Environment Variables

### New Variables

```bash
# Redis for caching (optional but recommended for production)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_password
# or point REDIS_URL to an Upstash HTTPS endpoint and supply the token
# REDIS_URL=https://your-endpoint.upstash.io
# REDIS_TOKEN=your_upstash_token

# Cache TTL (optional, defaults shown)
POLICY_CACHE_TTL_SECONDS=300      # 5 minutes for policies
CONFIG_CACHE_TTL_SECONDS=300      # 5 minutes for configs
CONVERSATION_CACHE_TTL_SECONDS=60 # 1 minute for active conversations

# Optional: Enable conversation caching (P2)
ENABLE_CONVERSATION_CACHING=false # Set to 'true' to enable
```

### Existing Variables (unchanged)

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Part 6: Architecture Diagram

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

## Part 7: Cache Invalidation Strategy

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

## Part 8: Testing Strategy

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

---

## ✅ IMPLEMENTATION COMPLETE (December 2025)

**Status:** All phases complete and fully wired into the application.

### What Was Delivered

1. **Database Schema**
   - ✅ Migration: `supabase/migrations/20251229000000_tenant_llm_policies.sql`
   - ✅ Table created with RLS policies and indexes

2. **PolicyStore Implementation**
   - ✅ `SupabasePolicyStore` - Supabase-backed storage
   - ✅ `CachingPolicyStore` - Redis caching decorator
   - ✅ 16/16 tests passing including Redis failure scenarios
   - ✅ Wired into `apps/demo-web/src/lib/server/llm.ts`

3. **ConversationConfigStore Implementation**
   - ✅ `CachingConversationConfigStore` - Redis caching decorator
   - ✅ Factory function `createConversationConfigStore()`
   - ✅ Wired into `apps/demo-web/src/lib/server/conversations.ts`

4. **ConversationStore Caching (Optional)**
   - ✅ `CachingConversationStore` - Optional Redis caching
   - ✅ Opt-in via `ENABLE_CONVERSATION_CACHING` flag
   - ✅ Includes tenant security validation

5. **Two-Tier Cache Control System**
   - ✅ Global kill switch: `ENABLE_REDIS_CACHING`
   - ✅ Individual flags for all 6 caches:
     - `ENABLE_LLM_POLICY_CACHE`
     - `ENABLE_CONVERSATION_CONFIG_CACHE`
     - `ENABLE_CONVERSATION_CACHING`
     - `ENABLE_REDIS_EVENT_HUBS`
     - `ENABLE_AUTH_VALIDATION_CACHE`
     - `ENABLE_RATE_LIMITER_REDIS`
   - ✅ Applied consistently across all Redis usage

6. **Comprehensive Testing**
   - ✅ 16/16 PolicyStore tests passing
   - ✅ Redis failure scenarios validated (graceful degradation)
   - ✅ Cache invalidation tested
   - ✅ Tenant security validation tested
   - ✅ Multi-instance simulation validated

7. **Documentation**
   - ✅ `REDIS_CACHING_ARCHITECTURE.md` (686 lines with ASCII diagrams)
   - ✅ Complete architecture documentation
   - ✅ All 6 cache stores documented
   - ✅ Transparent failure handling explained

### Key Features

- **Transparent Redis Failures**: Application continues working when Redis is unavailable
- **Write-Through Caching**: Ensures data consistency
- **Multi-Instance Safe**: Distributed caching via Redis
- **Security**: Tenant validation on cached conversation reads
- **Flexible Configuration**: Two-tier control for granular cache management

### Files Created/Modified

**Created:**
- `supabase/migrations/20251229000000_tenant_llm_policies.sql`
- `packages/reg-intel-llm/src/policyStores.ts` (270 lines)
- `packages/reg-intel-llm/src/policyStores.test.ts` (470 lines)
- `apps/demo-web/src/lib/server/llm.ts`
- `docs/development/REDIS_CACHING_ARCHITECTURE.md` (686 lines)
- `docs/development/CACHE_CONTROL.md`

**Modified:**
- `packages/reg-intel-conversations/src/conversationConfig.ts` (+143 lines)
- `packages/reg-intel-conversations/src/conversationStores.ts` (+155 lines)
- `packages/reg-intel-conversations/src/conversationConfig.test.ts` (new)
- `packages/reg-intel-conversations/src/conversationStoresCaching.test.ts` (new)
- `apps/demo-web/src/lib/server/conversations.ts` (extensive updates)
- `apps/demo-web/src/lib/auth/distributedValidationCache.ts` (two-tier control)
- `apps/demo-web/src/lib/rateLimiter.ts` (two-tier control)

### Production Readiness

✅ All stores work with or without Redis
✅ Zero application errors on Redis failures
✅ Automatic fallback to Supabase queries
✅ Multi-instance deployments supported
✅ Comprehensive test coverage
✅ Complete architecture documentation

**Branch:** `claude/implement-llm-policystore-UGXAB`
**Completion Date:** December 30, 2025
