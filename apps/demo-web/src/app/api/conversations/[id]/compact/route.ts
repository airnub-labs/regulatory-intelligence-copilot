/**
 * Manual Compaction API
 *
 * Manually trigger compaction for a conversation.
 *
 * POST /api/conversations/:conversationId/compact
 * {
 *   "strategy": "semantic",
 *   "tokenThreshold": 100000,
 *   "pathId": "uuid" // optional - specific path to compact
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
 *     "pinnedPreserved": 5,
 *     "strategy": "semantic",
 *     "durationMs": 2341,
 *     "snapshotId": "snapshot-uuid-123"
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { conversationStore, conversationPathStore } from '@/lib/server/conversations';
import { PathCompactionService, type PathCompactionStrategy } from '@reg-copilot/reg-intel-conversations/compaction';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';

export const dynamic = 'force-dynamic';

const logger = createLogger('ManualCompactionRoute');

interface CompactRequest {
  strategy?: PathCompactionStrategy;
  tokenThreshold?: number;
  pathId?: string;
  createSnapshot?: boolean;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: conversationId } = await context.params;
  const session = (await getServerSession(authOptions)) as {
    user?: { id?: string; tenantId?: string };
  } | null;
  const user = session?.user;
  const userId = user?.id;

  if (!userId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';

  return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.compact.post',
        {
          'app.route': '/api/conversations/[id]/compact',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
        },
        async () => {
          try {
            const body = (await request.json()) as CompactRequest;
            const {
              strategy = 'sliding_window',
              tokenThreshold = 100_000,
              pathId: requestedPathId,
              createSnapshot = true,
            } = body;

            // Verify conversation exists and user has access
            const conversation = await conversationStore.getConversation({
              tenantId,
              conversationId,
              userId,
            });

            if (!conversation) {
              logger.warn({ tenantId, userId, conversationId }, 'Conversation not found');
              return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
            }

            // Determine which path to compact
            const pathId = requestedPathId ?? conversation.activePathId;
            if (!pathId) {
              return NextResponse.json({ error: 'No path found for conversation' }, { status: 400 });
            }

            // Fetch messages for the conversation
            const messages = await conversationStore.getMessages({
              tenantId,
              conversationId,
              userId,
            });

            if (!messages || messages.length === 0) {
              return NextResponse.json({
                success: true,
                result: {
                  messagesBefore: 0,
                  messagesAfter: 0,
                  tokensBefore: 0,
                  tokensAfter: 0,
                  messagesRemoved: 0,
                  messagesSummarized: 0,
                  pinnedPreserved: 0,
                  strategy,
                  durationMs: 0,
                },
                message: 'No messages to compact',
              });
            }

            // Get pinned messages
            const pinnedMessages = await conversationPathStore.getPinnedMessages({
              tenantId,
              conversationId,
              pathId,
            });
            const pinnedMessageIds = new Set(pinnedMessages.map(m => m.id));

            logger.info({
              tenantId,
              conversationId,
              pathId,
              messageCount: messages.length,
              pinnedCount: pinnedMessageIds.size,
              strategy,
            }, 'Starting manual compaction');

            // Initialize compaction service
            const compactionService = new PathCompactionService({
              tokenThreshold,
              targetTokens: tokenThreshold * 0.8,
              strategy,
              model: 'gpt-4',
              createSnapshots: createSnapshot,
            });

            // Check if compaction is needed
            const needsCompaction = await compactionService.needsCompaction(messages, pinnedMessageIds);
            if (!needsCompaction) {
              logger.info({
                tenantId,
                conversationId,
                messageCount: messages.length,
              }, 'Conversation does not need compaction');

              return NextResponse.json({
                success: true,
                result: {
                  messagesBefore: messages.length,
                  messagesAfter: messages.length,
                  tokensBefore: 0,
                  tokensAfter: 0,
                  messagesRemoved: 0,
                  messagesSummarized: 0,
                  pinnedPreserved: pinnedMessageIds.size,
                  strategy,
                  durationMs: 0,
                },
                message: 'Conversation does not need compaction (below token threshold)',
              });
            }

            // Perform compaction
            const startTime = Date.now();
            const result = await compactionService.compactPath(
              messages,
              pinnedMessageIds,
              conversationId,
              pathId,
              'manual'
            );

            const durationMs = Date.now() - startTime;

            if (!result.success) {
              logger.error({
                tenantId,
                conversationId,
                error: result.error,
              }, 'Compaction failed');

              return NextResponse.json({
                success: false,
                error: result.error || 'Compaction failed',
                conversationId,
                pathId,
              }, { status: 500 });
            }

            logger.info({
              tenantId,
              conversationId,
              pathId,
              tokensBefore: result.tokensBefore,
              tokensAfter: result.tokensAfter,
              messagesBefore: messages.length,
              messagesAfter: result.messages.length,
              durationMs,
              snapshotId: result.snapshotId,
            }, 'Manual compaction completed successfully');

            return NextResponse.json({
              success: true,
              result: {
                messagesBefore: messages.length,
                messagesAfter: result.messages.length,
                tokensBefore: result.tokensBefore,
                tokensAfter: result.tokensAfter,
                messagesRemoved: result.messagesRemoved,
                messagesSummarized: result.messagesSummarized ?? 0,
                pinnedPreserved: result.pinnedPreserved ?? 0,
                strategy: result.strategy,
                durationMs,
                snapshotId: result.snapshotId,
                compressionRatio: result.tokensBefore > 0
                  ? (result.tokensAfter / result.tokensBefore).toFixed(4)
                  : 1,
              },
              conversationId,
              pathId,
            });
          } catch (error) {
            logger.error({
              conversationId,
              error: error instanceof Error ? error.message : String(error),
            }, 'Manual compaction API error');

            return NextResponse.json(
              { error: error instanceof Error ? error.message : 'Internal server error' },
              { status: 500 }
            );
          }
        }
      )
  );
}
