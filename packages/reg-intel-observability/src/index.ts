export { createLogger, flushLoggers, formatPayloadForLog } from './logger.js';
export { dumpObservabilityDiagnostics, formatObservabilityDiagnostics, getObservabilityDiagnostics } from './diagnostics.js';
export { initObservability, shutdownObservability, withSpan } from './tracing.js';
export { requestContext, type RequestContextValues } from './requestContext.js';
export { createTracingFetch, injectTraceContextHeaders } from './tracePropagation.js';
export { createPinoOtelTransport, getLoggerProvider } from './logsExporter.js';
export {
  initBusinessMetrics,
  recordAgentSelection,
  recordGraphQuery,
  recordLlmTokenUsage,
  recordLlmRequest,
  recordLlmCost,
  recordEgressGuardScan,
  withMetricTiming,
  // UI/UX metrics
  recordBreadcrumbNavigate,
  recordBranchCreate,
  recordPathSwitch,
  recordMergeExecute,
  recordMergePreview,
  recordMessageScroll,
  recordMessageEdit,
} from './businessMetrics.js';

// Compaction Metrics
export {
  initCompactionMetrics,
  recordCompactionOperation,
  recordCompactionFailure,
} from './compactionMetrics.js';
export type { LoggerBindings } from './logger.js';
export type {
  ExporterEndpointOptions,
  ObservabilityOptions,
  TraceSamplingOptions,
} from './tracing.js';

// Model Pricing & Cost Tracking
export {
  type ModelPricing,
  type CostCalculation,
  type CostEstimateRequest,
  type LlmCostMetrics,
  type PricingService,
  InMemoryPricingService,
  createPricingService,
  getDefaultPricingService,
  calculateLlmCost,
  OPENAI_PRICING,
  ANTHROPIC_PRICING,
  GOOGLE_PRICING,
  GROQ_PRICING,
  LOCAL_PRICING,
  ALL_PRICING,
  DEFAULT_PRICING,
} from './pricing/index.js';

// Cost Storage & Quota Management
export {
  type LlmCostRecord,
  type CostAggregate,
  type CostAggregateQuery,
  type CostQuota,
  type QuotaCheckRequest,
  type QuotaCheckResult,
  type CostStorageProvider,
  type QuotaProvider,
  type CostTrackingOptions,
  type RecordCostRequest,
  CostTrackingService,
  initCostTracking,
  getCostTrackingService,
  getCostTrackingServiceIfInitialized,
  InMemoryCostStorage,
  InMemoryQuotaProvider,
} from './costTracking/index.js';
