import { randomUUID } from 'crypto';
import type {
  ChatMessage,
  ConversationContext,
  ConversationContextStore,
  ConversationIdentity,
} from '@reg-copilot/reg-intel-core';
import { withSpan } from '@reg-copilot/reg-intel-observability';
import { SEMATTRS_DB_SYSTEM, SEMATTRS_DB_NAME, SEMATTRS_DB_OPERATION, SEMATTRS_DB_SQL_TABLE } from '@opentelemetry/semantic-conventions';

export type ShareAudience = 'private' | 'tenant' | 'public';
export type TenantAccess = 'view' | 'edit';
export type AuthorizationModel = 'supabase_rbac' | 'openfga';

export type SupabaseError = { message: string };

export type SupabaseLikeClient = {
  from(table: string): any;
  schema?(schema: string): SupabaseLikeClient;
};

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
  traceId?: string | null;
  rootSpanName?: string | null;
  rootSpanId?: string | null;
  shareAudience: ShareAudience;
  tenantAccess: TenantAccess;
  authorizationModel: AuthorizationModel;
  authorizationSpec: AuthorizationSpec;
  personaId?: string | null;
  jurisdictions: string[];
  title?: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date | null;
}

export interface ConversationMessage extends ChatMessage {
  id: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
  traceId?: string | null;
  rootSpanName?: string | null;
  rootSpanId?: string | null;
  createdAt: Date;
  deletedAt?: Date | null;
  supersededBy?: string | null;
}

