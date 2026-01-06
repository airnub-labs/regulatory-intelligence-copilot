-- ========================================
-- Unified Metrics Schema for Analytics
-- ========================================
-- Provides read-only views for BI tools and analytics
-- Consolidates cost tracking across all sources
--
-- This schema separates read operations (analytics) from write operations (application logic)
-- allowing us to grant read-only access to analytics tools without exposing write capabilities.
--
-- Migration: 20260105000006_unified_metrics_schema.sql
-- Date: 2026-01-06
-- Phase: 1.5 - Migration Consolidation
-- ========================================

-- Create metrics schema
CREATE SCHEMA IF NOT EXISTS metrics;

COMMENT ON SCHEMA metrics IS 'Read-only analytical views for BI tools and dashboards';

-- ========================================
-- Unified Cost View
-- ========================================
-- Combines all cost sources (LLM + E2B) into a single queryable view
CREATE OR REPLACE VIEW metrics.all_costs AS
SELECT
    'llm' AS cost_type,
    tenant_id,
    user_id,
    conversation_id,
    NULL::uuid AS path_id,
    model,
    provider,
    input_tokens,
    output_tokens,
    total_cost_usd AS cost_usd,
    created_at
FROM copilot_internal.llm_cost_records
UNION ALL
SELECT
    'e2b' AS cost_type,
    tenant_id,
    user_id,
    conversation_id,
    path_id,
    tier AS model,
    'e2b' AS provider,
    0 AS input_tokens,
    0 AS output_tokens,
    total_cost_usd AS cost_usd,
    created_at
FROM copilot_internal.e2b_cost_records;

COMMENT ON VIEW metrics.all_costs IS 'Unified view of all costs (LLM + E2B) for analytics and reporting';

-- ========================================
-- Cost Summary Views
-- ========================================

-- Cost aggregated by tenant and type
CREATE OR REPLACE VIEW metrics.cost_by_tenant AS
SELECT
    tenant_id,
    cost_type,
    SUM(cost_usd) AS total_cost_usd,
    COUNT(*) AS record_count,
    MIN(created_at) AS first_cost_at,
    MAX(created_at) AS last_cost_at
FROM metrics.all_costs
GROUP BY tenant_id, cost_type;

COMMENT ON VIEW metrics.cost_by_tenant IS 'Cost summaries grouped by tenant and type (llm, e2b)';

-- Cost aggregated by user and type
CREATE OR REPLACE VIEW metrics.cost_by_user AS
SELECT
    tenant_id,
    user_id,
    cost_type,
    SUM(cost_usd) AS total_cost_usd,
    COUNT(*) AS record_count,
    MIN(created_at) AS first_cost_at,
    MAX(created_at) AS last_cost_at
FROM metrics.all_costs
GROUP BY tenant_id, user_id, cost_type;

COMMENT ON VIEW metrics.cost_by_user IS 'Cost summaries grouped by tenant, user, and type';

-- Cost aggregated by conversation
CREATE OR REPLACE VIEW metrics.cost_by_conversation AS
SELECT
    tenant_id,
    conversation_id,
    cost_type,
    SUM(cost_usd) AS total_cost_usd,
    COUNT(*) AS record_count,
    MIN(created_at) AS first_cost_at,
    MAX(created_at) AS last_cost_at
FROM metrics.all_costs
WHERE conversation_id IS NOT NULL
GROUP BY tenant_id, conversation_id, cost_type;

COMMENT ON VIEW metrics.cost_by_conversation IS 'Cost summaries grouped by conversation';

