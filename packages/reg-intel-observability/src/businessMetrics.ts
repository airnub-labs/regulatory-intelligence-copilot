/**
 * Business Metrics - Custom OpenTelemetry metrics for regulatory intelligence operations
 *
 * Provides instrumentation for:
 * - Agent selection and routing
 * - Graph query performance
 * - LLM token usage
 * - Egress guard operations
 * - UI/UX interactions (path system usage)
 */

import { metrics, type Attributes, type Counter, type Histogram, type ObservableGauge } from '@opentelemetry/api';

// Backend metric instrument instances
let agentSelectionCounter: Counter | null = null;
let graphQueryDurationHistogram: Histogram | null = null;
let graphQueryCounter: Counter | null = null;
let llmTokenUsageCounter: Counter | null = null;
let llmRequestDurationHistogram: Histogram | null = null;
let llmCostCounter: Counter | null = null;
let egressGuardCounter: Counter | null = null;
let egressGuardBlockCounter: Counter | null = null;

// E2B sandbox metric instrument instances
let e2bSandboxOperationDurationHistogram: Histogram | null = null;
let e2bSandboxOperationCounter: Counter | null = null;
let e2bSandboxActiveGauge: ObservableGauge | null = null;
let e2bExecutionDurationHistogram: Histogram | null = null;
let e2bCostCounter: Counter | null = null;
let e2bResourceUsageCounter: Counter | null = null;
let e2bQuotaUtilizationGauge: ObservableGauge | null = null;
let e2bErrorCounter: Counter | null = null;

// UI/UX metric instrument instances
let uiBreadcrumbNavigateCounter: Counter | null = null;
let uiBranchCreateCounter: Counter | null = null;
let uiPathSwitchCounter: Counter | null = null;
let uiMergeExecuteCounter: Counter | null = null;
let uiMergePreviewCounter: Counter | null = null;
let uiMessageScrollCounter: Counter | null = null;
let uiMessageEditCounter: Counter | null = null;

/**
 * Initialize all business metrics instruments
 * Should be called after OTEL SDK is initialized
 */
