/**
 * LLM Router - Provider-agnostic LLM client with tenant and task-based routing
 *
 * Built on Vercel AI SDK v5 for consistent provider abstraction.
 *
 * ALL providers use AI SDK v5:
 * - OpenAI (via @ai-sdk/openai - uses Responses API automatically)
 * - Groq (via @ai-sdk/groq)
 * - Anthropic (via @ai-sdk/anthropic)
 * - Google Gemini (via @ai-sdk/google)
 * - Local/OSS models (via @ai-sdk/openai with custom baseURL and forced /chat/completions API)
 *
 * Important API distinction:
 * - OpenAI provider: Uses modern Responses API (/v1/responses)
 * - Local providers: Uses Chat Completions API (/v1/chat/completions) - vLLM, Ollama, etc. only support this
 *
 * Routes based on:
 * - Tenant policies
 * - Task type (main-chat, egress-guard, pii-sanitizer, etc.)
 * - Egress control settings
 */

import type { ChatMessage } from './types.js';
import { LlmError } from './errors.js';
import { startSpan } from './observability/spanLogger.js';

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
 * Anthropic provider client using Vercel AI SDK v5
 *
 * Handles Anthropic Claude models via AI SDK abstraction.
 */
export class AnthropicProviderClient implements LlmProviderClient {
  private anthropic: any;

  constructor(apiKey: string, config?: { baseURL?: string }) {
    try {
      const { createAnthropic } = require('@ai-sdk/anthropic');
      this.anthropic = createAnthropic({
        apiKey,
        baseURL: config?.baseURL,
      });
    } catch (error) {
      throw new LlmError(
        'Anthropic provider requires AI SDK packages: npm install ai @ai-sdk/anthropic'
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
        model: this.anthropic(model),
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
        `Anthropic error: ${error instanceof Error ? error.message : String(error)}`
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
        model: this.anthropic(model),
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
            : new Error(`Anthropic error: ${String(error)}`),
      };
    }
  }
}

/**
 * Google Gemini provider client using Vercel AI SDK v5
 *
 * Handles Google Gemini models via AI SDK abstraction.
 */
export class GeminiProviderClient implements LlmProviderClient {
  private google: any;

