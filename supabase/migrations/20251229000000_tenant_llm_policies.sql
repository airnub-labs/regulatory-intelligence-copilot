-- ========================================
-- Tenant LLM Policies
-- ========================================
-- Stores LLM routing policies per tenant for multi-instance deployments.
-- Policies control which providers/models are used for different tasks.

-- Create tenant_llm_policies table
CREATE TABLE IF NOT EXISTS copilot_internal.tenant_llm_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE,

    -- Default routing
    default_model text NOT NULL,
    default_provider text NOT NULL,

    -- Egress controls
    allow_remote_egress boolean NOT NULL DEFAULT true,
    egress_mode text CHECK (egress_mode IN ('off', 'audit', 'enforce')),
    allow_off_mode boolean DEFAULT false,

    -- Task-specific overrides (JSONB array)
    tasks jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Per-user overrides (JSONB object keyed by userId)
    user_policies jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Metadata
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,

    -- Constraints
    CONSTRAINT valid_tasks CHECK (jsonb_typeof(tasks) = 'array'),
    CONSTRAINT valid_user_policies CHECK (jsonb_typeof(user_policies) = 'object')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_llm_policies_tenant
    ON copilot_internal.tenant_llm_policies(tenant_id);

-- Updated_at trigger
CREATE TRIGGER update_tenant_llm_policies_timestamp
    BEFORE UPDATE ON copilot_internal.tenant_llm_policies
    FOR EACH ROW
    EXECUTE FUNCTION copilot_internal.update_conversation_config_timestamp();

-- ========================================
-- Row Level Security
-- ========================================

ALTER TABLE copilot_internal.tenant_llm_policies ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY tenant_llm_policies_service_role_all
    ON copilot_internal.tenant_llm_policies
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read their tenant's policy
CREATE POLICY tenant_llm_policies_select
    ON copilot_internal.tenant_llm_policies
    FOR SELECT
    TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Grant permissions
GRANT SELECT ON copilot_internal.tenant_llm_policies TO authenticated;

COMMENT ON TABLE copilot_internal.tenant_llm_policies IS 'LLM routing policies per tenant';
COMMENT ON COLUMN copilot_internal.tenant_llm_policies.tasks IS 'Array of task-specific model/provider overrides';
COMMENT ON COLUMN copilot_internal.tenant_llm_policies.user_policies IS 'Per-user egress mode overrides';
