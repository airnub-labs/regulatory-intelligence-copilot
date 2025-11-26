/**
 * LLM Router - Provider-agnostic LLM client with tenant and task-based routing
 *
 * Built on Vercel AI SDK v5 for consistent provider abstraction.
 *
 * Supports multiple backends:
 * - OpenAI (via AI SDK - handles Responses API automatically)
 * - Groq (via AI SDK)
 * - Anthropic (via AI SDK)
 * - Local/OSS HTTP models (vLLM, Ollama, etc.)
 *
 * Routes based on:
 * - Tenant policies
 * - Task type (main-chat, egress-guard, pii-sanitizer, etc.)
 * - Egress control settings
 */

import type { ChatMessage } from './types.js';
import { LlmError } from './errors.js';

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
 * Streaming chunk from LLM
 */
export interface LlmStreamChunk {
  type: 'text' | 'error' | 'done';
  delta?: string; // Text delta for type='text'
  error?: Error; // Error object for type='error'
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

  streamChat?(
    messages: ChatMessage[],
    options?: LlmCompletionOptions
  ): AsyncIterable<LlmStreamChunk>;
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

  streamChat?(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncIterable<LlmStreamChunk>;
}

/**
 * OpenAI provider client using Vercel AI SDK v5
 *
 * Automatically uses the Responses API when available, with fallback to Chat Completions.
 * Handles all OpenAI API complexities internally via AI SDK.
 */
export class OpenAiProviderClient implements LlmProviderClient {
  private openai: any;

  constructor(apiKey: string, config?: { baseURL?: string }) {
    try {
      const { createOpenAI } = require('@ai-sdk/openai');
      this.openai = createOpenAI({
        apiKey,
        baseURL: config?.baseURL,
      });
    } catch (error) {
      throw new LlmError(
        'OpenAI provider requires AI SDK packages: npm install ai @ai-sdk/openai'
      );
    }
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    try {
      const { generateText } = require('ai');

      const result = await generateText({
        model: this.openai(model),
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 2048,
      });

      return result.text;
    } catch (error) {
      throw new LlmError(
        `OpenAI error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncIterable<LlmStreamChunk> {
    try {
      const { streamText } = require('ai');

      const result = await streamText({
        model: this.openai(model),
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 2048,
      });

      for await (const chunk of result.textStream) {
        yield { type: 'text', delta: chunk };
      }

      yield { type: 'done' };
    } catch (error) {
      yield {
        type: 'error',
        error:
          error instanceof Error
            ? error
            : new Error(`OpenAI error: ${String(error)}`),
      };
    }
  }
}

/**
 * Groq provider client using Vercel AI SDK v5
 *
 * Handles Groq's fast inference API via AI SDK abstraction.
 */
export class GroqProviderClient implements LlmProviderClient {
  private groq: any;

  constructor(apiKey: string, config?: { baseURL?: string }) {
    try {
      const { createGroq } = require('@ai-sdk/groq');
      this.groq = createGroq({
        apiKey,
        baseURL: config?.baseURL,
      });
    } catch (error) {
      throw new LlmError(
        'Groq provider requires AI SDK packages: npm install ai @ai-sdk/groq'
      );
    }
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    try {
      const { generateText } = require('ai');

      const result = await generateText({
        model: this.groq(model),
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 2048,
      });

      return result.text;
    } catch (error) {
      throw new LlmError(
        `Groq error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncIterable<LlmStreamChunk> {
    try {
      const { streamText } = require('ai');

      const result = await streamText({
        model: this.groq(model),
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 2048,
      });

      for await (const chunk of result.textStream) {
        yield { type: 'text', delta: chunk };
      }

      yield { type: 'done' };
    } catch (error) {
      yield {
        type: 'error',
        error:
          error instanceof Error
            ? error
            : new Error(`Groq error: ${String(error)}`),
      };
    }
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

  async *streamChat(
    messages: ChatMessage[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncIterable<LlmStreamChunk> {
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
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      yield {
        type: 'error',
        error: new LlmError(`Local HTTP LLM error: ${error}`, response.status),
      };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: new LlmError('No response body') };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              yield { type: 'text', delta };
            }
          } catch (e) {
            // Skip malformed JSON
            continue;
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
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
    const { provider, model, taskOptions } = await this.resolveProviderAndModel(options);

    // Get provider client
    const providerClient = this.providers[provider];
    if (!providerClient) {
      throw new LlmError(`Unknown provider: ${provider}`);
    }

    // Call provider
    return providerClient.chat(messages, model, taskOptions);
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: LlmCompletionOptions
  ): AsyncIterable<LlmStreamChunk> {
    const { provider, model, taskOptions } = await this.resolveProviderAndModel(options);

    // Get provider client
    const providerClient = this.providers[provider];
    if (!providerClient) {
      yield {
        type: 'error',
        error: new LlmError(`Unknown provider: ${provider}`),
      };
      return;
    }

    // Check if provider supports streaming
    if (!providerClient.streamChat) {
      yield {
        type: 'error',
        error: new LlmError(`Provider ${provider} does not support streaming`),
      };
      return;
    }

    // Stream from provider
    yield* providerClient.streamChat(messages, model, taskOptions);
  }

  /**
   * Resolve provider, model, and task options based on tenant policy
   */
  private async resolveProviderAndModel(
    options?: LlmCompletionOptions
  ): Promise<{
    provider: string;
    model: string;
    taskOptions: { temperature?: number; maxTokens?: number };
  }> {
    const tenantId = options?.tenantId ?? 'default';
    const task = options?.task;

    // Get tenant policy
    const policy = await this.policyStore.getPolicy(tenantId);

    // Determine provider and model
    let provider = this.defaultProvider;
    let model = this.defaultModel;
    const taskOptions: { temperature?: number; maxTokens?: number } = {
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

    return { provider, model, taskOptions };
  }
}

/**
 * Create a configured LLM router with AI SDK v5 providers
 *
 * All providers use Vercel AI SDK v5 under the hood for consistent abstraction.
 * OpenAI automatically uses Responses API when available.
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

  // Register OpenAI if key provided (uses AI SDK v5 - handles Responses API automatically)
  if (config.openaiApiKey) {
    providers.openai = new OpenAiProviderClient(config.openaiApiKey);
  }

  // Register Groq if key provided (uses AI SDK v5)
  if (config.groqApiKey) {
    providers.groq = new GroqProviderClient(config.groqApiKey);
  }

  // Register local if base URL provided (direct HTTP client for vLLM, Ollama, etc.)
  if (config.localBaseUrl) {
    providers.local = new LocalHttpLlmClient(config.localBaseUrl);
  }

  const policyStore = config.policyStore ?? new InMemoryPolicyStore();
  const defaultProvider = config.defaultProvider ?? 'groq';
  const defaultModel = config.defaultModel ?? 'llama-3-70b';

  return new LlmRouter(providers, policyStore, defaultProvider, defaultModel);
}
