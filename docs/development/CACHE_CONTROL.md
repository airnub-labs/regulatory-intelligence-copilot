# Cache Control Configuration

This document describes how to control Redis caching for production deployments.

## Overview

The application uses Redis caching across multiple systems to improve performance in multi-instance deployments:

1. **LLM PolicyStore** - Tenant LLM routing policies (5 min TTL)
2. **ConversationConfigStore** - Conversation configuration (5 min TTL)
3. **ConversationStore** - Active conversation metadata (1 min TTL)
4. **Redis Event Hubs** - SSE distribution across instances
5. **Auth Validation Cache** - User authentication validation (5 min TTL)
6. **Rate Limiter** - Client telemetry rate limiting

## Cache Control Architecture

The application uses a **two-tier flag system** for maximum flexibility:

1. **Global Kill Switch** (`ENABLE_REDIS_CACHING`) - Disables ALL Redis uses across the application
2. **Individual Flags** - Enable/disable specific caches independently

**Both conditions must be true for any cache to be enabled:**
- `ENABLE_REDIS_CACHING=true` (global) **AND**
- Individual cache flag enabled (e.g., `ENABLE_LLM_POLICY_CACHE=true`)

This pattern supports:
- **Development**: Disable all Redis with one flag
- **Disaster Recovery**: Emergency kill switch for all caching
- **Granular Control**: Disable problematic caches individually
- **Production Flexibility**: Mix and match caching strategies

## Environment Variables

### Global Kill Switch

**`ENABLE_REDIS_CACHING`** (default: `true`)

Global kill switch to disable **ALL** Redis caching across the entire application.

- **Default**: `true` (caching enabled if individual flags also enabled)
- **To disable ALL caching**: Set `ENABLE_REDIS_CACHING=false`
- **Use Cases**:
  - Development/debugging
  - Disaster recovery (e.g., Redis outage)
  - Testing database performance without cache layer

```bash
# Disable ALL Redis caching across the application
ENABLE_REDIS_CACHING=false

# Enable Redis caching (default, can be omitted)
ENABLE_REDIS_CACHING=true
```

**Important**: Setting this to `false` disables ALL individual caches regardless of their individual flags.

### Individual Cache Flags

Each cache system has its own enable/disable flag. All default to `true` except `ENABLE_CONVERSATION_CACHING`.

**`ENABLE_LLM_POLICY_CACHE`** (default: `true`)

Enable/disable LLM policy caching specifically.

```bash
# Disable LLM policy cache only
ENABLE_LLM_POLICY_CACHE=false
```

**`ENABLE_CONVERSATION_CONFIG_CACHE`** (default: `true`)

Enable/disable conversation config caching specifically.

```bash
# Disable conversation config cache only
ENABLE_CONVERSATION_CONFIG_CACHE=false
```

**`ENABLE_CONVERSATION_CACHING`** (default: `false`)

Enable/disable conversation metadata caching (opt-in due to write overhead).

```bash
# Enable conversation caching (opt-in)
ENABLE_CONVERSATION_CACHING=true
```

**`ENABLE_REDIS_EVENT_HUBS`** (default: `true`)

Enable/disable Redis-backed event hubs for SSE distribution.

```bash
# Disable Redis event hubs (falls back to Supabase Realtime)
ENABLE_REDIS_EVENT_HUBS=false
```

**`ENABLE_AUTH_VALIDATION_CACHE`** (default: `true`)

Enable/disable auth validation caching specifically.

```bash
# Disable auth validation cache only
ENABLE_AUTH_VALIDATION_CACHE=false
```

**`ENABLE_RATE_LIMITER_REDIS`** (default: `true`)

Enable/disable Redis-based rate limiting (falls back to in-memory).

```bash
# Disable Redis rate limiter (use in-memory)
ENABLE_RATE_LIMITER_REDIS=false
```

### Redis Credentials

**Required for any caching:**

```bash
# Upstash Redis (recommended)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Or standard Redis
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=...  # Optional
```

## Cache Behavior Matrix

### Two-Tier Control Example

