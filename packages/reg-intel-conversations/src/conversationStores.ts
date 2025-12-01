import { randomUUID } from 'crypto';
import type {
  ChatMessage,
  ConversationContext,
  ConversationContextStore,
  ConversationIdentity,
} from '@reg-copilot/reg-intel-core';

export type ShareAudience = 'private' | 'tenant' | 'public';
export type TenantAccess = 'view' | 'edit';
export type AuthorizationModel = 'supabase_rbac' | 'openfga';

export interface AuthorizationSpec {
  provider?: 'openfga' | 'spicedb' | 'permify' | 'custom';
  storeId?: string | null;
  authorizationModelId?: string | null;
  tupleSetId?: string | null;
  fallbackShareAudience?: ShareAudience;
  displayName?: string | null;
}

export interface ConversationRecord {
  id: string;
  tenantId: string;
  userId?: string | null;
  shareAudience: ShareAudience;
  tenantAccess: TenantAccess;
  authorizationModel: AuthorizationModel;
  authorizationSpec?: AuthorizationSpec | null;
  personaId?: string | null;
  jurisdictions: string[];
  title?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date | null;
}

export interface ConversationMessage extends ChatMessage {
  id: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
  createdAt: Date;
  deletedAt?: Date | null;
  supersededBy?: string | null;
}

export interface ConversationStore {
  createConversation(input: {
    tenantId: string;
    userId?: string | null;
    personaId?: string | null;
    jurisdictions?: string[];
    title?: string | null;
    shareAudience?: ShareAudience;
    tenantAccess?: TenantAccess;
    authorizationModel?: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
  }): Promise<{ conversationId: string }>;

  appendMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ messageId: string }>;

  softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    userId?: string | null;
    supersededBy?: string | null;
  }): Promise<void>;

  getMessages(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    limit?: number;
  }): Promise<ConversationMessage[]>;

  listConversations(input: { tenantId: string; limit?: number; userId?: string | null }): Promise<ConversationRecord[]>;

  getConversation(input: { tenantId: string; conversationId: string; userId?: string | null }): Promise<ConversationRecord | null>;

  updateSharing(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    shareAudience?: ShareAudience;
    tenantAccess?: TenantAccess;
    authorizationModel?: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
    title?: string | null;
  }): Promise<void>;
}

function resolveShareAudience(input: { shareAudience?: ShareAudience }): ShareAudience {
  if (input.shareAudience) return input.shareAudience;
  return 'private';
}

function resolveTenantAccess(input: { tenantAccess?: TenantAccess }) {
  if (input.tenantAccess) return input.tenantAccess;
  return 'view';
}

export function effectiveShareAudience(record: ConversationRecord) {
  if (record.authorizationModel === 'supabase_rbac') return record.shareAudience;
  return record.authorizationSpec?.fallbackShareAudience ?? 'private';
}

export function deriveIsShared(record: ConversationRecord) {
  return effectiveShareAudience(record) !== 'private';
}

function canRead(record: ConversationRecord, userId?: string | null) {
  const audience = effectiveShareAudience(record);
  if (audience === 'public') return true;
  if (audience === 'tenant') return true;
  if (!record.userId) return true;
  return Boolean(userId && record.userId === userId);
}

function canWrite(record: ConversationRecord, userId?: string | null, role?: 'user' | 'assistant' | 'system') {
  const audience = effectiveShareAudience(record);
  if (role === 'assistant' || role === 'system') return true;
  if (audience === 'tenant' && record.tenantAccess === 'edit') return Boolean(userId);
  if (!record.userId) return true;
  return Boolean(userId && record.userId === userId);
}

export class InMemoryConversationStore implements ConversationStore {
  private conversations = new Map<string, ConversationRecord>();
  private messages = new Map<string, ConversationMessage[]>();

  async createConversation(input: {
    tenantId: string;
    userId?: string | null;
    personaId?: string | null;
    jurisdictions?: string[];
    title?: string | null;
    shareAudience?: ShareAudience;
    tenantAccess?: TenantAccess;
    authorizationModel?: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
  }): Promise<{ conversationId: string }> {
    const id = randomUUID();
    const now = new Date();
    const shareAudience = resolveShareAudience({ shareAudience: input.shareAudience });
    const tenantAccess = resolveTenantAccess({ tenantAccess: input.tenantAccess });
    const authorizationModel = input.authorizationModel ?? 'supabase_rbac';
    this.conversations.set(id, {
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      shareAudience,
      tenantAccess,
      authorizationModel,
      authorizationSpec: input.authorizationSpec,
      personaId: input.personaId ?? null,
      jurisdictions: input.jurisdictions ?? [],
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    });
    this.messages.set(id, []);
    return { conversationId: id };
  }

