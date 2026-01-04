> **ARCHIVED (2026-01-04):** Audit milestone **COMPLETE**. All deprecated in-memory fallbacks removed.
> Consolidated into [`docs/architecture/caching-and-storage_failover_v1.md`](../../architecture/caching-and-storage_failover_v1.md).
> Retained for historical reference and audit trail.

# In-Memory Components Audit - Final State

**Date**: 2026-01-03
**Branch**: `claude/dynamic-pricing-service-o1Rlc`
**Status**: All deprecated in-memory fallbacks removed
**See Also**: `docs/architecture/caching-and-storage_failover_v1.md` (canonical), `docs/architecture/FAULT_TOLERANT_ARCHITECTURE.md`

---

## Executive Summary

All in-memory fallbacks for distributed state have been **completely removed** from the codebase. The system now uses strict fail-safe patterns (fail-open, fail-through, fail-fast) to prevent memory accumulation during outages and ensure predictable, scalable behavior.

### Migration Complete

1. ✅ **InMemoryPricingService** - REMOVED (replaced with error if Supabase unavailable)
2. ✅ **MemoryRateLimiter** - REMOVED (returns null when Redis unavailable, fail-open)
3. ✅ **MemoryCache (auth validation)** - REMOVED (returns null when Redis unavailable, fail-through)
4. ✅ **All deprecated in-memory stores** - REMOVED (InMemoryConversationStore, InMemoryPathStore, etc.)
5. ✅ **Static pricing fallbacks** - REMOVED (DEFAULT_PRICING no longer exported)

### Current State

**✅ Production In-Memory Components (Justified)**:
- TokenCache (performance optimization - local LRU)
- GraphChangeDetector (SSE/WebSocket state - per-instance)
- ExecutionContextManager.activeSandboxes (connection pools)
- AnomalyDetectionService.historyCache (time-series analysis)
- ToolRegistry (static configuration)

**❌ No In-Memory Fallbacks**:
- Rate limiting → Returns null (fails-open)
- Auth caching → Returns null (fails-through)
- Pricing → Error if not in Supabase (fails-fast)

---

## Changes Implemented

### 1. Dynamic Pricing Service (Supabase Only)

**Previous**: InMemoryPricingService with static DEFAULT_PRICING fallback
**Current**: SupabasePricingService with error if pricing not found

**Files Modified**:
- `packages/reg-intel-observability/src/pricing/index.ts` - Removed InMemoryPricingService and pricing constant exports
- `packages/reg-intel-observability/src/pricing/pricingService.ts` - Removed InMemoryPricingService class, removed DEFAULT_PRICING fallback
- `apps/demo-web/src/lib/pricingInit.ts` - Created Supabase pricing initialization
- `apps/demo-web/instrumentation.ts` - Added pricing service initialization at startup

**Behavior**:
```typescript
// Now throws error if pricing not found
const pricing = await service.getPricing('openai', 'gpt-4');
if (!pricing) {
  throw new Error(
    `Pricing not found for openai/gpt-4. ` +
    `Ensure pricing data is loaded in Supabase.`
  );
}
```

**Required**:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Pricing data seeded in `copilot_internal.model_pricing` table

---

### 2. Rate Limiting (Fail-Open)

**Previous**: MemoryRateLimiter with `Map<string, RateLimitEntry>` fallback
**Current**: Returns null when Redis unavailable (no rate limiting)

**Files Modified**:
- `packages/reg-intel-cache/src/rateLimiter.ts` - Removed MemoryRateLimiter, returns null when no backend
- `packages/reg-intel-cache/src/types.ts` - Removed 'noop' from RateLimiter type
- `apps/demo-web/src/lib/rateLimiter.ts` - Returns `RateLimiter | null`
- `apps/demo-web/src/app/api/client-telemetry/route.ts` - Added null check before use

**Before** (REMOVED):
```typescript
class MemoryRateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();
  // ❌ Unbounded memory growth
  // ❌ No coordination between instances
}
```

**After**:
```typescript
export function createRateLimiter(
  backend: ResolvedBackend | null,
  options: SlidingWindowLimiterOptions,
): RateLimiter | null {
  if (!backend) {
    logger.warn('[rate-limit] No backend configured, rate limiting disabled (fail-open)');
    return null;  // Honest: no rate limiting available
  }
  // ... create actual rate limiter
}

// Usage
const rateLimiter = getRateLimiter();
if (rateLimiter) {  // Check for null before use
  const isAllowed = await rateLimiter.check(clientIp);
  // ...
}
```

**Benefits**:
- No memory accumulation during Redis outages
- Predictable behavior (allow all traffic)
- Clear logging when Redis unavailable
- No false sense of security
- Clearer code (null = no rate limiting, not wrapper class)

---

### 3. Auth Validation Cache (Fail-Through)

**Previous**: MemoryCache with 10,000 entry limit per instance
**Current**: Returns null when Redis unavailable (no caching, hits database)

