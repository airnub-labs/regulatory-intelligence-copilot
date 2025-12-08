import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';

import { authOptions } from '@/lib/auth/options';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations/[id]/active-path
 * Get the currently active path for a conversation
 */
export async function GET(
  _request: NextRequest,
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

  // Verify conversation exists and user has access
  const conversation = await conversationStore.getConversation({
    tenantId,
    conversationId,
    userId,
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const activePath = await conversationPathStore.getActivePath({
    tenantId,
    conversationId,
  });

  if (!activePath) {
    // Create primary path if none exists
    const primaryPath = await conversationPathStore.ensurePrimaryPath({
      tenantId,
      conversationId,
    });

    return NextResponse.json({
      path: toClientPath(primaryPath),
    });
  }

  return NextResponse.json({
    path: toClientPath(activePath),
  });
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

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { pathId } = body;

  if (!pathId || typeof pathId !== 'string') {
    return NextResponse.json({ error: 'pathId is required' }, { status: 400 });
  }

  // Verify path exists and belongs to conversation
  const path = await conversationPathStore.getPath({ tenantId, pathId });

  if (!path || path.conversationId !== conversationId) {
    return NextResponse.json({ error: 'Path not found' }, { status: 404 });
  }

  try {
    await conversationPathStore.setActivePath({
      tenantId,
      conversationId,
      pathId,
    });

    return NextResponse.json({
      path: toClientPath(path),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
