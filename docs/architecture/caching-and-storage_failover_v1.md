# Caching & Storage Layer with Transparent Failover

**Status:** Current (v1.1.0)
**Date:** 2026-01-05
**Implementation Status:** Phases 1-4 Complete

---

## 1. Status & Scope

### What This Document Covers

This is the **canonical reference** for:

- **Caching layer patterns** (Redis-backed caching with transparent failover)
- **Transparent failover behavior** (how Redis unavailability is handled)
- **Redis optionality** (system works without Redis, degraded but functional)
- **Storage layer architecture** (persistent stores vs. cache layer)
- **Rate limiting with failover** (fail-open pattern)
- **Guidelines for implementing new caches** consistently

### Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | **COMPLETE** | TransparentCache & TransparentRateLimiter infrastructure |
| **Phase 2** | **COMPLETE** | Auth Validation Cache using transparent failover |
| **Phase 3** | **COMPLETE** | Rate Limiter using transparent failover |
| **Phase 4** | **COMPLETE** | Interface alignment - RedisKeyValueClient matches industry standards |

The **transparent failover pattern** is fully implemented in production code. All new cache and rate limiter implementations must follow this pattern.

---

## 2. Goals & Non-Goals

### Goals

1. **Multi-instance safety**: No in-memory fallbacks that break distributed coordination
2. **Factory functions NEVER return null**: All cache/rate limiter factories always return an instance
3. **Transparent failover**: Redis failures are completely invisible to application code
4. **Consistent factory patterns**: Same API regardless of Redis availability
5. **Industry standard alignment**: Match behavior of Redis client libraries, Memcached, CDN caches

### Non-Goals (Out of Scope)

1. Implementing new caching strategies (this is docs only)
2. Changing persistent storage layer (Supabase/Postgres remains source of truth)
3. Adding circuit breaker patterns (not currently implemented)
4. Multi-region Redis clustering (future work)

---

## 3. Current Implemented Architecture

### 3.1 Architectural Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                              │
│  (API routes, services - NO null checks, NO try-catch around cache)     │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Transparent Abstractions                         │
│  TransparentCache<T>          TransparentRateLimiter                    │
│  ├─ PassThroughCache<T>       ├─ AllowAllRateLimiter                   │
│  └─ RedisBackedCache<T>       └─ RedisBackedRateLimiter                │
│                                                                          │
│  CachingConversationStore     CachingPolicyStore                        │
│  (wraps Supabase + Redis)     (wraps Supabase + Redis)                  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
┌───────────────────────────────┐  ┌───────────────────────────────────────┐
│         Redis/Upstash         │  │          Supabase/Postgres            │
│         (Optional)            │  │        (Required - Source of Truth)   │
│  - Session validation cache   │  │  - Conversations, Messages, Paths     │
│  - Rate limiting counters     │  │  - Policies, Configs, Pricing         │
│  - Conversation hot cache     │  │  - All persistent storage             │
│  - Policy caching             │  │                                       │
└───────────────────────────────┘  └───────────────────────────────────────┘
```

### 3.2 Core Principle

> **Cache miss and cache unavailable are indistinguishable to application code.**

This is the industry standard pattern used by Redis client libraries, Memcached, CDN caches, and all production-grade caching systems.

### 3.3 Persistent Storage (Required)

**Supabase/Postgres** is the **source of truth** for all persistent data:

- Conversations, messages, paths
- Tenant LLM policies
- Conversation configurations
- Model pricing data
- Cost tracking records

The system **cannot function** without Supabase. If Supabase is unavailable, requests fail.

### 3.4 Cache Layer (Optional)

**Redis/Upstash** provides optional caching for performance:

- Session validation caching (5 min TTL)
- Active conversation caching (1 min TTL)
- Policy caching (5 min TTL)
- Rate limiting counters

The system **continues to function** without Redis. Cache unavailability degrades performance but does not cause errors.

---

## 4. Cache Abstractions & Factories

### 4.1 TransparentCache Interface

**Location:** `packages/reg-intel-cache/src/transparentCache.ts`

```typescript
export interface TransparentCache<T> {
  /**
   * Get value from cache
   * @returns null if cache miss OR if Redis unavailable (transparent)
   */
  get(key: string): Promise<T | null>;

