import { NextRequest } from 'next/server'
import type { ConversationListEventType, SseSubscriber } from '@reg-copilot/reg-intel-conversations'
import { getServerSession } from 'next-auth/next'

import { authOptions } from '@/lib/auth/options'
import { conversationListEventHub, conversationStore } from '@/lib/server/conversations'
import { toClientConversation } from '@/lib/server/conversationPresenter'

export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

function sseChunk(event: ConversationListEventType, data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return encoder.encode(`event: ${event}\n` + `data: ${payload}\n\n`)
}

export async function GET(request: NextRequest) {
  const session = (await getServerSession(authOptions)) as { user?: { id?: string; tenantId?: string } } | null
  const userId = session?.user?.id

  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status')
  const status = statusParam === 'archived' || statusParam === 'all' ? (statusParam as 'archived' | 'all') : 'active'
  const tenantId = session.user?.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default'

  const initialConversations = await conversationStore.listConversations({ tenantId, userId, status })

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

      const subscriber: SseSubscriber<ConversationListEventType> = {
        send(event: ConversationListEventType, data: unknown) {
          controller.enqueue(sseChunk(event, data))
        },
        onClose() {
          cleanup()
        },
      }

      unsubscribe = conversationListEventHub.subscribe(tenantId, subscriber)
      subscriber.send('snapshot', {
        status,
        conversations: initialConversations.map(toClientConversation),
      })

      request.signal.addEventListener('abort', abortHandler)
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
