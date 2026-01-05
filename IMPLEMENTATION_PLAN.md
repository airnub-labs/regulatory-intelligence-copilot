# Tenant ID Security Fix - Implementation Plan

**Created**: 2026-01-05
**Target Completion**: 2026-01-12 (1 week)
**Owner**: Security/Engineering Team

---

## Overview

This plan addresses the critical security vulnerability where users without a `tenant_id` are incorrectly granted access to the demo tenant's data.

**Related Documents**:
- [TENANT_ID_SECURITY_ANALYSIS.md](./TENANT_ID_SECURITY_ANALYSIS.md) - Full vulnerability analysis
- [scripts/audit_tenant_assignments.sql](./scripts/audit_tenant_assignments.sql) - Audit queries

---

## Pre-Implementation Checklist

Before starting any code changes:

- [ ] **Read the security analysis**: [TENANT_ID_SECURITY_ANALYSIS.md](./TENANT_ID_SECURITY_ANALYSIS.md)
- [ ] **Run audit script**: `scripts/audit_tenant_assignments.sql`
- [ ] **Document findings**: Create incident report with audit results
- [ ] **Get stakeholder approval**: Security, Product, Engineering leads
- [ ] **Prepare communication**: Draft user communication if needed
- [ ] **Set up monitoring**: Ensure logging/alerting ready for deployment

---

## Implementation Phases

### Phase 1: Assessment & Immediate Mitigation (Day 1)

**Objective**: Understand scope and prevent further exposure

#### Tasks

1. **Run Comprehensive Audit** (2 hours)
   ```bash
   # Connect to production database (read-only first!)
   psql $DATABASE_URL < scripts/audit_tenant_assignments.sql > audit_results.txt

   # Review results
   cat audit_results.txt
   ```

   **Deliverable**: `audit_results.txt` with:
   - List of users without tenant_id
   - Their activity in demo tenant
   - Cost impact
   - Timeline of exposure

2. **Determine User Disposition** (1 hour)

   For each user without tenant_id, decide:
   - **Delete**: Test/invalid users
   - **Assign to existing tenant**: Legitimate users
   - **Create new tenant**: New customer discovery

   **Deliverable**: `user_disposition.csv`:
   ```csv
   user_id,email,action,tenant_id,notes
   <uuid>,user@example.com,assign,<tenant-uuid>,Legitimate user from Acme Corp
   <uuid>,test@example.com,delete,N/A,Test account
   ```

3. **Execute User Remediation** (2 hours)

   ```sql
   -- For users to be assigned to existing tenant
   UPDATE auth.users
   SET raw_user_meta_data = jsonb_set(
     COALESCE(raw_user_meta_data, '{}'::jsonb),
     '{tenant_id}',
     '"<TENANT_UUID>"'
   )
   WHERE id = '<USER_UUID>';

   -- For users to be deleted
   -- First check they have no critical data
   SELECT COUNT(*) FROM copilot_internal.conversations WHERE user_id = '<USER_UUID>';

   -- Then soft-delete
   UPDATE auth.users
   SET deleted_at = NOW()
   WHERE id = '<USER_UUID>';
   ```

   **Deliverable**: SQL script `remediate_users.sql` (executed in transaction)

4. **Verify Remediation** (30 min)

   ```sql
   -- Should return 0 rows
   SELECT COUNT(*)
   FROM auth.users
   WHERE (raw_user_meta_data->>'tenant_id' IS NULL
          AND raw_app_meta_data->>'tenant_id' IS NULL)
     AND deleted_at IS NULL;
   ```

   **Deliverable**: Screenshot/log showing 0 users without tenant_id

#### Phase 1 Exit Criteria

- ✅ All active users have valid tenant_id
- ✅ Audit trail documented
- ✅ No ongoing data exposure

---

### Phase 2: Code Remediation (Day 2-3)

**Objective**: Remove unsafe fallback and enforce tenant_id validation

