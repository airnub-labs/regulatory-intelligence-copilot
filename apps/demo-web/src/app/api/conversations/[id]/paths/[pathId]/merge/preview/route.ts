import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';
import type { MergeMode } from '@reg-copilot/reg-intel-conversations';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';

import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { conversationPathStore, conversationStore } from '@/lib/server/conversations';
import { generateMergeSummary } from '@/lib/server/mergeSummarizer';

const logger = createLogger('MergePreviewRoute');

export const dynamic = 'force-dynamic';

const VALID_MERGE_MODES: MergeMode[] = ['summary', 'full', 'selective'];

/**
 * POST /api/conversations/[id]/paths/[pathId]/merge/preview
 * Preview what a merge would produce
 *
 * For 'summary' mode, generates an AI-powered summary of the branch
 * conversation to be merged into the target path.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; pathId: string }> }
) {
  const { id: conversationId, pathId: sourcePathId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.merge.preview',
        {
          'app.route': '/api/conversations/[id]/paths/[pathId]/merge/preview',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.path.id': sourcePathId,
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
            logger.warn({ tenantId, conversationId, sourcePathId }, 'Invalid request body');
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
          }

          const { targetPathId, mergeMode, selectedMessageIds, summaryPrompt } = body;

          // Validate targetPathId
          if (!targetPathId || typeof targetPathId !== 'string') {
            logger.warn({ tenantId, conversationId, sourcePathId }, 'targetPathId is required');
            return NextResponse.json({ error: 'targetPathId is required' }, { status: 400 });
          }

          // Validate mergeMode
          if (!mergeMode || !VALID_MERGE_MODES.includes(mergeMode)) {
            logger.warn({ tenantId, conversationId, sourcePathId, mergeMode }, 'Invalid mergeMode');
            return NextResponse.json(
              { error: `mergeMode must be one of: ${VALID_MERGE_MODES.join(', ')}` },
              { status: 400 },
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

            // Generate AI summary for summary mode
            let generatedSummary = preview.generatedSummary;
            let aiGenerated = false;

            if (mergeMode === 'summary' && preview.messagesToMerge.length > 0) {
              try {
                const summaryResult = await generateMergeSummary({
                  branchMessages: preview.messagesToMerge,
                  sourcePath: preview.sourcePath,
                  targetPath: preview.targetPath,
                  customPrompt: summaryPrompt,
                  tenantId,
                });

                generatedSummary = summaryResult.summary;
                aiGenerated = summaryResult.aiGenerated;

                if (summaryResult.error) {
                  logger.warn({ error: summaryResult.error, tenantId, conversationId, sourcePathId }, 'Summary generation warning');
                }
              } catch (summaryError) {
                logger.error({ err: summaryError, tenantId, conversationId, sourcePathId }, 'Failed to generate AI summary');
                // Fall through - use basic preview summary from store
              }
            }

            logger.info(
              { tenantId, conversationId, sourcePathId, targetPathId, mergeMode, messageCount: preview.messagesToMerge.length },
              'Merge preview generated',
            );

            return NextResponse.json({
              messagesToMerge: preview.messagesToMerge.map((msg) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                createdAt: msg.createdAt.toISOString(),
              })),
              generatedSummary,
              aiGenerated,
              targetPath: toClientPath(preview.targetPath),
              sourcePath: toClientPath(preview.sourcePath),
              estimatedMessageCount: preview.estimatedMessageCount,
            });
          } catch (error) {
            logger.error({ error, tenantId, conversationId, sourcePathId, targetPathId, mergeMode }, 'Failed to generate merge preview');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, sourcePathId }, 'Error in POST merge preview');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
