-- ============================================================================
-- Workspace Deletion Flow - Soft Delete Implementation
-- ============================================================================
--
-- This migration implements soft delete for workspaces with:
-- - 30-day grace period for restoration
-- - Automatic cleanup of expired deletions
-- - Audit trail (deleted_by, deleted_at)
-- - Protection of personal workspaces
-- - Validation of active execution contexts
--
-- Part of: HIGH-1 Implementation (OUTSTANDING_ISSUES.md)
-- ============================================================================

-- Add soft delete columns to tenants table
ALTER TABLE copilot_internal.tenants
  ADD COLUMN deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN deleted_by uuid REFERENCES auth.users(id);

CREATE INDEX idx_tenants_deleted_at ON copilot_internal.tenants(deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN copilot_internal.tenants.deleted_at IS
  'Soft delete timestamp. Non-null indicates workspace is deleted but data retained for 30 days.';

COMMENT ON COLUMN copilot_internal.tenants.deleted_by IS
  'User who initiated deletion. For audit trail.';

-- Add soft delete to tenant_memberships
ALTER TABLE copilot_internal.tenant_memberships
  ADD COLUMN deleted_at timestamptz DEFAULT NULL;

CREATE INDEX idx_tenant_memberships_deleted_at ON copilot_internal.tenant_memberships(deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN copilot_internal.tenant_memberships.deleted_at IS
  'Soft delete timestamp. Set when workspace is deleted or membership is removed.';

-- Update RLS policies to exclude deleted workspaces
DROP POLICY IF EXISTS tenant_access ON copilot_internal.tenants;

CREATE POLICY tenant_access ON copilot_internal.tenants
  FOR SELECT
  USING (
    deleted_at IS NULL  -- ← Exclude deleted workspaces
    AND EXISTS (
      SELECT 1 FROM copilot_internal.tenant_memberships
      WHERE tenant_id = tenants.id
        AND user_id = auth.uid()
        AND status = 'active'
        AND deleted_at IS NULL  -- ← Exclude deleted memberships
    )
  );

-- Allow service role to see deleted workspaces (for admin/cleanup operations)
CREATE POLICY tenant_service_role ON copilot_internal.tenants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update tenant_memberships RLS policy to exclude deleted memberships
DROP POLICY IF EXISTS memberships_visibility ON copilot_internal.tenant_memberships;

CREATE POLICY memberships_visibility ON copilot_internal.tenant_memberships
  FOR SELECT
  USING (
    deleted_at IS NULL  -- ← Exclude deleted memberships
    AND tenant_id IN (
      SELECT tenant_id
      FROM copilot_internal.tenant_memberships
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- Function: delete_workspace
-- ============================================================================
-- Soft deletes a workspace with validation
-- - Prevents deletion of personal workspaces
-- - Requires owner role
-- - Checks for active execution contexts
-- - Returns detailed result with member count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_workspace(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_type text;
  v_user_role text;
  v_active_contexts_count integer;
  v_members_count integer;
  v_tenant_name text;
BEGIN
  -- Check workspace exists and get type
  SELECT type, name INTO v_tenant_type, v_tenant_name
  FROM copilot_internal.tenants
  WHERE id = p_tenant_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Workspace not found or already deleted'
    );
  END IF;

  -- Prevent deletion of personal workspaces
  IF v_tenant_type = 'personal' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Personal workspaces cannot be deleted'
    );
  END IF;

  -- Verify user is owner
  SELECT role INTO v_user_role
  FROM copilot_internal.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id
    AND status = 'active'
    AND deleted_at IS NULL;

  IF v_user_role IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is not a member of this workspace'
    );
  END IF;

  IF v_user_role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only workspace owners can delete workspaces',
      'user_role', v_user_role
    );
  END IF;

  -- Check for active execution contexts
  SELECT COUNT(*) INTO v_active_contexts_count
  FROM copilot_internal.execution_contexts
  WHERE tenant_id = p_tenant_id
    AND terminated_at IS NULL;

  IF v_active_contexts_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete workspace with active execution contexts. Please terminate all sandboxes first.',
      'active_contexts', v_active_contexts_count
    );
  END IF;

  -- Get member count for notification
  SELECT COUNT(*) INTO v_members_count
  FROM copilot_internal.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND deleted_at IS NULL;

  -- Soft delete workspace
  UPDATE copilot_internal.tenants
  SET deleted_at = NOW(),
      deleted_by = p_user_id
  WHERE id = p_tenant_id;

  -- Soft delete memberships
  UPDATE copilot_internal.tenant_memberships
  SET deleted_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL;

  -- Log deletion event (structured log for audit)
  RAISE NOTICE 'Workspace deleted: % (%) by user %, % members affected',
    v_tenant_name, p_tenant_id, p_user_id, v_members_count;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_at', NOW(),
    'workspace_name', v_tenant_name,
    'members_affected', v_members_count,
    'grace_period_days', 30,
    'restore_before', NOW() + INTERVAL '30 days'
  );
END;
$$;

COMMENT ON FUNCTION public.delete_workspace IS
  'Soft deletes a workspace. Personal workspaces cannot be deleted. Requires owner role. Checks for active execution contexts.';

