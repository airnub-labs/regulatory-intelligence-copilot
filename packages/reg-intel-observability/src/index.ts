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
  // E2B metrics
  recordE2BSandboxOperation,
  recordE2BExecution,
  recordE2BCost,
  recordE2BResourceUsage,
  recordE2BError,
} from './businessMetrics.js';

// Compaction Metrics
export {
  initCompactionMetrics,
  recordCompactionOperation,
  recordCompactionFailure,
} from './compactionMetrics.js';

// Compaction Storage (Supabase persistence for analytics)
export {
  initCompactionStorage,
  initCompactionStorageWithClient,
  isCompactionStorageInitialized,
  recordCompactionToDatabase,
  recordCompactionFailureToDatabase,
  type CompactionOperationRecord,
} from './compactionStorage.js';
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
  SupabasePricingService,
  initPricingService,
  getPricingService,
  getPricingServiceIfInitialized,
  calculateLlmCost,
  // Note: Static pricing constants (OPENAI_PRICING, etc.) are intentionally NOT
  // exported. All runtime pricing must come from SupabasePricingService to ensure
  // current data. Static pricing data in pricingData.seed.ts is only for test seeding.
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
  SupabaseCostStorage,
  SupabaseQuotaProvider,
  LLM_TOUCHPOINTS,
} from './costTracking/index.js';

// Cost anomaly detection and alerting
export {
  AnomalyDetectionService,
  createAnomalyDetectionService,
  initAnomalyDetection,
  getAnomalyDetectionService,
  getAnomalyDetectionServiceIfInitialized,
  DefaultNotificationService,
  createNotificationService,
  createCostAlert,
  getNotificationService,
  initNotificationServiceFromEnv,
  type AnomalyDetectionConfig,
  type AnomalyResult,
  type NotificationService,
  type NotificationConfig,
  type NotificationChannel,
  type NotificationResult,
  type CostAlert,
  type AlertSeverity,
  type SlackConfig,
  type EmailConfig,
  type PagerDutyConfig,
} from './costTracking/index.js';

// E2B Pricing & Cost Tracking
export {
  SupabaseE2BPricingService,
  SupabaseE2BCostTrackingService,
  type E2BPricingService,
  type E2BCostTrackingService,
  type E2BResourceUsage,
  type E2BCostCalculation,
  type E2BCostRecord,
  type E2BQuotaCheckResult,
  estimateE2BCost,
  calculateAndRecordE2BCost,
  initE2BCostTracking,
  getE2BPricingService,
  getE2BCostTrackingService,
  getE2BPricingServiceIfInitialized,
  getE2BCostTrackingServiceIfInitialized,
} from './e2b/index.js';

// Cost Estimation (Pre-Operation Quota Checks)
export {
  type CostEstimationService,
  type ConfidenceLevel,
  type LLMOperationType,
  type E2BOperationType,
  type LLMCostEstimateParams,
  type E2BCostEstimateParams,
  type LLMCostEstimate,
  type E2BCostEstimate,
  SupabaseCostEstimationService,
  initCostEstimationService,
  getCostEstimationService,
  getCostEstimationServiceIfInitialized,
} from './costEstimation/index.js';
