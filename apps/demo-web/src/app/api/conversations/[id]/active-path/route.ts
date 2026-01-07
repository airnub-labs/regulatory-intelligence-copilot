import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const logger = createLogger('ActivePathRoute');

/**
 * GET /api/conversations/[id]/active-path
 * Get the currently active path for a conversation
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.active-path.get',
        {
          'app.route': '/api/conversations/[id]/active-path',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
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

          const activePath = await conversationPathStore.getActivePath({
            tenantId,
            conversationId,
          });

          if (!activePath) {
            // Create primary path if none exists
            logger.info({ tenantId, conversationId }, 'Creating primary path for conversation');
            const primaryPath = await conversationPathStore.ensurePrimaryPath({
              tenantId,
              conversationId,
            });

            logger.info({ tenantId, conversationId, pathId: primaryPath.id }, 'Primary path created and returned');
            return NextResponse.json({
              path: toClientPath(primaryPath),
            });
          }

          logger.info({ tenantId, conversationId, pathId: activePath.id }, 'Retrieved active path');
          return NextResponse.json({
            path: toClientPath(activePath),
          });
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId }, 'Error in GET active-path');
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
 * PUT /api/conversations/[id]/active-path
 * Set the active path for a conversation
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.active-path.put',
        {
          'app.route': '/api/conversations/[id]/active-path',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
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

          const body = await request.json().catch(() => null);
          if (!body) {
            logger.warn({ tenantId, conversationId }, 'Invalid request body');
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
          }

          const { pathId } = body;

          if (!pathId || typeof pathId !== 'string') {
            logger.warn({ tenantId, conversationId }, 'pathId is required');
            return NextResponse.json({ error: 'pathId is required' }, { status: 400 });
          }

          // Verify path exists and belongs to conversation
          const path = await conversationPathStore.getPath({ tenantId, pathId });

          if (!path || path.conversationId !== conversationId) {
            logger.warn({ tenantId, conversationId, pathId }, 'Path not found or does not belong to conversation');
            return NextResponse.json({ error: 'Path not found' }, { status: 404 });
          }

          try {
            await conversationPathStore.setActivePath({
              tenantId,
              conversationId,
              pathId,
            });

            logger.info({ tenantId, conversationId, pathId }, 'Active path updated successfully');
            return NextResponse.json({
              path: toClientPath(path),
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, pathId, error }, 'Failed to set active path');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId }, 'Error in PUT active-path');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
