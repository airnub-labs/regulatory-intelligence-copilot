import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';

import { createLogger, requestContext, withSpan, recordBranchCreate } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const logger = createLogger('BranchRoute');

/**
 * POST /api/conversations/[id]/branch
 * Create a new branch from a specific message
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.branch.post',
        {
          'app.route': '/api/conversations/[id]/branch',
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

          const { sourceMessageId, name, description } = body;

          // Validate sourceMessageId
          if (!sourceMessageId || typeof sourceMessageId !== 'string') {
            logger.warn({ tenantId, conversationId }, 'sourceMessageId is required');
            return NextResponse.json({ error: 'sourceMessageId is required' }, { status: 400 });
          }

          // HIGH: Validate name and description to prevent injection and resource exhaustion
          if (name !== undefined && typeof name !== 'string') {
            return NextResponse.json({ error: 'name must be a string' }, { status: 400 });
          }
          if (name && name.length > 255) {
            return NextResponse.json({ error: 'name exceeds maximum length of 255 characters' }, { status: 400 });
          }
          if (description !== undefined && typeof description !== 'string') {
            return NextResponse.json({ error: 'description must be a string' }, { status: 400 });
          }
          if (description && description.length > 2000) {
            return NextResponse.json({ error: 'description exceeds maximum length of 2000 characters' }, { status: 400 });
          }

          try {
            const result = await conversationPathStore.branchFromMessage({
              tenantId,
              conversationId,
              sourceMessageId,
              userId,
              name: name ?? null,
              description: description ?? null,
            });

            logger.info(
              { tenantId, conversationId, sourceMessageId, pathId: result.path.id, name },
              'Branch created successfully',
            );

            // Record branch creation metric
            recordBranchCreate({
              method: 'api',
              conversationId,
              sourcePathId: result.path.parentPathId ?? undefined,
              fromMessageId: sourceMessageId,
            });

            return NextResponse.json({
              path: toClientPath(result.path),
              conversationId: result.conversationId,
              branchPointMessage: {
                id: result.branchPointMessage.id,
                role: result.branchPointMessage.role,
                content:
                  result.branchPointMessage.content.slice(0, 200) +
                  (result.branchPointMessage.content.length > 200 ? '...' : ''),
                isBranchPoint: result.branchPointMessage.isBranchPoint,
                branchedToPaths: result.branchPointMessage.branchedToPaths,
              },
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, sourceMessageId, error }, 'Failed to create branch');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId }, 'Error in POST branch');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
