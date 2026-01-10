


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "copilot_analytics";


ALTER SCHEMA "copilot_analytics" OWNER TO "postgres";


COMMENT ON SCHEMA "copilot_analytics" IS 'Read-only aggregated views for analytics dashboards and BI tools. Sources from copilot_billing and copilot_core.';



CREATE SCHEMA IF NOT EXISTS "copilot_archive";


ALTER SCHEMA "copilot_archive" OWNER TO "postgres";


COMMENT ON SCHEMA "copilot_archive" IS 'Cold data storage for inactive/historical records (FUTURE USE - not actively used yet).

Purpose: Move inactive data to cheaper storage tier while maintaining access
for compliance and historical queries.

When to activate: When database size exceeds 1TB or query performance degrades
due to table size (target: 500K+ active users).

Design principles:
- Archive data older than retention thresholds
- Maintain referential integrity via foreign keys
- Can be backed by S3/GCS via postgres_fdw
- Partitioned by archive date for lifecycle management
- Compressed tables to reduce storage costs

Archival policies (planned):
- Conversations: Archive after 90 days of inactivity
- Messages: Archived with parent conversation
- Cost records: Archive after 1 year (keep aggregates in analytics)
- Audit logs: Archive after 1 year (retain 7 years for SOC2)

Future tables:
- archived_conversations
- archived_messages
- archived_cost_records
- archived_audit_logs

Restore procedures:
- Archived data can be queried directly (slower)
- Critical data can be restored to hot storage
- Full restores available for compliance audits';



CREATE SCHEMA IF NOT EXISTS "copilot_audit";


ALTER SCHEMA "copilot_audit" OWNER TO "postgres";


COMMENT ON SCHEMA "copilot_audit" IS 'Immutable audit logs for SOC2 and GDPR compliance. Append-only for system, read-only for auditors.';



CREATE SCHEMA IF NOT EXISTS "copilot_billing";


ALTER SCHEMA "copilot_billing" OWNER TO "postgres";


COMMENT ON SCHEMA "copilot_billing" IS 'Transactional cost records, pricing configuration, and spending limits. RLS enforced for tenant-scoped access.';



CREATE SCHEMA IF NOT EXISTS "copilot_core";


ALTER SCHEMA "copilot_core" OWNER TO "postgres";


COMMENT ON SCHEMA "copilot_core" IS 'Core application tables with RLS enforcement. Contains user-facing operational data.';



CREATE SCHEMA IF NOT EXISTS "copilot_events";


ALTER SCHEMA "copilot_events" OWNER TO "postgres";


COMMENT ON SCHEMA "copilot_events" IS 'Event sourcing infrastructure (FUTURE USE - not actively used yet).

Purpose: Immutable append-only log of all state changes for temporal queries,
audit trails, and event-driven architecture.

When to activate: When implementing event-driven patterns or needing temporal
queries (target: 1M+ users).

Design principles:
- All events are immutable (no updates/deletes)
- Events are partitioned by timestamp for performance
- Each event references an aggregate (conversation, tenant, user)
- Event data stored as JSONB for flexibility
- Sequence numbers guarantee ordering within aggregate

Example event types:
- conversation.created
- conversation.message_added
- conversation.branched
- cost.llm_call_started
- cost.llm_call_completed
- membership.user_invited
- membership.workspace_switched

Future tables:
- events (main event log, partitioned by month)
- event_snapshots (periodic state checkpoints)
- event_subscriptions (consumer tracking)';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "copilot_audit"."get_compaction_metrics"("p_start_time" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_time" timestamp with time zone DEFAULT "now"(), "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("total_operations" bigint, "successful_operations" bigint, "failed_operations" bigint, "total_tokens_saved" bigint, "total_messages_removed" bigint, "total_messages_summarized" bigint, "avg_compression_ratio" numeric, "avg_duration_ms" numeric, "total_cost_usd" numeric, "operations_using_llm" bigint)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "copilot_audit"."get_compaction_metrics"("p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_audit"."get_compaction_strategy_breakdown"("p_start_time" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_time" timestamp with time zone DEFAULT "now"(), "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("strategy" "text", "operations" bigint, "tokens_saved" bigint, "avg_compression_ratio" numeric, "avg_duration_ms" numeric)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "copilot_audit"."get_compaction_strategy_breakdown"("p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_audit"."get_conversations_needing_compaction"("p_message_count_gt" integer DEFAULT 50, "p_last_activity_after" timestamp with time zone DEFAULT ("now"() - '7 days'::interval), "p_last_compaction_before" timestamp with time zone DEFAULT ("now"() - '1 day'::interval), "p_limit" integer DEFAULT 100) RETURNS TABLE("conversation_id" "uuid", "tenant_id" "uuid", "active_path_id" "uuid", "message_count" bigint, "last_message_at" timestamp with time zone, "last_compaction_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "copilot_audit"."get_conversations_needing_compaction"("p_message_count_gt" integer, "p_last_activity_after" timestamp with time zone, "p_last_compaction_before" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_audit"."get_conversations_needing_compaction"("p_message_count_gt" integer, "p_last_activity_after" timestamp with time zone, "p_last_compaction_before" timestamp with time zone, "p_limit" integer) IS 'Returns conversations that may need compaction based on message count, activity, and last compaction time. Used by auto-compaction background job.';