#### Task 2.1: Update Authentication Options (2 hours)

**File**: `apps/demo-web/src/lib/auth/options.ts`

**Changes**:

```typescript
// REMOVE this line entirely (currently line 50):
// const fallbackTenantId = process.env.SUPABASE_DEMO_TENANT_ID ?? 'default'

// UPDATE authorize() callback (currently lines 112-116):
async authorize(credentials) {
  // ... existing Supabase auth code ...

  if (!data.user) {
    return null
  }

  // Extract tenant_id
  const tenantId =
    (data.user.user_metadata as { tenant_id?: string } | null)?.tenant_id ??
    data.user.app_metadata?.tenant_id;

  // CRITICAL: Reject users without tenant_id
  if (!tenantId) {
    logger.error(
      {
        userId: data.user.id,
        email: data.user.email,
      },
      'Authentication denied: User missing tenant_id in user_metadata or app_metadata'
    );
    return null; // Deny login
  }

  // Record successful login
  authMetrics.recordLogin(data.user.id);

  return {
    id: data.user.id,
    email: data.user.email,
    name: (data.user.user_metadata as { full_name?: string } | null)?.full_name ?? data.user.email,
    tenantId: tenantId, // No fallback!
  };
}

// UPDATE jwt() callback - remove all fallbackTenantId references (lines 133, 177):
async jwt({ token, user }) {
  // ... existing code ...

  // Line 133: REMOVE fallback
  if (extendedUser) {
    // ... existing code ...
    extendedToken.tenantId = extendedUser.tenantId; // Remove: ?? fallbackTenantId
    // ... existing code ...
  }

  // Line 177: REMOVE fallback
  if (validation.user) {
    extendedToken.tenantId = validation.user.tenantId; // Remove: ?? extendedToken.tenantId
  }

  return token;
}

// UPDATE session() callback - remove fallback (line 215):
async session({ session, token }) {
  // ... existing code ...

  if (sessionWithUser.user) {
    // ... existing code ...
    sessionWithUser.user.tenantId = extendedToken.tenantId; // Remove: ?? fallbackTenantId
  }

  return sessionWithUser;
}
```

**Testing**:
```bash
# Test 1: User with tenant_id can log in
npm run dev
# Navigate to /login
# Login with user that has tenant_id
# Should succeed

# Test 2: User without tenant_id cannot log in (after Phase 1, there should be none)
# Create test user without tenant_id in Supabase
# Attempt login
# Should see error and be denied

# Test 3: Session with tenant_id works
# Make API call as authenticated user
# Check logs for tenant_id
# Should show proper tenant_id, no fallback
```

#### Task 2.2: Update API Routes (4 hours)

**Affected Files**: All 31 API route files

**Strategy**: Create reusable helper function first

**New File**: `apps/demo-web/src/lib/auth/tenantValidation.ts`

```typescript
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('TenantValidation');

export interface ValidatedTenantContext {
  tenantId: string;
  userId: string;
}

/**
 * Validates and extracts tenant context from session
 *
 * SECURITY: This function enforces tenant_id presence.
 * It will throw an error if tenant_id is missing.
 *
 * @throws {Error} If tenant_id is missing from session
 */
export function getValidatedTenantContext(session: {
  user?: {
    id?: string;
    tenantId?: string;
  };
} | null): ValidatedTenantContext {
  const userId = session?.user?.id;
  const tenantId = session?.user?.tenantId;

  if (!userId) {
    logger.error('Missing user ID in session');
    throw new Error('Unauthorized: Missing user ID');
  }

  if (!tenantId) {
    logger.error(
      { userId },
      'SECURITY: User session missing tenant_id - possible configuration error'
    );
    throw new Error('Unauthorized: Missing tenant ID - please contact support');
  }

  logger.debug({ userId, tenantId }, 'Validated tenant context');

  return { tenantId, userId };
}
```

**Update Pattern for All Route Files**:

