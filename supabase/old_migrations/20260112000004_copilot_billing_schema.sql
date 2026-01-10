-- ============================================================================
-- MIGRATION: copilot_billing Schema (Cost Tracking & Quotas)
-- ============================================================================
-- Part of Schema Reorganization for SOC2/GDPR Compliance
--
-- This migration:
-- 1. Creates the copilot_billing schema
-- 2. Moves 7 billing/cost tables from copilot_internal
-- 3. Recreates functions with updated schema references
-- 4. Maintains RLS for tenant-scoped access
--
-- Tables:
--   - llm_cost_records (LLM API call costs)
--   - e2b_cost_records (sandbox execution costs)
--   - llm_cost_estimates (pre-call estimates)
--   - e2b_cost_estimates (pre-call estimates)
--   - cost_quotas (spending limits)
--   - model_pricing (LLM pricing config)
--   - e2b_pricing (sandbox pricing config)
--
-- Access: RLS enforced (tenant-scoped reads), service_role for writes
-- ============================================================================

DO $migration$
BEGIN
  -- =============================================================================
  -- PART 1: Create copilot_billing Schema
  -- =============================================================================

  CREATE SCHEMA IF NOT EXISTS copilot_billing;

  COMMENT ON SCHEMA copilot_billing IS 'Transactional cost records, pricing configuration, and spending limits. RLS enforced for tenant-scoped access.';

  -- Grant schema access
  GRANT USAGE ON SCHEMA copilot_billing TO service_role;
  GRANT USAGE ON SCHEMA copilot_billing TO authenticated;

  -- =============================================================================
  -- PART 2: Move Tables to copilot_billing
  -- =============================================================================
  -- Order: Config tables first, then transactional tables

  ALTER TABLE copilot_internal.model_pricing SET SCHEMA copilot_billing;
  ALTER TABLE copilot_internal.e2b_pricing SET SCHEMA copilot_billing;
  ALTER TABLE copilot_internal.cost_quotas SET SCHEMA copilot_billing;
  ALTER TABLE copilot_internal.llm_cost_records SET SCHEMA copilot_billing;
  ALTER TABLE copilot_internal.e2b_cost_records SET SCHEMA copilot_billing;
  ALTER TABLE copilot_internal.llm_cost_estimates SET SCHEMA copilot_billing;
  ALTER TABLE copilot_internal.e2b_cost_estimates SET SCHEMA copilot_billing;

  -- =============================================================================
  -- PART 3: Drop Old Functions
  -- =============================================================================
  -- Note: ALTER FUNCTION SET SCHEMA doesn't update function bodies.
  -- Must drop trigger first since it depends on the function.

  DROP TRIGGER IF EXISTS update_cost_quotas_timestamp ON copilot_billing.cost_quotas;

  DROP FUNCTION IF EXISTS copilot_internal.get_current_model_pricing(text, text);
  DROP FUNCTION IF EXISTS copilot_internal.calculate_llm_cost(text, text, integer, integer);
  DROP FUNCTION IF EXISTS copilot_internal.calculate_e2b_cost(text, text, numeric, numeric, numeric, numeric, timestamptz);
  DROP FUNCTION IF EXISTS copilot_internal.increment_quota_spend(text, uuid, numeric);
  DROP FUNCTION IF EXISTS copilot_internal.increment_e2b_quota_spend(text, uuid, numeric);
  DROP FUNCTION IF EXISTS copilot_internal.check_e2b_quota(text, uuid, numeric);
  DROP FUNCTION IF EXISTS copilot_internal.check_and_record_quota_atomic(text, uuid, numeric);
  DROP FUNCTION IF EXISTS copilot_internal.update_cost_quota_timestamp();

  RAISE NOTICE '=== copilot_billing: Tables moved, old functions dropped ===';
END $migration$;

-- =============================================================================
-- PART 4: Recreate Functions with Updated Schema References
-- =============================================================================

CREATE OR REPLACE FUNCTION copilot_billing.update_cost_quota_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION copilot_billing.increment_quota_spend(
    p_scope text,
    p_scope_id uuid,
    p_amount numeric
) RETURNS void AS $$
BEGIN
    UPDATE copilot_billing.cost_quotas
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

GRANT EXECUTE ON FUNCTION copilot_billing.increment_quota_spend TO service_role;
COMMENT ON FUNCTION copilot_billing.increment_quota_spend IS 'Atomically increment quota spend for concurrent-safe updates';

CREATE OR REPLACE FUNCTION copilot_billing.increment_e2b_quota_spend(
    p_scope text,
    p_scope_id uuid,
    p_amount numeric
) RETURNS void AS $$
BEGIN
    UPDATE copilot_billing.cost_quotas
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

