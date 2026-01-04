-- ============================================================================
-- MIGRATION: LLM Model Pricing Table
-- ============================================================================
-- This migration creates the CRITICAL missing `model_pricing` table that
-- the SupabasePricingService expects but was never created.
--
-- WITHOUT this table:
-- - SupabasePricingService.getPricing() will fail
-- - Cost calculations cannot work
-- - LLM cost tracking is broken
--
-- This migration:
-- 1. Creates the model_pricing table
-- 2. Seeds it with current pricing data (December 2024)
-- 3. Adds helper functions for pricing management
-- 4. Sets up RLS policies
--
-- ⚠️  IMPORTANT: Update pricing with current vendor rates before production!
--
-- References:
--   - LLM_COST_TRACKING_AUDIT.md (Gap #1)
--   - packages/reg-intel-observability/src/pricing/pricingService.ts
--   - packages/reg-intel-observability/src/pricing/pricingData.seed.ts
-- ============================================================================

-- =============================================================================
-- PART 1: Create model_pricing table
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_internal.model_pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Model identification
    provider text NOT NULL,  -- 'openai', 'anthropic', 'google', 'groq', etc.
    model text NOT NULL,     -- 'gpt-4', 'claude-3-opus-20240229', etc.

    -- Pricing (USD per 1 million tokens)
    input_price_per_million numeric(12,6) NOT NULL CHECK (input_price_per_million >= 0),
    output_price_per_million numeric(12,6) NOT NULL CHECK (output_price_per_million >= 0),

    -- Effective date range
    effective_date timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,  -- NULL = current/active pricing

    -- Metadata
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint: one price per provider+model+effectiveDate
    CONSTRAINT unique_model_pricing UNIQUE (provider, model, effective_date)
);

-- =============================================================================
-- PART 2: Create indexes
-- =============================================================================

-- Primary query pattern: lookup by provider+model, ordered by effective_date
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider_model
    ON copilot_internal.model_pricing(provider, model, effective_date DESC);

-- Query pattern: find all pricing for a provider
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider
    ON copilot_internal.model_pricing(provider, effective_date DESC);

-- Query pattern: find active pricing (where expires_at IS NULL or in future)
CREATE INDEX IF NOT EXISTS idx_model_pricing_active
    ON copilot_internal.model_pricing(provider, model, effective_date DESC)
    WHERE expires_at IS NULL OR expires_at > now();

COMMENT ON TABLE copilot_internal.model_pricing IS 'LLM model pricing configuration - allows dynamic pricing updates without code deployment';
COMMENT ON COLUMN copilot_internal.model_pricing.provider IS 'LLM provider: openai, anthropic, google, groq, etc.';
COMMENT ON COLUMN copilot_internal.model_pricing.model IS 'Model identifier (normalized): gpt-4, claude-3-opus-20240229, etc.';
COMMENT ON COLUMN copilot_internal.model_pricing.input_price_per_million IS 'Price per 1M input tokens in USD';
COMMENT ON COLUMN copilot_internal.model_pricing.output_price_per_million IS 'Price per 1M output tokens in USD';
COMMENT ON COLUMN copilot_internal.model_pricing.effective_date IS 'When this pricing became effective';
COMMENT ON COLUMN copilot_internal.model_pricing.expires_at IS 'When this pricing expires (NULL = current)';

-- =============================================================================
-- PART 3: Seed pricing data (December 2024 rates)
-- =============================================================================
-- Source: packages/reg-intel-observability/src/pricing/pricingData.seed.ts
-- ⚠️  UPDATE THESE PRICES WITH CURRENT VENDOR RATES BEFORE PRODUCTION!

