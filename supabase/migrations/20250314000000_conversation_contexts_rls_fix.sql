-- Ensure conversation_contexts enforces RLS and matches health check expectations
alter table if exists copilot_internal.conversation_contexts
  enable row level security;

-- Service role full access for maintenance and background jobs
drop policy if exists conversation_contexts_service_role_full_access on copilot_internal.conversation_contexts;
create policy conversation_contexts_service_role_full_access
  on copilot_internal.conversation_contexts
  for all
  to service_role
  using (true)
  with check (true);

-- Tenant-scoped access mirroring conversations and messages tables
drop policy if exists conversation_contexts_tenant_read on copilot_internal.conversation_contexts;
create policy conversation_contexts_tenant_read
  on copilot_internal.conversation_contexts
  for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists conversation_contexts_tenant_write on copilot_internal.conversation_contexts;
create policy conversation_contexts_tenant_write
  on copilot_internal.conversation_contexts
  for insert
  to authenticated
  with check (tenant_id = public.current_tenant_id());

drop policy if exists conversation_contexts_tenant_update on copilot_internal.conversation_contexts;
create policy conversation_contexts_tenant_update
  on copilot_internal.conversation_contexts
  for update
  to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
