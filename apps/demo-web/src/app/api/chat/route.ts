/**
 * Chat API endpoint for Regulatory Intelligence Copilot
 *
 * Handles conversational queries about tax, welfare, pensions, and regulatory compliance.
 * Uses provider-agnostic ComplianceEngine via Next.js adapter.
 */

import { createChatRouteHandler } from '@reg-copilot/reg-intel-next-adapter';
import { requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { context, propagation, trace } from '@opentelemetry/api';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth/options';
import {
  conversationContextStore,
  conversationEventHub,
  conversationListEventHub,
  conversationStore,
} from '@/lib/server/conversations';

// Force dynamic rendering to avoid build-time initialization
export const dynamic = 'force-dynamic';

const handler = createChatRouteHandler({
  conversationStore,
  conversationContextStore,
  eventHub: conversationEventHub,
  conversationListEventHub,
});

const headerSetter = {
  set(carrier: Headers, key: string, value: string) {
    carrier.set(key, value);
  },
};

export async function POST(request: Request) {
  const session = (await getServerSession(authOptions)) as { user?: { id?: string; tenantId?: string } } | null;
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const headers = new Headers(request.headers);
  headers.set('x-user-id', session.user.id);

  const tenantId = session.user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return new Response(message, { status: 400 });
  }

  const normalizedBody = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const conversationId = typeof normalizedBody.conversationId === 'string' ? normalizedBody.conversationId : undefined;

  const spanAttributes = {
    'app.tenant.id': tenantId,
    'app.user.id': session.user.id,
    ...(conversationId ? { 'app.conversation.id': conversationId } : {}),
  };

  return requestContext.run(
    { tenantId, conversationId, userId: session.user.id },
    () =>
      withSpan('api.chat', spanAttributes, () => {
        const activeSpan = trace.getActiveSpan();
        const activeSpanContext = activeSpan?.spanContext();
        const traceContext =
          activeSpanContext && trace.isSpanContextValid(activeSpanContext)
            ? {
                traceId: activeSpanContext.traceId,
                rootSpanId: activeSpanContext.spanId,
                rootSpanName: 'name' in (activeSpan ?? {})
                  ? (activeSpan as { name?: string }).name
                  : undefined,
              }
            : undefined;

        const serializedBody = JSON.stringify({ ...normalizedBody, tenantId, traceContext });
        propagation.inject(context.active(), headers, headerSetter);

        return handler(
          new Request(request.url, {
            method: request.method,
            headers,
            body: serializedBody,
          }),
        );
      }),
  );
}
