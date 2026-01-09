-- Session Management Functions for Admin Panel
-- Provides functions to query and manage user sessions from auth.sessions

-- Function: get_user_sessions
-- Returns all sessions for a given user (for admin session management)
-- Requires service_role access

CREATE OR REPLACE FUNCTION public.get_user_sessions(
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  factor_id uuid,
  aal text,
  not_after timestamptz,
  refreshed_at timestamptz,
  user_agent text,
  ip text,
  tag text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    s.id,
    s.user_id,
    s.created_at,
    s.updated_at,
    s.factor_id,
    s.aal::text,
    s.not_after,
    s.refreshed_at,
    s.user_agent,
    s.ip::text,
    s.tag
  FROM auth.sessions s
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_sessions IS
  'Returns all sessions for a user. Used by admin panel for session management. Requires service_role.';

-- Function: revoke_user_session
-- Revokes (deletes) a specific session for a user
-- Returns true if session was found and deleted

CREATE OR REPLACE FUNCTION public.revoke_user_session(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_deleted boolean := false;
BEGIN
  -- Verify the session belongs to the specified user
  DELETE FROM auth.sessions
  WHERE id = p_session_id
    AND user_id = p_user_id;

  v_deleted := FOUND;

  IF v_deleted THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'revoked_at', NOW()
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or already revoked'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.revoke_user_session IS
  'Revokes a specific session for a user. Used by admin panel. Requires service_role.';

-- Function: revoke_all_user_sessions_except
-- Revokes all sessions for a user EXCEPT the specified session
-- Used when admin wants to log out all other devices but keep current session
-- Returns the count of revoked sessions

CREATE OR REPLACE FUNCTION public.revoke_all_user_sessions_except(
  p_user_id uuid,
  p_exclude_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_revoked_count integer := 0;
BEGIN
  -- Delete all sessions for the user EXCEPT the excluded one
  DELETE FROM auth.sessions
  WHERE user_id = p_user_id
    AND id != p_exclude_session_id;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'revoked_count', v_revoked_count,
    'excluded_session_id', p_exclude_session_id,
    'revoked_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_all_user_sessions_except IS
  'Revokes all sessions for a user except the specified one. Used by admin panel for "logout other devices" feature. Requires service_role.';

-- Grant access to service role only (admin operations)
GRANT EXECUTE ON FUNCTION public.get_user_sessions TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_session TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_all_user_sessions_except TO service_role;
