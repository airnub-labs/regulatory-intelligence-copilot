/**
 * @package reg-intel-llm
 *
 * LLM routing, providers, and egress control for regulatory intelligence.
 *
 * Built on Vercel AI SDK v5 for consistent provider abstraction.
 *
 * This package provides:
 * - LlmRouter (provider-agnostic routing with tenant policies)
 * - LLM providers (OpenAI, Groq, Anthropic, Google Gemini, Local) - all using AI SDK v5 under the hood
 * - Egress Guard (PII sanitization)
 *
 * AI SDK v5 handles:
 * - OpenAI Responses API (automatic detection and usage)
 * - Provider-specific API differences
 * - Streaming and non-streaming modes
 * - Consistent error handling
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
  type LlmRouterConfig,
  type ProviderConfig,
  type LocalProviderConfig,
  // Provider implementations (AI SDK v5 based)
  OpenAiProviderClient,
  GroqProviderClient,
  AnthropicProviderClient,
  GeminiProviderClient,
  LocalHttpLlmClient,
} from './llmRouter.js';

// Factory
export {
  createDefaultLlmRouter,
} from './llmRouterFactory.js';

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
