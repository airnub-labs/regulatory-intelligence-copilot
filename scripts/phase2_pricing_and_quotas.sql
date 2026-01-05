-- ============================================================================
-- Phase 2: Pricing Updates & Quota Configuration
-- ============================================================================
-- This script updates pricing data to current 2026 rates and configures
-- test quotas for both E2B and LLM resource types.
--
-- Usage:
--   psql "postgresql://postgres:PASSWORD@HOST:PORT/postgres" < phase2_pricing_and_quotas.sql
--
-- Or via Supabase CLI:
--   supabase db execute < supabase/migrations/phase2_pricing_and_quotas.sql
-- ============================================================================

-- =============================================================================
-- PART 1: Update E2B Pricing to Current 2026 Rates
-- =============================================================================

-- Expire old pricing (keep for historical analysis)
UPDATE copilot_internal.e2b_pricing
SET expires_at = '2026-01-04'::timestamptz
WHERE expires_at IS NULL;

-- Insert current 2026 E2B pricing
-- NOTE: These are example rates - update with actual E2B vendor pricing!
-- Check https://e2b.dev/pricing for current rates
INSERT INTO copilot_internal.e2b_pricing (tier, region, price_per_second, price_per_gb_memory_hour, price_per_cpu_core_hour, effective_date, notes)
VALUES
  -- Standard tier: 2 vCPU, 2GB RAM
  ('standard', 'us-east-1', 0.00012, 0.02, 0.05, '2026-01-04', 'Updated Jan 2026 - Standard sandbox tier'),
  ('standard', 'eu-west-1', 0.00013, 0.02, 0.05, '2026-01-04', 'Updated Jan 2026 - EU region'),

  -- GPU tier: 4 vCPU, 16GB RAM, 1x GPU
  ('gpu', 'us-east-1', 0.0015, 0.08, 0.20, '2026-01-04', 'Updated Jan 2026 - GPU-enabled sandbox'),

  -- High-memory tier: 4 vCPU, 32GB RAM
  ('high-memory', 'us-east-1', 0.0005, 0.10, 0.05, '2026-01-04', 'Updated Jan 2026 - High-memory sandbox'),

  -- High-CPU tier: 8 vCPU, 8GB RAM
  ('high-cpu', 'us-east-1', 0.0003, 0.02, 0.10, '2026-01-04', 'Updated Jan 2026 - High-CPU sandbox')
ON CONFLICT (tier, region, effective_date) DO UPDATE
SET
  price_per_second = EXCLUDED.price_per_second,
  price_per_gb_memory_hour = EXCLUDED.price_per_gb_memory_hour,
  price_per_cpu_core_hour = EXCLUDED.price_per_cpu_core_hour,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- =============================================================================
-- PART 2: Update LLM Pricing to Current 2026 Rates
-- =============================================================================

-- Expire old pricing (keep for historical analysis)
UPDATE copilot_internal.model_pricing
SET expires_at = '2026-01-04'::timestamptz
WHERE expires_at IS NULL;

-- Insert current 2026 LLM pricing
-- NOTE: These are example rates from Jan 2026 - verify with provider pricing pages!
-- OpenAI: https://openai.com/api/pricing/
-- Anthropic: https://www.anthropic.com/pricing
-- Google: https://ai.google.dev/pricing
-- Groq: https://groq.com/pricing/

