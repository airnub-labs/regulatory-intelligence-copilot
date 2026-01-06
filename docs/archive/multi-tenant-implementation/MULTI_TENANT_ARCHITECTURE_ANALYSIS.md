# Multi-Tenant User Architecture Analysis

**Date**: 2026-01-05
**Purpose**: Evaluate industry standards for multi-tenant user models and propose optimal architecture

---

## Industry Standards Analysis

### Pattern 1: Personal Tenant Model (Recommended)
**Examples**: Slack, GitHub, Discord, Notion, Figma

**Architecture**:
- Every user gets a personal tenant on signup
- Users can create additional tenants (workspaces/organizations)
- Users can belong to multiple tenants simultaneously
- Users can switch between tenants in the UI

**Database Schema**:
```sql
-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  type TEXT DEFAULT 'personal', -- 'personal', 'team', 'enterprise'
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant memberships (many-to-many)
CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- User preferences (which tenant is currently active)
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  active_tenant_id UUID REFERENCES tenants(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**JWT Claims**:
```typescript
{
  sub: "user-uuid",
  email: "user@example.com",
  active_tenant_id: "currently-selected-tenant-uuid",
  // Available tenants fetched on-demand or cached
}
```

**Pros**:
- ✅ Supports self-service signup
- ✅ Users can join multiple tenants
- ✅ Clean upgrade path (personal → team)
- ✅ Same email across multiple tenants
- ✅ Industry standard (familiar UX)

**Cons**:
- ⚠️ More complex than single-tenant model
- ⚠️ Requires tenant switching UI
- ⚠️ Migration needed for existing data

---

### Pattern 2: Tenant-First Model
**Examples**: Enterprise SaaS (Salesforce, Workday)

**Architecture**:
- Admin creates tenant first
- Admin invites users to tenant
- Users can only belong to one tenant
- No self-service signup

**Database Schema**:
```sql
-- Users tied directly to tenant
CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  UNIQUE(tenant_id, email) -- Same email can exist in different tenants
);
```

**Pros**:
- ✅ Simpler model
- ✅ Clear tenant boundaries

**Cons**:
- ❌ No self-service signup
- ❌ Users can't join multiple tenants
- ❌ Requires admin provisioning

---

### Pattern 3: Shared Pool Model
**Examples**: Some B2C SaaS

**Architecture**:
- Users start in shared "free" tenant
- Can upgrade to dedicated tenant
- Complex migration when upgrading

**Pros**:
- ✅ Low friction signup

**Cons**:
- ❌ Complex upgrade path
- ❌ Data migration required
- ❌ Not recommended for B2B

---

## Current Architecture Analysis

### What You Have Now

Based on the migrations I reviewed:

```sql
-- From migrations/20241114000000_conversations.sql
CREATE TABLE copilot_internal.conversations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,  -- ⚠️ Stored on each row
  user_id UUID NULL,
  -- ...
);

-- Users (Supabase auth.users)
-- tenant_id stored in user_metadata or app_metadata
-- ⚠️ No tenants table
-- ⚠️ No memberships table
-- ⚠️ Assumes 1 user = 1 tenant
```

**Current Model**:
- Hardcoded 1:1 user-to-tenant relationship
- Tenant ID stored in user metadata
- No formal tenant entity
- No membership concept

### Limitations of Current Architecture

❌ **Cannot support**:
1. User belonging to multiple tenants
2. User switching between tenants
3. Same email in different tenants (Supabase auth.users has unique email constraint)
4. Tenant invitation workflow
5. Tenant membership roles (owner, admin, member)

❌ **Your specific requirements**:
- ❌ Self-service signup with automatic tenant creation
- ❌ User upgrading personal account to team account
- ❌ User signing into multiple tenants with same email

---

## Recommended Architecture: Personal Tenant Model

### Why This Model?

Based on your requirements:

> "users that sign up themselves but later might want to turn their user account into a tenant account that they manage and can add other users to the tenant"

> "a user who might want to sign into multiple tenants using their unique email address"

**You need Pattern 1: Personal Tenant Model** (Slack/GitHub style)

### Proposed Schema

```sql
-- ========================================
-- Migration: Multi-Tenant User Model
-- ========================================