  /**
   * Set value in cache
   * @returns void - No-op if Redis unavailable (transparent)
   */
  set(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete value from cache
   * @returns void - No-op if Redis unavailable (transparent)
   */
  del(key: string): Promise<void>;

  /**
   * Get backend type for observability
   * @returns 'redis' | 'upstash' | 'passthrough'
   */
  getBackendType(): 'redis' | 'upstash' | 'passthrough';
}
```

### 4.2 Factory Function (NEVER Returns Null)

```typescript
/**
 * Create transparent cache that ALWAYS works
 * @returns TransparentCache instance - NEVER returns null
 */
export function createTransparentCache<T>(
  backend: CacheBackend | null,
  backendType: 'redis' | 'upstash' | null,
  options?: CacheOptions
): TransparentCache<T>
```

**When Redis is available:** Returns `RedisBackedCache<T>` with transparent error handling
**When Redis is unavailable:** Returns `PassThroughCache<T>` (all gets return null, all sets are no-ops)

### 4.3 Implementations

| Class | Purpose | Behavior |
|-------|---------|----------|
| `PassThroughCache<T>` | Redis unavailable | get() → null, set() → no-op, del() → no-op |
| `RedisBackedCache<T>` | Redis available | Real caching with internal try-catch |

### 4.3.1 Simplified Architecture: No Adapter Needed (Phase 4)

**RedisKeyValueClient IS CacheBackend**
As of Phase 4, `RedisKeyValueClient` has been aligned with industry-standard cache library interfaces (cache-manager, node-cache, keyv). This eliminates the need for any adapter pattern.

```typescript
// RedisKeyValueClient interface (types.ts)
export interface RedisKeyValueClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;  // Industry standard
  del(key: string): Promise<void>;
  ping?(): Promise<string>;
}

// CacheBackend interface (transparentCache.ts) - IDENTICAL
export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;  // Same signature!
  del(key: string): Promise<void>;
}
```

**Direct Usage - No Adapter**
`RedisKeyValueClient` can be passed directly to `createTransparentCache()`:

```typescript
// ✅ CORRECT: Direct usage (Phase 4)
const redisClient = createKeyValueClient(backend);
const cache = createTransparentCache(redisClient, backend.backend, { ttl: 3600 });

// ❌ LEGACY: Adapter pattern (pre-Phase 4) - NO LONGER NEEDED
// const adapter = createRedisCacheBackend(redisClient);  // DELETED
// const cache = createTransparentCache(adapter, backend.backend, { ttl: 3600 });
```

**Benefits of Interface Alignment:**
- ✅ Zero adapter code - simpler architecture
- ✅ Industry-standard API - familiar to developers
- ✅ Better DX - intuitive `set(key, value, ttl)` parameter order
- ✅ Single interface - no maintaining parallel types
- ✅ True transparency - app doesn't know Redis exists

### 4.4 Other Key Abstractions

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| `TransparentRateLimiter` | `packages/reg-intel-cache/src/transparentRateLimiter.ts` | Rate limiting with fail-open |
| `PassThroughRedis` | `packages/reg-intel-cache/src/passThroughRedis.ts` | No-op Redis client for factories |
| `CachingConversationStore` | `packages/reg-intel-conversations/src/conversationStores.ts:1013` | Supabase + Redis caching |
| `CachingPolicyStore` | `packages/reg-intel-llm/src/policyStores.ts:153` | Supabase + Redis caching |
| `DistributedValidationCache` | `apps/demo-web/src/lib/auth/distributedValidationCache.ts` | Auth validation with failover |

---

## 5. Patterns (with Examples)

### 5.1 CORRECT: Transparent Failover Pattern

```typescript
// ✅ CORRECT: Factory NEVER returns null
const cache = getValidationCache();  // ALWAYS returns instance

// ✅ CORRECT: No null checks needed
const cached = await cache.get(userId);  // null = miss OR Redis down

