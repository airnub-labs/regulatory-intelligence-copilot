# Conversation trace lookup runbook

Use the stored trace identifiers on conversations and messages to pivot from Supabase/Postgres data to full tracing output in your observability backend.

## 1. Fetch the trace metadata for a conversation
Run the following query in Supabase SQL (replace the conversation UUID and tenant):

```sql
select
  id as conversation_id,
  tenant_id,
  trace_id,
  root_span_id,
  root_span_name,
  created_at,
  updated_at,
  last_message_at
from copilot_internal.conversations
where id = 'YOUR_CONVERSATION_ID'
  and tenant_id = 'YOUR_TENANT_ID';
```

For message-level traces:

```sql
select
  id as message_id,
  role,
  trace_id,
  root_span_id,
  root_span_name,
  metadata,
  created_at
from copilot_internal.conversation_messages
where conversation_id = 'YOUR_CONVERSATION_ID'
  and tenant_id = 'YOUR_TENANT_ID'
order by created_at asc;
```

If you need the most recent context save trace, fetch it from `conversation_contexts`:

```sql
select trace_id, updated_at
from copilot_internal.conversation_contexts
where conversation_id = 'YOUR_CONVERSATION_ID'
  and tenant_id = 'YOUR_TENANT_ID';
```

## 2. Load the full trace in your observability backend

1. Copy the `trace_id` value (a 32-character hex string) from the conversation or message rows.
2. In your tracing UI (e.g., Tempo/Jaeger/Datadog), paste the `trace_id` into the trace search bar.
3. Filter by service or span name if needed (e.g., the `root_span_name` of `api.chat`).
4. Use the `root_span_id` to anchor span trees if your backend supports span-id queries.

This workflow lets you jump from a support ticket or message record directly into the full OpenTelemetry trace for the request.