-- 1. Tenants table
CREATE TABLE copilot_internal.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  slug TEXT UNIQUE, -- For URLs: app.example.com/workspace/{slug}

  -- Tenant type
  type TEXT NOT NULL DEFAULT 'personal'
    CHECK (type IN ('personal', 'team', 'enterprise')),

  -- Ownership
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Billing/limits
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),

  -- Metadata
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

-- 2. Tenant memberships (many-to-many relationship)
CREATE TABLE copilot_internal.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationship
  tenant_id UUID NOT NULL REFERENCES copilot_internal.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role within this tenant
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),

  -- Invitation tracking
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: user can only have one membership per tenant
  UNIQUE(tenant_id, user_id)
);

-- 3. User preferences (tracks active tenant selection)
CREATE TABLE copilot_internal.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Currently selected tenant
  active_tenant_id UUID REFERENCES copilot_internal.tenants(id) ON DELETE SET NULL,

  -- UI preferences
  preferences JSONB DEFAULT '{}'::jsonb,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tenants_owner ON copilot_internal.tenants(owner_id);
CREATE INDEX idx_tenants_slug ON copilot_internal.tenants(slug);
CREATE INDEX idx_tenant_memberships_user ON copilot_internal.tenant_memberships(user_id);
CREATE INDEX idx_tenant_memberships_tenant ON copilot_internal.tenant_memberships(tenant_id);
CREATE INDEX idx_user_preferences_active_tenant ON copilot_internal.user_preferences(active_tenant_id);

-- RLS Policies
ALTER TABLE copilot_internal.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can see tenants they're members of
CREATE POLICY tenants_member_read
  ON copilot_internal.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id
      FROM copilot_internal.tenant_memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Users can see their own memberships
CREATE POLICY memberships_own_read
  ON copilot_internal.tenant_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can see memberships in their tenants (if admin/owner)
CREATE POLICY memberships_tenant_admin_read
  ON copilot_internal.tenant_memberships
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM copilot_internal.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- Users can read their own preferences
CREATE POLICY preferences_own_read
  ON copilot_internal.user_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());
```

### Helper Functions

```sql
-- Function: Get user's active tenant
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT active_tenant_id
  FROM copilot_internal.user_preferences
  WHERE user_id = auth.uid();
$$;

