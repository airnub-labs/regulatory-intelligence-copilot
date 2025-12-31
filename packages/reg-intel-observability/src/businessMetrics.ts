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
}): Promise<void> => {
  try {
    // Import pricing service dynamically to avoid circular dependencies
    const { calculateLlmCost } = await import('./pricing/index.js');

    const costCalculation = await calculateLlmCost(
      attributes.provider,
      attributes.model,
      attributes.inputTokens,
      attributes.outputTokens
    );

    // Record total cost with attribution
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
