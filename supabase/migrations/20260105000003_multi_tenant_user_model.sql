-- ========================================
-- Multi-Tenant User Model Migration
-- ========================================
-- Date: 2026-01-05
-- Purpose: Enable users to belong to multiple tenants (Personal Tenant Model)
--
-- Features:
-- - Every user gets a personal tenant on signup
-- - Users can create team tenants
-- - Users can join multiple tenants
-- - Users can switch between tenants
-- - Same email can belong to multiple tenants (via memberships)
--
-- Industry Standard: Slack/GitHub/Discord model
-- ========================================

-- ========================================
-- PART 1: Core Tables
-- ========================================

-- Tenants table: Represents workspaces/organizations
CREATE TABLE IF NOT EXISTS copilot_internal.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic information
    name TEXT NOT NULL,
    slug TEXT UNIQUE, -- For URLs: app.example.com/workspace/{slug}
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
    deleted_at TIMESTAMPTZ NULL,

    -- Constraints
    CONSTRAINT valid_settings CHECK (jsonb_typeof(settings) = 'object')
);

-- Tenant memberships: Many-to-many relationship between users and tenants
CREATE TABLE IF NOT EXISTS copilot_internal.tenant_memberships (
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
    joined_at TIMESTAMPTZ, -- NULL if invitation pending

    -- Status
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('pending', 'active', 'suspended', 'removed')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(tenant_id, user_id) -- User can only have one membership per tenant
);

-- User preferences: Tracks which tenant is currently active
CREATE TABLE IF NOT EXISTS copilot_internal.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Currently selected tenant
    current_tenant_id UUID REFERENCES copilot_internal.tenants(id) ON DELETE SET NULL,

    -- UI and other preferences
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_preferences CHECK (jsonb_typeof(preferences) = 'object')
);

COMMENT ON TABLE copilot_internal.tenants IS 'Workspaces/organizations that users belong to';
COMMENT ON TABLE copilot_internal.tenant_memberships IS 'Many-to-many relationship between users and tenants';
COMMENT ON TABLE copilot_internal.user_preferences IS 'User-specific settings including current tenant selection';

-- ========================================
-- PART 2: Indexes
-- ========================================

