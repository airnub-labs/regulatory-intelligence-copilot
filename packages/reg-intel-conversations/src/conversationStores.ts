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

interface ConversationRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  share_audience: ShareAudience;
  tenant_access: TenantAccess;
  authorization_model: AuthorizationModel;
  authorization_spec: AuthorizationSpec | null;
  persona_id: string | null;
  jurisdictions: string[];
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  tenant_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
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

function mapConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    shareAudience: row.share_audience,
    tenantAccess: row.tenant_access,
    authorizationModel: row.authorization_model,
    authorizationSpec: row.authorization_spec,
    personaId: row.persona_id,
    jurisdictions: row.jurisdictions ?? [],
    title: row.title,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
  };
}

function mapMessage(row: ConversationMessageRow): ConversationMessage {
  const metadata = row.metadata ?? undefined;
  const deletedAt = (metadata as { deletedAt?: string } | undefined)?.deletedAt;
  const supersededBy = (metadata as { supersededBy?: string } | undefined)?.supersededBy;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    metadata,
    userId: row.user_id,
    createdAt: new Date(row.created_at),
    deletedAt: deletedAt ? new Date(deletedAt) : undefined,
    supersededBy: supersededBy ?? undefined,
  };
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

export class SupabaseConversationStore implements ConversationStore {
  private readonly restUrl: string;
  private readonly headers: Record<string, string>;

  constructor(supabaseUrl: string, supabaseServiceRoleKey: string) {
    this.restUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`;
    this.headers = {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  static fromEnv(): SupabaseConversationStore | null {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) return null;
    return new SupabaseConversationStore(supabaseUrl, supabaseServiceRoleKey);
  }

  private async request<T>(path: string, init: RequestInit, expectBody = true): Promise<T> {
    const response = await fetch(`${this.restUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || response.statusText);
    }