```typescript
// BEFORE:
const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';

// AFTER:
import { getValidatedTenantContext } from '@/lib/auth/tenantValidation';

// In route handler:
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  try {
    const { tenantId, userId } = getValidatedTenantContext(session);

    // Rest of route logic...
  } catch (error) {
    logger.error({ error }, 'Tenant validation failed');
    return NextResponse.json(
      { error: 'Unauthorized: Invalid tenant context' },
      { status: 401 }
    );
  }
}
```

**Files to Update** (use search/replace):

```bash
# Find all occurrences
grep -r "process.env.SUPABASE_DEMO_TENANT_ID" apps/demo-web/src/app/api --include="*.ts"

# Update each file:
# 1. Add import for getValidatedTenantContext
# 2. Replace tenant extraction logic
# 3. Wrap in try-catch for error handling
```

**Create Script**: `scripts/update_api_routes.sh`

```bash
#!/bin/bash
# Helper script to update API routes
# Review changes before applying!

API_DIR="apps/demo-web/src/app/api"

# List of files to update
FILES=(
  "$API_DIR/chat/route.ts"
  "$API_DIR/conversations/route.ts"
  # ... add all 31 files
)

for file in "${FILES[@]}"; do
  echo "Updating: $file"
  # Add import at top of file
  # sed command to add import (careful with this!)

  # Replace tenant extraction
  # sed command to replace pattern (careful with this!)
done

echo "Manual review required before commit!"
```

**Testing**:
```bash
# For each updated route:
# 1. Test with valid session (has tenant_id)
# 2. Test with missing tenant_id (should fail with 401)
# 3. Verify error message is logged
```

#### Task 2.3: Remove Environment Variable (30 min)

**Files to Update**:

1. `.env.local.example`:
   ```diff
   - SUPABASE_DEMO_TENANT_ID=replace_with_seeded_demo_tenant_id
   + # REMOVED: SUPABASE_DEMO_TENANT_ID (security vulnerability)
   + # Users must have tenant_id in their user_metadata or app_metadata
   ```

2. `docs/ENV_SETUP.md`:
   - Remove references to `SUPABASE_DEMO_TENANT_ID`
   - Add note about tenant_id requirement

3. `PRODUCTION_DEPLOYMENT.md`:
   - Remove `SUPABASE_DEMO_TENANT_ID` from environment variables
   - Add tenant assignment documentation

#### Phase 2 Exit Criteria

- ✅ No code references to `SUPABASE_DEMO_TENANT_ID` as fallback
- ✅ All API routes validate tenant_id presence
- ✅ Authentication rejects users without tenant_id
- ✅ Error messages are informative
- ✅ Logging captures validation failures

---

### Phase 3: Testing & Validation (Day 4)

**Objective**: Comprehensive testing before production deployment

#### Test Suite 1: Unit Tests

**New File**: `apps/demo-web/src/lib/auth/__tests__/tenantValidation.test.ts`

```typescript
import { getValidatedTenantContext } from '../tenantValidation';

describe('getValidatedTenantContext', () => {
  it('should return context when tenant_id present', () => {
    const session = {
      user: {
        id: 'user-123',
        tenantId: 'tenant-456',
      },
    };

    const result = getValidatedTenantContext(session);

    expect(result).toEqual({
      userId: 'user-123',
      tenantId: 'tenant-456',
    });
  });

  it('should throw when tenant_id missing', () => {
    const session = {
      user: {
        id: 'user-123',
        // tenantId missing
      },
    };

    expect(() => getValidatedTenantContext(session)).toThrow(
      'Unauthorized: Missing tenant ID'
    );
  });

  it('should throw when user_id missing', () => {
    const session = {
      user: {
        tenantId: 'tenant-456',
        // id missing
      },
    };

    expect(() => getValidatedTenantContext(session)).toThrow(
      'Unauthorized: Missing user ID'
    );
  });

  it('should throw when session is null', () => {
    expect(() => getValidatedTenantContext(null)).toThrow();
  });
});
```

