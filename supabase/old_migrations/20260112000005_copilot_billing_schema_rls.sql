-- ============================================================================
-- MIGRATION: copilot_billing Schema Part 2 (RLS & Triggers)
-- ============================================================================
-- =============================================================================
-- PART 4: Update Foreign Key References
-- =============================================================================
-- Update FKs in cost tables to reference copilot_core tables

-- Note: ALTER TABLE SET SCHEMA preserves FK constraints with their original
-- qualified names. PostgreSQL handles cross-schema FKs correctly.
-- However, we need to ensure the FK references are still valid.

-- 4.1: Update e2b_cost_records FK to reference copilot_core.execution_contexts
-- The FK already references execution_contexts which is now in copilot_core
-- PostgreSQL handles this automatically via OID-based references

-- =============================================================================
-- PART 5: Update Triggers
-- =============================================================================

-- 5.1: Move cost_quotas updated_at trigger function if exists
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'copilot_internal' AND p.proname = 'update_cost_quotas_timestamp'
  ) THEN
    ALTER FUNCTION copilot_internal.update_cost_quotas_timestamp() SET SCHEMA copilot_billing;
  END IF;
END $do$;

-- Create/replace the function in copilot_billing
CREATE OR REPLACE FUNCTION copilot_billing.update_cost_quotas_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$func$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS update_cost_quotas_timestamp ON copilot_billing.cost_quotas;
CREATE TRIGGER update_cost_quotas_timestamp
  BEFORE UPDATE ON copilot_billing.cost_quotas
  FOR EACH ROW
  EXECUTE FUNCTION copilot_billing.update_cost_quotas_timestamp();

-- 5.2: Move tenant quota init trigger function if exists
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'copilot_internal' AND p.proname = 'init_tenant_quotas'
  ) THEN
    ALTER FUNCTION copilot_internal.init_tenant_quotas() SET SCHEMA copilot_billing;
  END IF;
END $do$;

