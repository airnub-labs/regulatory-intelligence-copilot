/**
 * Single Snapshot API
 *
 * Get or delete a specific compaction snapshot.
 *
 * GET /api/conversations/:conversationId/compact/snapshots/:snapshotId
 * Response: Full snapshot details including messages
 *
 * DELETE /api/conversations/:conversationId/compact/snapshots/:snapshotId
 * Response: { success: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import { conversationStore } from '@/lib/server/conversations';
import { getSnapshotServiceIfInitialized } from '@reg-copilot/reg-intel-conversations/compaction';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';

export const dynamic = 'force-dynamic';

const logger = createLogger('SingleSnapshotRoute');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; snapshotId: string }> }
): Promise<NextResponse> {
  const { id: conversationId, snapshotId } = await context.params;

  try {
    const session = await getServerSession(authOptions);
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
      { tenantId, userId },
      () =>
        withSpan(
          'api.conversations.compact.snapshots.snapshot.get',
          {
            'app.route': '/api/conversations/[id]/compact/snapshots/[snapshotId]',
            'app.tenant.id': tenantId,
            'app.user.id': userId,
            'app.conversation.id': conversationId,
            'app.snapshot.id': snapshotId,
          },
          async () => {
            try {
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

              logger.info({
                tenantId,
                conversationId,
                snapshotId,
                messageCount: snapshot.messages.length,
              }, 'Snapshot retrieved');

              return NextResponse.json({
                snapshot: {
                  id: snapshot.id,
                  conversationId: snapshot.conversationId,
                  pathId: snapshot.pathId,
                  createdAt: snapshot.createdAt,
                  strategy: snapshot.strategy,
                  tokensBefore: snapshot.tokensBefore,
                  messageCount: snapshot.messages.length,
                  expiresAt: snapshot.expiresAt,
                  compactionResult: snapshot.compactionResult,
                  // Optionally include messages:
                  // messages: snapshot.messages,
                },
              });
            } catch (error) {
              logger.error({
                conversationId,
                snapshotId,
                error: error instanceof Error ? error.message : String(error),
              }, 'Snapshot GET API error');

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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; snapshotId: string }> }
): Promise<NextResponse> {
  const { id: conversationId, snapshotId } = await context.params;

  try {
    const session = await getServerSession(authOptions);
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
      { tenantId, userId },
      () =>
        withSpan(
          'api.conversations.compact.snapshots.snapshot.delete',
          {
            'app.route': '/api/conversations/[id]/compact/snapshots/[snapshotId]',
            'app.tenant.id': tenantId,
            'app.user.id': userId,
            'app.conversation.id': conversationId,
            'app.snapshot.id': snapshotId,
          },
          async () => {
            try {
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

              // Verify snapshot exists and belongs to conversation
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

              await snapshotService.deleteSnapshot(snapshotId);

              logger.info({
                tenantId,
                conversationId,
                snapshotId,
              }, 'Snapshot deleted');

              return NextResponse.json({
                success: true,
                snapshotId,
                deletedAt: new Date().toISOString(),
              });
            } catch (error) {
              logger.error({
                conversationId,
                snapshotId,
                error: error instanceof Error ? error.message : String(error),
              }, 'Snapshot DELETE API error');

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
