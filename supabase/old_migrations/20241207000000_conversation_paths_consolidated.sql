-- ============================================================================
-- CONSOLIDATED MIGRATION: Conversation Paths System
-- ============================================================================
-- This migration implements the complete conversation path branching and
-- merging system in a single consolidated migration. It replaces the
-- following individual migrations:
--   - 20241207000001_add_conversation_paths.sql
--   - 20241207000002_migrate_existing_conversations.sql
--   - 20241207000003_enforce_path_constraints.sql
--   - 20251208000000_fix_conversation_paths_permissions.sql
--
-- This consolidated version applies all schema changes in their final state,
-- avoiding multiple add/rename/remove operations.
-- ============================================================================

-- =============================================================================
-- PART 1: Create conversation_paths table
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
    branch_point_message_id uuid,  -- FK added after message columns

    -- Path metadata
    name text,                     -- Optional name for the branch
    description text,              -- Optional description of branch purpose
    is_primary boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,

    -- Merge tracking
    merged_to_path_id uuid
        REFERENCES copilot_internal.conversation_paths(id)
        ON DELETE SET NULL,
    merged_at timestamptz,
    merge_summary_message_id uuid, -- FK added after message columns
    merge_mode text CHECK (merge_mode IS NULL OR merge_mode IN ('summary', 'full', 'selective')),

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for conversation_paths
CREATE INDEX IF NOT EXISTS idx_conversation_paths_tenant
    ON copilot_internal.conversation_paths(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_paths_primary
    ON copilot_internal.conversation_paths(conversation_id)
    WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_paths_conversation
    ON copilot_internal.conversation_paths(conversation_id, is_active);

CREATE INDEX IF NOT EXISTS idx_paths_parent
    ON copilot_internal.conversation_paths(parent_path_id)
    WHERE parent_path_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paths_merged
    ON copilot_internal.conversation_paths(merged_to_path_id)
    WHERE merged_to_path_id IS NOT NULL;

-- =============================================================================
-- PART 2: Add path columns to conversation_messages
-- =============================================================================

-- Add path_id column (nullable initially for migration, made NOT NULL later)
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

-- Indexes for path queries on messages
CREATE INDEX IF NOT EXISTS idx_messages_path_sequence
    ON copilot_internal.conversation_messages(path_id, sequence_in_path)
    WHERE path_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_branch_points
    ON copilot_internal.conversation_messages(conversation_id, is_branch_point)
    WHERE is_branch_point = true;

-- =============================================================================
-- PART 3: Add active_path_id to conversations
-- =============================================================================

ALTER TABLE copilot_internal.conversations
    ADD COLUMN IF NOT EXISTS active_path_id uuid;

-- =============================================================================
-- PART 4: Migrate existing data
-- =============================================================================

-- Create primary path for each existing conversation that doesn't have one
INSERT INTO copilot_internal.conversation_paths (
    conversation_id,
    tenant_id,
    name,
    is_primary,
    is_active,
    created_at,
    updated_at
)
SELECT
    c.id AS conversation_id,
    c.tenant_id,
    'Main' AS name,
    true AS is_primary,
    true AS is_active,
    c.created_at,
    c.updated_at
FROM copilot_internal.conversations c
WHERE NOT EXISTS (
    SELECT 1 FROM copilot_internal.conversation_paths p
    WHERE p.conversation_id = c.id AND p.is_primary = true
);

-- Assign existing messages to primary paths with sequence numbers
WITH message_sequences AS (
    SELECT
        m.id AS message_id,
        p.id AS path_id,
        ROW_NUMBER() OVER (
            PARTITION BY m.conversation_id
            ORDER BY m.created_at ASC, m.id ASC
        ) AS seq
    FROM copilot_internal.conversation_messages m
    INNER JOIN copilot_internal.conversation_paths p
        ON p.conversation_id = m.conversation_id
        AND p.is_primary = true
    WHERE m.path_id IS NULL
)
UPDATE copilot_internal.conversation_messages m
SET
    path_id = ms.path_id,
    sequence_in_path = ms.seq
FROM message_sequences ms
WHERE m.id = ms.message_id;

-- Handle deprecated supersededBy chains - mark in metadata
UPDATE copilot_internal.conversation_messages m
SET metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'deprecated_versioning', jsonb_build_object(
        'note', 'This message was part of supersededBy chain, now deprecated',
        'migrated_at', now()::text,
        'original_superseded_by', m.metadata->>'supersededBy'
    )
)
WHERE m.metadata->>'supersededBy' IS NOT NULL;

