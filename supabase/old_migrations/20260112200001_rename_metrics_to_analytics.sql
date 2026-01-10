-- Migration: Rename copilot_metrics schema to copilot_analytics
--
-- Rationale: The schema contains analytical views (cost summaries, usage analytics,
-- quota status, performance dashboards) - not just raw metrics. "Analytics" better
-- aligns with industry conventions (e.g., Stripe's schema organization) and accurately
-- reflects the domain's purpose.
--
-- Contents:
-- - 1 table: slow_query_log (performance data)
-- - 26 views: Cost analytics, usage summaries, quota status, performance summaries
--
-- Impact: Low - schema rename is atomic and doesn't affect data or relationships

BEGIN;

-- Rename the schema
ALTER SCHEMA copilot_metrics RENAME TO copilot_analytics;

-- Verification: Confirm schema was renamed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'copilot_analytics') THEN
    RAISE EXCEPTION 'Schema copilot_analytics does not exist after rename';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'copilot_metrics') THEN
    RAISE EXCEPTION 'Old schema copilot_metrics still exists after rename';
  END IF;

  RAISE NOTICE 'Schema successfully renamed from copilot_metrics to copilot_analytics';
END $$;

COMMIT;
