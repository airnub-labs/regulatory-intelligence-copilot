# @reg-copilot/reg-intel-conversations

Conversation persistence, authorization, and **type-safe SSE utilities** for Regulatory Intelligence Copilot shells.

## Overview

This package provides:

1. **Conversation storage** - Interface and implementations for storing conversations and messages
2. **Authorization** - Tenant-scoped access control for conversations
3. **Event hubs** - Real-time SSE broadcast infrastructure
4. **Type-safe SSE contracts** ⭐ - Shared TypeScript types ensuring compile-time safety between server and client

## Key Exports

### Storage

- `ConversationStore` - Interface for conversation CRUD operations
- `ConversationContextStore` - Interface for conversation context management
- `SupabaseConversationStore` - Supabase implementation

### Real-time Events

- `ConversationEventHub` - Hub for individual conversation streams
- `ConversationListEventHub` - Hub for conversation list streams
- `SseSubscriber` - Interface for SSE subscribers

### Event hub configuration (Redis → Supabase Realtime → memory)

- **Redis (production default)** – Provide `REDIS_URL`/`UPSTASH_REDIS_REST_URL` and `REDIS_TOKEN`/`UPSTASH_REDIS_REST_TOKEN` to enable cross-instance SSE delivery via Redis pub/sub.
- **Supabase Realtime (zero-config local fallback)** – If Redis credentials are absent but `SUPABASE_URL` and either `SUPABASE_ANON_KEY` or a service key are present (e.g., from `supabase/.env`), event hubs automatically use Supabase Realtime channels with the same payloads and fan-out semantics.
- **In-memory (dev only)** – When neither Redis nor Supabase credentials are configured, hubs fall back to in-memory delivery suitable for single-instance development only.

### Type-Safe SSE Contracts ⭐

**NEW in v0.6** - See [ADR D-044](../../docs/governance/decisions/decisions_v_0_6.md#d-044--type-safe-sse-event-contracts-for-real-time-streams)

```typescript
import type {
  ConversationListEventPayloadMap,
  ClientConversation,
} from '@reg-copilot/reg-intel-conversations'
```

#### Why Type-Safe SSE?

Previously, event types and payloads were defined separately in server and client code, leading to runtime bugs where:
- Client listened for `'updated'` events
- Server sent `'upsert'` events
- UI didn't update despite events being received

**Now:** All event types and payload structures are defined once in this package and imported by both server and client, giving you **compile-time safety**.

## Usage

### Server-Side (Event Producer)

```typescript
import type { ConversationListEventPayloadMap } from '@reg-copilot/reg-intel-conversations'
import { conversationListEventHub } from '@/lib/server/conversations'
import { toClientConversation } from '@/lib/server/conversationPresenter'

// Create type-safe payload
const payload: ConversationListEventPayloadMap['upsert'] = {
  conversation: toClientConversation(updatedConversation),
}

// Broadcast - TypeScript ensures payload matches event type
conversationListEventHub.broadcast(tenantId, 'upsert', payload)
```

**✅ TypeScript will error if:**
- Payload is missing required fields
- Payload has wrong field types
- You use an invalid event name

### Client-Side (Event Consumer)

```typescript
import type {
  ConversationListEventPayloadMap,
  ClientConversation,
} from '@reg-copilot/reg-intel-conversations'

// In your SSE event handler
if (parsedEvent.type === 'upsert') {
  // Type-safe cast
  const data = parsedData as unknown as ConversationListEventPayloadMap['upsert']

  if (data.conversation) {
    // TypeScript knows exact shape of data.conversation
    setConversations(prev => {
      const exists = prev.some(c => c.id === data.conversation.id)
      return exists
        ? prev.map(c => c.id === data.conversation.id ? data.conversation : c)
        : [data.conversation, ...prev]
    })
  }
}
```

## Available SSE Events

### Conversation List Stream

| Event        | Payload Type                          | Description                    |
|--------------|---------------------------------------|--------------------------------|
| `snapshot`   | `ConversationListSnapshotPayload`     | Full list on initial connect   |
| `upsert`     | `ConversationListUpsertPayload`       | Conversation created/updated   |
| `deleted`    | `ConversationListDeletedPayload`      | Conversation deleted           |
| `archived`   | `ConversationListArchivedPayload`     | Conversation archived          |
| `unarchived` | `ConversationListUnarchivedPayload`   | Conversation unarchived        |
| `renamed`    | `ConversationListRenamedPayload`      | Title changed                  |
| `sharing`    | `ConversationListSharingPayload`      | Sharing settings changed       |

### Individual Conversation Stream

| Event        | Payload Type | Description                |
|--------------|--------------|----------------------------|
| `message`    | `string`     | Message text chunk         |
| `metadata`   | `object`     | Conversation metadata      |
| `warning`    | `string[]`   | Warning messages           |
| `disclaimer` | `string`     | Disclaimer text            |
| `error`      | `string`     | Error message              |
| `done`       | -            | Stream complete            |

## Adding New Events

See the comprehensive guide: [docs/development/SSE_EVENTS_GUIDE.md](../../docs/development/SSE_EVENTS_GUIDE.md)

Quick steps:

1. **Define payload type** in `src/sseTypes.ts`:
   ```typescript
   export interface ConversationListMyEventPayload {
     conversationId: string
     myField: string
   }
   ```

2. **Add to payload map**:
   ```typescript
   export type ConversationListEventPayloadMap = {
     // ... existing events
     myEvent: ConversationListMyEventPayload,
   }
   ```

3. **Add event type** to `src/eventHub.ts` (if new):
   ```typescript
   export type ConversationListEventType =
     | 'snapshot'
     | 'upsert'
     // ... existing
     | 'myEvent'
   ```

4. **Build package**: `pnpm build`

5. **Use in server and client** with full type safety!

## Architecture Decision

This type-safe SSE pattern is documented in:

- **ADR D-044** - [Type-safe SSE event contracts](../../docs/governance/decisions/decisions_v_0_6.md#d-044--type-safe-sse-event-contracts-for-real-time-streams)
- **Developer Guide** - [SSE Events Guide](../../docs/development/SSE_EVENTS_GUIDE.md)

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm type-check

# Run tests
pnpm test
```

## Type Exports

### Core Types

- `ConversationRecord` - Database conversation record
- `ConversationMessage` - Message record
- `ClientConversation` - Sanitized conversation for clients
- `ConversationMetadataPayload` - Metadata payload for SSE

### SSE Event Types

- `ConversationListEventPayloadMap` - Map of all conversation list event payloads
- `ConversationListSnapshotPayload` - Snapshot event payload
- `ConversationListUpsertPayload` - Upsert event payload
- `ConversationListDeletedPayload` - Deleted event payload
- (and more...)

## Dependencies

- `@reg-copilot/reg-intel-core` - Core types and utilities
- `@reg-copilot/reg-intel-observability` - Logging and tracing
- `@opentelemetry/semantic-conventions` - Observability conventions

## License

Private - Part of Regulatory Intelligence Copilot