export const initBusinessMetrics = (): void => {
  const meter = metrics.getMeter('reg-intel-business-metrics', '1.0.0');

  // Agent selection metrics
  agentSelectionCounter = meter.createCounter('regintel.agent.selection.total', {
    description: 'Total number of agent selections by type',
    unit: '{selections}',
  });

  // Graph query metrics
  graphQueryDurationHistogram = meter.createHistogram('regintel.graph.query.duration', {
    description: 'Duration of graph queries in milliseconds',
    unit: 'ms',
  });

  graphQueryCounter = meter.createCounter('regintel.graph.query.total', {
    description: 'Total number of graph queries by operation type',
    unit: '{queries}',
  });

  // LLM metrics
  llmTokenUsageCounter = meter.createCounter('regintel.llm.tokens.total', {
    description: 'Total number of LLM tokens consumed (input and output)',
    unit: '{tokens}',
  });

  llmRequestDurationHistogram = meter.createHistogram('regintel.llm.request.duration', {
    description: 'Duration of LLM requests in milliseconds',
    unit: 'ms',
  });

  llmCostCounter = meter.createCounter('regintel.llm.cost.total', {
    description: 'Total LLM cost in USD (with multi-dimensional attribution)',
    unit: 'USD',
  });

  // E2B sandbox metrics
  e2bSandboxOperationDurationHistogram = meter.createHistogram('regintel.e2b.sandbox.operation.duration', {
    description: 'Duration of E2B sandbox operations (create, reconnect, terminate, cleanup) in milliseconds',
    unit: 'ms',
  });

  e2bSandboxOperationCounter = meter.createCounter('regintel.e2b.sandbox.operation.total', {
    description: 'Total number of E2B sandbox operations by type and outcome',
    unit: '{operations}',
  });

  // E2B Active Sandboxes Gauge (Phase 4)
  // Tracks the number of active sandboxes per tenant and tier
  e2bSandboxActiveGauge = meter.createObservableGauge('regintel.e2b.sandbox.active', {
    description: 'Number of active E2B sandboxes (gauge)',
    unit: '{sandboxes}',
  });

  e2bExecutionDurationHistogram = meter.createHistogram('regintel.e2b.execution.duration', {
    description: 'Duration of code execution in E2B sandboxes in seconds',
    unit: 's',
  });

  e2bCostCounter = meter.createCounter('regintel.e2b.cost.total', {
    description: 'Total E2B sandbox cost in USD (with multi-dimensional attribution)',
    unit: 'USD',
  });

  e2bResourceUsageCounter = meter.createCounter('regintel.e2b.resource.usage', {
    description: 'E2B resource usage (CPU core-seconds, memory GB-seconds, disk I/O GB)',
    unit: '{units}',
  });

  // E2B Quota Utilization Gauge (Phase 4)
  // Tracks quota utilization percentage (0-100) per tenant
  e2bQuotaUtilizationGauge = meter.createObservableGauge('regintel.e2b.quota.utilization', {
    description: 'E2B quota utilization percentage (0-100) per tenant',
    unit: '%',
  });

  e2bErrorCounter = meter.createCounter('regintel.e2b.errors.total', {
    description: 'Total number of E2B errors by operation and error type',
    unit: '{errors}',
  });

  // Egress guard metrics
  egressGuardCounter = meter.createCounter('regintel.egressguard.scan.total', {
    description: 'Total number of egress guard scans',
    unit: '{scans}',
  });

  egressGuardBlockCounter = meter.createCounter('regintel.egressguard.block.total', {
    description: 'Total number of egress guard blocks (PII/sensitive data detected)',
    unit: '{blocks}',
  });

  // UI/UX metrics
  uiBreadcrumbNavigateCounter = meter.createCounter('regintel.ui.breadcrumb.navigate.total', {
    description: 'Total number of breadcrumb navigation clicks',
    unit: '{clicks}',
  });

  uiBranchCreateCounter = meter.createCounter('regintel.ui.branch.create.total', {
    description: 'Total number of branch creations by method',
    unit: '{branches}',
  });

  uiPathSwitchCounter = meter.createCounter('regintel.ui.path.switch.total', {
    description: 'Total number of path switches',
    unit: '{switches}',
  });

  uiMergeExecuteCounter = meter.createCounter('regintel.ui.merge.execute.total', {
    description: 'Total number of merge operations by mode',
    unit: '{merges}',
  });

  uiMergePreviewCounter = meter.createCounter('regintel.ui.merge.preview.total', {
    description: 'Total number of merge preview requests',
    unit: '{previews}',
  });

  uiMessageScrollCounter = meter.createCounter('regintel.ui.message.scroll.total', {
    description: 'Total number of message scroll/history navigation events',
    unit: '{scrolls}',
  });

  uiMessageEditCounter = meter.createCounter('regintel.ui.message.edit.total', {
    description: 'Total number of message edit operations',
    unit: '{edits}',
  });
};

/**
 * Record agent selection event
 */
export const recordAgentSelection = (attributes: {
  agentType: string;
  agentName?: string;
  domain?: string;
  jurisdiction?: string;
}): void => {
  agentSelectionCounter?.add(1, attributes as Attributes);
};

/**
 * Record graph query execution
 */
export const recordGraphQuery = (
  durationMs: number,
  attributes: {
    operation: string;
    queryType?: string;
    success: boolean;
    nodeCount?: number;
  }
): void => {
  graphQueryDurationHistogram?.record(durationMs, attributes as Attributes);
  graphQueryCounter?.add(1, attributes as Attributes);
};

/**
 * Record LLM token usage with multi-dimensional attribution
 */
export const recordLlmTokenUsage = (attributes: {
  provider: string;
  model: string;
  tokenType: 'input' | 'output' | 'total';
  tokens: number;
  cached?: boolean;
  tenantId?: string;
  userId?: string;
  task?: string;
  conversationId?: string;
}): void => {
  const { tokens, ...metricAttributes } = attributes;
  llmTokenUsageCounter?.add(tokens, metricAttributes as Attributes);
};