  constructor(apiKey: string, config?: { baseURL?: string }) {
    try {
      const { createGoogleGenerativeAI } = require('@ai-sdk/google');
      this.google = createGoogleGenerativeAI({
        apiKey,
        baseURL: config?.baseURL,
      });
    } catch (error) {
      throw new LlmError(
        'Google Gemini provider requires AI SDK packages: npm install ai @ai-sdk/google'
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
        model: this.google(model),
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
        `Google Gemini error: ${error instanceof Error ? error.message : String(error)}`
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
        model: this.google(model),
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
            : new Error(`Google Gemini error: ${String(error)}`),
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

    const span = startSpan({
      name: 'llm.router',
      provider,
      model,
      task: options?.task,
      attributes: {
        tenantId: options?.tenantId ?? 'default',
        streaming: false,
        messageCount: messages.length,
      },
    });

    // Get provider client
    const providerClient = this.providers[provider];
    if (!providerClient) {
      const error = new LlmError(`Unknown provider: ${provider}`);
      span.error(error);
      throw error;
    }

    // Call provider
    try {
      const result = await providerClient.chat(messages, model, taskOptions);
      span.end();
      return result;
    } catch (error) {
      span.error(error);
      throw error;
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: LlmCompletionOptions
  ): AsyncIterable<LlmStreamChunk> {
    const { provider, model, taskOptions } = await this.resolveProviderAndModel(options);

    const span = startSpan({
      name: 'llm.router',
      provider,
      model,
      task: options?.task,
      attributes: {
        tenantId: options?.tenantId ?? 'default',
        streaming: true,
        messageCount: messages.length,
      },
    });

    // Get provider client
    const providerClient = this.providers[provider];
    if (!providerClient) {
      const error = new LlmError(`Unknown provider: ${provider}`);
      span.error(error);
      yield { type: 'error', error };
      return;
    }

    // Check if provider supports streaming
    if (!providerClient.streamChat) {
      const error = new LlmError(`Provider ${provider} does not support streaming`);
      span.error(error);
      yield { type: 'error', error };
      return;
    }

    try {
      for await (const chunk of providerClient.streamChat(messages, model, taskOptions)) {
        if (chunk.type === 'error') {
          span.error(chunk.error);
        }
        if (chunk.type === 'done') {
          span.end();
        }
        yield chunk;
      }
    } catch (error) {
      span.error(error);
      throw error;
    }
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
 * Provider configuration interface
 */
export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
}

/**
 * Local provider configuration
 *
 * For OpenAI-compatible local endpoints (vLLM, Ollama, etc.)
 * Uses /v1/chat/completions API (NOT Responses API)
 */
export interface LocalProviderConfig {
  baseURL: string;
  apiKey?: string; // Optional - some local setups require authentication
}

/**
 * LLM Router configuration
 *
 * Two ways to configure providers:
 * 1. Pass pre-configured providers directly via `providers`
 * 2. Pass provider configs via `providerConfigs` (easier, more flexible)
 */
export interface LlmRouterConfig {
  /**
   * Pre-configured provider instances (most flexible)
   * Use this if you need custom provider implementations
   */
  providers?: LlmProviderRegistry;

  /**
   * Provider configurations (easier, recommended)
   * Automatically creates provider instances from configs
   */
  providerConfigs?: {
    openai?: ProviderConfig;
    groq?: ProviderConfig;
    anthropic?: ProviderConfig;
    google?: ProviderConfig;
    local?: LocalProviderConfig;
    [key: string]: ProviderConfig | LocalProviderConfig | undefined;
  };

  /**
   * Policy store for tenant-based routing
   */
  policyStore?: LlmPolicyStore;

  /**
   * Default provider to use (defaults to first available)
   */
  defaultProvider?: string;

  /**
   * Default model to use
   */
  defaultModel?: string;
}

/**
 * Create a configured LLM router with AI SDK v5 providers
 *
 * Supports flexible provider configuration - add any AI SDK provider without changing this function!
 *
 * @example
 * ```typescript
 * // Easy way - using provider configs
 * const router = createLlmRouter({
 *   providerConfigs: {
 *     openai: { apiKey: process.env.OPENAI_API_KEY! },
 *     groq: { apiKey: process.env.GROQ_API_KEY! },
 *     anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
 *     google: { apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! },
 *   },
 *   defaultProvider: 'groq',
 *   defaultModel: 'llama-3.3-70b-versatile',
 * });
 *
 * // Advanced way - pre-configured providers
 * const router = createLlmRouter({
 *   providers: {
 *     openai: new OpenAiProviderClient(apiKey),
 *     custom: new MyCustomProvider(),
 *   },
 * });
 * ```
 */
export function createLlmRouter(config: LlmRouterConfig): LlmRouter {
  let providers: LlmProviderRegistry = {};

  // Option 1: Use pre-configured providers if provided
  if (config.providers) {
    providers = { ...config.providers };
  }
  // Option 2: Create providers from configs
  else if (config.providerConfigs) {
    const configs = config.providerConfigs;

    // Create OpenAI provider
    if (configs.openai) {
      providers.openai = new OpenAiProviderClient(
        configs.openai.apiKey,
        configs.openai.baseURL ? { baseURL: configs.openai.baseURL } : undefined
      );
    }

    // Create Groq provider
    if (configs.groq) {
      providers.groq = new GroqProviderClient(
        configs.groq.apiKey,
        configs.groq.baseURL ? { baseURL: configs.groq.baseURL } : undefined
      );
    }

    // Create Anthropic provider
    if (configs.anthropic) {
      providers.anthropic = new AnthropicProviderClient(
        configs.anthropic.apiKey,
        configs.anthropic.baseURL ? { baseURL: configs.anthropic.baseURL } : undefined
      );
    }

    // Create Google Gemini provider
    if (configs.google) {
      providers.google = new GeminiProviderClient(
        configs.google.apiKey,
        configs.google.baseURL ? { baseURL: configs.google.baseURL } : undefined
      );
    }

    // Create local provider (using OpenAI-compatible /v1/chat/completions endpoint)
    // Note: Local models automatically use chat completions API when using custom baseURL
    // AI SDK v5 auto-detects and uses /v1/chat/completions for non-OpenAI endpoints
    if (configs.local) {
      providers.local = new OpenAiProviderClient(
        configs.local.apiKey || '', // Empty string if no API key (some local endpoints don't require auth)
        { baseURL: configs.local.baseURL }
      );
    }
  }

  // Determine default provider (first available if not specified)
  const availableProviders = Object.keys(providers);
  const defaultProvider = config.defaultProvider ?? availableProviders[0] ?? 'groq';
  const defaultModel = config.defaultModel ?? 'llama-3.3-70b-versatile';

  const policyStore = config.policyStore ?? new InMemoryPolicyStore();

  return new LlmRouter(providers, policyStore, defaultProvider, defaultModel);
}
