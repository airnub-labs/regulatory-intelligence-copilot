-- =====================================================================================
-- REALISTIC SEED DATA: EMERALD TAX CONSULTING (PROFESSIONAL SERVICES - PRO TIER)
-- =====================================================================================
--
-- Company Profile:
--   Name: Emerald Tax Consulting
--   Type: Irish chartered tax advisory firm
--   Plan: Pro
--   Founded: 2015
--   Employees: 12
--   Location: Cork City, Ireland
--   Business: Tax compliance and advisory for SMEs
--   Revenue: €900K annually
--
-- This seed file creates:
--   - 1 pro-tier tenant (Emerald Tax Consulting)
--   - 6 users (partners, consultants, practice manager)
--   - Tenant memberships for all users
--   - User preferences and contexts
--   - Auth identities
--
-- Users created:
--   1. Fiona Collins (Managing Partner) - owner
--   2. Brendan Hayes (Senior Tax Consultant) - admin
--   3. Claire Nolan (Senior Tax Consultant) - admin
--   4. Darragh Murphy (Tax Consultant) - member
--   5. Aoibhinn Kelly (Junior Consultant) - member
--   6. Teresa Flynn (Practice Manager) - admin
--
-- Note: This firm manages client workspaces through conversation tags/categories
-- rather than separate tenant entities.
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant
  v_emerald_tenant_id UUID := 'c2d3e4f5-06a7-4b8c-9d0e-1f2a3b4c5d6e';
  v_emerald_tenant_name TEXT := 'Emerald Tax Consulting';
  v_emerald_slug TEXT := 'emerald-tax-consulting';

  -- Timestamp
  v_now TIMESTAMPTZ := NOW();
  v_founded TIMESTAMPTZ := '2015-06-01 09:00:00+00'::TIMESTAMPTZ;

  -- Pre-computed bcrypt password hash for 'Password123!'
  -- IMPORTANT: Generated using bcryptjs library (NOT PostgreSQL's crypt())
  -- because Supabase Auth (GoTrue) uses Go's bcrypt which requires $2b$ hashes
  v_password_hash TEXT := '$2b$10$Q8Eq2wkfSLDNGxoUGVBg9Oni98c7YNhdEVALNRkb6DnVri8hMs8pm';

  -- User IDs
  v_fiona_id UUID := 'c3d4e5f6-07a8-4c9d-0e1f-2a3b4c5d6e7f';  -- Managing Partner
  v_brendan_id UUID := 'c4d5e6f7-08a9-4d0e-1f2a-3b4c5d6e7f80';  -- Senior Tax Consultant
  v_claire_id UUID := 'c5d6e7f8-09a0-4e1f-2a3b-4c5d6e7f8091';  -- Senior Tax Consultant
  v_darragh_id UUID := 'c6d7e8f9-00a1-4f2a-3b4c-5d6e7f809102';  -- Tax Consultant
  v_aoibhinn_id UUID := 'c7d8e9f0-01a2-4a3b-4c5d-6e7f80910213';  -- Junior Consultant
  v_teresa_id UUID := 'c8d9e0f1-02a3-4b4c-5d6e-7f8091021324';  -- Practice Manager

BEGIN
  -- ==================================================================================
  -- 1. CREATE AUTH USERS
  -- ==================================================================================

  CREATE TEMP TABLE IF NOT EXISTS temp_emerald_users (
    id UUID,
    email TEXT,
    full_name TEXT,
    role_title TEXT,
    created_at TIMESTAMPTZ
  );

  INSERT INTO temp_emerald_users (id, email, full_name, role_title, created_at) VALUES
    (v_fiona_id, 'fiona@emeraldtax.ie', 'Fiona Collins', 'Managing Partner', v_founded),
    (v_brendan_id, 'brendan@emeraldtax.ie', 'Brendan Hayes', 'Senior Tax Consultant', v_founded + INTERVAL '30 days'),
    (v_claire_id, 'claire@emeraldtax.ie', 'Claire Nolan', 'Senior Tax Consultant', v_founded + INTERVAL '60 days'),
    (v_darragh_id, 'darragh@emeraldtax.ie', 'Darragh Murphy', 'Tax Consultant', v_founded + INTERVAL '180 days'),
    (v_aoibhinn_id, 'aoibhinn@emeraldtax.ie', 'Aoibhinn Kelly', 'Junior Consultant', v_founded + INTERVAL '365 days'),
    (v_teresa_id, 'teresa@emeraldtax.ie', 'Teresa Flynn', 'Practice Manager', v_founded + INTERVAL '90 days');

  -- Insert/update auth.users
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
    tu.id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    tu.email,
    v_password_hash,
    tu.created_at,
    tu.created_at,
    v_now,
    v_now,
    jsonb_build_object('provider', 'email', 'providers', array['email'])
      || jsonb_build_object('tenant_id', v_emerald_tenant_id),
    jsonb_build_object(
      'tenant_id', v_emerald_tenant_id,
      'full_name', tu.full_name,
      'role', tu.role_title,
      'email_verified', true,
      'phone_verified', false
    ),
    '',
    '',
    '',
    '',
    ''
  FROM temp_emerald_users tu
  ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = EXCLUDED.email_confirmed_at,
        updated_at = EXCLUDED.updated_at,
        last_sign_in_at = EXCLUDED.last_sign_in_at,
        raw_app_meta_data = EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  RAISE NOTICE 'Created/updated % auth users for Emerald Tax', (SELECT COUNT(*) FROM temp_emerald_users);

  -- ==================================================================================
  -- 2. CREATE AUTH IDENTITIES
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
    tu.id,
    'email',
    tu.email,
    jsonb_build_object(
      'sub', tu.email,
      'email', tu.email
    ),
    tu.created_at,
    v_now
  FROM temp_emerald_users tu
  ON CONFLICT (provider_id, provider) DO UPDATE
    SET updated_at = EXCLUDED.updated_at;

  RAISE NOTICE 'Created auth identities for Emerald Tax users';

  -- ==================================================================================
  -- 3. CREATE TENANT
  -- ==================================================================================

  INSERT INTO copilot_core.tenants (
    id,
    name,
    slug,
    description,
    type,
    owner_id,
    plan,
    settings,
    created_at,
    updated_at
  )
  VALUES (
    v_emerald_tenant_id,
    v_emerald_tenant_name,
    v_emerald_slug,
    'Chartered tax advisory firm serving Irish SMEs (12 employees, €900K revenue)',
    'team',
    v_fiona_id,  -- Managing Partner is owner
    'pro',
    jsonb_build_object(
      'industry', 'Professional Services - Tax Advisory',
      'founded', '2015',
      'employees', 12,
      'location', 'Cork City, Ireland',
      'registration_number', 'CRO-458392',
      'professional_body', 'Irish Tax Institute'
    ),
    v_founded,
    v_now
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        description = EXCLUDED.description,
        type = EXCLUDED.type,
        owner_id = EXCLUDED.owner_id,
        plan = EXCLUDED.plan,
        settings = EXCLUDED.settings,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated tenant: % (ID: %)', v_emerald_tenant_name, v_emerald_tenant_id;

  -- ==================================================================================
  -- 4. CREATE TENANT MEMBERSHIPS
  -- ==================================================================================

  INSERT INTO copilot_core.tenant_memberships (
    tenant_id,
    user_id,
    role,
    status,
    joined_at,
    created_at,
    updated_at
  )
  VALUES
    -- Managing Partner (owner)
    (v_emerald_tenant_id, v_fiona_id, 'owner', 'active', v_founded, v_founded, v_now),

    -- Senior consultants (admin)
    (v_emerald_tenant_id, v_brendan_id, 'admin', 'active', v_founded + INTERVAL '30 days', v_founded + INTERVAL '30 days', v_now),
    (v_emerald_tenant_id, v_claire_id, 'admin', 'active', v_founded + INTERVAL '60 days', v_founded + INTERVAL '60 days', v_now),

    -- Practice Manager (admin - operations)
    (v_emerald_tenant_id, v_teresa_id, 'admin', 'active', v_founded + INTERVAL '90 days', v_founded + INTERVAL '90 days', v_now),

    -- Consultants (member)
    (v_emerald_tenant_id, v_darragh_id, 'member', 'active', v_founded + INTERVAL '180 days', v_founded + INTERVAL '180 days', v_now),
    (v_emerald_tenant_id, v_aoibhinn_id, 'member', 'active', v_founded + INTERVAL '365 days', v_founded + INTERVAL '365 days', v_now)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated tenant memberships for % users', (SELECT COUNT(*) FROM temp_emerald_users);

  -- ==================================================================================
  -- 5. CREATE USER PREFERENCES
  -- ==================================================================================

  INSERT INTO copilot_core.user_preferences (
    user_id,
    current_tenant_id,
    preferences,
    created_at,
    updated_at
  )
  SELECT
    tu.id,
    v_emerald_tenant_id,
    jsonb_build_object(
      'language', 'en-IE',
      'theme', 'light',
      'notifications_enabled', true,
      'client_view_mode', 'list'  -- Professional services specific preference
    ),
    tu.created_at,
    v_now
  FROM temp_emerald_users tu
  ON CONFLICT (user_id) DO UPDATE
    SET current_tenant_id = EXCLUDED.current_tenant_id,
        preferences = EXCLUDED.preferences,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated user preferences';

  -- ==================================================================================
  -- 6. CREATE USER TENANT CONTEXTS
  -- ==================================================================================

  INSERT INTO copilot_core.user_tenant_contexts (
    user_id,
    current_tenant_id,
    updated_at
  )
  SELECT
    tu.id,
    v_emerald_tenant_id,
    v_now
  FROM temp_emerald_users tu
  ON CONFLICT (user_id) DO UPDATE
    SET current_tenant_id = EXCLUDED.current_tenant_id,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated user tenant contexts';

  -- Cleanup temp table
  DROP TABLE IF EXISTS temp_emerald_users;

  RAISE NOTICE '✅ Emerald Tax Consulting pro tenant seed completed successfully';
  RAISE NOTICE '   Tenant ID: %', v_emerald_tenant_id;
  RAISE NOTICE '   Users: 6 (1 owner, 3 admins, 2 members)';
  RAISE NOTICE '   Password for all users: Password123!';
  RAISE NOTICE '   Note: Client workspaces managed through conversation categories';

END $$;
