-- ============================================================================
-- Admin Permission Configurations (Hybrid RBAC)
-- ============================================================================
-- This migration adds support for the Hybrid RBAC permission system.
-- It stores per-user permission configurations that override or extend
-- their role defaults.
--
-- The permission system supports:
-- 1. Role-based defaults (54 atomic permissions across 12 categories)
-- 2. Permission groups (26 reusable bundles)
-- 3. Individual grants/revocations per user
--
-- Roles (8 levels):
-- - super_admin (8): Full platform access
-- - platform_engineer (7): Infrastructure operations
-- - account_manager (6): Customer success, tenant-scoped
-- - compliance_auditor (5): Audit logs, compliance reports
-- - support_tier_3 (4): Engineering support (code access, prod debugging)
-- - support_tier_2 (3): Escalation support, cross-tenant access
-- - support_tier_1 (2): Frontline support, assigned tenants
-- - viewer (1): Read-only dashboards
--
-- SOC2 Compliance: All changes to permissions are logged in the audit table.
-- ============================================================================

-- Create internal schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS copilot_internal;

-- ============================================================================
-- Admin Users Table
-- ============================================================================
-- Stores admin user profiles and role assignments.
-- Separate from auth.users to support admin-specific fields.

CREATE TABLE IF NOT EXISTS copilot_internal.admin_users (
    -- Primary key, links to auth.users
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- User profile
    email TEXT NOT NULL,
    display_name TEXT,

    -- Role assignment (one of the 8 roles)
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN (
        'super_admin',
        'platform_engineer',
        'account_manager',
        'compliance_auditor',
        'support_tier_3',
        'support_tier_2',
        'support_tier_1',
        'viewer'
    )),

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'active',
        'inactive',
        'pending'
    )),

    -- Tenant assignments
    tenant_id UUID,                    -- Primary tenant (for account managers)
    assigned_tenant_ids UUID[] DEFAULT '{}', -- For support tiers

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Indexes for admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_email
    ON copilot_internal.admin_users(email);

CREATE INDEX IF NOT EXISTS idx_admin_users_role
    ON copilot_internal.admin_users(role);

CREATE INDEX IF NOT EXISTS idx_admin_users_status
    ON copilot_internal.admin_users(status);

CREATE INDEX IF NOT EXISTS idx_admin_users_tenant_id
    ON copilot_internal.admin_users(tenant_id);

-- Function to update the updated_at timestamp for admin_users
CREATE OR REPLACE FUNCTION copilot_internal.update_admin_user_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_admin_user_updated_at
    ON copilot_internal.admin_users;

CREATE TRIGGER trigger_admin_user_updated_at
    BEFORE UPDATE ON copilot_internal.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_admin_user_timestamp();

-- ============================================================================
-- Permission Configuration Table
-- ============================================================================
-- Stores per-user permission overrides beyond their role defaults.
-- Users without entries use only their role's default permissions.

