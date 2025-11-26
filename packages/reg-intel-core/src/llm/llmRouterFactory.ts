/**
 * Factory for creating pre-configured LLM router instances
 */

import { createLlmRouter, InMemoryPolicyStore, type TenantLlmPolicy } from './llmRouter.js';

/**
 * Create default LLM router with sensible defaults
 *
 * Reads API keys from environment and sets up a basic policy
 */
export function createDefaultLlmRouter() {
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const localBaseUrl = process.env.LOCAL_LLM_BASE_URL;

  if (!groqApiKey && !openaiApiKey && !localBaseUrl) {
    throw new Error(
      'No LLM provider configured. Set GROQ_API_KEY, OPENAI_API_KEY, or LOCAL_LLM_BASE_URL'
    );
  }

  // Prefer Groq if available, fallback to OpenAI, then local
  const defaultProvider = groqApiKey ? 'groq' : openaiApiKey ? 'openai' : 'local';
  const defaultModel = defaultProvider === 'groq'
    ? 'llama-3.1-70b-versatile'
    : defaultProvider === 'openai'
    ? 'gpt-4'
    : 'llama-3-8b';

  const router = createLlmRouter({
    groqApiKey,
    openaiApiKey,
    localBaseUrl,
    defaultProvider,
    defaultModel,
  });

  // Set up default tenant policy
  const policyStore = new InMemoryPolicyStore();
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

  // Store the default policy
  policyStore.setPolicy(defaultPolicy);

  return router;
}
