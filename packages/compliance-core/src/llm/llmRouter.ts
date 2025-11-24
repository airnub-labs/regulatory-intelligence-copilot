/**
 * LLM Router - Provider-agnostic LLM client with tenant and task-based routing
 *
 * Supports multiple backends:
 * - OpenAI (via Responses API)
 * - Groq
 * - Local/OSS HTTP models (vLLM, Ollama, etc.)
 *
 * Routes based on:
 * - Tenant policies
 * - Task type (main-chat, egress-guard, pii-sanitizer, etc.)
 * - Egress control settings
 */

import type { ChatMessage } from '../types.js';
import { LlmError } from '../errors.js';

/**
 * LLM completion options
 */
export interface LlmCompletionOptions {
  model?: string;
  task?: string; // e.g. "main-chat", "egress-guard", "pii-sanitizer"
  temperature?: number;
  maxTokens?: number;
  tenantId?: string;
}

/**
 * LLM task policy - defines model/provider for a specific task
 */
export interface LlmTaskPolicy {
  task: string; // e.g. "main-chat", "egress-guard"
  model: string; // e.g. "gpt-4", "llama-3-70b"
  provider: string; // e.g. "openai", "groq", "local"
  temperature?: number;
  maxTokens?: number;
}

/**
 * Tenant LLM policy - defines what a tenant is allowed to use
 */
export interface TenantLlmPolicy {
  tenantId: string;
  defaultModel: string;
  defaultProvider: string;
  allowRemoteEgress: boolean; // If false, only local models allowed
  tasks: LlmTaskPolicy[];
}

/**
 * LLM client interface
 */
export interface LlmClient {
  chat(
    messages: ChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string>;
}

/**
 * Provider-specific client interface
 */
export interface LlmProviderClient {
  chat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string>;
}

/**
 * OpenAI Responses API client
 */
export class OpenAiResponsesClient implements LlmProviderClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new LlmError(
        `OpenAI Responses API error: ${error}`,
        response.status
      );
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new LlmError('No content in OpenAI response');
    }

    return content;
  }
}

/**
 * Groq API client
 */
export class GroqLlmClient implements LlmProviderClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.groq.com/openai/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new LlmError(`Groq API error: ${error}`, response.status);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new LlmError('No content in Groq response');
    }

    return content;
  }
}

/**
 * Local/OSS HTTP model client (vLLM, Ollama, etc.)
 */
export class LocalHttpLlmClient implements LlmProviderClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new LlmError(`Local HTTP LLM error: ${error}`, response.status);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new LlmError('No content in local LLM response');
    }

    return content;
  }
}

/**
 * Provider registry
 */
export interface LlmProviderRegistry {
  [provider: string]: LlmProviderClient;
}

/**
 * Policy store interface
 */
export interface LlmPolicyStore {
  getPolicy(tenantId: string): Promise<TenantLlmPolicy | null>;
  setPolicy(policy: TenantLlmPolicy): Promise<void>;
}

/**
 * In-memory policy store (for development)
 */
export class InMemoryPolicyStore implements LlmPolicyStore {
  private policies = new Map<string, TenantLlmPolicy>();

  async getPolicy(tenantId: string): Promise<TenantLlmPolicy | null> {
    return this.policies.get(tenantId) ?? null;
  }

  async setPolicy(policy: TenantLlmPolicy): Promise<void> {
    this.policies.set(policy.tenantId, policy);
  }
}

/**
 * LLM Router - routes requests to appropriate provider/model based on tenant and task
 */
export class LlmRouter implements LlmClient {
  private providers: LlmProviderRegistry;
  private policyStore: LlmPolicyStore;
  private defaultProvider: string;
  private defaultModel: string;

  constructor(
    providers: LlmProviderRegistry,
    policyStore: LlmPolicyStore,
    defaultProvider: string,
    defaultModel: string
  ) {
    this.providers = providers;
    this.policyStore = policyStore;
    this.defaultProvider = defaultProvider;
    this.defaultModel = defaultModel;
  }

  async chat(
    messages: ChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string> {
    const tenantId = options?.tenantId ?? 'default';
    const task = options?.task;

    // Get tenant policy
    const policy = await this.policyStore.getPolicy(tenantId);

    // Determine provider and model
    let provider = this.defaultProvider;
    let model = this.defaultModel;
    let taskOptions: { temperature?: number; maxTokens?: number } = {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };

    if (policy) {
      // Check if tenant allows remote egress
      if (!policy.allowRemoteEgress) {
        // Force local provider
        provider = 'local';
      }

      // Check for task-specific policy
      if (task) {
        const taskPolicy = policy.tasks.find(t => t.task === task);
        if (taskPolicy) {
          provider = taskPolicy.provider;
          model = taskPolicy.model;
          if (taskPolicy.temperature !== undefined) {
            taskOptions.temperature = taskPolicy.temperature;
          }
          if (taskPolicy.maxTokens !== undefined) {
            taskOptions.maxTokens = taskPolicy.maxTokens;
          }
        }
      }

      // Use policy defaults if no task-specific policy found
      if (!task || !policy.tasks.find(t => t.task === task)) {
        provider = policy.defaultProvider;
        model = policy.defaultModel;
      }
    }

    // Override with explicit options if provided
    if (options?.model) {
      model = options.model;
    }

    // Get provider client
    const providerClient = this.providers[provider];
    if (!providerClient) {
      throw new LlmError(`Unknown provider: ${provider}`);
    }

    // Call provider
    return providerClient.chat(messages, model, taskOptions);
  }
}

/**
 * Create a configured LLM router
 */
export function createLlmRouter(config: {
  openaiApiKey?: string;
  groqApiKey?: string;
  localBaseUrl?: string;
  policyStore?: LlmPolicyStore;
  defaultProvider?: string;
  defaultModel?: string;
}): LlmRouter {
  const providers: LlmProviderRegistry = {};

  // Register OpenAI if key provided
  if (config.openaiApiKey) {
    providers.openai = new OpenAiResponsesClient(config.openaiApiKey);
  }

  // Register Groq if key provided
  if (config.groqApiKey) {
    providers.groq = new GroqLlmClient(config.groqApiKey);
  }

  // Register local if base URL provided
  if (config.localBaseUrl) {
    providers.local = new LocalHttpLlmClient(config.localBaseUrl);
  }

  const policyStore = config.policyStore ?? new InMemoryPolicyStore();
  const defaultProvider = config.defaultProvider ?? 'groq';
  const defaultModel = config.defaultModel ?? 'llama-3-70b';

  return new LlmRouter(providers, policyStore, defaultProvider, defaultModel);
}
