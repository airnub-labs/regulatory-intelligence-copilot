# Redis Caching Architecture

This document describes the comprehensive caching architecture for the Regulatory Intelligence Copilot platform, including transparent Redis failure handling, fallback strategies, and all cache stores.

## Table of Contents
- [Overview](#overview)
- [Architecture Diagrams](#architecture-diagrams)
- [Cache Stores](#cache-stores)
- [Two-Tier Control System](#two-tier-control-system)
- [Transparent Redis Failures](#transparent-redis-failures)
- [Cache Invalidation Strategy](#cache-invalidation-strategy)
- [Configuration](#configuration)
- [Testing](#testing)

## Overview

The platform uses a multi-layered caching strategy with Redis as an optional performance enhancement. **All operations work transparently whether Redis is available or not.** Redis failures are gracefully handled with automatic fallback to Supabase queries, ensuring zero downtime.

### Design Principles

1. **Graceful Degradation**: Redis failures never cause application errors
2. **Transparent Operation**: Application code is unaware of Redis state
3. **Two-Tier Control**: Global kill switch + individual cache flags
4. **Write-Through Caching**: Writes go to Supabase first, cache second
5. **Multi-Instance Safe**: Distributed caching for horizontal scaling

## Architecture Diagrams

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Application Layer                             │
│  (Routers, Services, API Endpoints - Unaware of Cache Layer)       │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Cache Store Layer                              │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│
│ │ PolicyStore │  │ConfigStore  │  │ConversationS│  │AuthValidation││
│ │             │  │             │  │tore         │  │Cache        ││
│ └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘│
└────────────┬──────────────────┬─────────────┬──────────────────────┘
             │                  │             │
        ┌────▼────┐        ┌────▼────┐   ┌───▼────┐
        │ Redis   │        │ Redis   │   │ Redis  │
        │ (Cache) │        │ (Cache) │   │(Cache) │
        └────┬────┘        └────┬────┘   └───┬────┘
             │                  │             │
             │  ┌───────────────┴─────────────┘
             │  │  On Redis Failure or Disabled:
             │  │  Automatic Fallback ⬇
             ▼  ▼
      ┌──────────────────┐
      │  Supabase        │
      │  (Source of      │
      │   Truth)         │
      └──────────────────┘
```

### Request Flow with Redis Available

```
Application Request
       │
       ▼
┌─────────────────┐
│  Cache Store    │
│  (Decorator)    │
└────────┬────────┘
         │
         │ 1. Check Redis Cache
         ▼
    ┌─────────┐
    │  Redis  │
    └────┬────┘
         │
         ├──── Cache HIT ────► Return Cached Data ──► Application
         │
         └──── Cache MISS
                 │
                 ▼
         ┌──────────────┐
         │   Supabase   │ 2. Query Database
         │   (Backing   │
         │    Store)    │
         └──────┬───────┘
                │
                │ 3. Populate Redis Cache (async, fire-and-forget)
                ▼
           ┌─────────┐
           │  Redis  │
           └─────────┘
                │
                └──────► Return Fresh Data ──► Application
```

### Request Flow with Redis Unavailable

```
Application Request
       │
       ▼
┌─────────────────┐
│  Cache Store    │
│  (Decorator)    │
└────────┬────────┘
         │
         │ 1. Try Redis Cache
         ▼
    ┌─────────┐
    │  Redis  │ ⚠ Connection Failed
    │ (Down)  │
    └────┬────┘
         │
         │ Error caught silently
         │ (logged for monitoring)
         │
         ▼
   ┌──────────────┐
   │   Supabase   │ 2. Fallback to Database
   │   (Backing   │    (Automatic, No Error)
   │    Store)    │
   └──────┬───────┘
          │
          └──────► Return Fresh Data ──► Application
                   (Works exactly as if Redis didn't exist)
```

### Write Operation Flow

```
Application Write Request (setPolicy, setConfig, appendMessage, etc.)
       │
       ▼
┌─────────────────┐
│  Cache Store    │
│  (Decorator)    │
└────────┬────────┘
         │
         │ 1. Write to Supabase FIRST (Source of Truth)
         ▼
   ┌──────────────┐
   │   Supabase   │
   │   (Backing   │
   │    Store)    │
   └──────┬───────┘
          │
          │ 2. After successful write, invalidate cache
          ▼
      ┌─────────┐
      │  Redis  │ DEL key (cache invalidation)
      │         │
      └────┬────┘
           │
           │ If Redis fails: Log warning, continue
           │ If Redis succeeds: Cache cleared
           │
           └──────► Return Success ──► Application
                    (Never fails due to Redis)
```

### Two-Tier Control Flow

```
Environment Variables
    │
    ├─── ENABLE_REDIS_CACHING (Global Kill Switch)
    │         │
    │         ├─── false ──► ALL Redis Disabled ──► In-Memory/Direct DB
    │         │
    │         └─── true (default)
    │                  │
    │                  ▼
    └─── Individual Flags (Per Cache)
              │
              ├─── ENABLE_LLM_POLICY_CACHE
              ├─── ENABLE_CONVERSATION_CONFIG_CACHE
              ├─── ENABLE_CONVERSATION_CACHING
              ├─── ENABLE_REDIS_EVENT_HUBS
              ├─── ENABLE_AUTH_VALIDATION_CACHE
              └─── ENABLE_RATE_LIMITER_REDIS
                        │
                        ▼
                  Both Must Be TRUE
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
         Redis Enabled      Redis Disabled
         (with fallback)    (Direct to DB)
```

## Cache Stores

### 1. LLM PolicyStore

**Purpose**: Cache tenant LLM routing policies (model selection, egress controls)
**Schema**: `copilot_internal.tenant_llm_policies`
**TTL**: 300 seconds (5 minutes)
**Individual Flag**: `ENABLE_LLM_POLICY_CACHE` (default: true)

```
┌─────────────────────────────────────────────────┐
│         CachingPolicyStore                      │
│  ┌───────────────────────────────────────────┐ │
│  │ Cache Key: copilot:llm:policy:{tenantId} │ │
│  │ Value: TenantLlmPolicy (JSON)             │ │
│  │ TTL: 300s                                  │ │
│  └───────────────────────────────────────────┘ │
│           │                                     │
│           │ Wraps (Decorator Pattern)          │
│           ▼                                     │
│  ┌───────────────────────────────────────────┐ │
│  │     SupabasePolicyStore                   │ │
│  │  Table: copilot_internal.tenant_llm_policies │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Operations:
✓ getPolicy(tenantId) → Read-through cache
✓ setPolicy(policy) → Write to Supabase, invalidate cache
✓ Redis failure → Automatic fallback to Supabase
```

### 2. ConversationConfigStore

**Purpose**: Cache conversation compression/compaction config (global/tenant/user hierarchy)
**Schema**: `copilot_internal.conversation_configs`
**TTL**: 300 seconds (5 minutes)
**Individual Flag**: `ENABLE_CONVERSATION_CONFIG_CACHE` (default: true)

```
┌─────────────────────────────────────────────────┐
│   CachingConversationConfigStore                │
│  ┌───────────────────────────────────────────┐ │
│  │ Cache Key: copilot:conv:config:{tenantId}│ │
│  │         or copilot:conv:config:{tenant}:  │ │
│  │            {userId} (for user-specific)   │ │
│  │ Value: ConversationConfig (JSON)          │ │
│  │ TTL: 300s                                  │ │
│  └───────────────────────────────────────────┘ │
│           │                                     │
│           ▼                                     │
│  ┌───────────────────────────────────────────┐ │
│  │  SupabaseConversationConfigStore          │ │
│  │  Table: copilot_internal.conversation_configs │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Hierarchical Config:
User Config > Tenant Config > Global Default

Operations:
✓ getConfig({tenantId, userId?}) → Read-through cache
✓ setTenantConfig() → Write to Supabase, invalidate tenant cache
✓ setUserConfig() → Write to Supabase, invalidate user cache
✓ Redis failure → Automatic fallback to Supabase
```

### 3. ConversationStore

**Purpose**: Cache active conversation metadata (opt-in for high traffic)
**Schema**: `public.conversations`
**TTL**: 60 seconds (1 minute - shorter for active data)
**Individual Flag**: `ENABLE_CONVERSATION_CACHING` (default: **false** - opt-in)

```
┌─────────────────────────────────────────────────┐
│      CachingConversationStore                   │
│  ┌───────────────────────────────────────────┐ │
│  │ Cache Key: copilot:conv:conversation:     │ │
│  │            {conversationId}                │ │
│  │ Value: ConversationRecord (JSON)          │ │
│  │ TTL: 60s (shorter - frequently updated)   │ │
│  │ Security: Tenant validation on read       │ │
│  └───────────────────────────────────────────┘ │
│           │                                     │
│           ▼                                     │
│  ┌───────────────────────────────────────────┐ │
│  │    SupabaseConversationStore              │ │
│  │    Table: public.conversations            │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Security:
✓ Cached data includes tenantId
✓ On cache read: Verify record.tenantId === request.tenantId
✓ Tenant mismatch → Invalidate cache, refetch from DB

Cache Invalidation Triggers:
✓ appendMessage() → Conversation modified
✓ updateSharing() → Sharing state changed
✓ setArchivedState() → Archive status changed
✓ softDeleteMessage() → Message deleted

Operations:
✓ getConversation({tenantId, conversationId}) → Read-through with tenant check
✓ All write operations → Invalidate cache after write
✓ Redis failure → Automatic fallback to Supabase
```

### 4. Redis Event Hubs

**Purpose**: Distributed SSE event distribution across multiple app instances
**TTL**: N/A (pub/sub, not caching)
**Individual Flag**: `ENABLE_REDIS_EVENT_HUBS` (default: true)

```
┌─────────────────────────────────────────────────┐
│      RedisConversationEventHub                  │
│  ┌───────────────────────────────────────────┐ │
│  │ Channel: copilot:events:conversation:     │ │
│  │          {conversationId}                  │ │
│  │ Pattern: Pub/Sub                           │ │
│  └───────────────────────────────────────────┘ │
│           │                                     │
│           │ Fallback if Redis disabled:        │
│           ▼                                     │
│  ┌───────────────────────────────────────────┐ │
│  │  SupabaseRealtimeConversationEventHub     │ │
│  │  Uses Supabase Realtime subscriptions     │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Use Cases:
✓ Broadcast new messages to all connected clients
✓ Notify conversation list updates
✓ Coordinate multi-instance SSE streams

Fallback:
✓ Redis enabled → Fast, scalable pub/sub
✓ Redis disabled → Supabase Realtime (slightly higher latency)
```

### 5. Auth Validation Cache

**Purpose**: Cache user authentication validation results
**Backend**: ioredis (different from @upstash/redis)
**TTL**: 300 seconds (5 minutes)
**Individual Flag**: `ENABLE_AUTH_VALIDATION_CACHE` (default: true)

```
┌─────────────────────────────────────────────────┐
│         RedisCache (ioredis)                    │
│  ┌───────────────────────────────────────────┐ │
│  │ Cache Key: auth:validation:{userId}       │ │
│  │ Value: {isValid, timestamp, tenantId}     │ │
│  │ TTL: 300s                                  │ │
│  └───────────────────────────────────────────┘ │
│           │                                     │
│           │ Fallback if Redis unavailable:     │
│           ▼                                     │
│  ┌───────────────────────────────────────────┐ │
│  │      InMemoryCache (LRU)                  │ │
│  │  Max Size: 10,000 users                   │ │
│  │  TTL: 300s                                 │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Multi-Instance Behavior:
✓ Redis enabled → Shared cache across all instances
✓ Redis disabled → Each instance has own in-memory cache
✓ No errors thrown regardless of Redis state
```

### 6. Rate Limiter

**Purpose**: Distributed rate limiting for API endpoints
**Backend**: @upstash/ratelimit
**TTL**: Sliding window (configurable, default 60s)
**Individual Flag**: `ENABLE_RATE_LIMITER_REDIS` (default: true)

```
┌─────────────────────────────────────────────────┐
│         RedisRateLimiter                        │
│  ┌───────────────────────────────────────────┐ │
│  │ Key Pattern: ratelimit:client-telemetry:  │ │
│  │              {identifier}                  │ │
│  │ Algorithm: Sliding Window                 │ │
│  │ Analytics: Enabled                         │ │
│  └───────────────────────────────────────────┘ │
│           │                                     │
│           │ Fallback if Redis unavailable:     │
│           ▼                                     │
│  ┌───────────────────────────────────────────┐ │
│  │      MemoryRateLimiter                    │ │
│  │  WARNING: Not suitable for multi-instance │ │
│  │  Each instance has independent counters   │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Multi-Instance Behavior:
✓ Redis enabled → Accurate cross-instance rate limiting
✓ Redis disabled → Per-instance limits (less accurate)
✓ No errors thrown regardless of Redis state
```

## Two-Tier Control System

### Global Kill Switch

**`ENABLE_REDIS_CACHING`** (default: `true`)

Disables **ALL** Redis usage across the entire application when set to `false`.

```bash
# Emergency disable all Redis (disaster recovery)
ENABLE_REDIS_CACHING=false

# Normal operation (default)
ENABLE_REDIS_CACHING=true
```

**Effect when false:**
- All cache stores fall back to direct Supabase queries
- Event hubs fall back to Supabase Realtime
- Auth validation uses in-memory cache
- Rate limiter uses in-memory implementation
- **No application errors - completely transparent**

### Individual Cache Flags

Each cache can be disabled independently:

| Flag | Default | Purpose |
|------|---------|---------|
| `ENABLE_LLM_POLICY_CACHE` | `true` | LLM policy caching |
| `ENABLE_CONVERSATION_CONFIG_CACHE` | `true` | Conversation config caching |
| `ENABLE_CONVERSATION_CACHING` | `false` | Conversation metadata (opt-in) |
| `ENABLE_REDIS_EVENT_HUBS` | `true` | Redis pub/sub for SSE |
| `ENABLE_AUTH_VALIDATION_CACHE` | `true` | Auth validation caching |
| `ENABLE_RATE_LIMITER_REDIS` | `true` | Distributed rate limiting |

**Control Logic:**
```
Cache Enabled = ENABLE_REDIS_CACHING (global)
                AND
                Individual Flag
                AND
                Redis Credentials Available
```

### Configuration Matrix

| Global | Individual | Redis Available | Result |
|--------|-----------|-----------------|--------|
| `true` | `true` | ✅ | ✅ **Redis Caching Active** |
| `true` | `true` | ❌ | ❌ Fallback to DB/Memory |
| `true` | `false` | ✅ | ❌ Cache disabled (individual) |
| `false` | `true` | ✅ | ❌ Cache disabled (global kill switch) |
| `false` | `false` | ✅ | ❌ Cache disabled (both) |

## Transparent Redis Failures

### Failure Handling Strategy

All Redis operations use **try-catch with silent fallback**:

```typescript
async getPolicy(tenantId: string): Promise<TenantLlmPolicy | null> {
  const key = this.cacheKey(tenantId);

  // Try Redis cache
  try {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as TenantLlmPolicy;
  } catch (error) {
    // Redis failed - log for monitoring, continue to backing store
    logger.warn({ tenantId, error }, 'Redis cache read failed, falling back to backing store');
  }

  // Fetch from Supabase (always works)
  const policy = await this.backing.getPolicy(tenantId);

  // Try to populate cache (best effort, ignore failures)
  if (policy) {
    try {
      await this.redis.setex(key, this.ttlSeconds, JSON.stringify(policy));
    } catch (error) {
      logger.warn({ tenantId, error }, 'Redis cache write failed');
    }
  }

  return policy;
}
```

### Failure Scenarios

| Scenario | Behavior | Impact |
|----------|----------|--------|
| Redis connection timeout | Log warning, query Supabase | Slightly higher latency |
| Redis network partition | Log warning, query Supabase | No errors, works normally |
| Redis out of memory | Log warning, query Supabase | No data loss |
| Redis crash/restart | Log warning, query Supabase | Transparent recovery |
| Redis authentication failure | Log warning, query Supabase | Application continues |

### Monitoring

Redis failures are **logged but not thrown**:

```json
{
  "level": "warn",
  "scope": "PolicyStore",
  "tenantId": "tenant-123",
  "error": "Redis connection timeout",
  "message": "Redis cache read failed, falling back to backing store"
}
```

**Health endpoints should monitor these warnings to alert on Redis issues.**

The application never fails due to Redis - it only logs warnings for operational visibility.

## Cache Invalidation Strategy

### Write-Through Pattern

All stores use **write-through caching**:

1. **Write to Supabase first** (source of truth)
2. **Invalidate Redis cache** (delete key)
3. **Next read** will repopulate cache from Supabase

```
Write Request
    │
    ▼
Supabase Write (MUST succeed)
    │
    ▼
Redis DEL key (best effort, ignore failures)
    │
    ▼
Return Success
```

### Invalidation Triggers

| Store | Write Operations | Invalidation |
|-------|-----------------|--------------|
| PolicyStore | `setPolicy()` | Delete `copilot:llm:policy:{tenantId}` |
| ConversationConfigStore | `setTenantConfig()` | Delete `copilot:conv:config:{tenantId}` |
| ConversationConfigStore | `setUserConfig()` | Delete `copilot:conv:config:{tenantId}:{userId}` |
| ConversationStore | `appendMessage()` | Delete `copilot:conv:conversation:{conversationId}` |
| ConversationStore | `updateSharing()` | Delete `copilot:conv:conversation:{conversationId}` |
| ConversationStore | `setArchivedState()` | Delete `copilot:conv:conversation:{conversationId}` |
| ConversationStore | `softDeleteMessage()` | Delete `copilot:conv:conversation:{conversationId}` |

### Why Write-Through?

**Pros:**
- Simple, predictable behavior
- No risk of stale cache data
- Supabase is always source of truth
- Cache failures don't cause data inconsistency

**Cons:**
- Extra latency for writes (Redis DELETE operation)
- Next read will be slower (cache miss)

This tradeoff favors **consistency and reliability** over write performance.

## Configuration

### Production (High Traffic)

```bash
# Enable all caching for optimal performance
ENABLE_REDIS_CACHING=true
ENABLE_LLM_POLICY_CACHE=true
ENABLE_CONVERSATION_CONFIG_CACHE=true
ENABLE_CONVERSATION_CACHING=true  # Opt-in for high traffic
ENABLE_REDIS_EVENT_HUBS=true
ENABLE_AUTH_VALIDATION_CACHE=true
ENABLE_RATE_LIMITER_REDIS=true

# Redis credentials (standard Redis)
REDIS_URL=redis://...
REDIS_PASSWORD=...

# Or Upstash-compatible credentials using shared variable names
# REDIS_URL=https://...
# REDIS_PASSWORD=upstash_token
```

### Production (Moderate Traffic)

```bash
# Enable config caching, skip conversation caching
ENABLE_REDIS_CACHING=true
# Individual flags default to true, except:
# ENABLE_CONVERSATION_CACHING=false (default)

# Redis credentials (standard Redis)
REDIS_URL=redis://...
REDIS_PASSWORD=...
```

### Development / Testing

```bash
# No Redis - everything works with in-memory/direct DB
# (Don't set Redis credentials)
```

### Disaster Recovery (Redis Outage)

```bash
# Emergency kill switch
ENABLE_REDIS_CACHING=false

# All systems continue operating with degraded performance
```

### Debugging Specific Cache

```bash
# Keep global enabled, disable problematic cache
ENABLE_REDIS_CACHING=true
ENABLE_LLM_POLICY_CACHE=false  # Disable only this cache

# Other caches remain active
```

## Testing

### Test Coverage

All stores have comprehensive tests validating:

✅ **Cache Enabled**: Correct cache hit/miss behavior
✅ **Cache Disabled**: Direct database queries work
✅ **Redis Failures**: Graceful fallback to Supabase
✅ **No Errors**: Never throws on Redis failure
✅ **Cache Invalidation**: All write operations invalidate correctly
✅ **Security**: Tenant validation on cached data
✅ **Concurrent Operations**: No race conditions

### Running Tests

```bash
# PolicyStore tests
pnpm --filter @reg-copilot/reg-intel-llm test policyStores.test.ts

# ConversationConfigStore tests
pnpm --filter @reg-copilot/reg-intel-conversations test conversationConfig.test.ts

# ConversationStore tests
pnpm --filter @reg-copilot/reg-intel-conversations test conversationStoresCaching.test.ts
```

### Test Files

- `packages/reg-intel-llm/src/policyStores.test.ts` (16 tests)
- `packages/reg-intel-conversations/src/conversationConfig.test.ts`
- `packages/reg-intel-conversations/src/conversationStoresCaching.test.ts`

## Summary

### Key Principles

1. **Redis is Optional**: Application works perfectly without Redis
2. **Graceful Degradation**: Redis failures are transparent
3. **Zero Downtime**: No errors thrown on Redis issues
4. **Multi-Instance Safe**: Distributed caching when Redis is available
5. **Flexible Control**: Global kill switch + individual cache flags
6. **Write-Through**: Supabase is always source of truth
7. **Monitored**: Redis warnings logged for operational visibility

### Benefits

- **Performance**: Reduced database load with caching
- **Scalability**: Horizontal scaling with shared cache
- **Reliability**: Continues working during Redis outages
- **Flexibility**: Fine-grained cache control
- **Debuggability**: Easy to disable problematic caches
- **Safety**: No data loss on Redis failures

### Operational Recommendations

1. **Monitor Redis warnings** in logs for operational issues
2. **Use global kill switch** for emergency Redis disabling
3. **Enable conversation caching** only for high-traffic scenarios
4. **Set up Redis failover** for production reliability
5. **Test Redis failure scenarios** in staging
6. **Monitor cache hit rates** for optimization
