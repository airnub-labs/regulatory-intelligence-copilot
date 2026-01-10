-- =====================================================
-- Move Internal/Admin Functions to copilot_internal Schema
-- Security Improvement: Remove admin tools from public API
-- =====================================================
--
-- PURPOSE:
-- Move internal, admin, and development functions from public schema
-- to copilot_internal schema to prevent exposure via PostgREST API.
--
-- SECURITY RATIONALE:
-- - analyze_query_performance: Can run arbitrary EXPLAIN ANALYZE (dev tool)
-- - get_query_performance_stats: Exposes system performance metrics
-- - get_rls_index_usage: Exposes internal index statistics
-- - get_user_tenant_count: Internal utility, not user-facing
-- - conversation_store_healthcheck: Internal monitoring only
-- - current_tenant_id: Deprecated legacy function
--
-- IMPACT:
-- - These functions will NO LONGER be callable via Supabase client RPC
-- - Only internal SQL code can call them
-- - External API users should use public.get_current_tenant_id instead
--

-- =====================================================
-- 1. Move Performance Monitoring Functions
-- =====================================================

-- Move analyze_query_performance (DANGEROUS - can run arbitrary queries)
ALTER FUNCTION public.analyze_query_performance(text)
  SET SCHEMA copilot_internal;

COMMENT ON FUNCTION copilot_internal.analyze_query_performance IS
  'INTERNAL: Development helper for EXPLAIN ANALYZE. Admin/dev use only. NOT exposed via API.';

-- Move get_query_performance_stats (exposes system metrics)
ALTER FUNCTION public.get_query_performance_stats(integer, numeric)
  SET SCHEMA copilot_internal;

COMMENT ON FUNCTION copilot_internal.get_query_performance_stats IS
  'INTERNAL: Returns query performance statistics. Admin monitoring only. NOT exposed via API.';

-- Move get_rls_index_usage (exposes internal indexes)
ALTER FUNCTION public.get_rls_index_usage()
  SET SCHEMA copilot_internal;

COMMENT ON FUNCTION copilot_internal.get_rls_index_usage IS
  'INTERNAL: Returns RLS index usage statistics. Admin monitoring only. NOT exposed via API.';

-- =====================================================
-- 2. Move Internal Utility Functions
-- =====================================================

-- Move get_user_tenant_count (internal utility)
ALTER FUNCTION public.get_user_tenant_count(uuid)
  SET SCHEMA copilot_internal;

COMMENT ON FUNCTION copilot_internal.get_user_tenant_count IS
  'INTERNAL: Returns tenant count for user. Used for RLS performance analysis. NOT exposed via API.';

-- Move conversation_store_healthcheck (internal monitoring)
ALTER FUNCTION public.conversation_store_healthcheck()
  SET SCHEMA copilot_internal;

COMMENT ON FUNCTION copilot_internal.conversation_store_healthcheck IS
  'INTERNAL: Health check for conversation store. Monitoring/alerting use only. NOT exposed via API.';

-- =====================================================
-- 3. Move Deprecated/Legacy Functions
-- =====================================================

-- Move current_tenant_id (legacy - use get_current_tenant_id instead)
ALTER FUNCTION public.current_tenant_id()
  SET SCHEMA copilot_internal;

COMMENT ON FUNCTION copilot_internal.current_tenant_id IS
  'INTERNAL: Legacy function. Use public.get_current_tenant_id() instead. NOT exposed via API.';

-- =====================================================
-- 4. Revoke Public Access
-- =====================================================

-- Revoke public execute permissions (extra safety)
REVOKE EXECUTE ON FUNCTION copilot_internal.analyze_query_performance FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION copilot_internal.get_query_performance_stats FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION copilot_internal.get_rls_index_usage FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION copilot_internal.get_user_tenant_count FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION copilot_internal.conversation_store_healthcheck FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION copilot_internal.current_tenant_id FROM PUBLIC;

-- Only service_role should be able to call these
GRANT EXECUTE ON FUNCTION copilot_internal.analyze_query_performance TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_query_performance_stats TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_rls_index_usage TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_user_tenant_count TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.conversation_store_healthcheck TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.current_tenant_id TO service_role;

-- =====================================================
-- 5. Verification
-- =====================================================

-- Verify functions moved successfully
DO $$
DECLARE
  v_public_count INTEGER;
  v_internal_count INTEGER;
BEGIN
  -- Count should be 0 in public
  SELECT COUNT(*) INTO v_public_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'analyze_query_performance',
      'get_query_performance_stats',
      'get_rls_index_usage',
      'get_user_tenant_count',
      'conversation_store_healthcheck',
      'current_tenant_id'
    );

  -- Count should be 6 in copilot_internal
  SELECT COUNT(*) INTO v_internal_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'copilot_internal'
    AND p.proname IN (
      'analyze_query_performance',
      'get_query_performance_stats',
      'get_rls_index_usage',
      'get_user_tenant_count',
      'conversation_store_healthcheck',
      'current_tenant_id'
    );

  IF v_public_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % functions still in public schema', v_public_count;
  END IF;

  IF v_internal_count != 6 THEN
    RAISE EXCEPTION 'Migration failed: Expected 6 functions in copilot_internal, found %', v_internal_count;
  END IF;

  RAISE NOTICE 'SUCCESS: All 6 internal functions moved to copilot_internal schema';
  RAISE NOTICE 'Functions no longer exposed via PostgREST API';
END;
$$;

-- =====================================================
-- Summary
-- =====================================================

COMMENT ON SCHEMA copilot_internal IS
  'Protected schema containing internal business logic, admin tools, and sensitive data. NOT exposed via PostgREST API. Tables: 25, Functions: 46+';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Internal Functions Migration Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Moved to copilot_internal schema:';
  RAISE NOTICE '  - analyze_query_performance (dev tool)';
  RAISE NOTICE '  - get_query_performance_stats (metrics)';
  RAISE NOTICE '  - get_rls_index_usage (index stats)';
  RAISE NOTICE '  - get_user_tenant_count (utility)';
  RAISE NOTICE '  - conversation_store_healthcheck (monitoring)';
  RAISE NOTICE '  - current_tenant_id (legacy)';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Impact:';
  RAISE NOTICE '  ✓ Functions NOT callable via Supabase client .rpc()';
  RAISE NOTICE '  ✓ Reduced API attack surface';
  RAISE NOTICE '  ✓ Admin tools protected';
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining in public schema: 15 user-facing functions';
  RAISE NOTICE '========================================';
END;
$$;
