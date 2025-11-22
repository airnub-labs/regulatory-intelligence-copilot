/**
 * Shared constants used across the auditor
 *
 * This file centralizes magic strings and configuration values
 * to ensure consistency and make maintenance easier.
 */

/**
 * Special token that triggers an audit when included in a chat message.
 * The frontend sends this token to indicate the user wants to run an audit.
 */
export const AUDIT_TRIGGER = '__RUN_SAMPLE_AUDIT__';

/**
 * Default Groq model for compliance analysis
 */
export const DEFAULT_GROQ_MODEL = 'compound-beta';

/**
 * Default temperature for LLM calls (lower = more deterministic)
 */
export const DEFAULT_LLM_TEMPERATURE = 0.3;

/**
 * Default max tokens for LLM responses
 */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Default E2B sandbox timeout in milliseconds (5 minutes)
 */
export const DEFAULT_SANDBOX_TIMEOUT_MS = 300000;

/**
 * Maximum length for body previews in sanitized exchanges
 */
export const MAX_BODY_PREVIEW_LENGTH = 200;

/**
 * Sample API base URL inside the sandbox
 */
export const SAMPLE_API_BASE_URL = 'http://localhost:3001';

/**
 * Sample API port
 */
export const SAMPLE_API_PORT = 3001;

/**
 * HTTP status emojis for report formatting
 */
export const STATUS_EMOJI = {
  compliant: '✅',
  warning: '⚠️',
  critical: '❌',
} as const;

/**
 * Log prefixes for consistent logging
 */
export const LOG_PREFIX = {
  audit: '[Audit]',
  mcp: '[MCP]',
  e2b: '[E2B]',
  api: '[API]',
} as const;
