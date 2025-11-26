/**
 * Graph Streaming API endpoint - Incremental patches
 *
 * Sends incremental graph patches using Server-Sent Events (SSE) and WebSockets
 * (when supported by the runtime). Clients should first load initial snapshot
 * via GET /api/graph, then subscribe to this endpoint for real-time updates.
 *
 * Patch format: { type: 'graph_patch', nodes: { added|updated|removed }, edges: { added|updated|removed }, meta }
 */

import { hasActiveSandbox, getMcpGatewayUrl, type GraphPatch } from '@reg-copilot/reg-intel-core';
import { subscribeToGraphPatches } from '@/lib/graphChangeDetectorInstance';

type WebSocketPairType = {
  0: WebSocket;
  1: WebSocket;
};

/**
 * Connection confirmation message
 */
interface ConnectionMessage {
  type: 'connected';
  timestamp: string;
  message: string;
}

export async function GET(request: Request) {
  if (!hasActiveSandbox() || !getMcpGatewayUrl()) {
    return new Response('Graph streaming unavailable: sandbox not active', {
      status: 503,
    });
  }

  const { searchParams } = new URL(request.url);
  const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
  const profileType = (searchParams.get('profileType') || 'single-director').replace('_', '-');

  const filter = { jurisdictions, profileType } as const;

  console.log('[API/graph/stream] Client connected:', filter);

  const upgradeHeader = request.headers.get('upgrade');
  const supportsWebSocket = typeof (globalThis as any).WebSocketPair !== 'undefined';

  if (upgradeHeader?.toLowerCase() === 'websocket' && supportsWebSocket) {
    return handleWebSocket(filter);
  }

  return handleSse(request, filter);
}

function handleSse(
  request: Request,
  filter: { jurisdictions: string[]; profileType: string }
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const connectionMessage: ConnectionMessage = {
        type: 'connected',
        timestamp: new Date().toISOString(),
        message: 'Graph stream connected',
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(connectionMessage)}\n\n`)
      );

      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 30000);

      const subscription = subscribeToGraphPatches(filter, (patch: GraphPatch) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(patch)}\n\n`));
          console.log('[API/graph/stream] Sent patch to SSE client:', patch.meta);
        } catch (error) {
          console.error('[API/graph/stream] Error sending patch:', error);
        }
      });

      request.signal.addEventListener('abort', () => {
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
      'X-Accel-Buffering': 'no',
    },
  });
}

function handleWebSocket(filter: { jurisdictions: string[]; profileType: string }) {
  const { 0: client, 1: server } = new (globalThis as any).WebSocketPair() as WebSocketPairType;

  server.accept();

  const subscription = subscribeToGraphPatches(filter, (patch: GraphPatch) => {
    try {
      server.send(JSON.stringify(patch));
    } catch (error) {
      console.error('[API/graph/stream] WebSocket send failed:', error);
      server.close();
    }
  });

  const connectionMessage: ConnectionMessage = {
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Graph WebSocket connected',
  };

  server.send(JSON.stringify(connectionMessage));

  server.addEventListener('close', () => subscription.unsubscribe());
  server.addEventListener('error', () => subscription.unsubscribe());

  return new Response(null, {
    status: 101,
    webSocket: client,
  } as ResponseInit & { webSocket: WebSocket });
}