**Run Tests**:
```bash
npm test -- tenantValidation.test.ts
```

#### Test Suite 2: Integration Tests

**Staging Environment Testing**:

```bash
# Deploy to staging
vercel deploy --preview

# Test scenarios:
# 1. Login with valid user (has tenant_id)
# 2. Create conversation
# 3. Verify tenant isolation
# 4. Check logs for any fallback usage
# 5. Test all major API endpoints
```

**Test Checklist**:

- [ ] Login with valid tenant_id succeeds
- [ ] Login without tenant_id fails (should not exist after Phase 1)
- [ ] API requests with valid session succeed
- [ ] API requests return proper tenant-scoped data
- [ ] No "default" or demo tenant ID in logs
- [ ] Error logging working for validation failures
- [ ] Performance not degraded

#### Test Suite 3: Security Validation

**File**: `scripts/security_validation.sql`

```sql
-- Verify no conversations with 'default' tenant
SELECT COUNT(*) as default_tenant_count
FROM copilot_internal.conversations
WHERE tenant_id::text = 'default';
-- Expected: 0

-- Verify all users have tenant_id
SELECT COUNT(*) as users_without_tenant
FROM auth.users
WHERE (raw_user_meta_data->>'tenant_id' IS NULL
       AND raw_app_meta_data->>'tenant_id' IS NULL)
  AND deleted_at IS NULL;
-- Expected: 0

-- Verify tenant isolation
-- Each conversation's tenant_id should match creating user's tenant_id
SELECT
  c.id,
  c.tenant_id as conversation_tenant,
  u.raw_user_meta_data->>'tenant_id' as user_tenant,
  CASE
    WHEN c.tenant_id::text = u.raw_user_meta_data->>'tenant_id' THEN 'OK'
    ELSE 'MISMATCH'
  END as status
FROM copilot_internal.conversations c
JOIN auth.users u ON u.id = c.user_id
WHERE u.deleted_at IS NULL
  AND c.tenant_id::text != COALESCE(u.raw_user_meta_data->>'tenant_id', u.raw_app_meta_data->>'tenant_id')
LIMIT 10;
-- Expected: 0 rows with MISMATCH
```

#### Phase 3 Exit Criteria

- ✅ All unit tests passing
- ✅ Integration tests passing in staging
- ✅ Security validation queries show clean data
- ✅ No performance degradation
- ✅ Logging/monitoring confirmed working

---

### Phase 4: Documentation (Day 5)

**Objective**: Update all documentation to reflect new requirements

#### Task 4.1: Update Onboarding Checklist

**File**: `docs/operations/TENANT_ONBOARDING_CHECKLIST.md`

**Add to Phase 1 (after line 31)**:

```markdown
### ⚠️ CRITICAL: User Creation Requirements

**When creating users, you MUST assign a tenant_id**

- [ ] **Create initial admin user WITH tenant_id**:

  **Option 1: Via Supabase Dashboard**
  ```
  1. Go to Authentication > Users > Add User
  2. Fill in email and password
  3. Under "User Metadata" (expandable section), add JSON:
     {
       "tenant_id": "<TENANT_ID>",
       "full_name": "Admin User Name"
     }
  4. Click "Create User"
  ```

  **Option 2: Via SQL** (if you have direct database access)
  ```sql
  -- Insert user with tenant_id in user_metadata
  INSERT INTO auth.users (
    instance_id,
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'admin@tenant.com',
    crypt('CHANGE_THIS_PASSWORD', gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'tenant_id', '<TENANT_ID>',
      'full_name', 'Admin User Name'
    ),
    NOW(),
    NOW()
  );
  ```

- [ ] **Verify tenant_id is set** (CRITICAL):
  ```sql
  SELECT
    id,
    email,
    raw_user_meta_data->>'tenant_id' as tenant_id,
    created_at
  FROM auth.users
  WHERE email = 'admin@tenant.com';

  -- VERIFY:
  -- ✅ tenant_id column shows your TENANT_ID (UUID format)
  -- ❌ If NULL: STOP! Delete user and recreate with tenant_id
  ```

- [ ] **Test authentication**:
  ```bash
  # User should be able to log in
  # Check application logs for:
  # - No "missing tenant_id" errors
  # - Tenant ID matches expected value
  ```

### 🚨 SECURITY WARNING

**Users created without tenant_id will be DENIED access.**

This is a security feature to prevent tenant isolation violations.

If a user cannot log in, check their tenant_id assignment:
```sql
SELECT
  id,
  email,
  raw_user_meta_data->>'tenant_id' as user_tenant,
  raw_app_meta_data->>'tenant_id' as app_tenant
