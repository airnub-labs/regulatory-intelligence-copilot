import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { createUnrestrictedServiceClient } from '@/lib/supabase/tenantScopedServiceClient';

const logger = createLogger('WorkspaceDeletionAPI');

/**
 * DELETE /api/workspaces/[id]
 *
 * Soft deletes a workspace with the following validations:
 * - Personal workspaces cannot be deleted
 * - Only workspace owners can delete
 * - No active execution contexts allowed
 * - 30-day grace period for restoration
 *
 * If user deletes their active workspace, automatically switches to another available workspace.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: workspaceId } = await params;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    // SECURITY: Use unrestricted service client to call deletion RPC
    // This is valid because the RPC function enforces ownership checks internally
    const supabase = createUnrestrictedServiceClient(
      'Workspace deletion - calling RPC with internal validation',
      userId,
      cookieStore
    );

    // Call deletion function
    const { data, error } = await supabase
      .rpc('delete_workspace', {
        p_tenant_id: workspaceId,
        p_user_id: userId,
      })
      .single();

    if (error) {
      logger.error({
        error,
        userId,
        workspaceId,
      }, 'Database error during workspace deletion');

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data.success) {
      logger.warn({
        userId,
        workspaceId,
        error: data.error,
      }, 'Workspace deletion validation failed');

      return NextResponse.json(
        { error: data.error, details: data },
        { status: 400 }
      );
    }

    logger.info({
      userId,
      workspaceId,
      workspaceName: data.workspace_name,
      membersAffected: data.members_affected,
    }, 'Workspace deleted successfully');

    // If user deleted their active workspace, switch to another
    if (session.user.currentTenantId === workspaceId) {
      logger.info({
        userId,
        deletedWorkspaceId: workspaceId,
      }, 'User deleted active workspace - switching to alternative');

      // Get user's other workspaces
      const { data: tenants, error: tenantsError } = await supabase
        .rpc('get_user_tenants', { p_user_id: userId });

      if (!tenantsError && tenants && tenants.length > 0) {
        // Find first non-deleted workspace
        const alternativeTenant = tenants.find((t: any) => t.deleted_at === null);

        if (alternativeTenant) {
          logger.info({
            userId,
            newTenantId: alternativeTenant.tenant_id,
            newTenantName: alternativeTenant.tenant_name,
          }, 'Switching to alternative workspace');

          // Switch to first available workspace
          await supabase.rpc('switch_tenant', {
            p_tenant_id: alternativeTenant.tenant_id,
          });
        } else {
          logger.warn({
            userId,
          }, 'No alternative workspace found after deletion - user may need to create one');
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...data,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Workspace deletion failed';
    logger.error({ error, userId: session?.user?.id }, 'Unexpected error during workspace deletion');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspaces/[id]
 *
 * Restores a soft-deleted workspace with the following validations:
 * - Must be within 30-day grace period
 * - Only user who deleted can restore
 * - Restores workspace and all memberships
 *
 * Request body: { action: 'restore' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: workspaceId } = await params;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (action !== 'restore') {
      return NextResponse.json(
        { error: 'Invalid action. Only "restore" is supported.' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    // SECURITY: Use unrestricted service client to call restoration RPC
    // This is valid because the RPC function enforces ownership checks internally
    const supabase = createUnrestrictedServiceClient(
      'Workspace restoration - calling RPC with internal validation',
      userId,
      cookieStore
    );

    const { data, error } = await supabase
      .rpc('restore_workspace', {
        p_tenant_id: workspaceId,
        p_user_id: userId,
      })
      .single();

    if (error) {
      logger.error({
        error,
        userId,
        workspaceId,
      }, 'Database error during workspace restoration');

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data.success) {
      logger.warn({
        userId,
        workspaceId,
        error: data.error,
      }, 'Workspace restoration validation failed');

      return NextResponse.json(
        { error: data.error, details: data },
        { status: 400 }
      );
    }

    logger.info({
      userId,
      workspaceId,
      workspaceName: data.workspace_name,
      membersRestored: data.members_restored,
    }, 'Workspace restored successfully');

    return NextResponse.json({
      success: true,
      ...data,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Workspace restoration failed';
    logger.error({ error, userId: session?.user?.id }, 'Unexpected error during workspace restoration');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspaces/[id]
 *
 * Get workspace details including deletion status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: workspaceId } = await params;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    // SECURITY: Use unrestricted service client to query workspace
    // We need unrestricted access to see deleted workspaces (for restore UI)
    const supabase = createUnrestrictedServiceClient(
      'Get workspace details including deletion status',
      userId,
      cookieStore
    );

    // Get workspace details
    const { data: workspace, error: workspaceError } = await supabase
      .from('tenants')
      .select('id, name, slug, type, plan, deleted_at, deleted_by, created_at')
      .eq('id', workspaceId)
      .single();

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Check if user is/was a member
    const { data: membership, error: membershipError } = await supabase
      .from('tenant_memberships')
      .select('role, status, joined_at, deleted_at')
      .eq('tenant_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403 }
      );
    }

    // Calculate restoration deadline if deleted
    let canRestore = false;
    let restoreDeadline = null;
    let daysUntilPermanentDeletion = null;

    if (workspace.deleted_at) {
      const deletedDate = new Date(workspace.deleted_at);
      const now = new Date();
      const daysSinceDeletion = Math.floor((now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24));
      const gracePeriodDays = 30;

      daysUntilPermanentDeletion = gracePeriodDays - daysSinceDeletion;
      canRestore = daysUntilPermanentDeletion > 0 && workspace.deleted_by === userId;

      if (canRestore) {
        const deadline = new Date(deletedDate);
        deadline.setDate(deadline.getDate() + gracePeriodDays);
        restoreDeadline = deadline.toISOString();
      }
    }

    return NextResponse.json({
      workspace: {
        ...workspace,
        canRestore,
        restoreDeadline,
        daysUntilPermanentDeletion,
      },
      membership,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get workspace details';
    logger.error({ error, userId: session?.user?.id }, 'Unexpected error getting workspace details');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
