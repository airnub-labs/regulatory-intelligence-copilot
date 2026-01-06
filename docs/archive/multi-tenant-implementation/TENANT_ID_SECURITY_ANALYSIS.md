# Tenant ID Security Vulnerability Analysis

**Severity**: 🔴 **CRITICAL**
**Date**: 2026-01-05
**Status**: ACTIVE VULNERABILITY - Immediate Action Required

---

## Executive Summary

A critical security vulnerability has been identified where users created without a `tenant_id` in Supabase are incorrectly granted access to the demo tenant's data through an unsafe fallback mechanism. This violates tenant isolation and could expose sensitive regulatory intelligence data.

**Impact**: Users without proper tenant assignment can view and modify data belonging to the demo tenant (ID: `b385a126-a82d-459a-a502-59c1bebb9eeb`).

---

## Vulnerability Details

### Root Cause

Throughout the application codebase (38 occurrences across 28 files), there is a dangerous fallback pattern:

```typescript
const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
```

This pattern exists in:
1. **Authentication layer** (`apps/demo-web/src/lib/auth/options.ts`)
   - Line 50: `fallbackTenantId` definition
   - Line 115: User authorization callback
   - Line 133: JWT token creation
   - Line 177: Token validation
   - Line 215: Session creation

2. **All API route handlers** (31 occurrences):
   - `/api/chat/route.ts:53`
   - `/api/conversations/*/route.ts` (multiple files)
   - `/api/graph/route.ts:86`
   - And 28 more route files

### Attack Vector

1. Administrator manually creates user in Supabase Admin UI
2. User is created **without** `tenant_id` in `user_metadata` or `app_metadata`
3. User authenticates successfully
4. Application assigns `SUPABASE_DEMO_TENANT_ID` as fallback
5. User gains full access to demo tenant's data

### Current State Analysis

#### What's Working (Database Layer)

The **database RLS policies are correctly designed**:

```sql
-- From migrations/20241114000000_conversations.sql
CREATE FUNCTION public.current_tenant_id()
RETURNS uuid AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'tenant_id'
  )::uuid;
$$;

CREATE POLICY conversations_tenant_read
  ON copilot_internal.conversations
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());
```

**Key observation**: `public.current_tenant_id()` returns `NULL` if no tenant_id in JWT, which would properly block access.

#### What's Broken (Application Layer)

The **application bypasses RLS** by:
1. Using `service_role` credentials (bypasses all RLS policies)
2. Implementing tenant filtering in application code
3. Using unsafe fallback to demo tenant ID

```typescript
// API routes use service_role which bypasses RLS
const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';

// Then queries with this tenantId directly
await conversationStore.listConversations({ tenantId, ... });
```

---

## Affected Systems

### Authentication Flow

**File**: `apps/demo-web/src/lib/auth/options.ts`

```typescript
// Line 112-116: authorize() callback
return {
  id: data.user.id,
  email: data.user.email,
  name: data.user.user_metadata?.full_name ?? data.user.email,
  tenantId:
    data.user.user_metadata?.tenant_id ??
    data.user.app_metadata?.tenant_id ??
    fallbackTenantId,  // ⚠️ UNSAFE FALLBACK
}
```

### Session Validation

**File**: `apps/demo-web/src/lib/auth/sessionValidation.ts`

The validation retrieves tenant_id from Supabase but doesn't enforce it:

```typescript
// Line 218: Retrieves tenantId from user metadata
const tenantId = (data.user.user_metadata?.tenant_id ??
                  data.user.app_metadata?.tenant_id) as string | undefined

// Returns undefined if not found, which triggers fallback in auth/options.ts
return {
  isValid: true,
  user: {
    id: data.user.id,
    email: data.user.email,
    tenantId,  // Can be undefined
  },
}
```

### All API Routes (31 files)

Every API route handler uses the same unsafe pattern:

```typescript
const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
```

**Affected routes**:
- `/api/chat` - Chat functionality
- `/api/conversations/*` - All conversation operations
- `/api/graph/*` - Graph operations
- Message, path, branch, compact operations - All exposed

---

## Data at Risk

Based on the schema migrations, the following tables are vulnerable:

1. **`copilot_internal.conversations`** - All demo tenant conversations
2. **`copilot_internal.conversation_messages`** - All demo tenant messages
3. **`copilot_internal.conversation_contexts`** - Context data
4. **`copilot_internal.conversation_paths`** - Conversation paths
5. **`copilot_internal.execution_contexts`** - E2B execution contexts
6. **`copilot_internal.llm_cost_records`** - Cost tracking data
7. **`copilot_internal.e2b_cost_records`** - E2B cost data
8. **`copilot_internal.tenant_llm_policies`** - LLM routing policies

All tables with `tenant_id` column filtering are affected when accessed via service_role with the fallback pattern.

