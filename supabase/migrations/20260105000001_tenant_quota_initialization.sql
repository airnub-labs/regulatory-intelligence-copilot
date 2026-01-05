-- Migration: Automatic Tenant Quota Initialization
-- Description: Auto-creates default quotas when new tenants are created
-- Author: Claude Code
-- Date: 2026-01-05

-- Function to initialize default quotas for new tenants
CREATE OR REPLACE FUNCTION copilot_internal.initialize_tenant_quotas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create default LLM quota: $100/month
  INSERT INTO copilot_internal.cost_quotas (
    scope,
    scope_id,
    resource_type,
    limit_usd,
    period,
    current_spend_usd,
    period_start,
    period_end,
    warning_threshold
  )
  VALUES (
    'tenant',
    NEW.id,
    'llm',
    100.00,
    'month',
    0.00,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    0.80  -- 80% warning threshold
  );

  -- Create default E2B quota: $50/month
  INSERT INTO copilot_internal.cost_quotas (
    scope,
    scope_id,
    resource_type,
    limit_usd,
    period,
    current_spend_usd,
    period_start,
    period_end,
    warning_threshold
  )
  VALUES (
    'tenant',
    NEW.id,
    'e2b',
    50.00,
    'month',
    0.00,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    0.80  -- 80% warning threshold
  );

  -- Create combined quota for total spend: $150/month
  INSERT INTO copilot_internal.cost_quotas (
    scope,
    scope_id,
    resource_type,
    limit_usd,
    period,
    current_spend_usd,
    period_start,
    period_end,
    warning_threshold
  )
  VALUES (
    'tenant',
    NEW.id,
    'all',
    150.00,
    'month',
    0.00,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    0.80  -- 80% warning threshold
  );

  RETURN NEW;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION copilot_internal.initialize_tenant_quotas() IS
  'Automatically creates default cost quotas when a new tenant is created. Sets $100/month for LLM, $50/month for E2B, and $150/month total spend limit.';

-- Create trigger on tenants table (if it exists)
-- Note: Adjust table name and schema if different in your setup
DO $$
BEGIN
  -- Check if tenants table exists before creating trigger
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'tenants'
  ) THEN
    -- Drop trigger if it already exists
    DROP TRIGGER IF EXISTS tenants_quota_init_trigger ON public.tenants;

    -- Create trigger to initialize quotas after tenant insert
    CREATE TRIGGER tenants_quota_init_trigger
      AFTER INSERT ON public.tenants
      FOR EACH ROW
      EXECUTE FUNCTION copilot_internal.initialize_tenant_quotas();

    RAISE NOTICE 'Created quota initialization trigger on public.tenants';
  ELSE
    RAISE NOTICE 'Tenants table not found. Trigger will need to be created manually.';
  END IF;
END;
$$;

-- Alternative: If using a different schema or table name, create the trigger manually:
-- DROP TRIGGER IF EXISTS your_tenants_quota_init_trigger ON your_schema.your_tenants_table;
-- CREATE TRIGGER your_tenants_quota_init_trigger
--   AFTER INSERT ON your_schema.your_tenants_table
--   FOR EACH ROW
--   EXECUTE FUNCTION copilot_internal.initialize_tenant_quotas();

-- Create a manual initialization function for existing tenants
CREATE OR REPLACE FUNCTION copilot_internal.initialize_existing_tenant_quotas(p_tenant_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if quotas already exist
  IF EXISTS (
    SELECT 1
    FROM copilot_internal.cost_quotas
    WHERE scope = 'tenant'
    AND scope_id = p_tenant_id
  ) THEN
    RAISE NOTICE 'Tenant % already has quotas configured', p_tenant_id;
    RETURN;
  END IF;

  -- Create default LLM quota
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period, current_spend_usd,
    period_start, period_end, warning_threshold
  )
  VALUES (
    'tenant', p_tenant_id, 'llm', 100.00, 'month', 0.00,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    0.80
  );

  -- Create default E2B quota
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period, current_spend_usd,
    period_start, period_end, warning_threshold
  )
  VALUES (
    'tenant', p_tenant_id, 'e2b', 50.00, 'month', 0.00,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    0.80
  );

  -- Create combined quota
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period, current_spend_usd,
    period_start, period_end, warning_threshold
  )
  VALUES (
    'tenant', p_tenant_id, 'all', 150.00, 'month', 0.00,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    0.80
  );

  RAISE NOTICE 'Initialized quotas for tenant %', p_tenant_id;
END;
$$;

-- Add comment
COMMENT ON FUNCTION copilot_internal.initialize_existing_tenant_quotas(TEXT) IS
  'Manually initializes default quotas for an existing tenant. Usage: SELECT copilot_internal.initialize_existing_tenant_quotas(''tenant-id'');';

-- Example usage for existing tenants:
-- SELECT copilot_internal.initialize_existing_tenant_quotas('your-tenant-id');

-- Verification query to check if quotas were created:
-- SELECT * FROM copilot_internal.cost_quotas WHERE scope = 'tenant' ORDER BY created_at DESC;