export interface ConversationStore {
  createConversation(input: {
    tenantId: string;
    userId?: string | null;
    traceId?: string | null;
    rootSpanName?: string | null;
    rootSpanId?: string | null;
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
    traceId?: string | null;
    rootSpanName?: string | null;
    rootSpanId?: string | null;
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

  listConversations(input: {
    tenantId: string;
    limit?: number;
    userId?: string | null;
    status?: 'active' | 'archived' | 'all';
  }): Promise<ConversationRecord[]>;

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

  setArchivedState(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    archived: boolean;
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
    traceId?: string | null;
    rootSpanName?: string | null;
    rootSpanId?: string | null;
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
    const authorizationSpec = input.authorizationSpec ?? {};
    this.conversations.set(id, {
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      traceId: input.traceId ?? null,
      rootSpanName: input.rootSpanName ?? null,
      rootSpanId: input.rootSpanId ?? null,
      shareAudience,
      tenantAccess,
      authorizationModel,
      authorizationSpec,
      personaId: input.personaId ?? null,
      jurisdictions: input.jurisdictions ?? [],
      title: input.title ?? null,
      archivedAt: null,
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
    traceId?: string | null;
    rootSpanName?: string | null;
    rootSpanId?: string | null;
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
      traceId: input.traceId ?? null,
      rootSpanName: input.rootSpanName ?? null,
      rootSpanId: input.rootSpanId ?? null,
      createdAt: new Date(),
    };
    const existing = this.messages.get(input.conversationId) ?? [];
    existing.push(message);
    this.messages.set(input.conversationId, existing);
    record.lastMessageAt = message.createdAt;
    record.updatedAt = message.createdAt;
    record.traceId = input.traceId ?? record.traceId ?? null;
    record.rootSpanName = input.rootSpanName ?? record.rootSpanName ?? null;
    record.rootSpanId = input.rootSpanId ?? record.rootSpanId ?? null;
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

  async listConversations(input: {
    tenantId: string;
    limit?: number;
    userId?: string | null;
    status?: 'active' | 'archived' | 'all';
  }): Promise<ConversationRecord[]> {
    const status = input.status ?? 'active';
    const records = Array.from(this.conversations.values()).filter(record => {
      if (record.tenantId !== input.tenantId) return false;
      if (!input.userId) return canRead(record, null);
      if (!canRead(record, input.userId)) return false;
      if (status === 'active') return !record.archivedAt;
      if (status === 'archived') return Boolean(record.archivedAt);
      return true;
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
    const authorizationSpec = input.authorizationSpec ?? record.authorizationSpec ?? {};
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

  async setArchivedState(input: { tenantId: string; conversationId: string; userId?: string | null; archived: boolean }) {
    const record = this.conversations.get(input.conversationId);
    if (!record || record.tenantId !== input.tenantId) {
      throw new Error('Conversation not found for tenant');
    }
    const isOwner = record.userId ? input.userId === record.userId : true;
    if (!isOwner) {
      throw new Error('User not authorised to update conversation');
    }

    const archivedAt = input.archived ? new Date() : null;
    this.conversations.set(input.conversationId, {
      ...record,
      archivedAt,
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
    this.contexts.set(this.key(identity), {
      activeNodeIds: ctx.activeNodeIds ?? [],
      traceId: ctx.traceId,
    });
  }

  async mergeActiveNodeIds(
    identity: ConversationIdentity,
    nodeIds: string[],
    options?: { traceId?: string | null }
  ): Promise<void> {
    const current = (await this.load(identity)) ?? { activeNodeIds: [] };
    const merged = Array.from(new Set([...(current.activeNodeIds ?? []), ...nodeIds]));
    await this.save(identity, { activeNodeIds: merged, traceId: options?.traceId ?? current.traceId });
  }
}

type SupabaseConversationRow = {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  trace_id?: string | null;
  root_span_name?: string | null;
  root_span_id?: string | null;
  share_audience: ShareAudience;
  tenant_access: TenantAccess;
  authorization_model: AuthorizationModel;
  authorization_spec: AuthorizationSpec;
  persona_id?: string | null;
  jurisdictions: string[];
  title?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
};

type SupabaseConversationMessageRow = {
  id: string;
  conversation_id: string;
  tenant_id: string;
  user_id?: string | null;
  trace_id?: string | null;
  root_span_name?: string | null;
  root_span_id?: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type SupabaseConversationContextRow = {
  conversation_id: string;
  tenant_id: string;
  active_node_ids: string[];
  trace_id?: string | null;
  updated_at: string;
};

function mapConversationRow(row: SupabaseConversationRow): ConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    traceId: row.trace_id,
    rootSpanName: row.root_span_name,
    rootSpanId: row.root_span_id,
    shareAudience: row.share_audience,
    tenantAccess: row.tenant_access,
    authorizationModel: row.authorization_model,
    authorizationSpec: row.authorization_spec ?? {},
    personaId: row.persona_id,
    jurisdictions: row.jurisdictions ?? [],
    title: row.title,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
  };
}

function mapMessageRow(row: SupabaseConversationMessageRow): ConversationMessage {
  const metadata = row.metadata ?? undefined;
  const deletedAtValue = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).deletedAt : undefined;
  const supersededByValue = metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>).supersededBy
    : undefined;

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    metadata,
    userId: row.user_id,
    traceId: row.trace_id,
    rootSpanName: row.root_span_name,
    rootSpanId: row.root_span_id,
    createdAt: new Date(row.created_at),
    deletedAt: typeof deletedAtValue === 'string' ? new Date(deletedAtValue) : undefined,
    supersededBy: typeof supersededByValue === 'string' ? supersededByValue : undefined,
  };
}

export class SupabaseConversationStore implements ConversationStore {
  private readonly internalClient: SupabaseLikeClient;

  constructor(private client: SupabaseLikeClient, internalClient?: SupabaseLikeClient) {
    this.internalClient = internalClient ?? client;
  }

  private wrapMutation<T>(
    input: { operation: string; table: string; tenantId: string; conversationId?: string },
    fn: () => Promise<T>
  ) {
    return withSpan(
      'db.supabase.mutation',
      {
        [SEMATTRS_DB_SYSTEM]: 'postgresql',
        [SEMATTRS_DB_NAME]: 'supabase',
        [SEMATTRS_DB_OPERATION]: input.operation,
        [SEMATTRS_DB_SQL_TABLE]: input.table,
        'app.tenant.id': input.tenantId,
        ...(input.conversationId ? { 'app.conversation.id': input.conversationId } : {}),
      },
      fn
    );
  }

  private async getConversationRecord(
    tenantId: string,
    conversationId: string
  ): Promise<ConversationRecord | null> {
    const { data, error } = await this.client
      .from('conversations_view')
      .select(
        'id, tenant_id, user_id, trace_id, root_span_name, root_span_id, share_audience, tenant_access, authorization_model, authorization_spec, persona_id, jurisdictions, title, archived_at, created_at, updated_at, last_message_at'
      )
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load conversation: ${error.message}`);
    }

    if (!data) return null;
    return mapConversationRow(data as SupabaseConversationRow);
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
    traceId?: string | null;
    rootSpanName?: string | null;
    rootSpanId?: string | null;
  }): Promise<{ conversationId: string }> {
    return this.wrapMutation(
      { operation: 'insert', table: 'conversations', tenantId: input.tenantId },
      async () => {
        const now = new Date().toISOString();
        const shareAudience = resolveShareAudience({ shareAudience: input.shareAudience });
        const tenantAccess = resolveTenantAccess({ tenantAccess: input.tenantAccess });
        const authorizationModel = input.authorizationModel ?? 'supabase_rbac';
        const authorizationSpec = input.authorizationSpec ?? {};

        const { data, error } = await this.internalClient
          .from('conversations')
          .insert({
            tenant_id: input.tenantId,
            user_id: input.userId ?? null,
            trace_id: input.traceId ?? null,
            root_span_name: input.rootSpanName ?? null,
            root_span_id: input.rootSpanId ?? null,
            share_audience: shareAudience,
            tenant_access: tenantAccess,
            authorization_model: authorizationModel,
            authorization_spec: authorizationSpec,
            persona_id: input.personaId ?? null,
            jurisdictions: input.jurisdictions ?? [],
            title: input.title ?? null,
            archived_at: null,
            created_at: now,
            updated_at: now,
          })
          .select('id')
          .single();

        if (error) {
          throw new Error(`Failed to create conversation: ${error.message}`);
        }

        return { conversationId: (data as { id: string }).id };
      }
    );
  }

  async appendMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    traceId?: string | null;
    rootSpanName?: string | null;
    rootSpanId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ messageId: string }> {
    return this.wrapMutation(
      {
        operation: 'insert',
        table: 'conversation_messages',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
      },
      async () => {
        const conversation = await this.getConversationRecord(input.tenantId, input.conversationId);
        if (!conversation) {
          throw new Error('Conversation not found for tenant');
        }
        if (!canWrite(conversation, input.userId, input.role)) {
          throw new Error('User not authorised for conversation');
        }

        const messageTimestamp = new Date().toISOString();
        const mergedMetadata = input.traceId
          ? { ...(input.metadata ?? {}), traceId: input.traceId }
          : input.metadata;
        const { data, error } = await this.internalClient
          .from('conversation_messages')
          .insert({
            conversation_id: input.conversationId,
            tenant_id: input.tenantId,
            user_id: input.userId ?? null,
            trace_id: input.traceId ?? null,
            root_span_name: input.rootSpanName ?? null,
            root_span_id: input.rootSpanId ?? null,
            role: input.role,
            content: input.content,
            metadata: mergedMetadata ?? null,
            created_at: messageTimestamp,
          })
          .select('id, created_at, metadata')
          .single();

        if (error) {
          throw new Error(`Failed to append message: ${error.message}`);
        }

        const createdAt = (data as SupabaseConversationMessageRow).created_at ?? messageTimestamp;

        const conversationUpdate: Record<string, unknown> = {
          last_message_at: createdAt,
          updated_at: createdAt,
        };

        if (input.traceId !== undefined) {
          conversationUpdate.trace_id = input.traceId;
        }

        if (input.rootSpanName !== undefined) {
          conversationUpdate.root_span_name = input.rootSpanName;
        }

        if (input.rootSpanId !== undefined) {
          conversationUpdate.root_span_id = input.rootSpanId;
        }

        const { error: updateError } = await this.internalClient
          .from('conversations')
          .update(conversationUpdate)
          .eq('id', input.conversationId)
          .eq('tenant_id', input.tenantId);

        if (updateError) {
          throw new Error(`Failed to update conversation timestamps: ${updateError.message}`);
        }

        return { messageId: (data as { id: string }).id };
      }
    );
  }

  async softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    userId?: string | null;
    supersededBy?: string | null;
  }): Promise<void> {
    return this.wrapMutation(
      {
        operation: 'update',
        table: 'conversation_messages',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
      },
      async () => {
        const conversation = await this.getConversationRecord(input.tenantId, input.conversationId);
        if (!conversation) {
          throw new Error('Conversation not found for tenant');
        }
        if (!canWrite(conversation, input.userId)) {
          throw new Error('User not authorised for conversation');
        }

        const messageLookup = (await this.client
          .from('conversation_messages_view')
          .select('id, metadata, tenant_id, conversation_id')
          .eq('id', input.messageId)
          .maybeSingle()) as { data: SupabaseConversationMessageRow | null; error: SupabaseError | null };

        const { data: messageRow, error: messageError } = messageLookup;

        if (messageError) {
          throw new Error(`Failed to load message: ${messageError.message}`);
        }

        if (!messageRow || messageRow.tenant_id !== input.tenantId || messageRow.conversation_id !== input.conversationId) {
          throw new Error('Message not found for tenant conversation');
        }

        const deletedAt = new Date().toISOString();
        const existingMetadata = (messageRow as { metadata?: Record<string, unknown> | null }).metadata ?? {};
        const nextMetadata = {
          ...existingMetadata,
          deletedAt,
          supersededBy: input.supersededBy ?? (existingMetadata as { supersededBy?: string }).supersededBy ?? null,
        } satisfies Record<string, unknown>;

        const { error: updateError } = await this.internalClient
          .from('conversation_messages')
          .update({ metadata: nextMetadata })
          .eq('id', input.messageId)
          .eq('conversation_id', input.conversationId)
          .eq('tenant_id', input.tenantId);

        if (updateError) {
          throw new Error(`Failed to soft delete message: ${updateError.message}`);
        }

        const { error: conversationUpdateError } = await this.internalClient
          .from('conversations')
          .update({ updated_at: deletedAt })
          .eq('id', input.conversationId)
          .eq('tenant_id', input.tenantId);

        if (conversationUpdateError) {
          throw new Error(`Failed to update conversation metadata: ${conversationUpdateError.message}`);
        }
      }
    );
  }

  async getMessages(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    limit?: number;
  }): Promise<ConversationMessage[]> {
    const conversation = await this.getConversationRecord(input.tenantId, input.conversationId);
    if (!conversation || !canRead(conversation, input.userId)) {
      return [];
    }

    const query = this.client
      .from('conversation_messages_view')
      .select(
        'id, conversation_id, tenant_id, user_id, trace_id, root_span_name, root_span_id, role, content, metadata, created_at'
      )
      .eq('conversation_id', input.conversationId)
      .eq('tenant_id', input.tenantId)
      .order('created_at', { ascending: true });

    if (input.limit) {
      query.limit(input.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch conversation messages: ${error.message}`);
    }

    if (!data) return [];
    return (data as SupabaseConversationMessageRow[]).map(mapMessageRow);
  }

  async listConversations(input: {
    tenantId: string
    limit?: number
    userId?: string | null
    status?: 'active' | 'archived' | 'all'
  }): Promise<ConversationRecord[]> {
    const query = this.client
      .from('conversations_view')
      .select(
        'id, tenant_id, user_id, trace_id, root_span_name, root_span_id, share_audience, tenant_access, authorization_model, authorization_spec, persona_id, jurisdictions, title, archived_at, created_at, updated_at, last_message_at'
      )
      .eq('tenant_id', input.tenantId)


    if (input.status === 'active') {
      query.is('archived_at', null);
    } else if (input.status === 'archived') {
      query.not('archived_at', 'is', null);
    }

    query.order('last_message_at', { ascending: false, nulls: 'last' }).order('created_at', { ascending: false });

    if (input.limit) {
      query.limit(input.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list conversations: ${error.message}`);
    }

    const records = (data as SupabaseConversationRow[]).map(mapConversationRow);
    return records.filter(record => canRead(record, input.userId ?? null));
  }

  async getConversation(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
  }): Promise<ConversationRecord | null> {
    const record = await this.getConversationRecord(input.tenantId, input.conversationId);
    if (!record) return null;
    if (!canRead(record, input.userId ?? null)) return null;
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
    return this.wrapMutation(
      {
        operation: 'update',
        table: 'conversations',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
      },
      async () => {
        const record = await this.getConversationRecord(input.tenantId, input.conversationId);
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

        const { error } = await this.internalClient
          .from('conversations')
          .update({
            share_audience: shareAudience,
            tenant_access: tenantAccess,
            authorization_model: authorizationModel,
            authorization_spec: authorizationSpec,
            title,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.conversationId)
          .eq('tenant_id', input.tenantId);

        if (error) {
          throw new Error(`Failed to update conversation sharing: ${error.message}`);
        }
      }
    );
  }

  async setArchivedState(input: { tenantId: string; conversationId: string; userId?: string | null; archived: boolean }) {
    return this.wrapMutation(
      {
        operation: 'update',
        table: 'conversations',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
      },
      async () => {
        const record = await this.getConversationRecord(input.tenantId, input.conversationId);
        if (!record) {
          throw new Error('Conversation not found for tenant');
        }

        const isOwner = record.userId ? input.userId === record.userId : true;
        if (!isOwner) {
          throw new Error('User not authorised to update conversation');
        }

        const { error } = await this.internalClient
          .from('conversations')
          .update({
            archived_at: input.archived ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.conversationId)
          .eq('tenant_id', input.tenantId);

        if (error) {
          throw new Error(`Failed to update archived state: ${error.message}`);
        }
      }
    );
  }
}

export class SupabaseConversationContextStore implements ConversationContextStore {
  private readonly internalClient: SupabaseLikeClient;

  constructor(private client: SupabaseLikeClient, internalClient?: SupabaseLikeClient) {
    this.internalClient = internalClient ?? client;
  }

  async load(identity: ConversationIdentity): Promise<ConversationContext | null> {
    const { data, error } = await this.client
      .from('conversation_contexts_view')
      .select('conversation_id, tenant_id, active_node_ids, trace_id, updated_at')
      .eq('conversation_id', identity.conversationId)
      .eq('tenant_id', identity.tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load conversation context: ${error.message}`);
    }

    if (!data) return null;
    const row = data as SupabaseConversationContextRow;
    return {
      activeNodeIds: row.active_node_ids ?? [],
      traceId: row.trace_id,
    } satisfies ConversationContext;
  }

  async save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void> {
    await withSpan(
      'db.supabase.mutation',
      {
        [SEMATTRS_DB_SYSTEM]: 'postgresql',
        [SEMATTRS_DB_NAME]: 'supabase',
        [SEMATTRS_DB_OPERATION]: 'upsert',
        [SEMATTRS_DB_SQL_TABLE]: 'conversation_contexts',
        'app.tenant.id': identity.tenantId,
        'app.conversation.id': identity.conversationId,
      },
      async () => {
        const { error } = await this.internalClient
          .from('conversation_contexts')
          .upsert({
            conversation_id: identity.conversationId,
            tenant_id: identity.tenantId,
            active_node_ids: ctx.activeNodeIds ?? [],
            trace_id: ctx.traceId ?? null,
            updated_at: new Date().toISOString(),
          });

        if (error) {
          throw new Error(`Failed to save conversation context: ${error.message}`);
        }
      }
    );
  }

  async mergeActiveNodeIds(
    identity: ConversationIdentity,
    nodeIds: string[],
    options?: { traceId?: string | null }
  ): Promise<void> {
    const current = (await this.load(identity)) ?? { activeNodeIds: [] };
    const merged = Array.from(new Set([...(current.activeNodeIds ?? []), ...nodeIds]));
    await this.save(identity, { activeNodeIds: merged, traceId: options?.traceId ?? current.traceId });
  }
}