-- OpenAI Pricing
INSERT INTO copilot_internal.model_pricing (provider, model, input_price_per_million, output_price_per_million, effective_date, notes)
VALUES
    -- GPT-4 Turbo
    ('openai', 'gpt-4-turbo', 10.0, 30.0, '2024-01-01', 'GPT-4 Turbo with 128k context'),
    ('openai', 'gpt-4-turbo-preview', 10.0, 30.0, '2024-01-01', 'GPT-4 Turbo preview'),
    ('openai', 'gpt-4-turbo-2024-04-09', 10.0, 30.0, '2024-04-09', 'GPT-4 Turbo dated model'),

    -- GPT-4 (original)
    ('openai', 'gpt-4', 30.0, 60.0, '2023-03-01', 'GPT-4 8k context'),
    ('openai', 'gpt-4-0613', 30.0, 60.0, '2023-06-13', 'GPT-4 dated model'),
    ('openai', 'gpt-4-32k', 60.0, 120.0, '2023-03-01', 'GPT-4 32k context'),

    -- GPT-3.5 Turbo
    ('openai', 'gpt-3.5-turbo', 0.5, 1.5, '2024-01-01', 'GPT-3.5 Turbo with 16k context'),
    ('openai', 'gpt-3.5-turbo-0125', 0.5, 1.5, '2024-01-25', 'GPT-3.5 Turbo dated model'),
    ('openai', 'gpt-3.5-turbo-1106', 1.0, 2.0, '2023-11-06', 'GPT-3.5 Turbo dated model'),

    -- GPT-4o (Omni)
    ('openai', 'gpt-4o', 5.0, 15.0, '2024-05-13', 'GPT-4o multimodal'),
    ('openai', 'gpt-4o-2024-05-13', 5.0, 15.0, '2024-05-13', 'GPT-4o dated model'),
    ('openai', 'gpt-4o-mini', 0.15, 0.6, '2024-07-18', 'GPT-4o mini model'),

-- Anthropic Pricing (Claude)
    ('anthropic', 'claude-3-opus-20240229', 15.0, 75.0, '2024-02-29', 'Claude 3 Opus - most capable'),
    ('anthropic', 'claude-3-sonnet-20240229', 3.0, 15.0, '2024-02-29', 'Claude 3 Sonnet - balanced'),
    ('anthropic', 'claude-3-haiku-20240307', 0.25, 1.25, '2024-03-07', 'Claude 3 Haiku - fastest'),
    ('anthropic', 'claude-3-5-sonnet-20240620', 3.0, 15.0, '2024-06-20', 'Claude 3.5 Sonnet - enhanced'),
    ('anthropic', 'claude-2.1', 8.0, 24.0, '2023-11-21', 'Claude 2.1 - 200k context'),
    ('anthropic', 'claude-2.0', 8.0, 24.0, '2023-07-11', 'Claude 2.0 - 100k context'),
    ('anthropic', 'claude-instant-1.2', 0.8, 2.4, '2023-08-09', 'Claude Instant - fast'),

    -- Google Gemini Pricing
    ('google', 'gemini-pro', 0.5, 1.5, '2023-12-13', 'Gemini Pro'),
    ('google', 'gemini-pro-vision', 0.5, 1.5, '2023-12-13', 'Gemini Pro with vision'),
    ('google', 'gemini-1.5-pro', 3.5, 10.5, '2024-05-14', 'Gemini 1.5 Pro - 1M context'),
    ('google', 'gemini-1.5-flash', 0.35, 1.05, '2024-05-14', 'Gemini 1.5 Flash - fast'),

    -- Groq Pricing (free tier - may change)
    ('groq', 'llama-2-70b-4096', 0.7, 0.8, '2024-01-01', 'Llama 2 70B on Groq'),
    ('groq', 'mixtral-8x7b-32768', 0.27, 0.27, '2024-01-01', 'Mixtral 8x7B on Groq'),
    ('groq', 'llama-3-70b-8192', 0.59, 0.79, '2024-04-18', 'Llama 3 70B on Groq'),
    ('groq', 'llama-3-8b-8192', 0.05, 0.08, '2024-04-18', 'Llama 3 8B on Groq')
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- =============================================================================
-- PART 4: Helper functions
-- =============================================================================