  async appendMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ messageId: string }> {
    const record = this.conversations.get(input.conversationId);
    if (!record || record.tenantId !== input.tenantId) {
      throw new Error('Conversation not found for tenant');
    }
    if (!canWrite(record, input.userId, input.role)) {
      throw new Error('User not authorised for conversation');
    }
    const message: ConversationMessage = {
      id: randomUUID(),
      role: input.role,
      content: input.content,
      metadata: input.metadata,
      userId: input.userId,
      createdAt: new Date(),
    };
    const existing = this.messages.get(input.conversationId) ?? [];
    existing.push(message);
    this.messages.set(input.conversationId, existing);
    record.lastMessageAt = message.createdAt;
    record.updatedAt = message.createdAt;
    this.conversations.set(input.conversationId, record);
    return { messageId: message.id };
  }

  async softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    userId?: string | null;
    supersededBy?: string | null;
  }): Promise<void> {
    const record = this.conversations.get(input.conversationId);
    if (!record || record.tenantId !== input.tenantId) {
      throw new Error('Conversation not found for tenant');
    }
    if (!canWrite(record, input.userId)) {
      throw new Error('User not authorised for conversation');
    }

    const existing = this.messages.get(input.conversationId) ?? [];
    const targetIndex = existing.findIndex(msg => msg.id === input.messageId);
    if (targetIndex === -1) {
      throw new Error('Message not found');
    }

    const target = existing[targetIndex];
    existing[targetIndex] = {
      ...target,
      deletedAt: new Date(),
      supersededBy: input.supersededBy ?? target.supersededBy ?? null,
      metadata: {
        ...(target.metadata ?? {}),
        deletedAt: new Date().toISOString(),
        supersededBy: input.supersededBy ?? target.supersededBy,
      },
    };

    this.messages.set(input.conversationId, existing);
    record.updatedAt = new Date();
    this.conversations.set(input.conversationId, record);
  }

  async getMessages(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    limit?: number;
  }): Promise<ConversationMessage[]> {
    const record = this.conversations.get(input.conversationId);
    if (!record || record.tenantId !== input.tenantId) {
      return [];
    }
    if (!canRead(record, input.userId)) {
      return [];
    }
    const msgs = this.messages.get(input.conversationId) ?? [];
    if (input.limit && msgs.length > input.limit) {
      return msgs.slice(msgs.length - input.limit);
    }
    return msgs;
  }

  async listConversations(input: { tenantId: string; limit?: number; userId?: string | null }): Promise<ConversationRecord[]> {
    const records = Array.from(this.conversations.values()).filter(record => {
      if (record.tenantId !== input.tenantId) return false;
      if (!input.userId) return canRead(record, null);
      return canRead(record, input.userId);
    });

    records.sort((a, b) => {
      const aDate = a.lastMessageAt?.getTime() ?? a.createdAt.getTime();
      const bDate = b.lastMessageAt?.getTime() ?? b.createdAt.getTime();
      return bDate - aDate;
    });

    if (input.limit) {
      return records.slice(0, input.limit);
    }

    return records;
  }

  async getConversation(input: { tenantId: string; conversationId: string; userId?: string | null }): Promise<ConversationRecord | null> {
    const record = this.conversations.get(input.conversationId);
    if (!record || record.tenantId !== input.tenantId) {
      return null;
    }
    if (!canRead(record, input.userId)) {
      return null;
    }
    return record;
  }

  async updateSharing(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    shareAudience?: ShareAudience;
    tenantAccess?: TenantAccess;
    authorizationModel?: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
    title?: string | null;
  }): Promise<void> {
    const record = this.conversations.get(input.conversationId);
    if (!record || record.tenantId !== input.tenantId) {
      throw new Error('Conversation not found for tenant');
    }
    const isOwner = record.userId ? input.userId === record.userId : true;
    if (!isOwner) {
      throw new Error('User not authorised to update conversation');
    }
    const shareAudience = input.shareAudience ?? record.shareAudience;
    const tenantAccess = input.tenantAccess ?? record.tenantAccess;
    const authorizationModel = input.authorizationModel ?? record.authorizationModel;
    const authorizationSpec = input.authorizationSpec ?? record.authorizationSpec;
    const title = input.title !== undefined ? input.title : record.title;
    this.conversations.set(input.conversationId, {
      ...record,
      shareAudience,
      tenantAccess,
      authorizationModel,
      authorizationSpec,
      title,
      updatedAt: new Date(),
    });
  }
}

export class InMemoryConversationContextStore implements ConversationContextStore {
  private contexts = new Map<string, ConversationContext>();

  private key(identity: ConversationIdentity) {
    return `${identity.tenantId}:${identity.conversationId}`;
  }

  async load(identity: ConversationIdentity): Promise<ConversationContext | null> {
    return this.contexts.get(this.key(identity)) ?? null;
  }

  async save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void> {
    this.contexts.set(this.key(identity), { activeNodeIds: ctx.activeNodeIds ?? [] });
  }

  async mergeActiveNodeIds(identity: ConversationIdentity, nodeIds: string[]): Promise<void> {
    const current = (await this.load(identity)) ?? { activeNodeIds: [] };
    const merged = Array.from(new Set([...(current.activeNodeIds ?? []), ...nodeIds]));
    await this.save(identity, { activeNodeIds: merged });
  }
}
