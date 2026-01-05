-- ============================================================================
-- MIGRATION: Cost Estimation Tables
-- ============================================================================
-- This migration creates tables for storing pre-calculated cost estimates used
-- for quota checks BEFORE operations (as opposed to calculating costs AFTER).
--
-- Purpose:
-- - Replace ALL hardcoded cost estimates with database-backed estimates
-- - Enable transparent caching of cost estimates
-- - Support graceful degradation: no data is better than inaccurate data
--
-- Tables created:
-- 1. llm_cost_estimates - Pre-calculated estimates for common LLM operations
-- 2. e2b_cost_estimates - Pre-calculated estimates for common E2B scenarios
--
-- Integration:
-- - executionContextManager.ts - E2B quota check before sandbox creation
-- - chat/route.ts - LLM quota check before request processing
-- - CostEstimationService - Transparently cached lookups
--
-- References:
-- - COST_ESTIMATION_SERVICE_PLAN.md
-- - Gap Analysis Review (hardcoded cost elimination)
-- - packages/reg-intel-observability/src/costEstimation/
-- ============================================================================

-- =============================================================================
-- PART 1: LLM Cost Estimates Table
-- =============================================================================
-- Pre-calculated cost estimates for common LLM operation patterns.
-- These are conservative estimates used for quota checks BEFORE requests.

CREATE TABLE IF NOT EXISTS copilot_internal.llm_cost_estimates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Model identification
    provider text NOT NULL,  -- 'openai', 'anthropic', 'google', etc.
    model text NOT NULL,     -- 'gpt-4', 'claude-3-sonnet-20240229', etc.

    -- Operation type
    operation_type text NOT NULL,  -- 'chat', 'completion', 'embedding', 'tool_use'

    -- Estimate configuration
    estimated_cost_usd numeric(10,6) NOT NULL CHECK (estimated_cost_usd >= 0),
    confidence_level text NOT NULL CHECK (confidence_level IN ('conservative', 'typical', 'optimistic')),

    -- Documentation
    description text,
    assumptions text,  -- e.g., "Assumes 1000 input + 500 output tokens"

    -- Effective date range
    effective_date timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,  -- NULL = current/active estimate

    -- Metadata
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint: one estimate per provider+model+operation+confidence
    CONSTRAINT unique_llm_cost_estimate UNIQUE (provider, model, operation_type, confidence_level)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_llm_cost_estimates_lookup
    ON copilot_internal.llm_cost_estimates(provider, model, operation_type, confidence_level, effective_date DESC);

COMMENT ON TABLE copilot_internal.llm_cost_estimates IS 'Pre-calculated LLM cost estimates for quota checks before requests';
COMMENT ON COLUMN copilot_internal.llm_cost_estimates.operation_type IS 'Operation pattern: chat, completion, embedding, tool_use';
COMMENT ON COLUMN copilot_internal.llm_cost_estimates.confidence_level IS 'Estimate confidence: conservative (over-estimate), typical, optimistic (under-estimate)';
COMMENT ON COLUMN copilot_internal.llm_cost_estimates.assumptions IS 'Documentation of assumptions (e.g., expected token counts)';

-- =============================================================================
-- PART 2: E2B Cost Estimates Table
-- =============================================================================
-- Pre-calculated cost estimates for common E2B sandbox operation patterns.
-- These are conservative estimates used for quota checks BEFORE sandbox creation.

CREATE TABLE IF NOT EXISTS copilot_internal.e2b_cost_estimates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Sandbox configuration
    tier text NOT NULL CHECK (tier IN ('standard', 'gpu', 'high-memory', 'high-cpu')),
    region text NOT NULL DEFAULT 'us-east-1',

    -- Operation type
    operation_type text NOT NULL,  -- 'standard_session', 'extended_session', 'quick_task', 'long_running'

    -- Expected duration (used for matching)
    expected_duration_seconds integer NOT NULL CHECK (expected_duration_seconds > 0),

    -- Estimate configuration
    estimated_cost_usd numeric(10,6) NOT NULL CHECK (estimated_cost_usd >= 0),
    confidence_level text NOT NULL CHECK (confidence_level IN ('conservative', 'typical', 'optimistic')),

    -- Documentation
    description text,
    assumptions text,  -- e.g., "Based on $0.0001/sec for standard tier"

    -- Effective date range
    effective_date timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,  -- NULL = current/active estimate

    -- Metadata
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint: one estimate per tier+region+operation+confidence
    CONSTRAINT unique_e2b_cost_estimate UNIQUE (tier, region, operation_type, confidence_level)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_e2b_cost_estimates_lookup
    ON copilot_internal.e2b_cost_estimates(tier, region, operation_type, confidence_level, effective_date DESC);

