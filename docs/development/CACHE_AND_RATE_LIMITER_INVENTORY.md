# Cache and Rate Limiter Inventory

> **Status:** Current as of Phase 3 completion
> **Purpose:** Comprehensive inventory of all caching and rate limiting implementations in the repository
> **Compliance:** Industry-standard transparent failover pattern

## Executive Summary

This document inventories all caching and rate limiting implementations to ensure compliance with the **industry-standard transparent failover pattern**. All implementations MUST make Redis failures completely transparent to application code.

**Core Principle:** Cache miss and cache unavailable are indistinguishable. Factory functions NEVER return null.

---

## ✅ COMPLIANT Implementations

### 1. TransparentCache (packages/reg-intel-cache/src/transparentCache.ts)

**Status:** ✅ **FULLY COMPLIANT** (Phase 1 - Reference Implementation)

**Pattern:**
- Factory: `createTransparentCache<T>(...): TransparentCache<T>` - NEVER returns null
- Implementations: `PassThroughCache<T>` (Redis unavailable), `RedisBackedCache<T>` (Redis available)
- Behavior: `get()` returns null for BOTH cache miss AND Redis unavailable
- Error Handling: All errors caught internally, converted to cache misses

**Usage:**
```typescript
const cache = createTransparentCache<MyType>(backend, backendType, options);
// cache is NEVER null - always returns instance

const value = await cache.get(key);  // null = miss OR Redis down (transparent)
if (value === null) {
  const data = await fetchFromDatabase();
  await cache.set(key, data);  // No-op if Redis down
}
```

**Files:**
- Implementation: `packages/reg-intel-cache/src/transparentCache.ts`
- Tests: `packages/reg-intel-cache/src/__tests__/transparentCache.test.ts`
- Exports: `packages/reg-intel-cache/src/index.ts`

---

### 2. TransparentRateLimiter (packages/reg-intel-cache/src/transparentRateLimiter.ts)

**Status:** ✅ **FULLY COMPLIANT** (Phase 1 - Reference Implementation)

**Pattern:**
- Factory: `createTransparentRateLimiter(...): TransparentRateLimiter` - NEVER returns null
- Implementations: `AllowAllRateLimiter` (Redis unavailable), `RedisBackedRateLimiter` (Redis available)
- Behavior: `check()` returns true (fail-open) when Redis unavailable
- Error Handling: All errors caught internally, defaults to allowing requests

**Usage:**
```typescript
const limiter = createTransparentRateLimiter(backend);
// limiter is NEVER null - always returns instance

const allowed = await limiter.check(identifier);  // true if Redis down (fail-open)
if (!allowed) {
  return rateLimitError();
}
```

**Files:**
- Implementation: `packages/reg-intel-cache/src/transparentRateLimiter.ts`
- Tests: `packages/reg-intel-cache/src/__tests__/transparentRateLimiter.test.ts`
- Exports: `packages/reg-intel-cache/src/index.ts`

---

### 3. Rate Limiter (packages/reg-intel-cache/src/rateLimiter.ts)

**Status:** ✅ **FULLY COMPLIANT** (Phase 3 - Updated)

**Pattern:**
- Factory: `createRateLimiter(...): TransparentRateLimiter` - NEVER returns null
- Backends: `UpstashRateLimiterBackend`, `RedisSlidingWindowRateLimiterBackend`
- Uses: `TransparentRateLimiter` from Phase 1
- Error Handling: Backend errors propagate to `TransparentRateLimiter` wrapper (fail-open)

**Usage:**
```typescript
const limiter = createRateLimiter(backend, options);
// limiter is NEVER null

const allowed = await limiter.check(identifier);
```

**Files:**
- Implementation: `packages/reg-intel-cache/src/rateLimiter.ts`
- Application wrapper: `apps/demo-web/src/lib/rateLimiter.ts`
- Used in: `apps/demo-web/src/app/api/client-telemetry/route.ts`

**Notes:**
- `createFailOpenRateLimiter()` deprecated (built-in now)
- Application code has ZERO null checks (removed in Phase 3)

---

