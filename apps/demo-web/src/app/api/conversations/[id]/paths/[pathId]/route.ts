import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const logger = createLogger('PathRoute');

/**
 * GET /api/conversations/[id]/paths/[pathId]
 * Get a specific path
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; pathId: string }> }
) {
  const { id: conversationId, pathId } = await context.params;
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
        'api.conversations.path.get',
        {
          'app.route': '/api/conversations/[id]/paths/[pathId]',
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

          const path = await conversationPathStore.getPath({ tenantId, pathId });

          if (!path || path.conversationId !== conversationId) {
            logger.warn({ tenantId, conversationId, pathId }, 'Path not found or does not belong to conversation');
            return NextResponse.json({ error: 'Path not found' }, { status: 404 });
          }

          logger.info({ tenantId, conversationId, pathId }, 'Retrieved path details');
          return NextResponse.json({
            path: toClientPath(path),
          });
        },
      ),
  );
}

/**
 * PATCH /api/conversations/[id]/paths/[pathId]
 * Update a path
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; pathId: string }> }
) {
  const { id: conversationId, pathId } = await context.params;
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
        'api.conversations.path.patch',
        {
          'app.route': '/api/conversations/[id]/paths/[pathId]',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.path.id': pathId,
        },
        async () => {
          // Verify path exists and belongs to conversation
          const path = await conversationPathStore.getPath({ tenantId, pathId });

          if (!path || path.conversationId !== conversationId) {
            logger.warn({ tenantId, conversationId, pathId }, 'Path not found or does not belong to conversation');
            return NextResponse.json({ error: 'Path not found' }, { status: 404 });
          }

          const body = await request.json().catch(() => null);
          if (!body) {
            logger.warn({ tenantId, conversationId, pathId }, 'Invalid request body');
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
          }

          const { name, description, isActive } = body;

          try {
            await conversationPathStore.updatePath({
              tenantId,
              pathId,
              name: name !== undefined ? name : undefined,
              description: description !== undefined ? description : undefined,
              isActive: isActive !== undefined ? isActive : undefined,
            });

            const updatedPath = await conversationPathStore.getPath({ tenantId, pathId });

            logger.info({ tenantId, conversationId, pathId, name, isActive }, 'Path updated successfully');

            return NextResponse.json({
              path: updatedPath ? toClientPath(updatedPath) : null,
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, pathId, error }, 'Failed to update path');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
  );
}

/**
 * DELETE /api/conversations/[id]/paths/[pathId]
 * Delete or archive a path
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; pathId: string }> }
) {
  const { id: conversationId, pathId } = await context.params;
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
        'api.conversations.path.delete',
        {
          'app.route': '/api/conversations/[id]/paths/[pathId]',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.path.id': pathId,
        },
        async () => {
          // Verify path exists and belongs to conversation
          const path = await conversationPathStore.getPath({ tenantId, pathId });

          if (!path || path.conversationId !== conversationId) {
            logger.warn({ tenantId, conversationId, pathId }, 'Path not found or does not belong to conversation');
            return NextResponse.json({ error: 'Path not found' }, { status: 404 });
          }

          const searchParams = request.nextUrl.searchParams;
          const hardDelete = searchParams.get('hardDelete') === 'true';

          try {
            await conversationPathStore.deletePath({
              tenantId,
              pathId,
              hardDelete,
            });

            logger.info({ tenantId, conversationId, pathId, hardDelete }, 'Path deleted successfully');
            return NextResponse.json({ status: 'ok' });
          } catch (error) {
            logger.error({ tenantId, conversationId, pathId, hardDelete, error }, 'Failed to delete path');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
  );
}
