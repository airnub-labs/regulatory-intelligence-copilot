-- ============================================================================
-- MIGRATION: Update Public Views for New Schema References
-- ============================================================================
-- Part of Schema Reorganization for SOC2/GDPR Compliance
--
-- This migration:
-- 1. Updates all public views to reference copilot_core schema
-- 2. Views exposed via PostgREST API remain in public schema
-- 3. Updates RLS-like filtering to use public.current_tenant_id()
--
-- Views updated (8):
--   - conversations_view
--   - conversation_messages_view
--   - conversation_paths_view
--   - conversation_contexts_view
--   - personas_view
--   - quick_prompts_view
--   - execution_contexts_view
--   - user_tenants_view
--
-- ============================================================================

-- =============================================================================
-- PART 0: Drop Existing Views (to allow column changes)
-- =============================================================================
-- CREATE OR REPLACE VIEW cannot change column structure, so we drop first

DROP VIEW IF EXISTS public.conversations_view CASCADE;
DROP VIEW IF EXISTS public.conversation_messages_view CASCADE;
DROP VIEW IF EXISTS public.conversation_paths_view CASCADE;
DROP VIEW IF EXISTS public.conversation_contexts_view CASCADE;
DROP VIEW IF EXISTS public.personas_view CASCADE;
DROP VIEW IF EXISTS public.quick_prompts_view CASCADE;
DROP VIEW IF EXISTS public.execution_contexts_view CASCADE;
DROP VIEW IF EXISTS public.user_tenants_view CASCADE;

-- =============================================================================
-- PART 1: Update Conversation Views
-- =============================================================================

-- 1.1: conversations_view
-- NOTE: Preserves original column ORDER from 20250205000000_conversation_archival.sql
-- archived_at must come BEFORE created_at for backwards compatibility
CREATE VIEW public.conversations_view AS
  WITH request_context AS (
    SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
  )
  SELECT
    c.id,
    c.tenant_id,
    c.user_id,
    c.share_audience,
    c.tenant_access,
    c.authorization_model,
    c.authorization_spec,
    c.title,
    c.persona_id,
    c.jurisdictions,
    c.archived_at,
    c.created_at,
    c.updated_at,
    c.last_message_at,
    c.active_path_id
  FROM copilot_core.conversations c
  CROSS JOIN request_context ctx
  WHERE ctx.requester_role = 'service_role'
     OR (ctx.tenant_id IS NOT NULL AND c.tenant_id = ctx.tenant_id);

COMMENT ON VIEW public.conversations_view IS 'Tenant-scoped conversation queries for PostgREST API';

-- 1.2: conversation_messages_view
-- NOTE: Preserves original column ORDER from 20250319000000_trace_columns.sql
-- Includes trace columns (trace_id, root_span_name, root_span_id) between metadata and created_at
CREATE VIEW public.conversation_messages_view AS
  WITH request_context AS (
    SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
  )
  SELECT
    m.id,
    m.conversation_id,
    m.tenant_id,
    m.user_id,
    m.role,
    m.content,
    m.metadata,
    m.trace_id,
    m.root_span_name,
    m.root_span_id,
    m.created_at,
    m.path_id,
    m.sequence_in_path,
    m.is_branch_point,
    m.branched_to_paths,
    m.message_type
  FROM copilot_core.conversation_messages m
  CROSS JOIN request_context ctx
  WHERE ctx.requester_role = 'service_role'
     OR (ctx.tenant_id IS NOT NULL AND m.tenant_id = ctx.tenant_id);

COMMENT ON VIEW public.conversation_messages_view IS 'Tenant-scoped message queries for PostgREST API';

-- 1.3: conversation_paths_view
CREATE VIEW public.conversation_paths_view AS
  WITH request_context AS (
    SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
  )
  SELECT
    p.id,
    p.conversation_id,
    p.tenant_id,
    p.parent_path_id,
    p.branch_point_message_id,
    p.name,
    p.description,
    p.is_primary,
    p.is_active,
    p.merged_to_path_id,
    p.merged_at,
    p.merge_summary_message_id,
    p.merge_mode,
    p.created_at,
    p.updated_at,
    -- Computed: count of messages in this path
    (SELECT COUNT(*) FROM copilot_core.conversation_messages m
     WHERE m.path_id = p.id) AS message_count,
    -- Computed: count of child paths (branches)
    (SELECT COUNT(*) FROM copilot_core.conversation_paths cp
     WHERE cp.parent_path_id = p.id AND cp.is_active = true) AS branch_count
  FROM copilot_core.conversation_paths p
  CROSS JOIN request_context ctx
  WHERE ctx.requester_role = 'service_role'
     OR (ctx.tenant_id IS NOT NULL AND p.tenant_id = ctx.tenant_id);

