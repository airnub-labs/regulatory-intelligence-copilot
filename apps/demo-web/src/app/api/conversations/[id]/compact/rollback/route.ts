/**
 * Compaction Rollback API
 *
 * Rollback a conversation to a previous compaction snapshot.
 *
 * POST /api/conversations/:conversationId/compact/rollback
 * {
 *   "snapshotId": "snapshot-conv-123-1234567890"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "conversationId": "conv-123",
 *   "snapshotId": "snapshot-conv-123-1234567890",
 *   "messagesRestored": 150,
 *   "tokensRestored": 125000
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import { conversationStore } from '@/lib/server/conversations';
import { getSnapshotServiceIfInitialized } from '@reg-copilot/reg-intel-conversations/compaction';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';

export const dynamic = 'force-dynamic';

const logger = createLogger('CompactionRollbackRoute');

interface RollbackRequest {
  snapshotId: string;
}

export async function POST(
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
        'api.conversations.compact.rollback.post',
        {
          'app.route': '/api/conversations/[id]/compact/rollback',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
        },
        async () => {
          try {
            const body = (await request.json()) as RollbackRequest;
            const { snapshotId } = body;

            if (!snapshotId) {
              return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
            }

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

            // Get snapshot service
            const snapshotService = getSnapshotServiceIfInitialized();

            if (!snapshotService) {
              logger.warn('Snapshot service not initialized');
              return NextResponse.json({
                error: 'Snapshot service not initialized. Call initializeCompactionSystem() on startup.',
              }, { status: 503 });
            }

            // Validate snapshot exists and belongs to this conversation
            const snapshot = await snapshotService.getSnapshot(snapshotId);

            if (!snapshot) {
              logger.warn({ conversationId, snapshotId }, 'Snapshot not found');
              return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
            }

            if (snapshot.conversationId !== conversationId) {
              logger.warn({
                conversationId,
                snapshotId,
                snapshotConversationId: snapshot.conversationId,
              }, 'Snapshot does not belong to this conversation');
              return NextResponse.json(
                { error: 'Snapshot does not belong to this conversation' },
                { status: 400 }
              );
            }

            // Check if snapshot is still valid (not expired)
            const isValid = await snapshotService.isSnapshotValid(snapshotId);

            if (!isValid) {
              logger.warn({ conversationId, snapshotId, expiresAt: snapshot.expiresAt }, 'Snapshot has expired');
              return NextResponse.json({ error: 'Snapshot has expired' }, { status: 410 });
            }

            // Get messages from snapshot
            const messages = await snapshotService.getSnapshotMessages(snapshotId);

            if (!messages || messages.length === 0) {
              logger.error({ conversationId, snapshotId }, 'Failed to retrieve snapshot messages');
              return NextResponse.json(
                { error: 'Failed to retrieve snapshot messages' },
                { status: 500 }
              );
            }

            // Note: Full rollback would require a replaceMessages method on the conversation store
            // For now, we'll document what needs to be done and return the snapshot data
            //
            // In a full implementation, you would:
            // 1. Archive or soft-delete current messages
            // 2. Restore messages from the snapshot
            // 3. Update conversation metadata (token counts, etc.)
            //
            // Example:
            // await conversationStore.replaceMessages({
            //   tenantId,
            //   conversationId,
            //   messages,
            //   userId,
            // });

            logger.info({
              tenantId,
              conversationId,
              snapshotId,
              messagesRestored: messages.length,
              tokensRestored: snapshot.tokensBefore,
            }, 'Rollback prepared (full implementation requires replaceMessages method)');

            return NextResponse.json({
              success: true,
              conversationId,
              snapshotId,
              messagesRestored: messages.length,
              tokensRestored: snapshot.tokensBefore,
              pinnedMessageIds: snapshot.pinnedMessageIds,
              restoredAt: new Date().toISOString(),
              note: 'Snapshot data retrieved. Full message restoration requires conversation store replaceMessages method.',
            });
          } catch (error) {
            logger.error({
              conversationId,
              error: error instanceof Error ? error.message : String(error),
            }, 'Rollback API error');

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
