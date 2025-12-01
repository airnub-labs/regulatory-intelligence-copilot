do $$
declare
  demo_email text := 'demo.user@example.com';
  demo_password text := 'Password123!';
  demo_full_name text := 'Demo User';
  seeded_user record;
  demo_tenant_id uuid := coalesce(nullif(current_setting('app.demo_tenant_id', true), '')::uuid, gen_random_uuid());
begin
  insert into auth.users (email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values (
    demo_email,
    crypt(demo_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'tenant_id', demo_tenant_id),
    jsonb_build_object('tenant_id', demo_tenant_id, 'full_name', demo_full_name)
  )
  on conflict (email) do update
    set encrypted_password = excluded.encrypted_password,
        email_confirmed_at = excluded.email_confirmed_at,
        raw_app_meta_data = excluded.raw_app_meta_data,
        raw_user_meta_data = excluded.raw_user_meta_data
  returning id, raw_user_meta_data
  into seeded_user;

  -- Keep the tenant ID in sync even if the user already existed
  demo_tenant_id := coalesce((seeded_user.raw_user_meta_data ->> 'tenant_id')::uuid, demo_tenant_id);

  insert into auth.identities (user_id, identity_data, provider, provider_id, last_sign_in_at)
  values (
    seeded_user.id,
    jsonb_build_object('sub', seeded_user.id, 'email', demo_email),
    'email',
    demo_email,
    now()
  )
  on conflict (provider, provider_id) do update
    set last_sign_in_at = excluded.last_sign_in_at,
        updated_at = now(),
        identity_data = excluded.identity_data;

  -- Demo conversation tied to the seeded user
  with demo_conv as (
    insert into copilot_internal.conversations (tenant_id, user_id, share_audience, tenant_access, title, persona_id, jurisdictions)
    values (demo_tenant_id, seeded_user.id, 'tenant', 'edit', 'Demo conversation', 'single-director-ie', array['IE'])
    on conflict do nothing
    returning id
  )
  insert into copilot_internal.conversation_messages (conversation_id, tenant_id, user_id, role, content, metadata)
  select id, demo_tenant_id, seeded_user.id, 'user', 'How do PAYE and PRSI interact for a single-director company?', null from demo_conv
  union all
  select id, demo_tenant_id, null, 'assistant', 'Here is how PAYE and PRSI interact...', jsonb_build_object('jurisdictions', array['IE']) from demo_conv;

  raise notice 'Seeded demo user with id % and tenant id %', seeded_user.id, demo_tenant_id;
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