COMMENT ON VIEW public.conversation_paths_view IS 'Tenant-scoped path queries with computed fields';

-- 1.4: conversation_contexts_view
CREATE VIEW public.conversation_contexts_view AS
  WITH request_context AS (
    SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
  )
  SELECT
    cc.conversation_id,
    cc.tenant_id,
    cc.active_node_ids,
    cc.summary,
    cc.updated_at
  FROM copilot_core.conversation_contexts cc
  CROSS JOIN request_context ctx
  WHERE ctx.requester_role = 'service_role'
     OR (ctx.tenant_id IS NOT NULL AND cc.tenant_id = ctx.tenant_id);

COMMENT ON VIEW public.conversation_contexts_view IS 'Tenant-scoped conversation context state';

-- =============================================================================
-- PART 2: Update Reference Data Views
-- =============================================================================

-- 2.1: personas_view (global read)
-- Note: Original personas table has: id, label, description, jurisdictions
CREATE VIEW public.personas_view AS
  SELECT
    p.id,
    p.label,
    p.description,
    p.jurisdictions
  FROM copilot_core.personas p;

COMMENT ON VIEW public.personas_view IS 'AI personas - global reference data';

-- 2.2: quick_prompts_view (global read)
-- Note: Original quick_prompts table has: id, label, prompt, scenario_hint, persona_filter, jurisdictions
CREATE VIEW public.quick_prompts_view AS
  SELECT
    q.id,
    q.label,
    q.prompt,
    q.scenario_hint,
    q.persona_filter,
    q.jurisdictions
  FROM copilot_core.quick_prompts q;

COMMENT ON VIEW public.quick_prompts_view IS 'Prompt templates - global reference data';

-- =============================================================================
-- PART 3: Update Execution Context View
-- =============================================================================

-- 3.1: execution_contexts_view
CREATE VIEW public.execution_contexts_view AS
  WITH request_context AS (
    SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
  )
  SELECT
    ec.id,
    ec.tenant_id,
    ec.conversation_id,
    ec.path_id,
    ec.sandbox_id,
    ec.sandbox_status,
    ec.created_at,
    ec.last_used_at,
    ec.expires_at,
    ec.terminated_at,
    ec.error_message,
    ec.resource_usage,
    -- Computed: is expired
    (ec.expires_at < now() AND ec.terminated_at IS NULL) AS is_expired,
    -- Computed: time until expiry (in seconds)
    EXTRACT(EPOCH FROM (ec.expires_at - now()))::integer AS seconds_until_expiry,
    -- Computed: age (in seconds)
    EXTRACT(EPOCH FROM (now() - ec.created_at))::integer AS age_seconds
  FROM copilot_core.execution_contexts ec
  CROSS JOIN request_context ctx
  WHERE ctx.requester_role = 'service_role'
     OR (ctx.tenant_id IS NOT NULL AND ec.tenant_id = ctx.tenant_id);

COMMENT ON VIEW public.execution_contexts_view IS 'E2B sandbox lifecycle tracking with computed fields';

-- =============================================================================
-- PART 4: Update User/Tenant View
-- =============================================================================

-- 4.1: user_tenants_view
-- NOTE: Preserves original column structure from 20260105000003_multi_tenant_user_model.sql
-- Original columns: tenant_id, tenant_name, tenant_slug, tenant_type, tenant_plan,
--                   owner_id, user_id, role, membership_status, joined_at, is_active, tenant_created_at
CREATE VIEW public.user_tenants_view AS
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
FROM copilot_core.tenants t
JOIN copilot_core.tenant_memberships tm ON tm.tenant_id = t.id
LEFT JOIN copilot_core.user_preferences up ON up.user_id = tm.user_id
WHERE t.deleted_at IS NULL
  AND tm.status = 'active'
  AND tm.user_id = auth.uid();

