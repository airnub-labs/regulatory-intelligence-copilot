# Multi-Tenant Architecture: Comprehensive Design Document

**Version**: 1.0 Final
**Date**: 2026-01-05
**Status**: Approved for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Background & Problem Statement](#background--problem-statement)
3. [Requirements](#requirements)
4. [Architecture Decision](#architecture-decision)
5. [Database Schema](#database-schema)
6. [Authentication Strategy](#authentication-strategy)
7. [Security & RLS Strategy](#security--rls-strategy)
8. [User Flows](#user-flows)
9. [API Patterns](#api-patterns)
10. [UI Components](#ui-components)
11. [Migration Strategy](#migration-strategy)
12. [Success Criteria](#success-criteria)

---

## Executive Summary

This document defines a **Personal Tenant Model** multi-tenant architecture (Slack/GitHub/Discord style) that:

- ✅ Fixes critical tenant ID security vulnerability
- ✅ Enables self-service user signup with automatic personal workspace creation
- ✅ Allows users to belong to multiple tenants (workspaces/organizations)
- ✅ Supports tenant switching via UI
- ✅ Enables team workspace creation and member management
- ✅ Preserves NextAuth flexibility for future auth provider changes
- ✅ Leverages Supabase RLS for security where beneficial
- ✅ Provides clean upgrade path: personal → team → enterprise

**Industry Standard**: This is how Slack, GitHub, Discord, Notion, and Figma implement multi-tenancy.

---

## Background & Problem Statement

### Security Vulnerability Discovered

**Issue**: Users created in Supabase without a `tenant_id` in their metadata are incorrectly granted access to demo tenant data through an unsafe fallback mechanism:

```typescript
// CRITICAL VULNERABILITY (38 occurrences across 28 files)
const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
```

**Impact**:
- Any manually created user without tenant_id can view/modify demo tenant data
- Violates tenant isolation
- Compliance risk
- No audit trail of which user performed actions

### Architecture Limitations Identified

Current architecture stores `tenant_id` directly on user:

```typescript
// Current (flawed) approach
user_metadata: {
  tenant_id: "single-tenant-id"
}
```

**Limitations**:
- ❌ User can only belong to ONE tenant
- ❌ Cannot switch between tenants
- ❌ Same email cannot exist in multiple tenants
- ❌ No concept of team/workspace
- ❌ No upgrade path (personal → team)
- ❌ Tightly coupled to auth provider
- ❌ Unsafe fallback creates security risk

### User Requirements (From Conversation)

1. **Self-service signup**: Users sign up themselves without admin intervention
2. **Personal workspace**: Each user starts with their own workspace
3. **Team upgrade**: Users can later upgrade to team workspace and invite others
4. **Multi-tenant membership**: Same user (email) can belong to multiple workspaces
5. **Tenant switching**: Users switch between workspaces via UI
6. **Auth flexibility**: Keep NextAuth to support multiple identity providers
7. **RLS security**: Continue using Supabase RLS where possible

---

## Requirements

### Functional Requirements

#### FR-1: User Signup and Onboarding
- Users can sign up via email/password (current) or OAuth providers
- On signup, system automatically creates a personal workspace
- User becomes owner of their personal workspace
- User can immediately start using the application

#### FR-2: Multi-Tenant Membership
- Users can belong to multiple tenants (workspaces/organizations)
- Each membership has a role: owner, admin, member, viewer
- Users can switch between their tenants via UI
- Same email address can be a member of many tenants

#### FR-3: Workspace Management
- Users can create additional team workspaces
- Workspace types: personal, team, enterprise
- Workspace owners can invite other users
- Workspace owners/admins can manage members and roles

#### FR-4: Tenant Switching
- Users select active tenant from UI dropdown
- System updates active tenant preference
- All data refreshes to show selected tenant's data
- Session/JWT updated with new active tenant ID

#### FR-5: Team Collaboration
- Owners/admins can invite users by email
- Invitations create pending memberships
- Invited users can accept/decline
- Members can leave workspaces (except personal)

### Non-Functional Requirements

#### NFR-1: Security
- **Tenant isolation**: Users can only access data from tenants they belong to
- **No fallback**: No unsafe fallback to demo tenant
- **RLS enforcement**: Row-level security enforces membership rules
- **Defense in depth**: Multiple layers of security (RLS + app logic)

#### NFR-2: Authentication Flexibility
- **NextAuth preserved**: Keep using NextAuth for session management
- **Provider agnostic**: Support any NextAuth provider (OAuth, SAML, etc.)
- **Multiple providers**: Support multiple providers simultaneously
- **Migration path**: Easy to switch auth providers in future

#### NFR-3: Performance
- Tenant switching completes in <1 second
- API latency impact <10% vs current
- Database queries optimized with proper indexes
- Caching where appropriate

#### NFR-4: Maintainability
- Clean separation: authentication vs authorization
- Industry-standard patterns (familiar to developers)
- Well-documented architecture
- Easy to onboard new team members

---

## Architecture Decision

### Chosen Pattern: Personal Tenant Model

**Industry Examples**: Slack, GitHub, Discord, Notion, Figma, Linear

**Core Concept**: Every user gets a personal workspace on signup. Users can create or join team workspaces. Users switch between workspaces via UI.

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  Authentication Layer (NextAuth)                             │
│  - Handles: Who you are                                      │
│  - Providers: Email, Google, GitHub, Auth0, etc.             │
│  - Session: JWT with user_id + active_tenant_id              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│  Tenancy Layer (PostgreSQL Tables)                           │
│  - Handles: What you can access                              │
│  - Tables: tenants, tenant_memberships, user_preferences     │
│  - Provider-agnostic: Works with any auth system             │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│  Data Layer (Application Tables)                             │
│  - Filtered by: active_tenant_id from session                │
│  - Tables: conversations, messages, contexts, etc.           │
│  - RLS: Optional enforcement via policies                    │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns**
   - Authentication (who) is separate from tenancy (what access)
   - Auth layer can change without affecting tenant structure
   - Tenant structure works with any auth provider

2. **Many-to-Many Relationship**
   - Users ↔ Tenants via `tenant_memberships` table
   - Same user can belong to many tenants
   - Each tenant can have many users

3. **Active Tenant Selection**
   - User selects which tenant is currently active
   - Stored in `user_preferences.active_tenant_id`
   - Included in JWT as `activeTenantId` claim
   - All queries filter by active tenant

4. **Role-Based Access**
   - Each membership has a role (owner, admin, member, viewer)
   - Roles control what actions users can perform
   - Enforced at application layer and optionally via RLS

---

## Database Schema

### Core Tables

```sql
-- =====================================================
-- Tenants (Workspaces/Organizations)
-- =====================================================
CREATE TABLE copilot_internal.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic information
    name TEXT NOT NULL,
    slug TEXT UNIQUE,  -- For URLs: app.example.com/{slug}
    description TEXT,

    -- Tenant type
    type TEXT NOT NULL DEFAULT 'personal'
        CHECK (type IN ('personal', 'team', 'enterprise')),

    -- Ownership
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

    -- Billing/limits
    plan TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'pro', 'enterprise')),

    -- Settings
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

-- =====================================================
-- Tenant Memberships (Many-to-Many)
-- =====================================================
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
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    joined_at TIMESTAMPTZ,  -- NULL if invitation pending

    -- Status
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('pending', 'active', 'suspended', 'removed')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(tenant_id, user_id)
);

-- =====================================================
-- User Preferences (Active Tenant Selection)
-- =====================================================
CREATE TABLE copilot_internal.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Currently selected tenant
    active_tenant_id UUID REFERENCES copilot_internal.tenants(id) ON DELETE SET NULL,

    -- UI and other preferences
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Helper Functions

```sql
-- Get user's currently active tenant ID
CREATE FUNCTION public.get_active_tenant_id(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID AS $$
    SELECT active_tenant_id
    FROM copilot_internal.user_preferences
    WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get all tenants a user belongs to
CREATE FUNCTION public.get_user_tenants(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    tenant_slug TEXT,
    tenant_type TEXT,
    tenant_plan TEXT,
    role TEXT,
    is_active BOOLEAN,
    joined_at TIMESTAMPTZ
) AS $$
    SELECT
        t.id,
        t.name,
        t.slug,
        t.type,
        t.plan,
        tm.role,
        (t.id = up.active_tenant_id),
        tm.joined_at
    FROM copilot_internal.tenants t
    JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
    LEFT JOIN copilot_internal.user_preferences up ON up.user_id = p_user_id
    WHERE tm.user_id = p_user_id
      AND tm.status = 'active'
      AND t.deleted_at IS NULL
    ORDER BY (t.id = up.active_tenant_id) DESC, t.created_at ASC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Create personal tenant for new user
CREATE FUNCTION public.create_personal_tenant(
    p_user_id UUID,
    p_user_email TEXT
) RETURNS UUID AS $$
DECLARE
    v_tenant_id UUID;
    v_slug TEXT;
BEGIN
    -- Generate unique slug from email
    v_slug := regexp_replace(
        lower(split_part(p_user_email, '@', 1)),
        '[^a-z0-9-]', '-', 'g'
    );

    -- Ensure uniqueness (with counter if needed)
    -- ... slug uniqueness logic ...

    -- Create personal tenant
    INSERT INTO copilot_internal.tenants (name, slug, type, owner_id, plan)
    VALUES (
        split_part(p_user_email, '@', 1) || '''s Workspace',
        v_slug,
        'personal',
        p_user_id,
        'free'
    ) RETURNING id INTO v_tenant_id;

    -- Add owner membership
    INSERT INTO copilot_internal.tenant_memberships
        (tenant_id, user_id, role, status, joined_at)
    VALUES (v_tenant_id, p_user_id, 'owner', 'active', NOW());

    -- Set as active tenant
    INSERT INTO copilot_internal.user_preferences (user_id, active_tenant_id)
    VALUES (p_user_id, v_tenant_id)
    ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = v_tenant_id;

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Switch active tenant
CREATE FUNCTION public.switch_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Verify membership
    IF NOT EXISTS (
        SELECT 1 FROM copilot_internal.tenant_memberships
        WHERE user_id = v_user_id
          AND tenant_id = p_tenant_id
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Not a member of tenant %', p_tenant_id;
    END IF;

    -- Update active tenant
    INSERT INTO copilot_internal.user_preferences (user_id, active_tenant_id)
    VALUES (v_user_id, p_tenant_id)
    ON CONFLICT (user_id) DO UPDATE SET
        active_tenant_id = p_tenant_id,
        updated_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify tenant access
CREATE FUNCTION public.verify_tenant_access(
    p_user_id UUID,
    p_tenant_id UUID
) RETURNS TABLE (has_access BOOLEAN, role TEXT) AS $$
    SELECT
        (tm.user_id IS NOT NULL),
        tm.role
    FROM copilot_internal.tenant_memberships tm
    WHERE tm.user_id = p_user_id
      AND tm.tenant_id = p_tenant_id
      AND tm.status = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Indexes

```sql
-- Tenants
CREATE INDEX idx_tenants_owner ON copilot_internal.tenants(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_slug ON copilot_internal.tenants(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_type ON copilot_internal.tenants(type) WHERE deleted_at IS NULL;

-- Tenant memberships
CREATE INDEX idx_tenant_memberships_user ON copilot_internal.tenant_memberships(user_id) WHERE status = 'active';
CREATE INDEX idx_tenant_memberships_tenant ON copilot_internal.tenant_memberships(tenant_id) WHERE status = 'active';
CREATE INDEX idx_tenant_memberships_status ON copilot_internal.tenant_memberships(tenant_id, status);

-- User preferences
CREATE INDEX idx_user_preferences_active_tenant ON copilot_internal.user_preferences(active_tenant_id) WHERE active_tenant_id IS NOT NULL;
```

---

## Authentication Strategy

### NextAuth Configuration

**Decision**: Keep using NextAuth.js v4 for flexibility and multi-provider support.

**Rationale**:
- Provider-agnostic (can switch from Supabase to Auth0, Google, etc.)
- Supports multiple providers simultaneously
- Mature, well-documented library
- Industry standard for Next.js applications

### JWT Structure

```typescript
interface ExtendedJWT {
    sub: string;              // User ID (from auth provider)
    email: string;            // User email
    name?: string;            // User name
    activeTenantId: string;   // Currently selected tenant
    lastValidated?: number;   // Last validation timestamp (for periodic checks)
}
```

### Authentication Flow

```typescript
// 1. User signs in (email/password or OAuth)
async authorize(credentials) {
    // Authenticate against provider (Supabase, Google, etc.)
    const { data } = await provider.signIn(credentials);

    if (!data.user) return null;

    const userId = data.user.id;

    // 2. Get or create personal tenant
    let activeTenantId = await getActiveTenantId(userId);

    if (!activeTenantId) {
        // New user - create personal workspace
        activeTenantId = await createPersonalTenant(userId, data.user.email);
    }

    // 3. Return user with active tenant
    return {
        id: userId,
        email: data.user.email,
        name: data.user.name,
        activeTenantId: activeTenantId,
    };
}

// 4. JWT callback adds tenant to token
async jwt({ token, user }) {
    if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.activeTenantId = user.activeTenantId;
    }

    // Periodic validation (every 5 min) can refresh activeTenantId
    // if user switched tenants in another session

    return token;
}

// 5. Session callback exposes to client
async session({ session, token }) {
    session.user.id = token.sub;
    session.user.email = token.email;
    session.user.activeTenantId = token.activeTenantId;
    return session;
}
```

### Provider Flexibility

The architecture supports any NextAuth provider:

```typescript
// Current: Supabase
CredentialsProvider({
    async authorize(credentials) {
        const { data } = await supabase.auth.signInWithPassword(credentials);
        // ... tenant logic (same for all providers)
    }
})

// Future: Google OAuth
GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
})

// Future: GitHub OAuth
GitHubProvider({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
})

// All providers use the SAME tenant_memberships table!
```

**Key Point**: The `tenant_memberships` table only stores `user_id`. This works with ANY auth provider that gives you a user ID.

---

## Security & RLS Strategy

### Hybrid Approach (Recommended)

**Use RLS where beneficial, service_role where needed.**

#### Layer 1: RLS on Tenant Tables

```sql
-- RLS enforces membership checking
ALTER TABLE copilot_internal.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see tenants they're members of
CREATE POLICY tenants_member_read
    ON copilot_internal.tenants
    FOR SELECT TO authenticated
    USING (
        id IN (
            SELECT tenant_id
            FROM copilot_internal.tenant_memberships
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Policy: Users can only see their own memberships
CREATE POLICY memberships_own_read
    ON copilot_internal.tenant_memberships
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Policy: Admins/owners can see all memberships in their tenants
CREATE POLICY memberships_tenant_admin_read
    ON copilot_internal.tenant_memberships
    FOR SELECT TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id
            FROM copilot_internal.tenant_memberships
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );
```

**Effect**: RLS automatically filters tenant and membership queries based on actual membership. Even if app code has a bug, users can't see tenants they don't belong to.

#### Layer 2: Verified Tenant Context

```typescript
// apps/demo-web/src/lib/auth/tenantContext.ts

export async function getTenantContext(session: Session): Promise<{
    userId: string;
    tenantId: string;
    role: string;
}> {
    const userId = session?.user?.id;
    const activeTenantId = session?.user?.activeTenantId;

    if (!userId || !activeTenantId) {
        throw new Error('Unauthorized: Missing credentials');
    }

    // Use authenticated client (RLS enforced) to verify membership
    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,  // ✅ RLS enforced!
        { cookies }
    );

    const { data: membership } = await supabase
        .from('tenant_memberships')  // ✅ Protected by RLS
        .select('role')
        .eq('user_id', userId)
        .eq('tenant_id', activeTenantId)
        .eq('status', 'active')
        .single();

    if (!membership) {
        throw new Error('Access denied: Not a member');
    }

    // Return verified context
    return {
        userId,
        tenantId: activeTenantId,
        role: membership.role,
    };
}
```

**Effect**: Every API request verifies tenant membership via RLS-protected query before proceeding.

#### Layer 3: Application-Level Filtering

```typescript
// In API routes
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);

    // Verify membership (Layer 2)
    const { userId, tenantId, role } = await getTenantContext(session);

    // Use service_role for data queries (Layer 3)
    const supabaseAdmin = createServerClient(
        supabaseUrl,
        supabaseServiceKey,
        { cookies }
    );

    const { data } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('tenant_id', tenantId);  // ✅ Verified tenantId

    return NextResponse.json({ data });
}
```

**Effect**: Data queries use verified `tenantId` from membership check. Defense in depth: RLS verification + app-level filtering.

### Security Guarantees

1. **No unsafe fallback**: Removed all `SUPABASE_DEMO_TENANT_ID` fallback logic
2. **Membership required**: Users must be active members to access tenant
3. **RLS enforcement**: Membership verification protected by RLS
4. **Defense in depth**: Multiple security layers (RLS + app logic)
5. **Role-based access**: Actions controlled by membership role
6. **Audit trail**: All actions tied to specific user + tenant

---

## User Flows

### Flow 1: New User Signup

```
1. User visits /signup
   ↓
2. Fills out email/password (or clicks "Sign in with Google")
   ↓
3. NextAuth authorize() callback:
   - Authenticates user
   - Checks if user has active tenant
   - If not, calls create_personal_tenant()
   ↓
4. create_personal_tenant() function:
   - Creates tenant (type: personal, plan: free)
   - Adds user as owner
   - Sets as active tenant
   ↓
5. User redirected to /
   ↓
6. UI loads with personal workspace active
   ↓
7. User can start using the app immediately
```

**Result**: User has personal workspace "alice's Workspace" and can create conversations.

### Flow 2: Create Team Workspace

```
1. User clicks "New Workspace" in tenant switcher
   ↓
2. Modal opens: "Create Team Workspace"
   - Name: "Acme Corp"
   - Slug: "acme-corp"
   - Type: team
   ↓
3. User clicks "Create"
   ↓
4. API call: POST /api/workspaces
   - Creates tenant (type: team, plan: pro)
   - Adds user as owner
   ↓
5. User clicks "Switch to Acme Corp"
   ↓
6. Calls switch_tenant(acme_tenant_id)
   ↓
7. Updates active_tenant_id
   ↓
8. Refreshes JWT (includes new activeTenantId)
   ↓
9. Page reloads with Acme Corp data
   ↓
10. User can now invite team members
```

**Result**: User now has 2 workspaces (Personal + Acme Corp) and can switch between them.

### Flow 3: Invite Team Member

```
1. Owner/admin clicks "Invite Member" in Team Settings
   ↓
2. Enters email: bob@example.com
   ↓
3. API call: POST /api/workspaces/{id}/invitations
   - Checks if bob@example.com exists in auth.users
   - If yes: Creates tenant_membership (status: pending)
   - If no: Error "User must sign up first"
   ↓
4. Invitation email sent to bob@example.com
   ↓
5. Bob logs in, sees notification "You've been invited to Acme Corp"
   ↓
6. Bob clicks "Accept"
   ↓
7. Updates membership status: pending → active
   ↓
8. Bob can now switch to Acme Corp workspace
```

**Result**: Bob has access to Acme Corp workspace.

### Flow 4: Switch Tenants

```
1. User clicks tenant dropdown in header
   ↓
2. Dropdown shows:
   - Personal Workspace ✓ (currently active)
   - Acme Corp
   - Startup XYZ
   ↓
3. User clicks "Acme Corp"
   ↓
4. Frontend calls: await supabase.rpc('switch_tenant', { p_tenant_id: acme_id })
   ↓
5. Database updates user_preferences.active_tenant_id = acme_id
   ↓
6. Frontend calls: await update() // Refresh NextAuth session
   ↓
7. NextAuth jwt() callback:
   - Fetches new active_tenant_id from database
   - Updates JWT with new activeTenantId
   ↓
8. Frontend reloads page: window.location.reload()
   ↓
9. All API calls now use Acme Corp tenant
   ↓
10. UI shows Acme Corp conversations, messages, etc.
```

**Result**: User is now working in Acme Corp context. All data is Acme Corp's data.

### Flow 5: Same Email, Multiple Tenants

```
alice@example.com exists once in auth.users

But alice has memberships in:
├─ Personal Workspace (owner)
├─ Acme Corp (admin)
├─ Startup XYZ (member)
└─ Client Project (viewer)

Alice logs in once.
Alice switches between workspaces via UI.
All workspaces share same alice@example.com identity.
```

**Result**: One email, multiple workspace access, seamless switching.

---

## API Patterns

### Pattern 1: Tenant Context Extraction

```typescript
// apps/demo-web/src/lib/auth/tenantContext.ts

import { Session } from 'next-auth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface TenantContext {
    userId: string;
    tenantId: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
}

export async function getTenantContext(session: Session | null): Promise<TenantContext> {
    const userId = session?.user?.id;
    const activeTenantId = session?.user?.activeTenantId;

    if (!userId || !activeTenantId) {
        throw new Error('Unauthorized: Missing user ID or active tenant');
    }

    // Verify membership via RLS-protected query
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll(cookies) {
                    cookies.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                },
            },
        }
    );

    const { data: access, error } = await supabase
        .rpc('verify_tenant_access', {
            p_user_id: userId,
            p_tenant_id: activeTenantId,
        })
        .single();

    if (error || !access?.has_access) {
        throw new Error('Access denied: Not a member of active tenant');
    }

    return {
        userId,
        tenantId: activeTenantId,
        role: access.role,
    };
}
```

### Pattern 2: API Route Template

```typescript
// apps/demo-web/src/app/api/conversations/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import { conversationStore } from '@/lib/server/conversations';

export async function GET(request: NextRequest) {
    try {
        // 1. Get session
        const session = await getServerSession(authOptions);

        // 2. Verify tenant context (throws if invalid)
        const { userId, tenantId, role } = await getTenantContext(session);

        // 3. Query data using verified tenantId
        const conversations = await conversationStore.listConversations({
            tenantId,
            userId,
        });

        // 4. Return response
        return NextResponse.json({ conversations });

    } catch (error) {
        // Handle auth/tenant errors
        return NextResponse.json(
            { error: error.message },
            { status: 401 }
        );
    }
}
```

### Pattern 3: Role-Based Access Control

```typescript
// Check role before allowing operation
const { userId, tenantId, role } = await getTenantContext(session);

// Only owners and admins can invite members
if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
    );
}

// Proceed with invitation logic...
```

---

## UI Components

### Component 1: Tenant Switcher

```typescript
// apps/demo-web/src/components/TenantSwitcher.tsx

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
    const [switching, setSwitching] = useState(false);

    useEffect(() => {
        loadTenants();
    }, []);

    async function loadTenants() {
        try {
            const supabase = createClient();
            const { data, error } = await supabase.rpc('get_user_tenants');

            if (error) throw error;

            setTenants(data || []);
        } catch (error) {
            console.error('Failed to load tenants:', error);
        } finally {
            setLoading(false);
        }
    }

    async function switchTenant(tenantId: string) {
        if (switching) return;

        setSwitching(true);
        try {
            const supabase = createClient();

            // Update active tenant
            const { error } = await supabase.rpc('switch_tenant', {
                p_tenant_id: tenantId
            });

            if (error) throw error;

            // Refresh NextAuth session (updates JWT)
            await update();

            // Reload page to refresh all data
            window.location.reload();

        } catch (error) {
            console.error('Failed to switch tenant:', error);
            setSwitching(false);
        }
    }

    if (loading) {
        return <div className="text-sm text-gray-500">Loading workspaces...</div>;
    }

    const activeTenant = tenants.find(t => t.is_active);

    return (
        <div className="relative">
            <select
                value={activeTenant?.tenant_id || ''}
                onChange={(e) => switchTenant(e.target.value)}
                disabled={switching}
                className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            >
                {tenants.map((tenant) => (
                    <option key={tenant.tenant_id} value={tenant.tenant_id}>
                        {tenant.tenant_name} ({tenant.role})
                        {tenant.tenant_type === 'personal' && ' 👤'}
                        {tenant.tenant_type === 'team' && ' 👥'}
                    </option>
                ))}
            </select>

            {switching && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
                    <div className="text-sm text-gray-500">Switching...</div>
                </div>
            )}
        </div>
    );
}
```

**Usage in layout:**

```typescript
// apps/demo-web/src/components/Header.tsx

import { TenantSwitcher } from './TenantSwitcher';

export function Header() {
    return (
        <header>
            {/* ... other header content ... */}

            <div className="ml-4">
                <TenantSwitcher />
            </div>

            {/* ... user menu, etc. ... */}
        </header>
    );
}
```

### Component 2: Create Workspace Modal

```typescript
// apps/demo-web/src/components/CreateWorkspaceModal.tsx

'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

export function CreateWorkspaceModal({ isOpen, onClose }) {
    const { data: session, update } = useSession();
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [type, setType] = useState<'team' | 'enterprise'>('team');
    const [creating, setCreating] = useState(false);

    async function handleCreate() {
        setCreating(true);
        try {
            // Create tenant via API
            const response = await fetch('/api/workspaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, slug, type }),
            });

            if (!response.ok) throw new Error('Failed to create workspace');

            const { tenant } = await response.json();

            // Switch to new workspace
            const supabase = createClient();
            await supabase.rpc('switch_tenant', { p_tenant_id: tenant.id });
            await update();

            // Reload to show new workspace
            window.location.reload();

        } catch (error) {
            console.error('Failed to create workspace:', error);
            alert('Failed to create workspace');
        } finally {
            setCreating(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <h2 className="mb-4 text-xl font-semibold">Create Team Workspace</h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Workspace Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            placeholder="Acme Corp"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            URL Slug
                        </label>
                        <input
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            placeholder="acme-corp"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Type
                        </label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as 'team' | 'enterprise')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                        >
                            <option value="team">Team</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        disabled={creating}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={creating || !name || !slug}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {creating ? 'Creating...' : 'Create Workspace'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

### Component 3: Team Members List

```typescript
// apps/demo-web/src/app/settings/team/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { createClient } from '@/lib/supabase/client';

export default function TeamMembersPage() {
    const { data: session } = useSession();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadMembers();
    }, []);

    async function loadMembers() {
        try {
            const supabase = createClient();
            const tenantId = session?.user?.activeTenantId;

            const { data, error } = await supabase
                .from('tenant_memberships')
                .select(`
                    id,
                    role,
                    status,
                    joined_at,
                    user:user_id (
                        id,
                        email,
                        raw_user_meta_data
                    )
                `)
                .eq('tenant_id', tenantId)
                .order('joined_at', { ascending: false });

            if (error) throw error;

            setMembers(data || []);
        } catch (error) {
            console.error('Failed to load members:', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return <div>Loading team members...</div>;
    }

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold">Team Members</h1>

            <table className="min-w-full divide-y divide-gray-200">
                <thead>
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Joined
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                    {members.map((member) => (
                        <tr key={member.id}>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                                {member.user.email}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                {member.role}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                    member.status === 'active'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                    {member.status}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                {member.joined_at
                                    ? new Date(member.joined_at).toLocaleDateString()
                                    : 'Pending'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

---

## Migration Strategy

### Existing Users

All existing users will be migrated to personal tenants:

```sql
-- Backfill migration (idempotent)
-- For each user without tenant:
--   1. Create personal tenant
--   2. Add owner membership
--   3. Set as active tenant

-- This is handled by migration:
-- supabase/migrations/20260105000001_backfill_personal_tenants.sql
```

**Result**: Existing users seamlessly transition to new model with zero downtime.

### Existing Data

All existing conversations, messages, etc. remain unchanged:
- They already have `tenant_id` column
- They reference the demo tenant or user's assigned tenant
- After backfill, data is associated with user's personal tenant
- No data migration required for application tables

### Rollout Strategy

1. **Phase 1**: Add new tables (tenants, memberships, preferences)
2. **Phase 2**: Backfill existing users with personal tenants
3. **Phase 3**: Update authentication to use new tenant system
4. **Phase 4**: Update API routes to use getTenantContext()
5. **Phase 5**: Add UI components (tenant switcher, etc.)
6. **Phase 6**: Remove old fallback logic
7. **Phase 7**: Deploy and monitor

**Non-Breaking**: Each phase is backwards compatible. Application continues working throughout migration.

---

## Success Criteria

### Functional Success Criteria

1. **Self-Service Signup**
   - ✅ New user can sign up via email/password
   - ✅ Personal workspace automatically created
   - ✅ User can immediately access application
   - ✅ Workspace named "{username}'s Workspace"

2. **Multi-Tenant Membership**
   - ✅ User can belong to multiple tenants
   - ✅ User can create team workspace
   - ✅ User can invite members to team
   - ✅ Same email can be in personal + multiple teams

3. **Tenant Switching**
   - ✅ Tenant switcher visible in UI header
   - ✅ Shows all user's workspaces
   - ✅ Switching completes in <1 second
   - ✅ Data refreshes to show selected tenant
   - ✅ JWT updated with new activeTenantId

4. **Team Management**
   - ✅ Owners can invite members
   - ✅ Invitations create pending memberships
   - ✅ Members can accept invitations
   - ✅ Team members list shows all members
   - ✅ Roles enforced (owner, admin, member, viewer)

5. **Data Isolation**
   - ✅ Users only see data from active tenant
   - ✅ Cannot access other tenant's data
   - ✅ RLS policies enforce membership
   - ✅ No tenant data leakage

### Security Success Criteria

1. **No Unsafe Fallback**
   - ✅ All SUPABASE_DEMO_TENANT_ID references removed
   - ✅ Users without tenant cannot log in (shouldn't exist after migration)
   - ✅ No default tenant assignment

2. **Membership Verification**
   - ✅ getTenantContext() verifies membership via RLS
   - ✅ API routes reject requests without valid membership
   - ✅ Error logging captures unauthorized attempts

3. **RLS Enforcement**
   - ✅ RLS enabled on tenant tables
   - ✅ RLS policies tested and working
   - ✅ Users cannot bypass membership checks

### Technical Success Criteria

1. **Database**
   - ✅ All migrations applied successfully
   - ✅ All indexes created
   - ✅ All functions working
   - ✅ RLS policies active
   - ✅ Existing data preserved

2. **Authentication**
   - ✅ NextAuth working with new tenant system
   - ✅ JWT includes activeTenantId
   - ✅ Session validation still working
   - ✅ Login flow completes successfully

3. **API Routes**
   - ✅ All 31 routes updated
   - ✅ All routes use getTenantContext()
   - ✅ Tenant filtering working correctly
   - ✅ No performance regression (<10% latency increase)

4. **UI**
   - ✅ Tenant switcher component working
   - ✅ Create workspace flow working
   - ✅ Team management UI working
   - ✅ No UI errors or bugs

### Acceptance Test: Seed Data Demo

**Success Metric**: Following seed data demonstrates full functionality:

```sql
-- Seed Data
-- 3 users: Alice, Bob, Charlie
-- 3 tenants: Alice Personal, Acme Corp (team), Startup XYZ (team)
-- Alice: member of all 3
-- Bob: member of Bob Personal + Acme Corp
-- Charlie: member of Charlie Personal + Startup XYZ

-- Acceptance Test:
-- 1. Log in as Alice
-- 2. See 3 workspaces in dropdown: Alice Personal, Acme Corp, Startup XYZ
-- 3. Switch to Acme Corp
-- 4. See Acme Corp conversations (created by Alice and Bob)
-- 5. Switch to Startup XYZ
-- 6. See Startup XYZ conversations (created by Alice and Charlie)
-- 7. Cannot see Bob Personal or Charlie Personal data

-- If this works: ✅ FULL SUCCESS
```

**Seed data script** will be provided in implementation plan.

---

## Appendix: Key Files

### Database Migrations
- `supabase/migrations/20260105000000_multi_tenant_user_model.sql`
- `supabase/migrations/20260105000001_backfill_personal_tenants.sql`

### Authentication
- `apps/demo-web/src/lib/auth/options.ts` - NextAuth configuration
- `apps/demo-web/src/lib/auth/tenantContext.ts` - Tenant verification (NEW)
- `apps/demo-web/src/lib/auth/sessionValidation.ts` - Session validation

### UI Components
- `apps/demo-web/src/components/TenantSwitcher.tsx` (NEW)
- `apps/demo-web/src/components/CreateWorkspaceModal.tsx` (NEW)
- `apps/demo-web/src/app/settings/team/page.tsx` (NEW)

### API Routes
- All routes in `apps/demo-web/src/app/api/*` (31 files to update)

---

**End of Architecture Document**

This architecture provides:
- ✅ Security (fixes vulnerability + adds RLS)
- ✅ Flexibility (NextAuth + any provider)
- ✅ Scalability (industry-standard pattern)
- ✅ Usability (familiar UI patterns)
- ✅ Maintainability (clean separation of concerns)

Ready for implementation following the phased plan.
