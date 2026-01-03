import { createLogger } from '@reg-copilot/reg-intel-observability';

import type { CompactionSnapshot, SnapshotStorageProvider } from './snapshotService.js';

const logger = createLogger('SupabaseSnapshotStorage');

interface SupabaseSnapshotClient {
  from(table: string): {
    upsert(values: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    select(columns?: string): {
      eq(column: string, value: unknown): {
        single(): Promise<{ data: unknown | null; error: { message: string } | null }>;
        order(
          column: string,
          options?: { ascending?: boolean }
        ): {
          limit(count: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
      lte?(column: string, value: unknown): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    delete(): {
      eq(column: string, value: unknown): Promise<{ error: { message: string } | null }>;
      lte?(column: string, value: unknown): Promise<{ error: { message: string } | null }>;
      select?(columns: string): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

interface SnapshotRow {
  id: string;
  conversation_id: string;
  path_id?: string | null;
  created_at: string;
  messages: CompactionSnapshot['messages'];
  pinned_message_ids: string[];
  tokens_before: number;
  strategy: string;
  compaction_result?: CompactionSnapshot['compactionResult'] | null;
  expires_at: string;
}

/**
 * Supabase-backed snapshot storage for compaction.
 */
export class SupabaseSnapshotStorage implements SnapshotStorageProvider {
  private readonly table: string;

  constructor(private readonly supabase: SupabaseSnapshotClient, tableName: string = 'compaction_snapshots') {
    if (!supabase) {
      throw new Error('Supabase client is required for snapshot storage');
    }

    this.table = tableName;
  }

  async save(snapshot: CompactionSnapshot): Promise<void> {
    const row = this.mapSnapshotToRow(snapshot);
    const { error } = await this.supabase.from(this.table).upsert(row);

    if (error) {
      logger.error({ snapshotId: snapshot.id, error: error.message }, 'Failed to save compaction snapshot');
      throw new Error(`Failed to save compaction snapshot: ${error.message}`);
    }
  }

  async get(snapshotId: string): Promise<CompactionSnapshot | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (error) {
      if (error.message.includes('PGRST116')) {
        return null;
      }
      logger.error({ snapshotId, error: error.message }, 'Failed to fetch compaction snapshot');
      throw new Error(`Failed to fetch compaction snapshot: ${error.message}`);
    }

    return data ? this.mapRowToSnapshot(data as SnapshotRow) : null;
  }

  async list(conversationId: string, limit: number = 10): Promise<CompactionSnapshot[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ conversationId, error: error.message }, 'Failed to list compaction snapshots');
      throw new Error(`Failed to list compaction snapshots: ${error.message}`);
    }

    return (data ?? []).map((row) => this.mapRowToSnapshot(row as SnapshotRow));
  }

  async delete(snapshotId: string): Promise<void> {
    const { error } = await this.supabase.from(this.table).delete().eq('id', snapshotId);

    if (error) {
      logger.error({ snapshotId, error: error.message }, 'Failed to delete compaction snapshot');
      throw new Error(`Failed to delete compaction snapshot: ${error.message}`);
    }
  }

  async deleteExpired(): Promise<number> {
    const nowIso = new Date().toISOString();
    const selection = this.supabase.from(this.table).select?.('id').lte?.('expires_at', nowIso);

    if (!selection) {
      throw new Error('Supabase client does not support select().lte() chaining');
    }

    const { data: expired, error: selectError } = await selection;
    if (selectError) {
      logger.error({ error: selectError.message }, 'Failed to query expired compaction snapshots');
      throw new Error(`Failed to query expired compaction snapshots: ${selectError.message}`);
    }

    const { error: deleteError } = await this.supabase.from(this.table).delete().lte?.('expires_at', nowIso)!;

    if (deleteError) {
      logger.error({ error: deleteError.message }, 'Failed to delete expired compaction snapshots');
      throw new Error(`Failed to delete expired compaction snapshots: ${deleteError.message}`);
    }

    return expired?.length ?? 0;
  }

  private mapSnapshotToRow(snapshot: CompactionSnapshot): SnapshotRow {
    return {
      id: snapshot.id,
      conversation_id: snapshot.conversationId,
      path_id: snapshot.pathId ?? null,
      created_at: snapshot.createdAt.toISOString(),
      messages: snapshot.messages,
      pinned_message_ids: snapshot.pinnedMessageIds ?? [],
      tokens_before: snapshot.tokensBefore,
      strategy: snapshot.strategy,
      compaction_result: snapshot.compactionResult ?? null,
      expires_at: snapshot.expiresAt.toISOString(),
    };
  }

  private mapRowToSnapshot(row: SnapshotRow): CompactionSnapshot {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      pathId: row.path_id ?? undefined,
      createdAt: new Date(row.created_at),
      messages: row.messages,
      pinnedMessageIds: row.pinned_message_ids ?? [],
      tokensBefore: row.tokens_before,
      strategy: row.strategy,
      compactionResult: row.compaction_result ?? undefined,
      expiresAt: new Date(row.expires_at),
    };
  }
}