-- Create/replace the function in copilot_billing
CREATE OR REPLACE FUNCTION copilot_billing.init_tenant_quotas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  -- Create default LLM quota for new tenant
  INSERT INTO copilot_billing.cost_quotas (scope, scope_id, resource_type, limit_usd, period, period_start, period_end)
  VALUES ('tenant', NEW.id, 'llm', 100.00, 'month', date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')
  ON CONFLICT DO NOTHING;

  -- Create default E2B quota for new tenant
  INSERT INTO copilot_billing.cost_quotas (scope, scope_id, resource_type, limit_usd, period, period_start, period_end)
  VALUES ('tenant', NEW.id, 'e2b', 50.00, 'month', date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$func$;

-- Drop and recreate trigger on copilot_core.tenants
DROP TRIGGER IF EXISTS tenants_quota_init_trigger ON copilot_core.tenants;
CREATE TRIGGER tenants_quota_init_trigger
  AFTER INSERT ON copilot_core.tenants
  FOR EACH ROW
  EXECUTE FUNCTION copilot_billing.init_tenant_quotas();

-- =============================================================================
-- PART 6: Update RLS Policies
-- =============================================================================
-- RLS policies reference the old schema in USING clauses
-- We need to update them to reference copilot_core

-- 6.1: llm_cost_records RLS
DROP POLICY IF EXISTS llm_cost_records_tenant_select ON copilot_billing.llm_cost_records;
CREATE POLICY llm_cost_records_tenant_select
  ON copilot_billing.llm_cost_records
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS llm_cost_records_service_role_all ON copilot_billing.llm_cost_records;
CREATE POLICY llm_cost_records_service_role_all
  ON copilot_billing.llm_cost_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.2: e2b_cost_records RLS
DROP POLICY IF EXISTS e2b_cost_records_tenant_select ON copilot_billing.e2b_cost_records;
CREATE POLICY e2b_cost_records_tenant_select
  ON copilot_billing.e2b_cost_records
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS e2b_cost_records_service_role_all ON copilot_billing.e2b_cost_records;
CREATE POLICY e2b_cost_records_service_role_all
  ON copilot_billing.e2b_cost_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.3: cost_quotas RLS
DROP POLICY IF EXISTS cost_quotas_tenant_select ON copilot_billing.cost_quotas;
CREATE POLICY cost_quotas_tenant_select
  ON copilot_billing.cost_quotas
  FOR SELECT
  TO authenticated
  USING (
    scope = 'platform'
    OR (scope = 'tenant' AND scope_id = public.current_tenant_id())
    OR (scope = 'user' AND scope_id = auth.uid())
  );

DROP POLICY IF EXISTS cost_quotas_service_role_all ON copilot_billing.cost_quotas;
CREATE POLICY cost_quotas_service_role_all
  ON copilot_billing.cost_quotas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.4: model_pricing RLS (read-only for authenticated)
DROP POLICY IF EXISTS model_pricing_authenticated_read ON copilot_billing.model_pricing;
CREATE POLICY model_pricing_authenticated_read
  ON copilot_billing.model_pricing
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS model_pricing_service_role_all ON copilot_billing.model_pricing;
CREATE POLICY model_pricing_service_role_all
  ON copilot_billing.model_pricing
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.5: e2b_pricing RLS (read-only for authenticated)
DROP POLICY IF EXISTS e2b_pricing_authenticated_read ON copilot_billing.e2b_pricing;
CREATE POLICY e2b_pricing_authenticated_read
  ON copilot_billing.e2b_pricing
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS e2b_pricing_service_role_all ON copilot_billing.e2b_pricing;
CREATE POLICY e2b_pricing_service_role_all
  ON copilot_billing.e2b_pricing
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.6: llm_cost_estimates RLS (global reference data - not tenant-scoped)
-- Note: This table has no tenant_id - it's global config like model_pricing
-- RLS already enabled in original migration with read access for authenticated
DROP POLICY IF EXISTS llm_cost_estimates_tenant_select ON copilot_billing.llm_cost_estimates;
DROP POLICY IF EXISTS llm_cost_estimates_authenticated_read ON copilot_billing.llm_cost_estimates;
DROP POLICY IF EXISTS llm_cost_estimates_service_role_all ON copilot_billing.llm_cost_estimates;

CREATE POLICY llm_cost_estimates_authenticated_read
  ON copilot_billing.llm_cost_estimates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY llm_cost_estimates_service_role_all
  ON copilot_billing.llm_cost_estimates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.7: e2b_cost_estimates RLS (global reference data - not tenant-scoped)
-- Note: This table has no tenant_id - it's global config like e2b_pricing
-- RLS already enabled in original migration with read access for authenticated
DROP POLICY IF EXISTS e2b_cost_estimates_tenant_select ON copilot_billing.e2b_cost_estimates;
DROP POLICY IF EXISTS e2b_cost_estimates_authenticated_read ON copilot_billing.e2b_cost_estimates;
DROP POLICY IF EXISTS e2b_cost_estimates_service_role_all ON copilot_billing.e2b_cost_estimates;

CREATE POLICY e2b_cost_estimates_authenticated_read
  ON copilot_billing.e2b_cost_estimates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY e2b_cost_estimates_service_role_all
  ON copilot_billing.e2b_cost_estimates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- PART 7: Grant Permissions
-- =============================================================================

-- Service role gets full access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA copilot_billing TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA copilot_billing TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA copilot_billing TO service_role;

-- Authenticated users get SELECT (with RLS) on cost records and pricing
GRANT SELECT ON copilot_billing.llm_cost_records TO authenticated;
GRANT SELECT ON copilot_billing.e2b_cost_records TO authenticated;
GRANT SELECT ON copilot_billing.cost_quotas TO authenticated;
GRANT SELECT ON copilot_billing.model_pricing TO authenticated;
GRANT SELECT ON copilot_billing.e2b_pricing TO authenticated;
GRANT SELECT ON copilot_billing.llm_cost_estimates TO authenticated;
GRANT SELECT ON copilot_billing.e2b_cost_estimates TO authenticated;

-- Grant execute on pricing functions to authenticated
GRANT EXECUTE ON FUNCTION copilot_billing.get_current_model_pricing(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION copilot_billing.calculate_llm_cost(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION copilot_billing.calculate_e2b_cost(text, text, numeric, numeric, numeric, numeric, timestamptz) TO authenticated;

-- =============================================================================
-- PART 8: Verification
-- =============================================================================

DO $do$
DECLARE
  table_count integer;
  function_count integer;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'copilot_billing';

  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'copilot_billing';

  IF table_count < 7 THEN
    RAISE WARNING 'Expected at least 7 tables in copilot_billing, found %', table_count;
  END IF;

  RAISE NOTICE '=== copilot_billing Schema Migration completed successfully ===';
  RAISE NOTICE '  Schema created: copilot_billing';
  RAISE NOTICE '  Tables: %', table_count;
  RAISE NOTICE '    - llm_cost_records (LLM API call costs)';
  RAISE NOTICE '    - e2b_cost_records (sandbox execution costs)';
  RAISE NOTICE '    - llm_cost_estimates (pre-call estimates)';
  RAISE NOTICE '    - e2b_cost_estimates (pre-call estimates)';
  RAISE NOTICE '    - cost_quotas (spending limits)';
  RAISE NOTICE '    - model_pricing (LLM pricing config)';
  RAISE NOTICE '    - e2b_pricing (sandbox pricing config)';
  RAISE NOTICE '  Functions: %', function_count;
  RAISE NOTICE '  RLS policies updated for tenant-scoped access';
  RAISE NOTICE '  Tenant quota init trigger recreated';
END $do$;
