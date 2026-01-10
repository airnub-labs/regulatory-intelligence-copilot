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

/*
  NOTE:
  supabase db reset can execute migrations via a prepared statement.
  If your runner prepares the entire file as one statement, multiple SQL commands
  separated by semicolons will fail with:
    ERROR: cannot insert multiple commands into a prepared statement

  To remain compatible, this migration is executed as ONE SQL command (a single DO block),
  and runs DDL via EXECUTE.
*/

DO $$
DECLARE
  v_result RECORD;
  v_test_scope_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- Create / replace the atomic quota function
  EXECUTE $ddl$
CREATE OR REPLACE FUNCTION copilot_internal.check_and_record_quota_atomic(
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
  IF v_quota_row.period_end IS NULL OR v_now >= v_quota_row.period_end THEN
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

      IF v_period_start IS NULL OR v_period_end IS NULL THEN
        RAISE EXCEPTION 'Invalid quota period: %', v_quota_row.period;
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
    (v_projected_spend / NULLIF(v_quota_row.limit_usd, 0) * 100)::numeric AS utilization_percent,
    NULL::text AS reason,
    v_quota_row.period AS period,
    v_quota_row.period_end AS period_end;
  RETURN;
END;
$fn$;
  $ddl$;

  -- Grant execute permission to service role
  EXECUTE $ddl$
GRANT EXECUTE ON FUNCTION copilot_internal.check_and_record_quota_atomic(text, uuid, numeric)
TO service_role;
  $ddl$;

  EXECUTE $ddl$
COMMENT ON FUNCTION copilot_internal.check_and_record_quota_atomic(text, uuid, numeric) IS
  'Atomically checks quota and records cost in a single transaction with row-level locking. Prevents race conditions during concurrent requests. Returns allowed status and quota details.';
  $ddl$;

  -- ============================================================================
  -- Helper Function: increment_quota_spend
  -- ============================================================================
  -- Atomically increments quota spend (for non-check operations)
  -- Used when cost is recorded after operation completes

  EXECUTE $ddl$
CREATE OR REPLACE FUNCTION copilot_internal.increment_quota_spend(
  p_scope text,
  p_scope_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
AS $fn$
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
$fn$;
  $ddl$;

  EXECUTE $ddl$
GRANT EXECUTE ON FUNCTION copilot_internal.increment_quota_spend(text, uuid, numeric)
TO service_role;
  $ddl$;

  EXECUTE $ddl$
COMMENT ON FUNCTION copilot_internal.increment_quota_spend(text, uuid, numeric) IS
  'Atomically increments quota spend without checking limits. Use for post-operation cost recording when quota was already checked.';
  $ddl$;

  -- ============================================================================
  -- Test the atomic function
  -- ============================================================================

  -- Test 1: Allow operation within quota
  -- Set up test quota
  UPDATE copilot_internal.cost_quotas
  SET current_spend_usd = 0.0,
      limit_usd = 10.0,
      period = 'day',
      period_start = now(),
      period_end = now() + interval '1 day'
  WHERE scope = 'tenant' AND scope_id = v_test_scope_id;

  IF NOT FOUND THEN
    INSERT INTO copilot_internal.cost_quotas (scope, scope_id, limit_usd, period, current_spend_usd, period_start, period_end)
    VALUES ('tenant', v_test_scope_id, 10.0, 'day', 0.0, now(), now() + interval '1 day');
  END IF;

  -- Try to spend $5 (should succeed)
  EXECUTE 'SELECT * FROM copilot_internal.check_and_record_quota_atomic($1, $2, $3)'
    INTO v_result
    USING 'tenant', v_test_scope_id, 5.0;

  IF NOT v_result.allowed THEN
    RAISE EXCEPTION 'Test 1 failed: Operation should be allowed';
  END IF;

  IF v_result.current_spend_usd != 5.0 THEN
    RAISE EXCEPTION 'Test 1 failed: Current spend should be $5.00, got $%', v_result.current_spend_usd;
  END IF;

  RAISE NOTICE 'Test 1 passed: Operation allowed, spend updated to $5.00';

  -- Test 2: Deny operation that would exceed quota
  -- Quota is now at $5/$10 from Test 1
  -- Try to spend $10 more (should fail, would total $15)
  EXECUTE 'SELECT * FROM copilot_internal.check_and_record_quota_atomic($1, $2, $3)'
    INTO v_result
    USING 'tenant', v_test_scope_id, 10.0;

  IF v_result.allowed THEN
    RAISE EXCEPTION 'Test 2 failed: Operation should be denied';
  END IF;

  IF v_result.current_spend_usd != 5.0 THEN
    RAISE EXCEPTION 'Test 2 failed: Current spend should still be $5.00, got $%', v_result.current_spend_usd;
  END IF;

  RAISE NOTICE 'Test 2 passed: Operation denied, spend unchanged at $5.00';

  -- Test 3: Allow operation exactly at limit
  -- Quota is at $5/$10, try to spend exactly $5 more
  EXECUTE 'SELECT * FROM copilot_internal.check_and_record_quota_atomic($1, $2, $3)'
    INTO v_result
    USING 'tenant', v_test_scope_id, 5.0;

  IF NOT v_result.allowed THEN
    RAISE EXCEPTION 'Test 3 failed: Operation should be allowed (at limit)';
  END IF;

  IF v_result.current_spend_usd != 10.0 THEN
    RAISE EXCEPTION 'Test 3 failed: Current spend should be $10.00, got $%', v_result.current_spend_usd;
  END IF;

  RAISE NOTICE 'Test 3 passed: Operation allowed at limit, spend updated to $10.00';

  -- Clean up test quota
  DELETE FROM copilot_internal.cost_quotas WHERE scope = 'tenant' AND scope_id = v_test_scope_id;

  RAISE NOTICE 'All atomic quota tests passed successfully!';
END $$;
