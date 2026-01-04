-- Atomic Quota Operations
-- Implements database-level locking to prevent race conditions in quota enforcement
-- Reference: COST_TRACKING_TOUCHPOINT_AUDIT.md - Priority 1 Recommendation

-- ============================================================================
-- Function: check_and_record_quota_atomic
-- ============================================================================
-- Atomically checks if a cost operation would exceed quota and records it if allowed.
-- Uses SELECT FOR UPDATE to lock the quota row during the transaction.
--
-- Returns:
--   - allowed (boolean): Whether the operation was allowed
--   - current_spend_usd (numeric): Current spend after operation (if allowed)
--   - limit_usd (numeric): Quota limit
--   - reason (text): Denial reason if not allowed
--
-- Example:
--   SELECT * FROM copilot_internal.check_and_record_quota_atomic(
--     'tenant', 'tenant-123', 5.50
--   );

CREATE OR REPLACE FUNCTION copilot_internal.check_and_record_quota_atomic(
  p_scope text,
  p_scope_id text,
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
AS $$
DECLARE
  v_quota_row RECORD;
  v_projected_spend numeric;
  v_now timestamptz := now();
BEGIN
  -- Lock the quota row for atomic check + update
  -- This prevents concurrent transactions from checking the same quota
  SELECT *
  INTO v_quota_row
  FROM copilot_internal.cost_quotas
  WHERE scope = p_scope
    AND (
      (p_scope = 'platform' AND scope_id IS NULL)
      OR
      (p_scope != 'platform' AND scope_id = p_scope_id)
    )
  FOR UPDATE; -- CRITICAL: This locks the row

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
  IF v_now >= v_quota_row.period_end THEN
    -- Reset quota for new period
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

      -- Update quota with new period and reset spend
      UPDATE copilot_internal.cost_quotas
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
      (v_quota_row.current_spend_usd / v_quota_row.limit_usd * 100)::numeric AS utilization_percent,
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
  UPDATE copilot_internal.cost_quotas
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
    (v_projected_spend / v_quota_row.limit_usd * 100)::numeric AS utilization_percent,
    NULL::text AS reason,
    v_quota_row.period AS period,
    v_quota_row.period_end AS period_end;
  RETURN;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION copilot_internal.check_and_record_quota_atomic(text, text, numeric)
TO service_role;

COMMENT ON FUNCTION copilot_internal.check_and_record_quota_atomic IS
  'Atomically checks quota and records cost in a single transaction with row-level locking. ' ||
  'Prevents race conditions during concurrent requests. Returns allowed status and quota details.';

-- ============================================================================
-- Helper Function: increment_quota_spend
-- ============================================================================
-- Atomically increments quota spend (for non-check operations)
-- Used when cost is recorded after operation completes

CREATE OR REPLACE FUNCTION copilot_internal.increment_quota_spend(
  p_scope text,
  p_scope_id text,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE copilot_internal.cost_quotas
  SET
    current_spend_usd = current_spend_usd + p_amount,
    updated_at = now()
  WHERE scope = p_scope
    AND (
      (p_scope = 'platform' AND scope_id IS NULL)
      OR
      (p_scope != 'platform' AND scope_id = p_scope_id)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION copilot_internal.increment_quota_spend(text, text, numeric)
TO service_role;

COMMENT ON FUNCTION copilot_internal.increment_quota_spend IS
  'Atomically increments quota spend without checking limits. ' ||
  'Use for post-operation cost recording when quota was already checked.';

-- ============================================================================
-- Test the atomic function
-- ============================================================================

-- Test 1: Allow operation within quota
DO $$
DECLARE
  v_result RECORD;
BEGIN
  -- Set up test quota
  INSERT INTO copilot_internal.cost_quotas (scope, scope_id, limit_usd, period, current_spend_usd, period_start, period_end)
  VALUES ('tenant', 'test-atomic-1', 10.0, 'day', 0.0, now(), now() + interval '1 day')
  ON CONFLICT (scope, scope_id) DO UPDATE
  SET current_spend_usd = 0.0,
      limit_usd = 10.0,
      period_start = now(),
      period_end = now() + interval '1 day';

  -- Try to spend $5 (should succeed)
  SELECT * INTO v_result
  FROM copilot_internal.check_and_record_quota_atomic('tenant', 'test-atomic-1', 5.0);

  IF NOT v_result.allowed THEN
    RAISE EXCEPTION 'Test 1 failed: Operation should be allowed';
  END IF;

  IF v_result.current_spend_usd != 5.0 THEN
    RAISE EXCEPTION 'Test 1 failed: Current spend should be $5.00, got $%', v_result.current_spend_usd;
  END IF;

  RAISE NOTICE 'Test 1 passed: Operation allowed, spend updated to $5.00';
END $$;

-- Test 2: Deny operation that would exceed quota
DO $$
DECLARE
  v_result RECORD;
BEGIN
  -- Quota is now at $5/$10 from Test 1
  -- Try to spend $10 more (should fail, would total $15)
  SELECT * INTO v_result
  FROM copilot_internal.check_and_record_quota_atomic('tenant', 'test-atomic-1', 10.0);

  IF v_result.allowed THEN
    RAISE EXCEPTION 'Test 2 failed: Operation should be denied';
  END IF;

  IF v_result.current_spend_usd != 5.0 THEN
    RAISE EXCEPTION 'Test 2 failed: Current spend should still be $5.00, got $%', v_result.current_spend_usd;
  END IF;

  RAISE NOTICE 'Test 2 passed: Operation denied, spend unchanged at $5.00';
END $$;

-- Test 3: Allow operation exactly at limit
DO $$
DECLARE
  v_result RECORD;
BEGIN
  -- Quota is at $5/$10, try to spend exactly $5 more
  SELECT * INTO v_result
  FROM copilot_internal.check_and_record_quota_atomic('tenant', 'test-atomic-1', 5.0);

  IF NOT v_result.allowed THEN
    RAISE EXCEPTION 'Test 3 failed: Operation should be allowed (at limit)';
  END IF;

  IF v_result.current_spend_usd != 10.0 THEN
    RAISE EXCEPTION 'Test 3 failed: Current spend should be $10.00, got $%', v_result.current_spend_usd;
  END IF;

  RAISE NOTICE 'Test 3 passed: Operation allowed at limit, spend updated to $10.00';
END $$;

-- Clean up test quota
DELETE FROM copilot_internal.cost_quotas WHERE scope_id = 'test-atomic-1';

RAISE NOTICE 'All atomic quota tests passed successfully!';
