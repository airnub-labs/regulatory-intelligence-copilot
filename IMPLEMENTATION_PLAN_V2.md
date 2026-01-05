# Multi-Tenant Architecture Implementation Plan V2

**Created**: 2026-01-05
**Target Completion**: 2-3 weeks
**Architecture**: Personal Tenant Model (Slack/GitHub style)

---

## Overview

This plan implements a comprehensive multi-tenant user architecture that:
- ✅ Allows self-service signup (auto-creates personal workspace)
- ✅ Supports users belonging to multiple tenants
- ✅ Enables tenant switching via UI
- ✅ Allows upgrading personal workspace to team workspace
- ✅ Permits same email across multiple tenants (via memberships)
- ✅ Fixes critical tenant ID security vulnerability

**Related Documents**:
- [TENANT_ID_SECURITY_ANALYSIS.md](./TENANT_ID_SECURITY_ANALYSIS.md) - Original vulnerability analysis
- [MULTI_TENANT_ARCHITECTURE_ANALYSIS.md](./MULTI_TENANT_ARCHITECTURE_ANALYSIS.md) - Architecture design
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - V1 plan (superseded by this)

---

## Architecture Summary

### New Database Schema

```sql
-- Tenants: Workspaces/organizations
tenants (id, name, slug, type, owner_id, plan, ...)

-- Memberships: Many-to-many user <-> tenant
tenant_memberships (id, tenant_id, user_id, role, status, ...)

-- User preferences: Currently active tenant
user_preferences (user_id, active_tenant_id, ...)
```

### Key Flows

1. **Signup**: User signs up → Personal tenant auto-created → Set as active
2. **Login**: User logs in → Load active tenant → JWT includes `active_tenant_id`
3. **Switch**: User switches tenant → Update `active_tenant_id` → Refresh JWT
4. **Invite**: Team owner invites user → Creates pending membership → User accepts
5. **Upgrade**: User creates team workspace → Can invite others → Keeps personal workspace

---

## Implementation Phases

### Phase 0: Pre-Implementation (Day 1-2)

**Objective**: Understand current state and prepare for migration

#### Task 0.1: Run Security Audit

```bash
# Run the audit script to understand current users
psql $DATABASE_URL < scripts/audit_tenant_assignments.sql > audit_results.txt

# Review results
cat audit_results.txt
```

**Deliverables**:
- [ ] Audit results documenting current users
- [ ] List of users without tenant_id
- [ ] Data impact assessment

#### Task 0.2: Stakeholder Alignment

**Questions to resolve**:
- [ ] Confirm multi-tenant model matches business requirements
- [ ] Define tenant types needed (personal, team, enterprise)
- [ ] Define pricing tiers per tenant type
- [ ] Determine invitation workflow requirements
- [ ] Confirm UI requirements for tenant switching

**Deliverables**:
- [ ] Stakeholder sign-off on architecture
- [ ] Requirements documentation
- [ ] UI mockups for tenant switcher (if needed)

#### Task 0.3: Development Environment Setup

```bash
# Create feature branch
git checkout -b feature/multi-tenant-architecture

# Run local Supabase
cd supabase
supabase start

# Verify local database is running
supabase status
```

**Deliverables**:
- [ ] Feature branch created
- [ ] Local Supabase running
- [ ] Test database ready

---

### Phase 1: Database Schema Migration (Day 3-5)

**Objective**: Add new tenant tables without breaking existing functionality

#### Task 1.1: Apply Schema Migration

**Migration File**: `supabase/migrations/20260105000000_multi_tenant_user_model.sql`

```bash
# Test migration locally first
supabase db reset # This will apply all migrations

# Verify tables created
psql $DATABASE_URL_LOCAL -c "\dt copilot_internal.tenant*"

# Expected output:
#  tenants
#  tenant_memberships
```

**Verification**:
```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'copilot_internal'
  AND table_name LIKE 'tenant%';

-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'copilot_internal'
  AND tablename LIKE 'tenant%';

-- Check functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%tenant%';
```

**Deliverables**:
- [ ] New tables created
- [ ] RLS policies in place
- [ ] Helper functions working
- [ ] Indexes created
- [ ] No errors in migration

#### Task 1.2: Backfill Existing Users

