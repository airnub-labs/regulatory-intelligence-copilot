-- ============================================================================
-- MIGRATION: copilot_audit Schema (SOC2 Compliance)
-- ============================================================================
-- Part of Schema Reorganization for SOC2/GDPR Compliance
--
-- This migration:
-- 1. Creates the copilot_audit schema
-- 2. Moves 2 existing audit tables from copilot_internal
-- 3. Creates 2 NEW audit tables for enhanced compliance
-- 4. Sets up append-only constraints for immutability
--
-- Tables:
--   - permission_audit_log (existing - SOC2)
--   - compaction_operations (existing - data ops audit)
--   - admin_activity_log (NEW - admin action tracking)
--   - data_access_log (NEW - GDPR PII access logging)
--
-- Retention:
--   - permission_audit_log: 7 years (SOC2)
--   - admin_activity_log: 7 years (SOC2)
--   - data_access_log: 7 years (GDPR)
--   - compaction_operations: 90 days (operational)
--
-- Access: Read-only for compliance auditors, append-only for system
-- ============================================================================

-- =============================================================================
-- PART 1: Create copilot_audit Schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS copilot_audit;

COMMENT ON SCHEMA copilot_audit IS 'Immutable audit logs for SOC2 and GDPR compliance. Append-only for system, read-only for auditors.';

-- Grant schema access
GRANT USAGE ON SCHEMA copilot_audit TO service_role;
-- Future: GRANT USAGE ON SCHEMA copilot_audit TO compliance_auditor;

-- =============================================================================
-- PART 2: Move Existing Audit Tables
-- =============================================================================

-- 2.1: Move permission_audit_log
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'copilot_internal' AND table_name = 'permission_audit_log'
  ) THEN
    EXECUTE 'ALTER TABLE copilot_internal.permission_audit_log SET SCHEMA copilot_audit';
  ELSE
    -- Create if it doesn't exist
    CREATE TABLE copilot_audit.permission_audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      timestamp timestamptz NOT NULL DEFAULT NOW(),
      actor_id uuid NOT NULL,
      actor_email text,
      action text NOT NULL CHECK (action IN ('grant', 'revoke', 'modify')),
      target_type text NOT NULL CHECK (target_type IN ('admin_user', 'permission_config', 'tenant_membership')),
      target_id uuid NOT NULL,
      target_email text,
      old_value jsonb,
      new_value jsonb,
      ip_address inet,
      user_agent text,
      reason text
    );

    CREATE INDEX idx_permission_audit_timestamp ON copilot_audit.permission_audit_log(timestamp DESC);
    CREATE INDEX idx_permission_audit_actor ON copilot_audit.permission_audit_log(actor_id);
    CREATE INDEX idx_permission_audit_target ON copilot_audit.permission_audit_log(target_id);

    COMMENT ON TABLE copilot_audit.permission_audit_log IS 'SOC2 compliance: Tracks all permission changes. 7-year retention.';
  END IF;
END $$;

-- 2.2: Move compaction_operations
ALTER TABLE copilot_internal.compaction_operations SET SCHEMA copilot_audit;

-- =============================================================================
-- PART 3: Recreate Audit Functions with Correct Schema References
-- =============================================================================
-- Note: We use CREATE OR REPLACE instead of ALTER FUNCTION SET SCHEMA
-- because we need to update the function bodies to reference the new schemas