if (cached === null) {
  // Transparent: could be cache miss OR Redis unavailable
  const data = await validateAgainstDatabase(userId);
  await cache.set(userId, data);  // No-op if Redis down (transparent)
  return data;
}

return cached;
```

### 5.2 CORRECT: CachingConversationStore Pattern

**Location:** `packages/reg-intel-conversations/src/conversationStores.ts:1013`

```typescript
export class CachingConversationStore implements ConversationStore {
  async getConversation(input: GetConversationInput): Promise<ConversationRecord | null> {
    const key = this.cacheKey(input.conversationId);

    // Try cache first
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // ✅ TRANSPARENT: Cache error - continue to backing store
      // Application code never sees this error
    }

    // Fetch from backing store (Supabase)
    const record = await this.backing.getConversation(input);

    // Cache the result
    if (record) {
      try {
        await this.redis.set(key, JSON.stringify(record), this.ttlSeconds);
      } catch {
        // ✅ TRANSPARENT: Cache write error - don't fail the request
      }
    }

    return record;
  }
}
```

This is the **gold standard** implementation. All new caching wrappers must follow this pattern.

### 5.3 INCORRECT: Null-Returning Pattern (PROHIBITED)

```typescript
// ❌ WRONG: Returns null - leaks infrastructure to application
function createCache(): Cache | null {
  if (!hasRedis()) return null;  // ❌ Caller must handle null
  return new RedisCache();
}

