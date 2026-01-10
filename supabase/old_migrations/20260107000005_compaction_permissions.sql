-- Migration: Fix Compaction Operations Permissions
-- Adds missing GRANT statements for service_role to access compaction tables and functions
-- This fixes the "permission denied for table compaction_operations" error

-- =============================================================================
-- Grant schema usage
-- =============================================================================
GRANT USAGE ON SCHEMA copilot_internal TO service_role;

-- =============================================================================
-- Grant table permissions
-- =============================================================================
-- Grant full access to compaction_operations table for service_role
GRANT ALL PRIVILEGES ON TABLE copilot_internal.compaction_operations TO service_role;

-- =============================================================================
-- Grant function permissions
-- =============================================================================

-- Function to record a compaction operation
GRANT EXECUTE ON FUNCTION copilot_internal.record_compaction_operation(
    uuid, uuid, uuid, uuid, text, text, integer, integer, integer, integer,
    integer, integer, integer, boolean, numeric, boolean, text, jsonb
) TO service_role;

-- Function to get aggregated compaction metrics
GRANT EXECUTE ON FUNCTION copilot_internal.get_compaction_metrics(
    timestamptz, timestamptz, uuid
) TO service_role;

-- Function to get strategy breakdown
GRANT EXECUTE ON FUNCTION copilot_internal.get_compaction_strategy_breakdown(
    timestamptz, timestamptz, uuid
) TO service_role;

-- Function to get recent operations
GRANT EXECUTE ON FUNCTION copilot_internal.get_recent_compaction_operations(
    integer, uuid
) TO service_role;

-- Function to get conversations needing compaction
GRANT EXECUTE ON FUNCTION copilot_internal.get_conversations_needing_compaction(
    integer, timestamptz, timestamptz, integer
) TO service_role;

-- =============================================================================
-- Also grant to authenticated role for client-side access via RLS
-- =============================================================================
GRANT SELECT ON TABLE copilot_internal.compaction_operations TO authenticated;

GRANT EXECUTE ON FUNCTION copilot_internal.get_compaction_metrics(
    timestamptz, timestamptz, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION copilot_internal.get_compaction_strategy_breakdown(
    timestamptz, timestamptz, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION copilot_internal.get_recent_compaction_operations(
    integer, uuid
) TO authenticated;

-- =============================================================================
-- Add RLS policy for compaction_operations (if not exists)
-- =============================================================================
ALTER TABLE copilot_internal.compaction_operations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view compaction operations for their tenant
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'compaction_operations'
        AND policyname = 'tenant_isolation_select'
    ) THEN
        CREATE POLICY tenant_isolation_select ON copilot_internal.compaction_operations
            FOR SELECT
            TO authenticated
            USING (tenant_id IN (
                SELECT tm.tenant_id
                FROM copilot_internal.tenant_memberships tm
                WHERE tm.user_id = auth.uid()
            ));
    END IF;
END $$;

-- Policy: Users can insert compaction operations for their tenant
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'compaction_operations'
        AND policyname = 'tenant_isolation_insert'
    ) THEN
        CREATE POLICY tenant_isolation_insert ON copilot_internal.compaction_operations
            FOR INSERT
            TO authenticated
            WITH CHECK (tenant_id IN (
                SELECT tm.tenant_id
                FROM copilot_internal.tenant_memberships tm
                WHERE tm.user_id = auth.uid()
            ));
    END IF;
END $$;

-- Service role bypasses RLS, so no policy needed for it

COMMENT ON TABLE copilot_internal.compaction_operations IS
    'Stores historical records of conversation compaction operations. Service role has full access, authenticated users have tenant-scoped access via RLS.';
