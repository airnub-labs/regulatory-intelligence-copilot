# In-Memory Store Analysis and Recommendations

## Executive Summary

This document re-evaluates the in-memory stores after a deeper analysis. The initial recommendation to remove most stores was **incorrect**. Several stores serve important purposes:

1. **Production caching layers** - Some stores SHOULD be in-memory caches in production
2. **Missing implementations** - Some stores lack Redis/Supabase alternatives entirely
3. **Dev-only fallbacks** - Only 3 stores are truly dev-only with proper Supabase alternatives

## Current State Analysis

### Audit Results (Refreshed 2025-12-28)

| Store | Location | LOC | DB Alternative | Production Use | Recommendation |
|-------|----------|-----|----------------|----------------|----------------|
| InMemoryConversationStore | `conversationStores.ts:206-495` | 289 | ✅ Supabase | Dev fallback | **Keep for dev** |
| InMemoryConversationContextStore | `conversationStores.ts:497-543` | 46 | ✅ Supabase | Dev fallback | **Keep for dev** |
| InMemoryConversationPathStore | `pathStores.ts:93-715` | 622 | ✅ Supabase | Dev fallback | **Keep for dev** |
| InMemoryExecutionContextStore | `executionContextStores.ts:168-316` | 148 | ✅ Supabase | Dev fallback + E2B tests | **Keep** |
| InMemoryConversationConfigStore | `conversationConfig.ts:128-230` | 102 | ✅ Supabase | NOT WIRED UP | **Wire up as cache** |
| InMemoryPolicyStore | `llmRouter.ts:1012-1022` | 10 | ❌ NONE | **PRODUCTION USE** | **Add Redis/Supabase impl** |

## Critical Findings

### 1. InMemoryPolicyStore is Used in Production!

This store is **NOT dev-only**. It's the default and ONLY implementation:

```typescript
// llmRouter.ts:1529
const policyStore = config.policyStore ?? new InMemoryPolicyStore();
```

`getPolicy()` is called on **every LLM request** to determine routing. In a multi-instance deployment, each instance has its own policy map - changes to one don't propagate to others.

**Action Required:** Implement `RedisPolicyStore` or `SupabasePolicyStore`.

### 2. ConversationConfigStore is Not Wired Up

The `SupabaseConversationConfigStore` exists but is never instantiated in the app. The config system is designed but not integrated.

**Action Required:** Wire up in `apps/demo-web/src/lib/server/conversations.ts` with optional Redis caching layer.

### 3. Dev-Only Stores Have Proper Guards

The conversation stores (Store, ContextStore, PathStore) have proper environment guards:

```typescript
// conversations.ts:40-41
if (normalizeConversationStoreMode === 'memory' && !isDevLike) {
  throw new Error('COPILOT_CONVERSATIONS_MODE=memory is not permitted outside dev/test environments');
}
```

These are safe to keep for local development without Supabase.

## Revised Recommendations

### Do NOT Remove (Keep As-Is)

| Store | Reason |
|-------|--------|
| InMemoryConversationStore | Dev fallback with proper guards; works well for local dev without Supabase |
| InMemoryConversationContextStore | Dev fallback; pairs with InMemoryConversationStore |
| InMemoryConversationPathStore | Dev fallback; complex branching logic useful for testing |
| InMemoryExecutionContextStore | E2B testing isolation; avoids expensive sandbox creation |

### Action Items (Priority Order)

#### 1. HIGH: Add Production PolicyStore Implementation

**Problem:** `InMemoryPolicyStore` is the ONLY implementation and is used in production.

**Solution:** Create `SupabasePolicyStore` (preferred) or `RedisPolicyStore`:

```typescript
// packages/reg-intel-llm/src/policyStores.ts (new file)
export class SupabasePolicyStore implements LlmPolicyStore {
  constructor(private supabase: SupabaseClient) {}

  async getPolicy(tenantId: string): Promise<TenantLlmPolicy | null> {
    const { data, error } = await this.supabase
      .from('tenant_llm_policies')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();
    // ...
  }

  async setPolicy(policy: TenantLlmPolicy): Promise<void> {
    // upsert to supabase
  }
}

// Optional: Add Redis caching layer
export class CachingPolicyStore implements LlmPolicyStore {
  constructor(
    private backing: LlmPolicyStore,
    private cache: RedisCache,
    private ttlSeconds = 300
  ) {}
  // ...
}
```

