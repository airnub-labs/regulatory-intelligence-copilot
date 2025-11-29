/**
 * @package reg-intel-prompts
 *
 * Jurisdiction-neutral prompts and aspect system for regulatory intelligence.
 *
 * This package provides:
 * - Base prompts and system messages
 * - Prompt aspect pipeline for composition
 * - Jurisdiction, agent, and profile context aspects
 * - Disclaimer and uncertainty messaging
 */

// Prompt Aspects
export {
  type PromptContext,
  type BuiltPrompt,
  type PromptAspect,
  jurisdictionAspect,
  agentContextAspect,
  profileContextAspect,
  disclaimerAspect,
  additionalContextAspect,
  conversationContextAspect,
  createPromptBuilder,
  defaultPromptBuilder,
  buildPromptWithAspects,
  createCustomPromptBuilder,
} from './promptAspects.js';

// Aspect Utilities
export {
  type Aspect,
  applyAspects,
} from './applyAspects.js';

// Constants
export {
  NON_ADVICE_DISCLAIMER,
  UNCERTAINTY_DESCRIPTIONS,
} from './constants.js';
