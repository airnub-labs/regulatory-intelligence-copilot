import { deriveIsShared, type ConversationRecord } from './conversationStores.js'

const clientConversationFields = [
  'id',
  'title',
  'shareAudience',
  'tenantAccess',
  'jurisdictions',
  'lastMessageAt',
  'createdAt',
  'archivedAt',
] as const satisfies ReadonlyArray<keyof ConversationRecord>

export type ClientConversation = Pick<
  ConversationRecord,
  (typeof clientConversationFields)[number]
>

export interface ConversationMetadataPayload extends ClientConversation {
  isShared: boolean
}

export function presentConversation(record: ConversationRecord): ClientConversation {
  return clientConversationFields.reduce((acc, field) => {
    acc[field] = record[field]
    return acc
  }, {} as Record<(typeof clientConversationFields)[number], ConversationRecord[(typeof clientConversationFields)[number]]>) as ClientConversation
}

export function presentConversationMetadata(
  record: ConversationRecord,
): ConversationMetadataPayload {
  return {
    ...presentConversation(record),
    isShared: deriveIsShared(record),
  }
}
