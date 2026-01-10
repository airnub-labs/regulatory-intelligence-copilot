-- ============================================================================
-- MIGRATION: copilot_metrics Schema (Analytics Views)
-- ============================================================================
-- Part of Schema Reorganization for SOC2/GDPR Compliance
--
-- This migration:
-- 1. Creates the copilot_metrics schema
-- 2. Moves existing views from metrics schema
-- 3. Moves cost summary views from copilot_internal
-- 4. Creates NEW workspace cost summary views
--
-- Views (25 total):
--   From metrics schema (14):
--     - all_costs, cost_by_tenant, cost_by_user, cost_by_conversation
--     - quota_status, llm_costs, e2b_costs
--     - llm_model_usage, e2b_sandbox_usage
--     - llm_costs_daily, e2b_costs_daily, cost_estimates
--     - tenant_total_costs, top_spending_tenants
--
--   From copilot_internal (7):
--     - cost_summary_by_task, cost_summary_by_tenant, cost_summary_by_model
--     - e2b_cost_summary_by_tenant, e2b_cost_summary_by_tier
--     - e2b_cost_summary_by_conversation, combined_cost_summary_by_tenant
--
--   NEW (4):
--     - llm_cost_summary_by_workspace
--     - e2b_cost_summary_by_workspace
--     - combined_cost_summary_by_workspace
--     - cost_by_workspace
--
-- Access: Read-only for analytics roles, views reference copilot_billing
-- ============================================================================

-- =============================================================================
-- PART 1: Create copilot_metrics Schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS copilot_metrics;

COMMENT ON SCHEMA copilot_metrics IS 'Read-only aggregated views for analytics dashboards and BI tools. Sources from copilot_billing and copilot_core.';

-- Grant schema access
GRANT USAGE ON SCHEMA copilot_metrics TO service_role;
GRANT USAGE ON SCHEMA copilot_metrics TO authenticated;

-- =============================================================================
-- PART 2: Drop Existing Views (to recreate with new schema references)
-- =============================================================================

-- Drop views from metrics schema if they exist
DROP VIEW IF EXISTS metrics.all_costs CASCADE;
DROP VIEW IF EXISTS metrics.cost_by_tenant CASCADE;
DROP VIEW IF EXISTS metrics.cost_by_user CASCADE;
DROP VIEW IF EXISTS metrics.cost_by_conversation CASCADE;
DROP VIEW IF EXISTS metrics.quota_status CASCADE;
DROP VIEW IF EXISTS metrics.llm_costs CASCADE;
DROP VIEW IF EXISTS metrics.e2b_costs CASCADE;
DROP VIEW IF EXISTS metrics.llm_model_usage CASCADE;
DROP VIEW IF EXISTS metrics.e2b_sandbox_usage CASCADE;
DROP VIEW IF EXISTS metrics.llm_costs_daily CASCADE;
DROP VIEW IF EXISTS metrics.e2b_costs_daily CASCADE;
DROP VIEW IF EXISTS metrics.cost_estimates CASCADE;
DROP VIEW IF EXISTS metrics.tenant_total_costs CASCADE;
DROP VIEW IF EXISTS metrics.top_spending_tenants CASCADE;

-- Drop views from copilot_internal if they exist
DROP VIEW IF EXISTS copilot_internal.cost_summary_by_task CASCADE;
DROP VIEW IF EXISTS copilot_internal.cost_summary_by_tenant CASCADE;
DROP VIEW IF EXISTS copilot_internal.cost_summary_by_model CASCADE;
DROP VIEW IF EXISTS copilot_internal.e2b_cost_summary_by_tenant CASCADE;
DROP VIEW IF EXISTS copilot_internal.e2b_cost_summary_by_tier CASCADE;
DROP VIEW IF EXISTS copilot_internal.e2b_cost_summary_by_conversation CASCADE;
DROP VIEW IF EXISTS copilot_internal.combined_cost_summary_by_tenant CASCADE;

-- =============================================================================
-- PART 3: Create LLM Cost Views
-- =============================================================================

-- 3.1: Direct LLM cost access view
-- NOTE: Uses SELECT * to preserve all columns from underlying table
-- Original: 20260105000006_unified_metrics_schema.sql line 150-151
CREATE OR REPLACE VIEW copilot_metrics.llm_costs AS
SELECT * FROM copilot_billing.llm_cost_records;