**Migration File**: `supabase/migrations/20260105000001_backfill_personal_tenants.sql`

This creates personal tenants for all existing users.

```bash
# Apply backfill migration
# This is idempotent - safe to run multiple times
psql $DATABASE_URL_LOCAL < supabase/migrations/20260105000001_backfill_personal_tenants.sql
```

**Verification**:
```sql
-- Verify all users have personal tenant
SELECT
    (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL) as total_users,
    (SELECT COUNT(DISTINCT user_id) FROM copilot_internal.tenant_memberships WHERE status = 'active') as users_with_membership,
    (SELECT COUNT(DISTINCT user_id) FROM copilot_internal.user_preferences WHERE active_tenant_id IS NOT NULL) as users_with_active_tenant;

-- Should show equal counts

-- Check a sample user
SELECT
    u.email,
    t.name as tenant_name,
    t.type as tenant_type,
    tm.role,
    (up.active_tenant_id = t.id) as is_active
FROM auth.users u
JOIN copilot_internal.tenant_memberships tm ON tm.user_id = u.id
JOIN copilot_internal.tenants t ON t.id = tm.tenant_id
LEFT JOIN copilot_internal.user_preferences up ON up.user_id = u.id
WHERE u.deleted_at IS NULL
LIMIT 5;
```

**Deliverables**:
- [ ] All users have personal tenant
- [ ] All memberships created
- [ ] All users have active tenant set
- [ ] Verification queries pass

#### Task 1.3: Test Helper Functions

```sql
-- Test get_active_tenant_id()
SELECT public.get_active_tenant_id('<user-uuid>');

-- Test get_user_tenants()
SELECT * FROM public.get_user_tenants('<user-uuid>');

-- Test switch_tenant()
SELECT public.switch_tenant('<tenant-uuid>');

-- Test verify_tenant_access()
SELECT * FROM public.verify_tenant_access('<user-uuid>', '<tenant-uuid>');
```

**Deliverables**:
- [ ] All functions return expected results
- [ ] No errors in function calls
- [ ] RLS policies working correctly

---

### Phase 2: Authentication Layer Update (Day 6-8)

**Objective**: Update NextAuth to use new tenant model

#### Task 2.1: Update TypeScript Types

**File**: `apps/demo-web/src/types/auth.ts` (new file)

```typescript
// Create new auth types file
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: 'personal' | 'team' | 'enterprise';
  plan: 'free' | 'pro' | 'enterprise';
  role: 'owner' | 'admin' | 'member' | 'viewer';
  isActive: boolean;
}

export interface ExtendedUser {
  id: string;
  email: string;
  name?: string;
  activeTenantId?: string;
}

export interface ExtendedSession {
  user: ExtendedUser;
  expires: string;
}

export interface ExtendedJWT {
  sub: string;
  email: string;
  name?: string;
  activeTenantId?: string;
  lastValidated?: number;
}
```

#### Task 2.2: Create Tenant Context Helper

**File**: `apps/demo-web/src/lib/auth/tenantContext.ts` (new file)

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('TenantContext');

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export async function getTenantContext(session: any): Promise<TenantContext> {
  const userId = session?.user?.id;
  const activeTenantId = session?.user?.activeTenantId;

  if (!userId) {
    throw new Error('Unauthorized: No user ID in session');
  }

  if (!activeTenantId) {
    throw new Error('No active tenant selected - please select a workspace');
  }

  // Verify membership (security check)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data: access } = await supabase.rpc('verify_tenant_access', {
    p_user_id: userId,
    p_tenant_id: activeTenantId,
  }).single();

  if (!access?.has_access) {
    logger.error(
      { userId, activeTenantId },
      'User is not a member of active tenant'
    );
    throw new Error('Access denied: Not a member of this workspace');
  }

  return {
    userId,
    tenantId: activeTenantId,
    role: access.role,
  };
}
```

#### Task 2.3: Update NextAuth Options

**File**: `apps/demo-web/src/lib/auth/options.ts`

**Changes**:

```typescript
// Remove old fallback (DELETE THESE LINES):
// const fallbackTenantId = process.env.SUPABASE_DEMO_TENANT_ID ?? 'default'

