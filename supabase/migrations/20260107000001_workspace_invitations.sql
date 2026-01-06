-- ============================================================================
-- Workspace Invitations - Simplified Supabase-Native Implementation
-- ============================================================================
--
-- This migration implements workspace invitations leveraging Supabase's
-- built-in features as much as possible:
-- - Uses existing tenant_memberships table with status='invited'
-- - Simple invitation tokens for tracking
-- - Leverages Supabase Auth for user management
-- - Minimal custom logic
--
-- Part of: HIGH-2 Implementation (OUTSTANDING_ISSUES.md)
-- ============================================================================

-- Create simple invitations tracking table
CREATE TABLE copilot_internal.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES copilot_internal.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Partial unique index: one pending invitation per tenant+email
-- (PostgreSQL doesn't support WHERE clauses in table-level UNIQUE constraints)
CREATE UNIQUE INDEX unique_pending_invitation
  ON copilot_internal.workspace_invitations(tenant_id, email)
  WHERE accepted_at IS NULL AND expires_at > NOW();

CREATE INDEX idx_workspace_invitations_token ON copilot_internal.workspace_invitations(token)
  WHERE accepted_at IS NULL;
CREATE INDEX idx_workspace_invitations_email ON copilot_internal.workspace_invitations(email)
  WHERE accepted_at IS NULL;
CREATE INDEX idx_workspace_invitations_tenant ON copilot_internal.workspace_invitations(tenant_id);

COMMENT ON TABLE copilot_internal.workspace_invitations IS
  'Workspace invitation tracking. 7-day expiry. Uses Supabase Auth for user creation.';

-- Enable RLS
ALTER TABLE copilot_internal.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Users can see invitations for workspaces they belong to OR invitations sent to their email
CREATE POLICY invitations_view ON copilot_internal.workspace_invitations
  FOR SELECT
  USING (
    -- Members can see invitations for their workspaces
    tenant_id IN (
      SELECT tenant_id FROM copilot_internal.tenant_memberships
      WHERE user_id = auth.uid() AND status = 'active' AND deleted_at IS NULL
    )
    OR
    -- Users can see their own invitations
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Only owners/admins can create invitations
CREATE POLICY invitations_admin_insert ON copilot_internal.workspace_invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM copilot_internal.tenant_memberships
      WHERE tenant_id = workspace_invitations.tenant_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
        AND deleted_at IS NULL
    )
  );

