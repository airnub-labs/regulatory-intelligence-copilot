import { NextRequest } from 'next/server';
import { conversationEventHub, conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

function sseChunk(event: string, data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return encoder.encode(`event: ${event}\n` + `data: ${payload}\n\n`);
}

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const tenantId = 'default';
  const conversationId = context.params.id;
  const userId = new URL(request.url).searchParams.get('userId');

  if (!userId) {
    return new Response('userId required', { status: 400 });
  }

  const conversation = await conversationStore.getConversation({ tenantId, conversationId, userId });
  if (!conversation) {
    return new Response('Conversation not found or access denied', { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const subscriber = {
        send(event: string, data: unknown) {
          controller.enqueue(sseChunk(event, data));
        },
        onClose() {
          controller.close();
        },
      };

      const unsubscribe = conversationEventHub.subscribe(tenantId, conversationId, subscriber);
      // provide immediate metadata payload with conversation id and sharing state
      subscriber.send('metadata', {
        conversationId,
        sharingMode: conversation.sharingMode,
        isShared: conversation.isShared,
      });

      const abortHandler = () => {
        unsubscribe();
        controller.close();
      };

      request.signal.addEventListener('abort', abortHandler);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
