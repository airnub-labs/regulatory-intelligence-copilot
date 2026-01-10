-- ============================================================================
-- MIGRATION: Cleanup Old Schemas
-- ============================================================================
-- Part of Schema Reorganization for SOC2/GDPR Compliance
--
-- This migration:
-- 1. Verifies all objects have been moved from old schemas
-- 2. Drops any remaining orphaned objects (triggers, functions)
-- 3. Drops the now-empty copilot_internal schema
-- 4. Drops the now-empty metrics schema
--
-- This is the FINAL migration in the schema reorganization series.
--
-- Prerequisites:
--   - 20260112000001_copilot_core_schema.sql must have run
--   - 20260112000002_copilot_admin_schema.sql must have run
--   - 20260112000003_copilot_audit_schema.sql must have run
--   - 20260112000004_copilot_billing_schema.sql must have run
--   - 20260112000005_copilot_metrics_schema.sql must have run
--   - 20260112000006_update_public_views.sql must have run
--
-- ============================================================================

-- =============================================================================
-- PART 1: Pre-Cleanup Verification
-- =============================================================================
-- Verify that the new schemas exist and have the expected objects

DO $do$
DECLARE
  v_copilot_core_tables integer;
  v_copilot_admin_tables integer;
  v_copilot_audit_tables integer;
  v_copilot_billing_tables integer;
  v_copilot_metrics_views integer;
BEGIN
  -- Check copilot_core
  SELECT COUNT(*) INTO v_copilot_core_tables
  FROM information_schema.tables
  WHERE table_schema = 'copilot_core' AND table_type = 'BASE TABLE';

  IF v_copilot_core_tables < 16 THEN
    RAISE EXCEPTION 'copilot_core schema has only % tables, expected at least 16. Migration 20260112000001 may have failed.', v_copilot_core_tables;
  END IF;

  -- Check copilot_admin
  SELECT COUNT(*) INTO v_copilot_admin_tables
  FROM information_schema.tables
  WHERE table_schema = 'copilot_admin' AND table_type = 'BASE TABLE';

  IF v_copilot_admin_tables < 4 THEN
    RAISE EXCEPTION 'copilot_admin schema has only % tables, expected at least 4. Migration 20260112000002 may have failed.', v_copilot_admin_tables;
  END IF;

  -- Check copilot_audit (2 tables: permission_audit_log, compaction_operations)
  SELECT COUNT(*) INTO v_copilot_audit_tables
  FROM information_schema.tables
  WHERE table_schema = 'copilot_audit' AND table_type = 'BASE TABLE';

  IF v_copilot_audit_tables < 2 THEN
    RAISE EXCEPTION 'copilot_audit schema has only % tables, expected at least 2. Migration 20260112000003 may have failed.', v_copilot_audit_tables;
  END IF;

  -- Check copilot_billing
  SELECT COUNT(*) INTO v_copilot_billing_tables
  FROM information_schema.tables
  WHERE table_schema = 'copilot_billing' AND table_type = 'BASE TABLE';

  IF v_copilot_billing_tables < 7 THEN
    RAISE EXCEPTION 'copilot_billing schema has only % tables, expected at least 7. Migration 20260112000004 may have failed.', v_copilot_billing_tables;
  END IF;

  -- Check copilot_metrics (views only)
  SELECT COUNT(*) INTO v_copilot_metrics_views
  FROM information_schema.views
  WHERE table_schema = 'copilot_metrics';

  IF v_copilot_metrics_views < 20 THEN
    RAISE EXCEPTION 'copilot_metrics schema has only % views, expected at least 20. Migration 20260112000005 may have failed.', v_copilot_metrics_views;
  END IF;

  RAISE NOTICE 'Pre-cleanup verification passed:';
  RAISE NOTICE '  - copilot_core: % tables', v_copilot_core_tables;
  RAISE NOTICE '  - copilot_admin: % tables', v_copilot_admin_tables;
  RAISE NOTICE '  - copilot_audit: % tables', v_copilot_audit_tables;
  RAISE NOTICE '  - copilot_billing: % tables', v_copilot_billing_tables;
  RAISE NOTICE '  - copilot_metrics: % views', v_copilot_metrics_views;
