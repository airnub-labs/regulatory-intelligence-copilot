/**
 * Main entry point for @reg-copilot/reg-intel-core
 *
 * This package provides the core orchestration and agents for the Regulatory Intelligence Copilot.
 * It re-exports focused packages for graph, LLM, and prompt operations.
 */

// Types
export * from './types.js';

// Constants
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

// Errors
export {
  ComplianceError,
  AuditorError, // deprecated alias
  SandboxError,
  McpError,
  LlmError,
  GraphError,
  AgentError,
  isComplianceError,
  isAuditorError, // deprecated alias
  getErrorMessage,
} from './errors.js';

// Aspects - Re-exported from reg-intel-prompts and reg-intel-llm
export { applyAspects, type Aspect } from '@reg-copilot/reg-intel-prompts';
export {
  sanitizeTextForEgress,
  sanitizeObjectForEgress,
  isSensitiveHeader,
  SENSITIVE_HEADERS,
} from '@reg-copilot/reg-intel-llm';
export {
  buildPromptWithAspects,
  createPromptBuilder,
  createCustomPromptBuilder,
  defaultPromptBuilder,
  jurisdictionAspect,
  agentContextAspect,
  profileContextAspect,
  disclaimerAspect,
  additionalContextAspect,
  type PromptContext,
  type BuiltPrompt,
  type PromptAspect,
} from '@reg-copilot/reg-intel-prompts';

// E2B Client
export {
  createSandbox,
  runInSandbox,
  closeSandbox,
  type SandboxHandle,
} from './e2bClient.js';

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
  hasActiveSandbox,
  getActiveSandboxId,
  resetActiveSandbox,
} from './sandboxManager.js';

// Timeline Engine
export {
  createTimelineEngine,
  computeLookbackRange,
  isWithinLookback,
  computeLockInEnd,
  isLockInActive,
} from './timeline/timelineEngine.js';

// Graph Client - Re-exported from reg-intel-graph
export { createGraphClient } from './graph/graphClient.js'; // Legacy MCP-based (still local, depends on MCP)
export {
  BoltGraphClient,
  createBoltGraphClient,
  type BoltGraphClientConfig,
  type GraphClient,
  type GraphContext,
  type GraphNode,
  type GraphEdge,
} from '@reg-copilot/reg-intel-graph';

// Graph Change Detection - Re-exported from reg-intel-graph
export {
  GraphChangeDetector,
  createGraphChangeDetector,
  type GraphPatch,
  type ChangeFilter,
  type ChangeCallback,
  type ChangeSubscription,
  type GraphChangeDetectorConfig,
} from '@reg-copilot/reg-intel-graph';

// Graph Ingress Guard & Write Service - Re-exported from reg-intel-graph
export {
  type GraphWriteContext,
  type GraphIngressAspect,
  composeIngressAspects,
  schemaValidationAspect,
  piiBlockingAspect,
  propertyWhitelistAspect,
  createBaselineAspects,
  GraphWriteService,
  createGraphWriteService,
  type GraphWriteServiceConfig,
  type UpsertJurisdictionDto,
  type UpsertRegionDto,
  type UpsertStatuteDto,
  type UpsertSectionDto,
  type UpsertBenefitDto,
  type UpsertReliefDto,
  type UpsertTimelineDto,
  type UpsertAgreementDto,
  type UpsertRegimeDto,
  type CreateRelationshipDto,
  createCanonicalConceptHandler,
  type CapturedConceptInput,
} from '@reg-copilot/reg-intel-graph';

// LLM Client (legacy MCP-based)
export {
  createLlmClient,
  buildRegulatoryPrompt,
  buildSystemPrompt,
  buildSystemPromptAsync,
  REGULATORY_COPILOT_SYSTEM_PROMPT,
} from './llm/llmClient.js';

// LLM Router (provider-agnostic) - Re-exported from reg-intel-llm
export {
  type LlmCompletionOptions,
  type LlmStreamChunk,
  type LlmTaskPolicy,
  type TenantLlmPolicy,
  type LlmProviderClient,
  type LlmProviderRegistry,
  type LlmPolicyStore,
  LlmRouter,
  InMemoryPolicyStore,
  createLlmRouter,
  createDefaultLlmRouter,
} from '@reg-copilot/reg-intel-llm';

// Compliance Engine (Orchestrator)
export {
  ComplianceEngine,
  createComplianceEngine,
  type ComplianceRequest,
  type ComplianceResponse,
  type ComplianceStreamChunk,
  type ComplianceEngineDeps,
  type ConversationContext,
  type ConversationContextStore,
  type ConversationIdentity,
  EMPTY_CONVERSATION_CONTEXT,
} from './orchestrator/complianceEngine.js';

// Agents
export { SingleDirector_IE_SocialSafetyNet_Agent } from './agents/SingleDirector_IE_SocialSafetyNet_Agent.js';
export {
  GlobalRegulatoryComplianceAgent,
  createComplianceOrchestrator,
} from './agents/GlobalRegulatoryComplianceAgent.js';
