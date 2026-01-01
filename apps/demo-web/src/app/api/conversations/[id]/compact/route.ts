/**
 * Manual Compaction API
 *
 * Manually trigger compaction for a conversation.
 *
 * POST /api/conversations/:conversationId/compact
 * {
 *   "strategy": "semantic",
 *   "tokenThreshold": 100000,
 *   "pathId": "main" // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "messagesBefore": 150,
 *     "messagesAfter": 75,
 *     "tokensBefore": 120000,
 *     "tokensAfter": 58000,
 *     "messagesRemoved": 75,
 *     "messagesSummarized": 0,
 *     "strategy": "semantic",
 *     "durationMs": 2341
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { type PathCompactionStrategy } from '@reg-copilot/reg-intel-conversations/compaction';

interface CompactRequest {
  strategy?: PathCompactionStrategy;
  tokenThreshold?: number;
  pathId?: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: conversationId } = await context.params;
    const body = (await request.json()) as CompactRequest;

    // Get messages from conversation store
    // NOTE: In production, you'd fetch from your actual conversation store
    // For now, we'll return an error indicating the store needs to be configured

    // This is a placeholder - integrate with your actual conversation store:
    // const store = getConversationStore();
    // const messages = await store.getMessages({
    //   tenantId: 'tenant-id',
    //   conversationId,
    //   userId: 'user-id'
    // });

    return NextResponse.json({
      error: 'Conversation store integration required',
      message: 'Please configure conversation store before using manual compaction',
      example: {
        success: true,
        result: {
          messagesBefore: 150,
          messagesAfter: 75,
          tokensBefore: 120000,
          tokensAfter: 58000,
          messagesRemoved: 75,
          messagesSummarized: 0,
          pinnedPreserved: 5,
          strategy: body.strategy ?? 'sliding_window',
          durationMs: 2341,
        },
      },
      conversationId,
    }, { status: 501 }); // Not Implemented

    // Production implementation:
    /*
    const config: CompactionWrapperConfig = {
      enabled: true,
      strategy: body.strategy ?? 'sliding_window',
      tokenThreshold: body.tokenThreshold ?? 100_000,
      model: 'gpt-4',
      llmClient: getLlmRouter(), // Get your LLM client
    };

    const startTime = Date.now();
    const messagesBefore = messages.length;
    const compactedMessages = await compactMessages(messages, config);
    const messagesAfter = compactedMessages.length;

    // Optionally save compacted messages back to store
    // await store.saveMessages(conversationId, compactedMessages);

    return NextResponse.json({
      success: true,
      result: {
        messagesBefore,
        messagesAfter,
        tokensBefore: messages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
        tokensAfter: compactedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
        messagesRemoved: messagesBefore - messagesAfter,
        messagesSummarized: 0, // Would come from compaction result
        pinnedPreserved: 0, // Would come from compaction result
        strategy: config.strategy,
        durationMs: Date.now() - startTime,
      },
    });
    */
  } catch (error) {
    console.error('Manual compaction API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