-- Function to get current active pricing for a model
CREATE OR REPLACE FUNCTION copilot_internal.get_current_model_pricing(
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
    FROM copilot_internal.model_pricing mp
    WHERE mp.provider = LOWER(p_provider)
      AND mp.model = LOWER(p_model)
      AND mp.effective_date <= now()
      AND (mp.expires_at IS NULL OR mp.expires_at > now())
    ORDER BY mp.effective_date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION copilot_internal.get_current_model_pricing TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_current_model_pricing TO authenticated;

COMMENT ON FUNCTION copilot_internal.get_current_model_pricing IS 'Get current active pricing for a model (most recent effective pricing that hasnt expired)';

-- Function to calculate LLM cost
CREATE OR REPLACE FUNCTION copilot_internal.calculate_llm_cost(
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
    FROM copilot_internal.get_current_model_pricing(p_provider, p_model);

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

GRANT EXECUTE ON FUNCTION copilot_internal.calculate_llm_cost TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.calculate_llm_cost TO authenticated;

COMMENT ON FUNCTION copilot_internal.calculate_llm_cost IS 'Calculate LLM cost based on tokens and current pricing';

-- =============================================================================
-- PART 5: Row Level Security
-- =============================================================================

ALTER TABLE copilot_internal.model_pricing ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY model_pricing_service_role_all
    ON copilot_internal.model_pricing
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read pricing (needed for cost estimation)
CREATE POLICY model_pricing_authenticated_read
    ON copilot_internal.model_pricing
    FOR SELECT
    TO authenticated
    USING (true);

-- =============================================================================
-- PART 6: Grants
-- =============================================================================

GRANT SELECT ON copilot_internal.model_pricing TO authenticated;
GRANT ALL ON copilot_internal.model_pricing TO service_role;

-- =============================================================================
-- PART 7: Verification
-- =============================================================================

DO $$
DECLARE
    table_exists boolean;
    pricing_count integer;
    openai_count integer;
    anthropic_count integer;
BEGIN
    -- Check table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'copilot_internal'
        AND table_name = 'model_pricing'
    ) INTO table_exists;

    IF NOT table_exists THEN
        RAISE EXCEPTION 'Migration failed: model_pricing table not created';
    END IF;

    -- Check pricing data seeded
    SELECT COUNT(*) INTO pricing_count
    FROM copilot_internal.model_pricing;

    SELECT COUNT(*) INTO openai_count
    FROM copilot_internal.model_pricing
    WHERE provider = 'openai';

    SELECT COUNT(*) INTO anthropic_count
    FROM copilot_internal.model_pricing
    WHERE provider = 'anthropic';

    IF pricing_count < 10 THEN
        RAISE WARNING 'Expected at least 10 pricing records, found %', pricing_count;
    END IF;

    RAISE NOTICE '=== LLM Model Pricing Migration completed successfully ===';
    RAISE NOTICE '  ✓ model_pricing table created';
    RAISE NOTICE '  ✓ Indexes created (3)';
    RAISE NOTICE '  ✓ Helper functions created (2)';
    RAISE NOTICE '  ✓ RLS policies configured';
    RAISE NOTICE '  ✓ % total pricing records seeded', pricing_count;
    RAISE NOTICE '    - OpenAI: % models', openai_count;
    RAISE NOTICE '    - Anthropic: % models', anthropic_count;
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT:';
    RAISE NOTICE '  ⚠️  Update pricing with current vendor rates before production!';
    RAISE NOTICE '  ⚠️  Pricing data is from December 2024 and may be outdated.';
    RAISE NOTICE '';
    RAISE NOTICE 'Test pricing lookup:';
    RAISE NOTICE '  SELECT * FROM copilot_internal.get_current_model_pricing(''openai'', ''gpt-4'');';
    RAISE NOTICE '';
    RAISE NOTICE 'Test cost calculation:';
    RAISE NOTICE '  SELECT * FROM copilot_internal.calculate_llm_cost(''openai'', ''gpt-4'', 1000, 500);';
END $$;
