/**
 * E2B Cost Tracking Service
 *
 * Handles recording E2B costs to database and integration with quota system.
 * Mirrors the LLM cost tracking pattern for consistency.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  E2BCostRecord,
  E2BResourceUsage,
  E2BQuotaCheckResult,
} from './types.js';
import type { E2BPricingService } from './pricingService.js';
import { createLogger } from '../logger.js';

const logger = createLogger('E2BCostTracking');

/**
 * Cost tracking service interface
 */
export interface E2BCostTrackingService {
  /**
   * Record E2B cost to database
   */
  recordCost(record: Omit<E2BCostRecord, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Check if tenant is within E2B quota
   */
  checkQuota(tenantId: string, estimatedCostUsd: number): Promise<E2BQuotaCheckResult>;

  /**
   * Increment quota spend (after successful execution)
   */
  incrementQuotaSpend(tenantId: string, actualCostUsd: number): Promise<void>;

  /**
   * Get cost summary for tenant (current period)
   */
  getTenantCostSummary(tenantId: string, period?: 'day' | 'week' | 'month'): Promise<{
    totalCostUsd: number;
    sandboxCount: number;
    totalExecutionSeconds: number;
  }>;
}

export class SupabaseE2BCostTrackingService implements E2BCostTrackingService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly pricingService: E2BPricingService
  ) {}

  async recordCost(record: Omit<E2BCostRecord, 'id' | 'timestamp'>): Promise<void> {
    const { error } = await this.client.from('copilot_internal.e2b_cost_records').insert({
      execution_context_id: record.executionContextId,
      sandbox_id: record.sandboxId,
      tier: record.tier,
      region: record.region,
      execution_time_seconds: record.executionTimeSeconds,
      cpu_core_seconds: record.cpuCoreSeconds,
      memory_gb_seconds: record.memoryGbSeconds,
      disk_io_gb: record.diskIoGb,
      network_io_gb: record.networkIoGb,
      execution_cost_usd: record.executionCostUsd,
      resource_cost_usd: record.resourceCostUsd,
      total_cost_usd: record.totalCostUsd,
      is_estimated: record.isEstimated,
      tenant_id: record.tenantId,
      user_id: record.userId,
      conversation_id: record.conversationId,
      path_id: record.pathId,
      created_at_sandbox: record.createdAtSandbox?.toISOString(),
      terminated_at_sandbox: record.terminatedAtSandbox?.toISOString(),
      sandbox_status: record.sandboxStatus,
      success: record.success,
      error_message: record.errorMessage,
      operation_type: record.operationType,
    });

    if (error) {
      logger.error({
        error: error.message,
        sandboxId: record.sandboxId,
        tenantId: record.tenantId,
      }, '[E2BCostTracking] Failed to record cost');
      throw new Error(`Failed to record E2B cost: ${error.message}`);
    }

    logger.info({
      sandboxId: record.sandboxId,
      tenantId: record.tenantId,
      costUsd: record.totalCostUsd,
      executionTimeSeconds: record.executionTimeSeconds,
    }, '[E2BCostTracking] Recorded cost');
  }

  async checkQuota(tenantId: string, estimatedCostUsd: number): Promise<E2BQuotaCheckResult> {
    // Use Supabase function to check quota
    const { data, error } = await this.client.rpc('check_e2b_quota', {
      p_scope: 'tenant',
      p_scope_id: tenantId,
      p_estimated_cost: estimatedCostUsd,
    });

    if (error) {
      logger.error({
        error: error.message,
        tenantId,
        estimatedCostUsd,
      }, '[E2BCostTracking] Failed to check quota');
      throw new Error(`Failed to check E2B quota: ${error.message}`);
    }

    const isAllowed = data as boolean;

    // Get quota details
    const { data: quotaData, error: quotaError } = await this.client
      .from('copilot_internal.cost_quotas')
      .select('*')
      .eq('scope', 'tenant')
      .eq('scope_id', tenantId)
      .in('resource_type', ['e2b', 'all'])
      .single();

    if (quotaError || !quotaData) {
      // No quota configured, allow by default
      return {
        allowed: true,
        limitUsd: Infinity,
        currentSpendUsd: 0,
        estimatedCostUsd,
        remainingUsd: Infinity,
        utilizationPercent: 0,
        warningThresholdReached: false,
      };
    }

    const limitUsd = Number(quotaData.limit_usd);
    const currentSpendUsd = Number(quotaData.current_spend_usd);
    const remainingUsd = limitUsd - currentSpendUsd;
    const utilizationPercent = (currentSpendUsd / limitUsd) * 100;
    const warningThreshold = quotaData.warning_threshold || 0.8;

    return {
      allowed: isAllowed,
      limitUsd,
      currentSpendUsd,
      estimatedCostUsd,
      remainingUsd,
      utilizationPercent,
      warningThresholdReached: utilizationPercent >= warningThreshold * 100,
      denialReason: isAllowed
        ? undefined
        : `E2B quota exceeded. Limit: $${limitUsd.toFixed(2)}, Current: $${currentSpendUsd.toFixed(2)}, Requested: $${estimatedCostUsd.toFixed(4)}`,
    };
  }

  async incrementQuotaSpend(tenantId: string, actualCostUsd: number): Promise<void> {
    const { error } = await this.client.rpc('increment_e2b_quota_spend', {
      p_scope: 'tenant',
      p_scope_id: tenantId,
      p_amount: actualCostUsd,
    });

    if (error) {
      logger.error({
        error: error.message,
        tenantId,
        actualCostUsd,
      }, '[E2BCostTracking] Failed to increment quota spend');
      throw new Error(`Failed to increment E2B quota spend: ${error.message}`);
    }

    logger.debug({
      tenantId,
      actualCostUsd,
    }, '[E2BCostTracking] Incremented quota spend');
  }

  async getTenantCostSummary(
    tenantId: string,
    period: 'day' | 'week' | 'month' = 'month'
  ): Promise<{
    totalCostUsd: number;
    sandboxCount: number;
    totalExecutionSeconds: number;
  }> {
    const periodMap = {
      day: '1 day',
      week: '7 days',
      month: '30 days',
    };

    const { data, error } = await this.client
      .from('copilot_internal.e2b_cost_records')
      .select('total_cost_usd, execution_time_seconds')
      .eq('tenant_id', tenantId)
      .gte('timestamp', `now() - interval '${periodMap[period]}'`);

    if (error) {
      logger.error({
        error: error.message,
        tenantId,
        period,
      }, '[E2BCostTracking] Failed to get cost summary');
      throw new Error(`Failed to get tenant cost summary: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        totalCostUsd: 0,
        sandboxCount: 0,
        totalExecutionSeconds: 0,
      };
    }

    const totalCostUsd = data.reduce((sum, record) => sum + Number(record.total_cost_usd), 0);
    const totalExecutionSeconds = data.reduce((sum, record) => sum + Number(record.execution_time_seconds), 0);

    return {
      totalCostUsd,
      sandboxCount: data.length,
      totalExecutionSeconds,
    };
  }
}

/**
 * Calculate E2B cost from resource usage
 */
export async function calculateAndRecordE2BCost(
  pricingService: E2BPricingService,
  costTrackingService: E2BCostTrackingService,
  params: {
    executionContextId?: string;
    sandboxId: string;
    tier: string;
    region?: string;
    resourceUsage: E2BResourceUsage;
    tenantId: string;
    userId?: string;
    conversationId?: string;
    pathId?: string;
    createdAt?: Date;
    terminatedAt?: Date;
    sandboxStatus?: 'creating' | 'ready' | 'error' | 'terminated';
    success: boolean;
    errorMessage?: string;
    operationType?: string;
  }
): Promise<number> {
  // Calculate cost
  const costCalc = await pricingService.calculateCost({
    tier: params.tier,
    region: params.region || 'us-east-1',
    resourceUsage: params.resourceUsage,
  });

  // Record cost
  await costTrackingService.recordCost({
    executionContextId: params.executionContextId,
    sandboxId: params.sandboxId,
    tier: params.tier,
    region: params.region || 'us-east-1',
    executionTimeSeconds: params.resourceUsage.executionTimeSeconds,
    cpuCoreSeconds: params.resourceUsage.cpuCoreSeconds,
    memoryGbSeconds: params.resourceUsage.memoryGbSeconds,
    diskIoGb: params.resourceUsage.diskIoGb,
    networkIoGb: params.resourceUsage.networkIoGb,
    executionCostUsd: costCalc.executionCostUsd,
    resourceCostUsd: costCalc.resourceCostUsd,
    totalCostUsd: costCalc.totalCostUsd,
    isEstimated: costCalc.isEstimated,
    tenantId: params.tenantId,
    userId: params.userId,
    conversationId: params.conversationId,
    pathId: params.pathId,
    createdAtSandbox: params.createdAt,
    terminatedAtSandbox: params.terminatedAt,
    sandboxStatus: params.sandboxStatus,
    success: params.success,
    errorMessage: params.errorMessage,
    operationType: params.operationType,
  });

  // Update quota
  await costTrackingService.incrementQuotaSpend(params.tenantId, costCalc.totalCostUsd);

  return costCalc.totalCostUsd;
}

// Global E2B cost tracking service instances
let globalE2BPricingService: E2BPricingService | null = null;
let globalE2BCostTrackingService: E2BCostTrackingService | null = null;

/**
 * Initialize global E2B cost tracking services
 *
 * Should be called at application startup with a Supabase client.
 * Enables database-backed cost calculation and quota tracking for E2B sandboxes.
 *
 * @param pricingService - E2B pricing service (typically SupabaseE2BPricingService)
 * @param costTrackingService - E2B cost tracking service (typically SupabaseE2BCostTrackingService)
 */
export const initE2BCostTracking = (
  pricingService: E2BPricingService,
  costTrackingService: E2BCostTrackingService
): void => {
  globalE2BPricingService = pricingService;
  globalE2BCostTrackingService = costTrackingService;
};

/**
 * Get the global E2B pricing service
 * @throws Error if E2B cost tracking has not been initialized
 */
export const getE2BPricingService = (): E2BPricingService => {
  if (!globalE2BPricingService) {
    throw new Error('E2B cost tracking not initialized. Call initE2BCostTracking() first.');
  }
  return globalE2BPricingService;
};

/**
 * Get the global E2B cost tracking service
 * @throws Error if E2B cost tracking has not been initialized
 */
export const getE2BCostTrackingService = (): E2BCostTrackingService => {
  if (!globalE2BCostTrackingService) {
    throw new Error('E2B cost tracking not initialized. Call initE2BCostTracking() first.');
  }
  return globalE2BCostTrackingService;
};

/**
 * Get the global E2B pricing service if initialized, otherwise null
 */
export const getE2BPricingServiceIfInitialized = (): E2BPricingService | null => {
  return globalE2BPricingService;
};

/**
 * Get the global E2B cost tracking service if initialized, otherwise null
 */
export const getE2BCostTrackingServiceIfInitialized = (): E2BCostTrackingService | null => {
  return globalE2BCostTrackingService;
};
