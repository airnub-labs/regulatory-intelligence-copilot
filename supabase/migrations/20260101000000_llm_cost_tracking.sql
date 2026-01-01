-- ========================================
-- LLM Cost Tracking Tables
-- ========================================
-- Persistent storage for LLM cost records and quota management.
-- Enables cost attribution, analysis, and budget enforcement.

-- ========================================
-- 1. LLM Cost Records Table
-- ========================================
-- Stores individual LLM API call costs with full attribution

CREATE TABLE IF NOT EXISTS copilot_internal.llm_cost_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Timing
    timestamp timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Provider info
    provider text NOT NULL,
    model text NOT NULL,

    -- Token counts
    input_tokens integer NOT NULL,
    output_tokens integer NOT NULL,
    total_tokens integer NOT NULL,

    -- Costs in USD (use numeric for precision)
    input_cost_usd numeric(12,6) NOT NULL,
    output_cost_usd numeric(12,6) NOT NULL,
    total_cost_usd numeric(12,6) NOT NULL,
    is_estimated boolean NOT NULL DEFAULT false,

    -- Attribution dimensions
    tenant_id uuid,
    user_id uuid,
    task text,
    conversation_id uuid,

    -- Request metadata
    cached boolean DEFAULT false,
    streaming boolean DEFAULT false,
    duration_ms integer,
    success boolean DEFAULT true,

    -- Constraints
    CONSTRAINT positive_tokens CHECK (input_tokens >= 0 AND output_tokens >= 0),
    CONSTRAINT positive_costs CHECK (input_cost_usd >= 0 AND output_cost_usd >= 0)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_cost_records_tenant
    ON copilot_internal.llm_cost_records(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cost_records_user
    ON copilot_internal.llm_cost_records(user_id);

CREATE INDEX IF NOT EXISTS idx_cost_records_task
    ON copilot_internal.llm_cost_records(task);

CREATE INDEX IF NOT EXISTS idx_cost_records_timestamp
    ON copilot_internal.llm_cost_records(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_cost_records_conversation
    ON copilot_internal.llm_cost_records(conversation_id);

CREATE INDEX IF NOT EXISTS idx_cost_records_provider_model
    ON copilot_internal.llm_cost_records(provider, model);

-- Composite index for tenant + time range queries (common for billing)
CREATE INDEX IF NOT EXISTS idx_cost_records_tenant_timestamp
    ON copilot_internal.llm_cost_records(tenant_id, timestamp DESC);

-- ========================================
-- 2. Cost Quotas Table
-- ========================================
-- Manages spending limits per scope (platform, tenant, user)

CREATE TABLE IF NOT EXISTS copilot_internal.cost_quotas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope (platform, tenant, user)
    scope text NOT NULL CHECK (scope IN ('platform', 'tenant', 'user')),
    scope_id uuid,

    -- Quota settings
    limit_usd numeric(12,6) NOT NULL,
    period text NOT NULL CHECK (period IN ('hour', 'day', 'week', 'month')),

    -- Current period tracking
    current_spend_usd numeric(12,6) NOT NULL DEFAULT 0,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,

    -- Warning threshold (0-1)
    warning_threshold numeric(3,2) CHECK (warning_threshold >= 0 AND warning_threshold <= 1),

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint on scope + scope_id
    CONSTRAINT unique_quota_scope UNIQUE (scope, scope_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_quotas_scope
    ON copilot_internal.cost_quotas(scope);

CREATE INDEX IF NOT EXISTS idx_cost_quotas_scope_id
    ON copilot_internal.cost_quotas(scope_id);

-- Updated_at trigger function (reuse existing or create)
CREATE OR REPLACE FUNCTION copilot_internal.update_cost_quota_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cost_quotas_timestamp
    BEFORE UPDATE ON copilot_internal.cost_quotas
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_cost_quota_timestamp();

-- ========================================
-- 3. Atomic Spend Increment Function
-- ========================================
-- Safely increment spend for concurrent requests

CREATE OR REPLACE FUNCTION copilot_internal.increment_quota_spend(
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
        AND (
            (p_scope_id IS NULL AND scope_id IS NULL)
            OR scope_id = p_scope_id
        );
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 4. Cost Aggregation View
-- ========================================
-- Pre-aggregated view for common reporting queries

CREATE OR REPLACE VIEW copilot_internal.cost_summary_by_task AS
SELECT
    task,
    COUNT(*) as request_count,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(total_cost_usd) as avg_cost_per_request,
    MIN(timestamp) as first_request,
    MAX(timestamp) as last_request
FROM copilot_internal.llm_cost_records
WHERE task IS NOT NULL
GROUP BY task
ORDER BY total_cost_usd DESC;

CREATE OR REPLACE VIEW copilot_internal.cost_summary_by_tenant AS
SELECT
    tenant_id,
    COUNT(*) as request_count,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(total_cost_usd) as avg_cost_per_request,
    MIN(timestamp) as first_request,
    MAX(timestamp) as last_request
FROM copilot_internal.llm_cost_records
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id
ORDER BY total_cost_usd DESC;

CREATE OR REPLACE VIEW copilot_internal.cost_summary_by_model AS
SELECT
    provider,
    model,
    COUNT(*) as request_count,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(total_cost_usd) as avg_cost_per_request,
    MIN(timestamp) as first_request,
    MAX(timestamp) as last_request
FROM copilot_internal.llm_cost_records
GROUP BY provider, model
ORDER BY total_cost_usd DESC;

-- ========================================
-- 5. Row Level Security
-- ========================================

ALTER TABLE copilot_internal.llm_cost_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.cost_quotas ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY cost_records_service_role_all
    ON copilot_internal.llm_cost_records
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY cost_quotas_service_role_all
    ON copilot_internal.cost_quotas
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read their own tenant's records
CREATE POLICY cost_records_tenant_select
    ON copilot_internal.llm_cost_records
    FOR SELECT
    TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Authenticated users can read their tenant's quotas
CREATE POLICY cost_quotas_tenant_select
    ON copilot_internal.cost_quotas
    FOR SELECT
    TO authenticated
    USING (
        scope = 'platform'
        OR (scope = 'tenant' AND scope_id = (auth.jwt() ->> 'tenant_id')::uuid)
        OR (scope = 'user' AND scope_id = (auth.jwt() ->> 'sub')::uuid)
    );

-- ========================================
-- 6. Grants
-- ========================================

GRANT SELECT ON copilot_internal.llm_cost_records TO authenticated;
GRANT SELECT ON copilot_internal.cost_quotas TO authenticated;
GRANT SELECT ON copilot_internal.cost_summary_by_task TO authenticated;
GRANT SELECT ON copilot_internal.cost_summary_by_tenant TO authenticated;
GRANT SELECT ON copilot_internal.cost_summary_by_model TO authenticated;

-- ========================================
-- 7. Data Retention Policy (Optional)
-- ========================================
-- Uncomment to enable automatic cleanup of old records

-- CREATE OR REPLACE FUNCTION copilot_internal.cleanup_old_cost_records()
-- RETURNS void AS $$
-- BEGIN
--     DELETE FROM copilot_internal.llm_cost_records
--     WHERE timestamp < now() - INTERVAL '90 days';
-- END;
-- $$ LANGUAGE plpgsql;

-- ========================================
-- Comments
-- ========================================

COMMENT ON TABLE copilot_internal.llm_cost_records IS 'Individual LLM API call cost records with full attribution';
COMMENT ON TABLE copilot_internal.cost_quotas IS 'Spending limits and tracking per scope (platform/tenant/user)';
COMMENT ON COLUMN copilot_internal.llm_cost_records.task IS 'Touchpoint identifier (main-chat, merge-summarizer, agent:*, compaction:*, pii-sanitizer)';
COMMENT ON COLUMN copilot_internal.llm_cost_records.is_estimated IS 'True if cost was estimated due to missing pricing data';
COMMENT ON FUNCTION copilot_internal.increment_quota_spend IS 'Atomically increment quota spend for concurrent-safe updates';
