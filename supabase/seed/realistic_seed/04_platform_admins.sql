-- =====================================================================================
-- REALISTIC SEED DATA: PLATFORM ADMIN USERS (GLOBAL SUPPORT TEAM)
-- =====================================================================================
--
-- Global Support Team Structure:
--   - Super Admin (Dublin HQ)
--   - Platform Engineers (Dublin)
--   - Account Manager (Dublin)
--   - Compliance Auditor (Brussels)
--   - Support Tier 3 (Dublin - Senior Engineering Support)
--   - Support Tier 2 (Bangalore, India - Escalation Support, Overnight Coverage)
--   - Support Tier 1 (Manila, Philippines - Frontline Support, Limited Access)
--   - External Security Auditor (London - Temporary Access)
--
-- This seed file creates:
--   - 10 platform admin users with proper role assignments
--   - Geographically distributed support team
--   - Tenant assignments for tiered support
--   - Auth users with appropriate metadata
--   - Realistic last login timestamps
--
-- Geographic Coverage: 24/7 support across Manila (GMT+8), Bangalore (GMT+5:30), Dublin (GMT+0)
--
-- Users created:
--   1. Gráinne Ní Mhaonaigh - super_admin (Dublin)
--   2. Tadhg O'Reilly - platform_engineer (Dublin)
--   3. Caoimhe Byrne - platform_engineer (Dublin)
--   4. Donal Lynch - account_manager (Dublin)
--   5. Marie Dubois - compliance_auditor (Brussels)
--   6. Pádraig Brennan - support_tier_3 (Dublin)
--   7. Priya Sharma - support_tier_2 (Bangalore)
--   8. Rajesh Kumar - support_tier_2 (Bangalore)
--   9. Maria Santos - support_tier_1 (Manila)
--  10. Jose Reyes - support_tier_1 (Manila)
--
-- =====================================================================================