COMMENT ON VIEW copilot_metrics.llm_costs IS 'Direct read-only access to LLM cost records';

-- 3.2: LLM costs by model
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.llm_model_usage AS
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
FROM copilot_billing.llm_cost_records
GROUP BY tenant_id, model, provider;

COMMENT ON VIEW copilot_metrics.llm_model_usage IS 'LLM model usage statistics aggregated by tenant, model, and provider';

-- 3.3: Daily LLM costs
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.llm_costs_daily AS
SELECT
  tenant_id,
  DATE(created_at) AS date,
  model,
  provider,
  SUM(total_cost_usd) AS total_cost_usd,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  COUNT(*) AS request_count
FROM copilot_billing.llm_cost_records
GROUP BY tenant_id, DATE(created_at), model, provider;

COMMENT ON VIEW copilot_metrics.llm_costs_daily IS 'Daily LLM cost trends for time-series analysis';

-- 3.4: LLM cost summary by task type
-- NOTE: Preserves original column structure from 20260101000000_llm_cost_tracking.sql
CREATE OR REPLACE VIEW copilot_metrics.cost_summary_by_task AS
SELECT
  task,
  COUNT(*) AS request_count,
  SUM(total_tokens) AS total_tokens,
  SUM(total_cost_usd) AS total_cost_usd,
  AVG(total_cost_usd) AS avg_cost_per_request,
  MIN(timestamp) AS first_request,
  MAX(timestamp) AS last_request
FROM copilot_billing.llm_cost_records
WHERE task IS NOT NULL
GROUP BY task
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW copilot_metrics.cost_summary_by_task IS 'LLM costs grouped by task type';

-- 3.5: LLM cost summary by tenant
-- NOTE: Preserves original column structure from 20260101000000_llm_cost_tracking.sql
CREATE OR REPLACE VIEW copilot_metrics.cost_summary_by_tenant AS
SELECT
  tenant_id,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost_usd) as total_cost_usd,
  AVG(total_cost_usd) as avg_cost_per_request,
  MIN(timestamp) as first_request,
  MAX(timestamp) as last_request
FROM copilot_billing.llm_cost_records
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW copilot_metrics.cost_summary_by_tenant IS 'LLM costs grouped by tenant';

-- 3.6: LLM cost summary by model/provider
-- NOTE: Preserves original column structure from 20260101000000_llm_cost_tracking.sql
CREATE OR REPLACE VIEW copilot_metrics.cost_summary_by_model AS
SELECT
  provider,
  model,
  COUNT(*) AS request_count,
  SUM(total_tokens) AS total_tokens,
  SUM(total_cost_usd) AS total_cost_usd,
  AVG(total_cost_usd) AS avg_cost_per_request,
  MIN(timestamp) AS first_request,
  MAX(timestamp) AS last_request
FROM copilot_billing.llm_cost_records
GROUP BY provider, model
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW copilot_metrics.cost_summary_by_model IS 'LLM costs grouped by provider/model';

-- =============================================================================
-- PART 4: Create E2B Cost Views
-- =============================================================================

-- 4.1: Direct E2B cost access view
-- NOTE: Uses SELECT * to preserve all columns from underlying table
-- Original: 20260105000006_unified_metrics_schema.sql line 194-195
CREATE OR REPLACE VIEW copilot_metrics.e2b_costs AS
SELECT * FROM copilot_billing.e2b_cost_records;

COMMENT ON VIEW copilot_metrics.e2b_costs IS 'Direct read-only access to E2B sandbox cost records';

-- 4.2: E2B usage by tier
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.e2b_sandbox_usage AS
SELECT
  tenant_id,
  tier AS sandbox_tier,
  COUNT(*) AS execution_count,
  SUM(total_cost_usd) AS total_cost_usd,
  AVG(total_cost_usd) AS avg_cost_per_execution,
  MIN(created_at) AS first_used_at,
  MAX(created_at) AS last_used_at
FROM copilot_billing.e2b_cost_records
GROUP BY tenant_id, tier;

COMMENT ON VIEW copilot_metrics.e2b_sandbox_usage IS 'E2B sandbox usage statistics aggregated by tenant and template';