CREATE OR REPLACE FUNCTION "copilot_audit"."get_recent_compaction_operations"("p_limit" integer DEFAULT 10, "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "operation_timestamp" timestamp with time zone, "strategy" "text", "tokens_saved" integer, "compression_ratio" numeric, "duration_ms" integer, "success" boolean)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "copilot_audit"."get_recent_compaction_operations"("p_limit" integer, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_audit"."log_permission_config_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core', 'copilot_audit'
    AS $$
DECLARE
  v_actor_email text;
  v_actor_role text;
  v_target_email text;
BEGIN
  -- Get actor details
  SELECT email, role INTO v_actor_email, v_actor_role
  FROM copilot_core.platform_admins
  WHERE id = COALESCE(NEW.updated_by, auth.uid());

  -- Get target user email from auth.users
  SELECT email INTO v_target_email
  FROM auth.users
  WHERE id = NEW.user_id;

  -- Log permission changes to audit table
  -- Actual table schema: target_user_id, target_user_email, actor_id, actor_email, actor_role, action, old_value, new_value, changes, reason, ip_address, user_agent
  INSERT INTO copilot_audit.permission_audit_log (
    target_user_id,
    target_user_email,
    actor_id,
    actor_email,
    actor_role,
    action,
    old_value,
    new_value,
    reason
  ) VALUES (
    NEW.user_id,  -- Target is the user whose permissions are being changed
    COALESCE(v_target_email, 'unknown'),
    COALESCE(NEW.updated_by, auth.uid()),  -- Actor is the user making the change
    COALESCE(v_actor_email, 'system'),
    COALESCE(v_actor_role, 'system'),
    CASE TG_OP
      WHEN 'INSERT' THEN 'permission_config_created'
      WHEN 'UPDATE' THEN 'permission_config_updated'
      WHEN 'DELETE' THEN 'permission_config_deleted'
      ELSE 'permission_config_updated'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    row_to_json(NEW),
    NEW.reason
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_audit"."log_permission_config_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_audit"."record_compaction_operation"("p_conversation_id" "uuid" DEFAULT NULL::"uuid", "p_path_id" "uuid" DEFAULT NULL::"uuid", "p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_strategy" "text" DEFAULT 'none'::"text", "p_triggered_by" "text" DEFAULT 'manual'::"text", "p_tokens_before" integer DEFAULT 0, "p_tokens_after" integer DEFAULT 0, "p_messages_before" integer DEFAULT 0, "p_messages_after" integer DEFAULT 0, "p_messages_summarized" integer DEFAULT 0, "p_pinned_preserved" integer DEFAULT 0, "p_duration_ms" integer DEFAULT NULL::integer, "p_used_llm" boolean DEFAULT false, "p_cost_usd" numeric DEFAULT 0, "p_success" boolean DEFAULT true, "p_error" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "copilot_audit"."record_compaction_operation"("p_conversation_id" "uuid", "p_path_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_strategy" "text", "p_triggered_by" "text", "p_tokens_before" integer, "p_tokens_after" integer, "p_messages_before" integer, "p_messages_after" integer, "p_messages_summarized" integer, "p_pinned_preserved" integer, "p_duration_ms" integer, "p_used_llm" boolean, "p_cost_usd" numeric, "p_success" boolean, "p_error" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_billing"."calculate_e2b_cost"("p_tier" "text", "p_region" "text", "p_execution_time_seconds" numeric, "p_cpu_core_seconds" numeric DEFAULT NULL::numeric, "p_memory_gb_seconds" numeric DEFAULT NULL::numeric, "p_disk_io_gb" numeric DEFAULT NULL::numeric, "p_pricing_date" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("execution_cost_usd" numeric, "resource_cost_usd" numeric, "total_cost_usd" numeric, "is_estimated" boolean)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_pricing record;
    v_exec_cost numeric := 0;
    v_resource_cost numeric := 0;
    v_is_estimated boolean := false;
BEGIN
    -- Get pricing for the tier/region/date
    SELECT
        price_per_second,
        price_per_cpu_core_hour,
        price_per_gb_memory_hour,
        price_per_gb_disk_io
    INTO v_pricing
    FROM copilot_billing.e2b_pricing
    WHERE
        tier = p_tier
        AND region = p_region
        AND effective_date <= p_pricing_date
        AND (expires_at IS NULL OR expires_at > p_pricing_date)
    ORDER BY effective_date DESC
    LIMIT 1;

    -- If no pricing found, use default estimates
    IF v_pricing IS NULL THEN
        v_is_estimated := true;

        -- Default fallback pricing (conservative estimates)
        CASE p_tier
            WHEN 'standard' THEN v_exec_cost := p_execution_time_seconds * 0.0001;
            WHEN 'gpu' THEN v_exec_cost := p_execution_time_seconds * 0.001;
            WHEN 'high-memory' THEN v_exec_cost := p_execution_time_seconds * 0.0005;
            WHEN 'high-cpu' THEN v_exec_cost := p_execution_time_seconds * 0.0003;
            ELSE v_exec_cost := p_execution_time_seconds * 0.0001;
        END CASE;
    ELSE
        -- Calculate execution cost
        v_exec_cost := p_execution_time_seconds * v_pricing.price_per_second;

        -- Calculate resource costs if available
        IF p_cpu_core_seconds IS NOT NULL AND v_pricing.price_per_cpu_core_hour IS NOT NULL THEN
            v_resource_cost := v_resource_cost + (p_cpu_core_seconds / 3600.0) * v_pricing.price_per_cpu_core_hour;
        END IF;

        IF p_memory_gb_seconds IS NOT NULL AND v_pricing.price_per_gb_memory_hour IS NOT NULL THEN
            v_resource_cost := v_resource_cost + (p_memory_gb_seconds / 3600.0) * v_pricing.price_per_gb_memory_hour;
        END IF;

        IF p_disk_io_gb IS NOT NULL AND v_pricing.price_per_gb_disk_io IS NOT NULL THEN
            v_resource_cost := v_resource_cost + p_disk_io_gb * v_pricing.price_per_gb_disk_io;
        END IF;
    END IF;

    RETURN QUERY SELECT
        v_exec_cost,
        v_resource_cost,
        v_exec_cost + v_resource_cost,
        v_is_estimated;
END;
$$;


ALTER FUNCTION "copilot_billing"."calculate_e2b_cost"("p_tier" "text", "p_region" "text", "p_execution_time_seconds" numeric, "p_cpu_core_seconds" numeric, "p_memory_gb_seconds" numeric, "p_disk_io_gb" numeric, "p_pricing_date" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_billing"."calculate_e2b_cost"("p_tier" "text", "p_region" "text", "p_execution_time_seconds" numeric, "p_cpu_core_seconds" numeric, "p_memory_gb_seconds" numeric, "p_disk_io_gb" numeric, "p_pricing_date" timestamp with time zone) IS 'Calculate E2B sandbox cost based on tier, region, and resource usage.';



CREATE OR REPLACE FUNCTION "copilot_billing"."calculate_llm_cost"("p_provider" "text", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer) RETURNS TABLE("input_cost_usd" numeric, "output_cost_usd" numeric, "total_cost_usd" numeric, "pricing_found" boolean)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    v_pricing record;
BEGIN
    -- Get current pricing
    SELECT * INTO v_pricing
    FROM copilot_billing.get_current_model_pricing(p_provider, p_model);

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
$$;


ALTER FUNCTION "copilot_billing"."calculate_llm_cost"("p_provider" "text", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_billing"."calculate_llm_cost"("p_provider" "text", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer) IS 'Calculate LLM cost based on tokens and current pricing';



CREATE OR REPLACE FUNCTION "copilot_billing"."check_and_record_quota_atomic"("p_scope" "text", "p_scope_id" "uuid", "p_cost_usd" numeric) RETURNS TABLE("allowed" boolean, "current_spend_usd" numeric, "limit_usd" numeric, "remaining_usd" numeric, "utilization_percent" numeric, "reason" "text", "period" "text", "period_end" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  v_quota_row RECORD;
  v_projected_spend numeric;
  v_now timestamptz := now();
BEGIN
  -- Lock the quota row for atomic check + update
  SELECT *
  INTO v_quota_row
  FROM copilot_billing.cost_quotas
  WHERE scope = p_scope
    AND (
      (p_scope = 'platform' AND scope_id IS NULL)
      OR
      (p_scope != 'platform' AND scope_id = p_scope_id)
    )
  FOR UPDATE;

  -- If no quota configured, allow operation
  IF v_quota_row IS NULL THEN
    RETURN QUERY SELECT
      true::boolean AS allowed,
      p_cost_usd AS current_spend_usd,
      999999.99::numeric AS limit_usd,
      999999.99::numeric AS remaining_usd,
      0.0::numeric AS utilization_percent,
      NULL::text AS reason,
      'none'::text AS period,
      NULL::timestamptz AS period_end;
    RETURN;
  END IF;

  -- Check if quota period has expired and needs reset
  IF v_quota_row.period_end IS NULL OR v_now >= v_quota_row.period_end THEN
    DECLARE
      v_period_start timestamptz;
      v_period_end timestamptz;
    BEGIN
      -- Calculate new period bounds
      IF v_quota_row.period = 'hour' THEN
        v_period_start := date_trunc('hour', v_now);
        v_period_end := v_period_start + interval '1 hour';
      ELSIF v_quota_row.period = 'day' THEN
        v_period_start := date_trunc('day', v_now);
        v_period_end := v_period_start + interval '1 day';
      ELSIF v_quota_row.period = 'week' THEN
        v_period_start := date_trunc('week', v_now);
        v_period_end := v_period_start + interval '1 week';
      ELSIF v_quota_row.period = 'month' THEN
        v_period_start := date_trunc('month', v_now);
        v_period_end := v_period_start + interval '1 month';
      END IF;

      IF v_period_start IS NULL OR v_period_end IS NULL THEN
        RAISE EXCEPTION 'Invalid quota period: %', v_quota_row.period;
      END IF;

      -- Update quota with new period and reset spend
      UPDATE copilot_billing.cost_quotas
      SET
        current_spend_usd = 0,
        period_start = v_period_start,
        period_end = v_period_end,
        updated_at = v_now
      WHERE id = v_quota_row.id;

      -- Refresh quota row
      v_quota_row.current_spend_usd := 0;
      v_quota_row.period_start := v_period_start;
      v_quota_row.period_end := v_period_end;
    END;
  END IF;

  -- Calculate projected spend
  v_projected_spend := v_quota_row.current_spend_usd + p_cost_usd;

  -- Check if projected spend exceeds limit
  IF v_projected_spend > v_quota_row.limit_usd THEN
    -- DENY: Would exceed quota
    RETURN QUERY SELECT
      false::boolean AS allowed,
      v_quota_row.current_spend_usd AS current_spend_usd,
      v_quota_row.limit_usd AS limit_usd,
      (v_quota_row.limit_usd - v_quota_row.current_spend_usd)::numeric AS remaining_usd,
      (v_quota_row.current_spend_usd / NULLIF(v_quota_row.limit_usd, 0) * 100)::numeric AS utilization_percent,
      format(
        'Quota exceeded: would spend $%s but limit is $%s (remaining: $%s)',
        v_projected_spend::money,
        v_quota_row.limit_usd::money,
        (v_quota_row.limit_usd - v_quota_row.current_spend_usd)::money
      )::text AS reason,
      v_quota_row.period AS period,
      v_quota_row.period_end AS period_end;
    RETURN;
  END IF;

  -- ALLOW: Update quota atomically
  UPDATE copilot_billing.cost_quotas
  SET
    current_spend_usd = v_projected_spend,
    updated_at = v_now
  WHERE id = v_quota_row.id;

  -- Return success
  RETURN QUERY SELECT
    true::boolean AS allowed,
    v_projected_spend AS current_spend_usd,
    v_quota_row.limit_usd AS limit_usd,
    (v_quota_row.limit_usd - v_projected_spend)::numeric AS remaining_usd,
    (v_projected_spend / NULLIF(v_quota_row.limit_usd, 0) * 100)::numeric AS utilization_percent,
    NULL::text AS reason,
    v_quota_row.period AS period,
    v_quota_row.period_end AS period_end;
  RETURN;
END;
$_$;


ALTER FUNCTION "copilot_billing"."check_and_record_quota_atomic"("p_scope" "text", "p_scope_id" "uuid", "p_cost_usd" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_billing"."check_and_record_quota_atomic"("p_scope" "text", "p_scope_id" "uuid", "p_cost_usd" numeric) IS 'Atomically checks quota and records cost with row-level locking';



CREATE OR REPLACE FUNCTION "copilot_billing"."check_e2b_quota"("p_scope" "text", "p_scope_id" "uuid", "p_estimated_cost" numeric) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_quota_exceeded boolean;
BEGIN
    SELECT
        COALESCE(
            MAX(current_spend_usd + p_estimated_cost > limit_usd),
            false
        )
    INTO v_quota_exceeded
    FROM copilot_billing.cost_quotas
    WHERE
        scope = p_scope
        AND resource_type IN ('e2b', 'all')
        AND (
            (p_scope_id IS NULL AND scope_id IS NULL)
            OR scope_id = p_scope_id
        );

    RETURN NOT v_quota_exceeded;
END;
$$;


ALTER FUNCTION "copilot_billing"."check_e2b_quota"("p_scope" "text", "p_scope_id" "uuid", "p_estimated_cost" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_billing"."check_e2b_quota"("p_scope" "text", "p_scope_id" "uuid", "p_estimated_cost" numeric) IS 'Check if E2B quota would be exceeded by estimated cost. Returns true if within quota.';



CREATE OR REPLACE FUNCTION "copilot_billing"."get_current_model_pricing"("p_provider" "text", "p_model" "text") RETURNS TABLE("input_price_per_million" numeric, "output_price_per_million" numeric, "effective_date" timestamp with time zone, "notes" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        mp.input_price_per_million,
        mp.output_price_per_million,
        mp.effective_date,
        mp.notes
    FROM copilot_billing.model_pricing mp
    WHERE mp.provider = LOWER(p_provider)
      AND mp.model = LOWER(p_model)
      AND mp.effective_date <= now()
      AND (mp.expires_at IS NULL OR mp.expires_at > now())
    ORDER BY mp.effective_date DESC
    LIMIT 1;
END;
$$;


ALTER FUNCTION "copilot_billing"."get_current_model_pricing"("p_provider" "text", "p_model" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_billing"."get_current_model_pricing"("p_provider" "text", "p_model" "text") IS 'Get current active pricing for a model';



CREATE OR REPLACE FUNCTION "copilot_billing"."increment_e2b_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE copilot_billing.cost_quotas
    SET
        current_spend_usd = current_spend_usd + p_amount,
        updated_at = now()
    WHERE
        scope = p_scope
        AND resource_type IN ('e2b', 'all')
        AND (
            (p_scope_id IS NULL AND scope_id IS NULL)
            OR scope_id = p_scope_id
        );
END;
$$;


ALTER FUNCTION "copilot_billing"."increment_e2b_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_billing"."increment_e2b_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) IS 'Atomically increment E2B quota spend for concurrent-safe updates';



CREATE OR REPLACE FUNCTION "copilot_billing"."increment_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE copilot_billing.cost_quotas
    SET
        current_spend_usd = current_spend_usd + p_amount,
        updated_at = now()
    WHERE
        scope = p_scope
        AND (
            (p_scope_id IS NULL AND scope_id IS NULL)
            OR scope_id = p_scope_id
        );
END;
$$;


ALTER FUNCTION "copilot_billing"."increment_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_billing"."increment_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) IS 'Atomically increment quota spend for concurrent-safe updates';



CREATE OR REPLACE FUNCTION "copilot_billing"."init_tenant_quotas"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Create default LLM quota for new tenant
  INSERT INTO copilot_billing.cost_quotas (scope, scope_id, resource_type, limit_usd, period, period_start, period_end)
  VALUES ('tenant', NEW.id, 'llm', 100.00, 'month', date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')
  ON CONFLICT DO NOTHING;

  -- Create default E2B quota for new tenant
  INSERT INTO copilot_billing.cost_quotas (scope, scope_id, resource_type, limit_usd, period, period_start, period_end)
  VALUES ('tenant', NEW.id, 'e2b', 50.00, 'month', date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_billing"."init_tenant_quotas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_billing"."update_cost_quota_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_billing"."update_cost_quota_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_billing"."update_cost_quotas_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_billing"."update_cost_quotas_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."cleanup_old_terminated_contexts"("p_days_old" integer DEFAULT 7, "p_limit" integer DEFAULT 100) RETURNS TABLE("deleted_count" integer, "deleted_ids" "uuid"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    deleted_id_array uuid[];
    delete_count integer;
BEGIN
    -- Delete terminated contexts older than p_days_old days
    WITH to_delete AS (
        SELECT ec.id
        FROM copilot_core.execution_contexts ec
        WHERE terminated_at IS NOT NULL
          AND terminated_at < now() - (p_days_old || ' days')::interval
        ORDER BY terminated_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 100), 0)
    ), deleted AS (
        DELETE FROM copilot_core.execution_contexts ec
        USING to_delete td
        WHERE ec.id = td.id
        RETURNING ec.id
    )
    SELECT array_agg(deleted.id), count(*)::integer
    INTO deleted_id_array, delete_count
    FROM deleted;

    -- Handle case where no rows were deleted
    deleted_id_array := COALESCE(deleted_id_array, ARRAY[]::uuid[]);
    delete_count := COALESCE(delete_count, 0);

    RETURN QUERY SELECT delete_count, deleted_id_array;
END;
$$;


ALTER FUNCTION "copilot_core"."cleanup_old_terminated_contexts"("p_days_old" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."create_notification"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_priority" "text" DEFAULT 'MEDIUM'::"text", "p_action_url" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO copilot_core.notifications (
    user_id,
    tenant_id,
    type,
    title,
    message,
    priority,
    action_url,
    metadata
  ) VALUES (
    p_user_id,
    p_tenant_id,
    p_type,
    p_title,
    p_message,
    p_priority,
    p_action_url,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;


ALTER FUNCTION "copilot_core"."create_notification"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_priority" "text", "p_action_url" "text", "p_metadata" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_core"."create_notification"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_priority" "text", "p_action_url" "text", "p_metadata" "jsonb") IS 'Creates a notification for a user. Access: service_role only (backend notification system).';



CREATE OR REPLACE FUNCTION "copilot_core"."get_expired_execution_contexts"("p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "conversation_id" "uuid", "path_id" "uuid", "sandbox_id" "text", "created_at" timestamp with time zone, "last_used_at" timestamp with time zone, "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
    SELECT
        id,
        tenant_id,
        conversation_id,
        path_id,
        sandbox_id,
        created_at,
        last_used_at,
        expires_at
    FROM copilot_core.execution_contexts
    WHERE terminated_at IS NULL
      AND expires_at < now()
    ORDER BY expires_at ASC
    LIMIT p_limit;
$$;


ALTER FUNCTION "copilot_core"."get_expired_execution_contexts"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."get_path_ancestors"("p_path_id" "uuid") RETURNS TABLE("path_id" "uuid", "depth" integer)
    LANGUAGE "sql" STABLE
    AS $$
    WITH RECURSIVE path_chain AS (
        SELECT id, parent_path_id, 0 AS depth
        FROM copilot_core.conversation_paths
        WHERE id = p_path_id

        UNION ALL

        SELECT p.id, p.parent_path_id, pc.depth + 1
        FROM copilot_core.conversation_paths p
        INNER JOIN path_chain pc ON p.id = pc.parent_path_id
        WHERE pc.depth < 100
    )
    SELECT id AS path_id, depth FROM path_chain ORDER BY depth DESC;
$$;


ALTER FUNCTION "copilot_core"."get_path_ancestors"("p_path_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_core"."get_path_ancestors"("p_path_id" "uuid") IS 'Returns all ancestor paths for a given path ID. Access: service_role only (internal query for path resolution).';



CREATE OR REPLACE FUNCTION "copilot_core"."get_root_path_id"("p_path_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
    WITH RECURSIVE path_chain AS (
        SELECT id, parent_path_id, 1 AS depth
        FROM copilot_core.conversation_paths
        WHERE id = p_path_id

        UNION ALL

        SELECT p.id, p.parent_path_id, pc.depth + 1
        FROM copilot_core.conversation_paths p
        INNER JOIN path_chain pc ON p.id = pc.parent_path_id
        WHERE pc.depth < 100
    )
    SELECT id FROM path_chain WHERE parent_path_id IS NULL LIMIT 1;
$$;


ALTER FUNCTION "copilot_core"."get_root_path_id"("p_path_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_core"."get_root_path_id"("p_path_id" "uuid") IS 'Returns the root path ID for a conversation path. Access: service_role only (internal navigation).';



CREATE OR REPLACE FUNCTION "copilot_core"."mark_branch_point"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- When a new path is created with a branch_point_message_id,
    -- mark that message as a branch point
    IF NEW.branch_point_message_id IS NOT NULL THEN
        UPDATE copilot_core.conversation_messages
        SET
            is_branch_point = true,
            branched_to_paths = array_append(
                COALESCE(branched_to_paths, '{}'),
                NEW.id
            )
        WHERE id = NEW.branch_point_message_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_core"."mark_branch_point"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."next_sequence_in_path"("p_path_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
    SELECT COALESCE(MAX(sequence_in_path), 0) + 1
    FROM copilot_core.conversation_messages
    WHERE path_id = p_path_id;
$$;


ALTER FUNCTION "copilot_core"."next_sequence_in_path"("p_path_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_core"."next_sequence_in_path"("p_path_id" "uuid") IS 'Returns the next sequence number for a path. Access: service_role only (internal sequencing).';



CREATE OR REPLACE FUNCTION "copilot_core"."on_membership_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_event_type text;
  v_old_role text;
  v_new_role text;
  v_old_status text;
  v_new_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'added';
    v_new_role := NEW.role;
    v_new_status := NEW.status;

    INSERT INTO copilot_core.membership_change_events (
      user_id,
      tenant_id,
      event_type,
      new_role,
      new_status,
      changed_by
    ) VALUES (
      NEW.user_id,
      NEW.tenant_id,
      v_event_type,
      v_new_role,
      v_new_status,
      NEW.invited_by
    );

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_role := OLD.role;
    v_new_role := NEW.role;
    v_old_status := OLD.status;
    v_new_status := NEW.status;

    -- Role changed
    IF v_old_role != v_new_role THEN
      v_event_type := 'role_changed';
    -- Status changed
    ELSIF v_old_status != v_new_status THEN
      IF v_new_status = 'suspended' THEN
        v_event_type := 'suspended';
      ELSIF v_new_status = 'active' AND v_old_status = 'suspended' THEN
        v_event_type := 'reactivated';
      ELSE
        v_event_type := 'status_changed';
      END IF;
    ELSE
      -- Other field changed (e.g., invited_at), no event needed
      RETURN NEW;
    END IF;

    INSERT INTO copilot_core.membership_change_events (
      user_id,
      tenant_id,
      event_type,
      old_role,
      new_role,
      old_status,
      new_status
    ) VALUES (
      NEW.user_id,
      NEW.tenant_id,
      v_event_type,
      v_old_role,
      v_new_role,
      v_old_status,
      v_new_status
    );

  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'removed';
    v_old_role := OLD.role;
    v_old_status := OLD.status;

    INSERT INTO copilot_core.membership_change_events (
      user_id,
      tenant_id,
      event_type,
      old_role,
      old_status
    ) VALUES (
      OLD.user_id,
      OLD.tenant_id,
      v_event_type,
      v_old_role,
      v_old_status
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "copilot_core"."on_membership_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_core"."on_membership_change"() IS 'Trigger function that tracks all membership changes (INSERT, UPDATE, DELETE) and creates events for user notifications';



CREATE OR REPLACE FUNCTION "copilot_core"."resolve_path_messages"("p_path_id" "uuid") RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "path_id" "uuid", "tenant_id" "uuid", "user_id" "uuid", "role" "text", "content" "text", "metadata" "jsonb", "sequence_in_path" integer, "is_branch_point" boolean, "branched_to_paths" "uuid"[], "message_type" "text", "created_at" timestamp with time zone, "effective_sequence" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    v_path record;
    v_branch_point_seq integer;
BEGIN
    -- Get path info
    SELECT * INTO v_path
    FROM copilot_core.conversation_paths
    WHERE copilot_core.conversation_paths.id = p_path_id;

    IF v_path IS NULL THEN
        RETURN;
    END IF;

    -- If this path has a parent, get inherited messages first
    IF v_path.parent_path_id IS NOT NULL THEN
        -- Get the sequence number of the branch point in the parent path
        SELECT m.sequence_in_path INTO v_branch_point_seq
        FROM copilot_core.conversation_messages m
        WHERE m.id = v_path.branch_point_message_id;

        -- Return inherited messages from parent (recursively) up to branch point
        RETURN QUERY
        WITH parent_messages AS (
            SELECT * FROM copilot_core.resolve_path_messages(v_path.parent_path_id)
        )
        SELECT
            pm.id,
            pm.conversation_id,
            pm.path_id,
            pm.tenant_id,
            pm.user_id,
            pm.role,
            pm.content,
            pm.metadata,
            pm.sequence_in_path,
            pm.is_branch_point,
            pm.branched_to_paths,
            pm.message_type,
            pm.created_at,
            pm.effective_sequence
        FROM parent_messages pm
        WHERE pm.effective_sequence <= v_branch_point_seq;
    END IF;

    -- Return this path's own messages
    RETURN QUERY
    SELECT
        m.id,
        m.conversation_id,
        m.path_id,
        m.tenant_id,
        m.user_id,
        m.role,
        m.content,
        m.metadata,
        m.sequence_in_path,
        m.is_branch_point,
        m.branched_to_paths,
        m.message_type,
        m.created_at,
        -- If this is a child path, offset sequence by parent's branch point
        CASE
            WHEN v_path.parent_path_id IS NOT NULL THEN
                COALESCE(v_branch_point_seq, 0) + m.sequence_in_path
            ELSE
                m.sequence_in_path
        END AS effective_sequence
    FROM copilot_core.conversation_messages m
    WHERE m.path_id = p_path_id
    ORDER BY m.sequence_in_path;
END;
$$;


ALTER FUNCTION "copilot_core"."resolve_path_messages"("p_path_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "copilot_core"."resolve_path_messages"("p_path_id" "uuid") IS 'Resolves all messages in a path. Access: service_role only (internal message resolution).';



CREATE OR REPLACE FUNCTION "copilot_core"."set_execution_context_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- If expires_at not set, default to 30 minutes from now
    IF NEW.expires_at IS NULL OR NEW.expires_at = NEW.created_at THEN
        NEW.expires_at := now() + interval '30 minutes';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_core"."set_execution_context_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."set_message_sequence"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Only set sequence if path_id is provided and sequence is not set
    IF NEW.path_id IS NOT NULL AND NEW.sequence_in_path IS NULL THEN
        NEW.sequence_in_path := copilot_core.next_sequence_in_path(NEW.path_id);
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_core"."set_message_sequence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."touch_execution_context"("p_context_id" "uuid", "p_ttl_minutes" integer DEFAULT 30) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE copilot_core.execution_contexts
    SET
        last_used_at = now(),
        expires_at = now() + (p_ttl_minutes || ' minutes')::interval
    WHERE id = p_context_id
      AND terminated_at IS NULL;
END;
$$;


ALTER FUNCTION "copilot_core"."touch_execution_context"("p_context_id" "uuid", "p_ttl_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."update_path_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_core"."update_path_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."update_platform_admin_permission_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_core"."update_platform_admin_permission_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "copilot_core"."update_platform_admin_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "copilot_core"."update_platform_admin_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_workspace_invitation"("p_token" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_invitation record;
  v_user_email text;
  v_membership_id uuid;
BEGIN
  IF p_user_id IS NULL THEN p_user_id := auth.uid(); END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be logged in to accept an invitation');
  END IF;

  SELECT * INTO v_invitation FROM copilot_core.workspace_invitations
  WHERE token = p_token AND accepted_at IS NULL AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  IF lower(v_user_email) != lower(v_invitation.email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invitation was sent to a different email address', 'invited_email', v_invitation.email);
  END IF;

  IF EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = v_invitation.tenant_id AND user_id = p_user_id
      AND status = 'active' AND deleted_at IS NULL
  ) THEN
    UPDATE copilot_core.workspace_invitations SET accepted_at = NOW() WHERE id = v_invitation.id;
    RETURN jsonb_build_object('success', true, 'already_member', true, 'tenant_id', v_invitation.tenant_id);
  END IF;

  INSERT INTO copilot_core.tenant_memberships (tenant_id, user_id, role, status, joined_at, invited_by)
  VALUES (v_invitation.tenant_id, p_user_id, v_invitation.role, 'active', NOW(), v_invitation.invited_by)
  RETURNING id INTO v_membership_id;

  UPDATE copilot_core.workspace_invitations SET accepted_at = NOW() WHERE id = v_invitation.id;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_invitation.tenant_id, 'role', v_invitation.role, 'membership_id', v_membership_id);
END;
$$;


ALTER FUNCTION "public"."accept_workspace_invitation"("p_token" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_notification"("p_notification_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'ARCHIVED', archived_at = NOW(), read_at = COALESCE(read_at, NOW())
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status != 'ARCHIVED';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found or already archived');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'archived_at', NOW());
END;
$$;


ALTER FUNCTION "public"."archive_notification"("p_notification_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."archive_notification"("p_notification_id" "uuid") IS 'Archives a notification (moves to archive, marks as read).';



CREATE OR REPLACE FUNCTION "public"."cancel_workspace_invitation"("p_invitation_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_invitation record;
BEGIN
  SELECT * INTO v_invitation FROM copilot_core.workspace_invitations
  WHERE id = p_invitation_id AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found or already accepted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = v_invitation.tenant_id AND user_id = p_user_id
      AND role IN ('owner', 'admin') AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only workspace owners and admins can cancel invitations');
  END IF;

  DELETE FROM copilot_core.workspace_invitations WHERE id = p_invitation_id;

  RETURN jsonb_build_object('success', true, 'cancelled_at', NOW());
END;
$$;


ALTER FUNCTION "public"."cancel_workspace_invitation"("p_invitation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_session_sync_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_audit'
    AS $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  DELETE FROM copilot_audit.session_sync_logs
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  RAISE NOTICE 'Deleted % old session sync log entries', rows_deleted;

  RETURN rows_deleted;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_session_sync_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_slow_query_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_metrics'
    AS $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  DELETE FROM copilot_metrics.slow_query_log
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  RAISE NOTICE 'Deleted % old slow query log entries', rows_deleted;

  RETURN rows_deleted;
END;
$$;


ALTER FUNCTION "public"."cleanup_slow_query_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_personal_tenant"("p_user_id" "uuid", "p_user_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant_name text;
  v_tenant_slug text;
BEGIN
  -- Check if user already has a personal tenant
  IF EXISTS (
    SELECT 1 FROM copilot_core.tenants
    WHERE owner_id = p_user_id AND type = 'personal'
  ) THEN
    SELECT id, name INTO v_tenant_id, v_tenant_name
    FROM copilot_core.tenants
    WHERE owner_id = p_user_id AND type = 'personal';

    RETURN jsonb_build_object(
      'success', true,
      'tenant_id', v_tenant_id,
      'tenant_name', v_tenant_name,
      'already_existed', true
    );
  END IF;

  -- Generate tenant name and slug from email
  v_tenant_name := 'Personal Workspace';
  v_tenant_slug := 'personal-' || replace(split_part(p_user_email, '@', 1), '.', '-');

  -- Create tenant
  INSERT INTO copilot_core.tenants (name, slug, type, owner_id)
  VALUES (v_tenant_name, v_tenant_slug, 'personal', p_user_id)
  RETURNING id INTO v_tenant_id;

  -- Create owner membership
  INSERT INTO copilot_core.tenant_memberships (
    tenant_id, user_id, role, status, joined_at
  ) VALUES (
    v_tenant_id, p_user_id, 'owner', 'active', NOW()
  );

  -- Set as current tenant
  INSERT INTO copilot_core.user_preferences (user_id, current_tenant_id)
  VALUES (p_user_id, v_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET current_tenant_id = v_tenant_id;

  INSERT INTO copilot_core.user_tenant_contexts (user_id, current_tenant_id)
  VALUES (p_user_id, v_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET current_tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_name', v_tenant_name,
    'tenant_slug', v_tenant_slug,
    'already_existed', false
  );
END;
$$;


ALTER FUNCTION "public"."create_personal_tenant"("p_user_id" "uuid", "p_user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'currentTenantId')::uuid,
    (
      SELECT current_tenant_id
      FROM copilot_core.user_preferences
      WHERE user_id = auth.uid()
    )
  );
$$;


ALTER FUNCTION "public"."current_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_notification"("p_notification_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  DELETE FROM copilot_core.notifications
  WHERE id = p_notification_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'deleted_at', NOW());
END;
$$;


ALTER FUNCTION "public"."delete_notification"("p_notification_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_notification"("p_notification_id" "uuid") IS 'Permanently deletes a notification.';



CREATE OR REPLACE FUNCTION "public"."delete_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tenant_type text;
  v_user_role text;
  v_active_contexts_count integer;
  v_members_count integer;
  v_tenant_name text;
BEGIN
  -- Check workspace exists and get type
  SELECT type, name INTO v_tenant_type, v_tenant_name
  FROM copilot_core.tenants
  WHERE id = p_tenant_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Workspace not found or already deleted'
    );
  END IF;

  -- Prevent deletion of personal workspaces
  IF v_tenant_type = 'personal' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Personal workspaces cannot be deleted'
    );
  END IF;

  -- Verify user is owner
  SELECT role INTO v_user_role
  FROM copilot_core.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id
    AND status = 'active'
    AND deleted_at IS NULL;

  IF v_user_role IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is not a member of this workspace'
    );
  END IF;

  IF v_user_role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only workspace owners can delete workspaces',
      'user_role', v_user_role
    );
  END IF;

  -- Check for active execution contexts
  SELECT COUNT(*) INTO v_active_contexts_count
  FROM copilot_core.execution_contexts
  WHERE tenant_id = p_tenant_id
    AND terminated_at IS NULL;

  IF v_active_contexts_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete workspace with active execution contexts. Please terminate all sandboxes first.',
      'active_contexts', v_active_contexts_count
    );
  END IF;

  -- Get member count for notification
  SELECT COUNT(*) INTO v_members_count
  FROM copilot_core.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND deleted_at IS NULL;

  -- Soft delete workspace
  UPDATE copilot_core.tenants
  SET deleted_at = NOW(),
      deleted_by = p_user_id
  WHERE id = p_tenant_id;

  -- Soft delete memberships
  UPDATE copilot_core.tenant_memberships
  SET deleted_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL;

  -- Log deletion event (structured log for audit)
  RAISE NOTICE 'Workspace deleted: % (%) by user %, % members affected',
    v_tenant_name, p_tenant_id, p_user_id, v_members_count;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_at', NOW(),
    'workspace_name', v_tenant_name,
    'members_affected', v_members_count,
    'grace_period_days', 30,
    'restore_before', NOW() + INTERVAL '30 days'
  );
END;
$$;


ALTER FUNCTION "public"."delete_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") IS 'Soft deletes a workspace. Personal workspaces cannot be deleted. Requires owner role. Checks for active execution contexts.';



CREATE OR REPLACE FUNCTION "public"."dismiss_notification"("p_notification_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'DISMISSED'
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status IN ('UNREAD', 'READ');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found or already dismissed/archived');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id);
END;
$$;


ALTER FUNCTION "public"."dismiss_notification"("p_notification_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dismiss_notification"("p_notification_id" "uuid") IS 'Dismisses a notification (hides but keeps for audit).';



CREATE OR REPLACE FUNCTION "public"."get_current_tenant_id"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT current_tenant_id
  INTO v_tenant_id
  FROM copilot_core.user_tenant_contexts
  WHERE user_id = p_user_id;

  RETURN v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."get_current_tenant_id"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_tenant_id"("p_user_id" "uuid") IS 'Returns the current active tenant_id from database for a user. Used to detect session/DB mismatches.';



CREATE OR REPLACE FUNCTION "public"."get_my_pending_invitations"() RETURNS TABLE("invitation_id" "uuid", "workspace_id" "uuid", "workspace_name" "text", "workspace_slug" "text", "role" "text", "invited_by_email" "text", "expires_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.tenant_id, t.name, t.slug, i.role, u.email, i.expires_at, i.created_at
  FROM copilot_core.workspace_invitations i
  JOIN copilot_core.tenants t ON t.id = i.tenant_id
  JOIN auth.users u ON u.id = i.invited_by
  WHERE i.email = v_user_email AND i.accepted_at IS NULL AND i.expires_at > NOW() AND t.deleted_at IS NULL
  ORDER BY i.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_my_pending_invitations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_my_pending_invitations"() IS 'Returns all pending workspace invitations for the current user.';



CREATE OR REPLACE FUNCTION "public"."get_pending_membership_events"("p_user_id" "uuid") RETURNS TABLE("event_id" "uuid", "tenant_id" "uuid", "tenant_name" "text", "event_type" "text", "old_role" "text", "new_role" "text", "old_status" "text", "new_status" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    mce.id, mce.tenant_id, t.name, mce.event_type,
    mce.old_role, mce.new_role, mce.old_status, mce.new_status, mce.created_at
  FROM copilot_core.membership_change_events mce
  JOIN copilot_core.tenants t ON t.id = mce.tenant_id
  WHERE mce.user_id = p_user_id AND mce.processed_at IS NULL
  ORDER BY mce.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_pending_membership_events"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_pending_membership_events"("p_user_id" "uuid") IS 'Returns unprocessed membership change events for a user. Used by client to show notifications and handle workspace switches.';



CREATE OR REPLACE FUNCTION "public"."get_query_performance_stats"("p_hours_back" integer DEFAULT 24, "p_min_execution_time_ms" numeric DEFAULT 100) RETURNS TABLE("query_type" "text", "table_name" "text", "avg_execution_time_ms" numeric, "max_execution_time_ms" numeric, "query_count" bigint, "slowest_tenant_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_metrics', 'copilot_core'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    sq.query_type,
    sq.table_name,
    AVG(sq.execution_time_ms) AS avg_execution_time_ms,
    MAX(sq.execution_time_ms) AS max_execution_time_ms,
    COUNT(*)::BIGINT AS query_count,
    (
      SELECT tenant_id
      FROM copilot_metrics.slow_query_log sq2
      WHERE sq2.query_type = sq.query_type
        AND sq2.table_name = sq.table_name
        AND sq2.created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
      ORDER BY sq2.execution_time_ms DESC
      LIMIT 1
    ) AS slowest_tenant_id
  FROM copilot_metrics.slow_query_log sq
  WHERE sq.created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
    AND sq.execution_time_ms >= p_min_execution_time_ms
  GROUP BY sq.query_type, sq.table_name
  ORDER BY avg_execution_time_ms DESC;
END;
$$;


ALTER FUNCTION "public"."get_query_performance_stats"("p_hours_back" integer, "p_min_execution_time_ms" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_sync_stats"("p_hours_back" integer DEFAULT 24) RETURNS TABLE("total_mismatches" bigint, "affected_users" bigint, "most_common_path" "text", "mismatch_count_by_path" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_audit', 'copilot_core'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_mismatches,
    COUNT(DISTINCT user_id)::BIGINT AS affected_users,
    (
      SELECT request_path
      FROM copilot_audit.session_sync_logs
      WHERE created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
      GROUP BY request_path
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_path,
    jsonb_object_agg(
      request_path,
      path_count
    ) AS mismatch_count_by_path
  FROM (
    SELECT
      request_path,
      COUNT(*) AS path_count
    FROM copilot_audit.session_sync_logs
    WHERE created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
    GROUP BY request_path
  ) path_stats;
END;
$$;


ALTER FUNCTION "public"."get_session_sync_stats"("p_hours_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notification_count"() RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_count
  FROM copilot_core.notifications
  WHERE user_id = auth.uid() AND status = 'UNREAD';

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."get_unread_notification_count"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_unread_notification_count"() IS 'Returns the count of unread notifications for the current user.';



CREATE OR REPLACE FUNCTION "public"."get_user_notifications"("p_status" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "type" "text", "title" "text", "message" "text", "priority" "text", "status" "text", "action_url" "text", "metadata" "jsonb", "created_at" timestamp with time zone, "read_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id, n.type, n.title, n.message, n.priority, n.status,
    n.action_url, n.metadata, n.created_at, n.read_at
  FROM copilot_core.notifications n
  WHERE n.user_id = auth.uid()
    AND (p_status IS NULL OR n.status = p_status)
  ORDER BY
    CASE n.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END,
    n.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_user_notifications"("p_status" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_notifications"("p_status" "text", "p_limit" integer, "p_offset" integer) IS 'Gets notifications for the current user with optional status filter.';



CREATE OR REPLACE FUNCTION "public"."get_user_sessions"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "user_id" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "factor_id" "uuid", "aal" "text", "not_after" timestamp with time zone, "refreshed_at" timestamp with time zone, "user_agent" "text", "ip" "text", "tag" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
  SELECT
    s.id,
    s.user_id,
    s.created_at,
    s.updated_at,
    s.factor_id,
    s.aal::text,
    s.not_after,
    s.refreshed_at,
    s.user_agent,
    s.ip::text,
    s.tag
  FROM auth.sessions s
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC;
$$;


ALTER FUNCTION "public"."get_user_sessions"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_sessions"("p_user_id" "uuid") IS 'Returns all sessions for a user. Used by admin panel for session management. Requires service_role.';



CREATE OR REPLACE FUNCTION "public"."get_user_tenants"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "tenant_slug" "text", "tenant_type" "text", "user_role" "text", "is_current" boolean, "joined_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_current_tenant_id uuid;
BEGIN
  -- Get current tenant from preferences
  SELECT current_tenant_id INTO v_current_tenant_id
  FROM copilot_core.user_preferences
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.type,
    tm.role,
    (t.id = v_current_tenant_id),
    tm.joined_at
  FROM copilot_core.tenants t
  JOIN copilot_core.tenant_memberships tm ON t.id = tm.tenant_id
  WHERE tm.user_id = p_user_id
    AND tm.status = 'active'
    AND tm.deleted_at IS NULL
    AND t.deleted_at IS NULL
  ORDER BY t.name;
END;
$$;


ALTER FUNCTION "public"."get_user_tenants"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_workspace"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text", "p_invited_by" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_invitation_id uuid;
  v_token text;
  v_existing_user_id uuid;
  v_tenant_name text;
  v_tenant_slug text;
  v_app_url text;
BEGIN
  p_email := lower(trim(p_email));

  IF p_role NOT IN ('admin', 'member', 'viewer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role. Must be admin, member, or viewer.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = p_invited_by
      AND role IN ('owner', 'admin') AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only workspace owners and admins can invite members');
  END IF;

  SELECT name, slug INTO v_tenant_name, v_tenant_slug
  FROM copilot_core.tenants WHERE id = p_tenant_id AND deleted_at IS NULL;

  IF v_tenant_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workspace not found');
  END IF;

  SELECT id INTO v_existing_user_id FROM auth.users WHERE email = p_email;

  IF EXISTS (
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = v_existing_user_id
      AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already a member of this workspace');
  END IF;

  IF EXISTS (
    SELECT 1 FROM copilot_core.workspace_invitations
    WHERE tenant_id = p_tenant_id AND email = p_email
      AND accepted_at IS NULL AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already has a pending invitation to this workspace');
  END IF;

  INSERT INTO copilot_core.workspace_invitations (tenant_id, email, role, invited_by)
  VALUES (p_tenant_id, p_email, p_role, p_invited_by)
  RETURNING id, token INTO v_invitation_id, v_token;

  v_app_url := COALESCE(current_setting('app.base_url', true), 'http://localhost:3000');

  RETURN jsonb_build_object(
    'success', true,
    'invitation_id', v_invitation_id,
    'token', v_token,
    'email', p_email,
    'workspace_name', v_tenant_name,
    'workspace_slug', v_tenant_slug,
    'role', p_role,
    'expires_at', NOW() + INTERVAL '7 days',
    'invite_url', format('%s/invite/%s', v_app_url, v_token),
    'user_exists', v_existing_user_id IS NOT NULL
  );
END;
$$;


ALTER FUNCTION "public"."invite_user_to_workspace"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text", "p_invited_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_session_mismatch"("p_user_id" "uuid", "p_expected_tenant_id" "uuid", "p_actual_tenant_id" "uuid", "p_request_path" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_audit', 'copilot_core'
    AS $$
BEGIN
  INSERT INTO copilot_audit.session_sync_logs (
    user_id,
    expected_tenant_id,
    actual_tenant_id,
    request_path,
    created_at
  ) VALUES (
    p_user_id,
    p_expected_tenant_id,
    p_actual_tenant_id,
    p_request_path,
    NOW()
  );
END;
$$;


ALTER FUNCTION "public"."log_session_mismatch"("p_user_id" "uuid", "p_expected_tenant_id" "uuid", "p_actual_tenant_id" "uuid", "p_request_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'READ', read_at = NOW()
  WHERE user_id = auth.uid() AND status = 'UNREAD';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'marked_count', v_count);
END;
$$;


ALTER FUNCTION "public"."mark_all_notifications_read"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_all_notifications_read"() IS 'Marks all unread notifications as read for the current user.';



CREATE OR REPLACE FUNCTION "public"."mark_membership_events_processed"("p_user_id" "uuid", "p_event_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  UPDATE copilot_core.membership_change_events
  SET processed_at = NOW()
  WHERE user_id = p_user_id
    AND id = ANY(p_event_ids)
    AND processed_at IS NULL;
END;
$$;


ALTER FUNCTION "public"."mark_membership_events_processed"("p_user_id" "uuid", "p_event_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_membership_events_processed"("p_user_id" "uuid", "p_event_ids" "uuid"[]) IS 'Marks membership change events as processed after user acknowledges notifications';



CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  UPDATE copilot_core.notifications
  SET status = 'READ', read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND status = 'UNREAD';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notification not found or already read');
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'read_at', NOW());
END;
$$;


ALTER FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") IS 'Marks a notification as read for the current user.';



CREATE OR REPLACE FUNCTION "public"."restore_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_grace_period_expired boolean;
  v_tenant_name text;
  v_members_restored integer;
BEGIN
  -- Get deletion info
  SELECT deleted_at, deleted_by, name INTO v_deleted_at, v_deleted_by, v_tenant_name
  FROM copilot_core.tenants
  WHERE id = p_tenant_id;

  IF v_deleted_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Workspace is not deleted'
    );
  END IF;

  -- Check grace period (30 days)
  v_grace_period_expired := (NOW() - v_deleted_at) > INTERVAL '30 days';

  IF v_grace_period_expired THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Grace period expired - workspace cannot be restored',
      'deleted_at', v_deleted_at,
      'days_since_deletion', EXTRACT(DAY FROM (NOW() - v_deleted_at))
    );
  END IF;

  -- Verify user was owner or is the one who deleted it
  IF p_user_id != v_deleted_by THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only the user who deleted the workspace can restore it'
    );
  END IF;

  -- Restore workspace
  UPDATE copilot_core.tenants
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_tenant_id;

  -- Restore memberships
  UPDATE copilot_core.tenant_memberships
  SET deleted_at = NULL
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NOT NULL;

  -- Get count of restored memberships
  GET DIAGNOSTICS v_members_restored = ROW_COUNT;

  -- Log restoration event
  RAISE NOTICE 'Workspace restored: % (%) by user %, % members restored',
    v_tenant_name, p_tenant_id, p_user_id, v_members_restored;

  RETURN jsonb_build_object(
    'success', true,
    'restored_at', NOW(),
    'workspace_name', v_tenant_name,
    'members_restored', v_members_restored,
    'was_deleted_at', v_deleted_at
  );
END;
$$;


ALTER FUNCTION "public"."restore_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restore_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") IS 'Restores a soft-deleted workspace within 30-day grace period. Only the user who deleted it can restore.';



CREATE OR REPLACE FUNCTION "public"."revoke_all_user_sessions_except"("p_user_id" "uuid", "p_exclude_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
DECLARE
  v_revoked_count integer := 0;
BEGIN
  -- Delete all sessions for the user EXCEPT the excluded one
  DELETE FROM auth.sessions
  WHERE user_id = p_user_id
    AND id != p_exclude_session_id;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'revoked_count', v_revoked_count,
    'excluded_session_id', p_exclude_session_id,
    'revoked_at', NOW()
  );
END;
$$;


ALTER FUNCTION "public"."revoke_all_user_sessions_except"("p_user_id" "uuid", "p_exclude_session_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."revoke_all_user_sessions_except"("p_user_id" "uuid", "p_exclude_session_id" "uuid") IS 'Revokes all sessions for a user except the specified one. Used by admin panel for "logout other devices" feature. Requires service_role.';



CREATE OR REPLACE FUNCTION "public"."revoke_user_session"("p_user_id" "uuid", "p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
DECLARE
  v_deleted boolean := false;
BEGIN
  -- Verify the session belongs to the specified user
  DELETE FROM auth.sessions
  WHERE id = p_session_id
    AND user_id = p_user_id;

  v_deleted := FOUND;

  IF v_deleted THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'revoked_at', NOW()
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or already revoked'
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."revoke_user_session"("p_user_id" "uuid", "p_session_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."revoke_user_session"("p_user_id" "uuid", "p_session_id" "uuid") IS 'Revokes a specific session for a user. Used by admin panel. Requires service_role.';



CREATE OR REPLACE FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
DECLARE
  v_user_id uuid;
  v_membership_exists boolean;
  v_tenant_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify user has active membership in target tenant
  SELECT EXISTS(
    SELECT 1 FROM copilot_core.tenant_memberships
    WHERE user_id = v_user_id
      AND tenant_id = p_tenant_id
      AND status = 'active'
      AND deleted_at IS NULL
  ) INTO v_membership_exists;

  IF NOT v_membership_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have active membership in this workspace'
    );
  END IF;

  -- Get tenant name for response
  SELECT name INTO v_tenant_name
  FROM copilot_core.tenants
  WHERE id = p_tenant_id AND deleted_at IS NULL;

  -- Update user_preferences
  INSERT INTO copilot_core.user_preferences (user_id, current_tenant_id)
  VALUES (v_user_id, p_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET
    current_tenant_id = p_tenant_id,
    updated_at = NOW();

  -- Update user_tenant_contexts
  INSERT INTO copilot_core.user_tenant_contexts (user_id, current_tenant_id)
  VALUES (v_user_id, p_tenant_id)
  ON CONFLICT (user_id) DO UPDATE SET
    current_tenant_id = p_tenant_id,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name
  );
END;
$$;


ALTER FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_tenant_access"("p_user_id" "uuid", "p_tenant_id" "uuid") RETURNS TABLE("has_access" boolean, "role" "text", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'copilot_core'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (tm.status = 'active')::boolean,
    tm.role,
    tm.status
  FROM copilot_core.tenant_memberships tm
  WHERE tm.user_id = p_user_id
    AND tm.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
  END IF;
END;
$$;


ALTER FUNCTION "public"."verify_tenant_access"("p_user_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "copilot_billing"."e2b_cost_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execution_context_id" "uuid",
    "sandbox_id" "text" NOT NULL,
    "tier" "text" NOT NULL,
    "region" "text" DEFAULT 'us-east-1'::"text" NOT NULL,
    "execution_time_seconds" numeric(12,3) NOT NULL,
    "cpu_core_seconds" numeric(12,3),
    "memory_gb_seconds" numeric(12,3),
    "disk_io_gb" numeric(12,6),
    "network_io_gb" numeric(12,6),
    "execution_cost_usd" numeric(12,6) NOT NULL,
    "resource_cost_usd" numeric(12,6) DEFAULT 0,
    "total_cost_usd" numeric(12,6) NOT NULL,
    "is_estimated" boolean DEFAULT false NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "conversation_id" "uuid",
    "path_id" "uuid",
    "created_at_sandbox" timestamp with time zone,
    "terminated_at_sandbox" timestamp with time zone,
    "sandbox_status" "text",
    "success" boolean DEFAULT true,
    "error_message" "text",
    "operation_type" "text",
    CONSTRAINT "e2b_cost_records_cpu_core_seconds_check" CHECK (("cpu_core_seconds" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_records_disk_io_gb_check" CHECK (("disk_io_gb" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_records_execution_cost_usd_check" CHECK (("execution_cost_usd" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_records_execution_time_seconds_check" CHECK (("execution_time_seconds" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_records_memory_gb_seconds_check" CHECK (("memory_gb_seconds" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_records_network_io_gb_check" CHECK (("network_io_gb" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_records_resource_cost_usd_check" CHECK (("resource_cost_usd" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_records_sandbox_status_check" CHECK (("sandbox_status" = ANY (ARRAY['creating'::"text", 'ready'::"text", 'error'::"text", 'terminated'::"text"]))),
    CONSTRAINT "e2b_cost_records_total_cost_usd_check" CHECK (("total_cost_usd" >= (0)::numeric)),
    CONSTRAINT "positive_costs" CHECK ((("execution_cost_usd" >= (0)::numeric) AND ("total_cost_usd" >= (0)::numeric)))
);


ALTER TABLE "copilot_billing"."e2b_cost_records" OWNER TO "postgres";


COMMENT ON TABLE "copilot_billing"."e2b_cost_records" IS 'Individual E2B sandbox cost records with full attribution and resource usage';



COMMENT ON COLUMN "copilot_billing"."e2b_cost_records"."execution_time_seconds" IS 'Total execution/uptime of sandbox in seconds';



COMMENT ON COLUMN "copilot_billing"."e2b_cost_records"."cpu_core_seconds" IS 'CPU core-seconds consumed (cores * seconds)';



COMMENT ON COLUMN "copilot_billing"."e2b_cost_records"."memory_gb_seconds" IS 'Memory GB-seconds consumed (GB * seconds)';



CREATE TABLE IF NOT EXISTS "copilot_billing"."llm_cost_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer NOT NULL,
    "output_tokens" integer NOT NULL,
    "total_tokens" integer NOT NULL,
    "input_cost_usd" numeric(12,6) NOT NULL,
    "output_cost_usd" numeric(12,6) NOT NULL,
    "total_cost_usd" numeric(12,6) NOT NULL,
    "is_estimated" boolean DEFAULT false NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "task" "text",
    "conversation_id" "uuid",
    "cached" boolean DEFAULT false,
    "streaming" boolean DEFAULT false,
    "duration_ms" integer,
    "success" boolean DEFAULT true,
    CONSTRAINT "positive_costs" CHECK ((("input_cost_usd" >= (0)::numeric) AND ("output_cost_usd" >= (0)::numeric))),
    CONSTRAINT "positive_tokens" CHECK ((("input_tokens" >= 0) AND ("output_tokens" >= 0)))
);


ALTER TABLE "copilot_billing"."llm_cost_records" OWNER TO "postgres";


COMMENT ON TABLE "copilot_billing"."llm_cost_records" IS 'Individual LLM API call cost records with full attribution';



COMMENT ON COLUMN "copilot_billing"."llm_cost_records"."is_estimated" IS 'True if cost was estimated due to missing pricing data';



COMMENT ON COLUMN "copilot_billing"."llm_cost_records"."task" IS 'Touchpoint identifier (main-chat, merge-summarizer, agent:*, compaction:*, pii-sanitizer)';



CREATE OR REPLACE VIEW "copilot_analytics"."all_costs" AS
 SELECT 'llm'::"text" AS "cost_type",
    "llm_cost_records"."tenant_id",
    "llm_cost_records"."user_id",
    "llm_cost_records"."conversation_id",
    NULL::"uuid" AS "path_id",
    "llm_cost_records"."model",
    "llm_cost_records"."provider",
    "llm_cost_records"."input_tokens",
    "llm_cost_records"."output_tokens",
    "llm_cost_records"."total_cost_usd" AS "cost_usd",
    "llm_cost_records"."created_at"
   FROM "copilot_billing"."llm_cost_records"
UNION ALL
 SELECT 'e2b'::"text" AS "cost_type",
    "e2b_cost_records"."tenant_id",
    "e2b_cost_records"."user_id",
    "e2b_cost_records"."conversation_id",
    "e2b_cost_records"."path_id",
    "e2b_cost_records"."tier" AS "model",
    'e2b'::"text" AS "provider",
    0 AS "input_tokens",
    0 AS "output_tokens",
    "e2b_cost_records"."total_cost_usd" AS "cost_usd",
    "e2b_cost_records"."created_at"
   FROM "copilot_billing"."e2b_cost_records";


ALTER VIEW "copilot_analytics"."all_costs" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."all_costs" IS 'Unified view of all costs (LLM + E2B) for analytics and reporting';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_summary_by_tenant" AS
 SELECT "tenant_id",
    "count"(*) AS "request_count",
    "sum"("total_tokens") AS "total_tokens",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_request",
    "min"("timestamp") AS "first_request",
    "max"("timestamp") AS "last_request"
   FROM "copilot_billing"."llm_cost_records"
  WHERE ("tenant_id" IS NOT NULL)
  GROUP BY "tenant_id"
  ORDER BY ("sum"("total_cost_usd")) DESC;


ALTER VIEW "copilot_analytics"."cost_summary_by_tenant" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_summary_by_tenant" IS 'LLM costs grouped by tenant';



CREATE OR REPLACE VIEW "copilot_analytics"."e2b_cost_summary_by_tenant" AS
 SELECT "tenant_id",
    "count"(*) AS "sandbox_count",
    "sum"("execution_time_seconds") AS "total_execution_seconds",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_sandbox",
    "avg"("execution_time_seconds") AS "avg_execution_seconds",
    "min"("timestamp") AS "first_request",
    "max"("timestamp") AS "last_request",
    "count"(DISTINCT "conversation_id") AS "conversation_count",
    "count"(DISTINCT "user_id") AS "user_count"
   FROM "copilot_billing"."e2b_cost_records"
  WHERE ("tenant_id" IS NOT NULL)
  GROUP BY "tenant_id"
  ORDER BY ("sum"("total_cost_usd")) DESC;


ALTER VIEW "copilot_analytics"."e2b_cost_summary_by_tenant" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."e2b_cost_summary_by_tenant" IS 'E2B costs grouped by tenant';



CREATE OR REPLACE VIEW "copilot_analytics"."combined_cost_summary_by_tenant" AS
 SELECT COALESCE("llm"."tenant_id", "e2b"."tenant_id") AS "tenant_id",
    COALESCE("llm"."total_cost_usd", (0)::numeric) AS "llm_cost_usd",
    COALESCE("e2b"."total_cost_usd", (0)::numeric) AS "e2b_cost_usd",
    (COALESCE("llm"."total_cost_usd", (0)::numeric) + COALESCE("e2b"."total_cost_usd", (0)::numeric)) AS "total_cost_usd",
    "llm"."request_count" AS "llm_request_count",
    "e2b"."sandbox_count" AS "e2b_sandbox_count",
    GREATEST("llm"."last_request", "e2b"."last_request") AS "last_activity"
   FROM ("copilot_analytics"."cost_summary_by_tenant" "llm"
     FULL JOIN "copilot_analytics"."e2b_cost_summary_by_tenant" "e2b" ON (("llm"."tenant_id" = "e2b"."tenant_id")))
  ORDER BY (COALESCE("llm"."total_cost_usd", (0)::numeric) + COALESCE("e2b"."total_cost_usd", (0)::numeric)) DESC;


ALTER VIEW "copilot_analytics"."combined_cost_summary_by_tenant" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."combined_cost_summary_by_tenant" IS 'Combined LLM + E2B costs by tenant';



CREATE TABLE IF NOT EXISTS "copilot_core"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "description" "text",
    "type" "text" DEFAULT 'personal'::"text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "tenants_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'pro'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "tenants_type_check" CHECK (("type" = ANY (ARRAY['personal'::"text", 'team'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "valid_settings" CHECK (("jsonb_typeof"("settings") = 'object'::"text"))
);


ALTER TABLE "copilot_core"."tenants" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."tenants" IS 'Tenant organizations. Access: authenticated (SELECT, INSERT, UPDATE via RLS, no DELETE).';



COMMENT ON COLUMN "copilot_core"."tenants"."deleted_at" IS 'Soft delete timestamp. Non-null indicates workspace is deleted but data retained for 30 days.';



COMMENT ON COLUMN "copilot_core"."tenants"."deleted_by" IS 'User who initiated deletion. For audit trail.';



CREATE OR REPLACE VIEW "copilot_analytics"."e2b_cost_summary_by_workspace" AS
 SELECT "t"."id" AS "workspace_id",
    "t"."name" AS "workspace_name",
    "t"."slug" AS "workspace_slug",
    "t"."type" AS "workspace_type",
    "count"(*) AS "total_executions",
    "sum"("c"."total_cost_usd") AS "total_cost_usd",
    "sum"("c"."execution_time_seconds") AS "total_execution_seconds",
    "avg"("c"."total_cost_usd") AS "avg_cost_per_execution",
    "min"("c"."timestamp") AS "first_cost_at",
    "max"("c"."timestamp") AS "last_cost_at"
   FROM ("copilot_billing"."e2b_cost_records" "c"
     JOIN "copilot_core"."tenants" "t" ON (("c"."tenant_id" = "t"."id")))
  WHERE ("t"."deleted_at" IS NULL)
  GROUP BY "t"."id", "t"."name", "t"."slug", "t"."type";


ALTER VIEW "copilot_analytics"."e2b_cost_summary_by_workspace" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."e2b_cost_summary_by_workspace" IS 'E2B sandbox costs aggregated by workspace with tenant details';



CREATE OR REPLACE VIEW "copilot_analytics"."llm_cost_summary_by_workspace" AS
 SELECT "t"."id" AS "workspace_id",
    "t"."name" AS "workspace_name",
    "t"."slug" AS "workspace_slug",
    "t"."type" AS "workspace_type",
    "count"(*) AS "total_calls",
    "sum"("c"."total_cost_usd") AS "total_cost_usd",
    "sum"("c"."input_tokens") AS "total_input_tokens",
    "sum"("c"."output_tokens") AS "total_output_tokens",
    "avg"("c"."total_cost_usd") AS "avg_cost_per_call",
    "min"("c"."timestamp") AS "first_cost_at",
    "max"("c"."timestamp") AS "last_cost_at"
   FROM ("copilot_billing"."llm_cost_records" "c"
     JOIN "copilot_core"."tenants" "t" ON (("c"."tenant_id" = "t"."id")))
  WHERE ("t"."deleted_at" IS NULL)
  GROUP BY "t"."id", "t"."name", "t"."slug", "t"."type";


ALTER VIEW "copilot_analytics"."llm_cost_summary_by_workspace" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."llm_cost_summary_by_workspace" IS 'LLM costs aggregated by workspace with tenant details';



CREATE OR REPLACE VIEW "copilot_analytics"."combined_cost_summary_by_workspace" AS
 SELECT COALESCE("llm"."workspace_id", "e2b"."workspace_id") AS "workspace_id",
    COALESCE("llm"."workspace_name", "e2b"."workspace_name") AS "workspace_name",
    COALESCE("llm"."workspace_slug", "e2b"."workspace_slug") AS "workspace_slug",
    COALESCE("llm"."workspace_type", "e2b"."workspace_type") AS "workspace_type",
    COALESCE("llm"."total_cost_usd", (0)::numeric) AS "llm_cost_usd",
    COALESCE("e2b"."total_cost_usd", (0)::numeric) AS "e2b_cost_usd",
    (COALESCE("llm"."total_cost_usd", (0)::numeric) + COALESCE("e2b"."total_cost_usd", (0)::numeric)) AS "total_cost_usd",
    COALESCE("llm"."total_calls", (0)::bigint) AS "llm_calls",
    COALESCE("e2b"."total_executions", (0)::bigint) AS "e2b_executions"
   FROM ("copilot_analytics"."llm_cost_summary_by_workspace" "llm"
     FULL JOIN "copilot_analytics"."e2b_cost_summary_by_workspace" "e2b" ON (("llm"."workspace_id" = "e2b"."workspace_id")));


ALTER VIEW "copilot_analytics"."combined_cost_summary_by_workspace" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."combined_cost_summary_by_workspace" IS 'Combined LLM + E2B costs by workspace for comprehensive billing';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_by_conversation" AS
 SELECT "tenant_id",
    "conversation_id",
    "cost_type",
    "sum"("cost_usd") AS "total_cost_usd",
    "count"(*) AS "record_count",
    "min"("created_at") AS "first_cost_at",
    "max"("created_at") AS "last_cost_at"
   FROM "copilot_analytics"."all_costs"
  WHERE ("conversation_id" IS NOT NULL)
  GROUP BY "tenant_id", "conversation_id", "cost_type";


ALTER VIEW "copilot_analytics"."cost_by_conversation" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_by_conversation" IS 'Cost summaries grouped by conversation';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_by_tenant" AS
 SELECT "tenant_id",
    "cost_type",
    "sum"("cost_usd") AS "total_cost_usd",
    "count"(*) AS "record_count",
    "min"("created_at") AS "first_cost_at",
    "max"("created_at") AS "last_cost_at"
   FROM "copilot_analytics"."all_costs"
  GROUP BY "tenant_id", "cost_type";


ALTER VIEW "copilot_analytics"."cost_by_tenant" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_by_tenant" IS 'Cost summaries grouped by tenant and type (llm, e2b)';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_by_user" AS
 SELECT "tenant_id",
    "user_id",
    "cost_type",
    "sum"("cost_usd") AS "total_cost_usd",
    "count"(*) AS "record_count",
    "min"("created_at") AS "first_cost_at",
    "max"("created_at") AS "last_cost_at"
   FROM "copilot_analytics"."all_costs"
  GROUP BY "tenant_id", "user_id", "cost_type";


ALTER VIEW "copilot_analytics"."cost_by_user" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_by_user" IS 'Cost summaries grouped by tenant, user, and type';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_by_workspace" AS
 SELECT "t"."id" AS "workspace_id",
    "t"."name" AS "workspace_name",
    "t"."slug" AS "workspace_slug",
    "t"."type" AS "workspace_type",
    'llm'::"text" AS "cost_type",
    "sum"("c"."total_cost_usd") AS "total_cost_usd",
    "count"(*) AS "record_count",
    "min"("c"."timestamp") AS "first_record_at",
    "max"("c"."timestamp") AS "last_record_at"
   FROM ("copilot_billing"."llm_cost_records" "c"
     JOIN "copilot_core"."tenants" "t" ON (("c"."tenant_id" = "t"."id")))
  WHERE ("t"."deleted_at" IS NULL)
  GROUP BY "t"."id", "t"."name", "t"."slug", "t"."type"
UNION ALL
 SELECT "t"."id" AS "workspace_id",
    "t"."name" AS "workspace_name",
    "t"."slug" AS "workspace_slug",
    "t"."type" AS "workspace_type",
    'e2b'::"text" AS "cost_type",
    "sum"("c"."total_cost_usd") AS "total_cost_usd",
    "count"(*) AS "record_count",
    "min"("c"."timestamp") AS "first_record_at",
    "max"("c"."timestamp") AS "last_record_at"
   FROM ("copilot_billing"."e2b_cost_records" "c"
     JOIN "copilot_core"."tenants" "t" ON (("c"."tenant_id" = "t"."id")))
  WHERE ("t"."deleted_at" IS NULL)
  GROUP BY "t"."id", "t"."name", "t"."slug", "t"."type";


ALTER VIEW "copilot_analytics"."cost_by_workspace" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_by_workspace" IS 'All costs by workspace with cost type breakdown (llm, e2b)';



CREATE TABLE IF NOT EXISTS "copilot_billing"."e2b_cost_estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tier" "text" NOT NULL,
    "region" "text" DEFAULT 'us-east-1'::"text" NOT NULL,
    "operation_type" "text" NOT NULL,
    "expected_duration_seconds" integer NOT NULL,
    "estimated_cost_usd" numeric(10,6) NOT NULL,
    "confidence_level" "text" NOT NULL,
    "description" "text",
    "assumptions" "text",
    "effective_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "e2b_cost_estimates_confidence_level_check" CHECK (("confidence_level" = ANY (ARRAY['conservative'::"text", 'typical'::"text", 'optimistic'::"text"]))),
    CONSTRAINT "e2b_cost_estimates_estimated_cost_usd_check" CHECK (("estimated_cost_usd" >= (0)::numeric)),
    CONSTRAINT "e2b_cost_estimates_expected_duration_seconds_check" CHECK (("expected_duration_seconds" > 0)),
    CONSTRAINT "e2b_cost_estimates_tier_check" CHECK (("tier" = ANY (ARRAY['standard'::"text", 'gpu'::"text", 'high-memory'::"text", 'high-cpu'::"text"])))
);


ALTER TABLE "copilot_billing"."e2b_cost_estimates" OWNER TO "postgres";


COMMENT ON TABLE "copilot_billing"."e2b_cost_estimates" IS 'Pre-calculated E2B cost estimates for quota checks before sandbox creation';



COMMENT ON COLUMN "copilot_billing"."e2b_cost_estimates"."operation_type" IS 'Operation pattern: standard_session, extended_session, quick_task, long_running';



COMMENT ON COLUMN "copilot_billing"."e2b_cost_estimates"."expected_duration_seconds" IS 'Expected operation duration for matching estimates';



COMMENT ON COLUMN "copilot_billing"."e2b_cost_estimates"."confidence_level" IS 'Estimate confidence: conservative (over-estimate), typical, optimistic (under-estimate)';



CREATE TABLE IF NOT EXISTS "copilot_billing"."llm_cost_estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "operation_type" "text" NOT NULL,
    "estimated_cost_usd" numeric(10,6) NOT NULL,
    "confidence_level" "text" NOT NULL,
    "description" "text",
    "assumptions" "text",
    "effective_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "llm_cost_estimates_confidence_level_check" CHECK (("confidence_level" = ANY (ARRAY['conservative'::"text", 'typical'::"text", 'optimistic'::"text"]))),
    CONSTRAINT "llm_cost_estimates_estimated_cost_usd_check" CHECK (("estimated_cost_usd" >= (0)::numeric))
);


ALTER TABLE "copilot_billing"."llm_cost_estimates" OWNER TO "postgres";


COMMENT ON TABLE "copilot_billing"."llm_cost_estimates" IS 'Pre-calculated LLM cost estimates for quota checks before requests';



COMMENT ON COLUMN "copilot_billing"."llm_cost_estimates"."operation_type" IS 'Operation pattern: chat, completion, embedding, tool_use';



COMMENT ON COLUMN "copilot_billing"."llm_cost_estimates"."confidence_level" IS 'Estimate confidence: conservative (over-estimate), typical, optimistic (under-estimate)';



COMMENT ON COLUMN "copilot_billing"."llm_cost_estimates"."assumptions" IS 'Documentation of assumptions (e.g., expected token counts)';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_estimates" AS
 SELECT 'llm'::"text" AS "estimate_type",
    "llm_cost_estimates"."provider",
    "llm_cost_estimates"."model",
    "llm_cost_estimates"."operation_type",
    NULL::integer AS "expected_duration_seconds",
    "llm_cost_estimates"."estimated_cost_usd",
    "llm_cost_estimates"."confidence_level",
    "llm_cost_estimates"."description",
    "llm_cost_estimates"."assumptions",
    "llm_cost_estimates"."effective_date",
    "llm_cost_estimates"."expires_at",
    "llm_cost_estimates"."created_at",
    "llm_cost_estimates"."updated_at"
   FROM "copilot_billing"."llm_cost_estimates"
UNION ALL
 SELECT 'e2b'::"text" AS "estimate_type",
    'e2b'::"text" AS "provider",
    "e2b_cost_estimates"."tier" AS "model",
    "e2b_cost_estimates"."operation_type",
    "e2b_cost_estimates"."expected_duration_seconds",
    "e2b_cost_estimates"."estimated_cost_usd",
    "e2b_cost_estimates"."confidence_level",
    "e2b_cost_estimates"."description",
    "e2b_cost_estimates"."assumptions",
    "e2b_cost_estimates"."effective_date",
    "e2b_cost_estimates"."expires_at",
    "e2b_cost_estimates"."created_at",
    "e2b_cost_estimates"."updated_at"
   FROM "copilot_billing"."e2b_cost_estimates";


ALTER VIEW "copilot_analytics"."cost_estimates" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_estimates" IS 'Estimated costs for operations before execution (combines LLM and E2B)';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_summary_by_model" AS
 SELECT "provider",
    "model",
    "count"(*) AS "request_count",
    "sum"("total_tokens") AS "total_tokens",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_request",
    "min"("timestamp") AS "first_request",
    "max"("timestamp") AS "last_request"
   FROM "copilot_billing"."llm_cost_records"
  GROUP BY "provider", "model"
  ORDER BY ("sum"("total_cost_usd")) DESC;


ALTER VIEW "copilot_analytics"."cost_summary_by_model" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_summary_by_model" IS 'LLM costs grouped by provider/model';



CREATE OR REPLACE VIEW "copilot_analytics"."cost_summary_by_task" AS
 SELECT "task",
    "count"(*) AS "request_count",
    "sum"("total_tokens") AS "total_tokens",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_request",
    "min"("timestamp") AS "first_request",
    "max"("timestamp") AS "last_request"
   FROM "copilot_billing"."llm_cost_records"
  WHERE ("task" IS NOT NULL)
  GROUP BY "task"
  ORDER BY ("sum"("total_cost_usd")) DESC;


ALTER VIEW "copilot_analytics"."cost_summary_by_task" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."cost_summary_by_task" IS 'LLM costs grouped by task type';



CREATE OR REPLACE VIEW "copilot_analytics"."e2b_cost_summary_by_conversation" AS
 SELECT "conversation_id",
    "tenant_id",
    "count"(*) AS "sandbox_count",
    "sum"("execution_time_seconds") AS "total_execution_seconds",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_sandbox",
    "min"("timestamp") AS "first_execution",
    "max"("timestamp") AS "last_execution",
    "count"(DISTINCT "path_id") AS "path_count"
   FROM "copilot_billing"."e2b_cost_records"
  WHERE ("conversation_id" IS NOT NULL)
  GROUP BY "conversation_id", "tenant_id"
  ORDER BY ("sum"("total_cost_usd")) DESC;


ALTER VIEW "copilot_analytics"."e2b_cost_summary_by_conversation" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."e2b_cost_summary_by_conversation" IS 'E2B costs grouped by conversation';



CREATE OR REPLACE VIEW "copilot_analytics"."e2b_cost_summary_by_tier" AS
 SELECT "tier",
    "region",
    "count"(*) AS "sandbox_count",
    "sum"("execution_time_seconds") AS "total_execution_seconds",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_sandbox",
    "avg"("execution_time_seconds") AS "avg_execution_seconds",
    "min"("timestamp") AS "first_request",
    "max"("timestamp") AS "last_request"
   FROM "copilot_billing"."e2b_cost_records"
  GROUP BY "tier", "region"
  ORDER BY ("sum"("total_cost_usd")) DESC;


ALTER VIEW "copilot_analytics"."e2b_cost_summary_by_tier" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."e2b_cost_summary_by_tier" IS 'E2B costs grouped by sandbox tier';



CREATE OR REPLACE VIEW "copilot_analytics"."e2b_costs" AS
 SELECT "id",
    "timestamp",
    "created_at",
    "execution_context_id",
    "sandbox_id",
    "tier",
    "region",
    "execution_time_seconds",
    "cpu_core_seconds",
    "memory_gb_seconds",
    "disk_io_gb",
    "network_io_gb",
    "execution_cost_usd",
    "resource_cost_usd",
    "total_cost_usd",
    "is_estimated",
    "tenant_id",
    "user_id",
    "conversation_id",
    "path_id",
    "created_at_sandbox",
    "terminated_at_sandbox",
    "sandbox_status",
    "success",
    "error_message",
    "operation_type"
   FROM "copilot_billing"."e2b_cost_records";


ALTER VIEW "copilot_analytics"."e2b_costs" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."e2b_costs" IS 'Direct read-only access to E2B sandbox cost records';



CREATE OR REPLACE VIEW "copilot_analytics"."e2b_costs_daily" AS
 SELECT "tenant_id",
    "date"("created_at") AS "date",
    "tier" AS "sandbox_tier",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "count"(*) AS "execution_count"
   FROM "copilot_billing"."e2b_cost_records"
  GROUP BY "tenant_id", ("date"("created_at")), "tier";


ALTER VIEW "copilot_analytics"."e2b_costs_daily" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."e2b_costs_daily" IS 'Daily E2B cost trends for time-series analysis';



CREATE OR REPLACE VIEW "copilot_analytics"."e2b_sandbox_usage" AS
 SELECT "tenant_id",
    "tier" AS "sandbox_tier",
    "count"(*) AS "execution_count",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_execution",
    "min"("created_at") AS "first_used_at",
    "max"("created_at") AS "last_used_at"
   FROM "copilot_billing"."e2b_cost_records"
  GROUP BY "tenant_id", "tier";


ALTER VIEW "copilot_analytics"."e2b_sandbox_usage" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."e2b_sandbox_usage" IS 'E2B sandbox usage statistics aggregated by tenant and template';



CREATE OR REPLACE VIEW "copilot_analytics"."llm_costs" AS
 SELECT "id",
    "timestamp",
    "created_at",
    "provider",
    "model",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "input_cost_usd",
    "output_cost_usd",
    "total_cost_usd",
    "is_estimated",
    "tenant_id",
    "user_id",
    "task",
    "conversation_id",
    "cached",
    "streaming",
    "duration_ms",
    "success"
   FROM "copilot_billing"."llm_cost_records";


ALTER VIEW "copilot_analytics"."llm_costs" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."llm_costs" IS 'Direct read-only access to LLM cost records';



CREATE OR REPLACE VIEW "copilot_analytics"."llm_costs_daily" AS
 SELECT "tenant_id",
    "date"("created_at") AS "date",
    "model",
    "provider",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "sum"("input_tokens") AS "total_input_tokens",
    "sum"("output_tokens") AS "total_output_tokens",
    "count"(*) AS "request_count"
   FROM "copilot_billing"."llm_cost_records"
  GROUP BY "tenant_id", ("date"("created_at")), "model", "provider";


ALTER VIEW "copilot_analytics"."llm_costs_daily" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."llm_costs_daily" IS 'Daily LLM cost trends for time-series analysis';



CREATE OR REPLACE VIEW "copilot_analytics"."llm_model_usage" AS
 SELECT "tenant_id",
    "model",
    "provider",
    "count"(*) AS "request_count",
    "sum"("input_tokens") AS "total_input_tokens",
    "sum"("output_tokens") AS "total_output_tokens",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "avg"("total_cost_usd") AS "avg_cost_per_request",
    "min"("created_at") AS "first_used_at",
    "max"("created_at") AS "last_used_at"
   FROM "copilot_billing"."llm_cost_records"
  GROUP BY "tenant_id", "model", "provider";


ALTER VIEW "copilot_analytics"."llm_model_usage" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."llm_model_usage" IS 'LLM model usage statistics aggregated by tenant, model, and provider';



CREATE TABLE IF NOT EXISTS "copilot_billing"."cost_quotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "scope_id" "uuid",
    "limit_usd" numeric(12,6) NOT NULL,
    "period" "text" NOT NULL,
    "current_spend_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "warning_threshold" numeric(3,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resource_type" "text" DEFAULT 'llm'::"text" NOT NULL,
    CONSTRAINT "cost_quotas_period_check" CHECK (("period" = ANY (ARRAY['hour'::"text", 'day'::"text", 'week'::"text", 'month'::"text"]))),
    CONSTRAINT "cost_quotas_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['llm'::"text", 'e2b'::"text", 'all'::"text"]))),
    CONSTRAINT "cost_quotas_scope_check" CHECK (("scope" = ANY (ARRAY['platform'::"text", 'tenant'::"text", 'user'::"text"]))),
    CONSTRAINT "cost_quotas_warning_threshold_check" CHECK ((("warning_threshold" >= (0)::numeric) AND ("warning_threshold" <= (1)::numeric)))
);


ALTER TABLE "copilot_billing"."cost_quotas" OWNER TO "postgres";


COMMENT ON TABLE "copilot_billing"."cost_quotas" IS 'Spending limits and tracking per scope (platform/tenant/user)';



COMMENT ON COLUMN "copilot_billing"."cost_quotas"."resource_type" IS 'Type of resource: llm (language models), e2b (sandboxes), or all (combined limit)';



CREATE OR REPLACE VIEW "copilot_analytics"."quota_status" AS
 SELECT
        CASE
            WHEN ("scope" = 'tenant'::"text") THEN "scope_id"
            ELSE NULL::"uuid"
        END AS "tenant_id",
        CASE
            WHEN ("scope" = 'user'::"text") THEN "scope_id"
            ELSE NULL::"uuid"
        END AS "user_id",
    "scope",
    "resource_type",
    "period" AS "quota_period",
    "limit_usd" AS "limit_value",
    "current_spend_usd" AS "current_usage",
        CASE
            WHEN ("limit_usd" > (0)::numeric) THEN (((("current_spend_usd")::double precision / ("limit_usd")::double precision) * (100)::double precision))::numeric(5,2)
            ELSE (0)::numeric
        END AS "usage_percent",
        CASE
            WHEN (("limit_usd" > (0)::numeric) AND ("current_spend_usd" >= "limit_usd")) THEN 'exceeded'::"text"
            WHEN (("limit_usd" > (0)::numeric) AND ((("current_spend_usd")::double precision / ("limit_usd")::double precision) > (0.9)::double precision)) THEN 'warning'::"text"
            WHEN (("limit_usd" > (0)::numeric) AND ((("current_spend_usd")::double precision / ("limit_usd")::double precision) > (0.75)::double precision)) THEN 'caution'::"text"
            ELSE 'ok'::"text"
        END AS "status",
    "period_start",
    "period_end",
    "created_at",
    "updated_at"
   FROM "copilot_billing"."cost_quotas" "q";


ALTER VIEW "copilot_analytics"."quota_status" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."quota_status" IS 'Quota usage with status indicators (ok/caution/warning/exceeded)';



CREATE TABLE IF NOT EXISTS "copilot_analytics"."slow_query_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "tenant_id" "uuid",
    "query_type" "text" NOT NULL,
    "table_name" "text",
    "function_name" "text",
    "execution_time_ms" numeric NOT NULL,
    "query_params" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "copilot_analytics"."slow_query_log" OWNER TO "postgres";


COMMENT ON TABLE "copilot_analytics"."slow_query_log" IS 'Logs slow queries for performance monitoring. Helps identify RLS policy bottlenecks and query optimization opportunities.';



CREATE TABLE IF NOT EXISTS "copilot_core"."tenant_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "joined_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "tenant_memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"]))),
    CONSTRAINT "tenant_memberships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text", 'removed'::"text"])))
);


ALTER TABLE "copilot_core"."tenant_memberships" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."tenant_memberships" IS 'User-tenant membership relationships. Access: authenticated (SELECT, INSERT, UPDATE via RLS, no DELETE).';



COMMENT ON COLUMN "copilot_core"."tenant_memberships"."deleted_at" IS 'Soft delete timestamp. Set when workspace is deleted or membership is removed.';



CREATE OR REPLACE VIEW "copilot_analytics"."rls_performance_summary" AS
 SELECT "t"."name" AS "tenant_name",
    "t"."id" AS "tenant_id",
    "count"(DISTINCT "tm"."user_id") AS "user_count",
    "count"("tm"."id") AS "membership_count",
    COALESCE("avg"("sq"."execution_time_ms"), (0)::numeric) AS "avg_query_time_24h_ms"
   FROM (("copilot_core"."tenants" "t"
     LEFT JOIN "copilot_core"."tenant_memberships" "tm" ON (("t"."id" = "tm"."tenant_id")))
     LEFT JOIN "copilot_analytics"."slow_query_log" "sq" ON ((("sq"."tenant_id" = "t"."id") AND ("sq"."created_at" >= ("now"() - '24:00:00'::interval)))))
  WHERE ("t"."deleted_at" IS NULL)
  GROUP BY "t"."id", "t"."name"
  ORDER BY COALESCE("avg"("sq"."execution_time_ms"), (0)::numeric) DESC NULLS LAST;


ALTER VIEW "copilot_analytics"."rls_performance_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "copilot_analytics"."tenant_total_costs" AS
 SELECT "tenant_id",
    "sum"("total_cost_usd") AS "total_cost_usd",
    "sum"("record_count") AS "total_records",
    "min"("first_cost_at") AS "first_cost_at",
    "max"("last_cost_at") AS "last_cost_at"
   FROM "copilot_analytics"."cost_by_tenant"
  GROUP BY "tenant_id";


ALTER VIEW "copilot_analytics"."tenant_total_costs" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."tenant_total_costs" IS 'Total costs across all sources aggregated by tenant';



CREATE OR REPLACE VIEW "copilot_analytics"."top_spending_tenants" AS
 SELECT "t"."id" AS "tenant_id",
    "t"."name" AS "tenant_name",
    "t"."type" AS "tenant_type",
    "t"."plan",
    COALESCE("c"."total_cost_usd", (0)::numeric) AS "total_cost_usd",
    COALESCE("c"."total_records", (0)::numeric) AS "total_records"
   FROM ("copilot_core"."tenants" "t"
     LEFT JOIN "copilot_analytics"."tenant_total_costs" "c" ON (("c"."tenant_id" = "t"."id")))
  ORDER BY COALESCE("c"."total_cost_usd", (0)::numeric) DESC;


ALTER VIEW "copilot_analytics"."top_spending_tenants" OWNER TO "postgres";


COMMENT ON VIEW "copilot_analytics"."top_spending_tenants" IS 'Tenants ranked by total spending across all cost sources';



CREATE TABLE IF NOT EXISTS "copilot_audit"."compaction_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_id" "uuid",
    "path_id" "uuid",
    "tenant_id" "uuid",
    "user_id" "uuid",
    "strategy" "text" NOT NULL,
    "triggered_by" "text" DEFAULT 'manual'::"text" NOT NULL,
    "tokens_before" integer NOT NULL,
    "tokens_after" integer NOT NULL,
    "tokens_saved" integer GENERATED ALWAYS AS (("tokens_before" - "tokens_after")) STORED,
    "messages_before" integer NOT NULL,
    "messages_after" integer NOT NULL,
    "messages_removed" integer GENERATED ALWAYS AS (("messages_before" - "messages_after")) STORED,
    "messages_summarized" integer DEFAULT 0 NOT NULL,
    "pinned_preserved" integer DEFAULT 0 NOT NULL,
    "duration_ms" integer,
    "used_llm" boolean DEFAULT false NOT NULL,
    "cost_usd" numeric(12,6) DEFAULT 0,
    "compression_ratio" numeric(5,4) GENERATED ALWAYS AS (
CASE
    WHEN ("tokens_before" > 0) THEN (("tokens_after")::numeric / ("tokens_before")::numeric)
    ELSE (1)::numeric
END) STORED,
    "success" boolean DEFAULT true NOT NULL,
    "error" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "copilot_audit"."compaction_operations" OWNER TO "postgres";


COMMENT ON TABLE "copilot_audit"."compaction_operations" IS 'Stores historical records of conversation compaction operations. Service role has full access, authenticated users have tenant-scoped access via RLS.';



COMMENT ON COLUMN "copilot_audit"."compaction_operations"."strategy" IS 'Compaction strategy used: none, sliding_window, semantic, hybrid, minimal, moderate, aggressive';



COMMENT ON COLUMN "copilot_audit"."compaction_operations"."triggered_by" IS 'How the compaction was triggered: auto (background job) or manual (user/API request)';



COMMENT ON COLUMN "copilot_audit"."compaction_operations"."compression_ratio" IS 'Ratio of tokens_after/tokens_before. Lower is better compression (0.5 = 50% of original size)';



CREATE TABLE IF NOT EXISTS "copilot_audit"."permission_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "target_user_email" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "actor_email" "text" NOT NULL,
    "actor_role" "text" NOT NULL,
    "action" "text" NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "changes" "jsonb",
    "reason" "text",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "permission_audit_log_action_check" CHECK (("action" = ANY (ARRAY['permission_config_created'::"text", 'permission_config_updated'::"text", 'permission_config_deleted'::"text", 'group_added'::"text", 'group_removed'::"text", 'permission_granted'::"text", 'permission_revoked'::"text", 'revocation_added'::"text", 'revocation_removed'::"text", 'role_changed'::"text"])))
);


ALTER TABLE "copilot_audit"."permission_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "copilot_audit"."permission_audit_log" IS 'Audit trail for all permission configuration changes. Required for SOC2 compliance.';



CREATE TABLE IF NOT EXISTS "copilot_audit"."session_sync_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expected_tenant_id" "uuid" NOT NULL,
    "actual_tenant_id" "uuid",
    "request_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "copilot_audit"."session_sync_logs" OWNER TO "postgres";


COMMENT ON TABLE "copilot_audit"."session_sync_logs" IS 'Tracks cases where JWT currentTenantId does not match database current_tenant_id. Used for monitoring session sync issues during workspace switching.';



COMMENT ON COLUMN "copilot_audit"."session_sync_logs"."expected_tenant_id" IS 'The tenant_id from database (source of truth)';



COMMENT ON COLUMN "copilot_audit"."session_sync_logs"."actual_tenant_id" IS 'The currentTenantId from JWT (may be stale)';



CREATE TABLE IF NOT EXISTS "copilot_billing"."e2b_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tier" "text" NOT NULL,
    "region" "text" DEFAULT 'us-east-1'::"text" NOT NULL,
    "price_per_second" numeric(12,8) NOT NULL,
    "price_per_gb_memory_hour" numeric(12,8),
    "price_per_cpu_core_hour" numeric(12,8),
    "price_per_gb_disk_io" numeric(12,8),
    "effective_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "e2b_pricing_price_per_cpu_core_hour_check" CHECK (("price_per_cpu_core_hour" >= (0)::numeric)),
    CONSTRAINT "e2b_pricing_price_per_gb_disk_io_check" CHECK (("price_per_gb_disk_io" >= (0)::numeric)),
    CONSTRAINT "e2b_pricing_price_per_gb_memory_hour_check" CHECK (("price_per_gb_memory_hour" >= (0)::numeric)),
    CONSTRAINT "e2b_pricing_price_per_second_check" CHECK (("price_per_second" >= (0)::numeric)),
    CONSTRAINT "e2b_pricing_tier_check" CHECK (("tier" = ANY (ARRAY['standard'::"text", 'gpu'::"text", 'high-memory'::"text", 'high-cpu'::"text"])))
);


ALTER TABLE "copilot_billing"."e2b_pricing" OWNER TO "postgres";


COMMENT ON TABLE "copilot_billing"."e2b_pricing" IS 'Dynamic pricing configuration for E2B sandboxes by tier and region';



COMMENT ON COLUMN "copilot_billing"."e2b_pricing"."tier" IS 'Sandbox tier: standard, gpu, high-memory, high-cpu';



COMMENT ON COLUMN "copilot_billing"."e2b_pricing"."price_per_second" IS 'Base price per second of execution time (USD)';



CREATE TABLE IF NOT EXISTS "copilot_billing"."model_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_price_per_million" numeric(12,6) NOT NULL,
    "output_price_per_million" numeric(12,6) NOT NULL,
    "effective_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "model_pricing_input_price_per_million_check" CHECK (("input_price_per_million" >= (0)::numeric)),
    CONSTRAINT "model_pricing_output_price_per_million_check" CHECK (("output_price_per_million" >= (0)::numeric))
);


ALTER TABLE "copilot_billing"."model_pricing" OWNER TO "postgres";


COMMENT ON TABLE "copilot_billing"."model_pricing" IS 'LLM model pricing configuration - allows dynamic pricing updates without code deployment';



COMMENT ON COLUMN "copilot_billing"."model_pricing"."provider" IS 'LLM provider: openai, anthropic, google, groq, etc.';



COMMENT ON COLUMN "copilot_billing"."model_pricing"."model" IS 'Model identifier (normalized): gpt-4, claude-3-opus-20240229, etc.';



COMMENT ON COLUMN "copilot_billing"."model_pricing"."input_price_per_million" IS 'Price per 1M input tokens in USD';



COMMENT ON COLUMN "copilot_billing"."model_pricing"."output_price_per_million" IS 'Price per 1M output tokens in USD';



COMMENT ON COLUMN "copilot_billing"."model_pricing"."effective_date" IS 'When this pricing became effective';



COMMENT ON COLUMN "copilot_billing"."model_pricing"."expires_at" IS 'When this pricing expires (NULL = current)';



CREATE TABLE IF NOT EXISTS "copilot_core"."conversation_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "config_level" "text" NOT NULL,
    "merge_compression_strategy" "text" DEFAULT 'moderate'::"text" NOT NULL,
    "merge_max_messages" integer,
    "merge_preserve_pinned" boolean,
    "path_compression_strategy" "text" DEFAULT 'sliding_window'::"text" NOT NULL,
    "path_max_messages" integer,
    "path_sliding_window_size" integer,
    "path_compression_threshold" numeric,
    "auto_compact_enabled" boolean,
    "compaction_interval_minutes" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "conversation_configs_config_level_check" CHECK (("config_level" = ANY (ARRAY['global'::"text", 'tenant'::"text", 'user'::"text"]))),
    CONSTRAINT "conversation_configs_merge_compression_strategy_check" CHECK (("merge_compression_strategy" = ANY (ARRAY['none'::"text", 'minimal'::"text", 'moderate'::"text", 'aggressive'::"text"]))),
    CONSTRAINT "conversation_configs_path_compression_strategy_check" CHECK (("path_compression_strategy" = ANY (ARRAY['none'::"text", 'sliding_window'::"text", 'semantic'::"text", 'hybrid'::"text"])))
);


ALTER TABLE "copilot_core"."conversation_configs" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."conversation_configs" IS 'Configuration for conversation compaction and summarization at global, tenant, and user levels';



COMMENT ON COLUMN "copilot_core"."conversation_configs"."config_level" IS 'Configuration scope: global, tenant, or user';



COMMENT ON COLUMN "copilot_core"."conversation_configs"."merge_compression_strategy" IS 'Compression strategy for branch merges: none, minimal, moderate, aggressive';



COMMENT ON COLUMN "copilot_core"."conversation_configs"."path_compression_strategy" IS 'Compression strategy for active paths: none, sliding_window, semantic, hybrid';



CREATE TABLE IF NOT EXISTS "copilot_core"."conversation_contexts" (
    "conversation_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "active_node_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "summary" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "trace_id" "text",
    "root_span_name" "text",
    "root_span_id" "text"
);


ALTER TABLE "copilot_core"."conversation_contexts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "copilot_core"."conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "path_id" "uuid" NOT NULL,
    "sequence_in_path" integer,
    "is_branch_point" boolean DEFAULT false NOT NULL,
    "branched_to_paths" "uuid"[] DEFAULT '{}'::"uuid"[],
    "message_type" "text" DEFAULT 'standard'::"text" NOT NULL,
    "trace_id" "text",
    "root_span_name" "text",
    "root_span_id" "text",
    "is_pinned" boolean DEFAULT false NOT NULL,
    "pinned_at" timestamp with time zone,
    "pinned_by" "uuid",
    CONSTRAINT "conversation_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['standard'::"text", 'merge_summary'::"text", 'branch_point'::"text", 'system'::"text"]))),
    CONSTRAINT "conversation_messages_role_check" CHECK (("role" = ANY (ARRAY['system'::"text", 'user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "copilot_core"."conversation_messages" OWNER TO "postgres";


COMMENT ON COLUMN "copilot_core"."conversation_messages"."is_pinned" IS 'Whether this message is pinned to prevent compaction';



COMMENT ON COLUMN "copilot_core"."conversation_messages"."pinned_at" IS 'When the message was pinned';



COMMENT ON COLUMN "copilot_core"."conversation_messages"."pinned_by" IS 'User who pinned the message';



CREATE TABLE IF NOT EXISTS "copilot_core"."conversation_paths" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "parent_path_id" "uuid",
    "branch_point_message_id" "uuid",
    "name" "text",
    "description" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "merged_to_path_id" "uuid",
    "merged_at" timestamp with time zone,
    "merge_summary_message_id" "uuid",
    "merge_mode" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_paths_merge_mode_check" CHECK ((("merge_mode" IS NULL) OR ("merge_mode" = ANY (ARRAY['summary'::"text", 'full'::"text", 'selective'::"text"]))))
);


ALTER TABLE "copilot_core"."conversation_paths" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "copilot_core"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "share_audience" "text" DEFAULT 'private'::"text" NOT NULL,
    "tenant_access" "text" DEFAULT 'view'::"text" NOT NULL,
    "authorization_model" "text" DEFAULT 'supabase_rbac'::"text" NOT NULL,
    "authorization_spec" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "title" "text",
    "persona_id" "text",
    "jurisdictions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone,
    "active_path_id" "uuid",
    "archived_at" timestamp with time zone,
    "trace_id" "text",
    "root_span_name" "text",
    "root_span_id" "text",
    CONSTRAINT "conversations_authorization_model_check" CHECK (("authorization_model" = ANY (ARRAY['supabase_rbac'::"text", 'openfga'::"text"]))),
    CONSTRAINT "conversations_share_audience_check" CHECK (("share_audience" = ANY (ARRAY['private'::"text", 'tenant'::"text", 'public'::"text"]))),
    CONSTRAINT "conversations_tenant_access_check" CHECK (("tenant_access" = ANY (ARRAY['view'::"text", 'edit'::"text"])))
);


ALTER TABLE "copilot_core"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "copilot_core"."execution_contexts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "path_id" "uuid" NOT NULL,
    "sandbox_id" "text" NOT NULL,
    "sandbox_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "terminated_at" timestamp with time zone,
    "error_message" "text",
    "resource_usage" "jsonb",
    CONSTRAINT "execution_contexts_sandbox_status_check" CHECK (("sandbox_status" = ANY (ARRAY['creating'::"text", 'ready'::"text", 'error'::"text", 'terminated'::"text"])))
);


ALTER TABLE "copilot_core"."execution_contexts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "copilot_core"."membership_change_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "old_role" "text",
    "new_role" "text",
    "old_status" "text",
    "new_status" "text",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "membership_change_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['added'::"text", 'removed'::"text", 'role_changed'::"text", 'suspended'::"text", 'reactivated'::"text", 'status_changed'::"text"])))
);


ALTER TABLE "copilot_core"."membership_change_events" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."membership_change_events" IS 'Tracks membership changes for session invalidation and user notifications. Enables immediate response to membership removal or role changes.';



COMMENT ON COLUMN "copilot_core"."membership_change_events"."event_type" IS 'Type of membership change: added, removed, role_changed, suspended, reactivated, status_changed';



COMMENT ON COLUMN "copilot_core"."membership_change_events"."processed_at" IS 'When user acknowledged this event. NULL = pending notification';



CREATE TABLE IF NOT EXISTS "copilot_core"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "priority" "text" DEFAULT 'MEDIUM'::"text" NOT NULL,
    "status" "text" DEFAULT 'UNREAD'::"text" NOT NULL,
    "action_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    CONSTRAINT "notifications_action_url_check" CHECK ((("action_url" IS NULL) OR ("char_length"("action_url") <= 2000))),
    CONSTRAINT "notifications_message_check" CHECK (("char_length"("message") <= 2000)),
    CONSTRAINT "notifications_priority_check" CHECK (("priority" = ANY (ARRAY['CRITICAL'::"text", 'HIGH'::"text", 'MEDIUM'::"text", 'LOW'::"text"]))),
    CONSTRAINT "notifications_status_check" CHECK (("status" = ANY (ARRAY['UNREAD'::"text", 'READ'::"text", 'DISMISSED'::"text", 'ARCHIVED'::"text"]))),
    CONSTRAINT "notifications_title_check" CHECK (("char_length"("title") <= 200)),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['USER_INVITED'::"text", 'USER_REMOVED'::"text", 'ROLE_CHANGED'::"text", 'SECURITY_ALERT'::"text", 'LOGIN_ALERT'::"text", 'PASSWORD_CHANGED'::"text", 'PERMISSION_CHANGE'::"text", 'COMPLIANCE_ALERT'::"text", 'SYSTEM_UPDATE'::"text", 'REPORT_READY'::"text", 'WORKSPACE_CREATED'::"text", 'WORKSPACE_DELETED'::"text"]))),
    CONSTRAINT "valid_archived_status" CHECK ((("status" <> 'ARCHIVED'::"text") OR ("archived_at" IS NOT NULL))),
    CONSTRAINT "valid_read_status" CHECK (((("status" = ANY (ARRAY['UNREAD'::"text", 'DISMISSED'::"text"])) AND ("read_at" IS NULL)) OR (("status" = ANY (ARRAY['READ'::"text", 'ARCHIVED'::"text"])) AND ("read_at" IS NOT NULL))))
);


ALTER TABLE "copilot_core"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."notifications" IS 'User notifications for copilot-admin. Delivered via SSE using reg-intel-admin event hubs.';



CREATE TABLE IF NOT EXISTS "copilot_core"."personas" (
    "id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "jurisdictions" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "copilot_core"."personas" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."personas" IS 'User-defined AI personas. Access: service_role only (no direct client access).';



CREATE TABLE IF NOT EXISTS "copilot_core"."platform_admin_permissions" (
    "user_id" "uuid" NOT NULL,
    "additional_groups" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "permission_grants" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "permission_revocations" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "reason" "text",
    CONSTRAINT "valid_additional_groups" CHECK ((("array_length"("additional_groups", 1) IS NULL) OR ("array_length"("additional_groups", 1) <= 50))),
    CONSTRAINT "valid_permission_grants" CHECK ((("array_length"("permission_grants", 1) IS NULL) OR ("array_length"("permission_grants", 1) <= 100))),
    CONSTRAINT "valid_permission_revocations" CHECK ((("array_length"("permission_revocations", 1) IS NULL) OR ("array_length"("permission_revocations", 1) <= 100)))
);


ALTER TABLE "copilot_core"."platform_admin_permissions" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."platform_admin_permissions" IS 'Per-user permission configurations that override or extend role defaults. Part of the Hybrid RBAC system.';



COMMENT ON COLUMN "copilot_core"."platform_admin_permissions"."additional_groups" IS 'Permission groups assigned beyond the user''s role defaults (e.g., ["data_export", "cross_tenant_access"])';



COMMENT ON COLUMN "copilot_core"."platform_admin_permissions"."permission_grants" IS 'Individual permissions granted beyond role and groups (e.g., ["audit.export"])';



COMMENT ON COLUMN "copilot_core"."platform_admin_permissions"."permission_revocations" IS 'Individual permissions revoked from role and groups (e.g., ["billing.view_invoices"])';



CREATE TABLE IF NOT EXISTS "copilot_core"."platform_admins" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "tenant_id" "uuid",
    "assigned_tenant_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_login" timestamp with time zone,
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'platform_engineer'::"text", 'account_manager'::"text", 'compliance_auditor'::"text", 'support_tier_3'::"text", 'support_tier_2'::"text", 'support_tier_1'::"text", 'viewer'::"text"]))),
    CONSTRAINT "admin_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'pending'::"text"])))
);


ALTER TABLE "copilot_core"."platform_admins" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."platform_admins" IS 'Admin user profiles with role assignments. Part of the Hybrid RBAC system with 8 role levels.';



CREATE TABLE IF NOT EXISTS "copilot_core"."quick_prompts" (
    "id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "scenario_hint" "text",
    "persona_filter" "text"[],
    "jurisdictions" "text"[]
);


ALTER TABLE "copilot_core"."quick_prompts" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."quick_prompts" IS 'Quick prompt templates. Access: service_role only (no direct client access).';



CREATE TABLE IF NOT EXISTS "copilot_core"."tenant_llm_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "default_model" "text" NOT NULL,
    "default_provider" "text" NOT NULL,
    "allow_remote_egress" boolean DEFAULT true NOT NULL,
    "egress_mode" "text",
    "allow_off_mode" boolean DEFAULT false,
    "tasks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "user_policies" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "tenant_llm_policies_egress_mode_check" CHECK (("egress_mode" = ANY (ARRAY['off'::"text", 'audit'::"text", 'enforce'::"text"]))),
    CONSTRAINT "valid_tasks" CHECK (("jsonb_typeof"("tasks") = 'array'::"text")),
    CONSTRAINT "valid_user_policies" CHECK (("jsonb_typeof"("user_policies") = 'object'::"text"))
);


ALTER TABLE "copilot_core"."tenant_llm_policies" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."tenant_llm_policies" IS 'Tenant-specific LLM routing policies. Access: authenticated (SELECT only via RLS).';



COMMENT ON COLUMN "copilot_core"."tenant_llm_policies"."tasks" IS 'Array of task-specific model/provider overrides';



COMMENT ON COLUMN "copilot_core"."tenant_llm_policies"."user_policies" IS 'Per-user egress mode overrides';



CREATE TABLE IF NOT EXISTS "copilot_core"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "current_tenant_id" "uuid",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_preferences" CHECK (("jsonb_typeof"("preferences") = 'object'::"text"))
);


ALTER TABLE "copilot_core"."user_preferences" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."user_preferences" IS 'User-specific settings including current tenant selection';



CREATE TABLE IF NOT EXISTS "copilot_core"."user_tenant_contexts" (
    "user_id" "uuid" NOT NULL,
    "current_tenant_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "copilot_core"."user_tenant_contexts" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."user_tenant_contexts" IS 'Tracks the current active tenant for each user. Updated when user switches workspaces. Used to detect session/DB inconsistencies.';



COMMENT ON COLUMN "copilot_core"."user_tenant_contexts"."current_tenant_id" IS 'The currently active tenant_id for this user (database source of truth)';



CREATE TABLE IF NOT EXISTS "copilot_core"."workspace_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_invitations_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "copilot_core"."workspace_invitations" OWNER TO "postgres";


COMMENT ON TABLE "copilot_core"."workspace_invitations" IS 'Workspace invitation tracking. 7-day expiry. Uses Supabase Auth for user creation.';



CREATE OR REPLACE VIEW "public"."conversation_contexts_view" AS
 WITH "request_context" AS (
         SELECT "public"."current_tenant_id"() AS "tenant_id",
            "auth"."role"() AS "requester_role"
        )
 SELECT "cc"."conversation_id",
    "cc"."tenant_id",
    "cc"."active_node_ids",
    "cc"."summary",
    "cc"."updated_at"
   FROM ("copilot_core"."conversation_contexts" "cc"
     CROSS JOIN "request_context" "ctx")
  WHERE (("ctx"."requester_role" = 'service_role'::"text") OR (("ctx"."tenant_id" IS NOT NULL) AND ("cc"."tenant_id" = "ctx"."tenant_id")));


ALTER VIEW "public"."conversation_contexts_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."conversation_contexts_view" IS 'Tenant-scoped conversation context state';



CREATE OR REPLACE VIEW "public"."conversation_messages_view" AS
 WITH "request_context" AS (
         SELECT "public"."current_tenant_id"() AS "tenant_id",
            "auth"."role"() AS "requester_role"
        )
 SELECT "m"."id",
    "m"."conversation_id",
    "m"."tenant_id",
    "m"."user_id",
    "m"."role",
    "m"."content",
    "m"."metadata",
    "m"."trace_id",
    "m"."root_span_name",
    "m"."root_span_id",
    "m"."created_at",
    "m"."path_id",
    "m"."sequence_in_path",
    "m"."is_branch_point",
    "m"."branched_to_paths",
    "m"."message_type"
   FROM ("copilot_core"."conversation_messages" "m"
     CROSS JOIN "request_context" "ctx")
  WHERE (("ctx"."requester_role" = 'service_role'::"text") OR (("ctx"."tenant_id" IS NOT NULL) AND ("m"."tenant_id" = "ctx"."tenant_id")));


ALTER VIEW "public"."conversation_messages_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."conversation_messages_view" IS 'Tenant-scoped message queries for PostgREST API';



CREATE OR REPLACE VIEW "public"."conversation_paths_view" AS
 WITH "request_context" AS (
         SELECT "public"."current_tenant_id"() AS "tenant_id",
            "auth"."role"() AS "requester_role"
        )
 SELECT "p"."id",
    "p"."conversation_id",
    "p"."tenant_id",
    "p"."parent_path_id",
    "p"."branch_point_message_id",
    "p"."name",
    "p"."description",
    "p"."is_primary",
    "p"."is_active",
    "p"."merged_to_path_id",
    "p"."merged_at",
    "p"."merge_summary_message_id",
    "p"."merge_mode",
    "p"."created_at",
    "p"."updated_at",
    ( SELECT "count"(*) AS "count"
           FROM "copilot_core"."conversation_messages" "m"
          WHERE ("m"."path_id" = "p"."id")) AS "message_count",
    ( SELECT "count"(*) AS "count"
           FROM "copilot_core"."conversation_paths" "cp"
          WHERE (("cp"."parent_path_id" = "p"."id") AND ("cp"."is_active" = true))) AS "branch_count"
   FROM ("copilot_core"."conversation_paths" "p"
     CROSS JOIN "request_context" "ctx")
  WHERE (("ctx"."requester_role" = 'service_role'::"text") OR (("ctx"."tenant_id" IS NOT NULL) AND ("p"."tenant_id" = "ctx"."tenant_id")));


ALTER VIEW "public"."conversation_paths_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."conversation_paths_view" IS 'Tenant-scoped path queries with computed fields';



CREATE OR REPLACE VIEW "public"."conversations_view" AS
 WITH "request_context" AS (
         SELECT "public"."current_tenant_id"() AS "tenant_id",
            "auth"."role"() AS "requester_role"
        )
 SELECT "c"."id",
    "c"."tenant_id",
    "c"."user_id",
    "c"."share_audience",
    "c"."tenant_access",
    "c"."authorization_model",
    "c"."authorization_spec",
    "c"."title",
    "c"."persona_id",
    "c"."jurisdictions",
    "c"."archived_at",
    "c"."created_at",
    "c"."updated_at",
    "c"."last_message_at",
    "c"."active_path_id"
   FROM ("copilot_core"."conversations" "c"
     CROSS JOIN "request_context" "ctx")
  WHERE (("ctx"."requester_role" = 'service_role'::"text") OR (("ctx"."tenant_id" IS NOT NULL) AND ("c"."tenant_id" = "ctx"."tenant_id")));


ALTER VIEW "public"."conversations_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."conversations_view" IS 'Tenant-scoped conversation queries for PostgREST API';



CREATE OR REPLACE VIEW "public"."execution_contexts_view" AS
 WITH "request_context" AS (
         SELECT "public"."current_tenant_id"() AS "tenant_id",
            "auth"."role"() AS "requester_role"
        )
 SELECT "ec"."id",
    "ec"."tenant_id",
    "ec"."conversation_id",
    "ec"."path_id",
    "ec"."sandbox_id",
    "ec"."sandbox_status",
    "ec"."created_at",
    "ec"."last_used_at",
    "ec"."expires_at",
    "ec"."terminated_at",
    "ec"."error_message",
    "ec"."resource_usage",
    (("ec"."expires_at" < "now"()) AND ("ec"."terminated_at" IS NULL)) AS "is_expired",
    (EXTRACT(epoch FROM ("ec"."expires_at" - "now"())))::integer AS "seconds_until_expiry",
    (EXTRACT(epoch FROM ("now"() - "ec"."created_at")))::integer AS "age_seconds"
   FROM ("copilot_core"."execution_contexts" "ec"
     CROSS JOIN "request_context" "ctx")
  WHERE (("ctx"."requester_role" = 'service_role'::"text") OR (("ctx"."tenant_id" IS NOT NULL) AND ("ec"."tenant_id" = "ctx"."tenant_id")));


ALTER VIEW "public"."execution_contexts_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."execution_contexts_view" IS 'E2B sandbox lifecycle tracking with computed fields';



CREATE OR REPLACE VIEW "public"."personas_view" AS
 SELECT "id",
    "label",
    "description",
    "jurisdictions"
   FROM "copilot_core"."personas" "p";


ALTER VIEW "public"."personas_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."personas_view" IS 'AI personas - global reference data';



CREATE OR REPLACE VIEW "public"."quick_prompts_view" AS
 SELECT "id",
    "label",
    "prompt",
    "scenario_hint",
    "persona_filter",
    "jurisdictions"
   FROM "copilot_core"."quick_prompts" "q";


ALTER VIEW "public"."quick_prompts_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."quick_prompts_view" IS 'Prompt templates - global reference data';



CREATE OR REPLACE VIEW "public"."schema_inventory" AS
 SELECT "nspname" AS "schema_name",
        CASE
            WHEN ("nspname" = 'copilot_core'::"name") THEN 'Core application tables with RLS'::"text"
            WHEN ("nspname" = 'copilot_admin'::"name") THEN 'Platform administration (service_role only)'::"text"
            WHEN ("nspname" = 'copilot_audit'::"name") THEN 'SOC2/GDPR compliance logs (append-only)'::"text"
            WHEN ("nspname" = 'copilot_billing'::"name") THEN 'Cost tracking and quotas'::"text"
            WHEN ("nspname" = 'copilot_metrics'::"name") THEN 'Analytics views (read-only)'::"text"
            WHEN ("nspname" = 'public'::"name") THEN 'PostgREST API views and functions'::"text"
            ELSE 'Other'::"text"
        END AS "description",
    ( SELECT "count"(*) AS "count"
           FROM "information_schema"."tables" "t"
          WHERE ((("t"."table_schema")::"name" = "n"."nspname") AND (("t"."table_type")::"text" = 'BASE TABLE'::"text"))) AS "table_count",
    ( SELECT "count"(*) AS "count"
           FROM "information_schema"."views" "v"
          WHERE (("v"."table_schema")::"name" = "n"."nspname")) AS "view_count",
    ( SELECT "count"(*) AS "count"
           FROM ("pg_proc" "p"
             JOIN "pg_namespace" "pn" ON (("p"."pronamespace" = "pn"."oid")))
          WHERE ("pn"."nspname" = "n"."nspname")) AS "function_count"
   FROM "pg_namespace" "n"
  WHERE ("nspname" = ANY (ARRAY['copilot_core'::"name", 'copilot_admin'::"name", 'copilot_audit'::"name", 'copilot_billing'::"name", 'copilot_metrics'::"name", 'public'::"name"]))
  ORDER BY
        CASE "nspname"
            WHEN 'copilot_core'::"name" THEN 1
            WHEN 'copilot_admin'::"name" THEN 2
            WHEN 'copilot_audit'::"name" THEN 3
            WHEN 'copilot_billing'::"name" THEN 4
            WHEN 'copilot_metrics'::"name" THEN 5
            WHEN 'public'::"name" THEN 6
            ELSE NULL::integer
        END;


ALTER VIEW "public"."schema_inventory" OWNER TO "postgres";


COMMENT ON VIEW "public"."schema_inventory" IS 'Summary of application schemas after SOC2/GDPR reorganization';



CREATE OR REPLACE VIEW "public"."user_tenants_view" AS
 SELECT "t"."id" AS "tenant_id",
    "t"."name" AS "tenant_name",
    "t"."slug" AS "tenant_slug",
    "t"."type" AS "tenant_type",
    "t"."plan" AS "tenant_plan",
    "t"."owner_id",
    "tm"."user_id",
    "tm"."role",
    "tm"."status" AS "membership_status",
    "tm"."joined_at",
    ("t"."id" = "up"."current_tenant_id") AS "is_active",
    "t"."created_at" AS "tenant_created_at"
   FROM (("copilot_core"."tenants" "t"
     JOIN "copilot_core"."tenant_memberships" "tm" ON (("tm"."tenant_id" = "t"."id")))
     LEFT JOIN "copilot_core"."user_preferences" "up" ON (("up"."user_id" = "tm"."user_id")))
  WHERE (("t"."deleted_at" IS NULL) AND ("tm"."status" = 'active'::"text") AND ("tm"."user_id" = "auth"."uid"()));


ALTER VIEW "public"."user_tenants_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."user_tenants_view" IS 'Workspaces accessible to the current user with full tenant details';



ALTER TABLE ONLY "copilot_analytics"."slow_query_log"
    ADD CONSTRAINT "slow_query_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_audit"."compaction_operations"
    ADD CONSTRAINT "compaction_operations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_audit"."permission_audit_log"
    ADD CONSTRAINT "permission_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_audit"."session_sync_logs"
    ADD CONSTRAINT "session_sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."cost_quotas"
    ADD CONSTRAINT "cost_quotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."e2b_cost_estimates"
    ADD CONSTRAINT "e2b_cost_estimates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."e2b_cost_records"
    ADD CONSTRAINT "e2b_cost_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."e2b_pricing"
    ADD CONSTRAINT "e2b_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."llm_cost_estimates"
    ADD CONSTRAINT "llm_cost_estimates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."llm_cost_records"
    ADD CONSTRAINT "llm_cost_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."model_pricing"
    ADD CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_billing"."e2b_pricing"
    ADD CONSTRAINT "unique_active_pricing" UNIQUE ("tier", "region", "effective_date");



ALTER TABLE ONLY "copilot_billing"."e2b_cost_estimates"
    ADD CONSTRAINT "unique_e2b_cost_estimate" UNIQUE ("tier", "region", "operation_type", "confidence_level");



ALTER TABLE ONLY "copilot_billing"."llm_cost_estimates"
    ADD CONSTRAINT "unique_llm_cost_estimate" UNIQUE ("provider", "model", "operation_type", "confidence_level");



ALTER TABLE ONLY "copilot_billing"."model_pricing"
    ADD CONSTRAINT "unique_model_pricing" UNIQUE ("provider", "model", "effective_date");



ALTER TABLE ONLY "copilot_billing"."cost_quotas"
    ADD CONSTRAINT "unique_quota_scope" UNIQUE ("scope", "scope_id", "resource_type");



ALTER TABLE ONLY "copilot_core"."platform_admin_permissions"
    ADD CONSTRAINT "admin_permission_configs_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "copilot_core"."platform_admins"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."conversation_configs"
    ADD CONSTRAINT "conversation_configs_config_level_tenant_id_user_id_key" UNIQUE ("config_level", "tenant_id", "user_id");



ALTER TABLE ONLY "copilot_core"."conversation_configs"
    ADD CONSTRAINT "conversation_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."conversation_contexts"
    ADD CONSTRAINT "conversation_contexts_pkey" PRIMARY KEY ("conversation_id");



ALTER TABLE ONLY "copilot_core"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."conversation_paths"
    ADD CONSTRAINT "conversation_paths_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."execution_contexts"
    ADD CONSTRAINT "execution_contexts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."membership_change_events"
    ADD CONSTRAINT "membership_change_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."personas"
    ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."quick_prompts"
    ADD CONSTRAINT "quick_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."tenant_llm_policies"
    ADD CONSTRAINT "tenant_llm_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."tenant_llm_policies"
    ADD CONSTRAINT "tenant_llm_policies_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "copilot_core"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "copilot_core"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "copilot_core"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "copilot_core"."user_tenant_contexts"
    ADD CONSTRAINT "user_tenant_contexts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "copilot_core"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "copilot_core"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_token_key" UNIQUE ("token");



CREATE INDEX "idx_slow_query_log_created" ON "copilot_analytics"."slow_query_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_slow_query_log_execution_time" ON "copilot_analytics"."slow_query_log" USING "btree" ("execution_time_ms" DESC);



CREATE INDEX "idx_slow_query_log_tenant" ON "copilot_analytics"."slow_query_log" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_slow_query_log_user" ON "copilot_analytics"."slow_query_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_compaction_ops_conversation" ON "copilot_audit"."compaction_operations" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "idx_compaction_ops_strategy" ON "copilot_audit"."compaction_operations" USING "btree" ("strategy");



CREATE INDEX "idx_compaction_ops_success" ON "copilot_audit"."compaction_operations" USING "btree" ("success");



CREATE INDEX "idx_compaction_ops_tenant" ON "copilot_audit"."compaction_operations" USING "btree" ("tenant_id") WHERE ("tenant_id" IS NOT NULL);



CREATE INDEX "idx_compaction_ops_time_strategy" ON "copilot_audit"."compaction_operations" USING "btree" ("timestamp" DESC, "strategy");



CREATE INDEX "idx_compaction_ops_timestamp" ON "copilot_audit"."compaction_operations" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_permission_audit_action" ON "copilot_audit"."permission_audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "idx_permission_audit_actor" ON "copilot_audit"."permission_audit_log" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "idx_permission_audit_created_at" ON "copilot_audit"."permission_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_permission_audit_target_user" ON "copilot_audit"."permission_audit_log" USING "btree" ("target_user_id", "created_at" DESC);



CREATE INDEX "idx_session_sync_logs_created" ON "copilot_audit"."session_sync_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_session_sync_logs_user" ON "copilot_audit"."session_sync_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_cost_quotas_resource_type" ON "copilot_billing"."cost_quotas" USING "btree" ("resource_type");



CREATE INDEX "idx_cost_quotas_scope" ON "copilot_billing"."cost_quotas" USING "btree" ("scope");



CREATE INDEX "idx_cost_quotas_scope_id" ON "copilot_billing"."cost_quotas" USING "btree" ("scope_id");



CREATE INDEX "idx_cost_quotas_scope_resource" ON "copilot_billing"."cost_quotas" USING "btree" ("scope", "scope_id", "resource_type") WHERE ("scope_id" IS NOT NULL);



CREATE INDEX "idx_cost_records_conversation" ON "copilot_billing"."llm_cost_records" USING "btree" ("conversation_id");



CREATE INDEX "idx_cost_records_provider_model" ON "copilot_billing"."llm_cost_records" USING "btree" ("provider", "model");



CREATE INDEX "idx_cost_records_task" ON "copilot_billing"."llm_cost_records" USING "btree" ("task");



CREATE INDEX "idx_cost_records_tenant" ON "copilot_billing"."llm_cost_records" USING "btree" ("tenant_id");



CREATE INDEX "idx_cost_records_tenant_timestamp" ON "copilot_billing"."llm_cost_records" USING "btree" ("tenant_id", "timestamp" DESC);



CREATE INDEX "idx_cost_records_timestamp" ON "copilot_billing"."llm_cost_records" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_cost_records_user" ON "copilot_billing"."llm_cost_records" USING "btree" ("user_id");



CREATE INDEX "idx_e2b_cost_estimates_lookup" ON "copilot_billing"."e2b_cost_estimates" USING "btree" ("tier", "region", "operation_type", "confidence_level", "effective_date" DESC);



CREATE INDEX "idx_e2b_cost_records_context" ON "copilot_billing"."e2b_cost_records" USING "btree" ("execution_context_id", "timestamp" DESC);



CREATE INDEX "idx_e2b_cost_records_conversation" ON "copilot_billing"."e2b_cost_records" USING "btree" ("conversation_id");



CREATE INDEX "idx_e2b_cost_records_path" ON "copilot_billing"."e2b_cost_records" USING "btree" ("path_id");



CREATE INDEX "idx_e2b_cost_records_sandbox" ON "copilot_billing"."e2b_cost_records" USING "btree" ("sandbox_id");



CREATE INDEX "idx_e2b_cost_records_tenant" ON "copilot_billing"."e2b_cost_records" USING "btree" ("tenant_id");



CREATE INDEX "idx_e2b_cost_records_tenant_created" ON "copilot_billing"."e2b_cost_records" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_e2b_cost_records_tenant_timestamp" ON "copilot_billing"."e2b_cost_records" USING "btree" ("tenant_id", "timestamp" DESC);



CREATE INDEX "idx_e2b_cost_records_tier" ON "copilot_billing"."e2b_cost_records" USING "btree" ("tier", "region");



CREATE INDEX "idx_e2b_cost_records_timestamp" ON "copilot_billing"."e2b_cost_records" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_e2b_cost_records_user" ON "copilot_billing"."e2b_cost_records" USING "btree" ("user_id");



CREATE INDEX "idx_e2b_pricing_tier_region" ON "copilot_billing"."e2b_pricing" USING "btree" ("tier", "region", "effective_date" DESC);



CREATE INDEX "idx_llm_cost_estimates_lookup" ON "copilot_billing"."llm_cost_estimates" USING "btree" ("provider", "model", "operation_type", "confidence_level", "effective_date" DESC);



CREATE INDEX "idx_llm_cost_records_conversation" ON "copilot_billing"."llm_cost_records" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "idx_llm_cost_records_tenant_created" ON "copilot_billing"."llm_cost_records" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_model_pricing_active" ON "copilot_billing"."model_pricing" USING "btree" ("provider", "model", "effective_date" DESC) WHERE ("expires_at" IS NULL);



CREATE INDEX "idx_model_pricing_provider" ON "copilot_billing"."model_pricing" USING "btree" ("provider", "effective_date" DESC);



CREATE INDEX "idx_model_pricing_provider_model" ON "copilot_billing"."model_pricing" USING "btree" ("provider", "model", "effective_date" DESC);



CREATE INDEX "conversation_contexts_archived_idx" ON "copilot_core"."conversation_contexts" USING "btree" ("archived_at");



CREATE INDEX "conversation_contexts_tenant_idx" ON "copilot_core"."conversation_contexts" USING "btree" ("tenant_id");



CREATE INDEX "conversation_messages_conversation_idx" ON "copilot_core"."conversation_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "conversations_archived_idx" ON "copilot_core"."conversations" USING "btree" ("archived_at");



CREATE INDEX "conversations_tenant_idx" ON "copilot_core"."conversations" USING "btree" ("tenant_id", "user_id", "created_at" DESC);



CREATE INDEX "idx_admin_users_email" ON "copilot_core"."platform_admins" USING "btree" ("email");



CREATE INDEX "idx_admin_users_role" ON "copilot_core"."platform_admins" USING "btree" ("role");



CREATE INDEX "idx_admin_users_status" ON "copilot_core"."platform_admins" USING "btree" ("status");



CREATE INDEX "idx_admin_users_tenant_id" ON "copilot_core"."platform_admins" USING "btree" ("tenant_id");



CREATE INDEX "idx_conversation_configs_global" ON "copilot_core"."conversation_configs" USING "btree" ("config_level") WHERE ("config_level" = 'global'::"text");



CREATE INDEX "idx_conversation_configs_tenant" ON "copilot_core"."conversation_configs" USING "btree" ("tenant_id") WHERE ("config_level" = ANY (ARRAY['tenant'::"text", 'user'::"text"]));



CREATE INDEX "idx_conversation_configs_user" ON "copilot_core"."conversation_configs" USING "btree" ("tenant_id", "user_id") WHERE ("config_level" = 'user'::"text");



CREATE INDEX "idx_conversation_messages_pinned" ON "copilot_core"."conversation_messages" USING "btree" ("conversation_id", "path_id", "is_pinned") WHERE ("is_pinned" = true);



CREATE INDEX "idx_conversation_messages_pinned_by" ON "copilot_core"."conversation_messages" USING "btree" ("pinned_by", "pinned_at") WHERE ("is_pinned" = true);



CREATE INDEX "idx_conversation_messages_tenant_conv" ON "copilot_core"."conversation_messages" USING "btree" ("tenant_id", "conversation_id");



COMMENT ON INDEX "copilot_core"."idx_conversation_messages_tenant_conv" IS 'Optimizes RLS policies on conversation_messages table. Supports filtering by tenant_id and conversation_id.';



CREATE UNIQUE INDEX "idx_conversation_paths_primary" ON "copilot_core"."conversation_paths" USING "btree" ("conversation_id") WHERE ("is_primary" = true);



CREATE INDEX "idx_conversation_paths_tenant" ON "copilot_core"."conversation_paths" USING "btree" ("tenant_id");



CREATE INDEX "idx_conversations_tenant_user" ON "copilot_core"."conversations" USING "btree" ("tenant_id", "user_id");



COMMENT ON INDEX "copilot_core"."idx_conversations_tenant_user" IS 'Optimizes RLS policies on conversations table. Supports filtering by tenant_id and user_id.';



CREATE INDEX "idx_execution_contexts_conversation" ON "copilot_core"."execution_contexts" USING "btree" ("conversation_id");



CREATE INDEX "idx_execution_contexts_expires" ON "copilot_core"."execution_contexts" USING "btree" ("expires_at") WHERE ("terminated_at" IS NULL);



CREATE INDEX "idx_execution_contexts_path" ON "copilot_core"."execution_contexts" USING "btree" ("path_id");



CREATE INDEX "idx_execution_contexts_sandbox" ON "copilot_core"."execution_contexts" USING "btree" ("sandbox_id");



CREATE INDEX "idx_execution_contexts_tenant" ON "copilot_core"."execution_contexts" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_execution_contexts_unique_active_path" ON "copilot_core"."execution_contexts" USING "btree" ("tenant_id", "conversation_id", "path_id") WHERE ("terminated_at" IS NULL);



COMMENT ON INDEX "copilot_core"."idx_execution_contexts_unique_active_path" IS 'Ensures only one active execution context per path. Allows multiple terminated contexts for the same path for historical tracking.';



CREATE INDEX "idx_membership_events_created" ON "copilot_core"."membership_change_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_membership_events_tenant" ON "copilot_core"."membership_change_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_membership_events_user" ON "copilot_core"."membership_change_events" USING "btree" ("user_id", "processed_at");



CREATE INDEX "idx_memberships_tenant_role_user" ON "copilot_core"."tenant_memberships" USING "btree" ("tenant_id", "role", "user_id") WHERE ("status" = 'active'::"text");



COMMENT ON INDEX "copilot_core"."idx_memberships_tenant_role_user" IS 'Optimizes RLS policies that check user roles within tenants. Supports queries filtering by tenant_id and role.';



CREATE INDEX "idx_memberships_user_tenant_status" ON "copilot_core"."tenant_memberships" USING "btree" ("user_id", "tenant_id", "status") WHERE ("status" = 'active'::"text");



COMMENT ON INDEX "copilot_core"."idx_memberships_user_tenant_status" IS 'Optimizes RLS policies that check user membership in specific tenants. Covering index for (user_id, tenant_id, status) with partial index on active status.';



CREATE INDEX "idx_messages_branch_points" ON "copilot_core"."conversation_messages" USING "btree" ("conversation_id", "is_branch_point") WHERE ("is_branch_point" = true);



CREATE INDEX "idx_messages_path_sequence" ON "copilot_core"."conversation_messages" USING "btree" ("path_id", "sequence_in_path") WHERE ("path_id" IS NOT NULL);



CREATE INDEX "idx_notifications_priority" ON "copilot_core"."notifications" USING "btree" ("user_id", "priority") WHERE ("status" = 'UNREAD'::"text");



CREATE INDEX "idx_notifications_tenant" ON "copilot_core"."notifications" USING "btree" ("tenant_id");



CREATE INDEX "idx_notifications_user_created" ON "copilot_core"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_status" ON "copilot_core"."notifications" USING "btree" ("user_id", "status");



CREATE INDEX "idx_notifications_user_unread" ON "copilot_core"."notifications" USING "btree" ("user_id") WHERE ("status" = 'UNREAD'::"text");



CREATE INDEX "idx_paths_conversation" ON "copilot_core"."conversation_paths" USING "btree" ("conversation_id", "is_active");



CREATE INDEX "idx_paths_merged" ON "copilot_core"."conversation_paths" USING "btree" ("merged_to_path_id") WHERE ("merged_to_path_id" IS NOT NULL);



CREATE INDEX "idx_paths_parent" ON "copilot_core"."conversation_paths" USING "btree" ("parent_path_id") WHERE ("parent_path_id" IS NOT NULL);



CREATE INDEX "idx_permission_configs_updated_at" ON "copilot_core"."platform_admin_permissions" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_permission_configs_updated_by" ON "copilot_core"."platform_admin_permissions" USING "btree" ("updated_by");



CREATE INDEX "idx_tenant_llm_policies_tenant" ON "copilot_core"."tenant_llm_policies" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_memberships_deleted_at" ON "copilot_core"."tenant_memberships" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_tenant_memberships_status" ON "copilot_core"."tenant_memberships" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_tenant_memberships_tenant" ON "copilot_core"."tenant_memberships" USING "btree" ("tenant_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_tenant_memberships_user" ON "copilot_core"."tenant_memberships" USING "btree" ("user_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_tenants_deleted_at" ON "copilot_core"."tenants" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_tenants_owner" ON "copilot_core"."tenants" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tenants_owner_active" ON "copilot_core"."tenants" USING "btree" ("owner_id", "id") WHERE ("deleted_at" IS NULL);



COMMENT ON INDEX "copilot_core"."idx_tenants_owner_active" IS 'Optimizes tenant ownership checks in RLS policies. Covering index for (owner_id, id) excluding deleted tenants.';



CREATE INDEX "idx_tenants_slug" ON "copilot_core"."tenants" USING "btree" ("slug") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tenants_type" ON "copilot_core"."tenants" USING "btree" ("type") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_user_context_user_current_tenant" ON "copilot_core"."user_tenant_contexts" USING "btree" ("user_id", "current_tenant_id") WHERE ("current_tenant_id" IS NOT NULL);



COMMENT ON INDEX "copilot_core"."idx_user_context_user_current_tenant" IS 'Optimizes lookups of user''s current active tenant. Critical for session validation performance.';



CREATE INDEX "idx_user_preferences_current_tenant" ON "copilot_core"."user_preferences" USING "btree" ("current_tenant_id") WHERE ("current_tenant_id" IS NOT NULL);



CREATE INDEX "idx_user_tenant_contexts_tenant" ON "copilot_core"."user_tenant_contexts" USING "btree" ("current_tenant_id");



CREATE INDEX "idx_workspace_invitations_email" ON "copilot_core"."workspace_invitations" USING "btree" ("email") WHERE ("accepted_at" IS NULL);



CREATE INDEX "idx_workspace_invitations_tenant" ON "copilot_core"."workspace_invitations" USING "btree" ("tenant_id");



CREATE INDEX "idx_workspace_invitations_token" ON "copilot_core"."workspace_invitations" USING "btree" ("token") WHERE ("accepted_at" IS NULL);



CREATE UNIQUE INDEX "unique_pending_invitation" ON "copilot_core"."workspace_invitations" USING "btree" ("tenant_id", "email") WHERE ("accepted_at" IS NULL);



CREATE OR REPLACE TRIGGER "update_cost_quotas_timestamp" BEFORE UPDATE ON "copilot_billing"."cost_quotas" FOR EACH ROW EXECUTE FUNCTION "copilot_billing"."update_cost_quotas_timestamp"();



CREATE OR REPLACE TRIGGER "membership_change_trigger" AFTER INSERT OR DELETE OR UPDATE ON "copilot_core"."tenant_memberships" FOR EACH ROW EXECUTE FUNCTION "copilot_core"."on_membership_change"();



CREATE OR REPLACE TRIGGER "tenants_quota_init_trigger" AFTER INSERT ON "copilot_core"."tenants" FOR EACH ROW EXECUTE FUNCTION "copilot_billing"."init_tenant_quotas"();



CREATE OR REPLACE TRIGGER "trg_mark_branch_point" AFTER INSERT ON "copilot_core"."conversation_paths" FOR EACH ROW EXECUTE FUNCTION "copilot_core"."mark_branch_point"();



CREATE OR REPLACE TRIGGER "trg_set_execution_context_expiry" BEFORE INSERT ON "copilot_core"."execution_contexts" FOR EACH ROW EXECUTE FUNCTION "copilot_core"."set_execution_context_expiry"();



CREATE OR REPLACE TRIGGER "trg_set_message_sequence" BEFORE INSERT ON "copilot_core"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "copilot_core"."set_message_sequence"();



CREATE OR REPLACE TRIGGER "trg_update_path_timestamp" BEFORE UPDATE ON "copilot_core"."conversation_paths" FOR EACH ROW EXECUTE FUNCTION "copilot_core"."update_path_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_platform_admin_permission_audit" AFTER INSERT OR UPDATE ON "copilot_core"."platform_admin_permissions" FOR EACH ROW EXECUTE FUNCTION "copilot_audit"."log_permission_config_change"();



CREATE OR REPLACE TRIGGER "trigger_platform_admin_permission_updated_at" BEFORE UPDATE ON "copilot_core"."platform_admin_permissions" FOR EACH ROW EXECUTE FUNCTION "copilot_core"."update_platform_admin_permission_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_platform_admin_updated_at" BEFORE UPDATE ON "copilot_core"."platform_admins" FOR EACH ROW EXECUTE FUNCTION "copilot_core"."update_platform_admin_timestamp"();



ALTER TABLE ONLY "copilot_analytics"."slow_query_log"
    ADD CONSTRAINT "slow_query_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "copilot_core"."tenants"("id");



ALTER TABLE ONLY "copilot_analytics"."slow_query_log"
    ADD CONSTRAINT "slow_query_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "copilot_audit"."session_sync_logs"
    ADD CONSTRAINT "session_sync_logs_expected_tenant_id_fkey" FOREIGN KEY ("expected_tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_audit"."session_sync_logs"
    ADD CONSTRAINT "session_sync_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_billing"."e2b_cost_records"
    ADD CONSTRAINT "e2b_cost_records_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "copilot_core"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_billing"."e2b_cost_records"
    ADD CONSTRAINT "e2b_cost_records_execution_context_id_fkey" FOREIGN KEY ("execution_context_id") REFERENCES "copilot_core"."execution_contexts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_billing"."e2b_cost_records"
    ADD CONSTRAINT "e2b_cost_records_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "copilot_core"."conversation_paths"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_core"."platform_admin_permissions"
    ADD CONSTRAINT "admin_permission_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "copilot_core"."platform_admin_permissions"
    ADD CONSTRAINT "admin_permission_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."platform_admins"
    ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."conversation_contexts"
    ADD CONSTRAINT "conversation_contexts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "copilot_core"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "copilot_core"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."conversation_paths"
    ADD CONSTRAINT "conversation_paths_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "copilot_core"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."conversation_paths"
    ADD CONSTRAINT "conversation_paths_merged_to_path_id_fkey" FOREIGN KEY ("merged_to_path_id") REFERENCES "copilot_core"."conversation_paths"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_core"."conversation_paths"
    ADD CONSTRAINT "conversation_paths_parent_path_id_fkey" FOREIGN KEY ("parent_path_id") REFERENCES "copilot_core"."conversation_paths"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_core"."execution_contexts"
    ADD CONSTRAINT "execution_contexts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "copilot_core"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."execution_contexts"
    ADD CONSTRAINT "execution_contexts_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "copilot_core"."conversation_paths"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."conversations"
    ADD CONSTRAINT "fk_active_path" FOREIGN KEY ("active_path_id") REFERENCES "copilot_core"."conversation_paths"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "copilot_core"."conversation_paths"
    ADD CONSTRAINT "fk_branch_point_message" FOREIGN KEY ("branch_point_message_id") REFERENCES "copilot_core"."conversation_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_core"."conversation_paths"
    ADD CONSTRAINT "fk_merge_summary_message" FOREIGN KEY ("merge_summary_message_id") REFERENCES "copilot_core"."conversation_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_core"."conversation_messages"
    ADD CONSTRAINT "fk_message_path" FOREIGN KEY ("path_id") REFERENCES "copilot_core"."conversation_paths"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."membership_change_events"
    ADD CONSTRAINT "membership_change_events_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "copilot_core"."membership_change_events"
    ADD CONSTRAINT "membership_change_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."membership_change_events"
    ADD CONSTRAINT "membership_change_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."tenant_llm_policies"
    ADD CONSTRAINT "tenant_llm_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "copilot_core"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."tenants"
    ADD CONSTRAINT "tenants_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "copilot_core"."tenants"
    ADD CONSTRAINT "tenants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "copilot_core"."user_preferences"
    ADD CONSTRAINT "user_preferences_current_tenant_id_fkey" FOREIGN KEY ("current_tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_core"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."user_tenant_contexts"
    ADD CONSTRAINT "user_tenant_contexts_current_tenant_id_fkey" FOREIGN KEY ("current_tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "copilot_core"."user_tenant_contexts"
    ADD CONSTRAINT "user_tenant_contexts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "copilot_core"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "copilot_core"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "copilot_core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE "copilot_audit"."compaction_operations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "copilot_audit"."permission_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permission_audit_log_compliance" ON "copilot_audit"."permission_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins"
  WHERE (("platform_admins"."id" = "auth"."uid"()) AND ("platform_admins"."role" = 'compliance_auditor'::"text")))));



CREATE POLICY "permission_audit_log_super_admin" ON "copilot_audit"."permission_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins"
  WHERE (("platform_admins"."id" = "auth"."uid"()) AND ("platform_admins"."role" = 'super_admin'::"text")))));



CREATE POLICY "tenant_isolation_insert" ON "copilot_audit"."compaction_operations" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "copilot_core"."tenant_memberships" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_select" ON "copilot_audit"."compaction_operations" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "copilot_core"."tenant_memberships" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"()))));



ALTER TABLE "copilot_billing"."cost_quotas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cost_quotas_service_role_all" ON "copilot_billing"."cost_quotas" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "cost_quotas_tenant_select" ON "copilot_billing"."cost_quotas" FOR SELECT TO "authenticated" USING ((("scope" = 'platform'::"text") OR (("scope" = 'tenant'::"text") AND ("scope_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid")) OR (("scope" = 'user'::"text") AND ("scope_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))));



COMMENT ON POLICY "cost_quotas_tenant_select" ON "copilot_billing"."cost_quotas" IS 'Allow users to view quotas for their platform, tenant (via JWT), or user scope.';



CREATE POLICY "cost_records_service_role_all" ON "copilot_billing"."llm_cost_records" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "cost_records_tenant_select" ON "copilot_billing"."llm_cost_records" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "copilot_billing"."e2b_cost_estimates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "e2b_cost_estimates_authenticated_read" ON "copilot_billing"."e2b_cost_estimates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "e2b_cost_estimates_service_role_all" ON "copilot_billing"."e2b_cost_estimates" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_billing"."e2b_cost_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "e2b_cost_records_service_role_all" ON "copilot_billing"."e2b_cost_records" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "e2b_cost_records_tenant_select" ON "copilot_billing"."e2b_cost_records" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



COMMENT ON POLICY "e2b_cost_records_tenant_select" ON "copilot_billing"."e2b_cost_records" IS 'Allow users to view E2B cost records for their tenant (via JWT extraction).';



ALTER TABLE "copilot_billing"."e2b_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "e2b_pricing_authenticated_read" ON "copilot_billing"."e2b_pricing" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "e2b_pricing_service_role_all" ON "copilot_billing"."e2b_pricing" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_billing"."llm_cost_estimates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_cost_estimates_authenticated_read" ON "copilot_billing"."llm_cost_estimates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "llm_cost_estimates_service_role_all" ON "copilot_billing"."llm_cost_estimates" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_billing"."llm_cost_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_cost_records_service_role_all" ON "copilot_billing"."llm_cost_records" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "llm_cost_records_tenant_select" ON "copilot_billing"."llm_cost_records" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."current_tenant_id"()));



ALTER TABLE "copilot_billing"."model_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "model_pricing_authenticated_read" ON "copilot_billing"."model_pricing" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "model_pricing_service_role_all" ON "copilot_billing"."model_pricing" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "admin_permission_configs_self_view" ON "copilot_core"."platform_admin_permissions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "admin_permission_configs_super_admin" ON "copilot_core"."platform_admin_permissions" USING ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins"
  WHERE (("platform_admins"."id" = "auth"."uid"()) AND ("platform_admins"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins"
  WHERE (("platform_admins"."id" = "auth"."uid"()) AND ("platform_admins"."role" = 'super_admin'::"text")))));



CREATE POLICY "admin_users_compliance_view" ON "copilot_core"."platform_admins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'compliance_auditor'::"text")))));



CREATE POLICY "admin_users_platform_engineer_view" ON "copilot_core"."platform_admins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'platform_engineer'::"text")))));



CREATE POLICY "admin_users_self_view" ON "copilot_core"."platform_admins" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "admin_users_super_admin" ON "copilot_core"."platform_admins" USING ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'super_admin'::"text")))));



CREATE POLICY "admin_users_tenant_view" ON "copilot_core"."platform_admins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "copilot_core"."platform_admins" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['account_manager'::"text", 'support_tier_1'::"text", 'support_tier_2'::"text", 'support_tier_3'::"text"])) AND (("au"."tenant_id" = "platform_admins"."tenant_id") OR ("platform_admins"."tenant_id" = ANY ("au"."assigned_tenant_ids")))))));



ALTER TABLE "copilot_core"."conversation_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_configs_delete_user" ON "copilot_core"."conversation_configs" FOR DELETE TO "authenticated" USING ((("config_level" = 'user'::"text") AND ("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "conversation_configs_insert_user" ON "copilot_core"."conversation_configs" FOR INSERT TO "authenticated" WITH CHECK ((("config_level" = 'user'::"text") AND ("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "conversation_configs_select" ON "copilot_core"."conversation_configs" FOR SELECT TO "authenticated" USING ((("config_level" = 'global'::"text") OR ("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid") OR (("config_level" = 'user'::"text") AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "conversation_configs_service_role_all" ON "copilot_core"."conversation_configs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "conversation_configs_update_user" ON "copilot_core"."conversation_configs" FOR UPDATE TO "authenticated" USING ((("config_level" = 'user'::"text") AND ("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid") AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("config_level" = 'user'::"text") AND ("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid") AND ("user_id" = "auth"."uid"())));



ALTER TABLE "copilot_core"."conversation_contexts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_contexts_service_role_full_access" ON "copilot_core"."conversation_contexts" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_core"."conversation_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_messages_service_role_full_access" ON "copilot_core"."conversation_messages" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_core"."conversation_paths" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_paths_service_role_full_access" ON "copilot_core"."conversation_paths" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_core"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_service_role_full_access" ON "copilot_core"."conversations" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_core"."execution_contexts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "execution_contexts_service_role_full_access" ON "copilot_core"."execution_contexts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "invitations_admin_insert" ON "copilot_core"."workspace_invitations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "copilot_core"."tenant_memberships"
  WHERE (("tenant_memberships"."tenant_id" = "workspace_invitations"."tenant_id") AND ("tenant_memberships"."user_id" = "auth"."uid"()) AND ("tenant_memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("tenant_memberships"."status" = 'active'::"text") AND ("tenant_memberships"."deleted_at" IS NULL)))));



CREATE POLICY "invitations_service_role" ON "copilot_core"."workspace_invitations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "invitations_view" ON "copilot_core"."workspace_invitations" FOR SELECT USING ((("tenant_id" IN ( SELECT "tenant_memberships"."tenant_id"
   FROM "copilot_core"."tenant_memberships"
  WHERE (("tenant_memberships"."user_id" = "auth"."uid"()) AND ("tenant_memberships"."status" = 'active'::"text") AND ("tenant_memberships"."deleted_at" IS NULL)))) OR ("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text")));



CREATE POLICY "memberships_admin_create" ON "copilot_core"."tenant_memberships" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "tenant_memberships_1"."tenant_id"
   FROM "copilot_core"."tenant_memberships" "tenant_memberships_1"
  WHERE (("tenant_memberships_1"."user_id" = "auth"."uid"()) AND ("tenant_memberships_1"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("tenant_memberships_1"."status" = 'active'::"text")))));



CREATE POLICY "memberships_admin_update" ON "copilot_core"."tenant_memberships" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_memberships_1"."tenant_id"
   FROM "copilot_core"."tenant_memberships" "tenant_memberships_1"
  WHERE (("tenant_memberships_1"."user_id" = "auth"."uid"()) AND ("tenant_memberships_1"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("tenant_memberships_1"."status" = 'active'::"text")))));



CREATE POLICY "memberships_own_read" ON "copilot_core"."tenant_memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "memberships_own_update" ON "copilot_core"."tenant_memberships" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "memberships_service_role_all" ON "copilot_core"."tenant_memberships" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "memberships_tenant_admin_read" ON "copilot_core"."tenant_memberships" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_memberships_1"."tenant_id"
   FROM "copilot_core"."tenant_memberships" "tenant_memberships_1"
  WHERE (("tenant_memberships_1"."user_id" = "auth"."uid"()) AND ("tenant_memberships_1"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("tenant_memberships_1"."status" = 'active'::"text")))));



CREATE POLICY "memberships_visibility" ON "copilot_core"."tenant_memberships" FOR SELECT USING ((("deleted_at" IS NULL) AND ("tenant_id" IN ( SELECT "tenant_memberships_1"."tenant_id"
   FROM "copilot_core"."tenant_memberships" "tenant_memberships_1"
  WHERE (("tenant_memberships_1"."user_id" = "auth"."uid"()) AND ("tenant_memberships_1"."status" = 'active'::"text") AND ("tenant_memberships_1"."deleted_at" IS NULL))))));



ALTER TABLE "copilot_core"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "copilot_core"."notifications" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_select_own" ON "copilot_core"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_service_role" ON "copilot_core"."notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "notifications_update_own" ON "copilot_core"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "copilot_core"."platform_admin_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "copilot_core"."platform_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "preferences_own_all" ON "copilot_core"."user_preferences" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "preferences_service_role_all" ON "copilot_core"."user_preferences" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "tenant_access" ON "copilot_core"."tenants" FOR SELECT USING ((("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "copilot_core"."tenant_memberships"
  WHERE (("tenant_memberships"."tenant_id" = "tenants"."id") AND ("tenant_memberships"."user_id" = "auth"."uid"()) AND ("tenant_memberships"."status" = 'active'::"text") AND ("tenant_memberships"."deleted_at" IS NULL))))));



