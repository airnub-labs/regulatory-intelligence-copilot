-- ================================================================
-- Migration: Eliminate copilot_admin Schema
-- Version: 20260112100001
-- Description: Redistribute copilot_admin tables to domain-appropriate schemas
--
-- Changes:
--   1. admin_users → copilot_core.platform_admins (rename + move)
--   2. admin_permission_configs → copilot_core.platform_admin_permissions (rename + move)
--   3. session_sync_logs → copilot_audit.session_sync_logs (move)
--   4. slow_query_log → copilot_metrics.slow_query_log (move)
--   5. rls_performance_summary view → copilot_metrics (move + update)
--   6. Drop copilot_admin schema
--
-- Impact:
--   - Service client TABLE_SCHEMA_MAP must be updated
--   - Copilot-admin API routes must update schema references
--   - TypeScript interfaces must be updated
--
-- Rollback: See 20260112100001_rollback_eliminate_copilot_admin_schema.sql
-- ================================================================

BEGIN;

-- ================================================================
-- PHASE 1: Move admin_users → copilot_core.platform_admins
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 1: Moving admin_users to copilot_core.platform_admins...';
END $$;

-- Step 1.1: Drop existing triggers (will recreate after move)
DROP TRIGGER IF EXISTS trigger_admin_user_updated_at ON copilot_admin.admin_users;

-- Step 1.2: Drop existing function (will recreate in new schema)
DROP FUNCTION IF EXISTS copilot_admin.update_admin_user_timestamp() CASCADE;

-- Step 1.3: Move table to copilot_core schema
ALTER TABLE copilot_admin.admin_users SET SCHEMA copilot_core;

-- Step 1.4: Rename table to platform_admins
ALTER TABLE copilot_core.admin_users RENAME TO platform_admins;

-- Step 1.5: Rename indexes to match new table name
ALTER INDEX IF EXISTS copilot_admin.idx_admin_users_email
  RENAME TO idx_platform_admins_email;
ALTER INDEX IF EXISTS copilot_admin.idx_admin_users_role
  RENAME TO idx_platform_admins_role;
ALTER INDEX IF EXISTS copilot_admin.idx_admin_users_status
  RENAME TO idx_platform_admins_status;
ALTER INDEX IF EXISTS copilot_admin.idx_admin_users_tenant_id
  RENAME TO idx_platform_admins_tenant_id;

-- Step 1.6: Recreate timestamp update function in copilot_core
CREATE OR REPLACE FUNCTION copilot_core.update_platform_admin_timestamp()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, copilot_core
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Step 1.7: Recreate trigger
CREATE TRIGGER trigger_platform_admin_updated_at
  BEFORE UPDATE ON copilot_core.platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION copilot_core.update_platform_admin_timestamp();

-- Step 1.8: Grant permissions (service_role only, no RLS)
GRANT ALL PRIVILEGES ON copilot_core.platform_admins TO service_role;
REVOKE ALL ON copilot_core.platform_admins FROM authenticated;

DO $$
BEGIN
  RAISE NOTICE '✓ Phase 1 complete: admin_users → copilot_core.platform_admins';
END $$;

-- ================================================================
-- PHASE 2: Move admin_permission_configs → copilot_core.platform_admin_permissions
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 2: Moving admin_permission_configs to copilot_core.platform_admin_permissions...';
END $$;

-- Step 2.1: Drop existing triggers
DROP TRIGGER IF EXISTS trigger_permission_config_updated_at ON copilot_admin.admin_permission_configs;

-- Step 2.2: Drop existing function
DROP FUNCTION IF EXISTS copilot_admin.update_permission_config_timestamp() CASCADE;

-- Step 2.3: Move table to copilot_core schema
ALTER TABLE copilot_admin.admin_permission_configs SET SCHEMA copilot_core;

-- Step 2.4: Rename table
ALTER TABLE copilot_core.admin_permission_configs RENAME TO platform_admin_permissions;

-- Step 2.5: Rename indexes
ALTER INDEX IF EXISTS copilot_admin.idx_permission_configs_updated_at
  RENAME TO idx_platform_admin_permissions_updated_at;
ALTER INDEX IF EXISTS copilot_admin.idx_permission_configs_updated_by
  RENAME TO idx_platform_admin_permissions_updated_by;

