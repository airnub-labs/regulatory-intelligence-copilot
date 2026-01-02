/**
 * Compaction Snapshots API
 *
 * List compaction snapshots for a conversation.
 *
 * GET /api/conversations/:conversationId/compact/snapshots?limit=10
 *
 * Response:
 * {
 *   "snapshots": [
 *     {
 *       "id": "snapshot-conv-123-1234567890",
 *       "conversationId": "conv-123",
 *       "createdAt": "2024-01-15T10:30:00Z",
 *       "strategy": "semantic",
 *       "tokensBefore": 125000,
 *       "messageCount": 150,
 *       "expiresAt": "2024-01-16T10:30:00Z"
 *     }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { conversationStore } from '@/lib/server/conversations';
import { getSnapshotServiceIfInitialized } from '@reg-copilot/reg-intel-conversations/compaction';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';

export const dynamic = 'force-dynamic';

const logger = createLogger('CompactionSnapshotsRoute');

interface SnapshotSummary {
  id: string;
  conversationId: string;
  pathId?: string;
  createdAt: string;
  strategy: string;
  tokensBefore: number;
  messageCount: number;
  expiresAt: string;
  isValid: boolean;
  compactionResult?: {
    tokensAfter: number;
    messagesRemoved: number;
    compressionRatio: number;
  };
}

export async function GET(
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
        'api.conversations.compact.snapshots.get',
        {
          'app.route': '/api/conversations/[id]/compact/snapshots',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
        },
        async () => {
          try {
            const url = new URL(request.url);
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);

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
              logger.info('Snapshot service not initialized');
              return NextResponse.json({
                conversationId,
                snapshots: [],
                message: 'Snapshot service not initialized. Call initializeCompactionSystem() on startup.',
              });
            }

            // List snapshots for this conversation
            const snapshots = await snapshotService.listSnapshots(conversationId, limit);

            const snapshotSummaries: SnapshotSummary[] = snapshots.map(s => ({
              id: s.id,
              conversationId: s.conversationId,
              pathId: s.pathId,
              createdAt: s.createdAt.toISOString(),
              strategy: s.strategy,
              tokensBefore: s.tokensBefore,
              messageCount: s.messages.length,
              expiresAt: s.expiresAt.toISOString(),
              isValid: s.expiresAt > new Date(),
              compactionResult: s.compactionResult
                ? {
                    tokensAfter: s.compactionResult.tokensAfter,
                    messagesRemoved: s.compactionResult.messagesRemoved,
                    compressionRatio:
                      s.tokensBefore > 0
                        ? s.compactionResult.tokensAfter / s.tokensBefore
                        : 1,
                  }
                : undefined,
            }));

            logger.info({
              conversationId,
              snapshotCount: snapshotSummaries.length,
            }, 'Snapshots retrieved');

            return NextResponse.json({
              conversationId,
              snapshots: snapshotSummaries,
            });
          } catch (error) {
            logger.error({
              conversationId,
              error: error instanceof Error ? error.message : String(error),
            }, 'Snapshots API error');

            return NextResponse.json(
              { error: error instanceof Error ? error.message : 'Internal server error' },
              { status: 500 }
            );
          }
        }
      )
  );
}
