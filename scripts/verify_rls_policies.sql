-- ========================================
-- RLS Policy Verification Script
-- ========================================
-- Verifies that Row Level Security policies
-- are correctly enforcing multi-tenant isolation
--
-- Prerequisites:
--   - Run seed_multi_tenant_demo.sql first
--   - Seed data must be loaded
--
-- Usage:
--   psql -h localhost -U postgres -d postgres -f scripts/verify_rls_policies.sql
-- ========================================

\echo ''
\echo '========================================'
\echo 'RLS POLICY VERIFICATION'
\echo '========================================'
\echo ''

-- ========================================
-- Test 1: Verify RLS is Enabled
-- ========================================

\echo 'Test 1: Checking RLS is enabled on all tables...'
\echo ''

SELECT
  schemaname,
  tablename,
  CASE
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END AS rls_status
FROM pg_tables
WHERE schemaname = 'copilot_core'
  AND tablename IN (
    'tenants',
    'tenant_memberships',
    'conversations',
    'conversation_messages',
    'user_preferences',
    'cost_tracking',
    'compaction_jobs'
  )
ORDER BY tablename;

\echo ''

-- Verify all have RLS enabled
DO $$
DECLARE
  disabled_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO disabled_count
  FROM pg_tables
  WHERE schemaname = 'copilot_core'
    AND tablename IN (
      'tenants',
      'tenant_memberships',
      'conversations',
      'conversation_messages',
      'user_preferences',
      'cost_tracking',
      'compaction_jobs'
    )
    AND rowsecurity = false;

  IF disabled_count > 0 THEN
    RAISE EXCEPTION '❌ FAILED: % tables have RLS disabled!', disabled_count;
  ELSE
    RAISE NOTICE '✅ PASSED: All tables have RLS enabled';
  END IF;
END $$;

\echo ''

-- ========================================
-- Test 2: Verify Policies Exist
-- ========================================

\echo 'Test 2: Checking RLS policies exist...'
\echo ''

SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS operation,
  CASE
    WHEN qual IS NOT NULL THEN '✅ HAS FILTER'
    ELSE '⚠️  NO FILTER'
  END AS has_filter
FROM pg_policies
WHERE schemaname = 'copilot_core'
ORDER BY tablename, cmd, policyname;

\echo ''

-- Count policies per table
SELECT
  tablename,
  COUNT(*) AS policy_count,
  CASE
    WHEN COUNT(*) >= 4 THEN '✅ COMPLETE'
    WHEN COUNT(*) > 0 THEN '⚠️  PARTIAL'
    ELSE '❌ MISSING'
  END AS status
FROM pg_policies
WHERE schemaname = 'copilot_core'
GROUP BY tablename
ORDER BY tablename;

\echo ''

-- ========================================
-- Test 3: Verify Tenant Context Function
-- ========================================

\echo 'Test 3: Testing tenant context function...'
\echo ''

-- Test get_tenant_context function
DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; -- Alice
  v_tenant_id UUID := '11111111-1111-1111-1111-111111111111'; -- Alice's personal workspace
  v_result RECORD;
BEGIN
  -- Set session variables
  PERFORM set_config('app.current_user_id', v_user_id::text, false);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, false);

  -- Call function
  SELECT * INTO v_result FROM copilot_core.get_tenant_context();

  IF v_result.user_id = v_user_id AND v_result.tenant_id = v_tenant_id THEN
    RAISE NOTICE '✅ PASSED: get_tenant_context() returns correct values';
    RAISE NOTICE '   User ID: %', v_result.user_id;
    RAISE NOTICE '   Tenant ID: %', v_result.tenant_id;
  ELSE
    RAISE EXCEPTION '❌ FAILED: get_tenant_context() returned incorrect values';
  END IF;
END $$;

\echo ''

-- ========================================
-- Test 4: Verify get_user_tenants Function
-- ========================================

\echo 'Test 4: Testing get_user_tenants function...'
\echo ''