ALTER TABLE "copilot_core"."tenant_llm_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_llm_policies_select" ON "copilot_core"."tenant_llm_policies" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_llm_policies_service_role_all" ON "copilot_core"."tenant_llm_policies" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_core"."tenant_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_service_role" ON "copilot_core"."tenants" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_core"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_create" ON "copilot_core"."tenants" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "tenants_member_read" ON "copilot_core"."tenants" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "tenant_memberships"."tenant_id"
   FROM "copilot_core"."tenant_memberships"
  WHERE (("tenant_memberships"."user_id" = "auth"."uid"()) AND ("tenant_memberships"."status" = 'active'::"text")))));



CREATE POLICY "tenants_owner_update" ON "copilot_core"."tenants" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "tenants_service_role_all" ON "copilot_core"."tenants" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "copilot_core"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "copilot_core"."workspace_invitations" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "copilot_analytics" TO "service_role";
GRANT USAGE ON SCHEMA "copilot_analytics" TO "authenticated";



GRANT USAGE ON SCHEMA "copilot_archive" TO "service_role";



GRANT USAGE ON SCHEMA "copilot_audit" TO "service_role";



GRANT USAGE ON SCHEMA "copilot_billing" TO "service_role";
GRANT USAGE ON SCHEMA "copilot_billing" TO "authenticated";



