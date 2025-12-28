# Session Validation Security Documentation

## Critical Security Issue Fixed

**Problem**: Users who were deleted from the database could still access the application indefinitely with their existing browser session. This occurred because JWT sessions were not validated against the database after initial login.

**Impact**: Deleted users could:
- Continue accessing all functionality
- Send and receive messages
- View the knowledge graph
- Access all API endpoints
- Maintain SSE/WebSocket connections

**Root Cause**: NextAuth was using JWT strategy without database validation, meaning sessions were self-contained and never checked if the user still existed.

---

## Solution Architecture

The solution implements **multi-layered session validation** with three security layers:

### Layer 1: Periodic JWT Validation (Primary Defense)
**File**: `apps/demo-web/src/lib/auth/options.ts`

- **Mechanism**: JWT callback validates user existence every 5 minutes
- **Implementation**:
  - Tracks `lastValidated` timestamp in JWT token
  - Calls `validateUserExists()` when validation interval expires
  - Invalidates token (returns empty object) if user not found
  - Updates token with fresh user data on successful validation

**Code Flow**:
```typescript
// JWT callback runs on every request with session
if (now - lastValidated > 5 minutes) {
  validation = await validateUserExists(userId)
  if (!validation.isValid) {
    return {} // Empty token = session invalidated
  }
  token.lastValidated = now
}
```

**Protection**:
- Deleted users locked out within 5 minutes
- Banned users cannot access system
- Stale sessions automatically invalidated

### Layer 2: Database User Validation
**File**: `apps/demo-web/src/lib/auth/sessionValidation.ts`

- **Mechanism**: Direct Supabase Auth API validation
- **Implementation**:
  - Uses Supabase Admin API (`auth.admin.getUserById()`)
  - Checks if user exists in `auth.users` table
  - Validates user is not banned (`banned_until`)
  - Validates user is not deleted (`deleted_at`)

**Code Flow**:
```typescript
async function validateUserExists(userId) {
  // Query Supabase Auth
  const { data } = await supabase.auth.admin.getUserById(userId)

  // Check existence
  if (!data.user) return { isValid: false }

  // Check banned/deleted status
  if (data.user.banned_until || data.user.deleted_at) {
    return { isValid: false }
  }

  return { isValid: true, user: data.user }
}
```

**Fallback**: If service role key not configured, validates via `profiles` table query.

### Layer 3: Edge Middleware Validation
**File**: `apps/demo-web/src/middleware.ts`

- **Mechanism**: Next.js middleware runs on EVERY request before hitting routes
- **Implementation**:
  - Validates JWT token exists and has valid `sub` (user ID)
  - Checks for empty or invalidated tokens (from Layer 1)
  - Clears session cookies for invalid sessions
  - Returns 401 for API routes, redirects to login for pages

**Code Flow**:
```typescript
// Middleware runs on every request
const token = await getToken({ req: request })

if (!token || !token.sub || token.sub === '') {
  // Clear session cookies
  response.cookies.delete('next-auth.session-token')

  // Redirect or 401
  return isApiRoute ? 401 : redirect('/login')
}
```

**Protection**:
- Catches invalidated sessions immediately
- Prevents deleted users from accessing ANY route
- Protects both API and page routes

---

## Security Configuration

### JWT Session Settings
```typescript
session: {
  strategy: 'jwt',
  maxAge: 24 * 60 * 60, // 24 hours (reduced from default 30 days)
}
```

**Rationale**: Shorter session lifetime limits exposure window. Combined with 5-minute validation, maximum exposure is 24 hours (if validation fails) vs unlimited with old configuration.

### Validation Interval
```typescript
const SESSION_VALIDATION_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
```

**Rationale**:
- **5 minutes** balances security vs database load
- Deleted users locked out in maximum 5 minutes
- Database queried once per user every 5 minutes (not on every request)
- Reduces load on Supabase Auth API

**Tuning**:
- Decrease for higher security (more DB queries)
- Increase for lower DB load (less frequent validation)
- Production recommendation: 2-5 minutes

---

## Endpoint-Level Validation

All API endpoints already implement session validation via `getServerSession()`:

### Standard API Routes
```typescript
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Handle request...
}
```

**Examples**:
- `/api/conversations/*` - All conversation endpoints
- `/api/graph` - Graph snapshot endpoint
- `/api/chat` - Chat/completion endpoint
- `/api/observability` - Diagnostics endpoint
- `/api/client-telemetry` - Telemetry endpoint

### Streaming Endpoints (SSE/WebSocket)

