-- =====================================================================================
-- REALISTIC SEED DATA: DATATECH SOLUTIONS LTD (ENTERPRISE)
-- =====================================================================================
--
-- Company Profile:
--   Name: DataTech Solutions Ltd
--   Type: Irish software development company
--   Plan: Enterprise
--   Founded: 2019
--   Employees: 87
--   Location: Dublin 2, Ireland
--   Business: SaaS platform for healthcare providers
--   Revenue: €12M ARR
--
-- This seed file creates:
--   - 1 enterprise tenant (DataTech Solutions)
--   - 12 users across different roles (CEO, CFO, CTO, directors, managers)
--   - Tenant memberships for all users
--   - User preferences and contexts
--   - Auth identities
--
-- Users created:
--   1. Niamh McCarthy (CEO) - owner
--   2. Ronan O'Sullivan (CFO) - admin
--   3. Siobhan Walsh (Finance Director) - admin
--   4. Declan Ryan (Finance Manager) - member
--   5. Aoife Murphy (Payroll Specialist) - member
--   6. Liam Fitzgerald (CTO) - admin
--   7. Ciarán Burke (Engineering Lead) - member
--   8. Orla Brennan (HR Director) - admin
--   9. Sinéad O'Connor (HR Manager) - member
--  10. Conor Doyle (Legal Counsel) - admin
--  11. Mary Kavanagh (External Auditor) - viewer
--  12. Eoin Gallagher (Tax Consultant) - viewer
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_datatech_tenant_name TEXT := 'DataTech Solutions Ltd';
  v_datatech_slug TEXT := 'datatech-solutions';

  -- Timestamp
  v_now TIMESTAMPTZ := NOW();
  v_founded TIMESTAMPTZ := '2019-03-15 09:00:00+00'::TIMESTAMPTZ;

  -- Pre-computed bcrypt password hash for 'Password123!'
  -- IMPORTANT: Generated using bcryptjs library (NOT PostgreSQL's crypt())
  -- because Supabase Auth (GoTrue) uses Go's bcrypt which requires $2b$ hashes
  v_password_hash TEXT := '$2b$10$Q8Eq2wkfSLDNGxoUGVBg9Oni98c7YNhdEVALNRkb6DnVri8hMs8pm';

  -- User IDs (pre-generated UUIDs for idempotency)
  v_niamh_id UUID := 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';  -- CEO
  v_ronan_id UUID := 'a2b3c4d5-e6f7-4b8c-9d0e-1f2a3b4c5d6e';  -- CFO
  v_siobhan_id UUID := 'a3b4c5d6-e7f8-4c9d-0e1f-2a3b4c5d6e7f';  -- Finance Director
  v_declan_id UUID := 'a4b5c6d7-e8f9-4d0e-1f2a-3b4c5d6e7f80';  -- Finance Manager
  v_aoife_id UUID := 'a5b6c7d8-e9f0-4e1f-2a3b-4c5d6e7f8091';  -- Payroll Specialist
  v_liam_id UUID := 'a6b7c8d9-e0f1-4f2a-3b4c-5d6e7f809102';  -- CTO
  v_ciaran_id UUID := 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f80910213';  -- Engineering Lead
  v_orla_id UUID := 'a8b9c0d1-e2f3-4b4c-5d6e-7f8091021324';  -- HR Director
  v_sinead_id UUID := 'a9b0c1d2-e3f4-4c5d-6e7f-8091021324a5';  -- HR Manager
  v_conor_id UUID := 'a0b1c2d3-e4f5-4d6e-7f80-91021324a5b6';  -- Legal Counsel
  v_mary_id UUID := 'b1c2d3e4-f5a6-4e7f-8091-021324a5b6c7';  -- External Auditor
  v_eoin_id UUID := 'b2c3d4e5-f6a7-4f80-9102-1324a5b6c7d8';  -- Tax Consultant

BEGIN
  -- ==================================================================================
  -- 1. CREATE AUTH USERS
  -- ==================================================================================

  -- Helper function to insert/update auth user
  CREATE TEMP TABLE IF NOT EXISTS temp_users (
    id UUID,
    email TEXT,
    full_name TEXT,
    role TEXT,
    created_at TIMESTAMPTZ
  );

  -- User data
  INSERT INTO temp_users (id, email, full_name, role, created_at) VALUES
    (v_niamh_id, 'niamh.mccarthy@datatech.ie', 'Niamh McCarthy', 'CEO', v_founded + INTERVAL '0 days'),
    (v_ronan_id, 'ronan.osullivan@datatech.ie', 'Ronan O''Sullivan', 'CFO', v_founded + INTERVAL '30 days'),
    (v_siobhan_id, 'siobhan.walsh@datatech.ie', 'Siobhan Walsh', 'Finance Director', v_founded + INTERVAL '45 days'),
    (v_declan_id, 'declan.ryan@datatech.ie', 'Declan Ryan', 'Finance Manager', v_founded + INTERVAL '90 days'),
    (v_aoife_id, 'aoife.murphy@datatech.ie', 'Aoife Murphy', 'Payroll Specialist', v_founded + INTERVAL '120 days'),
    (v_liam_id, 'liam.fitzgerald@datatech.ie', 'Liam Fitzgerald', 'CTO', v_founded + INTERVAL '15 days'),
    (v_ciaran_id, 'ciaran.burke@datatech.ie', 'Ciarán Burke', 'Engineering Lead', v_founded + INTERVAL '60 days'),
    (v_orla_id, 'orla.brennan@datatech.ie', 'Orla Brennan', 'HR Director', v_founded + INTERVAL '75 days'),
    (v_sinead_id, 'sinead.oconnor@datatech.ie', 'Sinéad O''Connor', 'HR Manager', v_founded + INTERVAL '105 days'),
    (v_conor_id, 'conor.doyle@datatech.ie', 'Conor Doyle', 'Legal Counsel', v_founded + INTERVAL '180 days'),
    (v_mary_id, 'mary.kavanagh@kpmg.ie', 'Mary Kavanagh', 'External Auditor (KPMG)', '2024-01-10 10:00:00+00'::TIMESTAMPTZ),
    (v_eoin_id, 'eoin.gallagher@pwc.ie', 'Eoin Gallagher', 'Tax Consultant (PwC)', '2024-01-15 11:00:00+00'::TIMESTAMPTZ);

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
      || jsonb_build_object('tenant_id', v_datatech_tenant_id),
    jsonb_build_object(
      'tenant_id', v_datatech_tenant_id,
      'full_name', tu.full_name,
      'role', tu.role,
      'email_verified', true,
      'phone_verified', false
    ),
    '',
    '',
    '',
    '',
    ''
  FROM temp_users tu
  ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = EXCLUDED.email_confirmed_at,
        updated_at = EXCLUDED.updated_at,
        last_sign_in_at = EXCLUDED.last_sign_in_at,
        raw_app_meta_data = EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  RAISE NOTICE 'Created/updated % auth users for DataTech', (SELECT COUNT(*) FROM temp_users);

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
  FROM temp_users tu
  ON CONFLICT (provider_id, provider) DO UPDATE
    SET updated_at = EXCLUDED.updated_at;

  RAISE NOTICE 'Created auth identities for DataTech users';

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
    v_datatech_tenant_id,
    v_datatech_tenant_name,
    v_datatech_slug,
    'Irish SaaS company providing healthcare compliance platform (87 employees, €12M ARR)',
    'enterprise',
    v_niamh_id,  -- CEO is owner
    'enterprise',
    jsonb_build_object(
      'industry', 'Healthcare Technology',
      'founded', '2019',
      'employees', 87,
      'location', 'Dublin 2, Ireland',
      'registration_number', '674891',
      'vat_number', 'IE1234567A'
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

  RAISE NOTICE 'Created/updated tenant: % (ID: %)', v_datatech_tenant_name, v_datatech_tenant_id;

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
    -- Executive team
    (v_datatech_tenant_id, v_niamh_id, 'owner', 'active', v_founded, v_founded, v_now),
    (v_datatech_tenant_id, v_ronan_id, 'admin', 'active', v_founded + INTERVAL '30 days', v_founded + INTERVAL '30 days', v_now),
    (v_datatech_tenant_id, v_liam_id, 'admin', 'active', v_founded + INTERVAL '15 days', v_founded + INTERVAL '15 days', v_now),
    (v_datatech_tenant_id, v_conor_id, 'admin', 'active', v_founded + INTERVAL '180 days', v_founded + INTERVAL '180 days', v_now),

    -- Finance team
    (v_datatech_tenant_id, v_siobhan_id, 'admin', 'active', v_founded + INTERVAL '45 days', v_founded + INTERVAL '45 days', v_now),
    (v_datatech_tenant_id, v_declan_id, 'member', 'active', v_founded + INTERVAL '90 days', v_founded + INTERVAL '90 days', v_now),
    (v_datatech_tenant_id, v_aoife_id, 'member', 'active', v_founded + INTERVAL '120 days', v_founded + INTERVAL '120 days', v_now),

    -- Engineering team
    (v_datatech_tenant_id, v_ciaran_id, 'member', 'active', v_founded + INTERVAL '60 days', v_founded + INTERVAL '60 days', v_now),

    -- HR team
    (v_datatech_tenant_id, v_orla_id, 'admin', 'active', v_founded + INTERVAL '75 days', v_founded + INTERVAL '75 days', v_now),
    (v_datatech_tenant_id, v_sinead_id, 'member', 'active', v_founded + INTERVAL '105 days', v_founded + INTERVAL '105 days', v_now),

    -- External stakeholders
    (v_datatech_tenant_id, v_mary_id, 'viewer', 'active', '2024-01-10 10:00:00+00'::TIMESTAMPTZ, '2024-01-10 10:00:00+00'::TIMESTAMPTZ, v_now),
    (v_datatech_tenant_id, v_eoin_id, 'viewer', 'active', '2024-01-15 11:00:00+00'::TIMESTAMPTZ, '2024-01-15 11:00:00+00'::TIMESTAMPTZ, v_now)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated tenant memberships for % users', (SELECT COUNT(*) FROM temp_users);

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
    v_datatech_tenant_id,
    jsonb_build_object(
      'language', 'en-IE',
      'theme', 'system',
      'notifications_enabled', true
    ),
    tu.created_at,
    v_now
  FROM temp_users tu
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
    v_datatech_tenant_id,
    v_now
  FROM temp_users tu
  ON CONFLICT (user_id) DO UPDATE
    SET current_tenant_id = EXCLUDED.current_tenant_id,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated user tenant contexts';

  -- Cleanup temp table
  DROP TABLE IF EXISTS temp_users;

  RAISE NOTICE '✅ DataTech Solutions enterprise tenant seed completed successfully';
  RAISE NOTICE '   Tenant ID: %', v_datatech_tenant_id;
  RAISE NOTICE '   Users: 12 (1 owner, 5 admins, 4 members, 2 viewers)';
  RAISE NOTICE '   Password for all users: Password123!';

END $$;