DO $$
DECLARE
  -- Pre-computed bcrypt password hash for 'AdminPassword123!'
  -- IMPORTANT: Generated using bcryptjs library (NOT PostgreSQL's crypt())
  -- because Supabase Auth (GoTrue) uses Go's bcrypt which requires $2b$ hashes
  v_admin_password_hash TEXT := '$2b$10$D1gEWR7KOzNqadGHi.xIJeHTa5pNCUMP6.tZzk062WU0zSbNUlf3q';

  -- Timestamp
  v_now TIMESTAMPTZ := NOW();

  -- Tenant IDs (from previous seed files)
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_emerald_tenant_id UUID := 'c2d3e4f5-06a7-4b8c-9d0e-1f2a3b4c5d6e';

  -- Admin User IDs
  v_grainne_id UUID := 'e1f20304-a506-4c7d-8e9f-0a1b2c3d4e5f';  -- Super Admin
  v_tadhg_id UUID := 'e2f30405-a607-4d8e-9f0a-1b2c3d4e5f60';  -- Platform Engineer
  v_caoimhe_id UUID := 'e3f40506-a708-4e9f-0a1b-2c3d4e5f6071';  -- Platform Engineer
  v_donal_id UUID := 'e4f50607-a809-4f0a-1b2c-3d4e5f607182';  -- Account Manager
  v_marie_id UUID := 'e5f60708-a90a-4a1b-2c3d-4e5f60718293';  -- Compliance Auditor
  v_padraig_id UUID := 'e6f70809-a00b-4b2c-3d4e-5f60718293a4';  -- Support Tier 3
  v_priya_id UUID := 'e7f8090a-a10c-4c3d-4e5f-60718293a4b5';  -- Support Tier 2
  v_rajesh_id UUID := 'e8f9000b-a20d-4d4e-5f60-718293a4b5c6';  -- Support Tier 2
  v_maria_id UUID := 'e9f0010c-a30e-4e5f-6071-8293a4b5c6d7';  -- Support Tier 1
  v_jose_id UUID := 'e0f1020d-a40f-4f60-7182-93a4b5c6d7e8';  -- Support Tier 1

BEGIN
  -- ==================================================================================
  -- 1. CREATE AUTH USERS FOR PLATFORM ADMINS
  -- ==================================================================================

  CREATE TEMP TABLE IF NOT EXISTS temp_admin_users (
    id UUID,
    email TEXT,
    full_name TEXT,
    role TEXT,
    location TEXT,
    department TEXT,
    status TEXT,
    assigned_tenant_ids UUID[],
    created_at TIMESTAMPTZ,
    last_login TIMESTAMPTZ
  );

  -- Insert admin user data
  INSERT INTO temp_admin_users (id, email, full_name, role, location, department, status, assigned_tenant_ids, created_at, last_login) VALUES
    -- Super Admin (Dublin)
    (v_grainne_id, 'grainne.nimhaonaigh@regintel.io', 'Gráinne Ní Mhaonaigh', 'super_admin', 'Dublin, Ireland', 'Executive', 'active', NULL, '2024-01-01 09:00:00+00'::TIMESTAMPTZ, v_now - INTERVAL '15 minutes'),

    -- Platform Engineers (Dublin)
    (v_tadhg_id, 'tadhg.oreilly@regintel.io', 'Tadhg O''Reilly', 'platform_engineer', 'Dublin, Ireland', 'Engineering', 'active', NULL, '2024-01-01 09:30:00+00'::TIMESTAMPTZ, v_now - INTERVAL '1 hour'),
    (v_caoimhe_id, 'caoimhe.byrne@regintel.io', 'Caoimhe Byrne', 'platform_engineer', 'Dublin, Ireland', 'Engineering', 'active', NULL, '2024-01-01 10:00:00+00'::TIMESTAMPTZ, v_now - INTERVAL '30 minutes'),

    -- Account Manager (Dublin)
    (v_donal_id, 'donal.lynch@regintel.io', 'Donal Lynch', 'account_manager', 'Dublin, Ireland', 'Customer Success', 'active', ARRAY[v_datatech_tenant_id], '2024-01-05 09:00:00+00'::TIMESTAMPTZ, v_now - INTERVAL '2 hours'),

    -- Compliance Auditor (Brussels)
    (v_marie_id, 'marie.dubois@regintel.io', 'Marie Dubois', 'compliance_auditor', 'Brussels, Belgium', 'Legal & Compliance', 'active', NULL, '2024-01-08 09:00:00+01'::TIMESTAMPTZ, v_now - INTERVAL '4 hours'),

    -- Support Tier 3 (Dublin)
    (v_padraig_id, 'padraig.brennan@regintel.io', 'Pádraig Brennan', 'support_tier_3', 'Dublin, Ireland', 'Technical Support', 'active', NULL, '2024-01-10 09:00:00+00'::TIMESTAMPTZ, v_now - INTERVAL '45 minutes'),

    -- Support Tier 2 (Bangalore)
    (v_priya_id, 'priya.sharma@regintel.io', 'Priya Sharma', 'support_tier_2', 'Bangalore, India', 'Technical Support', 'active', NULL, '2024-01-12 14:00:00+05:30'::TIMESTAMPTZ, v_now - INTERVAL '6 hours'),
    (v_rajesh_id, 'rajesh.kumar@regintel.io', 'Rajesh Kumar', 'support_tier_2', 'Bangalore, India', 'Technical Support', 'active', NULL, '2024-01-12 06:00:00+05:30'::TIMESTAMPTZ, v_now - INTERVAL '8 hours'),

    -- Support Tier 1 (Manila)
    (v_maria_id, 'maria.santos@regintel.io', 'Maria Santos', 'support_tier_1', 'Manila, Philippines', 'Customer Support', 'active', ARRAY[v_datatech_tenant_id, v_emerald_tenant_id], '2024-01-15 09:00:00+08'::TIMESTAMPTZ, v_now - INTERVAL '9 hours'),
    (v_jose_id, 'jose.reyes@regintel.io', 'Jose Reyes', 'support_tier_1', 'Manila, Philippines', 'Customer Support', 'active', ARRAY[v_datatech_tenant_id, v_emerald_tenant_id], '2024-01-15 13:00:00+08'::TIMESTAMPTZ, v_now - INTERVAL '7 hours');

  -- Create auth.users for all admin users
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change
  )
  SELECT
    tau.id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    tau.email,
    v_admin_password_hash,
    tau.created_at,
    tau.created_at,
    v_now,
    tau.last_login,
    jsonb_build_object('provider', 'email', 'providers', array['email'])
      || jsonb_build_object('is_admin', true, 'admin_role', tau.role),
    jsonb_build_object(
      'full_name', tau.full_name,
      'role', tau.role,
      'location', tau.location,
      'department', tau.department,
      'email_verified', true,
      'phone_verified', false,
      'is_platform_admin', true
    ),
    '',
    '',
    '',
    '',
    ''
  FROM temp_admin_users tau
  ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = EXCLUDED.email_confirmed_at,
        updated_at = EXCLUDED.updated_at,
        last_sign_in_at = EXCLUDED.last_sign_in_at,
        raw_app_meta_data = EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  RAISE NOTICE 'Created/updated % auth users for platform admins', (SELECT COUNT(*) FROM temp_admin_users);

  -- ==================================================================================
  -- 2. CREATE AUTH IDENTITIES FOR PLATFORM ADMINS
  -- ==================================================================================

  INSERT INTO auth.identities (
    id,
    user_id,
    provider,
    provider_id,
    identity_data,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    tau.id,
    'email',
    tau.email,
    jsonb_build_object(
      'sub', tau.email,
      'email', tau.email
    ),
    tau.created_at,
    v_now
  FROM temp_admin_users tau
  ON CONFLICT (provider_id, provider) DO UPDATE
    SET updated_at = EXCLUDED.updated_at;

  RAISE NOTICE 'Created auth identities for platform admins';

  -- ==================================================================================
  -- 3. CREATE PLATFORM_ADMINS RECORDS
  -- ==================================================================================

  INSERT INTO copilot_core.platform_admins (
    id,
    email,
    display_name,
    role,
    status,
    tenant_id,
    assigned_tenant_ids,
    created_at,
    updated_at,
    last_login
  )
  SELECT
    tau.id,
    tau.email,
    tau.full_name,
    tau.role,
    tau.status,
    -- tenant_id: Only set for account_manager role (assigned to specific tenants)
    CASE
      WHEN tau.role = 'account_manager' THEN v_datatech_tenant_id
      ELSE NULL
    END,
    tau.assigned_tenant_ids,
    tau.created_at,
    v_now,
    tau.last_login
  FROM temp_admin_users tau
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        tenant_id = EXCLUDED.tenant_id,
        assigned_tenant_ids = EXCLUDED.assigned_tenant_ids,
        updated_at = v_now,
        last_login = EXCLUDED.last_login;

  RAISE NOTICE 'Created/updated platform_admins records';

  -- ==================================================================================
  -- 4. CREATE USER PREFERENCES FOR PLATFORM ADMINS
  -- ==================================================================================

  INSERT INTO copilot_core.user_preferences (
    user_id,
    current_tenant_id,
    preferences,
    created_at,
    updated_at
  )
  SELECT
    tau.id,
    NULL,  -- Platform admins don't have a default tenant
    jsonb_build_object(
      'language', CASE
        WHEN tau.location LIKE '%India%' THEN 'en-US'
        WHEN tau.location LIKE '%Philippines%' THEN 'en-US'
        WHEN tau.location LIKE '%Belgium%' THEN 'fr-FR'
        ELSE 'en-IE'
      END,
      'theme', 'system',
      'admin_view', true,
      'timezone', CASE
        WHEN tau.location LIKE '%India%' THEN 'Asia/Kolkata'
        WHEN tau.location LIKE '%Philippines%' THEN 'Asia/Manila'
        WHEN tau.location LIKE '%Belgium%' THEN 'Europe/Brussels'
        ELSE 'Europe/Dublin'
      END
    ),
    tau.created_at,
    v_now
  FROM temp_admin_users tau
  ON CONFLICT (user_id) DO UPDATE
    SET preferences = EXCLUDED.preferences,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated user preferences for platform admins';

  -- Cleanup temp table
  DROP TABLE IF EXISTS temp_admin_users;

  RAISE NOTICE '✅ Platform admin users seed completed successfully';
  RAISE NOTICE '   Total admins: 10';
  RAISE NOTICE '   - 1 super_admin (Dublin)';
  RAISE NOTICE '   - 2 platform_engineers (Dublin)';
  RAISE NOTICE '   - 1 account_manager (Dublin)';
  RAISE NOTICE '   - 1 compliance_auditor (Brussels)';
  RAISE NOTICE '   - 1 support_tier_3 (Dublin)';
  RAISE NOTICE '   - 2 support_tier_2 (Bangalore)';
  RAISE NOTICE '   - 2 support_tier_1 (Manila)';
  RAISE NOTICE '   Password for all admins: AdminPassword123!';
  RAISE NOTICE '   Geographic coverage: 24/7 across Manila (GMT+8), Bangalore (GMT+5:30), Dublin (GMT+0)';

END $$;
