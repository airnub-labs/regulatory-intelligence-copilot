/**
 * Business Metrics - Custom OpenTelemetry metrics for regulatory intelligence operations
 *
 * Provides instrumentation for:
 * - Agent selection and routing
 * - Graph query performance
 * - LLM token usage
 * - Egress guard operations
 */

import { metrics, type Attributes, type Counter, type Histogram, type ObservableGauge } from '@opentelemetry/api';

// Metric instrument instances
let agentSelectionCounter: Counter | null = null;
let graphQueryDurationHistogram: Histogram | null = null;
let graphQueryCounter: Counter | null = null;
let llmTokenUsageCounter: Counter | null = null;
let llmRequestDurationHistogram: Histogram | null = null;
let egressGuardCounter: Counter | null = null;
let egressGuardBlockCounter: Counter | null = null;

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

  // Egress guard metrics
  egressGuardCounter = meter.createCounter('regintel.egressguard.scan.total', {
    description: 'Total number of egress guard scans',
    unit: '{scans}',
  });

  egressGuardBlockCounter = meter.createCounter('regintel.egressguard.block.total', {
    description: 'Total number of egress guard blocks (PII/sensitive data detected)',
    unit: '{blocks}',
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
 * Record LLM token usage
 */
export const recordLlmTokenUsage = (attributes: {
  provider: string;
  model: string;
  tokenType: 'input' | 'output' | 'total';
  tokens: number;
  cached?: boolean;
}): void => {
  const { tokens, ...metricAttributes } = attributes;
  llmTokenUsageCounter?.add(tokens, metricAttributes as Attributes);
};

/**
 * Record LLM request duration
 */
export const recordLlmRequest = (
  durationMs: number,
  attributes: {
    provider: string;
    model: string;
    success: boolean;
    streaming?: boolean;
    cached?: boolean;
  }
): void => {
  llmRequestDurationHistogram?.record(durationMs, attributes as Attributes);
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
