# Compaction Strategies Implementation Plan

> **Version**: 1.0
> **Status**: 🔵 Ready for Implementation
> **Created**: 2025-12-30
> **Related**: OUTSTANDING_WORK.md §3.6, MESSAGE_PINNING.md Phase 3

---

## Executive Summary

This document provides a **unified, comprehensive implementation plan** for all conversation compaction strategies in the Regulatory Intelligence Copilot. It covers:

- **Path Compression Strategies** (4 algorithms): Applied when active conversation paths grow too large
- **Merge Compression Strategies** (4 algorithms): Applied when merging branches back to parent paths
- **Token Counting Infrastructure**: Foundation for measuring and managing context size
- **Unified Architecture**: Consistent interfaces, conventions, and patterns across all strategies

### The Problem

**Current State**:
- ✅ Configuration framework exists (`conversationConfig.ts`)
- ✅ Message pinning fully implemented
- ✅ AI merge summarization works (for `summary` merge mode)
- ❌ **Full merge copies ALL messages verbatim** - no compression
- ❌ **Path compaction never runs** - paths can grow unbounded
- ❌ **8 compaction algorithms documented but NOT implemented**
- ❌ **No token counting** - cannot measure context size

**Impact**:
- Token limit exceeded errors in LLM calls
- Degraded response quality from bloated context
- Increased API costs from large context windows
- No protection against runaway context growth

### Success Criteria