GRANT USAGE ON SCHEMA "copilot_core" TO "service_role";
GRANT USAGE ON SCHEMA "copilot_core" TO "authenticated";



GRANT USAGE ON SCHEMA "copilot_events" TO "service_role";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "copilot_audit"."get_compaction_metrics"("p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "copilot_audit"."get_compaction_strategy_breakdown"("p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "copilot_audit"."get_conversations_needing_compaction"("p_message_count_gt" integer, "p_last_activity_after" timestamp with time zone, "p_last_compaction_before" timestamp with time zone, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "copilot_audit"."get_recent_compaction_operations"("p_limit" integer, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "copilot_audit"."record_compaction_operation"("p_conversation_id" "uuid", "p_path_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_strategy" "text", "p_triggered_by" "text", "p_tokens_before" integer, "p_tokens_after" integer, "p_messages_before" integer, "p_messages_after" integer, "p_messages_summarized" integer, "p_pinned_preserved" integer, "p_duration_ms" integer, "p_used_llm" boolean, "p_cost_usd" numeric, "p_success" boolean, "p_error" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "copilot_billing"."calculate_e2b_cost"("p_tier" "text", "p_region" "text", "p_execution_time_seconds" numeric, "p_cpu_core_seconds" numeric, "p_memory_gb_seconds" numeric, "p_disk_io_gb" numeric, "p_pricing_date" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "copilot_billing"."calculate_e2b_cost"("p_tier" "text", "p_region" "text", "p_execution_time_seconds" numeric, "p_cpu_core_seconds" numeric, "p_memory_gb_seconds" numeric, "p_disk_io_gb" numeric, "p_pricing_date" timestamp with time zone) TO "authenticated";



GRANT ALL ON FUNCTION "copilot_billing"."calculate_llm_cost"("p_provider" "text", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer) TO "service_role";
GRANT ALL ON FUNCTION "copilot_billing"."calculate_llm_cost"("p_provider" "text", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer) TO "authenticated";



GRANT ALL ON FUNCTION "copilot_billing"."check_and_record_quota_atomic"("p_scope" "text", "p_scope_id" "uuid", "p_cost_usd" numeric) TO "service_role";



GRANT ALL ON FUNCTION "copilot_billing"."check_e2b_quota"("p_scope" "text", "p_scope_id" "uuid", "p_estimated_cost" numeric) TO "service_role";



GRANT ALL ON FUNCTION "copilot_billing"."get_current_model_pricing"("p_provider" "text", "p_model" "text") TO "service_role";
GRANT ALL ON FUNCTION "copilot_billing"."get_current_model_pricing"("p_provider" "text", "p_model" "text") TO "authenticated";



GRANT ALL ON FUNCTION "copilot_billing"."increment_e2b_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "copilot_billing"."increment_quota_spend"("p_scope" "text", "p_scope_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "copilot_billing"."init_tenant_quotas"() TO "service_role";



GRANT ALL ON FUNCTION "copilot_billing"."update_cost_quota_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "copilot_billing"."update_cost_quotas_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "copilot_core"."cleanup_old_terminated_contexts"("p_days_old" integer, "p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."cleanup_old_terminated_contexts"("p_days_old" integer, "p_limit" integer) TO "authenticated";



GRANT ALL ON FUNCTION "copilot_core"."create_notification"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_priority" "text", "p_action_url" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "copilot_core"."get_expired_execution_contexts"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."get_expired_execution_contexts"("p_limit" integer) TO "authenticated";



GRANT ALL ON FUNCTION "copilot_core"."get_path_ancestors"("p_path_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "copilot_core"."get_root_path_id"("p_path_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "copilot_core"."mark_branch_point"() TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."mark_branch_point"() TO "authenticated";



GRANT ALL ON FUNCTION "copilot_core"."next_sequence_in_path"("p_path_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "copilot_core"."on_membership_change"() TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."on_membership_change"() TO "authenticated";



GRANT ALL ON FUNCTION "copilot_core"."resolve_path_messages"("p_path_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "copilot_core"."set_execution_context_expiry"() TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."set_execution_context_expiry"() TO "authenticated";



GRANT ALL ON FUNCTION "copilot_core"."set_message_sequence"() TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."set_message_sequence"() TO "authenticated";



GRANT ALL ON FUNCTION "copilot_core"."touch_execution_context"("p_context_id" "uuid", "p_ttl_minutes" integer) TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."touch_execution_context"("p_context_id" "uuid", "p_ttl_minutes" integer) TO "authenticated";



GRANT ALL ON FUNCTION "copilot_core"."update_path_timestamp"() TO "service_role";
GRANT ALL ON FUNCTION "copilot_core"."update_path_timestamp"() TO "authenticated";































































































































































GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("p_token" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("p_token" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("p_token" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_notification"("p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_notification"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_notification"("p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_workspace_invitation"("p_invitation_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_workspace_invitation"("p_invitation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_workspace_invitation"("p_invitation_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_session_sync_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_session_sync_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_session_sync_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_slow_query_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_slow_query_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_slow_query_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_personal_tenant"("p_user_id" "uuid", "p_user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_personal_tenant"("p_user_id" "uuid", "p_user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_personal_tenant"("p_user_id" "uuid", "p_user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_notification"("p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_notification"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_notification"("p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dismiss_notification"("p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dismiss_notification"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dismiss_notification"("p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_tenant_id"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_tenant_id"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_tenant_id"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_pending_invitations"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_pending_invitations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_pending_invitations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pending_membership_events"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_membership_events"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_membership_events"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_query_performance_stats"("p_hours_back" integer, "p_min_execution_time_ms" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_query_performance_stats"("p_hours_back" integer, "p_min_execution_time_ms" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_query_performance_stats"("p_hours_back" integer, "p_min_execution_time_ms" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_sync_stats"("p_hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_sync_stats"("p_hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_sync_stats"("p_hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_notification_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_notifications"("p_status" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_notifications"("p_status" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_notifications"("p_status" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_sessions"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_sessions"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_sessions"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenants"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenants"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenants"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_user_to_workspace"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text", "p_invited_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_workspace"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text", "p_invited_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_workspace"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text", "p_invited_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_session_mismatch"("p_user_id" "uuid", "p_expected_tenant_id" "uuid", "p_actual_tenant_id" "uuid", "p_request_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_session_mismatch"("p_user_id" "uuid", "p_expected_tenant_id" "uuid", "p_actual_tenant_id" "uuid", "p_request_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_session_mismatch"("p_user_id" "uuid", "p_expected_tenant_id" "uuid", "p_actual_tenant_id" "uuid", "p_request_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_membership_events_processed"("p_user_id" "uuid", "p_event_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_membership_events_processed"("p_user_id" "uuid", "p_event_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_membership_events_processed"("p_user_id" "uuid", "p_event_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_workspace"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_all_user_sessions_except"("p_user_id" "uuid", "p_exclude_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_all_user_sessions_except"("p_user_id" "uuid", "p_exclude_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_all_user_sessions_except"("p_user_id" "uuid", "p_exclude_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_user_session"("p_user_id" "uuid", "p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_user_session"("p_user_id" "uuid", "p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_user_session"("p_user_id" "uuid", "p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_tenant_access"("p_user_id" "uuid", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_tenant_access"("p_user_id" "uuid", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_tenant_access"("p_user_id" "uuid", "p_tenant_id" "uuid") TO "service_role";












GRANT SELECT ON TABLE "copilot_billing"."e2b_cost_records" TO "authenticated";
GRANT ALL ON TABLE "copilot_billing"."e2b_cost_records" TO "service_role";



GRANT SELECT ON TABLE "copilot_billing"."llm_cost_records" TO "authenticated";
GRANT ALL ON TABLE "copilot_billing"."llm_cost_records" TO "service_role";



GRANT SELECT ON TABLE "copilot_analytics"."all_costs" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."all_costs" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."cost_summary_by_tenant" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_summary_by_tenant" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_tenant" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_tenant" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."combined_cost_summary_by_tenant" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."combined_cost_summary_by_tenant" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."tenants" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "copilot_core"."tenants" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_workspace" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_workspace" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."llm_cost_summary_by_workspace" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."llm_cost_summary_by_workspace" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."combined_cost_summary_by_workspace" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."combined_cost_summary_by_workspace" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."cost_by_conversation" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_by_conversation" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."cost_by_tenant" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_by_tenant" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."cost_by_user" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_by_user" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."cost_by_workspace" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_by_workspace" TO "authenticated";



GRANT SELECT ON TABLE "copilot_billing"."e2b_cost_estimates" TO "authenticated";
GRANT ALL ON TABLE "copilot_billing"."e2b_cost_estimates" TO "service_role";



GRANT SELECT ON TABLE "copilot_billing"."llm_cost_estimates" TO "authenticated";
GRANT ALL ON TABLE "copilot_billing"."llm_cost_estimates" TO "service_role";



GRANT SELECT ON TABLE "copilot_analytics"."cost_estimates" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_estimates" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."cost_summary_by_model" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_summary_by_model" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."cost_summary_by_task" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."cost_summary_by_task" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_conversation" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_conversation" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_tier" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."e2b_cost_summary_by_tier" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."e2b_costs" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."e2b_costs" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."e2b_costs_daily" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."e2b_costs_daily" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."e2b_sandbox_usage" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."e2b_sandbox_usage" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."llm_costs" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."llm_costs" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."llm_costs_daily" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."llm_costs_daily" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."llm_model_usage" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."llm_model_usage" TO "authenticated";



GRANT SELECT ON TABLE "copilot_billing"."cost_quotas" TO "authenticated";
GRANT ALL ON TABLE "copilot_billing"."cost_quotas" TO "service_role";



GRANT SELECT ON TABLE "copilot_analytics"."quota_status" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."quota_status" TO "authenticated";



GRANT ALL ON TABLE "copilot_analytics"."slow_query_log" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."slow_query_log" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."tenant_memberships" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "copilot_core"."tenant_memberships" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."rls_performance_summary" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."rls_performance_summary" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."tenant_total_costs" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."tenant_total_costs" TO "authenticated";



GRANT SELECT ON TABLE "copilot_analytics"."top_spending_tenants" TO "service_role";
GRANT SELECT ON TABLE "copilot_analytics"."top_spending_tenants" TO "authenticated";



GRANT ALL ON TABLE "copilot_audit"."compaction_operations" TO "service_role";
GRANT SELECT ON TABLE "copilot_audit"."compaction_operations" TO "authenticated";



GRANT ALL ON TABLE "copilot_audit"."permission_audit_log" TO "service_role";
GRANT SELECT ON TABLE "copilot_audit"."permission_audit_log" TO "authenticated";



GRANT ALL ON TABLE "copilot_audit"."session_sync_logs" TO "service_role";



GRANT SELECT ON TABLE "copilot_billing"."e2b_pricing" TO "authenticated";
GRANT ALL ON TABLE "copilot_billing"."e2b_pricing" TO "service_role";



GRANT SELECT ON TABLE "copilot_billing"."model_pricing" TO "authenticated";
GRANT ALL ON TABLE "copilot_billing"."model_pricing" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."conversation_configs" TO "authenticated";
GRANT ALL ON TABLE "copilot_core"."conversation_configs" TO "service_role";



GRANT ALL ON TABLE "copilot_core"."conversation_contexts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."conversation_contexts" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."conversation_messages" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."conversation_messages" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."conversation_paths" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."conversation_paths" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."conversations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."conversations" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."execution_contexts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."execution_contexts" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."membership_change_events" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."membership_change_events" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."notifications" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."notifications" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."personas" TO "service_role";



GRANT ALL ON TABLE "copilot_core"."platform_admin_permissions" TO "service_role";



GRANT ALL ON TABLE "copilot_core"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "copilot_core"."quick_prompts" TO "service_role";



GRANT ALL ON TABLE "copilot_core"."tenant_llm_policies" TO "service_role";
GRANT SELECT ON TABLE "copilot_core"."tenant_llm_policies" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."user_preferences" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."user_preferences" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."user_tenant_contexts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."user_tenant_contexts" TO "authenticated";



GRANT ALL ON TABLE "copilot_core"."workspace_invitations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "copilot_core"."workspace_invitations" TO "authenticated";









GRANT SELECT ON TABLE "public"."conversation_contexts_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."conversation_contexts_view" TO "service_role";



GRANT SELECT ON TABLE "public"."conversation_messages_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."conversation_messages_view" TO "service_role";



GRANT SELECT ON TABLE "public"."conversation_paths_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."conversation_paths_view" TO "service_role";



GRANT SELECT ON TABLE "public"."conversations_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."conversations_view" TO "service_role";



GRANT SELECT ON TABLE "public"."execution_contexts_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."execution_contexts_view" TO "service_role";



GRANT SELECT ON TABLE "public"."personas_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."personas_view" TO "service_role";



GRANT SELECT ON TABLE "public"."quick_prompts_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."quick_prompts_view" TO "service_role";



GRANT ALL ON TABLE "public"."schema_inventory" TO "anon";
GRANT ALL ON TABLE "public"."schema_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."schema_inventory" TO "service_role";



GRANT SELECT ON TABLE "public"."user_tenants_view" TO "authenticated";
GRANT SELECT ON TABLE "public"."user_tenants_view" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "copilot_archive" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "copilot_events" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