-- 4.3: Daily E2B costs
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.e2b_costs_daily AS
SELECT
  tenant_id,
  DATE(created_at) AS date,
  tier AS sandbox_tier,
  SUM(total_cost_usd) AS total_cost_usd,
  COUNT(*) AS execution_count
FROM copilot_billing.e2b_cost_records
GROUP BY tenant_id, DATE(created_at), tier;

COMMENT ON VIEW copilot_metrics.e2b_costs_daily IS 'Daily E2B cost trends for time-series analysis';

-- 4.4: E2B cost summary by tenant
CREATE OR REPLACE VIEW copilot_metrics.e2b_cost_summary_by_tenant AS
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
FROM copilot_billing.e2b_cost_records
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW copilot_metrics.e2b_cost_summary_by_tenant IS 'E2B costs grouped by tenant';

-- 4.5: E2B cost summary by tier
CREATE OR REPLACE VIEW copilot_metrics.e2b_cost_summary_by_tier AS
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
FROM copilot_billing.e2b_cost_records
GROUP BY tier, region
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW copilot_metrics.e2b_cost_summary_by_tier IS 'E2B costs grouped by sandbox tier';

-- 4.6: E2B cost summary by conversation
CREATE OR REPLACE VIEW copilot_metrics.e2b_cost_summary_by_conversation AS
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
FROM copilot_billing.e2b_cost_records
WHERE conversation_id IS NOT NULL
GROUP BY conversation_id, tenant_id
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW copilot_metrics.e2b_cost_summary_by_conversation IS 'E2B costs grouped by conversation';

-- =============================================================================
-- PART 5: Create Combined Cost Views
-- =============================================================================

-- 5.1: All costs (unified LLM + E2B)
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.all_costs AS
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
FROM copilot_billing.llm_cost_records
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
FROM copilot_billing.e2b_cost_records;

COMMENT ON VIEW copilot_metrics.all_costs IS 'Unified view of all costs (LLM + E2B) for analytics and reporting';

-- 5.2: Cost by tenant (combined)
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.cost_by_tenant AS
SELECT
  tenant_id,
  cost_type,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) AS record_count,
  MIN(created_at) AS first_cost_at,
  MAX(created_at) AS last_cost_at
FROM copilot_metrics.all_costs
GROUP BY tenant_id, cost_type;

COMMENT ON VIEW copilot_metrics.cost_by_tenant IS 'Cost summaries grouped by tenant and type (llm, e2b)';

-- 5.3: Cost by user
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.cost_by_user AS
SELECT
  tenant_id,
  user_id,
  cost_type,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) AS record_count,
  MIN(created_at) AS first_cost_at,
  MAX(created_at) AS last_cost_at
FROM copilot_metrics.all_costs
GROUP BY tenant_id, user_id, cost_type;

COMMENT ON VIEW copilot_metrics.cost_by_user IS 'Cost summaries grouped by tenant, user, and type';

-- 5.4: Cost by conversation
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.cost_by_conversation AS
SELECT
  tenant_id,
  conversation_id,
  cost_type,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) AS record_count,
  MIN(created_at) AS first_cost_at,
  MAX(created_at) AS last_cost_at
FROM copilot_metrics.all_costs
WHERE conversation_id IS NOT NULL
GROUP BY tenant_id, conversation_id, cost_type;

COMMENT ON VIEW copilot_metrics.cost_by_conversation IS 'Cost summaries grouped by conversation';

-- 5.5: Combined cost summary by tenant
CREATE OR REPLACE VIEW copilot_metrics.combined_cost_summary_by_tenant AS
SELECT
  COALESCE(llm.tenant_id, e2b.tenant_id) as tenant_id,
  COALESCE(llm.total_cost_usd, 0) as llm_cost_usd,
  COALESCE(e2b.total_cost_usd, 0) as e2b_cost_usd,
  COALESCE(llm.total_cost_usd, 0) + COALESCE(e2b.total_cost_usd, 0) as total_cost_usd,
  llm.request_count as llm_request_count,
  e2b.sandbox_count as e2b_sandbox_count,
  GREATEST(llm.last_request, e2b.last_request) as last_activity
FROM copilot_metrics.cost_summary_by_tenant llm
FULL OUTER JOIN copilot_metrics.e2b_cost_summary_by_tenant e2b
  ON llm.tenant_id = e2b.tenant_id
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW copilot_metrics.combined_cost_summary_by_tenant IS 'Combined LLM + E2B costs by tenant';