-- Step 2.6: Recreate timestamp update function
CREATE OR REPLACE FUNCTION copilot_core.update_platform_admin_permission_timestamp()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, copilot_core
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Step 2.7: Recreate trigger
CREATE TRIGGER trigger_platform_admin_permission_updated_at
  BEFORE UPDATE ON copilot_core.platform_admin_permissions
  FOR EACH ROW
  EXECUTE FUNCTION copilot_core.update_platform_admin_permission_timestamp();

-- Step 2.8: Update audit trigger function to reference new table name
-- Note: The audit trigger writes to copilot_audit.permission_audit_log
-- We need to update the trigger function that was attached to this table

DROP FUNCTION IF EXISTS copilot_audit.log_permission_config_change() CASCADE;

CREATE OR REPLACE FUNCTION copilot_audit.log_permission_config_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, copilot_core, copilot_audit
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_email text;
  v_actor_role text;
  v_target_email text;
BEGIN
  -- Get actor details
  SELECT email, role INTO v_actor_email, v_actor_role
  FROM copilot_core.platform_admins
  WHERE id = COALESCE(NEW.updated_by, auth.uid());

  -- Get target user email from auth.users
  SELECT email INTO v_target_email
  FROM auth.users
  WHERE id = NEW.user_id;

  -- Log permission changes to audit table
  -- Actual table schema: target_user_id, target_user_email, actor_id, actor_email, actor_role, action, old_value, new_value, changes, reason, ip_address, user_agent
  INSERT INTO copilot_audit.permission_audit_log (
    target_user_id,
    target_user_email,
    actor_id,
    actor_email,
    actor_role,
    action,
    old_value,
    new_value,
    reason
  ) VALUES (
    NEW.user_id,  -- Target is the user whose permissions are being changed
    COALESCE(v_target_email, 'unknown'),
    COALESCE(NEW.updated_by, auth.uid()),  -- Actor is the user making the change
    COALESCE(v_actor_email, 'system'),
    COALESCE(v_actor_role, 'system'),
    CASE TG_OP
      WHEN 'INSERT' THEN 'permission_config_created'
      WHEN 'UPDATE' THEN 'permission_config_updated'
      WHEN 'DELETE' THEN 'permission_config_deleted'
      ELSE 'permission_config_updated'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    row_to_json(NEW),
    NEW.reason
  );

  RETURN NEW;
END;
$$;

-- Step 2.9: Attach audit trigger to new table
CREATE TRIGGER trigger_platform_admin_permission_audit
  AFTER INSERT OR UPDATE ON copilot_core.platform_admin_permissions
  FOR EACH ROW
  EXECUTE FUNCTION copilot_audit.log_permission_config_change();

-- Step 2.10: Grant permissions
GRANT ALL PRIVILEGES ON copilot_core.platform_admin_permissions TO service_role;
REVOKE ALL ON copilot_core.platform_admin_permissions FROM authenticated;

DO $$
BEGIN
  RAISE NOTICE '✓ Phase 2 complete: admin_permission_configs → copilot_core.platform_admin_permissions';
END $$;

-- ================================================================
-- PHASE 3: Move session_sync_logs → copilot_audit
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 3: Moving session_sync_logs to copilot_audit...';
END $$;

-- Step 3.1: Move table to copilot_audit schema (no rename)
ALTER TABLE copilot_admin.session_sync_logs SET SCHEMA copilot_audit;

-- Step 3.2: Update public schema functions that reference session_sync_logs

