/**
 * Single Snapshot API
 *
 * Get or delete a specific compaction snapshot.
 *
 * GET /api/conversations/:conversationId/compact/snapshots/:snapshotId
 * Response: Full snapshot details including messages
 *
 * DELETE /api/conversations/:conversationId/compact/snapshots/:snapshotId
 * Response: { success: true }
 */

import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; snapshotId: string }> }
): Promise<NextResponse> {
  try {
    const { id: conversationId, snapshotId } = await context.params;

    const { getSnapshotService } = await import('@reg-copilot/reg-intel-conversations/compaction');
    const snapshotService = getSnapshotService();

    const snapshot = await snapshotService.getSnapshot(snapshotId);

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    if (snapshot.conversationId !== conversationId) {
      return NextResponse.json({ error: 'Snapshot does not belong to this conversation' }, { status: 400 });
    }

    return NextResponse.json({
      snapshot: {
        id: snapshot.id,
        conversationId: snapshot.conversationId,
        pathId: snapshot.pathId,
        createdAt: snapshot.createdAt,
        strategy: snapshot.strategy,
        tokensBefore: snapshot.tokensBefore,
        messageCount: snapshot.messages.length,
        expiresAt: snapshot.expiresAt,
        compactionResult: snapshot.compactionResult,
        // Optionally include messages:
        // messages: snapshot.messages,
      },
    });
  } catch (error) {
    console.error('Snapshot GET API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; snapshotId: string }> }
): Promise<NextResponse> {
  try {
    const { id: conversationId, snapshotId } = await context.params;

    const { getSnapshotService } = await import('@reg-copilot/reg-intel-conversations/compaction');
    const snapshotService = getSnapshotService();

    // Verify snapshot exists and belongs to conversation
    const snapshot = await snapshotService.getSnapshot(snapshotId);
    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    if (snapshot.conversationId !== conversationId) {
      return NextResponse.json({ error: 'Snapshot does not belong to this conversation' }, { status: 400 });
    }

    await snapshotService.deleteSnapshot(snapshotId);

    return NextResponse.json({
      success: true,
      snapshotId,
      deletedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Snapshot DELETE API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