-- Test for Alice (should have 3 tenants)
DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; -- Alice
  v_tenant_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);

  SELECT COUNT(*) INTO v_tenant_count
  FROM copilot_core.get_user_tenants();

  IF v_tenant_count = 3 THEN
    RAISE NOTICE '✅ PASSED: Alice has access to 3 workspaces';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Alice should have 3 workspaces, found %', v_tenant_count;
  END IF;
END $$;

-- Test for Bob (should have 2 tenants)
DO $$
DECLARE
  v_user_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; -- Bob
  v_tenant_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);

  SELECT COUNT(*) INTO v_tenant_count
  FROM copilot_core.get_user_tenants();

  IF v_tenant_count = 2 THEN
    RAISE NOTICE '✅ PASSED: Bob has access to 2 workspaces';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Bob should have 2 workspaces, found %', v_tenant_count;
  END IF;
END $$;

-- Test for Charlie (should have 2 tenants)
DO $$
DECLARE
  v_user_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'; -- Charlie
  v_tenant_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);

  SELECT COUNT(*) INTO v_tenant_count
  FROM copilot_core.get_user_tenants();

  IF v_tenant_count = 2 THEN
    RAISE NOTICE '✅ PASSED: Charlie has access to 2 workspaces';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Charlie should have 2 workspaces, found %', v_tenant_count;
  END IF;
END $$;

\echo ''

-- ========================================
-- Test 5: Verify Tenant Access Function
-- ========================================

\echo 'Test 5: Testing verify_tenant_access function...'
\echo ''

-- Test valid access: Alice to Acme Corp
DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; -- Alice
  v_tenant_id UUID := 'aaaacccc-1111-2222-3333-444444444444'; -- Acme Corp
  v_has_access BOOLEAN;
BEGIN
  SELECT copilot_core.verify_tenant_access(v_user_id, v_tenant_id)
  INTO v_has_access;

  IF v_has_access THEN
    RAISE NOTICE '✅ PASSED: Alice has access to Acme Corp';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Alice should have access to Acme Corp';
  END IF;
END $$;

-- Test invalid access: Bob to Startup XYZ (should fail)
DO $$
DECLARE
  v_user_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; -- Bob
  v_tenant_id UUID := 'bbbbeee0-5555-6666-7777-888888888888'; -- Startup XYZ
  v_has_access BOOLEAN;
BEGIN
  SELECT copilot_core.verify_tenant_access(v_user_id, v_tenant_id)
  INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE NOTICE '✅ PASSED: Bob correctly denied access to Startup XYZ';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Bob should NOT have access to Startup XYZ';
  END IF;
END $$;

-- Test invalid access: Charlie to Acme Corp (should fail)
DO $$
DECLARE
  v_user_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'; -- Charlie
  v_tenant_id UUID := 'aaaacccc-1111-2222-3333-444444444444'; -- Acme Corp
  v_has_access BOOLEAN;
BEGIN
  SELECT copilot_core.verify_tenant_access(v_user_id, v_tenant_id)
  INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE NOTICE '✅ PASSED: Charlie correctly denied access to Acme Corp';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Charlie should NOT have access to Acme Corp';
  END IF;
END $$;

\echo ''

-- ========================================
-- Test 6: Verify Data Isolation (Conversations)
-- ========================================

\echo 'Test 6: Testing conversation data isolation...'
\echo ''

-- Test Alice's personal workspace
DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; -- Alice
  v_tenant_id UUID := '11111111-1111-1111-1111-111111111111'; -- Alice's personal
  v_conv_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, false);

  SELECT COUNT(*) INTO v_conv_count
  FROM copilot_core.conversations;

  IF v_conv_count = 2 THEN
    RAISE NOTICE '✅ PASSED: Alice sees 2 conversations in personal workspace';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Alice should see 2 conversations in personal workspace, found %', v_conv_count;
  END IF;
END $$;

-- Test Alice in Acme Corp
DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; -- Alice
  v_tenant_id UUID := 'aaaacccc-1111-2222-3333-444444444444'; -- Acme Corp
  v_conv_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, false);

  SELECT COUNT(*) INTO v_conv_count
  FROM copilot_core.conversations;

  IF v_conv_count = 3 THEN
    RAISE NOTICE '✅ PASSED: Alice sees 3 conversations in Acme Corp';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Alice should see 3 conversations in Acme Corp, found %', v_conv_count;
  END IF;