| Global Flag | Individual Flag | Redis Available | Result |
|------------|----------------|-----------------|--------|
| `true` | `true` | ✅ Yes | ✅ **Cached** |
| `true` | `true` | ❌ No | ❌ Not cached (no credentials) |
| `true` | `false` | ✅ Yes | ❌ Not cached (individual flag disabled) |
| `false` | `true` | ✅ Yes | ❌ Not cached (global kill switch) |
| `false` | `false` | ✅ Yes | ❌ Not cached (both disabled) |

### Default Behavior (All Individual Flags Default True)

With default environment variables and Redis configured:

| Cache System | Global Flag | Individual Flag | Result |
|-------------|------------|----------------|--------|
| LLM PolicyStore | `true` | `true` | ✅ Cached |
| ConversationConfigStore | `true` | `true` | ✅ Cached |
| ConversationStore | `true` | `false` | ❌ Not cached (opt-in) |
| Redis Event Hubs | `true` | `true` | ✅ Active |
| Auth Validation Cache | `true` | `true` | ✅ Cached |
| Rate Limiter | `true` | `true` | ✅ Redis-backed |

### Global Kill Switch (`ENABLE_REDIS_CACHING=false`)

When global flag is disabled, ALL caches are disabled:

| Cache System | Global Flag | Individual Flag | Result |
|-------------|------------|----------------|--------|
| LLM PolicyStore | `false` | `true` | ❌ Not cached |
| ConversationConfigStore | `false` | `true` | ❌ Not cached |
| ConversationStore | `false` | `true` | ❌ Not cached |
| Redis Event Hubs | `false` | `true` | ❌ Falls back to Supabase Realtime |
| Auth Validation Cache | `false` | `true` | ❌ In-memory only |
| Rate Limiter | `false` | `true` | ❌ In-memory only |

## Use Cases

### Production (High Traffic)

Enable all caching for optimal performance:

```bash
# Global flag (default true, can be omitted)
ENABLE_REDIS_CACHING=true

# Individual flags (all default true except conversation)
ENABLE_LLM_POLICY_CACHE=true  # Can be omitted
ENABLE_CONVERSATION_CONFIG_CACHE=true  # Can be omitted
ENABLE_CONVERSATION_CACHING=true  # REQUIRED - opt-in
ENABLE_REDIS_EVENT_HUBS=true  # Can be omitted
ENABLE_AUTH_VALIDATION_CACHE=true  # Can be omitted
ENABLE_RATE_LIMITER_REDIS=true  # Can be omitted

# Redis credentials
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Production (Moderate Traffic)

Enable policy and config caching, skip conversation caching:

```bash
# All defaults work fine - just don't set ENABLE_CONVERSATION_CACHING
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Debugging All Caches

Disable all caching temporarily with global kill switch:

```bash
# Global kill switch disables ALL caches
ENABLE_REDIS_CACHING=false

# Redis credentials still required for fallback behavior
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Debugging Specific Cache

Disable only problematic cache:

```bash
# Keep global flag enabled
ENABLE_REDIS_CACHING=true

# Disable only the problematic cache
ENABLE_LLM_POLICY_CACHE=false  # Example: disable LLM policy cache

# Other caches remain enabled
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Disaster Recovery (Redis Outage)

Emergency disable all Redis usage:

```bash
# Global kill switch
ENABLE_REDIS_CACHING=false

# All systems fall back to:
# - In-memory caching (validation, rate limiting)
# - Direct database access (stores)
# - Supabase Realtime (event hubs)
```

### Development / Testing

Use in-memory stores (no Redis):

```bash
# Don't set Redis credentials
# All stores automatically fall back to in-memory
```

## When to Enable Conversation Caching

Enable `ENABLE_CONVERSATION_CACHING=true` when:

- ✅ High read volume on active conversations
- ✅ `getConversation()` calls are a bottleneck
- ✅ Supabase latency is affecting response times
- ✅ Multi-instance production deployment

**Do NOT enable** when:

- ❌ Write-heavy workload (frequent message appends)
- ❌ Low traffic / development environment
- ❌ Debugging conversation state issues

## Cache Invalidation

All data stores use **write-through caching** with automatic invalidation:

