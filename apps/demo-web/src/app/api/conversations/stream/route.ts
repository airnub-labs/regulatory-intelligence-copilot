import { NextRequest } from 'next/server'
import type {
  ConversationListEventType,
  ConversationListEventPayloadMap,
  SseSubscriber,
} from '@reg-copilot/reg-intel-conversations'
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability'
import { getServerSession } from 'next-auth/next'

import { authOptions } from '@/lib/auth/options'
import { getTenantContext } from '@/lib/auth/tenantContext'
import { conversationListEventHub, conversationStore } from '@/lib/server/conversations'
import { toClientConversation } from '@/lib/server/conversationPresenter'

export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()
const logger = createLogger('ConversationStreamRoute')

function sseChunk(event: ConversationListEventType, data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return encoder.encode(`event: ${event}\n` + `data: ${payload}\n\n`)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { userId, tenantId, role } = await getTenantContext(session)

    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const status = statusParam === 'archived' || statusParam === 'all' ? (statusParam as 'archived' | 'all') : 'active'

    return requestContext.run({ tenantId, userId }, () =>
    withSpan(
      'api.conversations.stream',
      { 'app.route': '/api/conversations/stream', 'app.tenant.id': tenantId, 'app.user.id': userId },
      async () => {
        const initialConversations = await conversationStore.listConversations({ tenantId, userId, status })
        logger.info({ tenantId, userId, status, count: initialConversations.conversations.length }, 'Starting conversation stream')

        const stream = new ReadableStream({
          start(controller) {
            let closed = false
            let unsubscribe: () => void = () => {}

            const cleanup = () => {
              if (closed) return
              closed = true
              unsubscribe()
              request.signal.removeEventListener('abort', abortHandler)
              controller.close()
            }

            const abortHandler = () => {
              cleanup()
            }

            // Register abort listener FIRST to prevent race condition
            request.signal.addEventListener('abort', abortHandler)

            const subscriber: SseSubscriber<ConversationListEventType> = {
              send(event: ConversationListEventType, data: unknown) {
                controller.enqueue(sseChunk(event, data))
              },
              onClose() {
                cleanup()
              },
            }

            unsubscribe = conversationListEventHub.subscribe(tenantId, subscriber)
            // Use type-safe payload from shared package
            const snapshotPayload: ConversationListEventPayloadMap['snapshot'] = {
              status,
              conversations: initialConversations.conversations.map(toClientConversation),
            }
            subscriber.send('snapshot', snapshotPayload)
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache, no-transform',
          },
        })
      }
    )
    )
  } catch (error) {
    logger.error({ error }, 'Error in GET conversations stream')
    if (error instanceof Error && error.message === 'Unauthorized') {
      return new Response('Unauthorized', { status: 401 })
    }
    return new Response('Internal server error', { status: 500 })
  }
}
