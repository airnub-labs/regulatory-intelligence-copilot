-- ========================================
-- Tenant Assignment Audit Script
-- ========================================
-- Purpose: Identify users without proper tenant_id assignment
-- Run this before implementing the security fix
-- Date: 2026-01-05

-- ========================================
-- 1. Find Users Without Tenant ID
-- ========================================

SELECT
  id,
  email,
  created_at,
  last_sign_in_at,
  raw_user_meta_data->>'tenant_id' as user_metadata_tenant,
  raw_app_meta_data->>'tenant_id' as app_metadata_tenant,
  CASE
    WHEN raw_user_meta_data->>'tenant_id' IS NOT NULL THEN 'user_metadata'
    WHEN raw_app_meta_data->>'tenant_id' IS NOT NULL THEN 'app_metadata'
    ELSE 'MISSING'
  END as tenant_source,
  CASE
    WHEN deleted_at IS NOT NULL THEN 'deleted'
    WHEN banned_until IS NOT NULL AND banned_until > NOW() THEN 'banned'
    WHEN last_sign_in_at IS NULL THEN 'never_logged_in'
    WHEN last_sign_in_at < NOW() - INTERVAL '30 days' THEN 'inactive_30d'
    WHEN last_sign_in_at < NOW() - INTERVAL '7 days' THEN 'inactive_7d'
    ELSE 'active'
  END as user_status
FROM auth.users
WHERE (raw_user_meta_data->>'tenant_id' IS NULL
       AND raw_app_meta_data->>'tenant_id' IS NULL)
  AND deleted_at IS NULL
ORDER BY
  CASE
    WHEN last_sign_in_at > NOW() - INTERVAL '7 days' THEN 1
    WHEN last_sign_in_at IS NOT NULL THEN 2
    ELSE 3
  END,
  created_at DESC;

-- ========================================
-- 2. Activity Summary for Users Without Tenant ID
-- ========================================

WITH users_without_tenant AS (
  SELECT id, email
  FROM auth.users
  WHERE (raw_user_meta_data->>'tenant_id' IS NULL
         AND raw_app_meta_data->>'tenant_id' IS NULL)
    AND deleted_at IS NULL
)
SELECT
  u.id as user_id,
  u.email,
  COUNT(DISTINCT c.id) as conversation_count,
  COUNT(DISTINCT m.id) as message_count,
  MIN(c.created_at) as first_activity,
  MAX(c.updated_at) as last_activity
FROM users_without_tenant u
LEFT JOIN copilot_internal.conversations c
  ON c.user_id = u.id
LEFT JOIN copilot_internal.conversation_messages m
  ON m.user_id = u.id
GROUP BY u.id, u.email
ORDER BY conversation_count DESC, message_count DESC;

-- ========================================
-- 3. Check Demo Tenant Data Access
-- ========================================

-- Find all conversations in demo tenant by users without proper tenant assignment
WITH demo_tenant AS (
  SELECT 'b385a126-a82d-459a-a502-59c1bebb9eeb'::uuid as id
),
users_without_tenant AS (
  SELECT id
  FROM auth.users
  WHERE (raw_user_meta_data->>'tenant_id' IS NULL
         AND raw_app_meta_data->>'tenant_id' IS NULL)
    AND deleted_at IS NULL
)
SELECT
  c.id as conversation_id,
  c.user_id,
  u.email,
  c.title,
  c.created_at,
  c.updated_at,
  c.last_message_at,
  (SELECT COUNT(*) FROM copilot_internal.conversation_messages WHERE conversation_id = c.id) as message_count
FROM copilot_internal.conversations c
JOIN users_without_tenant uwt ON c.user_id = uwt.id
LEFT JOIN auth.users u ON u.id = uwt.id
CROSS JOIN demo_tenant dt
WHERE c.tenant_id = dt.id
ORDER BY c.created_at DESC;

-- ========================================
-- 4. Cost Impact Analysis
-- ========================================

-- Check LLM costs attributed to users without tenant assignment
WITH users_without_tenant AS (
  SELECT id
  FROM auth.users
  WHERE (raw_user_meta_data->>'tenant_id' IS NULL
         AND raw_app_meta_data->>'tenant_id' IS NULL)
    AND deleted_at IS NULL
)
SELECT
  uwt.id as user_id,
  u.email,
  COUNT(*) as cost_records,
  SUM(cost.input_cost_usd + cost.output_cost_usd + COALESCE(cost.cache_read_cost_usd, 0)) as total_llm_cost_usd,
  MIN(cost.created_at) as first_usage,
  MAX(cost.created_at) as last_usage
