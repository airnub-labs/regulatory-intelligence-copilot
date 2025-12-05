import type { ConversationRecord } from '@reg-copilot/reg-intel-conversations'

export type ClientConversation = Pick<
  ConversationRecord,
  'id' | 'title' | 'shareAudience' | 'tenantAccess' | 'jurisdictions' | 'archivedAt' | 'createdAt' | 'lastMessageAt'
>

export function toClientConversation(record: ConversationRecord): ClientConversation {
  return {
    id: record.id,
    title: record.title,
    shareAudience: record.shareAudience,
    tenantAccess: record.tenantAccess,
    jurisdictions: record.jurisdictions,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    lastMessageAt: record.lastMessageAt,
  }
}
