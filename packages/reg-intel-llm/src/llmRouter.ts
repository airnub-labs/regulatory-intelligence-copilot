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

import { createLogger, recordLlmTokenUsage, recordLlmRequest, recordLlmCost } from '@reg-copilot/reg-intel-observability';
import type { ChatMessage } from './types.js';
import { LlmError } from './errors.js';
import {
  EgressClient,
  type EgressClientConfig,
  type EgressMode,
} from './egressClient.js';
import { resolveEffectiveEgressMode } from './egressModeResolver.js';
import {
  sanitizeTextForEgress,
  type SanitizationContext,
  type SanitizationOptions,
} from './egressGuard.js';

/**
 * LLM completion options
 */
export interface LlmCompletionOptions {
  model?: string;
  task?: string; // e.g. "main-chat", "egress-guard", "pii-sanitizer"
  temperature?: number;
  maxTokens?: number;
  tenantId?: string;
  /** Optional user identifier for per-user policies. */
  userId?: string;
  tools?: Array<Record<string, unknown>>;
  toolChoice?: 'auto' | 'required' | { type: string; function: { name: string } };

  /** Optional per-call override for egress mode. */
  egressModeOverride?: EgressMode;

  /**
   * Sanitization context for response processing:
   * - 'chat': Full sanitization (default for LLM responses)
   * - 'calculation': Conservative sanitization
   * - 'strict': Aggressive sanitization
   * - 'off': No response sanitization
   */
  responseSanitization?: SanitizationContext;

  /**
   * Additional sanitization options for response processing
   */
  sanitizationOptions?: Omit<SanitizationOptions, 'context'>;
}

/**
 * Streaming chunk from LLM
 */
export type LlmStreamChunk =
  | { type: 'text'; delta: string }
  | {
      type: 'tool';
      name: string;
      argsJson: unknown;
      /** Legacy aliases kept for downstream compatibility */
      toolName?: string;
      arguments?: unknown;
      payload?: unknown;
    }
  | { type: 'error'; error: Error }
  | { type: 'done' };

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

  /** Default egress mode for this tenant, if configured. */
  egressMode?: EgressMode;

  /** Whether this tenant is allowed to use 'off' mode for egress. */
  allowOffMode?: boolean;

  /** Optional per-user overrides keyed by userId. */
  userPolicies?: Record<string, { egressMode?: EgressMode; allowOffMode?: boolean }>;
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
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      // Attribution context for metrics
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): Promise<string>;

  streamChat?(
    messages: ChatMessage[],
    model: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      // Attribution context for metrics
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): AsyncIterable<LlmStreamChunk>;
}

/**
 * Map AI SDK text stream parts into LLM router chunks.
 */
