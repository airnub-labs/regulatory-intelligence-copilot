-- ============================================================================
-- User Notifications - Real-time notification system for copilot-admin
-- ============================================================================
--
-- This migration creates the notifications table for storing user notifications
-- with support for:
-- - Priority levels (CRITICAL, HIGH, MEDIUM, LOW)
-- - Status tracking (UNREAD, READ, DISMISSED, ARCHIVED)
-- - Typed notifications (USER_INVITED, SECURITY_ALERT, LOGIN_ALERT, etc.)
-- - Action URLs for clickable notifications
-- - Custom metadata for extensibility
--
-- Real-time delivery is handled by the reg-intel-admin event hub package,
-- which uses Redis pub/sub or Supabase Realtime for cross-instance SSE.
-- ============================================================================

-- Ensure copilot_internal schema exists
CREATE SCHEMA IF NOT EXISTS copilot_internal;

-- ============================================================================
-- Notifications Table
-- ============================================================================

CREATE TABLE copilot_internal.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES copilot_internal.tenants(id) ON DELETE CASCADE,

  -- Notification content
  type text NOT NULL CHECK (type IN (
    'USER_INVITED',
    'USER_REMOVED',
    'ROLE_CHANGED',
    'SECURITY_ALERT',
    'LOGIN_ALERT',
    'PASSWORD_CHANGED',
    'PERMISSION_CHANGE',
    'COMPLIANCE_ALERT',
    'SYSTEM_UPDATE',
    'REPORT_READY',
    'WORKSPACE_CREATED',
    'WORKSPACE_DELETED'
  )),
  title text NOT NULL CHECK (char_length(title) <= 200),
  message text NOT NULL CHECK (char_length(message) <= 2000),

  -- Priority and status
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  status text NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ', 'DISMISSED', 'ARCHIVED')),

  -- Optional fields
  action_url text CHECK (action_url IS NULL OR char_length(action_url) <= 2000),
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT NOW(),
  read_at timestamptz,
  archived_at timestamptz,

  -- Constraints
  CONSTRAINT valid_read_status CHECK (
    (status IN ('UNREAD', 'DISMISSED') AND read_at IS NULL) OR
    (status IN ('READ', 'ARCHIVED') AND read_at IS NOT NULL)
  ),
  CONSTRAINT valid_archived_status CHECK (
    (status != 'ARCHIVED') OR (archived_at IS NOT NULL)
  )
);

-- Indexes for common queries
CREATE INDEX idx_notifications_user_status ON copilot_internal.notifications(user_id, status);
CREATE INDEX idx_notifications_user_created ON copilot_internal.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON copilot_internal.notifications(user_id)
  WHERE status = 'UNREAD';
CREATE INDEX idx_notifications_tenant ON copilot_internal.notifications(tenant_id);
CREATE INDEX idx_notifications_priority ON copilot_internal.notifications(user_id, priority)
  WHERE status = 'UNREAD';

COMMENT ON TABLE copilot_internal.notifications IS
  'User notifications for copilot-admin. Delivered via SSE using reg-intel-admin event hubs.';

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE copilot_internal.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY notifications_select_own ON copilot_internal.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read, dismiss, archive)
CREATE POLICY notifications_update_own ON copilot_internal.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY notifications_delete_own ON copilot_internal.notifications
  FOR DELETE
  USING (user_id = auth.uid());

-- Service role has full access (for system-generated notifications)
CREATE POLICY notifications_service_role ON copilot_internal.notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Create a notification for a user
CREATE OR REPLACE FUNCTION copilot_internal.create_notification(
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
  INSERT INTO copilot_internal.notifications (
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

COMMENT ON FUNCTION copilot_internal.create_notification IS
  'Creates a notification for a user. Returns the notification ID.';

-- Mark notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE copilot_internal.notifications
  SET
    status = 'READ',
    read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status = 'UNREAD';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Notification not found or already read'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'notification_id', p_notification_id,
    'read_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.mark_notification_read IS
  'Marks a notification as read for the current user.';

-- Mark all notifications as read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE copilot_internal.notifications
  SET
    status = 'READ',
    read_at = NOW()
  WHERE user_id = auth.uid()
    AND status = 'UNREAD';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'marked_count', v_count
  );
END;
$$;

COMMENT ON FUNCTION public.mark_all_notifications_read IS
  'Marks all unread notifications as read for the current user.';

-- Dismiss notification (hides but doesn't delete)
CREATE OR REPLACE FUNCTION public.dismiss_notification(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE copilot_internal.notifications
  SET status = 'DISMISSED'
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status IN ('UNREAD', 'READ');

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Notification not found or already dismissed/archived'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'notification_id', p_notification_id
  );
END;
$$;

COMMENT ON FUNCTION public.dismiss_notification IS
  'Dismisses a notification (hides but keeps for audit).';

-- Archive notification
CREATE OR REPLACE FUNCTION public.archive_notification(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE copilot_internal.notifications
  SET
    status = 'ARCHIVED',
    archived_at = NOW(),
    read_at = COALESCE(read_at, NOW())  -- Ensure read_at is set
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status != 'ARCHIVED';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Notification not found or already archived'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'notification_id', p_notification_id,
    'archived_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.archive_notification IS
  'Archives a notification (moves to archive, marks as read).';

-- Get notifications for current user
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.type,
    n.title,
    n.message,
    n.priority,
    n.status,
    n.action_url,
    n.metadata,
    n.created_at,
    n.read_at
  FROM copilot_internal.notifications n
  WHERE n.user_id = auth.uid()
    AND (p_status IS NULL OR n.status = p_status)
  ORDER BY
    CASE n.priority
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH' THEN 2
      WHEN 'MEDIUM' THEN 3
      WHEN 'LOW' THEN 4
    END,
    n.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_user_notifications IS
  'Gets notifications for the current user with optional status filter.';

-- Get unread count for current user
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_count
  FROM copilot_internal.notifications
  WHERE user_id = auth.uid()
    AND status = 'UNREAD';

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.get_unread_notification_count IS
  'Returns the count of unread notifications for the current user.';

-- Delete notification permanently
CREATE OR REPLACE FUNCTION public.delete_notification(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM copilot_internal.notifications
  WHERE id = p_notification_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Notification not found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'notification_id', p_notification_id,
    'deleted_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.delete_notification IS
  'Permanently deletes a notification.';

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_notification TO authenticated;

-- Internal function only accessible via service role
GRANT EXECUTE ON FUNCTION copilot_internal.create_notification TO service_role;