### 4. DistributedValidationCache (apps/demo-web/src/lib/auth/distributedValidationCache.ts)

**Status:** ✅ **FULLY COMPLIANT** (Phase 2 - Updated)

**Pattern:**
- Factory: `getValidationCache(): DistributedCache` - NEVER returns null
- Implementation: `DistributedValidationCache` wraps `TransparentCache<CacheEntry>`
- Adapter Pattern: Domain-specific interface wrapping generic `TransparentCache`
- Error Handling: Delegated to `TransparentCache` (transparent failover)

**Usage:**
```typescript
const cache = getValidationCache();
// cache is NEVER null

const entry = await cache.get(userId);  // null = miss OR Redis down
if (entry === null) {
  // Validate against Supabase
}
```

**Files:**
- Implementation: `apps/demo-web/src/lib/auth/distributedValidationCache.ts`
- Used in: `apps/demo-web/src/lib/auth/sessionValidation.ts` (7 null checks removed)

---

### 5. CachingConversationStore (packages/reg-intel-conversations/src/conversationStores.ts)

**Status:** ✅ **COMPLIANT WITH CAVEAT** (Gold Standard - Internal Transparent Failover)

**Pattern:**
- Class: `CachingConversationStore implements ConversationStore`
- Error Handling: All Redis operations in try-catch blocks (transparent failover)
- Behavior: Falls back to backing store on Redis errors
- **CAVEAT:** Factory function `createConversationStore()` has conditional return (see Non-Compliant section)

**Usage:**
```typescript
const store = new CachingConversationStore(supabaseStore, redisClient, options);

const conversation = await store.getConversation(input);
// Transparent: Uses cache if Redis available, falls back if not
```

**Implementation Pattern (Reference):**
```typescript
async getConversation(input) {
  // Try cache first
  try {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch {
    // ✅ Redis error - transparently fall through to backing store
  }

  // Fetch from backing store
  const record = await this.backing.getConversation(input);

  // Cache the result
  if (record) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(record));
    } catch {
      // ✅ Ignore cache write errors
    }
  }

  return record;
}
```

**Files:**
- Implementation: `packages/reg-intel-conversations/src/conversationStores.ts:1013`
- Factory: `packages/reg-intel-conversations/src/conversationStores.ts:1130` ⚠️ (conditional)
- Tests: `packages/reg-intel-conversations/src/conversationStoresCaching.test.ts`

---

### 6. CachingPolicyStore (packages/reg-intel-llm/src/policyStores.ts)

**Status:** ✅ **COMPLIANT WITH CAVEAT** (Internal Transparent Failover)

**Pattern:**
- Class: `CachingPolicyStore implements LlmPolicyStore`
- Error Handling: All Redis operations in try-catch blocks (transparent failover)
- Behavior: Falls back to backing store on Redis errors
- **CAVEAT:** Factory function `createPolicyStore()` has conditional return (see Non-Compliant section)

**Usage:**
```typescript
const store = new CachingPolicyStore(supabaseStore, redisClient, options);

const policy = await store.getPolicy(tenantId);
// Transparent: Uses cache if Redis available, falls back if not
```

**Files:**
- Implementation: `packages/reg-intel-llm/src/policyStores.ts:153`
- Factory: `packages/reg-intel-llm/src/policyStores.ts:231` ⚠️ (conditional)
- Tests: `packages/reg-intel-llm/src/policyStores.test.ts`

---

### 7. TokenCache (packages/reg-intel-core/src/tokens/cache.ts)

**Status:** ✅ **COMPLIANT** (In-Memory LRU - No Redis Dependency)

**Pattern:**
- Class: `TokenCache` - In-memory LRU cache for token counting
- Type: Process-local performance optimization
- No Redis: Does not require distributed caching (acceptable exception)

**Usage:**
```typescript
const cache = new TokenCache(maxSize, ttlMs);

const tokens = cache.get(key);  // undefined if not cached
if (tokens === undefined) {
  const count = await expensiveTokenCount(text);
  cache.set(key, count, model);
}
```

