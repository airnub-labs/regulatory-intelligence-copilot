/**
 * Main entry point for @e2b-auditor/core
 *
 * This package now includes the regulatory intelligence building blocks
 * alongside the legacy HTTP audit utilities. New code should prefer the
 * compliance-oriented exports below.
 */

// Types
export * from './types.js';
export * from './compliance/types.js';

// Constants
export {
  AUDIT_TRIGGER,
  DEFAULT_GROQ_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  MAX_BODY_PREVIEW_LENGTH,
  SAMPLE_API_BASE_URL,
  SAMPLE_API_PORT,
  STATUS_EMOJI,
  LOG_PREFIX,
} from './constants.js';

// Errors
export {
  AuditorError,
  SandboxError,
  McpError,
  LlmError,
  ProbeError,
  SanitizationError,
  GraphError,
  isAuditorError,
  getErrorMessage,
} from './errors.js';

// OWASP Configuration
export {
  OWASP_CATEGORIES,
  getOwaspCategories,
  getOwaspVersion,
  initializeOwaspCategories,
  refreshOwaspCategories,
  configureOwaspCacheTtl,
  clearOwaspCache,
  findOwaspCategoryById,
  findOwaspCategoriesByKeyword,
  matchOwaspCategories,
  type OwaspCategory,
} from './config/owaspCategories.js';

// Aspects
export { applyAspects, type Aspect } from './aspects/applyAspects.js';
export {
  sanitizeTextForEgress,
  sanitizeObjectForEgress,
  isSensitiveHeader,
  SENSITIVE_HEADERS,
} from './aspects/egressGuard.js';

// E2B Client
export {
  createSandbox,
  runSampleApiInSandbox,
  runInSandbox,
  closeSandbox,
  type SandboxHandle,
} from './e2bClient.js';

// HTTP Probing
export { probeSampleApi, probeSingleEndpoint } from './probeHttp.js';

// Sanitization
export { sanitizeHttpExchange, sanitizeHttpExchanges } from './sanitizeHttp.js';

// MCP Client
export {
  mcpCall,
  callPerplexityMcp,
  callMemgraphMcp,
  getMemgraphSchema,
  configureMcpGateway,
  isMcpGatewayConfigured,
  getMcpGatewayUrl,
} from './mcpClient.js';

// Sandbox lifecycle
export {
  getOrCreateActiveSandbox,
  ensureSampleApiRunning,
  hasActiveSandbox,
  getActiveSandboxId,
  resetActiveSandbox,
} from './sandboxManager.js';

// Graph Context
export {
  discoverAndUpsertSpecs,
  fetchGraphContextForFindings,
  extractAndUpsertSpecsFromText,
} from './graphContext.js';

// Groq Client
export { groqChat, analyzeComplianceWithGroq } from './groqClient.js';

// Audit Engine
export { runAuditOnSampleApi, reportToSummary } from './auditEngine.js';

// Compliance orchestration
export {
  BasicTimelineEngine,
  formatDateRange,
} from './compliance/timelineEngine.js';
export { BasicEgressGuard } from './compliance/egressGuard.js';
export { MemgraphGraphClient } from './compliance/graphClient.js';
export {
  GlobalRegulatoryComplianceAgent,
} from './compliance/agents/globalRegulatoryComplianceAgent.js';
export { SingleDirectorIESocialSafetyNetAgent } from './compliance/agents/singleDirectorSocialSafetyNetAgent.js';
export { runRegulatoryAnalysis } from './compliance/orchestrator.js';
