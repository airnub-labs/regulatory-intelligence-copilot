-- =====================================================================================
-- REALISTIC SEED DATA: QUOTA TRACKING
-- =====================================================================================
--
-- This seed file creates quota configurations and tracking for each tenant tier.
--
-- Quota tiers:
--   - Enterprise (DataTech): €5,000/month
--   - Pro (Emerald Tax): €1,500/month
--   - Free (Seán): €50/month
--
-- Tracking patterns:
--   - Enterprise: 60-70% utilization (healthy usage, room for growth)
--   - Pro: 60-80% utilization (good engagement)
--   - Free: 40-80% utilization (hitting limits occasionally)
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant IDs
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_emerald_tenant_id UUID := 'c2d3e4f5-06a7-4b8c-9d0e-1f2a3b4c5d6e';
  v_sean_tenant_id UUID := 'd3e4f506-a708-4c9d-0e1f-2a3b4c5d6e7f';

  v_now TIMESTAMPTZ := NOW();
  v_month_start DATE;
  v_current_month TEXT;

BEGIN
  -- Get current month for quota period
  v_month_start := date_trunc('month', v_now);
  v_current_month := to_char(v_month_start, 'YYYY-MM');

  -- ==================================================================================
  -- TENANT QUOTA CONFIGURATIONS
  -- ==================================================================================
  -- Set monthly cost quotas for each tenant based on their plan tier
  -- ==================================================================================

  -- Check if copilot_billing.tenant_quotas table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'copilot_billing' AND table_name = 'tenant_quotas'
  ) THEN

    -- DataTech: Enterprise tier
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_datatech_tenant_id,
      'monthly_cost',
      5000.00,  -- $5,000 monthly quota
      v_month_start,
      v_month_start + INTERVAL '1 month' - INTERVAL '1 day',
      325.00,  -- Current usage: ~$325 (6.5% utilization)
      v_month_start,
      v_now,
      jsonb_build_object(
        'plan', 'enterprise',
        'auto_renew', true,
        'alert_threshold_pct', 80,
        'hard_limit_enabled', false,
        'overage_allowed', true,
        'overage_rate', 1.2
      )
    ) ON CONFLICT (tenant_id, period_start) DO UPDATE
      SET current_usage_usd = EXCLUDED.current_usage_usd,
          updated_at = EXCLUDED.updated_at;

    -- Emerald Tax: Pro tier
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_emerald_tenant_id,
      'monthly_cost',
      1500.00,  -- $1,500 monthly quota
      v_month_start,
      v_month_start + INTERVAL '1 month' - INTERVAL '1 day',
      0.00,  -- No conversations seeded yet
      v_month_start,
      v_now,
      jsonb_build_object(
        'plan', 'pro',
        'auto_renew', true,
        'alert_threshold_pct', 80,
        'hard_limit_enabled', false,
        'overage_allowed', true,
        'overage_rate', 1.5
      )
    ) ON CONFLICT (tenant_id, period_start) DO UPDATE
      SET current_usage_usd = EXCLUDED.current_usage_usd,
          updated_at = EXCLUDED.updated_at;

    -- Seán: Free tier
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_sean_tenant_id,
      'monthly_cost',
      50.00,  -- $50 monthly quota (free tier)
      v_month_start,
      v_month_start + INTERVAL '1 month' - INTERVAL '1 day',
      0.054,  -- Current usage: ~$0.054 (0.1% utilization)
      v_month_start,
      v_now,
      jsonb_build_object(
        'plan', 'free',
        'auto_renew', true,
        'alert_threshold_pct', 80,
        'hard_limit_enabled', true,
        'overage_allowed', false,
        'upgrade_prompt_enabled', true
      )
    ) ON CONFLICT (tenant_id, period_start) DO UPDATE
      SET current_usage_usd = EXCLUDED.current_usage_usd,
          updated_at = EXCLUDED.updated_at;

    RAISE NOTICE '✅ Created tenant quota configurations';
    RAISE NOTICE '   DataTech (Enterprise): $5,000 quota, $325 used (6.5%%)';
    RAISE NOTICE '   Emerald Tax (Pro): $1,500 quota, $0 used (0%%)';
    RAISE NOTICE '   Seán (Free): $50 quota, $0.054 used (0.1%%)';

  ELSE
    RAISE NOTICE 'Skipped quota configurations (tenant_quotas table does not exist yet)';
  END IF;

  -- ==================================================================================
  -- HISTORICAL QUOTA USAGE (Previous Months)
  -- ==================================================================================
  -- Show historical usage patterns for each tenant
  -- ==================================================================================

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'copilot_billing' AND table_name = 'tenant_quotas'
  ) THEN

    -- Last month: DataTech
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_datatech_tenant_id,
      'monthly_cost',
      5000.00,
      v_month_start - INTERVAL '1 month',
      v_month_start - INTERVAL '1 day',
      3250.00,  -- 65% utilization (healthy)
      v_month_start - INTERVAL '1 month',
      v_month_start,
      jsonb_build_object(
        'plan', 'enterprise',
        'period_closed', true,
        'utilization_pct', 65.0,
        'total_conversations', 142,
        'total_messages', 1247,
        'llm_costs_usd', 3100.00,
        'e2b_costs_usd', 150.00
      )
    ) ON CONFLICT (tenant_id, period_start) DO NOTHING;

    -- 2 months ago: DataTech
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_datatech_tenant_id,
      'monthly_cost',
      5000.00,
      v_month_start - INTERVAL '2 months',
      v_month_start - INTERVAL '1 month' - INTERVAL '1 day',
      2890.00,  -- 57.8% utilization
      v_month_start - INTERVAL '2 months',
      v_month_start - INTERVAL '1 month',
      jsonb_build_object(
        'plan', 'enterprise',
        'period_closed', true,
        'utilization_pct', 57.8,
        'total_conversations', 128,
        'total_messages', 1089
      )
    ) ON CONFLICT (tenant_id, period_start) DO NOTHING;

    -- Last month: Emerald Tax
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_emerald_tenant_id,
      'monthly_cost',
      1500.00,
      v_month_start - INTERVAL '1 month',
      v_month_start - INTERVAL '1 day',
      1120.00,  -- 74.7% utilization (good engagement)
      v_month_start - INTERVAL '1 month',
      v_month_start,
      jsonb_build_object(
        'plan', 'pro',
        'period_closed', true,
        'utilization_pct', 74.7,
        'total_conversations', 58,
        'total_messages', 412
      )
    ) ON CONFLICT (tenant_id, period_start) DO NOTHING;

    -- 2 months ago: Emerald Tax
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_emerald_tenant_id,
      'monthly_cost',
      1500.00,
      v_month_start - INTERVAL '2 months',
      v_month_start - INTERVAL '1 month' - INTERVAL '1 day',
      980.00,  -- 65.3% utilization
      v_month_start - INTERVAL '2 months',
      v_month_start - INTERVAL '1 month',
      jsonb_build_object(
        'plan', 'pro',
        'period_closed', true,
        'utilization_pct', 65.3,
        'total_conversations', 52,
        'total_messages', 378
      )
    ) ON CONFLICT (tenant_id, period_start) DO NOTHING;

    -- Last month: Seán (hit limit)
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_sean_tenant_id,
      'monthly_cost',
      50.00,
      v_month_start - INTERVAL '1 month',
      v_month_start - INTERVAL '1 day',
      48.20,  -- 96.4% utilization (near limit!)
      v_month_start - INTERVAL '1 month',
      v_month_start,
      jsonb_build_object(
        'plan', 'free',
        'period_closed', true,
        'utilization_pct', 96.4,
        'total_conversations', 18,
        'total_messages', 124,
        'limit_reached', true,
        'limit_reached_at', (v_month_start - INTERVAL '2 days')::TEXT,
        'upgrade_prompt_shown', true
      )
    ) ON CONFLICT (tenant_id, period_start) DO NOTHING;

    -- 2 months ago: Seán (moderate usage)
    INSERT INTO copilot_billing.tenant_quotas (
      id, tenant_id, quota_type, quota_amount_usd, period_start, period_end,
      current_usage_usd, created_at, updated_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_sean_tenant_id,
      'monthly_cost',
      50.00,
      v_month_start - INTERVAL '2 months',
      v_month_start - INTERVAL '1 month' - INTERVAL '1 day',
      28.50,  -- 57% utilization
      v_month_start - INTERVAL '2 months',
      v_month_start - INTERVAL '1 month',
      jsonb_build_object(
        'plan', 'free',
        'period_closed', true,
        'utilization_pct', 57.0,
        'total_conversations', 12,
        'total_messages', 87
      )
    ) ON CONFLICT (tenant_id, period_start) DO NOTHING;

    RAISE NOTICE '✅ Created historical quota records';
    RAISE NOTICE '   DataTech: 3 months of history (57-65%% utilization)';
    RAISE NOTICE '   Emerald Tax: 3 months of history (65-75%% utilization)';
    RAISE NOTICE '   Seán: 3 months of history (57-96%% utilization, hit limit last month)';

  END IF;

  -- ==================================================================================
  -- QUOTA ALERTS
  -- ==================================================================================
  -- Track when tenants were warned about approaching their limits
  -- ==================================================================================

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'copilot_billing' AND table_name = 'quota_alerts'
  ) THEN

    -- Seán hit 80% warning last month
    INSERT INTO copilot_billing.quota_alerts (
      id, tenant_id, alert_type, threshold_pct, usage_at_alert_usd, quota_amount_usd,
      alerted_at, resolved_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_sean_tenant_id,
      '80_percent_warning',
      80.0,
      40.50,
      50.00,
      v_month_start - INTERVAL '5 days',
      NULL,  -- Not resolved, continued to limit
      jsonb_build_object(
        'notification_sent', true,
        'notification_method', 'email',
        'user_action', 'continued_usage'
      )
    );

    -- Seán hit 95% critical warning last month
    INSERT INTO copilot_billing.quota_alerts (
      id, tenant_id, alert_type, threshold_pct, usage_at_alert_usd, quota_amount_usd,
      alerted_at, resolved_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_sean_tenant_id,
      '95_percent_critical',
      95.0,
      47.60,
      50.00,
      v_month_start - INTERVAL '2 days 6 hours',
      NULL,
      jsonb_build_object(
        'notification_sent', true,
        'notification_method', 'email_and_in_app',
        'upgrade_prompt_shown', true,
        'user_action', 'ignored'
      )
    );

    -- Seán hit hard limit last month
    INSERT INTO copilot_billing.quota_alerts (
      id, tenant_id, alert_type, threshold_pct, usage_at_alert_usd, quota_amount_usd,
      alerted_at, resolved_at, metadata
    ) VALUES (
      gen_random_uuid(),
      v_sean_tenant_id,
      'hard_limit_reached',
      96.4,
      48.20,
      50.00,
      v_month_start - INTERVAL '2 days',
      v_month_start,  -- Resolved when month reset
      jsonb_build_object(
        'notification_sent', true,
        'notification_method', 'email_and_in_app',
        'service_suspended', true,
        'upgrade_prompt_shown', true,
        'user_action', 'waited_for_reset'
      )
    );

    RAISE NOTICE '✅ Created quota alert records';
    RAISE NOTICE '   Seán triggered 3 alerts last month (80%%, 95%%, limit reached)';

  ELSE
    RAISE NOTICE 'Skipped quota alerts (quota_alerts table does not exist yet)';
  END IF;

  -- ==================================================================================
  -- SUMMARY STATISTICS
  -- ==================================================================================

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'QUOTA TRACKING SUMMARY';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 CURRENT MONTH (%)', v_current_month;
  RAISE NOTICE '   • DataTech (Enterprise): $325 / $5,000 (6.5%%)';
  RAISE NOTICE '   • Emerald Tax (Pro): $0 / $1,500 (0%%)';
  RAISE NOTICE '   • Seán (Free): $0.054 / $50 (0.1%%)';
  RAISE NOTICE '';
  RAISE NOTICE '📈 LAST MONTH';
  RAISE NOTICE '   • DataTech: $3,250 / $5,000 (65%%)';
  RAISE NOTICE '   • Emerald Tax: $1,120 / $1,500 (74.7%%)';
  RAISE NOTICE '   • Seán: $48.20 / $50 (96.4%% - HIT LIMIT)';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  ALERTS';
  RAISE NOTICE '   • Seán triggered 3 alerts last month';
  RAISE NOTICE '   • Service temporarily suspended for Seán at month end';
  RAISE NOTICE '   • No alerts for DataTech or Emerald Tax (healthy usage)';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';

END $$;
