/**
 * In-Memory Cost Storage and Quota Providers
 *
 * Provides simple in-memory implementations of cost tracking services.
 * Suitable for:
 * - Development and testing
 * - Single-instance deployments
 * - Low-volume production use
 *
 * For production multi-instance deployments, use database-backed providers.
 */

import { randomUUID } from 'node:crypto';
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
 * In-memory cost storage provider
 * Stores all cost records in memory (lost on process restart)
 */
export class InMemoryCostStorage implements CostStorageProvider {
  private records: LlmCostRecord[] = [];
  private readonly maxRecords: number;

  constructor(options?: { maxRecords?: number }) {
    // Default to keeping last 100k records to prevent memory issues
    this.maxRecords = options?.maxRecords ?? 100_000;
  }

  async storeCostRecord(record: Omit<LlmCostRecord, 'id'>): Promise<LlmCostRecord> {
    const fullRecord: LlmCostRecord = {
      ...record,
      id: randomUUID(),
    };

    this.records.push(fullRecord);

    // Trim old records if we exceed max
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    return fullRecord;
  }

  async queryCostRecords(query: CostAggregateQuery): Promise<LlmCostRecord[]> {
    let filtered = this.records;

    // Apply time range filters
    if (query.startTime) {
      filtered = filtered.filter((r) => r.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      filtered = filtered.filter((r) => r.timestamp <= query.endTime!);
    }

    // Apply dimension filters
    if (query.tenantIds && query.tenantIds.length > 0) {
      filtered = filtered.filter((r) => r.tenantId && query.tenantIds!.includes(r.tenantId));
    }
    if (query.userIds && query.userIds.length > 0) {
      filtered = filtered.filter((r) => r.userId && query.userIds!.includes(r.userId));
    }
    if (query.tasks && query.tasks.length > 0) {
      filtered = filtered.filter((r) => r.task && query.tasks!.includes(r.task));
    }
    if (query.conversationIds && query.conversationIds.length > 0) {
      filtered = filtered.filter(
        (r) => r.conversationId && query.conversationIds!.includes(r.conversationId)
      );
    }
    if (query.providers && query.providers.length > 0) {
      filtered = filtered.filter((r) => query.providers!.includes(r.provider));
    }
    if (query.models && query.models.length > 0) {
      filtered = filtered.filter((r) => query.models!.includes(r.model));
    }

    // Apply sorting
    const sortBy = query.sortBy ?? 'time_desc';
    if (sortBy === 'cost_desc') {
      filtered.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
    } else if (sortBy === 'cost_asc') {
      filtered.sort((a, b) => a.totalCostUsd - b.totalCostUsd);
    } else if (sortBy === 'time_desc') {
      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } else if (sortBy === 'time_asc') {
      filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } else if (sortBy === 'count_desc') {
      // For individual records, count doesn't apply, so just sort by time
      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    // Apply limit
    if (query.limit) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }

  async getAggregatedCosts(query: CostAggregateQuery): Promise<CostAggregate[]> {
    // First get the filtered records
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
    let filtered = this.records;

    // Apply time range
    if (startTime) {
      filtered = filtered.filter((r) => r.timestamp >= startTime);
    }
    if (endTime) {
      filtered = filtered.filter((r) => r.timestamp <= endTime);
    }

    // Apply scope filter
    if (scope === 'tenant' && scopeId) {
      filtered = filtered.filter((r) => r.tenantId === scopeId);
    } else if (scope === 'user' && scopeId) {
      filtered = filtered.filter((r) => r.userId === scopeId);
    } else if (scope === 'task' && scopeId) {
      filtered = filtered.filter((r) => r.task === scopeId);
    } else if (scope === 'conversation' && scopeId) {
      filtered = filtered.filter((r) => r.conversationId === scopeId);
    }
    // platform scope = no additional filter

    // Sum total cost
    return filtered.reduce((sum, r) => sum + r.totalCostUsd, 0);
  }

  /**
   * Get total number of records stored
   */
  getRecordCount(): number {
    return this.records.length;
  }

  /**
   * Clear all records (useful for testing)
   */
  clear(): void {
    this.records = [];
  }
}

/**
 * In-memory quota provider
 * Stores quota state in memory (lost on process restart)
 */
export class InMemoryQuotaProvider implements QuotaProvider {
  private quotas: Map<string, CostQuota> = new Map();

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
      const refreshedQuota = await this.getQuota(scope, scopeId);
      if (refreshedQuota) {
        refreshedQuota.currentSpendUsd += costUsd;
        this.updateQuotaStatus(refreshedQuota);
      }
    } else {
      quota.currentSpendUsd += costUsd;
      this.updateQuotaStatus(quota);
    }
  }

  private updateQuotaStatus(quota: CostQuota): void {
    quota.isExceeded = quota.currentSpendUsd > quota.limitUsd;
    if (quota.warningThreshold) {
      quota.warningExceeded = quota.currentSpendUsd / quota.limitUsd >= quota.warningThreshold;
    }
  }

  async getQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId?: string
  ): Promise<CostQuota | null> {
    const key = this.getQuotaKey(scope, scopeId);
    return this.quotas.get(key) ?? null;
  }

  async setQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    limitUsd: number,
    period: 'hour' | 'day' | 'week' | 'month',
    warningThreshold?: number
  ): Promise<CostQuota> {
    const key = this.getQuotaKey(scope, scopeId);
    const { start, end } = this.getPeriodBounds(period);

    const quota: CostQuota = {
      id: randomUUID(),
      scope,
      scopeId,
      limitUsd,
      period,
      currentSpendUsd: 0,
      periodStart: start,
      periodEnd: end,
      isExceeded: false,
      warningThreshold,
      warningExceeded: false,
    };

    this.quotas.set(key, quota);
    return quota;
  }

  async resetQuota(scope: 'platform' | 'tenant' | 'user', scopeId?: string): Promise<void> {
    const quota = await this.getQuota(scope, scopeId);
    if (!quota) {
      return;
    }

    const { start, end } = this.getPeriodBounds(quota.period);
    quota.currentSpendUsd = 0;
    quota.periodStart = start;
    quota.periodEnd = end;
    quota.isExceeded = false;
    quota.warningExceeded = false;
  }

  /**
   * Clear all quotas (useful for testing)
   */
  clear(): void {
    this.quotas.clear();
  }
}