// Update authorize callback:
async authorize(credentials) {
  if (!credentials?.email || !credentials?.password || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error || !data.user) {
    logger.warn(
      {
        email: credentials.email,
        supabaseError: error?.message ?? 'Unknown Supabase error',
      },
      'Supabase credential sign-in failed'
    );
    return null;
  }

  // Get user's active tenant
  const { data: activeTenantId, error: tenantError } = await supabase
    .rpc('get_active_tenant_id', { p_user_id: data.user.id })
    .single();

  // If no active tenant, create personal tenant
  if (!activeTenantId) {
    logger.info({ userId: data.user.id }, 'Creating personal tenant for new user');

    const { data: newTenantId, error: createError } = await supabase
      .rpc('create_personal_tenant', {
        p_user_id: data.user.id,
        p_user_email: data.user.email,
      });

    if (createError || !newTenantId) {
      logger.error(
        { userId: data.user.id, error: createError },
        'Failed to create personal tenant'
      );
      return null;
    }

    authMetrics.recordLogin(data.user.id);

    return {
      id: data.user.id,
      email: data.user.email,
      name: (data.user.user_metadata as { full_name?: string } | null)?.full_name ?? data.user.email,
      activeTenantId: newTenantId,
    };
  }

  // User has existing tenant
  authMetrics.recordLogin(data.user.id);

  return {
    id: data.user.id,
    email: data.user.email,
    name: (data.user.user_metadata as { full_name?: string } | null)?.full_name ?? data.user.email,
    activeTenantId: activeTenantId,
  };
}

// Update jwt callback:
async jwt({ token, user }) {
  const extendedToken = token as ExtendedJWT;
  const extendedUser = user as ExtendedUser | undefined;

  // On initial sign in
  if (extendedUser) {
    extendedToken.sub = extendedUser.id;
    extendedToken.email = extendedUser.email;
    extendedToken.name = extendedUser.name;
    extendedToken.activeTenantId = extendedUser.activeTenantId; // NEW
    extendedToken.lastValidated = Date.now();
    return token;
  }

  // Periodic validation (existing code, but update tenant retrieval)
  const now = Date.now();
  const lastValidated = extendedToken.lastValidated ?? 0;
  const needsValidation = now - lastValidated > SESSION_VALIDATION_INTERVAL_MS;

  if (needsValidation && extendedToken.sub) {
    try {
      const validation = await validateUserExists(extendedToken.sub);

      if (!validation.isValid) {
        logger.warn(
          { userId: extendedToken.sub, error: validation.error },
          'User validation failed - invalidating session'
        );
        return {} as typeof token;
      }

      // Refresh active tenant from database
      if (validation.user) {
        // Note: validateUserExists now returns activeTenantId instead of tenantId
        extendedToken.activeTenantId = validation.user.activeTenantId;
      }

      extendedToken.lastValidated = now;
    } catch (error) {
      logger.error({ userId: extendedToken.sub, error }, 'Error validating user session');
    }
  }

  return token;
}

// Update session callback:
async session({ session, token }) {
  const sessionWithUser = session as Session & ExtendedSession;
  const extendedToken = token as ExtendedJWT;

  if (!extendedToken.sub) {
    logger.warn('Attempted to create session with invalid token');
    return {
      ...sessionWithUser,
      user: {
        id: '',
        email: null,
        name: null,
        activeTenantId: undefined, // NEW
      },
    };
  }

  if (sessionWithUser.user) {
    sessionWithUser.user.id = extendedToken.sub;
    sessionWithUser.user.email = extendedToken.email;
    sessionWithUser.user.name = extendedToken.name;
    sessionWithUser.user.activeTenantId = extendedToken.activeTenantId; // NEW
  }

  return sessionWithUser;
}
```

#### Task 2.4: Update Session Validation

**File**: `apps/demo-web/src/lib/auth/sessionValidation.ts`

**Changes**:

```typescript
// Update ValidateUserResult interface:
interface ValidateUserResult {
  isValid: boolean;
  user?: {
    id: string;
    email?: string | null;
    activeTenantId?: string; // CHANGED from tenantId
  };
  error?: string;
}

