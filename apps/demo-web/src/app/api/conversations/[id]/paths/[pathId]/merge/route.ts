import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';
import type { MergeMode } from '@reg-copilot/reg-intel-conversations';

import { authOptions } from '@/lib/auth/options';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';
import { generateMergeSummary } from '@/lib/server/mergeSummarizer';

export const dynamic = 'force-dynamic';

const VALID_MERGE_MODES: MergeMode[] = ['summary', 'full', 'selective'];

/**
 * POST /api/conversations/[id]/paths/[pathId]/merge
 * Merge this path into another path
 *
 * For 'summary' mode, if summaryContent is not provided,
 * generates an AI-powered summary automatically.
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

  // Verify source path exists and belongs to conversation
  const sourcePath = await conversationPathStore.getPath({ tenantId, pathId: sourcePathId });

  if (!sourcePath || sourcePath.conversationId !== conversationId) {
    return NextResponse.json({ error: 'Source path not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { targetPathId, mergeMode, selectedMessageIds, summaryPrompt, summaryContent, archiveSource } = body;

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

  // Verify target path exists and belongs to conversation
  const targetPath = await conversationPathStore.getPath({ tenantId, pathId: targetPathId });

  if (!targetPath || targetPath.conversationId !== conversationId) {
    return NextResponse.json({ error: 'Target path not found' }, { status: 404 });
  }

  // Cannot merge to self
  if (sourcePathId === targetPathId) {
    return NextResponse.json({ error: 'Cannot merge path into itself' }, { status: 400 });
  }

  // Cannot merge primary path
  if (sourcePath.isPrimary) {
    return NextResponse.json({ error: 'Cannot merge primary path' }, { status: 400 });
  }

  // Validate selectedMessageIds for selective mode
  if (mergeMode === 'selective') {
    if (!Array.isArray(selectedMessageIds) || selectedMessageIds.length === 0) {
      return NextResponse.json(
        { error: 'selectedMessageIds is required for selective merge mode' },
        { status: 400 }
      );
    }
  }

  try {
    // For summary mode, generate AI summary if not provided
    let finalSummaryContent = summaryContent;

    if (mergeMode === 'summary' && !finalSummaryContent) {
      // Get messages from source path to generate summary
      const preview = await conversationPathStore.previewMerge({
        tenantId,
        sourcePathId,
        targetPathId,
        mergeMode,
        selectedMessageIds,
        summaryPrompt,
      });

      if (preview.messagesToMerge.length > 0) {
        try {
          const summaryResult = await generateMergeSummary({
            branchMessages: preview.messagesToMerge,
            sourcePath: preview.sourcePath,
            targetPath: preview.targetPath,
            customPrompt: summaryPrompt,
            tenantId,
          });

          finalSummaryContent = summaryResult.summary;

          if (summaryResult.error) {
            console.warn('[merge] Summary generation warning:', summaryResult.error);
          }
        } catch (summaryError) {
          console.error('[merge] Failed to generate AI summary:', summaryError);
          // Continue with basic summary from store
        }
      }
    }

    const result = await conversationPathStore.mergePath({
      tenantId,
      sourcePathId,
      targetPathId,
      mergeMode,
      selectedMessageIds,
      summaryPrompt,
      summaryContent: finalSummaryContent,
      userId,
      archiveSource: archiveSource !== false, // Default to archiving
    });

    return NextResponse.json({
      success: result.success,
      summaryMessageId: result.summaryMessageId,
      mergedMessageIds: result.mergedMessageIds,
      targetPath: toClientPath(result.targetPath),
      sourcePath: toClientPath(result.sourcePath),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
