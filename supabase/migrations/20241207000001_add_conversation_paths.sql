-- Migration: Add conversation paths for branching and merging
-- This migration introduces the path-based conversation model.
-- BREAKING CHANGE: supersededBy pattern is deprecated in favor of explicit paths.

-- =============================================================================
-- STEP 1: Create conversation_paths table
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_internal.conversation_paths (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL
        REFERENCES copilot_internal.conversations(id)
        ON DELETE CASCADE,
    tenant_id uuid NOT NULL,

    -- Path lineage: parent path and the message where this branch started
    parent_path_id uuid
        REFERENCES copilot_internal.conversation_paths(id)
        ON DELETE SET NULL,
    branch_point_message_id uuid,  -- FK can be added later once message columns are updated

    -- Path metadata
    name text,                     -- Optional name for the branch (e.g., "PRSI Deep Dive")
    description text,              -- Optional description of branch purpose
    is_primary boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,

    -- Merge tracking
    merged_to_path_id uuid
        REFERENCES copilot_internal.conversation_paths(id)
        ON DELETE SET NULL,
    merged_at timestamptz,
    merge_summary_message_id uuid, -- FK can be added later once message columns are updated
    merge_mode text CHECK (merge_mode IS NULL OR merge_mode IN ('summary', 'full', 'selective')),

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Optional: index to help RLS / tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_conversation_paths_tenant
    ON copilot_internal.conversation_paths(tenant_id);

-- Partial unique index: only one primary path per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_paths_primary
    ON copilot_internal.conversation_paths(conversation_id)
    WHERE is_primary = true;

-- =============================================================================
-- STEP 2: Add path columns to conversation_messages
-- =============================================================================

-- Add path_id column (nullable initially, will be made NOT NULL after migration)
ALTER TABLE copilot_internal.conversation_messages
    ADD COLUMN IF NOT EXISTS path_id uuid;

-- Add sequence_in_path for ordering within a path
ALTER TABLE copilot_internal.conversation_messages
    ADD COLUMN IF NOT EXISTS sequence_in_path integer;

-- Add branch tracking columns
ALTER TABLE copilot_internal.conversation_messages
    ADD COLUMN IF NOT EXISTS is_branch_point boolean NOT NULL DEFAULT false;

ALTER TABLE copilot_internal.conversation_messages
    ADD COLUMN IF NOT EXISTS branched_to_paths uuid[] DEFAULT '{}';

-- Add message type for special messages (merge summaries, system messages)
ALTER TABLE copilot_internal.conversation_messages
    ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'standard'
    CHECK (message_type IN ('standard', 'merge_summary', 'branch_point', 'system'));

-- =============================================================================
-- STEP 3: Create indexes for efficient path queries
-- =============================================================================

-- Index for fetching messages in a path (ordered)
CREATE INDEX IF NOT EXISTS idx_messages_path_sequence
    ON copilot_internal.conversation_messages(path_id, sequence_in_path)
    WHERE path_id IS NOT NULL;

-- Index for finding paths in a conversation
CREATE INDEX IF NOT EXISTS idx_paths_conversation
    ON copilot_internal.conversation_paths(conversation_id, is_active);

-- Index for finding child paths
CREATE INDEX IF NOT EXISTS idx_paths_parent
    ON copilot_internal.conversation_paths(parent_path_id)
    WHERE parent_path_id IS NOT NULL;

-- Index for finding merged paths
CREATE INDEX IF NOT EXISTS idx_paths_merged
    ON copilot_internal.conversation_paths(merged_to_path_id)
    WHERE merged_to_path_id IS NOT NULL;

-- Index for finding branch points
CREATE INDEX IF NOT EXISTS idx_messages_branch_points
    ON copilot_internal.conversation_messages(conversation_id, is_branch_point)
    WHERE is_branch_point = true;

-- =============================================================================
-- STEP 4: Enable RLS on conversation_paths
-- =============================================================================

ALTER TABLE copilot_internal.conversation_paths ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY conversation_paths_service_role_full_access
    ON copilot_internal.conversation_paths
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read paths in their tenant
CREATE POLICY conversation_paths_tenant_read
    ON copilot_internal.conversation_paths
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.current_tenant_id());

-- Authenticated users can create paths in their tenant
CREATE POLICY conversation_paths_tenant_write
    ON copilot_internal.conversation_paths
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = public.current_tenant_id());

-- Authenticated users can update paths in their tenant
CREATE POLICY conversation_paths_tenant_update
    ON copilot_internal.conversation_paths
    FOR UPDATE
    TO authenticated
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

-- Authenticated users can delete paths in their tenant
CREATE POLICY conversation_paths_tenant_delete
    ON copilot_internal.conversation_paths
    FOR DELETE
    TO authenticated
    USING (tenant_id = public.current_tenant_id());

