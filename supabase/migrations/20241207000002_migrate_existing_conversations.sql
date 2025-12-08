-- =============================================================================
-- DEPRECATED: This migration has been superseded by the consolidated migration
-- Use: 20241207000000_conversation_paths_consolidated.sql instead
-- =============================================================================
-- This file is kept for historical reference only. The consolidated migration
-- combines this with migrations 20241207000001, 20241207000003, and
-- 20251208000000 into a single file.
-- =============================================================================
--
-- Migration: Migrate existing conversations to path-based model
-- This migration creates primary paths for all existing conversations
-- and assigns all existing messages to their conversation's primary path.

-- =============================================================================
-- STEP 1: Create primary path for each existing conversation
-- =============================================================================

-- Insert a primary path for each conversation that doesn't have one
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

-- =============================================================================
-- STEP 2: Assign existing messages to primary paths with sequence numbers
-- =============================================================================

-- Update messages to belong to their conversation's primary path
-- Assign sequence numbers based on created_at ordering
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

-- =============================================================================
-- STEP 3: Handle supersededBy chains - convert to version info in metadata
-- =============================================================================

-- Messages with supersededBy are now just older versions in the same path.
-- We keep them but mark them with a version indicator in metadata.
-- The new architecture shows all versions via path traversal.

-- Update messages that have supersededBy to mark them as prior versions
UPDATE copilot_internal.conversation_messages m
SET metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'deprecated_versioning', jsonb_build_object(
        'note', 'This message was part of supersededBy chain, now deprecated',
        'migrated_at', now()::text,
        'original_superseded_by', m.metadata->>'supersededBy'
    )
)
WHERE m.metadata->>'supersededBy' IS NOT NULL;

-- Log warning about deprecated supersededBy usage
DO $$
DECLARE
    superseded_count integer;
BEGIN
    SELECT COUNT(*) INTO superseded_count
    FROM copilot_internal.conversation_messages
    WHERE metadata->>'supersededBy' IS NOT NULL;

    IF superseded_count > 0 THEN
        RAISE NOTICE 'DEPRECATION WARNING: % messages had supersededBy field. This pattern is now deprecated. Messages have been migrated to path-based versioning.', superseded_count;
    END IF;
END $$;

-- =============================================================================
-- STEP 4: Verify migration integrity
-- =============================================================================

DO $$
DECLARE
    orphan_messages integer;
    orphan_paths integer;
    multi_primary integer;
BEGIN
    -- Check for messages without paths
    SELECT COUNT(*) INTO orphan_messages
    FROM copilot_internal.conversation_messages
    WHERE path_id IS NULL;

    IF orphan_messages > 0 THEN
        RAISE EXCEPTION 'Migration failed: % messages still have NULL path_id', orphan_messages;
    END IF;

    -- Check for paths without valid conversations
    SELECT COUNT(*) INTO orphan_paths
    FROM copilot_internal.conversation_paths p
    WHERE NOT EXISTS (
        SELECT 1 FROM copilot_internal.conversations c WHERE c.id = p.conversation_id
    );

    IF orphan_paths > 0 THEN
        RAISE EXCEPTION 'Migration failed: % paths reference non-existent conversations', orphan_paths;
    END IF;

    -- Check for multiple primary paths per conversation
    SELECT COUNT(*) INTO multi_primary
    FROM (
        SELECT conversation_id, COUNT(*) AS cnt
        FROM copilot_internal.conversation_paths
        WHERE is_primary = true
        GROUP BY conversation_id
        HAVING COUNT(*) > 1
    ) sub;

    IF multi_primary > 0 THEN
        RAISE EXCEPTION 'Migration failed: % conversations have multiple primary paths', multi_primary;
    END IF;

    RAISE NOTICE 'Migration verification passed: all messages assigned to paths, no orphans';
END $$;