/**
 * Record LLM request duration with multi-dimensional attribution
 */
export const recordLlmRequest = (
  durationMs: number,
  attributes: {
    provider: string;
    model: string;
    success: boolean;
    streaming?: boolean;
    cached?: boolean;
    tenantId?: string;
    userId?: string;
    task?: string;
    conversationId?: string;
  }
): void => {
  llmRequestDurationHistogram?.record(durationMs, attributes as Attributes);
};

/**
 * Record LLM cost in USD with multi-dimensional attribution
 *
 * Enables cost tracking across multiple dimensions:
 * - Platform-wide (total costs)
 * - Per-tenant (organizational billing)
 * - Per-user (individual usage)
 * - Per-task (touchpoint-level optimization)
 * - Per-conversation (session-level analysis)
 */
export const recordLlmCost = async (attributes: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  tenantId?: string;
  userId?: string;
  task?: string;
  conversationId?: string;
  cached?: boolean;
  streaming?: boolean;
  durationMs?: number;
  success?: boolean;
}): Promise<void> => {
  try {
    // Import dynamically to avoid circular dependencies
    const { calculateLlmCost, getPricingServiceIfInitialized } = await import('./pricing/index.js');
    const { getCostTrackingServiceIfInitialized } = await import('./costTracking/index.js');

    const pricingService = getPricingServiceIfInitialized();
    if (!pricingService) {
      throw new Error(
        'Pricing service is not initialized. Provide a Supabase-backed pricing service for cost tracking.'
      );
    }

    const costCalculation = await calculateLlmCost(
      attributes.provider,
      attributes.model,
      attributes.inputTokens,
      attributes.outputTokens
    );

    // Record to OpenTelemetry metrics (real-time observability)
    llmCostCounter?.add(costCalculation.totalCostUsd, {
      provider: attributes.provider,
      model: attributes.model,
      tenantId: attributes.tenantId,
      userId: attributes.userId,
      task: attributes.task,
      conversationId: attributes.conversationId,
      isEstimated: costCalculation.isEstimated,
    } as Attributes);

    // Also record separate input/output costs for detailed analysis
    if (costCalculation.inputCostUsd > 0) {
      llmCostCounter?.add(costCalculation.inputCostUsd, {
        provider: attributes.provider,
        model: attributes.model,
        costType: 'input',
        tenantId: attributes.tenantId,
        userId: attributes.userId,
        task: attributes.task,
        conversationId: attributes.conversationId,
        isEstimated: costCalculation.isEstimated,
      } as Attributes);
    }

    if (costCalculation.outputCostUsd > 0) {
      llmCostCounter?.add(costCalculation.outputCostUsd, {
        provider: attributes.provider,
        model: attributes.model,
        costType: 'output',
        tenantId: attributes.tenantId,
        userId: attributes.userId,
        task: attributes.task,
        conversationId: attributes.conversationId,
        isEstimated: costCalculation.isEstimated,
      } as Attributes);
    }

    // Record to cost tracking service (storage & quota management)
    const costTrackingService = getCostTrackingServiceIfInitialized();
    if (costTrackingService) {
      await costTrackingService.recordCost({
        provider: attributes.provider,
        model: attributes.model,
        inputTokens: attributes.inputTokens,
        outputTokens: attributes.outputTokens,
        inputCostUsd: costCalculation.inputCostUsd,
        outputCostUsd: costCalculation.outputCostUsd,
        totalCostUsd: costCalculation.totalCostUsd,
        isEstimated: costCalculation.isEstimated,
        tenantId: attributes.tenantId,
        userId: attributes.userId,
        task: attributes.task,
        conversationId: attributes.conversationId,
        cached: attributes.cached,
        streaming: attributes.streaming,
        durationMs: attributes.durationMs,
        success: attributes.success,
      });
    }
  } catch (error) {
    // Silently fail if pricing service is unavailable
    // This prevents metrics recording from blocking LLM requests
    console.warn('Failed to record LLM cost:', error);
  }
};