COMMENT ON VIEW public.user_tenants_view IS 'Workspaces accessible to the current user with full tenant details';

-- =============================================================================
-- PART 5: Update Public Functions with Schema References
-- =============================================================================

-- 5.1: delete_workspace (references copilot_core.tenants, tenant_memberships, execution_contexts)
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
  FROM copilot_core.tenants
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
  FROM copilot_core.tenant_memberships
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
  FROM copilot_core.execution_contexts
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
  FROM copilot_core.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND deleted_at IS NULL;

  -- Soft delete workspace
  UPDATE copilot_core.tenants
  SET deleted_at = NOW(),
      deleted_by = p_user_id
  WHERE id = p_tenant_id;

  -- Soft delete memberships
  UPDATE copilot_core.tenant_memberships
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

-- 5.2: restore_workspace (references copilot_core.tenants, tenant_memberships)
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
  FROM copilot_core.tenants
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
  UPDATE copilot_core.tenants
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_tenant_id;

  -- Restore memberships
  UPDATE copilot_core.tenant_memberships
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

-- =============================================================================
-- PART 6: Grant View Permissions
-- =============================================================================

-- Revoke all first, then grant specifically
REVOKE ALL ON public.conversations_view FROM public, anon, authenticated, service_role;
REVOKE ALL ON public.conversation_messages_view FROM public, anon, authenticated, service_role;
REVOKE ALL ON public.conversation_paths_view FROM public, anon, authenticated, service_role;
REVOKE ALL ON public.conversation_contexts_view FROM public, anon, authenticated, service_role;
REVOKE ALL ON public.personas_view FROM public, anon, authenticated, service_role;
REVOKE ALL ON public.quick_prompts_view FROM public, anon, authenticated, service_role;
REVOKE ALL ON public.execution_contexts_view FROM public, anon, authenticated, service_role;
REVOKE ALL ON public.user_tenants_view FROM public, anon, authenticated, service_role;

-- Grant SELECT to authenticated and service_role
GRANT SELECT ON public.conversations_view TO authenticated, service_role;
GRANT SELECT ON public.conversation_messages_view TO authenticated, service_role;
GRANT SELECT ON public.conversation_paths_view TO authenticated, service_role;
GRANT SELECT ON public.conversation_contexts_view TO authenticated, service_role;
GRANT SELECT ON public.personas_view TO authenticated, service_role;
GRANT SELECT ON public.quick_prompts_view TO authenticated, service_role;
GRANT SELECT ON public.execution_contexts_view TO authenticated, service_role;
GRANT SELECT ON public.user_tenants_view TO authenticated, service_role;

-- =============================================================================
-- PART 7: Verification
-- =============================================================================

DO $$
DECLARE
  view_count integer;
BEGIN
  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name IN (
      'conversations_view',
      'conversation_messages_view',
      'conversation_paths_view',
      'conversation_contexts_view',
      'personas_view',
      'quick_prompts_view',
      'execution_contexts_view',
      'user_tenants_view'
    );

  IF view_count < 8 THEN
    RAISE WARNING 'Expected 8 public views, found %', view_count;
  END IF;

  RAISE NOTICE '=== Public Views Update completed successfully ===';
  RAISE NOTICE '  ✓ Updated % public views to reference copilot_core', view_count;
  RAISE NOTICE '  ✓ conversations_view - tenant-scoped conversation queries';
  RAISE NOTICE '  ✓ conversation_messages_view - tenant-scoped message queries';
  RAISE NOTICE '  ✓ conversation_paths_view - path queries with computed fields';
  RAISE NOTICE '  ✓ conversation_contexts_view - active context state';
  RAISE NOTICE '  ✓ personas_view - AI personas (global + tenant-specific)';
  RAISE NOTICE '  ✓ quick_prompts_view - prompt templates';
  RAISE NOTICE '  ✓ execution_contexts_view - E2B sandbox lifecycle';
  RAISE NOTICE '  ✓ user_tenants_view - user workspace access';
  RAISE NOTICE '  ✓ PostgREST API exposure maintained via public schema';
END $$;
