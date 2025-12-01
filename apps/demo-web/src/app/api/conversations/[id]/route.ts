import { NextRequest, NextResponse } from 'next/server';
import {
  conversationContextStore,
  conversationStore,
} from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const tenantId = 'default';
  const conversationId = context.params.id;
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const conversation = await conversationStore.getConversation({ tenantId, conversationId, userId });

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await conversationStore.getMessages({ tenantId, conversationId, userId, limit: 100 });
  const contextState = await conversationContextStore.load({ tenantId, conversationId });

  return NextResponse.json({ conversation, messages, context: contextState });
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const tenantId = 'default';
  const conversationId = context.params.id;
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const sharingMode = body?.sharingMode;
  const allowedModes = ['private', 'tenant_read', 'tenant_write', 'public_read'];
  if (sharingMode && !allowedModes.includes(sharingMode)) {
    return NextResponse.json({ error: 'Invalid sharingMode' }, { status: 400 });
  }
  try {
    await conversationStore.updateSharing({ tenantId, conversationId, userId, sharingMode });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return NextResponse.json({ status: 'ok' });
}