END $do$;

-- =============================================================================
-- PART 2: Drop Remaining Objects from copilot_internal
-- =============================================================================
-- These may be orphaned triggers, functions, or views that weren't moved

-- 2.1: Drop any remaining views in copilot_internal
DO $do$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'copilot_internal'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS copilot_internal.%I CASCADE', r.table_name);
    RAISE NOTICE 'Dropped orphaned view: copilot_internal.%', r.table_name;
  END LOOP;
END $do$;

-- 2.2: Drop any remaining functions in copilot_internal
DO $do$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'copilot_internal'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS copilot_internal.%I(%s) CASCADE', r.proname, r.args);
    RAISE NOTICE 'Dropped orphaned function: copilot_internal.%(%)', r.proname, r.args;
  END LOOP;
END $do$;

-- 2.3: Drop any remaining tables in copilot_internal (should be none)
DO $do$
DECLARE
  r RECORD;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'copilot_internal' AND table_type = 'BASE TABLE'
  LOOP
    RAISE WARNING 'Orphaned table found in copilot_internal: %. This should not happen!', r.table_name;
    -- Don't auto-drop tables - they may contain data
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % orphaned tables in copilot_internal. Manual intervention required.', v_count;
  END IF;
END $do$;

-- =============================================================================
-- PART 3: Drop Remaining Objects from metrics
-- =============================================================================

-- 3.1: Drop any remaining views in metrics
DO $do$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'metrics'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS metrics.%I CASCADE', r.table_name);
    RAISE NOTICE 'Dropped orphaned view: metrics.%', r.table_name;
  END LOOP;
END $do$;

-- 3.2: Drop any remaining functions in metrics
DO $do$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'metrics'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS metrics.%I(%s) CASCADE', r.proname, r.args);
    RAISE NOTICE 'Dropped orphaned function: metrics.%(%)', r.proname, r.args;
  END LOOP;
END $do$;

-- 3.3: Drop any remaining tables in metrics (should be none - was views-only)
DO $do$
DECLARE
  r RECORD;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'metrics' AND table_type = 'BASE TABLE'
  LOOP
    RAISE WARNING 'Orphaned table found in metrics: %. This should not happen!', r.table_name;
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % orphaned tables in metrics. Manual intervention required.', v_count;
  END IF;
END $do$;

-- =============================================================================
-- PART 4: Drop Old Schemas
-- =============================================================================

-- 4.1: Drop copilot_internal schema
DO $do$
DECLARE
  v_remaining integer;
BEGIN
  -- Final check for any remaining objects
  SELECT COUNT(*) INTO v_remaining
  FROM (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'copilot_internal'
    UNION ALL
    SELECT 1 FROM information_schema.views WHERE table_schema = 'copilot_internal'
    UNION ALL
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'copilot_internal'
  ) x;

  IF v_remaining > 0 THEN
    RAISE WARNING 'copilot_internal still has % objects. Attempting CASCADE drop.', v_remaining;
  END IF;

  -- Check if schema exists before dropping
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'copilot_internal') THEN
    DROP SCHEMA copilot_internal CASCADE;
    RAISE NOTICE 'Dropped schema: copilot_internal';
  ELSE
    RAISE NOTICE 'Schema copilot_internal does not exist, skipping';
  END IF;
END $do$;

-- 4.2: Drop metrics schema
DO $do$
DECLARE
  v_remaining integer;
BEGIN
  -- Final check for any remaining objects
  SELECT COUNT(*) INTO v_remaining
  FROM (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'metrics'
    UNION ALL
    SELECT 1 FROM information_schema.views WHERE table_schema = 'metrics'
    UNION ALL
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'metrics'
  ) x;

  IF v_remaining > 0 THEN
    RAISE WARNING 'metrics still has % objects. Attempting CASCADE drop.', v_remaining;
  END IF;

  -- Check if schema exists before dropping
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'metrics') THEN
    DROP SCHEMA metrics CASCADE;
    RAISE NOTICE 'Dropped schema: metrics';
  ELSE
    RAISE NOTICE 'Schema metrics does not exist, skipping';
  END IF;
END $do$;

-- =============================================================================
-- PART 5: Final Verification
-- =============================================================================

