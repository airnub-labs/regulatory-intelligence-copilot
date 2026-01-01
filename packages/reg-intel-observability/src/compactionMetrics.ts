/**
 * Compaction Metrics
 *
 * OpenTelemetry metrics for tracking conversation compaction operations.
 *
 * Metrics:
 * - compaction.operations (counter) - Total compaction operations
 * - compaction.tokens.saved (counter) - Tokens saved by compaction
 * - compaction.messages.removed (counter) - Messages removed
 * - compaction.duration (histogram) - Compaction operation duration
 * - compaction.compression.ratio (histogram) - Compression ratio (tokens after / tokens before)
 */

import { metrics, type Attributes, type Counter, type Histogram } from '@opentelemetry/api';

// Metric instruments
let compactionOperationsCounter: Counter | null = null;
let compactionTokensSavedCounter: Counter | null = null;
let compactionMessagesRemovedCounter: Counter | null = null;
let compactionDurationHistogram: Histogram | null = null;
let compactionCompressionRatioHistogram: Histogram | null = null;

/**
 * Initialize compaction metrics
 */
export const initCompactionMetrics = (): void => {
  const meter = metrics.getMeter('reg-intel-compaction-metrics', '1.0.0');

  compactionOperationsCounter = meter.createCounter('compaction.operations', {
    description: 'Total number of compaction operations performed',
    unit: 'operations',
  });

  compactionTokensSavedCounter = meter.createCounter('compaction.tokens.saved', {
    description: 'Total tokens saved by compaction operations',
    unit: 'tokens',
  });

  compactionMessagesRemovedCounter = meter.createCounter('compaction.messages.removed', {
    description: 'Total messages removed by compaction',
    unit: 'messages',
  });

  compactionDurationHistogram = meter.createHistogram('compaction.duration', {
    description: 'Duration of compaction operations',
    unit: 'ms',
  });

  compactionCompressionRatioHistogram = meter.createHistogram('compaction.compression.ratio', {
    description: 'Compression ratio (tokens after / tokens before)',
    unit: 'ratio',
  });
};

/**
 * Record a compaction operation
 */
export const recordCompactionOperation = (attributes: {
  strategy: string;
  conversationId?: string;
  tenantId?: string;
  userId?: string;
  tokensBefore: number;
  tokensAfter: number;
  messagesBefore: number;
  messagesAfter: number;
  messagesSummarized: number;
  pinnedPreserved: number;
  success: boolean;
  durationMs: number;
  triggeredBy?: 'auto' | 'manual';
  usedLlm?: boolean;
}): void => {
  const {
    strategy,
    conversationId,
    tenantId,
    userId,
    tokensBefore,
    tokensAfter,
    messagesBefore,
    messagesAfter,
    messagesSummarized,
    pinnedPreserved,
    success,
    durationMs,
    triggeredBy,
    usedLlm,
  } = attributes;

  const metricAttributes: Attributes = {
    strategy,
    conversationId,
    tenantId,
    userId,
    success,
    triggeredBy: triggeredBy ?? 'manual',
    usedLlm: usedLlm ?? false,
  };

  // Record operation count
  compactionOperationsCounter?.add(1, metricAttributes);

  // Record tokens saved
  const tokensSaved = tokensBefore - tokensAfter;
  if (tokensSaved > 0) {
    compactionTokensSavedCounter?.add(tokensSaved, metricAttributes);
  }

  // Record messages removed
  const messagesRemoved = messagesBefore - messagesAfter;
  if (messagesRemoved > 0) {
    compactionMessagesRemovedCounter?.add(messagesRemoved, {
      ...metricAttributes,
      messagesSummarized,
      pinnedPreserved,
    });
  }

  // Record duration
  compactionDurationHistogram?.record(durationMs, metricAttributes);

  // Record compression ratio
  const compressionRatio = tokensBefore > 0 ? tokensAfter / tokensBefore : 1.0;
  compactionCompressionRatioHistogram?.record(compressionRatio, metricAttributes);
}

/**
 * Record compaction failure
 */
export const recordCompactionFailure = (attributes: {
  strategy: string;
  conversationId?: string;
  tenantId?: string;
  userId?: string;
  error: string;
  durationMs?: number;
}): void => {
  const metricAttributes: Attributes = {
    strategy: attributes.strategy,
    conversationId: attributes.conversationId,
    tenantId: attributes.tenantId,
    userId: attributes.userId,
    success: false,
    error: attributes.error,
  };

  compactionOperationsCounter?.add(1, metricAttributes);

  if (attributes.durationMs !== undefined) {
    compactionDurationHistogram?.record(attributes.durationMs, metricAttributes);
  }
};

/**
 * Example PromQL queries for compaction metrics:
 *
 * Total compaction operations:
 *   sum(compaction_operations_total)
 *
 * Tokens saved by strategy:
 *   sum by (strategy) (compaction_tokens_saved_total)
 *
 * Average compression ratio by strategy:
 *   avg by (strategy) (compaction_compression_ratio)
 *
 * P95 compaction duration:
 *   histogram_quantile(0.95, sum(rate(compaction_duration_bucket[5m])) by (le, strategy))
 *
 * Tokens saved per tenant:
 *   sum by (tenantId) (compaction_tokens_saved_total)
 *
 * Compaction success rate:
 *   sum(rate(compaction_operations_total{success="true"}[5m])) /
 *   sum(rate(compaction_operations_total[5m]))
 */
