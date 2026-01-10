-- ============================================================================
-- MIGRATION: Revert Unexpected Changes from Schema Reorganization
-- ============================================================================
-- This migration reverts 26 objects that had unexpected changes beyond
-- schema reorganization during the migration from copilot_internal/metrics
-- to the 5 new schemas.
--
-- Reference: docs/validation-status-report.md
-- Original state: before.schema.sql
-- Issue: schema_changes_report.md identified 87 changed objects
-- Already fixed: ~20 objects (views/comments) were already reverted
-- Remaining: 26 objects need to be reverted to previous migration state
-- ============================================================================

-- =============================================================================
-- PART 1: Revoke Authenticated Grants from Functions (5 objects)
-- =============================================================================
-- These functions gained authenticated access during migration but should
-- remain service_role only. Original state had no authenticated grants.

-- Path navigation functions
REVOKE ALL ON FUNCTION copilot_core.get_path_ancestors(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION copilot_core.get_root_path_id(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION copilot_core.next_sequence_in_path(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION copilot_core.resolve_path_messages(uuid) FROM authenticated;

-- Notification creation function
REVOKE ALL ON FUNCTION copilot_core.create_notification(uuid, uuid, text, text, text, text, text, jsonb) FROM authenticated;

COMMENT ON FUNCTION copilot_core.get_path_ancestors IS
  'Returns all ancestor paths for a given path ID. Access: service_role only (internal query for path resolution).';
COMMENT ON FUNCTION copilot_core.get_root_path_id IS
  'Returns the root path ID for a conversation path. Access: service_role only (internal navigation).';
COMMENT ON FUNCTION copilot_core.next_sequence_in_path IS
  'Returns the next sequence number for a path. Access: service_role only (internal sequencing).';
COMMENT ON FUNCTION copilot_core.resolve_path_messages IS
  'Resolves all messages in a path. Access: service_role only (internal message resolution).';
COMMENT ON FUNCTION copilot_core.create_notification IS
  'Creates a notification for a user. Access: service_role only (backend notification system).';

-- =============================================================================
-- PART 2: Revoke DELETE Grants from Tables (5 objects)
-- =============================================================================
-- These tables gained DELETE grants for authenticated during migration.
-- Original state: personas/quick_prompts had no authenticated grants at all,
-- tenant_llm_policies had SELECT only, tenant_memberships/tenants had SELECT+INSERT+UPDATE.

-- personas: Remove ALL authenticated grants (originally had none)
REVOKE ALL ON TABLE copilot_core.personas FROM authenticated;

-- quick_prompts: Remove ALL authenticated grants (originally had none)
REVOKE ALL ON TABLE copilot_core.quick_prompts FROM authenticated;

-- tenant_llm_policies: Restore to SELECT only
REVOKE ALL ON TABLE copilot_core.tenant_llm_policies FROM authenticated;
GRANT SELECT ON TABLE copilot_core.tenant_llm_policies TO authenticated;

-- tenant_memberships: Restore to SELECT+INSERT+UPDATE (no DELETE)
REVOKE ALL ON TABLE copilot_core.tenant_memberships FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE copilot_core.tenant_memberships TO authenticated;

-- tenants: Restore to SELECT+INSERT+UPDATE (no DELETE)
REVOKE ALL ON TABLE copilot_core.tenants FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE copilot_core.tenants TO authenticated;

-- Update comments to reflect access control
COMMENT ON TABLE copilot_core.personas IS
  'User-defined AI personas. Access: service_role only (no direct client access).';
COMMENT ON TABLE copilot_core.quick_prompts IS
  'Quick prompt templates. Access: service_role only (no direct client access).';
COMMENT ON TABLE copilot_core.tenant_llm_policies IS
  'Tenant-specific LLM routing policies. Access: authenticated (SELECT only via RLS).';
COMMENT ON TABLE copilot_core.tenant_memberships IS
  'User-tenant membership relationships. Access: authenticated (SELECT, INSERT, UPDATE via RLS, no DELETE).';
COMMENT ON TABLE copilot_core.tenants IS
  'Tenant organizations. Access: authenticated (SELECT, INSERT, UPDATE via RLS, no DELETE).';

-- =============================================================================
-- PART 3: Revert Policy Changes (2 objects)
-- =============================================================================
-- Policies were changed from JWT extraction to helper functions.
-- Revert to original JWT extraction pattern.

-- Drop current policies
DROP POLICY IF EXISTS cost_quotas_tenant_select ON copilot_billing.cost_quotas;
DROP POLICY IF EXISTS e2b_cost_records_tenant_select ON copilot_billing.e2b_cost_records;

-- Recreate with original JWT extraction
-- cost_quotas: Original had 3 conditions (platform, tenant via JWT, user via JWT 'sub')
CREATE POLICY cost_quotas_tenant_select ON copilot_billing.cost_quotas
  FOR SELECT
  TO authenticated
  USING (
    (scope = 'platform'::text)
    OR
    (scope = 'tenant'::text AND scope_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid)
    OR
    (scope = 'user'::text AND scope_id = ((auth.jwt() ->> 'sub'::text))::uuid)
  );

-- e2b_cost_records: Simple tenant_id match via JWT
CREATE POLICY e2b_cost_records_tenant_select ON copilot_billing.e2b_cost_records
  FOR SELECT
  TO authenticated
  USING (tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid);

COMMENT ON POLICY cost_quotas_tenant_select ON copilot_billing.cost_quotas IS
  'Allow users to view quotas for their platform, tenant (via JWT), or user scope.';
COMMENT ON POLICY e2b_cost_records_tenant_select ON copilot_billing.e2b_cost_records IS
  'Allow users to view E2B cost records for their tenant (via JWT extraction).';

-- =============================================================================
-- PART 4: Revert Function Logic/Style Changes (3 objects)
-- =============================================================================

-- 4.1: Restore log_permission_config_change to original complex implementation
DROP FUNCTION IF EXISTS copilot_audit.log_permission_config_change() CASCADE;

CREATE OR REPLACE FUNCTION copilot_audit.log_permission_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    FROM copilot_admin.admin_users
    WHERE id = COALESCE(NEW.updated_by, auth.uid());
    v_actor_role := COALESCE(v_actor_role, 'unknown');

    -- Insert audit log entry
    INSERT INTO copilot_audit.permission_audit_log (
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
$$;

-- Recreate trigger (was dropped with CASCADE)
DROP TRIGGER IF EXISTS trigger_permission_config_audit ON copilot_admin.admin_permission_configs;
CREATE TRIGGER trigger_permission_config_audit
  AFTER INSERT OR UPDATE OR DELETE ON copilot_admin.admin_permission_configs
  FOR EACH ROW EXECUTE FUNCTION copilot_audit.log_permission_config_change();

COMMENT ON FUNCTION copilot_audit.log_permission_config_change IS
  'Audit trigger for admin permission config changes. Tracks detailed field-level changes, actor information, and maintains comprehensive audit trail for SOC2 compliance.';

-- 4.2: Restore update_admin_user_timestamp to use = instead of :=
CREATE OR REPLACE FUNCTION copilot_admin.update_admin_user_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION copilot_admin.update_admin_user_timestamp IS
  'Trigger function to update updated_at timestamp on admin_users table.';

-- 4.3: Restore update_permission_config_timestamp to use = instead of :=
CREATE OR REPLACE FUNCTION copilot_admin.update_permission_config_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION copilot_admin.update_permission_config_timestamp IS
  'Trigger function to update updated_at timestamp on admin_permission_configs table.';

-- =============================================================================
-- PART 5: Verification
-- =============================================================================

DO $$
DECLARE
    v_function_auth_grants integer;
    v_table_delete_grants integer;
    v_personas_grants integer;
    v_quick_prompts_grants integer;
    v_policy_jwt_count integer;
    v_policy_helper_count integer;
BEGIN
    -- Count authenticated function grants (should be 0)
    SELECT COUNT(*) INTO v_function_auth_grants
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'copilot_core'
      AND routine_name IN ('get_path_ancestors', 'get_root_path_id', 'next_sequence_in_path',
                           'resolve_path_messages', 'create_notification')
      AND grantee = 'authenticated';

    -- Count tables with DELETE grants to authenticated (should be 0)
    SELECT COUNT(*) INTO v_table_delete_grants
    FROM information_schema.table_privileges
    WHERE table_schema = 'copilot_core'
      AND table_name IN ('personas', 'quick_prompts', 'tenant_llm_policies',
                         'tenant_memberships', 'tenants')
      AND grantee = 'authenticated'
      AND privilege_type = 'DELETE';

    -- Count personas authenticated grants (should be 0)
    SELECT COUNT(*) INTO v_personas_grants
    FROM information_schema.table_privileges
    WHERE table_schema = 'copilot_core'
      AND table_name = 'personas'
      AND grantee = 'authenticated';

    -- Count quick_prompts authenticated grants (should be 0)
    SELECT COUNT(*) INTO v_quick_prompts_grants
    FROM information_schema.table_privileges
    WHERE table_schema = 'copilot_core'
      AND table_name = 'quick_prompts'
      AND grantee = 'authenticated';

    -- Count policies using JWT extraction (should be 2)
    SELECT COUNT(*) INTO v_policy_jwt_count
    FROM pg_policies
    WHERE schemaname IN ('copilot_billing')
      AND policyname IN ('cost_quotas_tenant_select', 'e2b_cost_records_tenant_select')
      AND qual LIKE '%auth.jwt()%';

    -- Count policies using helper functions (should be 0)
    SELECT COUNT(*) INTO v_policy_helper_count
    FROM pg_policies
    WHERE schemaname IN ('copilot_billing')
      AND policyname IN ('cost_quotas_tenant_select', 'e2b_cost_records_tenant_select')
      AND qual LIKE '%current_tenant_id()%';

    -- Report results
    RAISE NOTICE '';
    RAISE NOTICE '=== Revert Migration Verification ===';
    RAISE NOTICE 'Function authenticated grants: % (expected: 0)', v_function_auth_grants;
    RAISE NOTICE 'Table DELETE grants to authenticated: % (expected: 0)', v_table_delete_grants;
    RAISE NOTICE 'Personas authenticated grants: % (expected: 0)', v_personas_grants;
    RAISE NOTICE 'Quick prompts authenticated grants: % (expected: 0)', v_quick_prompts_grants;
    RAISE NOTICE 'Policies using JWT extraction: % (expected: 2)', v_policy_jwt_count;
    RAISE NOTICE 'Policies using helper functions: % (expected: 0)', v_policy_helper_count;
    RAISE NOTICE '';

    -- Raise warnings if verification fails
    IF v_function_auth_grants > 0 THEN
        RAISE WARNING 'Functions still have authenticated grants (expected: 0)';
    END IF;

    IF v_table_delete_grants > 0 THEN
        RAISE WARNING 'Tables still have DELETE grants to authenticated (expected: 0)';
    END IF;

    IF v_personas_grants > 0 THEN
        RAISE WARNING 'Personas table still has authenticated grants (expected: 0)';
    END IF;

    IF v_quick_prompts_grants > 0 THEN
        RAISE WARNING 'Quick prompts table still has authenticated grants (expected: 0)';
    END IF;

    IF v_policy_jwt_count != 2 THEN
        RAISE WARNING 'Policies not using JWT extraction (expected: 2, got: %)', v_policy_jwt_count;
    END IF;

    IF v_policy_helper_count > 0 THEN
        RAISE WARNING 'Policies still using helper functions (expected: 0, got: %)', v_policy_helper_count;
    END IF;

    -- Success message
    IF v_function_auth_grants = 0 AND
       v_table_delete_grants = 0 AND
       v_personas_grants = 0 AND
       v_quick_prompts_grants = 0 AND
       v_policy_jwt_count = 2 AND
       v_policy_helper_count = 0 THEN
        RAISE NOTICE '✓ ALL VERIFICATIONS PASSED';
        RAISE NOTICE '  - 5 functions: authenticated grants revoked';
        RAISE NOTICE '  - 5 tables: DELETE grants revoked, correct grants restored';
        RAISE NOTICE '  - 2 policies: reverted to JWT extraction';
        RAISE NOTICE '  - 3 functions: logic/style reverted to original';
        RAISE NOTICE '';
        RAISE NOTICE 'Total objects fixed: 26';
        RAISE NOTICE 'Migration completed successfully!';
    ELSE
        RAISE WARNING 'Some verifications failed - please review above warnings';
    END IF;
END $$;
