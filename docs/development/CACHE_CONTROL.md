# Cache Control Configuration

This document describes how to control Redis caching for production deployments.

## Overview

The application uses Redis caching for three stores to improve performance in multi-instance deployments:

1. **LLM PolicyStore** - Tenant LLM routing policies (5 min TTL)
2. **ConversationConfigStore** - Conversation configuration (5 min TTL)
3. **ConversationStore** - Active conversation metadata (1 min TTL)

## Environment Variables

### Global Cache Control

**`ENABLE_REDIS_CACHING`** (default: `true`)

Global flag to enable/disable **all** Redis caching across PolicyStore, ConversationConfigStore, and ConversationStore.

- **Default**: `true` (caching enabled if Redis credentials available)
- **To disable all caching**: Set `ENABLE_REDIS_CACHING=false`

```bash
# Disable all Redis caching (e.g., during debugging)
ENABLE_REDIS_CACHING=false

# Enable all Redis caching (default behavior, can be omitted)
ENABLE_REDIS_CACHING=true
```

### Per-Store Cache Control

**`ENABLE_CONVERSATION_CACHING`** (default: `false`)

Additional opt-in flag specifically for ConversationStore caching.

- **Default**: `false` (ConversationStore caching disabled by default)
- **To enable**: Set `ENABLE_CONVERSATION_CACHING=true`
- **Note**: Requires `ENABLE_REDIS_CACHING=true` (or unset) to work

```bash
# Enable conversation caching (in addition to global flag)
ENABLE_CONVERSATION_CACHING=true
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

| ENABLE_REDIS_CACHING | ENABLE_CONVERSATION_CACHING | Redis Available | PolicyStore | ConfigStore | ConversationStore |
|---------------------|----------------------------|-----------------|-------------|-------------|-------------------|
| `true` (default) | `false` (default) | ✅ Yes | ✅ Cached | ✅ Cached | ❌ Not cached |
| `true` (default) | `true` | ✅ Yes | ✅ Cached | ✅ Cached | ✅ Cached |
| `false` | `true` | ✅ Yes | ❌ Not cached | ❌ Not cached | ❌ Not cached |
| `true` (default) | `false` (default) | ❌ No | ❌ Not cached | ❌ Not cached | ❌ Not cached |

## Use Cases

### Production (High Traffic)

Enable all caching for optimal performance:

```bash
ENABLE_REDIS_CACHING=true  # Can be omitted (default)
ENABLE_CONVERSATION_CACHING=true  # Opt-in for conversation caching
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Production (Moderate Traffic)

Enable policy and config caching, skip conversation caching:

```bash
# ENABLE_REDIS_CACHING=true  # Default, can be omitted
# ENABLE_CONVERSATION_CACHING=false  # Default, can be omitted
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Debugging / Troubleshooting

Disable all caching temporarily:

```bash
ENABLE_REDIS_CACHING=false
# Redis credentials still required for event hubs (SSE distribution)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
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

All stores use **write-through caching**:

- **PolicyStore**: Cache invalidated on `setPolicy()`
- **ConversationConfigStore**: Cache invalidated on `setTenantConfig()`, `setUserConfig()`
- **ConversationStore**: Cache invalidated on `appendMessage()`, `updateSharing()`, `setArchivedState()`, `softDeleteMessage()`

## Logging

The application logs which store implementations are active on startup:

```
[LlmRouterWiring] Using CachingPolicyStore (Supabase + Redis)
[ConversationStoreWiring] Using CachingConversationConfigStore (Supabase + Redis)
[ConversationStoreWiring] Using SupabaseConversationStore (no caching)
```

If caching is disabled, the logs will indicate why:

```
[LlmRouterWiring] Using SupabasePolicyStore (no caching) - reason: "global caching disabled via ENABLE_REDIS_CACHING=false"
```

## Important Notes

1. **Event Hubs Not Affected**: The `ENABLE_REDIS_CACHING` flag does NOT affect Redis-backed event hubs (used for SSE distribution). Event hubs remain active even when caching is disabled.

2. **Default Behavior**: If `ENABLE_REDIS_CACHING` is not set, it defaults to `true`. To disable caching, you must explicitly set `ENABLE_REDIS_CACHING=false`.

3. **Graceful Degradation**: If Redis becomes unavailable at runtime, stores gracefully degrade to direct database access without crashing.

4. **Cache TTLs**:
   - PolicyStore: 300s (5 minutes)
   - ConversationConfigStore: 300s (5 minutes)
   - ConversationStore: 60s (1 minute) - shorter for active data

## See Also

- [REDIS_CACHING_CONVENTIONS.md](./REDIS_CACHING_CONVENTIONS.md) - Caching implementation patterns
- [STORE_IMPLEMENTATION_PLAN.md](./STORE_IMPLEMENTATION_PLAN.md) - Complete implementation details