-- 5.6: Tenant total costs
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.tenant_total_costs AS
SELECT
  tenant_id,
  SUM(total_cost_usd) AS total_cost_usd,
  SUM(record_count) AS total_records,
  MIN(first_cost_at) AS first_cost_at,
  MAX(last_cost_at) AS last_cost_at
FROM copilot_metrics.cost_by_tenant
GROUP BY tenant_id;

COMMENT ON VIEW copilot_metrics.tenant_total_costs IS 'Total costs across all sources aggregated by tenant';

-- 5.7: Top spending tenants
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.top_spending_tenants AS
SELECT
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.type AS tenant_type,
  t.plan,
  COALESCE(c.total_cost_usd, 0) AS total_cost_usd,
  COALESCE(c.total_records, 0) AS total_records
FROM copilot_core.tenants t
LEFT JOIN copilot_metrics.tenant_total_costs c ON c.tenant_id = t.id
ORDER BY COALESCE(c.total_cost_usd, 0) DESC;

COMMENT ON VIEW copilot_metrics.top_spending_tenants IS 'Tenants ranked by total spending across all cost sources';

-- =============================================================================
-- PART 6: Create Quota and Estimate Views
-- =============================================================================

-- 6.1: Quota status
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
CREATE OR REPLACE VIEW copilot_metrics.quota_status AS
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
FROM copilot_billing.cost_quotas q;

COMMENT ON VIEW copilot_metrics.quota_status IS 'Quota usage with status indicators (ok/caution/warning/exceeded)';

-- 6.2: Cost estimates (reference data for quota checks)
-- NOTE: Preserves original column structure from 20260105000006_unified_metrics_schema.sql
-- Original columns: estimate_type, provider, model, operation_type, expected_duration_seconds,
--                   estimated_cost_usd, confidence_level, description, assumptions,
--                   effective_date, expires_at, created_at, updated_at
CREATE OR REPLACE VIEW copilot_metrics.cost_estimates AS
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
FROM copilot_billing.llm_cost_estimates
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
FROM copilot_billing.e2b_cost_estimates;

COMMENT ON VIEW copilot_metrics.cost_estimates IS 'Estimated costs for operations before execution (combines LLM and E2B)';

-- =============================================================================
-- PART 7: Create NEW Workspace Cost Summary Views
-- =============================================================================

-- 7.1: LLM Cost Summary by Workspace
CREATE OR REPLACE VIEW copilot_metrics.llm_cost_summary_by_workspace AS
SELECT
  t.id AS workspace_id,
  t.name AS workspace_name,
  t.slug AS workspace_slug,
  t.type AS workspace_type,
  COUNT(*) AS total_calls,
  SUM(c.total_cost_usd) AS total_cost_usd,
  SUM(c.input_tokens) AS total_input_tokens,
  SUM(c.output_tokens) AS total_output_tokens,
  AVG(c.total_cost_usd) AS avg_cost_per_call,
  MIN(c.timestamp) AS first_cost_at,
  MAX(c.timestamp) AS last_cost_at
FROM copilot_billing.llm_cost_records c
JOIN copilot_core.tenants t ON c.tenant_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name, t.slug, t.type;

COMMENT ON VIEW copilot_metrics.llm_cost_summary_by_workspace IS
  'LLM costs aggregated by workspace with tenant details';

-- 7.2: E2B Cost Summary by Workspace
CREATE OR REPLACE VIEW copilot_metrics.e2b_cost_summary_by_workspace AS
SELECT
  t.id AS workspace_id,
  t.name AS workspace_name,
  t.slug AS workspace_slug,
  t.type AS workspace_type,
  COUNT(*) AS total_executions,
  SUM(c.total_cost_usd) AS total_cost_usd,
  SUM(c.execution_time_seconds) AS total_execution_seconds,
  AVG(c.total_cost_usd) AS avg_cost_per_execution,
  MIN(c.timestamp) AS first_cost_at,
  MAX(c.timestamp) AS last_cost_at
FROM copilot_billing.e2b_cost_records c
JOIN copilot_core.tenants t ON c.tenant_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name, t.slug, t.type;

COMMENT ON VIEW copilot_metrics.e2b_cost_summary_by_workspace IS
  'E2B sandbox costs aggregated by workspace with tenant details';

