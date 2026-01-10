-- =====================================================================================
-- REALISTIC SEED DATA: E2B SANDBOX EXECUTION COSTS
-- =====================================================================================
--
-- This seed file creates realistic E2B (Execute Big Code) sandbox execution cost
-- records for conversations that required running Python calculations.
--
-- E2B is used for:
--   - Complex tax calculations (corporation tax, PAYE/PRSI scenarios)
--   - "What-if" scenario modeling (R&D credit variations, salary/dividend optimization)
--   - Multi-variable optimization (BIK calculations, exit strategy modeling)
--   - Financial projections (holding company cash flow)
--
-- Cost patterns:
--   - Enterprise: Moderate E2B usage (complex calculations, multiple scenarios)
--   - Pro: Low E2B usage (occasional calculations)
--   - Personal: Minimal E2B usage (simple calculations, mostly LLM-based)
--
-- E2B Pricing (2024 rates):
--   - $0.000035 per sandbox second
--   - Average execution: 2-10 seconds per calculation
--   - Typical cost: $0.00007 - $0.00035 per calculation
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant IDs
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_sean_tenant_id UUID := 'd3e4f506-a708-4c9d-0e1f-2a3b4c5d6e7f';

  -- User IDs
  v_ronan_id UUID := 'a2b3c4d5-e6f7-4b8c-9d0e-1f2a3b4c5d6e';  -- CFO
  v_orla_id UUID := 'a8b9c0d1-e2f3-4b4c-5d6e-7f8091021324';  -- HR Director
  v_niamh_id UUID := 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';  -- CEO
  v_sean_id UUID := 'd4e5f607-a809-4d0e-1f2a-3b4c5d6e7f80';  -- Seán

  -- Conversation IDs
  v_finance_conv1_id UUID := 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c';  -- Corp tax R&D
  v_hr_conv1_id UUID := 'a1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';  -- Company car BIK
  v_hr_conv2_id UUID := 'a2a2b2c2-d2e2-4f2a-2b2c-2d2e2f2a2b2c';  -- KEEP options
  v_tax_conv1_id UUID := 'd1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';  -- Close company
  v_tax_conv3_id UUID := 'd3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b3c';  -- Exit strategy
  v_sean_conv1_id UUID := 'b1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';  -- Salary dividend

  v_now TIMESTAMPTZ := NOW();