// Update validateUserExists function to fetch activeTenantId:
export async function validateUserExists(userId: string): Promise<ValidateUserResult> {
  // ... existing cache logic ...

  try {
    // ... existing Supabase admin getUserById call ...

    if (!data.user) {
      // ... existing invalid logic ...
    }

    // Get user's active tenant ID (NEW)
    const { data: activeTenantId } = await adminSupabase
      .rpc('get_active_tenant_id', { p_user_id: userId })
      .single();

    // Cache result with activeTenantId
    await validationCache.set(userId, true, activeTenantId);
    authMetrics.recordCacheMiss(userId, validationDuration, true);

    return {
      isValid: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        activeTenantId, // NEW
      },
    };
  } catch (error) {
    // ... existing error handling ...
  }
}
```

**Testing**:
```bash
# Test login
npm run dev
# Navigate to /login
# Login with existing user
# Check logs for:
#   - "Creating personal tenant" OR "User has existing tenant"
#   - No errors
#   - activeTenantId in session

# Check JWT
# In browser console:
# Copy session cookie, decode at jwt.io
# Verify: activeTenantId field exists
```

**Deliverables**:
- [ ] Auth types defined
- [ ] Tenant context helper created
- [ ] NextAuth options updated
- [ ] Session validation updated
- [ ] Login flow working
- [ ] JWT includes activeTenantId

---

### Phase 3: API Routes Update (Day 9-11)

**Objective**: Update all API routes to use new tenant context

#### Task 3.1: Update All Route Files

**Pattern**:

```typescript
// OLD (DELETE):
const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';

// NEW:
import { getTenantContext } from '@/lib/auth/tenantContext';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  try {
    const { userId, tenantId, role } = await getTenantContext(session);

    // Use tenantId in queries...
    const result = await conversationStore.listConversations({
      tenantId,
      userId,
    });

    return NextResponse.json({ ... });
  } catch (error) {
    logger.error({ error }, 'Tenant context error');
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    );
  }
}
```

**Files to Update** (31 files):

```bash
# Create a script to help update all files
cat > scripts/update_api_routes.sh <<'EOF'
#!/bin/bash

FILES=(
  "apps/demo-web/src/app/api/chat/route.ts"
  "apps/demo-web/src/app/api/conversations/route.ts"
  "apps/demo-web/src/app/api/conversations/[id]/route.ts"
  # ... add all 31 files
)

echo "Files to update: ${#FILES[@]}"
echo ""
echo "Review each file manually and update tenant extraction logic"
echo "Old pattern: user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID"
echo "New pattern: getTenantContext(session)"
echo ""

for file in "${FILES[@]}"; do
  echo "- $file"
done
EOF

chmod +x scripts/update_api_routes.sh
./scripts/update_api_routes.sh
```

**Update Strategy**:
1. Add import for `getTenantContext`
2. Wrap route logic in try-catch
3. Replace tenant extraction with `getTenantContext(session)`
4. Test each route after updating

**Testing Checklist** (for each route):
- [ ] Route compiles without errors
- [ ] Route returns data when authenticated
- [ ] Route returns 401 when unauthenticated
- [ ] Route uses correct tenant ID
- [ ] Tenant isolation working (user can't see other tenant's data)

**Deliverables**:
- [ ] All 31 API routes updated
- [ ] All routes tested
- [ ] No SUPABASE_DEMO_TENANT_ID references remain
- [ ] Error handling in place

#### Task 3.2: Remove Environment Variable

**Files**:

1. `.env.local.example`:
```diff
- SUPABASE_DEMO_TENANT_ID=replace_with_seeded_demo_tenant_id
+ # Tenant IDs are now managed in the database via tenants table
+ # Users get a personal tenant automatically on signup
```

2. `.env.local` (if exists):
```bash
# Remove SUPABASE_DEMO_TENANT_ID from your local .env.local
```

3. Production environment:
```bash
# Remove from Vercel/hosting platform
vercel env rm SUPABASE_DEMO_TENANT_ID production
```

**Deliverables**:
- [ ] Environment variable removed from examples
- [ ] Environment variable removed from local
- [ ] Environment variable removed from production
- [ ] Documentation updated

---

### Phase 4: UI Features (Day 12-16)

**Objective**: Add UI for tenant management and switching

#### Task 4.1: Tenant Switcher Component

**File**: `apps/demo-web/src/components/TenantSwitcher.tsx` (new)

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { createClient } from '@/lib/supabase/client';

interface Tenant {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_type: string;
  role: string;
  is_active: boolean;
}

export function TenantSwitcher() {
  const { data: session, update } = useSession();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    const supabase = createClient();
    const { data } = await supabase.rpc('get_user_tenants');
    setTenants(data || []);
    setLoading(false);
  }

  async function switchTenant(tenantId: string) {
    const supabase = createClient();
    await supabase.rpc('switch_tenant', { p_tenant_id: tenantId });

    // Refresh session to get new JWT
    await update();

    // Reload page to refresh all data
    window.location.reload();
  }

  const activeTenant = tenants.find((t) => t.is_active);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="tenant-switcher">
      <select
        value={activeTenant?.tenant_id}
        onChange={(e) => switchTenant(e.target.value)}
      >
        {tenants.map((tenant) => (
          <option key={tenant.tenant_id} value={tenant.tenant_id}>
            {tenant.tenant_name} ({tenant.role})
          </option>
        ))}
      </select>
    </div>
  );
}
```