INSERT INTO copilot_internal.model_pricing (provider, model, input_price_per_million, output_price_per_million, effective_date, notes)
VALUES
  -- OpenAI GPT-4o (Jan 2026 rates)
  ('openai', 'gpt-4o', 2.50, 10.00, '2026-01-04', '2026 Q1 pricing - GPT-4o multimodal'),
  ('openai', 'gpt-4o-mini', 0.15, 0.60, '2026-01-04', '2026 Q1 pricing - GPT-4o mini'),

  -- OpenAI GPT-4 Turbo
  ('openai', 'gpt-4-turbo', 10.0, 30.0, '2026-01-04', '2026 Q1 pricing - GPT-4 Turbo 128k'),

  -- OpenAI GPT-3.5 Turbo
  ('openai', 'gpt-3.5-turbo', 0.50, 1.50, '2026-01-04', '2026 Q1 pricing - GPT-3.5 Turbo 16k'),

  -- Anthropic Claude 3.5 (Jan 2026 rates)
  ('anthropic', 'claude-3-5-sonnet-20241022', 3.00, 15.00, '2026-01-04', '2026 Q1 pricing - Claude 3.5 Sonnet (Oct 2024 version)'),
  ('anthropic', 'claude-3-5-sonnet-20240620', 3.00, 15.00, '2026-01-04', '2026 Q1 pricing - Claude 3.5 Sonnet (June 2024 version)'),

  -- Anthropic Claude 3
  ('anthropic', 'claude-3-opus-20240229', 15.0, 75.0, '2026-01-04', '2026 Q1 pricing - Claude 3 Opus'),
  ('anthropic', 'claude-3-sonnet-20240229', 3.0, 15.0, '2026-01-04', '2026 Q1 pricing - Claude 3 Sonnet'),
  ('anthropic', 'claude-3-haiku-20240307', 0.25, 1.25, '2026-01-04', '2026 Q1 pricing - Claude 3 Haiku'),

  -- Google Gemini (Jan 2026 rates)
  ('google', 'gemini-1.5-pro', 1.25, 5.00, '2026-01-04', '2026 Q1 pricing - Gemini 1.5 Pro'),
  ('google', 'gemini-1.5-flash', 0.075, 0.30, '2026-01-04', '2026 Q1 pricing - Gemini 1.5 Flash'),
  ('google', 'gemini-2.0-flash-exp', 0.00, 0.00, '2026-01-04', '2026 Q1 pricing - Gemini 2.0 Flash (free during preview)'),

  -- Groq (Jan 2026 rates - free tier with rate limits)
  ('groq', 'llama-3.1-70b-versatile', 0.59, 0.79, '2026-01-04', '2026 Q1 pricing - Llama 3.1 70B on Groq'),
  ('groq', 'llama-3.1-8b-instant', 0.05, 0.08, '2026-01-04', '2026 Q1 pricing - Llama 3.1 8B on Groq'),
  ('groq', 'mixtral-8x7b-32768', 0.27, 0.27, '2026-01-04', '2026 Q1 pricing - Mixtral 8x7B on Groq')
ON CONFLICT (provider, model, effective_date) DO UPDATE
SET
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- =============================================================================
-- PART 3: Configure Test Quotas
-- =============================================================================

-- Get demo tenant ID (replace with actual tenant ID from your setup)
-- This assumes you have a demo tenant from the seed data
DO $$
DECLARE
  v_demo_tenant_id uuid;
  v_demo_user_id uuid;
BEGIN
  -- Try to get demo tenant and user IDs
  SELECT
    raw_user_meta_data->>'tenant_id',
    id
  INTO v_demo_tenant_id, v_demo_user_id
  FROM auth.users
  WHERE email = 'demo.user@example.com'
  LIMIT 1;

  IF v_demo_tenant_id IS NULL THEN
    RAISE NOTICE 'Warning: Demo tenant not found. Skipping test quota creation.';
    RAISE NOTICE 'Create quotas manually after getting tenant IDs.';
    RETURN;
  END IF;

  RAISE NOTICE 'Configuring quotas for demo tenant: %', v_demo_tenant_id;

  -- Configure E2B quotas for demo tenant
  INSERT INTO copilot_internal.cost_quotas (
    scope,
    scope_id,
    resource_type,
    limit_usd,
    period,
    period_start,
    period_end,
    current_spend_usd,
    warning_threshold
  ) VALUES
    -- E2B daily quota for testing ($10/day)
    (
      'tenant',
      v_demo_tenant_id,
      'e2b',
      10.00,
      'day',
      date_trunc('day', NOW()),
      date_trunc('day', NOW() + INTERVAL '1 day'),
      0.00,
      0.80  -- Warn at 80%
    )
  ON CONFLICT (scope, scope_id, resource_type) DO UPDATE
  SET
    limit_usd = EXCLUDED.limit_usd,
    period = EXCLUDED.period,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    warning_threshold = EXCLUDED.warning_threshold,
    updated_at = NOW();

  -- Configure LLM quotas for demo tenant
  INSERT INTO copilot_internal.cost_quotas (
    scope,
    scope_id,
    resource_type,
    limit_usd,
    period,
    period_start,
    period_end,
    current_spend_usd,
    warning_threshold
  ) VALUES
    -- LLM daily quota for testing ($50/day)
    (
      'tenant',
      v_demo_tenant_id,
      'llm',
      50.00,
      'day',
      date_trunc('day', NOW()),
      date_trunc('day', NOW() + INTERVAL '1 day'),
      0.00,
      0.80  -- Warn at 80%
    )
  ON CONFLICT (scope, scope_id, resource_type) DO UPDATE
  SET
    limit_usd = EXCLUDED.limit_usd,
    period = EXCLUDED.period,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    warning_threshold = EXCLUDED.warning_threshold,
    updated_at = NOW();

  RAISE NOTICE 'Test quotas configured:';
  RAISE NOTICE '  - E2B: $10/day (warn at 80%% = $8)';
  RAISE NOTICE '  - LLM: $50/day (warn at 80%% = $40)';
