import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth/options';
import {
  conversationContextStore,
  conversationStore,
  conversationListEventHub,
} from '@/lib/server/conversations';
import { toClientConversation } from '@/lib/server/conversationPresenter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await context.params;
  const session = (await getServerSession(authOptions)) as { user?: { id?: string; tenantId?: string } } | null;
  const user = session?.user;
  const userId = user?.id;
  if (!userId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
  const conversation = await conversationStore.getConversation({ tenantId, conversationId, userId });

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await conversationStore.getMessages({ tenantId, conversationId, userId, limit: 100 });
  const contextState = await conversationContextStore.load({ tenantId, conversationId });

  return NextResponse.json({
    conversation: toClientConversation(conversation),
    messages,
    context: contextState,
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await context.params;
  const session = (await getServerSession(authOptions)) as { user?: { id?: string; tenantId?: string } } | null;
  const user = session?.user;
  const userId = user?.id;
  if (!userId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
  const body = await request.json().catch(() => null);
  const shareAudience = body?.shareAudience;
  const tenantAccess = body?.tenantAccess;
  const authorizationModel = body?.authorizationModel;
  const title = typeof body?.title === 'string' ? body.title : undefined;
  const archived = typeof body?.archived === 'boolean' ? body.archived : undefined;
  const allowedAudiences = ['private', 'tenant', 'public'];
  const allowedTenantAccess = ['view', 'edit'];
  const allowedAuthorizationModels = ['supabase_rbac', 'openfga'];
  if (shareAudience && !allowedAudiences.includes(shareAudience)) {
    return NextResponse.json({ error: 'Invalid shareAudience' }, { status: 400 });
  }
  if (tenantAccess && !allowedTenantAccess.includes(tenantAccess)) {
    return NextResponse.json({ error: 'Invalid tenantAccess' }, { status: 400 });
  }
  if (authorizationModel && !allowedAuthorizationModels.includes(authorizationModel)) {
    return NextResponse.json({ error: 'Invalid authorizationModel' }, { status: 400 });
  }
  try {
    if (archived !== undefined) {
      await conversationStore.setArchivedState({
        tenantId,
        conversationId,
        userId,
        archived,
      });
    }
    if (shareAudience !== undefined || tenantAccess !== undefined || authorizationModel !== undefined || title !== undefined) {
      await conversationStore.updateSharing({
        tenantId,
        conversationId,
        userId,
        shareAudience,
        tenantAccess,
        authorizationModel,
        title,
      });
    }
    const updatedConversation = await conversationStore.getConversation({ tenantId, conversationId, userId });
    if (updatedConversation) {
      conversationListEventHub.broadcast(tenantId, 'upsert', {
        conversation: toClientConversation(updatedConversation),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return NextResponse.json({ status: 'ok' });
}
