/**
 * Client-safe exports for @reg-copilot/reg-intel-core
 *
 * This entry point only exports types, constants, and utilities that are safe
 * to use in browser/client environments. No Node.js dependencies (E2B, MCP, etc.)
 */

// Types (always safe for client)
export * from './types.js';

// Constants (safe for client)
export {
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  LOG_PREFIX,
  NON_ADVICE_DISCLAIMER,
  UNCERTAINTY_DESCRIPTIONS,
  DEFAULT_JURISDICTION,
  SUPPORTED_JURISDICTIONS,
} from './constants.js';

export { DEFAULT_PROFILE_ID, normalizeProfileType } from './profiles.js';
export { PROFILE_IDS, type ProfileId } from './types.js';

// Errors (safe for client)
export {
  ComplianceError,
  AuditorError,
  SandboxError,
  McpError,
  LlmError,
  GraphError,
  AgentError,
  isComplianceError,
  isAuditorError,
  getErrorMessage,
} from './errors.js';

// Prompt types and aspects (safe for client - no functions, just types)
export type {
  PromptContext,
  BuiltPrompt,
  PromptAspect,
} from '@reg-copilot/reg-intel-prompts';

// Graph types (safe for client)
export type {
  GraphClient,
  GraphContext,
  GraphNode,
  GraphEdge,
  GraphPatch,
  ChangeFilter,
  ChangeCallback,
  ChangeSubscription,
} from '@reg-copilot/reg-intel-graph';

// Note: Do NOT export:
// - E2B functions (createSandbox, runInSandbox, etc.)
// - MCP functions (mcpCall, callMemgraphMcp, etc.)
// - Sandbox lifecycle functions (require Node.js)
// - Graph client factories (require Node.js/MCP)
// - LLM client/router instances (require Node.js)
// - Compliance Engine (server-only)
