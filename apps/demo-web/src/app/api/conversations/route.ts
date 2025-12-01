import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { conversationStore } from '@/lib/server/conversations';
import { authOptions } from '@/lib/auth/options';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
  const conversations = await conversationStore.listConversations({ tenantId, limit: 50, userId });
  return NextResponse.json({ conversations });
}