async function* streamTextPartsToLlmChunks(
  fullStream: AsyncIterable<unknown>
): AsyncIterable<LlmStreamChunk> {
  let finished = false;

  try {
    for await (const part of fullStream as AsyncIterable<{ type?: string }>) {
      if (part?.type === 'text-delta' && 'text' in part && typeof part.text === 'string') {
        yield { type: 'text', delta: part.text } satisfies LlmStreamChunk;
        continue;
      }

      if (part?.type === 'tool-call' && 'toolName' in part) {
        const { toolName } = part as { toolName: string; input?: unknown };
        const argsJson = (part as { input?: unknown }).input;
        yield {
          type: 'tool',
          name: toolName,
          argsJson,
          toolName,
          arguments: argsJson,
          payload: argsJson,
        };
        continue;
      }

      if (part?.type === 'tool-result' && 'toolName' in part) {
        const { toolName } = part as { toolName: string; output?: unknown; input?: unknown };
        const argsJson =
          'output' in part
            ? (part as { output?: unknown }).output
            : (part as { input?: unknown }).input;
        yield {
          type: 'tool',
          name: toolName,
          argsJson,
          toolName,
          arguments: argsJson,
          payload: argsJson,
        };
        continue;
      }

      if (part?.type === 'tool-error') {
        const errorValue = (part as { error?: unknown }).error;
        yield {
          type: 'error',
          error:
            errorValue instanceof Error
              ? errorValue
              : new Error(`Tool error: ${String(errorValue)}`),
        };
        continue;
      }

      if (part?.type === 'error') {
        const errorValue = (part as { error?: unknown }).error;
        yield {
          type: 'error',
          error:
            errorValue instanceof Error
              ? errorValue
              : new Error(String(errorValue ?? 'Unknown stream error')),
        };
        continue;
      }

      if (part?.type === 'finish') {
        finished = true;
        yield { type: 'done' };
      }
    }
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  if (!finished) {
    yield { type: 'done' };
  }
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
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): Promise<string> {
    const startTime = Date.now();
    let success = true;

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

      // Record metrics with attribution
      const durationMs = Date.now() - startTime;
      const attribution = {
        tenantId: options?.tenantId,
        userId: options?.userId,
        task: options?.task,
        conversationId: options?.conversationId,
      };

      recordLlmRequest(durationMs, {
        provider: 'openai',
        model,
        success: true,
        streaming: false,
        ...attribution,
      });

      // Record token usage if available
      if (result.usage) {
        if (result.usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'openai',
            model,
            tokenType: 'input',
            tokens: result.usage.promptTokens,
            ...attribution,
          });
        }
        if (result.usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'openai',
            model,
            tokenType: 'output',
            tokens: result.usage.completionTokens,
            ...attribution,
          });
        }
        if (result.usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'openai',
            model,
            tokenType: 'total',
            tokens: result.usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (result.usage.promptTokens && result.usage.completionTokens) {
          recordLlmCost({
            provider: 'openai',
            model,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }

      return result.text;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'openai',
        model,
        success: false,
        streaming: false,
        tenantId: options?.tenantId,
        userId: options?.userId,
        task: options?.task,
        conversationId: options?.conversationId,
      });

      throw new LlmError(
        `OpenAI error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    model: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): AsyncIterable<LlmStreamChunk> {
    const startTime = Date.now();
    let success = true;

    const attribution = {
      tenantId: options?.tenantId,
      userId: options?.userId,
      task: options?.task,
      conversationId: options?.conversationId,
    };

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
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });

      yield* streamTextPartsToLlmChunks(result.fullStream);

      // Record metrics after stream completes
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'openai',
        model,
        success: true,
        streaming: true,
        ...attribution,
      });

      // Record token usage if available from the finalized result
      const usage = await result.usage;
      if (usage) {
        if (usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'openai',
            model,
            tokenType: 'input',
            tokens: usage.promptTokens,
            ...attribution,
          });
        }
        if (usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'openai',
            model,
            tokenType: 'output',
            tokens: usage.completionTokens,
            ...attribution,
          });
        }
        if (usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'openai',
            model,
            tokenType: 'total',
            tokens: usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (usage.promptTokens && usage.completionTokens) {
          recordLlmCost({
            provider: 'openai',
            model,
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'openai',
        model,
        success: false,
        streaming: true,
        ...attribution,
      });

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
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): Promise<string> {
    const startTime = Date.now();

    const attribution = {
      tenantId: options?.tenantId,
      userId: options?.userId,
      task: options?.task,
      conversationId: options?.conversationId,
    };

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

      // Record metrics with attribution
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'groq',
        model,
        success: true,
        streaming: false,
        ...attribution,
      });

      // Record token usage if available
      if (result.usage) {
        if (result.usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'groq',
            model,
            tokenType: 'input',
            tokens: result.usage.promptTokens,
            ...attribution,
          });
        }
        if (result.usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'groq',
            model,
            tokenType: 'output',
            tokens: result.usage.completionTokens,
            ...attribution,
          });
        }
        if (result.usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'groq',
            model,
            tokenType: 'total',
            tokens: result.usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (result.usage.promptTokens && result.usage.completionTokens) {
          recordLlmCost({
            provider: 'groq',
            model,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }

      return result.text;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'groq',
        model,
        success: false,
        streaming: false,
        ...attribution,
      });

      throw new LlmError(
        `Groq error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    model: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): AsyncIterable<LlmStreamChunk> {
    const startTime = Date.now();

    const attribution = {
      tenantId: options?.tenantId,
      userId: options?.userId,
      task: options?.task,
      conversationId: options?.conversationId,
    };

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
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });

      yield* streamTextPartsToLlmChunks(result.fullStream);

      // Record metrics after stream completes
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'groq',
        model,
        success: true,
        streaming: true,
        ...attribution,
      });

      // Record token usage if available
      const usage = await result.usage;
      if (usage) {
        if (usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'groq',
            model,
            tokenType: 'input',
            tokens: usage.promptTokens,
            ...attribution,
          });
        }
        if (usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'groq',
            model,
            tokenType: 'output',
            tokens: usage.completionTokens,
            ...attribution,
          });
        }
        if (usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'groq',
            model,
            tokenType: 'total',
            tokens: usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (usage.promptTokens && usage.completionTokens) {
          recordLlmCost({
            provider: 'groq',
            model,
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'groq',
        model,
        success: false,
        streaming: true,
        ...attribution,
      });

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
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): Promise<string> {
    const startTime = Date.now();

    const attribution = {
      tenantId: options?.tenantId,
      userId: options?.userId,
      task: options?.task,
      conversationId: options?.conversationId,
    };

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

      // Record metrics with attribution
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'anthropic',
        model,
        success: true,
        streaming: false,
        ...attribution,
      });

      // Record token usage if available
      if (result.usage) {
        if (result.usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'anthropic',
            model,
            tokenType: 'input',
            tokens: result.usage.promptTokens,
            ...attribution,
          });
        }
        if (result.usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'anthropic',
            model,
            tokenType: 'output',
            tokens: result.usage.completionTokens,
            ...attribution,
          });
        }
        if (result.usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'anthropic',
            model,
            tokenType: 'total',
            tokens: result.usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (result.usage.promptTokens && result.usage.completionTokens) {
          recordLlmCost({
            provider: 'anthropic',
            model,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }

      return result.text;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'anthropic',
        model,
        success: false,
        streaming: false,
        ...attribution,
      });

      throw new LlmError(
        `Anthropic error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    model: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): AsyncIterable<LlmStreamChunk> {
    const startTime = Date.now();

    const attribution = {
      tenantId: options?.tenantId,
      userId: options?.userId,
      task: options?.task,
      conversationId: options?.conversationId,
    };

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
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });

      yield* streamTextPartsToLlmChunks(result.fullStream);

      // Record metrics after stream completes
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'anthropic',
        model,
        success: true,
        streaming: true,
        ...attribution,
      });

      // Record token usage if available
      const usage = await result.usage;
      if (usage) {
        if (usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'anthropic',
            model,
            tokenType: 'input',
            tokens: usage.promptTokens,
            ...attribution,
          });
        }
        if (usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'anthropic',
            model,
            tokenType: 'output',
            tokens: usage.completionTokens,
            ...attribution,
          });
        }
        if (usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'anthropic',
            model,
            tokenType: 'total',
            tokens: usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (usage.promptTokens && usage.completionTokens) {
          recordLlmCost({
            provider: 'anthropic',
            model,
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'anthropic',
        model,
        success: false,
        streaming: true,
        ...attribution,
      });

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
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): Promise<string> {
    const startTime = Date.now();

    const attribution = {
      tenantId: options?.tenantId,
      userId: options?.userId,
      task: options?.task,
      conversationId: options?.conversationId,
    };

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

      // Record metrics with attribution
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'google',
        model,
        success: true,
        streaming: false,
        ...attribution,
      });

      // Record token usage if available
      if (result.usage) {
        if (result.usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'google',
            model,
            tokenType: 'input',
            tokens: result.usage.promptTokens,
            ...attribution,
          });
        }
        if (result.usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'google',
            model,
            tokenType: 'output',
            tokens: result.usage.completionTokens,
            ...attribution,
          });
        }
        if (result.usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'google',
            model,
            tokenType: 'total',
            tokens: result.usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (result.usage.promptTokens && result.usage.completionTokens) {
          recordLlmCost({
            provider: 'google',
            model,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }

      return result.text;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'google',
        model,
        success: false,
        streaming: false,
        ...attribution,
      });

      throw new LlmError(
        `Google Gemini error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    model: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
      tenantId?: string;
      userId?: string;
      task?: string;
      conversationId?: string;
    }
  ): AsyncIterable<LlmStreamChunk> {
    const startTime = Date.now();

    const attribution = {
      tenantId: options?.tenantId,
      userId: options?.userId,
      task: options?.task,
      conversationId: options?.conversationId,
    };

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
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });

      yield* streamTextPartsToLlmChunks(result.fullStream);

      // Record metrics after stream completes
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'google',
        model,
        success: true,
        streaming: true,
        ...attribution,
      });

      // Record token usage if available
      const usage = await result.usage;
      if (usage) {
        if (usage.promptTokens) {
          recordLlmTokenUsage({
            provider: 'google',
            model,
            tokenType: 'input',
            tokens: usage.promptTokens,
            ...attribution,
          });
        }
        if (usage.completionTokens) {
          recordLlmTokenUsage({
            provider: 'google',
            model,
            tokenType: 'output',
            tokens: usage.completionTokens,
            ...attribution,
          });
        }
        if (usage.totalTokens) {
          recordLlmTokenUsage({
            provider: 'google',
            model,
            tokenType: 'total',
            tokens: usage.totalTokens,
            ...attribution,
          });
        }

        // Record cost in USD (fire-and-forget to avoid blocking)
        if (usage.promptTokens && usage.completionTokens) {
          recordLlmCost({
            provider: 'google',
            model,
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            ...attribution,
          }).catch((err: unknown) => console.warn('Failed to record LLM cost:', err));
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordLlmRequest(durationMs, {
        provider: 'google',
        model,
        success: false,
        streaming: true,
        ...attribution,
      });

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
  private egressClient: EgressClient;
  private egressDefaultMode: EgressMode;
  private logger = createLogger('LlmRouter');

  constructor(
    providers: LlmProviderRegistry,
    policyStore: LlmPolicyStore,
    defaultProvider: string,
    defaultModel: string,
    egressClient?: EgressClient
  ) {
    this.providers = providers;
    this.policyStore = policyStore;
    this.defaultProvider = defaultProvider;
    this.defaultModel = defaultModel;
    this.egressClient =
      egressClient ?? new EgressClient({ allowedProviders: Object.keys(providers) });
    this.egressDefaultMode = this.egressClient.getDefaultMode();
  }

  async chat(
    messages: ChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string> {
    const { provider, model, taskOptions, tenantPolicy } =
      await this.resolveProviderAndModel(options);

    const { effectiveMode, requestedMode } = resolveEffectiveEgressMode(
      this.egressDefaultMode,
      tenantPolicy,
      options
    );

    const contextualLogger = this.logger.child({
      task: options?.task ?? 'main-chat',
      provider,
      model,
      tenantId: options?.tenantId,
      userId: options?.userId,
    });

    contextualLogger.info({
      egressMode: {
        requested: requestedMode ?? this.egressDefaultMode,
        effective: effectiveMode,
      },
    }, 'Routing chat request through LlmRouter');

    const response = await this.egressClient.guardAndExecute(
      {
        target: 'llm',
        providerId: provider,
        endpointId: 'chat',
        request: { messages, model, options: taskOptions, task: options?.task },
        tenantId: options?.tenantId,
        userId: options?.userId,
        task: options?.task,
        mode: requestedMode ?? effectiveMode,
        effectiveMode,
      },
      async sanitized => {
        const payload = (sanitized.sanitizedRequest ?? sanitized.request) as {
          messages: ChatMessage[];
          model: string;
          options?: typeof taskOptions;
          task?: string;
        };

        const providerClient = this.providers[provider];
        if (!providerClient) {
          throw new LlmError(`Unknown provider: ${provider}`);
        }

        contextualLogger.info('Executing provider chat request');

        return providerClient.chat(
          payload.messages,
          payload.model,
          {
            ...(payload.options ?? taskOptions),
            tenantId: options?.tenantId,
            userId: options?.userId,
            task: options?.task,
          }
        );
      }
    );

    // Sanitize response when egress mode is 'enforce' or 'report-only'
    // This prevents PII leakage from LLM responses back to the client
    if (effectiveMode !== 'off') {
      const sanitizationContext = options?.responseSanitization ?? 'chat';
      if (sanitizationContext !== 'off') {
        contextualLogger.info('Sanitizing chat response for egress safety');
        return sanitizeTextForEgress(response, {
          context: sanitizationContext,
          ...options?.sanitizationOptions,
        });
      }
    }

    contextualLogger.info('Returning chat response from LlmRouter');
    return response;
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: LlmCompletionOptions
  ): AsyncIterable<LlmStreamChunk> {
    const { provider, model, taskOptions, tenantPolicy } =
      await this.resolveProviderAndModel(options);

    const { effectiveMode, requestedMode } = resolveEffectiveEgressMode(
      this.egressDefaultMode,
      tenantPolicy,
      options
    );

    const contextualLogger = this.logger.child({
      task: options?.task ?? 'main-chat',
      provider,
      model,
      tenantId: options?.tenantId,
      userId: options?.userId,
    });

    contextualLogger.info({
      egressMode: {
        requested: requestedMode ?? this.egressDefaultMode,
        effective: effectiveMode,
      },
    }, 'Routing streaming chat request through LlmRouter');

    const streamResult = await this.egressClient.guardAndExecute(
      {
        target: 'llm',
        providerId: provider,
        endpointId: 'chat',
        request: { messages, model, options: taskOptions, task: options?.task },
        tenantId: options?.tenantId,
        userId: options?.userId,
        task: options?.task,
        mode: requestedMode ?? effectiveMode,
        effectiveMode,
      },
      async sanitized => {
        const payload = (sanitized.sanitizedRequest ?? sanitized.request) as {
          messages: ChatMessage[];
          model: string;
          options?: typeof taskOptions;
          task?: string;
        };

        const providerClient = this.providers[provider];
        if (!providerClient) {
          throw new LlmError(`Unknown provider: ${provider}`);
        }

        if (!providerClient.streamChat) {
          throw new LlmError(`Provider ${provider} does not support streaming`);
        }

        contextualLogger.info('Executing provider streaming chat request');

        return providerClient.streamChat(
          payload.messages,
          payload.model,
          {
            ...(payload.options ?? taskOptions),
            tenantId: options?.tenantId,
            userId: options?.userId,
            task: options?.task,
          }
        );
      }
    );

    // Sanitize response chunks when egress mode is 'enforce' or 'report-only'
    // This prevents PII leakage from LLM responses back to the client
    const sanitizationContext = options?.responseSanitization ?? 'chat';
    const shouldSanitizeResponse = effectiveMode !== 'off' && sanitizationContext !== 'off';
    const sanitizationOpts: SanitizationOptions = {
      context: sanitizationContext,
      ...options?.sanitizationOptions,
    };

    try {
      for await (const chunk of streamResult) {
        if (chunk.type === 'text' && shouldSanitizeResponse) {
          // Sanitize text deltas to remove any PII the LLM might have echoed or generated
          const sanitizedDelta = sanitizeTextForEgress(chunk.delta, sanitizationOpts);
          yield { type: 'text', delta: sanitizedDelta };
        } else {
          yield chunk;
        }
      }
    } catch (error) {
      contextualLogger.error({ error }, 'Streaming chat failed');
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
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
    taskOptions: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
    };
    tenantPolicy: TenantLlmPolicy | null;
  }> {
    const tenantId = options?.tenantId ?? 'default';
    const task = options?.task;

    this.logger.debug({
      tenantId,
      task,
      requestedModel: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      hasTools: Boolean(options?.tools && options.tools.length > 0),
    }, 'Resolving provider and model for LLM request');

    // Get tenant policy
    const policy = await this.policyStore.getPolicy(tenantId);

    this.logger.debug({
      tenantId,
      hasPolicyFound: Boolean(policy),
      defaultProvider: policy?.defaultProvider,
      defaultModel: policy?.defaultModel,
      allowRemoteEgress: policy?.allowRemoteEgress,
      taskPoliciesCount: policy?.tasks?.length ?? 0,
    }, 'Retrieved tenant policy');

    // Determine provider and model
    let provider = this.defaultProvider;
    let model = this.defaultModel;
    const taskOptions: {
      temperature?: number;
      maxTokens?: number;
      tools?: Array<Record<string, unknown>>;
      toolChoice?: LlmCompletionOptions['toolChoice'];
    } = {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      tools: options?.tools,
      toolChoice: options?.toolChoice,
    };

    if (policy) {
      // Check if tenant allows remote egress
      const taskPolicy = task
        ? policy.tasks.find(t => t.task === task)
        : undefined;

      this.logger.debug({
        tenantId,
        task,
        hasTaskPolicy: Boolean(taskPolicy),
        taskPolicyProvider: taskPolicy?.provider,
        taskPolicyModel: taskPolicy?.model,
      }, 'Resolved task-specific policy');

      if (!policy.allowRemoteEgress) {
        this.logger.debug({
          tenantId,
          task,
        }, 'Remote egress disabled for tenant, enforcing local provider');

        // Remote egress disabled - enforce local provider only
        if (!this.providers.local) {
          throw new LlmError(
            'Remote egress is disabled for this tenant but no local provider is configured'
          );
        }

        provider = 'local';
        const localTaskPolicy =
          task && taskPolicy?.provider === 'local'
            ? taskPolicy
            : task
              ? policy.tasks.find(
                  tenantTask =>
                    tenantTask.task === task && tenantTask.provider === 'local'
                )
              : undefined;

        if (localTaskPolicy) {
          model = localTaskPolicy.model;
          if (localTaskPolicy.temperature !== undefined) {
            taskOptions.temperature = localTaskPolicy.temperature;
          }
          if (localTaskPolicy.maxTokens !== undefined) {
            taskOptions.maxTokens = localTaskPolicy.maxTokens;
          }
        } else if (policy.defaultProvider === 'local') {
          model = policy.defaultModel;
        } else {
          throw new LlmError(
            'Remote egress is disabled for this tenant but no local model is configured for the requested task'
          );
        }
      } else {
        // Remote egress allowed - use task policy if present, else fall back to defaults
        if (taskPolicy) {
          provider = taskPolicy.provider;
          model = taskPolicy.model;
          if (taskPolicy.temperature !== undefined) {
            taskOptions.temperature = taskPolicy.temperature;
          }
          if (taskPolicy.maxTokens !== undefined) {
            taskOptions.maxTokens = taskPolicy.maxTokens;
          }
        } else {
          provider = policy.defaultProvider;
          model = policy.defaultModel;
        }
      }
    }

    // Override with explicit options if provided
    if (options?.model) {
      model = options.model;
    }

    this.logger.info({
      provider,
      model,
      tenantId,
      task,
    }, 'Resolved provider and model for request');

    return { provider, model, taskOptions, tenantPolicy: policy };
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

  /**
   * Optional egress client configuration for outbound calls.
   * Defaults to baseline sanitization with the configured providers allowlisted.
   */
  egressClientConfig?: EgressClientConfig;

  /**
   * Optional preconfigured egress client to override the default.
   */
  egressClient?: EgressClient;
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
  const egressClient =
    config.egressClient ??
    new EgressClient({
      allowedProviders:
        config.egressClientConfig?.allowedProviders ?? availableProviders,
      mode: config.egressClientConfig?.mode ?? 'enforce',
      preserveOriginalRequest:
        config.egressClientConfig?.preserveOriginalRequest ?? false,
      aspects: config.egressClientConfig?.aspects,
    });

  return new LlmRouter(
    providers,
    policyStore,
    defaultProvider,
    defaultModel,
    egressClient
  );
}
