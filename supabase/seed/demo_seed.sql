do $$
declare
  demo_email text := 'demo.user@example.com';
  demo_password text := 'Password123!';
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
      crypt(demo_password, gen_salt('bf')),
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
       set encrypted_password = crypt(demo_password, gen_salt('bf')),
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
  -- 2. Ensure an email identity exists (with provider_id)
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
  -- 3. Seed personas (idempotent)
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
  -- 4. Seed quick prompts (idempotent)
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
  -- 5. Ensure demo conversation exists
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
  -- 6. Ensure a primary path exists for the demo conversation
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
  -- 7. Seed demo messages with valid path_id
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
  -- 8. Seed / refresh conversation context
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
