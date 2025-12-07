-- Migration: Enforce path constraints and add foreign keys
-- This migration makes path_id NOT NULL and adds all foreign key constraints.
-- Run this AFTER the data migration is complete.

-- =============================================================================
-- STEP 1: Make path_id NOT NULL
-- =============================================================================

-- Ensure no NULL path_ids before adding constraint
DO $$
DECLARE
    null_count integer;
BEGIN
    SELECT COUNT(*) INTO null_count
    FROM copilot_internal.conversation_messages
    WHERE path_id IS NULL;

    IF null_count > 0 THEN
        RAISE EXCEPTION 'Cannot enforce NOT NULL: % messages still have NULL path_id. Run migration 20241207000002 first.', null_count;
    END IF;
END $$;

-- Now make path_id NOT NULL
ALTER TABLE copilot_internal.conversation_messages
    ALTER COLUMN path_id SET NOT NULL;

-- =============================================================================
-- STEP 2: Add foreign key from messages to paths
-- =============================================================================

ALTER TABLE copilot_internal.conversation_messages
    DROP CONSTRAINT IF EXISTS fk_message_path;

ALTER TABLE copilot_internal.conversation_messages
    ADD CONSTRAINT fk_message_path
    FOREIGN KEY (path_id)
    REFERENCES copilot_internal.conversation_paths(id)
    ON DELETE CASCADE;

-- =============================================================================
-- STEP 3: Add foreign key from paths to branch point message
-- =============================================================================

ALTER TABLE copilot_internal.conversation_paths
    DROP CONSTRAINT IF EXISTS fk_branch_point_message;

ALTER TABLE copilot_internal.conversation_paths
    ADD CONSTRAINT fk_branch_point_message
    FOREIGN KEY (branch_point_message_id)
    REFERENCES copilot_internal.conversation_messages(id)
    ON DELETE SET NULL;

-- =============================================================================
-- STEP 4: Add foreign key from paths to merge summary message
-- =============================================================================

ALTER TABLE copilot_internal.conversation_paths
    DROP CONSTRAINT IF EXISTS fk_merge_summary_message;

ALTER TABLE copilot_internal.conversation_paths
    ADD CONSTRAINT fk_merge_summary_message
    FOREIGN KEY (merge_summary_message_id)
    REFERENCES copilot_internal.conversation_messages(id)
    ON DELETE SET NULL;

-- =============================================================================
-- STEP 5: Add trigger to update path timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION copilot_internal.update_path_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_path_timestamp ON copilot_internal.conversation_paths;
CREATE TRIGGER trg_update_path_timestamp
    BEFORE UPDATE ON copilot_internal.conversation_paths
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_path_timestamp();

-- =============================================================================
-- STEP 6: Add trigger to mark message as branch point when path created
-- =============================================================================

CREATE OR REPLACE FUNCTION copilot_internal.mark_branch_point()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- When a new path is created with a branch_point_message_id,
    -- mark that message as a branch point
    IF NEW.branch_point_message_id IS NOT NULL THEN
        UPDATE copilot_internal.conversation_messages
        SET
            is_branch_point = true,
            branched_to_paths = array_append(
                COALESCE(branched_to_paths, '{}'),
                NEW.id
            )
        WHERE id = NEW.branch_point_message_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_branch_point ON copilot_internal.conversation_paths;
CREATE TRIGGER trg_mark_branch_point
    AFTER INSERT ON copilot_internal.conversation_paths
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.mark_branch_point();

-- =============================================================================
-- STEP 7: Create function to resolve messages for a path (with inheritance)
-- =============================================================================

