import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseCostStorage, SupabaseQuotaProvider } from '../supabaseProviders.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
function createMockSupabaseClient() {
  const mockData: Record<string, unknown[]> = {
    llm_cost_records: [],
    cost_quotas: [],
  };

  const createQueryBuilder = (table: string) => {
    let filters: Array<{ column: string; operator: string; value: unknown }> = [];
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitValue: number | null = null;
    let selectColumns = '*';

    const builder = {
      select: (cols = '*') => {
        selectColumns = cols;
        return builder;
      },
      insert: (data: Record<string, unknown> | Record<string, unknown>[]) => {
        const records = Array.isArray(data) ? data : [data];
        for (const record of records) {
          const newRecord = { id: `test-${Date.now()}-${Math.random()}`, ...record };
          mockData[table].push(newRecord);
        }
        return builder;
      },
      update: (data: Record<string, unknown>) => {
        // Apply update to filtered records
        const filtered = mockData[table].filter((record) => {
          return filters.every((f) => {
            const value = record[f.column as keyof typeof record];
            if (f.operator === 'eq') return value === f.value;
            if (f.operator === 'is') return value === f.value;
            return true;
          });
        });
        for (const record of filtered) {
          Object.assign(record, data);
        }
        return builder;
      },
      upsert: (data: Record<string, unknown>, options?: { onConflict: string }) => {
        const existing = mockData[table].find((record) => {
          const cols = options?.onConflict?.split(',') || ['id'];
          return cols.every((col) => record[col as keyof typeof record] === data[col]);
        });
        if (existing) {
          Object.assign(existing, data);
        } else {
          const newRecord = { id: `test-${Date.now()}-${Math.random()}`, ...data };
          mockData[table].push(newRecord);
        }
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, operator: 'eq', value });
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push({ column, operator: 'is', value });
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push({ column, operator: 'in', value: values });
        return builder;
      },
      gte: (column: string, value: unknown) => {
        filters.push({ column, operator: 'gte', value });
        return builder;
      },
      lte: (column: string, value: unknown) => {
        filters.push({ column, operator: 'lte', value });
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        orderBy = { column, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit: (value: number) => {
        limitValue = value;
        return builder;
      },
      single: () => {
        const result = mockData[table].find((record) => {
          return filters.every((f) => {
            const value = record[f.column as keyof typeof record];
            if (f.operator === 'eq') return value === f.value;
            if (f.operator === 'is') return value === f.value;
            return true;
          });
        });
        filters = [];
        return Promise.resolve({ data: result || null, error: null });
      },
      maybeSingle: () => {
        const result = mockData[table].find((record) => {
          return filters.every((f) => {
            const value = record[f.column as keyof typeof record];
            if (f.operator === 'eq') return value === f.value;
            if (f.operator === 'is') return value === f.value;
            return true;
          });
        });
        filters = [];
        return Promise.resolve({ data: result || null, error: null });
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        let result = [...mockData[table]];

        // Apply filters
        for (const filter of filters) {
          result = result.filter((record) => {
            const value = record[filter.column as keyof typeof record];
            if (filter.operator === 'eq') return value === filter.value;
            if (filter.operator === 'is') return value === filter.value;
            if (filter.operator === 'in')
              return (filter.value as unknown[]).includes(value);
            if (filter.operator === 'gte') return value >= (filter.value as number);
            if (filter.operator === 'lte') return value <= (filter.value as number);
            return true;
          });
        }

        // Apply order
        if (orderBy) {
          result.sort((a, b) => {
            const aVal = a[orderBy!.column as keyof typeof a] as string | number;
            const bVal = b[orderBy!.column as keyof typeof b] as string | number;
            return orderBy!.ascending ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
          });
        }

        // Apply limit
        if (limitValue) {
          result = result.slice(0, limitValue);
        }

        filters = [];
        orderBy = null;
        limitValue = null;
        resolve({ data: result, error: null });
      },
    };

    return builder;
  };

  return {
    from: (table: string) => createQueryBuilder(table),
    rpc: vi.fn().mockResolvedValue({ error: { code: 'PGRST202' } }),
    _mockData: mockData,
  } as unknown as SupabaseClient & { _mockData: Record<string, unknown[]> };
}

