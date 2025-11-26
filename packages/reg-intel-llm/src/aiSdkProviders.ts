/**
 * AI SDK v5 Provider Adapters
 *
 * @deprecated These are legacy adapters. Use the main provider implementations instead:
 * - OpenAiProviderClient (from llmRouter.ts)
 * - GroqProviderClient (from llmRouter.ts)
 *
 * The main provider implementations now use AI SDK v5 under the hood by default.
 * These legacy adapters are kept for backward compatibility only.
 *
 * Per v0.3 architecture decision D-023, AI SDK is used only as an implementation
 * detail at the edges, never in domain logic or agents.
 */

import type { ChatMessage } from './types.js';
import type { LlmProviderClient, LlmStreamChunk } from './llmRouter.js';
import { LlmError } from './errors.js';

/**
 * AI SDK v5 OpenAI provider adapter
 *
 * Uses @ai-sdk/openai under the hood, wrapping it as an LlmProviderClient.
 * Requires: npm install ai @ai-sdk/openai
 */
export class AiSdkOpenAIProvider implements LlmProviderClient {
  private openai: any;

  constructor(apiKey: string) {
    // Dynamic import to avoid hard dependency on AI SDK
    try {
      const { createOpenAI } = require('@ai-sdk/openai');
      this.openai = createOpenAI({ apiKey });
    } catch (error) {
      throw new LlmError(
        'AI SDK OpenAI provider requires: npm install ai @ai-sdk/openai'
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
        `AI SDK OpenAI error: ${error instanceof Error ? error.message : String(error)}`
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
            : new Error(`AI SDK OpenAI error: ${String(error)}`),
      };
    }
  }
}

/**
 * AI SDK v5 Groq provider adapter
 *
 * Uses @ai-sdk/groq under the hood, wrapping it as an LlmProviderClient.
 * Requires: npm install ai @ai-sdk/groq
 */
export class AiSdkGroqProvider implements LlmProviderClient {
  private groq: any;

  constructor(apiKey: string) {
    // Dynamic import to avoid hard dependency on AI SDK
    try {
      const { createGroq } = require('@ai-sdk/groq');
      this.groq = createGroq({ apiKey });
    } catch (error) {
      throw new LlmError(
        'AI SDK Groq provider requires: npm install ai @ai-sdk/groq'
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
        `AI SDK Groq error: ${error instanceof Error ? error.message : String(error)}`
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
            : new Error(`AI SDK Groq error: ${String(error)}`),
      };
    }
  }
}

/**
 * Helper function to create AI SDK provider registry
 *
 * Example usage:
 * ```ts
 * const providers = createAiSdkProviders({
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   groqApiKey: process.env.GROQ_API_KEY,
 * });
 *
 * const router = new LlmRouter(providers, policyStore, 'groq', 'llama-3-70b');
 * ```
 */
export function createAiSdkProviders(config: {
  openaiApiKey?: string;
  groqApiKey?: string;
}): Record<string, LlmProviderClient> {
  const providers: Record<string, LlmProviderClient> = {};

  if (config.openaiApiKey) {
    providers.openai = new AiSdkOpenAIProvider(config.openaiApiKey);
  }

  if (config.groqApiKey) {
    providers.groq = new AiSdkGroqProvider(config.groqApiKey);
  }

  return providers;
}
