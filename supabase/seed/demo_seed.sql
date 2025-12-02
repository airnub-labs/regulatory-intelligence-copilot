do $$
declare
  demo_email text := 'demo.user@example.com';
  demo_password text := 'Password123!';
  demo_full_name text := 'Demo User';
  seeded_user record;
  demo_conv_id uuid;
  demo_conversation_title text := 'Demo conversation';
  demo_user_id uuid;
  demo_tenant_id uuid := coalesce(nullif(current_setting('app.demo_tenant_id', true), '')::uuid, gen_random_uuid());
begin
  select id, raw_user_meta_data
    into seeded_user
    from auth.users
   where email = demo_email
   limit 1;

  if not found then
    demo_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
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
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email'], 'tenant_id', demo_tenant_id),
      jsonb_build_object(
        'tenant_id', demo_tenant_id,
        'full_name', demo_full_name,
        'email_verified', true,
        'phone_verified', false
      )
    )
    returning id, raw_user_meta_data
    into seeded_user;
  else
    demo_user_id := seeded_user.id;

    update auth.users
       set encrypted_password = crypt(demo_password, gen_salt('bf')),
           instance_id = '00000000-0000-0000-0000-000000000000',
           aud = 'authenticated',
           role = 'authenticated',
           email_confirmed_at = now(),
           raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email'], 'tenant_id', demo_tenant_id),
           raw_user_meta_data = jsonb_build_object(
             'tenant_id', demo_tenant_id,
             'full_name', demo_full_name,
             'email_verified', true,
             'phone_verified', false
           )
     where id = seeded_user.id
    returning id, raw_user_meta_data
      into seeded_user;
  end if;

  demo_user_id := coalesce(demo_user_id, seeded_user.id);

  -- Keep the tenant ID in sync even if the user already existed
  demo_tenant_id := coalesce((seeded_user.raw_user_meta_data ->> 'tenant_id')::uuid, demo_tenant_id);

  -- Supabase manages indexes on auth.identities. To avoid privilege errors
  -- from creating a unique index ourselves, perform an explicit delete/insert
  -- so the seed is idempotent without relying on ON CONFLICT.
  delete from auth.identities
   where provider = 'email' and provider_id = demo_email;

  insert into auth.identities (user_id, identity_data, provider, provider_id, last_sign_in_at)
  values (
    demo_user_id,
    jsonb_build_object('sub', demo_user_id, 'email', demo_email),
    'email',
    demo_email,
    now()
  );

  -- Demo conversation tied to the seeded user
  select id
    into demo_conv_id
    from copilot_internal.conversations
   where tenant_id = demo_tenant_id
     and user_id = demo_user_id
     and title = demo_conversation_title
   order by created_at asc
   limit 1;

  if not found then
    insert into copilot_internal.conversations (tenant_id, user_id, share_audience, tenant_access, title, persona_id, jurisdictions)
    values (demo_tenant_id, demo_user_id, 'tenant', 'edit', demo_conversation_title, 'single-director-ie', array['IE'])
    returning id into demo_conv_id;
  end if;

  delete from copilot_internal.conversation_messages
   where conversation_id = demo_conv_id;

  insert into copilot_internal.conversation_messages (conversation_id, tenant_id, user_id, role, content, metadata)
  values
    (demo_conv_id, demo_tenant_id, demo_user_id, 'user', 'How do PAYE and PRSI interact for a single-director company?', null),
    (demo_conv_id, demo_tenant_id, null, 'assistant', 'Here is how PAYE and PRSI interact...', jsonb_build_object('jurisdictions', array['IE']));

  raise notice 'Seeded demo user with id % and tenant id %', demo_user_id, demo_tenant_id;
end $$;

insert into copilot_internal.personas (id, label, description, jurisdictions)
values
  ('single-director-ie', 'Single director company (IE)', 'Owner/director of an Irish limited company', array['IE'])
  on conflict (id) do update set label = excluded.label, description = excluded.description, jurisdictions = excluded.jurisdictions;

insert into copilot_internal.personas (id, label, description, jurisdictions)
values
  ('self-employed-contractor-ie', 'Self-employed contractor (IE)', 'Independent contractor in Ireland', array['IE'])
  on conflict (id) do update set label = excluded.label, description = excluded.description, jurisdictions = excluded.jurisdictions;

insert into copilot_internal.personas (id, label, description, jurisdictions)
values
  ('paye-eu-ties', 'PAYE employee with EU ties', 'Employee working in IE with EU tax/social security touchpoints', array['IE','EU'])
  on conflict (id) do update set label = excluded.label, description = excluded.description, jurisdictions = excluded.jurisdictions;

insert into copilot_internal.personas (id, label, description, jurisdictions)
values
  ('cross-border-ie-eu', 'Cross-border IE–EU worker', 'Works between Ireland and another EU country', array['IE','EU'])
  on conflict (id) do update set label = excluded.label, description = excluded.description, jurisdictions = excluded.jurisdictions;

insert into copilot_internal.quick_prompts (id, label, prompt, scenario_hint, persona_filter, jurisdictions)
values
  ('graph_welfare_prsi_jobseekers_benefit', 'Graph + welfare', 'Show me how PRSI contributions and jobseeker’s benefit interact for this persona.', 'graph_welfare_prsi_jobseekers_benefit', array['single-director-ie','self-employed-contractor-ie'], array['IE'])
  on conflict (id) do update set label = excluded.label, prompt = excluded.prompt, scenario_hint = excluded.scenario_hint, persona_filter = excluded.persona_filter, jurisdictions = excluded.jurisdictions;

insert into copilot_internal.quick_prompts (id, label, prompt, scenario_hint, persona_filter, jurisdictions)
values
  ('graph_tax_cgt_recent_changes', 'Graph + tax + CGT', 'Summarise PAYE, USC, and PRSI obligations for this persona and highlight any graph nodes with recent changes.', 'graph_tax_cgt_recent_changes', null, array['IE'])
  on conflict (id) do update set label = excluded.label, prompt = excluded.prompt, scenario_hint = excluded.scenario_hint, persona_filter = excluded.persona_filter, jurisdictions = excluded.jurisdictions;

insert into copilot_internal.quick_prompts (id, label, prompt, scenario_hint, persona_filter, jurisdictions)
values
  ('timeline_pension_contribution_limits', 'Timeline engine', 'Explain how pension contribution limits for this persona change over the next 5 years, based on the regulatory timeline.', 'timeline_pension_contribution_limits', null, array['IE'])
  on conflict (id) do update set label = excluded.label, prompt = excluded.prompt, scenario_hint = excluded.scenario_hint, persona_filter = excluded.persona_filter, jurisdictions = excluded.jurisdictions;

insert into copilot_internal.quick_prompts (id, label, prompt, scenario_hint, persona_filter, jurisdictions)
values
  ('cross_border_social_security_coordination', 'Cross-border / scenario engine', 'Outline social security coordination rules if this persona starts working remotely from another EU country.', 'cross_border_social_security_coordination', null, array['IE','EU'])
  on conflict (id) do update set label = excluded.label, prompt = excluded.prompt, scenario_hint = excluded.scenario_hint, persona_filter = excluded.persona_filter, jurisdictions = excluded.jurisdictions;