- **PolicyStore**: Cache invalidated on `setPolicy()`
- **ConversationConfigStore**: Cache invalidated on `setTenantConfig()`, `setUserConfig()`
- **ConversationStore**: Cache invalidated on `appendMessage()`, `updateSharing()`, `setArchivedState()`, `softDeleteMessage()`
- **Auth Validation Cache**: Manual invalidation via `invalidate(userId)` or automatic TTL expiration (5 min)
- **Rate Limiter**: Sliding window algorithm with automatic expiration

## Logging

The application logs which implementations are active on startup with detailed flag information:

```
[LlmRouterWiring] Using CachingPolicyStore (Supabase + Redis) {"globalCachingEnabled":true,"llmPolicyCacheEnabled":true,"cacheTtl":300}
[ConversationStoreWiring] Using CachingConversationConfigStore (Supabase + Redis) {"globalCachingEnabled":true,"conversationConfigCacheEnabled":true,"cacheTtl":300}
[ConversationStoreWiring] Using SupabaseConversationStore (no caching) {"reason":"conversation caching not enabled (set ENABLE_CONVERSATION_CACHING=true)"}
[ConversationStoreWiring] Using Redis-backed event hubs for distributed SSE {"globalCachingEnabled":true,"redisEventHubsEnabled":true}
[DistributedValidationCache] Initializing Redis distributed cache for multi-instance deployment {"globalCachingEnabled":true,"authValidationCacheEnabled":true}
[RateLimiter] Using Redis rate limiter (globalCaching=true, rateLimiterRedis=true)
```

If caching is disabled, the logs will indicate the specific reason:

```
# Global kill switch disabled
[LlmRouterWiring] Using SupabasePolicyStore (no caching) {"reason":"global caching disabled via ENABLE_REDIS_CACHING=false"}

# Individual flag disabled
[LlmRouterWiring] Using SupabasePolicyStore (no caching) {"reason":"LLM policy cache disabled via ENABLE_LLM_POLICY_CACHE=false"}

# Redis credentials missing
[LlmRouterWiring] Using SupabasePolicyStore (no caching) {"reason":"Redis credentials not configured"}
```

## Important Notes

1. **Global Kill Switch Affects Everything**: The `ENABLE_REDIS_CACHING=false` flag disables ALL Redis usage including:
   - All data caches (policy, config, conversation)
   - Redis event hubs (falls back to Supabase Realtime)
   - Auth validation cache (falls back to in-memory)
   - Rate limiter (falls back to in-memory)

2. **Default Behavior**: Most flags default to `true` except `ENABLE_CONVERSATION_CACHING` which defaults to `false` (opt-in). If not set, flags default to their documented defaults.

3. **Graceful Degradation**: All systems gracefully degrade when Redis is unavailable:
   - Data stores → Direct database access
   - Event hubs → Supabase Realtime
   - Auth validation → In-memory cache
   - Rate limiter → In-memory implementation

4. **Cache TTLs**:
   - PolicyStore: 300s (5 minutes)
   - ConversationConfigStore: 300s (5 minutes)
   - ConversationStore: 60s (1 minute) - shorter for active data
   - Auth Validation Cache: 300s (5 minutes)
   - Rate Limiter: Sliding window (configurable, default 60s)

5. **Production Recommendations**:
   - Always set Redis credentials for multi-instance deployments
   - Keep `ENABLE_REDIS_CACHING=true` (or omit for default)
   - Enable `ENABLE_CONVERSATION_CACHING=true` for high-traffic scenarios
   - Monitor cache hit rates and adjust TTLs as needed
   - Use individual flags to disable specific problematic caches

6. **Emergency Procedures**:
   - Redis outage → Set `ENABLE_REDIS_CACHING=false` to gracefully degrade
   - Specific cache issue → Disable individual flag (e.g., `ENABLE_LLM_POLICY_CACHE=false`)
   - All systems continue operating without Redis (performance degradation only)

## See Also

- [REDIS_CACHING_CONVENTIONS.md](./REDIS_CACHING_CONVENTIONS.md) - Caching implementation patterns
- [STORE_IMPLEMENTATION_PLAN.md](./STORE_IMPLEMENTATION_PLAN.md) - Complete implementation details
