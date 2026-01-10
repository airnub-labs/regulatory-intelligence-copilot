-- ============================================================================
-- MIGRATION: Execution Contexts for E2B Per-Path Sandboxes
-- ============================================================================
-- This migration implements the execution context storage for the v0.7
-- architecture, enabling per-path E2B sandboxes with lazy creation,
-- TTL-based lifecycle, and proper cleanup.
--
-- References:
--   - docs/architecture/architecture_v_0_7.md
--   - docs/architecture/execution-context/spec_v_0_1.md
--   - docs/architecture/execution-context/IMPLEMENTATION_PLAN.md (Phase 1)
-- ============================================================================

-- =============================================================================
-- PART 1: Create execution_contexts table
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_internal.execution_contexts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Conversation path reference
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL
        REFERENCES copilot_internal.conversations(id)
        ON DELETE CASCADE,
    path_id uuid NOT NULL
        REFERENCES copilot_internal.conversation_paths(id)
        ON DELETE CASCADE,

    -- E2B sandbox details
    sandbox_id text NOT NULL,
    sandbox_status text NOT NULL
        CHECK (sandbox_status IN ('creating', 'ready', 'error', 'terminated')),

    -- Lifecycle timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    terminated_at timestamptz,

    -- Metadata and diagnostics
    error_message text,
    resource_usage jsonb

    -- NOTE: UNIQUE constraint removed - using partial unique index instead
    -- See idx_execution_contexts_unique_active_path below
);

-- =============================================================================
-- PART 2: Create indexes for efficient queries
-- =============================================================================

-- Index for tenant-scoped queries (RLS filtering)
CREATE INDEX IF NOT EXISTS idx_execution_contexts_tenant
    ON copilot_internal.execution_contexts(tenant_id);

-- Index for path lookups (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_execution_contexts_path
    ON copilot_internal.execution_contexts(path_id);

-- Index for cleanup job (find expired, non-terminated contexts)
CREATE INDEX IF NOT EXISTS idx_execution_contexts_expires
    ON copilot_internal.execution_contexts(expires_at)
    WHERE terminated_at IS NULL;

-- Index for sandbox ID lookups (for reconnection)
CREATE INDEX IF NOT EXISTS idx_execution_contexts_sandbox
    ON copilot_internal.execution_contexts(sandbox_id);

-- Index for conversation lookups (for bulk operations)
CREATE INDEX IF NOT EXISTS idx_execution_contexts_conversation
    ON copilot_internal.execution_contexts(conversation_id);

-- Partial unique index: Ensures only one active execution context per path
-- Allows multiple terminated contexts for the same path (for historical tracking)
-- This replaces the table-level UNIQUE constraint that was too restrictive
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_contexts_unique_active_path
    ON copilot_internal.execution_contexts(tenant_id, conversation_id, path_id)
    WHERE terminated_at IS NULL;

COMMENT ON INDEX copilot_internal.idx_execution_contexts_unique_active_path IS
    'Ensures only one active execution context per path. Allows multiple terminated contexts for the same path for historical tracking.';

-- =============================================================================
-- PART 3: Enable Row Level Security (RLS)
-- =============================================================================

ALTER TABLE copilot_internal.execution_contexts ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for backend operations)
CREATE POLICY execution_contexts_service_role_full_access
    ON copilot_internal.execution_contexts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read contexts in their tenant
CREATE POLICY execution_contexts_tenant_read
    ON copilot_internal.execution_contexts
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.current_tenant_id());

-- Authenticated users can insert contexts in their tenant
CREATE POLICY execution_contexts_tenant_insert
    ON copilot_internal.execution_contexts
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = public.current_tenant_id());

-- Authenticated users can update contexts in their tenant
CREATE POLICY execution_contexts_tenant_update
    ON copilot_internal.execution_contexts
    FOR UPDATE
    TO authenticated
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

-- Authenticated users can delete contexts in their tenant
CREATE POLICY execution_contexts_tenant_delete
    ON copilot_internal.execution_contexts
    FOR DELETE
    TO authenticated
    USING (tenant_id = public.current_tenant_id());

-- =============================================================================
-- PART 4: Grant table-level permissions
-- =============================================================================

-- Grant all privileges to service_role
GRANT ALL PRIVILEGES ON TABLE copilot_internal.execution_contexts TO service_role;

-- Grant specific privileges to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.execution_contexts TO authenticated;

-- =============================================================================
-- PART 5: Create helper functions
-- =============================================================================

