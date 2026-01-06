/**
 * Compaction Status API
 *
 * Check if a conversation needs compaction.
 *
 * GET /api/conversations/:conversationId/compact/status?pathId=uuid
 *
 * Response:
 * {
 *   "needsCompaction": true,
 *   "currentTokens": 125000,
 *   "threshold": 100000,
 *   "messageCount": 150,
 *   "pinnedCount": 5,
 *   "estimatedSavings": 62500,
 *   "estimatedSavingsPercent": 50,
 *   "recommendedStrategy": "semantic"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import { conversationStore, conversationPathStore } from '@/lib/server/conversations';
import { PathCompactionService, type PathCompactionStrategy } from '@reg-copilot/reg-intel-conversations/compaction';
import { countTokensForMessages } from '@reg-copilot/reg-intel-core';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';

export const dynamic = 'force-dynamic';

const logger = createLogger('CompactionStatusRoute');

const DEFAULT_TOKEN_THRESHOLD = 100_000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: conversationId } = await context.params;

  try {
    const session = await getServerSession(authOptions);
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.compact.status.get',
        {
          'app.route': '/api/conversations/[id]/compact/status',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
        },
        async () => {
          try {
            const url = new URL(request.url);
            const requestedPathId = url.searchParams.get('pathId');
            const tokenThreshold = parseInt(url.searchParams.get('threshold') || String(DEFAULT_TOKEN_THRESHOLD), 10);

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

            const pathId = requestedPathId ?? conversation.activePathId;

            // Fetch messages for the conversation
            const messages = await conversationStore.getMessages({
              tenantId,
              conversationId,
              userId,
            });

            if (!messages || messages.length === 0) {
              return NextResponse.json({
                needsCompaction: false,
                currentTokens: 0,
                threshold: tokenThreshold,
                messageCount: 0,
                pinnedCount: 0,
                estimatedSavings: 0,
                estimatedSavingsPercent: 0,
                recommendedStrategy: 'none',
                conversationId,
                pathId,
              });
            }

            // Get pinned messages
            let pinnedCount = 0;
            try {
              if (pathId) {
                const pinnedMessages = await conversationPathStore.getPinnedMessages({
                  tenantId,
                  conversationId,
                  pathId,
                });
                pinnedCount = pinnedMessages.length;
              }
            } catch {
              // Pinned messages retrieval failed - continue with count of 0
            }

            const pinnedMessageIds = new Set<string>();

            // Count current tokens
            const currentTokens = await countTokensForMessages(messages, 'gpt-4');

            // Initialize compaction service to check if compaction is needed
            const compactionService = new PathCompactionService({
              tokenThreshold,
              targetTokens: tokenThreshold * 0.8,
              strategy: 'sliding_window',
              model: 'gpt-4',
            });

            const needsCompaction = await compactionService.needsCompaction(messages, pinnedMessageIds);

            // Estimate savings (roughly 50% for sliding_window, 40% for semantic)
            const estimatedSavingsPercent = needsCompaction ? 50 : 0;
            const estimatedSavings = Math.floor(currentTokens * (estimatedSavingsPercent / 100));

            // Determine recommended strategy based on message count
            let recommendedStrategy: PathCompactionStrategy = 'sliding_window';
            if (messages.length > 200) {
              recommendedStrategy = 'semantic';
            } else if (messages.length < 20) {
              recommendedStrategy = 'none';
            }

            logger.info({
              tenantId,
              conversationId,
              pathId,
              messageCount: messages.length,
              currentTokens,
              needsCompaction,
              recommendedStrategy,
            }, 'Compaction status retrieved');

            return NextResponse.json({
              needsCompaction,
              currentTokens,
              threshold: tokenThreshold,
              messageCount: messages.length,
              pinnedCount,
              estimatedSavings,
              estimatedSavingsPercent,
              recommendedStrategy,
              conversationId,
              pathId,
            });
          } catch (error) {
            logger.error({
              conversationId,
              error: error instanceof Error ? error.message : String(error),
            }, 'Compaction status API error');

            return NextResponse.json(
              { error: error instanceof Error ? error.message : 'Internal server error' },
              { status: 500 }
            );
          }
        }
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Request failed';
    logger.error({ error }, 'Request failed');
    return NextResponse.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