-- =============================================================================
-- STEP 5: Create view for conversation_paths
-- =============================================================================

CREATE OR REPLACE VIEW public.conversation_paths_view AS
    WITH request_context AS (
        SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
    )
    SELECT
        p.id,
        p.conversation_id,
        p.tenant_id,
        p.parent_path_id,
        p.branch_point_message_id,
        p.name,
        p.description,
        p.is_primary,
        p.is_active,
        p.merged_to_path_id,
        p.merged_at,
        p.merge_summary_message_id,
        p.merge_mode,
        p.created_at,
        p.updated_at,
        -- Computed: count of messages in this path
        (SELECT COUNT(*) FROM copilot_internal.conversation_messages m
         WHERE m.path_id = p.id) AS message_count,
        -- Computed: count of child paths (branches)
        (SELECT COUNT(*) FROM copilot_internal.conversation_paths cp
         WHERE cp.parent_path_id = p.id AND cp.is_active = true) AS branch_count
    FROM copilot_internal.conversation_paths p
    CROSS JOIN request_context ctx
    WHERE ctx.requester_role = 'service_role'
       OR (ctx.tenant_id IS NOT NULL AND p.tenant_id = ctx.tenant_id);

-- Grant access to the view
REVOKE ALL ON public.conversation_paths_view FROM public, anon, authenticated, service_role;
GRANT SELECT ON public.conversation_paths_view TO authenticated, service_role;

-- =============================================================================
-- STEP 6: Update conversation_messages_view to include new columns
-- =============================================================================

CREATE OR REPLACE VIEW public.conversation_messages_view AS
    WITH request_context AS (
        SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
    )
    SELECT
        m.id,
        m.conversation_id,
        m.tenant_id,
        m.user_id,
        m.role,
        m.content,
        m.metadata,
        m.created_at,
        -- New path-related columns
        m.path_id,
        m.sequence_in_path,
        m.is_branch_point,
        m.branched_to_paths,
        m.message_type
    FROM copilot_internal.conversation_messages m
    CROSS JOIN request_context ctx
    WHERE ctx.requester_role = 'service_role'
       OR (ctx.tenant_id IS NOT NULL AND m.tenant_id = ctx.tenant_id);

-- =============================================================================
-- STEP 7: Create helper functions for path operations
-- =============================================================================

-- Function to get the next sequence number for a path
CREATE OR REPLACE FUNCTION copilot_internal.next_sequence_in_path(p_path_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(MAX(sequence_in_path), 0) + 1
    FROM copilot_internal.conversation_messages
    WHERE path_id = p_path_id;
$$;

-- Function to get the root path for any path (follows parent chain)
CREATE OR REPLACE FUNCTION copilot_internal.get_root_path_id(p_path_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE path_chain AS (
        SELECT id, parent_path_id, 1 AS depth
        FROM copilot_internal.conversation_paths
        WHERE id = p_path_id

        UNION ALL

        SELECT p.id, p.parent_path_id, pc.depth + 1
        FROM copilot_internal.conversation_paths p
        INNER JOIN path_chain pc ON p.id = pc.parent_path_id
        WHERE pc.depth < 100  -- Prevent infinite loops
    )
    SELECT id FROM path_chain WHERE parent_path_id IS NULL LIMIT 1;
$$;

-- Function to get all ancestor paths (from current to root)
CREATE OR REPLACE FUNCTION copilot_internal.get_path_ancestors(p_path_id uuid)
RETURNS TABLE(path_id uuid, depth integer)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE path_chain AS (
        SELECT id, parent_path_id, 0 AS depth
        FROM copilot_internal.conversation_paths
        WHERE id = p_path_id

        UNION ALL

        SELECT p.id, p.parent_path_id, pc.depth + 1
        FROM copilot_internal.conversation_paths p
        INNER JOIN path_chain pc ON p.id = pc.parent_path_id
        WHERE pc.depth < 100
    )
    SELECT id AS path_id, depth FROM path_chain ORDER BY depth DESC;
$$;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION copilot_internal.next_sequence_in_path(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_root_path_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_path_ancestors(uuid) TO service_role;

-- =============================================================================
-- STEP 8: Add trigger to auto-set sequence_in_path
-- =============================================================================

CREATE OR REPLACE FUNCTION copilot_internal.set_message_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only set sequence if path_id is provided and sequence is not set
    IF NEW.path_id IS NOT NULL AND NEW.sequence_in_path IS NULL THEN
        NEW.sequence_in_path := copilot_internal.next_sequence_in_path(NEW.path_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_message_sequence
    ON copilot_internal.conversation_messages;

CREATE TRIGGER trg_set_message_sequence
    BEFORE INSERT ON copilot_internal.conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.set_message_sequence();
