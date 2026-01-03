# Fault-Tolerant Architecture Principles

**Date**: 2026-01-03
**Status**: Current
**Purpose**: Establish architectural principles for fault tolerance and prevent in-memory fallbacks

---

## 1. Core Principles

### 1.1 Fail-Safe, Not Fail-Silent

**Principle**: When external dependencies fail (Redis, Supabase, etc.), the system should fail in predictable, safe ways that:
- Do not accumulate memory
- Do not give false sense of security
- Provide clear monitoring/alerting opportunities
- Maintain honest behavior about capabilities

**Anti-Pattern**: In-memory fallbacks that:
- Grow unbounded during outages
- Break distributed coordination
- Hide failures behind degraded local behavior
- Risk OOM (Out of Memory) errors

---

### 1.2 Explicit Dependency Requirements

**Principle**: External dependencies should be explicitly required or optional, never hidden behind fallbacks.

**Required Dependencies** (system cannot function without):
- **Supabase**: All persistent storage (conversations, messages, paths, contexts, pricing, cost tracking)
- **LLM Providers**: AI functionality (configured via tenant policies)

**Optional Dependencies** (system degrades gracefully without):
- **Redis**: Caching and rate limiting (fail-through or fail-open without it)
- **OpenTelemetry Collector**: Observability forwarding (log but continue)
- **E2B**: Code execution (feature unavailable without it)

---

### 1.3 Fail-Open vs Fail-Closed

**Fail-Open (Permissive)**:
Use when denying access is worse than allowing uncontrolled access.
- **Rate Limiting**: Allow all requests when Redis down (better than random rate limiting per instance)
- **Non-Critical Caching**: Skip cache, hit database when Redis down

**Fail-Closed (Restrictive)**:
Use when incorrect behavior is worse than no service.
- **Pricing Data**: Throw error if Supabase unavailable (better than stale pricing)
- **Auth/Security**: Deny access if validation system fails
- **Critical Data**: Require persistence, don't accept local state

---

## 2. Prohibited Patterns

### 2.1 In-Memory Fallbacks for Distributed State

**❌ NEVER DO THIS**:
```typescript
// BAD: In-memory fallback for rate limiting
class MemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();

  async check(key: string): Promise<boolean> {
    // Problem: Each instance has own map, no coordination
    // Problem: Unbounded memory growth
    // Problem: False sense of rate limiting
  }
}

// BAD: In-memory fallback for caching
class MemoryCache {
  private cache = new Map<string, CachedValue>();

  async get(key: string): Promise<Value | null> {
    // Problem: Memory multiplied across N instances
    // Problem: Cache thrashing under load
    // Problem: No distributed benefit
  }
}
```

**✅ DO THIS INSTEAD**:
```typescript
// GOOD: Fail-open rate limiter
class NoOpRateLimiter {
  async check(key: string): Promise<boolean> {
    return true; // Always allow - honest about capabilities
  }
}

// GOOD: Fail-through cache
class NoOpCache {
  async get(key: string): Promise<Value | null> {
    return null; // Always miss - hit database
  }
}
```

**Rationale**:
- **Memory Safety**: No accumulation during outages
- **Honesty**: Clear that feature is disabled
- **Monitoring**: Easy to detect and alert on failures
- **Predictability**: Consistent behavior across instances

---

### 2.2 Static Data as Fallback for Dynamic Data

**❌ NEVER DO THIS**:
```typescript
// BAD: Fallback to static pricing
const DEFAULT_PRICING = {
  'gpt-4': { input: 30, output: 60 },
  // ... more models
};

async function getPricing(model: string) {
  try {
    return await supabase.getPricing(model);
  } catch (error) {
    return DEFAULT_PRICING[model]; // Goes stale quickly!
  }
}
```

**✅ DO THIS INSTEAD**:
```typescript
// GOOD: Require live pricing
async function getPricing(model: string) {
  const pricing = await supabase.getPricing(model);
  if (!pricing) {
    throw new Error(
      `Pricing not found for ${model}. ` +
      `Ensure pricing data is loaded in Supabase.`
    );
  }
  return pricing;
}
```