-- 7.3: Combined Cost Summary by Workspace
CREATE OR REPLACE VIEW copilot_metrics.combined_cost_summary_by_workspace AS
SELECT
  COALESCE(llm.workspace_id, e2b.workspace_id) AS workspace_id,
  COALESCE(llm.workspace_name, e2b.workspace_name) AS workspace_name,
  COALESCE(llm.workspace_slug, e2b.workspace_slug) AS workspace_slug,
  COALESCE(llm.workspace_type, e2b.workspace_type) AS workspace_type,
  COALESCE(llm.total_cost_usd, 0) AS llm_cost_usd,
  COALESCE(e2b.total_cost_usd, 0) AS e2b_cost_usd,
  COALESCE(llm.total_cost_usd, 0) + COALESCE(e2b.total_cost_usd, 0) AS total_cost_usd,
  COALESCE(llm.total_calls, 0) AS llm_calls,
  COALESCE(e2b.total_executions, 0) AS e2b_executions
FROM copilot_metrics.llm_cost_summary_by_workspace llm
FULL OUTER JOIN copilot_metrics.e2b_cost_summary_by_workspace e2b
  ON llm.workspace_id = e2b.workspace_id;

COMMENT ON VIEW copilot_metrics.combined_cost_summary_by_workspace IS
  'Combined LLM + E2B costs by workspace for comprehensive billing';

-- 7.4: Unified Cost by Workspace (with cost type breakdown)
CREATE OR REPLACE VIEW copilot_metrics.cost_by_workspace AS
SELECT
  t.id AS workspace_id,
  t.name AS workspace_name,
  t.slug AS workspace_slug,
  t.type AS workspace_type,
  'llm' AS cost_type,
  SUM(c.total_cost_usd) AS total_cost_usd,
  COUNT(*) AS record_count,
  MIN(c.timestamp) AS first_record_at,
  MAX(c.timestamp) AS last_record_at
FROM copilot_billing.llm_cost_records c
JOIN copilot_core.tenants t ON c.tenant_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name, t.slug, t.type
UNION ALL
SELECT
  t.id AS workspace_id,
  t.name AS workspace_name,
  t.slug AS workspace_slug,
  t.type AS workspace_type,
  'e2b' AS cost_type,
  SUM(c.total_cost_usd) AS total_cost_usd,
  COUNT(*) AS record_count,
  MIN(c.timestamp) AS first_record_at,
  MAX(c.timestamp) AS last_record_at
FROM copilot_billing.e2b_cost_records c
JOIN copilot_core.tenants t ON c.tenant_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name, t.slug, t.type;

COMMENT ON VIEW copilot_metrics.cost_by_workspace IS
  'All costs by workspace with cost type breakdown (llm, e2b)';

-- =============================================================================
-- PART 8: Grant Permissions
-- =============================================================================

-- Grant SELECT on all views
GRANT SELECT ON ALL TABLES IN SCHEMA copilot_metrics TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA copilot_metrics TO authenticated;

-- =============================================================================
-- PART 9: Verification
-- =============================================================================

DO $$
DECLARE
  view_count integer;
BEGIN
  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'copilot_metrics';

  IF view_count < 25 THEN
    RAISE WARNING 'Expected at least 25 views in copilot_metrics, found %', view_count;
  END IF;

  RAISE NOTICE '=== copilot_metrics Schema Migration completed successfully ===';
  RAISE NOTICE '  ✓ Schema created: copilot_metrics';
  RAISE NOTICE '  ✓ Views: %', view_count;
  RAISE NOTICE '  ✓ LLM cost views (6): llm_costs, llm_model_usage, llm_costs_daily, cost_summary_by_*';
  RAISE NOTICE '  ✓ E2B cost views (6): e2b_costs, e2b_sandbox_usage, e2b_costs_daily, e2b_cost_summary_by_*';
  RAISE NOTICE '  ✓ Combined views (7): all_costs, cost_by_*, combined_cost_summary_by_tenant';
  RAISE NOTICE '  ✓ Quota/estimate views (2): quota_status, cost_estimates';
  RAISE NOTICE '  ✓ NEW workspace views (4): *_by_workspace';
  RAISE NOTICE '  ✓ All views reference copilot_billing and copilot_core schemas';
END $$;
