import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const logger = createLogger('PathMessagesRoute');

/**
 * GET /api/conversations/[id]/paths/[pathId]/messages
 * Get resolved messages for a path (includes inherited messages from ancestor paths)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; pathId: string }> }
) {
  const { id: conversationId, pathId } = await context.params;

  try {
    const session = await getServerSession(authOptions);
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.path.messages.get',
        {
          'app.route': '/api/conversations/[id]/paths/[pathId]/messages',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.path.id': pathId,
        },
        async () => {
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

          // Verify path exists and belongs to conversation
          const path = await conversationPathStore.getPath({ tenantId, pathId });

          if (!path || path.conversationId !== conversationId) {
            logger.warn({ tenantId, conversationId, pathId }, 'Path not found or does not belong to conversation');
            return NextResponse.json({ error: 'Path not found' }, { status: 404 });
          }

          const searchParams = request.nextUrl.searchParams;
          const includeDeleted = searchParams.get('includeDeleted') === 'true';

          // HIGH: Add bounds validation for pagination parameters to prevent resource exhaustion
          const limitParam = searchParams.get('limit');
          const offsetParam = searchParams.get('offset');
          const limit = limitParam
            ? Math.min(Math.max(1, isNaN(parseInt(limitParam, 10)) ? 1000 : parseInt(limitParam, 10)), 1000)
            : undefined;
          const offset = offsetParam
            ? Math.max(0, isNaN(parseInt(offsetParam, 10)) ? 0 : parseInt(offsetParam, 10))
            : undefined;

          try {
            const messages = await conversationPathStore.resolvePathMessages({
              tenantId,
              pathId,
              options: {
                includeDeleted,
                limit,
                offset,
              },
            });

            logger.info(
              { tenantId, conversationId, pathId, messageCount: messages.length, includeDeleted, limit, offset },
              'Retrieved path messages',
            );

            return NextResponse.json({
              messages: messages.map((msg) => ({
                id: msg.id,
                conversationId: msg.conversationId,
                pathId: msg.pathId,
                role: msg.role,
                content: msg.content,
                metadata: msg.metadata,
                sequenceInPath: msg.sequenceInPath,
                effectiveSequence: msg.effectiveSequence,
                isBranchPoint: msg.isBranchPoint,
                branchedToPaths: msg.branchedToPaths,
                messageType: msg.messageType,
                createdAt: msg.createdAt.toISOString(),
                // Pinning fields
                isPinned: msg.isPinned ?? false,
                pinnedAt: msg.pinnedAt?.toISOString() ?? null,
                pinnedBy: msg.pinnedBy ?? null,
              })),
              path: {
                id: path.id,
                name: path.name,
                isPrimary: path.isPrimary,
              },
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, pathId, error }, 'Failed to retrieve path messages');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 500 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, pathId }, 'Error in GET path messages');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
