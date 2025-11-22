/**
 * Main entry point for @e2b-auditor/core
 *
 * This package provides the core functionality for auditing HTTP APIs
 * against RFC standards and OWASP Top 10 security guidelines.
 */

// Types
export * from './types.js';

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
  getMcpGatewayUrl,
} from './mcpClient.js';

// Graph Context
export {
  discoverAndUpsertSpecs,
  fetchGraphContextForFindings,
} from './graphContext.js';

// Groq Client
export { groqChat, analyzeComplianceWithGroq } from './groqClient.js';

// Audit Engine
export { runAuditOnSampleApi, reportToSummary } from './auditEngine.js';