GRANT EXECUTE ON FUNCTION copilot_billing.increment_e2b_quota_spend TO service_role;
COMMENT ON FUNCTION copilot_billing.increment_e2b_quota_spend IS 'Atomically increment E2B quota spend for concurrent-safe updates';

CREATE OR REPLACE FUNCTION copilot_billing.check_e2b_quota(
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
    FROM copilot_billing.cost_quotas
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

GRANT EXECUTE ON FUNCTION copilot_billing.check_e2b_quota TO service_role;
COMMENT ON FUNCTION copilot_billing.check_e2b_quota IS 'Check if E2B quota would be exceeded by estimated cost. Returns true if within quota.';

CREATE OR REPLACE FUNCTION copilot_billing.calculate_e2b_cost(
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
    FROM copilot_billing.e2b_pricing
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
            WHEN 'standard' THEN v_exec_cost := p_execution_time_seconds * 0.0001;
            WHEN 'gpu' THEN v_exec_cost := p_execution_time_seconds * 0.001;
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

GRANT EXECUTE ON FUNCTION copilot_billing.calculate_e2b_cost TO service_role;
COMMENT ON FUNCTION copilot_billing.calculate_e2b_cost IS 'Calculate E2B sandbox cost based on tier, region, and resource usage.';

CREATE OR REPLACE FUNCTION copilot_billing.get_current_model_pricing(
    p_provider text,
    p_model text
) RETURNS TABLE(
    input_price_per_million numeric,
    output_price_per_million numeric,
    effective_date timestamptz,
    notes text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mp.input_price_per_million,
        mp.output_price_per_million,
        mp.effective_date,
        mp.notes
    FROM copilot_billing.model_pricing mp
    WHERE mp.provider = LOWER(p_provider)
      AND mp.model = LOWER(p_model)
      AND mp.effective_date <= now()
      AND (mp.expires_at IS NULL OR mp.expires_at > now())
    ORDER BY mp.effective_date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION copilot_billing.get_current_model_pricing TO service_role;
GRANT EXECUTE ON FUNCTION copilot_billing.get_current_model_pricing TO authenticated;
COMMENT ON FUNCTION copilot_billing.get_current_model_pricing IS 'Get current active pricing for a model';

CREATE OR REPLACE FUNCTION copilot_billing.calculate_llm_cost(
    p_provider text,
    p_model text,
    p_input_tokens integer,
    p_output_tokens integer
) RETURNS TABLE(
    input_cost_usd numeric,
    output_cost_usd numeric,
    total_cost_usd numeric,
    pricing_found boolean
) AS $$
DECLARE
    v_pricing record;
BEGIN
    -- Get current pricing
    SELECT * INTO v_pricing
    FROM copilot_billing.get_current_model_pricing(p_provider, p_model);

    IF v_pricing IS NULL THEN
        -- No pricing found
        RETURN QUERY SELECT
            0::numeric,
            0::numeric,
            0::numeric,
            false;
        RETURN;
    END IF;

    -- Calculate costs
    RETURN QUERY SELECT
        (p_input_tokens / 1000000.0) * v_pricing.input_price_per_million,
        (p_output_tokens / 1000000.0) * v_pricing.output_price_per_million,
        ((p_input_tokens / 1000000.0) * v_pricing.input_price_per_million) +
        ((p_output_tokens / 1000000.0) * v_pricing.output_price_per_million),
        true;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION copilot_billing.calculate_llm_cost TO service_role;
GRANT EXECUTE ON FUNCTION copilot_billing.calculate_llm_cost TO authenticated;
COMMENT ON FUNCTION copilot_billing.calculate_llm_cost IS 'Calculate LLM cost based on tokens and current pricing';

-- Wrap complex function in DO block with EXECUTE to handle nested DECLARE/BEGIN/END
DO $wrapper$
BEGIN
  EXECUTE $ddl$
CREATE OR REPLACE FUNCTION copilot_billing.check_and_record_quota_atomic(
  p_scope text,
  p_scope_id uuid,
  p_cost_usd numeric
)
RETURNS TABLE (
  allowed boolean,
  current_spend_usd numeric,
  limit_usd numeric,
  remaining_usd numeric,
  utilization_percent numeric,
  reason text,
  period text,
  period_end timestamptz
)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_quota_row RECORD;
  v_projected_spend numeric;
  v_now timestamptz := now();
BEGIN
  -- Lock the quota row for atomic check + update
  SELECT *
  INTO v_quota_row
  FROM copilot_billing.cost_quotas
  WHERE scope = p_scope
    AND (
      (p_scope = 'platform' AND scope_id IS NULL)
      OR
      (p_scope != 'platform' AND scope_id = p_scope_id)
    )
  FOR UPDATE;

  -- If no quota configured, allow operation
  IF v_quota_row IS NULL THEN
    RETURN QUERY SELECT
      true::boolean AS allowed,
      p_cost_usd AS current_spend_usd,
      999999.99::numeric AS limit_usd,
      999999.99::numeric AS remaining_usd,
      0.0::numeric AS utilization_percent,
      NULL::text AS reason,
      'none'::text AS period,
      NULL::timestamptz AS period_end;
    RETURN;
  END IF;

  -- Check if quota period has expired and needs reset
  IF v_quota_row.period_end IS NULL OR v_now >= v_quota_row.period_end THEN
    DECLARE
      v_period_start timestamptz;
      v_period_end timestamptz;
    BEGIN
      -- Calculate new period bounds
      IF v_quota_row.period = 'hour' THEN
        v_period_start := date_trunc('hour', v_now);
        v_period_end := v_period_start + interval '1 hour';
      ELSIF v_quota_row.period = 'day' THEN
        v_period_start := date_trunc('day', v_now);
        v_period_end := v_period_start + interval '1 day';
      ELSIF v_quota_row.period = 'week' THEN
        v_period_start := date_trunc('week', v_now);
        v_period_end := v_period_start + interval '1 week';
      ELSIF v_quota_row.period = 'month' THEN
        v_period_start := date_trunc('month', v_now);
        v_period_end := v_period_start + interval '1 month';
      END IF;

      IF v_period_start IS NULL OR v_period_end IS NULL THEN
        RAISE EXCEPTION 'Invalid quota period: %', v_quota_row.period;
      END IF;

      -- Update quota with new period and reset spend
      UPDATE copilot_billing.cost_quotas
      SET
        current_spend_usd = 0,
        period_start = v_period_start,
        period_end = v_period_end,
        updated_at = v_now
      WHERE id = v_quota_row.id;

      -- Refresh quota row
      v_quota_row.current_spend_usd := 0;
      v_quota_row.period_start := v_period_start;
      v_quota_row.period_end := v_period_end;
    END;
  END IF;

  -- Calculate projected spend
  v_projected_spend := v_quota_row.current_spend_usd + p_cost_usd;

  -- Check if projected spend exceeds limit
  IF v_projected_spend > v_quota_row.limit_usd THEN
    -- DENY: Would exceed quota
    RETURN QUERY SELECT
      false::boolean AS allowed,
      v_quota_row.current_spend_usd AS current_spend_usd,
      v_quota_row.limit_usd AS limit_usd,
      (v_quota_row.limit_usd - v_quota_row.current_spend_usd)::numeric AS remaining_usd,
      (v_quota_row.current_spend_usd / NULLIF(v_quota_row.limit_usd, 0) * 100)::numeric AS utilization_percent,
      format(
        'Quota exceeded: would spend $%s but limit is $%s (remaining: $%s)',
        v_projected_spend::money,
        v_quota_row.limit_usd::money,
        (v_quota_row.limit_usd - v_quota_row.current_spend_usd)::money
      )::text AS reason,
      v_quota_row.period AS period,
      v_quota_row.period_end AS period_end;
    RETURN;
  END IF;

  -- ALLOW: Update quota atomically
  UPDATE copilot_billing.cost_quotas
  SET
    current_spend_usd = v_projected_spend,
    updated_at = v_now
  WHERE id = v_quota_row.id;

  -- Return success
  RETURN QUERY SELECT
    true::boolean AS allowed,
    v_projected_spend AS current_spend_usd,
    v_quota_row.limit_usd AS limit_usd,
    (v_quota_row.limit_usd - v_projected_spend)::numeric AS remaining_usd,
    (v_projected_spend / NULLIF(v_quota_row.limit_usd, 0) * 100)::numeric AS utilization_percent,
    NULL::text AS reason,
    v_quota_row.period AS period,
    v_quota_row.period_end AS period_end;
  RETURN;
END;
$fn$;
  $ddl$;

  EXECUTE $ddl$
GRANT EXECUTE ON FUNCTION copilot_billing.check_and_record_quota_atomic(text, uuid, numeric) TO service_role;
  $ddl$;

  EXECUTE $ddl$
COMMENT ON FUNCTION copilot_billing.check_and_record_quota_atomic IS 'Atomically checks quota and records cost with row-level locking';
  $ddl$;

  -- Recreate Trigger
  EXECUTE $ddl$
CREATE TRIGGER update_cost_quotas_timestamp
    BEFORE UPDATE ON copilot_billing.cost_quotas
    FOR EACH ROW
    EXECUTE FUNCTION copilot_billing.update_cost_quota_timestamp();
  $ddl$;
END $wrapper$;