-- Set active_path_id to primary path for existing conversations
UPDATE copilot_internal.conversations c
SET active_path_id = (
    SELECT p.id
    FROM copilot_internal.conversation_paths p
    WHERE p.conversation_id = c.id AND p.is_primary = true
    LIMIT 1
)
WHERE c.active_path_id IS NULL;

-- =============================================================================
-- PART 5: Enforce constraints and add foreign keys
-- =============================================================================

-- Make path_id NOT NULL (after data migration)
DO $$
DECLARE
    null_count integer;
BEGIN
    SELECT COUNT(*) INTO null_count
    FROM copilot_internal.conversation_messages
    WHERE path_id IS NULL;

    IF null_count > 0 THEN
        RAISE EXCEPTION 'Cannot enforce NOT NULL: % messages still have NULL path_id', null_count;
    END IF;
END $$;

ALTER TABLE copilot_internal.conversation_messages
    ALTER COLUMN path_id SET NOT NULL;

-- Foreign key from messages to paths
ALTER TABLE copilot_internal.conversation_messages
    DROP CONSTRAINT IF EXISTS fk_message_path;

ALTER TABLE copilot_internal.conversation_messages
    ADD CONSTRAINT fk_message_path
    FOREIGN KEY (path_id)
    REFERENCES copilot_internal.conversation_paths(id)
    ON DELETE CASCADE;

-- Foreign key from paths to branch point message
ALTER TABLE copilot_internal.conversation_paths
    DROP CONSTRAINT IF EXISTS fk_branch_point_message;

ALTER TABLE copilot_internal.conversation_paths
    ADD CONSTRAINT fk_branch_point_message
    FOREIGN KEY (branch_point_message_id)
    REFERENCES copilot_internal.conversation_messages(id)
    ON DELETE SET NULL;

-- Foreign key from paths to merge summary message
ALTER TABLE copilot_internal.conversation_paths
    DROP CONSTRAINT IF EXISTS fk_merge_summary_message;

ALTER TABLE copilot_internal.conversation_paths
    ADD CONSTRAINT fk_merge_summary_message
    FOREIGN KEY (merge_summary_message_id)
    REFERENCES copilot_internal.conversation_messages(id)
    ON DELETE SET NULL;

-- Foreign key from conversations to active path
ALTER TABLE copilot_internal.conversations
    DROP CONSTRAINT IF EXISTS fk_active_path;

ALTER TABLE copilot_internal.conversations
    ADD CONSTRAINT fk_active_path
    FOREIGN KEY (active_path_id)
    REFERENCES copilot_internal.conversation_paths(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- =============================================================================
-- PART 6: Grant table permissions
-- =============================================================================

-- Grant all privileges to service_role
GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversation_paths TO service_role;
GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversation_messages TO service_role;
GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversations TO service_role;
GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversation_contexts TO service_role;

-- Grant specific privileges to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversation_paths TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversation_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversation_contexts TO authenticated;

-- =============================================================================
-- PART 7: Enable RLS on conversation_paths
-- =============================================================================

ALTER TABLE copilot_internal.conversation_paths ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS conversation_paths_service_role_full_access
    ON copilot_internal.conversation_paths;
CREATE POLICY conversation_paths_service_role_full_access
    ON copilot_internal.conversation_paths
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read paths in their tenant
DROP POLICY IF EXISTS conversation_paths_tenant_read
    ON copilot_internal.conversation_paths;
CREATE POLICY conversation_paths_tenant_read
    ON copilot_internal.conversation_paths
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.current_tenant_id());

-- Authenticated users can create paths in their tenant
DROP POLICY IF EXISTS conversation_paths_tenant_write
    ON copilot_internal.conversation_paths;
CREATE POLICY conversation_paths_tenant_write
    ON copilot_internal.conversation_paths
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = public.current_tenant_id());

-- Authenticated users can update paths in their tenant
DROP POLICY IF EXISTS conversation_paths_tenant_update
    ON copilot_internal.conversation_paths;
CREATE POLICY conversation_paths_tenant_update
    ON copilot_internal.conversation_paths
    FOR UPDATE
    TO authenticated
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

