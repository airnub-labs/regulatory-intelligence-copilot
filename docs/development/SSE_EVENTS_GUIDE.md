# SSE Events Developer Guide

**Last Updated:** 2025-12-06
**Related ADR:** [D-044 – Type-safe SSE event contracts](../governance/decisions/decisions_v_0_6.md#d-044--type-safe-sse-event-contracts-for-real-time-streams)

This guide explains how to work with Server-Sent Events (SSE) in the Regulatory Intelligence Copilot to ensure type safety and prevent runtime errors.

---

## Overview

All SSE streams in this project **must** use shared TypeScript types to establish a compile-time contract between the server (event producer) and client (event consumer). This prevents bugs where the client listens for events that the server doesn't send, or where payload structures diverge between client and server.

### Key Principle

> **Event types and payload structures are defined once in a shared package and imported by both client and server code.**

---

## Architecture

### Shared Package: `@reg-copilot/reg-intel-conversations`

This package contains:

1. **Event type enums** (`eventHub.ts`) - Runtime string union types
2. **Payload type definitions** (`sseTypes.ts`) - Compile-time payload contracts
3. **Event payload map** - Maps event names to their exact payload types

```
packages/reg-intel-conversations/
├── src/
│   ├── eventHub.ts          # Event type unions + EventHub classes
│   ├── sseTypes.ts          # Type-safe payload definitions
│   ├── presenters.ts        # Shared data types (ClientConversation, etc.)
│   └── index.ts             # Exports all public types
```

### Event Flow

```
Server (Producer)                   Client (Consumer)
─────────────────                   ─────────────────
1. Import payload type              1. Import payload type
   from shared package                 from shared package

2. Create typed payload             2. Parse event data
   payload: PayloadMap['event']        data as PayloadMap['event']

3. Broadcast via EventHub           3. Handle with type safety
   eventHub.broadcast(...)             TypeScript knows exact shape
```

---

## Adding a New SSE Event

Follow these steps when adding a new event to any SSE stream:

### Step 1: Define the Payload Type

Add your payload interface to `packages/reg-intel-conversations/src/sseTypes.ts`:

```typescript
/**
 * Event: conversation was shared with team members
 */
export interface ConversationListSharingPayload {
  conversationId: string
  shareAudience: 'private' | 'tenant' | 'public'
  tenantAccess: 'view' | 'edit'
}
```

### Step 2: Add to the Event Payload Map

Update the `ConversationListEventPayloadMap` type:

```typescript
export type ConversationListEventPayloadMap = {
  snapshot: ConversationListSnapshotPayload
  upsert: ConversationListUpsertPayload
  deleted: ConversationListDeletedPayload
  sharing: ConversationListSharingPayload  // <-- Add your event
}
```

### Step 3: Update the Event Type Union (if new event)

If your event is truly new (not just a new payload structure), add it to `eventHub.ts`:

```typescript
export type ConversationListEventType =
  | 'snapshot'
  | 'upsert'
  | 'deleted'
  | 'sharing'  // <-- Add here
```

### Step 4: Build the Shared Package

```bash
cd packages/reg-intel-conversations
pnpm build
```

### Step 5: Implement Server-Side (Producer)

Import and use the typed payload:

```typescript
// apps/demo-web/src/app/api/conversations/[id]/route.ts
import type { ConversationListEventPayloadMap } from '@reg-copilot/reg-intel-conversations'

// Create type-safe payload
const payload: ConversationListEventPayloadMap['sharing'] = {
  conversationId: id,
  shareAudience: newAudience,
  tenantAccess: newAccess,
}

// Broadcast with explicit type
conversationListEventHub.broadcast(tenantId, 'sharing', payload)
```

**✅ TypeScript will error if:**
- You use the wrong event name
- Your payload is missing required fields
- Your payload has extra fields
- Field types don't match

### Step 6: Implement Client-Side (Consumer)

Import and use the same types:

```typescript
// apps/demo-web/src/app/page.tsx
import type { ConversationListEventPayloadMap } from '@reg-copilot/reg-intel-conversations'

// In your SSE event handler:
else if (parsedEvent.type === 'sharing' && typeof parsedData === 'object' && parsedData !== null) {
  // Type-safe cast using unknown intermediate
  const data = parsedData as unknown as ConversationListEventPayloadMap['sharing']

  // TypeScript knows the exact shape now
  console.log(`Conversation ${data.conversationId} shared as ${data.shareAudience}`)

  // Update UI state with type safety
  setConversations(prev =>
    prev.map(c => c.id === data.conversationId
      ? { ...c, shareAudience: data.shareAudience, tenantAccess: data.tenantAccess }
      : c
    )
  )
}
```

---

## Best Practices

### ✅ DO

- **Define payload types before implementing** - Write the types first, then the server/client code
- **Use explicit type annotations** - Always type your payloads as `PayloadMap['event']`
- **Document payload fields** - Add JSDoc comments explaining what each field means
- **Version your events** - If you need breaking changes, consider adding a new event type
- **Test both producer and consumer** - Verify events flow correctly end-to-end

### ❌ DON'T

- **Don't use inline object literals** - Always reference the shared payload type
- **Don't add fields without updating types** - Server changes must update shared types first
- **Don't bypass the type system** - Avoid `any` or overly broad casts
- **Don't duplicate type definitions** - Use the shared package as the single source of truth
- **Don't skip the build step** - Always rebuild the shared package after type changes

---

## Common Patterns

### Pattern: Upsert (Create or Update)

Use a single `'upsert'` event for both creating and updating entities:

```typescript
// Payload
export interface ConversationListUpsertPayload {
  conversation: ClientConversation
}

// Client handling - works for both create and update
setConversations(prev => {
  const exists = prev.some(c => c.id === conv.id)
  if (!exists) return [conv, ...prev]  // Create
  return prev.map(c => c.id === conv.id ? conv : c)  // Update
})
```

### Pattern: Snapshot + Deltas

Send full state on connect, then incremental updates:

```typescript
// On connection: send snapshot
const snapshot: ConversationListEventPayloadMap['snapshot'] = {
  status: 'active',
  conversations: [...],
}
subscriber.send('snapshot', snapshot)

// On changes: send delta
const delta: ConversationListEventPayloadMap['upsert'] = {
  conversation: updatedItem,
}
eventHub.broadcast(tenantId, 'upsert', delta)
```

### Pattern: ID-based Deletion

For deletions, send just the ID:

```typescript
export interface ConversationListDeletedPayload {
  conversationId: string
}

// Client removes by ID
setConversations(prev => prev.filter(c => c.id !== data.conversationId))
```

---

## Debugging

### Issue: Client not receiving events

1. **Check event type spelling** - Verify client listens for exact event name server sends
2. **Inspect browser Network tab** - Look at EventStream connection for actual events
3. **Add logging** - Log `parsedEvent.type` and `parsedData` in client handler
4. **Verify server broadcast** - Add console.log before `eventHub.broadcast()` call

### Issue: TypeScript errors on payload access

1. **Verify types are up-to-date** - Rebuild shared package: `pnpm build`
2. **Check imports** - Ensure you're importing from `@reg-copilot/reg-intel-conversations`
3. **Use correct cast** - Cast to `PayloadMap['eventName']`, not the interface directly
4. **Check payload structure** - Server payload must exactly match type definition

### Issue: Runtime errors despite type safety

1. **JSON serialization issues** - Ensure payload serializes to valid JSON
2. **Date/function fields** - SSE can't serialize functions, Dates become strings
3. **Undefined vs null** - Be explicit about nullable fields in type definitions
4. **Circular references** - Avoid objects with circular structure

---

## Migration Checklist

If you're migrating an existing SSE stream to use shared types:

- [ ] Create payload interfaces in `sseTypes.ts`
- [ ] Add payload map entry
- [ ] Build shared package
- [ ] Update server to use typed payloads
- [ ] Update client to use typed payloads
- [ ] Test end-to-end event flow
- [ ] Remove old type definitions from server/client
- [ ] Update tests to use shared types
- [ ] Document the event in this guide

---

## Examples

### Complete Example: Adding a "Renamed" Event

#### 1. Define in `sseTypes.ts`

```typescript
/** Renamed event: conversation title was changed */
export interface ConversationListRenamedPayload {
  conversationId: string
  title: string | null
}

export type ConversationListEventPayloadMap = {
  // ... existing events
  renamed: ConversationListRenamedPayload,
}
```

#### 2. Add to event type union in `eventHub.ts`

```typescript
export type ConversationListEventType =
  | 'snapshot'
  | 'upsert'
  | 'deleted'
  | 'renamed'  // <-- New
```

#### 3. Server broadcasts

```typescript
const payload: ConversationListEventPayloadMap['renamed'] = {
  conversationId: id,
  title: newTitle,
}
conversationListEventHub.broadcast(tenantId, 'renamed', payload)
```

#### 4. Client handles

```typescript
else if (parsedEvent.type === 'renamed' && typeof parsedData === 'object' && parsedData !== null) {
  const data = parsedData as unknown as ConversationListEventPayloadMap['renamed']
  setConversations(prev =>
    prev.map(c => c.id === data.conversationId
      ? { ...c, title: data.title }
      : c
    )
  )

  // Update current conversation title if it's the active one
  if (data.conversationId === conversationId) {
    setConversationTitle(data.title ?? '')
    setSavedConversationTitle(data.title ?? '')
  }
}
```

---

## Related Documentation

- [D-044 – Type-safe SSE event contracts](../governance/decisions/decisions_v_0_6.md#d-044--type-safe-sse-event-contracts-for-real-time-streams) - Architectural decision
- [D-042 – Tenant-scoped SSE stream for conversation lists](../governance/decisions/decisions_v_0_6.md) - Original SSE implementation
- [Architecture v0.6](../architecture/architecture_v_0_6.md) - Overall system architecture

---

## Questions?

If you're unsure about how to implement an SSE event:

1. **Check existing events** - Look at `sseTypes.ts` for similar patterns
2. **Review this guide** - Follow the step-by-step process above
3. **Refer to ADR D-044** - Understand the rationale and requirements
4. **Look at implementation** - See how `upsert` and `deleted` events work

**Remember:** The goal is compile-time safety. If TypeScript doesn't complain, you're likely doing it right!