-- Function: Get user's tenants
CREATE OR REPLACE FUNCTION public.get_user_tenants(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  tenant_slug TEXT,
  tenant_type TEXT,
  role TEXT,
  is_active BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    t.id as tenant_id,
    t.name as tenant_name,
    t.slug as tenant_slug,
    t.type as tenant_type,
    tm.role,
    (t.id = up.active_tenant_id) as is_active
  FROM copilot_internal.tenants t
  JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
  LEFT JOIN copilot_internal.user_preferences up ON up.user_id = p_user_id
  WHERE tm.user_id = p_user_id
    AND tm.status = 'active'
    AND t.deleted_at IS NULL
  ORDER BY is_active DESC, t.created_at ASC;
$$;

-- Function: Create personal tenant for new user
CREATE OR REPLACE FUNCTION public.create_personal_tenant(
  p_user_id UUID,
  p_user_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_slug TEXT;
BEGIN
  -- Generate slug from email (before @)
  v_slug := split_part(p_user_email, '@', 1);

  -- Ensure unique slug
  IF EXISTS (SELECT 1 FROM copilot_internal.tenants WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substring(p_user_id::text from 1 for 8);
  END IF;

  -- Create personal tenant
  INSERT INTO copilot_internal.tenants (name, slug, type, owner_id, plan)
  VALUES (
    split_part(p_user_email, '@', 1) || '''s Workspace',
    v_slug,
    'personal',
    p_user_id,
    'free'
  )
  RETURNING id INTO v_tenant_id;

  -- Add owner membership
  INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, p_user_id, 'owner', 'active', NOW());

  -- Set as active tenant
  INSERT INTO copilot_internal.user_preferences (user_id, active_tenant_id)
  VALUES (p_user_id, v_tenant_id);

  RETURN v_tenant_id;
END;
$$;

-- Function: Switch active tenant
CREATE OR REPLACE FUNCTION public.switch_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Verify user is member of target tenant
  IF NOT EXISTS (
    SELECT 1
    FROM copilot_internal.tenant_memberships
    WHERE user_id = v_user_id
      AND tenant_id = p_tenant_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User is not a member of tenant %', p_tenant_id;
  END IF;

  -- Update active tenant
  INSERT INTO copilot_internal.user_preferences (user_id, active_tenant_id, updated_at)
  VALUES (v_user_id, p_tenant_id, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    active_tenant_id = p_tenant_id,
    updated_at = NOW();

  RETURN TRUE;
END;
$$;
```

---

## User Flows

### Flow 1: Self-Service Signup

```typescript
// 1. User signs up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
});

// 2. Trigger creates personal tenant (via Supabase auth hook or function)
const { data: tenant } = await supabase.rpc('create_personal_tenant', {
  p_user_id: data.user.id,
  p_user_email: data.user.email,
});

// Result:
// - User created in auth.users
// - Personal tenant created: "user's Workspace"
// - User is owner of personal tenant
// - Tenant is set as active
```

### Flow 2: User Creates Team Workspace

```typescript
// User wants to create a team workspace
const { data: newTenant } = await supabase
  .from('tenants')
  .insert({
    name: 'Acme Corp Team',
    slug: 'acme-corp',
    type: 'team',
    owner_id: currentUser.id,
    plan: 'pro',
  })
  .select()
  .single();

// Add user as owner
await supabase.from('tenant_memberships').insert({
  tenant_id: newTenant.id,
  user_id: currentUser.id,
  role: 'owner',
  status: 'active',
  joined_at: new Date().toISOString(),
});

// Switch to new tenant
await supabase.rpc('switch_tenant', { p_tenant_id: newTenant.id });

// Result:
// - User now has 2 tenants: personal + team
// - Can switch between them
// - Can invite others to team workspace
```

### Flow 3: User Invites Team Member

```typescript
// Invite user to tenant
const { data: invitation } = await supabase
  .from('tenant_memberships')
  .insert({
    tenant_id: currentTenant.id,
    user_id: inviteeUserId, // Must already have account
    role: 'member',
    status: 'pending',
    invited_by: currentUser.id,
  })
  .select()
  .single();

// Send invitation email (separate flow)
// When they accept, update status to 'active'
```

### Flow 4: User Switches Tenants

```typescript
// Get user's tenants
const { data: tenants } = await supabase.rpc('get_user_tenants');
// [
//   { tenant_id: '...', name: 'Personal', is_active: true, role: 'owner' },
//   { tenant_id: '...', name: 'Acme Corp', is_active: false, role: 'member' },
// ]

// Switch tenant
await supabase.rpc('switch_tenant', { p_tenant_id: selectedTenantId });

// Refresh session to get new JWT with updated active_tenant_id
await supabase.auth.refreshSession();
```

---

## Authentication Updates

### Updated JWT Claims

```typescript
interface ExtendedJWT {
  sub: string; // User ID
  email: string;
  active_tenant_id: string; // Currently selected tenant
  // Available tenants fetched on-demand via RPC
}
```

### Updated Auth Options

```typescript
// apps/demo-web/src/lib/auth/options.ts

async authorize(credentials) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (!data.user) return null;

  // Get user's active tenant
  const { data: activeTenant } = await supabase
    .rpc('get_active_tenant_id')
    .single();

  // If no active tenant, create personal tenant
  if (!activeTenant) {
    const { data: newTenant } = await supabase.rpc('create_personal_tenant', {
      p_user_id: data.user.id,
      p_user_email: data.user.email,
    });

    return {
      id: data.user.id,
      email: data.user.email,
      activeTenantId: newTenant,
    };
  }

  return {
    id: data.user.id,
    email: data.user.email,
    activeTenantId: activeTenant,
  };
}
```

---

## API Route Updates

### New Pattern

```typescript
// apps/demo-web/src/lib/auth/tenantContext.ts

export async function getTenantContext(session: Session | null) {
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const activeTenantId = session.user.activeTenantId;

  if (!activeTenantId) {
    throw new Error('No active tenant - please select a workspace');
  }

  // Verify user is actually a member (security check)
  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('tenant_id', activeTenantId)
    .eq('status', 'active')
    .single();

  if (!membership) {
    throw new Error('User is not a member of the selected tenant');
  }

  return {
    userId: session.user.id,
    tenantId: activeTenantId,
    role: membership.role,
  };
}
```

### Usage in API Routes

```typescript
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  const { userId, tenantId, role } = await getTenantContext(session);

  // Use tenantId for queries
  const conversations = await conversationStore.listConversations({
    tenantId,
    userId,
  });

  return NextResponse.json({ conversations });
}
```

---

## Migration Strategy

### Phase 1: Add New Tables (Non-Breaking)

```sql
-- Add tenants, memberships, preferences tables
-- Do NOT modify existing tables yet
```

### Phase 2: Backfill Existing Users

```sql
-- For each existing user, create personal tenant
INSERT INTO copilot_internal.tenants (id, name, slug, type, owner_id, plan)
SELECT
  gen_random_uuid(),
  split_part(email, '@', 1) || '''s Workspace',
  split_part(email, '@', 1) || '-' || substring(id::text from 1 for 8),
  'personal',
  id,
  'free'
FROM auth.users
WHERE deleted_at IS NULL;

-- Create memberships
INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at)
SELECT t.id, u.id, 'owner', 'active', NOW()
FROM auth.users u
JOIN copilot_internal.tenants t ON t.owner_id = u.id;

-- Set active tenant
INSERT INTO copilot_internal.user_preferences (user_id, active_tenant_id)
SELECT u.id, t.id
FROM auth.users u
JOIN copilot_internal.tenants t ON t.owner_id = u.id;
```

### Phase 3: Migrate Existing Data

```sql
-- Update existing conversations to use new tenant structure
-- Map old user_metadata.tenant_id to new tenants.id
-- This depends on whether you want to preserve the demo tenant or migrate it
```

### Phase 4: Update Application Code

- Update auth options to use new tenant system
- Update API routes to use `getTenantContext()`
- Add tenant switcher UI
- Add team management UI

---

## Addressing Your Specific Requirements

### ✅ Self-Service Signup
**Solution**: `create_personal_tenant()` function automatically creates personal workspace on signup

### ✅ Upgrade to Team Account
**Solution**: User creates new "team" tenant, can invite others, keeps personal tenant

### ✅ Same Email, Multiple Tenants
**Solution**: User belongs to multiple tenants via `tenant_memberships`, switches with UI

### ✅ Manage Other Users
**Solution**: Tenant owner/admin can invite users, assign roles, manage permissions

---

## Comparison: Old vs New

| Feature | Current Architecture | New Architecture |
|---------|---------------------|------------------|
| **User signup** | Manual tenant assignment | Auto-creates personal tenant |
| **Multi-tenant membership** | ❌ Not supported | ✅ User can join many tenants |
| **Tenant switching** | ❌ Not possible | ✅ Switch in UI |
| **Same email, different tenants** | ❌ Blocked by Supabase | ✅ Via memberships |
| **Team management** | ❌ No concept | ✅ Invite, roles, permissions |
| **Personal → Team upgrade** | ❌ Not supported | ✅ Create team workspace |
| **Security** | ⚠️ Fallback to demo tenant | ✅ Must be member |

---

## Next Steps

1. **Review this architecture** - Does this meet your requirements?
2. **Decide on migration approach** - Big bang or gradual?
3. **Update implementation plan** - Include new table structure
4. **UI considerations** - Tenant switcher, team management screens
5. **Billing integration** - Different plans per tenant type

---

**Recommendation**: Adopt the Personal Tenant Model. It's the industry standard for your use case and provides the best user experience while maintaining security.

Would you like me to update the implementation plan to include this architecture?