/**
 * Record egress guard scan
 */
export const recordEgressGuardScan = (attributes: {
  scanType: 'llm_request' | 'llm_response' | 'sandbox_output' | 'agent_output';
  blocked: boolean;
  piiDetected?: boolean;
  sensitiveDataTypes?: string[];
}): void => {
  const { sensitiveDataTypes, ...baseAttributes } = attributes;
  const metricAttributes: Attributes = {
    ...baseAttributes,
    ...(sensitiveDataTypes && sensitiveDataTypes.length > 0
      ? { sensitiveDataTypes: sensitiveDataTypes.join(',') }
      : {}),
  };

  egressGuardCounter?.add(1, metricAttributes);

  if (attributes.blocked) {
    egressGuardBlockCounter?.add(1, metricAttributes);
  }
};

/**
 * Helper to wrap async operations with duration tracking
 */
export const withMetricTiming = async <T>(
  operation: () => Promise<T>,
  recordMetric: (durationMs: number, success: boolean) => void
): Promise<T> => {
  const startTime = Date.now();
  let success = true;

  try {
    return await operation();
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const durationMs = Date.now() - startTime;
    recordMetric(durationMs, success);
  }
};

// ============================================================================
// UI/UX Metrics Recording Functions
// ============================================================================

/**
 * Record breadcrumb navigation event
 */
export const recordBreadcrumbNavigate = (attributes: {
  fromPathId: string;
  toPathId: string;
  pathDepth: number;
  conversationId?: string;
}): void => {
  uiBreadcrumbNavigateCounter?.add(1, attributes as Attributes);
};

/**
 * Record branch creation event
 */
export const recordBranchCreate = (attributes: {
  method: 'edit' | 'button' | 'api';
  conversationId?: string;
  sourcePathId?: string;
  fromMessageId?: string;
}): void => {
  uiBranchCreateCounter?.add(1, attributes as Attributes);
};

/**
 * Record path switch event
 */
export const recordPathSwitch = (attributes: {
  fromPathId: string;
  toPathId: string;
  switchMethod: 'breadcrumb' | 'selector' | 'url' | 'api';
  conversationId?: string;
}): void => {
  uiPathSwitchCounter?.add(1, attributes as Attributes);
};

/**
 * Record merge execution event
 */
export const recordMergeExecute = (attributes: {
  mergeMode: 'full' | 'summary' | 'selective';
  sourcePathId: string;
  targetPathId: string;
  messageCount?: number;
  conversationId?: string;
}): void => {
  uiMergeExecuteCounter?.add(1, attributes as Attributes);
};

/**
 * Record merge preview event
 */
export const recordMergePreview = (attributes: {
  sourcePathId: string;
  targetPathId: string;
  conversationId?: string;
}): void => {
  uiMergePreviewCounter?.add(1, attributes as Attributes);
};

/**
 * Record message scroll/history navigation event
 */
export const recordMessageScroll = (attributes: {
  scrollDirection: 'up' | 'down';
  messageCount?: number;
  conversationId?: string;
  pathId?: string;
}): void => {
  uiMessageScrollCounter?.add(1, attributes as Attributes);
};

/**
 * Record message edit event
 */
export const recordMessageEdit = (attributes: {
  messageId: string;
  editType: 'content' | 'regenerate';
  createsBranch: boolean;
  conversationId?: string;
  pathId?: string;
}): void => {
  uiMessageEditCounter?.add(1, attributes as Attributes);
};

/**
 * Record E2B sandbox operation with duration
 */
export const recordE2BSandboxOperation = (
  durationMs: number,
  attributes: {
    operation: 'create' | 'reconnect' | 'terminate' | 'cleanup';
    sandboxId?: string;
    tier: string;
    region?: string;
    success: boolean;
    errorType?: string;
    tenantId?: string;
    userId?: string;
    conversationId?: string;
    pathId?: string;
  }
): void => {
  e2bSandboxOperationDurationHistogram?.record(durationMs, attributes as Attributes);
  e2bSandboxOperationCounter?.add(1, attributes as Attributes);
};