**Rationale**:
- Pricing changes frequently
- Stale pricing = incorrect billing
- Clear error = clear action (update Supabase)
- No silent degradation

---

### 2.3 Bounded In-Memory Collections with LRU Eviction

**❌ AVOID THIS** (unless truly justified):
```typescript
// QUESTIONABLE: Bounded in-memory store
class LRUCache {
  private cache = new Map<string, Value>();
  private maxSize = 10000;

  set(key: string, value: Value) {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest - adds complexity
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }
}
```

**Problems**:
- Complexity: LRU eviction logic
- Memory: maxSize × N instances
- Unpredictability: Which items get evicted?
- No coordination: Each instance evicts differently

**Only acceptable when**:
- Single-instance deployment
- Performance-critical path (e.g., token counting)
- Clear max size with monitoring
- Documented as performance optimization, not distributed cache

---

## 3. Acceptable In-Memory Usage

### 3.1 Performance Optimizations (Local-Only)

**✅ ACCEPTABLE**:
- **Token caching**: LRU cache to avoid re-tokenizing (CPU intensive)
- **Static configuration**: Tool registry, static pricing reference data (for seeding)
- **Computational state**: Anomaly detection history (time-series analysis)

**Requirements**:
- Must be documented as local optimization
- Must have clear max size
- Must not replace distributed coordination
- Must not be required for correctness

---

### 3.2 Per-Instance Stateful Features

**✅ ACCEPTABLE**:
- **SSE/WebSocket state**: Graph change subscriptions (inherently per-instance)
- **Connection pools**: E2B sandbox connections (cannot share across processes)
- **Request-scoped state**: Temporary data within a single request

**Requirements**:
- State cannot be shared across instances
- Cleanup on disconnect/timeout
- Documented as per-instance feature
- Metadata stored in database if needed later

---

### 3.3 Test-Only In-Memory Stores

**✅ ACCEPTABLE** (tests only):
- In-memory stores for unit/integration tests
- Must not be exported from packages
- Must be in `__tests__` directories or clearly marked
- Production code must use Supabase/Redis

---

## 4. Migration from In-Memory Fallbacks

### 4.1 Decision Tree

```
Is this in-memory state?
  ├─ NO → Use as-is
  └─ YES → Is it distributed state (caching, rate limiting, etc.)?
      ├─ NO → Is it per-instance state (SSE, connections)?
      │   ├─ YES → Keep, document as per-instance
      │   └─ NO → Is it performance optimization?
      │       ├─ YES → Keep with bounds, document
      │       └─ NO → Remove or redesign
      └─ YES → Does it need coordination across instances?
          ├─ YES → Requires Redis/external store
          │   └─ If Redis unavailable:
          │       ├─ Rate limiting → Fail-open (allow all)
          │       ├─ Caching → Fail-through (hit DB)
          │       └─ Other → Error or no-op
          └─ NO → Reconsider if distributed is needed
```

### 4.2 Replacement Patterns

| Old Pattern | New Pattern | Failure Mode |
|-------------|-------------|--------------|
| MemoryRateLimiter | NoOpRateLimiter | Fail-open (allow all) |
| MemoryCache (auth) | NoOpCache | Fail-through (hit DB) |
| DEFAULT_PRICING fallback | Error if not in Supabase | Fail-fast (clear error) |
| InMemoryConversationStore | SupabaseConversationStore | Fail-closed (require DB) |
| InMemoryPathStore | SupabasePathStore | Fail-closed (require DB) |

---

## 5. Monitoring & Alerting

### 5.1 Required Alerts

**Critical (P0 - Immediate Action)**:
- Supabase connection failures
- Pricing lookup failures (missing data)
- Auth validation system failures

**High (P1 - Within 1 Hour)**:
- Redis connection failures (rate limiting disabled)
- Redis connection failures (caching disabled)
- Increased database load due to cache bypass

**Medium (P2 - Within 4 Hours)**:
- High database query latency
- Connection pool saturation
- OTEL forwarding failures

### 5.2 Required Metrics

**Dependency Health**:
- `supabase_connection_status` (up/down)
- `redis_connection_status` (up/down)
- `rate_limiter_type` (redis | upstash | noop)
- `cache_type` (redis | noop)

