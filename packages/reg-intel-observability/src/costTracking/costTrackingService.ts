/**
 * Cost Tracking Service - Unified service for LLM cost management
 *
 * Integrates:
 * - Real-time OpenTelemetry metrics (for observability)
 * - Detailed cost storage (for auditing and billing)
 * - Quota enforcement (for cost control)
 */

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
 * Cost tracking service options
 */
export interface CostTrackingOptions {
  /** Cost storage provider (optional - if not provided, costs are only tracked via OpenTelemetry) */
  storage?: CostStorageProvider;

  /** Quota provider (optional - if not provided, no quota enforcement) */
  quotas?: QuotaProvider;

  /** Whether to enforce quotas before recording costs (default: false) */
  enforceQuotas?: boolean;

  /** Callback when quota warning threshold is exceeded */
  onQuotaWarning?: (quota: CostQuota) => void | Promise<void>;

  /** Callback when quota is exceeded */
  onQuotaExceeded?: (quota: CostQuota) => void | Promise<void>;
}

/**
 * Request to record LLM cost
 */
export interface RecordCostRequest {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  isEstimated: boolean;
  timestamp?: Date;
  tenantId?: string;
  userId?: string;
  task?: string;
  conversationId?: string;
  cached?: boolean;
  streaming?: boolean;
  durationMs?: number;
  success?: boolean;
}

/**
 * Cost tracking service
 *
 * Provides unified API for:
 * - Recording LLM costs with full attribution
 * - Querying historical costs
 * - Aggregating costs across dimensions
 * - Enforcing cost quotas
 */
export class CostTrackingService {
  private storage?: CostStorageProvider;
  private quotas?: QuotaProvider;
  private enforceQuotas: boolean;
  private onQuotaWarning?: (quota: CostQuota) => void | Promise<void>;
  private onQuotaExceeded?: (quota: CostQuota) => void | Promise<void>;

  constructor(options?: CostTrackingOptions) {
    this.storage = options?.storage;
    this.quotas = options?.quotas;
    this.enforceQuotas = options?.enforceQuotas ?? false;
    this.onQuotaWarning = options?.onQuotaWarning;
    this.onQuotaExceeded = options?.onQuotaExceeded;
  }

  /**
   * Record an LLM cost
   *
   * This will:
   * 1. Check quotas if enforcement is enabled
   * 2. Store the cost record if storage is configured
   * 3. Update quota spend if quotas are configured
   * 4. Trigger callbacks if thresholds are exceeded
   *
   * @returns The stored cost record, or null if quota check failed and enforcement is enabled
   */
  async recordCost(request: RecordCostRequest): Promise<LlmCostRecord | null> {
    // Check quotas if enforcement is enabled
    if (this.enforceQuotas && this.quotas) {
      const quotaChecks = await this.performQuotaChecks(request);
      for (const check of quotaChecks) {
        if (!check.allowed) {
          // Quota exceeded and enforcement is enabled - reject the cost
          if (this.onQuotaExceeded && check.quota) {
            await this.onQuotaExceeded(check.quota);
          }
          return null;
        }
      }
    }

    // Build cost record
    const record: Omit<LlmCostRecord, 'id'> = {
      timestamp: request.timestamp ?? new Date(),
      provider: request.provider,
      model: request.model,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      totalTokens: request.inputTokens + request.outputTokens,
      inputCostUsd: request.inputCostUsd,
      outputCostUsd: request.outputCostUsd,
      totalCostUsd: request.totalCostUsd,
      isEstimated: request.isEstimated,
      tenantId: request.tenantId,
      userId: request.userId,
      task: request.task,
      conversationId: request.conversationId,
      cached: request.cached,
      streaming: request.streaming,
      durationMs: request.durationMs,
      success: request.success,
    };

    // Store the record if storage is configured
    let storedRecord: LlmCostRecord | null = null;
    if (this.storage) {
      storedRecord = await this.storage.storeCostRecord(record);
    } else {
      // Create a record with temporary ID even if not storing
      storedRecord = { ...record, id: 'not-stored' };
    }

    // Update quotas if configured
    if (this.quotas) {
      await this.updateQuotas(request);
    }

    return storedRecord;
  }