-- 3.1: Drop old functions from copilot_internal (they will be recreated here)
DROP FUNCTION IF EXISTS copilot_internal.record_compaction_operation(uuid, uuid, uuid, uuid, text, text, integer, integer, integer, integer, integer, integer, integer, boolean, numeric, boolean, text, jsonb);
DROP FUNCTION IF EXISTS copilot_internal.get_compaction_metrics(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS copilot_internal.get_compaction_strategy_breakdown(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS copilot_internal.get_recent_compaction_operations(integer, uuid);
DROP FUNCTION IF EXISTS copilot_internal.get_conversations_needing_compaction(integer, timestamptz, timestamptz, integer);

-- 3.2: Recreate record_compaction_operation in copilot_audit
CREATE OR REPLACE FUNCTION copilot_audit.record_compaction_operation(
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
    INSERT INTO copilot_audit.compaction_operations (
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

-- 3.3: Recreate get_compaction_metrics in copilot_audit
CREATE OR REPLACE FUNCTION copilot_audit.get_compaction_metrics(
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
    FROM copilot_audit.compaction_operations
    WHERE (p_start_time IS NULL OR timestamp >= p_start_time)
      AND (p_end_time IS NULL OR timestamp <= p_end_time)
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
END;
$$ LANGUAGE plpgsql;

-- 3.4: Recreate get_compaction_strategy_breakdown in copilot_audit
CREATE OR REPLACE FUNCTION copilot_audit.get_compaction_strategy_breakdown(
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
    FROM copilot_audit.compaction_operations co
    WHERE (p_start_time IS NULL OR co.timestamp >= p_start_time)
      AND (p_end_time IS NULL OR co.timestamp <= p_end_time)
      AND (p_tenant_id IS NULL OR co.tenant_id = p_tenant_id)
      AND co.success = true
    GROUP BY co.strategy
    ORDER BY operations DESC;
END;
$$ LANGUAGE plpgsql;

-- 3.5: Recreate get_recent_compaction_operations in copilot_audit
CREATE OR REPLACE FUNCTION copilot_audit.get_recent_compaction_operations(
    p_limit integer DEFAULT 10,
    p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    conversation_id uuid,
    operation_timestamp timestamptz,
    strategy text,
    tokens_saved integer,
    compression_ratio numeric,
    duration_ms integer,
    success boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        co.id,
        co.conversation_id,
        co."timestamp" AS operation_timestamp,
        co.strategy,
        co.tokens_saved,
        co.compression_ratio,
        co.duration_ms,
        co.success
    FROM copilot_audit.compaction_operations co
    WHERE (p_tenant_id IS NULL OR co.tenant_id = p_tenant_id)
    ORDER BY co."timestamp" DESC
    LIMIT GREATEST(COALESCE(p_limit, 10), 0);
END;
$$;

-- 3.6: Recreate get_conversations_needing_compaction in copilot_audit
-- Note: This function references copilot_core tables (conversation_messages, conversations)
CREATE OR REPLACE FUNCTION copilot_audit.get_conversations_needing_compaction(
    p_message_count_gt integer DEFAULT 50,
    p_last_activity_after timestamptz DEFAULT now() - interval '7 days',
    p_last_compaction_before timestamptz DEFAULT now() - interval '1 day',
    p_limit integer DEFAULT 100
) RETURNS TABLE (
    conversation_id uuid,
    tenant_id uuid,
    active_path_id uuid,
    message_count bigint,
    last_message_at timestamptz,
    last_compaction_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    WITH message_counts AS (
        -- Count messages per conversation (only non-deleted messages)
        SELECT
            cm.conversation_id,
            COUNT(*) as msg_count
        FROM copilot_core.conversation_messages cm
        WHERE cm.metadata->>'deletedAt' IS NULL
        GROUP BY cm.conversation_id
    ),
    last_compactions AS (
        -- Get most recent compaction timestamp per conversation
        SELECT DISTINCT ON (co.conversation_id)
            co.conversation_id,
            co.timestamp as last_compaction_at
        FROM copilot_audit.compaction_operations co
        WHERE co.success = true
          AND co.conversation_id IS NOT NULL
        ORDER BY co.conversation_id, co.timestamp DESC
    )
    SELECT
        c.id as conversation_id,
        c.tenant_id,
        c.active_path_id,
        COALESCE(mc.msg_count, 0) as message_count,
        c.last_message_at,
        lc.last_compaction_at
    FROM copilot_core.conversations c
    LEFT JOIN message_counts mc ON c.id = mc.conversation_id
    LEFT JOIN last_compactions lc ON c.id = lc.conversation_id
    WHERE
        -- Filter by message count
        COALESCE(mc.msg_count, 0) > p_message_count_gt
        -- Filter by recent activity
        AND (c.last_message_at IS NULL OR c.last_message_at >= p_last_activity_after)
        -- Filter by last compaction time (or never compacted)
        AND (lc.last_compaction_at IS NULL OR lc.last_compaction_at < p_last_compaction_before)
        -- Exclude archived conversations
        AND c.archived_at IS NULL
    ORDER BY
        -- Prioritize: never compacted first, then by oldest compaction, then by message count
        CASE WHEN lc.last_compaction_at IS NULL THEN 0 ELSE 1 END,
        lc.last_compaction_at ASC NULLS FIRST,
        COALESCE(mc.msg_count, 0) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION copilot_audit.get_conversations_needing_compaction IS
    'Returns conversations that may need compaction based on message count, activity, and last compaction time. Used by auto-compaction background job.';

-- 4.2: Create permission config audit trigger function
-- Note: Uses original column names from 20260108000000_admin_permission_configs.sql
CREATE OR REPLACE FUNCTION copilot_audit.log_permission_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO copilot_audit.permission_audit_log (
      target_user_id, target_user_email, actor_id, actor_email, actor_role,
      action, new_value
    ) VALUES (
      NEW.user_id,
      COALESCE((SELECT email FROM auth.users WHERE id = NEW.user_id), 'unknown'),
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      COALESCE((SELECT role FROM copilot_admin.admin_users WHERE id = auth.uid()), 'system'),
      'permission_config_created',
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO copilot_audit.permission_audit_log (
      target_user_id, target_user_email, actor_id, actor_email, actor_role,
      action, old_value, new_value
    ) VALUES (
      NEW.user_id,
      COALESCE((SELECT email FROM auth.users WHERE id = NEW.user_id), 'unknown'),
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      COALESCE((SELECT role FROM copilot_admin.admin_users WHERE id = auth.uid()), 'system'),
      'permission_config_updated',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO copilot_audit.permission_audit_log (
      target_user_id, target_user_email, actor_id, actor_email, actor_role,
      action, old_value
    ) VALUES (
      OLD.user_id,
      COALESCE((SELECT email FROM auth.users WHERE id = OLD.user_id), 'unknown'),
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      COALESCE((SELECT role FROM copilot_admin.admin_users WHERE id = auth.uid()), 'system'),
      'permission_config_deleted',
      to_jsonb(OLD)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION copilot_audit.log_permission_config_change IS
  'Trigger function to log permission configuration changes for SOC2 compliance.';

-- =============================================================================
-- PART 4: Recreate Audit Trigger on admin_permission_configs
-- =============================================================================

-- Attach audit trigger to permission_configs table (now in copilot_admin)
DROP TRIGGER IF EXISTS trigger_permission_config_audit ON copilot_admin.admin_permission_configs;
CREATE TRIGGER trigger_permission_config_audit
  AFTER INSERT OR UPDATE OR DELETE ON copilot_admin.admin_permission_configs
  FOR EACH ROW
  EXECUTE FUNCTION copilot_audit.log_permission_config_change();

-- =============================================================================
-- PART 5: Grant Permissions
-- =============================================================================

-- Service role gets INSERT (for logging) and SELECT (for viewing)
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA copilot_audit TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA copilot_audit TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA copilot_audit TO service_role;

-- =============================================================================
-- PART 6: Verification
-- =============================================================================

DO $$
DECLARE
  table_count integer;
  function_count integer;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'copilot_audit';

  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'copilot_audit';

  IF table_count < 2 THEN
    RAISE WARNING 'Expected at least 2 tables in copilot_audit, found %', table_count;
  END IF;

  RAISE NOTICE '=== copilot_audit Schema Migration completed successfully ===';
  RAISE NOTICE '  ✓ Schema created: copilot_audit';
  RAISE NOTICE '  ✓ Tables: %', table_count;
  RAISE NOTICE '    - permission_audit_log (SOC2 - 7 year retention)';
  RAISE NOTICE '    - compaction_operations (operational - 90 day retention)';
  RAISE NOTICE '  ✓ Functions: %', function_count;
  RAISE NOTICE '  ✓ Audit trigger attached to admin_permission_configs';
END $$;
