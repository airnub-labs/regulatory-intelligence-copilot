import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createUnrestrictedServiceClient } from '@/lib/supabase/tenantScopedServiceClient';

const logger = createLogger('InvitationsAPI');

/**
 * POST /api/invitations
 *
 * Invite a user to the current workspace.
 * Leverages Supabase's invite_user_to_workspace RPC function.
 *
 * Request body: { email: string, role: 'admin' | 'member' | 'viewer' }
 */
export async function POST(request: NextRequest) {
  let session: ExtendedSession | null = null;
  try {
    session = await getServerSession(authOptions) as ExtendedSession | null;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - no valid session' },
        { status: 401 }
      );
    }

    const { tenantId, userId } = await getTenantContext(session);

    const body = await request.json();
    const { email, role } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Valid role required: admin, member, or viewer' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    // SECURITY: Use unrestricted service client to call invitation RPC
    // The RPC function enforces permission checks internally
    const supabase = createUnrestrictedServiceClient(
      'Creating workspace invitation - RPC handles validation',
      userId,
      cookieStore
    );

    // Call Supabase function
    const { data, error } = await supabase
      .rpc('invite_user_to_workspace', {
        p_tenant_id: tenantId,
        p_email: email.toLowerCase().trim(),
        p_role: role,
        p_invited_by: userId,
      })
      .single();

    if (error) {
      logger.error({
        error,
        userId,
        tenantId,
        email,
      }, 'Database error during invitation creation');

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!(data as any).success) {
      logger.warn({
        userId,
        tenantId,
        email,
        error: (data as any).error,
      }, 'Invitation creation validation failed');

      return NextResponse.json(
        { error: (data as any).error },
        { status: 400 }
      );
    }

    logger.info({
      userId,
      tenantId,
      invitationId: (data as any).invitation_id,
      email: (data as any).email,
      role: (data as any).role,
      workspaceName: (data as any).workspace_name,
    }, 'Workspace invitation created successfully');

    // Return invitation details (including URL for sharing)
    return NextResponse.json({
      success: true,
      invitation: {
        id: (data as any).invitation_id,
        email: (data as any).email,
        role: (data as any).role,
        workspaceName: (data as any).workspace_name,
        inviteUrl: (data as any).invite_url,
        expiresAt: (data as any).expires_at,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create invitation';
    logger.error({ error, userId: session?.user?.id }, 'Unexpected error creating invitation');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invitations
 *
 * Get all pending invitations for the current user.
 * Uses Supabase's get_my_pending_invitations RPC function.
 */
export async function GET(request: NextRequest) {
  let session: ExtendedSession | null = null;
  try {
    session = await getServerSession(authOptions) as ExtendedSession | null;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - no valid session' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const cookieStore = await cookies();

    // SECURITY: Use unrestricted service client to get pending invitations
    // RPC function filters by user's email automatically
    const supabase = createUnrestrictedServiceClient(
      'Getting pending invitations - RPC filters by user email',
      userId,
      cookieStore
    );

    // Call Supabase function
    const { data, error } = await supabase
      .rpc('get_my_pending_invitations');

    if (error) {
      logger.error({
        error,
        userId,
      }, 'Database error getting pending invitations');

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      invitations: data || [],
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get invitations';
    logger.error({ error, userId: session?.user?.id }, 'Unexpected error getting invitations');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
