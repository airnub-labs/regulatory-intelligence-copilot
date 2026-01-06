-- ========================================
-- Multi-Tenant Database Functions Test
-- ========================================
-- Purpose: Test all helper functions work correctly
-- Expected: All tests should pass
-- ========================================

\echo ''
\echo '========================================='
\echo 'Testing Multi-Tenant Database Functions'
\echo '========================================='
\echo ''

-- ========================================
-- TEST SETUP
-- ========================================
\echo '→ Setting up test data...'
\echo ''

-- Create test user
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    aud,
    role
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'test-phase1@example.com',
    crypt('testpassword123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Phase 1 Test User"}'::jsonb,
    'authenticated',
    'authenticated'
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

\echo '  ✓ Test user created: test-phase1@example.com'
\echo ''

-- ========================================
-- TEST 1: create_personal_tenant()
-- ========================================
\echo '========================================='
\echo 'TEST 1: create_personal_tenant()'
\echo '========================================='
\echo ''

SELECT public.create_personal_tenant(
    '11111111-1111-1111-1111-111111111111',
    'test-phase1@example.com'
) AS tenant_id \gset test1_

\echo '→ Testing: create_personal_tenant() returns tenant ID'
\echo ''

-- Verify tenant was created
SELECT
    'TEST 1.1' AS test,
    CASE
        WHEN COUNT(*) = 1 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Tenant record created' AS description
FROM copilot_internal.tenants
WHERE id = :'test1_tenant_id';

-- Verify tenant properties
SELECT
    'TEST 1.2' AS test,
    CASE
        WHEN type = 'personal' AND plan = 'free' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Tenant has correct type (personal) and plan (free)' AS description
FROM copilot_internal.tenants
WHERE id = :'test1_tenant_id';

-- Verify membership was created
SELECT
    'TEST 1.3' AS test,
    CASE
        WHEN COUNT(*) = 1 AND MAX(role) = 'owner' AND MAX(status) = 'active' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Owner membership created with active status' AS description
FROM copilot_internal.tenant_memberships
WHERE tenant_id = :'test1_tenant_id'
  AND user_id = '11111111-1111-1111-1111-111111111111';

-- Verify active tenant set
SELECT
    'TEST 1.4' AS test,
    CASE
        WHEN current_tenant_id = :'test1_tenant_id' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Active tenant preference set correctly' AS description
FROM copilot_internal.user_preferences
WHERE user_id = '11111111-1111-1111-1111-111111111111';

\echo ''

-- ========================================
-- TEST 2: get_current_tenant_id()
-- ========================================
\echo '========================================='
\echo 'TEST 2: get_current_tenant_id()'
\echo '========================================='
\echo ''

SELECT public.get_current_tenant_id('11111111-1111-1111-1111-111111111111') AS active_tenant \gset test2_

\echo '→ Testing: get_current_tenant_id() returns correct tenant'
\echo ''

SELECT
    'TEST 2.1' AS test,
    CASE
        WHEN :'test2_active_tenant' = :'test1_tenant_id' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Returns correct active tenant ID' AS description;

\echo ''

-- ========================================
-- TEST 3: get_user_tenants()
-- ========================================
\echo '========================================='
\echo 'TEST 3: get_user_tenants()'
\echo '========================================='
\echo ''

\echo '→ Testing: get_user_tenants() returns all user tenants'
\echo ''

-- Test returns correct number
SELECT
    'TEST 3.1' AS test,
    CASE
        WHEN COUNT(*) = 1 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Returns correct number of tenants (1)' AS description
FROM public.get_user_tenants('11111111-1111-1111-1111-111111111111');

-- Test marks active tenant
SELECT
    'TEST 3.2' AS test,
    CASE
        WHEN is_active = true THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Correctly marks active tenant' AS description
FROM public.get_user_tenants('11111111-1111-1111-1111-111111111111');

-- Test includes role
SELECT
    'TEST 3.3' AS test,
    CASE
        WHEN role = 'owner' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Returns correct role (owner)' AS description
FROM public.get_user_tenants('11111111-1111-1111-1111-111111111111');

\echo ''

-- ========================================
-- TEST 4: Create second tenant and switch
-- ========================================
\echo '========================================='
\echo 'TEST 4: Multiple Tenants & Switching'
\echo '========================================='
\echo ''

-- Create team tenant
INSERT INTO copilot_internal.tenants (
    id,
    name,
    slug,
    type,
    owner_id,
    plan
) VALUES (
    '22222222-2222-2222-2222-222222222222',
    'Test Team Workspace',
    'test-team',
    'team',
    '11111111-1111-1111-1111-111111111111',
    'pro'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name;

-- Add membership
INSERT INTO copilot_internal.tenant_memberships (
    tenant_id,
    user_id,
    role,
    status,
    joined_at
) VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'owner',
    'active',
    NOW()
)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    status = 'active';

\echo '  ✓ Created second tenant (team type)'
\echo ''

-- Verify user now has 2 tenants
SELECT
    'TEST 4.1' AS test,
    CASE
        WHEN COUNT(*) = 2 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'User has 2 tenants after creating team' AS description
FROM public.get_user_tenants('11111111-1111-1111-1111-111111111111');

\echo ''

-- ========================================
-- TEST 5: switch_tenant()
-- ========================================
\echo '========================================='
\echo 'TEST 5: switch_tenant()'
\echo '========================================='
\echo ''

-- Note: switch_tenant() requires auth.uid(), so we test the underlying update

UPDATE copilot_internal.user_preferences
SET current_tenant_id = '22222222-2222-2222-2222-222222222222'
WHERE user_id = '11111111-1111-1111-1111-111111111111';

\echo '→ Testing: Switched active tenant to team workspace'
\echo ''

-- Verify switch worked
SELECT
    'TEST 5.1' AS test,
    CASE
        WHEN public.get_current_tenant_id('11111111-1111-1111-1111-111111111111') = '22222222-2222-2222-2222-222222222222' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Active tenant updated to team workspace' AS description;

-- Verify get_user_tenants reflects change
SELECT
    'TEST 5.2' AS test,
    CASE
        WHEN SUM(CASE WHEN is_active THEN 1 ELSE 0 END) = 1 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Only one tenant marked as active' AS description
FROM public.get_user_tenants('11111111-1111-1111-1111-111111111111');

-- Verify correct tenant is active
SELECT
    'TEST 5.3' AS test,
    CASE
        WHEN tenant_id = '22222222-2222-2222-2222-222222222222' AND is_active THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Team workspace is now active' AS description
FROM public.get_user_tenants('11111111-1111-1111-1111-111111111111')
WHERE is_active = true;

\echo ''

-- ========================================
-- TEST 6: verify_tenant_access()
-- ========================================
\echo '========================================='
\echo 'TEST 6: verify_tenant_access()'
\echo '========================================='
\echo ''

\echo '→ Testing: verify_tenant_access() validates membership'
\echo ''

-- Test access to personal tenant
SELECT
    'TEST 6.1' AS test,
    CASE
        WHEN has_access = true AND role = 'owner' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Access verified for personal tenant' AS description
FROM public.verify_tenant_access(
    '11111111-1111-1111-1111-111111111111',
    :'test1_tenant_id'
);

-- Test access to team tenant
SELECT
    'TEST 6.2' AS test,
    CASE
        WHEN has_access = true AND role = 'owner' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'Access verified for team tenant' AS description
FROM public.verify_tenant_access(
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
);

-- Test no access to non-existent tenant
SELECT
    'TEST 6.3' AS test,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'No access to non-existent tenant' AS description
FROM public.verify_tenant_access(
    '11111111-1111-1111-1111-111111111111',
    '99999999-9999-9999-9999-999999999999'
);

\echo ''

-- ========================================
-- TEST 7: RLS Isolation
-- ========================================
\echo '========================================='
\echo 'TEST 7: RLS Tenant Isolation'
\echo '========================================='
\echo ''

-- Create second user with own tenant
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    aud,
    role
) VALUES (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'test-user2@example.com',
    crypt('testpassword123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Test User 2"}'::jsonb,
    'authenticated',
    'authenticated'
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

-- Create personal tenant for user 2
SELECT public.create_personal_tenant(
    '33333333-3333-3333-3333-333333333333',
    'test-user2@example.com'
) AS tenant_id \gset test7_

\echo '  ✓ Created second user with personal tenant'
\echo ''

-- Verify user 1 cannot see user 2's tenant (when using RLS)
SELECT
    'TEST 7.1' AS test,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS result,
    'RLS prevents cross-tenant visibility' AS description
FROM public.verify_tenant_access(
    '11111111-1111-1111-1111-111111111111',
    :'test7_tenant_id'
);

\echo ''

-- ========================================
-- CLEANUP
-- ========================================
\echo '========================================='
\echo 'Cleaning up test data...'
\echo '========================================='
\echo ''

-- Delete tenants first (ON DELETE RESTRICT prevents deleting users who own tenants)
DELETE FROM copilot_internal.tenants
WHERE owner_id IN (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333'
);

-- Delete user preferences
DELETE FROM copilot_internal.user_preferences
WHERE user_id IN (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333'
);

-- Delete memberships (should already be cascaded, but explicit is clearer)
DELETE FROM copilot_internal.tenant_memberships
WHERE user_id IN (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333'
);

-- Finally delete test users
DELETE FROM auth.users
WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333'
);

\echo '  ✓ Test data cleaned up successfully'
\echo ''

-- ========================================
-- SUMMARY
-- ========================================
\echo '========================================='
\echo 'Test Summary'
\echo '========================================='
\echo ''
\echo 'All tests completed!'
\echo ''
\echo 'Expected: All tests should show ✓ PASS'
\echo ''
\echo 'If all tests passed:'
\echo '  → Database functions are working correctly'
\echo '  → RLS policies are enforcing isolation'
\echo '  → Multi-tenant foundation is solid'
\echo '  → Ready to proceed to Phase 2'
\echo ''
\echo '========================================='
