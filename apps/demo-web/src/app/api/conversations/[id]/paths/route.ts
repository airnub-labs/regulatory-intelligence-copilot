import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const logger = createLogger('PathsRoute');

/**
 * GET /api/conversations/[id]/paths
 * List all paths for a conversation
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
        'api.conversations.paths.list',
        {
          'app.route': '/api/conversations/[id]/paths',
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

          const searchParams = request.nextUrl.searchParams;
          const includeInactive = searchParams.get('includeInactive') === 'true';

          const paths = await conversationPathStore.listPaths({
            tenantId,
            conversationId,
            includeInactive,
          });

          logger.info(
            { tenantId, conversationId, includeInactive, count: paths.length },
            'Listed conversation paths',
          );

          return NextResponse.json({
            paths: paths.map(toClientPath),
          });
        },
      ),
  );
}

/**
 * POST /api/conversations/[id]/paths
 * Create a new path for a conversation
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
        'api.conversations.paths.create',
        {
          'app.route': '/api/conversations/[id]/paths',
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

          const { name, description, parentPathId, branchPointMessageId, isPrimary } = body;

          try {
            const { pathId } = await conversationPathStore.createPath({
              tenantId,
              conversationId,
              name: name ?? null,
              description: description ?? null,
              parentPathId: parentPathId ?? null,
              branchPointMessageId: branchPointMessageId ?? null,
              isPrimary: isPrimary ?? false,
            });

            const path = await conversationPathStore.getPath({ tenantId, pathId });

            logger.info({ tenantId, conversationId, pathId, name, isPrimary }, 'Path created successfully');

            return NextResponse.json({
              path: path ? toClientPath(path) : null,
              pathId,
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, error }, 'Failed to create path');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
  );
}
