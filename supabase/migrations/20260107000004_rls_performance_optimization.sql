-- =====================================================
-- RLS Policy Performance Optimization
-- LOW-1: RLS Policy Performance Optimization
-- =====================================================
--
-- PURPOSE:
-- Optimizes Row-Level Security (RLS) policy performance for users
-- with many workspaces. RLS policies often use subqueries to check
-- tenant membership, which can become slow as the number of tenants grows.
--
-- STRATEGY:
-- 1. Add composite indexes to speed up RLS policy subqueries
-- 2. Add partial indexes for common WHERE clauses in RLS policies
-- 3. Create helper functions for query performance analysis
-- 4. Add query performance logging utilities

-- =====================================================
-- 1. Composite Indexes for RLS Policy Optimization
-- =====================================================

-- Index for common RLS pattern: Finding active memberships for a user+tenant
-- Used by policies like: WHERE tenant_id IN (SELECT tenant_id FROM ... WHERE user_id = auth.uid() AND status = 'active')
CREATE INDEX IF NOT EXISTS idx_memberships_user_tenant_status
    ON copilot_internal.tenant_memberships(user_id, tenant_id, status)
    WHERE status = 'active';

COMMENT ON INDEX copilot_internal.idx_memberships_user_tenant_status IS
    'Optimizes RLS policies that check user membership in specific tenants. Covering index for (user_id, tenant_id, status) with partial index on active status.';

-- Index for role-based RLS policies: Finding users with specific roles
-- Used by policies like: WHERE user_id IN (SELECT user_id FROM ... WHERE tenant_id = X AND role IN ('owner', 'admin'))
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_role_user
    ON copilot_internal.tenant_memberships(tenant_id, role, user_id)
    WHERE status = 'active';

COMMENT ON INDEX copilot_internal.idx_memberships_tenant_role_user IS
    'Optimizes RLS policies that check user roles within tenants. Supports queries filtering by tenant_id and role.';

-- Index for user context lookups: Finding current tenant for user
-- Used frequently in session validation and RLS policies
CREATE INDEX IF NOT EXISTS idx_user_context_user_current_tenant
    ON copilot_internal.user_tenant_contexts(user_id, current_tenant_id)
    WHERE current_tenant_id IS NOT NULL;

COMMENT ON INDEX copilot_internal.idx_user_context_user_current_tenant IS
    'Optimizes lookups of user''s current active tenant. Critical for session validation performance.';

-- Index for tenant ownership checks
-- Used by policies like: WHERE owner_id = auth.uid()
CREATE INDEX IF NOT EXISTS idx_tenants_owner_active
    ON copilot_internal.tenants(owner_id, id)
    WHERE deleted_at IS NULL;

COMMENT ON INDEX copilot_internal.idx_tenants_owner_active IS
    'Optimizes tenant ownership checks in RLS policies. Covering index for (owner_id, id) excluding deleted tenants.';

-- =====================================================
-- 2. Indexes for tenant-scoped tables
-- =====================================================

-- Generic pattern: Most tenant-scoped tables follow (tenant_id, user_id) pattern
-- These are examples - add similar indexes to all tenant-scoped tables

