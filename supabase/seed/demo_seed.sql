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

  demo_password_hash text := '$2b$06$kPdMymWM7GkrHql.BwroSu1e8wuh5q.KqLLZjP.FctnqV.tii7dGq';
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
      raw_user_meta_data
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
      )
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
           )
     where id = demo_user_id;
  end if;

  ---------------------------------------------------------------------------
  -- 2. Create/update personal tenant for demo user (NEW: Multi-tenant architecture)
  ---------------------------------------------------------------------------
  -- Check if tenant exists
  perform 1
    from copilot_internal.tenants
   where id = demo_tenant_id;

  if not found then
    -- Create personal tenant
    insert into copilot_internal.tenants (
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
  insert into copilot_internal.tenant_memberships (
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
  insert into copilot_internal.user_preferences (
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
  insert into copilot_internal.personas (id, label, description, jurisdictions)
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
  insert into copilot_internal.quick_prompts (
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
    from copilot_internal.conversations c
   where c.tenant_id = demo_tenant_id
     and c.user_id = demo_user_id
     and c.title = demo_conversation_title
   order by c.created_at asc
   limit 1;

  if not found then
    insert into copilot_internal.conversations (
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
    from copilot_internal.conversation_paths p
   where p.conversation_id = demo_conv_id
     and p.is_primary = true
   order by p.created_at asc
   limit 1;

  if not found then
    insert into copilot_internal.conversation_paths (
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
  delete from copilot_internal.conversation_messages
   where conversation_id = demo_conv_id;

  insert into copilot_internal.conversation_messages (
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
  insert into copilot_internal.conversation_contexts (
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
  -- Generated using bcryptjs with saltRounds=6 for consistency with demo user
  test_password_hash text := '$2b$06$PQS.8RLKqtXK0LZjCZy9muBBvQxGlEI7xVKqL8mGvQR2Z7WCVz7Su';

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
    role
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
    'authenticated'
  )
  on conflict (id) do update
    set encrypted_password = test_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

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
    role
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
    'authenticated'
  )
  on conflict (id) do update
    set encrypted_password = test_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

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
    role
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
    'authenticated'
  )
  on conflict (id) do update
    set encrypted_password = test_password_hash,
        email_confirmed_at = demo_now,
        updated_at = demo_now;

  -- Create email identities for test users
  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values
    (gen_random_uuid(), alice_id, 'email', 'alice@example.com',
     jsonb_build_object('sub', 'alice@example.com', 'email', 'alice@example.com'))
  on conflict (provider, provider_id) do nothing;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values
    (gen_random_uuid(), bob_id, 'email', 'bob@example.com',
     jsonb_build_object('sub', 'bob@example.com', 'email', 'bob@example.com'))
  on conflict (provider, provider_id) do nothing;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values
    (gen_random_uuid(), charlie_id, 'email', 'charlie@example.com',
     jsonb_build_object('sub', 'charlie@example.com', 'email', 'charlie@example.com'))
  on conflict (provider, provider_id) do nothing;

  raise notice 'Created/updated test users: Alice, Bob, Charlie';

  ---------------------------------------------------------------------------
  -- 2. Create Personal Workspaces
  ---------------------------------------------------------------------------

  insert into copilot_internal.tenants (id, name, slug, type, owner_id, plan, created_at, updated_at)
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

  insert into copilot_internal.tenants (id, name, slug, type, owner_id, plan, created_at, updated_at)
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
  insert into copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at, created_at, updated_at)
  values
    (alice_personal_id, alice_id, 'owner', 'active', demo_now, demo_now, demo_now),
    (bob_personal_id, bob_id, 'owner', 'active', demo_now, demo_now, demo_now),
    (charlie_personal_id, charlie_id, 'owner', 'active', demo_now, demo_now, demo_now)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = demo_now;

  -- Acme Corp memberships (Alice owner, Bob member)
  insert into copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at, created_at, updated_at)
  values
    (acme_corp_id, alice_id, 'owner', 'active', demo_now, demo_now, demo_now),
    (acme_corp_id, bob_id, 'member', 'active', demo_now, demo_now, demo_now)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = demo_now;

  -- Startup XYZ memberships (Charlie owner, Alice admin)
  insert into copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at, created_at, updated_at)
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

  insert into copilot_internal.user_preferences (user_id, current_tenant_id, preferences, created_at, updated_at)
  values
    (alice_id, alice_personal_id, '{}'::jsonb, demo_now, demo_now),
    (bob_id, bob_personal_id, '{}'::jsonb, demo_now, demo_now),
    (charlie_id, charlie_personal_id, '{}'::jsonb, demo_now, demo_now)
  on conflict (user_id) do update
    set current_tenant_id = excluded.current_tenant_id,
        updated_at = demo_now;

  raise notice 'Set active tenants for test users';

  ---------------------------------------------------------------------------
  -- 6. Create Sample Conversations
  ---------------------------------------------------------------------------

  -- Alice's personal workspace conversations
  insert into copilot_internal.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (alice_personal_id, alice_id, 'Alice Personal Project 1', demo_now - interval '2 days', demo_now),
    (alice_personal_id, alice_id, 'Alice Personal Project 2', demo_now - interval '1 day', demo_now)
  on conflict do nothing;

  -- Bob's personal workspace conversations
  insert into copilot_internal.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (bob_personal_id, bob_id, 'Bob Personal Notes', demo_now - interval '3 days', demo_now)
  on conflict do nothing;

  -- Charlie's personal workspace conversations
  insert into copilot_internal.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (charlie_personal_id, charlie_id, 'Charlie Ideas', demo_now - interval '1 day', demo_now)
  on conflict do nothing;

  -- Acme Corp conversations (Alice and Bob)
  insert into copilot_internal.conversations (tenant_id, user_id, title, created_at, updated_at)
  values
    (acme_corp_id, alice_id, 'Acme Corp Q1 Strategy', demo_now - interval '5 days', demo_now),
    (acme_corp_id, bob_id, 'Acme Corp Product Roadmap', demo_now - interval '4 days', demo_now),
    (acme_corp_id, alice_id, 'Acme Corp Team Meeting Notes', demo_now - interval '1 day', demo_now)
  on conflict do nothing;

  -- Startup XYZ conversations (Charlie and Alice)
  insert into copilot_internal.conversations (tenant_id, user_id, title, created_at, updated_at)
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
