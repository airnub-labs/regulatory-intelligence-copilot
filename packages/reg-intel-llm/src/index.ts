/**
 * @package reg-intel-llm
 *
 * LLM routing, providers, and egress control for regulatory intelligence.
 *
 * This package provides:
 * - LlmRouter (provider-agnostic routing)
 * - LLM providers (OpenAI, Groq, Local)
 * - AI SDK v5 adapters (optional)
 * - Egress Guard (PII sanitization)
 */

// LLM Router
export {
  LlmRouter,
  createLlmRouter,
  InMemoryPolicyStore,
  type LlmCompletionOptions,
  type LlmStreamChunk,
  type LlmProviderClient,
  type TenantLlmPolicy,
  type LlmTaskPolicy,
  type LlmPolicyStore,
  type LlmProviderRegistry,
  // Provider implementations
  OpenAiResponsesClient,
  GroqLlmClient,
  LocalHttpLlmClient,
} from './llmRouter.js';

// Factory
export {
  createDefaultLlmRouter,
} from './llmRouterFactory.js';

// AI SDK Providers (optional)
export {
  AiSdkOpenAIProvider,
  AiSdkGroqProvider,
} from './aiSdkProviders.js';

// Egress Guard
export {
  sanitizeTextForEgress,
  sanitizeObjectForEgress,
  SENSITIVE_HEADERS,
  isSensitiveHeader,
} from './egressGuard.js';

// Re-export types
export type {
  ChatMessage,
  LlmChatRequest,
  LlmChatResponse,
  LlmClient,
  RedactedPayload,
  EgressGuard,
} from './types.js';

export type {
  LlmError,
  ComplianceError,
} from './errors.js';
