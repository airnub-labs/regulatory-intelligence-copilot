create extension if not exists "pgcrypto";

create schema if not exists copilot_internal;

-- Ensure auth.identities supports upserts on provider/provider_id used in seeds
create unique index if not exists identities_provider_provider_id_idx
  on auth.identities(provider, provider_id);

create table if not exists copilot_internal.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid null,
  share_audience text not null default 'private' check (share_audience in ('private', 'tenant', 'public')),
  tenant_access text not null default 'view' check (tenant_access in ('view', 'edit')),
  authorization_model text not null default 'supabase_rbac' check (authorization_model in ('supabase_rbac', 'openfga')),
  authorization_spec jsonb not null default '{}'::jsonb,
  title text null,
  persona_id text null,
  jurisdictions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz null
);

create table if not exists copilot_internal.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references copilot_internal.conversations(id) on delete cascade,
  tenant_id uuid not null,
  user_id uuid null,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists copilot_internal.conversation_contexts (
  conversation_id uuid primary key references copilot_internal.conversations(id) on delete cascade,
  tenant_id uuid not null,
  active_node_ids text[] not null default '{}',
  summary text null,
  updated_at timestamptz not null default now()
);

create table if not exists copilot_internal.personas (
  id text primary key,
  label text not null,
  description text null,
  jurisdictions text[] not null default '{}'
);

create table if not exists copilot_internal.quick_prompts (
  id text primary key,
  label text not null,
  prompt text not null,
  scenario_hint text null,
  persona_filter text[] null,
  jurisdictions text[] null
);

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'tenant_id'
  )::uuid;
$$;

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
         cc.summary,
         cc.updated_at
  from copilot_internal.conversation_contexts cc
  cross join request_context ctx
  where ctx.requester_role = 'service_role'
     or (ctx.tenant_id is not null and cc.tenant_id = ctx.tenant_id);

create or replace view public.personas_view as
  select id, label, description, jurisdictions from copilot_internal.personas;

create or replace view public.quick_prompts_view as
  select id, label, prompt, scenario_hint, persona_filter, jurisdictions from copilot_internal.quick_prompts;

create index if not exists conversations_tenant_idx on copilot_internal.conversations(tenant_id, user_id, created_at desc);
create index if not exists conversation_messages_conversation_idx on copilot_internal.conversation_messages(conversation_id, created_at asc);
create index if not exists conversation_contexts_tenant_idx on copilot_internal.conversation_contexts(tenant_id);

revoke all on schema copilot_internal from public, anon, authenticated;
grant usage on schema copilot_internal to service_role;

revoke all on all tables in schema copilot_internal from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema copilot_internal to service_role;

revoke all on public.conversations_view from public, anon, authenticated, service_role;
revoke all on public.conversation_messages_view from public, anon, authenticated, service_role;
revoke all on public.conversation_contexts_view from public, anon, authenticated, service_role;
revoke all on public.personas_view from public, anon, authenticated, service_role;
revoke all on public.quick_prompts_view from public, anon, authenticated, service_role;

grant select on public.conversations_view to authenticated, service_role;
grant select on public.conversation_messages_view to authenticated, service_role;
grant select on public.conversation_contexts_view to authenticated, service_role;
grant select on public.personas_view to authenticated, service_role;
grant select on public.quick_prompts_view to authenticated, service_role;

