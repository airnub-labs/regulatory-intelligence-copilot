/**
 * Supabase Cost Storage and Quota Providers
 *
 * Production-ready implementations backed by PostgreSQL via Supabase.
 * Suitable for multi-instance deployments with persistent storage.
 *
 * @example
 * ```typescript
 * import { createClient } from '@supabase/supabase-js';
 * import { SupabaseCostStorage, SupabaseQuotaProvider } from '@reg-copilot/reg-intel-observability';
 *
 * const supabase = createClient(url, key);
 *
 * initCostTracking({
 *   storage: new SupabaseCostStorage(supabase),
 *   quotas: new SupabaseQuotaProvider(supabase),
 *   enforceQuotas: true,
 * });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CostAggregate,
  CostAggregateQuery,
  CostQuota,
  CostStorageProvider,
  LlmCostRecord,
  QuotaCheckRequest,
  QuotaCheckResult,
  QuotaProvider,
} from './types.js';

/**
 * Database row type for llm_cost_records table
 */
interface LlmCostRecordRow {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
  is_estimated: boolean;
  tenant_id: string | null;
  user_id: string | null;
  task: string | null;
  conversation_id: string | null;
  cached: boolean | null;
  streaming: boolean | null;
  duration_ms: number | null;
  success: boolean | null;
  created_at: string;
}

/**
 * Database row type for cost_quotas table
 */
interface CostQuotaRow {
  id: string;
  scope: string;
  scope_id: string | null;
  limit_usd: number;
  period: string;
  current_spend_usd: number;
  period_start: string;
  period_end: string;
  warning_threshold: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Convert database row to LlmCostRecord
 */
function rowToRecord(row: LlmCostRecordRow): LlmCostRecord {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    inputCostUsd: Number(row.input_cost_usd),
    outputCostUsd: Number(row.output_cost_usd),
    totalCostUsd: Number(row.total_cost_usd),
    isEstimated: row.is_estimated,
    tenantId: row.tenant_id ?? undefined,
    userId: row.user_id ?? undefined,
    task: row.task ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    cached: row.cached ?? undefined,
    streaming: row.streaming ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    success: row.success ?? undefined,
  };
}

/**
 * Convert database row to CostQuota
 */
function rowToQuota(row: CostQuotaRow): CostQuota {
  const now = new Date();
  const periodEnd = new Date(row.period_end);
  const currentSpend = Number(row.current_spend_usd);
  const limit = Number(row.limit_usd);
  const warningThreshold = row.warning_threshold ? Number(row.warning_threshold) : undefined;

  return {
    id: row.id,
    scope: row.scope as 'platform' | 'tenant' | 'user',
    scopeId: row.scope_id ?? undefined,
    limitUsd: limit,
    period: row.period as 'hour' | 'day' | 'week' | 'month',
    currentSpendUsd: currentSpend,
    periodStart: new Date(row.period_start),
    periodEnd: periodEnd,
    isExceeded: currentSpend > limit,
    warningThreshold,
    warningExceeded: warningThreshold ? currentSpend / limit >= warningThreshold : undefined,
  };
}

/**
 * Supabase-backed cost storage provider
 *
 * Stores all cost records in PostgreSQL for persistent storage,
 * with support for multi-dimensional querying and aggregation.
 */