DO $do$
DECLARE
  v_old_schemas_exist boolean;
  v_new_schema_count integer;
BEGIN
  -- Verify old schemas are gone
  SELECT EXISTS (
    SELECT 1 FROM information_schema.schemata
    WHERE schema_name IN ('copilot_internal', 'metrics')
  ) INTO v_old_schemas_exist;

  IF v_old_schemas_exist THEN
    RAISE EXCEPTION 'Old schemas still exist after cleanup!';
  END IF;

  -- Verify new schemas exist
  SELECT COUNT(*) INTO v_new_schema_count
  FROM information_schema.schemata
  WHERE schema_name IN ('copilot_core', 'copilot_admin', 'copilot_audit', 'copilot_billing', 'copilot_metrics');

  IF v_new_schema_count < 5 THEN
    RAISE EXCEPTION 'Expected 5 new copilot_* schemas, found %', v_new_schema_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║   SCHEMA REORGANIZATION COMPLETE                                  ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║                                                                   ║';
  RAISE NOTICE '║   Old schemas removed:                                            ║';
  RAISE NOTICE '║     ✗ copilot_internal (dropped)                                 ║';
  RAISE NOTICE '║     ✗ metrics (dropped)                                           ║';
  RAISE NOTICE '║                                                                   ║';
  RAISE NOTICE '║   New schema structure:                                           ║';
  RAISE NOTICE '║     ✓ copilot_core     - Core app tables (RLS enforced)          ║';
  RAISE NOTICE '║     ✓ copilot_admin    - Platform administration                 ║';
  RAISE NOTICE '║     ✓ copilot_audit    - SOC2/GDPR compliance logs               ║';
  RAISE NOTICE '║     ✓ copilot_billing  - Cost tracking & quotas                  ║';
  RAISE NOTICE '║     ✓ copilot_metrics  - Analytics views (read-only)             ║';
  RAISE NOTICE '║     ✓ public           - PostgREST API views                     ║';
  RAISE NOTICE '║                                                                   ║';
  RAISE NOTICE '║   All migrations completed successfully!                          ║';
  RAISE NOTICE '║                                                                   ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
END $do$;

-- =============================================================================
-- PART 6: Schema Summary View (For Documentation)
-- =============================================================================
-- Create a view that shows the new schema structure for documentation

CREATE OR REPLACE VIEW public.schema_inventory AS
SELECT
  n.nspname AS schema_name,
  CASE
    WHEN n.nspname = 'copilot_core' THEN 'Core application tables with RLS'
    WHEN n.nspname = 'copilot_admin' THEN 'Platform administration (service_role only)'
    WHEN n.nspname = 'copilot_audit' THEN 'SOC2/GDPR compliance logs (append-only)'
    WHEN n.nspname = 'copilot_billing' THEN 'Cost tracking and quotas'
    WHEN n.nspname = 'copilot_metrics' THEN 'Analytics views (read-only)'
    WHEN n.nspname = 'public' THEN 'PostgREST API views and functions'
    ELSE 'Other'
  END AS description,
  (SELECT COUNT(*) FROM information_schema.tables t WHERE t.table_schema = n.nspname AND t.table_type = 'BASE TABLE') AS table_count,
  (SELECT COUNT(*) FROM information_schema.views v WHERE v.table_schema = n.nspname) AS view_count,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace pn ON p.pronamespace = pn.oid WHERE pn.nspname = n.nspname) AS function_count
FROM pg_namespace n
WHERE n.nspname IN ('copilot_core', 'copilot_admin', 'copilot_audit', 'copilot_billing', 'copilot_metrics', 'public')
ORDER BY
  CASE n.nspname
    WHEN 'copilot_core' THEN 1
    WHEN 'copilot_admin' THEN 2
    WHEN 'copilot_audit' THEN 3
    WHEN 'copilot_billing' THEN 4
    WHEN 'copilot_metrics' THEN 5
    WHEN 'public' THEN 6
  END;

COMMENT ON VIEW public.schema_inventory IS 'Summary of application schemas after SOC2/GDPR reorganization';

-- Grant read access to the schema inventory view
GRANT SELECT ON public.schema_inventory TO authenticated, service_role;

