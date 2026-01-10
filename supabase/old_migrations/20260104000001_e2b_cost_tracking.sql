-- ============================================================================
-- MIGRATION: E2B Sandbox Cost Tracking & Resource Management
-- ============================================================================
-- This migration implements comprehensive cost tracking, resource monitoring,
-- and quota enforcement for E2B sandboxes, replicating the LLM cost tracking
-- architecture for E2B execution contexts.
--
-- Features:
-- - Dynamic E2B pricing configuration (similar to model_pricing)
-- - E2B cost records with full attribution (tenant, user, conversation, path)
-- - Resource usage tracking (execution time, CPU, memory)
-- - Quota enforcement (separate E2B quotas from LLM quotas)
-- - Cost aggregation views for reporting
-- - Audit trail for compliance
--
-- References:
--   - 20260101000000_llm_cost_tracking.sql (pattern to replicate)
--   - E2B_SANDBOX_SCALE_AUDIT.md
-- ============================================================================

-- =============================================================================
-- PART 1: E2B Pricing Configuration Table
-- =============================================================================
-- Dynamic pricing for E2B sandboxes (similar to model_pricing for LLMs)
-- Allows updating pricing without code deployments

CREATE TABLE IF NOT EXISTS copilot_internal.e2b_pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Sandbox tier/type
    tier text NOT NULL CHECK (tier IN ('standard', 'gpu', 'high-memory', 'high-cpu')),
    region text NOT NULL DEFAULT 'us-east-1',

    -- Pricing model (per-second is most common for sandboxes)
    price_per_second numeric(12,8) NOT NULL CHECK (price_per_second >= 0),

    -- Optional: Additional pricing dimensions
    price_per_gb_memory_hour numeric(12,8) CHECK (price_per_gb_memory_hour >= 0),
    price_per_cpu_core_hour numeric(12,8) CHECK (price_per_cpu_core_hour >= 0),
    price_per_gb_disk_io numeric(12,8) CHECK (price_per_gb_disk_io >= 0),

    -- Effective date range
    effective_date timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,

    -- Metadata
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint: one active price per tier+region at a time
    CONSTRAINT unique_active_pricing UNIQUE (tier, region, effective_date)
);

-- Index for pricing lookups
CREATE INDEX IF NOT EXISTS idx_e2b_pricing_tier_region
    ON copilot_internal.e2b_pricing(tier, region, effective_date DESC);

COMMENT ON TABLE copilot_internal.e2b_pricing IS 'Dynamic pricing configuration for E2B sandboxes by tier and region';
COMMENT ON COLUMN copilot_internal.e2b_pricing.tier IS 'Sandbox tier: standard, gpu, high-memory, high-cpu';
COMMENT ON COLUMN copilot_internal.e2b_pricing.price_per_second IS 'Base price per second of execution time (USD)';

-- =============================================================================
-- PART 2: E2B Cost Records Table
-- =============================================================================
-- Individual E2B sandbox cost records (similar to llm_cost_records)

CREATE TABLE IF NOT EXISTS copilot_internal.e2b_cost_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Timing
    timestamp timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Execution context reference
    execution_context_id uuid
        REFERENCES copilot_internal.execution_contexts(id)
        ON DELETE SET NULL,
    sandbox_id text NOT NULL,

    -- Sandbox configuration
    tier text NOT NULL,
    region text NOT NULL DEFAULT 'us-east-1',

    -- Resource usage
    execution_time_seconds numeric(12,3) NOT NULL CHECK (execution_time_seconds >= 0),
    cpu_core_seconds numeric(12,3) CHECK (cpu_core_seconds >= 0),
    memory_gb_seconds numeric(12,3) CHECK (memory_gb_seconds >= 0),
    disk_io_gb numeric(12,6) CHECK (disk_io_gb >= 0),
    network_io_gb numeric(12,6) CHECK (network_io_gb >= 0),

    -- Costs in USD (use numeric for precision)
    execution_cost_usd numeric(12,6) NOT NULL CHECK (execution_cost_usd >= 0),
    resource_cost_usd numeric(12,6) DEFAULT 0 CHECK (resource_cost_usd >= 0),
    total_cost_usd numeric(12,6) NOT NULL CHECK (total_cost_usd >= 0),
    is_estimated boolean NOT NULL DEFAULT false,

    -- Attribution dimensions
    tenant_id uuid NOT NULL,
    user_id uuid,
    conversation_id uuid
        REFERENCES copilot_internal.conversations(id)
        ON DELETE SET NULL,
    path_id uuid
        REFERENCES copilot_internal.conversation_paths(id)
        ON DELETE SET NULL,

    -- Sandbox lifecycle
    created_at_sandbox timestamptz,
    terminated_at_sandbox timestamptz,
    sandbox_status text CHECK (sandbox_status IN ('creating', 'ready', 'error', 'terminated')),

    -- Request metadata
    success boolean DEFAULT true,
    error_message text,
    operation_type text,  -- 'code_execution', 'file_operation', 'shell_command', etc.

    -- Constraints
    CONSTRAINT positive_costs CHECK (execution_cost_usd >= 0 AND total_cost_usd >= 0)
);

