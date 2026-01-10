-- ========================================
-- Conversation Configuration System
-- ========================================
-- This migration creates the conversation_configs table for storing
-- conversation compaction and summarization settings at global,
-- tenant, and user levels.

-- Create conversation_configs table
CREATE TABLE IF NOT EXISTS copilot_internal.conversation_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid, -- NULL for global and tenant-level configs

    config_level text NOT NULL CHECK (config_level IN ('global', 'tenant', 'user')),

    -- Merge compression settings
    merge_compression_strategy text NOT NULL DEFAULT 'moderate' CHECK (merge_compression_strategy IN ('none', 'minimal', 'moderate', 'aggressive')),
    merge_max_messages integer,
    merge_preserve_pinned boolean,

    -- Path compression settings
    path_compression_strategy text NOT NULL DEFAULT 'sliding_window' CHECK (path_compression_strategy IN ('none', 'sliding_window', 'semantic', 'hybrid')),
    path_max_messages integer,
    path_sliding_window_size integer,
    path_compression_threshold numeric,

    -- General settings
    auto_compact_enabled boolean,
    compaction_interval_minutes integer,

    -- Metadata
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,

    -- Unique constraint for config level + scope
    UNIQUE(config_level, tenant_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversation_configs_tenant
    ON copilot_internal.conversation_configs(tenant_id)
    WHERE config_level IN ('tenant', 'user');

CREATE INDEX IF NOT EXISTS idx_conversation_configs_user
    ON copilot_internal.conversation_configs(tenant_id, user_id)
    WHERE config_level = 'user';

CREATE INDEX IF NOT EXISTS idx_conversation_configs_global
    ON copilot_internal.conversation_configs(config_level)
    WHERE config_level = 'global';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION copilot_internal.update_conversation_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_configs_timestamp
    BEFORE UPDATE ON copilot_internal.conversation_configs
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_conversation_config_timestamp();

-- ========================================
-- Row Level Security (RLS)
-- ========================================

ALTER TABLE copilot_internal.conversation_configs ENABLE ROW LEVEL SECURITY;

-- Policy: service_role can do everything
CREATE POLICY conversation_configs_service_role_all
    ON copilot_internal.conversation_configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Authenticated users can read configs for their tenant
CREATE POLICY conversation_configs_select
    ON copilot_internal.conversation_configs
    FOR SELECT
    TO authenticated
    USING (
        config_level = 'global'
        OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        OR (config_level = 'user' AND user_id = auth.uid())
    );

-- Policy: Authenticated users can update their own user-level configs
CREATE POLICY conversation_configs_update_user
    ON copilot_internal.conversation_configs
    FOR UPDATE
    TO authenticated
    USING (
        config_level = 'user'
        AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        AND user_id = auth.uid()
    )
    WITH CHECK (
        config_level = 'user'
        AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        AND user_id = auth.uid()
    );

-- Policy: Authenticated users can insert their own user-level configs
CREATE POLICY conversation_configs_insert_user
    ON copilot_internal.conversation_configs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        config_level = 'user'
        AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        AND user_id = auth.uid()
    );

-- Policy: Authenticated users can delete their own user-level configs
CREATE POLICY conversation_configs_delete_user
    ON copilot_internal.conversation_configs
    FOR DELETE
    TO authenticated
    USING (
        config_level = 'user'
        AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        AND user_id = auth.uid()
    );

-- ========================================
-- Helper Functions
-- ========================================

-- Function to get effective config for a user/tenant
CREATE OR REPLACE FUNCTION copilot_internal.get_effective_conversation_config(
    p_tenant_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config jsonb;
    v_global jsonb;
    v_tenant jsonb;
    v_user jsonb;
BEGIN
    -- Get global config
    SELECT to_jsonb(c.*) INTO v_global
    FROM copilot_internal.conversation_configs c
    WHERE c.config_level = 'global'
    LIMIT 1;

    -- Get tenant config
    SELECT to_jsonb(c.*) INTO v_tenant
    FROM copilot_internal.conversation_configs c
    WHERE c.config_level = 'tenant' AND c.tenant_id = p_tenant_id
    LIMIT 1;

    -- Get user config if user_id provided
    IF p_user_id IS NOT NULL THEN
        SELECT to_jsonb(c.*) INTO v_user
        FROM copilot_internal.conversation_configs c
        WHERE c.config_level = 'user'
          AND c.tenant_id = p_tenant_id
          AND c.user_id = p_user_id
        LIMIT 1;
    END IF;

    -- Merge configs: global -> tenant -> user
    v_config := COALESCE(v_global, '{}'::jsonb);

    IF v_tenant IS NOT NULL THEN
        v_config := v_config || v_tenant;
    END IF;

    IF v_user IS NOT NULL THEN
        v_config := v_config || v_user;
    END IF;

    RETURN v_config;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.conversation_configs TO authenticated;
GRANT EXECUTE ON FUNCTION copilot_internal.get_effective_conversation_config TO authenticated;

COMMENT ON TABLE copilot_internal.conversation_configs IS 'Configuration for conversation compaction and summarization at global, tenant, and user levels';
COMMENT ON COLUMN copilot_internal.conversation_configs.config_level IS 'Configuration scope: global, tenant, or user';
COMMENT ON COLUMN copilot_internal.conversation_configs.merge_compression_strategy IS 'Compression strategy for branch merges: none, minimal, moderate, aggressive';
COMMENT ON COLUMN copilot_internal.conversation_configs.path_compression_strategy IS 'Compression strategy for active paths: none, sliding_window, semantic, hybrid';
COMMENT ON FUNCTION copilot_internal.get_effective_conversation_config IS 'Get effective configuration merging global, tenant, and user settings';
