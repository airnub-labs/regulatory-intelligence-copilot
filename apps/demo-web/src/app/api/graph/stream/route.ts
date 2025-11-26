/**
 * Graph Streaming API endpoint - Incremental patches
 *
 * Sends incremental graph patches using Server-Sent Events (SSE).
 * Clients should first load initial snapshot via GET /api/graph,
 * then subscribe to this endpoint for real-time updates.
 *
 * Per v0.3 architecture (docs/architecture_v_0_3.md Section 9):
 * - WebSocket/SSE endpoint sends incremental graph patches
 * - Patch format: nodes_added, nodes_updated, nodes_removed, edges_added, edges_removed
 *
 * Note: Using SSE instead of WebSocket for better Next.js/Vercel compatibility
 * and simpler server-to-client streaming.
 *
 * Implementation: Uses GraphChangeDetector with polling-based change detection
 * to monitor Memgraph and emit incremental patches to connected clients.
 */

import {
  hasActiveSandbox,
  getMcpGatewayUrl,
  type GraphPatch,
} from '@reg-copilot/reg-intel-core';
import { getGraphChangeDetector } from '@/lib/graphChangeDetectorInstance';

/**
 * Connection confirmation message
 */
interface ConnectionMessage {
  type: 'connected';
  timestamp: string;
  message: string;
}

export async function GET(request: Request) {
  // Check if graph is available
  if (!hasActiveSandbox() || !getMcpGatewayUrl()) {
    return new Response('Graph streaming unavailable: sandbox not active', {
      status: 503,
    });
  }

  const { searchParams } = new URL(request.url);
  const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
  const profileType = searchParams.get('profileType') || 'single_director';

  console.log('[API/graph/stream] Client connected:', {
    jurisdictions,
    profileType,
  });

  // Get the shared change detector instance
  const detector = getGraphChangeDetector();

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection confirmation
      const connectionMessage: ConnectionMessage = {
        type: 'connected',
        timestamp: new Date().toISOString(),
        message: 'Graph stream connected',
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(connectionMessage)}\n\n`)
      );

      // Keep-alive interval to prevent connection timeout
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch (error) {
          console.log('[API/graph/stream] Keep-alive failed, client disconnected');
          clearInterval(keepAliveInterval);
        }
      }, 30000); // Every 30 seconds

      // Subscribe to graph changes
      const subscription = detector.subscribe(
        {
          jurisdictions,
          profileType,
        },
        (patch: GraphPatch) => {
          try {
            // Send patch to client via SSE
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(patch)}\n\n`)
            );

            console.log('[API/graph/stream] Sent patch to client:', {
              nodesAdded: patch.nodes_added?.length || 0,
              nodesUpdated: patch.nodes_updated?.length || 0,
              nodesRemoved: patch.nodes_removed?.length || 0,
              edgesAdded: patch.edges_added?.length || 0,
              edgesRemoved: patch.edges_removed?.length || 0,
            });
          } catch (error) {
            console.error('[API/graph/stream] Error sending patch:', error);
          }
        }
      );

      // Clean up on connection close
      request.signal.addEventListener('abort', () => {
        console.log('[API/graph/stream] Client disconnected');
        clearInterval(keepAliveInterval);
        subscription.unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