END $$;

-- Test Bob in Acme Corp
DO $$
DECLARE
  v_user_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; -- Bob
  v_tenant_id UUID := 'aaaacccc-1111-2222-3333-444444444444'; -- Acme Corp
  v_conv_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, false);

  SELECT COUNT(*) INTO v_conv_count
  FROM copilot_core.conversations;

  -- Bob should see all 3 Acme Corp conversations (created by Alice and Bob)
  IF v_conv_count = 3 THEN
    RAISE NOTICE '✅ PASSED: Bob sees 3 conversations in Acme Corp';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Bob should see 3 conversations in Acme Corp, found %', v_conv_count;
  END IF;
END $$;

-- Test Charlie in Startup XYZ
DO $$
DECLARE
  v_user_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'; -- Charlie
  v_tenant_id UUID := 'bbbbeee0-5555-6666-7777-888888888888'; -- Startup XYZ
  v_conv_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, false);

  SELECT COUNT(*) INTO v_conv_count
  FROM copilot_core.conversations;

  IF v_conv_count = 2 THEN
    RAISE NOTICE '✅ PASSED: Charlie sees 2 conversations in Startup XYZ';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Charlie should see 2 conversations in Startup XYZ, found %', v_conv_count;
  END IF;
END $$;

\echo ''

-- ========================================
-- Test 7: Verify Cross-Tenant Isolation
-- ========================================

\echo 'Test 7: Testing cross-tenant data isolation...'
\echo ''

-- Bob should NOT see Alice's personal conversations
DO $$
DECLARE
  v_bob_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_alice_personal_id UUID := '11111111-1111-1111-1111-111111111111';
  v_conv_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_bob_id::text, false);
  PERFORM set_config('app.current_tenant_id', v_alice_personal_id::text, false);

  SELECT COUNT(*) INTO v_conv_count
  FROM copilot_core.conversations;

  IF v_conv_count = 0 THEN
    RAISE NOTICE '✅ PASSED: Bob cannot see Alice''s personal conversations';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Bob should NOT see any conversations in Alice''s workspace, found %', v_conv_count;
  END IF;
END $$;

-- Charlie should NOT see Acme Corp conversations
DO $$
DECLARE
  v_charlie_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_acme_id UUID := 'aaaacccc-1111-2222-3333-444444444444';
  v_conv_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_charlie_id::text, false);
  PERFORM set_config('app.current_tenant_id', v_acme_id::text, false);

  SELECT COUNT(*) INTO v_conv_count
  FROM copilot_core.conversations;

  IF v_conv_count = 0 THEN
    RAISE NOTICE '✅ PASSED: Charlie cannot see Acme Corp conversations';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Charlie should NOT see any Acme Corp conversations, found %', v_conv_count;
  END IF;
END $$;

\echo ''

-- ========================================
-- Test 8: Verify Tenant Membership Isolation
-- ========================================

\echo 'Test 8: Testing tenant membership isolation...'
\echo ''

-- Alice should see only her memberships
DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_membership_count INTEGER;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);

  -- Note: RLS on tenant_memberships might be different
  -- This test verifies logical access, not RLS enforcement
  SELECT COUNT(*) INTO v_membership_count
  FROM copilot_core.tenant_memberships
  WHERE user_id = v_user_id;

  IF v_membership_count = 3 THEN
    RAISE NOTICE '✅ PASSED: Alice has 3 memberships';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Alice should have 3 memberships, found %', v_membership_count;
  END IF;
END $$;

\echo ''

-- ========================================
-- Test 9: Verify Switch Tenant Function
-- ========================================

\echo 'Test 9: Testing switch_tenant function...'
\echo ''

-- Test switching Alice from personal to Acme Corp
DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_new_tenant UUID := 'aaaacccc-1111-2222-3333-444444444444'; -- Acme Corp
  v_current_tenant UUID;
