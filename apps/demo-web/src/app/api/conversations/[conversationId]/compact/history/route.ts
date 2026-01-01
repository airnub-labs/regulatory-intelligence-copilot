/**
 * Compaction History API
 *
 * Get compaction history for a conversation.
 *
 * GET /api/conversations/:conversationId/compact/history?limit=10
 *
 * Response:
 * {
 *   "history": [
 *     {
 *       "id": "compact-123",
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

import { NextResponse } from 'next/server';

interface CompactionHistoryEntry {
  id: string;
  timestamp: Date;
  strategy: string;
  messagesBefore: number;
  messagesAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  compressionRatio: number;
  durationMs: number;
  triggeredBy: 'auto' | 'manual';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<NextResponse> {
  try {
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    // In production, fetch from compaction history store
    // For now, return example data

    const exampleHistory: CompactionHistoryEntry[] = [
      {
        id: 'compact-123',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        strategy: 'semantic',
        messagesBefore: 150,
        messagesAfter: 75,
        tokensBefore: 125000,
        tokensAfter: 62500,
        compressionRatio: 0.5,
        durationMs: 2341,
        triggeredBy: 'manual',
      },
      {
        id: 'compact-122',
        timestamp: new Date('2024-01-14T15:20:00Z'),
        strategy: 'sliding_window',
        messagesBefore: 120,
        messagesAfter: 50,
        tokensBefore: 100000,
        tokensAfter: 42000,
        compressionRatio: 0.42,
        durationMs: 1823,
        triggeredBy: 'auto',
      },
    ];

    return NextResponse.json({
      message: 'Example data - integrate with compaction metrics store for production',
      conversationId,
      history: exampleHistory.slice(0, limit),
      totalCompactions: exampleHistory.length,
      totalTokensSaved: exampleHistory.reduce(
        (sum, entry) => sum + (entry.tokensBefore - entry.tokensAfter),
        0
      ),
    });

    // Production implementation:
    /*
    const metricsStore = getCompactionMetricsStore();
    const history = await metricsStore.getHistory(conversationId, limit);

    const totalTokensSaved = history.reduce(
      (sum, entry) => sum + (entry.tokensBefore - entry.tokensAfter),
      0
    );

    return NextResponse.json({
      conversationId,
      history,
      totalCompactions: history.length,
      totalTokensSaved,
    });
    */
  } catch (error) {
    console.error('Compaction history API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