END $$;

-- Platform-wide quotas (safety net for all tenants combined)
INSERT INTO copilot_internal.cost_quotas (
  scope,
  scope_id,
  resource_type,
  limit_usd,
  period,
  period_start,
  period_end,
  current_spend_usd,
  warning_threshold
) VALUES
  -- Platform-wide E2B quota ($1000/month)
  (
    'platform',
    NULL,
    'e2b',
    1000.00,
    'month',
    date_trunc('month', NOW()),
    date_trunc('month', NOW() + INTERVAL '1 month'),
    0.00,
    0.90  -- Warn at 90%
  ),
  -- Platform-wide LLM quota ($5000/month)
  (
    'platform',
    NULL,
    'llm',
    5000.00,
    'month',
    date_trunc('month', NOW()),
    date_trunc('month', NOW() + INTERVAL '1 month'),
    0.00,
    0.90  -- Warn at 90%
  )
ON CONFLICT (scope, scope_id, resource_type) DO UPDATE
SET
  limit_usd = EXCLUDED.limit_usd,
  period = EXCLUDED.period,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  warning_threshold = EXCLUDED.warning_threshold,
  updated_at = NOW();

-- =============================================================================
-- PART 4: Verification
-- =============================================================================

DO $$
DECLARE
  e2b_pricing_count integer;
  llm_pricing_count integer;
  e2b_quota_count integer;
  llm_quota_count integer;
BEGIN
  -- Check E2B pricing updates
  SELECT COUNT(*) INTO e2b_pricing_count
  FROM copilot_internal.e2b_pricing
  WHERE effective_date >= '2026-01-04'
    AND expires_at IS NULL;

  -- Check LLM pricing updates
  SELECT COUNT(*) INTO llm_pricing_count
  FROM copilot_internal.model_pricing
  WHERE effective_date >= '2026-01-04'
    AND expires_at IS NULL;

  -- Check E2B quotas
  SELECT COUNT(*) INTO e2b_quota_count
  FROM copilot_internal.cost_quotas
  WHERE resource_type IN ('e2b', 'all');

  -- Check LLM quotas
  SELECT COUNT(*) INTO llm_quota_count
  FROM copilot_internal.cost_quotas
  WHERE resource_type IN ('llm', 'all');

  RAISE NOTICE '';
  RAISE NOTICE '=== Phase 2: Pricing & Quotas - Verification ===';
  RAISE NOTICE '  ✓ E2B pricing records (2026): %', e2b_pricing_count;
  RAISE NOTICE '  ✓ LLM pricing records (2026): %', llm_pricing_count;
  RAISE NOTICE '  ✓ E2B quotas configured: %', e2b_quota_count;
  RAISE NOTICE '  ✓ LLM quotas configured: %', llm_quota_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Verify pricing matches current vendor rates';
  RAISE NOTICE '  2. Enable quota enforcement (enforceQuotas: true)';
  RAISE NOTICE '  3. Test quota breach scenarios';
  RAISE NOTICE '';

  IF e2b_pricing_count < 3 OR llm_pricing_count < 10 THEN
    RAISE WARNING 'Pricing data may be incomplete. Check vendor pricing pages.';
  END IF;
END $$;
