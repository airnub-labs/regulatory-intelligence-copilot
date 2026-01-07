import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { conversationPathStore, conversationStore, conversationEventHub } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const logger = createLogger('MessagePinRoute');

/**
 * POST /api/conversations/[id]/messages/[messageId]/pin
 * Pin a message to prevent compaction
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id: conversationId, messageId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.message.pin.post',
        {
          'app.route': '/api/conversations/[id]/messages/[messageId]/pin',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.message.id': messageId,
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

          try {
            await conversationPathStore.pinMessage({
              tenantId,
              conversationId,
              messageId,
              userId,
            });

            // Broadcast SSE event for pin state change
            conversationEventHub.broadcast(tenantId, conversationId, 'message:pinned', {
              messageId,
              pinnedBy: userId,
              pinnedAt: new Date().toISOString(),
            });

            logger.info({ tenantId, conversationId, messageId, userId }, 'Message pinned successfully');

            return NextResponse.json({
              success: true,
              messageId,
              isPinned: true,
              pinnedBy: userId,
              pinnedAt: new Date().toISOString(),
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, messageId, error }, 'Failed to pin message');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, messageId }, 'Error in POST pin');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[id]/messages/[messageId]/pin
 * Unpin a message
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id: conversationId, messageId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.message.pin.delete',
        {
          'app.route': '/api/conversations/[id]/messages/[messageId]/pin',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.message.id': messageId,
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

          try {
            await conversationPathStore.unpinMessage({
              tenantId,
              conversationId,
              messageId,
            });

            // Broadcast SSE event for unpin state change
            conversationEventHub.broadcast(tenantId, conversationId, 'message:unpinned', {
              messageId,
            });

            logger.info({ tenantId, conversationId, messageId }, 'Message unpinned successfully');

            return NextResponse.json({
              success: true,
              messageId,
              isPinned: false,
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, messageId, error }, 'Failed to unpin message');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, messageId }, 'Error in DELETE pin');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
