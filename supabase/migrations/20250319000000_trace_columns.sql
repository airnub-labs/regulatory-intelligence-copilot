-- Add trace identifiers to conversations and messages
alter table if exists copilot_internal.conversations
  add column if not exists trace_id text null,
  add column if not exists root_span_name text null,
  add column if not exists root_span_id text null;

alter table if exists copilot_internal.conversation_messages
  add column if not exists trace_id text null,
  add column if not exists root_span_name text null,
  add column if not exists root_span_id text null;

-- Track the latest trace that updated the conversation context
alter table if exists copilot_internal.conversation_contexts
  add column if not exists trace_id text null;

-- Refresh views to expose trace metadata
create or replace view public.conversations_view as
  with request_context as (
    select public.current_tenant_id() as tenant_id, auth.role() as requester_role
  )
  select c.id,
         c.tenant_id,
         c.user_id,
         c.share_audience,
         c.tenant_access,
         c.authorization_model,
         c.authorization_spec,
         c.title,
         c.persona_id,
         c.jurisdictions,
         c.trace_id,
         c.root_span_name,
         c.root_span_id,
         c.created_at,
         c.updated_at,
         c.last_message_at
  from copilot_internal.conversations c
  cross join request_context ctx
  where ctx.requester_role = 'service_role'
     or (ctx.tenant_id is not null and c.tenant_id = ctx.tenant_id);

create or replace view public.conversation_messages_view as
  with request_context as (
    select public.current_tenant_id() as tenant_id, auth.role() as requester_role
  )
  select m.id,
         m.conversation_id,
         m.tenant_id,
         m.user_id,
         m.role,
         m.content,
         m.metadata,
         m.trace_id,
         m.root_span_name,
         m.root_span_id,
         m.created_at
  from copilot_internal.conversation_messages m
  cross join request_context ctx
  where ctx.requester_role = 'service_role'
     or (ctx.tenant_id is not null and m.tenant_id = ctx.tenant_id);

create or replace view public.conversation_contexts_view as
  with request_context as (
    select public.current_tenant_id() as tenant_id, auth.role() as requester_role
  )
  select cc.conversation_id,
         cc.tenant_id,
         cc.active_node_ids,
         cc.trace_id,
         cc.summary,
         cc.updated_at
  from copilot_internal.conversation_contexts cc
  cross join request_context ctx
  where ctx.requester_role = 'service_role'
     or (ctx.tenant_id is not null and cc.tenant_id = ctx.tenant_id);
