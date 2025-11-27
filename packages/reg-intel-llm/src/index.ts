/**
 * @package reg-intel-llm
 *
 * LLM routing, providers, and egress control for regulatory intelligence.
 *
 * Built on Vercel AI SDK v5 for consistent provider abstraction.
 *
 * This package provides:
 * - LlmRouter (provider-agnostic routing with tenant policies)
 * - LLM providers (OpenAI, Groq, Anthropic, Google Gemini, Local) - ALL using AI SDK v5
 * - Egress Guard (PII sanitization)
 *
 * AI SDK v5 handles:
 * - OpenAI Responses API (automatic for OpenAI provider - /v1/responses)
 * - Chat Completions API (forced for local providers - /v1/chat/completions)
 * - Provider-specific API differences (OpenAI, Groq, Anthropic, Google)
 * - Local OpenAI-compatible endpoints (vLLM, Ollama, etc.) via OpenAI provider with custom baseURL
 * - Streaming and non-streaming modes
 * - Consistent error handling
 *
 * Important: OpenAI uses Responses API, local models use Chat Completions API
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
} from './llmRouter.js';

// Observability
export {
  startSpan as startLlmSpan,
  setSpanContextResolver,
  type SpanHandle as LlmSpanHandle,
  type SpanOptions as LlmSpanOptions,
} from './observability/spanLogger.js';

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
