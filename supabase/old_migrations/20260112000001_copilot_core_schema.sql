-- ============================================================================
-- MIGRATION: copilot_core Schema (Core Application Tables)
-- ============================================================================
-- Part of Schema Reorganization for SOC2/GDPR Compliance
--
-- This migration:
-- 1. Creates the copilot_core schema
-- 2. Moves 16 core application tables from copilot_internal
-- 3. Moves associated functions, triggers, and indexes
-- 4. Updates RLS policies for new schema
--
-- Tables moved (16 tables):
--   - conversations, conversation_messages, conversation_paths
--   - conversation_contexts, conversation_configs
--   - execution_contexts, tenants, tenant_memberships
--   - user_preferences, user_tenant_contexts, workspace_invitations
--   - tenant_llm_policies, personas, quick_prompts
--   - notifications, membership_change_events
--
-- ============================================================================

-- =============================================================================
-- PART 1: Create copilot_core Schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS copilot_core;

COMMENT ON SCHEMA copilot_core IS 'Core application tables with RLS enforcement. Contains user-facing operational data.';

-- Grant schema access
GRANT USAGE ON SCHEMA copilot_core TO service_role;
GRANT USAGE ON SCHEMA copilot_core TO authenticated;

-- =============================================================================
-- PART 2: Move Tables to copilot_core
-- =============================================================================
-- Using ALTER TABLE SET SCHEMA which:
-- - Moves atomically without copying data
-- - Preserves all constraints, defaults, indexes, triggers
-- - Maintains foreign key relationships
--
-- Order matters: parent tables first (tenants), then dependent tables

-- 2.1: Move tenants (parent table - must be first)
ALTER TABLE copilot_internal.tenants SET SCHEMA copilot_core;

-- 2.2: Move tenant_memberships (depends on tenants)
ALTER TABLE copilot_internal.tenant_memberships SET SCHEMA copilot_core;

-- 2.3: Move user_preferences (depends on tenants)
ALTER TABLE copilot_internal.user_preferences SET SCHEMA copilot_core;

-- 2.4: Move user_tenant_contexts (depends on tenants)
ALTER TABLE copilot_internal.user_tenant_contexts SET SCHEMA copilot_core;

-- 2.5: Move workspace_invitations (depends on tenants)
ALTER TABLE copilot_internal.workspace_invitations SET SCHEMA copilot_core;

-- 2.6: Move tenant_llm_policies (depends on tenants)
ALTER TABLE copilot_internal.tenant_llm_policies SET SCHEMA copilot_core;

-- 2.7: Move personas
ALTER TABLE copilot_internal.personas SET SCHEMA copilot_core;

-- 2.8: Move quick_prompts
ALTER TABLE copilot_internal.quick_prompts SET SCHEMA copilot_core;

-- 2.9: Move conversations (depends on tenants, personas)
ALTER TABLE copilot_internal.conversations SET SCHEMA copilot_core;

-- 2.10: Move conversation_paths (depends on conversations)
ALTER TABLE copilot_internal.conversation_paths SET SCHEMA copilot_core;

-- 2.11: Move conversation_messages (depends on conversations, paths)
ALTER TABLE copilot_internal.conversation_messages SET SCHEMA copilot_core;

-- 2.12: Move conversation_contexts (depends on conversations)
ALTER TABLE copilot_internal.conversation_contexts SET SCHEMA copilot_core;

-- 2.13: Move conversation_configs (depends on conversations)
ALTER TABLE copilot_internal.conversation_configs SET SCHEMA copilot_core;

-- 2.14: Move execution_contexts (depends on conversations, paths)
ALTER TABLE copilot_internal.execution_contexts SET SCHEMA copilot_core;

-- 2.15: Move notifications (depends on tenants)
ALTER TABLE copilot_internal.notifications SET SCHEMA copilot_core;

-- 2.16: Move membership_change_events (depends on tenants)
ALTER TABLE copilot_internal.membership_change_events SET SCHEMA copilot_core;

-- =============================================================================
-- PART 3: Recreate Functions in copilot_core
-- =============================================================================
-- Note: ALTER FUNCTION SET SCHEMA doesn't update function bodies.
-- Functions referencing copilot_internal tables must be dropped and recreated.
-- Triggers must be dropped first since they depend on the functions.

