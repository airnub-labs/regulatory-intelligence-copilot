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
  const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
  return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.list',
        { 'app.route': '/api/conversations', 'app.tenant.id': tenantId, 'app.user.id': userId },
        async () => {
          const conversations = await conversationStore.listConversations({ tenantId, limit: 50, userId, status });
          logger.info({ tenantId, userId, status, count: conversations.length }, 'Fetched conversations');
          return NextResponse.json({ conversations: conversations.map(toClientConversation) });
        },
      ),
  );
}
