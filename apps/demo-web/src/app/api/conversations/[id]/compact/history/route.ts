/**
 * Compaction History API
 *
 * Get compaction history for a conversation from the database.
 *
 * GET /api/conversations/:conversationId/compact/history?limit=10
 *
 * Response:
 * {
 *   "history": [
 *     {
 *       "id": "uuid",
 *       "timestamp": "2024-01-15T10:30:00Z",
 *       "strategy": "semantic",
 *       "messagesBefore": 150,
 *       "messagesAfter": 75,
 *       "tokensBefore": 125000,
 *       "tokensAfter": 62500,
 *       "compressionRatio": 0.5,
 *       "durationMs": 2341,
 *       "triggeredBy": "manual"
 *     }
 *   ],
 *   "totalCompactions": 5,
 *   "totalTokensSaved": 312500
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { conversationStore } from '@/lib/server/conversations';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { createUnrestrictedServiceClient } from '@/lib/supabase/tenantScopedServiceClient';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const logger = createLogger('CompactionHistoryRoute');

interface CompactionHistoryEntry {
  id: string;
  timestamp: string;
  strategy: string;
  messagesBefore: number;
  messagesAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  compressionRatio: number;
  durationMs: number | null;
  triggeredBy: 'auto' | 'manual';
  success: boolean;
}

interface CompactionOperationRow {
  id: string;
  timestamp: string;
  strategy: string;
  messages_before: number;
  messages_after: number;
  tokens_before: number;
  tokens_after: number;
  tokens_saved: number;
  compression_ratio: string | number;
  duration_ms: number | null;
  triggered_by: 'auto' | 'manual';
  success: boolean;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: conversationId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.compact.history.get',
        {
          'app.route': '/api/conversations/[id]/compact/history',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
        },
        async () => {
          try {
            const url = new URL(request.url);
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);

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

            // Fetch compaction history from Supabase using unrestricted service client
            // (already validated user has access to this conversation above)
            const supabase = createUnrestrictedServiceClient(
              'fetch-compaction-history',
              userId
            );

            // Query compaction_operations table for this conversation
            const { data, error } = await supabase
              .from('compaction_operations')
              .select('*')
              .eq('conversation_id', conversationId)
              .order('timestamp', { ascending: false })
              .limit(limit);

            if (error) {
              // Check if table doesn't exist yet
              if (error.code === '42P01' || error.message.includes('does not exist')) {
                logger.info('Compaction operations table not yet created');
                return NextResponse.json({
                  conversationId,
                  history: [],
                  totalCompactions: 0,
                  totalTokensSaved: 0,
                  message: 'No compaction history available',
                });
              }

              logger.error({ error: error.message }, 'Failed to fetch compaction history');
              throw new Error(`Failed to fetch compaction history: ${error.message}`);
            }

            const history: CompactionHistoryEntry[] = (data || []).map((row: CompactionOperationRow) => ({
              id: row.id,
              timestamp: row.timestamp,
              strategy: row.strategy,
              messagesBefore: row.messages_before,
              messagesAfter: row.messages_after,
              tokensBefore: row.tokens_before,
              tokensAfter: row.tokens_after,
              tokensSaved: row.tokens_saved,
              compressionRatio: parseFloat(String(row.compression_ratio)) || 0,
              durationMs: row.duration_ms,
              triggeredBy: row.triggered_by,
              success: row.success,
            }));

            const totalTokensSaved = history.reduce((sum, entry) => sum + entry.tokensSaved, 0);

            logger.info({
              conversationId,
              historyCount: history.length,
              totalTokensSaved,
            }, 'Compaction history retrieved');

            return NextResponse.json({
              conversationId,
              history,
              totalCompactions: history.length,
              totalTokensSaved,
            });
          } catch (error) {
            logger.error({
              conversationId,
              error: error instanceof Error ? error.message : String(error),
            }, 'Compaction history API error');

            return NextResponse.json(
              { error: error instanceof Error ? error.message : 'Internal server error' },
              { status: 500 }
            );
          }
        }
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Request failed';
    logger.error({ error }, 'Request failed');
    return NextResponse.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