-- Function 1: log_session_mismatch
DROP FUNCTION IF EXISTS public.log_session_mismatch(uuid, uuid, uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.log_session_mismatch(
  p_user_id UUID,
  p_expected_tenant_id UUID,
  p_actual_tenant_id UUID,
  p_request_path TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, copilot_audit, copilot_core
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO copilot_audit.session_sync_logs (
    user_id,
    expected_tenant_id,
    actual_tenant_id,
    request_path,
    created_at
  ) VALUES (
    p_user_id,
    p_expected_tenant_id,
    p_actual_tenant_id,
    p_request_path,
    NOW()
  );
END;
$$;

-- Function 2: get_session_sync_stats
DROP FUNCTION IF EXISTS public.get_session_sync_stats(integer) CASCADE;

CREATE OR REPLACE FUNCTION public.get_session_sync_stats(
  p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_mismatches BIGINT,
  affected_users BIGINT,
  most_common_path TEXT,
  mismatch_count_by_path JSONB
)
SECURITY DEFINER
SET search_path = public, copilot_audit, copilot_core
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_mismatches,
    COUNT(DISTINCT user_id)::BIGINT AS affected_users,
    (
      SELECT request_path
      FROM copilot_audit.session_sync_logs
      WHERE created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
      GROUP BY request_path
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_path,
    jsonb_object_agg(
      request_path,
      path_count
    ) AS mismatch_count_by_path
  FROM (
    SELECT
      request_path,
      COUNT(*) AS path_count
    FROM copilot_audit.session_sync_logs
    WHERE created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
    GROUP BY request_path
  ) path_stats;
END;
$$;

-- Function 3: cleanup_old_session_sync_logs
DROP FUNCTION IF EXISTS public.cleanup_old_session_sync_logs() CASCADE;

CREATE OR REPLACE FUNCTION public.cleanup_old_session_sync_logs()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public, copilot_audit
LANGUAGE plpgsql
AS $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  DELETE FROM copilot_audit.session_sync_logs
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  RAISE NOTICE 'Deleted % old session sync log entries', rows_deleted;

  RETURN rows_deleted;
END;
$$;

-- Step 3.3: Grant permissions
GRANT ALL PRIVILEGES ON copilot_audit.session_sync_logs TO service_role;
REVOKE ALL ON copilot_audit.session_sync_logs FROM authenticated;

DO $$
BEGIN
  RAISE NOTICE '✓ Phase 3 complete: session_sync_logs → copilot_audit';
END $$;

-- ================================================================
-- PHASE 4: Move slow_query_log → copilot_metrics
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 4: Moving slow_query_log to copilot_metrics...';
END $$;

-- Step 4.1: Move table to copilot_metrics schema (no rename)
ALTER TABLE copilot_admin.slow_query_log SET SCHEMA copilot_metrics;

-- Step 4.2: Update public schema functions that reference slow_query_log

-- Function 1: get_query_performance_stats
DROP FUNCTION IF EXISTS public.get_query_performance_stats(integer, numeric) CASCADE;

CREATE OR REPLACE FUNCTION public.get_query_performance_stats(
  p_hours_back INTEGER DEFAULT 24,
  p_min_execution_time_ms NUMERIC DEFAULT 100
)
RETURNS TABLE (
  query_type TEXT,
  table_name TEXT,
  avg_execution_time_ms NUMERIC,
  max_execution_time_ms NUMERIC,
  query_count BIGINT,
  slowest_tenant_id UUID
)
SECURITY DEFINER
SET search_path = public, copilot_metrics, copilot_core
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sq.query_type,
    sq.table_name,
    AVG(sq.execution_time_ms) AS avg_execution_time_ms,
    MAX(sq.execution_time_ms) AS max_execution_time_ms,
    COUNT(*)::BIGINT AS query_count,
    (
      SELECT tenant_id
      FROM copilot_metrics.slow_query_log sq2
      WHERE sq2.query_type = sq.query_type
        AND sq2.table_name = sq.table_name
        AND sq2.created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
      ORDER BY sq2.execution_time_ms DESC
      LIMIT 1
    ) AS slowest_tenant_id
  FROM copilot_metrics.slow_query_log sq
  WHERE sq.created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
    AND sq.execution_time_ms >= p_min_execution_time_ms
  GROUP BY sq.query_type, sq.table_name
  ORDER BY avg_execution_time_ms DESC;
END;
$$;

-- Function 2: cleanup_slow_query_logs
DROP FUNCTION IF EXISTS public.cleanup_slow_query_logs() CASCADE;

CREATE OR REPLACE FUNCTION public.cleanup_slow_query_logs()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public, copilot_metrics
LANGUAGE plpgsql
AS $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  DELETE FROM copilot_metrics.slow_query_log
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  RAISE NOTICE 'Deleted % old slow query log entries', rows_deleted;

  RETURN rows_deleted;
END;
$$;

-- Step 4.3: Grant permissions
-- Note: copilot_metrics is read-only for most purposes, but slow_query_log needs INSERT
GRANT SELECT, INSERT ON copilot_metrics.slow_query_log TO service_role;
GRANT SELECT ON copilot_metrics.slow_query_log TO authenticated;  -- Read-only for analytics

DO $$
BEGIN
  RAISE NOTICE '✓ Phase 4 complete: slow_query_log → copilot_metrics';
END $$;

-- ================================================================
-- PHASE 5: Move rls_performance_summary view → copilot_metrics
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 5: Moving rls_performance_summary view to copilot_metrics...';
END $$;

-- Step 5.1: Drop old view in copilot_admin
DROP VIEW IF EXISTS copilot_admin.rls_performance_summary CASCADE;

-- Step 5.2: Recreate view in copilot_metrics with updated references
CREATE OR REPLACE VIEW copilot_metrics.rls_performance_summary AS
SELECT
  t.name AS tenant_name,
  t.id AS tenant_id,
  COUNT(DISTINCT tm.user_id) AS user_count,
  COUNT(tm.id) AS membership_count,
  COALESCE(AVG(sq.execution_time_ms), 0) AS avg_query_time_24h_ms
FROM copilot_core.tenants t
LEFT JOIN copilot_core.tenant_memberships tm ON t.id = tm.tenant_id
LEFT JOIN copilot_metrics.slow_query_log sq ON (
  sq.tenant_id = t.id
  AND sq.created_at >= NOW() - INTERVAL '24 hours'
)
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name
ORDER BY avg_query_time_24h_ms DESC NULLS LAST;

-- Step 5.3: Grant SELECT permission
GRANT SELECT ON copilot_metrics.rls_performance_summary TO service_role;
GRANT SELECT ON copilot_metrics.rls_performance_summary TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✓ Phase 5 complete: rls_performance_summary → copilot_metrics';
END $$;

-- ================================================================
-- PHASE 6: Drop copilot_admin schema
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 6: Verifying copilot_admin schema is empty and dropping...';
END $$;

-- Step 6.1: Verify schema is empty
DO $$
DECLARE
  table_count INTEGER;
  view_count INTEGER;
  function_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM pg_tables
  WHERE schemaname = 'copilot_admin';

  SELECT COUNT(*) INTO view_count
  FROM pg_views
  WHERE schemaname = 'copilot_admin';

  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'copilot_admin';

  IF table_count > 0 THEN
    RAISE EXCEPTION 'Cannot drop copilot_admin schema: % tables still exist', table_count;
  END IF;

  IF view_count > 0 THEN
    RAISE EXCEPTION 'Cannot drop copilot_admin schema: % views still exist', view_count;
  END IF;

  IF function_count > 0 THEN
    RAISE EXCEPTION 'Cannot drop copilot_admin schema: % functions still exist', function_count;
  END IF;

  RAISE NOTICE '✓ copilot_admin schema is empty (0 tables, 0 views, 0 functions)';
END $$;

-- Step 6.2: Revoke all grants (cleanup)
REVOKE ALL ON SCHEMA copilot_admin FROM service_role;
REVOKE ALL ON SCHEMA copilot_admin FROM authenticated;
REVOKE ALL ON SCHEMA copilot_admin FROM anon;

-- Step 6.3: Drop the schema
DROP SCHEMA IF EXISTS copilot_admin CASCADE;

DO $$
BEGIN
  RAISE NOTICE '✓ Phase 6 complete: copilot_admin schema dropped';
END $$;

-- ================================================================
-- PHASE 7: Validation
-- ================================================================

DO $$
DECLARE
  admin_schema_exists BOOLEAN;
  platform_admins_exists BOOLEAN;
  platform_admin_permissions_exists BOOLEAN;
  session_sync_logs_exists BOOLEAN;
  slow_query_log_exists BOOLEAN;
  rls_perf_view_exists BOOLEAN;
BEGIN
  RAISE NOTICE 'Phase 7: Running validation checks...';

  -- Check 1: copilot_admin schema should NOT exist
  SELECT EXISTS(
    SELECT 1 FROM pg_namespace WHERE nspname = 'copilot_admin'
  ) INTO admin_schema_exists;

  IF admin_schema_exists THEN
    RAISE EXCEPTION 'Validation failed: copilot_admin schema still exists';
  END IF;

  -- Check 2: platform_admins table should exist in copilot_core
  SELECT EXISTS(
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'copilot_core' AND tablename = 'platform_admins'
  ) INTO platform_admins_exists;

  IF NOT platform_admins_exists THEN
    RAISE EXCEPTION 'Validation failed: copilot_core.platform_admins does not exist';
  END IF;

  -- Check 3: platform_admin_permissions table should exist in copilot_core
  SELECT EXISTS(
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'copilot_core' AND tablename = 'platform_admin_permissions'
  ) INTO platform_admin_permissions_exists;

  IF NOT platform_admin_permissions_exists THEN
    RAISE EXCEPTION 'Validation failed: copilot_core.platform_admin_permissions does not exist';
  END IF;

  -- Check 4: session_sync_logs table should exist in copilot_audit
  SELECT EXISTS(
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'copilot_audit' AND tablename = 'session_sync_logs'
  ) INTO session_sync_logs_exists;

  IF NOT session_sync_logs_exists THEN
    RAISE EXCEPTION 'Validation failed: copilot_audit.session_sync_logs does not exist';
  END IF;

  -- Check 5: slow_query_log table should exist in copilot_metrics
  SELECT EXISTS(
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'copilot_metrics' AND tablename = 'slow_query_log'
  ) INTO slow_query_log_exists;

  IF NOT slow_query_log_exists THEN
    RAISE EXCEPTION 'Validation failed: copilot_metrics.slow_query_log does not exist';
  END IF;

  -- Check 6: rls_performance_summary view should exist in copilot_metrics
  SELECT EXISTS(
    SELECT 1 FROM pg_views
    WHERE schemaname = 'copilot_metrics' AND viewname = 'rls_performance_summary'
  ) INTO rls_perf_view_exists;

  IF NOT rls_perf_view_exists THEN
    RAISE EXCEPTION 'Validation failed: copilot_metrics.rls_performance_summary view does not exist';
  END IF;

  RAISE NOTICE '✓ All validation checks passed';
  RAISE NOTICE '  - copilot_admin schema: DROPPED ✓';
  RAISE NOTICE '  - copilot_core.platform_admins: EXISTS ✓';
  RAISE NOTICE '  - copilot_core.platform_admin_permissions: EXISTS ✓';
  RAISE NOTICE '  - copilot_audit.session_sync_logs: EXISTS ✓';
  RAISE NOTICE '  - copilot_metrics.slow_query_log: EXISTS ✓';
  RAISE NOTICE '  - copilot_metrics.rls_performance_summary: EXISTS ✓';
END $$;

-- ================================================================
-- Migration Summary
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔═══════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║   SCHEMA REORGANIZATION COMPLETE                              ║';
  RAISE NOTICE '╠═══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║                                                                ║';
  RAISE NOTICE '║   ✓ admin_users → copilot_core.platform_admins               ║';
  RAISE NOTICE '║   ✓ admin_permission_configs → copilot_core.platform_admin_permissions ║';
  RAISE NOTICE '║   ✓ session_sync_logs → copilot_audit.session_sync_logs      ║';
  RAISE NOTICE '║   ✓ slow_query_log → copilot_metrics.slow_query_log          ║';
  RAISE NOTICE '║   ✓ rls_performance_summary → copilot_metrics (view)         ║';
  RAISE NOTICE '║   ✓ copilot_admin schema dropped                             ║';
  RAISE NOTICE '║                                                                ║';
  RAISE NOTICE '║   Next steps:                                                  ║';
  RAISE NOTICE '║   1. Update TABLE_SCHEMA_MAP in tenantScopedServiceClient.ts ║';
  RAISE NOTICE '║   2. Update copilot-admin API routes schema references       ║';
  RAISE NOTICE '║   3. Update TypeScript interfaces                             ║';
  RAISE NOTICE '║   4. Run: supabase db dump --local -s copilot_core,copilot_audit,copilot_metrics -f after.schema.sql ║';
  RAISE NOTICE '║   5. Run: diff -u before.schema.sql after.schema.sql > schema.diff ║';
  RAISE NOTICE '║                                                                ║';
  RAISE NOTICE '╚═══════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
END $$;

COMMIT;
