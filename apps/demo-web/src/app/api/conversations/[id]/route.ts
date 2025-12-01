import { NextResponse } from 'next/server';
import {
  conversationContextStore,
  conversationStore,
} from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const tenantId = 'default';
  const conversationId = context.params.id;
  const conversation = await conversationStore.getConversation({ tenantId, conversationId });

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await conversationStore.getMessages({ tenantId, conversationId, limit: 100 });
  const contextState = await conversationContextStore.load({ tenantId, conversationId });

  return NextResponse.json({ conversation, messages, context: contextState });
}