**Files:**
- Implementation: `packages/reg-intel-core/src/tokens/cache.ts`
- Used by: `packages/reg-intel-core/src/tokens/tiktoken.ts`
- Tests: `packages/reg-intel-core/src/tokens/__tests__/tokenCounter.test.ts`

**Notes:**
- This is an **acceptable in-memory cache** (per AGENTS.md guidelines)
- Process-local optimization, not distributed state
- No multi-instance coordination required

---

## ⚠️ NON-COMPLIANT Implementations (Factory Functions)

### 1. createConversationStore() - CONDITIONAL RETURN TYPE

**Location:** `packages/reg-intel-conversations/src/conversationStores.ts:1130`

**Issue:** ❌ Returns different types based on Redis availability

**Current Implementation:**
```typescript
export function createConversationStore(
  options: ConversationStoreFactoryOptions
): ConversationStore {
  const supabaseStore = new SupabaseConversationStore(options.supabase);

  const cachingEnabled = options.enableCaching !== false;

  if (cachingEnabled && options.redis) {
    // ❌ Returns CachingConversationStore
    return new CachingConversationStore(supabaseStore, options.redis, {
      ttlSeconds: options.cacheTtlSeconds ?? 60,
    });
  }

  // ❌ Returns SupabaseConversationStore (different implementation)
  return supabaseStore;
}
```

**Problem:**
- Caller gets different performance characteristics (caching vs no caching) based on infrastructure
- Factory behavior changes based on Redis availability
- Violates "same type regardless of infrastructure" principle

**Recommended Fix:**
```typescript
export function createConversationStore(
  options: ConversationStoreFactoryOptions
): ConversationStore {
  const supabaseStore = new SupabaseConversationStore(options.supabase);

  // ✅ ALWAYS return CachingConversationStore
  // Create PassThroughRedis when Redis unavailable
  const redisClient = options.redis ?? createPassThroughRedis();

  return new CachingConversationStore(supabaseStore, redisClient, {
    ttlSeconds: options.cacheTtlSeconds ?? 60,
  });
}
```

**Impact:** Medium - Works correctly due to `CachingConversationStore` internal try-catch, but violates pattern

---

### 2. createPolicyStore() - CONDITIONAL RETURN TYPE

**Location:** `packages/reg-intel-llm/src/policyStores.ts:231`

**Issue:** ❌ Returns different types based on Redis availability

**Current Implementation:**
```typescript
export function createPolicyStore(config: PolicyStoreConfig): LlmPolicyStore {
  const supabaseStore = new SupabasePolicyStore(config.supabase, config.schema);

  if (config.redis) {
    // ❌ Returns CachingPolicyStore
    return new CachingPolicyStore(supabaseStore, config.redis, {
      ttlSeconds: config.cacheTtlSeconds,
    });
  }

  // ❌ Returns SupabasePolicyStore (different implementation)
  return supabaseStore;
}
```

**Problem:**
- Same as `createConversationStore()` - conditional return type based on infrastructure

**Recommended Fix:**
```typescript
export function createPolicyStore(config: PolicyStoreConfig): LlmPolicyStore {
  const supabaseStore = new SupabasePolicyStore(config.supabase, config.schema);

  // ✅ ALWAYS return CachingPolicyStore
  const redisClient = config.redis ?? createPassThroughRedis();

  return new CachingPolicyStore(supabaseStore, redisClient, {
    ttlSeconds: config.cacheTtlSeconds,
  });
}
```

**Impact:** Medium - Works correctly due to `CachingPolicyStore` internal try-catch, but violates pattern

---

## Summary Table