-- This function returns all messages visible in a path, including inherited
-- messages from ancestor paths up to their branch points.
CREATE OR REPLACE FUNCTION copilot_internal.resolve_path_messages(p_path_id uuid)
RETURNS TABLE(
    id uuid,
    conversation_id uuid,
    path_id uuid,
    tenant_id uuid,
    user_id uuid,
    role text,
    content text,
    metadata jsonb,
    sequence_in_path integer,
    is_branch_point boolean,
    branched_to_paths uuid[],
    message_type text,
    created_at timestamptz,
    effective_sequence integer  -- Order in the resolved view
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_path record;
    v_branch_point_seq integer;
BEGIN
    -- Get path info
    SELECT * INTO v_path
    FROM copilot_internal.conversation_paths
    WHERE copilot_internal.conversation_paths.id = p_path_id;

    IF v_path IS NULL THEN
        RETURN;
    END IF;

    -- If this path has a parent, get inherited messages first
    IF v_path.parent_path_id IS NOT NULL THEN
        -- Get the sequence number of the branch point in the parent path
        SELECT m.sequence_in_path INTO v_branch_point_seq
        FROM copilot_internal.conversation_messages m
        WHERE m.id = v_path.branch_point_message_id;

        -- Return inherited messages from parent (recursively) up to branch point
        RETURN QUERY
        WITH parent_messages AS (
            SELECT * FROM copilot_internal.resolve_path_messages(v_path.parent_path_id)
        )
        SELECT
            pm.id,
            pm.conversation_id,
            pm.path_id,
            pm.tenant_id,
            pm.user_id,
            pm.role,
            pm.content,
            pm.metadata,
            pm.sequence_in_path,
            pm.is_branch_point,
            pm.branched_to_paths,
            pm.message_type,
            pm.created_at,
            pm.effective_sequence
        FROM parent_messages pm
        WHERE pm.effective_sequence <= v_branch_point_seq;
    END IF;

    -- Return this path's own messages
    RETURN QUERY
    SELECT
        m.id,
        m.conversation_id,
        m.path_id,
        m.tenant_id,
        m.user_id,
        m.role,
        m.content,
        m.metadata,
        m.sequence_in_path,
        m.is_branch_point,
        m.branched_to_paths,
        m.message_type,
        m.created_at,
        -- If this is a child path, offset sequence by parent's branch point
        CASE
            WHEN v_path.parent_path_id IS NOT NULL THEN
                COALESCE(v_branch_point_seq, 0) + m.sequence_in_path
            ELSE
                m.sequence_in_path
        END AS effective_sequence
    FROM copilot_internal.conversation_messages m
    WHERE m.path_id = p_path_id
    ORDER BY m.sequence_in_path;
END;
$$;

GRANT EXECUTE ON FUNCTION copilot_internal.resolve_path_messages(uuid) TO service_role;

-- =============================================================================
-- STEP 8: Create view for resolved path messages
-- =============================================================================

-- Note: This view requires a path_id parameter, so it's a function-based approach
-- Usage: SELECT * FROM copilot_internal.resolve_path_messages('path-uuid');

-- =============================================================================
-- STEP 9: Add conversation active_path_id for quick access
-- =============================================================================

ALTER TABLE copilot_internal.conversations
    ADD COLUMN IF NOT EXISTS active_path_id uuid;

-- Add foreign key (deferred to allow circular reference resolution)
ALTER TABLE copilot_internal.conversations
    DROP CONSTRAINT IF EXISTS fk_active_path;

ALTER TABLE copilot_internal.conversations
    ADD CONSTRAINT fk_active_path
    FOREIGN KEY (active_path_id)
    REFERENCES copilot_internal.conversation_paths(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- Set active_path_id to primary path for existing conversations
UPDATE copilot_internal.conversations c
SET active_path_id = (
    SELECT p.id
    FROM copilot_internal.conversation_paths p
    WHERE p.conversation_id = c.id AND p.is_primary = true
    LIMIT 1
)
WHERE c.active_path_id IS NULL;

-- Update conversations_view to include active_path_id
CREATE OR REPLACE VIEW public.conversations_view AS
    WITH request_context AS (
        SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
    )
    SELECT
        c.id,
        c.tenant_id,
        c.user_id,
        c.share_audience,
        c.tenant_access,
        c.authorization_model,
        c.authorization_spec,
        c.title,
        c.persona_id,
        c.jurisdictions,
        c.archived_at,
        c.created_at,
        c.updated_at,
        c.last_message_at,
        c.active_path_id,
        c.trace_id,
        c.root_span_name,
        c.root_span_id
    FROM copilot_internal.conversations c
    CROSS JOIN request_context ctx
    WHERE ctx.requester_role = 'service_role'
       OR (ctx.tenant_id IS NOT NULL AND c.tenant_id = ctx.tenant_id);

-- =============================================================================
-- STEP 10: Final verification
-- =============================================================================

DO $$
DECLARE
    msg_without_path integer;
    path_without_conv integer;
    conv_without_path integer;
BEGIN
    -- All messages must have a path
    SELECT COUNT(*) INTO msg_without_path
    FROM copilot_internal.conversation_messages
    WHERE path_id IS NULL;

    IF msg_without_path > 0 THEN
        RAISE EXCEPTION 'Constraint enforcement failed: % messages without path_id', msg_without_path;
    END IF;

    -- All paths must reference valid conversations
    SELECT COUNT(*) INTO path_without_conv
    FROM copilot_internal.conversation_paths p
    LEFT JOIN copilot_internal.conversations c ON c.id = p.conversation_id
    WHERE c.id IS NULL;

    IF path_without_conv > 0 THEN
        RAISE EXCEPTION 'Constraint enforcement failed: % paths without valid conversation', path_without_conv;
    END IF;

    -- All conversations should have at least one path (the primary)
    SELECT COUNT(*) INTO conv_without_path
    FROM copilot_internal.conversations c
    LEFT JOIN copilot_internal.conversation_paths p ON p.conversation_id = c.id
    WHERE p.id IS NULL;

    IF conv_without_path > 0 THEN
        RAISE WARNING 'Note: % conversations have no paths yet (likely new/empty)', conv_without_path;
    END IF;

    RAISE NOTICE 'All path constraints enforced successfully';
END $$;
