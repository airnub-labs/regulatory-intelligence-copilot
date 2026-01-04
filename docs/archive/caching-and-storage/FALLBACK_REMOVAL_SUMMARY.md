> **ARCHIVED (2026-01-04):** Fallback removal **COMPLETE** and implemented in code.
> Consolidated into [`docs/architecture/caching-and-storage_failover_v1.md`](../../architecture/caching-and-storage_failover_v1.md).
> Retained for historical reference and change summary.

# Fallback Removal Summary

**Date**: 2026-01-03
**Branch**: `claude/dynamic-pricing-service-o1Rlc`

## Overview

All in-memory fallbacks that could cause memory accumulation during Redis outages have been removed. The system now has predictable, fail-safe behavior when Redis is unavailable.

---

## Changes Made

### 1. Static Pricing Data Removed
**Previous**: Exported `ALL_PRICING`, `DEFAULT_PRICING` constants for fallback
**Current**: Constants not exported; SupabasePricingService throws error if pricing not found
**Reason**: Pricing data becomes stale quickly; defeats purpose of dynamic pricing

**Files Changed**:
- `packages/reg-intel-observability/src/pricing/index.ts` - Removed exports
- `packages/reg-intel-observability/src/pricing/pricingService.ts` - Removed fallback logic
- `packages/reg-intel-observability/src/pricing/__tests__/pricingService.test.ts` - Updated tests

**Impact**:
- ✅ Always uses latest pricing from Supabase
- ✅ Clear error messages when pricing not configured
- ❌ Requires pricing data to be seeded in Supabase

---

### 2. MemoryRateLimiter Removed - Returns Null (Fail-Open)

**Previous Behavior**:
- When Redis unavailable: Fall back to `Map<string, { count: number; resetAt: number }>`
- Problem: Unbounded memory growth per instance
- Problem: No coordination between instances (rate limits not enforced)
- Problem: Memory leak risk during extended outages

**Current Behavior** (packages/reg-intel-cache/src/rateLimiter.ts):
```typescript
export function createRateLimiter(
  backend: ResolvedBackend | null,
  options: SlidingWindowLimiterOptions,
): RateLimiter | null {
  if (!backend) {
    logger.warn('[rate-limit] No backend configured, rate limiting disabled (fail-open)');
    return null;  // Return null instead of no-op wrapper
  }
  // ... create actual rate limiter
}
```

**Usage** (apps/demo-web/src/app/api/client-telemetry/route.ts):
```typescript
const rateLimiter = getRateLimiter();
if (rateLimiter) {  // Check for null
  const isAllowed = await rateLimiter.check(clientIp);
  if (!isAllowed) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
}
// If null, skip rate limiting (fail-open)
```

**Benefits**:
- ✅ No memory accumulation
- ✅ Predictable behavior (allow all traffic when Redis unavailable)
- ✅ Clear logging when Redis unavailable
- ✅ Can add alerting/monitoring for Redis failures
- ✅ Honest about capabilities (null = no rate limiting, not wrapper class)
- ✅ Simpler code (no unnecessary abstraction)

**Tradeoffs**:
- ⚠️ No rate limiting when Redis down (but this is better than broken rate limiting)
- ⚠️ Requires monitoring to detect Redis outages

**Files Changed**:
- `packages/reg-intel-cache/src/rateLimiter.ts` - Removed MemoryRateLimiter, returns null when no backend
- `packages/reg-intel-cache/src/types.ts` - Removed 'noop' from RateLimiter type
- `apps/demo-web/src/lib/rateLimiter.ts` - Returns `RateLimiter | null`
- `apps/demo-web/src/app/api/client-telemetry/route.ts` - Added null check before use

---

### 3. MemoryCache Removed - Returns Null (Fail-Through)

**Previous Behavior** (Auth Validation Cache):
- When Redis unavailable: Fall back to `Map<string, CacheEntry>` with 10,000 entry limit
- Problem: Memory multiplied across all instances
- Problem: Cache thrashing under load
- Problem: No distributed coordination
- Problem: LRU eviction adds complexity for minimal benefit

**Current Behavior** (apps/demo-web/src/lib/auth/distributedValidationCache.ts):
```typescript
function createDistributedCache(): DistributedCache | null {
  const redisCache = createRedisCache();
  if (redisCache) return redisCache;

  logger.warn({ reason }, 'Caching disabled (fail-through to database)');
  return null;  // Return null instead of no-op wrapper
}

export function getValidationCache(): DistributedCache | null {
  return validationCache;
}
```

**Usage** (apps/demo-web/src/lib/auth/sessionValidation.ts):
```typescript
const validationCache = getValidationCache();

// Check cache if available
if (validationCache) {
  const cached = await validationCache.get(userId);
  if (cached !== null) {
    return cached;
  }
}

// If no cache or cache miss, hit database
// ...

// Cache result if cache available
if (validationCache) {
  await validationCache.set(userId, isValid, tenantId);
}
```

