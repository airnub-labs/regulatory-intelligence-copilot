-- ============================================================================
-- Access Control Verification Script
-- ============================================================================
-- Run this after applying migration 20260112000009_fix_access_control.sql
-- to verify all access control issues are resolved.
--
-- Usage:
--   psql <connection-string> -f scripts/verify-access-control.sql
--
-- Or via Supabase:
--   supabase db reset
--   psql -h localhost -p 54322 -U postgres -d postgres -f scripts/verify-access-control.sql
-- ============================================================================

\echo '=== Verification Report: Schema Access Control ==='
\echo ''

-- =============================================================================
-- Check 1: schema_inventory grants
-- =============================================================================
\echo '1. schema_inventory grants:'
\echo '   Expected: Only service_role with SELECT'
\echo ''

SELECT
  grantee,
  privilege_type,
  CASE
    WHEN grantee = 'service_role' AND privilege_type = 'SELECT' THEN '✓ CORRECT'
    WHEN grantee IN ('anon', 'authenticated') THEN '✗ WRONG - should not have access'
    WHEN grantee = 'service_role' AND privilege_type != 'SELECT' THEN '✗ WRONG - should only have SELECT'
    ELSE '? UNEXPECTED'
  END as status
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'schema_inventory'
ORDER BY grantee, privilege_type;

\echo ''

-- =============================================================================
-- Check 2: copilot_audit table grants
-- =============================================================================
\echo '2. copilot_audit table grants:'
\echo '   Expected: Only service_role (no authenticated)'
\echo ''

SELECT
  table_name,
  grantee,
  privilege_type,
  CASE
    WHEN grantee = 'service_role' AND privilege_type IN ('SELECT', 'INSERT') THEN '✓ CORRECT'
    WHEN grantee = 'authenticated' THEN '✗ WRONG - authenticated should not have access'
    WHEN grantee = 'anon' THEN '✗ WRONG - anon should not have access'
    ELSE '? UNEXPECTED'
  END as status
FROM information_schema.table_privileges
WHERE table_schema = 'copilot_audit'
ORDER BY table_name, grantee, privilege_type;

\echo ''

-- =============================================================================
-- Check 3: copilot_audit function grants
-- =============================================================================
\echo '3. copilot_audit function grants:'
\echo '   Expected: Only service_role (no authenticated)'
\echo ''

SELECT
  routine_name,
  grantee,
  privilege_type,
  CASE
    WHEN grantee = 'service_role' THEN '✓ CORRECT'
    WHEN grantee = 'authenticated' THEN '✗ WRONG - authenticated should not have access'
    WHEN grantee = 'anon' THEN '✗ WRONG - anon should not have access'
    ELSE '? UNEXPECTED'
  END as status
FROM information_schema.routine_privileges
WHERE routine_schema = 'copilot_audit'
  AND grantee != 'postgres' -- Exclude superuser
ORDER BY routine_name, grantee;

\echo ''

-- =============================================================================
-- Check 4: copilot_audit RLS policies
-- =============================================================================
\echo '4. copilot_audit RLS policies:'
\echo '   Expected: RLS enabled, but NO policies (default deny for authenticated)'
\echo ''

SELECT
  tablename,
  rowsecurity as rls_enabled,
  COUNT(pol.policyname) as policy_count,
  CASE
    WHEN rowsecurity = true AND COUNT(pol.policyname) = 0 THEN '✓ CORRECT - RLS enabled, no policies'
    WHEN rowsecurity = false THEN '✗ WRONG - RLS should be enabled'
    WHEN COUNT(pol.policyname) > 0 THEN '⚠ WARNING - unexpected policies exist'
    ELSE '? UNEXPECTED'
  END as status
FROM pg_tables t
LEFT JOIN pg_policies pol ON pol.schemaname = t.schemaname AND pol.tablename = t.tablename
WHERE t.schemaname = 'copilot_audit'
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;

\echo ''

-- =============================================================================
-- Check 5: Public views still have authenticated access
-- =============================================================================
\echo '5. Public PostgREST API views (should still have authenticated access):'
\echo '   Expected: All views have SELECT for authenticated and service_role'
\echo ''

WITH public_views AS (
  SELECT
    table_name,
    COUNT(*) FILTER (WHERE grantee = 'authenticated' AND privilege_type = 'SELECT') as auth_select,
    COUNT(*) FILTER (WHERE grantee = 'service_role' AND privilege_type = 'SELECT') as service_select
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name LIKE '%_view'
  GROUP BY table_name
)
SELECT
  table_name,
  auth_select > 0 as has_authenticated_select,
  service_select > 0 as has_service_role_select,
  CASE
    WHEN auth_select > 0 AND service_select > 0 THEN '✓ CORRECT'
    WHEN auth_select = 0 THEN '✗ WRONG - missing authenticated SELECT'
    WHEN service_select = 0 THEN '✗ WRONG - missing service_role SELECT'
    ELSE '? UNEXPECTED'
  END as status
FROM public_views
ORDER BY table_name;

\echo ''

-- =============================================================================
-- Summary
-- =============================================================================
\echo '=== Summary ==='

DO $$
DECLARE
  v_schema_inventory_issues integer;
  v_audit_auth_issues integer;
  v_public_view_issues integer;
BEGIN
  -- Count schema_inventory issues
  SELECT COUNT(*) INTO v_schema_inventory_issues
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'schema_inventory'
    AND (grantee IN ('anon', 'authenticated') OR (grantee = 'service_role' AND privilege_type != 'SELECT'));

  -- Count copilot_audit authenticated grants
  SELECT COUNT(*) INTO v_audit_auth_issues
  FROM information_schema.table_privileges
  WHERE table_schema = 'copilot_audit'
    AND grantee = 'authenticated';

  -- Count public view issues
  SELECT COUNT(*) INTO v_public_view_issues
  FROM (
    SELECT table_name
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name LIKE '%_view'
    GROUP BY table_name
    HAVING COUNT(*) FILTER (WHERE grantee = 'authenticated' AND privilege_type = 'SELECT') = 0
  ) sub;

  -- Print summary
  RAISE NOTICE '';
  RAISE NOTICE '=== Verification Summary ===';
  RAISE NOTICE 'schema_inventory issues: % (expected: 0)', v_schema_inventory_issues;
  RAISE NOTICE 'copilot_audit authenticated grants: % (expected: 0)', v_audit_auth_issues;
  RAISE NOTICE 'public views missing authenticated: % (expected: 0)', v_public_view_issues;
  RAISE NOTICE '';

  IF v_schema_inventory_issues = 0 AND v_audit_auth_issues = 0 AND v_public_view_issues = 0 THEN
    RAISE NOTICE '✓ ALL CHECKS PASSED - Access control is correct!';
  ELSE
    RAISE NOTICE '✗ ISSUES FOUND - Please review the report above';
  END IF;
END $$;