-- Tenants
CREATE INDEX IF NOT EXISTS idx_tenants_owner
    ON copilot_internal.tenants(owner_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_slug
    ON copilot_internal.tenants(slug)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_type
    ON copilot_internal.tenants(type)
    WHERE deleted_at IS NULL;

-- Tenant memberships
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user
    ON copilot_internal.tenant_memberships(user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant
    ON copilot_internal.tenant_memberships(tenant_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_status
    ON copilot_internal.tenant_memberships(tenant_id, status);

-- User preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_current_tenant
    ON copilot_internal.user_preferences(current_tenant_id)
    WHERE current_tenant_id IS NOT NULL;

-- ========================================
-- PART 3: Triggers
-- ========================================

-- Update updated_at timestamp on tenants
CREATE OR REPLACE FUNCTION copilot_internal.update_tenant_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tenant_timestamp
    BEFORE UPDATE ON copilot_internal.tenants
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_tenant_timestamp();

-- Update updated_at timestamp on memberships
CREATE TRIGGER trigger_update_membership_timestamp
    BEFORE UPDATE ON copilot_internal.tenant_memberships
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_tenant_timestamp();

-- Update updated_at timestamp on user preferences
CREATE TRIGGER trigger_update_preferences_timestamp
    BEFORE UPDATE ON copilot_internal.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_tenant_timestamp();

-- ========================================
-- PART 4: Row Level Security
-- ========================================

ALTER TABLE copilot_internal.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.user_preferences ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY tenants_service_role_all
    ON copilot_internal.tenants
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY memberships_service_role_all
    ON copilot_internal.tenant_memberships
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY preferences_service_role_all
    ON copilot_internal.user_preferences
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can see tenants they're members of
CREATE POLICY tenants_member_read
    ON copilot_internal.tenants
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT tenant_id
            FROM copilot_internal.tenant_memberships
            WHERE user_id = auth.uid()
              AND status = 'active'
        )
    );

-- Tenant owners can update their tenants
CREATE POLICY tenants_owner_update
    ON copilot_internal.tenants
    FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Users can create new tenants (will become owner)
CREATE POLICY tenants_create
    ON copilot_internal.tenants
    FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

-- Users can see their own memberships
CREATE POLICY memberships_own_read
    ON copilot_internal.tenant_memberships
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can see memberships in tenants where they're admin/owner
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

-- Owners and admins can create memberships (invitations)
CREATE POLICY memberships_admin_create
    ON copilot_internal.tenant_memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id
            FROM copilot_internal.tenant_memberships
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Owners and admins can update memberships
CREATE POLICY memberships_admin_update
    ON copilot_internal.tenant_memberships
    FOR UPDATE
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

-- Users can update their own membership (to accept invitation, etc.)
CREATE POLICY memberships_own_update
    ON copilot_internal.tenant_memberships
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can read and update their own preferences
CREATE POLICY preferences_own_all
    ON copilot_internal.user_preferences
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ========================================
-- PART 5: Helper Functions
-- ========================================

-- Get user's currently active tenant ID
CREATE OR REPLACE FUNCTION public.get_current_tenant_id(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
    SELECT current_tenant_id
    FROM copilot_internal.user_preferences
    WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_tenant_id(UUID) TO authenticated, service_role;

-- Get all tenants a user belongs to
CREATE OR REPLACE FUNCTION public.get_user_tenants(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    tenant_slug TEXT,
    tenant_type TEXT,
    tenant_plan TEXT,
    role TEXT,
    is_active BOOLEAN,
    joined_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
    SELECT
        t.id as tenant_id,
        t.name as tenant_name,
        t.slug as tenant_slug,
        t.type as tenant_type,
        t.plan as tenant_plan,
        tm.role,
        (t.id = up.current_tenant_id) as is_active,
        tm.joined_at
    FROM copilot_internal.tenants t
    JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
    LEFT JOIN copilot_internal.user_preferences up ON up.user_id = p_user_id
    WHERE tm.user_id = p_user_id
      AND tm.status = 'active'
      AND t.deleted_at IS NULL
    ORDER BY is_active DESC NULLS LAST, t.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenants(UUID) TO authenticated, service_role;

-- Create a personal tenant for a new user
CREATE OR REPLACE FUNCTION public.create_personal_tenant(
    p_user_id UUID,
    p_user_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
DECLARE
    v_tenant_id UUID;
    v_slug TEXT;
    v_base_slug TEXT;
    v_counter INTEGER := 0;
BEGIN
    -- Generate base slug from email (before @)
    v_base_slug := regexp_replace(
        lower(split_part(p_user_email, '@', 1)),
        '[^a-z0-9-]',
        '-',
        'g'
    );

    -- Ensure slug is not empty
    IF v_base_slug = '' OR v_base_slug IS NULL THEN
        v_base_slug := 'user';
    END IF;

    v_slug := v_base_slug;

    -- Ensure unique slug
    WHILE EXISTS (SELECT 1 FROM copilot_internal.tenants WHERE slug = v_slug) LOOP
        v_counter := v_counter + 1;
        v_slug := v_base_slug || '-' || v_counter;

        -- Safety: prevent infinite loop
        IF v_counter > 1000 THEN
            -- Fallback to UUID-based slug
            v_slug := v_base_slug || '-' || substring(gen_random_uuid()::text from 1 for 8);
            EXIT;
        END IF;
    END LOOP;

    -- Create personal tenant
    INSERT INTO copilot_internal.tenants (
        name,
        slug,
        type,
        owner_id,
        plan
    )
    VALUES (
        split_part(p_user_email, '@', 1) || '''s Workspace',
        v_slug,
        'personal',
        p_user_id,
        'free'
    )
    RETURNING id INTO v_tenant_id;

    -- Add owner membership
    INSERT INTO copilot_internal.tenant_memberships (
        tenant_id,
        user_id,
        role,
        status,
        joined_at
    )
    VALUES (
        v_tenant_id,
        p_user_id,
        'owner',
        'active',
        NOW()
    );

    -- Set as active tenant
    INSERT INTO copilot_internal.user_preferences (
        user_id,
        current_tenant_id
    )
    VALUES (
        p_user_id,
        v_tenant_id
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        current_tenant_id = v_tenant_id,
        updated_at = NOW();

    RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_personal_tenant(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_personal_tenant IS 'Creates a personal tenant for a new user on signup';

-- Switch active tenant
CREATE OR REPLACE FUNCTION public.switch_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
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
        RAISE EXCEPTION 'User % is not an active member of tenant %', v_user_id, p_tenant_id;
    END IF;

    -- Update active tenant
    INSERT INTO copilot_internal.user_preferences (
        user_id,
        current_tenant_id,
        updated_at
    )
    VALUES (
        v_user_id,
        p_tenant_id,
        NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        current_tenant_id = p_tenant_id,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_tenant(UUID) TO authenticated;

COMMENT ON FUNCTION public.switch_tenant IS 'Switches the currently active tenant for the authenticated user';

-- Verify user has access to a tenant
CREATE OR REPLACE FUNCTION public.verify_tenant_access(
    p_user_id UUID,
    p_tenant_id UUID
)
RETURNS TABLE (
    has_access BOOLEAN,
    role TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
    SELECT
        (tm.user_id IS NOT NULL) as has_access,
        tm.role
    FROM copilot_internal.tenant_memberships tm
    WHERE tm.user_id = p_user_id
      AND tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_tenant_access(UUID, UUID) TO authenticated, service_role;

-- ========================================
-- PART 6: Views
-- ========================================

-- View: User's tenants with membership info
CREATE OR REPLACE VIEW public.user_tenants_view AS
SELECT
    t.id as tenant_id,
    t.name as tenant_name,
    t.slug as tenant_slug,
    t.type as tenant_type,
    t.plan as tenant_plan,
    t.owner_id,
    tm.user_id,
    tm.role,
    tm.status as membership_status,
    tm.joined_at,
    (t.id = up.current_tenant_id) as is_active,
    t.created_at as tenant_created_at
FROM copilot_internal.tenants t
JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
LEFT JOIN copilot_internal.user_preferences up ON up.user_id = tm.user_id
WHERE t.deleted_at IS NULL
  AND tm.status = 'active'
  AND tm.user_id = auth.uid();

GRANT SELECT ON public.user_tenants_view TO authenticated;

-- ========================================
-- PART 7: Grant Permissions
-- ========================================

-- Grant table access to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.tenants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.tenant_memberships TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.user_preferences TO service_role;

-- Grant authenticated users access through RLS policies
GRANT SELECT, INSERT, UPDATE ON copilot_internal.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON copilot_internal.tenant_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.user_preferences TO authenticated;

-- ========================================
-- End of Migration
-- ========================================
