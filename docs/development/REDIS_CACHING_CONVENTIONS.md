# Redis Caching Conventions

## Overview

This document establishes consistent patterns for Redis caching across the codebase to ensure predictable behavior in multi-instance deployments.

---

## Current State Analysis

### Existing Implementations

| Component | Redis Client | Key Prefix | TTL | Fallback | Error Handling |
|-----------|-------------|------------|-----|----------|----------------|
| `distributedValidationCache.ts` | `ioredis` (dynamic) | `auth:validation:` | 300s | In-memory LRU | Graceful (return null) |
| `rateLimiter.ts` | `@upstash/redis` | `ratelimit:client-telemetry` | Sliding window | In-memory | Fail-open (allow) |
| `redisEventHub.ts` | `@upstash/redis` | `copilot:events:` | N/A (pub/sub) | Supabase Realtime | Throws error |

### Inconsistencies Found

1. **Two Redis client libraries**: `ioredis` vs `@upstash/redis`
2. **Inconsistent key namespace structure**
3. **Different error handling strategies**
4. **No shared Redis client utilities**
5. **Environment variable sprawl**

---

## Recommended Conventions

### 1. Redis Client Selection

| Use Case | Recommended Client | Reason |
|----------|-------------------|--------|
| Cache (get/set/del) | `@upstash/redis` | REST API works in serverless, no connection pooling needed |
| Pub/Sub | `@upstash/redis` or `ioredis` | Depends on deployment (serverless vs long-running) |
| Rate Limiting | `@upstash/ratelimit` | Purpose-built, handles edge cases |

**Recommendation:** Standardize on `@upstash/redis` for new implementations since:
- Works in serverless environments (Vercel, Cloudflare)
- REST-based, no connection management
- Already used in rate limiter and event hub

### 2. Key Namespace Convention

```
copilot:{domain}:{entity}:{identifier}
```

| Domain | Purpose | Example |
|--------|---------|---------|
| `auth` | Authentication/authorization | `copilot:auth:validation:{userId}` |
| `llm` | LLM routing and policies | `copilot:llm:policy:{tenantId}` |
| `conv` | Conversation data | `copilot:conv:config:{tenantId}:{userId}` |
| `events` | Pub/sub channels | `copilot:events:conversation:{tenantId}:{convId}` |
| `ratelimit` | Rate limiting | `copilot:ratelimit:telemetry:{clientIp}` |

**Migration:** Update existing prefixes to follow this convention.

### 3. TTL Standards

| Cache Type | TTL | Rationale |
|------------|-----|-----------|
| Auth validation | 300s (5min) | Balance security vs performance |
| LLM policies | 300s (5min) | Policies change infrequently |
| Conversation config | 300s (5min) | Config changes are rare |
| Session data | 3600s (1hr) | Match session lifetime |
| Rate limit windows | Varies | Depends on window size |

**Rule:** Always set explicit TTL. Never use infinite TTL for cache entries.

### 4. Error Handling Strategy

```typescript
/**
 * Error handling tiers:
 *
 * Tier 1: CRITICAL - Fail closed (throw error)
 *   - Security-sensitive operations
 *   - Operations where incorrect data is worse than no data
 *
 * Tier 2: IMPORTANT - Graceful degradation (return null/default, log warning)
 *   - Cache reads (fall back to backing store)
 *   - Non-critical lookups
 *
 * Tier 3: BEST-EFFORT - Fail open (allow operation, log warning)
 *   - Rate limiting (don't block users on Redis failure)
 *   - Analytics/telemetry
 */
```

| Component | Tier | Behavior on Redis Error |
|-----------|------|------------------------|
| Auth validation cache | Tier 2 | Fall back to DB, log warning |
| LLM policy cache | Tier 2 | Fall back to DB, log warning |
| Config cache | Tier 2 | Fall back to DB, log warning |
| Rate limiter | Tier 3 | Allow request, log warning |
| Event hub (pub/sub) | Tier 1 | Fail if no transport available |

### 5. Interface Pattern

Use the **decorator/wrapper pattern** for caching layers:

```typescript
// ✅ RECOMMENDED: Decorator pattern
interface Store<T> {
  get(id: string): Promise<T | null>;
  set(item: T): Promise<void>;
}

class CachingStore<T> implements Store<T> {
  constructor(
    private backing: Store<T>,
    private cache: CacheClient,
    private options: CacheOptions
  ) {}

  async get(id: string): Promise<T | null> {
    // Try cache first, fall back to backing
  }

  async set(item: T): Promise<void> {
    // Write to backing, invalidate cache
  }
}

// ❌ AVOID: Separate cache class that doesn't implement the interface
class PolicyCache {
  async getCachedPolicy(id: string): Promise<Policy | null> { ... }
}
```

### 6. Factory Function Pattern

```typescript
// ✅ RECOMMENDED: Single factory with config object
export interface StoreConfig {
  supabase?: SupabaseClient;
  redis?: RedisClient;
  cacheTtlSeconds?: number;
}

export function createPolicyStore(config: StoreConfig): PolicyStore {
  // Build appropriate store based on available services
}

// ❌ AVOID: Multiple factories or constructors for each variant
export function createSupabasePolicyStore(client: SupabaseClient): PolicyStore { ... }
export function createRedisPolicyStore(client: RedisClient): PolicyStore { ... }
export function createCachingPolicyStore(backing: PolicyStore, redis: RedisClient): PolicyStore { ... }
```

---

## Shared Redis Utilities

### Recommended: Create `@reg-copilot/reg-intel-cache` package