FROM auth.users
WHERE email = 'user@example.com';
```

If both are NULL, update the user:
```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{tenant_id}',
  '"<CORRECT_TENANT_ID>"'
)
WHERE email = 'user@example.com';
```
```

#### Task 4.2: Update Auth Specification

**File**: `apps/demo-web/docs/AUTH_SPECIFICATION.md`

**Add new section after "Authentication Flow" (line 217)**:

```markdown
## Tenant ID Requirements

### Mandatory Tenant Assignment

**SECURITY**: Every user MUST have a `tenant_id` in their user_metadata or app_metadata.

**Enforcement Points**:
1. **Authentication**: Users without `tenant_id` cannot log in
2. **API Routes**: All routes validate `tenant_id` presence
3. **Session**: Sessions without `tenant_id` are invalidated

### Tenant ID Sources

The authentication system checks for `tenant_id` in this order:
1. `user_metadata.tenant_id` (preferred)
2. `app_metadata.tenant_id` (alternative)

**If neither exists**: Authentication is **DENIED**.

### Setting Tenant ID

**During User Creation** (Supabase Dashboard):
```json
{
  "tenant_id": "<UUID>",
  "full_name": "User Name"
}
```

**Via SQL**:
```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{tenant_id}',
  '"<UUID>"'
)
WHERE id = '<user_id>';
```

### Error Handling

**User without tenant_id attempts login**:
```
Status: 401 Unauthorized
Log: "Authentication denied: User missing tenant_id"
User sees: Login failed
```

**API request with missing tenant_id**:
```
Status: 401 Unauthorized
Response: { "error": "Unauthorized: Invalid tenant context" }
Log: "SECURITY: User session missing tenant_id"
```

### Troubleshooting

**Issue**: User cannot log in

**Check**:
```sql
SELECT
  id,
  email,
  raw_user_meta_data->>'tenant_id' as user_tenant,
  raw_app_meta_data->>'tenant_id' as app_tenant
FROM auth.users
WHERE email = '<user_email>';
```

**Fix**: Assign tenant_id using SQL above.
```

#### Task 4.3: Create Security Runbook

**New File**: `docs/operations/TENANT_SECURITY_RUNBOOK.md`

```markdown
# Tenant Security Runbook

## Handling Users Without Tenant ID

### Symptom
User reports: "Cannot log in" or "Login failed"

### Diagnosis
```sql
SELECT
  id,
  email,
  raw_user_meta_data->>'tenant_id' as user_tenant,
  raw_app_meta_data->>'tenant_id' as app_tenant,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE email = '<user_email>';
```

### Resolution
If both `user_tenant` and `app_tenant` are NULL:

1. **Identify correct tenant**:
   - Check CRM/ticketing system
   - Contact account owner
   - DO NOT guess or use demo tenant

2. **Assign tenant_id**:
   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = jsonb_set(
     COALESCE(raw_user_meta_data, '{}'::jsonb),
     '{tenant_id}',
     '"<CORRECT_TENANT_ID>"'
   )
   WHERE email = '<user_email>';
   ```

