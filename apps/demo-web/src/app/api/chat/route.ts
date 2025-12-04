/**
 * Chat API endpoint for Regulatory Intelligence Copilot
 *
 * Handles conversational queries about tax, welfare, pensions, and regulatory compliance.
 * Uses provider-agnostic ComplianceEngine via Next.js adapter.
 */

import { createChatRouteHandler } from '@reg-copilot/reg-intel-next-adapter';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth/options';
import {
  conversationContextStore,
  conversationEventHub,
  conversationStore,
} from '@/lib/server/conversations';

// Force dynamic rendering to avoid build-time initialization
export const dynamic = 'force-dynamic';

const handler = createChatRouteHandler({
  conversationStore,
  conversationContextStore,
  eventHub: conversationEventHub,
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const headers = new Headers(request.headers);
  headers.set('x-user-id', userId);

  const tenantId = session?.user?.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return new Response(message, { status: 400 });
  }

  const serializedBody = JSON.stringify({ ...(typeof body === 'object' && body !== null ? body : {}), tenantId });

  return handler(
    new Request(request.url, {
      method: request.method,
      headers,
      body: serializedBody,
    }),
  );
}
