-- ========================================
-- Message Pinning for Compaction Control
-- ========================================
-- This migration adds message pinning/marking capabilities to allow users
-- to preserve important messages during path compaction and merge operations.

-- Add pinning fields to conversation_messages
ALTER TABLE copilot_internal.conversation_messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid;

-- Create index for pinned messages (for efficient filtering during compaction)
CREATE INDEX IF NOT EXISTS idx_conversation_messages_pinned
    ON copilot_internal.conversation_messages(conversation_id, path_id, is_pinned)
    WHERE is_pinned = true;

-- Create index for pinned messages by user (for audit/analytics)
CREATE INDEX IF NOT EXISTS idx_conversation_messages_pinned_by
    ON copilot_internal.conversation_messages(pinned_by, pinned_at)
    WHERE is_pinned = true;

-- ========================================
-- Helper Functions
-- ========================================

-- Function to pin a message
CREATE OR REPLACE FUNCTION copilot_internal.pin_message(
    p_tenant_id uuid,
    p_conversation_id uuid,
    p_message_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE copilot_internal.conversation_messages
    SET
        is_pinned = true,
        pinned_at = now(),
        pinned_by = p_user_id
    WHERE
        tenant_id = p_tenant_id
        AND conversation_id = p_conversation_id
        AND id = p_message_id
        AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;

-- Function to unpin a message
CREATE OR REPLACE FUNCTION copilot_internal.unpin_message(
    p_tenant_id uuid,
    p_conversation_id uuid,
    p_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE copilot_internal.conversation_messages
    SET
        is_pinned = false,
        pinned_at = NULL,
        pinned_by = NULL
    WHERE
        tenant_id = p_tenant_id
        AND conversation_id = p_conversation_id
        AND id = p_message_id;

    RETURN FOUND;
END;
$$;

-- Function to get pinned messages for a path
CREATE OR REPLACE FUNCTION copilot_internal.get_pinned_messages(
    p_tenant_id uuid,
    p_conversation_id uuid,
    p_path_id uuid
)
RETURNS TABLE (
    message_id uuid,
    role text,
    content text,
    created_at timestamptz,
    pinned_at timestamptz,
    pinned_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.role,
        m.content,
        m.created_at,
        m.pinned_at,
        m.pinned_by
    FROM copilot_internal.conversation_messages m
    WHERE
        m.tenant_id = p_tenant_id
        AND m.conversation_id = p_conversation_id
        AND m.path_id = p_path_id
        AND m.is_pinned = true
        AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC;
END;
$$;

-- Function to get pinned message count for a conversation
CREATE OR REPLACE FUNCTION copilot_internal.get_pinned_message_count(
    p_tenant_id uuid,
    p_conversation_id uuid,
    p_path_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count integer;
BEGIN
    IF p_path_id IS NULL THEN
        -- Count across all paths in conversation
        SELECT COUNT(*)
        INTO v_count
        FROM copilot_internal.conversation_messages
        WHERE
            tenant_id = p_tenant_id
            AND conversation_id = p_conversation_id
            AND is_pinned = true
            AND deleted_at IS NULL;
    ELSE
        -- Count for specific path
        SELECT COUNT(*)
        INTO v_count
        FROM copilot_internal.conversation_messages
        WHERE
            tenant_id = p_tenant_id
            AND conversation_id = p_conversation_id
            AND path_id = p_path_id
            AND is_pinned = true
            AND deleted_at IS NULL;
    END IF;

    RETURN v_count;
END;
$$;

-- ========================================
-- RLS Policies for Pinning
-- ========================================

-- Users can pin their own messages in conversations they have access to
-- Note: Actual authorization should be enforced by application logic
-- These policies assume tenant_id matching for now

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION copilot_internal.pin_message TO authenticated;
GRANT EXECUTE ON FUNCTION copilot_internal.unpin_message TO authenticated;
GRANT EXECUTE ON FUNCTION copilot_internal.get_pinned_messages TO authenticated;
GRANT EXECUTE ON FUNCTION copilot_internal.get_pinned_message_count TO authenticated;

-- Comments for documentation
COMMENT ON COLUMN copilot_internal.conversation_messages.is_pinned IS 'Whether this message is pinned to prevent compaction';
COMMENT ON COLUMN copilot_internal.conversation_messages.pinned_at IS 'When the message was pinned';
COMMENT ON COLUMN copilot_internal.conversation_messages.pinned_by IS 'User who pinned the message';
COMMENT ON FUNCTION copilot_internal.pin_message IS 'Pin a message to preserve it during compaction and merging';
COMMENT ON FUNCTION copilot_internal.unpin_message IS 'Unpin a message to allow it to be compacted';
COMMENT ON FUNCTION copilot_internal.get_pinned_messages IS 'Get all pinned messages for a conversation path';
COMMENT ON FUNCTION copilot_internal.get_pinned_message_count IS 'Count pinned messages in a conversation or path';