**Database migration needed:** `tenant_llm_policies` table.

#### 2. MEDIUM: Wire Up ConversationConfigStore

**Problem:** `SupabaseConversationConfigStore` exists but is never instantiated.

**Solution:** Add to `apps/demo-web/src/lib/server/conversations.ts`:

```typescript
export const conversationConfigStore = supabaseClient
  ? new SupabaseConversationConfigStore(supabaseClient)
  : new InMemoryConversationConfigStore();
```

**Database migration already exists:** `conversation_configs` table from `20251210000001_conversation_configs.sql`.

#### 3. LOW: Consider Redis Caching for Hot Paths

For high-traffic production scenarios, consider adding Redis caching layers:

| Store | Cache Benefit |
|-------|---------------|
| PolicyStore | Called on every LLM request; policies change rarely |
| ConfigStore | Called frequently; configs change rarely |
| ConversationStore | getConversation() could benefit from caching active conversations |

Pattern:
```typescript
class CachingStore<T> implements Store<T> {
  constructor(
    private backing: Store<T>,
    private redis: Redis,
    private prefix: string,
    private ttlSeconds: number
  ) {}

  async get(id: string): Promise<T | null> {
    const cached = await this.redis.get(`${this.prefix}:${id}`);
    if (cached) return JSON.parse(cached);

    const value = await this.backing.get(id);
    if (value) {
      await this.redis.setex(`${this.prefix}:${id}`, this.ttlSeconds, JSON.stringify(value));
    }
    return value;
  }
}
```

## What About Removing the Dev Mode?

Since you now run Redis and Supabase locally, you could simplify by removing the `memory` mode. However, consider these trade-offs:

### Arguments FOR Keeping `memory` Mode

1. **Offline development** - Works without any external services
2. **Fast test iteration** - No database round-trips
3. **CI without Supabase** - Unit tests run faster
4. **Onboarding** - New developers can start without full stack setup

### Arguments AGAINST Keeping `memory` Mode

1. **Behavioral parity issues** - In-memory doesn't enforce RLS, triggers, etc.
2. **Dual maintenance** - Two implementations to keep in sync
3. **False confidence** - Tests pass in-memory but fail with real DB

### Recommendation

**Keep the in-memory stores** but with clear documentation:

1. They are **dev/test fallbacks only** (already enforced via guards)
2. CI should use **real Supabase** for integration tests
3. Consider running **both** in-memory unit tests AND Supabase integration tests

## Updated Validation Checklist

- [ ] `InMemoryPolicyStore` is replaced with `SupabasePolicyStore` in production
- [ ] `ConversationConfigStore` is wired up in the app
- [ ] Database migration for `tenant_llm_policies` is created
- [ ] Tests verify policy/config stores work with Supabase
- [ ] Documentation clarifies when in-memory stores are used
- [ ] Multi-instance deployment tested with shared policy state

## Files to Modify

| File | Change |
|------|--------|
| `packages/reg-intel-llm/src/policyStores.ts` | **New file:** `SupabasePolicyStore` implementation |
| `packages/reg-intel-llm/src/llmRouter.ts` | Export `LlmPolicyStore` interface, keep `InMemoryPolicyStore` |
| `packages/reg-intel-llm/src/llmRouterFactory.ts` | Accept optional `SupabasePolicyStore` |
| `apps/demo-web/src/lib/server/conversations.ts` | Wire up `conversationConfigStore` |
| `supabase/migrations/YYYYMMDD_tenant_llm_policies.sql` | **New migration** for policies table |
| `ENV_SETUP.md` | Document when to use Supabase vs in-memory |

## Conclusion

The in-memory stores are **not the problem**. The problems are:

1. `InMemoryPolicyStore` lacks a production-ready alternative
2. `ConversationConfigStore` is implemented but not wired up

Fix these gaps instead of removing working dev infrastructure.