**Performance**:
- `cache_hit_rate` (drops to 0% when Redis down)
- `database_query_duration` (increases when cache down)
- `rate_limit_checks_per_second`

**Failure Modes**:
- `pricing_lookup_errors` (count)
- `cache_bypass_count` (count)
- `rate_limit_bypass_count` (count)

---

## 6. Configuration Best Practices

### 6.1 Environment Variables

**Required (All Environments)**:
```bash
# Supabase - Required
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# LLM - Required for AI features
ANTHROPIC_API_KEY=...
# OR OPENAI_API_KEY=...
```

**Recommended (Production)**:
```bash
# Redis - For caching & rate limiting
REDIS_URL=...
REDIS_PASSWORD=...

# OR Upstash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# OpenTelemetry - For observability
OTEL_EXPORTER_OTLP_ENDPOINT=...
```

**Optional (Feature Flags)**:
```bash
# Disable specific caches (even with Redis)
ENABLE_AUTH_VALIDATION_CACHE=false
ENABLE_CONVERSATION_CACHING=false
ENABLE_RATE_LIMITER_REDIS=false

# Development only
NODE_ENV=development
```

### 6.2 Fail-Fast on Missing Required Config

**✅ DO THIS**:
```typescript
// Check at startup
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. ' +
    'See ENV_SETUP.md for configuration.'
  );
}
```

**❌ DON'T DO THIS**:
```typescript
// Silent fallback
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
```

---

## 7. Code Review Checklist

### 7.1 In-Memory Fallback Detection

When reviewing code, check for:

**❌ Red Flags**:
- `new Map()` or `new Set()` for distributed state
- `if (!redis) { /* in-memory fallback */ }`
- Static data as fallback for dynamic data
- LRU/cache eviction logic for distributed data
- "Fallback" or "default" patterns for external data

**✅ Green Flags**:
- `throw new Error()` when required data unavailable
- `return true` or `return null` for fail-open/fail-through
- Clear logging of degraded modes
- Monitoring/alerting integration
- Documentation of failure behavior

### 7.2 Questions to Ask

1. **Does this state need to be coordinated across instances?**
   - If YES → Redis or fail-open/fail-through
   - If NO → Verify it's truly local

2. **What happens during a Redis outage?**
   - Is the behavior predictable?
   - Will memory accumulate?
   - Is there a false sense of security?

3. **What happens with stale data?**
   - Could it cause incorrect billing?
   - Could it violate regulations?
   - Could it mislead users?

4. **How will we know when this fails?**
   - Logging?
   - Metrics?
   - Alerts?

---

## 8. Testing Strategy

### 8.1 Required Test Scenarios

**Unit Tests**:
- NoOpRateLimiter always returns true
- NoOpCache always returns null
- Error thrown when pricing not found

**Integration Tests**:
- System behavior when Redis unavailable
- System behavior when Supabase slow
- Database load without caching

**Load Tests**:
- Performance without Redis caching
- Rate limiter fail-open behavior
- Database connection pool under cache bypass

---

## 9. Summary

### 9.1 Decision Matrix

| Scenario | Pattern | Reason |
|----------|---------|--------|
| Redis down, need rate limiting | NoOpRateLimiter (fail-open) | Better than broken per-instance limits |
| Redis down, need caching | NoOpCache (fail-through) | Database can handle it |
| Supabase down, need pricing | Error (fail-fast) | Stale pricing = wrong bills |
| Supabase down, need conversations | Error (fail-fast) | Data loss unacceptable |
| SSE connections | Per-instance state | Cannot share connections |
| Token counting | Local LRU cache | Performance optimization |

### 9.2 Architecture Goals

**Achieved**:
- ✅ Predictable failure modes
- ✅ No memory accumulation
- ✅ Clear monitoring signals
- ✅ Honest about capabilities
- ✅ Scalable architecture

**Avoided**:
- ❌ Silent degradation
- ❌ False sense of security
- ❌ OOM risk during outages
- ❌ Stale data serving
- ❌ Hidden coordination issues

---

**Enforcement**: This document represents architectural decisions. Any PR introducing in-memory fallbacks for distributed state will be rejected. Any migration away from this pattern requires architectural review and justification.
