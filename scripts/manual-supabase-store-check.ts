import { randomUUID } from 'crypto';
import { SupabaseConversationStore } from '../packages/reg-intel-conversations/src/conversationStores';
import { runWithScriptObservability } from './observability.js';
import type { Logger } from 'pino';

type TableRow = Record<string, unknown>;

type OrderBy = { column: string; ascending: boolean; nulls?: 'first' | 'last' };

class InMemoryQueryBuilder {
  private filters: Array<(row: TableRow) => boolean> = [];
  private orderBy: OrderBy[] = [];
  private limitCount?: number;
  private selectedColumns: string[] | null = null;
  private operation: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private pendingRows: TableRow[] = [];
  private updateValues: TableRow = {};

  constructor(private table: string, private tables: Record<string, TableRow[]>) {}

  select(columns: string) {
    this.selectedColumns = columns
      .split(',')
      .map(column => column.trim())
      .filter(Boolean);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nulls?: 'first' | 'last' }) {
    this.orderBy.push({ column, ascending: options?.ascending ?? true, nulls: options?.nulls });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  insert(rows: TableRow | TableRow[]) {
    this.operation = 'insert';
    this.pendingRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values: TableRow) {
    this.operation = 'update';
    this.updateValues = values;
    return this;
  }

  upsert(rows: TableRow | TableRow[]) {
    this.operation = 'upsert';
    this.pendingRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  async maybeSingle() {
    return this.execute({ single: true, strict: false });
  }

  async single() {
    return this.execute({ single: true, strict: true });
  }

  async then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
    try {
      const result = await this.execute({ single: false, strict: false });
      return resolve(result);
    } catch (error) {
      return reject(error);
    }
  }

  private async execute(options: { single: boolean; strict: boolean }) {
    const tableRows = (this.tables[this.table] ??= []);
    let rows: TableRow[] = [];

    if (this.operation === 'insert' || this.operation === 'upsert') {
      const prepared = this.pendingRows.map(row => ({
        id: row.id ?? randomUUID(),
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
        ...row,
      }));

      if (this.operation === 'upsert') {
        const idSet = new Set(prepared.map(row => row.id as string));
        const remaining = tableRows.filter(row => !idSet.has(row.id as string));
        this.tables[this.table] = [...remaining, ...prepared];
      } else {
        this.tables[this.table].push(...prepared);
      }

      rows = prepared;
    } else if (this.operation === 'update') {
      rows = tableRows.filter(row => this.filters.every(fn => fn(row))).map(row => {
        Object.assign(row, this.updateValues);
        return row;
      });
    } else {
      rows = tableRows.filter(row => this.filters.every(fn => fn(row)));
    }

    if (this.orderBy.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const order of this.orderBy) {
          const aValue = a[order.column];
          const bValue = b[order.column];
          if (aValue === bValue) continue;
          if (aValue === null || aValue === undefined) return order.nulls === 'first' ? -1 : 1;
          if (bValue === null || bValue === undefined) return order.nulls === 'first' ? 1 : -1;
          const compare = (aValue as number) > (bValue as number) ? 1 : -1;
          return order.ascending ? compare : compare * -1;
        }
        return 0;
      });
    }

    if (this.limitCount !== undefined) {
      rows = rows.slice(0, this.limitCount);
    }

    if (this.selectedColumns) {
      rows = rows.map(row => {
        const mapped: TableRow = {};
        for (const column of this.selectedColumns ?? []) {
          mapped[column] = row[column];
        }
        return mapped;
      });
    }

    const payload = options.single ? rows[0] ?? null : rows;
    if (options.strict && !payload) {
      return { data: null, error: { message: 'No rows found' } };
    }

    return { data: payload, error: null };
  }
}

class InMemorySupabaseClient {
  private tables: Record<string, TableRow[]> = {};

  from(table: string) {
    return new InMemoryQueryBuilder(table, this.tables);
  }
}

async function main(tenantId: string, userId: string, logger: Logger) {
  const supabaseClient = new InMemorySupabaseClient();
  const store = new SupabaseConversationStore(supabaseClient as never);

  const { conversationId } = await store.createConversation({
    tenantId,
    userId,
    jurisdictions: ['IE'],
    title: 'Supabase manual check',
  });

  await store.appendMessage({
    tenantId,
    conversationId,
    userId,
    role: 'user',
    content: 'How does PRSI interact with Illness Benefit?',
  });

  await store.appendMessage({
    tenantId,
    conversationId,
    userId: null,
    role: 'assistant',
    content: 'Here is a draft answer based on current PRSI guidance.',
  });

  const conversation = await store.getConversation({ tenantId, conversationId, userId });
  const messages = await store.getMessages({ tenantId, conversationId, userId });

  logger.info(
    {
      conversationId,
      tenantId,
      title: conversation?.title,
      lastMessageAt: conversation?.lastMessageAt?.toISOString(),
      messageCount: messages.length,
      roles: messages.map(msg => msg.role),
    },
    'Conversation created and retrieved'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tenantId = randomUUID();
  const userId = randomUUID();

  await runWithScriptObservability(
    'manual-supabase-store-check',
    async ({ logger }) => {
      await main(tenantId, userId, logger);
    },
    { tenantId, userId, agentId: 'manual-supabase-store-check' }
  );
}
