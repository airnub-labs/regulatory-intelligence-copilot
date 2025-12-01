import { NextResponse } from 'next/server';
import { conversationStore } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tenantId = 'default';
  const conversations = await conversationStore.listConversations({ tenantId, limit: 50 });
  return NextResponse.json({ conversations });
}
