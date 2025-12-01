alter table copilot_internal.conversations
  add column if not exists access_model text not null default 'legacy_sharing' check (access_model in ('legacy_sharing','external_rebac')),
  add column if not exists access_control jsonb null;

create or replace view public.conversations_view as
  select id, tenant_id, user_id, sharing_mode, is_shared, access_model, access_control, title, persona_id, jurisdictions, created_at, updated_at, last_message_at
  from copilot_internal.conversations;
