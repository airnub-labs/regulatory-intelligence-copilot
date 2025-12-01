import { NextRequest, NextResponse } from 'next/server';
import { conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tenantId = 'default';
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const conversations = await conversationStore.listConversations({ tenantId, limit: 50, userId });
  return NextResponse.json({ conversations });
}