**Files Modified**:
- `apps/demo-web/src/lib/auth/distributedValidationCache.ts` - Removed NoOpCache, returns null when no backend
- `apps/demo-web/src/lib/auth/sessionValidation.ts` - Added null checks before cache operations

**Before** (REMOVED):
```typescript
class MemoryCache {
  private cache = new Map<string, CacheEntry>(); // Max 10K
  // ❌ Memory multiplied across instances
  // ❌ Cache thrashing under load
}
```

**After**:
```typescript
function createDistributedCache(): DistributedCache | null {
  const redisCache = createRedisCache();
  if (redisCache) return redisCache;

  logger.warn({ reason }, 'Caching disabled (fail-through to database)');
  return null;  // Honest: no caching available
}

// Usage
const validationCache = getValidationCache();
if (validationCache) {  // Check for null before use
  const cached = await validationCache.get(userId);
  // ...
}
```

**Benefits**:
- No memory accumulation
- Supabase can handle the load
- Clear failure mode
- Simpler architecture
- Clearer code (null = no caching, not wrapper class)

---

### 4. Deprecated In-Memory Stores (Completely Removed)

**Removed Classes**:
- `InMemoryConversationStore` (~290 lines)
- `InMemoryConversationContextStore` (~47 lines)
- `InMemoryConversationPathStore` (~643 lines)
- `InMemoryConversationConfigStore` (~112 lines)

**Removed Test Files**:
- `packages/reg-intel-conversations/src/__tests__/pathStores.test.ts` (982 lines)
- `packages/reg-intel-conversations/src/__tests__/testExecutionContextStore.ts` (175 lines)

**Replacement**:
- All use Supabase stores (SupabaseConversationStore, SupabasePathStore, etc.)
- Optional Redis caching via CachingConversationStore wrappers

**Total Deletion**: 2,363 lines removed

---

## Remaining In-Memory Components (Justified)

### Category 1: Performance Optimizations (Local-Only)

#### 1.1 TokenCache
- **Location**: `packages/reg-intel-core/src/tokens/cache.ts:13-131`
- **Purpose**: LRU cache for token counts (avoid expensive re-tokenization)
- **Storage**: `Map<string, TokenCacheEntry>` with max 1000 entries, 1-hour TTL
- **Multi-Instance Safe**: ✅ Yes (local cache per instance is acceptable for performance)
- **Justification**: Tokenization is CPU-intensive; local caching provides significant speedup
- **Recommendation**: ✅ Keep as-is

---

### Category 2: Per-Instance Stateful Features

#### 2.1 GraphChangeDetector
- **Location**: `packages/reg-intel-graph/src/graphChangeDetector.ts:136-856`
- **Purpose**: Real-time graph change detection for SSE/WebSocket streaming
- **Storage**:
  - `Map<string, GraphSnapshot>` - graph state snapshots
  - `Map<string, Set<ChangeCallback>>` - change listeners
  - `Map<string, LastPollInfo>` - timestamp tracking
  - `Map<string, PendingBatch>` - batched changes
- **Multi-Instance Safe**: ✅ Yes (SSE/WebSocket connections are inherently per-instance)
- **Justification**: Each instance maintains its own client connections; state cannot be shared
- **Recommendation**: ✅ Keep as-is

#### 2.2 ExecutionContextManager.activeSandboxes
- **Location**: `packages/reg-intel-conversations/src/executionContextManager.ts:125`
- **Purpose**: Track active E2B sandbox connections
- **Storage**: `Map<string, E2BSandbox>` - active connection pool
- **Multi-Instance Safe**: ✅ Yes (connections are inherently local to the instance)
- **Justification**: Cannot share active connections across processes
- **Note**: Context metadata is stored in Supabase; only active connections are in-memory
- **Recommendation**: ✅ Keep as-is

---

### Category 3: Computational State

#### 3.1 AnomalyDetectionService.historyCache
- **Location**: `packages/reg-intel-observability/src/costTracking/anomalyDetection.ts:86`
- **Purpose**: Historical cost data for anomaly detection (moving averages, z-scores)
- **Storage**: `Map<string, ScopeHistory>` - time-series data
- **Multi-Instance Safe**: ✅ Yes (each instance analyzes independently)
- **Justification**: Real-time statistical analysis requires local state
- **Recommendation**: ✅ Keep as-is

---

### Category 4: Static Configuration

#### 4.1 ToolRegistry.tools
- **Location**: `packages/reg-intel-llm/src/tools/toolRegistry.ts:56`
- **Purpose**: Registry of available LLM tools (run_code, run_analysis)
- **Storage**: `Map<string, RegisteredTool>` - static configuration
- **Multi-Instance Safe**: ✅ Yes (static data loaded at startup)
- **Justification**: Tools are registered at startup; no persistence needed
- **Recommendation**: ✅ Keep as-is

#### 4.2 Pricing Data Constants (Internal Use Only)
- **Location**: `packages/reg-intel-observability/src/pricing/pricingData.seed.ts`
- **Status**: ❌ **NOT EXPORTED** (kept only for Supabase seeding)
- **Previous**: Exported ALL_PRICING, DEFAULT_PRICING for fallback
- **Current**: File exists but not exported; used only for seeding scripts
- **Recommendation**: ✅ Keep file for seeding; never export for runtime use