CREATE TABLE IF NOT EXISTS copilot_internal.admin_permission_configs (
    -- Primary key: one config per user
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Additional permission groups assigned beyond role defaults
    -- Example: ["data_export", "cross_tenant_access"]
    additional_groups TEXT[] NOT NULL DEFAULT '{}',

    -- Individual permissions granted beyond role and groups
    -- Example: ["audit.export", "users.view_as"]
    permission_grants TEXT[] NOT NULL DEFAULT '{}',

    -- Individual permissions revoked from role and groups
    -- Example: ["billing.view_invoices"]
    permission_revocations TEXT[] NOT NULL DEFAULT '{}',

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),

    -- Reason for the current configuration (for audit)
    reason TEXT,

    -- Constraints
    CONSTRAINT valid_additional_groups CHECK (
        array_length(additional_groups, 1) IS NULL OR
        array_length(additional_groups, 1) <= 50
    ),
    CONSTRAINT valid_permission_grants CHECK (
        array_length(permission_grants, 1) IS NULL OR
        array_length(permission_grants, 1) <= 100
    ),
    CONSTRAINT valid_permission_revocations CHECK (
        array_length(permission_revocations, 1) IS NULL OR
        array_length(permission_revocations, 1) <= 100
    )
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_permission_configs_updated_at
    ON copilot_internal.admin_permission_configs(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_permission_configs_updated_by
    ON copilot_internal.admin_permission_configs(updated_by);

-- ============================================================================
-- Permission Audit Log Table
-- ============================================================================
-- Logs all changes to permission configurations for SOC2 compliance.
-- This provides a complete audit trail of who changed what and when.

CREATE TABLE IF NOT EXISTS copilot_internal.permission_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who was affected
    target_user_id UUID NOT NULL,
    target_user_email TEXT NOT NULL,

    -- Who made the change
    actor_id UUID NOT NULL,
    actor_email TEXT NOT NULL,
    actor_role TEXT NOT NULL,

    -- What was changed
    action TEXT NOT NULL CHECK (action IN (
        'permission_config_created',
        'permission_config_updated',
        'permission_config_deleted',
        'group_added',
        'group_removed',
        'permission_granted',
        'permission_revoked',
        'revocation_added',
        'revocation_removed',
        'role_changed'
    )),

    -- Before/after state
    old_value JSONB,
    new_value JSONB,

    -- Diff for easier auditing
    changes JSONB,

    -- Context
    reason TEXT,
    ip_address TEXT,
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_permission_audit_target_user
    ON copilot_internal.permission_audit_log(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_permission_audit_actor
    ON copilot_internal.permission_audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_permission_audit_action
    ON copilot_internal.permission_audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_permission_audit_created_at
    ON copilot_internal.permission_audit_log(created_at DESC);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION copilot_internal.update_permission_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_permission_config_updated_at
    ON copilot_internal.admin_permission_configs;

CREATE TRIGGER trigger_permission_config_updated_at
    BEFORE UPDATE ON copilot_internal.admin_permission_configs
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_permission_config_timestamp();

-- Function to log permission config changes
CREATE OR REPLACE FUNCTION copilot_internal.log_permission_config_change()
RETURNS TRIGGER AS $$
DECLARE
    v_action TEXT;
    v_old_value JSONB;
    v_new_value JSONB;
    v_changes JSONB;
    v_target_email TEXT;
    v_actor_email TEXT;
    v_actor_role TEXT;
BEGIN
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        v_action := 'permission_config_created';
        v_old_value := NULL;
        v_new_value := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'permission_config_updated';
        v_old_value := to_jsonb(OLD);
        v_new_value := to_jsonb(NEW);

        -- Calculate changes
        v_changes := jsonb_build_object(
            'additional_groups', CASE
                WHEN OLD.additional_groups IS DISTINCT FROM NEW.additional_groups
                THEN jsonb_build_object('old', OLD.additional_groups, 'new', NEW.additional_groups)
                ELSE NULL END,
            'permission_grants', CASE
                WHEN OLD.permission_grants IS DISTINCT FROM NEW.permission_grants
                THEN jsonb_build_object('old', OLD.permission_grants, 'new', NEW.permission_grants)
                ELSE NULL END,
            'permission_revocations', CASE
                WHEN OLD.permission_revocations IS DISTINCT FROM NEW.permission_revocations
                THEN jsonb_build_object('old', OLD.permission_revocations, 'new', NEW.permission_revocations)
                ELSE NULL END
        );
        -- Remove null entries
        v_changes := (
            SELECT jsonb_object_agg(key, value)
            FROM jsonb_each(v_changes)
            WHERE value IS NOT NULL
        );
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'permission_config_deleted';
        v_old_value := to_jsonb(OLD);
        v_new_value := NULL;
    END IF;

    -- Get target user email
    SELECT email INTO v_target_email
    FROM auth.users
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);

    -- Get actor info (use updated_by if available, otherwise current user)
    SELECT email INTO v_actor_email
    FROM auth.users
    WHERE id = COALESCE(NEW.updated_by, auth.uid());

    -- Get actor role from admin_users table
    SELECT role INTO v_actor_role
    FROM copilot_internal.admin_users
    WHERE id = COALESCE(NEW.updated_by, auth.uid());
    v_actor_role := COALESCE(v_actor_role, 'unknown');

    -- Insert audit log entry
    INSERT INTO copilot_internal.permission_audit_log (
        target_user_id,
        target_user_email,
        actor_id,
        actor_email,
        actor_role,
        action,
        old_value,
        new_value,
        changes,
        reason
    ) VALUES (
        COALESCE(NEW.user_id, OLD.user_id),
        COALESCE(v_target_email, 'unknown'),
        COALESCE(NEW.updated_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(v_actor_email, 'system'),
        v_actor_role,
        v_action,
        v_old_value,
        v_new_value,
        v_changes,
        COALESCE(NEW.reason, OLD.reason)
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-log changes
DROP TRIGGER IF EXISTS trigger_permission_config_audit
    ON copilot_internal.admin_permission_configs;

CREATE TRIGGER trigger_permission_config_audit
    AFTER INSERT OR UPDATE OR DELETE ON copilot_internal.admin_permission_configs
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.log_permission_config_change();

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS
ALTER TABLE copilot_internal.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.admin_permission_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.permission_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Admin Users RLS Policies
-- ============================================================================

-- Policy: Users can view their own admin profile
CREATE POLICY admin_users_self_view ON copilot_internal.admin_users
    FOR SELECT
    USING (id = auth.uid());

-- Policy: Super admins can do everything with admin_users
CREATE POLICY admin_users_super_admin ON copilot_internal.admin_users
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users au
            WHERE au.id = auth.uid()
            AND au.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users au
            WHERE au.id = auth.uid()
            AND au.role = 'super_admin'
        )
    );

-- Policy: Platform engineers can view all admin users
CREATE POLICY admin_users_platform_engineer_view ON copilot_internal.admin_users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users au
            WHERE au.id = auth.uid()
            AND au.role = 'platform_engineer'
        )
    );

