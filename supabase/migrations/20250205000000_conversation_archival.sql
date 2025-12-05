alter table if exists copilot_internal.conversations
  add column if not exists archived_at timestamptz null;

alter table if exists copilot_internal.conversation_contexts
  add column if not exists archived_at timestamptz null;

create index if not exists conversations_archived_idx on copilot_internal.conversations(archived_at);
create index if not exists conversation_contexts_archived_idx on copilot_internal.conversation_contexts(archived_at);

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
         c.archived_at,
         c.created_at,
         c.updated_at,
         c.last_message_at
  from copilot_internal.conversations c
  cross join request_context ctx
  where ctx.requester_role = 'service_role'
     or (ctx.tenant_id is not null and c.tenant_id = ctx.tenant_id);

create or replace view public.conversation_contexts_view as
  with request_context as (
    select public.current_tenant_id() as tenant_id, auth.role() as requester_role
  )
  select cc.conversation_id,
         cc.tenant_id,
         cc.active_node_ids,
         cc.summary,
         cc.archived_at,
         cc.updated_at
  from copilot_internal.conversation_contexts cc
  cross join request_context ctx
  where ctx.requester_role = 'service_role'
     or (ctx.tenant_id is not null and cc.tenant_id = ctx.tenant_id);

create or replace function public.conversation_store_healthcheck()
returns table(table_name text, rls_enabled boolean, policy_count integer)
language sql
security definer
set search_path = public, copilot_internal
as $$
  select c.relname as table_name,
         c.relrowsecurity as rls_enabled,
         coalesce(p.policy_count, 0) as policy_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join (
    select polrelid, count(*) as policy_count
    from pg_policy
    group by polrelid
  ) p on p.polrelid = c.oid
  where n.nspname = 'copilot_internal'
    and c.relname in ('conversations', 'conversation_messages', 'conversation_contexts');
$$;

grant execute on function public.conversation_store_healthcheck() to authenticated, service_role;
