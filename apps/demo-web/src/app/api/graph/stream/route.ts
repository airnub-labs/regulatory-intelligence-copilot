/**
 * Graph Streaming API endpoint - Incremental patches
 *
 * Sends incremental graph patches using Server-Sent Events (SSE) and WebSockets
 * (when supported by the runtime). Clients should first load initial snapshot
 * via GET /api/graph, then subscribe to this endpoint for real-time updates.
 *
 * Patch format: { type: 'graph_patch', nodes: { added|updated|removed }, edges: { added|updated|removed }, meta }
 */

import {
  hasActiveSandbox,
  getMcpGatewayUrl,
  normalizeProfileType,
  type ChangeFilter,
  type GraphPatch,
  type ProfileId,
} from '@reg-copilot/reg-intel-core';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { getServerSession } from 'next-auth/next';

import { subscribeToGraphPatches } from '@/lib/graphChangeDetectorInstance';
import { authOptions } from '@/lib/auth/options';

const logger = createLogger('GraphStreamRoute');

type WebSocketPairType = {
  0: WebSocket;
  1: WebSocket;
};

// Cloudflare Workers global types
interface CloudflareGlobalThis {
  WebSocketPair?: new () => WebSocketPairType;
}

interface CloudflareWebSocket extends WebSocket {
  accept(): void;
}

/**
 * Connection confirmation message
 */
interface ConnectionMessage {
  type: 'connected';
  timestamp: string;
  message: string;
}

export async function GET(request: Request) {
  const session = (await getServerSession(authOptions)) as { user?: { id?: string; tenantId?: string } } | null;
  const tenantId = session?.user?.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
  const userId = session?.user?.id;

  const { searchParams } = new URL(request.url);
  const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
  const profileType: ProfileId = normalizeProfileType(searchParams.get('profileType'));
  const keyword = searchParams.get('keyword') || undefined;

  const filter: ChangeFilter = { jurisdictions, profileType, keyword };

  logger.info({ filter, tenantId, userId }, 'Client connected to graph stream');

  return requestContext.run({ tenantId, userId }, () =>
    withSpan(
      'api.graph.stream',
      {
        'app.route': '/api/graph/stream',
        'app.tenant.id': tenantId,
        ...(userId ? { 'app.user.id': userId } : {}),
      },
      () => {
        const upgradeHeader = request.headers.get('upgrade');
        const supportsWebSocket = typeof (globalThis as CloudflareGlobalThis).WebSocketPair !== 'undefined';

        if (upgradeHeader?.toLowerCase() === 'websocket' && supportsWebSocket) {
          return handleWebSocket(filter, tenantId, userId);
        }

        return handleSse(request, filter, tenantId, userId);
      },
    ),
  );
}

function handleSse(
  request: Request,
  filter: ChangeFilter,
  tenantId: string,
  userId?: string
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

      // Only subscribe to patches if sandbox is active
      let subscription: { unsubscribe: () => void } | null = null;

      if (hasActiveSandbox() && getMcpGatewayUrl()) {
        subscription = subscribeToGraphPatches(filter, (patch: GraphPatch) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(patch)}\n\n`));
            logger.info({ meta: patch.meta, tenantId, userId }, 'Sent patch to SSE client');
          } catch (error) {
            logger.error({ err: error, tenantId, userId }, 'Error sending patch to SSE client');
          }
        });
      } else {
        logger.info({ tenantId, userId }, 'No active sandbox - streaming keepalive only');
      }

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval);
        subscription?.unsubscribe();
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

function handleWebSocket(filter: ChangeFilter, tenantId: string, userId?: string) {
  const WebSocketPair = (globalThis as CloudflareGlobalThis).WebSocketPair;
  if (!WebSocketPair) {
    throw new Error('WebSocketPair not available');
  }
  const { 0: client, 1: server } = new WebSocketPair();

  // Cloudflare Workers WebSocket has accept() method
  (server as CloudflareWebSocket).accept();

  // Only subscribe to patches if sandbox is active
  let subscription: { unsubscribe: () => void } | null = null;

  if (hasActiveSandbox() && getMcpGatewayUrl()) {
    subscription = subscribeToGraphPatches(filter, (patch: GraphPatch) => {
      try {
        server.send(JSON.stringify(patch));
      } catch (error) {
        logger.error({ err: error, tenantId, userId }, 'WebSocket send failed');
        server.close();
      }
    });
  } else {
    logger.info({ tenantId, userId }, 'No active sandbox - WebSocket keepalive only');
  }

  const connectionMessage: ConnectionMessage = {
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Graph WebSocket connected',
  };

  server.send(JSON.stringify(connectionMessage));

  server.addEventListener('close', () => subscription?.unsubscribe());
  server.addEventListener('error', () => subscription?.unsubscribe());

  return new Response(null, {
    status: 101,
    webSocket: client,
  } as ResponseInit & { webSocket: WebSocket });
}
