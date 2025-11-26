/**
 * Constants for @reg-copilot/reg-intel-prompts
 */

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
