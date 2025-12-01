create extension if not exists "pgcrypto";

create schema if not exists copilot_internal;

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

create view if not exists public.conversations_view as
  select id,
         tenant_id,
         user_id,
         share_audience,
         tenant_access,
         authorization_model,
         authorization_spec,
         title,
         persona_id,
         jurisdictions,
         created_at,
         updated_at,
         last_message_at
  from copilot_internal.conversations;

create view if not exists public.conversation_messages_view as
  select id, conversation_id, tenant_id, user_id, role, content, metadata, created_at
  from copilot_internal.conversation_messages;

create view if not exists public.conversation_contexts_view as
  select conversation_id, tenant_id, active_node_ids, summary, updated_at
  from copilot_internal.conversation_contexts;

create view if not exists public.personas_view as
  select id, label, description, jurisdictions from copilot_internal.personas;

create view if not exists public.quick_prompts_view as
  select id, label, prompt, scenario_hint, persona_filter, jurisdictions from copilot_internal.quick_prompts;

create index if not exists conversations_tenant_idx on copilot_internal.conversations(tenant_id, user_id, created_at desc);
create index if not exists conversation_messages_conversation_idx on copilot_internal.conversation_messages(conversation_id, created_at asc);
create index if not exists conversation_contexts_tenant_idx on copilot_internal.conversation_contexts(tenant_id);
