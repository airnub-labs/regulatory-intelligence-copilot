import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth/options';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations/[id]/paths/[pathId]/messages
 * Get resolved messages for a path (includes inherited messages from ancestor paths)
 */
export async function GET(
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

  // Verify conversation exists and user has access
  const conversation = await conversationStore.getConversation({
    tenantId,
    conversationId,
    userId,
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Verify path exists and belongs to conversation
  const path = await conversationPathStore.getPath({ tenantId, pathId });

  if (!path || path.conversationId !== conversationId) {
    return NextResponse.json({ error: 'Path not found' }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const includeDeleted = searchParams.get('includeDeleted') === 'true';
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

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

    return NextResponse.json({
      messages: messages.map(msg => ({
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
      })),
      path: {
        id: path.id,
        name: path.name,
        isPrimary: path.isPrimary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
