/**
 * Type definitions for @reg-copilot/reg-intel-llm
 *
 * LLM-related types for chat messages, requests, responses, and clients.
 */

/**
 * Chat message representing a conversation turn
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * LLM chat request
 */
export interface LlmChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * LLM chat response
 */
export interface LlmChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * LLM client interface
 */
export interface LlmClient {
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
}

/**
 * Redacted payload with metadata
 */
export interface RedactedPayload {
  content: unknown;
  redactionCount: number;
  redactedTypes: string[];
}

/**
 * Egress guard interface
 */
export interface EgressGuard {
  sanitizeForEgress(payload: unknown): Promise<RedactedPayload>;
}
