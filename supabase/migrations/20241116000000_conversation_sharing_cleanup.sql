alter table copilot_internal.conversations
  drop column if exists is_shared;

create or replace view public.conversations_view as
  select id,
         tenant_id,
         user_id,
         sharing_mode,
         sharing_mode <> 'private' as is_shared,
         access_model,
         access_control,
         title,
         persona_id,
         jurisdictions,
         created_at,
         updated_at,
         last_message_at
  from copilot_internal.conversations;
