-- Fix cost tracking table permissions for service role
--
-- The cost tracking tables need proper service_role grants since the cost
-- tracking service runs with service role credentials on the backend.

-- Grant full access to llm_cost_records for service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.llm_cost_records TO service_role;

-- Grant full access to cost_quotas for service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.cost_quotas TO service_role;

-- Grant access to cost summary views for service_role
GRANT SELECT ON copilot_internal.cost_summary_by_task TO service_role;
GRANT SELECT ON copilot_internal.cost_summary_by_tenant TO service_role;
GRANT SELECT ON copilot_internal.cost_summary_by_model TO service_role;

-- Grant access to e2b cost tracking for service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.e2b_cost_records TO service_role;
