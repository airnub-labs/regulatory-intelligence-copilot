import type { ClientConversation } from './presenters.js'

/**
 * Type-safe SSE event payload definitions for conversation list streams.
 *
 * These types establish a compile-time contract between the server (event producer)
 * and client (event consumer) to prevent runtime errors from payload mismatches.
 *
 * ## Architecture Decision
 *
 * See ADR D-044 in docs/governance/decisions/decisions_v_0_6.md for rationale.
 *
 * ## Usage Pattern
 *
 * **Server (Producer):**
 * ```typescript
 * const payload: ConversationListEventPayloadMap['upsert'] = {
 *   conversation: toClientConversation(updated),
 * }
 * conversationListEventHub.broadcast(tenantId, 'upsert', payload)
 * ```
 *
 * **Client (Consumer):**
 * ```typescript
 * import type { ConversationListEventPayloadMap } from '@reg-copilot/reg-intel-conversations'
 *
 * const data = parsedData as unknown as ConversationListEventPayloadMap['upsert']
 * if (data.conversation) {
 *   // TypeScript knows exact shape of data.conversation
 * }
 * ```
 *
 * ## Adding New Events
 *
 * 1. Define payload interface below
 * 2. Add to ConversationListEventPayloadMap
 * 3. Add event type to eventHub.ts if new
 * 4. Rebuild package: `pnpm build`
 * 5. Update server and client code
 *
 * See docs/development/SSE_EVENTS_GUIDE.md for complete guide.
 */

/**
 * Snapshot event: Full list of conversations sent on initial connection.
 *
 * Sent when a client first subscribes to the conversation list stream.
 * Contains all conversations matching the requested status filter.
 */
export interface ConversationListSnapshotPayload {
  /** Filter applied: 'active', 'archived', or 'all' */
  status?: 'active' | 'archived' | 'all'
  /** Complete list of conversations matching the filter */
  conversations: ClientConversation[]
}

/**
 * Upsert event: Conversation was created or updated.
 *
 * This event serves dual purpose:
 * - On create: Adds new conversation to the list
 * - On update: Replaces existing conversation with updated data
 *
 * Client should check if conversation exists and handle accordingly.
 */
export interface ConversationListUpsertPayload {
  /** The conversation that was created or updated */
  conversation: ClientConversation
}

/**
 * Deleted event: Conversation was permanently deleted.
 *
 * Client should remove the conversation from the list.
 * If this is the active conversation, client should navigate away.
 */
export interface ConversationListDeletedPayload {
  /** ID of the deleted conversation */
  conversationId: string
}

/**
 * Archived event: Conversation was archived.
 *
 * Client should move conversation from active to archived list.
 * Archived conversations are hidden by default but can be viewed in archive tab.
 */
export interface ConversationListArchivedPayload {
  /** ID of the archived conversation */
  conversationId: string
}

/**
 * Unarchived event: Conversation was restored from archive.
 *
 * Client should move conversation from archived to active list.
 */
export interface ConversationListUnarchivedPayload {
  /** ID of the unarchived conversation */
  conversationId: string
}

/**
 * Renamed event: Conversation title was changed.
 *
 * Client should update the displayed title.
 * Title can be null for untitled conversations.
 */
export interface ConversationListRenamedPayload {
  /** ID of the conversation */
  conversationId: string
  /** New title (null for untitled) */
  title: string | null
}

/**
 * Sharing event: Conversation sharing settings were modified.
 *
 * Client should update sharing indicators and access controls.
 * Affects who can view/edit the conversation.
 */
export interface ConversationListSharingPayload {
  /** ID of the conversation */
  conversationId: string
  /** New sharing audience level */
  shareAudience: 'private' | 'tenant' | 'public'
  /** New tenant access level */
  tenantAccess: 'view' | 'edit'
}

/**
 * Type-safe map of event types to their exact payload structures.
 *
 * This is the **single source of truth** for conversation list SSE events.
 * Both server and client code must reference this map to ensure type safety.
 *
 * ## Example: Type-safe server broadcast
 * ```typescript
 * const payload: ConversationListEventPayloadMap['upsert'] = {
 *   conversation: toClientConversation(updated),
 * }
 * // TypeScript ensures payload matches exactly
 * conversationListEventHub.broadcast(tenantId, 'upsert', payload)
 * ```
 *
 * ## Example: Type-safe client handling
 * ```typescript
 * const data = parsedData as unknown as ConversationListEventPayloadMap['deleted']
 * // TypeScript knows data.conversationId exists and is a string
 * setConversations(prev => prev.filter(c => c.id !== data.conversationId))
 * ```
 */
export type ConversationListEventPayloadMap = {
  snapshot: ConversationListSnapshotPayload
  upsert: ConversationListUpsertPayload
  deleted: ConversationListDeletedPayload
  archived: ConversationListArchivedPayload
  unarchived: ConversationListUnarchivedPayload
  renamed: ConversationListRenamedPayload
  sharing: ConversationListSharingPayload
}

/**
 * Type-safe helper to extract payload type for a specific event.
 *
 * This utility type allows you to reference event payloads using a cleaner syntax.
 *
 * @example
 * ```typescript
 * // These are equivalent:
 * type Payload1 = ConversationListEventPayloadMap['upsert']
 * type Payload2 = ConversationListEventPayload<'upsert'>
 * ```
 */
export type ConversationListEventPayload<T extends keyof ConversationListEventPayloadMap> =
  ConversationListEventPayloadMap[T]
