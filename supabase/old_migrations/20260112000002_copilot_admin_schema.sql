-- ============================================================================
-- MIGRATION: copilot_admin Schema (Platform Administration)
-- ============================================================================
-- Part of Schema Reorganization for SOC2/GDPR Compliance
--
-- This migration:
-- 1. Creates the copilot_admin schema
-- 2. Moves 4 admin/monitoring tables from copilot_internal
-- 3. Moves associated functions
-- 4. NO RLS - access controlled by app-level authorization in copilot-admin
--
-- Tables moved:
--   - admin_users (platform staff roles)
--   - admin_permission_configs (per-user permission overrides)
--   - slow_query_log (platform monitoring - if exists)
--   - session_sync_logs (platform monitoring)
--
-- Access: service_role only (copilot-admin uses service role)
-- ============================================================================

-- =============================================================================
-- PART 1: Create copilot_admin Schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS copilot_admin;

COMMENT ON SCHEMA copilot_admin IS 'Platform administration tables. Access via service_role only (copilot-admin app).';

-- Grant schema access to service_role ONLY (no authenticated access)
GRANT USAGE ON SCHEMA copilot_admin TO service_role;
-- Explicitly revoke from authenticated if accidentally granted
REVOKE ALL ON SCHEMA copilot_admin FROM authenticated;

-- =============================================================================
-- PART 2: Move Tables to copilot_admin
-- =============================================================================

-- 2.1: Move admin_users
ALTER TABLE copilot_internal.admin_users SET SCHEMA copilot_admin;

-- 2.2: Move admin_permission_configs
ALTER TABLE copilot_internal.admin_permission_configs SET SCHEMA copilot_admin;

-- 2.3: Move session_sync_logs (platform monitoring)
ALTER TABLE copilot_internal.session_sync_logs SET SCHEMA copilot_admin;

-- 2.4: Move slow_query_log (created by 20260107000004_rls_performance_optimization.sql)
ALTER TABLE copilot_internal.slow_query_log SET SCHEMA copilot_admin;

-- =============================================================================
-- PART 3: Move/Update Functions
-- =============================================================================

-- 3.1: Update log_session_mismatch to reference copilot_admin schema
CREATE OR REPLACE FUNCTION public.log_session_mismatch(
  p_user_id uuid,
  p_expected_tenant_id uuid,
  p_actual_tenant_id uuid,
  p_request_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_admin, copilot_core
AS $func$
BEGIN
  INSERT INTO copilot_admin.session_sync_logs (
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
$func$;

-- 3.2: Update get_session_sync_stats to reference copilot_admin schema
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
SET search_path = public, copilot_admin
AS $func$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT user_id) as users,
      request_path,
      COUNT(*) as path_count
    FROM copilot_admin.session_sync_logs
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
$func$;

-- =============================================================================
-- PART 4: Update Triggers
-- =============================================================================

-- 4.1: Recreate admin_users updated_at trigger
-- First try to move the function if it exists
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'copilot_internal' AND p.proname = 'update_admin_user_timestamp'
  ) THEN
    ALTER FUNCTION copilot_internal.update_admin_user_timestamp() SET SCHEMA copilot_admin;
  END IF;
END $do$;

-- Create or replace the function
CREATE OR REPLACE FUNCTION copilot_admin.update_admin_user_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$func$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_admin_user_updated_at ON copilot_admin.admin_users;
CREATE TRIGGER trigger_admin_user_updated_at
  BEFORE UPDATE ON copilot_admin.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION copilot_admin.update_admin_user_timestamp();

-- 4.2: Recreate admin_permission_configs updated_at trigger
-- First try to move the function if it exists
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'copilot_internal' AND p.proname = 'update_permission_config_timestamp'
  ) THEN
    ALTER FUNCTION copilot_internal.update_permission_config_timestamp() SET SCHEMA copilot_admin;
  END IF;
END $do$;

-- Create or replace the function
CREATE OR REPLACE FUNCTION copilot_admin.update_permission_config_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$func$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_permission_config_updated_at ON copilot_admin.admin_permission_configs;
CREATE TRIGGER trigger_permission_config_updated_at
  BEFORE UPDATE ON copilot_admin.admin_permission_configs
  FOR EACH ROW
  EXECUTE FUNCTION copilot_admin.update_permission_config_timestamp();

-- =============================================================================
-- PART 5: Create Performance Monitoring View
-- =============================================================================
-- This view was originally in copilot_internal (20260107000004_rls_performance_optimization.sql)
-- It belongs in copilot_admin as it's for platform engineers to monitor RLS performance

CREATE OR REPLACE VIEW copilot_admin.rls_performance_summary AS
SELECT
    t.name as tenant_name,
    t.id as tenant_id,
    COUNT(DISTINCT tm.user_id) as user_count,
    COUNT(tm.id) as membership_count,
    (
        SELECT ROUND(AVG(execution_time_ms), 2)
        FROM copilot_admin.slow_query_log sql
        WHERE sql.tenant_id = t.id
          AND sql.created_at >= NOW() - INTERVAL '24 hours'
    ) as avg_query_time_24h_ms
FROM copilot_core.tenants t
LEFT JOIN copilot_core.tenant_memberships tm ON tm.tenant_id = t.id AND tm.status = 'active'
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name
ORDER BY user_count DESC, membership_count DESC;

COMMENT ON VIEW copilot_admin.rls_performance_summary IS
    'Summary view of tenant sizes and query performance. Use to identify tenants experiencing RLS performance issues.';

-- =============================================================================
-- PART 6: Grant Permissions (service_role only)
-- =============================================================================

-- Grant all to service_role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA copilot_admin TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA copilot_admin TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA copilot_admin TO service_role;

-- Explicitly revoke from authenticated (admin tables should not be accessible)
REVOKE ALL ON ALL TABLES IN SCHEMA copilot_admin FROM authenticated;

-- =============================================================================
-- PART 7: Verification
-- =============================================================================

DO $do$
DECLARE
  table_count integer;
  view_count integer;
  function_count integer;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'copilot_admin'
    AND table_type = 'BASE TABLE';

  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'copilot_admin';

  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'copilot_admin';

  IF table_count < 4 THEN
    RAISE WARNING 'Expected at least 4 tables in copilot_admin, found %', table_count;
  END IF;

  IF view_count < 1 THEN
    RAISE WARNING 'Expected at least 1 view in copilot_admin, found %', view_count;
  END IF;

  RAISE NOTICE '=== copilot_admin Schema Migration completed successfully ===';
  RAISE NOTICE '  Schema created: copilot_admin';
  RAISE NOTICE '  Tables moved: %', table_count;
  RAISE NOTICE '  Views created: % (rls_performance_summary)', view_count;
  RAISE NOTICE '  Functions: %', function_count;
  RAISE NOTICE '  Access: service_role only (no RLS - app-level auth)';
  RAISE NOTICE '  Platform monitoring tables and views included';
END $do$;