    if (!expectBody) {
      return undefined as unknown as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as unknown as T;
    }
    return JSON.parse(text) as T;
  }

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
    const shareAudience = resolveShareAudience({ shareAudience: input.shareAudience });
    const tenantAccess = resolveTenantAccess({ tenantAccess: input.tenantAccess });
    const authorizationModel = input.authorizationModel ?? 'supabase_rbac';
    const payload = {
      tenant_id: input.tenantId,
      user_id: input.userId ?? null,
      share_audience: shareAudience,
      tenant_access: tenantAccess,
      authorization_model: authorizationModel,
      authorization_spec: input.authorizationSpec ?? {},
      persona_id: input.personaId ?? null,
      jurisdictions: input.jurisdictions ?? [],
      title: input.title ?? null,
    };

    const data = await this.request<ConversationRow[]>(`/copilot_internal.conversations`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });

    return { conversationId: data[0].id };
  }

  private async loadConversation(input: { tenantId: string; conversationId: string }): Promise<ConversationRecord | null> {
    const query =
      `/copilot_internal.conversations?select=*&id=eq.${encodeURIComponent(input.conversationId)}` +
      `&tenant_id=eq.${encodeURIComponent(input.tenantId)}&limit=1`;
    const data = await this.request<ConversationRow[]>(query, { method: 'GET' });
    if (!data.length) return null;
    return mapConversation(data[0]);
  }

  async appendMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ messageId: string }> {
    const record = await this.loadConversation({ tenantId: input.tenantId, conversationId: input.conversationId });
    if (!record) {
      throw new Error('Conversation not found for tenant');
    }
    if (!canWrite(record, input.userId, input.role)) {
      throw new Error('User not authorised for conversation');
    }

    const messagePayload = {
      conversation_id: input.conversationId,
      tenant_id: input.tenantId,
      user_id: input.userId ?? null,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? null,
    };

    const message = await this.request<ConversationMessageRow[]>(`/copilot_internal.conversation_messages`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(messagePayload),
    });

    const createdAt = message[0]?.created_at ?? new Date().toISOString();
    await this.request(`/copilot_internal.conversations?id=eq.${encodeURIComponent(input.conversationId)}&tenant_id=eq.${encodeURIComponent(input.tenantId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ updated_at: createdAt, last_message_at: createdAt }),
    }, false);

    return { messageId: message[0].id };
  }

  async softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    userId?: string | null;
    supersededBy?: string | null;
  }): Promise<void> {
    const record = await this.loadConversation({ tenantId: input.tenantId, conversationId: input.conversationId });
    if (!record) {
      throw new Error('Conversation not found for tenant');
    }
    if (!canWrite(record, input.userId)) {
      throw new Error('User not authorised for conversation');
    }

    const messageQuery =
      `/copilot_internal.conversation_messages?select=*&id=eq.${encodeURIComponent(input.messageId)}` +
      `&conversation_id=eq.${encodeURIComponent(input.conversationId)}` +
      `&tenant_id=eq.${encodeURIComponent(input.tenantId)}&limit=1`;
    const messageData = await this.request<ConversationMessageRow[]>(messageQuery, { method: 'GET' });
    const message = messageData[0];
    if (!message) {
      throw new Error('Message not found');
    }

    const metadata = (message.metadata as Record<string, unknown> | null) ?? {};
    const deletedAt = new Date().toISOString();
    const supersededBy = input.supersededBy ?? (metadata as { supersededBy?: string }).supersededBy ?? null;
    const updateMetadata = {
      ...metadata,
      deletedAt,
      supersededBy,
    };

    await this.request(
      `/copilot_internal.conversation_messages?id=eq.${encodeURIComponent(input.messageId)}` +
        `&conversation_id=eq.${encodeURIComponent(input.conversationId)}` +
        `&tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
      { method: 'PATCH', body: JSON.stringify({ metadata: updateMetadata }) },
      false,
    );

    await this.request(
      `/copilot_internal.conversations?id=eq.${encodeURIComponent(input.conversationId)}` +
        `&tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
      { method: 'PATCH', body: JSON.stringify({ updated_at: deletedAt }) },
      false,
    );
  }

  async getMessages(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    limit?: number;
  }): Promise<ConversationMessage[]> {
    const record = await this.loadConversation({ tenantId: input.tenantId, conversationId: input.conversationId });
    if (!record || !canRead(record, input.userId)) {
      return [];
    }

    const queryParams = [
      'select=*',
      `conversation_id=eq.${encodeURIComponent(input.conversationId)}`,
      `tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
      'order=created_at.asc',
    ];
    if (input.limit) {
      queryParams.push(`limit=${input.limit}`);
    }

    const data = await this.request<ConversationMessageRow[]>(
      `/copilot_internal.conversation_messages?${queryParams.join('&')}`,
      { method: 'GET' },
    );

    const messages = data.map(mapMessage);
    if (input.limit && messages.length > input.limit) {
      return messages.slice(messages.length - input.limit);
    }
    return messages;
  }

  async listConversations(input: { tenantId: string; limit?: number; userId?: string | null }): Promise<ConversationRecord[]> {
    const params = [
      'select=*',
      `tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
      'order=last_message_at.desc.nullslast',
      'order=created_at.desc',
    ];
    if (input.limit) {
      params.push(`limit=${input.limit}`);
    }

    const data = await this.request<ConversationRow[]>(
      `/copilot_internal.conversations?${params.join('&')}`,
      { method: 'GET' },
    );

    const records = data.map(mapConversation).filter(record => canRead(record, input.userId));

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

  async getConversation(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
  }): Promise<ConversationRecord | null> {
    const record = await this.loadConversation({ tenantId: input.tenantId, conversationId: input.conversationId });
    if (!record) return null;
    if (!canRead(record, input.userId)) return null;
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
    const record = await this.loadConversation({ tenantId: input.tenantId, conversationId: input.conversationId });
    if (!record) {
      throw new Error('Conversation not found for tenant');
    }
    const isOwner = record.userId ? input.userId === record.userId : true;
    if (!isOwner) {
      throw new Error('User not authorised to update conversation');
    }

    const shareAudience = input.shareAudience ?? record.shareAudience;
    const tenantAccess = input.tenantAccess ?? record.tenantAccess;
    const authorizationModel = input.authorizationModel ?? record.authorizationModel;
    const authorizationSpec = input.authorizationSpec ?? record.authorizationSpec ?? {};
    const title = input.title !== undefined ? input.title : record.title;

    await this.request(
      `/copilot_internal.conversations?id=eq.${encodeURIComponent(input.conversationId)}` +
        `&tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          share_audience: shareAudience,
          tenant_access: tenantAccess,
          authorization_model: authorizationModel,
          authorization_spec: authorizationSpec,
          title,
          updated_at: new Date().toISOString(),
        }),
      },
      false,
    );
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