| Implementation | Location | Pattern | Compliance | Notes |
|---|---|---|---|---|
| **TransparentCache** | `packages/reg-intel-cache/src/transparentCache.ts` | Factory NEVER null | ✅ FULLY COMPLIANT | Phase 1 reference |
| **TransparentRateLimiter** | `packages/reg-intel-cache/src/transparentRateLimiter.ts` | Factory NEVER null | ✅ FULLY COMPLIANT | Phase 1 reference |
| **Rate Limiter** | `packages/reg-intel-cache/src/rateLimiter.ts` | Factory NEVER null | ✅ FULLY COMPLIANT | Phase 3 updated |
| **DistributedValidationCache** | `apps/demo-web/src/lib/auth/distributedValidationCache.ts` | Adapter + Factory NEVER null | ✅ FULLY COMPLIANT | Phase 2 updated |
| **CachingConversationStore** | `packages/reg-intel-conversations/src/conversationStores.ts` | Try-catch internal | ✅ COMPLIANT | Gold standard class |
| **createConversationStore()** | `packages/reg-intel-conversations/src/conversationStores.ts:1130` | Conditional return | ⚠️ NON-COMPLIANT | Factory needs fix |
| **CachingPolicyStore** | `packages/reg-intel-llm/src/policyStores.ts` | Try-catch internal | ✅ COMPLIANT | Matches pattern |
| **createPolicyStore()** | `packages/reg-intel-llm/src/policyStores.ts:231` | Conditional return | ⚠️ NON-COMPLIANT | Factory needs fix |
| **TokenCache** | `packages/reg-intel-core/src/tokens/cache.ts` | In-memory LRU | ✅ COMPLIANT | Acceptable exception |

---

## Recommended Actions

### Immediate (No Breaking Changes)

1. ✅ **DONE** - Update AGENTS.md with comprehensive factory function requirements
2. ✅ **DONE** - Create this inventory document
3. ✅ **DONE** - Add enforcement rules to AGENTS.md code review checklist

### Future (Phase 4+ - Breaking Changes)

1. **Fix `createConversationStore()`** - Always return `CachingConversationStore` with `PassThroughRedis`
2. **Fix `createPolicyStore()`** - Always return `CachingPolicyStore` with `PassThroughRedis`
3. **Create `PassThroughRedis`** implementation for `RedisKeyValueClient` interface
4. **Update all factory tests** to verify same type returned regardless of Redis availability

### Monitoring

1. **Add metrics** for backend type detection (`redis`, `upstash`, `passthrough`, `allowall`)
2. **Add alerts** for P1 degradations (PassThrough/AllowAll active in production)
3. **Log warnings** when transparent failover is active

---

## Compliance Guidelines

### For New Implementations

When creating a new cache or rate limiter:

1. **Use existing patterns:**
   - Use `TransparentCache<T>` for distributed caching needs
   - Use `TransparentRateLimiter` for rate limiting needs
   - Follow `DistributedValidationCache` adapter pattern for domain-specific interfaces

2. **Factory functions MUST:**
   - Return non-nullable types (NOT `Cache | null`)
   - Return same type regardless of Redis availability
   - Use `createTransparentCache()` or `createTransparentRateLimiter()`
   - Pass `null` for backend when Redis unavailable (handled transparently)

3. **Application code MUST NOT:**
   - Check for null caches/rate limiters (`if (cache)`)
   - Use try-catch around cache operations
   - Have conditional logic based on Redis availability

4. **Documentation MUST:**
   - Add ✅ markers in code comments for transparent failover
   - Update this inventory document
   - Add tests verifying null backend behavior

### Code Review Checklist

- [ ] Factory functions return non-nullable types (NOT `Cache | null`)
- [ ] Factory functions return **same type** regardless of Redis availability
- [ ] No `if (cache)` or `if (limiter)` null checks in application code
- [ ] No `if (redis)` conditional logic in factory functions
- [ ] Error handling is internal to cache/limiter implementation
- [ ] PassThrough/AllowAll implementations used for failover
- [ ] Transparent failover documented with ✅ markers
- [ ] This inventory document updated

---

## References

- **AGENTS.md** - Fault-tolerant architecture requirements
- **INDUSTRY_STANDARD_CACHE_IMPLEMENTATION_PLAN.md** - Full implementation guide
- **Phase 1 Implementation** - `TransparentCache` and `TransparentRateLimiter`
- **Phase 2 Implementation** - `DistributedValidationCache` adapter pattern
- **Phase 3 Implementation** - Rate limiter transparent failover
- **Gold Standard** - `CachingConversationStore` (line 1013) internal error handling pattern

---

**Last Updated:** Phase 3 completion
**Next Review:** When implementing PassThroughRedis for factory function fixes
