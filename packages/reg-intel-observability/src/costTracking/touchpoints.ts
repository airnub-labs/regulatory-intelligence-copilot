/**
 * LLM Touchpoint Constants
 *
 * Defines all touchpoints where LLM calls are made in the system.
 * Used for cost attribution and optimization analysis.
 *
 * @example
 * ```typescript
 * import { LLM_TOUCHPOINTS } from '@reg-copilot/reg-intel-observability';
 *
 * await costTrackingService.recordCost({
 *   task: LLM_TOUCHPOINTS.MAIN_CHAT,
 *   // ... other fields
 * });
 * ```
 */

/**
 * LLM touchpoint identifiers for cost attribution
 */
export const LLM_TOUCHPOINTS = {
  /** Main user chat interface - primary interaction point */
  MAIN_CHAT: 'main-chat',

  /** Merge summarizer - summarizes content when merging paths */
  MERGE_SUMMARIZER: 'merge-summarizer',

  /** Global regulatory compliance agent */
  AGENT_GLOBAL_REGULATORY: 'agent:global-regulatory',

  /** Ireland social safety net compliance agent */
  AGENT_IE_SOCIAL_SAFETY: 'agent:ie-social-safety',

  /** Compliance engine orchestrator */
  COMPLIANCE_ENGINE: 'compliance-engine',

  /** Semantic compaction for path messages */
  COMPACTION_SEMANTIC: 'compaction:semantic',

  /** Moderate merge compaction strategy */
  COMPACTION_MERGE_MODERATE: 'compaction:merge-moderate',

  /** PII sanitizer / egress guard */
  PII_SANITIZER: 'pii-sanitizer',
} as const;

/**
 * Touchpoint type derived from the constants
 */
export type LlmTouchpoint = (typeof LLM_TOUCHPOINTS)[keyof typeof LLM_TOUCHPOINTS];

/**
 * Touchpoint priority levels for cost optimization
 * P0 = Critical path, P1 = High priority, P2 = Optimization target
 */
export const TOUCHPOINT_PRIORITY: Record<LlmTouchpoint, 'P0' | 'P1' | 'P2'> = {
  [LLM_TOUCHPOINTS.MAIN_CHAT]: 'P0',
  [LLM_TOUCHPOINTS.COMPLIANCE_ENGINE]: 'P0',
  [LLM_TOUCHPOINTS.AGENT_GLOBAL_REGULATORY]: 'P0',
  [LLM_TOUCHPOINTS.MERGE_SUMMARIZER]: 'P1',
  [LLM_TOUCHPOINTS.AGENT_IE_SOCIAL_SAFETY]: 'P1',
  [LLM_TOUCHPOINTS.PII_SANITIZER]: 'P1',
  [LLM_TOUCHPOINTS.COMPACTION_SEMANTIC]: 'P2',
  [LLM_TOUCHPOINTS.COMPACTION_MERGE_MODERATE]: 'P2',
};

/**
 * Human-readable descriptions for each touchpoint
 */
export const TOUCHPOINT_DESCRIPTIONS: Record<LlmTouchpoint, string> = {
  [LLM_TOUCHPOINTS.MAIN_CHAT]: 'Main user chat interface',
  [LLM_TOUCHPOINTS.MERGE_SUMMARIZER]: 'Path merge summarization',
  [LLM_TOUCHPOINTS.AGENT_GLOBAL_REGULATORY]: 'Global regulatory compliance agent',
  [LLM_TOUCHPOINTS.AGENT_IE_SOCIAL_SAFETY]: 'Ireland social safety net agent',
  [LLM_TOUCHPOINTS.COMPLIANCE_ENGINE]: 'Compliance engine orchestrator',
  [LLM_TOUCHPOINTS.COMPACTION_SEMANTIC]: 'Semantic path compaction',
  [LLM_TOUCHPOINTS.COMPACTION_MERGE_MODERATE]: 'Moderate merge compaction',
  [LLM_TOUCHPOINTS.PII_SANITIZER]: 'PII detection and sanitization',
};

/**
 * All valid touchpoint values as an array
 */
export const ALL_TOUCHPOINTS: LlmTouchpoint[] = Object.values(LLM_TOUCHPOINTS);

/**
 * Check if a string is a valid touchpoint
 */
export function isValidTouchpoint(value: string): value is LlmTouchpoint {
  return ALL_TOUCHPOINTS.includes(value as LlmTouchpoint);
}