describe('SupabaseCostStorage', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let storage: SupabaseCostStorage;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    storage = new SupabaseCostStorage(mockClient);
    // Clear mock data
    mockClient._mockData.llm_cost_records = [];
  });

  describe('storeCostRecord', () => {
    it('should store a cost record and return it with an id', async () => {
      const record = {
        timestamp: new Date('2026-01-01T12:00:00Z'),
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCostUsd: 0.003,
        outputCostUsd: 0.006,
        totalCostUsd: 0.009,
        isEstimated: false,
        tenantId: 'tenant-1',
        task: 'main-chat',
      };

      const result = await storage.storeCostRecord(record);

      expect(result.id).toBeDefined();
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4');
      expect(result.totalCostUsd).toBe(0.009);
    });
  });

  describe('queryCostRecords', () => {
    beforeEach(async () => {
      // Add test data
      await storage.storeCostRecord({
        timestamp: new Date('2026-01-01T10:00:00Z'),
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCostUsd: 0.003,
        outputCostUsd: 0.006,
        totalCostUsd: 0.009,
        isEstimated: false,
        task: 'main-chat',
        tenantId: 'tenant-1',
      });

      await storage.storeCostRecord({
        timestamp: new Date('2026-01-01T11:00:00Z'),
        provider: 'anthropic',
        model: 'claude-3',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        inputCostUsd: 0.015,
        outputCostUsd: 0.075,
        totalCostUsd: 0.09,
        isEstimated: false,
        task: 'compaction:semantic',
        tenantId: 'tenant-2',
      });
    });

    it('should query records without filters', async () => {
      const records = await storage.queryCostRecords({ groupBy: [] });
      expect(records.length).toBe(2);
    });

    it('should filter by task', async () => {
      const records = await storage.queryCostRecords({
        groupBy: [],
        tasks: ['main-chat'],
      });
      expect(records.length).toBe(1);
      expect(records[0].task).toBe('main-chat');
    });

    it('should apply limit', async () => {
      const records = await storage.queryCostRecords({
        groupBy: [],
        limit: 1,
      });
      expect(records.length).toBe(1);
    });
  });

  describe('getTotalCost', () => {
    beforeEach(async () => {
      await storage.storeCostRecord({
        timestamp: new Date('2026-01-01T10:00:00Z'),
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCostUsd: 0.003,
        outputCostUsd: 0.006,
        totalCostUsd: 0.01,
        isEstimated: false,
        tenantId: 'tenant-1',
      });

      await storage.storeCostRecord({
        timestamp: new Date('2026-01-01T11:00:00Z'),
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCostUsd: 0.003,
        outputCostUsd: 0.006,
        totalCostUsd: 0.02,
        isEstimated: false,
        tenantId: 'tenant-1',
      });
    });

    it('should calculate platform-wide total cost', async () => {
      const total = await storage.getTotalCost('platform', undefined);
      expect(total).toBe(0.03);
    });

    it('should calculate tenant-specific total cost', async () => {
      const total = await storage.getTotalCost('tenant', 'tenant-1');
      expect(total).toBe(0.03);
    });
  });
});

describe('SupabaseQuotaProvider', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let quotaProvider: SupabaseQuotaProvider;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    quotaProvider = new SupabaseQuotaProvider(mockClient);
    // Clear mock data
    mockClient._mockData.cost_quotas = [];
  });

  describe('setQuota', () => {
    it('should create a new quota', async () => {
      const quota = await quotaProvider.setQuota('tenant', 'tenant-1', 100, 'month', 0.8);

      expect(quota.scope).toBe('tenant');
      expect(quota.scopeId).toBe('tenant-1');
      expect(quota.limitUsd).toBe(100);
      expect(quota.period).toBe('month');
      expect(quota.warningThreshold).toBe(0.8);
      expect(quota.currentSpendUsd).toBe(0);
    });
  });

  describe('getQuota', () => {
    it('should return null for non-existent quota', async () => {
      const quota = await quotaProvider.getQuota('tenant', 'non-existent');
      expect(quota).toBeNull();
    });

    it('should return existing quota', async () => {
      await quotaProvider.setQuota('platform', undefined, 1000, 'month');
      const quota = await quotaProvider.getQuota('platform');

      expect(quota).not.toBeNull();
      expect(quota!.scope).toBe('platform');
      expect(quota!.limitUsd).toBe(1000);
    });
  });

  describe('checkQuota', () => {
    it('should allow request when no quota set', async () => {
      const result = await quotaProvider.checkQuota({
        scope: 'tenant',
        scopeId: 'tenant-1',
        estimatedCostUsd: 10,
      });

      expect(result.allowed).toBe(true);
    });

    it('should allow request when under quota', async () => {
      await quotaProvider.setQuota('tenant', 'tenant-1', 100, 'month');

      const result = await quotaProvider.checkQuota({
        scope: 'tenant',
        scopeId: 'tenant-1',
        estimatedCostUsd: 10,
      });

      expect(result.allowed).toBe(true);
      expect(result.remainingBudgetUsd).toBe(100);
    });
  });
});

describe('Touchpoint Constants', () => {
  it('should export all touchpoints', async () => {
    const { LLM_TOUCHPOINTS, ALL_TOUCHPOINTS, isValidTouchpoint } = await import(
      '../touchpoints.js'
    );

    expect(LLM_TOUCHPOINTS.MAIN_CHAT).toBe('main-chat');
    expect(LLM_TOUCHPOINTS.MERGE_SUMMARIZER).toBe('merge-summarizer');
    expect(LLM_TOUCHPOINTS.AGENT_GLOBAL_REGULATORY).toBe('agent:global-regulatory');
    expect(LLM_TOUCHPOINTS.COMPACTION_SEMANTIC).toBe('compaction:semantic');
    expect(LLM_TOUCHPOINTS.PII_SANITIZER).toBe('pii-sanitizer');

    expect(ALL_TOUCHPOINTS.length).toBe(8);
    expect(isValidTouchpoint('main-chat')).toBe(true);
    expect(isValidTouchpoint('invalid')).toBe(false);
  });

  it('should have priority and description for each touchpoint', async () => {
    const { ALL_TOUCHPOINTS, TOUCHPOINT_PRIORITY, TOUCHPOINT_DESCRIPTIONS } = await import(
      '../touchpoints.js'
    );

    for (const touchpoint of ALL_TOUCHPOINTS) {
      expect(TOUCHPOINT_PRIORITY[touchpoint]).toBeDefined();
      expect(TOUCHPOINT_DESCRIPTIONS[touchpoint]).toBeDefined();
    }
  });
});
