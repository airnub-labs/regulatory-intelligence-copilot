-- =====================================================
-- Membership Change Tracking and Notifications
-- MEDIUM-2: Stale Active Tenant After Membership Removal
-- =====================================================
--
-- PURPOSE:
-- Tracks membership changes (add, remove, role change, suspend) to
-- enable immediate session invalidation and user notifications when
-- membership status changes.
--
-- SECURITY:
-- - membership_change_events is in copilot_internal schema
-- - Public RPC functions have SECURITY DEFINER
-- - Triggers execute with definer privileges

-- =====================================================
-- 1. Membership Change Events Table
-- =====================================================

CREATE TABLE IF NOT EXISTS copilot_internal.membership_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES copilot_internal.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('added', 'removed', 'role_changed', 'suspended', 'reactivated', 'status_changed')),
  old_role text,
  new_role text,
  old_status text,
  new_status text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  processed_at timestamptz
);

CREATE INDEX idx_membership_events_user ON copilot_internal.membership_change_events(user_id, processed_at);
CREATE INDEX idx_membership_events_created ON copilot_internal.membership_change_events(created_at DESC);
CREATE INDEX idx_membership_events_tenant ON copilot_internal.membership_change_events(tenant_id);

COMMENT ON TABLE copilot_internal.membership_change_events IS
  'Tracks membership changes for session invalidation and user notifications. Enables immediate response to membership removal or role changes.';

COMMENT ON COLUMN copilot_internal.membership_change_events.event_type IS
  'Type of membership change: added, removed, role_changed, suspended, reactivated, status_changed';

COMMENT ON COLUMN copilot_internal.membership_change_events.processed_at IS
  'When user acknowledged this event. NULL = pending notification';

-- =====================================================
-- 2. Trigger Function: Track Membership Changes
-- =====================================================

CREATE OR REPLACE FUNCTION copilot_internal.on_membership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
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

    INSERT INTO copilot_internal.membership_change_events (
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

    INSERT INTO copilot_internal.membership_change_events (
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

    INSERT INTO copilot_internal.membership_change_events (
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

COMMENT ON FUNCTION copilot_internal.on_membership_change IS
  'Trigger function that tracks all membership changes (INSERT, UPDATE, DELETE) and creates events for user notifications';

-- =====================================================
-- 3. Attach Trigger to tenant_memberships
-- =====================================================

DROP TRIGGER IF EXISTS membership_change_trigger ON copilot_internal.tenant_memberships;

CREATE TRIGGER membership_change_trigger
  AFTER INSERT OR UPDATE OR DELETE ON copilot_internal.tenant_memberships
  FOR EACH ROW
  EXECUTE FUNCTION copilot_internal.on_membership_change();

COMMENT ON TRIGGER membership_change_trigger ON copilot_internal.tenant_memberships IS
  'Tracks all membership changes for session invalidation and notifications';

-- =====================================================
-- 4. Function: Get Pending Membership Events
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_pending_membership_events(
  p_user_id uuid
)
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
SET search_path = public, copilot_internal
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mce.id,
    mce.tenant_id,
    t.name,
    mce.event_type,
    mce.old_role,
    mce.new_role,
    mce.old_status,
    mce.new_status,
    mce.created_at
  FROM copilot_internal.membership_change_events mce
  JOIN copilot_internal.tenants t ON t.id = mce.tenant_id
  WHERE mce.user_id = p_user_id
    AND mce.processed_at IS NULL
  ORDER BY mce.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_pending_membership_events IS
  'Returns unprocessed membership change events for a user. Used by client to show notifications and handle workspace switches.';

-- =====================================================
-- 5. Function: Mark Events as Processed
-- =====================================================

CREATE OR REPLACE FUNCTION public.mark_membership_events_processed(
  p_user_id uuid,
  p_event_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
BEGIN
  UPDATE copilot_internal.membership_change_events
  SET processed_at = NOW()
  WHERE user_id = p_user_id
    AND id = ANY(p_event_ids)
    AND processed_at IS NULL; -- Only mark unprocessed events
END;
$$;

COMMENT ON FUNCTION public.mark_membership_events_processed IS
  'Marks membership change events as processed after user acknowledges notifications';

-- =====================================================
-- 6. Function: Verify Tenant Access
-- =====================================================

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
SET search_path = public, copilot_internal
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (tm.status = 'active')::boolean,
    tm.role,
    tm.status
  FROM copilot_internal.tenant_memberships tm
  WHERE tm.user_id = p_user_id
    AND tm.tenant_id = p_tenant_id;

  -- If no row found, return no access
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.verify_tenant_access IS
  'Verifies if a user still has active access to a specific tenant. Returns has_access=false if membership removed or suspended.';

-- =====================================================
-- 7. Cleanup Function for Old Events
-- =====================================================

CREATE OR REPLACE FUNCTION copilot_internal.cleanup_old_membership_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Delete processed events older than 30 days
  DELETE FROM copilot_internal.membership_change_events
  WHERE processed_at IS NOT NULL
    AND processed_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Also delete unprocessed events older than 90 days (stale notifications)
  DELETE FROM copilot_internal.membership_change_events
  WHERE processed_at IS NULL
    AND created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = v_deleted_count + ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION copilot_internal.cleanup_old_membership_events IS
  'Deletes processed events older than 30 days and unprocessed events older than 90 days. Should be run periodically via cron job.';