-- Service role full access
CREATE POLICY invitations_service_role ON copilot_internal.workspace_invitations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Function: invite_user_to_workspace
-- ============================================================================
-- Simplified invitation creation leveraging Supabase Auth
-- - For existing users: Creates pending membership
-- - For new users: Creates invitation record
-- - Returns invite link for sharing
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invite_user_to_workspace(
  p_tenant_id uuid,
  p_email text,
  p_role text,
  p_invited_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation_id uuid;
  v_token text;
  v_existing_user_id uuid;
  v_tenant_name text;
  v_tenant_slug text;
  v_app_url text;
BEGIN
  -- Normalize email
  p_email := lower(trim(p_email));

  -- Validate role
  IF p_role NOT IN ('admin', 'member', 'viewer') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid role. Must be admin, member, or viewer.'
    );
  END IF;

  -- Verify inviter has permission (owner or admin)
  IF NOT EXISTS (
    SELECT 1 FROM copilot_internal.tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id = p_invited_by
      AND role IN ('owner', 'admin')
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only workspace owners and admins can invite members'
    );
  END IF;

  -- Get tenant info
  SELECT name, slug INTO v_tenant_name, v_tenant_slug
  FROM copilot_internal.tenants
  WHERE id = p_tenant_id AND deleted_at IS NULL;

  IF v_tenant_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Workspace not found'
    );
  END IF;

  -- Check if user already exists in Supabase Auth
  SELECT id INTO v_existing_user_id
  FROM auth.users
  WHERE email = p_email;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM copilot_internal.tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id = v_existing_user_id
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is already a member of this workspace'
    );
  END IF;

  -- Check for existing pending invitation
  IF EXISTS (
    SELECT 1 FROM copilot_internal.workspace_invitations
    WHERE tenant_id = p_tenant_id
      AND email = p_email
      AND accepted_at IS NULL
      AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User already has a pending invitation to this workspace'
    );
  END IF;

  -- Create invitation record
  INSERT INTO copilot_internal.workspace_invitations (
    tenant_id,
    email,
    role,
    invited_by
  ) VALUES (
    p_tenant_id,
    p_email,
    p_role,
    p_invited_by
  )
  RETURNING id, token INTO v_invitation_id, v_token;

  -- Build invite URL (can be customized via environment variable)
  v_app_url := COALESCE(
    current_setting('app.base_url', true),
    'http://localhost:3000'
  );

  -- Log invitation event
  RAISE NOTICE 'Workspace invitation created: % invited to % (%) by %',
    p_email, v_tenant_name, p_tenant_id, p_invited_by;

  RETURN jsonb_build_object(
    'success', true,
    'invitation_id', v_invitation_id,
    'token', v_token,
    'email', p_email,
    'workspace_name', v_tenant_name,
    'workspace_slug', v_tenant_slug,
    'role', p_role,
    'expires_at', NOW() + INTERVAL '7 days',
    'invite_url', format('%s/invite/%s', v_app_url, v_token),
    'user_exists', v_existing_user_id IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION public.invite_user_to_workspace IS
  'Invites a user to a workspace. Creates invitation record. Returns invite URL.';

-- ============================================================================
-- Function: accept_workspace_invitation
-- ============================================================================
-- Accepts a workspace invitation and creates membership
-- - Validates token and expiry
-- - Checks email match (if user logged in)
-- - Creates active membership
-- - Marks invitation as accepted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
  p_token text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation record;
  v_user_email text;
  v_membership_id uuid;
BEGIN
  -- Get current user if not provided
  IF p_user_id IS NULL THEN
    p_user_id := auth.uid();
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You must be logged in to accept an invitation'
    );
  END IF;

  -- Get invitation
  SELECT * INTO v_invitation
  FROM copilot_internal.workspace_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;

  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  -- Verify email matches invitation
  IF lower(v_user_email) != lower(v_invitation.email) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This invitation was sent to a different email address',
      'invited_email', v_invitation.email
    );
  END IF;

  -- Check if already a member (race condition check)
  IF EXISTS (
    SELECT 1 FROM copilot_internal.tenant_memberships
    WHERE tenant_id = v_invitation.tenant_id
      AND user_id = p_user_id
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    -- Mark as accepted anyway
    UPDATE copilot_internal.workspace_invitations
    SET accepted_at = NOW()
    WHERE id = v_invitation.id;

    RETURN jsonb_build_object(
      'success', true,
      'already_member', true,
      'tenant_id', v_invitation.tenant_id
    );
  END IF;

  -- Create membership
  INSERT INTO copilot_internal.tenant_memberships (
    tenant_id,
    user_id,
    role,
    status,
    joined_at,
    invited_by
  ) VALUES (
    v_invitation.tenant_id,
    p_user_id,
    v_invitation.role,
    'active',
    NOW(),
    v_invitation.invited_by
  )
  RETURNING id INTO v_membership_id;

  -- Mark invitation as accepted
  UPDATE copilot_internal.workspace_invitations
  SET accepted_at = NOW()
  WHERE id = v_invitation.id;

  -- Log acceptance
  RAISE NOTICE 'Workspace invitation accepted: % joined workspace %',
    p_user_id, v_invitation.tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_invitation.tenant_id,
    'role', v_invitation.role,
    'membership_id', v_membership_id
  );
END;
$$;

COMMENT ON FUNCTION public.accept_workspace_invitation IS
  'Accepts a workspace invitation. Creates active membership. Validates email match.';

-- ============================================================================
-- Function: cancel_workspace_invitation
-- ============================================================================
-- Cancels a pending invitation (admin only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_workspace_invitation(
  p_invitation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation record;
BEGIN
  -- Get invitation
  SELECT * INTO v_invitation
  FROM copilot_internal.workspace_invitations
  WHERE id = p_invitation_id
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invitation not found or already accepted'
    );
  END IF;

  -- Verify user has permission (owner or admin)
  IF NOT EXISTS (
    SELECT 1 FROM copilot_internal.tenant_memberships
    WHERE tenant_id = v_invitation.tenant_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin')
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only workspace owners and admins can cancel invitations'
    );
  END IF;

  -- Delete invitation
  DELETE FROM copilot_internal.workspace_invitations
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_workspace_invitation IS
  'Cancels a pending workspace invitation. Owner/admin only.';

-- ============================================================================
-- Function: get_pending_invitations (for user)
-- ============================================================================
-- Gets all pending invitations for the current user's email
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_pending_invitations()
RETURNS TABLE(
  invitation_id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role text,
  invited_by_email text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_email text;
BEGIN
  -- Get current user's email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = auth.uid();

  IF v_user_email IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.tenant_id,
    t.name,
    t.slug,
    i.role,
    u.email,
    i.expires_at,
    i.created_at
  FROM copilot_internal.workspace_invitations i
  JOIN copilot_internal.tenants t ON t.id = i.tenant_id
  JOIN auth.users u ON u.id = i.invited_by
  WHERE i.email = v_user_email
    AND i.accepted_at IS NULL
    AND i.expires_at > NOW()
    AND t.deleted_at IS NULL
  ORDER BY i.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_my_pending_invitations IS
  'Returns all pending workspace invitations for the current user.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.invite_user_to_workspace TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_workspace_invitation TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_pending_invitations TO authenticated;
