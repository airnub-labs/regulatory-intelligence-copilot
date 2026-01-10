-- =====================================================================================
-- REALISTIC SEED DATA: SEÁN O'BRIEN (PERSONAL USER - FREE TIER)
-- =====================================================================================
--
-- User Profile:
--   Name: Seán O'Brien
--   Type: Freelance IT consultant / Single-director limited company
--   Plan: Free
--   Location: Galway, Ireland
--   Business: IT consulting for SMEs
--   Revenue: €65K annually
--   Structure: Single-director limited company
--
-- This seed file creates:
--   - 1 personal tenant (Seán O'Brien's workspace)
--   - 1 user (solo practitioner)
--   - Tenant membership
--   - User preferences and context
--   - Auth identity
--
-- Note: This represents a typical sole trader / small business owner using the
-- platform for personal tax and business queries without external accountant support.
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant
  v_sean_tenant_id UUID := 'd3e4f506-a708-4c9d-0e1f-2a3b4c5d6e7f';
  v_sean_tenant_name TEXT := 'Seán''s Tax & Business Workspace';
  v_sean_slug TEXT := 'sean-obrien-freelance';

  -- User
  v_sean_id UUID := 'd4e5f607-a809-4d0e-1f2a-3b4c5d6e7f80';
  v_sean_email TEXT := 'sean.obrien@freelancetech.ie';
  v_sean_full_name TEXT := 'Seán O''Brien';

  -- Timestamp
  v_now TIMESTAMPTZ := NOW();
  v_founded TIMESTAMPTZ := '2021-09-01 10:00:00+00'::TIMESTAMPTZ;

  -- Pre-computed bcrypt password hash for 'Password123!'
  -- IMPORTANT: Generated using bcryptjs library (NOT PostgreSQL's crypt())
  -- because Supabase Auth (GoTrue) uses Go's bcrypt which requires $2b$ hashes
  v_password_hash TEXT := '$2b$10$Q8Eq2wkfSLDNGxoUGVBg9Oni98c7YNhdEVALNRkb6DnVri8hMs8pm';

BEGIN
  -- ==================================================================================
  -- 1. CREATE AUTH USER
  -- ==================================================================================

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
  VALUES (
    v_sean_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_sean_email,
    v_password_hash,
    v_founded,
    v_founded,
    v_now,
    v_now,
    jsonb_build_object('provider', 'email', 'providers', array['email'])
      || jsonb_build_object('tenant_id', v_sean_tenant_id),
    jsonb_build_object(
      'tenant_id', v_sean_tenant_id,
      'full_name', v_sean_full_name,
      'role', 'Freelance IT Consultant',
      'business_structure', 'Single-director limited company',
      'email_verified', true,
      'phone_verified', false
    ),
    '',
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = EXCLUDED.email_confirmed_at,
        updated_at = EXCLUDED.updated_at,
        last_sign_in_at = EXCLUDED.last_sign_in_at,
        raw_app_meta_data = EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  RAISE NOTICE 'Created/updated auth user: % (ID: %)', v_sean_full_name, v_sean_id;

  -- ==================================================================================
  -- 2. CREATE AUTH IDENTITY
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
  VALUES (
    gen_random_uuid(),
    v_sean_id,
    'email',
    v_sean_email,
    jsonb_build_object(
      'sub', v_sean_email,
      'email', v_sean_email
    ),
    v_founded,
    v_now
  )
  ON CONFLICT (provider_id, provider) DO UPDATE
    SET updated_at = EXCLUDED.updated_at;

  RAISE NOTICE 'Created auth identity for Seán';

  -- ==================================================================================
  -- 3. CREATE PERSONAL TENANT
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
    v_sean_tenant_id,
    v_sean_tenant_name,
    v_sean_slug,
    'Personal workspace for IT consulting business (single-director company, €65K revenue)',
    'personal',
    v_sean_id,
    'free',
    jsonb_build_object(
      'industry', 'IT Consulting',
      'business_type', 'Limited Company',
      'founded', '2021',
      'location', 'Galway, Ireland',
      'revenue_estimate', '€65,000',
      'registration_number', '689342',
      'company_name', 'O''Brien Technology Solutions Ltd'
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

  RAISE NOTICE 'Created/updated tenant: % (ID: %)', v_sean_tenant_name, v_sean_tenant_id;

  -- ==================================================================================
  -- 4. CREATE TENANT MEMBERSHIP
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
  VALUES (
    v_sean_tenant_id,
    v_sean_id,
    'owner',
    'active',
    v_founded,
    v_founded,
    v_now
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated tenant membership';

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
  VALUES (
    v_sean_id,
    v_sean_tenant_id,
    jsonb_build_object(
      'language', 'en-IE',
      'theme', 'system',
      'notifications_enabled', true,
      'cost_tracking_alerts', true,
      'free_tier_reminder', true
    ),
    v_founded,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
    SET current_tenant_id = EXCLUDED.current_tenant_id,
        preferences = EXCLUDED.preferences,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated user preferences';

  -- ==================================================================================
  -- 6. CREATE USER TENANT CONTEXT
  -- ==================================================================================

  INSERT INTO copilot_core.user_tenant_contexts (
    user_id,
    current_tenant_id,
    updated_at
  )
  VALUES (
    v_sean_id,
    v_sean_tenant_id,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
    SET current_tenant_id = EXCLUDED.current_tenant_id,
        updated_at = v_now;

  RAISE NOTICE 'Created/updated user tenant context';

  RAISE NOTICE '✅ Seán O''Brien personal tenant seed completed successfully';
  RAISE NOTICE '   Tenant ID: %', v_sean_tenant_id;
  RAISE NOTICE '   User ID: %', v_sean_id;
  RAISE NOTICE '   Email: %', v_sean_email;
  RAISE NOTICE '   Password: Password123!';
  RAISE NOTICE '   Plan: Free tier (€50/month cost quota)';

END $$;