/**
 * Record E2B code execution duration
 */
export const recordE2BExecution = (
  durationSeconds: number,
  attributes: {
    sandboxId: string;
    tier: string;
    region?: string;
    success: boolean;
    tenantId?: string;
    userId?: string;
    conversationId?: string;
    pathId?: string;
    operationType?: string;
  }
): void => {
  e2bExecutionDurationHistogram?.record(durationSeconds, attributes as Attributes);
};

/**
 * Record E2B cost in USD with multi-dimensional attribution
 *
 * Enables cost tracking across multiple dimensions:
 * - Platform-wide (total E2B costs)
 * - Per-tenant (organizational billing)
 * - Per-user (individual usage)
 * - Per-conversation (session-level analysis)
 * - Per-path (branch-level tracking)
 */
export const recordE2BCost = async (attributes: {
  sandboxId: string;
  tier: string;
  region?: string;
  executionTimeSeconds: number;
  cpuCoreSeconds?: number;
  memoryGbSeconds?: number;
  diskIoGb?: number;
  tenantId?: string;
  userId?: string;
  conversationId?: string;
  pathId?: string;
  success?: boolean;
  isEstimated?: boolean;
}): Promise<void> => {
  try {
    // Import dynamically to avoid circular dependencies
    const { SupabaseE2BPricingService } = await import('./e2b/pricingService.js');
    const { SupabaseE2BCostTrackingService } = await import('./e2b/costTracking.js');
    const { getSupabaseClient } = await import('./costTracking/index.js');

    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      throw new Error('Supabase client is not initialized. Cannot record E2B costs.');
    }

    const pricingService = new SupabaseE2BPricingService(supabaseClient);
    const costTrackingService = new SupabaseE2BCostTrackingService(supabaseClient, pricingService);

    // Calculate cost
    const costCalculation = await pricingService.calculateCost({
      tier: attributes.tier,
      region: attributes.region || 'us-east-1',
      resourceUsage: {
        executionTimeSeconds: attributes.executionTimeSeconds,
        cpuCoreSeconds: attributes.cpuCoreSeconds,
        memoryGbSeconds: attributes.memoryGbSeconds,
        diskIoGb: attributes.diskIoGb,
      },
    });

    // Record to OpenTelemetry metrics (real-time observability)
    e2bCostCounter?.add(costCalculation.totalCostUsd, {
      sandboxId: attributes.sandboxId,
      tier: attributes.tier,
      region: attributes.region || 'us-east-1',
      tenantId: attributes.tenantId,
      userId: attributes.userId,
      conversationId: attributes.conversationId,
      pathId: attributes.pathId,
      isEstimated: costCalculation.isEstimated,
    } as Attributes);

    // Also record separate execution and resource costs for detailed analysis
    if (costCalculation.executionCostUsd > 0) {
      e2bCostCounter?.add(costCalculation.executionCostUsd, {
        sandboxId: attributes.sandboxId,
        tier: attributes.tier,
        costType: 'execution',
        tenantId: attributes.tenantId,
        userId: attributes.userId,
        conversationId: attributes.conversationId,
        pathId: attributes.pathId,
        isEstimated: costCalculation.isEstimated,
      } as Attributes);
    }

    if (costCalculation.resourceCostUsd > 0) {
      e2bCostCounter?.add(costCalculation.resourceCostUsd, {
        sandboxId: attributes.sandboxId,
        tier: attributes.tier,
        costType: 'resource',
        tenantId: attributes.tenantId,
        userId: attributes.userId,
        conversationId: attributes.conversationId,
        pathId: attributes.pathId,
        isEstimated: costCalculation.isEstimated,
      } as Attributes);
    }

    // Record to cost tracking service (storage & quota management)
    if (attributes.tenantId) {
      // Only record to database if we have tenant attribution
      // (Platform-wide costs without attribution go to metrics only)
      await costTrackingService.recordCost({
        sandboxId: attributes.sandboxId,
        tier: attributes.tier,
        region: attributes.region || 'us-east-1',
        executionTimeSeconds: attributes.executionTimeSeconds,
        cpuCoreSeconds: attributes.cpuCoreSeconds,
        memoryGbSeconds: attributes.memoryGbSeconds,
        diskIoGb: attributes.diskIoGb,
        executionCostUsd: costCalculation.executionCostUsd,
        resourceCostUsd: costCalculation.resourceCostUsd,
        totalCostUsd: costCalculation.totalCostUsd,
        isEstimated: costCalculation.isEstimated,
        tenantId: attributes.tenantId,
        userId: attributes.userId,
        conversationId: attributes.conversationId,
        pathId: attributes.pathId,
        success: attributes.success ?? true,
      });

      // Update quota
      await costTrackingService.incrementQuotaSpend(attributes.tenantId, costCalculation.totalCostUsd);
    }
  } catch (error) {
    // Silently fail if pricing/cost tracking service is unavailable
    // This prevents metrics recording from blocking E2B operations
    console.warn('Failed to record E2B cost:', error);
  }
};

