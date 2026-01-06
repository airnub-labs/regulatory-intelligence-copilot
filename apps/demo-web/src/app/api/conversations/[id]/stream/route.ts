import { NextRequest } from 'next/server';
import type { ConversationEventType, SseSubscriber } from '@reg-copilot/reg-intel-conversations';
import { getServerSession } from 'next-auth/next';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import { conversationEventHub, conversationStore } from '@/lib/server/conversations';
import { toClientConversation } from '@/lib/server/conversationPresenter';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();
const logger = createLogger('ConversationStreamRoute');

function sseChunk(event: ConversationEventType, data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return encoder.encode(`event: ${event}\n` + `data: ${payload}\n\n`);
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await context.params;

  try {
    const session = await getServerSession(authOptions);
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run({ tenantId, userId, conversationId }, () =>
    withSpan(
      'api.conversation.stream',
      {
        'app.route': '/api/conversations/[id]/stream',
        'app.tenant.id': tenantId,
        'app.user.id': userId,
        'app.conversation.id': conversationId,
      },
      async () => {
        const conversation = await conversationStore.getConversation({ tenantId, conversationId, userId });
        if (!conversation) {
          logger.warn({ tenantId, userId, conversationId }, 'Conversation not found for SSE stream');
          return new Response('Conversation not found or access denied', { status: 404 });
        }

        const safeConversation = toClientConversation(conversation);

        logger.info({ tenantId, userId, conversationId }, 'Starting conversation SSE stream');

        const stream = new ReadableStream({
          start(controller) {
            let closed = false;
            let unsubscribe: () => void = () => {};

            const cleanup = () => {
              if (closed) return;
              closed = true;
              unsubscribe();
              request.signal.removeEventListener('abort', abortHandler);
              controller.close();
              logger.info({ tenantId, userId, conversationId }, 'Conversation SSE stream closed');
            };

            const abortHandler = () => {
              cleanup();
            };

            // Register abort listener FIRST to prevent race condition
            request.signal.addEventListener('abort', abortHandler);

            const subscriber: SseSubscriber<ConversationEventType> = {
              send(event: ConversationEventType, data: unknown) {
                controller.enqueue(sseChunk(event, data));
              },
              onClose() {
                cleanup();
              },
            };

            unsubscribe = conversationEventHub.subscribe(tenantId, conversationId, subscriber);
            // provide immediate metadata payload with conversation id and sharing state
            subscriber.send('metadata', {
              conversationId,
              shareAudience: safeConversation.shareAudience,
              tenantAccess: safeConversation.tenantAccess,
              title: safeConversation.title,
              jurisdictions: safeConversation.jurisdictions,
              archivedAt: safeConversation.archivedAt,
            });
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache, no-transform',
          },
        });
      },
    ),
    );
  } catch (error) {
    logger.error({ error, conversationId }, 'Error in GET conversation stream');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response('Internal server error', { status: 500 });
  }
}
