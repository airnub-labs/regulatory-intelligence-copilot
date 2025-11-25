/**
 * Main entry point for @reg-copilot/compliance-core
 *
 * This package provides the core functionality for the Regulatory Intelligence Copilot,
 * including agents, graph operations, timeline engine, and egress guard.
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

// Aspects
export { applyAspects, type Aspect } from './aspects/applyAspects.js';
export {
  sanitizeTextForEgress,
  sanitizeObjectForEgress,
  isSensitiveHeader,
  SENSITIVE_HEADERS,
} from './aspects/egressGuard.js';
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
} from './aspects/promptAspects.js';

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

// Graph Client
export { createGraphClient } from './graph/graphClient.js'; // Legacy MCP-based
export {
  BoltGraphClient,
  createBoltGraphClient,
  type BoltGraphClientConfig,
} from './graph/boltGraphClient.js'; // Direct Bolt connection

// Graph Change Detection
export {
  GraphChangeDetector,
  createGraphChangeDetector,
  type GraphPatch,
  type ChangeFilter,
  type ChangeCallback,
  type ChangeSubscription,
} from './graph/graphChangeDetector.js';

// LLM Client (legacy MCP-based)
export {
  createLlmClient,
  buildRegulatoryPrompt,
  buildSystemPrompt,
  buildSystemPromptAsync,
  REGULATORY_COPILOT_SYSTEM_PROMPT,
} from './llm/llmClient.js';

// LLM Router (provider-agnostic)
export {
  // Note: LlmClient is NOT exported from llmRouter to avoid conflict with types.ts
  type LlmCompletionOptions,
  type LlmStreamChunk,
  type LlmTaskPolicy,
  type TenantLlmPolicy,
  type LlmProviderClient,
  type LlmProviderRegistry,
  type LlmPolicyStore,
  LlmRouter,
  OpenAiResponsesClient,
  GroqLlmClient,
  LocalHttpLlmClient,
  InMemoryPolicyStore,
  createLlmRouter,
} from './llm/llmRouter.js';
export { createDefaultLlmRouter } from './llm/llmRouterFactory.js';

// AI SDK v5 Provider Adapters (optional)
export {
  AiSdkOpenAIProvider,
  AiSdkGroqProvider,
  createAiSdkProviders,
} from './llm/aiSdkProviders.js';

// Compliance Engine (Orchestrator)
export {
  ComplianceEngine,
  createComplianceEngine,
  type ComplianceRequest,
  type ComplianceResponse,
  type ComplianceEngineDeps,
} from './orchestrator/complianceEngine.js';

// Agents
export { SingleDirector_IE_SocialSafetyNet_Agent } from './agents/SingleDirector_IE_SocialSafetyNet_Agent.js';
export {
  GlobalRegulatoryComplianceAgent,
  createComplianceOrchestrator,
} from './agents/GlobalRegulatoryComplianceAgent.js';