BEGIN
  -- Check if e2b_costs table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'copilot_billing' AND table_name = 'e2b_costs'
  ) THEN
    RAISE NOTICE 'Skipped E2B costs (e2b_costs table does not exist yet)';
    RETURN;
  END IF;

  -- ==================================================================================
  -- DATATECH FINANCE - Corporation Tax R&D Credit Calculation
  -- ==================================================================================
  -- Complex multi-scenario calculation with branching
  -- Calculated €150K vs €200K R&D credit scenarios
  -- ==================================================================================

  -- Main path: €150K R&D calculation
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    4.2,  -- Execution time in seconds
    3.8,  -- CPU time
    128,  -- Peak memory usage
    0.000147,  -- $0.000035 per second × 4.2 seconds
    v_now - INTERVAL '7 days 10:17:00',
    jsonb_build_object(
      'calculation_type', 'corporation_tax_with_r&d',
      'scenario', 'main_path_€150k',
      'inputs', jsonb_build_object(
        'trading_income', 2400000,
        'r&d_expenditure', 150000,
        'ct_rate', 0.125,
        'r&d_credit_rate', 0.25
      ),
      'outputs', jsonb_build_object(
        'gross_ct', 300000,
        'r&d_credit', 37500,
        'net_ct_payable', 262500
      ),
      'execution_environment', 'python_3.11',
      'packages_used', ARRAY['numpy', 'pandas']
    )
  );

  -- Branch path: €200K R&D calculation
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    3.8,
    3.5,
    115,
    0.000133,
    v_now - INTERVAL '7 days 10:38:00',
    jsonb_build_object(
      'calculation_type', 'corporation_tax_with_r&d',
      'scenario', 'branch_path_€200k',
      'inputs', jsonb_build_object(
        'trading_income', 2400000,
        'r&d_expenditure', 200000,
        'ct_rate', 0.125,
        'r&d_credit_rate', 0.25
      ),
      'outputs', jsonb_build_object(
        'gross_ct', 300000,
        'r&d_credit', 50000,
        'net_ct_payable', 250000,
        'savings_vs_€150k', 12500
      ),
      'execution_environment', 'python_3.11'
    )
  );

  -- ==================================================================================
  -- DATATECH HR - Company Car BIK Calculation
  -- ==================================================================================
  -- Multi-scenario BIK calculation with different mileage bands
  -- ==================================================================================

  -- Standard mileage (<24k km)
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_orla_id, v_hr_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    2.5,
    2.2,
    98,
    0.000088,
    v_now - INTERVAL '4 days 11:25:00',
    jsonb_build_object(
      'calculation_type', 'bik_company_car',
      'scenario', 'standard_mileage',
      'inputs', jsonb_build_object(
        'omv', 55000,
        'co2_emissions', 45,
        'bik_rate', 0.08,
        'business_mileage_km', 20000,
        'income_tax_rate', 0.40,
        'usc_rate', 0.08,
        'prsi_rate', 0.041
      ),
      'outputs', jsonb_build_object(
        'annual_bik_value', 4400,
        'income_tax', 1760,
        'usc', 352,
        'prsi', 180,
        'total_annual_bik_tax', 2292,
        'monthly_bik_tax', 191
      )
    )
  );

  -- High mileage (30k km) - 75% BIK
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_orla_id, v_hr_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    2.8,
    2.5,
    102,
    0.000098,
    v_now - INTERVAL '4 days 11:35:00',
    jsonb_build_object(
      'calculation_type', 'bik_company_car',
      'scenario', 'high_mileage_30k_km',
      'inputs', jsonb_build_object(
        'omv', 55000,
        'business_mileage_km', 30000,
        'bik_reduction', 0.75
      ),
      'outputs', jsonb_build_object(
        'reduced_bik_value', 3300,
        'total_annual_bik_tax', 1719,
        'monthly_bik_tax', 143,
        'savings_vs_standard', 573
      )
    )
  );

  -- ==================================================================================
  -- DATATECH HR - KEEP Share Options Valuation
  -- ==================================================================================
  -- Calculate option value, vesting schedule, and exit scenarios
  -- ==================================================================================

  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_orla_id, v_hr_conv2_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    5.7,  -- Complex calculation with multiple scenarios
    5.2,
    156,
    0.000200,
    v_now - INTERVAL '9 days 15:38:00',
    jsonb_build_object(
      'calculation_type', 'keep_share_options_valuation',
      'scenario', 'senior_engineer_grant',
      'inputs', jsonb_build_object(
        'option_value', 100000,
        'current_share_price', 6.25,
        'options_granted', 16000,
        'vesting_years', 4,
        'vesting_cliff_months', 12,
        'exit_scenarios', jsonb_build_object(
          'conservative', 15.00,
          'moderate', 20.00,
          'optimistic', 30.00
        )
      ),
      'outputs', jsonb_build_object(
        'year_1_vested', 0,
        'year_2_vested', 4000,
        'year_3_vested', 8000,
        'year_4_vested', 12000,
        'exit_valuations', jsonb_build_object(
          'conservative', jsonb_build_object('value', 240000, 'net_after_cgt', 166320),
          'moderate', jsonb_build_object('value', 320000, 'net_after_cgt', 221440),
          'optimistic', jsonb_build_object('value', 480000, 'net_after_cgt', 332160)
        ),
        'cgt_rate', 0.33
      ),
      'execution_environment', 'python_3.11',
      'packages_used', ARRAY['numpy', 'pandas', 'matplotlib']
    )
  );

  -- ==================================================================================
  -- DATATECH TAX - Close Company Surcharge Calculation
  -- ==================================================================================

  -- Main path: €500K cash reserves
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_ronan_id, v_tax_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    3.2,
    2.9,
    105,
    0.000112,
    v_now - INTERVAL '15 days 14:36:00',
    jsonb_build_object(
      'calculation_type', 'close_company_surcharge',
      'scenario', 'main_€500k_deposits',
      'inputs', jsonb_build_object(
        'cash_reserves', 500000,
        'interest_rate', 0.03,
        'working_capital_needed', 1500000,
        'monthly_burn', 1000000
      ),
      'outputs', jsonb_build_object(
        'annual_interest', 15000,
        'classification', 'trading_cash_incidental_income',
        'surcharge_applies', false,
        'ct_on_interest', 3750,
        'effective_rate', 0.25
      )
    )
  );

  -- Branch path: €2M cash reserves scenario
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_ronan_id, v_tax_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    4.1,
    3.7,
    128,
    0.000144,
    v_now - INTERVAL '15 days 14:50:00',
    jsonb_build_object(
      'calculation_type', 'close_company_surcharge',
      'scenario', 'branch_€2m_deposits',
      'inputs', jsonb_build_object(
        'cash_reserves', 2000000,
        'interest_rate', 0.03,
        'working_capital_allocation', 1500000,
        'surplus_cash', 500000
      ),
      'outputs', jsonb_build_object(
        'total_interest', 60000,
        'trading_cash_interest', 45000,
        'surplus_cash_interest', 15000,
        'surcharge_on_surplus', 2250,
        'total_tax', 6000,
        'effective_rate_surplus', 0.40,
        'recommendation', 'deploy_surplus_or_distribute'
      )
    )
  );

  -- ==================================================================================
  -- DATATECH TAX - Exit Strategy €50M Sale Calculation
  -- ==================================================================================

  -- Main path: Entrepreneur Relief calculation
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_niamh_id, v_tax_conv3_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    6.3,  -- Complex multi-scenario exit modeling
    5.8,
    185,
    0.000221,
    v_now - INTERVAL '28 days 16:42:00',
    jsonb_build_object(
      'calculation_type', 'exit_strategy_tax_modeling',
      'scenario', 'entrepreneur_relief',
      'inputs', jsonb_build_object(
        'sale_price', 50000000,
        'cost_base', 100,
        'entrepreneur_relief_limit', 1000000,
        'cgt_standard_rate', 0.33,
        'cgt_entrepreneur_rate', 0.10,
        'deal_fees_pct', 0.03
      ),
      'outputs', jsonb_build_object(
        'capital_gain', 49999900,
        'cgt_on_first_1m', 100000,
        'cgt_on_remaining', 16169670,
        'total_cgt', 16269670,
        'deal_fees', 1500000,
        'net_proceeds', 32230330,
        'effective_tax_rate', 0.325,
        'saving_vs_no_relief', 230000
      ),
      'execution_environment', 'python_3.11',
      'packages_used', ARRAY['numpy', 'pandas']
    )
  );

  -- Branch path: Retirement Relief comparison (wait until age 55)
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_niamh_id, v_tax_conv3_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    7.9,  -- Very complex: retirement relief + time value + probability weighting
    7.2,
    215,
    0.000277,
    v_now - INTERVAL '28 days 16:50:00',
    jsonb_build_object(
      'calculation_type', 'exit_strategy_retirement_relief',
      'scenario', 'wait_3_years_age_55',
      'inputs', jsonb_build_object(
        'sale_price_year_3', 50000000,
        'retirement_relief_limit', 750000,
        'marginal_relief_band', jsonb_build_object('start', 750000, 'end', 3000000),
        'discount_rate', 0.07,
        'scenarios', jsonb_build_array(
          jsonb_build_object('probability', 0.30, 'value', 70000000, 'outcome', 'growth'),
          jsonb_build_object('probability', 0.40, 'value', 50000000, 'outcome', 'stable'),
          jsonb_build_object('probability', 0.20, 'value', 35000000, 'outcome', 'downturn'),
          jsonb_build_object('probability', 0.10, 'value', 20000000, 'outcome', 'crisis')
        )
      ),
      'outputs', jsonb_build_object(
        'retirement_relief_cgt', 15880000,
        'net_proceeds_year_3', 34120000,
        'tax_saving_vs_now', 390000,
        'opportunity_cost_investment', 7200000,
        'expected_value_scenarios', 32800000,
        'recommendation', 'sell_now',
        'risk_adjusted_conclusion', 'tax_savings_immaterial_vs_risks',
        'time_value_analysis', jsonb_build_object(
          'present_value_sell_now', 33730000,
          'present_value_wait_3_years', 28967000,
          'npv_difference', -4763000
        )
      ),
      'execution_environment', 'python_3.11',
      'packages_used', ARRAY['numpy', 'pandas', 'scipy']
    )
  );

  -- ==================================================================================
  -- SEÁN PERSONAL - Salary vs Dividend Optimization
  -- ==================================================================================

  -- Main path: €40K salary + €25K dividend
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_sean_tenant_id, v_sean_id, v_sean_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    2.1,  -- Simple calculation
    1.9,
    85,
    0.000074,
    v_now - INTERVAL '3 days 19:49:00',
    jsonb_build_object(
      'calculation_type', 'salary_dividend_optimization',
      'scenario', 'main_€40k_€25k',
      'inputs', jsonb_build_object(
        'salary', 40000,
        'dividend_gross', 25000,
        'income_tax_rate_20pct_band', 42000,
        'usc_rates', ARRAY[0.005, 0.02, 0.04, 0.08],
        'prsi_employee_rate', 0.041,
        'prsi_employer_rate', 0.1105,
        'ct_rate', 0.125
      ),
      'outputs', jsonb_build_object(
        'salary_net', 31600,
        'ct_on_dividend', 3125,
        'dividend_net', 21875,
        'total_take_home', 53475,
        'total_tax_all_levels', 13881,
        'effective_tax_rate', 0.214
      )
    )
  );

  -- Branch path: €50K salary + €15K dividend (mortgage scenario)
  INSERT INTO copilot_billing.e2b_costs (
    id, tenant_id, user_id, conversation_id, message_id,
    sandbox_id, execution_time_seconds, cpu_time_seconds,
    memory_mb_peak, cost_usd, created_at, metadata
  ) VALUES (
    gen_random_uuid(),
    v_sean_tenant_id, v_sean_id, v_sean_conv1_id, gen_random_uuid(),
    'sbx_' || substring(md5(random()::text) from 1 for 16),
    2.6,
    2.3,
    92,
    0.000091,
    v_now - INTERVAL '3 days 20:08:00',
    jsonb_build_object(
      'calculation_type', 'salary_dividend_optimization',
      'scenario', 'branch_€50k_€15k_mortgage',
      'inputs', jsonb_build_object(
        'salary', 50000,
        'dividend_gross', 15000,
        'income_tax_higher_rate', 0.40
      ),
      'outputs', jsonb_build_object(
        'salary_net', 36190,
        'dividend_net', 13125,
        'total_take_home', 49315,
        'comparison_vs_40k_25k', -4160,
        'mortgage_assessable_income', 57500,
        'mortgage_borrowing_capacity_increase', 17500,
        'recommendation', 'temporary_for_mortgage_then_revert'
      )
    )
  );

  -- ==================================================================================
  -- SUMMARY STATISTICS
  -- ==================================================================================

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'E2B SANDBOX EXECUTION COSTS';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 DATATECH ENTERPRISE:';
  RAISE NOTICE '   • Corporation Tax R&D: 2 executions (~8 sec, $0.00028)';
  RAISE NOTICE '   • Company Car BIK: 2 executions (~5 sec, $0.00019)';
  RAISE NOTICE '   • KEEP Options: 1 execution (~6 sec, $0.00020)';
  RAISE NOTICE '   • Close Company: 2 executions (~7 sec, $0.00026)';
  RAISE NOTICE '   • Exit Strategy: 2 executions (~14 sec, $0.00050)';
  RAISE NOTICE '   • Total: 9 executions, ~40 seconds, $0.00143';
  RAISE NOTICE '';
  RAISE NOTICE '📊 SEÁN PERSONAL:';
  RAISE NOTICE '   • Salary/Dividend: 2 executions (~5 sec, $0.00017)';
  RAISE NOTICE '   • Total: 2 executions, ~5 seconds, $0.00017';
  RAISE NOTICE '';
  RAISE NOTICE '💰 GRAND TOTAL:';
  RAISE NOTICE '   • All tenants: 11 executions';
  RAISE NOTICE '   • Total execution time: ~45 seconds';
  RAISE NOTICE '   • Total cost: $0.00160 (~€0.0015)';
  RAISE NOTICE '';
  RAISE NOTICE '📈 USAGE PATTERNS:';
  RAISE NOTICE '   • Enterprise: Complex multi-scenario modeling';
  RAISE NOTICE '   • Personal: Simple optimization calculations';
  RAISE NOTICE '   • Avg cost per execution: $0.00015 (€0.00014)';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';

END $$;