After implementation:
1. ✅ Full merge applies configurable compaction (not verbatim copy)
2. ✅ Active paths auto-compact when exceeding thresholds
3. ✅ All 8 compaction algorithms implemented and tested
4. ✅ Token counting accurately measures context size
5. ✅ Pinned messages always preserved (when configured)
6. ✅ Configuration values actually used (not ignored)
7. ✅ Comprehensive test coverage (unit + integration)
8. ✅ UI shows token counts and compaction results

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Token Counting Infrastructure](#2-token-counting-infrastructure)
3. [Core Compaction Interfaces](#3-core-compaction-interfaces)
4. [Path Compression Strategies](#4-path-compression-strategies)
5. [Merge Compression Strategies](#5-merge-compression-strategies)
6. [Integration Points](#6-integration-points)
7. [Implementation Phases](#7-implementation-phases)
8. [Testing Strategy](#8-testing-strategy)
9. [Configuration & Defaults](#9-configuration--defaults)
10. [UI/UX Considerations](#10-uiux-considerations)
11. [Performance & Scalability](#11-performance--scalability)
12. [Migration & Rollout](#12-migration--rollout)

---

## 1. Architecture Overview

### 1.1 Unified Compaction Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Compaction System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         Token Counting Infrastructure                   │    │
│  │  - estimateMessageTokens()                              │    │
│  │  - estimateContextTokens()                              │    │
│  │  - Tiktoken integration                                 │    │
│  └────────────────────────────────────────────────────────┘    │
│                           ▲                                      │
│                           │                                      │
│  ┌────────────────────────┴───────────────────────────────┐    │
│  │         Core Compaction Engine                          │    │
│  │  - MessageCompactor (abstract base)                     │    │
│  │  - CompactionContext (shared state)                     │    │
│  │  - CompactionResult (unified output)                    │    │
│  └────────────────────────────────────────────────────────┘    │
│              ▲                              ▲                    │
│              │                              │                    │
│    ┌─────────┴─────────┐        ┌─────────┴─────────┐         │
│    │  Path Compaction  │        │  Merge Compaction │         │
│    │   4 Strategies    │        │   4 Strategies    │         │
│    └───────────────────┘        └───────────────────┘         │
│         │  │  │  │                   │  │  │  │                │
│         │  │  │  └── hybrid          │  │  │  └── aggressive   │
│         │  │  └───── semantic        │  │  └───── moderate     │
│         │  └──────── sliding_window  │  └──────── minimal      │
│         └─────────── none            └─────────── none         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Design Principles

1. **Separation of Concerns**
   - Token counting is independent, reusable infrastructure
   - Compaction strategies are pluggable and composable
   - Path vs Merge compaction share common abstractions

2. **Pinned Message Preservation**
   - All strategies MUST respect pinned messages (when configured)
   - Pinned messages are filtered OUT before compaction, then merged back
   - Clear contract: `mergePreservePinned: boolean`

3. **LLM-Agnostic Token Counting**
   - Support multiple tokenizers (tiktoken for OpenAI, custom for others)
   - Graceful degradation (character-based estimation as fallback)
   - Cached token counts to avoid repeated computation

4. **Composable Strategies**
   - Hybrid strategy composes sliding_window + semantic
   - Moderate merge strategy can leverage path compaction primitives
   - Shared utilities for deduplication, clustering, summarization

5. **Progressive Enhancement**
   - Start with simple strategies (none, sliding_window, minimal)
   - Add semantic strategies later (require LLM integration)
   - UI features can be added incrementally

---

## 2. Token Counting Infrastructure

### 2.1 Package Structure

```
packages/reg-intel-core/src/tokens/
├── tokenCounter.ts          # Main exports
├── tiktoken.ts              # Tiktoken integration
├── estimators.ts            # Fallback estimators
├── cache.ts                 # Token count caching
└── __tests__/
    ├── tokenCounter.test.ts
    └── estimators.test.ts
```

### 2.2 Core Interfaces

```typescript
/**
 * Token counting configuration
 */
export interface TokenCounterConfig {
  /** Model identifier for tokenizer selection (e.g., 'gpt-4', 'claude-3-5-sonnet') */
  model: string;

  /** Enable caching of token counts (default: true) */
  enableCache?: boolean;

  /** Fallback to character estimation if tokenizer unavailable (default: true) */
  enableFallback?: boolean;
}

/**
 * Token estimation result
 */
export interface TokenEstimate {
  /** Estimated token count */
  tokens: number;

  /** Method used for estimation */
  method: 'tiktoken' | 'character-estimate' | 'cached';

  /** Whether this is an exact count or estimate */
  isExact: boolean;
}

/**
 * Token counter interface
 */
export interface TokenCounter {
  /**
   * Estimate tokens for a single text string
   */
  estimateTokens(text: string): Promise<TokenEstimate>;

  /**
   * Estimate tokens for a conversation message
   */
  estimateMessageTokens(message: ConversationMessage): Promise<TokenEstimate>;

  /**
   * Estimate total tokens for multiple messages (includes formatting overhead)
   */
  estimateContextTokens(messages: ConversationMessage[]): Promise<TokenEstimate>;

  /**
   * Clear token count cache
   */
  clearCache(): void;
}
```

### 2.3 Implementation Details

#### 2.3.1 Tiktoken Integration

```typescript
// packages/reg-intel-core/src/tokens/tiktoken.ts

import { Tiktoken, TiktokenModel, encoding_for_model } from '@dqbd/tiktoken';

export class TiktokenCounter implements TokenCounter {
  private encoder: Tiktoken | null = null;
  private cache = new Map<string, number>();

  constructor(private config: TokenCounterConfig) {
    this.initEncoder();
  }

  private initEncoder(): void {
    try {
      // Map model names to tiktoken models
      const tiktokenModel = this.mapModelToTiktoken(this.config.model);
      this.encoder = encoding_for_model(tiktokenModel);
    } catch (err) {
      if (!this.config.enableFallback) {
        throw new Error(`Failed to initialize tiktoken for model ${this.config.model}: ${err}`);
      }
      // Will fall back to character estimation
      this.encoder = null;
    }
  }

  private mapModelToTiktoken(model: string): TiktokenModel {
    // Map our model names to tiktoken model names
    if (model.includes('gpt-4')) return 'gpt-4';
    if (model.includes('gpt-3.5')) return 'gpt-3.5-turbo';
    throw new Error(`No tiktoken mapping for model: ${model}`);
  }

  async estimateTokens(text: string): Promise<TokenEstimate> {
    if (!text) return { tokens: 0, method: 'tiktoken', isExact: true };

    // Check cache
    if (this.config.enableCache) {
      const cached = this.cache.get(text);
      if (cached !== undefined) {
        return { tokens: cached, method: 'cached', isExact: true };
      }
    }

    let tokens: number;
    let method: 'tiktoken' | 'character-estimate';
    let isExact: boolean;

    if (this.encoder) {
      // Use tiktoken for exact count
      const encoded = this.encoder.encode(text);
      tokens = encoded.length;
      method = 'tiktoken';
      isExact = true;
    } else {
      // Fallback to character estimation
      tokens = estimateTokensFromCharacters(text);
      method = 'character-estimate';
      isExact = false;
    }

    // Cache result
    if (this.config.enableCache) {
      this.cache.set(text, tokens);
    }

    return { tokens, method, isExact };
  }

  async estimateMessageTokens(message: ConversationMessage): Promise<TokenEstimate> {
    // Format: <role>: <content>
    const formatted = `${message.role}: ${message.content}`;
    const result = await this.estimateTokens(formatted);

    // Add overhead for message formatting (role tags, metadata, etc.)
    const overhead = 4; // Approximate tokens for role formatting
    return {
      ...result,
      tokens: result.tokens + overhead,
    };
  }

  async estimateContextTokens(messages: ConversationMessage[]): Promise<TokenEstimate> {
    const estimates = await Promise.all(
      messages.map(m => this.estimateMessageTokens(m))
    );

    const totalTokens = estimates.reduce((sum, est) => sum + est.tokens, 0);

    // Add overhead for conversation formatting
    const conversationOverhead = 10; // System prompt wrapper, etc.

    // Determine method and exactness
    const allExact = estimates.every(e => e.isExact);
    const method = estimates[0]?.method || 'character-estimate';

    return {
      tokens: totalTokens + conversationOverhead,
      method,
      isExact: allExact,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

#### 2.3.2 Fallback Estimator

```typescript
// packages/reg-intel-core/src/tokens/estimators.ts

/**
 * Character-based token estimation
 *
 * Rule of thumb:
 * - English text: ~4 characters per token
 * - Code/technical: ~3 characters per token
 * - Mixed: use average of 3.5
 */
export function estimateTokensFromCharacters(text: string): number {
  const chars = text.length;
  const CHARS_PER_TOKEN = 3.5;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Word-based token estimation (more accurate for natural language)
 */
export function estimateTokensFromWords(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const WORDS_PER_TOKEN = 0.75; // ~1.33 tokens per word
  return Math.ceil(words / WORDS_PER_TOKEN);
}
```

#### 2.3.3 Factory Function

```typescript
// packages/reg-intel-core/src/tokens/tokenCounter.ts

export function createTokenCounter(config: TokenCounterConfig): TokenCounter {
  // For now, always use TiktokenCounter (with fallback to character estimation)
  return new TiktokenCounter(config);
}

// Convenience: create counter for specific model
export function createTokenCounterForModel(model: string): TokenCounter {
  return createTokenCounter({ model, enableCache: true, enableFallback: true });
}
```

### 2.4 Testing Requirements

```typescript
// packages/reg-intel-core/src/tokens/__tests__/tokenCounter.test.ts

describe('TokenCounter', () => {
  describe('TiktokenCounter', () => {
    it('should count tokens accurately for GPT-4', async () => {
      const counter = createTokenCounterForModel('gpt-4');
      const result = await counter.estimateTokens('Hello, world!');

      expect(result.method).toBe('tiktoken');
      expect(result.isExact).toBe(true);
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should cache token counts', async () => {
      const counter = createTokenCounterForModel('gpt-4');
      const text = 'This is a test';

      const result1 = await counter.estimateTokens(text);
      const result2 = await counter.estimateTokens(text);

      expect(result1.method).toBe('tiktoken');
      expect(result2.method).toBe('cached');
      expect(result1.tokens).toBe(result2.tokens);
    });

    it('should estimate message tokens with overhead', async () => {
      const counter = createTokenCounterForModel('gpt-4');
      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        // ... other fields
      };

      const textResult = await counter.estimateTokens('Hello');
      const msgResult = await counter.estimateMessageTokens(message);

      // Message should have more tokens due to role formatting
      expect(msgResult.tokens).toBeGreaterThan(textResult.tokens);
    });

    it('should estimate context tokens for multiple messages', async () => {
      const counter = createTokenCounterForModel('gpt-4');
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', /* ... */ },
        { id: '2', role: 'assistant', content: 'Hi there!', /* ... */ },
      ];

      const result = await counter.estimateContextTokens(messages);

      expect(result.tokens).toBeGreaterThan(0);
      // Should include conversation overhead
    });

    it('should fall back to character estimation for unknown models', async () => {
      const counter = createTokenCounter({
        model: 'unknown-model',
        enableFallback: true,
      });

      const result = await counter.estimateTokens('Hello, world!');

      expect(result.method).toBe('character-estimate');
      expect(result.isExact).toBe(false);
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('Character estimator', () => {
    it('should estimate tokens from character count', () => {
      const text = 'A'.repeat(350); // 350 characters
      const tokens = estimateTokensFromCharacters(text);

      // 350 chars / 3.5 = 100 tokens
      expect(tokens).toBe(100);
    });

    it('should estimate tokens from word count', () => {
      const text = 'one two three four five six seven eight';
      const tokens = estimateTokensFromWords(text);

      // 8 words / 0.75 = ~11 tokens
      expect(tokens).toBeGreaterThanOrEqual(10);
      expect(tokens).toBeLessThanOrEqual(12);
    });
  });
});
```

---

## 3. Core Compaction Interfaces

### 3.1 Shared Types

```typescript
// packages/reg-intel-conversations/src/compaction/types.ts

import type { ConversationMessage } from '../conversationStores.js';
import type { TokenEstimate } from '@acme/reg-intel-core/tokens';

/**
 * Context passed to all compaction strategies
 */
export interface CompactionContext {
  /** Messages to compact */
  messages: ConversationMessage[];

  /** Pinned message IDs (these should be preserved) */
  pinnedMessageIds: Set<string>;

  /** Token counter for measuring context size */
  tokenCounter: TokenCounter;

  /** LLM router for semantic analysis (if needed) */
  llmRouter?: LlmRouter;

  /** Current token count before compaction */
  currentTokens: number;

  /** Target token budget (if applicable) */
  targetTokens?: number;

  /** Configuration for this compaction operation */
  config: CompactionConfig;
}

/**
 * Result from compaction operation
 */
export interface CompactionResult {
  /** Compacted messages (may be original, summarized, or removed) */
  messages: ConversationMessage[];

  /** Token count after compaction */
  tokensAfter: number;

  /** Token count before compaction */
  tokensBefore: number;

  /** Number of messages removed */
  messagesRemoved: number;

  /** Number of messages summarized */
  messagesSummarized: number;

  /** Number of pinned messages preserved */
  pinnedPreserved: number;

  /** Strategy that performed the compaction */
  strategy: string;

  /** Whether compaction was successful */
  success: boolean;

  /** Error message if compaction failed */
  error?: string;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Configuration for a compaction operation
 */
export interface CompactionConfig {
  /** Whether to preserve pinned messages (default: true) */
  preservePinned?: boolean;

  /** Window size for sliding window strategy */
  windowSize?: number;

  /** Semantic similarity threshold (0-1) */
  semanticThreshold?: number;

  /** Maximum tokens to retain */
  maxTokens?: number;

  /** Maximum messages to retain */
  maxMessages?: number;

  /** Whether to summarize removed content */
  generateSummaries?: boolean;
}

/**
 * Abstract base class for all compaction strategies
 */
export abstract class MessageCompactor {
  constructor(protected config: CompactionConfig) {}

  /**
   * Compact messages according to strategy
   */
  abstract compact(context: CompactionContext): Promise<CompactionResult>;

  /**
   * Estimate tokens saved by this strategy (optional, for preview)
   */
  async estimateCompaction(context: CompactionContext): Promise<{
    estimatedTokensSaved: number;
    estimatedMessagesRemoved: number;
  }> {
    // Default: run full compaction and return stats
    const result = await this.compact(context);
    return {
      estimatedTokensSaved: result.tokensBefore - result.tokensAfter,
      estimatedMessagesRemoved: result.messagesRemoved,
    };
  }

  /**
   * Validate that compaction preserved pinned messages
   */
  protected validatePinnedPreservation(
    context: CompactionContext,
    result: ConversationMessage[]
  ): void {
    if (!this.config.preservePinned) return;

    const resultIds = new Set(result.map(m => m.id));
    const missingPinned = Array.from(context.pinnedMessageIds).filter(
      id => !resultIds.has(id)
    );

    if (missingPinned.length > 0) {
      throw new Error(
        `Compaction violated pinned message preservation: missing ${missingPinned.length} pinned messages`
      );
    }
  }

  /**
   * Split messages into pinned and unpinned
   */
  protected partitionByPinned(context: CompactionContext): {
    pinned: ConversationMessage[];
    unpinned: ConversationMessage[];
  } {
    const pinned: ConversationMessage[] = [];
    const unpinned: ConversationMessage[] = [];

    for (const msg of context.messages) {
      if (context.pinnedMessageIds.has(msg.id)) {
        pinned.push(msg);
      } else {
        unpinned.push(msg);
      }
    }

    return { pinned, unpinned };
  }
}
```

### 3.2 Utility Functions

```typescript
// packages/reg-intel-conversations/src/compaction/utils.ts

/**
 * Deduplicate messages by content hash
 */
export function deduplicateMessages(messages: ConversationMessage[]): {
  unique: ConversationMessage[];
  removed: ConversationMessage[];
} {
  const seen = new Set<string>();
  const unique: ConversationMessage[] = [];
  const removed: ConversationMessage[] = [];

  for (const msg of messages) {
    const hash = hashMessage(msg);
    if (!seen.has(hash)) {
      seen.add(hash);
      unique.push(msg);
    } else {
      removed.push(msg);
    }
  }

  return { unique, removed };
}

/**
 * Create a simple content hash for deduplication
 */
function hashMessage(msg: ConversationMessage): string {
  return `${msg.role}:${msg.content.trim().toLowerCase()}`;
}

/**
 * Merge messages in chronological order while preserving sequence
 */
export function mergeMessageLists(
  ...lists: ConversationMessage[][]
): ConversationMessage[] {
  const merged = lists.flat();

  // Sort by createdAt, then by sequenceInPath
  merged.sort((a, b) => {
    const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return (a.sequenceInPath ?? 0) - (b.sequenceInPath ?? 0);
  });

  return merged;
}

/**
 * Calculate token reduction percentage
 */
export function calculateReduction(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round(((before - after) / before) * 100);
}
```

---

## 4. Path Compression Strategies

Path compression is applied to **active conversation paths** when they grow too large.

### 4.1 Strategy 1: None (Passthrough)

```typescript
// packages/reg-intel-conversations/src/compaction/path/NoneCompactor.ts

export class NoneCompactor extends MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    // No compaction - return all messages as-is
    return {
      messages: context.messages,
      tokensAfter: context.currentTokens,
      tokensBefore: context.currentTokens,
      messagesRemoved: 0,
      messagesSummarized: 0,
      pinnedPreserved: context.pinnedMessageIds.size,
      strategy: 'none',
      success: true,
    };
  }

  async estimateCompaction(): Promise<{
    estimatedTokensSaved: number;
    estimatedMessagesRemoved: number;
  }> {
    return { estimatedTokensSaved: 0, estimatedMessagesRemoved: 0 };
  }
}
```

### 4.2 Strategy 2: Sliding Window

```typescript
// packages/reg-intel-conversations/src/compaction/path/SlidingWindowCompactor.ts

export class SlidingWindowCompactor extends MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    const { messages, pinnedMessageIds, tokenCounter } = context;
    const windowSize = this.config.windowSize ?? 50;

    // Partition into pinned and unpinned
    const { pinned, unpinned } = this.partitionByPinned(context);

    // Keep last N unpinned messages
    const recentUnpinned = unpinned.slice(-windowSize);
    const oldUnpinned = unpinned.slice(0, -windowSize);

    // Optionally summarize old messages
    let summarizedOld: ConversationMessage[] = [];
    if (this.config.generateSummaries && oldUnpinned.length > 0) {
      summarizedOld = [await this.summarizeMessages(oldUnpinned, context)];
    }

    // Combine: pinned + recent + (optional) summary
    const result = mergeMessageLists(pinned, summarizedOld, recentUnpinned);

    // Validate pinned preservation
    this.validatePinnedPreservation(context, result);

    // Calculate token counts
    const tokensAfter = (await tokenCounter.estimateContextTokens(result)).tokens;

    return {
      messages: result,
      tokensAfter,
      tokensBefore: context.currentTokens,
      messagesRemoved: oldUnpinned.length - summarizedOld.length,
      messagesSummarized: summarizedOld.length,
      pinnedPreserved: pinned.length,
      strategy: 'sliding_window',
      success: true,
      metadata: {
        windowSize,
        oldMessagesCount: oldUnpinned.length,
      },
    };
  }

  private async summarizeMessages(
    messages: ConversationMessage[],
    context: CompactionContext
  ): Promise<ConversationMessage> {
    if (!context.llmRouter) {
      throw new Error('LLM router required for message summarization');
    }

    const content = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

    const summary = await context.llmRouter.complete({
      system: SUMMARIZATION_SYSTEM_PROMPT,
      user: `Summarize the following conversation segment:\n\n${content}`,
      temperature: 0.3,
      maxTokens: 300,
    });

    return {
      id: generateId(),
      conversationId: messages[0].conversationId,
      pathId: messages[0].pathId,
      role: 'system',
      content: `**[Summarized ${messages.length} messages]**: ${summary}`,
      sequenceInPath: messages[0].sequenceInPath,
      isBranchPoint: false,
      branchedToPaths: [],
      createdAt: new Date(),
      metadata: {
        type: 'compaction_summary',
        sourceMessageIds: messages.map(m => m.id),
        compactionStrategy: 'sliding_window',
      },
    };
  }
}

const SUMMARIZATION_SYSTEM_PROMPT = `
You are a conversation summarizer. Create a concise summary that captures:
1. Key topics discussed
2. Important facts or decisions
3. Any action items

Keep it brief (2-3 sentences max) and factual.
`.trim();
```

### 4.3 Strategy 3: Semantic Compaction

```typescript
// packages/reg-intel-conversations/src/compaction/path/SemanticCompactor.ts

export class SemanticCompactor extends MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    const { messages, pinnedMessageIds, tokenCounter, llmRouter } = context;

    if (!llmRouter) {
      throw new Error('LLM router required for semantic compaction');
    }

    // Partition into pinned and unpinned
    const { pinned, unpinned } = this.partitionByPinned(context);

    // Score each unpinned message for importance
    const scored = await this.scoreMessages(unpinned, llmRouter);

    // Sort by importance score (descending)
    scored.sort((a, b) => b.score - a.score);

    // Determine how many to keep based on token budget
    const threshold = this.config.semanticThreshold ?? 0.5;
    const important = scored.filter(s => s.score >= threshold).map(s => s.message);

    // Apply token budget if specified
    let retained = important;
    if (this.config.maxTokens) {
      retained = await this.applyTokenBudget(
        important,
        this.config.maxTokens,
        tokenCounter
      );
    }

    // Combine pinned + important
    const result = mergeMessageLists(pinned, retained);

    // Validate pinned preservation
    this.validatePinnedPreservation(context, result);

    const tokensAfter = (await tokenCounter.estimateContextTokens(result)).tokens;

    return {
      messages: result,
      tokensAfter,
      tokensBefore: context.currentTokens,
      messagesRemoved: unpinned.length - retained.length,
      messagesSummarized: 0,
      pinnedPreserved: pinned.length,
      strategy: 'semantic',
      success: true,
      metadata: {
        threshold,
        averageScore: scored.reduce((sum, s) => sum + s.score, 0) / scored.length,
      },
    };
  }

  private async scoreMessages(
    messages: ConversationMessage[],
    llmRouter: LlmRouter
  ): Promise<Array<{ message: ConversationMessage; score: number }>> {
    // Use LLM to score message importance (0-1)
    const prompt = this.buildScoringPrompt(messages);

    const response = await llmRouter.complete({
      system: SEMANTIC_SCORING_SYSTEM_PROMPT,
      user: prompt,
      temperature: 0.2,
      maxTokens: 500,
    });

    // Parse JSON response with scores
    const scores = this.parseScores(response);

    return messages.map((msg, idx) => ({
      message: msg,
      score: scores[idx] ?? 0.5, // Default to medium importance if missing
    }));
  }

  private buildScoringPrompt(messages: ConversationMessage[]): string {
    const formatted = messages.map((m, idx) =>
      `Message ${idx}: [${m.role}] ${m.content.slice(0, 200)}...`
    ).join('\n\n');

    return `
Score each message for importance (0.0 = low, 1.0 = high).
Consider: regulatory relevance, key decisions, unique information.

${formatted}

Return JSON array of scores: [0.8, 0.3, 0.9, ...]
    `.trim();
  }

  private parseScores(response: string): number[] {
    try {
      const match = response.match(/\[([\d.,\s]+)\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch {
      // Fallback
    }
    return [];
  }

  private async applyTokenBudget(
    messages: ConversationMessage[],
    budget: number,
    tokenCounter: TokenCounter
  ): Promise<ConversationMessage[]> {
    const result: ConversationMessage[] = [];
    let tokens = 0;

    for (const msg of messages) {
      const msgTokens = (await tokenCounter.estimateMessageTokens(msg)).tokens;
      if (tokens + msgTokens <= budget) {
        result.push(msg);
        tokens += msgTokens;
      } else {
        break;
      }
    }

    return result;
  }
}

const SEMANTIC_SCORING_SYSTEM_PROMPT = `
You are a message importance scorer. Rate each message from 0.0 (unimportant) to 1.0 (critical).

High importance (0.8-1.0):
- Regulatory requirements or compliance issues
- Key decisions or conclusions
- Unique factual information

Medium importance (0.4-0.7):
- Supporting details or explanations
- Examples or clarifications
- Follow-up questions

Low importance (0.0-0.3):
- Greetings or small talk
- Redundant information
- Off-topic tangents
`.trim();
```

### 4.4 Strategy 4: Hybrid Compaction

```typescript
// packages/reg-intel-conversations/src/compaction/path/HybridCompactor.ts

export class HybridCompactor extends MessageCompactor {
  private slidingWindow: SlidingWindowCompactor;
  private semantic: SemanticCompactor;

  constructor(config: CompactionConfig) {
    super(config);
    this.slidingWindow = new SlidingWindowCompactor(config);
    this.semantic = new SemanticCompactor(config);
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    const { messages, pinnedMessageIds, tokenCounter } = context;
    const windowSize = this.config.windowSize ?? 50;

    // Partition into pinned and unpinned
    const { pinned, unpinned } = this.partitionByPinned(context);

    // Split unpinned into recent and old
    const recent = unpinned.slice(-windowSize);
    const old = unpinned.slice(0, -windowSize);

    // Apply semantic scoring to old messages
    let retainedOld: ConversationMessage[] = [];
    if (old.length > 0 && context.llmRouter) {
      const semanticResult = await this.semantic.compact({
        ...context,
        messages: old,
        pinnedMessageIds: new Set(), // Already filtered out
      });
      retainedOld = semanticResult.messages;
    }

    // Combine: pinned + semantically important old + recent
    const result = mergeMessageLists(pinned, retainedOld, recent);

    // Validate pinned preservation
    this.validatePinnedPreservation(context, result);

    const tokensAfter = (await tokenCounter.estimateContextTokens(result)).tokens;

    return {
      messages: result,
      tokensAfter,
      tokensBefore: context.currentTokens,
      messagesRemoved: unpinned.length - (retainedOld.length + recent.length),
      messagesSummarized: 0,
      pinnedPreserved: pinned.length,
      strategy: 'hybrid',
      success: true,
      metadata: {
        windowSize,
        oldMessagesCount: old.length,
        oldMessagesRetained: retainedOld.length,
        recentMessagesCount: recent.length,
      },
    };
  }
}
```

---

## 5. Merge Compression Strategies

Merge compression is applied when **merging a branch** back to the parent path.

### 5.1 Strategy 1: None (Full Copy)

```typescript
// packages/reg-intel-conversations/src/compaction/merge/NoneCompactor.ts

export class MergeNoneCompactor extends MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    // No compaction - copy all messages
    return {
      messages: context.messages,
      tokensAfter: context.currentTokens,
      tokensBefore: context.currentTokens,
      messagesRemoved: 0,
      messagesSummarized: 0,
      pinnedPreserved: context.pinnedMessageIds.size,
      strategy: 'merge:none',
      success: true,
    };
  }
}
```

### 5.2 Strategy 2: Minimal (Deduplication)

```typescript
// packages/reg-intel-conversations/src/compaction/merge/MinimalCompactor.ts

export class MergeMinimalCompactor extends MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    const { messages, pinnedMessageIds, tokenCounter } = context;

    // Partition into pinned and unpinned
    const { pinned, unpinned } = this.partitionByPinned(context);

    // Deduplicate unpinned messages
    const { unique, removed } = deduplicateMessages(unpinned);

    // Combine pinned + deduplicated
    const result = mergeMessageLists(pinned, unique);

    // Validate pinned preservation
    this.validatePinnedPreservation(context, result);

    const tokensAfter = (await tokenCounter.estimateContextTokens(result)).tokens;

    return {
      messages: result,
      tokensAfter,
      tokensBefore: context.currentTokens,
      messagesRemoved: removed.length,
      messagesSummarized: 0,
      pinnedPreserved: pinned.length,
      strategy: 'merge:minimal',
      success: true,
      metadata: {
        duplicatesRemoved: removed.length,
      },
    };
  }
}
```

### 5.3 Strategy 3: Moderate (Summarize Redundant)

```typescript
// packages/reg-intel-conversations/src/compaction/merge/ModerateCompactor.ts

export class MergeModerateCompactor extends MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    const { messages, pinnedMessageIds, tokenCounter, llmRouter } = context;

    if (!llmRouter) {
      throw new Error('LLM router required for moderate merge compaction');
    }

    // Partition into pinned and unpinned
    const { pinned, unpinned } = this.partitionByPinned(context);

    // First deduplicate
    const { unique } = deduplicateMessages(unpinned);

    // Identify redundant exchanges (back-and-forth Q&A with similar content)
    const { redundant, important } = await this.identifyRedundantExchanges(
      unique,
      llmRouter
    );

    // Summarize redundant exchanges
    const summarized: ConversationMessage[] = [];
    if (redundant.length > 0) {
      summarized.push(await this.summarizeExchanges(redundant, context));
    }

    // For pinned messages, preserve with immediate context (1 before, 1 after)
    const pinnedWithContext = this.addContextToPinned(pinned, messages);

    // Combine: pinned with context + important + summarized
    const result = mergeMessageLists(pinnedWithContext, important, summarized);

    // Validate pinned preservation
    this.validatePinnedPreservation(context, result);

    const tokensAfter = (await tokenCounter.estimateContextTokens(result)).tokens;

    return {
      messages: result,
      tokensAfter,
      tokensBefore: context.currentTokens,
      messagesRemoved: redundant.length - summarized.length,
      messagesSummarized: summarized.length,
      pinnedPreserved: pinned.length,
      strategy: 'merge:moderate',
      success: true,
      metadata: {
        redundantExchanges: redundant.length,
        importantKept: important.length,
      },
    };
  }

  private async identifyRedundantExchanges(
    messages: ConversationMessage[],
    llmRouter: LlmRouter
  ): Promise<{
    redundant: ConversationMessage[];
    important: ConversationMessage[];
  }> {
    // Use LLM to identify redundant vs important exchanges
    const prompt = this.buildRedundancyPrompt(messages);

    const response = await llmRouter.complete({
      system: REDUNDANCY_DETECTION_PROMPT,
      user: prompt,
      temperature: 0.2,
      maxTokens: 500,
    });

    // Parse which messages are redundant
    const redundantIndices = this.parseRedundantIndices(response);

    const redundant: ConversationMessage[] = [];
    const important: ConversationMessage[] = [];

    messages.forEach((msg, idx) => {
      if (redundantIndices.has(idx)) {
        redundant.push(msg);
      } else {
        important.push(msg);
      }
    });

    return { redundant, important };
  }

  private buildRedundancyPrompt(messages: ConversationMessage[]): string {
    const formatted = messages.map((m, idx) =>
      `[${idx}] ${m.role}: ${m.content.slice(0, 150)}...`
    ).join('\n\n');

    return `
Identify redundant messages in this conversation. Mark messages as redundant if they:
- Repeat information already stated
- Ask clarifying questions already answered
- Provide examples when the concept is already clear

${formatted}

Return JSON array of redundant message indices: [2, 5, 7]
    `.trim();
  }

  private parseRedundantIndices(response: string): Set<number> {
    try {
      const match = response.match(/\[([\d,\s]+)\]/);
      if (match) {
        const indices: number[] = JSON.parse(match[0]);
        return new Set(indices);
      }
    } catch {
      // Fallback
    }
    return new Set();
  }

  private async summarizeExchanges(
    messages: ConversationMessage[],
    context: CompactionContext
  ): Promise<ConversationMessage> {
    const content = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

    const summary = await context.llmRouter!.complete({
      system: 'Summarize redundant exchanges into key points.',
      user: content,
      temperature: 0.3,
      maxTokens: 250,
    });

    return {
      id: generateId(),
      conversationId: messages[0].conversationId,
      pathId: messages[0].pathId,
      role: 'system',
      content: `**[Summarized ${messages.length} redundant exchanges]**: ${summary}`,
      sequenceInPath: messages[0].sequenceInPath,
      isBranchPoint: false,
      branchedToPaths: [],
      createdAt: new Date(),
      metadata: {
        type: 'merge_summary',
        sourceMessageIds: messages.map(m => m.id),
        compactionStrategy: 'merge:moderate',
      },
    };
  }

  private addContextToPinned(
    pinned: ConversationMessage[],
    allMessages: ConversationMessage[]
  ): ConversationMessage[] {
    const result = new Set<string>();

    pinned.forEach(p => {
      result.add(p.id);

      // Find previous and next messages
      const idx = allMessages.findIndex(m => m.id === p.id);
      if (idx > 0) result.add(allMessages[idx - 1].id);
      if (idx < allMessages.length - 1) result.add(allMessages[idx + 1].id);
    });

    return allMessages.filter(m => result.has(m.id));
  }
}

const REDUNDANCY_DETECTION_PROMPT = `
You are a conversation analyzer. Identify redundant messages that don't add new information.

Keep messages that:
- Introduce new concepts or facts
- Make decisions or conclusions
- Provide unique examples or data

Mark as redundant:
- Repetitive explanations
- Already-answered questions
- Clarifications of clear concepts
`.trim();
```

### 5.4 Strategy 4: Aggressive (Outcomes Only)

```typescript
// packages/reg-intel-conversations/src/compaction/merge/AggressiveCompactor.ts

export class MergeAggressiveCompactor extends MessageCompactor {
  async compact(context: CompactionContext): Promise<CompactionResult> {
    const { messages, pinnedMessageIds, tokenCounter, llmRouter } = context;

    if (!llmRouter) {
      throw new Error('LLM router required for aggressive merge compaction');
    }

    // Partition into pinned and unpinned
    const { pinned, unpinned } = this.partitionByPinned(context);

    // Extract only outcomes/conclusions from unpinned
    const outcomes = await this.extractOutcomes(unpinned, llmRouter);

    // Combine pinned + outcomes
    const result = mergeMessageLists(pinned, outcomes);

    // Validate pinned preservation
    this.validatePinnedPreservation(context, result);

    const tokensAfter = (await tokenCounter.estimateContextTokens(result)).tokens;

    return {
      messages: result,
      tokensAfter,
      tokensBefore: context.currentTokens,
      messagesRemoved: unpinned.length - outcomes.length,
      messagesSummarized: outcomes.length,
      pinnedPreserved: pinned.length,
      strategy: 'merge:aggressive',
      success: true,
      metadata: {
        originalCount: unpinned.length,
        outcomesCount: outcomes.length,
        reductionPercent: calculateReduction(unpinned.length, outcomes.length),
      },
    };
  }

  private async extractOutcomes(
    messages: ConversationMessage[],
    llmRouter: LlmRouter
  ): Promise<ConversationMessage[]> {
    // Use LLM to extract key outcomes and decisions
    const content = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

    const summary = await llmRouter.complete({
      system: OUTCOME_EXTRACTION_PROMPT,
      user: `Extract key outcomes from this branch:\n\n${content}`,
      temperature: 0.2,
      maxTokens: 400,
    });

    return [{
      id: generateId(),
      conversationId: messages[0].conversationId,
      pathId: messages[0].pathId,
      role: 'system',
      content: `**[Branch Outcomes]**: ${summary}`,
      sequenceInPath: messages[0].sequenceInPath,
      isBranchPoint: false,
      branchedToPaths: [],
      createdAt: new Date(),
      metadata: {
        type: 'merge_outcomes',
        sourceMessageIds: messages.map(m => m.id),
        compactionStrategy: 'merge:aggressive',
        originalMessageCount: messages.length,
      },
    }];
  }
}

const OUTCOME_EXTRACTION_PROMPT = `
You are an outcome extractor. From a conversation, extract ONLY:

1. Final decisions made
2. Key conclusions reached
3. Action items identified
4. Important facts discovered

Omit all discussion, questions, and exploratory dialogue.
Format as a concise list of outcomes.
`.trim();
```

---

## 6. Integration Points

### 6.1 Path Store Integration

```typescript
// packages/reg-intel-conversations/src/conversationStores.ts

import { createTokenCounterForModel } from '@acme/reg-intel-core/tokens';
import { createPathCompactor } from './compaction/pathCompaction.js';

export interface ConversationPathStore {
  // ... existing methods ...

  /**
   * Apply compaction to an active path
   */
  compactPath(input: {
    tenantId: string;
    pathId: string;
    strategy?: PathCompressionStrategy;
    config?: Partial<CompactionConfig>;
  }): Promise<CompactionResult>;

  /**
   * Check if path needs compaction based on thresholds
   */
  shouldCompactPath(input: {
    tenantId: string;
    pathId: string;
  }): Promise<boolean>;
}

// Example implementation in SupabaseConversationPathStore
export class SupabaseConversationPathStore implements ConversationPathStore {
  // ... existing methods ...

  async compactPath(input: {
    tenantId: string;
    pathId: string;
    strategy?: PathCompressionStrategy;
    config?: Partial<CompactionConfig>;
  }): Promise<CompactionResult> {
    // 1. Load path configuration
    const pathConfig = await this.configStore.getConfig({
      tenantId: input.tenantId,
    });

    const strategy = input.strategy ?? pathConfig.pathCompressionStrategy;

    // 2. Load path messages and pinned IDs
    const messages = await this.resolvePathMessages({
      tenantId: input.tenantId,
      pathId: input.pathId,
    });

    const pinnedMessageIds = new Set(
      messages.filter(m => m.metadata?.pinned).map(m => m.id)
    );

    // 3. Create token counter
    const tokenCounter = createTokenCounterForModel('gpt-4'); // Or from config

    // 4. Calculate current tokens
    const currentTokens = (await tokenCounter.estimateContextTokens(messages)).tokens;

    // 5. Create compaction context
    const context: CompactionContext = {
      messages,
      pinnedMessageIds,
      tokenCounter,
      llmRouter: this.llmRouter, // Injected dependency
      currentTokens,
      targetTokens: input.config?.maxTokens ?? pathConfig.pathMaxMessages,
      config: {
        preservePinned: pathConfig.mergePreservePinned ?? true,
        windowSize: pathConfig.pathSlidingWindowSize,
        semanticThreshold: pathConfig.pathCompressionThreshold,
        ...input.config,
      },
    };

    // 6. Run compaction
    const compactor = createPathCompactor(strategy, context.config);
    const result = await compactor.compact(context);

    // 7. Update path with compacted messages (if successful)
    if (result.success) {
      await this.replacePathMessages({
        tenantId: input.tenantId,
        pathId: input.pathId,
        messages: result.messages,
      });
    }

    return result;
  }

  async shouldCompactPath(input: {
    tenantId: string;
    pathId: string;
  }): Promise<boolean> {
    const config = await this.configStore.getConfig({
      tenantId: input.tenantId,
    });

    if (!config.autoCompactEnabled) {
      return false;
    }

    const messages = await this.resolvePathMessages({
      tenantId: input.tenantId,
      pathId: input.pathId,
    });

    // Check message count threshold
    if (config.pathMaxMessages && messages.length > config.pathMaxMessages) {
      return true;
    }

    // Check token threshold (if configured)
    if (config.pathCompressionThreshold) {
      const tokenCounter = createTokenCounterForModel('gpt-4');
      const tokens = (await tokenCounter.estimateContextTokens(messages)).tokens;

      // Compact if over 80% of max model context (e.g., 128k tokens)
      const maxModelTokens = 128000; // Could be from config
      const threshold = maxModelTokens * 0.8;

      if (tokens > threshold) {
        return true;
      }
    }

    return false;
  }

  private async replacePathMessages(input: {
    tenantId: string;
    pathId: string;
    messages: ConversationMessage[];
  }): Promise<void> {
    // Implementation: replace messages for this path
    // This is a significant operation - should be transactional

    // 1. Delete existing messages for this path
    await this.supabase
      .from('conversation_messages')
      .delete()
      .eq('path_id', input.pathId)
      .eq('tenant_id', input.tenantId);

    // 2. Insert compacted messages
    await this.supabase
      .from('conversation_messages')
      .insert(input.messages.map((m, idx) => ({
        ...m,
        sequence_in_path: idx,
      })));
  }
}
```

### 6.2 Merge Flow Integration

```typescript
// packages/reg-intel-conversations/src/conversationStores.ts

export interface MergeRequest {
  sourcePathId: string;
  targetPathId: string;
  mergeMode: 'summary' | 'full' | 'selective';
  selectedMessageIds?: string[];
  summaryContent?: string;

  // NEW: Compaction options
  applyCompaction?: boolean;          // Default: true for full merge
  compressionStrategy?: MergeCompressionStrategy;  // Override config
  compactionConfig?: Partial<CompactionConfig>;    // Additional config
}

export class SupabaseConversationPathStore implements ConversationPathStore {
  // ... existing methods ...

  async mergePath(input: {
    tenantId: string;
    sourcePathId: string;
    targetPathId: string;
    mergeMode: 'summary' | 'full' | 'selective';
    selectedMessageIds?: string[];
    summaryContent?: string;
    userId?: string | null;
    applyCompaction?: boolean;
    compressionStrategy?: MergeCompressionStrategy;
    compactionConfig?: Partial<CompactionConfig>;
  }): Promise<MergeResult> {
    // Load configuration
    const config = await this.configStore.getConfig({
      tenantId: input.tenantId,
      userId: input.userId,
    });

    // Get source path messages
    const sourceMessages = await this.resolvePathMessages({
      tenantId: input.tenantId,
      pathId: input.sourcePathId,
    });

    let messagesToMerge: ConversationMessage[];

    // Handle merge mode
    switch (input.mergeMode) {
      case 'summary':
        // Use AI summarization (existing implementation)
        messagesToMerge = await this.summarizeBranch(sourceMessages, input);
        break;

      case 'selective':
        // User-selected messages
        messagesToMerge = sourceMessages.filter(m =>
          input.selectedMessageIds?.includes(m.id)
        );
        break;

      case 'full':
        // Copy all messages, but apply compaction if enabled
        messagesToMerge = sourceMessages;

        // NEW: Apply compaction for full merge
        const shouldCompact = input.applyCompaction ??
          (messagesToMerge.length > 15); // Default threshold

        if (shouldCompact) {
          messagesToMerge = await this.applyMergeCompaction({
            messages: messagesToMerge,
            tenantId: input.tenantId,
            strategy: input.compressionStrategy ?? config.mergeCompressionStrategy,
            config: {
              preservePinned: config.mergePreservePinned,
              maxMessages: config.mergeMaxMessages,
              ...input.compactionConfig,
            },
          });
        }
        break;
    }

    // Append messages to target path
    const targetPath = await this.getPath({
      tenantId: input.tenantId,
      pathId: input.targetPathId,
    });

    if (!targetPath) {
      throw new Error('Target path not found');
    }

    // Add messages to target
    const mergedMessageIds: string[] = [];
    for (const msg of messagesToMerge) {
      const { messageId } = await this.addMessage({
        tenantId: input.tenantId,
        pathId: input.targetPathId,
        role: msg.role,
        content: msg.content,
        metadata: {
          ...msg.metadata,
          mergedFrom: input.sourcePathId,
        },
      });
      mergedMessageIds.push(messageId);
    }

    // Update source path merge status
    await this.supabase
      .from('conversation_paths')
      .update({
        merged_to_path_id: input.targetPathId,
        merged_at: new Date().toISOString(),
        is_active: false, // Archive merged path
      })
      .eq('id', input.sourcePathId)
      .eq('tenant_id', input.tenantId);

    return {
      success: true,
      mergedMessageIds,
      targetPath,
    };
  }

  private async applyMergeCompaction(input: {
    messages: ConversationMessage[];
    tenantId: string;
    strategy: MergeCompressionStrategy;
    config: Partial<CompactionConfig>;
  }): Promise<ConversationMessage[]> {
    const pinnedMessageIds = new Set(
      input.messages.filter(m => m.metadata?.pinned).map(m => m.id)
    );

    const tokenCounter = createTokenCounterForModel('gpt-4');
    const currentTokens = (await tokenCounter.estimateContextTokens(input.messages)).tokens;

    const context: CompactionContext = {
      messages: input.messages,
      pinnedMessageIds,
      tokenCounter,
      llmRouter: this.llmRouter,
      currentTokens,
      config: input.config,
    };

    const compactor = createMergeCompactor(input.strategy, input.config);
    const result = await compactor.compact(context);

    if (!result.success) {
      this.logger?.error?.('[PathStore] Merge compaction failed', {
        error: result.error,
      });
      // Return original messages on failure
      return input.messages;
    }

    this.logger?.info?.('[PathStore] Merge compaction completed', {
      strategy: input.strategy,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      messagesRemoved: result.messagesRemoved,
      reduction: calculateReduction(result.tokensBefore, result.tokensAfter),
    });

    return result.messages;
  }
}
```

### 6.3 Factory Functions

```typescript
// packages/reg-intel-conversations/src/compaction/pathCompaction.ts

import { NoneCompactor } from './path/NoneCompactor.js';
import { SlidingWindowCompactor } from './path/SlidingWindowCompactor.js';
import { SemanticCompactor } from './path/SemanticCompactor.js';
import { HybridCompactor } from './path/HybridCompactor.js';

export function createPathCompactor(
  strategy: PathCompressionStrategy,
  config: CompactionConfig
): MessageCompactor {
  switch (strategy) {
    case 'none':
      return new NoneCompactor(config);
    case 'sliding_window':
      return new SlidingWindowCompactor(config);
    case 'semantic':
      return new SemanticCompactor(config);
    case 'hybrid':
      return new HybridCompactor(config);
    default:
      throw new Error(`Unknown path compaction strategy: ${strategy}`);
  }
}

// packages/reg-intel-conversations/src/compaction/mergeCompaction.ts

import { MergeNoneCompactor } from './merge/NoneCompactor.js';
import { MergeMinimalCompactor } from './merge/MinimalCompactor.js';
import { MergeModerateCompactor } from './merge/ModerateCompactor.js';
import { MergeAggressiveCompactor } from './merge/AggressiveCompactor.js';

export function createMergeCompactor(
  strategy: MergeCompressionStrategy,
  config: CompactionConfig
): MessageCompactor {
  switch (strategy) {
    case 'none':
      return new MergeNoneCompactor(config);
    case 'minimal':
      return new MergeMinimalCompactor(config);
    case 'moderate':
      return new MergeModerateCompactor(config);
    case 'aggressive':
      return new MergeAggressiveCompactor(config);
    default:
      throw new Error(`Unknown merge compaction strategy: ${strategy}`);
  }
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Token counting infrastructure + basic strategies

**Tasks**:
- ✅ Task 1.1: Implement token counting infrastructure
  - Create `packages/reg-intel-core/src/tokens/`
  - Implement `TiktokenCounter` with caching
  - Add character-based fallback estimator
  - Write comprehensive tests (15+ test cases)

- ✅ Task 1.2: Core compaction interfaces
  - Create `packages/reg-intel-conversations/src/compaction/types.ts`
  - Define `CompactionContext`, `CompactionResult`, `MessageCompactor`
  - Implement utility functions (deduplication, merging, etc.)

- ✅ Task 1.3: Basic path strategies (none, sliding_window)
  - Implement `NoneCompactor`
  - Implement `SlidingWindowCompactor`
  - Add tests for both

- ✅ Task 1.4: Basic merge strategies (none, minimal)
  - Implement `MergeNoneCompactor`
  - Implement `MergeMinimalCompactor` (deduplication)
  - Add tests for both

**Deliverables**:
- Token counting working end-to-end
- 4 basic compaction strategies implemented
- 30+ tests passing

### Phase 2: LLM-Based Strategies (Week 2)

**Goal**: Semantic and advanced compaction strategies

**Tasks**:
- ✅ Task 2.1: Semantic path compaction
  - Implement `SemanticCompactor`
  - Add LLM-based importance scoring
  - Test with various message types

- ✅ Task 2.2: Hybrid path compaction
  - Implement `HybridCompactor`
  - Compose sliding window + semantic
  - Verify both strategies apply correctly

- ✅ Task 2.3: Moderate merge compaction
  - Implement `MergeModerateCompactor`
  - Add redundancy detection
  - Add pinned message context preservation

- ✅ Task 2.4: Aggressive merge compaction
  - Implement `MergeAggressiveCompactor`
  - Add outcome extraction logic
  - Test extreme compaction scenarios

**Deliverables**:
- All 8 compaction strategies implemented
- LLM integration working
- 50+ tests passing

### Phase 3: Integration (Week 3)

**Goal**: Wire compaction into path and merge flows

**Tasks**:
- ✅ Task 3.1: Path store integration
  - Add `compactPath()` method to path store
  - Add `shouldCompactPath()` logic
  - Implement auto-compaction triggers

- ✅ Task 3.2: Merge flow integration
  - Update `mergePath()` to call compaction
  - Add configuration overrides
  - Handle errors gracefully

- ✅ Task 3.3: API route updates
  - Add `/api/conversations/:id/paths/:pathId/compact` endpoint
  - Update merge endpoint to accept compaction options
  - Add SSE events for compaction progress

- ✅ Task 3.4: Integration tests
  - Test full merge with compaction
  - Test auto-compaction triggers
  - Test configuration inheritance

**Deliverables**:
- Compaction wired into all flows
- API endpoints working
- 20+ integration tests

### Phase 4: UI & Polish (Week 4)

**Goal**: User-facing features and optimization

**Tasks**:
- ✅ Task 4.1: Token count display
  - Show current token count in path toolbar
  - Add token budget indicators
  - Display compaction savings

- ✅ Task 4.2: Compaction configuration UI
  - Add strategy selector to MergeDialog
  - Add compaction preview
  - Show before/after token counts

- ✅ Task 4.3: Manual compaction trigger
  - Add "Compact Path" button to path menu
  - Show compaction progress
  - Display results summary

- ✅ Task 4.4: Performance optimization
  - Add batch token counting
  - Optimize LLM calls (batch scoring)
  - Cache compaction results

**Deliverables**:
- Full UI for compaction features
- Performance optimized
- User documentation

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Token Counting** (15+ tests):
```typescript
describe('TokenCounter', () => {
  it('should count tokens with tiktoken');
  it('should cache token counts');
  it('should fall back to character estimation');
  it('should estimate message tokens with overhead');
  it('should estimate context tokens for multiple messages');
  it('should handle empty strings');
  it('should handle very long texts');
  it('should clear cache');
  // ... more
});
```

**Path Compaction** (30+ tests):
```typescript
describe('Path Compaction Strategies', () => {
  describe('NoneCompactor', () => {
    it('should return all messages unchanged');
    it('should preserve pinned messages');
  });

  describe('SlidingWindowCompactor', () => {
    it('should keep last N messages');
    it('should preserve pinned messages outside window');
    it('should summarize old messages when configured');
    it('should handle window larger than message count');
    it('should respect token budget');
  });

  describe('SemanticCompactor', () => {
    it('should score messages by importance');
    it('should keep high-importance messages');
    it('should preserve pinned messages');
    it('should apply token budget');
    it('should handle scoring errors gracefully');
  });

  describe('HybridCompactor', () => {
    it('should combine sliding window and semantic');
    it('should keep recent messages always');
    it('should apply semantic filtering to old messages');
    it('should preserve pinned messages');
  });
});
```

**Merge Compaction** (30+ tests):
```typescript
describe('Merge Compaction Strategies', () => {
  describe('MergeNoneCompactor', () => {
    it('should copy all messages');
  });

  describe('MergeMinimalCompactor', () => {
    it('should remove duplicate messages');
    it('should preserve pinned duplicates');
    it('should maintain message order');
  });

  describe('MergeModerateCompactor', () => {
    it('should identify redundant exchanges');
    it('should summarize redundant content');
    it('should preserve important messages');
    it('should add context to pinned messages');
  });

  describe('MergeAggressiveCompactor', () => {
    it('should extract only outcomes');
    it('should preserve pinned messages');
    it('should achieve high compression ratio');
  });
});
```

### 8.2 Integration Tests

**Path Store Integration** (15+ tests):
```typescript
describe('Path Store Compaction', () => {
  it('should compact path when requested');
  it('should detect when path needs compaction');
  it('should auto-compact when threshold exceeded');
  it('should preserve pinned messages through compaction');
  it('should update message sequences after compaction');
  it('should handle compaction errors gracefully');
  it('should respect configuration settings');
  // ... more
});
```

**Merge Flow Integration** (15+ tests):
```typescript
describe('Merge with Compaction', () => {
  it('should apply compaction for full merge');
  it('should skip compaction when disabled');
  it('should use configured compression strategy');
  it('should allow strategy override');
  it('should preserve pinned messages in merge');
  it('should handle large merges efficiently');
  it('should emit SSE events for compaction progress');
  // ... more
});
```

### 8.3 End-to-End Tests

**User Workflows** (10+ tests):
```typescript
describe('Compaction E2E', () => {
  it('should compact large path automatically');
  it('should show token counts in UI');
  it('should allow manual compaction trigger');
  it('should preview compaction before applying');
  it('should merge branch with compaction');
  it('should configure compaction strategy');
  it('should preserve pinned messages through multiple operations');
  // ... more
});
```

### 8.4 Performance Tests

**Benchmarks**:
```typescript
describe('Compaction Performance', () => {
  it('should count tokens for 100 messages in < 100ms');
  it('should compact 500 messages in < 5s');
  it('should handle 1000+ message paths');
  it('should batch LLM calls efficiently');
  it('should cache token counts effectively');
});
```

---

## 9. Configuration & Defaults

### 9.1 Updated Default Configuration

```typescript
// packages/reg-intel-conversations/src/conversationConfig.ts

export const DEFAULT_CONFIG: Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt'> = {
  // Merge compression
  mergeCompressionStrategy: 'moderate',  // Changed from unused value
  mergeMaxMessages: 100,
  mergePreservePinned: true,

  // Path compression
  pathCompressionStrategy: 'sliding_window',  // Changed from unused value
  pathMaxMessages: 200,                       // Trigger compaction at 200 messages
  pathSlidingWindowSize: 50,                  // Keep last 50 messages
  pathCompressionThreshold: 0.5,              // Semantic importance threshold

  // Auto-compaction
  autoCompactEnabled: true,                   // NEW: Enable auto-compaction
  compactionIntervalMinutes: 60,              // NEW: Run compaction check hourly

  // NEW: Token budgets
  pathMaxTokens: 100000,                      // ~100k tokens max per path
  mergeMaxTokens: 50000,                      // ~50k tokens max for merge
};
```

### 9.2 Configuration Overrides

Users can override at three levels:
1. **Global** - applies to all tenants
2. **Tenant** - applies to specific tenant
3. **User** - applies to specific user within tenant

Example:
```typescript
// Set tenant-level config
await configStore.setTenantConfig({
  tenantId: 'acme-corp',
  config: {
    mergeCompressionStrategy: 'aggressive',  // More aggressive for this tenant
    pathSlidingWindowSize: 30,               // Smaller window
    autoCompactEnabled: true,
  },
});

// Set user-level config
await configStore.setUserConfig({
  tenantId: 'acme-corp',
  userId: 'user-123',
  config: {
    pathCompressionStrategy: 'hybrid',  // User preference
  },
});
```

---

## 10. UI/UX Considerations

### 10.1 Token Count Display

Add token indicators to path toolbar:

```tsx
// apps/demo-web/src/components/PathToolbar.tsx

<div className="token-indicator">
  <Gauge size={16} />
  <span>{formatTokens(currentTokens)} / {formatTokens(maxTokens)}</span>
  {compressionAvailable && (
    <Button size="sm" onClick={handleCompact}>
      Compact ({estimatedSavings} tokens)
    </Button>
  )}
</div>
```

### 10.2 Merge Dialog Enhancement

Add compaction options to merge dialog:

```tsx
// apps/demo-web/src/components/MergeDialog.tsx

{mergeMode === 'full' && (
  <div className="compaction-options">
    <h4>Compaction Strategy</h4>
    <RadioGroup value={compressionStrategy} onChange={setCompressionStrategy}>
      <Radio value="none">
        None - Copy all messages ({estimatedTokens} tokens)
      </Radio>
      <Radio value="minimal">
        Minimal - Remove duplicates ({estimatedTokensMinimal} tokens)
      </Radio>
      <Radio value="moderate" recommended>
        Moderate - Summarize redundant content ({estimatedTokensModerate} tokens)
      </Radio>
      <Radio value="aggressive">
        Aggressive - Outcomes only ({estimatedTokensAggressive} tokens)
      </Radio>
    </RadioGroup>

    <div className="savings-preview">
      Estimated savings: {estimatedSavings} tokens ({reductionPercent}%)
    </div>
  </div>
)}
```

### 10.3 Manual Compaction UI

Add path menu item:

```tsx
// apps/demo-web/src/components/PathMenu.tsx

<DropdownMenuItem onClick={handleCompactPath}>
  <Zap size={16} />
  Compact Path
  {shouldCompact && <Badge variant="warning">Recommended</Badge>}
</DropdownMenuItem>
```

Compaction progress dialog:

```tsx
<Dialog open={isCompacting}>
  <DialogTitle>Compacting Path...</DialogTitle>
  <DialogContent>
    <Progress value={progress} />
    <div className="compaction-stats">
      <div>Messages: {messagesBefore} → {messagesAfter}</div>
      <div>Tokens: {tokensBefore} → {tokensAfter}</div>
      <div>Reduction: {reductionPercent}%</div>
    </div>
  </DialogContent>
</Dialog>
```

---

## 11. Performance & Scalability

### 11.1 Token Counting Optimization

**Challenge**: Counting tokens for large paths (500+ messages) can be slow.

**Solutions**:
1. **Caching**: Cache token counts per message content hash
2. **Batch Processing**: Count multiple messages in parallel
3. **Incremental Updates**: Only count new messages, cache previous totals
4. **Lazy Loading**: Only count visible messages initially

```typescript
class OptimizedTokenCounter {
  private cache = new LRUCache<string, number>(1000);

  async estimateContextTokensBatch(
    messages: ConversationMessage[]
  ): Promise<TokenEstimate> {
    // Process in batches of 50
    const BATCH_SIZE = 50;
    const batches = chunk(messages, BATCH_SIZE);

    const results = await Promise.all(
      batches.map(batch => this.processBatch(batch))
    );

    const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

    return {
      tokens: totalTokens,
      method: 'tiktoken',
      isExact: true,
    };
  }
}
```

### 11.2 LLM Call Optimization

**Challenge**: Semantic strategies require LLM calls for scoring.

**Solutions**:
1. **Batch Scoring**: Score multiple messages in one LLM call
2. **Caching**: Cache importance scores for message content hashes
3. **Parallel Calls**: Use multiple LLM requests concurrently
4. **Smart Sampling**: Score representative samples, interpolate others

```typescript
class SemanticCompactor {
  private async scoreMessagesBatch(
    messages: ConversationMessage[],
    llmRouter: LlmRouter
  ): Promise<number[]> {
    // Batch messages into single prompt
    const BATCH_SIZE = 20;
    const batches = chunk(messages, BATCH_SIZE);

    const allScores = await Promise.all(
      batches.map(batch => this.scoreSingleBatch(batch, llmRouter))
    );

    return allScores.flat();
  }
}
```

### 11.3 Database Performance

**Challenge**: Replacing messages for a path requires transaction.

**Solutions**:
1. **Soft Compaction**: Mark messages as compacted, don't delete
2. **Incremental Compaction**: Compact in chunks, not all at once
3. **Background Jobs**: Queue large compactions for async processing

```typescript
async replacePathMessages(
  pathId: string,
  messages: ConversationMessage[]
): Promise<void> {
  // Use transaction for atomicity
  await this.supabase.rpc('replace_path_messages', {
    p_path_id: pathId,
    p_messages: messages,
  });
}

// PostgreSQL function (atomic operation)
CREATE OR REPLACE FUNCTION replace_path_messages(
  p_path_id uuid,
  p_messages jsonb[]
)
RETURNS void AS $$
BEGIN
  -- Soft delete old messages
  UPDATE conversation_messages
  SET deleted_at = now()
  WHERE path_id = p_path_id AND deleted_at IS NULL;

  -- Insert new messages
  INSERT INTO conversation_messages (...)
  SELECT ... FROM unnest(p_messages);
END;
$$ LANGUAGE plpgsql;
```

---

## 12. Migration & Rollout

### 12.1 Phased Rollout Plan

**Week 1: Internal Testing**
- Deploy to staging environment
- Test all 8 strategies manually
- Verify token counting accuracy
- Check performance with large paths

**Week 2: Beta Users (10%)**
- Enable for 10% of users
- Monitor error rates and performance
- Collect feedback on UI
- Fine-tune default configurations

**Week 3: Gradual Rollout (50%)**
- Enable for 50% of users
- Monitor token savings metrics
- Track LLM API costs (should decrease)
- Adjust auto-compaction thresholds

**Week 4: Full Rollout (100%)**
- Enable for all users
- Monitor system-wide metrics
- Publish user documentation
- Celebrate launch! 🎉

### 12.2 Feature Flags

```typescript
// Use feature flags for gradual rollout
const COMPACTION_FLAGS = {
  enableTokenCounting: true,
  enablePathCompaction: true,
  enableMergeCompaction: true,
  enableAutoCompaction: false,  // Start disabled, enable gradually
  enableSemanticStrategies: false,  // Start with simple strategies only
  enableUI: false,  // Hide UI initially
};

// Check flag before compacting
if (COMPACTION_FLAGS.enableAutoCompaction && shouldCompact) {
  await pathStore.compactPath({ ... });
}
```

### 12.3 Monitoring & Metrics

**Key Metrics to Track**:
```typescript
// Track compaction effectiveness
metrics.recordCompaction({
  strategy: 'sliding_window',
  tokensBefore: 85000,
  tokensAfter: 42000,
  reductionPercent: 50.6,
  messagesRemoved: 87,
  durationMs: 1234,
});

// Track token budget health
metrics.recordTokenBudget({
  pathId: 'abc',
  currentTokens: 95000,
  maxTokens: 100000,
  utilizationPercent: 95,
  needsCompaction: true,
});

// Track LLM costs (should decrease)
metrics.recordLLMCost({
  endpoint: '/api/chat',
  tokensUsed: 3500,
  estimatedCostUSD: 0.035,
});
```

### 12.4 Rollback Plan

If issues arise:
1. **Disable auto-compaction** - set `autoCompactEnabled: false` globally
2. **Revert to simple strategies** - set all strategies to `none` or `minimal`
3. **Disable UI features** - hide compaction buttons/indicators
4. **Monitor recovery** - ensure system stabilizes
5. **Investigate and fix** - address root cause
6. **Resume rollout** - restart from beta phase

---

## Appendix A: File Structure

```
packages/
├── reg-intel-core/
│   └── src/
│       └── tokens/
│           ├── tokenCounter.ts       # Main exports & factory
│           ├── tiktoken.ts          # Tiktoken implementation
│           ├── estimators.ts        # Fallback estimators
│           ├── cache.ts             # Token count caching
│           └── __tests__/
│               ├── tokenCounter.test.ts
│               └── estimators.test.ts
│
└── reg-intel-conversations/
    └── src/
        ├── conversationConfig.ts     # Updated with new defaults
        ├── conversationStores.ts     # Updated with compaction methods
        └── compaction/
            ├── types.ts              # Core interfaces
            ├── utils.ts              # Utility functions
            ├── pathCompaction.ts     # Factory for path strategies
            ├── mergeCompaction.ts    # Factory for merge strategies
            ├── path/
            │   ├── NoneCompactor.ts
            │   ├── SlidingWindowCompactor.ts
            │   ├── SemanticCompactor.ts
            │   └── HybridCompactor.ts
            ├── merge/
            │   ├── NoneCompactor.ts
            │   ├── MinimalCompactor.ts
            │   ├── ModerateCompactor.ts
            │   └── AggressiveCompactor.ts
            └── __tests__/
                ├── path/
                │   ├── NoneCompactor.test.ts
                │   ├── SlidingWindowCompactor.test.ts
                │   ├── SemanticCompactor.test.ts
                │   └── HybridCompactor.test.ts
                ├── merge/
                │   ├── NoneCompactor.test.ts
                │   ├── MinimalCompactor.test.ts
                │   ├── ModerateCompactor.test.ts
                │   └── AggressiveCompactor.test.ts
                └── integration/
                    ├── pathStore.test.ts
                    └── mergeFlow.test.ts
```

---

## Appendix B: Dependencies

**New Dependencies**:
```json
{
  "dependencies": {
    "@dqbd/tiktoken": "^1.0.15"  // For GPT token counting
  }
}
```

**Existing Dependencies** (already in project):
- `@acme/reg-intel-llm` - For LLM router
- `@acme/reg-intel-conversations` - For path stores

---

## Appendix C: Success Metrics

After full implementation, we should see:

**Quantitative Metrics**:
- ✅ 0 token limit exceeded errors (down from current levels)
- ✅ 50%+ reduction in context size for large branches
- ✅ 30%+ reduction in LLM API costs
- ✅ 100% pinned message preservation rate
- ✅ <5s compaction time for 500 message paths
- ✅ 95%+ test coverage for compaction code

**Qualitative Metrics**:
- ✅ Improved response quality (less context bloat)
- ✅ Better user control over context size
- ✅ Clear visibility into token usage
- ✅ Smooth merge experience for large branches

---

## Conclusion

This implementation plan provides a **comprehensive, unified approach** to implementing all 8 compaction strategies (4 path + 4 merge) with:

✅ **Consistent Architecture** - Shared interfaces, utilities, and patterns
✅ **Pinned Message Preservation** - Built into every strategy
✅ **Token Counting Foundation** - Accurate measurement infrastructure
✅ **LLM Integration** - Semantic strategies for intelligent compaction
✅ **Comprehensive Testing** - 100+ tests across all layers
✅ **Gradual Rollout** - Safe, monitored deployment
✅ **Performance Optimized** - Caching, batching, parallelization
✅ **UI/UX Considered** - User-facing features designed

**Estimated Timeline**: 4 weeks for complete implementation

**Next Steps**:
1. Review and approve this plan
2. Begin Phase 1 (Token Counting Infrastructure)
3. Iterate through phases with testing at each step
4. Deploy and monitor

---

**Document Version**: 1.0
**Last Updated**: 2025-12-30
**Author**: Claude Code
**Status**: 🟢 Ready for Implementation
