/**
 * Shared constants for Regulatory Intelligence Copilot
 */

/**
 * Default Groq model for LLM calls
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
 * Default E2B sandbox timeout in milliseconds (30 minutes)
 */
export const DEFAULT_SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Log prefixes for consistent logging
 */
export const LOG_PREFIX = {
  agent: '[Agent]',
  mcp: '[MCP]',
  e2b: '[E2B]',
  graph: '[Graph]',
  timeline: '[Timeline]',
  egress: '[Egress]',
} as const;

/**
 * Non-advice disclaimer to include in all responses
 */
export const NON_ADVICE_DISCLAIMER =
  'This information is for research purposes only and does not constitute legal, tax, or welfare advice. ' +
  'Please consult with qualified professionals (e.g., tax advisors, solicitors, or relevant authorities) ' +
  'to confirm how these rules apply to your specific circumstances.';

/**
 * Uncertainty level descriptions
 */
export const UNCERTAINTY_DESCRIPTIONS = {
  low: 'The information appears well-established in the referenced sources.',
  medium: 'Some aspects may depend on interpretation or specific circumstances.',
  high: 'Significant uncertainty exists; professional consultation is strongly recommended.',
} as const;

/**
 * Default jurisdiction
 */
export const DEFAULT_JURISDICTION = 'IE';

/**
 * Supported jurisdictions
 */
export const SUPPORTED_JURISDICTIONS = ['IE', 'MT', 'IM', 'EU'] as const;
