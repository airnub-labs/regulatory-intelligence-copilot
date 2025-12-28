import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { conversationStore } from '@/lib/server/conversations';
import { toClientConversation } from '@/lib/server/conversationPresenter';
import { authOptions } from '@/lib/auth/options';

export const dynamic = 'force-dynamic';

const logger = createLogger('ConversationsRoute');

export async function GET(request: NextRequest) {
  const session = (await getServerSession(authOptions)) as { user?: { id?: string; tenantId?: string } } | null;
  const user = session?.user;
  const userId = user?.id;
  if (!userId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const status = statusParam === 'archived' || statusParam === 'all' ? (statusParam as 'archived' | 'all') : 'active';
  const limitParam = url.searchParams.get('limit');
  // SEC.3: Add pagination bounds validation (min: 1, max: 100) to prevent resource exhaustion
  const limit = Math.min(
    Math.max(1, isNaN(parseInt(limitParam || '50', 10)) ? 50 : parseInt(limitParam || '50', 10)),
    100
  );
  const cursor = url.searchParams.get('cursor') || null;

  const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
  return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.list',
        {
          'app.route': '/api/conversations',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.pagination.limit': limit,
          'app.pagination.has_cursor': Boolean(cursor),
        },
        async () => {
          const result = await conversationStore.listConversations({
            tenantId,
            limit,
            userId,
            status,
            cursor,
          });

          logger.info({
            tenantId,
            userId,
            status,
            count: result.conversations.length,
            hasMore: result.hasMore,
            hasCursor: Boolean(cursor),
          }, 'Fetched conversations');

          return NextResponse.json({
            conversations: result.conversations.map(toClientConversation),
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
          });
        },
      ),
  );
}