-- 3.0: Drop triggers that depend on functions we need to drop
DROP TRIGGER IF EXISTS trg_set_message_sequence ON copilot_core.conversation_messages;
DROP TRIGGER IF EXISTS trg_update_path_timestamp ON copilot_core.conversation_paths;
DROP TRIGGER IF EXISTS trg_mark_branch_point ON copilot_core.conversation_paths;
DROP TRIGGER IF EXISTS trg_set_execution_context_expiry ON copilot_core.execution_contexts;
DROP TRIGGER IF EXISTS membership_change_trigger ON copilot_core.tenant_memberships;

-- 3.1: Drop and recreate path system helper functions
DROP FUNCTION IF EXISTS copilot_internal.next_sequence_in_path(uuid);
DROP FUNCTION IF EXISTS copilot_internal.get_root_path_id(uuid);
DROP FUNCTION IF EXISTS copilot_internal.get_path_ancestors(uuid);
DROP FUNCTION IF EXISTS copilot_internal.resolve_path_messages(uuid);

-- Recreate path functions with updated schema references in their bodies
CREATE OR REPLACE FUNCTION copilot_core.next_sequence_in_path(p_path_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(MAX(sequence_in_path), 0) + 1
    FROM copilot_core.conversation_messages
    WHERE path_id = p_path_id;
$$;

CREATE OR REPLACE FUNCTION copilot_core.get_root_path_id(p_path_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE path_chain AS (
        SELECT id, parent_path_id, 1 AS depth
        FROM copilot_core.conversation_paths
        WHERE id = p_path_id

        UNION ALL

        SELECT p.id, p.parent_path_id, pc.depth + 1
        FROM copilot_core.conversation_paths p
        INNER JOIN path_chain pc ON p.id = pc.parent_path_id
        WHERE pc.depth < 100
    )
    SELECT id FROM path_chain WHERE parent_path_id IS NULL LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION copilot_core.get_path_ancestors(p_path_id uuid)
RETURNS TABLE(path_id uuid, depth integer)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE path_chain AS (
        SELECT id, parent_path_id, 0 AS depth
        FROM copilot_core.conversation_paths
        WHERE id = p_path_id

        UNION ALL

        SELECT p.id, p.parent_path_id, pc.depth + 1
        FROM copilot_core.conversation_paths p
        INNER JOIN path_chain pc ON p.id = pc.parent_path_id
        WHERE pc.depth < 100
    )
    SELECT id AS path_id, depth FROM path_chain ORDER BY depth DESC;
$$;

CREATE OR REPLACE FUNCTION copilot_core.resolve_path_messages(p_path_id uuid)
RETURNS TABLE(
    id uuid,
    conversation_id uuid,
    path_id uuid,
    tenant_id uuid,
    user_id uuid,
    role text,
    content text,
    metadata jsonb,
    sequence_in_path integer,
    is_branch_point boolean,
    branched_to_paths uuid[],
    message_type text,
    created_at timestamptz,
    effective_sequence integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_path record;
    v_branch_point_seq integer;
BEGIN
    -- Get path info
    SELECT * INTO v_path
    FROM copilot_core.conversation_paths
    WHERE copilot_core.conversation_paths.id = p_path_id;

    IF v_path IS NULL THEN
        RETURN;
    END IF;

    -- If this path has a parent, get inherited messages first
    IF v_path.parent_path_id IS NOT NULL THEN
        -- Get the sequence number of the branch point in the parent path
        SELECT m.sequence_in_path INTO v_branch_point_seq
        FROM copilot_core.conversation_messages m
        WHERE m.id = v_path.branch_point_message_id;

        -- Return inherited messages from parent (recursively) up to branch point
        RETURN QUERY
        WITH parent_messages AS (
            SELECT * FROM copilot_core.resolve_path_messages(v_path.parent_path_id)
        )
        SELECT
            pm.id,
            pm.conversation_id,
            pm.path_id,
            pm.tenant_id,
            pm.user_id,
            pm.role,
            pm.content,
            pm.metadata,
            pm.sequence_in_path,
            pm.is_branch_point,
            pm.branched_to_paths,
            pm.message_type,
            pm.created_at,
            pm.effective_sequence
        FROM parent_messages pm
        WHERE pm.effective_sequence <= v_branch_point_seq;
    END IF;

    -- Return this path's own messages
    RETURN QUERY
    SELECT
        m.id,
        m.conversation_id,
        m.path_id,
        m.tenant_id,
        m.user_id,
        m.role,
        m.content,
        m.metadata,
        m.sequence_in_path,
        m.is_branch_point,
        m.branched_to_paths,
        m.message_type,
        m.created_at,
        -- If this is a child path, offset sequence by parent's branch point
        CASE
            WHEN v_path.parent_path_id IS NOT NULL THEN
                COALESCE(v_branch_point_seq, 0) + m.sequence_in_path
            ELSE
                m.sequence_in_path
        END AS effective_sequence
    FROM copilot_core.conversation_messages m
    WHERE m.path_id = p_path_id
    ORDER BY m.sequence_in_path;
END;
$$;

-- 3.2: Drop and recreate trigger functions with updated schema references
-- Note: ALTER FUNCTION SET SCHEMA doesn't update function bodies
DROP FUNCTION IF EXISTS copilot_internal.set_message_sequence();
DROP FUNCTION IF EXISTS copilot_internal.update_path_timestamp();
DROP FUNCTION IF EXISTS copilot_internal.mark_branch_point();
DROP FUNCTION IF EXISTS copilot_internal.set_execution_context_expiry();

-- Recreate set_message_sequence
CREATE OR REPLACE FUNCTION copilot_core.set_message_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only set sequence if path_id is provided and sequence is not set
    IF NEW.path_id IS NOT NULL AND NEW.sequence_in_path IS NULL THEN
        NEW.sequence_in_path := copilot_core.next_sequence_in_path(NEW.path_id);
    END IF;
    RETURN NEW;
END;
$$;

-- Recreate update_path_timestamp (no schema refs in body, but create in new schema)
CREATE OR REPLACE FUNCTION copilot_core.update_path_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Recreate mark_branch_point with updated schema references
CREATE OR REPLACE FUNCTION copilot_core.mark_branch_point()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- When a new path is created with a branch_point_message_id,
    -- mark that message as a branch point
    IF NEW.branch_point_message_id IS NOT NULL THEN
        UPDATE copilot_core.conversation_messages
        SET
            is_branch_point = true,
            branched_to_paths = array_append(
                COALESCE(branched_to_paths, '{}'),
                NEW.id
            )
        WHERE id = NEW.branch_point_message_id;
    END IF;
    RETURN NEW;
END;
$$;

-- Recreate set_execution_context_expiry (no schema refs in body)
CREATE OR REPLACE FUNCTION copilot_core.set_execution_context_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If expires_at not set, default to 30 minutes from now
    IF NEW.expires_at IS NULL OR NEW.expires_at = NEW.created_at THEN
        NEW.expires_at := now() + interval '30 minutes';
    END IF;
    RETURN NEW;
END;
$$;

-- 3.3: Drop and recreate execution context functions with updated schema references
DROP FUNCTION IF EXISTS copilot_internal.touch_execution_context(uuid, integer);
DROP FUNCTION IF EXISTS copilot_internal.get_expired_execution_contexts(integer);
DROP FUNCTION IF EXISTS copilot_internal.cleanup_old_terminated_contexts(integer, integer);

-- Recreate touch_execution_context
CREATE OR REPLACE FUNCTION copilot_core.touch_execution_context(
    p_context_id uuid,
    p_ttl_minutes integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE copilot_core.execution_contexts
    SET
        last_used_at = now(),
        expires_at = now() + (p_ttl_minutes || ' minutes')::interval
    WHERE id = p_context_id
      AND terminated_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION copilot_core.touch_execution_context(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION copilot_core.touch_execution_context(uuid, integer) TO authenticated;

-- Recreate get_expired_execution_contexts
CREATE OR REPLACE FUNCTION copilot_core.get_expired_execution_contexts(
    p_limit integer DEFAULT 50
)
RETURNS TABLE(
    id uuid,
    tenant_id uuid,
    conversation_id uuid,
    path_id uuid,
    sandbox_id text,
    created_at timestamptz,
    last_used_at timestamptz,
    expires_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        id,
        tenant_id,
        conversation_id,
        path_id,
        sandbox_id,
        created_at,
        last_used_at,
        expires_at
    FROM copilot_core.execution_contexts
    WHERE terminated_at IS NULL
      AND expires_at < now()
    ORDER BY expires_at ASC
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION copilot_core.get_expired_execution_contexts(integer) TO service_role;

-- Recreate cleanup_old_terminated_contexts
CREATE OR REPLACE FUNCTION copilot_core.cleanup_old_terminated_contexts(
    p_days_old integer DEFAULT 7,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(
    deleted_count integer,
    deleted_ids uuid[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_id_array uuid[];
    delete_count integer;
BEGIN
    -- Delete terminated contexts older than p_days_old days
    WITH to_delete AS (
        SELECT ec.id
        FROM copilot_core.execution_contexts ec
        WHERE terminated_at IS NOT NULL
          AND terminated_at < now() - (p_days_old || ' days')::interval
        ORDER BY terminated_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 100), 0)
    ), deleted AS (
        DELETE FROM copilot_core.execution_contexts ec
        USING to_delete td
        WHERE ec.id = td.id
        RETURNING ec.id
    )
    SELECT array_agg(deleted.id), count(*)::integer
    INTO deleted_id_array, delete_count
    FROM deleted;

    -- Handle case where no rows were deleted
    deleted_id_array := COALESCE(deleted_id_array, ARRAY[]::uuid[]);
    delete_count := COALESCE(delete_count, 0);

    RETURN QUERY SELECT delete_count, deleted_id_array;
END;
$$;

GRANT EXECUTE ON FUNCTION copilot_core.cleanup_old_terminated_contexts(integer, integer) TO service_role;

-- 3.4: Drop and recreate notification function with updated schema references
DROP FUNCTION IF EXISTS copilot_internal.create_notification(uuid, uuid, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION copilot_core.create_notification(
  p_user_id uuid,
  p_tenant_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_priority text DEFAULT 'MEDIUM',
  p_action_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO copilot_core.notifications (
    user_id,
    tenant_id,
    type,
    title,
    message,
    priority,
    action_url,
    metadata
  ) VALUES (
    p_user_id,
    p_tenant_id,
    p_type,
    p_title,
    p_message,
    p_priority,
    p_action_url,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

GRANT EXECUTE ON FUNCTION copilot_core.create_notification TO service_role;

-- 3.5: Drop and recreate membership change tracking function
DROP FUNCTION IF EXISTS copilot_internal.on_membership_change();

-- Recreate the function with updated schema references in the body
CREATE OR REPLACE FUNCTION copilot_core.on_membership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_event_type text;
  v_old_role text;
  v_new_role text;
  v_old_status text;
  v_new_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'added';
    v_new_role := NEW.role;
    v_new_status := NEW.status;

    INSERT INTO copilot_core.membership_change_events (
      user_id,
      tenant_id,
      event_type,
      new_role,
      new_status,
      changed_by
    ) VALUES (
      NEW.user_id,
      NEW.tenant_id,
      v_event_type,
      v_new_role,
      v_new_status,
      NEW.invited_by
    );

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_role := OLD.role;
    v_new_role := NEW.role;
    v_old_status := OLD.status;
    v_new_status := NEW.status;

    -- Role changed
    IF v_old_role != v_new_role THEN
      v_event_type := 'role_changed';
    -- Status changed
    ELSIF v_old_status != v_new_status THEN
      IF v_new_status = 'suspended' THEN
        v_event_type := 'suspended';
      ELSIF v_new_status = 'active' AND v_old_status = 'suspended' THEN
        v_event_type := 'reactivated';
      ELSE
        v_event_type := 'status_changed';
      END IF;
    ELSE
      -- Other field changed (e.g., invited_at), no event needed
      RETURN NEW;
    END IF;

    INSERT INTO copilot_core.membership_change_events (
      user_id,
      tenant_id,
      event_type,
      old_role,
      new_role,
      old_status,
      new_status
    ) VALUES (
      NEW.user_id,
      NEW.tenant_id,
      v_event_type,
      v_old_role,
      v_new_role,
      v_old_status,
      v_new_status
    );

  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'removed';
    v_old_role := OLD.role;
    v_old_status := OLD.status;

    INSERT INTO copilot_core.membership_change_events (
      user_id,
      tenant_id,
      event_type,
      old_role,
      old_status
    ) VALUES (
      OLD.user_id,
      OLD.tenant_id,
      v_event_type,
      v_old_role,
      v_old_status
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION copilot_core.on_membership_change IS
  'Trigger function that tracks all membership changes (INSERT, UPDATE, DELETE) and creates events for user notifications';

-- =============================================================================
-- PART 4: Update Trigger Function References
-- =============================================================================
-- When a function is moved to a new schema, existing triggers still reference
-- the old qualified name. We need to recreate triggers with updated references.

-- 4.1: Recreate message sequence trigger
DROP TRIGGER IF EXISTS trg_set_message_sequence ON copilot_core.conversation_messages;
CREATE TRIGGER trg_set_message_sequence
    BEFORE INSERT ON copilot_core.conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION copilot_core.set_message_sequence();

-- 4.2: Recreate path timestamp trigger
DROP TRIGGER IF EXISTS trg_update_path_timestamp ON copilot_core.conversation_paths;
CREATE TRIGGER trg_update_path_timestamp
    BEFORE UPDATE ON copilot_core.conversation_paths
    FOR EACH ROW
    EXECUTE FUNCTION copilot_core.update_path_timestamp();

-- 4.3: Recreate branch point trigger
DROP TRIGGER IF EXISTS trg_mark_branch_point ON copilot_core.conversation_paths;
CREATE TRIGGER trg_mark_branch_point
    AFTER INSERT ON copilot_core.conversation_paths
    FOR EACH ROW
    EXECUTE FUNCTION copilot_core.mark_branch_point();

-- 4.4: Recreate execution context expiry trigger
DROP TRIGGER IF EXISTS trg_set_execution_context_expiry ON copilot_core.execution_contexts;
CREATE TRIGGER trg_set_execution_context_expiry
    BEFORE INSERT ON copilot_core.execution_contexts
    FOR EACH ROW
    EXECUTE FUNCTION copilot_core.set_execution_context_expiry();

-- 4.5: Recreate membership change trigger
DROP TRIGGER IF EXISTS membership_change_trigger ON copilot_core.tenant_memberships;
CREATE TRIGGER membership_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON copilot_core.tenant_memberships
    FOR EACH ROW
    EXECUTE FUNCTION copilot_core.on_membership_change();

-- =============================================================================
-- PART 5: Update Public Functions That Reference copilot_internal
-- =============================================================================
-- These functions in public schema reference copilot_internal tables.
-- We need to recreate them with updated schema references.
-- Some functions have signature changes, so we DROP first then CREATE.

-- Drop functions that have changed signatures (return type changes not allowed with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.switch_tenant(uuid);
DROP FUNCTION IF EXISTS public.create_personal_tenant(uuid, text);
DROP FUNCTION IF EXISTS public.get_user_tenants(uuid);
DROP FUNCTION IF EXISTS public.verify_tenant_access(uuid, uuid);
DROP FUNCTION IF EXISTS public.invite_user_to_workspace(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.accept_workspace_invitation(text, uuid);
DROP FUNCTION IF EXISTS public.cancel_workspace_invitation(uuid, uuid);

-- 5.1: current_tenant_id (core function for RLS)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'currentTenantId')::uuid,
    (
      SELECT current_tenant_id
      FROM copilot_core.user_preferences
      WHERE user_id = auth.uid()
    )
  );
$$;

-- 5.2: get_current_tenant_id (explicit version)
CREATE OR REPLACE FUNCTION public.get_current_tenant_id(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT current_tenant_id
  INTO v_tenant_id
  FROM copilot_core.user_tenant_contexts
  WHERE user_id = p_user_id;

  RETURN v_tenant_id;
END;
$$;

-- 5.3: switch_tenant
CREATE OR REPLACE FUNCTION public.switch_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_user_id uuid;
  v_membership_exists boolean;
  v_tenant_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify user has active membership in target tenant
  SELECT EXISTS(
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE user_id = v_user_id
      AND tenant_id = p_tenant_id
      AND status = 'active'
      AND deleted_at IS NULL
  ) INTO v_membership_exists;

  IF NOT v_membership_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have active membership in this workspace'
    );
  END IF;

  -- Get tenant name for response
  SELECT name INTO v_tenant_name
  FROM copilot_core.tenants
  WHERE id = p_tenant_id AND deleted_at IS NULL;

  -- Update user_preferences
  INSERT INTO copilot_core.user_preferences (user_id, current_tenant_id)
  VALUES (v_user_id, p_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET
    current_tenant_id = p_tenant_id,
    updated_at = NOW();

  -- Update user_tenant_contexts
  INSERT INTO copilot_core.user_tenant_contexts (user_id, current_tenant_id)
  VALUES (v_user_id, p_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET
    current_tenant_id = p_tenant_id,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name
  );
END;
$$;

-- 5.4: get_user_tenants
CREATE OR REPLACE FUNCTION public.get_user_tenants(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  tenant_type text,
  user_role text,
  is_current boolean,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, copilot_core
AS $$
DECLARE
  v_current_tenant_id uuid;
BEGIN
  -- Get current tenant from preferences
  SELECT current_tenant_id INTO v_current_tenant_id
  FROM copilot_core.user_preferences
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.type,
    tm.role,
    (t.id = v_current_tenant_id),
    tm.joined_at
  FROM copilot_core.tenants t
  JOIN copilot_core.tenant_memberships tm ON t.id = tm.tenant_id
  WHERE tm.user_id = p_user_id
    AND tm.status = 'active'
    AND tm.deleted_at IS NULL
    AND t.deleted_at IS NULL
  ORDER BY t.name;
END;
$$;

-- 5.5: create_personal_tenant
CREATE OR REPLACE FUNCTION public.create_personal_tenant(
  p_user_id uuid,
  p_user_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant_name text;
  v_tenant_slug text;
BEGIN
  -- Check if user already has a personal tenant
  IF EXISTS (
    SELECT 1 FROM copilot_core.tenants
    WHERE owner_id = p_user_id AND type = 'personal'
  ) THEN
    SELECT id, name INTO v_tenant_id, v_tenant_name
    FROM copilot_core.tenants
    WHERE owner_id = p_user_id AND type = 'personal';

    RETURN jsonb_build_object(
      'success', true,
      'tenant_id', v_tenant_id,
      'tenant_name', v_tenant_name,
      'already_existed', true
    );
  END IF;

  -- Generate tenant name and slug from email
  v_tenant_name := 'Personal Workspace';
  v_tenant_slug := 'personal-' || replace(split_part(p_user_email, '@', 1), '.', '-');

  -- Create tenant
  INSERT INTO copilot_core.tenants (name, slug, type, owner_id)
  VALUES (v_tenant_name, v_tenant_slug, 'personal', p_user_id)
  RETURNING id INTO v_tenant_id;

  -- Create owner membership
  INSERT INTO copilot_core.tenant_memberships (
    tenant_id, user_id, role, status, joined_at
  ) VALUES (
    v_tenant_id, p_user_id, 'owner', 'active', NOW()
  );

  -- Set as current tenant
  INSERT INTO copilot_core.user_preferences (user_id, current_tenant_id)
  VALUES (p_user_id, v_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET current_tenant_id = v_tenant_id;

  INSERT INTO copilot_core.user_tenant_contexts (user_id, current_tenant_id)
  VALUES (p_user_id, v_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET current_tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_name', v_tenant_name,
    'tenant_slug', v_tenant_slug,
    'already_existed', false
  );
END;
$$;

-- 5.6: verify_tenant_access
CREATE OR REPLACE FUNCTION public.verify_tenant_access(
  p_user_id uuid,
  p_tenant_id uuid
)
RETURNS TABLE(
  has_access boolean,
  role text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (tm.status = 'active')::boolean,
    tm.role,
    tm.status
  FROM copilot_core.tenant_memberships tm
  WHERE tm.user_id = p_user_id
    AND tm.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
  END IF;
END;
$$;

-- 5.7: Notification functions
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'READ', read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status = 'UNREAD';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found or already read');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'read_at', NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'READ', read_at = NOW()
  WHERE user_id = auth.uid() AND status = 'UNREAD';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'marked_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_notification(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'DISMISSED'
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status IN ('UNREAD', 'READ');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found or already dismissed/archived');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_notification(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'ARCHIVED', archived_at = NOW(), read_at = COALESCE(read_at, NOW())
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status != 'ARCHIVED';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found or already archived');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'archived_at', NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_notifications(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  type text,
  title text,
  message text,
  priority text,
  status text,
  action_url text,
  metadata jsonb,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, copilot_core
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id, n.type, n.title, n.message, n.priority, n.status,
    n.action_url, n.metadata, n.created_at, n.read_at
  FROM copilot_core.notifications n
  WHERE n.user_id = auth.uid()
    AND (p_status IS NULL OR n.status = p_status)
  ORDER BY
    CASE n.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END,
    n.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, copilot_core
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_count
  FROM copilot_core.notifications
  WHERE user_id = auth.uid() AND status = 'UNREAD';

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_notification(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
BEGIN
  DELETE FROM copilot_core.notifications
  WHERE id = p_notification_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'deleted_at', NOW());
END;
$$;

-- 5.8: Membership event functions
CREATE OR REPLACE FUNCTION public.get_pending_membership_events(p_user_id uuid)
RETURNS TABLE(
  event_id uuid,
  tenant_id uuid,
  tenant_name text,
  event_type text,
  old_role text,
  new_role text,
  old_status text,
  new_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mce.id, mce.tenant_id, t.name, mce.event_type,
    mce.old_role, mce.new_role, mce.old_status, mce.new_status, mce.created_at
  FROM copilot_core.membership_change_events mce
  JOIN copilot_core.tenants t ON t.id = mce.tenant_id
  WHERE mce.user_id = p_user_id AND mce.processed_at IS NULL
  ORDER BY mce.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_membership_events_processed(
  p_user_id uuid,
  p_event_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
BEGIN
  UPDATE copilot_core.membership_change_events
  SET processed_at = NOW()
  WHERE user_id = p_user_id
    AND id = ANY(p_event_ids)
    AND processed_at IS NULL;
END;
$$;

-- 5.9: Workspace invitation functions
CREATE OR REPLACE FUNCTION public.invite_user_to_workspace(
  p_tenant_id uuid,
  p_email text,
  p_role text,
  p_invited_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_invitation_id uuid;
  v_token text;
  v_existing_user_id uuid;
  v_tenant_name text;
  v_tenant_slug text;
  v_app_url text;
BEGIN
  p_email := lower(trim(p_email));

  IF p_role NOT IN ('admin', 'member', 'viewer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role. Must be admin, member, or viewer.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = p_invited_by
      AND role IN ('owner', 'admin') AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only workspace owners and admins can invite members');
  END IF;

  SELECT name, slug INTO v_tenant_name, v_tenant_slug
  FROM copilot_core.tenants WHERE id = p_tenant_id AND deleted_at IS NULL;

  IF v_tenant_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workspace not found');
  END IF;

  SELECT id INTO v_existing_user_id FROM auth.users WHERE email = p_email;

  IF EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = v_existing_user_id
      AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already a member of this workspace');
  END IF;

  IF EXISTS (
    SELECT 1 FROM copilot_core.workspace_invitations
    WHERE tenant_id = p_tenant_id AND email = p_email
      AND accepted_at IS NULL AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already has a pending invitation to this workspace');
  END IF;

  INSERT INTO copilot_core.workspace_invitations (tenant_id, email, role, invited_by)
  VALUES (p_tenant_id, p_email, p_role, p_invited_by)
  RETURNING id, token INTO v_invitation_id, v_token;

  v_app_url := COALESCE(current_setting('app.base_url', true), 'http://localhost:3000');

  RETURN jsonb_build_object(
    'success', true,
    'invitation_id', v_invitation_id,
    'token', v_token,
    'email', p_email,
    'workspace_name', v_tenant_name,
    'workspace_slug', v_tenant_slug,
    'role', p_role,
    'expires_at', NOW() + INTERVAL '7 days',
    'invite_url', format('%s/invite/%s', v_app_url, v_token),
    'user_exists', v_existing_user_id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
  p_token text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_invitation record;
  v_user_email text;
  v_membership_id uuid;
BEGIN
  IF p_user_id IS NULL THEN p_user_id := auth.uid(); END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be logged in to accept an invitation');
  END IF;

  SELECT * INTO v_invitation FROM copilot_core.workspace_invitations
  WHERE token = p_token AND accepted_at IS NULL AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  IF lower(v_user_email) != lower(v_invitation.email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invitation was sent to a different email address', 'invited_email', v_invitation.email);
  END IF;

  IF EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = v_invitation.tenant_id AND user_id = p_user_id
      AND status = 'active' AND deleted_at IS NULL
  ) THEN
    UPDATE copilot_core.workspace_invitations SET accepted_at = NOW() WHERE id = v_invitation.id;
    RETURN jsonb_build_object('success', true, 'already_member', true, 'tenant_id', v_invitation.tenant_id);
  END IF;

  INSERT INTO copilot_core.tenant_memberships (tenant_id, user_id, role, status, joined_at, invited_by)
  VALUES (v_invitation.tenant_id, p_user_id, v_invitation.role, 'active', NOW(), v_invitation.invited_by)
  RETURNING id INTO v_membership_id;

  UPDATE copilot_core.workspace_invitations SET accepted_at = NOW() WHERE id = v_invitation.id;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_invitation.tenant_id, 'role', v_invitation.role, 'membership_id', v_membership_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_invitation(
  p_invitation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_core
AS $$
DECLARE
  v_invitation record;
BEGIN
  SELECT * INTO v_invitation FROM copilot_core.workspace_invitations
  WHERE id = p_invitation_id AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found or already accepted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = v_invitation.tenant_id AND user_id = p_user_id
      AND role IN ('owner', 'admin') AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only workspace owners and admins can cancel invitations');
  END IF;

  DELETE FROM copilot_core.workspace_invitations WHERE id = p_invitation_id;

  RETURN jsonb_build_object('success', true, 'cancelled_at', NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_pending_invitations()
RETURNS TABLE(
  invitation_id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role text,
  invited_by_email text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, copilot_core
AS $$
DECLARE
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.tenant_id, t.name, t.slug, i.role, u.email, i.expires_at, i.created_at
  FROM copilot_core.workspace_invitations i
  JOIN copilot_core.tenants t ON t.id = i.tenant_id
  JOIN auth.users u ON u.id = i.invited_by
  WHERE i.email = v_user_email AND i.accepted_at IS NULL AND i.expires_at > NOW() AND t.deleted_at IS NULL
  ORDER BY i.created_at DESC;
END;
$$;

-- =============================================================================
-- PART 6: Grant Permissions on New Schema Objects
-- =============================================================================

-- Tables (service_role gets ALL, authenticated gets SELECT/INSERT/UPDATE/DELETE with RLS)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA copilot_core TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA copilot_core TO authenticated;

-- Functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA copilot_core TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA copilot_core TO authenticated;

-- Sequences (if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA copilot_core TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA copilot_core TO authenticated;

-- =============================================================================
-- PART 7: Verification
-- =============================================================================

DO $$
DECLARE
  table_count integer;
  function_count integer;
BEGIN
  -- Count tables in copilot_core
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'copilot_core';

  -- Count functions in copilot_core
  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'copilot_core';

  IF table_count < 16 THEN
    RAISE WARNING 'Expected at least 16 tables in copilot_core, found %', table_count;
  END IF;

  RAISE NOTICE '=== copilot_core Schema Migration completed successfully ===';
  RAISE NOTICE '  ✓ Schema created: copilot_core';
  RAISE NOTICE '  ✓ Tables moved: %', table_count;
  RAISE NOTICE '  ✓ Functions: %', function_count;
  RAISE NOTICE '  ✓ Triggers recreated with new schema references';
  RAISE NOTICE '  ✓ Public functions updated to reference copilot_core';
  RAISE NOTICE '  ✓ Grants applied';
END $$;
