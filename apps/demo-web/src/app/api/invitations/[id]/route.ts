import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth/options';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createUnrestrictedServiceClient } from '@/lib/supabase/tenantScopedServiceClient';

const logger = createLogger('CancelInvitationAPI');

interface CancelInvitationResult {
  success: boolean;
  error?: string;
  cancelled_at?: string;
}

/**
 * DELETE /api/invitations/[id]
 *
 * Cancel a pending workspace invitation.
 * Only workspace owners/admins can cancel invitations.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - no valid session' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const invitationId = id;

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID required' },
        { status: 400 }
      );
    }

    // SECURITY: Use unrestricted service client to call cancel RPC
    // The RPC function enforces owner/admin permission checks
    const supabase = createUnrestrictedServiceClient(
      'Cancelling workspace invitation - RPC validates permissions',
      userId
    );

    // Call Supabase function
    const { data, error } = await supabase
      .rpc('cancel_workspace_invitation', {
        p_invitation_id: invitationId,
        p_user_id: userId,
      })
      .single<CancelInvitationResult>();

    if (error) {
      logger.error({
        error,
        userId,
        invitationId,
      }, 'Database error cancelling invitation');

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data.success) {
      logger.warn({
        userId,
        invitationId,
        error: data.error,
      }, 'Invitation cancellation validation failed');

      return NextResponse.json(
        { error: data.error },
        { status: 400 }
      );
    }

    logger.info({
      userId,
      invitationId,
    }, 'Workspace invitation cancelled successfully');

    return NextResponse.json({
      success: true,
      cancelledAt: data.cancelled_at,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to cancel invitation';
    logger.error({ error }, 'Unexpected error cancelling invitation');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