const cache = createCache();
if (cache) {  // ❌ Application knows about infrastructure
  const value = await cache.get(key);
}
```

**Why this is wrong:**
- Violates separation of concerns
- Null checks scattered throughout codebase
- Inconsistent with industry standards
- Different code paths based on infrastructure

### 5.4 INCORRECT: Conditional Factory Returns (LEGACY)

```typescript
// ❌ WRONG: Returns different types based on Redis availability
function createConversationStore(options) {
  if (options.redis) {
    return new CachingConversationStore(backing, options.redis);  // ❌ Type A
  }
  return backing;  // ❌ Type B (no caching)
}
```

**Correct fix:**
```typescript
// ✅ CORRECT: Always return same type with PassThroughRedis
function createConversationStore(options) {
  const redisClient = options.redis ?? createPassThroughRedis();
  return new CachingConversationStore(backing, redisClient);  // ✅ Always same type
}
```

---

## 6. Redis Optionality & Failover Semantics

### 6.1 When Redis is Disabled

If no Redis/Upstash environment variables are configured:

1. `createTransparentCache()` returns `PassThroughCache`
2. `createTransparentRateLimiter()` returns `AllowAllRateLimiter`
3. Application code works identically (no code changes needed)
4. All database queries hit Supabase directly (slower but functional)
5. Warning logged once: "PassThroughCache active - all cache operations disabled"

### 6.2 When Redis Fails Mid-Request

If Redis is configured but fails during a request:

1. `RedisBackedCache.get()` catches error, logs warning, returns null
2. `RedisBackedCache.set()` catches error, logs warning, continues
3. `RedisBackedRateLimiter.check()` catches error, logs warning, returns true (allow)
4. Application code continues normally (error is transparent)
5. Metrics track errors: `cache.errors.total`, `ratelimiter.errors.total`

### 6.3 Logging & Observability

**Logs emitted:**
```
[TransparentCache] PassThroughCache active - all cache operations disabled (Redis unavailable)
[TransparentCache] Cache get failed - treating as cache miss
[TransparentCache] Cache set failed - continuing without cache
[TransparentRateLimiter] AllowAllRateLimiter active - rate limiting disabled
```

**Metrics exposed:**
- `cache.operations.total{operation, result, backend}`
- `cache.operation.duration{operation, result, backend}`
- `cache.errors.total{operation, backend, errorType}`
- `ratelimiter.checks.total{result, backend}`
- `ratelimiter.check.duration{result, backend}`

### 6.4 No Circuit Breaker (Current State)

The current implementation does **not** include a circuit breaker. Each Redis operation is attempted individually. If Redis is slow/failing, every operation will retry and log.

**Future consideration:** Add circuit breaker to avoid repeated connection attempts during extended outages.

---

## 7. Rate Limiting & Auth Caching

### 7.1 Rate Limiting with Fail-Open

**Location:** `packages/reg-intel-cache/src/transparentRateLimiter.ts`

```typescript
export interface TransparentRateLimiter {
  check(identifier: string): Promise<boolean>;  // true = allowed
  getBackendType(): 'redis' | 'upstash' | 'allowall';
}
```

**Fail-open behavior:**
- When Redis unavailable: All requests allowed (returns true)
- When Redis errors: Request allowed (fail-open, log error)
- Rationale: Better to allow all traffic than have broken per-instance limits

**Usage:**
```typescript
const limiter = getRateLimiter();  // NEVER returns null
const allowed = await limiter.check(clientIp);  // true if Redis down
if (!allowed) {
  return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
}
```

### 7.2 Auth Validation Cache

**Location:** `apps/demo-web/src/lib/auth/distributedValidationCache.ts`

The auth validation cache uses `TransparentCache<CacheEntry>` with:
- Key pattern: `copilot:auth:validation:{userId}`
- TTL: 300 seconds (5 minutes)
- Failover: Falls through to Supabase validation

**When Redis unavailable:**
- Every auth validation hits Supabase
- Performance degrades but authentication works
- No user-facing errors

---

## 8. In-Memory Components Policy

### 8.1 Core Rule

> **No in-memory fallbacks for distributed state.**

In-memory caches that replace distributed state (rate limiting, auth caching) are **prohibited** because:
- They break multi-instance coordination
- They accumulate memory during outages
- They give false sense of security

### 8.2 Acceptable In-Memory Usage

| Component | Location | Justification |
|-----------|----------|---------------|
| TokenCache | `packages/reg-intel-core/src/tokens/cache.ts` | Local LRU, performance optimization, no distributed state |
| GraphChangeDetector | `packages/reg-intel-graph/src/graphChangeDetector.ts` | Per-instance SSE connections (inherently local) |
| ExecutionContextManager.activeSandboxes | `packages/reg-intel-conversations/src/executionContextManager.ts` | Active E2B connections (cannot share across processes) |
| ToolRegistry | `packages/reg-intel-llm/src/tools/toolRegistry.ts` | Static configuration loaded at startup |
| AnomalyDetectionService.historyCache | `packages/reg-intel-observability/src/costTracking/anomalyDetection.ts` | Time-series analysis (local statistical computation) |

### 8.3 Decision Tree

```
Is this in-memory state?
  ├─ NO → Use as-is
  └─ YES → Is it distributed state (caching, rate limiting)?
      ├─ YES → Use TransparentCache/TransparentRateLimiter
      │        (fail-through/fail-open, NO in-memory fallback)
      └─ NO → Is it per-instance state (SSE, connections)?
          ├─ YES → Keep, document as per-instance
          └─ NO → Is it performance optimization?
              ├─ YES → Keep with bounds, document clearly
              └─ NO → Remove or redesign
```

---

## 9. Operational Guidance

### 9.1 Required Environment Variables

**Supabase (Required - system cannot function without):**
```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Redis (Recommended for production):**
```bash
# ioredis
REDIS_URL=redis://...
REDIS_PASSWORD=...

# OR Upstash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

**Feature Flags (Optional):**
```bash
ENABLE_AUTH_VALIDATION_CACHE=true  # default: true
ENABLE_RATE_LIMITER_REDIS=true     # default: true
ENABLE_CONVERSATION_CACHING=true   # default: true
```

### 9.2 Redis Key Naming Conventions

| Domain | Key Pattern | TTL |
|--------|-------------|-----|
| Auth validation | `copilot:auth:validation:{userId}` | 300s |
| Conversations | `copilot:conv:{conversationId}` | 60s |
| Policies | `copilot:llm:policy:{tenantId}` | 300s |
| Rate limiting | `copilot:ratelimit:{bucket}:{identifier}` | window-based |

### 9.3 TTL Guidelines

| Use Case | Recommended TTL | Rationale |
|----------|-----------------|-----------|
| Hot conversations | 60 seconds | Frequently accessed, benefits from short cache |
| Auth validation | 300 seconds | Balance between load and freshness |
| Tenant policies | 300 seconds | Rarely change, can tolerate staleness |
| Rate limit windows | 60 seconds | Matches rate limit window |

### 9.4 Testing Guidance

**Unit tests:**
```typescript
// Test with null backend (PassThroughCache behavior)
const cache = createTransparentCache<string>(null, null);
expect(await cache.get('key')).toBeNull();

