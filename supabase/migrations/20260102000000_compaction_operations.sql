-- Migration: Compaction Operations Tracking
-- Stores historical compaction operation records for analytics

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS copilot_internal;

-- Create compaction_operations table
CREATE TABLE IF NOT EXISTS copilot_internal.compaction_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp timestamptz NOT NULL DEFAULT now(),

    -- Context
    conversation_id uuid,
    path_id uuid,
    tenant_id uuid,
    user_id uuid,

    -- Strategy info
    strategy text NOT NULL,
    triggered_by text NOT NULL DEFAULT 'manual', -- 'auto' | 'manual'

    -- Metrics
    tokens_before integer NOT NULL,
    tokens_after integer NOT NULL,
    tokens_saved integer GENERATED ALWAYS AS (tokens_before - tokens_after) STORED,
    messages_before integer NOT NULL,
    messages_after integer NOT NULL,
    messages_removed integer GENERATED ALWAYS AS (messages_before - messages_after) STORED,
    messages_summarized integer NOT NULL DEFAULT 0,
    pinned_preserved integer NOT NULL DEFAULT 0,

    -- Performance
    duration_ms integer,
    used_llm boolean NOT NULL DEFAULT false,
    cost_usd numeric(12,6) DEFAULT 0,

    -- Calculated
    compression_ratio numeric(5,4) GENERATED ALWAYS AS (
        CASE WHEN tokens_before > 0 THEN tokens_after::numeric / tokens_before::numeric ELSE 1 END
    ) STORED,

    -- Status
    success boolean NOT NULL DEFAULT true,
    error text,

    -- Metadata (JSON for extensibility)
    metadata jsonb DEFAULT '{}'::jsonb
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_compaction_ops_timestamp
    ON copilot_internal.compaction_operations(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_compaction_ops_strategy
    ON copilot_internal.compaction_operations(strategy);

CREATE INDEX IF NOT EXISTS idx_compaction_ops_tenant
    ON copilot_internal.compaction_operations(tenant_id)
    WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compaction_ops_conversation
    ON copilot_internal.compaction_operations(conversation_id)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compaction_ops_success
    ON copilot_internal.compaction_operations(success);

-- Composite index for time-range + strategy queries
CREATE INDEX IF NOT EXISTS idx_compaction_ops_time_strategy
    ON copilot_internal.compaction_operations(timestamp DESC, strategy);

-- Add comments
COMMENT ON TABLE copilot_internal.compaction_operations IS
    'Stores historical records of conversation compaction operations for analytics and monitoring';

COMMENT ON COLUMN copilot_internal.compaction_operations.strategy IS
    'Compaction strategy used: none, sliding_window, semantic, hybrid, minimal, moderate, aggressive';

COMMENT ON COLUMN copilot_internal.compaction_operations.triggered_by IS
    'How the compaction was triggered: auto (background job) or manual (user/API request)';

COMMENT ON COLUMN copilot_internal.compaction_operations.compression_ratio IS
    'Ratio of tokens_after/tokens_before. Lower is better compression (0.5 = 50% of original size)';

-- Function to record a compaction operation
CREATE OR REPLACE FUNCTION copilot_internal.record_compaction_operation(
    p_conversation_id uuid DEFAULT NULL,
    p_path_id uuid DEFAULT NULL,
    p_tenant_id uuid DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_strategy text DEFAULT 'none',
    p_triggered_by text DEFAULT 'manual',
    p_tokens_before integer DEFAULT 0,
    p_tokens_after integer DEFAULT 0,
    p_messages_before integer DEFAULT 0,
    p_messages_after integer DEFAULT 0,
    p_messages_summarized integer DEFAULT 0,
    p_pinned_preserved integer DEFAULT 0,
    p_duration_ms integer DEFAULT NULL,
    p_used_llm boolean DEFAULT false,
    p_cost_usd numeric DEFAULT 0,
    p_success boolean DEFAULT true,
    p_error text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO copilot_internal.compaction_operations (
        conversation_id, path_id, tenant_id, user_id,
        strategy, triggered_by,
        tokens_before, tokens_after,
        messages_before, messages_after,
        messages_summarized, pinned_preserved,
        duration_ms, used_llm, cost_usd,
        success, error, metadata
    ) VALUES (
        p_conversation_id, p_path_id, p_tenant_id, p_user_id,
        p_strategy, p_triggered_by,
        p_tokens_before, p_tokens_after,
        p_messages_before, p_messages_after,
        p_messages_summarized, p_pinned_preserved,
        p_duration_ms, p_used_llm, p_cost_usd,
        p_success, p_error, p_metadata
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get aggregated compaction metrics
CREATE OR REPLACE FUNCTION copilot_internal.get_compaction_metrics(
    p_start_time timestamptz DEFAULT NULL,
    p_end_time timestamptz DEFAULT now(),
    p_tenant_id uuid DEFAULT NULL
) RETURNS TABLE (
    total_operations bigint,
    successful_operations bigint,
    failed_operations bigint,
    total_tokens_saved bigint,
    total_messages_removed bigint,
    total_messages_summarized bigint,
    avg_compression_ratio numeric,
    avg_duration_ms numeric,
    total_cost_usd numeric,
    operations_using_llm bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint as total_operations,
        COUNT(*) FILTER (WHERE success = true)::bigint as successful_operations,
        COUNT(*) FILTER (WHERE success = false)::bigint as failed_operations,
        COALESCE(SUM(tokens_saved), 0)::bigint as total_tokens_saved,
        COALESCE(SUM(messages_removed), 0)::bigint as total_messages_removed,
        COALESCE(SUM(messages_summarized), 0)::bigint as total_messages_summarized,
        COALESCE(AVG(compression_ratio), 1)::numeric as avg_compression_ratio,
        COALESCE(AVG(duration_ms), 0)::numeric as avg_duration_ms,
        COALESCE(SUM(cost_usd), 0)::numeric as total_cost_usd,
        COUNT(*) FILTER (WHERE used_llm = true)::bigint as operations_using_llm
    FROM copilot_internal.compaction_operations
    WHERE (p_start_time IS NULL OR timestamp >= p_start_time)
      AND (p_end_time IS NULL OR timestamp <= p_end_time)
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
END;
$$ LANGUAGE plpgsql;

-- Function to get strategy breakdown
CREATE OR REPLACE FUNCTION copilot_internal.get_compaction_strategy_breakdown(
    p_start_time timestamptz DEFAULT NULL,
    p_end_time timestamptz DEFAULT now(),
    p_tenant_id uuid DEFAULT NULL
) RETURNS TABLE (
    strategy text,
    operations bigint,
    tokens_saved bigint,
    avg_compression_ratio numeric,
    avg_duration_ms numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        co.strategy,
        COUNT(*)::bigint as operations,
        COALESCE(SUM(co.tokens_saved), 0)::bigint as tokens_saved,
        COALESCE(AVG(co.compression_ratio), 1)::numeric as avg_compression_ratio,
        COALESCE(AVG(co.duration_ms), 0)::numeric as avg_duration_ms
    FROM copilot_internal.compaction_operations co
    WHERE (p_start_time IS NULL OR co.timestamp >= p_start_time)
      AND (p_end_time IS NULL OR co.timestamp <= p_end_time)
      AND (p_tenant_id IS NULL OR co.tenant_id = p_tenant_id)
      AND co.success = true
    GROUP BY co.strategy
    ORDER BY operations DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent operations
CREATE OR REPLACE FUNCTION copilot_internal.get_recent_compaction_operations(
    p_limit integer DEFAULT 10,
    p_tenant_id uuid DEFAULT NULL
) RETURNS TABLE (
    id uuid,
    conversation_id uuid,
    timestamp timestamptz,
    strategy text,
    tokens_saved integer,
    compression_ratio numeric,
    duration_ms integer,
    success boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        co.id,
        co.conversation_id,
        co.timestamp,
        co.strategy,
        co.tokens_saved,
        co.compression_ratio,
        co.duration_ms,
        co.success
    FROM copilot_internal.compaction_operations co
    WHERE (p_tenant_id IS NULL OR co.tenant_id = p_tenant_id)
    ORDER BY co.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