FROM users_without_tenant uwt
LEFT JOIN auth.users u ON u.id = uwt.id
LEFT JOIN copilot_internal.llm_cost_records cost
  ON cost.user_id = uwt.id
GROUP BY uwt.id, u.email
HAVING COUNT(*) > 0
ORDER BY total_llm_cost_usd DESC;

-- ========================================
-- 5. E2B Execution Context Usage
-- ========================================

-- Check E2B usage by users without tenant assignment
WITH users_without_tenant AS (
  SELECT id
  FROM auth.users
  WHERE (raw_user_meta_data->>'tenant_id' IS NULL
         AND raw_app_meta_data->>'tenant_id' IS NULL)
    AND deleted_at IS NULL
)
SELECT
  uwt.id as user_id,
  u.email,
  COUNT(DISTINCT ec.id) as execution_contexts,
  COUNT(DISTINCT e2b.id) as e2b_cost_records,
  SUM(e2b.compute_cost_usd) as total_e2b_cost_usd
FROM users_without_tenant uwt
LEFT JOIN auth.users u ON u.id = uwt.id
LEFT JOIN copilot_internal.execution_contexts ec
  ON ec.user_id = uwt.id
LEFT JOIN copilot_internal.e2b_cost_records e2b
  ON e2b.user_id = uwt.id
GROUP BY uwt.id, u.email
HAVING COUNT(DISTINCT ec.id) > 0 OR COUNT(DISTINCT e2b.id) > 0
ORDER BY total_e2b_cost_usd DESC;

-- ========================================
-- 6. Summary Statistics
-- ========================================

SELECT
  'Total users without tenant_id' as metric,
  COUNT(*)::text as value
FROM auth.users
WHERE (raw_user_meta_data->>'tenant_id' IS NULL
       AND raw_app_meta_data->>'tenant_id' IS NULL)
  AND deleted_at IS NULL

UNION ALL

SELECT
  'Active users (logged in last 7 days)' as metric,
  COUNT(*)::text as value
FROM auth.users
WHERE (raw_user_meta_data->>'tenant_id' IS NULL
       AND raw_app_meta_data->>'tenant_id' IS NULL)
  AND deleted_at IS NULL
  AND last_sign_in_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Users with conversations' as metric,
  COUNT(DISTINCT user_id)::text as value
FROM copilot_internal.conversations c
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE (raw_user_meta_data->>'tenant_id' IS NULL
         AND raw_app_meta_data->>'tenant_id' IS NULL)
    AND deleted_at IS NULL
)

UNION ALL

SELECT
  'Total conversations by unassigned users' as metric,
  COUNT(*)::text as value
FROM copilot_internal.conversations c
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE (raw_user_meta_data->>'tenant_id' IS NULL
         AND raw_app_meta_data->>'tenant_id' IS NULL)
    AND deleted_at IS NULL
)

UNION ALL

SELECT
  'Conversations in demo tenant' as metric,
  COUNT(*)::text as value
FROM copilot_internal.conversations c
WHERE tenant_id = 'b385a126-a82d-459a-a502-59c1bebb9eeb'::uuid
  AND user_id IN (
    SELECT id FROM auth.users
    WHERE (raw_user_meta_data->>'tenant_id' IS NULL
           AND raw_app_meta_data->>'tenant_id' IS NULL)
      AND deleted_at IS NULL
  );

-- ========================================
-- 7. Recommended Actions
-- ========================================

-- This query generates SQL to assign proper tenant IDs
-- Review and modify before executing!

SELECT
  format(
    E'-- User: %s\nUPDATE auth.users\nSET raw_user_meta_data = jsonb_set(\n  COALESCE(raw_user_meta_data, \'{}\'::jsonb),\n  \'{tenant_id}\',\n  \'"%s"\'\n)\nWHERE id = \'%s\';\n',
    email,
    '<REPLACE_WITH_ACTUAL_TENANT_ID>',
    id
  ) as recommended_update_sql
FROM auth.users
WHERE (raw_user_meta_data->>'tenant_id' IS NULL
       AND raw_app_meta_data->>'tenant_id' IS NULL)
  AND deleted_at IS NULL
ORDER BY
  CASE
    WHEN last_sign_in_at > NOW() - INTERVAL '7 days' THEN 1
    WHEN last_sign_in_at IS NOT NULL THEN 2
    ELSE 3
  END,
  created_at DESC;

-- ========================================
-- End of Audit Script
-- ========================================

-- Next Steps:
-- 1. Review output of all queries above
-- 2. Determine proper tenant assignment for each user
-- 3. Use recommended SQL (query #7) to assign tenant IDs
-- 4. Re-run audit to verify all users have tenant_id
-- 5. Proceed with code changes to remove fallback logic
