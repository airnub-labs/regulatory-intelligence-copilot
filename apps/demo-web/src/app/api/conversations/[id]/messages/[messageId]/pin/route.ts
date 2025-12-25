import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth/options';
import { conversationPathStore, conversationStore, conversationEventHub } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

/**
 * POST /api/conversations/[id]/messages/[messageId]/pin
 * Pin a message to prevent compaction
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id: conversationId, messageId } = await context.params;
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

    return NextResponse.json({
      success: true,
      messageId,
      isPinned: true,
      pinnedBy: userId,
      pinnedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      messageId,
      isPinned: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
