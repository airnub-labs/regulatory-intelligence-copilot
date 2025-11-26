/**
 * Client-safe exports from @reg-copilot/reg-intel-core
 *
 * This file exports only constants and types that can be safely used in browser environments.
 * It does NOT export any Node.js-specific modules or dependencies.
 */

// Types - safe for client use
export * from './types.js';

// Constants - safe for client use
export {
  DEFAULT_GROQ_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  LOG_PREFIX,
  NON_ADVICE_DISCLAIMER,
  UNCERTAINTY_DESCRIPTIONS,
  DEFAULT_JURISDICTION,
  SUPPORTED_JURISDICTIONS,
} from './constants.js';

export { DEFAULT_PROFILE_ID, normalizeProfileType } from './profiles.js';
export { PROFILE_IDS, type ProfileId } from './types.js';
