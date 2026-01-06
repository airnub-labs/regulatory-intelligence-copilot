import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth/options';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createUnrestrictedServiceClient } from '@/lib/supabase/tenantScopedServiceClient';

const logger = createLogger('AcceptInvitationAPI');

/**
 * POST /api/invitations/[token]/accept
 *
 * Accept a workspace invitation using the token.
 * Leverages Supabase's accept_workspace_invitation RPC function.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'You must be logged in to accept an invitation' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const token = params.token;

    if (!token) {
      return NextResponse.json(
        { error: 'Invitation token required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    // SECURITY: Use unrestricted service client to call accept RPC
    // The RPC function validates email match and creates membership
    const supabase = createUnrestrictedServiceClient(
      'Accepting workspace invitation - RPC validates email match',
      userId,
      cookieStore
    );

    // Call Supabase function
    const { data, error } = await supabase
      .rpc('accept_workspace_invitation', {
        p_token: token,
        p_user_id: userId,
      })
      .single();

    if (error) {
      logger.error({
        error,
        userId,
        token,
      }, 'Database error accepting invitation');

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data.success) {
      logger.warn({
        userId,
        token,
        error: data.error,
      }, 'Invitation acceptance validation failed');

      return NextResponse.json(
        { error: data.error },
        { status: 400 }
      );
    }

    logger.info({
      userId,
      tenantId: data.tenant_id,
      role: data.role,
      alreadyMember: data.already_member,
    }, 'Workspace invitation accepted successfully');

    // Return success with workspace details
    return NextResponse.json({
      success: true,
      workspaceId: data.tenant_id,
      role: data.role,
      alreadyMember: data.already_member || false,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to accept invitation';
    logger.error({ error, userId: session?.user?.id }, 'Unexpected error accepting invitation');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