---

## Compliance Impact

### Tenant Isolation Violation

**Requirement**: Each tenant's data must be completely isolated from other tenants.

**Current State**: ❌ **VIOLATED**

Users without proper tenant assignment can:
- View demo tenant's conversations
- Create conversations under demo tenant
- Modify demo tenant's data
- Access cost tracking information
- View LLM policies

### Audit Trail Impact

**Issue**: Actions performed by improperly tenanted users are logged under the demo tenant ID, making it impossible to:
- Track which actual user performed actions
- Audit data access properly
- Trace security incidents
- Meet compliance requirements

---

## Onboarding Gap Analysis

### Current Onboarding Process

**File**: `docs/operations/TENANT_ONBOARDING_CHECKLIST.md`

The checklist includes:
- ✅ Creating tenant ID
- ✅ Creating admin user
- ✅ Configuring quotas
- ❌ **MISSING**: How to assign `tenant_id` to users in Supabase

### Authentication Documentation

**File**: `apps/demo-web/docs/AUTH_SPECIFICATION.md`

The spec describes:
- ✅ How tenant_id is retrieved from JWT
- ✅ Session validation flow
- ❌ **MISSING**: How to ensure users have tenant_id set
- ❌ **MISSING**: What happens if tenant_id is missing

---

## Security Recommendations

### Immediate Actions (Priority 1 - Today)

1. **Identify Affected Users**
   ```sql
   -- Find users without tenant_id
   SELECT id, email,
          raw_user_meta_data->>'tenant_id' as user_tenant,
          raw_app_meta_data->>'tenant_id' as app_tenant
   FROM auth.users
   WHERE (raw_user_meta_data->>'tenant_id' IS NULL
          AND raw_app_meta_data->>'tenant_id' IS NULL)
     AND deleted_at IS NULL;
   ```

2. **Audit Demo Tenant Activity**
   ```sql
   -- Check for suspicious activity in demo tenant
   SELECT user_id, created_at, updated_at
   FROM copilot_internal.conversations
   WHERE tenant_id = 'b385a126-a82d-459a-a502-59c1bebb9eeb'
   ORDER BY created_at DESC;
   ```

3. **Temporarily Disable Affected Users** (if any found)
   - Lock accounts until proper tenant assignment completed
   - Review all actions taken by these users

### Short-Term Fix (Priority 2 - This Week)

#### Option A: Fail-Closed (Recommended)

**Change fallback behavior to reject users without tenant_id**:

```typescript
// apps/demo-web/src/lib/auth/options.ts

// Remove fallbackTenantId entirely
// const fallbackTenantId = process.env.SUPABASE_DEMO_TENANT_ID ?? 'default' // DELETE

// In authorize() callback:
const tenantId = data.user.user_metadata?.tenant_id ??
                 data.user.app_metadata?.tenant_id;

if (!tenantId) {
  logger.error({ userId: data.user.id }, 'User missing tenant_id - authentication denied');
  return null; // Deny login
}

return {
  id: data.user.id,
  email: data.user.email,
  tenantId: tenantId, // No fallback
};
```

