import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { conversationStore } from '@/lib/server/conversations';
import { authOptions } from '@/lib/auth/options';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const userId = user?.id;
  if (!userId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
  const conversations = await conversationStore.listConversations({ tenantId, limit: 50, userId });
  return NextResponse.json({ conversations });
}
