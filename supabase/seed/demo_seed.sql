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

-- Demo conversation
with demo_conv as (
  insert into copilot_internal.conversations (tenant_id, user_id, title, persona_id, jurisdictions)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Demo conversation', 'single-director-ie', array['IE'])
  on conflict do nothing
  returning id
)
insert into copilot_internal.conversation_messages (conversation_id, tenant_id, user_id, role, content, metadata)
select id, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'user', 'How do PAYE and PRSI interact for a single-director company?', null from demo_conv
union all
select id, '00000000-0000-0000-0000-000000000001', null, 'assistant', 'Here is how PAYE and PRSI interact...', jsonb_build_object('jurisdictions', array['IE']) from demo_conv;