**Impact**:
- ✅ Prevents security vulnerability
- ✅ Forces proper user provisioning
- ⚠️ Breaks login for users without tenant_id (acceptable - they shouldn't exist)

#### Option B: Explicit Demo User Flag (Alternative)

If demo users are intentionally created without tenant assignment:

```typescript
const isDemoUser = data.user.user_metadata?.is_demo_user === true;
const tenantId = data.user.user_metadata?.tenant_id ??
                 data.user.app_metadata?.tenant_id;

if (!tenantId && !isDemoUser) {
  logger.error({ userId: data.user.id }, 'User missing tenant_id');
  return null;
}

return {
  id: data.user.id,
  email: data.user.email,
  tenantId: tenantId ?? (isDemoUser ? process.env.SUPABASE_DEMO_TENANT_ID : null),
};
```

### Medium-Term Solution (Priority 3 - Next Sprint)

1. **Create Database Trigger for User Creation**

```sql
-- Migration: Validate tenant_id on user creation
CREATE OR REPLACE FUNCTION auth.validate_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if tenant_id exists in user_metadata or app_metadata
  IF (NEW.raw_user_meta_data->>'tenant_id' IS NULL
      AND NEW.raw_app_meta_data->>'tenant_id' IS NULL) THEN
    RAISE EXCEPTION 'User must have tenant_id in user_metadata or app_metadata';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_user_tenant_id
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.validate_new_user();
```

2. **Update Onboarding Documentation**

Add to `TENANT_ONBOARDING_CHECKLIST.md`:

```markdown
## Phase 1: Account Creation (UPDATED)

- [ ] **Create tenant in auth system**
- [ ] **Create initial admin user WITH tenant_id**:
  ```bash
  # Via Supabase Dashboard:
  # 1. Go to Authentication > Users > Add User
  # 2. Fill in email and password
  # 3. Under "User Metadata", add:
  #    {
  #      "tenant_id": "<TENANT_ID>",
  #      "full_name": "Admin User"
  #    }

  # Or via SQL:
  INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
  VALUES (
    'admin@tenant.com',
    crypt('password', gen_salt('bf')),
    jsonb_build_object('tenant_id', '<TENANT_ID>', 'full_name', 'Admin User')
  );
  ```

- [ ] **Verify tenant_id is set**:
  ```sql
  SELECT id, email,
         raw_user_meta_data->>'tenant_id' as tenant_id
  FROM auth.users
  WHERE email = 'admin@tenant.com';

  -- Expected: tenant_id column shows the UUID
  -- If NULL: ⚠️ STOP! User missing tenant_id!
  ```
```

3. **Add Pre-Authentication Validation**

Create middleware to validate tenant assignment before allowing any API access:

```typescript
// apps/demo-web/src/middleware.ts

export async function middleware(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (session?.user && !session.user.tenantId) {
    logger.error(
      { userId: session.user.id },
      'User session without tenant_id detected'
    );

    // Clear session and redirect
    return NextResponse.redirect(new URL('/auth/error?error=ConfigurationError', request.url));
  }

  // ... rest of middleware
}
```

### Long-Term Solution (Priority 4 - Next Quarter)

1. **Migrate to Proper Multi-Tenancy Architecture**

Consider implementing one of:
- **Database-level tenant isolation**: Separate database per tenant
- **Schema-level isolation**: Separate schema per tenant
- **Enhanced RLS**: Use authenticated role instead of service_role

2. **Implement Supabase Auth Hooks**

Use Supabase's auth hooks to enforce tenant assignment:

```typescript
// Auth hook: Before user creation
export const beforeUserCreate = async (req, res) => {
  const { user_metadata, app_metadata } = req.body;

  if (!user_metadata?.tenant_id && !app_metadata?.tenant_id) {
    return res.status(400).json({
      error: 'tenant_id required in user_metadata or app_metadata'
    });
  }

  return res.status(200).json({ user: req.body.user });
};
```

3. **Remove SUPABASE_DEMO_TENANT_ID Entirely**

After proper tenant assignment is enforced:
- Remove all fallback logic
- Remove environment variable
- Update all API routes to require valid tenant_id
- Add TypeScript non-nullable types for tenant_id

---

## Implementation Plan

### Phase 1: Assessment & Immediate Mitigation (Day 1)

- [ ] Run audit queries to identify affected users
- [ ] Review demo tenant activity logs
- [ ] Document any data exposure
- [ ] Disable affected user accounts if necessary
- [ ] Assign proper tenant_id to legitimate users

### Phase 2: Code Remediation (Day 2-3)

- [ ] Remove unsafe fallback from `auth/options.ts`
- [ ] Add tenant_id validation in authorize callback
- [ ] Update all API routes to fail if tenant_id missing
- [ ] Add logging for tenant_id validation failures
- [ ] Create migration script for existing users

### Phase 3: Testing & Validation (Day 4)

- [ ] Test user creation without tenant_id (should fail)
- [ ] Test user login without tenant_id (should fail)
- [ ] Test API access without tenant_id (should fail)
- [ ] Verify demo users with proper tenant_id still work
- [ ] Load test authentication flow

### Phase 4: Documentation (Day 5)

- [ ] Update `TENANT_ONBOARDING_CHECKLIST.md`
- [ ] Update `AUTH_SPECIFICATION.md`
- [ ] Create runbook for tenant assignment
- [ ] Document recovery procedures
- [ ] Create security incident report

### Phase 5: Deployment (Day 6-7)

- [ ] Deploy to staging environment
- [ ] Validate in staging
- [ ] Create rollback plan
- [ ] Deploy to production
- [ ] Monitor for authentication failures
- [ ] Communicate changes to operations team

---

## Testing Checklist

### Pre-Deployment Tests

- [ ] User without tenant_id cannot log in
- [ ] User with tenant_id in user_metadata can log in
- [ ] User with tenant_id in app_metadata can log in
- [ ] API routes reject requests with missing tenant_id
- [ ] Error messages are informative for debugging
- [ ] Logs capture tenant_id validation failures

### Post-Deployment Monitoring

- [ ] Watch authentication error rates
- [ ] Monitor for tenant_id validation failures
- [ ] Check that no users are assigned to demo tenant
- [ ] Verify tenant isolation in database queries
- [ ] Review security logs for anomalies

---

## Rollback Plan

If critical issues arise after deployment:

1. **Immediate Rollback**:
   ```bash
   # Revert code changes
   git revert <commit-hash>

   # Redeploy previous version
   vercel deploy --prod
   ```

2. **Temporary Workaround**:
   ```bash
   # If needed, temporarily restore fallback
   # But ONLY assign to a new isolated "unassigned" tenant
   SUPABASE_UNASSIGNED_TENANT_ID=<new-isolated-tenant-id>
   ```

3. **Communication**:
   - Notify operations team
   - Document incident
   - Plan remediation steps

---

## Success Criteria

- ✅ No users exist without proper tenant_id
- ✅ Authentication fails for users without tenant_id
- ✅ API routes validate tenant_id presence
- ✅ Demo tenant data is isolated
- ✅ Audit logs show proper tenant attribution
- ✅ Documentation updated with proper procedures
- ✅ Zero tenant isolation violations

---

## Files Requiring Changes

### Critical (Immediate)

1. `apps/demo-web/src/lib/auth/options.ts` - Remove fallback logic
2. All API route files (31 files) - Validate tenant_id presence

### Documentation

1. `docs/operations/TENANT_ONBOARDING_CHECKLIST.md` - Add user creation steps
2. `apps/demo-web/docs/AUTH_SPECIFICATION.md` - Document tenant validation
3. `docs/SECURITY.md` - Add tenant isolation requirements (create if needed)

### Migrations (Medium-Term)

1. `supabase/migrations/<timestamp>_validate_user_tenant_id.sql` - Add trigger
2. `supabase/migrations/<timestamp>_backfill_tenant_assignments.sql` - Fix existing users

---

## Appendix: All Affected File Locations

### Authentication Layer (5 occurrences)
- `apps/demo-web/src/lib/auth/options.ts:50`
- `apps/demo-web/src/lib/auth/options.ts:115`
- `apps/demo-web/src/lib/auth/options.ts:133`
- `apps/demo-web/src/lib/auth/options.ts:177`
- `apps/demo-web/src/lib/auth/options.ts:215`

### API Routes (31 occurrences)
- `apps/demo-web/src/app/api/chat/route.ts:53`
- `apps/demo-web/src/app/api/conversations/route.ts:31`
- `apps/demo-web/src/app/api/conversations/[id]/route.ts:27,90`
- `apps/demo-web/src/app/api/conversations/[id]/active-path/route.ts:32,105`
- `apps/demo-web/src/app/api/conversations/[id]/branch/route.ts:32`
- `apps/demo-web/src/app/api/conversations/[id]/compact/route.ts:64`
- `apps/demo-web/src/app/api/conversations/[id]/compact/history/route.ts:85`
- `apps/demo-web/src/app/api/conversations/[id]/compact/rollback/route.ts:51`
- `apps/demo-web/src/app/api/conversations/[id]/compact/snapshots/route.ts:67`
- `apps/demo-web/src/app/api/conversations/[id]/compact/status/route.ts:50`
- `apps/demo-web/src/app/api/conversations/[id]/messages/[messageId]/route.ts:44,134,276`
- `apps/demo-web/src/app/api/conversations/[id]/messages/[messageId]/pin/route.ts:31,111`
- `apps/demo-web/src/app/api/conversations/[id]/paths/route.ts:32,99`
- `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/route.ts:32,94,170`
- `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/merge/route.ts:39`
- `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/merge/preview/route.ts:39`
- `apps/demo-web/src/app/api/conversations/[id]/paths/[pathId]/messages/route.ts:31`
- `apps/demo-web/src/app/api/conversations/[id]/stream/route.ts:29`
- `apps/demo-web/src/app/api/conversations/stream/route.ts:35`
- `apps/demo-web/src/app/api/graph/route.ts:86`
- `apps/demo-web/src/app/api/graph/stream/route.ts:52`

### Documentation (2 occurrences)
- `docs/ENV_SETUP.md:110,177`

### Configuration Examples (3 occurrences)
- `apps/demo-web/.env.local.example:73`
- `apps/demo-web/PRODUCTION_DEPLOYMENT.md:56`
- `apps/demo-web/SECURITY_SESSION_VALIDATION.md:332`
- `docs/development/local/LOCAL_DEVELOPMENT.md:372,491`

**Total**: 38 occurrences across 28 files

---

## Questions for Product/Security Review

1. **Are there legitimate demo users that should have access to demo tenant?**
   - If yes: Implement Option B (explicit demo user flag)
   - If no: Implement Option A (fail-closed, recommended)

2. **What is the expected user creation flow?**
   - Admin creates users via Supabase Dashboard?
   - Users self-register via signup page?
   - API-based user provisioning?

3. **Should existing users without tenant_id be migrated or deleted?**
   - Need business decision on user disposition

4. **What is the acceptable downtime for this fix?**
   - Determines deployment strategy

---

**End of Analysis**
