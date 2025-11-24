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
 */

import {
  hasActiveSandbox,
  getMcpGatewayUrl,
} from '@reg-copilot/compliance-core';

/**
 * Graph patch format per v0.3 spec
 */
interface GraphPatch {
  type: 'graph_patch';
  timestamp: string;
  nodes_added?: Array<{
    id: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
  }>;
  nodes_updated?: Array<{
    id: string;
    label?: string;
    type?: string;
    properties?: Record<string, unknown>;
  }>;
  nodes_removed?: string[];
  edges_added?: Array<{
    source: string;
    target: string;
    type: string;
    properties?: Record<string, unknown>;
  }>;
  edges_removed?: Array<{
    source: string;
    target: string;
    type: string;
  }>;
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

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection confirmation
      const connectionMessage = {
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

      // TODO: Implement actual graph change detection
      // For now, this is a placeholder that demonstrates the SSE connection
      // In production, this would:
      // 1. Subscribe to Memgraph change notifications
      // 2. Poll for graph changes at regular intervals
      // 3. Use a pub/sub system for change notifications

      // Simulate periodic graph updates (placeholder)
      const simulateUpdates = setInterval(() => {
        try {
          // In production, this would be replaced with actual change detection
          // For now, we just send a heartbeat-style patch every 60 seconds
          const patch: GraphPatch = {
            type: 'graph_patch',
            timestamp: new Date().toISOString(),
            // Empty patch - no actual changes
            nodes_added: [],
            nodes_updated: [],
            nodes_removed: [],
            edges_added: [],
            edges_removed: [],
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(patch)}\n\n`)
          );
        } catch (error) {
          console.log('[API/graph/stream] Update failed, client disconnected');
          clearInterval(simulateUpdates);
        }
      }, 60000); // Every 60 seconds

      // Clean up on connection close
      request.signal.addEventListener('abort', () => {
        console.log('[API/graph/stream] Client disconnected');
        clearInterval(keepAliveInterval);
        clearInterval(simulateUpdates);
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