export class SupabaseCostStorage implements CostStorageProvider {
  private client: SupabaseClient;
  private tableName = 'copilot_internal.llm_cost_records';

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async storeCostRecord(record: Omit<LlmCostRecord, 'id'>): Promise<LlmCostRecord> {
    const { data, error } = await this.client
      .from('llm_cost_records')
      .insert({
        timestamp: record.timestamp.toISOString(),
        provider: record.provider,
        model: record.model,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        total_tokens: record.totalTokens,
        input_cost_usd: record.inputCostUsd,
        output_cost_usd: record.outputCostUsd,
        total_cost_usd: record.totalCostUsd,
        is_estimated: record.isEstimated,
        tenant_id: record.tenantId ?? null,
        user_id: record.userId ?? null,
        task: record.task ?? null,
        conversation_id: record.conversationId ?? null,
        cached: record.cached ?? null,
        streaming: record.streaming ?? null,
        duration_ms: record.durationMs ?? null,
        success: record.success ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store cost record: ${error.message}`);
    }

    return rowToRecord(data as LlmCostRecordRow);
  }

  async queryCostRecords(query: CostAggregateQuery): Promise<LlmCostRecord[]> {
    let q = this.client.from('llm_cost_records').select('*');

    // Apply time range filters
    if (query.startTime) {
      q = q.gte('timestamp', query.startTime.toISOString());
    }
    if (query.endTime) {
      q = q.lte('timestamp', query.endTime.toISOString());
    }

    // Apply dimension filters
    if (query.tenantIds && query.tenantIds.length > 0) {
      q = q.in('tenant_id', query.tenantIds);
    }
    if (query.userIds && query.userIds.length > 0) {
      q = q.in('user_id', query.userIds);
    }
    if (query.tasks && query.tasks.length > 0) {
      q = q.in('task', query.tasks);
    }
    if (query.conversationIds && query.conversationIds.length > 0) {
      q = q.in('conversation_id', query.conversationIds);
    }
    if (query.providers && query.providers.length > 0) {
      q = q.in('provider', query.providers);
    }
    if (query.models && query.models.length > 0) {
      q = q.in('model', query.models);
    }

    // Apply sorting
    const sortBy = query.sortBy ?? 'time_desc';
    if (sortBy === 'cost_desc') {
      q = q.order('total_cost_usd', { ascending: false });
    } else if (sortBy === 'cost_asc') {
      q = q.order('total_cost_usd', { ascending: true });
    } else if (sortBy === 'time_desc') {
      q = q.order('timestamp', { ascending: false });
    } else if (sortBy === 'time_asc') {
      q = q.order('timestamp', { ascending: true });
    }

    // Apply limit
    if (query.limit) {
      q = q.limit(query.limit);
    }

    const { data, error } = await q;

    if (error) {
      throw new Error(`Failed to query cost records: ${error.message}`);
    }

    return (data as LlmCostRecordRow[]).map(rowToRecord);
  }

  async getAggregatedCosts(query: CostAggregateQuery): Promise<CostAggregate[]> {
    // For aggregation, we need to use RPC or compute in application
    // This implementation fetches records and aggregates in memory
    // For high-volume production, consider a PostgreSQL RPC function

    const records = await this.queryCostRecords({ ...query, limit: undefined });

    // Build aggregation key for each record based on groupBy dimensions
    const aggregateMap = new Map<string, CostAggregate>();

    for (const record of records) {
      const keyParts: string[] = [];
      const dimensionParts: Array<{ dimension: string; value: string }> = [];

      for (const dimension of query.groupBy) {
        let value: string | undefined;
        let dimName: string;

        if (dimension === 'tenant' && record.tenantId) {
          value = record.tenantId;
          dimName = 'tenantId';
        } else if (dimension === 'user' && record.userId) {
          value = record.userId;
          dimName = 'userId';
        } else if (dimension === 'task' && record.task) {
          value = record.task;
          dimName = 'task';
        } else if (dimension === 'conversation' && record.conversationId) {
          value = record.conversationId;
          dimName = 'conversationId';
        } else if (dimension === 'provider') {
          value = record.provider;
          dimName = 'provider';
        } else if (dimension === 'model') {
          value = record.model;
          dimName = 'model';
        } else {
          value = undefined;
          dimName = dimension;
        }

        if (value) {
          keyParts.push(`${dimName}=${value}`);
          dimensionParts.push({ dimension: dimName, value });
        }
      }

      const key = keyParts.join(',') || 'total';

      // Get or create aggregate
      let aggregate = aggregateMap.get(key);
      if (!aggregate) {
        aggregate = {
          dimension: dimensionParts.length > 0 ? dimensionParts[0].dimension : 'total',
          value: dimensionParts.length > 0 ? dimensionParts.map((d) => d.value).join(',') : 'all',
          totalCostUsd: 0,
          requestCount: 0,
          totalTokens: 0,
          avgCostPerRequest: 0,
          firstRequest: record.timestamp,
          lastRequest: record.timestamp,
        };
        aggregateMap.set(key, aggregate);
      }

      // Update aggregate
      aggregate.totalCostUsd += record.totalCostUsd;
      aggregate.requestCount += 1;
      aggregate.totalTokens += record.totalTokens;
      if (record.timestamp < aggregate.firstRequest) {
        aggregate.firstRequest = record.timestamp;
      }
      if (record.timestamp > aggregate.lastRequest) {
        aggregate.lastRequest = record.timestamp;
      }
    }

    // Calculate averages
    for (const aggregate of aggregateMap.values()) {
      aggregate.avgCostPerRequest = aggregate.totalCostUsd / aggregate.requestCount;
    }

    // Convert to array and sort
    let aggregates = Array.from(aggregateMap.values());

    const sortBy = query.sortBy ?? 'cost_desc';
    if (sortBy === 'cost_desc') {
      aggregates.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
    } else if (sortBy === 'cost_asc') {
      aggregates.sort((a, b) => a.totalCostUsd - b.totalCostUsd);
    } else if (sortBy === 'count_desc') {
      aggregates.sort((a, b) => b.requestCount - a.requestCount);
    }

    // Apply limit
    if (query.limit) {
      aggregates = aggregates.slice(0, query.limit);
    }

    return aggregates;
  }

  async getTotalCost(
    scope: 'platform' | 'tenant' | 'user' | 'task' | 'conversation',
    scopeId: string | undefined,
    startTime?: Date,
    endTime?: Date
  ): Promise<number> {
    let q = this.client.from('llm_cost_records').select('total_cost_usd');

    // Apply time range
    if (startTime) {
      q = q.gte('timestamp', startTime.toISOString());
    }
    if (endTime) {
      q = q.lte('timestamp', endTime.toISOString());
    }

    // Apply scope filter
    if (scope === 'tenant' && scopeId) {
      q = q.eq('tenant_id', scopeId);
    } else if (scope === 'user' && scopeId) {
      q = q.eq('user_id', scopeId);
    } else if (scope === 'task' && scopeId) {
      q = q.eq('task', scopeId);
    } else if (scope === 'conversation' && scopeId) {
      q = q.eq('conversation_id', scopeId);
    }
    // platform scope = no additional filter

    const { data, error } = await q;

    if (error) {
      throw new Error(`Failed to get total cost: ${error.message}`);
    }

    // Sum total cost
    return (data as Array<{ total_cost_usd: number }>).reduce(
      (sum, r) => sum + Number(r.total_cost_usd),
      0
    );
  }
}

/**
 * Supabase-backed quota provider
 *
 * Stores quota state in PostgreSQL for persistent, multi-instance quota management.
 */
export class SupabaseQuotaProvider implements QuotaProvider {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private getQuotaKey(scope: 'platform' | 'tenant' | 'user', scopeId?: string): string {
    if (scope === 'platform') {
      return 'platform';
    }
    return `${scope}:${scopeId}`;
  }

  private getPeriodBounds(period: 'hour' | 'day' | 'week' | 'month'): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (period === 'hour') {
      start.setMinutes(0, 0, 0);
      end.setHours(start.getHours() + 1, 0, 0, 0);
    } else if (period === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 1);
      end.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 7);
      end.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1, 1);
      end.setHours(0, 0, 0, 0);
    }

    return { start, end };
  }

  async checkQuota(request: QuotaCheckRequest): Promise<QuotaCheckResult> {
    const quota = await this.getQuota(request.scope, request.scopeId);

    if (!quota) {
      // No quota configured = allow
      return { allowed: true };
    }

    // Check if we need to reset for new period
    const now = new Date();
    if (now >= quota.periodEnd) {
      await this.resetQuota(request.scope, request.scopeId);
      // Get refreshed quota
      const refreshedQuota = await this.getQuota(request.scope, request.scopeId);
      if (refreshedQuota) {
        return this.checkAgainstQuota(refreshedQuota, request.estimatedCostUsd);
      }
    }

    return this.checkAgainstQuota(quota, request.estimatedCostUsd);
  }

  private checkAgainstQuota(quota: CostQuota, estimatedCostUsd: number): QuotaCheckResult {
    const projectedSpend = quota.currentSpendUsd + estimatedCostUsd;
    const remainingBudget = quota.limitUsd - quota.currentSpendUsd;

    if (projectedSpend > quota.limitUsd) {
      return {
        allowed: false,
        quota,
        reason: `Quota exceeded: would spend $${projectedSpend.toFixed(4)} but limit is $${quota.limitUsd.toFixed(4)}`,
        remainingBudgetUsd: remainingBudget,
      };
    }

    return {
      allowed: true,
      quota,
      remainingBudgetUsd: remainingBudget,
    };
  }

  async recordCost(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    costUsd: number
  ): Promise<void> {
    const quota = await this.getQuota(scope, scopeId);
    if (!quota) {
      return; // No quota to track against
    }

    // Check if we need to reset for new period
    const now = new Date();
    if (now >= quota.periodEnd) {
      await this.resetQuota(scope, scopeId);
    }

    // Update spend in database using atomic increment
    const { error } = await this.client.rpc('increment_quota_spend', {
      p_scope: scope,
      p_scope_id: scopeId ?? null,
      p_amount: costUsd,
    });

    // If RPC doesn't exist, fall back to manual update
    if (error?.code === 'PGRST202') {
      // Function not found, use manual update
      await this.client
        .from('cost_quotas')
        .update({
          current_spend_usd: quota.currentSpendUsd + costUsd,
          updated_at: new Date().toISOString(),
        })
        .eq('scope', scope)
        .eq('scope_id', scopeId ?? null);
    } else if (error) {
      throw new Error(`Failed to record cost: ${error.message}`);
    }
  }

  async getQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId?: string
  ): Promise<CostQuota | null> {
    let q = this.client.from('cost_quotas').select('*').eq('scope', scope);

    if (scope === 'platform') {
      q = q.is('scope_id', null);
    } else {
      q = q.eq('scope_id', scopeId ?? null);
    }

    const { data, error } = await q.maybeSingle();

    if (error) {
      throw new Error(`Failed to get quota: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return rowToQuota(data as CostQuotaRow);
  }

  async setQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    limitUsd: number,
    period: 'hour' | 'day' | 'week' | 'month',
    warningThreshold?: number
  ): Promise<CostQuota> {
    const { start, end } = this.getPeriodBounds(period);

    const { data, error } = await this.client
      .from('cost_quotas')
      .upsert(
        {
          scope,
          scope_id: scopeId ?? null,
          limit_usd: limitUsd,
          period,
          current_spend_usd: 0,
          period_start: start.toISOString(),
          period_end: end.toISOString(),
          warning_threshold: warningThreshold ?? null,
        },
        { onConflict: 'scope,scope_id' }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to set quota: ${error.message}`);
    }

    return rowToQuota(data as CostQuotaRow);
  }

  async resetQuota(scope: 'platform' | 'tenant' | 'user', scopeId?: string): Promise<void> {
    const quota = await this.getQuota(scope, scopeId);
    if (!quota) {
      return;
    }

    const { start, end } = this.getPeriodBounds(quota.period);

    const { error } = await this.client
      .from('cost_quotas')
      .update({
        current_spend_usd: 0,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('scope', scope)
      .eq('scope_id', scopeId ?? null);

    if (error) {
      throw new Error(`Failed to reset quota: ${error.message}`);
    }
  }
}
