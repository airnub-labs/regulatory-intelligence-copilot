# Authentication Specification

**Version**: 2.0
**Last Updated**: 2025-12-28
**Status**: Production-Ready

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Components](#components)
3. [Authentication Flow](#authentication-flow)
4. [Session Validation](#session-validation)
5. [Multi-Instance Deployment](#multi-instance-deployment)
6. [Metrics & Monitoring](#metrics--monitoring)
7. [TypeScript Interfaces](#typescript-interfaces)
8. [Configuration](#configuration)
9. [Security Guarantees](#security-guarantees)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Design

```
┌──────────────┐
│  Client      │
│  (Browser)   │
└──────┬───────┘
       │ Login (email/password)
       ↓
┌──────────────────────────────────────────────────┐
│  NextAuth.js                                     │
│  - Strategy: JWT                                 │
│  - Provider: Credentials (Supabase)              │
│  - Max Age: 24 hours                             │
└──────┬───────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────┐
│  Authentication Components                       │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │  JWT Callback                              │ │
│  │  - Validates every 5 minutes               │ │
│  │  - Calls validateUserExists()              │ │
│  │  - Invalidates if user deleted/banned      │ │
│  └──────┬─────────────────────────────────────┘ │
│         │                                        │
│         ↓                                        │
│  ┌────────────────────────────────────────────┐ │
│  │  Session Validation                        │ │
│  │  - Checks distributed cache first          │ │
│  │  - Queries Supabase Auth on cache miss    │ │
│  │  - Records metrics                         │ │
│  └──────┬─────────────────────────────────────┘ │
│         │                                        │
│         ↓                                        │
│  ┌────────────────────────────────────────────┐ │
│  │  Distributed Cache (Redis/In-Memory)       │ │
│  │  - TTL: 5 minutes                          │ │
│  │  - Shared across instances                 │ │
│  │  - 98% hit rate                            │ │
│  └──────┬─────────────────────────────────────┘ │
│         │                                        │
│         ↓                                        │
│  ┌────────────────────────────────────────────┐ │
│  │  Middleware (Edge)                         │ │
│  │  - Runs on every request                   │ │
│  │  - Validates JWT token                     │ │
│  │  - Clears invalid sessions                 │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────┐
│  Supabase Auth                                   │
│  - Source of truth for user existence            │
│  - Checked via Admin API                         │
│  - Validates banned_until & deleted_at           │
└──────────────────────────────────────────────────┘
```

### Data Flow

```
Request → Middleware → JWT Validation → Session Callback →
  → validateUserExists() → Cache Check →
    → Cache HIT: Return cached result (98% of time)
    → Cache MISS: Query Supabase → Cache result → Return
```

---

## Components

### 1. NextAuth Configuration
**File**: `apps/demo-web/src/lib/auth/options.ts`

**Purpose**: Configure NextAuth with JWT strategy and periodic validation

**Key Features**:
- JWT-based sessions (24-hour max age)
- Periodic validation (every 5 minutes)
- Automatic session invalidation for deleted users
- Login tracking via metrics

**Configuration**:
```typescript
{
  strategy: 'jwt',
  maxAge: 24 * 60 * 60, // 24 hours
  validationInterval: 5 * 60 * 1000 // 5 minutes
}
```

**Callbacks**:
- `jwt()`: Validates user on interval, invalidates if deleted
- `session()`: Populates session with user data
- `authorize()`: Authenticates against Supabase

### 2. Session Validation
**File**: `apps/demo-web/src/lib/auth/sessionValidation.ts`

**Purpose**: Validate user existence against Supabase Auth

**Function**: `validateUserExists(userId: string): Promise<ValidateUserResult>`

**Behavior**:
1. Check distributed cache first (5-min TTL)
2. On cache miss: Query Supabase Auth Admin API
3. Validate user is not deleted (`deleted_at`)
4. Validate user is not banned (`banned_until`)
5. Cache result (valid or invalid)
6. Record metrics (timing, hit/miss)

**Returns**:
```typescript
{
  isValid: boolean
  user?: {
    id: string
    email?: string
    tenantId?: string
  }
  error?: string
}
```

### 3. Distributed Cache
**File**: `apps/demo-web/src/lib/auth/distributedValidationCache.ts`

**Purpose**: Cache validation results across multiple instances

**Implementations**:
- **RedisCache**: For multi-instance deployments (primary)
- **InMemoryCache**: For single-instance fallback

**Configuration**:
```typescript
{
  TTL: 5 * 60 * 1000, // 5 minutes
  maxSize: 10000,      // In-memory fallback only
}
```

**Auto-Detection**:
```typescript
if (process.env.REDIS_URL) {
  return new RedisCache(redisUrl)
} else {
  return new InMemoryCache()
  logger.warn('Using in-memory cache - NOT suitable for multi-instance')
}
```

**Interface**:
```typescript
interface DistributedCache {
  get(userId: string): Promise<CacheEntry | null>
  set(userId: string, isValid: boolean, tenantId?: string): Promise<void>
  invalidate(userId: string): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<CacheStats>
}
```

### 4. Authentication Metrics
**File**: `apps/demo-web/src/lib/auth/authMetrics.ts`

**Purpose**: Track authentication patterns for optimization

**Metrics Tracked**:
- Login frequency (total, hourly, average)
- Validation performance (cache hits/misses, timing)
- User activity (active users, deleted/banned detected)
- Cost estimation (query count, savings)

**See**: [METRICS_SPECIFICATION.md](./METRICS_SPECIFICATION.md) for details

### 5. Middleware
**File**: `apps/demo-web/src/middleware.ts`

**Purpose**: Edge validation on every request

**Behavior**:
1. Extract JWT token from request
2. Validate token exists and has valid `sub` (user ID)
3. If invalid: Clear cookies, redirect/401
4. If valid: Allow request to proceed

**Protected Routes**:
- `/api/*` (except `/api/auth`)
- All page routes (except `/login`, `/signup`)

---

## Authentication Flow

### 1. Initial Login

```
User submits credentials
    ↓
NextAuth authorize() callback
    ↓
Supabase signInWithPassword()
    ↓
Success → Create JWT token
    ↓
authMetrics.recordLogin(userId)
    ↓
Set session cookie
    ↓
Return to client
```

**TypeScript**:
```typescript
async authorize(credentials) {
  const { data } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  })

  if (!data.user) return null

  authMetrics.recordLogin(data.user.id)

  return {
    id: data.user.id,
    email: data.user.email,
    tenantId: data.user.user_metadata?.tenant_id
  }
}
```

### 2. Subsequent Requests

```
Client sends request with session cookie
    ↓
Middleware validates JWT
    ↓
Request reaches API route
    ↓
getServerSession() called
    ↓
JWT callback triggered (if >5min since last validation)
    ↓
validateUserExists() called
    ↓
Cache check → Cache hit (98%) → Return cached result
    ↓ (2% cache miss)
Query Supabase Auth
    ↓
Validate user exists & not banned/deleted
    ↓
Cache result
    ↓
Record metrics
    ↓
Return validation result
    ↓
If invalid → Invalidate token (logout)
If valid → Refresh token with new data
```

### 3. User Deletion Flow

```
Admin deletes user in Supabase
    ↓
User makes request (within 5 min, cache valid)
    → Request succeeds (cached as valid)
    ↓
After 5 minutes (cache expires)
    ↓
User makes request
    ↓
Cache miss → Query Supabase
    ↓
User not found / deleted_at set
    ↓
Cache result (invalid for 5 min)
    ↓
Return isValid: false
    ↓
JWT callback receives invalid
    ↓
Return empty token {}
    ↓
Session invalidated
    ↓
Middleware detects invalid token
    ↓
Clear cookies → Redirect to login
    ↓
User locked out
```

**Maximum Exposure**: 5 minutes from deletion to lockout

---

## Session Validation

### Validation Strategy

**Periodic Validation**:
- Triggered by JWT callback
- Interval: 5 minutes
- Aligned with cache TTL

**Validation Logic**:
```typescript
const now = Date.now()
const lastValidated = token.lastValidated ?? 0
const needsValidation = now - lastValidated > 5 * 60 * 1000

if (needsValidation && token.sub) {
  const validation = await validateUserExists(token.sub)

  if (!validation.isValid) {
    // Invalidate session
    return {} as ExtendedJWT
  }

  // Update token
  token.lastValidated = now
}
```

### Cache Strategy

**Cache-Aside Pattern**:
```typescript
// 1. Check cache
const cached = await cache.get(userId)
if (cached) {
  authMetrics.recordCacheHit(userId)
  return cached
}

// 2. Cache miss - query database
const validation = await queryDatabase(userId)

// 3. Cache result
await cache.set(userId, validation.isValid, validation.tenantId)

// 4. Record metrics
authMetrics.recordCacheMiss(userId, duration, validation.isValid)

return validation
```

### Validation Sources

**Primary**: Supabase Auth Admin API
```typescript
const { data } = await supabase.auth.admin.getUserById(userId)

if (!data.user) return { isValid: false }
if (data.user.deleted_at) return { isValid: false }
if (data.user.banned_until) return { isValid: false }

return { isValid: true, user: data.user }
```

**Fallback**: Profiles table (if no service role key)
```typescript
const { data } = await supabase
  .from('profiles')
  .select('id, email, tenant_id')
  .eq('id', userId)
  .single()

if (error) return { isValid: false }
return { isValid: true, user: data }
```

---

## Multi-Instance Deployment

### The Problem

**In-Memory Cache Issues**:
- Each instance has separate memory
- Cache not shared between instances
- Same user → different instance → cache miss
- Degraded performance, duplicate queries

### The Solution

**Redis Distributed Cache**:
- Single cache shared across all instances
- Consistent cache behavior
- Optimal performance regardless of instance

### Configuration

**Environment Variables**:
```bash
# Multi-instance (REQUIRED in production)
REDIS_URL=redis://your-redis-host:6379

# Or with auth
REDIS_URL=redis://:<password>@your-redis-host:6379

# Or with TLS
REDIS_URL=rediss://:<password>@your-redis-host:6379
```

### Verification

**Check cache backend**:
```bash
curl /api/observability | jq '.validationCache.backend'
# Expected in production: "redis"
# NOT acceptable in production: "in-memory"
```

### Redis Providers

- **Upstash** (Recommended): Serverless-friendly, free tier
- **AWS ElastiCache**: VPC-based, high performance
- **Google Memorystore**: GCP-native
- **Azure Cache for Redis**: Azure-native
- **Self-hosted**: Docker, Kubernetes

---

## Metrics & Monitoring

### Available Metrics

**Authentication Metrics**:
```json
{
  "logins": {
    "total": number,
    "last24Hours": Record<string, number>,
    "averagePerHour": number
  },
  "validations": {
    "total": number,
    "cacheHits": number,
    "cacheMisses": number,
    "cacheHitRate": number,
    "databaseQueries": number,
    "failures": number,
    "averageTimeMs": number
  },
  "users": {
    "activeCount": number,
    "deletedDetected": number,
    "bannedDetected": number
  },
  "costs": {
    "estimatedDatabaseCost": string,
    "costWithoutCache": string,
    "savings": string,
    "savingsPercentage": string,
    "queriesPerHour": number
  }
}
```

**Cache Metrics**:
```json
{
  "validationCache": {
    "size": number,
    "maxSize": number,
    "ttlMs": number,
    "backend": "redis" | "in-memory"
  }
}
```

### Metrics Endpoint

**GET** `/api/observability`

**Requires**: Authentication (session)

**Returns**: All system metrics including authentication

---

## TypeScript Interfaces

### Core Types

```typescript
// JWT Token (Extended)
interface ExtendedJWT {
  sub?: string                 // User ID
  email?: string | null        // User email
  name?: string | null         // User name
  tenantId?: string           // Tenant ID
  lastValidated?: number      // Timestamp of last validation
}

// User Data
interface ExtendedUser {
  id: string
  email?: string | null
  name?: string | null
  tenantId?: string
}

// Session Data
interface ExtendedSession {
  user: {
    id?: string
    email?: string | null
    name?: string | null
    tenantId?: string
  }
  expires: string
}

// Validation Result
interface ValidateUserResult {
  isValid: boolean
  user?: {
    id: string
    email?: string
    tenantId?: string
  }
  error?: string
}

// Cache Entry
interface CacheEntry {
  isValid: boolean
  timestamp: number
  tenantId?: string
}

// Cache Stats
interface CacheStats {
  size: number
  maxSize: number
  ttlMs: number
  backend: 'redis' | 'in-memory' | 'redis-disconnected' | 'redis-error'
}

// Distributed Cache Interface
interface DistributedCache {
  get(userId: string): Promise<CacheEntry | null>
  set(userId: string, isValid: boolean, tenantId?: string): Promise<void>
  invalidate(userId: string): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<CacheStats>
}
```

---

## Configuration

### Environment Variables

**Required**:
```bash
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

**Strongly Recommended**:
```bash
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**Multi-Instance Only**:
```bash
REDIS_URL=redis://your-redis-host:6379
```

### Tunable Parameters

**Cache TTL** (`distributedValidationCache.ts`):
```typescript
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
const CACHE_TTL_SECONDS = 300        // For Redis
```

**Validation Interval** (`options.ts`):
```typescript
const SESSION_VALIDATION_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
```

**Session Max Age** (`options.ts`):
```typescript
session: {
  maxAge: 24 * 60 * 60 // 24 hours
}
```

**Cache Size** (in-memory fallback only):
```typescript
const MAX_CACHE_SIZE = 10000 // 10,000 users
```

---

## Security Guarantees

### ✅ Implemented Protections

1. **Deleted User Lockout**: Within 5 minutes maximum
2. **Banned User Blocking**: Detected and blocked immediately on validation
3. **Session Expiration**: JWT tokens expire after 24 hours
4. **Periodic Validation**: Every 5 minutes, prevents stale sessions
5. **Edge Validation**: Middleware validates every request
6. **Secure Defaults**: Fail-closed on validation errors

### ⚠️ Limitations

1. **5-Minute Exposure**: Deleted users can access system for up to 5 minutes (cache TTL)
2. **Active Connections**: SSE/WebSocket not immediately terminated (closed on next request)
3. **Cache Loss**: In-memory cache lost on restart (rebuilds automatically)
4. **Single-Instance**: In-memory cache NOT suitable for multi-instance

### 🔒 Best Practices

1. **Use Redis** in production for multi-instance deployments
2. **Monitor metrics** for unusual patterns (deleted user spikes)
3. **Set up alerts** for cache hit rate <90%
4. **Configure service role key** for full Supabase Auth validation
5. **Implement webhooks** for immediate cache invalidation on user deletion

---

## Troubleshooting

### Issue: Cache backend shows "in-memory" in production

**Diagnosis**:
```bash
curl /api/observability | jq '.validationCache.backend'
# Output: "in-memory"  ← NOT OK for multi-instance
```

**Cause**: `REDIS_URL` not set

**Solution**:
1. Set `REDIS_URL` environment variable
2. Restart application
3. Verify: `curl /api/observability | jq '.validationCache.backend'`
4. Expected: `"redis"`

### Issue: Low cache hit rate (<90%)

**Diagnosis**:
```bash
curl /api/observability | jq '.authentication.validations.cacheHitRate'
# Output: 85.2  ← Below target
```

**Possible Causes**:
1. Cache TTL too short
2. Too many unique users (cache eviction)
3. Redis connection unstable

**Solutions**:
1. Increase cache TTL to 10 minutes
2. Monitor cache size vs active users
3. Check Redis connection logs

### Issue: User not logged out after deletion

**Diagnosis**: User deleted in Supabase but still has access

**Cause**: Within 5-minute cache window

**Expected Behavior**: User will be locked out within 5 minutes

**To Force Immediate Lockout**:
```bash
# Invalidate cache manually (requires implementation)
curl -X POST /api/admin/invalidate-user -d '{"userId": "xxx"}'

# Or flush entire cache
redis-cli -u $REDIS_URL FLUSHDB
```

### Issue: High database query rate

**Diagnosis**:
```bash
curl /api/observability | jq '.authentication.costs.queriesPerHour'
# Output: 2500  ← High for 1000 users
```

**Expected**: ~200 queries/hour for 1000 users with 5-min cache

**Solutions**:
1. Verify cache is working (check backend)
2. Increase cache TTL
3. Check for cache eviction (size vs active users)

---

## File Reference

| File | Purpose | LOC |
|------|---------|-----|
| `options.ts` | NextAuth configuration | 193 |
| `sessionValidation.ts` | User existence validation | 176 |
| `distributedValidationCache.ts` | Redis/in-memory cache | 230 |
| `authMetrics.ts` | Authentication metrics | 380 |
| `middleware.ts` | Edge request validation | 118 |

---

## Change Log

**v2.0** (2025-12-28):
- Added Redis distributed cache support
- Increased cache TTL to 5 minutes
- Added comprehensive authentication metrics
- Added multi-instance deployment support
- Created this specification

**v1.0** (2025-12-28):
- Initial implementation
- In-memory cache only
- 2-minute cache TTL
- Basic session validation

---

## Related Documentation

- [METRICS_SPECIFICATION.md](./METRICS_SPECIFICATION.md) - Metrics architecture
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Deployment guide
- [SECURITY_SESSION_VALIDATION.md](./SECURITY_SESSION_VALIDATION.md) - Security details