-- ============================================================================
-- Function: restore_workspace
-- ============================================================================
-- Restores a soft-deleted workspace within grace period
-- - 30-day grace period
-- - Only user who deleted can restore
-- - Restores workspace and memberships
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restore_workspace(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_grace_period_expired boolean;
  v_tenant_name text;
  v_members_restored integer;
BEGIN
  -- Get deletion info
  SELECT deleted_at, deleted_by, name INTO v_deleted_at, v_deleted_by, v_tenant_name
  FROM copilot_internal.tenants
  WHERE id = p_tenant_id;

  IF v_deleted_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Workspace is not deleted'
    );
  END IF;

  -- Check grace period (30 days)
  v_grace_period_expired := (NOW() - v_deleted_at) > INTERVAL '30 days';

  IF v_grace_period_expired THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Grace period expired - workspace cannot be restored',
      'deleted_at', v_deleted_at,
      'days_since_deletion', EXTRACT(DAY FROM (NOW() - v_deleted_at))
    );
  END IF;

  -- Verify user was owner or is the one who deleted it
  IF p_user_id != v_deleted_by THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only the user who deleted the workspace can restore it'
    );
  END IF;

  -- Restore workspace
  UPDATE copilot_internal.tenants
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_tenant_id;

  -- Restore memberships
  UPDATE copilot_internal.tenant_memberships
  SET deleted_at = NULL
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NOT NULL;

  -- Get count of restored memberships
  GET DIAGNOSTICS v_members_restored = ROW_COUNT;

  -- Log restoration event
  RAISE NOTICE 'Workspace restored: % (%) by user %, % members restored',
    v_tenant_name, p_tenant_id, p_user_id, v_members_restored;

  RETURN jsonb_build_object(
    'success', true,
    'restored_at', NOW(),
    'workspace_name', v_tenant_name,
    'members_restored', v_members_restored,
    'was_deleted_at', v_deleted_at
  );
END;
$$;

COMMENT ON FUNCTION public.restore_workspace IS
  'Restores a soft-deleted workspace within 30-day grace period. Only the user who deleted it can restore.';

-- ============================================================================
-- Function: cleanup_expired_deleted_workspaces
-- ============================================================================
-- Hard deletes workspaces that have been soft-deleted for more than 30 days
-- - Run via cron job or manual admin operation
-- - Cascades to related data (conversations, messages, etc.)
-- - Cost records are NOT deleted (retained for audit)
-- - Returns list of deleted workspace IDs
-- ============================================================================

CREATE OR REPLACE FUNCTION copilot_internal.cleanup_expired_deleted_workspaces()
RETURNS TABLE(
  deleted_count integer,
  deleted_workspace_ids uuid[],
  deleted_workspace_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_ids uuid[];
  deleted_names text[];
  delete_count integer;
BEGIN
  -- Find workspaces deleted more than 30 days ago
  WITH expired_workspaces AS (
    SELECT id, name
    FROM copilot_internal.tenants
    WHERE deleted_at IS NOT NULL
      AND (NOW() - deleted_at) > INTERVAL '30 days'
  ),
  -- Mark cost records with deletion timestamp (but don't delete them)
  marked_costs AS (
    UPDATE copilot_internal.llm_cost_records
    SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                   jsonb_build_object('workspace_deleted_at', NOW())
    WHERE tenant_id IN (SELECT id FROM expired_workspaces)
      AND NOT (metadata ? 'workspace_deleted_at')
  ),
  marked_e2b_costs AS (
    UPDATE copilot_internal.e2b_cost_records
    SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                   jsonb_build_object('workspace_deleted_at', NOW())
    WHERE tenant_id IN (SELECT id FROM expired_workspaces)
      AND NOT (metadata ? 'workspace_deleted_at')
  ),
  -- Hard delete conversations (cascade handles messages)
  deleted_conversations AS (
    DELETE FROM copilot_internal.conversations
    WHERE tenant_id IN (SELECT id FROM expired_workspaces)
  ),
  -- Hard delete conversation paths
  deleted_paths AS (
    DELETE FROM copilot_internal.conversation_paths
    WHERE tenant_id IN (SELECT id FROM expired_workspaces)
  ),
  -- Hard delete memberships
  deleted_memberships AS (
    DELETE FROM copilot_internal.tenant_memberships
    WHERE tenant_id IN (SELECT id FROM expired_workspaces)
  ),
  -- Hard delete execution contexts
  deleted_contexts AS (
    DELETE FROM copilot_internal.execution_contexts
    WHERE tenant_id IN (SELECT id FROM expired_workspaces)
  ),
  -- Hard delete workspaces
  deleted_tenants AS (
    DELETE FROM copilot_internal.tenants
    WHERE id IN (SELECT id FROM expired_workspaces)
    RETURNING id, name
  )
  SELECT array_agg(id), array_agg(name), count(*)::integer
  INTO deleted_ids, deleted_names, delete_count
  FROM deleted_tenants;

  deleted_ids := COALESCE(deleted_ids, ARRAY[]::uuid[]);
  deleted_names := COALESCE(deleted_names, ARRAY[]::text[]);
  delete_count := COALESCE(delete_count, 0);

  -- Log cleanup operation
  IF delete_count > 0 THEN
    RAISE NOTICE 'Cleaned up % expired deleted workspaces: %', delete_count, deleted_names;
  END IF;

  RETURN QUERY SELECT delete_count, deleted_ids, deleted_names;
END;
$$;

COMMENT ON FUNCTION copilot_internal.cleanup_expired_deleted_workspaces IS
  'Hard deletes workspaces that have been soft-deleted for more than 30 days. Cost records are marked but not deleted. Run via cron job.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.delete_workspace TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_workspace TO authenticated;
GRANT EXECUTE ON FUNCTION copilot_internal.cleanup_expired_deleted_workspaces TO service_role;
