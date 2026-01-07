-- Fix missing service_role permissions on tenant_llm_policies table
--
-- The table has an RLS policy for service_role, but is missing the underlying
-- table-level permissions. RLS policies alone don't grant access - the role
-- must first have table permissions.

-- Grant full access to service_role (needed for policy store operations)
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_internal.tenant_llm_policies TO service_role;

-- Note: The RLS policy 'tenant_llm_policies_service_role_all' already exists
-- from migration 20260105000005_tenant_llm_policies.sql, so we don't recreate it.

COMMENT ON TABLE copilot_internal.tenant_llm_policies IS
    'LLM routing policies per tenant. Service role has full access for policy store initialization.';
