/**
 * Factory for creating pre-configured LLM router instances
 */

import { createLlmRouter, type LlmPolicyStore, type TenantLlmPolicy, type ProviderConfig, type LocalProviderConfig } from './llmRouter.js';

export interface CreateDefaultLlmRouterOptions {
  /**
   * Optional policy store for multi-instance deployments.
   * This must be provided to avoid in-memory fallbacks.
   */
  policyStore?: LlmPolicyStore;
}

/**
 * Create default LLM router with sensible defaults
 *
 * Reads API keys from environment and sets up a basic policy.
 * Supports: OpenAI, Groq, Anthropic, Google Gemini, and local models.
 *
 * @param options - Optional configuration including custom policy store
 */
export function createDefaultLlmRouter(options?: CreateDefaultLlmRouterOptions) {
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const localBaseUrl = process.env.LOCAL_LLM_BASE_URL;

  if (!groqApiKey && !openaiApiKey && !anthropicApiKey && !googleApiKey && !localBaseUrl) {
    throw new Error(
      'No LLM provider configured. Set GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or LOCAL_LLM_BASE_URL'
    );
  }

  // Build provider configs
  const providerConfigs: {
    openai?: ProviderConfig;
    groq?: ProviderConfig;
    anthropic?: ProviderConfig;
    google?: ProviderConfig;
    local?: LocalProviderConfig;
  } = {};

  if (openaiApiKey) {
    providerConfigs.openai = { apiKey: openaiApiKey };
  }
  if (groqApiKey) {
    providerConfigs.groq = { apiKey: groqApiKey };
  }
  if (anthropicApiKey) {
    providerConfigs.anthropic = { apiKey: anthropicApiKey };
  }
  if (googleApiKey) {
    providerConfigs.google = { apiKey: googleApiKey };
  }
  if (localBaseUrl) {
    providerConfigs.local = { baseURL: localBaseUrl };
  }

  // Prefer Groq if available, fallback to Google, Anthropic, OpenAI, then local
  const defaultProvider = groqApiKey ? 'groq'
    : googleApiKey ? 'google'
    : anthropicApiKey ? 'anthropic'
    : openaiApiKey ? 'openai'
    : 'local';

  const defaultModel = defaultProvider === 'groq'
    ? 'llama-3.3-70b-versatile'
    : defaultProvider === 'google'
    ? 'gemini-2.0-flash-exp'
    : defaultProvider === 'anthropic'
    ? 'claude-3-5-sonnet-20241022'
    : defaultProvider === 'openai'
    ? 'gpt-4o'
    : 'llama-3-8b';

  // Use provided policy store or create in-memory one
  if (!options?.policyStore) {
    throw new Error('policyStore is required to create an LLM router');
  }

  const policyStore = options.policyStore;
  const defaultPolicy: TenantLlmPolicy = {
    tenantId: 'default',
    defaultModel,
    defaultProvider,
    allowRemoteEgress: true, // Allow remote providers by default
    tasks: [
      // Main chat uses the default model
      {
        task: 'main-chat',
        provider: defaultProvider,
        model: defaultModel,
        temperature: 0.3,
        maxTokens: 2048,
      },
      // Egress guard could use a smaller, faster model
      {
        task: 'egress-guard',
        provider: defaultProvider,
        model: defaultProvider === 'groq' ? 'llama-3.1-8b-instant' : defaultModel,
        temperature: 0.1,
        maxTokens: 512,
      },
      // PII sanitizer uses fast local model if available
      {
        task: 'pii-sanitizer',
        provider: localBaseUrl ? 'local' : defaultProvider,
        model: localBaseUrl ? 'llama-3-8b' : defaultModel,
        temperature: 0.0,
        maxTokens: 256,
      },
    ],
  };

  // Store the default policy (async but we don't await - router can still be used)
  // This ensures the default policy is available for the 'default' tenant
  void policyStore.setPolicy(defaultPolicy);

  // Create router with policy store
  const router = createLlmRouter({
    providerConfigs,
    defaultProvider,
    defaultModel,
    policyStore,
  });

  return router;
}