// Test with failing backend (transparent error handling)
const failingBackend = { get: async () => { throw new Error('Redis down'); } };
const cache = createTransparentCache<string>(failingBackend, 'redis');
expect(await cache.get('key')).toBeNull();  // Error becomes cache miss
```

**Integration tests:**
- Test with Redis available → verify cache hits/misses
- Test with Redis unavailable → verify transparent degradation
- Test with Redis failing mid-request → verify error handling

---

## 10. Future Work

Items confirmed as **not yet implemented**:

1. **PassThroughRedis for all factory functions** (Phase 4)
   - `createConversationStore()` and `createPolicyStore()` still have conditional returns
   - Fix: Always return caching wrapper with PassThroughRedis when Redis unavailable

2. **Circuit breaker pattern**
   - Currently each operation retries independently
   - Add circuit breaker to avoid repeated connection attempts during extended outages

3. **Metrics dashboards**
   - OpenTelemetry metrics are emitted but dashboards not documented
   - Create Grafana/Datadog dashboards for cache health

4. **Multi-region Redis**
   - Single-region Redis currently assumed
   - Future: Support for read replicas, geo-replication

---

## 11. References

### Code Modules

| Module | Path |
|--------|------|
| TransparentCache | `packages/reg-intel-cache/src/transparentCache.ts` |
| TransparentRateLimiter | `packages/reg-intel-cache/src/transparentRateLimiter.ts` |
| PassThroughRedis | `packages/reg-intel-cache/src/passThroughRedis.ts` |
| CachingConversationStore | `packages/reg-intel-conversations/src/conversationStores.ts:1013` |
| CachingPolicyStore | `packages/reg-intel-llm/src/policyStores.ts:153` |
| DistributedValidationCache | `apps/demo-web/src/lib/auth/distributedValidationCache.ts` |
| Rate Limiter | `apps/demo-web/src/lib/rateLimiter.ts` |
| Cache Tests | `packages/reg-intel-cache/src/__tests__/transparentCache.test.ts` |

### Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/operations/TRANSPARENT_FAILOVER_RUNBOOK.md` | Operations runbook for incidents |
| `docs/development/TRANSPARENT_FAILOVER_DEPLOYMENT_GUIDE.md` | Deployment procedures |
| `AGENTS.md` (Fault-tolerant architecture section) | Coding guidelines and enforcement |

### Archived Documentation

Historical documents preserved in `docs/archive/caching-and-storage/`:

| Document | Original Purpose |
|----------|------------------|
| `INDUSTRY_STANDARD_CACHE_IMPLEMENTATION_PLAN.md` | Original implementation plan (now complete) |
| `CACHE_AND_RATE_LIMITER_INVENTORY.md` | Compliance inventory (superseded by this doc) |
| `STORE_IMPLEMENTATION_PLAN.md` | Store implementation plan (implemented) |
| `IN_MEMORY_COMPONENTS_AUDIT.md` | Audit of in-memory components (milestone complete) |

---

## Code Review Checklist

When reviewing cache or rate limiter code:

- [ ] Factory functions return non-nullable types (NOT `Cache | null`)
- [ ] Factory functions return **same type** regardless of Redis availability
- [ ] No `if (cache)` or `if (limiter)` null checks in application code
- [ ] No `if (redis)` conditional logic in factory functions
- [ ] Error handling is internal to cache/limiter implementation
- [ ] Try-catch blocks around Redis operations (not in calling code)
- [ ] PassThrough/AllowAll implementations used for failover
- [ ] Metrics instrumented for observability
- [ ] Logging for transparent failover conditions

---

**Enforcement:** This document represents architectural decisions. Any PR introducing in-memory fallbacks for distributed state or null-returning cache factories will be rejected.
