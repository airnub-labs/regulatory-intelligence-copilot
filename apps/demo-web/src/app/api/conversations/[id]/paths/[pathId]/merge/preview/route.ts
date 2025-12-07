import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';
import type { MergeMode } from '@reg-copilot/reg-intel-conversations';

import { authOptions } from '@/lib/auth/options';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const VALID_MERGE_MODES: MergeMode[] = ['summary', 'full', 'selective'];

/**
 * POST /api/conversations/[id]/paths/[pathId]/merge/preview
 * Preview what a merge would produce
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; pathId: string }> }
) {
  const { id: conversationId, pathId: sourcePathId } = await context.params;
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

  const { targetPathId, mergeMode, selectedMessageIds, summaryPrompt } = body;

  // Validate targetPathId
  if (!targetPathId || typeof targetPathId !== 'string') {
    return NextResponse.json({ error: 'targetPathId is required' }, { status: 400 });
  }

  // Validate mergeMode
  if (!mergeMode || !VALID_MERGE_MODES.includes(mergeMode)) {
    return NextResponse.json(
      { error: `mergeMode must be one of: ${VALID_MERGE_MODES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const preview = await conversationPathStore.previewMerge({
      tenantId,
      sourcePathId,
      targetPathId,
      mergeMode,
      selectedMessageIds,
      summaryPrompt,
    });

    return NextResponse.json({
      messagesToMerge: preview.messagesToMerge.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      })),
      generatedSummary: preview.generatedSummary,
      targetPath: toClientPath(preview.targetPath),
      sourcePath: toClientPath(preview.sourcePath),
      estimatedMessageCount: preview.estimatedMessageCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