  /**
   * Perform quota checks for all applicable scopes
   */
  private async performQuotaChecks(request: RecordCostRequest): Promise<QuotaCheckResult[]> {
    if (!this.quotas) {
      return [];
    }

    const checks: QuotaCheckResult[] = [];

    // Check platform-wide quota
    const platformCheck = await this.quotas.checkQuota({
      scope: 'platform',
      estimatedCostUsd: request.totalCostUsd,
    });
    checks.push(platformCheck);

    // Check tenant quota if tenantId provided
    if (request.tenantId) {
      const tenantCheck = await this.quotas.checkQuota({
        scope: 'tenant',
        scopeId: request.tenantId,
        estimatedCostUsd: request.totalCostUsd,
      });
      checks.push(tenantCheck);
    }

    // Check user quota if userId provided
    if (request.userId) {
      const userCheck = await this.quotas.checkQuota({
        scope: 'user',
        scopeId: request.userId,
        estimatedCostUsd: request.totalCostUsd,
      });
      checks.push(userCheck);
    }

    // Check for warning thresholds
    for (const check of checks) {
      if (check.quota?.warningExceeded && this.onQuotaWarning) {
        await this.onQuotaWarning(check.quota);
      }
    }

    return checks;
  }

  /**
   * Update quota spend for all applicable scopes
   */
  private async updateQuotas(request: RecordCostRequest): Promise<void> {
    if (!this.quotas) {
      return;
    }

    // Update platform quota
    await this.quotas.recordCost('platform', undefined, request.totalCostUsd);

    // Update tenant quota if tenantId provided
    if (request.tenantId) {
      await this.quotas.recordCost('tenant', request.tenantId, request.totalCostUsd);
    }

    // Update user quota if userId provided
    if (request.userId) {
      await this.quotas.recordCost('user', request.userId, request.totalCostUsd);
    }
  }

  /**
   * Query historical cost records
   */
  async queryCosts(query: CostAggregateQuery): Promise<LlmCostRecord[]> {
    if (!this.storage) {
      throw new Error('Cost storage not configured');
    }
    return this.storage.queryCostRecords(query);
  }

  /**
   * Get aggregated costs across dimensions
   */
  async getAggregatedCosts(query: CostAggregateQuery): Promise<CostAggregate[]> {
    if (!this.storage) {
      throw new Error('Cost storage not configured');
    }
    return this.storage.getAggregatedCosts(query);
  }

  /**
   * Get total cost for a scope
   */
  async getTotalCost(
    scope: 'platform' | 'tenant' | 'user' | 'task' | 'conversation',
    scopeId?: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<number> {
    if (!this.storage) {
      throw new Error('Cost storage not configured');
    }
    return this.storage.getTotalCost(scope, scopeId, startTime, endTime);
  }

  /**
   * Check if a request would exceed quota
   */
  async checkQuota(request: QuotaCheckRequest): Promise<QuotaCheckResult> {
    if (!this.quotas) {
      return { allowed: true };
    }
    return this.quotas.checkQuota(request);
  }

  /**
   * Get quota status
   */
  async getQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId?: string
  ): Promise<CostQuota | null> {
    if (!this.quotas) {
      return null;
    }
    return this.quotas.getQuota(scope, scopeId);
  }

  /**
   * Set or update a quota
   */
  async setQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    limitUsd: number,
    period: 'hour' | 'day' | 'week' | 'month',
    warningThreshold?: number
  ): Promise<CostQuota | null> {
    if (!this.quotas) {
      throw new Error('Quota management not configured');
    }
    return this.quotas.setQuota(scope, scopeId, limitUsd, period, warningThreshold);
  }

  /**
   * Reset a quota (start new period)
   */
  async resetQuota(scope: 'platform' | 'tenant' | 'user', scopeId?: string): Promise<void> {
    if (!this.quotas) {
      throw new Error('Quota management not configured');
    }
    return this.quotas.resetQuota(scope, scopeId);
  }

  /**
   * Check if storage is configured
   */
  hasStorage(): boolean {
    return this.storage !== undefined;
  }

  /**
   * Check if quotas are configured
   */
  hasQuotas(): boolean {
    return this.quotas !== undefined;
  }

  /**
   * Check if quota enforcement is enabled
   */
  isEnforcingQuotas(): boolean {
    return this.enforceQuotas && this.quotas !== undefined;
  }
}

// Global cost tracking service instance
let globalCostTrackingService: CostTrackingService | null = null;

/**
 * Initialize the global cost tracking service
 */
export const initCostTracking = (options?: CostTrackingOptions): CostTrackingService => {
  globalCostTrackingService = new CostTrackingService(options);
  return globalCostTrackingService;
};

/**
 * Get the global cost tracking service
 * @throws Error if cost tracking has not been initialized
 */
export const getCostTrackingService = (): CostTrackingService => {
  if (!globalCostTrackingService) {
    throw new Error('Cost tracking not initialized. Call initCostTracking() first.');
  }
  return globalCostTrackingService;
};

/**
 * Get the global cost tracking service if initialized, otherwise null
 */
export const getCostTrackingServiceIfInitialized = (): CostTrackingService | null => {
  return globalCostTrackingService;
};