**Benefits**:
- ✅ No memory accumulation
- ✅ Predictable behavior (always hits database when Redis unavailable)
- ✅ Supabase can handle the load
- ✅ Clear failure mode
- ✅ Simpler architecture
- ✅ Honest about capabilities (null = no caching, not wrapper class)

**Tradeoffs**:
- ⚠️ Higher database load when Redis down (but Supabase is scalable)
- ⚠️ Slower response times without caching (acceptable during outages)

**Files Changed**:
- `apps/demo-web/src/lib/auth/distributedValidationCache.ts` - Removed NoOpCache, returns null when no backend
- `apps/demo-web/src/lib/auth/sessionValidation.ts` - Added null checks before cache operations

---

## Production Deployment Impact

### Before (In-Memory Fallbacks)

**During Redis Outage**:
```
Instance 1: MemoryRateLimiter(10K keys) + MemoryCache(10K users) = ~20K objects
Instance 2: MemoryRateLimiter(10K keys) + MemoryCache(10K users) = ~20K objects
Instance 3: MemoryRateLimiter(10K keys) + MemoryCache(10K users) = ~20K objects
...
Instance N: MemoryRateLimiter(10K keys) + MemoryCache(10K users) = ~20K objects

Total Memory: N * 20K objects
Issues:
- Unbounded growth if unique keys keep coming
- OOM risk for long outages
- Rate limiting doesn't work (each instance independent)
- Cache doesn't help (each instance independent)
```

### After (Fail-Open/Fail-Through)

**During Redis Outage**:
```
All Instances: rateLimiter = null, validationCache = null

Total Memory: 0 objects
Behavior:
- Rate limiting: DISABLED (getRateLimiter() returns null, all requests allowed)
- Auth caching: DISABLED (getValidationCache() returns null, all requests hit Supabase)
- Clear monitoring/alerting needed
- System continues to function
```

---

## Monitoring & Alerting Recommendations

### Critical Alerts

1. **Redis Connection Failures**
   ```
   Alert: "Redis unavailable - rate limiting and caching disabled"
   Severity: HIGH
   Action: Restore Redis ASAP
   ```

2. **Increased Database Load**
   ```
   Alert: "Auth validation hitting database directly (Redis down)"
   Severity: MEDIUM
   Action: Monitor Supabase performance
   ```

### Metrics to Track

- Redis connection status
- Rate limiter availability (`redis`/`upstash` vs `null`)
- Cache hit/miss rates (drops to 0% when Redis down)
- Database query latency
- Database connection pool utilization

---

## Configuration Requirements

### Required (All Environments)
```bash
# Supabase (required for all persistent data)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Recommended (Production)
```bash
# Redis (for caching & rate limiting)
REDIS_URL=...
REDIS_PASSWORD=...

# OR Upstash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### Optional (Cache/Rate Limit Control)
```bash
# Disable auth validation cache entirely (even with Redis)
ENABLE_AUTH_VALIDATION_CACHE=false

# Disable Redis rate limiter (returns null even if Redis available)
ENABLE_RATE_LIMITER_REDIS=false
```

---

## Testing Recommendations

### Unit Tests
- ✅ Test createRateLimiter returns null when no backend
- ✅ Test createDistributedCache returns null when no backend
- ✅ Test calling code handles null rate limiter correctly
- ✅ Test calling code handles null cache correctly
- ✅ Test error handling in SupabasePricingService

### Integration Tests
- ✅ Test behavior when Redis unavailable
- ✅ Test Supabase handles load without caching
- ✅ Verify pricing errors are clear and actionable

### Load Tests
- ⚠️ Test system performance without Redis caching
- ⚠️ Verify Supabase can handle uncached auth validation load
- ⚠️ Test rate limiter fail-open doesn't cause issues

---

## Rollback Plan

If issues arise, the system can be rolled back by:

1. Revert commits that removed fallbacks
2. Re-enable in-memory fallbacks in configuration
3. Monitor memory usage carefully
4. Fix Redis issues
5. Remove in-memory fallbacks again

However, **keeping the new behavior is recommended** because:
- More predictable during outages
- No memory accumulation risk
- Clearer failure modes
- Forces proper monitoring/alerting

---

## Summary

| Component | Before | After | Benefit |
|-----------|--------|-------|---------|
| **Pricing** | DEFAULT_PRICING fallback | Error if not in Supabase | Always current |
| **Rate Limiting** | MemoryRateLimiter (unbounded) | Returns null (fail-open) | No memory growth, clearer code |
| **Auth Cache** | MemoryCache (10K limit) | Returns null (fail-through) | No memory usage, clearer code |

**Result**: Scalable, fault-tolerant architecture with predictable behavior during Redis outages. Using null pattern instead of no-op wrapper classes for clearer, more honest code.