---

## Fail-Safe Patterns Summary

### Pattern 1: Fail-Open (Rate Limiting)
**When**: Redis unavailable
**Behavior**: Allow all requests through
**Rationale**: Better than broken per-instance rate limiting

### Pattern 2: Fail-Through (Caching)
**When**: Redis unavailable
**Behavior**: Skip cache, hit database directly
**Rationale**: Supabase can handle the load

### Pattern 3: Fail-Fast (Critical Data)
**When**: Supabase unavailable or data missing
**Behavior**: Throw clear error
**Rationale**: Better than stale/incorrect data

---

## Production Deployment Requirements

### Required (All Environments)

```bash
# Supabase - Required for all persistent storage
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Pricing data must be seeded in copilot_internal.model_pricing table
```

### Recommended (Production)

```bash
# Redis - For caching & rate limiting
REDIS_URL=...
REDIS_PASSWORD=...

# OR Upstash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### Optional (Feature Flags)

```bash
# Disable specific caches (even with Redis)
ENABLE_AUTH_VALIDATION_CACHE=false
ENABLE_CONVERSATION_CACHING=false
ENABLE_RATE_LIMITER_REDIS=false
```

---

## Memory Impact Analysis

### Before (With In-Memory Fallbacks)

**During Redis Outage (10 Instances)**:
```
Rate Limiter: 10 instances × unbounded Map = OOM risk
Auth Cache:   10 instances × 10,000 entries = ~10MB+ per instance
Total Risk:   High - memory accumulation, potential OOM
```

### After (With Fail-Safe Patterns)

**During Redis Outage (10 Instances)**:
```
Rate Limiter: 0 memory (returns null, no rate limiting)
Auth Cache:   0 memory (returns null, no caching)
Total Risk:   None - no memory accumulation
```

---

## Monitoring Requirements

### Critical Alerts (P0)
- `supabase_connection_status = down` → System cannot function
- `pricing_lookup_errors > 0` → Missing pricing data
- `auth_validation_failures > threshold` → Auth system issues

### High Alerts (P1)
- `redis_connection_status = down` → Rate limiting & caching disabled
- `rate_limiter_available = false` → Rate limiting bypassed (null returned)
- `cache_available = false` → Database load increased (null returned)

### Metrics to Track
- `dependency_health{service="supabase"}` (up/down)
- `dependency_health{service="redis"}` (up/down)
- `rate_limiter_available` (true if redis/upstash, false if null)
- `cache_hit_rate` (drops to 0% when Redis down)
- `database_query_duration_seconds` (increases when cache down)

---

## Testing Requirements

### Unit Tests
- ✅ createRateLimiter returns null when no backend
- ✅ createDistributedCache returns null when no backend
- ✅ Calling code handles null rate limiter correctly
- ✅ Calling code handles null cache correctly
- ✅ SupabasePricingService throws error for unknown models

### Integration Tests
- ✅ System behavior when Redis unavailable
- ✅ System behavior when Supabase unavailable
- ✅ Database load without caching

### Load Tests
- ✅ Performance without Redis caching
- ✅ Supabase can handle uncached load
- ✅ Rate limiter fail-open doesn't cause issues

---

## Architecture Principles

### ✅ Achieved
- Predictable failure modes
- No memory accumulation during outages
- Clear monitoring signals
- Honest about system capabilities
- Scalable multi-instance architecture

### ❌ Avoided
- Silent degradation
- False sense of security (broken rate limiting)
- OOM risk during extended outages
- Stale data serving
- Hidden coordination issues between instances

---

## Related Documentation

- **Fallback Removal**: `docs/development/FALLBACK_REMOVAL_SUMMARY.md` - Detailed analysis of changes
- **Architecture**: `docs/architecture/FAULT_TOLERANT_ARCHITECTURE.md` - Design principles and patterns
- **Agent Guidelines**: `AGENTS.md` - Includes fault-tolerance section
- **Environment Setup**: `ENV_SETUP.md` - Configuration guide

---

## Summary

The regulatory intelligence copilot is **production-ready** with appropriate fault-tolerant patterns:

| Component | Storage | Fallback Behavior | Status |
|-----------|---------|-------------------|---------|
| Conversations | Supabase | Error if unavailable | ✅ Required |
| Paths | Supabase | Error if unavailable | ✅ Required |
| Pricing | Supabase | Error if unavailable | ✅ Required |
| Rate Limiting | Redis | Returns null (allow all) | ⚠️ Recommended |
| Caching | Redis | Returns null (hit DB) | ⚠️ Recommended |
| Token Cache | Local LRU | N/A | ✅ Performance |
| SSE State | Per-instance | N/A | ✅ Architectural |

**Enforcement**: Any attempt to add in-memory fallbacks for distributed state will be rejected. See `docs/architecture/FAULT_TOLERANT_ARCHITECTURE.md` for architectural review process.