**Files**:
- `/api/conversations/[id]/stream` - Conversation events (SSE)
- `/api/graph/stream` - Graph patches (SSE/WebSocket)
- `/api/conversations/stream` - Conversation list events (SSE)

**Validation**:
```typescript
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Start SSE stream...
}
```

**Important Note**: Long-lived SSE/WebSocket connections are NOT terminated mid-stream when a user is deleted. They will be terminated when:
1. Client makes a new request (triggers middleware + JWT validation)
2. Connection naturally drops (network, timeout)
3. Client refreshes page

**Maximum Exposure**: 5 minutes (when next request triggers validation)

---

## Testing Session Validation

### Test Case 1: Deleted User Cannot Access API
```bash
# 1. User logs in and gets session
curl -X POST /api/auth/callback/credentials -d '{"email": "test@example.com", "password": "test"}'

# 2. Store session cookie from response

# 3. Verify access works
curl -H "Cookie: next-auth.session-token=..." /api/conversations
# Should return 200 OK

# 4. Delete user from Supabase
# (via Supabase dashboard or admin API)

# 5. Wait 5 minutes (validation interval)

# 6. Try to access API again
curl -H "Cookie: next-auth.session-token=..." /api/conversations
# Should return 401 Unauthorized
```

### Test Case 2: Banned User Cannot Access
```bash
# 1. User logs in
# 2. Admin bans user (sets banned_until)
# 3. Wait 5 minutes
# 4. User tries to access any endpoint
# Should return 401 Unauthorized
```

### Test Case 3: Session Invalidation on Page Load
```bash
# 1. User has active session
# 2. User is deleted
# 3. User refreshes page
# Should be redirected to /login (middleware catches invalid token)
```

---

## Environment Variables Required

### For Session Validation to Work
```bash
# NextAuth Configuration (Required)
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=https://your-domain.com

# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Supabase Admin Configuration (Recommended)
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Fallback Tenant ID
SUPABASE_DEMO_TENANT_ID=default
```

**Without Service Role Key**: Session validation falls back to `profiles` table query. This requires:
- A `public.profiles` table with `id`, `email`, `tenant_id` columns
- RLS policies allowing users to query their own profile

---

## Security Guarantees

### ✅ With These Changes
- Deleted users locked out within **5 minutes**
- Banned users cannot access system
- Stale sessions automatically invalidated
- All API routes protected by middleware
- All page routes redirect to login if unauthenticated
- Session validation logged for audit trail

### ⚠️ Limitations
- Active SSE/WebSocket connections not immediately terminated (max 5 min exposure)
- Requires Supabase Admin API access for full validation
- Database query every 5 minutes per active user (monitor Supabase quota)

### 🔒 Best Practices
1. **Monitor Supabase Auth API usage** - validation adds database queries
2. **Set appropriate JWT maxAge** - balance security vs user experience
3. **Tune validation interval** - 2-5 minutes recommended for production
4. **Implement user deletion webhooks** - can force logout immediately vs waiting for validation
5. **Log validation failures** - monitor for attack patterns

---

## Migration Notes

### Breaking Changes
None. This is a backward-compatible security enhancement.

### Deployment Checklist
1. ✅ Add `SUPABASE_SERVICE_ROLE_KEY` to environment variables
2. ✅ Deploy updated code
3. ✅ Monitor logs for session validation failures
4. ✅ Test user deletion flow
5. ✅ Verify middleware is running (check _middleware execution logs)

### Rollback Plan
If issues arise:
1. Revert `apps/demo-web/src/lib/auth/options.ts` (remove validation logic)
2. Delete `apps/demo-web/src/lib/auth/sessionValidation.ts`
3. Delete `apps/demo-web/src/middleware.ts`
4. Redeploy

---

## Related Security Issues

This fix also addresses:
- **OWASP A01:2021 - Broken Access Control**: Ensures access control checks are consistent and validated
- **OWASP A07:2021 - Identification and Authentication Failures**: Validates session against source of truth (database)
- **CWE-613: Insufficient Session Expiration**: Reduces session lifetime and adds periodic validation

---

## Change Log

**2025-12-28**: Initial implementation
- Added `sessionValidation.ts` utility
- Updated NextAuth callbacks with periodic validation
- Added Next.js middleware for edge validation
- Reduced JWT maxAge to 24 hours
- Set validation interval to 5 minutes

---

## Contact

For security issues or questions about session validation:
- Review this document
- Check implementation in source files
- Monitor application logs for validation failures