**Add to Layout**:

```typescript
// apps/demo-web/src/app/layout.tsx (or header component)

import { TenantSwitcher } from '@/components/TenantSwitcher';

// In the header/nav:
<TenantSwitcher />
```

#### Task 4.2: Team Management UI

**File**: `apps/demo-web/src/app/settings/team/page.tsx` (new)

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { createClient } from '@/lib/supabase/client';

export default function TeamManagementPage() {
  const { data: session } = useSession();
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');

  async function loadMembers() {
    const supabase = createClient();
    const tenantId = session?.user?.activeTenantId;

    const { data } = await supabase
      .from('tenant_memberships')
      .select(`
        id,
        role,
        status,
        joined_at,
        user:user_id (
          email,
          raw_user_meta_data
        )
      `)
      .eq('tenant_id', tenantId);

    setMembers(data || []);
  }

  async function inviteMember() {
    // Implementation: Create pending membership
    // Send invitation email
    // Refresh member list
  }

  async function removeMember(membershipId: string) {
    // Implementation: Update status to 'removed'
    // Refresh member list
  }

  // ... UI implementation
}
```

#### Task 4.3: Create Team Workspace Flow

**File**: `apps/demo-web/src/app/workspaces/new/page.tsx` (new)

```typescript
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { createClient } from '@/lib/supabase/client';

