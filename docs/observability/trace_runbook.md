# Conversation trace lookup runbook

> **Note:** This document provides operational trace lookup procedures. For the canonical observability overview, see:
> [`docs/architecture/observability-and-telemetry_v1.md`](../architecture/observability-and-telemetry_v1.md)

Use the stored trace identifiers on conversations and messages to pivot from Supabase/Postgres data to full tracing output in your observability backend. This runbook doubles as the **regression contract** for future coding agents so the trace linkage does not get dropped when adding new stores or background jobs.

## Persistence contract (do not regress)

Every request to `api.chat` creates or resumes a trace whose identifiers must be copied into the persistence layer so future coding agents cannot accidentally drop the linkage:

- **Conversations** – insert/update `trace_id`, `root_span_id` and `root_span_name` whenever a request creates a conversation or appends a message. The values come from the request’s **root span** (not a child span), so the conversation row can always be joined back to the top-level trace entry point.
- **Messages** – persist the same trio of fields on every `conversation_messages` row created during the request. Message metadata already carries the `traceId`; keep that behaviour so downstream tools can correlate records even if someone exports the messages table.
- **Context saves** – when merging active node IDs into `conversation_contexts`, set `trace_id` from the saving request so you can pivot from the most recent context snapshot into the trace that produced it.
- **Other writers** – any new table that captures message- or conversation-adjacent state (e.g., scenario runs or summarisation snapshots) must also copy the `trace_id` and `root_span_*` trio from the active root span so the entire workflow is traceable.

### Implementation checklist for new or updated code paths
- **Always propagate the root span:** Thread the active OTEL context from `/api/chat` (or any future entrypoint) into the conversation store and context store. Do not spawn new traces for background saves; reuse the request’s parent trace so the `trace_id`/`root_span_*` values all match.
- **Map to the correct columns:** The Postgres schema includes `trace_id`, `root_span_id`, and `root_span_name` on **all** of `copilot_internal.conversations`, `copilot_internal.conversation_messages`, and `copilot_internal.conversation_contexts`. Any insert/update that touches these tables must populate the fields from the current root span.
- **Do not null-out existing trace data:** Update statements should retain prior trace metadata unless the active request is the one performing the append/save. Avoid `NULL` defaults or “partial updates” that skip these columns.
- **Cover non-HTTP writers:** If a background worker, replay job, or migration script writes to these tables, inject the trace identifiers from the orchestrating span rather than leaving them blank. The linkage is required for auditability regardless of execution context.
- **Keep telemetry and persistence aligned:** When adding new metadata to message `metadata` JSON blobs, maintain the existing `traceId` field and keep it consistent with the relational columns so future log correlation continues to work.
- **Add code review hooks:** When adding new persistence methods, include automated checks or TODO comments that explicitly mention the trace fields so reviewers verify the values are set from the active root span (not a child span).

### Quick regression checks for reviewers
- Confirm every insert/update that touches conversations, messages, contexts, or adjacent tables includes `trace_id`, `root_span_id`, and `root_span_name` in the column list or payload.
- Verify the values come from the **root span** captured at request ingress (e.g., the top-level `/api/chat` span) rather than a newly created span inside a helper.
- For background jobs and migrations, ensure the caller passes through an OTEL context or an explicit `traceContext` object so the IDs are non-null and match the originating request trace.
- If you add a new DTO or TypeScript interface that represents persisted conversation data, include the trace fields and document that they must be set. This prevents future pruning of the fields from the type system.

If you add new entry points or background jobs that write to these tables, thread the active trace context through to the persistence calls instead of leaving the columns `NULL`.

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