-- Indexes for common query patterns (replicate LLM cost records pattern)
CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_tenant
    ON copilot_internal.e2b_cost_records(tenant_id);

CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_user
    ON copilot_internal.e2b_cost_records(user_id);

CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_timestamp
    ON copilot_internal.e2b_cost_records(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_conversation
    ON copilot_internal.e2b_cost_records(conversation_id);

CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_path
    ON copilot_internal.e2b_cost_records(path_id);

CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_sandbox
    ON copilot_internal.e2b_cost_records(sandbox_id);

CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_tier
    ON copilot_internal.e2b_cost_records(tier, region);

-- Composite index for tenant + time range queries (common for billing)
CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_tenant_timestamp
    ON copilot_internal.e2b_cost_records(tenant_id, timestamp DESC);

-- Composite index for execution context lookups
CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_context
    ON copilot_internal.e2b_cost_records(execution_context_id, timestamp DESC);

COMMENT ON TABLE copilot_internal.e2b_cost_records IS 'Individual E2B sandbox cost records with full attribution and resource usage';
COMMENT ON COLUMN copilot_internal.e2b_cost_records.execution_time_seconds IS 'Total execution/uptime of sandbox in seconds';
COMMENT ON COLUMN copilot_internal.e2b_cost_records.cpu_core_seconds IS 'CPU core-seconds consumed (cores * seconds)';
COMMENT ON COLUMN copilot_internal.e2b_cost_records.memory_gb_seconds IS 'Memory GB-seconds consumed (GB * seconds)';

-- =============================================================================
-- PART 3: Extend Cost Quotas for E2B
-- =============================================================================
-- Add resource_type column to distinguish LLM vs E2B quotas

-- Add column for resource type (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'copilot_internal'
          AND table_name = 'cost_quotas'
          AND column_name = 'resource_type'
    ) THEN
        ALTER TABLE copilot_internal.cost_quotas
        ADD COLUMN resource_type text NOT NULL DEFAULT 'llm'
        CHECK (resource_type IN ('llm', 'e2b', 'all'));

        -- Update constraint
        ALTER TABLE copilot_internal.cost_quotas
        DROP CONSTRAINT IF EXISTS unique_quota_scope;

        ALTER TABLE copilot_internal.cost_quotas
        ADD CONSTRAINT unique_quota_scope
        UNIQUE (scope, scope_id, resource_type);

        -- Create index for resource_type lookups
        CREATE INDEX IF NOT EXISTS idx_cost_quotas_resource_type
            ON copilot_internal.cost_quotas(resource_type);

        COMMENT ON COLUMN copilot_internal.cost_quotas.resource_type IS 'Type of resource: llm (language models), e2b (sandboxes), or all (combined limit)';
    END IF;
END $$;

-- =============================================================================
-- PART 4: E2B-Specific Quota Functions
-- =============================================================================

-- Function to increment E2B quota spend (similar to LLM version)
CREATE OR REPLACE FUNCTION copilot_internal.increment_e2b_quota_spend(
    p_scope text,
    p_scope_id uuid,
    p_amount numeric
) RETURNS void AS $$
BEGIN
    UPDATE copilot_internal.cost_quotas
    SET
        current_spend_usd = current_spend_usd + p_amount,
        updated_at = now()
    WHERE
        scope = p_scope
        AND resource_type IN ('e2b', 'all')
        AND (
            (p_scope_id IS NULL AND scope_id IS NULL)
            OR scope_id = p_scope_id
        );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION copilot_internal.increment_e2b_quota_spend TO service_role;

COMMENT ON FUNCTION copilot_internal.increment_e2b_quota_spend IS 'Atomically increment E2B quota spend for concurrent-safe updates';

-- Function to check E2B quota before reservation
CREATE OR REPLACE FUNCTION copilot_internal.check_e2b_quota(
    p_scope text,
    p_scope_id uuid,
    p_estimated_cost numeric
) RETURNS boolean AS $$
DECLARE
    v_quota_exceeded boolean;
BEGIN
    SELECT
        COALESCE(
            MAX(current_spend_usd + p_estimated_cost > limit_usd),
            false
        )
    INTO v_quota_exceeded
    FROM copilot_internal.cost_quotas
    WHERE
        scope = p_scope
        AND resource_type IN ('e2b', 'all')
        AND (
            (p_scope_id IS NULL AND scope_id IS NULL)
            OR scope_id = p_scope_id
        );

    RETURN NOT v_quota_exceeded;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION copilot_internal.check_e2b_quota TO service_role;

COMMENT ON FUNCTION copilot_internal.check_e2b_quota IS 'Check if E2B quota would be exceeded by estimated cost. Returns true if within quota.';

-- =============================================================================
-- PART 5: Cost Aggregation Views
-- =============================================================================

-- E2B costs by tenant (similar to LLM pattern)
CREATE OR REPLACE VIEW copilot_internal.e2b_cost_summary_by_tenant AS
SELECT
    tenant_id,
    COUNT(*) as sandbox_count,
    SUM(execution_time_seconds) as total_execution_seconds,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(total_cost_usd) as avg_cost_per_sandbox,
    AVG(execution_time_seconds) as avg_execution_seconds,
    MIN(timestamp) as first_request,
    MAX(timestamp) as last_request,
    COUNT(DISTINCT conversation_id) as conversation_count,
    COUNT(DISTINCT user_id) as user_count
FROM copilot_internal.e2b_cost_records
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id
ORDER BY total_cost_usd DESC;

-- E2B costs by tier
CREATE OR REPLACE VIEW copilot_internal.e2b_cost_summary_by_tier AS
SELECT
    tier,
    region,
    COUNT(*) as sandbox_count,
    SUM(execution_time_seconds) as total_execution_seconds,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(total_cost_usd) as avg_cost_per_sandbox,
    AVG(execution_time_seconds) as avg_execution_seconds,
    MIN(timestamp) as first_request,
    MAX(timestamp) as last_request
FROM copilot_internal.e2b_cost_records
GROUP BY tier, region
ORDER BY total_cost_usd DESC;

-- E2B costs by conversation
CREATE OR REPLACE VIEW copilot_internal.e2b_cost_summary_by_conversation AS
SELECT
    conversation_id,
    tenant_id,
    COUNT(*) as sandbox_count,
    SUM(execution_time_seconds) as total_execution_seconds,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(total_cost_usd) as avg_cost_per_sandbox,
    MIN(timestamp) as first_execution,
    MAX(timestamp) as last_execution,
    COUNT(DISTINCT path_id) as path_count
FROM copilot_internal.e2b_cost_records
WHERE conversation_id IS NOT NULL
GROUP BY conversation_id, tenant_id
ORDER BY total_cost_usd DESC;

-- Combined LLM + E2B cost summary by tenant
CREATE OR REPLACE VIEW copilot_internal.combined_cost_summary_by_tenant AS
SELECT
    COALESCE(llm.tenant_id, e2b.tenant_id) as tenant_id,
    COALESCE(llm.total_cost_usd, 0) as llm_cost_usd,
    COALESCE(e2b.total_cost_usd, 0) as e2b_cost_usd,
    COALESCE(llm.total_cost_usd, 0) + COALESCE(e2b.total_cost_usd, 0) as total_cost_usd,
    llm.request_count as llm_request_count,
    e2b.sandbox_count as e2b_sandbox_count,
    GREATEST(llm.last_request, e2b.last_request) as last_activity
FROM
    copilot_internal.cost_summary_by_tenant llm
FULL OUTER JOIN
    copilot_internal.e2b_cost_summary_by_tenant e2b
    ON llm.tenant_id = e2b.tenant_id
ORDER BY total_cost_usd DESC;

-- =============================================================================
-- PART 6: Helper Functions for Cost Calculation
-- =============================================================================

-- Function to calculate E2B cost based on pricing
CREATE OR REPLACE FUNCTION copilot_internal.calculate_e2b_cost(
    p_tier text,
    p_region text,
    p_execution_time_seconds numeric,
    p_cpu_core_seconds numeric DEFAULT NULL,
    p_memory_gb_seconds numeric DEFAULT NULL,
    p_disk_io_gb numeric DEFAULT NULL,
    p_pricing_date timestamptz DEFAULT now()
) RETURNS TABLE(
    execution_cost_usd numeric,
    resource_cost_usd numeric,
    total_cost_usd numeric,
    is_estimated boolean
) AS $$
DECLARE
    v_pricing record;
    v_exec_cost numeric := 0;
    v_resource_cost numeric := 0;
    v_is_estimated boolean := false;
BEGIN
    -- Get pricing for the tier/region/date
    SELECT
        price_per_second,
        price_per_cpu_core_hour,
        price_per_gb_memory_hour,
        price_per_gb_disk_io
    INTO v_pricing
    FROM copilot_internal.e2b_pricing
    WHERE
        tier = p_tier
        AND region = p_region
        AND effective_date <= p_pricing_date
        AND (expires_at IS NULL OR expires_at > p_pricing_date)
    ORDER BY effective_date DESC
    LIMIT 1;

    -- If no pricing found, use default estimates
    IF v_pricing IS NULL THEN
        v_is_estimated := true;

        -- Default fallback pricing (conservative estimates)
        CASE p_tier
            WHEN 'standard' THEN v_exec_cost := p_execution_time_seconds * 0.0001;  -- $0.0001/sec
            WHEN 'gpu' THEN v_exec_cost := p_execution_time_seconds * 0.001;        -- $0.001/sec
            WHEN 'high-memory' THEN v_exec_cost := p_execution_time_seconds * 0.0005;
            WHEN 'high-cpu' THEN v_exec_cost := p_execution_time_seconds * 0.0003;
            ELSE v_exec_cost := p_execution_time_seconds * 0.0001;
        END CASE;
    ELSE
        -- Calculate execution cost
        v_exec_cost := p_execution_time_seconds * v_pricing.price_per_second;

        -- Calculate resource costs if available
        IF p_cpu_core_seconds IS NOT NULL AND v_pricing.price_per_cpu_core_hour IS NOT NULL THEN
            v_resource_cost := v_resource_cost + (p_cpu_core_seconds / 3600.0) * v_pricing.price_per_cpu_core_hour;
        END IF;

        IF p_memory_gb_seconds IS NOT NULL AND v_pricing.price_per_gb_memory_hour IS NOT NULL THEN
            v_resource_cost := v_resource_cost + (p_memory_gb_seconds / 3600.0) * v_pricing.price_per_gb_memory_hour;
        END IF;

        IF p_disk_io_gb IS NOT NULL AND v_pricing.price_per_gb_disk_io IS NOT NULL THEN
            v_resource_cost := v_resource_cost + p_disk_io_gb * v_pricing.price_per_gb_disk_io;
        END IF;
    END IF;

    RETURN QUERY SELECT
        v_exec_cost,
        v_resource_cost,
        v_exec_cost + v_resource_cost,
        v_is_estimated;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION copilot_internal.calculate_e2b_cost TO service_role;

COMMENT ON FUNCTION copilot_internal.calculate_e2b_cost IS 'Calculate E2B sandbox cost based on tier, region, and resource usage. Returns execution cost, resource cost, total, and estimation flag.';

-- =============================================================================
-- PART 7: Row Level Security
-- =============================================================================

ALTER TABLE copilot_internal.e2b_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.e2b_cost_records ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY e2b_pricing_service_role_all
    ON copilot_internal.e2b_pricing
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY e2b_cost_records_service_role_all
    ON copilot_internal.e2b_cost_records
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read pricing
CREATE POLICY e2b_pricing_authenticated_read
    ON copilot_internal.e2b_pricing
    FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can read their own tenant's cost records
CREATE POLICY e2b_cost_records_tenant_select
    ON copilot_internal.e2b_cost_records
    FOR SELECT
    TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- =============================================================================
-- PART 8: Grants
-- =============================================================================

GRANT SELECT ON copilot_internal.e2b_pricing TO authenticated;
GRANT SELECT ON copilot_internal.e2b_cost_records TO authenticated;
GRANT SELECT ON copilot_internal.e2b_cost_summary_by_tenant TO authenticated;
GRANT SELECT ON copilot_internal.e2b_cost_summary_by_tier TO authenticated;
GRANT SELECT ON copilot_internal.e2b_cost_summary_by_conversation TO authenticated;
GRANT SELECT ON copilot_internal.combined_cost_summary_by_tenant TO authenticated;

-- =============================================================================
-- PART 9: Seed Default Pricing
-- =============================================================================

-- Insert default E2B pricing (update these based on actual E2B pricing)
INSERT INTO copilot_internal.e2b_pricing (tier, region, price_per_second, effective_date, notes)
VALUES
    ('standard', 'us-east-1', 0.0001, '2026-01-01', 'Standard sandbox - 2 vCPU, 2GB RAM'),
    ('gpu', 'us-east-1', 0.001, '2026-01-01', 'GPU sandbox - 4 vCPU, 16GB RAM, 1x GPU'),
    ('high-memory', 'us-east-1', 0.0005, '2026-01-01', 'High-memory sandbox - 4 vCPU, 32GB RAM'),
    ('high-cpu', 'us-east-1', 0.0003, '2026-01-01', 'High-CPU sandbox - 8 vCPU, 8GB RAM')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PART 10: Verification
-- =============================================================================

DO $$
DECLARE
    e2b_pricing_exists boolean;
    e2b_cost_records_exists boolean;
    resource_type_exists boolean;
    pricing_count integer;
BEGIN
    -- Check tables exist
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'copilot_internal'
        AND table_name = 'e2b_pricing'
    ) INTO e2b_pricing_exists;

    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'copilot_internal'
        AND table_name = 'e2b_cost_records'
    ) INTO e2b_cost_records_exists;

    -- Check resource_type column exists
    SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'copilot_internal'
          AND table_name = 'cost_quotas'
          AND column_name = 'resource_type'
    ) INTO resource_type_exists;

    -- Check pricing data
    SELECT COUNT(*) INTO pricing_count
    FROM copilot_internal.e2b_pricing;

    -- Validate
    IF NOT e2b_pricing_exists THEN
        RAISE EXCEPTION 'Migration failed: e2b_pricing table not created';
    END IF;

    IF NOT e2b_cost_records_exists THEN
        RAISE EXCEPTION 'Migration failed: e2b_cost_records table not created';
    END IF;

    IF NOT resource_type_exists THEN
        RAISE EXCEPTION 'Migration failed: resource_type column not added to cost_quotas';
    END IF;

    RAISE NOTICE '=== E2B Cost Tracking Migration completed successfully ===';
    RAISE NOTICE '  ✓ e2b_pricing table created';
    RAISE NOTICE '  ✓ e2b_cost_records table created';
    RAISE NOTICE '  ✓ cost_quotas extended with resource_type';
    RAISE NOTICE '  ✓ % pricing tiers seeded', pricing_count;
    RAISE NOTICE '  ✓ Cost calculation functions created';
    RAISE NOTICE '  ✓ Aggregation views created';
    RAISE NOTICE '  ✓ RLS policies configured';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Update E2B pricing with actual vendor rates';
    RAISE NOTICE '  2. Configure E2B quotas per tenant';
    RAISE NOTICE '  3. Enable resource tracking in execution context lifecycle';
    RAISE NOTICE '  4. Set up cost monitoring dashboards';
END $$;