COMMENT ON TABLE copilot_internal.e2b_cost_estimates IS 'Pre-calculated E2B cost estimates for quota checks before sandbox creation';
COMMENT ON COLUMN copilot_internal.e2b_cost_estimates.operation_type IS 'Operation pattern: standard_session, extended_session, quick_task, long_running';
COMMENT ON COLUMN copilot_internal.e2b_cost_estimates.expected_duration_seconds IS 'Expected operation duration for matching estimates';
COMMENT ON COLUMN copilot_internal.e2b_cost_estimates.confidence_level IS 'Estimate confidence: conservative (over-estimate), typical, optimistic (under-estimate)';

-- =============================================================================
-- PART 3: Seed Initial Cost Estimate Data
-- =============================================================================
-- Conservative estimates based on common usage patterns
-- ⚠️  These are CONSERVATIVE estimates to avoid quota overruns
-- ⚠️  Update with actual usage data over time for better accuracy

-- LLM Cost Estimates - Anthropic Claude
INSERT INTO copilot_internal.llm_cost_estimates
    (provider, model, operation_type, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
    -- Claude 3 Sonnet (most common)
    ('anthropic', 'claude-3-sonnet-20240229', 'chat', 0.05, 'conservative',
     'Conservative estimate for typical chat request',
     'Assumes ~1500 input tokens + 500 output tokens at $3/$15 per million'),

    ('anthropic', 'claude-3-sonnet-20240229', 'chat', 0.03, 'typical',
     'Typical estimate for chat request',
     'Assumes ~1000 input tokens + 300 output tokens'),

    ('anthropic', 'claude-3-sonnet-20240229', 'tool_use', 0.08, 'conservative',
     'Conservative estimate for chat with tool use',
     'Assumes higher token usage for tool definitions and responses'),

    -- Claude 3.5 Sonnet
    ('anthropic', 'claude-3-5-sonnet-20240620', 'chat', 0.05, 'conservative',
     'Conservative estimate for Claude 3.5 Sonnet chat',
     'Same pricing as Claude 3 Sonnet'),

    -- Claude 3 Opus (most expensive)
    ('anthropic', 'claude-3-opus-20240229', 'chat', 0.12, 'conservative',
     'Conservative estimate for Opus chat',
     'Assumes ~1500 input tokens + 500 output tokens at $15/$75 per million'),

    ('anthropic', 'claude-3-opus-20240229', 'chat', 0.08, 'typical',
     'Typical estimate for Opus chat',
     'Assumes ~1000 input tokens + 300 output tokens'),

    -- Claude 3 Haiku (fastest/cheapest)
    ('anthropic', 'claude-3-haiku-20240307', 'chat', 0.01, 'conservative',
     'Conservative estimate for Haiku chat',
     'Assumes ~1500 input tokens + 500 output tokens at $0.25/$1.25 per million');

-- LLM Cost Estimates - OpenAI
INSERT INTO copilot_internal.llm_cost_estimates
    (provider, model, operation_type, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
    -- GPT-4 Turbo
    ('openai', 'gpt-4-turbo', 'chat', 0.04, 'conservative',
     'Conservative estimate for GPT-4 Turbo chat',
     'Assumes ~1500 input tokens + 500 output tokens at $10/$30 per million'),

    ('openai', 'gpt-4-turbo', 'chat', 0.025, 'typical',
     'Typical estimate for GPT-4 Turbo chat',
     'Assumes ~1000 input tokens + 300 output tokens'),

    -- GPT-4o
    ('openai', 'gpt-4o', 'chat', 0.03, 'conservative',
     'Conservative estimate for GPT-4o chat',
     'Assumes ~1500 input tokens + 500 output tokens at $5/$15 per million'),

    -- GPT-4o Mini
    ('openai', 'gpt-4o-mini', 'chat', 0.005, 'conservative',
     'Conservative estimate for GPT-4o Mini chat',
     'Assumes ~1500 input tokens + 500 output tokens at $0.15/$0.6 per million'),

    -- GPT-3.5 Turbo
    ('openai', 'gpt-3.5-turbo', 'chat', 0.003, 'conservative',
     'Conservative estimate for GPT-3.5 Turbo chat',
     'Assumes ~1500 input tokens + 500 output tokens at $0.5/$1.5 per million');

-- E2B Cost Estimates - Standard Tier
INSERT INTO copilot_internal.e2b_cost_estimates
    (tier, region, operation_type, expected_duration_seconds, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
    -- Standard tier sessions
    ('standard', 'us-east-1', 'quick_task', 60, 0.006, 'conservative',
     '1-minute quick task',
     'Based on $0.0001/sec = $0.006/minute'),

    ('standard', 'us-east-1', 'standard_session', 300, 0.03, 'conservative',
     '5-minute standard session',
     'Based on $0.0001/sec = $0.03/5min'),

    ('standard', 'us-east-1', 'standard_session', 300, 0.025, 'typical',
     '5-minute standard session (typical)',
     'Typical usage pattern'),

    ('standard', 'us-east-1', 'extended_session', 900, 0.09, 'conservative',
     '15-minute extended session',
     'Based on $0.0001/sec = $0.09/15min'),

    ('standard', 'us-east-1', 'long_running', 1800, 0.18, 'conservative',
     '30-minute long-running task',
     'Based on $0.0001/sec = $0.18/30min');

-- E2B Cost Estimates - GPU Tier
INSERT INTO copilot_internal.e2b_cost_estimates
    (tier, region, operation_type, expected_duration_seconds, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
    ('gpu', 'us-east-1', 'quick_task', 60, 0.06, 'conservative',
     '1-minute GPU task',
     'Based on $0.001/sec = $0.06/minute'),

    ('gpu', 'us-east-1', 'standard_session', 300, 0.30, 'conservative',
     '5-minute GPU session',
     'Based on $0.001/sec = $0.30/5min');

-- E2B Cost Estimates - High Memory Tier
INSERT INTO copilot_internal.e2b_cost_estimates
    (tier, region, operation_type, expected_duration_seconds, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
    ('high-memory', 'us-east-1', 'standard_session', 300, 0.15, 'conservative',
     '5-minute high-memory session',
     'Based on $0.0005/sec = $0.15/5min');

-- E2B Cost Estimates - High CPU Tier
INSERT INTO copilot_internal.e2b_cost_estimates
    (tier, region, operation_type, expected_duration_seconds, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
    ('high-cpu', 'us-east-1', 'standard_session', 300, 0.09, 'conservative',
     '5-minute high-CPU session',
     'Based on $0.0003/sec = $0.09/5min');

-- =============================================================================
-- PART 4: Helper Functions
-- =============================================================================

-- Function to get current LLM cost estimate
CREATE OR REPLACE FUNCTION copilot_internal.get_llm_cost_estimate(
    p_provider text,
    p_model text,
    p_operation_type text DEFAULT 'chat',
    p_confidence_level text DEFAULT 'conservative'
) RETURNS numeric AS $$
DECLARE
    v_estimate numeric;
BEGIN
    SELECT estimated_cost_usd INTO v_estimate
    FROM copilot_internal.llm_cost_estimates
    WHERE provider = LOWER(p_provider)
      AND model = LOWER(p_model)
      AND operation_type = p_operation_type
      AND confidence_level = p_confidence_level
      AND effective_date <= now()
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY effective_date DESC
    LIMIT 1;

    RETURN v_estimate;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION copilot_internal.get_llm_cost_estimate TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_llm_cost_estimate TO authenticated;

COMMENT ON FUNCTION copilot_internal.get_llm_cost_estimate IS 'Get current LLM cost estimate for quota checks';

-- Function to get current E2B cost estimate
CREATE OR REPLACE FUNCTION copilot_internal.get_e2b_cost_estimate(
    p_tier text,
    p_region text DEFAULT 'us-east-1',
    p_operation_type text DEFAULT 'standard_session',
    p_confidence_level text DEFAULT 'conservative'
) RETURNS numeric AS $$
DECLARE
    v_estimate numeric;
BEGIN
    SELECT estimated_cost_usd INTO v_estimate
    FROM copilot_internal.e2b_cost_estimates
    WHERE tier = LOWER(p_tier)
      AND region = LOWER(p_region)
      AND operation_type = p_operation_type
      AND confidence_level = p_confidence_level
      AND effective_date <= now()
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY effective_date DESC
    LIMIT 1;

    RETURN v_estimate;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION copilot_internal.get_e2b_cost_estimate TO service_role;
GRANT EXECUTE ON FUNCTION copilot_internal.get_e2b_cost_estimate TO authenticated;

COMMENT ON FUNCTION copilot_internal.get_e2b_cost_estimate IS 'Get current E2B cost estimate for quota checks';

-- =============================================================================
-- PART 5: Row Level Security
-- =============================================================================

ALTER TABLE copilot_internal.llm_cost_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.e2b_cost_estimates ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY llm_cost_estimates_service_role_all
    ON copilot_internal.llm_cost_estimates
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY e2b_cost_estimates_service_role_all
    ON copilot_internal.e2b_cost_estimates
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read estimates (needed for quota checks)
CREATE POLICY llm_cost_estimates_authenticated_read
    ON copilot_internal.llm_cost_estimates
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY e2b_cost_estimates_authenticated_read
    ON copilot_internal.e2b_cost_estimates
    FOR SELECT
    TO authenticated
    USING (true);

-- =============================================================================
-- PART 6: Grants
-- =============================================================================

GRANT SELECT ON copilot_internal.llm_cost_estimates TO authenticated;
GRANT ALL ON copilot_internal.llm_cost_estimates TO service_role;

GRANT SELECT ON copilot_internal.e2b_cost_estimates TO authenticated;
GRANT ALL ON copilot_internal.e2b_cost_estimates TO service_role;

-- =============================================================================
-- PART 7: Verification
-- =============================================================================

DO $$
DECLARE
    llm_estimates_count integer;
    e2b_estimates_count integer;
    test_llm_estimate numeric;
    test_e2b_estimate numeric;
BEGIN
    -- Check LLM estimates table
    SELECT COUNT(*) INTO llm_estimates_count
    FROM copilot_internal.llm_cost_estimates;

    IF llm_estimates_count < 5 THEN
        RAISE WARNING 'Expected at least 5 LLM cost estimates, found %', llm_estimates_count;
    END IF;

    -- Check E2B estimates table
    SELECT COUNT(*) INTO e2b_estimates_count
    FROM copilot_internal.e2b_cost_estimates;

    IF e2b_estimates_count < 5 THEN
        RAISE WARNING 'Expected at least 5 E2B cost estimates, found %', e2b_estimates_count;
    END IF;

    -- Test helper functions
    SELECT copilot_internal.get_llm_cost_estimate('anthropic', 'claude-3-sonnet-20240229', 'chat', 'conservative')
    INTO test_llm_estimate;

    SELECT copilot_internal.get_e2b_cost_estimate('standard', 'us-east-1', 'standard_session', 'conservative')
    INTO test_e2b_estimate;

    RAISE NOTICE '=== Cost Estimates Migration completed successfully ===';
    RAISE NOTICE '  ✓ llm_cost_estimates table created';
    RAISE NOTICE '  ✓ e2b_cost_estimates table created';
    RAISE NOTICE '  ✓ Indexes created';
    RAISE NOTICE '  ✓ Helper functions created (2)';
    RAISE NOTICE '  ✓ RLS policies configured';
    RAISE NOTICE '  ✓ % LLM cost estimates seeded', llm_estimates_count;
    RAISE NOTICE '  ✓ % E2B cost estimates seeded', e2b_estimates_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Test estimate lookups:';
    RAISE NOTICE '  LLM (Claude 3 Sonnet chat): $%', test_llm_estimate;
    RAISE NOTICE '  E2B (Standard 5min session): $%', test_e2b_estimate;
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT:';
    RAISE NOTICE '  ⚠️  These are CONSERVATIVE estimates to avoid quota overruns';
    RAISE NOTICE '  ⚠️  Update with actual usage data over time for better accuracy';
    RAISE NOTICE '  ⚠️  Use CostEstimationService with transparent caching for performance';
END $$;
