-- ============================================================================
-- MIGRATION: Fix Execution Context UNIQUE Constraint for Context Recreation
-- ============================================================================
-- This migration fixes a critical bug where terminated execution contexts
-- prevent recreation of contexts for the same path.
--
-- Problem:
--   - The table-level UNIQUE(tenant_id, conversation_id, path_id) constraint
--     blocks ALL records, including terminated ones
--   - getContextByPath() filters out terminated contexts (WHERE terminated_at IS NULL)
--   - User tries to execute code after context expires → getContextByPath returns null
--   - Code tries to create new context → UNIQUE constraint violation!
--
-- Solution:
--   - Replace table-level UNIQUE constraint with partial unique index
--   - Only enforce uniqueness for active contexts (WHERE terminated_at IS NULL)
--   - This allows multiple terminated contexts for same path, but only one active
--
-- Impact:
--   - Fixes "cannot create execution context" error when returning after expiry
--   - Enables proper context recreation after termination
--   - Also fixes race condition in multi-instance deployments
--
-- References:
--   - Original migration: 20251210000000_execution_contexts.sql
--   - Bug report: Context recreation blocked by UNIQUE constraint
-- ============================================================================

-- =============================================================================
-- PART 1: Drop existing UNIQUE constraint
-- =============================================================================

-- First, we need to find the actual constraint name
-- PostgreSQL auto-generates constraint names, typically:
-- execution_contexts_tenant_id_conversation_id_path_id_key

DO $$
DECLARE
    constraint_name_var text;
BEGIN
    -- Find the constraint name
    SELECT conname INTO constraint_name_var
    FROM pg_constraint
    WHERE conrelid = 'copilot_internal.execution_contexts'::regclass
      AND contype = 'u'  -- unique constraint
      AND array_length(conkey, 1) = 3  -- has 3 columns
      -- NOTE: conkey is an int2vector (smallint-based). To avoid integer[] = smallint[] issues,
      --       cast both sides to int[] and cast attnum to int.
      AND conkey::int[] = ARRAY[
          (SELECT attnum::int FROM pg_attribute WHERE attrelid = 'copilot_internal.execution_contexts'::regclass AND attname = 'tenant_id'),
          (SELECT attnum::int FROM pg_attribute WHERE attrelid = 'copilot_internal.execution_contexts'::regclass AND attname = 'conversation_id'),
          (SELECT attnum::int FROM pg_attribute WHERE attrelid = 'copilot_internal.execution_contexts'::regclass AND attname = 'path_id')
      ]::int[];

    IF constraint_name_var IS NOT NULL THEN
        RAISE NOTICE 'Dropping UNIQUE constraint: %', constraint_name_var;
        EXECUTE format('ALTER TABLE copilot_internal.execution_contexts DROP CONSTRAINT %I', constraint_name_var);
        RAISE NOTICE 'Successfully dropped UNIQUE constraint';
    ELSE
        RAISE NOTICE 'UNIQUE constraint not found (may have been dropped already)';
    END IF;
END $$;

-- =============================================================================
-- PART 2: Create partial unique index for active contexts only
-- =============================================================================

-- This index enforces uniqueness ONLY for non-terminated contexts
-- Multiple terminated contexts can exist for the same path, but only one active
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_contexts_unique_active_path
    ON copilot_internal.execution_contexts(tenant_id, conversation_id, path_id)
    WHERE terminated_at IS NULL;

COMMENT ON INDEX copilot_internal.idx_execution_contexts_unique_active_path IS
    'Ensures only one active execution context per path. Allows multiple terminated contexts for the same path.';

-- =============================================================================
-- PART 3: Add cleanup function for old terminated contexts (Optional)
-- =============================================================================

-- Function to clean up terminated contexts older than N days
-- This prevents unbounded growth of terminated context records
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
    -- NOTE: PostgreSQL does not support LIMIT directly on DELETE.
    --       Select candidate rows first, then delete via USING.
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
    'Cleans up terminated execution contexts older than specified days. Returns count and IDs of deleted records.';

-- =============================================================================
-- PART 4: Verification
-- =============================================================================

DO $$
DECLARE
    partial_index_exists boolean;
    old_constraint_exists boolean;
    cleanup_function_exists boolean;
BEGIN
    -- Check that partial unique index exists
    SELECT EXISTS (
        SELECT FROM pg_indexes
        WHERE schemaname = 'copilot_internal'
          AND tablename = 'execution_contexts'
          AND indexname = 'idx_execution_contexts_unique_active_path'
    ) INTO partial_index_exists;

    IF NOT partial_index_exists THEN
        RAISE EXCEPTION 'Migration failed: Partial unique index not created';
    END IF;

    -- Check that old UNIQUE constraint is gone
    SELECT EXISTS (
        SELECT FROM pg_constraint
        WHERE conrelid = 'copilot_internal.execution_contexts'::regclass
          AND contype = 'u'
          AND array_length(conkey, 1) = 3
    ) INTO old_constraint_exists;

    IF old_constraint_exists THEN
        RAISE WARNING 'Old UNIQUE constraint still exists - may need manual cleanup';
    END IF;

    -- Check cleanup function exists
    SELECT EXISTS (
        SELECT FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'copilot_internal'
          AND p.proname = 'cleanup_old_terminated_contexts'
    ) INTO cleanup_function_exists;

    IF NOT cleanup_function_exists THEN
        RAISE EXCEPTION 'Migration failed: Cleanup function not created';
    END IF;

    RAISE NOTICE '=== Migration completed successfully ===';
    RAISE NOTICE '  ✓ Dropped old table-level UNIQUE constraint';
    RAISE NOTICE '  ✓ Created partial unique index (idx_execution_contexts_unique_active_path)';
    RAISE NOTICE '  ✓ Created cleanup function (cleanup_old_terminated_contexts)';
    RAISE NOTICE '';
    RAISE NOTICE 'Fix applied:';
    RAISE NOTICE '  - Multiple terminated contexts allowed for same path';
    RAISE NOTICE '  - Only one active context per path enforced';
    RAISE NOTICE '  - Context recreation after termination now works';
    RAISE NOTICE '';
    RAISE NOTICE 'Recommended: Run cleanup_old_terminated_contexts() periodically';
END $$;