3. **Verify**:
   ```sql
   SELECT
     email,
     raw_user_meta_data->>'tenant_id' as tenant_id
   FROM auth.users
   WHERE email = '<user_email>';
   ```

4. **Test**: Have user log in again

## Preventing Tenant Isolation Violations

### Regular Audits
Run monthly:
```sql
-- Should return 0 rows
SELECT id, email, created_at
FROM auth.users
WHERE (raw_user_meta_data->>'tenant_id' IS NULL
       AND raw_app_meta_data->>'tenant_id' IS NULL)
  AND deleted_at IS NULL;
```

### Monitoring
Set up alerts for:
- Log message: "missing tenant_id"
- Authentication failures spike
- 401 errors on API routes

## Incident Response

### Suspected Tenant Isolation Breach

1. **Immediate**: Run audit script
2. **Identify**: Users with access to wrong tenant
3. **Contain**: Disable affected accounts
4. **Remediate**: Fix tenant assignments
5. **Audit**: Review all actions by affected users
6. **Report**: Document incident

### Audit Script
[scripts/audit_tenant_assignments.sql](../../scripts/audit_tenant_assignments.sql)
```

#### Phase 4 Exit Criteria

- ✅ Onboarding checklist updated
- ✅ Auth specification updated
- ✅ Security runbook created
- ✅ All documentation reviewed
- ✅ Team trained on new procedures

---

### Phase 5: Deployment (Day 6-7)

**Objective**: Safe production deployment with rollback capability

#### Pre-Deployment Checklist

- [ ] All Phase 1-4 exit criteria met
- [ ] Stakeholder approval obtained
- [ ] Rollback plan documented
- [ ] Monitoring/alerting configured
- [ ] On-call engineer assigned
- [ ] Communication draft prepared

#### Deployment Steps

**Step 1: Final Staging Validation** (2 hours)

```bash
# Deploy to staging
git checkout main
git pull
git checkout -b fix/tenant-id-security
# ... apply all changes ...
git push origin fix/tenant-id-security

# Deploy to staging
vercel deploy --preview

# Run full test suite
npm run test:integration

# Manual testing
# - Login with various users
# - Create conversations
# - Check tenant isolation
# - Review logs
```

**Step 2: Production Deployment** (1 hour)

```bash
# Merge to main
git checkout main
git merge fix/tenant-id-security
git push origin main

# Deploy to production
vercel deploy --prod

# Or if using other deployment:
# npm run deploy:production
```

**Step 3: Post-Deployment Monitoring** (4 hours active monitoring)

```bash
# Watch logs for errors
vercel logs --follow

# Or application logs:
# kubectl logs -f deployment/app -n production

# Monitor metrics:
# - Authentication success rate
# - 401 error rate
# - API latency
# - User complaints
```

**Monitor for**:
- ❌ Spike in authentication failures
- ❌ Increase in 401 errors
- ❌ Log messages: "missing tenant_id"
- ✅ Normal authentication flow
- ✅ No fallback to demo tenant in logs

#### Rollback Procedure

**If critical issues detected**:

```bash
# Option 1: Revert deployment (fastest)
vercel rollback

# Option 2: Revert code
git revert <commit-hash>
git push origin main
vercel deploy --prod

# Option 3: Hot-fix (if minor issue)
# Fix issue in new branch
# Fast-track through testing
# Deploy
```

**Rollback Decision Criteria**:
- Authentication failure rate >5%
- Unable to create new conversations
- Tenant isolation violated
- Critical bug discovered

#### Post-Deployment Validation

**After 4 hours of monitoring**:

```bash
# Run security validation
psql $DATABASE_URL < scripts/security_validation.sql

# Check error rates
# (implementation depends on monitoring tool)