-- Authenticated users can delete paths in their tenant
DROP POLICY IF EXISTS conversation_paths_tenant_delete
    ON copilot_internal.conversation_paths;
CREATE POLICY conversation_paths_tenant_delete
    ON copilot_internal.conversation_paths
    FOR DELETE
    TO authenticated
    USING (tenant_id = public.current_tenant_id());

-- =============================================================================
-- PART 8: Create helper functions
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

-- Function to resolve messages for a path (with inheritance)
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
    effective_sequence integer
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

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION copilot_internal.next_sequence_in_path(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_root_path_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_path_ancestors(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.resolve_path_messages(uuid) TO service_role;

-- =============================================================================
-- PART 9: Create triggers
-- =============================================================================

-- Trigger to auto-set sequence_in_path
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

-- Trigger to update path timestamps
CREATE OR REPLACE FUNCTION copilot_internal.update_path_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_path_timestamp
    ON copilot_internal.conversation_paths;
CREATE TRIGGER trg_update_path_timestamp
    BEFORE UPDATE ON copilot_internal.conversation_paths
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_path_timestamp();

-- Trigger to mark message as branch point when path created
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

DROP TRIGGER IF EXISTS trg_mark_branch_point
    ON copilot_internal.conversation_paths;
CREATE TRIGGER trg_mark_branch_point
    AFTER INSERT ON copilot_internal.conversation_paths
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.mark_branch_point();

-- =============================================================================
-- PART 10: Create views
-- =============================================================================

-- View for conversation_paths
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

-- Update conversation_messages_view to include new path columns
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
        -- Path-related columns
        m.path_id,
        m.sequence_in_path,
        m.is_branch_point,
        m.branched_to_paths,
        m.message_type
    FROM copilot_internal.conversation_messages m
    CROSS JOIN request_context ctx
    WHERE ctx.requester_role = 'service_role'
       OR (ctx.tenant_id IS NOT NULL AND m.tenant_id = ctx.tenant_id);

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
        c.created_at,
        c.updated_at,
        c.last_message_at,
        c.active_path_id
    FROM copilot_internal.conversations c
    CROSS JOIN request_context ctx
    WHERE ctx.requester_role = 'service_role'
       OR (ctx.tenant_id IS NOT NULL AND c.tenant_id = ctx.tenant_id);

-- =============================================================================
-- PART 11: Final verification
-- =============================================================================

DO $$
DECLARE
    msg_without_path integer;
    path_without_conv integer;
    conv_without_primary integer;
    superseded_count integer;
BEGIN
    -- All messages must have a path
    SELECT COUNT(*) INTO msg_without_path
    FROM copilot_internal.conversation_messages
    WHERE path_id IS NULL;

    IF msg_without_path > 0 THEN
        RAISE EXCEPTION 'Migration failed: % messages without path_id', msg_without_path;
    END IF;

    -- All paths must reference valid conversations
    SELECT COUNT(*) INTO path_without_conv
    FROM copilot_internal.conversation_paths p
    LEFT JOIN copilot_internal.conversations c ON c.id = p.conversation_id
    WHERE c.id IS NULL;

    IF path_without_conv > 0 THEN
        RAISE EXCEPTION 'Migration failed: % paths without valid conversation', path_without_conv;
    END IF;

    -- All conversations with messages should have a primary path
    SELECT COUNT(*) INTO conv_without_primary
    FROM copilot_internal.conversations c
    WHERE EXISTS (
        SELECT 1 FROM copilot_internal.conversation_messages m WHERE m.conversation_id = c.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM copilot_internal.conversation_paths p
        WHERE p.conversation_id = c.id AND p.is_primary = true
    );

    IF conv_without_primary > 0 THEN
        RAISE EXCEPTION 'Migration failed: % conversations with messages lack primary path', conv_without_primary;
    END IF;

    -- Log deprecation warning if supersededBy was used
    SELECT COUNT(*) INTO superseded_count
    FROM copilot_internal.conversation_messages
    WHERE metadata->>'supersededBy' IS NOT NULL;

    IF superseded_count > 0 THEN
        RAISE NOTICE 'DEPRECATION: % messages had supersededBy field (now deprecated). Migrated to path-based versioning.', superseded_count;
    END IF;

    RAISE NOTICE 'Conversation paths migration completed successfully';
END $$;
