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
export type { LoggerBindings } from './logger.js';
export type {
  ExporterEndpointOptions,
  ObservabilityOptions,
  TraceSamplingOptions,
} from './tracing.js';
