import { randomUUID } from 'crypto';
import type {
  ChatMessage,
  ConversationContext,
  ConversationContextStore,
  ConversationIdentity,
} from '@reg-copilot/reg-intel-core';
import { createKeyValueClient, createPassThroughRedis, type ResolvedBackend, type RedisKeyValueClient } from '@reg-copilot/reg-intel-cache';
import { createLogger, withSpan } from '@reg-copilot/reg-intel-observability';
import { SEMATTRS_DB_SYSTEM, SEMATTRS_DB_NAME, SEMATTRS_DB_OPERATION, SEMATTRS_DB_SQL_TABLE } from '@opentelemetry/semantic-conventions';

export type ShareAudience = 'private' | 'tenant' | 'public';
export type TenantAccess = 'view' | 'edit';
export type AuthorizationModel = 'supabase_rbac' | 'openfga';

export type SupabaseError = { message: string };

export type SupabaseLikeClient = {
  from(table: string): any;
  schema?(schema: string): SupabaseLikeClient;
  rpc?(fn: string, params?: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
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
  activePathId?: string | null;
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
  // Note: supersededBy removed - migrated to path-based versioning (Dec 2024)
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
    // Note: supersededBy parameter removed - use path-based branching instead
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
    cursor?: string | null;
  }): Promise<{
    conversations: ConversationRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;

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

  /**
   * Get conversations that may need compaction
   * Used by auto-compaction job to identify conversations to process
   *
   * @param filters Query filters
   * @param limit Maximum number of conversations to return
   * @returns List of conversation metadata for compaction candidates
   */
  getConversationsNeedingCompaction?(filters: {
    messageCountGt?: number;
    lastActivityAfter?: Date;
    lastCompactionBefore?: Date;
  }, limit: number): Promise<Array<{
    id: string;
    tenantId: string;
    activePathId?: string;
  }>>;
}

function resolveShareAudience(input: { shareAudience?: ShareAudience }): ShareAudience {
  if (input.shareAudience) return input.shareAudience;
  return 'private';
}

function resolveTenantAccess(input: { tenantAccess?: TenantAccess }) {
  if (input.tenantAccess) return input.tenantAccess;
  return 'view';
}

const baseConversationLogger = createLogger('ConversationStore');

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

/**
 * Encode a cursor for pagination
 * Format: base64(timestamp:id)
 */
function encodeCursor(timestamp: number, id: string): string {
  return Buffer.from(`${timestamp}:${id}`).toString('base64');
}

/**
 * Decode a cursor for pagination
 * Returns null if cursor is invalid
 */
function decodeCursor(cursor: string): { timestamp: number; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [timestampStr, id] = decoded.split(':');
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || !id) return null;
    return { timestamp, id };
  } catch (error) {
    baseConversationLogger.debug({
      cursor: cursor.substring(0, 20), // Log only first 20 chars to avoid exposing full cursor
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to decode cursor');
    return null;
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
  active_path_id?: string | null;
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
  root_span_name?: string | null;
  root_span_id?: string | null;
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
    activePathId: row.active_path_id,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
  };
}

function mapMessageRow(row: SupabaseConversationMessageRow): ConversationMessage {
  const metadata = row.metadata ?? undefined;
  const deletedAtValue = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).deletedAt : undefined;
  // Note: supersededBy extraction removed - migrated to path-based versioning

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
  };
}