-- ========================================
-- Quota Status View
-- ========================================
-- Provides quota usage with status indicators
CREATE OR REPLACE VIEW metrics.quota_status AS
SELECT
    CASE
        WHEN q.scope = 'tenant' THEN q.scope_id
        ELSE NULL
    END AS tenant_id,
    CASE
        WHEN q.scope = 'user' THEN q.scope_id
        ELSE NULL
    END AS user_id,
    q.scope,
    q.resource_type,
    q.period AS quota_period,
    q.limit_usd AS limit_value,
    q.current_spend_usd AS current_usage,
    CASE
        WHEN q.limit_usd > 0
        THEN (q.current_spend_usd::float / q.limit_usd * 100)::numeric(5,2)
        ELSE 0
    END AS usage_percent,
    CASE
        WHEN q.limit_usd > 0 AND q.current_spend_usd >= q.limit_usd
        THEN 'exceeded'
        WHEN q.limit_usd > 0 AND (q.current_spend_usd::float / q.limit_usd) > 0.9
        THEN 'warning'
        WHEN q.limit_usd > 0 AND (q.current_spend_usd::float / q.limit_usd) > 0.75
        THEN 'caution'
        ELSE 'ok'
    END AS status,
    q.period_start,
    q.period_end,
    q.created_at,
    q.updated_at
FROM copilot_internal.cost_quotas q;

COMMENT ON VIEW metrics.quota_status IS 'Quota usage with status indicators (ok/caution/warning/exceeded)';

-- ========================================
-- LLM Specific Views
-- ========================================

-- Direct read-only access to LLM costs
CREATE OR REPLACE VIEW metrics.llm_costs AS
SELECT * FROM copilot_internal.llm_cost_records;

COMMENT ON VIEW metrics.llm_costs IS 'Direct read-only access to LLM cost records';

-- LLM usage aggregated by model and provider
CREATE OR REPLACE VIEW metrics.llm_model_usage AS
SELECT
    tenant_id,
    model,
    provider,
    COUNT(*) AS request_count,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(total_cost_usd) AS total_cost_usd,
    AVG(total_cost_usd) AS avg_cost_per_request,
    MIN(created_at) AS first_used_at,
    MAX(created_at) AS last_used_at
FROM copilot_internal.llm_cost_records
GROUP BY tenant_id, model, provider;

COMMENT ON VIEW metrics.llm_model_usage IS 'LLM model usage statistics aggregated by tenant, model, and provider';

-- Daily LLM cost trends
CREATE OR REPLACE VIEW metrics.llm_costs_daily AS
SELECT
    tenant_id,
    DATE(created_at) AS date,
    model,
    provider,
    SUM(total_cost_usd) AS total_cost_usd,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    COUNT(*) AS request_count
FROM copilot_internal.llm_cost_records
GROUP BY tenant_id, DATE(created_at), model, provider;

COMMENT ON VIEW metrics.llm_costs_daily IS 'Daily LLM cost trends for time-series analysis';

-- ========================================
-- E2B Specific Views
-- ========================================

-- Direct read-only access to E2B costs
CREATE OR REPLACE VIEW metrics.e2b_costs AS
SELECT * FROM copilot_internal.e2b_cost_records;

COMMENT ON VIEW metrics.e2b_costs IS 'Direct read-only access to E2B sandbox cost records';

-- E2B usage aggregated by sandbox tier
CREATE OR REPLACE VIEW metrics.e2b_sandbox_usage AS
SELECT
    tenant_id,
    tier AS sandbox_tier,
    COUNT(*) AS execution_count,
    SUM(total_cost_usd) AS total_cost_usd,
    AVG(total_cost_usd) AS avg_cost_per_execution,
    MIN(created_at) AS first_used_at,
    MAX(created_at) AS last_used_at
FROM copilot_internal.e2b_cost_records
GROUP BY tenant_id, tier;

COMMENT ON VIEW metrics.e2b_sandbox_usage IS 'E2B sandbox usage statistics aggregated by tenant and template';

-- Daily E2B cost trends
CREATE OR REPLACE VIEW metrics.e2b_costs_daily AS
SELECT
    tenant_id,
    DATE(created_at) AS date,
    tier AS sandbox_tier,
    SUM(total_cost_usd) AS total_cost_usd,
    COUNT(*) AS execution_count
FROM copilot_internal.e2b_cost_records
GROUP BY tenant_id, DATE(created_at), tier;

COMMENT ON VIEW metrics.e2b_costs_daily IS 'Daily E2B cost trends for time-series analysis';

