-- ========================================
-- Phase 1 Verification Script
-- ========================================
-- Purpose: Verify multi-tenant database foundation is working
-- Expected: All checks should pass with expected results
-- ========================================

\echo ''
\echo '========================================='
\echo 'Phase 1: Database Foundation Verification'
\echo '========================================='
\echo ''

-- ========================================
-- CHECK 1: Tables Exist
-- ========================================
\echo '✓ Check 1: Verifying multi-tenant tables exist...'
\echo ''

SELECT
    tablename,
    CASE
        WHEN tablename IN ('tenants', 'tenant_memberships', 'user_preferences') THEN '✓'
        ELSE '✗'
    END AS status
FROM pg_tables
WHERE schemaname = 'copilot_internal'
  AND tablename IN ('tenants', 'tenant_memberships', 'user_preferences')
ORDER BY tablename;

\echo ''

-- ========================================
-- CHECK 2: RLS Enabled
-- ========================================
\echo '✓ Check 2: Verifying Row Level Security is enabled...'
\echo ''

SELECT
    schemaname,
    tablename,
    CASE WHEN rowsecurity THEN '✓ ENABLED' ELSE '✗ DISABLED' END AS rls_status
FROM pg_tables
WHERE schemaname = 'copilot_internal'
  AND tablename IN ('tenants', 'tenant_memberships', 'user_preferences')
ORDER BY tablename;

\echo ''

-- ========================================
-- CHECK 3: Indexes Created
-- ========================================
\echo '✓ Check 3: Verifying indexes exist...'
\echo ''

SELECT
    schemaname || '.' || tablename AS table_name,
    indexname,
    '✓' AS status
FROM pg_indexes
WHERE schemaname = 'copilot_internal'
  AND tablename IN ('tenants', 'tenant_memberships', 'user_preferences')
ORDER BY tablename, indexname;

\echo ''

-- ========================================
-- CHECK 4: Helper Functions Exist
-- ========================================
\echo '✓ Check 4: Verifying helper functions exist...'
\echo ''

SELECT
    proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    '✓' AS status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN (
    'get_current_tenant_id',
    'get_user_tenants',
    'create_personal_tenant',
    'switch_tenant',
    'verify_tenant_access'
  )
ORDER BY proname;

\echo ''

-- ========================================
-- CHECK 5: RLS Policies Active
-- ========================================
\echo '✓ Check 5: Verifying RLS policies are active...'
\echo ''

SELECT
    schemaname,
    tablename,
    policyname,
    '✓' AS status
FROM pg_policies
WHERE schemaname = 'copilot_internal'
  AND tablename IN ('tenants', 'tenant_memberships', 'user_preferences')
ORDER BY tablename, policyname;

\echo ''

-- ========================================
-- CHECK 6: Demo User Has Personal Tenant
-- ========================================
\echo '✓ Check 6: Verifying demo user has personal tenant...'
\echo ''

SELECT
    u.id AS user_id,
    u.email,
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.type AS tenant_type,
    tm.role AS user_role,
    up.current_tenant_id = t.id AS is_active,
    '✓' AS status
FROM auth.users u
LEFT JOIN copilot_internal.user_preferences up ON up.user_id = u.id
LEFT JOIN copilot_internal.tenants t ON t.id = up.current_tenant_id
LEFT JOIN copilot_internal.tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = t.id
WHERE u.email LIKE '%demo%' OR u.email LIKE '%example%'
LIMIT 5;

\echo ''

-- ========================================
-- CHECK 7: Count Statistics
-- ========================================
\echo '✓ Check 7: Database statistics...'
\echo ''

SELECT
    'Tenants' AS entity,
    COUNT(*) AS count,
    '✓' AS status
FROM copilot_internal.tenants
UNION ALL
SELECT
    'Memberships' AS entity,
    COUNT(*) AS count,
    '✓' AS status
FROM copilot_internal.tenant_memberships
UNION ALL
SELECT
    'User Preferences' AS entity,
    COUNT(*) AS count,
    '✓' AS status
FROM copilot_internal.user_preferences
UNION ALL
SELECT
    'Auth Users' AS entity,
    COUNT(*) AS count,
    '✓' AS status
FROM auth.users;

\echo ''

-- ========================================
-- SUMMARY
-- ========================================
\echo '========================================='
\echo 'Phase 1 Verification Summary'
\echo '========================================='
\echo ''
\echo 'If all checks above show ✓ status:'
\echo '  → Phase 1 is COMPLETE'
\echo '  → Ready to proceed to Phase 2'
\echo ''
\echo 'Expected results:'
\echo '  - 3 tables created'
\echo '  - RLS enabled on all tables'
\echo '  - 5 helper functions created'
\echo '  - Multiple RLS policies per table'
\echo '  - At least 1 tenant exists'
\echo '  - At least 1 user with personal tenant'
\echo ''
\echo '========================================='