/**
 * Record E2B resource usage
 */
export const recordE2BResourceUsage = (attributes: {
  sandboxId: string;
  tier: string;
  region?: string;
  resourceType: 'cpu' | 'memory' | 'disk' | 'network';
  amount: number;  // core-seconds, GB-seconds, GB, etc.
  tenantId?: string;
  userId?: string;
  conversationId?: string;
  pathId?: string;
}): void => {
  const { amount, ...metricAttributes } = attributes;
  e2bResourceUsageCounter?.add(amount, metricAttributes as Attributes);
};

/**
 * Lifecycle stages for E2B operations
 * Provides explicit attribution of errors to specific phases
 */
export type E2BLifecycleStage =
  | 'initialization'        // Initial setup, API connection
  | 'quota_validation'      // Pre-request quota checks
  | 'resource_allocation'   // Sandbox creation, resource provisioning
  | 'connection'            // Connecting/reconnecting to sandbox
  | 'execution'             // Code execution within sandbox
  | 'result_retrieval'      // Fetching execution results
  | 'cleanup'               // Sandbox termination, resource cleanup
  | 'monitoring'            // Health checks, metrics collection
  | 'unknown';              // Fallback for unclassified stages

/**
 * Record E2B error with explicit lifecycle stage attribution
 *
 * Enhanced error tracking that provides clear visibility into
 * which phase of the sandbox lifecycle experienced the error.
 *
 * @example
 * ```typescript
 * recordE2BError({
 *   operation: 'create',
 *   lifecycleStage: 'quota_validation',
 *   errorType: 'QuotaExceededError',
 *   tenantId: 'tenant-123'
 * });
 * ```
 */
export const recordE2BError = (attributes: {
  operation: 'create' | 'reconnect' | 'terminate' | 'cleanup' | 'execute';
  errorType: string;
  lifecycleStage?: E2BLifecycleStage;
  sandboxId?: string;
  tier?: string;
  tenantId?: string;
  conversationId?: string;
  pathId?: string;
}): void => {
  // Auto-derive lifecycle stage from operation if not explicitly provided
  const lifecycleStage = attributes.lifecycleStage || deriveLifecycleStageFromOperation(attributes.operation);

  e2bErrorCounter?.add(1, {
    ...attributes,
    lifecycle_stage: lifecycleStage,
  } as Attributes);
};

/**
 * Derive lifecycle stage from operation type
 * Used as fallback when explicit stage is not provided
 */
function deriveLifecycleStageFromOperation(operation: string): E2BLifecycleStage {
  switch (operation) {
    case 'create':
      return 'resource_allocation';
    case 'reconnect':
      return 'connection';
    case 'terminate':
    case 'cleanup':
      return 'cleanup';
    case 'execute':
      return 'execution';
    default:
      return 'unknown';
  }
}
