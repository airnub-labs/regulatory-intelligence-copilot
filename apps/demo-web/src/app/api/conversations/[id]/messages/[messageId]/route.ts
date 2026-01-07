import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { conversationStore, conversationEventHub } from '@/lib/server/conversations';
import { createUnrestrictedServiceClient } from '@/lib/supabase/tenantScopedServiceClient';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const logger = createLogger('MessageRoute');

/**
 * GET /api/conversations/[id]/messages/[messageId]
 * Get a single message by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id: conversationId, messageId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.message.get',
        {
          'app.route': '/api/conversations/[id]/messages/[messageId]',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.message.id': messageId,
        },
        async () => {
          // Verify conversation exists and user has access
          const conversation = await conversationStore.getConversation({
            tenantId,
            conversationId,
            userId,
          });

          if (!conversation) {
            logger.warn({ tenantId, userId, conversationId }, 'Conversation not found');
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
          }

          try {
            const cookieStore = await cookies();
            const supabase = createUnrestrictedServiceClient(
              'get-message',
              userId,
              cookieStore
            );

            const { data: message, error } = await supabase
              .from('conversation_messages_view')
              .select('*')
              .eq('id', messageId)
              .eq('conversation_id', conversationId)
              .eq('tenant_id', tenantId)
              .single();

            if (error || !message) {
              logger.warn({ tenantId, conversationId, messageId }, 'Message not found');
              return NextResponse.json({ error: 'Message not found' }, { status: 404 });
            }

            logger.info({ tenantId, conversationId, messageId }, 'Message retrieved successfully');

            return NextResponse.json({
              id: message.id,
              conversationId: message.conversation_id,
              pathId: message.path_id,
              role: message.role,
              content: message.content,
              metadata: message.metadata ?? {},
              sequenceInPath: message.sequence_in_path,
              isBranchPoint: message.is_branch_point,
              branchedToPaths: message.branched_to_paths ?? [],
              messageType: message.message_type,
              isPinned: message.is_pinned ?? false,
              pinnedAt: message.pinned_at ?? null,
              pinnedBy: message.pinned_by ?? null,
              createdAt: message.created_at,
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, messageId, error }, 'Failed to get message');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 500 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, messageId }, 'Error in GET message');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/conversations/[id]/messages/[messageId]
 * Update message metadata (not content - content edits create branches)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id: conversationId, messageId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.message.patch',
        {
          'app.route': '/api/conversations/[id]/messages/[messageId]',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.message.id': messageId,
        },
        async () => {
          // Verify conversation exists and user has access
          const conversation = await conversationStore.getConversation({
            tenantId,
            conversationId,
            userId,
          });

          if (!conversation) {
            logger.warn({ tenantId, userId, conversationId }, 'Conversation not found');
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
          }

          let body: { metadata?: Record<string, unknown> };
          try {
            body = await request.json();
          } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
          }

          // Only metadata updates are allowed - content edits should create branches
          if (!body.metadata) {
            return NextResponse.json(
              { error: 'Only metadata updates are allowed. Content edits create branches.' },
              { status: 400 }
            );
          }

          try {
            const cookieStore = await cookies();
            const supabase = createUnrestrictedServiceClient(
              'update-message-metadata',
              userId,
              cookieStore
            );

            // First verify the message exists and belongs to this conversation
            const { data: existingMessage, error: fetchError } = await supabase
              .from('conversation_messages_view')
              .select('id, metadata')
              .eq('id', messageId)
              .eq('conversation_id', conversationId)
              .eq('tenant_id', tenantId)
              .single();

            if (fetchError || !existingMessage) {
              logger.warn({ tenantId, conversationId, messageId }, 'Message not found for update');
              return NextResponse.json({ error: 'Message not found' }, { status: 404 });
            }

            // Merge new metadata with existing (with validation)
            const existingMetadata = (existingMessage.metadata as Record<string, unknown>) ?? {};

            // Whitelist of allowed metadata keys to prevent injection
            const ALLOWED_METADATA_KEYS = [
              'agentUsed',
              'jurisdictions',
              'uncertaintyLevel',
              'referencedNodes',
              'customTags',
              'priority',
            ];

            // Validate and filter metadata
            const validatedMetadata: Record<string, unknown> = {};
            if (body.metadata && typeof body.metadata === 'object') {
              for (const key of Object.keys(body.metadata)) {
                if (ALLOWED_METADATA_KEYS.includes(key)) {
                  validatedMetadata[key] = body.metadata[key];
                }
              }
            }

            const updatedMetadata = {
              ...existingMetadata,
              ...validatedMetadata,
              updatedAt: new Date().toISOString(),
              updatedBy: userId, // Always last to prevent override
            };

            // Update the message metadata
            const { error: updateError } = await supabase
              .from('conversation_messages')
              .update({ metadata: updatedMetadata })
              .eq('id', messageId);

            if (updateError) {
              throw new Error(`Failed to update message: ${updateError.message}`);
            }

            // Broadcast SSE event for metadata change
            conversationEventHub.broadcast(tenantId, conversationId, 'metadata', {
              messageId,
              metadata: updatedMetadata,
              updatedBy: userId,
            });

            logger.info({ tenantId, conversationId, messageId, userId }, 'Message metadata updated');

            return NextResponse.json({
              success: true,
              messageId,
              metadata: updatedMetadata,
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, messageId, error }, 'Failed to update message');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 500 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, messageId }, 'Error in PATCH message');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[id]/messages/[messageId]
 * Soft-delete a message (marks as deleted in metadata)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id: conversationId, messageId } = await context.params;

  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.conversations.message.delete',
        {
          'app.route': '/api/conversations/[id]/messages/[messageId]',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
          'app.conversation.id': conversationId,
          'app.message.id': messageId,
        },
        async () => {
          // Verify conversation exists and user has access
          const conversation = await conversationStore.getConversation({
            tenantId,
            conversationId,
            userId,
          });

          if (!conversation) {
            logger.warn({ tenantId, userId, conversationId }, 'Conversation not found');
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
          }

          try {
            // Use the existing softDeleteMessage from conversationStore
            await conversationStore.softDeleteMessage({
              tenantId,
              conversationId,
              messageId,
              userId,
            });

            // Broadcast SSE event for message deletion
            conversationEventHub.broadcast(tenantId, conversationId, 'message', {
              messageId,
              deletedBy: userId,
              deletedAt: new Date().toISOString(),
            });

            logger.info({ tenantId, conversationId, messageId, userId }, 'Message soft-deleted');

            return NextResponse.json({
              success: true,
              messageId,
              deleted: true,
            });
          } catch (error) {
            logger.error({ tenantId, conversationId, messageId, error }, 'Failed to delete message');
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ error: message }, { status: 400 });
          }
        },
      ),
    );
  } catch (error) {
    logger.error({ error, conversationId, messageId }, 'Error in DELETE message');
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