-- Function to update last_used_at and extend expiry
CREATE OR REPLACE FUNCTION copilot_internal.touch_execution_context(
    p_context_id uuid,
    p_ttl_minutes integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE copilot_internal.execution_contexts
    SET
        last_used_at = now(),
        expires_at = now() + (p_ttl_minutes || ' minutes')::interval
    WHERE id = p_context_id
      AND terminated_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION copilot_internal.touch_execution_context(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.touch_execution_context(uuid, integer) TO authenticated;

-- Function to get expired contexts for cleanup
CREATE OR REPLACE FUNCTION copilot_internal.get_expired_execution_contexts(
    p_limit integer DEFAULT 50
)
RETURNS TABLE(
    id uuid,
    tenant_id uuid,
    conversation_id uuid,
    path_id uuid,
    sandbox_id text,
    created_at timestamptz,
    last_used_at timestamptz,
    expires_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        id,
        tenant_id,
        conversation_id,
        path_id,
        sandbox_id,
        created_at,
        last_used_at,
        expires_at
    FROM copilot_internal.execution_contexts
    WHERE terminated_at IS NULL
      AND expires_at < now()
    ORDER BY expires_at ASC
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION copilot_internal.get_expired_execution_contexts(integer) TO service_role;

-- =============================================================================
-- PART 6: Create view for execution contexts
-- =============================================================================

CREATE OR REPLACE VIEW public.execution_contexts_view AS
    WITH request_context AS (
        SELECT public.current_tenant_id() AS tenant_id, auth.role() AS requester_role
    )
    SELECT
        ec.id,
        ec.tenant_id,
        ec.conversation_id,
        ec.path_id,
        ec.sandbox_id,
        ec.sandbox_status,
        ec.created_at,
        ec.last_used_at,
        ec.expires_at,
        ec.terminated_at,
        ec.error_message,
        ec.resource_usage,
        -- Computed: is expired
        (ec.expires_at < now() AND ec.terminated_at IS NULL) AS is_expired,
        -- Computed: time until expiry (in seconds)
        EXTRACT(EPOCH FROM (ec.expires_at - now()))::integer AS seconds_until_expiry,
        -- Computed: age (in seconds)
        EXTRACT(EPOCH FROM (now() - ec.created_at))::integer AS age_seconds
    FROM copilot_internal.execution_contexts ec
    CROSS JOIN request_context ctx
    WHERE ctx.requester_role = 'service_role'
       OR (ctx.tenant_id IS NOT NULL AND ec.tenant_id = ctx.tenant_id);

-- Grant access to the view
REVOKE ALL ON public.execution_contexts_view FROM public, anon, authenticated, service_role;
GRANT SELECT ON public.execution_contexts_view TO authenticated, service_role;

-- =============================================================================
-- PART 7: Create trigger for automatic expiry calculation
-- =============================================================================

-- Trigger function to set expires_at on insert if not provided
CREATE OR REPLACE FUNCTION copilot_internal.set_execution_context_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If expires_at not set, default to 30 minutes from now
    IF NEW.expires_at IS NULL OR NEW.expires_at = NEW.created_at THEN
        NEW.expires_at := now() + interval '30 minutes';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_execution_context_expiry
    ON copilot_internal.execution_contexts;

CREATE TRIGGER trg_set_execution_context_expiry
    BEFORE INSERT ON copilot_internal.execution_contexts
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.set_execution_context_expiry();

-- =============================================================================
-- PART 8: Cleanup Function for Terminated Contexts
-- =============================================================================
-- Function to clean up old terminated contexts to prevent unbounded growth
-- This is especially useful as we now allow multiple terminated contexts per path

CREATE OR REPLACE FUNCTION copilot_internal.cleanup_old_terminated_contexts(
    p_days_old integer DEFAULT 7,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(
    deleted_count integer,
    deleted_ids uuid[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_id_array uuid[];
    delete_count integer;
BEGIN
    -- Delete terminated contexts older than p_days_old days
    -- Use CTE to select candidates first, then delete via USING
    WITH to_delete AS (
        SELECT id
        FROM copilot_internal.execution_contexts
        WHERE terminated_at IS NOT NULL
          AND terminated_at < now() - (p_days_old || ' days')::interval
        ORDER BY terminated_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 100), 0)
    ), deleted AS (
        DELETE FROM copilot_internal.execution_contexts ec
        USING to_delete td
        WHERE ec.id = td.id
        RETURNING ec.id
    )
    SELECT array_agg(id), count(*)::integer
    INTO deleted_id_array, delete_count
    FROM deleted;

    -- Handle case where no rows were deleted
    deleted_id_array := COALESCE(deleted_id_array, ARRAY[]::uuid[]);
    delete_count := COALESCE(delete_count, 0);

    RETURN QUERY SELECT delete_count, deleted_id_array;
END;
$$;

GRANT EXECUTE ON FUNCTION copilot_internal.cleanup_old_terminated_contexts(integer, integer) TO service_role;

COMMENT ON FUNCTION copilot_internal.cleanup_old_terminated_contexts IS
    'Cleans up terminated execution contexts older than specified days. Returns count and IDs of deleted records. Recommended to run periodically via cron job.';

-- =============================================================================
-- PART 9: Verification
-- =============================================================================

DO $$
DECLARE
    table_exists boolean;
    index_count integer;
    policy_count integer;
    function_count integer;
BEGIN
    -- Check table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'copilot_internal'
        AND table_name = 'execution_contexts'
    ) INTO table_exists;

    IF NOT table_exists THEN
        RAISE EXCEPTION 'Migration failed: execution_contexts table not created';
    END IF;

    -- Check indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'copilot_internal'
      AND tablename = 'execution_contexts';

    IF index_count < 5 THEN
        RAISE WARNING 'Expected at least 5 indexes, found %', index_count;
    END IF;

    -- Check policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'copilot_internal'
      AND tablename = 'execution_contexts';

    IF policy_count < 5 THEN
        RAISE WARNING 'Expected at least 5 RLS policies, found %', policy_count;
    END IF;

    -- Check functions
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'copilot_internal'
      AND p.proname LIKE '%execution_context%';

    IF function_count < 2 THEN
        RAISE WARNING 'Expected at least 2 helper functions, found %', function_count;
    END IF;

    RAISE NOTICE 'Execution contexts migration completed successfully';
    RAISE NOTICE '  - Table: execution_contexts created';
    RAISE NOTICE '  - Indexes: % created', index_count;
    RAISE NOTICE '  - RLS Policies: % created', policy_count;
    RAISE NOTICE '  - Helper Functions: % created', function_count;
    RAISE NOTICE '  - View: execution_contexts_view created';
    RAISE NOTICE '  - Trigger: set_execution_context_expiry created';
END $$;
