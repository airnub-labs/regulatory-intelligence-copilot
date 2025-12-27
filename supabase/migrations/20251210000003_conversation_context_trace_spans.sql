-- Add root span metadata to conversation contexts for traceability
alter table if exists copilot_internal.conversation_contexts
  add column if not exists root_span_name text null,
  add column if not exists root_span_id text null;

-- Refresh view to expose root span fields alongside trace_id
-- Drop and recreate view to allow column structure changes
set check_function_bodies = off;

drop view if exists public.conversation_contexts_view;

create or replace view public.conversation_contexts_view as
  with request_context as (
    select public.current_tenant_id() as tenant_id, auth.role() as requester_role
  )
  select cc.conversation_id,
         cc.tenant_id,
         cc.active_node_ids,
         cc.trace_id,
         cc.root_span_name,
         cc.root_span_id,
         cc.summary,
         cc.archived_at,
         cc.updated_at
  from copilot_internal.conversation_contexts cc
  cross join request_context ctx
  where ctx.requester_role = 'service_role'
     or (ctx.tenant_id is not null and cc.tenant_id = ctx.tenant_id);

grant select on public.conversation_contexts_view to authenticated, service_role;

set check_function_bodies = on;
