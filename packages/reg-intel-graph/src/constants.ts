/**
 * Constants for @reg-copilot/reg-intel-graph
 */

/**
 * Log prefixes for consistent logging
 */
export const LOG_PREFIX = {
  graph: '[Graph]',
  timeline: '[Timeline]',
} as const;

/**
 * Default jurisdiction
 */
export const DEFAULT_JURISDICTION = 'IE';

/**
 * Supported jurisdictions
 */
export const SUPPORTED_JURISDICTIONS = ['IE', 'MT', 'IM', 'EU', 'UK', 'NI'] as const;