export class SupabaseConversationStore implements ConversationStore {
  private readonly internalClient: SupabaseLikeClient;
  private logger = baseConversationLogger.child({ store: 'supabase' });

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
      async () => {
        this.logger.debug({
          operation: input.operation,
          table: input.table,
          tenantId: input.tenantId,
          conversationId: input.conversationId,
        }, `DB ${input.operation.toUpperCase()} on ${input.table}`);
        return fn();
      }
    );
  }

  private wrapQuery<T>(
    input: { operation: string; table: string; tenantId: string; conversationId?: string },
    fn: () => Promise<T>
  ) {
    return withSpan(
      'db.supabase.query',
      {
        [SEMATTRS_DB_SYSTEM]: 'postgresql',
        [SEMATTRS_DB_NAME]: 'supabase',
        [SEMATTRS_DB_OPERATION]: input.operation,
        [SEMATTRS_DB_SQL_TABLE]: input.table,
        'app.tenant.id': input.tenantId,
        ...(input.conversationId ? { 'app.conversation.id': input.conversationId } : {}),
      },
      async () => {
        this.logger.debug({
          operation: input.operation,
          table: input.table,
          tenantId: input.tenantId,
          conversationId: input.conversationId,
        }, `DB ${input.operation.toUpperCase()} on ${input.table}`);
        return fn();
      }
    );
  }

  private async getConversationRecord(
    tenantId: string,
    conversationId: string
  ): Promise<ConversationRecord | null> {
    return this.wrapQuery(
      { operation: 'select', table: 'conversations_view', tenantId, conversationId },
      async () => {
        const { data, error } = await this.client
          .from('conversations_view')
          .select(
            'id, tenant_id, user_id, trace_id, root_span_name, root_span_id, share_audience, tenant_access, authorization_model, authorization_spec, persona_id, jurisdictions, title, active_path_id, archived_at, created_at, updated_at, last_message_at'
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
    );
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
        this.logger.info({
          tenantId: input.tenantId,
          userId: input.userId,
          shareAudience,
          tenantAccess,
        }, 'Creating Supabase conversation');

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

        const conversationId = (data as { id: string }).id;

        // Create primary path for the conversation
        const { data: pathData, error: pathError } = await this.internalClient
          .from('conversation_paths')
          .insert({
            conversation_id: conversationId,
            tenant_id: input.tenantId,
            name: 'Main',
            is_primary: true,
            is_active: true,
            created_at: now,
            updated_at: now,
          })
          .select('id')
          .single();

        if (pathError) {
          throw new Error(`Failed to create primary path: ${pathError.message}`);
        }

        const pathId = (pathData as { id: string }).id;

        // Update conversation with active_path_id
        const { error: updateError } = await this.internalClient
          .from('conversations')
          .update({ active_path_id: pathId })
          .eq('id', conversationId)
          .eq('tenant_id', input.tenantId);

        if (updateError) {
          throw new Error(`Failed to set active path: ${updateError.message}`);
        }

        return { conversationId };
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
    pathId?: string | null;
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

        this.logger.info({
          conversationId: input.conversationId,
          tenantId: input.tenantId,
          role: input.role,
          userId: input.userId,
        }, 'Appending Supabase conversation message');

        // Use explicit pathId if provided, otherwise ensure conversation has an active path
        let pathId = input.pathId ?? conversation.activePathId;
        if (!pathId) {
          // Create a primary path for the conversation
          const { data: pathData, error: pathError } = await this.internalClient
            .from('conversation_paths')
            .insert({
              conversation_id: input.conversationId,
              tenant_id: input.tenantId,
              name: 'Main',
              is_primary: true,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (pathError) {
            throw new Error(`Failed to create primary path: ${pathError.message}`);
          }

          pathId = (pathData as { id: string }).id;

          // Update conversation's active_path_id
          const { error: updateError } = await this.internalClient
            .from('conversations')
            .update({ active_path_id: pathId })
            .eq('id', input.conversationId)
            .eq('tenant_id', input.tenantId);

          if (updateError) {
            throw new Error(`Failed to update conversation active path: ${updateError.message}`);
          }
        }

        const messageTimestamp = new Date().toISOString();
        const mergedMetadata = input.traceId
          ? { ...(input.metadata ?? {}), traceId: input.traceId }
          : input.metadata;
        const { data, error } = await this.internalClient
          .from('conversation_messages')
          .insert({
            conversation_id: input.conversationId,
            path_id: pathId,
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

        this.logger.info({
          conversationId: input.conversationId,
          tenantId: input.tenantId,
          messageId: input.messageId,
        }, 'Soft deleting Supabase conversation message');

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
          // Note: supersededBy removed - use path-based branching instead
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
    cursor?: string | null
  }): Promise<{
    conversations: ConversationRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    return this.wrapQuery(
      { operation: 'select', table: 'conversations_view', tenantId: input.tenantId },
      async () => {
        const limit = input.limit ?? 50;
        const cursorData = input.cursor ? decodeCursor(input.cursor) : null;

        const query = this.client
          .from('conversations_view')
          .select(
            'id, tenant_id, user_id, trace_id, root_span_name, root_span_id, share_audience, tenant_access, authorization_model, authorization_spec, persona_id, jurisdictions, title, active_path_id, archived_at, created_at, updated_at, last_message_at'
          )
          .eq('tenant_id', input.tenantId);

        // Apply status filter
        if (input.status === 'active') {
          query.is('archived_at', null);
        } else if (input.status === 'archived') {
          query.not('archived_at', 'is', null);
        }

        // Apply cursor filtering for pagination
        if (cursorData) {
          const cursorDate = new Date(cursorData.timestamp).toISOString();
          // Filter: (last_message_at < cursor_date OR (last_message_at = cursor_date AND id < cursor_id))
          // Since Supabase doesn't support complex OR clauses easily, we use a different approach:
          // Get records where last_message_at <= cursor_date
          query.lte('last_message_at', cursorDate);
        }

        // Order by last_message_at DESC (nulls last), then created_at DESC, then id DESC for stability
        query
          .order('last_message_at', { ascending: false, nulls: 'last' })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });

        // Fetch limit + 1 to determine if there are more results
        query.limit(limit + 1);

        const { data, error } = await query;

        if (error) {
          throw new Error(`Failed to list conversations: ${error.message}`);
        }

        if (!data) {
          return {
            conversations: [],
            nextCursor: null,
            hasMore: false,
          };
        }

        let records = (data as SupabaseConversationRow[]).map(mapConversationRow);

        // Filter by authorization after fetching
        records = records.filter(record => canRead(record, input.userId ?? null));

        // If we have a cursor, skip records until we find the cursor record
        if (cursorData) {
          const cursorIndex = records.findIndex(r => r.id === cursorData.id);
          if (cursorIndex >= 0) {
            records = records.slice(cursorIndex + 1);
          }
        }

        // Determine if there are more results
        const hasMore = records.length > limit;
        const conversations = records.slice(0, limit);

        let nextCursor: string | null = null;
        if (hasMore && conversations.length > 0) {
          const lastConv = conversations[conversations.length - 1];
          const timestamp = lastConv.lastMessageAt?.getTime() ?? lastConv.createdAt.getTime();
          nextCursor = encodeCursor(timestamp, lastConv.id);
        }

        return {
          conversations,
          nextCursor,
          hasMore,
        };
      }
    );
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

  async getConversationsNeedingCompaction(filters: {
    messageCountGt?: number;
    lastActivityAfter?: Date;
    lastCompactionBefore?: Date;
  }, limit: number): Promise<Array<{
    id: string;
    tenantId: string;
    activePathId?: string;
  }>> {
    return this.wrapQuery(
      { operation: 'select', table: 'conversations_view', tenantId: 'system' },
      async () => {
        this.logger.info({
          messageCountGt: filters.messageCountGt,
          lastActivityAfter: filters.lastActivityAfter?.toISOString(),
          lastCompactionBefore: filters.lastCompactionBefore?.toISOString(),
          limit,
        }, 'Querying conversations needing compaction');

        // Use a raw query to join conversations with message counts and last compaction times
        // Note: Supabase doesn't support complex joins in the query builder, so we use rpc
        if (!this.internalClient.rpc) {
          this.logger.warn('Supabase client does not support RPC - returning empty set');
          return [];
        }

        const { data, error } = await this.internalClient.rpc('get_conversations_needing_compaction', {
          p_message_count_gt: filters.messageCountGt ?? 50,
          p_last_activity_after: filters.lastActivityAfter?.toISOString() ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          p_last_compaction_before: filters.lastCompactionBefore?.toISOString() ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          p_limit: limit,
        });

        if (error) {
          // If the function doesn't exist yet, log a warning and return empty
          if (error.message?.includes('function') && error.message?.includes('does not exist')) {
            this.logger.warn('Database function get_conversations_needing_compaction does not exist - returning empty set');
            return [];
          }
          throw new Error(`Failed to query conversations needing compaction: ${error.message}`);
        }

        if (!data || !Array.isArray(data)) {
          return [];
        }

        return data.map((row: any) => ({
          id: row.conversation_id,
          tenantId: row.tenant_id,
          activePathId: row.active_path_id,
        }));
      }
    );
  }
}

export class SupabaseConversationContextStore implements ConversationContextStore {
  private readonly internalClient: SupabaseLikeClient;
  private logger = baseConversationLogger.child({ store: 'supabase', entity: 'context' });

  constructor(private client: SupabaseLikeClient, internalClient?: SupabaseLikeClient) {
    this.internalClient = internalClient ?? client;
  }

  async load(identity: ConversationIdentity): Promise<ConversationContext | null> {
    const { data, error } = await this.client
      .from('conversation_contexts_view')
      .select(
        'conversation_id, tenant_id, active_node_ids, trace_id, root_span_name, root_span_id, updated_at'
      )
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
      rootSpanName: row.root_span_name,
      rootSpanId: row.root_span_id,
    } satisfies ConversationContext;
  }

  async save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void> {
    this.logger.info({
      conversationId: identity.conversationId,
      tenantId: identity.tenantId,
      activeNodeCount: ctx.activeNodeIds?.length ?? 0,
    }, 'Saving Supabase conversation context');
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
            root_span_name: ctx.rootSpanName ?? null,
            root_span_id: ctx.rootSpanId ?? null,
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
    options?: { traceId?: string | null; rootSpanName?: string | null; rootSpanId?: string | null }
  ): Promise<void> {
    const current = (await this.load(identity)) ?? { activeNodeIds: [] };
    const merged = Array.from(new Set([...(current.activeNodeIds ?? []), ...nodeIds]));
    this.logger.info({
      conversationId: identity.conversationId,
      tenantId: identity.tenantId,
      added: nodeIds.length,
      total: merged.length,
    }, 'Merging Supabase active node ids');
    await this.save(identity, {
      activeNodeIds: merged,
      traceId: options?.traceId ?? current.traceId,
      rootSpanName: options?.rootSpanName ?? current.rootSpanName,
      rootSpanId: options?.rootSpanId ?? current.rootSpanId,
    });
  }
}

// =============================================================================
// Caching Layer (Optional)
// =============================================================================

export interface CachingConversationStoreOptions {
  /** TTL in seconds (default: 60 = 1 minute for active conversations) */
  ttlSeconds?: number;
  /** Key prefix (default: 'copilot:conv:conversation') */
  keyPrefix?: string;
}

export class CachingConversationStore implements ConversationStore {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly backing: ConversationStore,
    private readonly redis: RedisKeyValueClient,
    options: CachingConversationStoreOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 60; // Shorter TTL for active data
    this.keyPrefix = options.keyPrefix ?? 'copilot:conv:conversation';
  }

  private cacheKey(conversationId: string): string {
    return `${this.keyPrefix}:${conversationId}`;
  }

  async getConversation(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
  }): Promise<ConversationRecord | null> {
    const key = this.cacheKey(input.conversationId);

    // Try cache first
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const record = JSON.parse(cached) as ConversationRecord;
        // Verify tenant matches (security check)
        if (record.tenantId === input.tenantId) {
          // Restore Date objects
          record.createdAt = new Date(record.createdAt);
          record.updatedAt = new Date(record.updatedAt);
          if (record.lastMessageAt) record.lastMessageAt = new Date(record.lastMessageAt);
          if (record.archivedAt) record.archivedAt = new Date(record.archivedAt);
          return record;
        }
        // Tenant mismatch - invalidate and fetch fresh
        await this.redis.del(key);
      }
    } catch {
      // Cache error - continue to backing store
    }

    // Fetch from backing store
    const record = await this.backing.getConversation(input);

    // Cache the result
    if (record) {
      try {
        await this.redis.set(key, JSON.stringify(record), this.ttlSeconds);
      } catch {
        // Ignore cache write errors
      }
    }

    return record;
  }

  // Write-through methods - invalidate cache after write
  async appendMessage(input: Parameters<ConversationStore['appendMessage']>[0]): Promise<{ messageId: string }> {
    const result = await this.backing.appendMessage(input);
    await this.invalidate(input.conversationId);
    return result;
  }

  async updateSharing(input: Parameters<ConversationStore['updateSharing']>[0]): Promise<void> {
    await this.backing.updateSharing(input);
    await this.invalidate(input.conversationId);
  }

  async setArchivedState(input: Parameters<ConversationStore['setArchivedState']>[0]): Promise<void> {
    await this.backing.setArchivedState(input);
    await this.invalidate(input.conversationId);
  }

  async softDeleteMessage(input: Parameters<ConversationStore['softDeleteMessage']>[0]): Promise<void> {
    await this.backing.softDeleteMessage(input);
    await this.invalidate(input.conversationId);
  }

  // Pass-through methods (no caching benefit)
  async createConversation(input: Parameters<ConversationStore['createConversation']>[0]) {
    return this.backing.createConversation(input);
  }

  async getMessages(input: Parameters<ConversationStore['getMessages']>[0]) {
    return this.backing.getMessages(input);
  }

  async listConversations(input: Parameters<ConversationStore['listConversations']>[0]) {
    return this.backing.listConversations(input);
  }

  async getConversationsNeedingCompaction(filters: {
    messageCountGt?: number;
    lastActivityAfter?: Date;
    lastCompactionBefore?: Date;
  }, limit: number) {
    if (this.backing.getConversationsNeedingCompaction) {
      return this.backing.getConversationsNeedingCompaction(filters, limit);
    }
    return [];
  }

  private async invalidate(conversationId: string): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(conversationId));
    } catch {
      // Ignore invalidation errors
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export interface ConversationStoreFactoryOptions {
  supabase?: SupabaseLikeClient;
  supabaseInternal?: SupabaseLikeClient;
  redis?: RedisKeyValueClient;
  redisBackend?: ResolvedBackend | null;
  cacheTtlSeconds?: number;
  enableCaching?: boolean; // Default: true (uses caching when Redis is available)
}

/**
 * Create conversation store with transparent failover
 *
 * CRITICAL: This function ALWAYS returns CachingConversationStore regardless of Redis availability.
 * Factory function NEVER returns different types based on infrastructure.
 *
 * When Redis unavailable:
 * - Uses PassThroughRedis (all cache operations are no-ops)
 * - Transparently falls back to Supabase on every request
 * - Application behavior is identical (just slower)
 *
 * Pattern matches: Phase 1-3 transparent failover implementations
 *
 * @returns CachingConversationStore instance - ALWAYS returns caching wrapper
 */
export function createConversationStore(
  options: ConversationStoreFactoryOptions
): ConversationStore {
  if (!options.supabase) {
    throw new Error('Supabase client is required to create a ConversationStore');
  }

  const supabaseStore = new SupabaseConversationStore(
    options.supabase,
    options.supabaseInternal
  );

  // ✅ ALWAYS return CachingConversationStore - factory never returns different types
  // Determine Redis client: provided > from backend > PassThroughRedis
  let redisClient: RedisKeyValueClient;

  if (options.redis) {
    redisClient = options.redis;
  } else if (options.redisBackend) {
    // createKeyValueClient may return null if client creation fails
    // Fall back to PassThroughRedis for transparent failover
    redisClient = createKeyValueClient(options.redisBackend) ?? createPassThroughRedis();
  } else {
    // ✅ Use PassThroughRedis when Redis unavailable (transparent failover)
    redisClient = createPassThroughRedis();
  }

  // ✅ ALWAYS return CachingConversationStore, even with PassThroughRedis
  // CachingConversationStore handles errors internally (try-catch)
  return new CachingConversationStore(supabaseStore, redisClient, {
    ttlSeconds: options.cacheTtlSeconds ?? 60,
  });
}
