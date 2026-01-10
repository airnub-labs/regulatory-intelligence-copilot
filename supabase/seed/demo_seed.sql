-- =====================================================================================
-- ⚠️  DEPRECATED: This seed file has been replaced with realistic multi-tenant seed data
-- =====================================================================================
--
-- This file is no longer loaded by `supabase db reset`. The seed data has been
-- replaced with more realistic scenarios representing real-world usage patterns.
--
-- **New seed data location:** supabase/seed/realistic_seed/
--
-- The new seed data includes:
--   - DataTech Solutions Ltd (Enterprise tenant with 12 users)
--   - Emerald Tax Consulting (Pro tenant with 6 users)
--   - Seán O'Brien (Personal tenant - freelance consultant)
--   - 10 platform admin users with global distribution
--   - Realistic personas, quick prompts, and reference data
--
-- For more information, see:
--   - supabase/seed/realistic_seed/README.md
--   - supabase/config.toml (sql_paths configuration)
--
-- **Migration path:** If you need the old demo user, manually run this file:
--   psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed/demo_seed.sql
--
-- =====================================================================================

do $$
declare
  demo_email text := 'demo.user@example.com';
  -- Pre-computed bcrypt hash for 'Password123!' generated using bcryptjs library.
  -- IMPORTANT: We use a pre-computed hash because PostgreSQL's crypt() function
  -- produces hashes incompatible with Supabase's GoTrue authentication backend
  -- (which uses Go's bcrypt library). See: https://github.com/supabase-community/seed/issues/208

--   hashed bcrypt password for supabase user by running this code for password Password123! ---
-- async function hashPassword(password: string): Promise<string> {
--   const saltRounds = 6;
--   const salt = await bcrypt.genSalt(saltRounds);
--   const hashedPassword = await bcrypt.hash(password, salt);
--   return hashedPassword;
-- }
-- .....
--  password: await hashPassword('password'),

  demo_password_hash text := '$2b$10$dFyws4yGmOsWeYY7FxFXeOhat4R6UmwWnGbj8xP//5fMmaGn7Iq6y';
  demo_full_name text := 'Demo User';
  demo_now timestamptz := now();
  seeded_user record;
  demo_conv_id uuid;
  demo_conversation_title text := 'Demo conversation';
  demo_user_id uuid;
  demo_tenant_id uuid := coalesce(
    nullif(current_setting('app.demo_tenant_id', true), '')::uuid,
    gen_random_uuid()
  );
  demo_path_id uuid;
begin
  ---------------------------------------------------------------------------
  -- 1. Ensure demo auth user exists (idempotent)
  ---------------------------------------------------------------------------
  select id, raw_user_meta_data, created_at
    into seeded_user
    from auth.users
   where email = demo_email
   limit 1;

  if not found then
    -- Create demo auth user
    demo_user_id := gen_random_uuid();

    insert into auth.users (
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
    values (
      demo_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      demo_email,
      demo_password_hash,
      demo_now,
      demo_now,
      demo_now,
      demo_now,
      jsonb_build_object('provider', 'email', 'providers', array['email'])
        || jsonb_build_object('tenant_id', demo_tenant_id),
      jsonb_build_object(
        'tenant_id', demo_tenant_id,
        'full_name', demo_full_name,
        'email_verified', true,
        'phone_verified', false
      ),
      '',
      '',
      '',
      '',
      ''
    );
  else
    -- Reuse and refresh existing demo user
    demo_user_id := seeded_user.id;

    update auth.users
       set encrypted_password = demo_password_hash,
           instance_id = '00000000-0000-0000-0000-000000000000',
           aud = 'authenticated',
           role = 'authenticated',
           email_confirmed_at = demo_now,
           created_at = coalesce(seeded_user.created_at, demo_now),
           updated_at = demo_now,
           last_sign_in_at = demo_now,
           raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email'])
             || jsonb_build_object('tenant_id', demo_tenant_id),
           raw_user_meta_data = jsonb_build_object(
             'tenant_id', demo_tenant_id,
             'full_name', demo_full_name,
             'email_verified', true,
             'phone_verified', false
           ),
           confirmation_token = '',
           recovery_token = '',
           email_change_token_new = '',
           email_change_token_current = '',
           email_change = ''
     where id = demo_user_id;
  end if;

  ---------------------------------------------------------------------------
  -- 2. Create/update personal tenant for demo user (NEW: Multi-tenant architecture)
  ---------------------------------------------------------------------------
  -- Check if tenant exists
  perform 1
    from copilot_core.tenants
   where id = demo_tenant_id;

  if not found then
    -- Create personal tenant
    insert into copilot_core.tenants (
      id,
      name,
      slug,
      type,
      owner_id,
      plan,
      created_at,
      updated_at
    )
    values (
      demo_tenant_id,
      'Demo User''s Workspace',
      'demo-user-workspace',
      'personal',
      demo_user_id,
      'free',
      demo_now,
      demo_now
    );

    raise notice 'Created personal tenant for demo user: %', demo_tenant_id;
  end if;

  -- Ensure membership exists
  insert into copilot_core.tenant_memberships (
    tenant_id,
    user_id,
    role,
    status,
    joined_at,
    created_at,
    updated_at
  )
  values (
    demo_tenant_id,
    demo_user_id,
    'owner',
    'active',
    demo_now,
    demo_now,
    demo_now
  )
  on conflict (tenant_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = demo_now;

  -- Ensure user preference exists (set demo tenant as current)
  insert into copilot_core.user_preferences (
    user_id,
    current_tenant_id,
    preferences,
    created_at,
    updated_at
  )
  values (
    demo_user_id,
    demo_tenant_id,
    '{}'::jsonb,
    demo_now,
    demo_now
  )
  on conflict (user_id) do update
    set current_tenant_id = demo_tenant_id,
        updated_at = demo_now;

  -- Also populate user_tenant_contexts (used by session sync monitoring)
  insert into copilot_core.user_tenant_contexts (
    user_id,
    current_tenant_id,
    updated_at
  )
  values (
    demo_user_id,
    demo_tenant_id,
    demo_now
  )
  on conflict (user_id) do update
    set current_tenant_id = demo_tenant_id,
        updated_at = demo_now;

  raise notice 'Demo user tenant setup complete: user=%, tenant=%', demo_user_id, demo_tenant_id;

  ---------------------------------------------------------------------------
  -- 3. Ensure an email identity exists (with provider_id)
  ---------------------------------------------------------------------------
  perform 1
    from auth.identities
   where user_id = demo_user_id
     and provider = 'email';

  if not found then
    insert into auth.identities (
      id,
      user_id,
      provider,
      provider_id,
      identity_data
    )
    values (
      gen_random_uuid(),
      demo_user_id,
      'email',
      demo_email,
      jsonb_build_object(
        'sub', demo_email,
        'email', demo_email
      )
    );
  end if;

  ---------------------------------------------------------------------------
  -- 4. Seed personas (idempotent)
  ---------------------------------------------------------------------------
  insert into copilot_core.personas (id, label, description, jurisdictions)
  values (
      'single-director-ie',
      'Single-director Irish company',
      'Owner-director of a single-director Irish limited company – PAYE, PRSI, CT, pensions and CGT interactions.',
      array['IE']
    )
  on conflict (id) do update
    set label = excluded.label,
        description = excluded.description,
        jurisdictions = excluded.jurisdictions;

  ---------------------------------------------------------------------------
  -- 5. Seed quick prompts (idempotent)
  ---------------------------------------------------------------------------
  insert into copilot_core.quick_prompts (
    id,
    label,
    prompt,
    scenario_hint,
    persona_filter,
    jurisdictions
  )
  values (
      'paye_prsi_single_director',
      'PAYE vs PRSI for single-director',
      'Explain how PAYE and PRSI interact for a single-director Irish company with salary + dividends.',
      'paye_prsi_single_director',
      array['single-director-ie'],
      array['IE']
    )
  on conflict (id) do update
    set label = excluded.label,
        prompt = excluded.prompt,
        scenario_hint = excluded.scenario_hint,
        persona_filter = excluded.persona_filter,
        jurisdictions = excluded.jurisdictions;

  ---------------------------------------------------------------------------
  -- 6. Ensure demo conversation exists
  ---------------------------------------------------------------------------
  select id
    into demo_conv_id
    from copilot_core.conversations c
   where c.tenant_id = demo_tenant_id
     and c.user_id = demo_user_id
     and c.title = demo_conversation_title
   order by c.created_at asc
   limit 1;

  if not found then
    insert into copilot_core.conversations (
      tenant_id,
      user_id,
      share_audience,
      tenant_access,
      title,
      persona_id,
      jurisdictions
    )
    values (
      demo_tenant_id,
      demo_user_id,
      'tenant',
      'edit',
      demo_conversation_title,
      'single-director-ie',
      array['IE']
    )
    returning id into demo_conv_id;
  end if;

  ---------------------------------------------------------------------------
  -- 7. Ensure a primary path exists for the demo conversation
  ---------------------------------------------------------------------------
  select id
    into demo_path_id
    from copilot_core.conversation_paths p
   where p.conversation_id = demo_conv_id
     and p.is_primary = true
   order by p.created_at asc
   limit 1;

  if not found then
    insert into copilot_core.conversation_paths (
      conversation_id,
      tenant_id,
      name,
      description,
      is_primary,
      is_active
    )
    values (
      demo_conv_id,
      demo_tenant_id,
      'Main path',
      'Primary path for seeded demo conversation',
      true,
      true
    )
    returning id into demo_path_id;
  end if;

  ---------------------------------------------------------------------------
  -- 8. Seed demo messages with valid path_id
  ---------------------------------------------------------------------------
  delete from copilot_core.conversation_messages
   where conversation_id = demo_conv_id;

  insert into copilot_core.conversation_messages (
    conversation_id,
    tenant_id,
    user_id,
    role,
    content,
    metadata,
    path_id
  )
  values
    (
      demo_conv_id,
      demo_tenant_id,
      demo_user_id,
      'user',
      'How do PAYE and PRSI interact for a single-director company?',
      null,
      demo_path_id
    ),
    (
      demo_conv_id,
      demo_tenant_id,
      null,
      'assistant',
      'Here is how PAYE and PRSI interact between salary, PRSI classes, and corporation tax for a single-director company.',
      jsonb_build_object('jurisdictions', array['IE']),
      demo_path_id
    );

  ---------------------------------------------------------------------------
  -- 9. Seed / refresh conversation context
  ---------------------------------------------------------------------------
  insert into copilot_core.conversation_contexts (
    conversation_id,
    tenant_id,
    active_node_ids,
    summary,
    updated_at
  )
  values (
    demo_conv_id,
    demo_tenant_id,
    array[]::text[],
    'Seeded demo conversation for PAYE/PRSI interactions.',
    demo_now
  )
  on conflict (conversation_id) do update
    set tenant_id = excluded.tenant_id,
        active_node_ids = excluded.active_node_ids,
        summary = excluded.summary,
        updated_at = excluded.updated_at;

end $$;

-- ========================================
-- Multi-Tenant Test Users and Workspaces
-- ========================================
-- Creates 3 additional test users with multiple tenant memberships
-- to demonstrate and test full multi-tenant functionality.
--
-- Test credentials:
--   alice@example.com / password123
--   bob@example.com / password123
--   charlie@example.com / password123
--
-- Alice has access to:
--   - Alice's Workspace (personal)
--   - Acme Corp (owner)
--   - Startup XYZ (admin)
--
-- Bob has access to:
--   - Bob's Workspace (personal)
--   - Acme Corp (member)
--
-- Charlie has access to:
--   - Charlie's Workspace (personal)
--   - Startup XYZ (owner)
-- ========================================

do $$
declare
  -- User IDs
  alice_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  bob_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  charlie_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  -- Tenant IDs
  alice_personal_id uuid := '11111111-1111-1111-1111-111111111111';
  bob_personal_id uuid := '22222222-2222-2222-2222-222222222222';
  charlie_personal_id uuid := '33333333-3333-3333-3333-333333333333';
  acme_corp_id uuid := 'aaaacccc-1111-2222-3333-444444444444';
  startup_xyz_id uuid := 'bbbbeee0-5555-6666-7777-888888888888';

  -- Pre-computed bcrypt hash for 'password123'
  -- Generated using bcryptjs with saltRounds=10 for Supabase Auth compatibility
  test_password_hash text := '$2b$10$gyqT4IRmcshCFyAVCDDyJeuAjMSsAJL55L2DA1ITTk507sBhT9sh2';

  demo_now timestamptz := now();
begin

  ---------------------------------------------------------------------------
  -- 1. Create Test Users (Alice, Bob, Charlie)
  ---------------------------------------------------------------------------

  -- Alice Anderson
  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    raw_app_meta_data,
    aud,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change
  ) values (
    alice_id,
    '00000000-0000-0000-0000-000000000000',
    'alice@example.com',
    test_password_hash,
    demo_now,
    demo_now,
    demo_now,
    jsonb_build_object('full_name', 'Alice Anderson'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    ''
  )
  on conflict (id) do update
    set encrypted_password = test_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now,
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change_token_current = '',
        email_change = '';

  -- Bob Builder
  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    raw_app_meta_data,
    aud,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change
  ) values (
    bob_id,
    '00000000-0000-0000-0000-000000000000',
    'bob@example.com',
    test_password_hash,
    demo_now,
    demo_now,
    demo_now,
    jsonb_build_object('full_name', 'Bob Builder'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    ''
  )
  on conflict (id) do update
    set encrypted_password = test_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now,
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change_token_current = '',
        email_change = '';

  -- Charlie Chen
  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    raw_app_meta_data,
    aud,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change
  ) values (
    charlie_id,
    '00000000-0000-0000-0000-000000000000',
    'charlie@example.com',
    test_password_hash,
    demo_now,
    demo_now,
    demo_now,
    jsonb_build_object('full_name', 'Charlie Chen'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    ''
  )
  on conflict (id) do update
    set encrypted_password = test_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now,
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change_token_current = '',
        email_change = '';

  -- Create email identities for test users
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    (gen_random_uuid(), alice_id, 'email', 'alice@example.com',
     jsonb_build_object('sub', 'alice@example.com', 'email', 'alice@example.com'),
     demo_now, demo_now)
  on conflict (provider, provider_id) do update
    set updated_at = demo_now;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    (gen_random_uuid(), bob_id, 'email', 'bob@example.com',
     jsonb_build_object('sub', 'bob@example.com', 'email', 'bob@example.com'),
     demo_now, demo_now)
  on conflict (provider, provider_id) do update
    set updated_at = demo_now;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    (gen_random_uuid(), charlie_id, 'email', 'charlie@example.com',
     jsonb_build_object('sub', 'charlie@example.com', 'email', 'charlie@example.com'),
     demo_now, demo_now)
  on conflict (provider, provider_id) do update
    set updated_at = demo_now;

  raise notice 'Created/updated test users: Alice, Bob, Charlie';

  ---------------------------------------------------------------------------
  -- 2. Create Personal Workspaces
  ---------------------------------------------------------------------------

  insert into copilot_core.tenants (id, name, slug, type, owner_id, plan, created_at, updated_at)
  values
    (alice_personal_id, 'Alice''s Workspace', 'alice-personal', 'personal', alice_id, 'free', demo_now, demo_now),
    (bob_personal_id, 'Bob''s Workspace', 'bob-personal', 'personal', bob_id, 'free', demo_now, demo_now),
    (charlie_personal_id, 'Charlie''s Workspace', 'charlie-personal', 'personal', charlie_id, 'free', demo_now, demo_now)
  on conflict (id) do update
    set name = excluded.name,
        slug = excluded.slug,
        updated_at = demo_now;

  raise notice 'Created/updated personal workspaces for Alice, Bob, Charlie';

  ---------------------------------------------------------------------------
  -- 3. Create Team Workspaces
  ---------------------------------------------------------------------------

  insert into copilot_core.tenants (id, name, slug, type, owner_id, plan, created_at, updated_at)
  values
    (acme_corp_id, 'Acme Corp', 'acme-corp', 'team', alice_id, 'pro', demo_now, demo_now),
    (startup_xyz_id, 'Startup XYZ', 'startup-xyz', 'team', charlie_id, 'pro', demo_now, demo_now)
  on conflict (id) do update
    set name = excluded.name,
        slug = excluded.slug,
        updated_at = demo_now;

  raise notice 'Created/updated team workspaces: Acme Corp, Startup XYZ';

  ---------------------------------------------------------------------------
  -- 4. Create Tenant Memberships
  ---------------------------------------------------------------------------

  -- Personal workspace memberships (owners)
  insert into copilot_core.tenant_memberships (tenant_id, user_id, role, status, joined_at, created_at, updated_at)
  values
    (alice_personal_id, alice_id, 'owner', 'active', demo_now, demo_now, demo_now),
    (bob_personal_id, bob_id, 'owner', 'active', demo_now, demo_now, demo_now),
    (charlie_personal_id, charlie_id, 'owner', 'active', demo_now, demo_now, demo_now)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = demo_now;

  -- Acme Corp memberships (Alice owner, Bob member)
  insert into copilot_core.tenant_memberships (tenant_id, user_id, role, status, joined_at, created_at, updated_at)
  values
    (acme_corp_id, alice_id, 'owner', 'active', demo_now, demo_now, demo_now),
    (acme_corp_id, bob_id, 'member', 'active', demo_now, demo_now, demo_now)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = demo_now;

  -- Startup XYZ memberships (Charlie owner, Alice admin)
  insert into copilot_core.tenant_memberships (tenant_id, user_id, role, status, joined_at, created_at, updated_at)
  values
    (startup_xyz_id, charlie_id, 'owner', 'active', demo_now, demo_now, demo_now),
    (startup_xyz_id, alice_id, 'admin', 'active', demo_now, demo_now, demo_now)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = demo_now;

  raise notice 'Created/updated tenant memberships';

  ---------------------------------------------------------------------------
  -- 5. Set Active Tenants (User Preferences)
  ---------------------------------------------------------------------------

  insert into copilot_core.user_preferences (user_id, current_tenant_id, preferences, created_at, updated_at)
  values
    (alice_id, alice_personal_id, '{}'::jsonb, demo_now, demo_now),
    (bob_id, bob_personal_id, '{}'::jsonb, demo_now, demo_now),
    (charlie_id, charlie_personal_id, '{}'::jsonb, demo_now, demo_now)
  on conflict (user_id) do update
    set current_tenant_id = excluded.current_tenant_id,
        updated_at = demo_now;

  raise notice 'Set active tenants for test users';

  -- Also populate user_tenant_contexts (used by session sync monitoring)
  insert into copilot_core.user_tenant_contexts (user_id, current_tenant_id, updated_at)
  values
    (alice_id, alice_personal_id, demo_now),
    (bob_id, bob_personal_id, demo_now),
    (charlie_id, charlie_personal_id, demo_now)
  on conflict (user_id) do update
    set current_tenant_id = excluded.current_tenant_id,
        updated_at = demo_now;

  raise notice 'Set user tenant contexts for test users';

  ---------------------------------------------------------------------------
  -- 6. Create Sample Conversations
  ---------------------------------------------------------------------------

  -- Alice's personal workspace conversations
  insert into copilot_core.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (alice_personal_id, alice_id, 'Alice Personal Project 1', demo_now - interval '2 days', demo_now),
    (alice_personal_id, alice_id, 'Alice Personal Project 2', demo_now - interval '1 day', demo_now)
  on conflict do nothing;

  -- Bob's personal workspace conversations
  insert into copilot_core.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (bob_personal_id, bob_id, 'Bob Personal Notes', demo_now - interval '3 days', demo_now)
  on conflict do nothing;

  -- Charlie's personal workspace conversations
  insert into copilot_core.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (charlie_personal_id, charlie_id, 'Charlie Ideas', demo_now - interval '1 day', demo_now)
  on conflict do nothing;

  -- Acme Corp conversations (Alice and Bob)
  insert into copilot_core.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (acme_corp_id, alice_id, 'Acme Corp Q1 Strategy', demo_now - interval '5 days', demo_now),
    (acme_corp_id, bob_id, 'Acme Corp Product Roadmap', demo_now - interval '4 days', demo_now),
    (acme_corp_id, alice_id, 'Acme Corp Team Meeting Notes', demo_now - interval '1 day', demo_now)
  on conflict do nothing;

  -- Startup XYZ conversations (Charlie and Alice)
  insert into copilot_core.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (startup_xyz_id, charlie_id, 'Startup XYZ MVP Features', demo_now - interval '6 days', demo_now),
    (startup_xyz_id, alice_id, 'Startup XYZ Investor Pitch', demo_now - interval '2 days', demo_now)
  on conflict do nothing;

  raise notice 'Created sample conversations across all workspaces';

  ---------------------------------------------------------------------------
  -- Summary
  ---------------------------------------------------------------------------
  raise notice '========================================';
  raise notice 'Multi-tenant seed data complete!';
  raise notice '========================================';
  raise notice '';
  raise notice 'Test accounts created:';
  raise notice '  alice@example.com / password123 (3 workspaces)';
  raise notice '  bob@example.com / password123 (2 workspaces)';
  raise notice '  charlie@example.com / password123 (2 workspaces)';
  raise notice '';
  raise notice 'Workspaces created:';
  raise notice '  - 3 personal workspaces';
  raise notice '  - 2 team workspaces (Acme Corp, Startup XYZ)';
  raise notice '';
  raise notice 'Sample conversations: 9 total';
  raise notice '========================================';

end $$;

-- ========================================
-- Compaction Metrics and Cost Analytics Seed Data
-- ========================================

do $$
declare
  demo_user_id uuid;
  demo_tenant_id uuid;
  demo_conv_id uuid;
  alice_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  bob_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  charlie_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  alice_personal_id uuid := '11111111-1111-1111-1111-111111111111';
  bob_personal_id uuid := '22222222-2222-2222-2222-222222222222';
  acme_corp_id uuid := 'aaaacccc-1111-2222-3333-444444444444';
  startup_xyz_id uuid := 'bbbbeee0-5555-6666-7777-888888888888';
  demo_now timestamptz := now();
  alice_conv_id uuid;
  bob_conv_id uuid;
begin

  -- Get demo user and tenant
  select id into demo_user_id
  from auth.users
  where email = 'demo.user@example.com'
  limit 1;

  select id into demo_tenant_id
  from copilot_core.tenants
  where owner_id = demo_user_id
  limit 1;

  -- Get a demo conversation
  select id into demo_conv_id
  from copilot_core.conversations
  where tenant_id = demo_tenant_id
  limit 1;

  -- Get Alice and Bob conversations
  select id into alice_conv_id
  from copilot_core.conversations
  where tenant_id = alice_personal_id
  limit 1;

  select id into bob_conv_id
  from copilot_core.conversations
  where tenant_id = acme_corp_id
  limit 1;

  ---------------------------------------------------------------------------
  -- 1. Seed Compaction Operations
  ---------------------------------------------------------------------------

  -- Add compaction operations for demo conversation
  if demo_conv_id is not null then
    insert into copilot_audit.compaction_operations (
      conversation_id,
      tenant_id,
      user_id,
      strategy,
      triggered_by,
      tokens_before,
      tokens_after,
      messages_before,
      messages_after,
      messages_summarized,
      duration_ms,
      used_llm,
      cost_usd,
      success,
      "timestamp",
      metadata
    )
    values
      (demo_conv_id, demo_tenant_id, demo_user_id, 'semantic', 'manual', 15000, 3600, 50, 12, 38, 2500, true, 0.23, true, demo_now - interval '7 days', jsonb_build_object('provider', 'anthropic', 'model', 'claude-3-sonnet-20240229')),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'semantic', 'auto', 19500, 4500, 65, 15, 50, 3200, true, 0.29, true, demo_now - interval '5 days', jsonb_build_object('provider', 'anthropic', 'model', 'claude-3-sonnet-20240229')),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'aggressive', 'auto', 24000, 5400, 80, 18, 62, 4100, true, 0.12, true, demo_now - interval '3 days', jsonb_build_object('provider', 'anthropic', 'model', 'claude-3-haiku-20240307')),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'semantic', 'manual', 28500, 6000, 95, 20, 75, 4800, true, 0.35, true, demo_now - interval '1 day', jsonb_build_object('provider', 'anthropic', 'model', 'claude-3-sonnet-20240229')),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'aggressive', 'auto', 33000, 6600, 110, 22, 88, 5500, true, 0.15, true, demo_now - interval '12 hours', jsonb_build_object('provider', 'anthropic', 'model', 'claude-3-haiku-20240307'))
    on conflict do nothing;
  end if;

  -- Add compaction operations for Alice's conversations
  if alice_conv_id is not null then
    insert into copilot_audit.compaction_operations (
      conversation_id,
      tenant_id,
      user_id,
      strategy,
      triggered_by,
      tokens_before,
      tokens_after,
      messages_before,
      messages_after,
      messages_summarized,
      duration_ms,
      used_llm,
      cost_usd,
      success,
      "timestamp",
      metadata
    )
    values
      (alice_conv_id, alice_personal_id, alice_id, 'moderate', 'manual', 13500, 3000, 45, 10, 35, 2200, true, 0.18, true, demo_now - interval '4 days', jsonb_build_object('provider', 'openai', 'model', 'gpt-4-turbo')),
      (alice_conv_id, alice_personal_id, alice_id, 'semantic', 'auto', 18000, 3900, 60, 13, 47, 2900, true, 0.24, true, demo_now - interval '2 days', jsonb_build_object('provider', 'openai', 'model', 'gpt-4-turbo'))
    on conflict do nothing;
  end if;

  -- Add compaction operations for Bob's conversations
  if bob_conv_id is not null then
    insert into copilot_audit.compaction_operations (
      conversation_id,
      tenant_id,
      user_id,
      strategy,
      triggered_by,
      tokens_before,
      tokens_after,
      messages_before,
      messages_after,
      messages_summarized,
      duration_ms,
      used_llm,
      cost_usd,
      success,
      "timestamp",
      metadata
    )
    values
      (bob_conv_id, acme_corp_id, bob_id, 'minimal', 'manual', 16500, 4200, 55, 14, 41, 2800, true, 0.09, true, demo_now - interval '6 days', jsonb_build_object('provider', 'anthropic', 'model', 'claude-3-haiku-20240307')),
      (bob_conv_id, acme_corp_id, bob_id, 'moderate', 'auto', 21000, 4800, 70, 16, 54, 3400, true, 0.11, true, demo_now - interval '3 days', jsonb_build_object('provider', 'anthropic', 'model', 'claude-3-haiku-20240307'))
    on conflict do nothing;
  end if;

  ---------------------------------------------------------------------------
  -- 2. Seed LLM Cost Records
  ---------------------------------------------------------------------------

  -- Add LLM cost records for demo conversations
  if demo_conv_id is not null then
    insert into copilot_billing.llm_cost_records (
      conversation_id,
      tenant_id,
      user_id,
      provider,
      model,
      input_tokens,
      output_tokens,
      total_tokens,
      input_cost_usd,
      output_cost_usd,
      total_cost_usd,
      task,
      "timestamp"
    )
    values
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-sonnet-20240229', 1200, 450, 1650, 0.018, 0.010, 0.028, 'chat', demo_now - interval '8 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-sonnet-20240229', 2500, 800, 3300, 0.038, 0.017, 0.055, 'chat', demo_now - interval '7 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-haiku-20240307', 3200, 1100, 4300, 0.012, 0.013, 0.025, 'chat', demo_now - interval '6 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-sonnet-20240229', 1800, 600, 2400, 0.027, 0.015, 0.042, 'chat', demo_now - interval '5 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-haiku-20240307', 2800, 950, 3750, 0.010, 0.012, 0.022, 'chat', demo_now - interval '4 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-sonnet-20240229', 2200, 750, 2950, 0.033, 0.018, 0.051, 'chat', demo_now - interval '3 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-haiku-20240307', 3500, 1200, 4700, 0.013, 0.015, 0.028, 'chat', demo_now - interval '2 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-sonnet-20240229', 1900, 650, 2550, 0.029, 0.015, 0.044, 'chat', demo_now - interval '1 day'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'anthropic', 'claude-3-haiku-20240307', 4200, 1400, 5600, 0.015, 0.018, 0.033, 'chat', demo_now - interval '12 hours')
    on conflict do nothing;
  end if;

  -- Add LLM cost records for Alice
  if alice_conv_id is not null then
    insert into copilot_billing.llm_cost_records (
      conversation_id,
      tenant_id,
      user_id,
      provider,
      model,
      input_tokens,
      output_tokens,
      total_tokens,
      input_cost_usd,
      output_cost_usd,
      total_cost_usd,
      task,
      "timestamp"
    )
    values
      (alice_conv_id, alice_personal_id, alice_id, 'openai', 'gpt-4-turbo', 1500, 500, 2000, 0.023, 0.012, 0.035, 'chat', demo_now - interval '5 days'),
      (alice_conv_id, alice_personal_id, alice_id, 'openai', 'gpt-4-turbo', 2100, 700, 2800, 0.032, 0.017, 0.049, 'chat', demo_now - interval '4 days'),
      (alice_conv_id, alice_personal_id, alice_id, 'openai', 'gpt-3.5-turbo', 3200, 1100, 4300, 0.005, 0.007, 0.012, 'chat', demo_now - interval '3 days'),
      (alice_conv_id, alice_personal_id, alice_id, 'openai', 'gpt-4-turbo', 1800, 600, 2400, 0.027, 0.015, 0.042, 'chat', demo_now - interval '2 days')
    on conflict do nothing;
  end if;

  -- Add LLM cost records for Bob
  if bob_conv_id is not null then
    insert into copilot_billing.llm_cost_records (
      conversation_id,
      tenant_id,
      user_id,
      provider,
      model,
      input_tokens,
      output_tokens,
      total_tokens,
      input_cost_usd,
      output_cost_usd,
      total_cost_usd,
      task,
      "timestamp"
    )
    values
      (bob_conv_id, acme_corp_id, bob_id, 'anthropic', 'claude-3-haiku-20240307', 2800, 950, 3750, 0.010, 0.012, 0.022, 'chat', demo_now - interval '6 days'),
      (bob_conv_id, acme_corp_id, bob_id, 'anthropic', 'claude-3-haiku-20240307', 3100, 1050, 4150, 0.011, 0.013, 0.024, 'chat', demo_now - interval '4 days'),
      (bob_conv_id, acme_corp_id, bob_id, 'anthropic', 'claude-3-haiku-20240307', 2500, 850, 3350, 0.009, 0.010, 0.019, 'chat', demo_now - interval '2 days')
    on conflict do nothing;
  end if;

  ---------------------------------------------------------------------------
  -- 3. Seed E2B Cost Records
  ---------------------------------------------------------------------------

  -- Add E2B cost records for demo conversations
  if demo_conv_id is not null then
    insert into copilot_billing.e2b_cost_records (
      conversation_id,
      tenant_id,
      user_id,
      sandbox_id,
      execution_time_seconds,
      execution_cost_usd,
      resource_cost_usd,
      total_cost_usd,
      tier,
      "timestamp"
    )
    values
      (demo_conv_id, demo_tenant_id, demo_user_id, 'sbx_' || gen_random_uuid()::text, 180, 0.015, 0.003, 0.018, 'basic', demo_now - interval '7 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'sbx_' || gen_random_uuid()::text, 300, 0.025, 0.005, 0.030, 'standard', demo_now - interval '6 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'sbx_' || gen_random_uuid()::text, 420, 0.035, 0.007, 0.042, 'standard', demo_now - interval '5 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'sbx_' || gen_random_uuid()::text, 600, 0.050, 0.010, 0.060, 'standard', demo_now - interval '4 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'sbx_' || gen_random_uuid()::text, 240, 0.020, 0.004, 0.024, 'basic', demo_now - interval '3 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'sbx_' || gen_random_uuid()::text, 360, 0.030, 0.006, 0.036, 'standard', demo_now - interval '2 days'),
      (demo_conv_id, demo_tenant_id, demo_user_id, 'sbx_' || gen_random_uuid()::text, 480, 0.040, 0.008, 0.048, 'standard', demo_now - interval '1 day')
    on conflict do nothing;
  end if;

  -- Add E2B cost records for Alice
  if alice_conv_id is not null then
    insert into copilot_billing.e2b_cost_records (
      conversation_id,
      tenant_id,
      user_id,
      sandbox_id,
      execution_time_seconds,
      execution_cost_usd,
      resource_cost_usd,
      total_cost_usd,
      tier,
      "timestamp"
    )
    values
      (alice_conv_id, alice_personal_id, alice_id, 'sbx_' || gen_random_uuid()::text, 300, 0.025, 0.005, 0.030, 'standard', demo_now - interval '5 days'),
      (alice_conv_id, alice_personal_id, alice_id, 'sbx_' || gen_random_uuid()::text, 420, 0.035, 0.007, 0.042, 'standard', demo_now - interval '3 days'),
      (alice_conv_id, alice_personal_id, alice_id, 'sbx_' || gen_random_uuid()::text, 180, 0.015, 0.003, 0.018, 'basic', demo_now - interval '1 day')
    on conflict do nothing;
  end if;

  -- Add E2B cost records for Bob
  if bob_conv_id is not null then
    insert into copilot_billing.e2b_cost_records (
      conversation_id,
      tenant_id,
      user_id,
      sandbox_id,
      execution_time_seconds,
      execution_cost_usd,
      resource_cost_usd,
      total_cost_usd,
      tier,
      "timestamp"
    )
    values
      (bob_conv_id, acme_corp_id, bob_id, 'sbx_' || gen_random_uuid()::text, 360, 0.030, 0.006, 0.036, 'standard', demo_now - interval '4 days'),
      (bob_conv_id, acme_corp_id, bob_id, 'sbx_' || gen_random_uuid()::text, 240, 0.020, 0.004, 0.024, 'basic', demo_now - interval '2 days')
    on conflict do nothing;
  end if;

  raise notice '========================================';
  raise notice 'Compaction & Cost Analytics Seed Data Complete!';
  raise notice '========================================';
  raise notice '';
  raise notice 'Created:';
  raise notice '  - Compaction operations: ~9 records';
  raise notice '  - LLM cost records: ~16 records';
  raise notice '  - E2B cost records: ~12 records';
  raise notice '';
  raise notice 'Sample data spans 8 days across multiple';
  raise notice 'tenants and users for realistic testing.';
  raise notice '========================================';

end $$;

-- ========================================
-- Admin Users for Copilot Admin App
-- ========================================
-- Creates admin users with different roles for testing the
-- Hybrid RBAC permission system in the copilot-admin app.
--
-- Admin credentials (all use same password as demo users):
--   admin@example.com / Password123! (super_admin)
--   platform.engineer@example.com / Password123! (platform_engineer)
--   account.manager@example.com / Password123! (account_manager)
--   compliance.auditor@example.com / Password123! (compliance_auditor)
--   support.tier3@example.com / Password123! (support_tier_3)
--   support.tier2@example.com / Password123! (support_tier_2)
--   support.tier1@example.com / Password123! (support_tier_1)
--   viewer@example.com / Password123! (viewer)
-- ========================================

do $$
declare
  -- Admin User IDs
  admin_super_id uuid := 'ad000000-0000-0000-0000-000000000001';
  admin_platform_id uuid := 'ad000000-0000-0000-0000-000000000002';
  admin_account_id uuid := 'ad000000-0000-0000-0000-000000000003';
  admin_compliance_id uuid := 'ad000000-0000-0000-0000-000000000004';
  admin_t3_id uuid := 'ad000000-0000-0000-0000-000000000005';
  admin_t2_id uuid := 'ad000000-0000-0000-0000-000000000006';
  admin_t1_id uuid := 'ad000000-0000-0000-0000-000000000007';
  admin_viewer_id uuid := 'ad000000-0000-0000-0000-000000000008';

  -- Tenant IDs (from multi-tenant seed)
  acme_corp_id uuid := 'aaaacccc-1111-2222-3333-444444444444';
  startup_xyz_id uuid := 'bbbbeee0-5555-6666-7777-888888888888';

  -- Pre-computed bcrypt hash for 'Password123!'
  admin_password_hash text := '$2b$10$dFyws4yGmOsWeYY7FxFXeOhat4R6UmwWnGbj8xP//5fMmaGn7Iq6y';

  demo_now timestamptz := now();
begin

  ---------------------------------------------------------------------------
  -- 1. Create Admin Auth Users
  ---------------------------------------------------------------------------

  -- Super Admin
  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    raw_app_meta_data,
    aud,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change
  ) values (
    admin_super_id,
    '00000000-0000-0000-0000-000000000000',
    'admin@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '90 days',
    demo_now,
    jsonb_build_object('full_name', 'Platform Admin', 'admin_role', 'super_admin'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Platform Engineer
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data, aud, role,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change
  ) values (
    admin_platform_id,
    '00000000-0000-0000-0000-000000000000',
    'platform.engineer@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '60 days',
    demo_now,
    jsonb_build_object('full_name', 'Sarah Engineer', 'admin_role', 'platform_engineer'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Account Manager
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data, aud, role,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change
  ) values (
    admin_account_id,
    '00000000-0000-0000-0000-000000000000',
    'account.manager@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '45 days',
    demo_now,
    jsonb_build_object('full_name', 'John Doe', 'admin_role', 'account_manager'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Compliance Auditor
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data, aud, role,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change
  ) values (
    admin_compliance_id,
    '00000000-0000-0000-0000-000000000000',
    'compliance.auditor@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '30 days',
    demo_now,
    jsonb_build_object('full_name', 'Maria Garcia', 'admin_role', 'compliance_auditor'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Support Tier 3
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data, aud, role,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change
  ) values (
    admin_t3_id,
    '00000000-0000-0000-0000-000000000000',
    'support.tier3@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '20 days',
    demo_now,
    jsonb_build_object('full_name', 'David Wilson', 'admin_role', 'support_tier_3'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Support Tier 2
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data, aud, role,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change
  ) values (
    admin_t2_id,
    '00000000-0000-0000-0000-000000000000',
    'support.tier2@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '15 days',
    demo_now,
    jsonb_build_object('full_name', 'Bob Wilson', 'admin_role', 'support_tier_2'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Support Tier 1
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data, aud, role,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change
  ) values (
    admin_t1_id,
    '00000000-0000-0000-0000-000000000000',
    'support.tier1@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '10 days',
    demo_now,
    jsonb_build_object('full_name', 'Jane Smith', 'admin_role', 'support_tier_1'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Viewer
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data, aud, role,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change
  ) values (
    admin_viewer_id,
    '00000000-0000-0000-0000-000000000000',
    'viewer@example.com',
    admin_password_hash,
    demo_now,
    demo_now - interval '5 days',
    demo_now,
    jsonb_build_object('full_name', 'Alex Viewer', 'admin_role', 'viewer'),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = admin_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Create email identities for admin users
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    (gen_random_uuid(), admin_super_id, 'email', 'admin@example.com', jsonb_build_object('sub', 'admin@example.com', 'email', 'admin@example.com'), demo_now, demo_now),
    (gen_random_uuid(), admin_platform_id, 'email', 'platform.engineer@example.com', jsonb_build_object('sub', 'platform.engineer@example.com', 'email', 'platform.engineer@example.com'), demo_now, demo_now),
    (gen_random_uuid(), admin_account_id, 'email', 'account.manager@example.com', jsonb_build_object('sub', 'account.manager@example.com', 'email', 'account.manager@example.com'), demo_now, demo_now),
    (gen_random_uuid(), admin_compliance_id, 'email', 'compliance.auditor@example.com', jsonb_build_object('sub', 'compliance.auditor@example.com', 'email', 'compliance.auditor@example.com'), demo_now, demo_now),
    (gen_random_uuid(), admin_t3_id, 'email', 'support.tier3@example.com', jsonb_build_object('sub', 'support.tier3@example.com', 'email', 'support.tier3@example.com'), demo_now, demo_now),
    (gen_random_uuid(), admin_t2_id, 'email', 'support.tier2@example.com', jsonb_build_object('sub', 'support.tier2@example.com', 'email', 'support.tier2@example.com'), demo_now, demo_now),
    (gen_random_uuid(), admin_t1_id, 'email', 'support.tier1@example.com', jsonb_build_object('sub', 'support.tier1@example.com', 'email', 'support.tier1@example.com'), demo_now, demo_now),
    (gen_random_uuid(), admin_viewer_id, 'email', 'viewer@example.com', jsonb_build_object('sub', 'viewer@example.com', 'email', 'viewer@example.com'), demo_now, demo_now)
  on conflict (provider, provider_id) do update
    set updated_at = demo_now;

  raise notice 'Created admin auth users';

  ---------------------------------------------------------------------------
  -- 2. Create Admin User Profiles
  ---------------------------------------------------------------------------

  insert into copilot_core.platform_admins (
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
  values
    -- Super Admin - full access
    (admin_super_id, 'admin@example.com', 'Platform Admin', 'super_admin', 'active', null, '{}', demo_now - interval '90 days', demo_now, demo_now - interval '1 hour'),
    -- Platform Engineer - infrastructure access
    (admin_platform_id, 'platform.engineer@example.com', 'Sarah Engineer', 'platform_engineer', 'active', null, '{}', demo_now - interval '60 days', demo_now, demo_now - interval '2 hours'),
    -- Account Manager - scoped to Acme Corp
    (admin_account_id, 'account.manager@example.com', 'John Doe', 'account_manager', 'active', acme_corp_id, '{}', demo_now - interval '45 days', demo_now, demo_now - interval '3 hours'),
    -- Compliance Auditor - audit access
    (admin_compliance_id, 'compliance.auditor@example.com', 'Maria Garcia', 'compliance_auditor', 'pending', null, '{}', demo_now - interval '30 days', demo_now, null),
    -- Support Tier 3 - engineering support with cross-tenant
    (admin_t3_id, 'support.tier3@example.com', 'David Wilson', 'support_tier_3', 'active', null, array[acme_corp_id, startup_xyz_id], demo_now - interval '20 days', demo_now, demo_now - interval '4 hours'),
    -- Support Tier 2 - escalation with cross-tenant
    (admin_t2_id, 'support.tier2@example.com', 'Bob Wilson', 'support_tier_2', 'active', null, array[acme_corp_id, startup_xyz_id], demo_now - interval '15 days', demo_now, demo_now - interval '6 hours'),
    -- Support Tier 1 - frontline with limited tenants
    (admin_t1_id, 'support.tier1@example.com', 'Jane Smith', 'support_tier_1', 'active', null, array[acme_corp_id], demo_now - interval '10 days', demo_now, demo_now - interval '8 hours'),
    -- Viewer - read-only
    (admin_viewer_id, 'viewer@example.com', 'Alex Viewer', 'viewer', 'active', acme_corp_id, '{}', demo_now - interval '5 days', demo_now, demo_now - interval '12 hours')
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        role = excluded.role,
        status = excluded.status,
        tenant_id = excluded.tenant_id,
        assigned_tenant_ids = excluded.assigned_tenant_ids,
        updated_at = demo_now,
        last_login = excluded.last_login;

  raise notice 'Created admin user profiles';

  ---------------------------------------------------------------------------
  -- 3. Create Sample Permission Configurations
  ---------------------------------------------------------------------------

  -- Support Tier 2 with additional data export group
  insert into copilot_core.platform_admin_permissions (
    user_id,
    additional_groups,
    permission_grants,
    permission_revocations,
    updated_by,
    reason
  )
  values (
    admin_t2_id,
    array['data_export'],
    array[]::text[],
    array[]::text[],
    admin_super_id,
    'Granted data export for Q4 audit support'
  )
  on conflict (user_id) do update
    set additional_groups = excluded.additional_groups,
        reason = excluded.reason,
        updated_by = excluded.updated_by,
        updated_at = now();

  -- Support Tier 1 with specific permission grant
  insert into copilot_core.platform_admin_permissions (
    user_id,
    additional_groups,
    permission_grants,
    permission_revocations,
    updated_by,
    reason
  )
  values (
    admin_t1_id,
    array[]::text[],
    array['conversations.annotate'],
    array[]::text[],
    admin_super_id,
    'Granted annotation capability for training purposes'
  )
  on conflict (user_id) do update
    set permission_grants = excluded.permission_grants,
        reason = excluded.reason,
        updated_by = excluded.updated_by,
        updated_at = now();

  raise notice 'Created sample permission configurations';

  ---------------------------------------------------------------------------
  -- Summary
  ---------------------------------------------------------------------------
  raise notice '========================================';
  raise notice 'Admin Users Seed Data Complete!';
  raise notice '========================================';
  raise notice '';
  raise notice 'Admin accounts created (Password123!):';
  raise notice '  admin@example.com (super_admin)';
  raise notice '  platform.engineer@example.com (platform_engineer)';
  raise notice '  account.manager@example.com (account_manager)';
  raise notice '  compliance.auditor@example.com (compliance_auditor)';
  raise notice '  support.tier3@example.com (support_tier_3)';
  raise notice '  support.tier2@example.com (support_tier_2)';
  raise notice '  support.tier1@example.com (support_tier_1)';
  raise notice '  viewer@example.com (viewer)';
  raise notice '';
  raise notice 'Permission config samples: 2';
  raise notice '  - T2 with data_export group';
  raise notice '  - T1 with conversations.annotate grant';
  raise notice '========================================';

end $$;