-- ========================================
-- Cost Estimates View
-- ========================================
-- Read-only access to estimated costs (combines LLM and E2B estimates)
CREATE OR REPLACE VIEW metrics.cost_estimates AS
SELECT
    'llm' AS estimate_type,
    provider,
    model,
    operation_type,
    NULL::integer AS expected_duration_seconds,
    estimated_cost_usd,
    confidence_level,
    description,
    assumptions,
    effective_date,
    expires_at,
    created_at,
    updated_at
FROM copilot_internal.llm_cost_estimates
UNION ALL
SELECT
    'e2b' AS estimate_type,
    'e2b' AS provider,
    tier AS model,
    operation_type,
    expected_duration_seconds,
    estimated_cost_usd,
    confidence_level,
    description,
    assumptions,
    effective_date,
    expires_at,
    created_at,
    updated_at
FROM copilot_internal.e2b_cost_estimates;

COMMENT ON VIEW metrics.cost_estimates IS 'Estimated costs for operations before execution (combines LLM and E2B)';

-- ========================================
-- Combined Analytics Views
-- ========================================

-- Total costs by tenant across all sources
CREATE OR REPLACE VIEW metrics.tenant_total_costs AS
SELECT
    tenant_id,
    SUM(total_cost_usd) AS total_cost_usd,
    SUM(record_count) AS total_records,
    MIN(first_cost_at) AS first_cost_at,
    MAX(last_cost_at) AS last_cost_at
FROM metrics.cost_by_tenant
GROUP BY tenant_id;

COMMENT ON VIEW metrics.tenant_total_costs IS 'Total costs across all sources aggregated by tenant';

-- Top spending tenants
CREATE OR REPLACE VIEW metrics.top_spending_tenants AS
SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.type AS tenant_type,
    t.plan,
    COALESCE(c.total_cost_usd, 0) AS total_cost_usd,
    COALESCE(c.total_records, 0) AS total_records
FROM copilot_internal.tenants t
LEFT JOIN metrics.tenant_total_costs c ON c.tenant_id = t.id
ORDER BY COALESCE(c.total_cost_usd, 0) DESC;

COMMENT ON VIEW metrics.top_spending_tenants IS 'Tenants ranked by total spending across all cost sources';

-- ========================================
-- Permissions
-- ========================================

-- Grant read-only access to authenticated users
-- Users can only see metrics for tenants they belong to (via RLS on base tables)
GRANT USAGE ON SCHEMA metrics TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO authenticated;

-- Ensure future views also get SELECT permission
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics
    GRANT SELECT ON TABLES TO authenticated;

-- Service role has full access (for admin operations)
GRANT ALL ON SCHEMA metrics TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA metrics TO service_role;

-- ========================================
-- Indexes for Performance (on base tables)
-- ========================================

-- Note: Indexes are on the base tables in copilot_internal schema
-- Views inherit query performance from base table indexes

-- Ensure cost tracking tables have appropriate indexes
-- (These may already exist from previous migrations, but we ensure them here)

-- LLM cost records indexes
CREATE INDEX IF NOT EXISTS idx_llm_cost_records_tenant_created
    ON copilot_internal.llm_cost_records(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_cost_records_conversation
    ON copilot_internal.llm_cost_records(conversation_id)
    WHERE conversation_id IS NOT NULL;

-- E2B cost records indexes
CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_tenant_created
    ON copilot_internal.e2b_cost_records(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_e2b_cost_records_conversation
    ON copilot_internal.e2b_cost_records(conversation_id)
    WHERE conversation_id IS NOT NULL;

-- Cost quotas indexes
CREATE INDEX IF NOT EXISTS idx_cost_quotas_tenant_user
    ON copilot_internal.cost_quotas(tenant_id, user_id);

-- ========================================
-- Migration Complete
-- ========================================

-- This migration creates a unified metrics schema that:
-- 1. Separates read operations (analytics) from write operations (application logic)
-- 2. Provides consistent interface for all cost/metrics queries
-- 3. Enables granting read-only access to BI tools without exposing write capabilities
-- 4. Improves query performance with optimized views and indexes
-- 5. Supports multi-tenant data isolation (via RLS on underlying tables)
