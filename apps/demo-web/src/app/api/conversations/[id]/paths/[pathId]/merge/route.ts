import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { toClientPath } from '@reg-copilot/reg-intel-conversations';
import type { MergeMode } from '@reg-copilot/reg-intel-conversations';
import { createLogger, requestContext, withSpan, recordMergeExecute, recordCompactionOperation } from '@reg-copilot/reg-intel-observability';

import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { conversationPathStore, conversationStore, executionContextManager } from '@/lib/server/conversations';
import { generateMergeSummary } from '@/lib/server/mergeSummarizer';

const logger = createLogger('MergeRoute');

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

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.merge.execute',
        {
          'app.route': '/api/conversations/[id]/paths/[pathId]/merge',
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

          // Verify source path exists and belongs to conversation
          const sourcePath = await conversationPathStore.getPath({ tenantId, pathId: sourcePathId });

          if (!sourcePath || sourcePath.conversationId !== conversationId) {
            logger.warn({ tenantId, conversationId, sourcePathId }, 'Source path not found or does not belong to conversation');
            return NextResponse.json({ error: 'Source path not found' }, { status: 404 });
          }

          const body = await request.json().catch(() => null);
          if (!body) {
            logger.warn({ tenantId, conversationId, sourcePathId }, 'Invalid request body');
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
          }

          const { targetPathId, mergeMode, selectedMessageIds, summaryPrompt, summaryContent, archiveSource } = body;

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

          // Verify target path exists and belongs to conversation
          const targetPath = await conversationPathStore.getPath({ tenantId, pathId: targetPathId });

          if (!targetPath || targetPath.conversationId !== conversationId) {
            logger.warn({ tenantId, conversationId, sourcePathId, targetPathId }, 'Target path not found or does not belong to conversation');
            return NextResponse.json({ error: 'Target path not found' }, { status: 404 });
          }

          // Cannot merge to self
          if (sourcePathId === targetPathId) {
            logger.warn({ tenantId, conversationId, sourcePathId, targetPathId }, 'Cannot merge path into itself');
            return NextResponse.json({ error: 'Cannot merge path into itself' }, { status: 400 });
          }

          // Cannot merge primary path
          if (sourcePath.isPrimary) {
            logger.warn({ tenantId, conversationId, sourcePathId }, 'Cannot merge primary path');
            return NextResponse.json({ error: 'Cannot merge primary path' }, { status: 400 });
          }

          // HIGH: Validate selectedMessageIds for selective mode with bounds and content validation
          if (mergeMode === 'selective') {
            if (!Array.isArray(selectedMessageIds) || selectedMessageIds.length === 0) {
              logger.warn({ tenantId, conversationId, sourcePathId, mergeMode }, 'selectedMessageIds is required for selective merge mode');
              return NextResponse.json(
                { error: 'selectedMessageIds is required for selective merge mode' },
                { status: 400 },
              );
            }
            // Add array bounds validation
            if (selectedMessageIds.length > 1000) {
              return NextResponse.json(
                { error: 'selectedMessageIds exceeds maximum length of 1000' },
                { status: 400 },
              );
            }
            // Validate each message ID in the array
            if (!selectedMessageIds.every((id) => typeof id === 'string' && id.length < 256)) {
              return NextResponse.json(
                { error: 'Invalid message ID format in selectedMessageIds' },
                { status: 400 },
              );
            }
          }

          // HIGH: Validate summaryPrompt and summaryContent to prevent resource exhaustion
          if (summaryPrompt !== undefined && summaryPrompt !== null) {
            if (typeof summaryPrompt !== 'string') {
              return NextResponse.json({ error: 'summaryPrompt must be a string' }, { status: 400 });
            }
            if (summaryPrompt.length > 5000) {
              return NextResponse.json({ error: 'summaryPrompt exceeds maximum length of 5000 characters' }, { status: 400 });
            }
          }
          if (summaryContent !== undefined && summaryContent !== null) {
            if (typeof summaryContent !== 'string') {
              return NextResponse.json({ error: 'summaryContent must be a string' }, { status: 400 });
            }
            if (summaryContent.length > 10000) {
              return NextResponse.json({ error: 'summaryContent exceeds maximum length of 10000 characters' }, { status: 400 });
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
                    logger.warn({ error: summaryResult.error, tenantId, conversationId, sourcePathId }, 'Summary generation warning');
                  }
                } catch (summaryError) {
                  logger.error({ err: summaryError, tenantId, conversationId, sourcePathId }, 'Failed to generate AI summary');
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

            // Terminate execution context for the source path (cleanup sandbox)
            if (executionContextManager && result.success) {
              try {
                // Check if there's an active context for the source path
                const contextResult = await executionContextManager.getContextByPath({
                  tenantId,
                  conversationId,
                  pathId: sourcePathId,
                });

                if (contextResult?.id) {
                  await executionContextManager.terminateContext(contextResult.id);
                  logger.info(
                    { sourcePathId, contextId: contextResult.id, tenantId, conversationId },
                    'Terminated execution context for merged source path',
                  );
                }
              } catch (cleanupError) {
                // Log but don't fail the merge if cleanup fails
                logger.warn(
                  {
                    sourcePathId,
                    tenantId,
                    conversationId,
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                  },
                  'Failed to cleanup execution context for source path',
                );
              }
            }

            logger.info(
              { tenantId, conversationId, sourcePathId, targetPathId, mergeMode, success: result.success },
              'Merge completed successfully',
            );

            // Record merge execution metric
            recordMergeExecute({
              mergeMode,
              sourcePathId,
              targetPathId,
              messageCount: result.mergedMessageIds?.length,
              conversationId,
            });

            // Record compaction metrics for summary mode (messages compressed into one summary)
            if (mergeMode === 'summary' && result.summaryMessageId) {
              // Get message count from preview (already fetched above for summary generation)
              const previewForMetrics = await conversationPathStore.previewMerge({
                tenantId,
                sourcePathId,
                targetPathId,
                mergeMode,
              });
              const messageCount = previewForMetrics.messagesToMerge.length;

              // Estimate tokens (rough: ~4 chars per token)
              const totalContent = previewForMetrics.messagesToMerge
                .map((m) => m.content)
                .join(' ');
              const estimatedTokensBefore = Math.ceil(totalContent.length / 4);
              const estimatedTokensAfter = Math.ceil((finalSummaryContent?.length ?? 0) / 4);

              recordCompactionOperation({
                strategy: 'merge_summary',
                conversationId,
                pathId: sourcePathId,
                tenantId,
                userId,
                tokensBefore: estimatedTokensBefore,
                tokensAfter: estimatedTokensAfter,
                messagesBefore: messageCount,
                messagesAfter: 1,
                messagesSummarized: messageCount,
                pinnedPreserved: 0,
                success: true,
                durationMs: 0, // We don't track duration in merge flow
                triggeredBy: 'manual',
                usedLlm: true,
              });
            }

            return NextResponse.json({
              success: result.success,
              summaryMessageId: result.summaryMessageId,
              mergedMessageIds: result.mergedMessageIds,
              targetPath: toClientPath(result.targetPath),
              sourcePath: toClientPath(result.sourcePath),
            });
          } catch (error) {
            logger.error({ error, tenantId, conversationId, sourcePathId, targetPathId, mergeMode }, 'Failed to execute merge');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, sourcePathId }, 'Error in POST merge');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
