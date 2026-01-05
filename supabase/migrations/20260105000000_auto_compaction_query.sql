-- Migration: Auto-Compaction Query Function
-- Provides a function to identify conversations that may need compaction

-- Function to get conversations needing compaction
CREATE OR REPLACE FUNCTION copilot_internal.get_conversations_needing_compaction(
    p_message_count_gt integer DEFAULT 50,
    p_last_activity_after timestamptz DEFAULT now() - interval '7 days',
    p_last_compaction_before timestamptz DEFAULT now() - interval '1 day',
    p_limit integer DEFAULT 100
) RETURNS TABLE (
    conversation_id uuid,
    tenant_id uuid,
    active_path_id uuid,
    message_count bigint,
    last_message_at timestamptz,
    last_compaction_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    WITH message_counts AS (
        -- Count messages per conversation (only non-deleted messages)
        SELECT
            cm.conversation_id,
            COUNT(*) as msg_count
        FROM copilot_internal.conversation_messages cm
        WHERE cm.metadata->>'deletedAt' IS NULL
        GROUP BY cm.conversation_id
    ),
    last_compactions AS (
        -- Get most recent compaction timestamp per conversation
        SELECT DISTINCT ON (co.conversation_id)
            co.conversation_id,
            co.timestamp as last_compaction_at
        FROM copilot_internal.compaction_operations co
        WHERE co.success = true
          AND co.conversation_id IS NOT NULL
        ORDER BY co.conversation_id, co.timestamp DESC
    )
    SELECT
        c.id as conversation_id,
        c.tenant_id,
        c.active_path_id,
        COALESCE(mc.msg_count, 0) as message_count,
        c.last_message_at,
        lc.last_compaction_at
    FROM copilot_internal.conversations c
    LEFT JOIN message_counts mc ON c.id = mc.conversation_id
    LEFT JOIN last_compactions lc ON c.id = lc.conversation_id
    WHERE
        -- Filter by message count
        COALESCE(mc.msg_count, 0) > p_message_count_gt
        -- Filter by recent activity
        AND (c.last_message_at IS NULL OR c.last_message_at >= p_last_activity_after)
        -- Filter by last compaction time (or never compacted)
        AND (lc.last_compaction_at IS NULL OR lc.last_compaction_at < p_last_compaction_before)
        -- Exclude archived conversations
        AND c.archived_at IS NULL
    ORDER BY
        -- Prioritize: never compacted first, then by oldest compaction, then by message count
        CASE WHEN lc.last_compaction_at IS NULL THEN 0 ELSE 1 END,
        lc.last_compaction_at ASC NULLS FIRST,
        COALESCE(mc.msg_count, 0) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION copilot_internal.get_conversations_needing_compaction IS
    'Returns conversations that may need compaction based on message count, activity, and last compaction time. Used by auto-compaction background job.';