-- Conversations index (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_tenant_user') THEN
        CREATE INDEX idx_conversations_tenant_user
            ON copilot_internal.conversations(tenant_id, user_id);

        COMMENT ON INDEX copilot_internal.idx_conversations_tenant_user IS
            'Optimizes RLS policies on conversations table. Supports filtering by tenant_id and user_id.';
    END IF;
END $$;

-- Conversation messages index (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversation_messages_tenant_conv') THEN
        CREATE INDEX idx_conversation_messages_tenant_conv
            ON copilot_internal.conversation_messages(tenant_id, conversation_id);

        COMMENT ON INDEX copilot_internal.idx_conversation_messages_tenant_conv IS
            'Optimizes RLS policies on conversation_messages table. Supports filtering by tenant_id and conversation_id.';
    END IF;
END $$;

-- Cost records index (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_llm_cost_records_tenant_created') THEN
        CREATE INDEX idx_llm_cost_records_tenant_created
            ON copilot_internal.llm_cost_records(tenant_id, created_at DESC);

        COMMENT ON INDEX copilot_internal.idx_llm_cost_records_tenant_created IS
            'Optimizes queries fetching recent cost records for a tenant. Common in cost dashboards.';
    END IF;
END $$;

-- =====================================================
-- 3. Query Performance Analysis Utilities
-- =====================================================

-- Function to analyze query performance with EXPLAIN
CREATE OR REPLACE FUNCTION public.analyze_query_performance(
    p_query text
)
RETURNS TABLE(
    query_plan jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
BEGIN
    -- Execute EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) and return results
    -- Note: This is a helper for development/debugging
    -- In production, use pg_stat_statements extension instead

    RETURN QUERY
    EXECUTE format('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) %s', p_query);
END;
$$;

COMMENT ON FUNCTION public.analyze_query_performance IS
    'Development helper: Runs EXPLAIN ANALYZE on a query and returns JSON plan. Use for identifying slow RLS policy queries.';

-- =====================================================
-- 4. Slow Query Logging Table
-- =====================================================

CREATE TABLE IF NOT EXISTS copilot_internal.slow_query_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    tenant_id uuid REFERENCES copilot_internal.tenants(id),
    query_type text NOT NULL, -- 'select', 'insert', 'update', 'delete', 'rpc'
    table_name text,
    function_name text,
    execution_time_ms numeric NOT NULL,
    query_params jsonb,
    created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slow_query_log_created ON copilot_internal.slow_query_log(created_at DESC);
CREATE INDEX idx_slow_query_log_execution_time ON copilot_internal.slow_query_log(execution_time_ms DESC);
CREATE INDEX idx_slow_query_log_user ON copilot_internal.slow_query_log(user_id, created_at DESC);
CREATE INDEX idx_slow_query_log_tenant ON copilot_internal.slow_query_log(tenant_id, created_at DESC);

COMMENT ON TABLE copilot_internal.slow_query_log IS
    'Logs slow queries for performance monitoring. Helps identify RLS policy bottlenecks and query optimization opportunities.';

-- =====================================================
-- 5. Function: Get Query Performance Stats
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_query_performance_stats(
    p_hours_back integer DEFAULT 24,
    p_min_execution_time_ms numeric DEFAULT 100
)
RETURNS TABLE(
    query_type text,
    table_name text,
    avg_execution_time_ms numeric,
    max_execution_time_ms numeric,
    query_count bigint,
    slowest_tenant_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sq.query_type,
        sq.table_name,
        ROUND(AVG(sq.execution_time_ms), 2) as avg_execution_time_ms,
        MAX(sq.execution_time_ms) as max_execution_time_ms,
        COUNT(*) as query_count,
        (SELECT tenant_id FROM copilot_internal.slow_query_log sq2
         WHERE sq2.query_type = sq.query_type
           AND sq2.table_name = sq.table_name
         ORDER BY execution_time_ms DESC LIMIT 1) as slowest_tenant_id
    FROM copilot_internal.slow_query_log sq
    WHERE sq.created_at >= NOW() - (p_hours_back || ' hours')::interval
      AND sq.execution_time_ms >= p_min_execution_time_ms
    GROUP BY sq.query_type, sq.table_name
    ORDER BY avg_execution_time_ms DESC;
END;
$$;

COMMENT ON FUNCTION public.get_query_performance_stats IS
    'Returns query performance statistics for the last N hours. Use to identify which queries/tables need RLS optimization.';

-- =====================================================
-- 6. Function: Get User's Tenant Count
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_tenant_count(
    p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM copilot_internal.tenant_memberships
    WHERE user_id = p_user_id
      AND status = 'active';

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.get_user_tenant_count IS
    'Returns number of active tenants for a user. Useful for identifying users who may experience RLS performance issues.';

-- =====================================================
-- 7. Cleanup Function for Slow Query Log
-- =====================================================

CREATE OR REPLACE FUNCTION copilot_internal.cleanup_slow_query_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, copilot_internal
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    -- Delete logs older than 30 days
    DELETE FROM copilot_internal.slow_query_log
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION copilot_internal.cleanup_slow_query_logs IS
    'Deletes slow query logs older than 30 days. Should be run periodically via cron job.';

-- =====================================================
-- 8. Performance Monitoring View
-- =====================================================

CREATE OR REPLACE VIEW copilot_internal.rls_performance_summary AS
SELECT
    t.name as tenant_name,
    t.id as tenant_id,
    COUNT(DISTINCT tm.user_id) as user_count,
    COUNT(tm.id) as membership_count,
    ROUND(AVG(
        SELECT execution_time_ms
        FROM copilot_internal.slow_query_log sql
        WHERE sql.tenant_id = t.id
          AND sql.created_at >= NOW() - INTERVAL '24 hours'
    ), 2) as avg_query_time_24h_ms
FROM copilot_internal.tenants t
LEFT JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id AND tm.status = 'active'
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name
ORDER BY user_count DESC, membership_count DESC;

COMMENT ON VIEW copilot_internal.rls_performance_summary IS
    'Summary view of tenant sizes and query performance. Use to identify tenants experiencing RLS performance issues.';

-- =====================================================
-- 9. Index Statistics Helper
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_rls_index_usage()
RETURNS TABLE(
    index_name text,
    table_name text,
    index_scans bigint,
    tuples_read bigint,
    tuples_fetched bigint,
    index_size_mb numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.indexrelname::text as index_name,
        t.tablename::text as table_name,
        s.idx_scan as index_scans,
        s.idx_tup_read as tuples_read,
        s.idx_tup_fetch as tuples_fetched,
        ROUND(pg_relation_size(i.indexrelid) / 1024.0 / 1024.0, 2) as index_size_mb
    FROM pg_stat_user_indexes s
    JOIN pg_indexes i ON s.indexrelname = i.indexrelname
    JOIN pg_tables t ON t.tablename = s.relname
    WHERE t.schemaname = 'copilot_internal'
      AND i.indexname LIKE 'idx_%'
    ORDER BY s.idx_scan DESC;
END;
$$;

COMMENT ON FUNCTION public.get_rls_index_usage IS
    'Returns index usage statistics for RLS-related indexes. Use to verify indexes are being used effectively.';
