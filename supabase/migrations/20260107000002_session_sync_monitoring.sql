-- =====================================================
-- Session/DB Consistency Monitoring for Workspace Switch
-- MEDIUM-1: Session/DB Consistency on Workspace Switch
-- =====================================================
--
-- PURPOSE:
-- Tracks and monitors cases where user's JWT currentTenantId
-- doesn't match database current_tenant_id. This can happen
-- when session updates fail after workspace switching.
--
-- SECURITY:
-- - session_sync_logs is in copilot_internal schema
-- - Public RPC functions have SECURITY DEFINER
-- - No RLS policies needed (internal monitoring table)

-- =====================================================
-- 1. Session Sync Logs Table
-- =====================================================

CREATE TABLE IF NOT EXISTS copilot_internal.session_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expected_tenant_id uuid NOT NULL REFERENCES copilot_internal.tenants(id) ON DELETE CASCADE,
  actual_tenant_id uuid,
  request_path text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_sync_logs_user ON copilot_internal.session_sync_logs(user_id, created_at DESC);
CREATE INDEX idx_session_sync_logs_created ON copilot_internal.session_sync_logs(created_at DESC);

COMMENT ON TABLE copilot_internal.session_sync_logs IS
  'Tracks cases where JWT currentTenantId does not match database current_tenant_id. Used for monitoring session sync issues during workspace switching.';

COMMENT ON COLUMN copilot_internal.session_sync_logs.expected_tenant_id IS
  'The tenant_id from database (source of truth)';

COMMENT ON COLUMN copilot_internal.session_sync_logs.actual_tenant_id IS
  'The currentTenantId from JWT (may be stale)';

-- =====================================================
-- 2. Function: Log Session Mismatch
-- =====================================================

CREATE OR REPLACE FUNCTION public.log_session_mismatch(
  p_user_id uuid,
  p_expected_tenant_id uuid,
  p_actual_tenant_id uuid,
  p_request_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
BEGIN
  -- Insert log record
  INSERT INTO copilot_internal.session_sync_logs (
    user_id,
    expected_tenant_id,
    actual_tenant_id,
    request_path
  ) VALUES (
    p_user_id,
    p_expected_tenant_id,
    p_actual_tenant_id,
    p_request_path
  );
END;
$$;

COMMENT ON FUNCTION public.log_session_mismatch IS
  'Logs session/database tenant ID mismatches for monitoring. Called from middleware when detecting inconsistency.';

-- =====================================================
-- 3. Function: Get Current Tenant ID
-- =====================================================
-- Note: Keeps DEFAULT auth.uid() from original definition in 20260105000003
-- (PostgreSQL doesn't allow removing defaults with CREATE OR REPLACE)

CREATE OR REPLACE FUNCTION public.get_current_tenant_id(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Get current active tenant for user
  SELECT current_tenant_id
  INTO v_tenant_id
  FROM copilot_internal.user_tenant_contexts
  WHERE user_id = p_user_id;

  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.get_current_tenant_id IS
  'Returns the current active tenant_id from database for a user. Used to detect session/DB mismatches.';

-- =====================================================
-- 4. Function: Get Session Sync Stats (Monitoring)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_session_sync_stats(
  p_hours_back integer DEFAULT 24
)
RETURNS TABLE (
  total_mismatches bigint,
  affected_users bigint,
  most_common_path text,
  mismatch_count_by_path jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT user_id) as users,
      request_path,
      COUNT(*) as path_count
    FROM copilot_internal.session_sync_logs
    WHERE created_at >= NOW() - (p_hours_back || ' hours')::interval
    GROUP BY request_path
  ),
  path_counts AS (
    SELECT jsonb_object_agg(request_path, path_count) as paths
    FROM stats
  )
  SELECT
    (SELECT SUM(total) FROM stats)::bigint as total_mismatches,
    (SELECT MAX(users) FROM stats)::bigint as affected_users,
    (SELECT request_path FROM stats ORDER BY path_count DESC LIMIT 1) as most_common_path,
    (SELECT paths FROM path_counts) as mismatch_count_by_path;
END;
$$;

COMMENT ON FUNCTION public.get_session_sync_stats IS
  'Returns session sync mismatch statistics for monitoring dashboard. Shows total mismatches, affected users, and most common paths.';

-- =====================================================
-- 5. Cleanup Function for Old Logs
-- =====================================================

CREATE OR REPLACE FUNCTION copilot_internal.cleanup_old_session_sync_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Delete logs older than 30 days
  DELETE FROM copilot_internal.session_sync_logs
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION copilot_internal.cleanup_old_session_sync_logs IS
  'Deletes session sync logs older than 30 days. Should be run periodically via cron job.';
