import { randomUUID } from 'crypto';
import { Pool, type PoolConfig } from 'pg';
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

type ConversationRow = {
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
};

type ConversationMessageRow = {
  id: string;
  conversation_id: string;
  tenant_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ConversationContextRow = {
  conversation_id: string;
  tenant_id: string;
  active_node_ids: string[];
  summary: string | null;
  updated_at: string;
};

type OrderOption = {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
  nullsLast?: boolean;
};

type FilterValue = string | number | boolean | null | undefined;

interface DatabaseClient {
  select<T>(input: {
    table: string;
    filters?: Record<string, FilterValue>;
    order?: OrderOption[];
    limit?: number;
    select?: string;
    single?: boolean;
  }): Promise<T[]>;

  insert<T>(input: { table: string; body: unknown; select?: string }): Promise<T[]>;

  update<T>(input: {
    table: string;
    body: unknown;
    filters: Record<string, FilterValue>;
    select?: string;
  }): Promise<T[]>;

  upsert<T>(input: {
    table: string;
    body: unknown;
    select?: string;
    onConflict?: string[];
  }): Promise<T[]>;
}

class SupabaseRestClient implements DatabaseClient {
  constructor(private config: { supabaseUrl: string; serviceRoleKey: string }) {}

  private buildParams(input: {
    filters?: Record<string, FilterValue>;
    order?: OrderOption[];
    limit?: number;
    select?: string;
    onConflict?: string[];
  }) {
    const params = new URLSearchParams();
    params.set('select', input.select ?? '*');

    if (input.filters) {
      for (const [key, value] of Object.entries(input.filters)) {
        if (value === undefined) continue;
        if (value === null) {
          params.append(key, 'is.null');
        } else {
          params.append(key, `eq.${value}`);
        }
      }
    }

    if (input.limit !== undefined) {
      params.set('limit', String(input.limit));
    }

    if (input.order) {
      for (const order of input.order) {
        const fragments = [order.column, order.ascending === false ? 'desc' : 'asc'];
        if (order.nullsFirst) {
          fragments.push('nullsfirst');
        }
        if (order.nullsLast) {
          fragments.push('nullslast');
        }
        params.append('order', fragments.join('.'));
      }
    }

    if (input.onConflict?.length) {
      params.set('on_conflict', input.onConflict.join(','));
    }

    return params;
  }

  private async request<T>(input: {
    table: string;
    method: 'GET' | 'POST' | 'PATCH';
    filters?: Record<string, FilterValue>;
    order?: OrderOption[];
    limit?: number;
    select?: string;
    body?: unknown;
    single?: boolean;
    upsert?: boolean;
    onConflict?: string[];
  }): Promise<T[]> {
    const params = this.buildParams({
      filters: input.filters,
      order: input.order,
      limit: input.limit,
      select: input.select,
      onConflict: input.onConflict,
    });

    const preferDirectives: string[] = [];
    if (input.upsert) {
      preferDirectives.push('resolution=merge-duplicates');
    }
    if (input.method !== 'GET') {
      preferDirectives.push('return=representation');
    }

    const url = `${this.config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${input.table}?${params.toString()}`;
    const response = await fetch(url, {
      method: input.method,
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...(preferDirectives.length ? { Prefer: preferDirectives.join(',') } : {}),
      },
      body: input.method === 'GET' ? undefined : JSON.stringify(input.body ?? {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase request failed (${response.status}): ${errorText}`);
    }

    if (response.status === 204) {
      return [];
    }

    const data = (await response.json()) as T[];
    if (input.single) {
      return data.slice(0, 1);
    }
    return data;
  }

  async select<T>(input: {
    table: string;
    filters?: Record<string, FilterValue>;
    order?: OrderOption[];
    limit?: number;
    select?: string;
    single?: boolean;
  }): Promise<T[]> {
    return this.request<T>({ ...input, method: 'GET' });
  }

  async insert<T>(input: { table: string; body: unknown; select?: string }): Promise<T[]> {
    return this.request<T>({ ...input, method: 'POST' });
  }

  async update<T>(input: {
    table: string;
    body: unknown;
    filters: Record<string, FilterValue>;
    select?: string;
  }): Promise<T[]> {
    return this.request<T>({ ...input, method: 'PATCH' });
  }

  async upsert<T>(input: {
    table: string;
    body: unknown;
    select?: string;
    onConflict?: string[];
  }): Promise<T[]> {
    return this.request<T>({ ...input, method: 'POST', upsert: true, onConflict: input.onConflict });
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteTable(table: string) {
  const [schema, name] = table.includes('.') ? table.split('.') : [null, table];
  if (schema) {
    return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
  }
  return quoteIdentifier(name);
}

class PostgresClient implements DatabaseClient {
  private pool: Pool;

  constructor(config: PoolConfig | string) {
    this.pool = new Pool(config as PoolConfig);
  }

  private buildWhere(filters?: Record<string, FilterValue>) {
    const clauses: string[] = [];
    const values: FilterValue[] = [];

    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value === undefined) continue;
      if (value === null) {
        clauses.push(`${quoteIdentifier(key)} IS NULL`);
      } else {
        values.push(value);
        clauses.push(`${quoteIdentifier(key)} = $${values.length}`);
      }
    }

    return { clauses, values };
  }

  private buildOrder(order?: OrderOption[]) {
    if (!order?.length) return '';
    return (
      ' ORDER BY ' +
      order
        .map(opt => {
          const parts = [quoteIdentifier(opt.column), opt.ascending === false ? 'DESC' : 'ASC'];
          if (opt.nullsFirst) parts.push('NULLS FIRST');
          if (opt.nullsLast) parts.push('NULLS LAST');
          return parts.join(' ');
        })
        .join(', ')
    );
  }

  async select<T>(input: {
    table: string;
    filters?: Record<string, FilterValue>;
    order?: OrderOption[];
    limit?: number;
    select?: string;
    single?: boolean;
  }): Promise<T[]> {
    const columns = input.select ?? '*';
    const { clauses, values } = this.buildWhere(input.filters);
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const order = this.buildOrder(input.order);
    const limit = input.limit ? ` LIMIT ${input.limit}` : '';

    const result = await this.pool.query<T>(
      `SELECT ${columns} FROM ${quoteTable(input.table)}${where}${order}${limit};`,
      values as any[],
    );

    if (input.single) {
      return result.rows.slice(0, 1);
    }
    return result.rows;
  }

  async insert<T>(input: { table: string; body: unknown; select?: string }): Promise<T[]> {
    const payload = input.body as Record<string, unknown>;
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
    const columns = entries.map(([key]) => quoteIdentifier(key)).join(', ');
    const placeholders = entries.map(([, _], idx) => `$${idx + 1}`).join(', ');
    const values = entries.map(([, value]) => value);
    const returning = input.select ?? '*';

    const result = await this.pool.query<T>(
      `INSERT INTO ${quoteTable(input.table)} (${columns}) VALUES (${placeholders}) RETURNING ${returning};`,
      values,
    );

    return result.rows;
  }

  async update<T>(input: {
    table: string;
    body: unknown;
    filters: Record<string, FilterValue>;
    select?: string;
  }): Promise<T[]> {
    const payload = input.body as Record<string, unknown>;
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
    const setClauses = entries.map(([key], idx) => `${quoteIdentifier(key)} = $${idx + 1}`);
    const setValues = entries.map(([, value]) => value);

    const { clauses, values } = this.buildWhere(input.filters);
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const returning = input.select ?? '*';

    const result = await this.pool.query<T>(
      `UPDATE ${quoteTable(input.table)} SET ${setClauses.join(', ')}${where} RETURNING ${returning};`,
      [...setValues, ...values] as any[],
    );

    return result.rows;
  }

  async upsert<T>(input: {
    table: string;
    body: unknown;
    select?: string;
    onConflict?: string[];
  }): Promise<T[]> {
    const payload = input.body as Record<string, unknown>;
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
    const columns = entries.map(([key]) => quoteIdentifier(key)).join(', ');
    const placeholders = entries.map(([, _], idx) => `$${idx + 1}`).join(', ');
    const values = entries.map(([, value]) => value);
    const conflictColumns = input.onConflict?.length
      ? input.onConflict.map(quoteIdentifier).join(', ')
      : quoteIdentifier('id');
    const setClause = entries
      .map(([key]) => `${quoteIdentifier(key)} = EXCLUDED.${quoteIdentifier(key)}`)
      .join(', ');
    const returning = input.select ?? '*';

    const result = await this.pool.query<T>(
      `INSERT INTO ${quoteTable(input.table)} (${columns}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns}) DO UPDATE SET ${setClause} RETURNING ${returning};`,
      values,
    );

    return result.rows;
  }
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

function toConversationRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    shareAudience: row.share_audience,
    tenantAccess: row.tenant_access,
    authorizationModel: row.authorization_model,
    authorizationSpec: row.authorization_spec,
    personaId: row.persona_id,
    jurisdictions: row.jurisdictions,
    title: row.title,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
  };
}

function toConversationMessage(row: ConversationMessageRow): ConversationMessage {
  const deletedAt =
    typeof row.metadata?.deletedAt === 'string' || row.metadata?.deletedAt instanceof Date
      ? new Date(row.metadata.deletedAt as string | number)
      : undefined;
  const supersededBy = typeof row.metadata?.supersededBy === 'string'
    ? (row.metadata.supersededBy as string)
    : undefined;

  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata ?? undefined,
    createdAt: new Date(row.created_at),
    deletedAt,
    supersededBy,
  } satisfies ConversationMessage;
}

interface ConversationPersistence {
  createConversation(input: {
    tenantId: string;
    userId?: string | null;
    personaId?: string | null;
    jurisdictions?: string[];
    title?: string | null;
    shareAudience: ShareAudience;
    tenantAccess: TenantAccess;
    authorizationModel: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
  }): Promise<ConversationRecord>;

  getConversation(tenantId: string, conversationId: string): Promise<ConversationRecord | null>;

  listConversations(tenantId: string): Promise<ConversationRecord[]>;

  addMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessage>;

  softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;

  getMessages(input: { tenantId: string; conversationId: string; limit?: number }): Promise<ConversationMessage[]>;

  updateSharing(input: {
    tenantId: string;
    conversationId: string;
    shareAudience: ShareAudience;
    tenantAccess: TenantAccess;
    authorizationModel: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
    title?: string | null;
  }): Promise<void>;
}

class InMemoryConversationPersistence implements ConversationPersistence {
  private conversations = new Map<string, ConversationRecord>();
  private messages = new Map<string, ConversationMessage[]>();

  async createConversation(input: {
    tenantId: string;
    userId?: string | null;
    personaId?: string | null;
    jurisdictions?: string[];
    title?: string | null;
    shareAudience: ShareAudience;
    tenantAccess: TenantAccess;
    authorizationModel: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
  }): Promise<ConversationRecord> {
    const id = randomUUID();
    const now = new Date();
    const record: ConversationRecord = {
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      shareAudience: input.shareAudience,
      tenantAccess: input.tenantAccess,
      authorizationModel: input.authorizationModel,
      authorizationSpec: input.authorizationSpec,
      personaId: input.personaId ?? null,
      jurisdictions: input.jurisdictions ?? [],
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    };
    this.conversations.set(id, record);
    this.messages.set(id, []);
    return record;
  }

  async getConversation(tenantId: string, conversationId: string): Promise<ConversationRecord | null> {
    const record = this.conversations.get(conversationId);
    if (!record || record.tenantId !== tenantId) return null;
    return record;
  }

  async listConversations(tenantId: string): Promise<ConversationRecord[]> {
    return Array.from(this.conversations.values()).filter(record => record.tenantId === tenantId);
  }

  async addMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessage> {
    const record = await this.getConversation(input.tenantId, input.conversationId);
    if (!record) {
      throw new Error('Conversation not found for tenant');
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
    return message;
  }

  async softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const record = await this.getConversation(input.tenantId, input.conversationId);
    if (!record) {
      throw new Error('Conversation not found for tenant');
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
      supersededBy: (input.metadata.supersededBy as string | undefined) ?? target.supersededBy ?? null,
      metadata: { ...(target.metadata ?? {}), ...input.metadata },
    };

    this.messages.set(input.conversationId, existing);
    record.updatedAt = new Date();
    this.conversations.set(input.conversationId, record);
  }

  async getMessages(input: { tenantId: string; conversationId: string; limit?: number }): Promise<ConversationMessage[]> {
    const record = await this.getConversation(input.tenantId, input.conversationId);
    if (!record) return [];
    const msgs = this.messages.get(input.conversationId) ?? [];
    if (input.limit && msgs.length > input.limit) {
      return msgs.slice(msgs.length - input.limit);
    }
    return msgs;
  }

  async updateSharing(input: {
    tenantId: string;
    conversationId: string;
    shareAudience: ShareAudience;
    tenantAccess: TenantAccess;
    authorizationModel: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
    title?: string | null;
  }): Promise<void> {
    const record = await this.getConversation(input.tenantId, input.conversationId);
    if (!record) {
      throw new Error('Conversation not found for tenant');
    }

    this.conversations.set(input.conversationId, {
      ...record,
      shareAudience: input.shareAudience,
      tenantAccess: input.tenantAccess,
      authorizationModel: input.authorizationModel,
      authorizationSpec: input.authorizationSpec,
      title: input.title,
    });
  }
}

class DatabaseConversationPersistence implements ConversationPersistence {
  constructor(private db: DatabaseClient) {}

  async createConversation(input: {
    tenantId: string;
    userId?: string | null;
    personaId?: string | null;
    jurisdictions?: string[];
    title?: string | null;
    shareAudience: ShareAudience;
    tenantAccess: TenantAccess;
    authorizationModel: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
  }): Promise<ConversationRecord> {
    const [row] = await this.db.insert<ConversationRow>({
      table: 'copilot_internal.conversations',
      body: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        user_id: input.userId ?? null,
        persona_id: input.personaId ?? null,
        jurisdictions: input.jurisdictions ?? [],
        title: input.title ?? null,
        share_audience: input.shareAudience,
        tenant_access: input.tenantAccess,
        authorization_model: input.authorizationModel,
        authorization_spec: input.authorizationSpec ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    if (!row) {
      throw new Error('Failed to create conversation: no record returned');
    }

    return toConversationRecord(row);
  }

  async getConversation(tenantId: string, conversationId: string): Promise<ConversationRecord | null> {
    const [row] = await this.db.select<ConversationRow>({
      table: 'copilot_internal.conversations',
      filters: { id: conversationId, tenant_id: tenantId },
      single: true,
    });

    return row ? toConversationRecord(row) : null;
  }

  async listConversations(tenantId: string): Promise<ConversationRecord[]> {
    const rows = await this.db.select<ConversationRow>({
      table: 'copilot_internal.conversations',
      filters: { tenant_id: tenantId },
      order: [
        { column: 'last_message_at', ascending: false, nullsLast: true },
        { column: 'created_at', ascending: false },
      ],
    });

    return rows.map(toConversationRecord);
  }

  async addMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessage> {
    const createdAt = new Date().toISOString();
    const messageId = randomUUID();
    const [row] = await this.db.insert<ConversationMessageRow>({
      table: 'copilot_internal.conversation_messages',
      body: {
        id: messageId,
        conversation_id: input.conversationId,
        tenant_id: input.tenantId,
        user_id: input.userId ?? null,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? {},
        created_at: createdAt,
      },
      select: '*',
    });

    if (!row) {
      throw new Error('Failed to append message: no record returned');
    }

    await this.db.update<ConversationRow>({
      table: 'copilot_internal.conversations',
      body: {
        last_message_at: createdAt,
        updated_at: createdAt,
      },
      filters: { id: input.conversationId, tenant_id: input.tenantId },
    });

    return toConversationMessage(row);
  }

  async softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const [existingMessage] = await this.db.select<ConversationMessageRow>({
      table: 'copilot_internal.conversation_messages',
      filters: {
        id: input.messageId,
        conversation_id: input.conversationId,
        tenant_id: input.tenantId,
      },
      single: true,
    });

    if (!existingMessage) {
      throw new Error('Message not found');
    }

    await this.db.update<ConversationMessageRow>({
      table: 'copilot_internal.conversation_messages',
      body: { metadata: { ...(existingMessage.metadata ?? {}), ...input.metadata } },
      filters: {
        id: input.messageId,
        conversation_id: input.conversationId,
        tenant_id: input.tenantId,
      },
    });
  }

  async getMessages(input: { tenantId: string; conversationId: string; limit?: number }): Promise<ConversationMessage[]> {
    const rows = await this.db.select<ConversationMessageRow>({
      table: 'copilot_internal.conversation_messages',
      filters: { conversation_id: input.conversationId, tenant_id: input.tenantId },
      order: [{ column: 'created_at', ascending: false }],
      limit: input.limit,
    });

    return [...rows].reverse().map(toConversationMessage);
  }

  async updateSharing(input: {
    tenantId: string;
    conversationId: string;
    shareAudience: ShareAudience;
    tenantAccess: TenantAccess;
    authorizationModel: AuthorizationModel;
    authorizationSpec?: AuthorizationSpec | null;
    title?: string | null;
  }): Promise<void> {
    await this.db.update<ConversationRow>({
      table: 'copilot_internal.conversations',
      body: {
        share_audience: input.shareAudience,
        tenant_access: input.tenantAccess,
        authorization_model: input.authorizationModel,
        authorization_spec: input.authorizationSpec ?? {},
        title: input.title ?? null,
      },
      filters: { id: input.conversationId, tenant_id: input.tenantId },
    });
  }
}

class ConversationStoreImpl implements ConversationStore {
  constructor(private persistence: ConversationPersistence) {}

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
    const record = await this.persistence.createConversation({
      tenantId: input.tenantId,
      userId: input.userId,
      personaId: input.personaId,
      jurisdictions: input.jurisdictions,
      title: input.title,
      shareAudience: resolveShareAudience({ shareAudience: input.shareAudience }),
      tenantAccess: resolveTenantAccess({ tenantAccess: input.tenantAccess }),
      authorizationModel: input.authorizationModel ?? 'supabase_rbac',
      authorizationSpec: input.authorizationSpec,
    });

    return { conversationId: record.id };
  }

  async appendMessage(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ messageId: string }> {
    const record = await this.persistence.getConversation(input.tenantId, input.conversationId);
    if (!record) {
      throw new Error('Conversation not found for tenant');
    }
    if (!canWrite(record, input.userId, input.role)) {
      throw new Error('User not authorised for conversation');
    }

    const message = await this.persistence.addMessage(input);
    return { messageId: message.id };
  }

  async softDeleteMessage(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    userId?: string | null;
    supersededBy?: string | null;
  }): Promise<void> {
    const record = await this.persistence.getConversation(input.tenantId, input.conversationId);
    if (!record) {
      throw new Error('Conversation not found for tenant');
    }

    if (!canWrite(record, input.userId)) {
      throw new Error('User not authorised for conversation');
    }

    const deletedAt = new Date().toISOString();
    await this.persistence.softDeleteMessage({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      metadata: {
        deletedAt,
        supersededBy: input.supersededBy,
      },
    });
  }

  async getMessages(input: {
    tenantId: string;
    conversationId: string;
    userId?: string | null;
    limit?: number;
  }): Promise<ConversationMessage[]> {
    const record = await this.persistence.getConversation(input.tenantId, input.conversationId);
    if (!record || !canRead(record, input.userId)) {
      return [];
    }

    return this.persistence.getMessages({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      limit: input.limit,
    });
  }

  async listConversations(input: { tenantId: string; limit?: number; userId?: string | null }): Promise<ConversationRecord[]> {
    const records = (await this.persistence.listConversations(input.tenantId)).filter(record =>
      canRead(record, input.userId),
    );

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
    const record = await this.persistence.getConversation(input.tenantId, input.conversationId);
    if (!record || !canRead(record, input.userId)) {
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
    const record = await this.persistence.getConversation(input.tenantId, input.conversationId);

    if (!record) {
      throw new Error('Conversation not found for tenant');
    }

    const isOwner = record.userId ? input.userId === record.userId : true;
    if (!isOwner) {
      throw new Error('User not authorised to update conversation');
    }

    await this.persistence.updateSharing({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      shareAudience: input.shareAudience ?? record.shareAudience,
      tenantAccess: input.tenantAccess ?? record.tenantAccess,
      authorizationModel: input.authorizationModel ?? record.authorizationModel,
      authorizationSpec: input.authorizationSpec ?? record.authorizationSpec,
      title: input.title !== undefined ? input.title : record.title,
    });
  }
}

export class InMemoryConversationStore extends ConversationStoreImpl {
  constructor() {
    super(new InMemoryConversationPersistence());
  }
}

export class DatabaseConversationStore extends ConversationStoreImpl {
  constructor(db: DatabaseClient) {
    super(new DatabaseConversationPersistence(db));
  }
}

export function createSupabaseClient(config: {
  supabaseUrl: string;
  serviceRoleKey: string;
}): DatabaseClient {
  return new SupabaseRestClient(config);
}

export function createPostgresClient(config: PoolConfig | string): DatabaseClient {
  return new PostgresClient(config);
}

export class SupabaseConversationStore extends DatabaseConversationStore {
  constructor(client: DatabaseClient) {
    super(client);
  }
}

export class PostgresConversationStore extends DatabaseConversationStore {
  constructor(client: DatabaseClient) {
    super(client);
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

class DatabaseConversationContextStore implements ConversationContextStore {
  constructor(private db: DatabaseClient) {}

  private async getRow(identity: ConversationIdentity): Promise<ConversationContextRow | null> {
    const [row] = await this.db.select<ConversationContextRow>({
      table: 'copilot_internal.conversation_contexts',
      filters: { conversation_id: identity.conversationId, tenant_id: identity.tenantId },
      single: true,
    });

    return row ?? null;
  }

  async load(identity: ConversationIdentity): Promise<ConversationContext | null> {
    const row = await this.getRow(identity);
    if (!row) return null;
    return { activeNodeIds: row.active_node_ids ?? [] } satisfies ConversationContext;
  }

  async save(identity: ConversationIdentity, ctx: ConversationContext): Promise<void> {
    await this.db.upsert<ConversationContextRow>({
      table: 'copilot_internal.conversation_contexts',
      body: {
        conversation_id: identity.conversationId,
        tenant_id: identity.tenantId,
        active_node_ids: ctx.activeNodeIds ?? [],
        updated_at: new Date().toISOString(),
      },
      onConflict: ['conversation_id', 'tenant_id'],
    });
  }

  async mergeActiveNodeIds(identity: ConversationIdentity, nodeIds: string[]): Promise<void> {
    const current = (await this.load(identity)) ?? { activeNodeIds: [] };
    const merged = Array.from(new Set([...(current.activeNodeIds ?? []), ...nodeIds]));
    await this.save(identity, { activeNodeIds: merged });
  }
}

export class SupabaseConversationContextStore extends DatabaseConversationContextStore {
  constructor(client: DatabaseClient) {
    super(client);
  }
}

export class PostgresConversationContextStore extends DatabaseConversationContextStore {
  constructor(client: DatabaseClient) {
    super(client);
  }
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