# Verify logging
grep "tenant_id" /var/log/app.log | grep -i error
```

**After 24 hours**:

- [ ] Review all error logs
- [ ] Check authentication metrics
- [ ] Verify no tenant isolation issues
- [ ] Collect user feedback
- [ ] Document any issues encountered

#### Phase 5 Exit Criteria

- ✅ Deployed to production successfully
- ✅ No critical issues in first 24 hours
- ✅ Authentication working normally
- ✅ Tenant isolation validated
- ✅ Monitoring confirms expected behavior
- ✅ Team trained on new validation logic

---

## Communication Plan

### Internal Communication

**Pre-Deployment** (1 day before):
```
To: Engineering, Operations, Support teams
Subject: Security Fix Deployment - Tenant ID Validation

We will be deploying a security fix on [DATE] at [TIME] to address
tenant isolation concerns.

What's changing:
- Users without tenant_id assignment will be unable to log in
- This should not affect any existing users (all have been validated)
- Error messages will indicate "contact support" if issues occur

What to watch for:
- Users reporting login issues
- Check user's tenant_id assignment if issues reported

Runbook: docs/operations/TENANT_SECURITY_RUNBOOK.md
Slack: #incidents for any issues
```

**During Deployment**:
```
#engineering Slack channel:
"🚀 Deploying tenant ID security fix now. Monitoring for 4 hours. #security"
```

**Post-Deployment** (24 hours after):
```
To: All teams
Subject: Tenant ID Security Fix - Deployment Complete

The security fix has been successfully deployed and validated.

Results:
- ✅ No authentication issues
- ✅ Tenant isolation working correctly
- ✅ All monitoring green

Changes are permanent. Any users reporting login issues should be
directed to support for tenant ID validation.

Runbook: docs/operations/TENANT_SECURITY_RUNBOOK.md
```

### External Communication

**Only if needed** (users were affected):

```
Subject: Account Security Update

We recently identified and fixed a configuration issue that could
have affected your account's data isolation.

What we did:
- Identified all affected accounts
- Corrected tenant assignments
- Deployed additional security controls

What you need to do:
- Nothing - all issues have been resolved
- If you experience login issues, contact support

We take security seriously and have implemented additional safeguards
to prevent similar issues in the future.

Questions? Contact: support@company.com
```

---

## Success Metrics

### Security Metrics
- **Zero** users without tenant_id after Phase 1
- **Zero** API calls using demo tenant as fallback
- **Zero** tenant isolation violations

### Operational Metrics
- Authentication success rate maintained >99%
- API latency impact <5%
- Zero rollbacks required
- All tests passing

### Documentation Metrics
- Onboarding checklist updated ✅
- Auth specification updated ✅
- Security runbook created ✅
- Team training completed ✅

---

## Lessons Learned (Post-Implementation)

**To be filled out after deployment**:

### What Went Well
-
-

### What Could Be Improved
-
-

### Action Items
-
-

### Future Preventions
-
-

---

## Appendix

### Quick Reference Commands

**Check user's tenant assignment**:
```sql
SELECT email, raw_user_meta_data->>'tenant_id' as tenant_id
FROM auth.users WHERE email = '<email>';
```

**Assign tenant_id**:
```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{tenant_id}',
  '"<TENANT_UUID>"'
)
WHERE email = '<email>';
```

**Audit all users**:
```bash
psql $DATABASE_URL < scripts/audit_tenant_assignments.sql
```

**Check logs for validation errors**:
```bash
grep "missing tenant_id" /var/log/app.log
```

### Related Files

- [TENANT_ID_SECURITY_ANALYSIS.md](./TENANT_ID_SECURITY_ANALYSIS.md)
- [scripts/audit_tenant_assignments.sql](./scripts/audit_tenant_assignments.sql)
- [docs/operations/TENANT_ONBOARDING_CHECKLIST.md](./docs/operations/TENANT_ONBOARDING_CHECKLIST.md)
- [apps/demo-web/docs/AUTH_SPECIFICATION.md](./apps/demo-web/docs/AUTH_SPECIFICATION.md)

---

**End of Implementation Plan**