```typescript
// packages/reg-intel-cache/src/index.ts

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

export interface CacheConfig {
  /** Redis URL (Upstash REST or standard) */
  url?: string;
  /** Redis token (for Upstash REST) */
  token?: string;
  /** Default TTL in seconds */
  defaultTtlSeconds?: number;
  /** Key prefix */
  prefix?: string;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Create cache client with appropriate backend
 */
export function createCacheClient(config: CacheConfig): CacheClient {
  if (config.url && config.token) {
    return new UpstashCacheClient(config);
  }
  if (config.url) {
    return new IORedisCacheClient(config);
  }
  return new InMemoryCacheClient(config);
}

/**
 * Generic caching decorator factory
 */
export function withCache<T>(
  backing: { get: (id: string) => Promise<T | null> },
  cache: CacheClient,
  options: {
    keyPrefix: string;
    ttlSeconds: number;
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
  }
): { get: (id: string) => Promise<T | null> } {
  return {
    async get(id: string): Promise<T | null> {
      const key = `${options.keyPrefix}:${id}`;

      try {
        const cached = await cache.get(key);
        if (cached) {
          return options.deserialize?.(cached) ?? JSON.parse(cached);
        }
      } catch (err) {
        // Log warning, continue to backing store
      }

      const value = await backing.get(id);

      if (value) {
        try {
          const serialized = options.serialize?.(value) ?? JSON.stringify(value);
          await cache.set(key, serialized, options.ttlSeconds);
        } catch (err) {
          // Log warning, don't fail the request
        }
      }

      return value;
    }
  };
}
```

---

## Environment Variables

### Standardize on These Variables

```bash
# Primary Redis (Upstash REST API - recommended for serverless)
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Fallback Redis (standard Redis URL - for non-serverless)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=optional_password

# Cache TTL overrides (optional)
CACHE_TTL_AUTH_SECONDS=300
CACHE_TTL_POLICY_SECONDS=300
CACHE_TTL_CONFIG_SECONDS=300
```

### Resolution Order

```typescript
function getRedisConfig(): RedisConfig | null {
  // 1. Prefer Upstash REST (works in serverless)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      type: 'upstash',
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
  }

  // 2. Fall back to standard Redis
  if (process.env.REDIS_URL) {
    return {
      type: 'ioredis',
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD,
    };
  }

  // 3. No Redis configured
  return null;
}
```

---

## Cache Invalidation Patterns

### Pattern 1: Write-Through with Invalidation (Recommended)

```typescript
async setPolicy(policy: TenantLlmPolicy): Promise<void> {
  // 1. Write to backing store first (source of truth)
  await this.backing.setPolicy(policy);

  // 2. Invalidate cache (don't update - let next read populate)
  await this.cache.del(this.cacheKey(policy.tenantId));
}
```

### Pattern 2: Write-Through with Update

```typescript
async setPolicy(policy: TenantLlmPolicy): Promise<void> {
  // 1. Write to backing store
  await this.backing.setPolicy(policy);

  // 2. Update cache immediately
  await this.cache.set(
    this.cacheKey(policy.tenantId),
    JSON.stringify(policy),
    this.ttlSeconds
  );
}
```

### Pattern 3: Pub/Sub Invalidation (For Multi-Instance)

```typescript
// On write
async setPolicy(policy: TenantLlmPolicy): Promise<void> {
  await this.backing.setPolicy(policy);
  await this.cache.del(this.cacheKey(policy.tenantId));

  // Broadcast invalidation to other instances
  await this.redis.publish('cache:invalidate', JSON.stringify({
    type: 'policy',
    tenantId: policy.tenantId,
  }));
}

// Subscribe to invalidations (on startup)
this.redis.subscribe('cache:invalidate', (message) => {
  const { type, tenantId } = JSON.parse(message);
  if (type === 'policy') {
    this.localCache.delete(this.cacheKey(tenantId));
  }
});
```

**Recommendation:** Use Pattern 1 (invalidation) for simplicity. Pattern 3 only if cache hit rate is critical and TTL-based invalidation is too slow.

---

## Health Checks

Every cache-enabled component should expose a health check:

```typescript
interface CacheHealthCheck {
  healthy: boolean;
  backend: 'redis' | 'in-memory' | 'none';
  latencyMs?: number;
  error?: string;
}

async healthCheck(): Promise<CacheHealthCheck> {
  const start = Date.now();
  try {
    await this.cache.ping();
    return {
      healthy: true,
      backend: 'redis',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      backend: 'redis',
      error: error.message,
    };
  }
}
```

---

## Migration Checklist

### For Existing Components

- [ ] `distributedValidationCache.ts` - Update key prefix to `copilot:auth:validation:`
- [ ] `rateLimiter.ts` - Update key prefix to `copilot:ratelimit:telemetry:`
- [ ] `redisEventHub.ts` - Already uses `copilot:events:` ✓

### For New Components (PolicyStore, ConfigStore)

- [ ] Use `@upstash/redis` client
- [ ] Follow key namespace: `copilot:llm:policy:`, `copilot:conv:config:`
- [ ] Implement decorator pattern
- [ ] Use factory function pattern
- [ ] Add health check method
- [ ] Set explicit TTL (300s default)
- [ ] Tier 2 error handling (graceful degradation)

---

## Summary

| Aspect | Convention |
|--------|------------|
| Redis client | `@upstash/redis` for new code |
| Key format | `copilot:{domain}:{entity}:{id}` |
| Default TTL | 300 seconds (5 minutes) |
| Error handling | Tier 2 (graceful degradation) for caches |
| Pattern | Decorator wrapping backing store |
| Factory | Single `createXxxStore(config)` function |
| Health check | Required for all cache components |
| Invalidation | Write-through with delete |