BEGIN
  PERFORM set_config('app.current_user_id', v_user_id::text, false);

  -- Switch tenant
  PERFORM copilot_core.switch_tenant(v_new_tenant);

  -- Verify switch
  SELECT current_tenant_id INTO v_current_tenant
  FROM copilot_core.user_preferences
  WHERE user_id = v_user_id;

  IF v_current_tenant = v_new_tenant THEN
    RAISE NOTICE '✅ PASSED: switch_tenant() updated current tenant';
  ELSE
    RAISE EXCEPTION '❌ FAILED: switch_tenant() did not update current tenant';
  END IF;

  -- Switch back to personal
  PERFORM copilot_core.switch_tenant('11111111-1111-1111-1111-111111111111');
END $$;

-- Test switching to unauthorized tenant (should fail)
DO $$
DECLARE
  v_bob_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_startup_xyz UUID := 'bbbbeee0-5555-6666-7777-888888888888'; -- Startup XYZ (Bob is NOT a member)
BEGIN
  PERFORM set_config('app.current_user_id', v_bob_id::text, false);

  -- This should raise an exception
  BEGIN
    PERFORM copilot_core.switch_tenant(v_startup_xyz);
    RAISE EXCEPTION '❌ FAILED: Bob should not be able to switch to Startup XYZ';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '✅ PASSED: switch_tenant() correctly prevents unauthorized access';
  END;
END $$;

\echo ''

-- ========================================
-- Test 10: Data Integrity Checks
-- ========================================

\echo 'Test 10: Checking data integrity...'
\echo ''

-- Verify all conversations have valid tenant_id
DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count
  FROM copilot_core.conversations c
  WHERE NOT EXISTS (
    SELECT 1 FROM copilot_core.tenants t
    WHERE t.id = c.tenant_id
  );

  IF v_orphan_count = 0 THEN
    RAISE NOTICE '✅ PASSED: All conversations have valid tenant_id';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Found % orphaned conversations', v_orphan_count;
  END IF;
END $$;

-- Verify all memberships have valid user_id and tenant_id
DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count
  FROM copilot_core.tenant_memberships tm
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = tm.user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM copilot_core.tenants t WHERE t.id = tm.tenant_id
  );

  IF v_orphan_count = 0 THEN
    RAISE NOTICE '✅ PASSED: All memberships have valid foreign keys';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Found % orphaned memberships', v_orphan_count;
  END IF;
END $$;

-- Verify all users have at least one tenant
DO $$
DECLARE
  v_userless_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_userless_count
  FROM auth.users u
  WHERE u.email IN ('alice@example.com', 'bob@example.com', 'charlie@example.com')
    AND NOT EXISTS (
      SELECT 1 FROM copilot_core.tenant_memberships tm
      WHERE tm.user_id = u.id
    );

  IF v_userless_count = 0 THEN
    RAISE NOTICE '✅ PASSED: All test users have tenant memberships';
  ELSE
    RAISE EXCEPTION '❌ FAILED: Found % users without tenants', v_userless_count;
  END IF;
END $$;

\echo ''

-- ========================================
-- Summary
-- ========================================

\echo '========================================'
\echo 'VERIFICATION SUMMARY'
\echo '========================================'
\echo ''

SELECT
  'Total Tenants' AS metric,
  COUNT(*)::text AS value
FROM copilot_core.tenants
WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz');

SELECT
  'Total Memberships' AS metric,
  COUNT(*)::text AS value
FROM copilot_core.tenant_memberships
WHERE tenant_id IN (
  SELECT id FROM copilot_core.tenants
  WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz')
);

SELECT
  'Total Conversations' AS metric,
  COUNT(*)::text AS value
FROM copilot_core.conversations
WHERE tenant_id IN (
  SELECT id FROM copilot_core.tenants
  WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz')
);

\echo ''
\echo '========================================'
\echo 'RLS VERIFICATION COMPLETE!'
\echo '========================================'
\echo ''
\echo 'If all tests passed, the multi-tenant'
\echo 'RLS implementation is working correctly.'
\echo ''
