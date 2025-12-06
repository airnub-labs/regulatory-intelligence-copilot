import type { ClientConversation } from './presenters.js'

/**
 * Type-safe SSE event payload definitions for conversation list streams.
 * These types ensure client and server have a shared understanding of event data structures.
 */

/** Snapshot event: full list of conversations */
export interface ConversationListSnapshotPayload {
  status?: 'active' | 'archived' | 'all'
  conversations: ClientConversation[]
}

/** Upsert event: conversation created or updated */
export interface ConversationListUpsertPayload {
  conversation: ClientConversation
}

/** Deleted event: conversation was deleted */
export interface ConversationListDeletedPayload {
  conversationId: string
}

/** Archived event: conversation was archived */
export interface ConversationListArchivedPayload {
  conversationId: string
}

/** Unarchived event: conversation was unarchived */
export interface ConversationListUnarchivedPayload {
  conversationId: string
}

/** Renamed event: conversation title was changed */
export interface ConversationListRenamedPayload {
  conversationId: string
  title: string | null
}

/** Sharing event: conversation sharing settings changed */
export interface ConversationListSharingPayload {
  conversationId: string
  shareAudience: 'private' | 'tenant' | 'public'
  tenantAccess: 'view' | 'edit'
}

/**
 * Map of event types to their payload types.
 * This ensures type safety when sending/receiving SSE events.
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
 * Type-safe helper to get the payload type for a specific event type.
 * Usage: ConversationListEventPayload<'upsert'> returns ConversationListUpsertPayload
 */
export type ConversationListEventPayload<T extends keyof ConversationListEventPayloadMap> =
  ConversationListEventPayloadMap[T]