export default function CreateWorkspacePage() {
  const { data: session, update } = useSession();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<'team' | 'enterprise'>('team');

  async function createWorkspace() {
    const supabase = createClient();

    // Create tenant
    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert({
        name,
        slug,
        type,
        owner_id: session?.user?.id,
        plan: type === 'enterprise' ? 'enterprise' : 'pro',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create workspace:', error);
      return;
    }

    // Add membership
    await supabase.from('tenant_memberships').insert({
      tenant_id: tenant.id,
      user_id: session?.user?.id,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    });

    // Switch to new workspace
    await supabase.rpc('switch_tenant', { p_tenant_id: tenant.id });
    await update();

    // Redirect to workspace
    window.location.href = '/';
  }

  // ... UI implementation
}
```

**Deliverables**:
- [ ] Tenant switcher component created
- [ ] Team management UI created
- [ ] Create workspace flow implemented
- [ ] UI integrated into app layout
- [ ] User can switch tenants
- [ ] User can create team workspace
- [ ] User can invite team members

---

### Phase 5: Testing & Validation (Day 17-19)

**Objective**: Comprehensive testing of all new functionality

#### Test Suite 1: Database Tests

```sql
-- Test 1: User signup creates personal tenant
-- Manually create user via Supabase dashboard
-- Verify personal tenant created
SELECT * FROM copilot_internal.tenants
WHERE owner_id = '<new-user-id>';

-- Test 2: User can belong to multiple tenants
-- Invite user to another tenant
-- Verify user has 2 memberships
SELECT * FROM copilot_internal.tenant_memberships
WHERE user_id = '<user-id>';

-- Test 3: Switching tenants works
SELECT public.switch_tenant('<tenant-id>');
SELECT public.get_active_tenant_id();

-- Test 4: RLS policies work
-- Try to query tenant you're not a member of
-- Should return no results
```

#### Test Suite 2: Authentication Tests

```bash
# Test 1: New user signup
# - Creates user
# - Creates personal tenant
# - Sets as active
# - Can log in
# - JWT has activeTenantId

# Test 2: Existing user login
# - Loads active tenant
# - JWT has activeTenantId
# - Session has correct tenant

# Test 3: User without tenant (shouldn't exist after migration)
# - Should get personal tenant created on login

# Test 4: Session validation
# - User deleted → session invalidated
# - User still valid → session refreshes
```

#### Test Suite 3: API Route Tests

```typescript
// Test each API route:
// 1. Authenticated request with valid tenant
// 2. Authenticated request with invalid/wrong tenant
// 3. Unauthenticated request
// 4. Tenant isolation (can't see other tenant's data)

// Example test:
describe('GET /api/conversations', () => {
  it('returns conversations for active tenant only', async () => {
    // Create 2 tenants with different data
    // Login as user in tenant A
    // Fetch conversations
    // Should only see tenant A conversations
  });

  it('returns 401 when not authenticated', async () => {
    // Make request without session
    // Should return 401
  });
});
```

#### Test Suite 4: UI Tests

```bash
# Test 1: Tenant switcher
# - Shows all user's tenants
# - Current tenant is selected
# - Switching updates session
# - Page reloads with new tenant data

# Test 2: Team management
# - Shows current team members
# - Can invite new member
# - Can remove member (if owner/admin)
# - Can update member role (if owner)

# Test 3: Create workspace
# - Form validation works
# - Workspace created successfully
# - User becomes owner
# - Auto-switched to new workspace
```

#### Test Suite 5: Security Tests

```sql
-- Security Test 1: Tenant isolation
-- User in tenant A tries to access tenant B data
-- Should be blocked by RLS or application logic

-- Security Test 2: No fallback to demo tenant
-- Verify no code references SUPABASE_DEMO_TENANT_ID
grep -r "SUPABASE_DEMO_TENANT_ID" apps/demo-web/src --exclude-dir=node_modules

-- Security Test 3: Invalid tenant access
-- User with activeTenantId they're not a member of
-- Should be rejected with 401

-- Security Test 4: Role-based access
-- Member tries to invite user (should fail)
-- Admin tries to invite user (should succeed)
-- Owner tries to delete tenant (should succeed)
```

**Deliverables**:
- [ ] All database tests passing
- [ ] All auth tests passing
- [ ] All API route tests passing
- [ ] All UI tests passing
- [ ] All security tests passing
- [ ] No regressions found

---

### Phase 6: Documentation (Day 20-21)

**Objective**: Update all documentation

#### Task 6.1: Update Onboarding Checklist

**File**: `docs/operations/TENANT_ONBOARDING_CHECKLIST.md`

**Add**:
```markdown
## Multi-Tenant User Model

### How It Works

- Every user gets a personal workspace on signup (automatic)
- Users can create team workspaces and invite others
- Users can belong to multiple workspaces
- Users switch workspaces via UI dropdown

### Creating a New User

**Option 1: Self-Service Signup** (Recommended)
- User signs up via /signup page
- Personal workspace automatically created
- User can immediately start using the app

**Option 2: Manual Admin Creation**
- Create user in Supabase Dashboard (Auth > Users)
- User logs in for first time
- Personal workspace automatically created
- No tenant_id needed in metadata (legacy approach removed)

### Creating a Team Tenant

**Option 1: User creates via UI**
- User clicks "New Workspace" in tenant switcher
- Fills out workspace name and type
- Becomes owner of new workspace
- Can invite team members

**Option 2: Admin creates via SQL**
```sql
-- Create team tenant
INSERT INTO copilot_internal.tenants (name, slug, type, owner_id, plan)
VALUES ('Acme Corp', 'acme-corp', 'team', '<user-id>', 'pro')
RETURNING id;

-- Add owner membership
INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at)
VALUES ('<tenant-id>', '<user-id>', 'owner', 'active', NOW());
```

### Inviting Users to a Tenant

1. User must have an account (signup first if needed)
2. Tenant owner/admin invites via UI
3. Creates pending membership
4. Invited user accepts invitation
5. Membership status becomes 'active'
```

#### Task 6.2: Update Auth Specification

**File**: `apps/demo-web/docs/AUTH_SPECIFICATION.md`

**Add section**:
```markdown
## Multi-Tenant User Model

### Architecture

Users can belong to multiple tenants (workspaces/organizations):
- Personal tenants: Individual user's workspace
- Team tenants: Shared workspace with multiple users
- Enterprise tenants: Large organization workspace

### Database Schema

**tenants**: Workspaces/organizations
**tenant_memberships**: Many-to-many user ↔ tenant relationship
**user_preferences**: Tracks currently active tenant

### JWT Claims

```typescript
{
  sub: "user-uuid",
  email: "user@example.com",
  activeTenantId: "currently-selected-tenant-uuid"
}
```

### Tenant Switching

Users switch tenants via UI dropdown:
1. User selects different tenant
2. Calls `switch_tenant(tenant_id)` RPC
3. Updates `active_tenant_id` in preferences
4. Refreshes JWT to include new `activeTenantId`
5. Page reloads with new tenant's data
```

#### Task 6.3: Create Multi-Tenant Guide

**New File**: `docs/MULTI_TENANT_GUIDE.md`

```markdown
# Multi-Tenant Architecture Guide

## Overview

This application uses the Personal Tenant Model (industry standard)
similar to Slack, GitHub, Discord, and Notion.

## Key Concepts

### Tenant
A workspace or organization. Users can belong to multiple tenants.

**Types**:
- **Personal**: Individual user's workspace (auto-created on signup)
- **Team**: Shared workspace for teams
- **Enterprise**: Large organization workspace

### Membership
Relationship between a user and a tenant.

**Roles**:
- **Owner**: Full control, can delete tenant
- **Admin**: Manage members, settings
- **Member**: Use tenant, create content
- **Viewer**: Read-only access

### Active Tenant
The tenant currently selected in the UI. Determines what data the user sees.

## User Flows

[Include flows from MULTI_TENANT_ARCHITECTURE_ANALYSIS.md]

## Developer Guide

### Getting Current Tenant

```typescript
// In API routes
import { getTenantContext } from '@/lib/auth/tenantContext';

const { userId, tenantId, role } = await getTenantContext(session);
```

### Querying Tenant Data

```typescript
// Always filter by tenantId
const conversations = await conversationStore.listConversations({
  tenantId, // From getTenantContext
  userId,
});
```

### Switching Tenants

```typescript
// In UI
const supabase = createClient();
await supabase.rpc('switch_tenant', { p_tenant_id: newTenantId });
await update(); // Refresh NextAuth session
window.location.reload(); // Reload page
```

## Database Functions

### get_active_tenant_id()
Returns user's currently active tenant ID

### get_user_tenants()
Returns all tenants user belongs to

### switch_tenant(tenant_id)
Switches user's active tenant

### create_personal_tenant(user_id, email)
Creates personal tenant for new user

### verify_tenant_access(user_id, tenant_id)
Checks if user has access to tenant

## Security

### Tenant Isolation
- RLS policies on all tables
- API routes verify tenant membership
- User can only access their tenant's data

### Role-Based Access
- Owners can delete tenant
- Admins can manage members
- Members can create content
- Viewers have read-only access
```

**Deliverables**:
- [ ] Onboarding checklist updated
- [ ] Auth specification updated
- [ ] Multi-tenant guide created
- [ ] API documentation updated
- [ ] All docs reviewed

---

### Phase 7: Deployment (Day 22-23)

**Objective**: Deploy to production safely

#### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Documentation complete
- [ ] Stakeholder approval
- [ ] Rollback plan ready
- [ ] Monitoring configured
- [ ] Communication prepared

#### Deployment Steps

**Step 1: Staging Deployment**

```bash
# Deploy database migrations to staging
supabase db push --linked-project staging

# Deploy application to staging
vercel deploy --preview

# Run full test suite
npm run test:e2e -- --env=staging
```

**Step 2: Staging Validation** (4 hours monitoring)

- [ ] All existing users have personal tenants
- [ ] New signups work correctly
- [ ] Tenant switching works
- [ ] Team creation works
- [ ] Member invitation works
- [ ] No errors in logs
- [ ] Performance acceptable

**Step 3: Production Migration Window**

```bash
# Schedule maintenance window (recommended but not required)
# This migration is NON-BREAKING - app continues working during migration

# Apply database migrations
supabase db push --linked-project production

# Verify migrations applied
psql $DATABASE_URL -c "SELECT COUNT(*) FROM copilot_internal.tenants;"

# Deploy application
vercel deploy --prod

# Monitor for 4 hours
vercel logs --prod --follow
```

**Step 4: Post-Deployment Validation**

```sql
-- Verify all users have personal tenants
SELECT COUNT(*) as users_with_tenant
FROM copilot_internal.user_preferences
WHERE active_tenant_id IS NOT NULL;

-- Check for any errors
SELECT * FROM copilot_internal.tenants
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Step 5: Monitor Metrics** (24 hours)

- [ ] Authentication success rate normal
- [ ] API error rate normal
- [ ] User complaints minimal
- [ ] Tenant switching working
- [ ] Performance acceptable

#### Rollback Plan

**If critical issues occur**:

```bash
# Option 1: Revert application (keep database changes)
vercel rollback

# Option 2: Full rollback (only if database corruption)
# This is complex - avoid if possible
# Requires restoring database from backup

# Option 3: Hot-fix
# Fix issue in new commit
# Deploy quickly
```

**Deliverables**:
- [ ] Deployed to staging
- [ ] Staging validated
- [ ] Deployed to production
- [ ] Production validated
- [ ] 24-hour monitoring complete
- [ ] No critical issues

---

## Success Criteria

### Functional Requirements
- ✅ Users can sign up and get personal workspace
- ✅ Users can create team workspaces
- ✅ Users can switch between workspaces
- ✅ Users can invite team members
- ✅ Same email can belong to multiple workspaces
- ✅ Tenant isolation working correctly

### Security Requirements
- ✅ No SUPABASE_DEMO_TENANT_ID fallback
- ✅ Users must be tenant members
- ✅ RLS policies enforced
- ✅ Role-based access working
- ✅ No tenant data leakage

### Performance Requirements
- ✅ Authentication latency <500ms
- ✅ API latency impact <10%
- ✅ Tenant switching <1s
- ✅ No database bottlenecks

### Documentation Requirements
- ✅ All docs updated
- ✅ Onboarding guide updated
- ✅ Developer guide created
- ✅ Team trained

---

## Timeline Summary

| Phase | Duration | Days |
|-------|----------|------|
| Phase 0: Pre-Implementation | 2 days | 1-2 |
| Phase 1: Database Migration | 3 days | 3-5 |
| Phase 2: Authentication Update | 3 days | 6-8 |
| Phase 3: API Routes Update | 3 days | 9-11 |
| Phase 4: UI Features | 5 days | 12-16 |
| Phase 5: Testing | 3 days | 17-19 |
| Phase 6: Documentation | 2 days | 20-21 |
| Phase 7: Deployment | 2 days | 22-23 |
| **Total** | **23 days** | **~4-5 weeks** |

---

## Risk Mitigation

### Risk 1: Data Migration Issues
**Mitigation**:
- Test migration extensively in staging
- Run backfill migration multiple times (idempotent)
- Have rollback SQL scripts ready

### Risk 2: Breaking Existing Users
**Mitigation**:
- Migrations are non-breaking (additive only)
- Old code continues working during migration
- Gradual rollout possible

### Risk 3: Performance Degradation
**Mitigation**:
- Database indexes in place
- Load testing before production
- Monitor query performance

### Risk 4: UI Confusion
**Mitigation**:
- User documentation prepared
- In-app help/tooltips
- Support team briefed

---

## Post-Implementation

### Week 1 After Launch
- [ ] Monitor error rates daily
- [ ] Collect user feedback
- [ ] Fix any minor issues
- [ ] Document lessons learned

### Week 2 After Launch
- [ ] Review metrics
- [ ] Optimize slow queries if needed
- [ ] Plan future enhancements
- [ ] Update roadmap

### Future Enhancements
- [ ] Tenant-level billing
- [ ] Advanced role permissions
- [ ] Tenant templates
- [ ] Workspace analytics
- [ ] SSO integration

---

**End of Implementation Plan V2**
