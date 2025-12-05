import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { conversationStore } from '@/lib/server/conversations';
import { toClientConversation } from '@/lib/server/conversationPresenter';
import { authOptions } from '@/lib/auth/options';

export const dynamic = 'force-dynamic';

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
  const conversations = await conversationStore.listConversations({ tenantId, limit: 50, userId, status });
  return NextResponse.json({ conversations: conversations.map(toClientConversation) });
}