-- Policy: Account managers and support tiers can view users in their tenants
CREATE POLICY admin_users_tenant_view ON copilot_internal.admin_users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users au
            WHERE au.id = auth.uid()
            AND au.role IN ('account_manager', 'support_tier_1', 'support_tier_2', 'support_tier_3')
            AND (
                au.tenant_id = copilot_internal.admin_users.tenant_id
                OR copilot_internal.admin_users.tenant_id = ANY(au.assigned_tenant_ids)
            )
        )
    );

-- Policy: Compliance auditors can view all admin users (for audit purposes)
CREATE POLICY admin_users_compliance_view ON copilot_internal.admin_users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users au
            WHERE au.id = auth.uid()
            AND au.role = 'compliance_auditor'
        )
    );

-- Policy: Super admins can do everything
CREATE POLICY admin_permission_configs_super_admin ON copilot_internal.admin_permission_configs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

-- Policy: Users can view their own permission config
CREATE POLICY admin_permission_configs_self_view ON copilot_internal.admin_permission_configs
    FOR SELECT
    USING (user_id = auth.uid());

-- Policy: Super admins can view all audit logs
CREATE POLICY permission_audit_log_super_admin ON copilot_internal.permission_audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

-- Policy: Compliance auditors can view audit logs
CREATE POLICY permission_audit_log_compliance ON copilot_internal.permission_audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM copilot_internal.admin_users
            WHERE id = auth.uid()
            AND role = 'compliance_auditor'
        )
    );

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE copilot_internal.admin_users IS
    'Admin user profiles with role assignments. Part of the Hybrid RBAC system with 8 role levels.';

COMMENT ON TABLE copilot_internal.admin_permission_configs IS
    'Per-user permission configurations that override or extend role defaults. Part of the Hybrid RBAC system.';

COMMENT ON TABLE copilot_internal.permission_audit_log IS
    'Audit trail for all permission configuration changes. Required for SOC2 compliance.';

COMMENT ON COLUMN copilot_internal.admin_permission_configs.additional_groups IS
    'Permission groups assigned beyond the user''s role defaults (e.g., ["data_export", "cross_tenant_access"])';

COMMENT ON COLUMN copilot_internal.admin_permission_configs.permission_grants IS
    'Individual permissions granted beyond role and groups (e.g., ["audit.export"])';

COMMENT ON COLUMN copilot_internal.admin_permission_configs.permission_revocations IS
    'Individual permissions revoked from role and groups (e.g., ["billing.view_invoices"])';

-- ============================================================================
-- Grant Permissions for Service Role
-- ============================================================================
-- The service role needs access to these tables for API operations.
-- RLS is bypassed for service role, so these grants enable full access.

GRANT USAGE ON SCHEMA copilot_internal TO service_role;
GRANT ALL ON copilot_internal.admin_users TO service_role;
GRANT ALL ON copilot_internal.admin_permission_configs TO service_role;
GRANT ALL ON copilot_internal.permission_audit_log TO service_role;

-- Also grant to authenticated role for RLS-based access
GRANT USAGE ON SCHEMA copilot_internal TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.admin_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.admin_permission_configs TO authenticated;
GRANT SELECT ON copilot_internal.permission_audit_log TO authenticated;
